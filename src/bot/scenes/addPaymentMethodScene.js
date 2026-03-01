const { Scenes } = require('telegraf');
const paymentRepo = require('../../database/repositories/paymentRepo');
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

const backToPaymentsMenu = async (ctx) => {
    await ctx.reply('Menü:', {
        reply_markup: {
            inline_keyboard: [[{ text: '🔙 Zurück zu Zahlungsarten', callback_data: 'master_manage_payments' }]]
        }
    });
    return ctx.scene.leave();
};

const addPaymentMethodScene = new Scenes.WizardScene(
    'addPaymentMethodScene',
    async (ctx) => {
        ctx.wizard.state.data = {};
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '💳 *Neue Zahlungsart*\n\nWie soll die Zahlungsart heißen? (z.B. Bitcoin, PayPal, Barzahlung)';

        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]] }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            return backToPaymentsMenu(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nBitte sende erst den Namen oder klicke auf Abbrechen.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        ctx.wizard.state.data.name = input;
        ctx.wizard.state.lastQuestion = `Alles klar: *${input}*.\n\nBitte sende mir jetzt die **Zahlungsadresse** (Wallet-ID, E-Mail oder Instruktion).\n\nFalls keine Adresse nötig ist (z.B. bei Barzahlung), klicke auf "Überspringen".`;

        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⏭ Überspringen', callback_data: 'skip_address' }],
                    [{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]
                ]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            return backToPaymentsMenu(ctx);
        }

        let address = null;

        if (ctx.callbackQuery && ctx.callbackQuery.data === 'skip_address') {
            await ctx.answerCbQuery('Übersprungen');
        } else {
            if (!ctx.message || !ctx.message.text) return;
            
            const input = ctx.message.text.trim();
            ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

            if (input.startsWith('/')) {
                const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nBitte sende die Adresse oder klicke auf "Überspringen".\n\n${ctx.wizard.state.lastQuestion}`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⏭ Überspringen', callback_data: 'skip_address' }],
                            [{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]
                        ]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
                return;
            }
            address = input;
        }

        const name = ctx.wizard.state.data.name;

        try {
            await paymentRepo.addPaymentMethod(name, address);
            await cleanup(ctx);
            
            await ctx.reply(texts.getPaymentSaved(name, address), { parse_mode: 'Markdown' });

            return backToPaymentsMenu(ctx);
        } catch (error) {
            console.error('AddPayment Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

addPaymentMethodScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    await cleanup(ctx);
    return backToPaymentsMenu(ctx);
});

addPaymentMethodScene.action('skip_address', async (ctx) => {
    return ctx.wizard.steps[ctx.wizard.cursor](ctx);
});

module.exports = addPaymentMethodScene;
