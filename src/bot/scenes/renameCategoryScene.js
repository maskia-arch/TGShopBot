const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const cancelAndLeave = async (ctx) => {
    await cleanup(ctx);
    await uiHelper.sendTemporary(ctx, 'Vorgang abgebrochen.', 2);
    return ctx.scene.leave();
};

const renameCategoryScene = new Scenes.WizardScene(
    'renameCategoryScene',
    async (ctx) => {
        ctx.wizard.state.categoryId = ctx.scene.state.categoryId;
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '✏️ *Kategorie umbenennen*\nBitte sende mir den neuen Namen:';

        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelAndLeave(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;
        
        const text = ctx.message.text;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (text.startsWith('/')) {
            try { await ctx.deleteMessage(); } catch (e) {}
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, eine Kategorie umzubenennen.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }
        
        try {
            await productRepo.renameCategory(ctx.wizard.state.categoryId, text);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, `✅ Kategorie in "${text}" umbenannt!`, 3);
        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '❌ Fehler beim Umbenennen.', 3);
        }
        
        return ctx.scene.leave();
    }
);

module.exports = renameCategoryScene;
