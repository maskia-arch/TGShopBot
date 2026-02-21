const { Scenes } = require('telegraf');
const userRepo = require('../../database/repositories/userRepo');
const notificationService = require('../../services/notificationService');
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

const contactScene = new Scenes.WizardScene(
    'contactScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.orderId = ctx.scene.state.orderId;

        const msg = await ctx.reply(texts.getContactPrompt(), {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_contact' }]]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);

        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_contact') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.length > 500) {
            const msg = await ctx.reply('⚠️ Nachricht zu lang (max. 500 Zeichen). Bitte kürzer fassen:');
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return;
        }

        try {
            const userId = ctx.from.id;
            await userRepo.setContactTimestamp(userId);

            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');

            notificationService.notifyAdminsContact({
                userId,
                username,
                orderId: ctx.wizard.state.orderId,
                message: input
            }).catch(() => {});

            await cleanup(ctx);
            await ctx.reply(texts.getContactSent(), { parse_mode: 'Markdown' });
            return ctx.scene.leave();
        } catch (error) {
            console.error('Contact Scene Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

contactScene.action('cancel_contact', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    await cleanup(ctx);
    return ctx.scene.leave();
});

module.exports = contactScene;
