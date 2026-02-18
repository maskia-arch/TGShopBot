const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    // Wenn eine Image-URL vorhanden ist, betten wir sie als unsichtbaren Link am Anfang ein
    // Telegram generiert daraus automatisch eine Link-Vorschau (Web Page Preview)
    let formattedText = text;
    if (imageUrl) {
        // Nutzt ein unsichtbares Zeichen (U+200B), um den Link zu maskieren
        formattedText = `[\u200B](${imageUrl})${text}`;
    }

    const options = {
        parse_mode: 'Markdown',
        disable_web_page_preview: false, // WICHTIG: Muss false sein für Bild-Vorschau
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            // Falls die alte Nachricht ein "echtes" Foto-Objekt war (kein Link-Preview),
            // müssen wir löschen und neu senden, da Telegram Edit-Typen nicht mischen kann.
            if (ctx.callbackQuery.message.photo) {
                await ctx.deleteMessage().catch(() => {});
                return await ctx.reply(formattedText, options);
            }
            
            // Textnachricht (mit oder ohne Link-Preview) editieren
            return await ctx.editMessageText(formattedText, options);
        } else {
            return await ctx.reply(formattedText, options);
        }
    } catch (error) {
        try {
            // Fallback bei Fehlern (z.B. Nachricht wurde gelöscht oder identischer Inhalt)
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            return await ctx.reply(formattedText, options);
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
