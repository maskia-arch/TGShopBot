const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
    }
};

const renameCategoryScene = new Scenes.WizardScene(
    'renameCategoryScene',
    async (ctx) => {
        ctx.wizard.state.categoryId = ctx.scene.state.categoryId;
        ctx.wizard.state.messagesToDelete = [];

        const msg = await ctx.reply('✏️ *Kategorie umbenennen*\nBitte sende mir den neuen Namen:', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Abbrechen-Logik
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, 'Vorgang abgebrochen.', 2);
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        
        const newName = ctx.message.text;
        
        try {
            await productRepo.renameCategory(ctx.wizard.state.categoryId, newName);
            
            // Alles aufräumen
            await cleanup(ctx);
            
            // Kurzes Feedback und zurück
            await uiHelper.sendTemporary(ctx, `Kategorie in "${newName}" umbenannt!`, 3);
            await ctx.answerCbQuery('✅ Erfolgreich umbenannt');
        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '❌ Fehler beim Umbenennen.', 3);
        }
        return ctx.scene.leave();
    }
);

module.exports = renameCategoryScene;
