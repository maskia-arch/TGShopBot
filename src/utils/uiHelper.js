const updateOrSend = async (ctx, text, replyMarkup) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        // Falls ein Callback vorliegt, versuchen wir die Nachricht zu editieren
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            // WICHTIG: Wenn die alte Nachricht ein Foto hatte, kann editMessageText fehlschlagen.
            // In diesem Fall springt der catch-Block ein.
            await ctx.editMessageText(text, options);
        } else {
            const msg = await ctx.reply(text, options);
            return msg;
        }
    } catch (error) {
        // Fallback: Wenn Editieren nicht möglich ist (z.B. wegen Bildwechsel), 
        // löschen wir die alte Nachricht und senden eine neue.
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            const msg = await ctx.reply(text, options);
            return msg;
        } catch (fallbackError) {
            console.error('UI Helper Error:', fallbackError.message);
        }
    }
};

/**
 * Sendet eine Nachricht, die sich nach einer bestimmten Zeit selbst löscht.
 * Ideal für "Erfolgreich hinzugefügt" oder Fehlermeldungen.
 */
const sendTemporary = async (ctx, text, seconds = 4) => {
    try {
        const msg = await ctx.reply(`⏳ ${text}`);
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
