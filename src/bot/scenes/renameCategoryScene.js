const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const backToCategories = async (ctx) => {
    await cleanup(ctx);
    ctx.update.callback_query = { data: 'admin_manage_categories', from: ctx.from };
    return ctx.scene.leave();
};

const renameCategoryScene = new Scenes.WizardScene(
    'renameCategoryScene',
    async (ctx) => {
        ctx.wizard.state.categoryId = ctx.scene.state.categoryId;
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '✏️ *Kategorie umbenennen*\n\nBitte sende mir jetzt den neuen Namen für diese Kategorie:';

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
            return backToCategories(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;
        
        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }
        
        try {
            await productRepo.renameCategory(ctx.wizard.state.categoryId, input);
            await cleanup(ctx);
            await ctx.reply(`✅ Kategorie erfolgreich in *${input}* umbenannt.`, { parse_mode: 'Markdown' });
            
            return backToCategories(ctx);
        } catch (error) {
            console.error('RenameCategory Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

renameCategoryScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return backToCategories(ctx);
});

module.exports = renameCategoryScene;
