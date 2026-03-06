const texts = require('./texts');

/**
 * Parst eine image_url und gibt { type, fileId } zurück.
 * Format: "photo:FILE_ID", "animation:FILE_ID", "video:FILE_ID"
 * Legacy (kein Präfix): wird als "photo" behandelt.
 */
const parseMedia = (imageUrl) => {
    if (!imageUrl) return { type: null, fileId: null };
    if (imageUrl.startsWith('photo:')) return { type: 'photo', fileId: imageUrl.slice(6) };
    if (imageUrl.startsWith('animation:')) return { type: 'animation', fileId: imageUrl.slice(10) };
    if (imageUrl.startsWith('video:')) return { type: 'video', fileId: imageUrl.slice(6) };
    // Legacy: kein Präfix = Telegram file_id eines Fotos oder URL
    return { type: 'photo', fileId: imageUrl };
};

/**
 * Sendet ein Produkt-Medium (Foto/GIF/Video) korrekt basierend auf Typ.
 * Löscht die vorherige Nachricht und sendet neu.
 */
const sendProductMedia = async (ctx, imageUrl, text, replyMarkup) => {
    const options = { parse_mode: 'Markdown', reply_markup: replyMarkup };

    if (ctx.callbackQuery?.message) {
        await ctx.deleteMessage().catch(() => {});
    }

    if (!imageUrl) {
        return await ctx.reply(text, options);
    }

    const { type, fileId } = parseMedia(imageUrl);

    try {
        if (type === 'animation') {
            return await ctx.replyWithAnimation(fileId, { caption: text, ...options });
        } else if (type === 'video') {
            return await ctx.replyWithVideo(fileId, { caption: text, ...options });
        } else {
            // photo oder unbekannt
            return await ctx.replyWithPhoto(fileId, { caption: text, ...options });
        }
    } catch (e1) {
        // Fallback: probiere alle Medientypen durch
        console.warn(`sendProductMedia: Typ "${type}" fehlgeschlagen für ${fileId}, probiere Fallbacks...`);
        const fallbackMethods = ['replyWithPhoto', 'replyWithAnimation', 'replyWithVideo'];
        for (const method of fallbackMethods) {
            try {
                return await ctx[method](fileId, { caption: text, ...options });
            } catch (e) {}
        }
        // Absoluter Fallback: Text ohne Bild
        console.error(`sendProductMedia: Alle Medientypen fehlgeschlagen für ${fileId}`);
        return await ctx.reply(text + texts.getAdminImageLoadError(), options);
    }
};

const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const msg = ctx.callbackQuery.message;
            const hasMedia = !!(msg.photo || msg.animation || msg.video);

            if (imageUrl) {
                // Muss Medien senden – lösche alte Nachricht und sende neu
                await ctx.deleteMessage().catch(() => {});
                return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
            } else {
                if (hasMedia) {
                    // Alte Nachricht hat Medien, neue nicht → löschen und Text senden
                    await ctx.deleteMessage().catch(() => {});
                    return await ctx.reply(text, options);
                } else {
                    // Normales Text-Edit
                    return await ctx.editMessageText(text, options);
                }
            }
        } else {
            if (imageUrl) {
                return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
            } else {
                return await ctx.reply(text, options);
            }
        }
    } catch (error) {
        // Fallback bei allem
        try {
            if (ctx.callbackQuery?.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            if (imageUrl) {
                return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
            }
            return await ctx.reply(text, options);
        } catch (fallbackError) {
            console.error('UI Helper Error:', fallbackError.message);
        }
    }
};

const sendTemporary = async (ctx, text, seconds = 3) => {
    try {
        if (ctx.message) ctx.deleteMessage().catch(() => {});
        const msg = await ctx.reply(`✨ ${text}`);
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        }, seconds * 1000);
    } catch (error) {
        console.error('Temp Message Error:', error.message);
    }
};

module.exports = { updateOrSend, sendTemporary, sendProductMedia, parseMedia };
