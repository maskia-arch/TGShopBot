const { Scenes } = require('telegraf');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
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

const backToCategory = async (ctx) => {
    await cleanup(ctx);
    ctx.update.callback_query = { data: `admin_edit_cat_${ctx.wizard.state.categoryId}`, from: ctx.from };
    return ctx.scene.leave();
};

const renameSubcategoryScene = new Scenes.WizardScene(
    'renameSubcategoryScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.subcategoryId = ctx.scene.state.subcategoryId;
        ctx.wizard.state.categoryId = ctx.scene.state.categoryId;
        ctx.wizard.state.lastQuestion = '✏️ *Unterkategorie umbenennen*\n\nBitte sende den neuen Namen:';

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
            return backToCategory(ctx);
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
            await subcategoryRepo.renameSubcategory(ctx.wizard.state.subcategoryId, input);
            await cleanup(ctx);
            await ctx.reply(`✅ Unterkategorie erfolgreich in *${input}* umbenannt.`, { parse_mode: 'Markdown' });

            return backToCategory(ctx);
        } catch (error) {
            console.error('RenameSubcategory Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

renameSubcategoryScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return backToCategory(ctx);
});

module.exports = renameSubcategoryScene;
