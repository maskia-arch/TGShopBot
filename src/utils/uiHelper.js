const updateOrSend = async (ctx, text, replyMarkup) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            // Wenn die Nachricht ein Foto hat, können wir keinen Text editieren
            if (ctx.callbackQuery.message.photo) {
                await ctx.deleteMessage().catch(() => {});
                return await ctx.reply(text, options);
            }
            return await ctx.editMessageText(text, options);
        } else {
            return await ctx.reply(text, options);
        }
    } catch (error) {
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            return await ctx.reply(text, options);
        } catch (fallbackError) {
            console.error('UI Helper Error:', fallbackError.message);
        }
    }
};

/**
 * Sendet eine Nachricht, die nach X Sekunden verschwindet.
 * Löscht zusätzlich die auslösende Nutzer-Nachricht (falls vorhanden),
 * um den Chatverlauf sauber zu halten.
 */
const sendTemporary = async (ctx, text, seconds = 3) => {
    try {
        // Die auslösende Nachricht des Users löschen (z.B. die getippte Menge)
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
