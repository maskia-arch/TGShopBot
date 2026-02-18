const updateOrSend = async (ctx, text, replyMarkup) => {
    const options = {};
    if (replyMarkup) {
        options.reply_markup = replyMarkup;
    }

    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, options);
        } else {
            await ctx.reply(text, options);
        }
    } catch (error) {
        try {
            await ctx.reply(text, options);
        } catch (fallbackError) {
            console.error(fallbackError.message);
        }
    }
};

module.exports = {
    updateOrSend
};
