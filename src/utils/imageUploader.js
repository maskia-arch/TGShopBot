/**
 * imageUploader.js – v0.5.64
 * 
 * Finales, produktionsreifes Media-System für Telegram.
 * 
 * Architektur-Prinzipien:
 * ─────────────────────────────────────────────────────
 * 1. file_id-first: Telegram file_ids werden direkt gespeichert und wiederverwendet.
 *    Das ist der offizielle, schnellste und zuverlässigste Weg laut Telegram Bot API.
 *    file_ids sind bot-spezifisch und bleiben dauerhaft gültig.
 * 
 * 2. Typ-Präfix-System: DB speichert "photo:FILE_ID", "animation:FILE_ID", "video:FILE_ID".
 *    Ermöglicht die korrekte Sende-Methode (sendPhoto vs sendAnimation vs sendVideo).
 * 
 * 3. Robuste Fehlerbehandlung mit Retry + automatischem Parse-Mode-Fallback.
 *    Markdown-Fehler werden abgefangen und automatisch auf HTML umgestellt.
 * 
 * 4. editMessageMedia-Support: Medien-Nachrichten werden in-place aktualisiert,
 *    statt delete+resend (kein Flackern, kein Race-Condition).
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;

// ─── HILFSFUNKTIONEN ─────────────────────────────────────────────────────

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Konvertiert Markdown-Text in einfaches HTML für Telegram.
 * Wird als Fallback verwendet wenn parse_mode: 'Markdown' fehlschlägt.
 */
const markdownToHtml = (text) => {
    if (!text) return '';
    return text
        .replace(/\*([^*]+)\*/g, '<b>$1</b>')     // *bold* → <b>bold</b>
        .replace(/_([^_]+)_/g, '<i>$1</i>')        // _italic_ → <i>italic</i>
        .replace(/`([^`]+)`/g, '<code>$1</code>'); // `code` → <code>code</code>
};

// ─── MEDIA-EXTRAKTION ────────────────────────────────────────────────────

/**
 * Extrahiert Media-Informationen aus einer eingehenden Telegram-Nachricht.
 * Gibt immer die höchste verfügbare Auflösung zurück (letztes Element bei Fotos).
 * 
 * @param {Object} message - Telegram Message-Objekt
 * @returns {{ type: string, fileId: string, fileUniqueId: string, prefixedId: string } | null}
 */
const extractMediaFromMessage = (message) => {
    if (!message) return null;

    // Fotos: Array mit verschiedenen Auflösungen – letztes = höchste
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
        const best = message.photo[message.photo.length - 1];
        if (best && best.file_id) {
            return {
                type: 'photo',
                fileId: best.file_id,
                fileUniqueId: best.file_unique_id || '',
                prefixedId: `photo:${best.file_id}`
            };
        }
    }

    // GIF / Animation
    if (message.animation && message.animation.file_id) {
        return {
            type: 'animation',
            fileId: message.animation.file_id,
            fileUniqueId: message.animation.file_unique_id || '',
            prefixedId: `animation:${message.animation.file_id}`
        };
    }

    // Video
    if (message.video && message.video.file_id) {
        return {
            type: 'video',
            fileId: message.video.file_id,
            fileUniqueId: message.video.file_unique_id || '',
            prefixedId: `video:${message.video.file_id}`
        };
    }

    // Dokument (als Datei gesendete Medien)
    if (message.document && message.document.file_id) {
        const mime = (message.document.mime_type || '').toLowerCase();
        if (mime === 'image/gif') {
            return {
                type: 'animation',
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id || '',
                prefixedId: `animation:${message.document.file_id}`
            };
        }
        if (mime.startsWith('image/')) {
            return {
                type: 'photo',
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id || '',
                prefixedId: `photo:${message.document.file_id}`
            };
        }
        if (mime.startsWith('video/')) {
            return {
                type: 'video',
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id || '',
                prefixedId: `video:${message.document.file_id}`
            };
        }
    }

    return null;
};

// ─── FILE-ID PARSING ─────────────────────────────────────────────────────

/**
 * Parst eine gespeicherte image_url und gibt { type, fileId } zurück.
 * Unterstützt das Präfix-Format und Legacy-Werte (ohne Präfix).
 * 
 * @param {string|null} imageUrl - Gespeicherte image_url aus der DB
 * @returns {{ type: string, fileId: string }}
 */
const parseStoredMedia = (imageUrl) => {
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
        return { type: null, fileId: null };
    }

    const trimmed = imageUrl.trim();

    if (trimmed.startsWith('photo:')) return { type: 'photo', fileId: trimmed.slice(6) };
    if (trimmed.startsWith('animation:')) return { type: 'animation', fileId: trimmed.slice(10) };
    if (trimmed.startsWith('video:')) return { type: 'video', fileId: trimmed.slice(6) };

    // Legacy: kein Präfix → als Foto behandeln (häufigster Fall)
    return { type: 'photo', fileId: trimmed };
};

// ─── VALIDIERUNG ─────────────────────────────────────────────────────────

/**
 * Validiert eine file_id über die Telegram Bot API (getFile).
 * Verwendet Retry-Logik für Netzwerkfehler, bricht bei definitiv ungültigen IDs sofort ab.
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {string} fileId - Telegram file_id
 * @returns {Promise<boolean>}
 */
const validateFileId = async (ctx, fileId) => {
    if (!fileId || typeof fileId !== 'string') return false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const file = await ctx.telegram.getFile(fileId);
            return !!(file && file.file_id);
        } catch (error) {
            const errMsg = (error.message || '').toLowerCase();

            // Definitiv ungültige file_id → sofort abbrechen
            if (errMsg.includes('wrong file_id') || 
                errMsg.includes('invalid file_id') || 
                errMsg.includes('wrong remote file') ||
                errMsg.includes('file is too big') ||
                errMsg.includes('bad request')) {
                console.error(`[ImageUploader] Ungültige file_id: ${errMsg}`);
                return false;
            }

            // Netzwerkfehler / Rate Limit → Retry
            if (attempt < MAX_RETRIES) {
                const waitMs = errMsg.includes('too many requests') 
                    ? (error.parameters?.retry_after || 3) * 1000 
                    : RETRY_DELAY_MS * attempt;
                console.warn(`[ImageUploader] validateFileId Versuch ${attempt}/${MAX_RETRIES} fehlgeschlagen, retry in ${waitMs}ms`);
                await delay(waitMs);
            } else {
                console.error(`[ImageUploader] validateFileId: Alle Versuche fehlgeschlagen: ${errMsg}`);
                return false;
            }
        }
    }
    return false;
};

// ─── MEDIA SENDEN ────────────────────────────────────────────────────────

/**
 * Sendet ein Medium (Foto/GIF/Video) mit Retry-Logik und automatischem Parse-Mode-Fallback.
 * 
 * Strategie:
 * 1. Versende mit dem erkannten Typ und Markdown
 * 2. Bei Markdown-Fehler → Retry mit HTML
 * 3. Bei file_id-Fehler → sofort abbrechen (keine Fallback-Typen)
 * 4. Bei Netzwerkfehler → Retry mit Backoff
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {string} type - 'photo' | 'animation' | 'video'
 * @param {string} fileId - Telegram file_id
 * @param {Object} options - Extra-Optionen (caption, parse_mode, reply_markup)
 * @returns {Promise<Object>} - Gesendete Nachricht
 */
const sendMediaWithRetry = async (ctx, type, fileId, options = {}) => {
    const methodMap = {
        'photo': 'sendPhoto',
        'animation': 'sendAnimation',
        'video': 'sendVideo'
    };

    const method = methodMap[type] || 'sendPhoto';
    const chatId = ctx.chat.id;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await ctx.telegram[method](chatId, fileId, options);
            return result;
        } catch (error) {
            const errMsg = (error.message || '').toLowerCase();

            // Definitiv ungültige file_id → kein Retry, kein Fallback
            if (errMsg.includes('wrong file_id') || 
                errMsg.includes('invalid file_id') ||
                errMsg.includes('wrong remote file') ||
                errMsg.includes('wrong type of the web page')) {
                throw new Error(`INVALID_FILE_ID: ${error.message}`);
            }

            // Markdown-Parse-Fehler → sofort mit HTML erneut versuchen
            if (errMsg.includes("can't parse") || 
                errMsg.includes('parse entities') ||
                errMsg.includes('unsupported start tag')) {
                console.warn(`[ImageUploader] Markdown-Fehler, wechsle zu HTML`);
                try {
                    const htmlOptions = {
                        ...options,
                        parse_mode: 'HTML',
                        caption: markdownToHtml(options.caption || '')
                    };
                    return await ctx.telegram[method](chatId, fileId, htmlOptions);
                } catch (htmlError) {
                    // HTML auch fehlgeschlagen → ohne Formatierung
                    console.warn(`[ImageUploader] HTML-Fallback auch fehlgeschlagen, sende ohne Formatierung`);
                    const plainOptions = { ...options };
                    delete plainOptions.parse_mode;
                    return await ctx.telegram[method](chatId, fileId, plainOptions);
                }
            }

            // Rate Limit → warte und retry
            if (errMsg.includes('too many requests') || error.code === 429) {
                const retryAfter = error.parameters?.retry_after || 3;
                console.warn(`[ImageUploader] Rate Limit, warte ${retryAfter}s...`);
                await delay(retryAfter * 1000);
                continue;
            }

            // Anderer Fehler → Retry mit Backoff
            if (attempt < MAX_RETRIES) {
                console.warn(`[ImageUploader] ${method} Versuch ${attempt}/${MAX_RETRIES} fehlgeschlagen: ${errMsg}`);
                await delay(RETRY_DELAY_MS * attempt);
            } else {
                throw error;
            }
        }
    }
};

// ─── EDIT MESSAGE MEDIA ──────────────────────────────────────────────────

/**
 * Aktualisiert eine bestehende Media-Nachricht in-place via editMessageMedia.
 * Das ist die bevorzugte Methode für Übergänge zwischen Media-Nachrichten
 * (z.B. Produkt A mit Bild → Produkt B mit Bild), da es flicker-frei ist.
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {string} type - 'photo' | 'animation' | 'video'
 * @param {string} fileId - Telegram file_id
 * @param {string} caption - Caption-Text
 * @param {Object} replyMarkup - Inline-Keyboard
 * @returns {Promise<Object|null>} - Aktualisierte Nachricht oder null bei Fehler
 */
const editMediaMessage = async (ctx, type, fileId, caption, replyMarkup) => {
    try {
        const mediaTypeMap = {
            'photo': 'photo',
            'animation': 'animation',
            'video': 'video'
        };

        const media = {
            type: mediaTypeMap[type] || 'photo',
            media: fileId,
            caption: caption || '',
            parse_mode: 'Markdown'
        };

        const extra = {};
        if (replyMarkup) {
            extra.reply_markup = replyMarkup;
        }

        return await ctx.editMessageMedia(media, extra);
    } catch (error) {
        const errMsg = (error.message || '').toLowerCase();

        // Markdown-Fehler → Retry mit HTML
        if (errMsg.includes("can't parse") || errMsg.includes('parse entities')) {
            try {
                const media = {
                    type: type === 'animation' ? 'animation' : type === 'video' ? 'video' : 'photo',
                    media: fileId,
                    caption: markdownToHtml(caption || ''),
                    parse_mode: 'HTML'
                };
                const extra = {};
                if (replyMarkup) extra.reply_markup = replyMarkup;
                return await ctx.editMessageMedia(media, extra);
            } catch (htmlError) {
                // Auch HTML fehlgeschlagen
                console.warn(`[ImageUploader] editMediaMessage HTML-Fallback fehlgeschlagen`);
            }
        }

        // Nicht editierbar (z.B. Text-Nachricht) → null zurück
        return null;
    }
};

// ─── EXPORTS ─────────────────────────────────────────────────────────────

module.exports = { 
    extractMediaFromMessage, 
    parseStoredMedia,
    validateFileId, 
    sendMediaWithRetry,
    editMediaMessage,
    markdownToHtml,
    MAX_RETRIES,
    RETRY_DELAY_MS
};
