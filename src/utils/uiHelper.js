/**
 * uiHelper.js – v0.5.67
 * 
 * Zentrales UI-System mit Ausfallsicherheit, automatischer Tastatur-Bereinigung,
 * flicker-freier Medien-Anzeige, ständiger Erreichbarkeit für den Anwender
 * sowie intelligenten Selbstlöschungs- & Sitzungs-Timern.
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

// Aktive Sitzungs- / Timer-Verwaltung pro Chat (Map<chatId, { messageId, timer, ttlMs }>)
const activeSessions = new Map();

const isPersistentContent = (text) => {
    if (!text || typeof text !== 'string') return false;
    return text.includes('digital_delivery') || 
           text.includes('Gelieferte') || 
           text.includes('Tresor') || 
           text.includes('Lieferung ist da') || 
           text.includes('Inhalt:') || 
           text.includes('Bestellung #');
};

/**
 * Registriert oder aktualisiert den Selbstlöschungs- / Expiration-Timer für eine Chat-Ansicht.
 */
const scheduleMessageExpiry = (telegram, chatId, messageId, ttlMs = 600000, text = '') => {
    if (!chatId || !messageId) return;

    // NIEMALS Dauerhafte Liefer- / Bestellungs-Nachrichten per Timer ablaufen lassen!
    if (isPersistentContent(text)) return;

    // Beende vorherigen Timer für diesen Chat
    if (activeSessions.has(chatId)) {
        const existing = activeSessions.get(chatId);
        if (existing.timer) clearTimeout(existing.timer);
    }

    const timer = setTimeout(async () => {
        try {
            activeSessions.delete(chatId);
            
            const expiredText = '⌛ *Diese Sitzung ist abgelaufen.*\n\n' +
                '_Da einige Minuten keine Eingabe erfolgte, wurde das Fenster aus Sicherheitsgründen geschlossen._\n\n' +
                'Bitte klicke unten, um den Bot neu zu starten:';
            
            const expiredKeyboard = {
                inline_keyboard: [
                    [{ text: '🔄 Bot neu starten (/start)', callback_data: 'back_to_main', style: 'primary' }]
                ]
            };

            await telegram.editMessageText(chatId, messageId, null, expiredText, {
                parse_mode: 'Markdown',
                reply_markup: expiredKeyboard
            }).catch(async () => {
                await telegram.deleteMessage(chatId, messageId).catch(() => {});
                await telegram.sendMessage(chatId, expiredText, {
                    parse_mode: 'Markdown',
                    reply_markup: expiredKeyboard
                }).catch(() => {});
            });
        } catch (e) {
            console.error('[UIHelper Expiry] Fehler beim Ablaufen der Sitzung:', e.message);
        }
    }, ttlMs);

    activeSessions.set(chatId, { messageId, timer, ttlMs });
};

/**
 * Setzt den Timer bei Benutzer-Interaktion zurück oder hebt alte Timer auf.
 */
const touchSession = (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    if (activeSessions.has(chatId)) {
        const sessionObj = activeSessions.get(chatId);
        if (sessionObj.timer) clearTimeout(sessionObj.timer);
        activeSessions.delete(chatId);
    }
};

/**
 * Kürzt Text auf das Telegram-Caption-Limit (1024 Zeichen).
 */
const truncateCaption = (text) => {
    if (!text || text.length <= CAPTION_LIMIT) return text;
    const truncated = text.substring(0, CAPTION_LIMIT - 3);
    const lastNewline = truncated.lastIndexOf('\n');
    return (lastNewline > CAPTION_LIMIT * 0.5 ? truncated.substring(0, lastNewline) : truncated) + '...';
};

/**
 * Bereinigt Keyboard-Objekte von inkompatiblen Attributen,
 * damit Telegram API Aufrufe niemals aufgrund von Markup-Fehlern abbrechen.
 */
const sanitizeKeyboard = (replyMarkup) => {
    if (!replyMarkup || !replyMarkup.inline_keyboard) return replyMarkup;
    try {
        const cleanKeyboard = replyMarkup.inline_keyboard.map(row => {
            if (!Array.isArray(row)) return [];
            return row.map(btn => {
                if (!btn || typeof btn !== 'object') return btn;
                const { style, ...cleanBtn } = btn;
                return cleanBtn;
            });
        });
        return { inline_keyboard: cleanKeyboard };
    } catch (e) {
        return replyMarkup;
    }
};

/**
 * Erzeugt eine Notfall-Tastatur, damit der Anwender NIEMALS in einem Hänger stecken bleibt.
 */
const getEmergencyKeyboard = () => ({
    inline_keyboard: [
        [{ text: '🔄 Erneut versuchen', callback_data: 'back_to_main' }],
        [{ text: '🏠 Hauptmenü', callback_data: 'back_to_main' }]
    ]
});

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
 */
const sendProductMedia = async (ctx, imageUrl, text, replyMarkup) => {
    touchSession(ctx);
    const caption = truncateCaption(text);
    const options = { caption, parse_mode: 'Markdown', reply_markup: replyMarkup };

    if (ctx.callbackQuery?.message) {
        await ctx.deleteMessage().catch(() => {});
    }

    let sentMsg = null;

    if (!imageUrl) {
        sentMsg = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup })
            .catch(() => ctx.reply(text, { reply_markup: sanitizeKeyboard(replyMarkup) }));
    } else {
        const { type, fileId } = parseStoredMedia(imageUrl);
        if (!type || !fileId) {
            sentMsg = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup })
                .catch(() => ctx.reply(text, { reply_markup: sanitizeKeyboard(replyMarkup) }));
        } else {
            try {
                sentMsg = await sendMediaWithRetry(ctx, type, fileId, options);
            } catch (error) {
                console.error(`[UIHelper] sendProductMedia fehlgeschlagen: ${error.message}`);
                const fallbackText = text + texts.getAdminImageLoadError();
                sentMsg = await ctx.reply(fallbackText, { parse_mode: 'Markdown', reply_markup: sanitizeKeyboard(replyMarkup) })
                    .catch(() => ctx.reply(fallbackText, { reply_markup: getEmergencyKeyboard() }));
            }
        }
    }

    if (sentMsg && sentMsg.message_id && ctx.chat?.id) {
        const ttlMs = (text && (text.includes('Checkout') || text.includes('Rechnung'))) ? 1800000 : 600000;
        scheduleMessageExpiry(ctx.telegram, ctx.chat.id, sentMsg.message_id, ttlMs);
    }
    return sentMsg;
};

/**
 * Zeigt ein Produkt mit optionalem Medium intelligent an.
 */
const showProductWithMedia = async (ctx, imageUrl, text, replyMarkup) => {
    if (!imageUrl) {
        const hasMedia = currentMessageHasMedia(ctx);
        if (hasMedia) {
            await ctx.deleteMessage().catch(() => {});
            const sentMsg = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup })
                .catch(() => ctx.reply(text, { reply_markup: sanitizeKeyboard(replyMarkup) }));
            if (sentMsg && sentMsg.message_id && ctx.chat?.id) {
                scheduleMessageExpiry(ctx.telegram, ctx.chat.id, sentMsg.message_id, 600000);
            }
            return sentMsg;
        }
        return await updateOrSend(ctx, text, replyMarkup);
    }

    const { type, fileId } = parseStoredMedia(imageUrl);
    if (!type || !fileId) {
        return await updateOrSend(ctx, text, replyMarkup);
    }

    const caption = truncateCaption(text);

    if (currentMessageHasMedia(ctx)) {
        const editResult = await editMediaMessage(ctx, type, fileId, caption, replyMarkup);
        if (editResult && editResult.message_id && ctx.chat?.id) {
            scheduleMessageExpiry(ctx.telegram, ctx.chat.id, editResult.message_id, 600000);
            return editResult;
        }
    }

    return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
};

/**
 * Aktualisiert eine bestehende Text-Nachricht oder sendet eine neue.
 * Garantiert 100% Ausfallsicherheit & registriert automatischen Expiration-Timer.
 */
const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    touchSession(ctx);

    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    if (imageUrl) {
        return await showProductWithMedia(ctx, imageUrl, text, replyMarkup);
    }

    let sentMsg = null;

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const hasMedia = currentMessageHasMedia(ctx);

            if (hasMedia) {
                await ctx.deleteMessage().catch(() => {});
                sentMsg = await ctx.reply(text, options)
                    .catch(async () => {
                        const cleanMarkup = sanitizeKeyboard(replyMarkup);
                        return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: cleanMarkup })
                            .catch(() => ctx.reply(text, { reply_markup: getEmergencyKeyboard() }));
                    });
            } else {
                sentMsg = await ctx.editMessageText(text, options)
                    .catch(async (editError) => {
                        const errMsg = (editError.message || '').toLowerCase();
                        
                        if (errMsg.includes('not modified')) return ctx.callbackQuery.message;

                        const cleanMarkup = sanitizeKeyboard(replyMarkup);

                        if (errMsg.includes("can't parse") || errMsg.includes('parse entities') || errMsg.includes('button')) {
                            return await ctx.editMessageText(text, { 
                                parse_mode: 'Markdown', 
                                reply_markup: cleanMarkup 
                            }).catch(async () => {
                                return await ctx.editMessageText(markdownToHtml(text), { 
                                    parse_mode: 'HTML', 
                                    reply_markup: cleanMarkup 
                                }).catch(async () => {
                                    await ctx.deleteMessage().catch(() => {});
                                    return await ctx.reply(text, { reply_markup: cleanMarkup })
                                        .catch(() => ctx.reply(text, { reply_markup: getEmergencyKeyboard() }));
                                });
                            });
                        }

                        await ctx.deleteMessage().catch(() => {});
                        return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: cleanMarkup })
                            .catch(() => ctx.reply(text, { reply_markup: getEmergencyKeyboard() }));
                    });
            }
        } else {
            sentMsg = await ctx.reply(text, options)
                .catch(async () => {
                    const cleanMarkup = sanitizeKeyboard(replyMarkup);
                    return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: cleanMarkup })
                        .catch(() => ctx.reply(text, { reply_markup: getEmergencyKeyboard() }));
                });
        }
    } catch (error) {
        console.error('[UIHelper] updateOrSend Error:', error.message);
        try {
            if (ctx.callbackQuery?.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            const cleanMarkup = sanitizeKeyboard(replyMarkup);
            sentMsg = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: cleanMarkup })
                .catch(() => ctx.reply(text, { reply_markup: getEmergencyKeyboard() }));
        } catch (fallbackError) {
            console.error('[UIHelper] Finaler Fallback Error:', fallbackError.message);
            sentMsg = await ctx.reply('⚠️ *Ein kleiner Anzeigefehler ist aufgetreten.*\n\nBitte klicke unten auf Hauptmenü:', {
                parse_mode: 'Markdown',
                reply_markup: getEmergencyKeyboard()
            }).catch(() => null);
        }
    }

    if (sentMsg && sentMsg.message_id && ctx.chat?.id) {
        const ttlMs = (text && (text.includes('Checkout') || text.includes('Rechnung') || text.includes('Zahlung'))) ? 1800000 : 600000;
        scheduleMessageExpiry(ctx.telegram, ctx.chat.id, sentMsg.message_id, ttlMs);
    }

    return sentMsg;
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
    touchSession,
    scheduleMessageExpiry,
    parseMedia: parseStoredMedia,
    truncateCaption,
    sanitizeKeyboard,
    getEmergencyKeyboard
};
