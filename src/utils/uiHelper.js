/**
 * uiHelper.js – v0.5.64
 * 
 * Zentrales UI-System mit flicker-freier Medien-Anzeige.
 * 
 * Kernverbesserungen gegenüber v0.5.63:
 * ─────────────────────────────────────────────────────
 * 1. editMessageMedia: Medien-Nachrichten werden in-place aktualisiert,
 *    statt delete+resend. Kein Flackern, keine Race Conditions.
 * 
 * 2. Intelligenter Nachrichten-Typ-Wechsel:
 *    - Media→Media: editMessageMedia (flicker-frei)
 *    - Media→Text: deleteMessage + reply (notwendig)
 *    - Text→Media: deleteMessage + sendMedia (notwendig)
 *    - Text→Text: editMessageText (flicker-frei)
 * 
 * 3. Automatischer Parse-Mode-Fallback (Markdown → HTML → Plain)
 * 
 * 4. Telegram Caption-Limit: Automatische Kürzung auf 1024 Zeichen
 */

const texts = require('./texts');
const { 
    parseStoredMedia, 
    sendMediaWithRetry, 
    editMediaMessage, 
    markdownToHtml 
} = require('./imageUploader');

// Telegram Caption-Limit
const CAPTION_LIMIT = 1024;

/**
 * Kürzt Text auf das Telegram-Caption-Limit (1024 Zeichen).
 * Schneidet am letzten Zeilenumbruch vor dem Limit ab und fügt "..." hinzu.
 */
const truncateCaption = (text) => {
    if (!text || text.length <= CAPTION_LIMIT) return text;
    const truncated = text.substring(0, CAPTION_LIMIT - 3);
    const lastNewline = truncated.lastIndexOf('\n');
    return (lastNewline > CAPTION_LIMIT * 0.5 ? truncated.substring(0, lastNewline) : truncated) + '...';
};

/**
 * Prüft ob die aktuelle Callback-Nachricht ein Medium enthält.
 */
const currentMessageHasMedia = (ctx) => {
    const msg = ctx.callbackQuery?.message;
    if (!msg) return false;
    return !!(msg.photo || msg.animation || msg.video || msg.document);
};

/**
 * Sendet ein Produkt-Medium (Foto/GIF/Video) als neue Nachricht.
 * Löscht vorherige Callback-Nachricht falls vorhanden.
 * 
 * Verwendet sendMediaWithRetry für zuverlässige Zustellung mit Retry-Logik.
 * Falls alle Media-Versuche fehlschlagen, wird ein Text-Fallback gesendet.
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {string} imageUrl - Gespeicherte image_url (z.B. "photo:FILE_ID")
 * @param {string} text - Caption-Text
 * @param {Object} replyMarkup - Inline-Keyboard Objekt
 * @returns {Promise<Object>} - Gesendete Nachricht
 */
const sendProductMedia = async (ctx, imageUrl, text, replyMarkup) => {
    const caption = truncateCaption(text);
    const options = { caption, parse_mode: 'Markdown', reply_markup: replyMarkup };

    // Alte Nachricht löschen (Callback-Kontext)
    if (ctx.callbackQuery?.message) {
        await ctx.deleteMessage().catch(() => {});
    }

    // Kein Medium → nur Text
    if (!imageUrl) {
        return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup })
            .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
    }

    const { type, fileId } = parseStoredMedia(imageUrl);

    if (!type || !fileId) {
        return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup })
            .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
    }

    // Medium senden mit Retry
    try {
        return await sendMediaWithRetry(ctx, type, fileId, options);
    } catch (error) {
        console.error(`[UIHelper] sendProductMedia fehlgeschlagen: ${error.message}`);
        // Text-Fallback ohne Bild
        const fallbackText = text + texts.getAdminImageLoadError();
        return await ctx.reply(fallbackText, { parse_mode: 'Markdown', reply_markup: replyMarkup })
            .catch(() => ctx.reply(fallbackText, { reply_markup: replyMarkup }));
    }
};

/**
 * Zeigt ein Produkt mit optionalem Medium intelligent an.
 * 
 * Strategie:
 * ─────────────────────────────────────────────────────
 * Wenn die aktuelle Nachricht ein Medium ist UND wir ein Medium anzeigen wollen:
 *   → editMessageMedia (flicker-frei, schnell)
 * 
 * Wenn die aktuelle Nachricht Text ist UND wir ein Medium anzeigen wollen:
 *   → deleteMessage + sendMedia (notwendiger Wechsel)
 * 
 * Wenn wir kein Medium anzeigen wollen:
 *   → updateOrSend (normaler Text-Flow)
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {string|null} imageUrl - Gespeicherte image_url oder null
 * @param {string} text - Nachrichtentext / Caption
 * @param {Object} replyMarkup - Inline-Keyboard
 * @returns {Promise<Object>}
 */
const showProductWithMedia = async (ctx, imageUrl, text, replyMarkup) => {
    // Kein Medium → normaler Text-Flow
    if (!imageUrl) {
        const hasMedia = currentMessageHasMedia(ctx);
        if (hasMedia) {
            // Aktuelle Nachricht hat Medium, neue nicht → löschen + Text
            await ctx.deleteMessage().catch(() => {});
            return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup })
                .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
        }
        return await updateOrSend(ctx, text, replyMarkup);
    }

    const { type, fileId } = parseStoredMedia(imageUrl);
    if (!type || !fileId) {
        return await updateOrSend(ctx, text, replyMarkup);
    }

    const caption = truncateCaption(text);

    // Aktuelle Nachricht hat auch ein Medium → editMessageMedia (flicker-frei!)
    if (currentMessageHasMedia(ctx)) {
        const editResult = await editMediaMessage(ctx, type, fileId, caption, replyMarkup);
        if (editResult) return editResult;
        // editMessageMedia fehlgeschlagen → Fallback auf delete+resend
    }

    // Kein Edit möglich → delete + neu senden
    return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
};

/**
 * Aktualisiert eine bestehende Text-Nachricht oder sendet eine neue.
 * Handhabt den Wechsel zwischen Text- und Media-Nachrichten korrekt.
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {string} text - Nachrichtentext
 * @param {Object} replyMarkup - Keyboard-Objekt
 * @param {string|null} imageUrl - Optionale image_url für Medien
 * @returns {Promise<Object>}
 */
const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    // Wenn imageUrl mitgegeben → über showProductWithMedia handhaben
    if (imageUrl) {
        return await showProductWithMedia(ctx, imageUrl, text, replyMarkup);
    }

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const hasMedia = currentMessageHasMedia(ctx);

            if (hasMedia) {
                // Media→Text: Löschen und neu senden
                await ctx.deleteMessage().catch(() => {});
                return await ctx.reply(text, options)
                    .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
            } else {
                // Text→Text: In-place editieren
                return await ctx.editMessageText(text, options)
                    .catch(async (editError) => {
                        const errMsg = (editError.message || '').toLowerCase();
                        // Markdown-Fehler → HTML versuchen
                        if (errMsg.includes("can't parse") || errMsg.includes('parse entities')) {
                            return await ctx.editMessageText(markdownToHtml(text), { 
                                parse_mode: 'HTML', 
                                reply_markup: replyMarkup 
                            }).catch(async () => {
                                // Auch HTML fehlgeschlagen → delete+reply
                                await ctx.deleteMessage().catch(() => {});
                                return await ctx.reply(text, options)
                                    .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
                            });
                        }
                        // "message is not modified" → ignorieren
                        if (errMsg.includes('not modified')) return;
                        // Anderer Fehler → delete+reply
                        await ctx.deleteMessage().catch(() => {});
                        return await ctx.reply(text, options)
                            .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
                    });
            }
        } else {
            // Kein Callback-Kontext → einfach senden
            return await ctx.reply(text, options)
                .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
        }
    } catch (error) {
        console.error('[UIHelper] updateOrSend Error:', error.message);
        try {
            if (ctx.callbackQuery?.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            return await ctx.reply(text, options)
                .catch(() => ctx.reply(text, { reply_markup: replyMarkup }));
        } catch (fallbackError) {
            console.error('[UIHelper] Finaler Fallback Error:', fallbackError.message);
        }
    }
};

/**
 * Sendet eine temporäre Nachricht, die nach X Sekunden automatisch gelöscht wird.
 */
const sendTemporary = async (ctx, text, seconds = 3) => {
    try {
        if (ctx.message) ctx.deleteMessage().catch(() => {});
        const msg = await ctx.reply(`✨ ${text}`);
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        }, seconds * 1000);
    } catch (error) {
        console.error('[UIHelper] Temp Message Error:', error.message);
    }
};

module.exports = { 
    updateOrSend, 
    sendTemporary, 
    sendProductMedia, 
    showProductWithMedia,
    parseMedia: parseStoredMedia, // Rückwärtskompatibel
    truncateCaption
};
