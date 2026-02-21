const { Scenes } = require('telegraf');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
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

const addSubcategoryScene = new Scenes.WizardScene(
    'addSubcategoryScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.categoryId = ctx.scene.state.categoryId;
        ctx.wizard.state.categoryName = ctx.scene.state.categoryName || 'Unbekannt';
        ctx.wizard.state.lastQuestion = `📂 *Neue Unterkategorie*\n\nKategorie: *${ctx.wizard.state.categoryName}*\n\nBitte sende den Namen der neuen Unterkategorie:`;

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
            await cleanup(ctx);
            await ctx.scene.leave();
            ctx.update.callback_query = { data: `admin_edit_cat_${ctx.wizard.state.categoryId}`, from: ctx.from };
            return;
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
            await subcategoryRepo.addSubcategory(ctx.wizard.state.categoryId, input);
            await cleanup(ctx);
            await ctx.reply(texts.getSubcategoryCreated(input, ctx.wizard.state.categoryName), { parse_mode: 'Markdown' });

            ctx.update.callback_query = { data: `admin_edit_cat_${ctx.wizard.state.categoryId}`, from: ctx.from };
            return ctx.scene.leave();
        } catch (error) {
            console.error('AddSubcategory Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

addSubcategoryScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    await cleanup(ctx);
    await ctx.scene.leave();
    ctx.update.callback_query = { data: `admin_edit_cat_${ctx.wizard.state.categoryId}`, from: ctx.from };
});

module.exports = addSubcategoryScene;
