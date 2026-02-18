const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            // Prüfen, ob die aktuelle Nachricht ein Foto ist
            const isCurrentlyPhoto = ctx.callbackQuery.message.photo !== undefined;

            if (imageUrl) {
                // ZIEL: Wir wollen ein BILD anzeigen
                if (isCurrentlyPhoto) {
                    // Es ist bereits eine Foto-Nachricht -> Wir editieren nur das Bild und den Text (Caption)
                    return await ctx.editMessageMedia({
                        type: 'photo',
                        media: imageUrl,
                        caption: text,
                        parse_mode: 'Markdown'
                    }, { reply_markup: replyMarkup });
                } else {
                    // Es ist aktuell nur Text -> Löschen und als neue Foto-Nachricht senden
                    await ctx.deleteMessage().catch(() => {});
                    return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
                }
            } else {
                // ZIEL: Wir wollen NUR TEXT anzeigen
                if (isCurrentlyPhoto) {
                    // Es ist aktuell ein Foto -> Löschen und als reinen Text neu senden
                    await ctx.deleteMessage().catch(() => {});
                    return await ctx.reply(text, options);
                } else {
                    // Es ist bereits Text -> Wir editieren einfach den Text
                    return await ctx.editMessageText(text, options);
                }
            }
        } else {
            // Keine CallbackQuery (z.B. direkter Aufruf)
            if (imageUrl) {
                return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
            } else {
                return await ctx.reply(text, options);
            }
        }
    } catch (error) {
        // Fallback: Wenn das Editieren fehlschlägt (z.B. weil sich der Text nicht geändert hat),
        // löschen wir die Nachricht und senden sie komplett neu.
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            if (imageUrl) {
                return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
            }
            return await ctx.reply(text, options);
        } catch (fallbackError) {
            console.error('UI Helper Error:', fallbackError.message);
        }
    }
};

/**
 * Sendet eine Nachricht, die nach X Sekunden verschwindet.
 */
const sendTemporary = async (ctx, text, seconds = 3) => {
    try {
        // Die auslösende User-Nachricht löschen (falls vorhanden)
        if (ctx.message) {
            ctx.deleteMessage().catch(() => {});
        }

        const msg = await ctx.reply(`✨ ${text}`);
        
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        }, seconds * 1000);
    } catch (error) {
        console.error('Temp Message Error:', error.message);
    }
};

module.exports = {
    updateOrSend,
    sendTemporary
};
