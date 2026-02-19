const { Scenes } = require('telegraf');
const paymentRepo = require('../../database/repositories/paymentRepo');
const uiHelper = require('../../utils/uiHelper');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
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
            await uiHelper.sendTemporary(ctx, 'Vorgang abgebrochen.', 2);
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;

        const text = ctx.message.text;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (text.startsWith('/')) {
            try { await ctx.deleteMessage(); } catch (e) {}
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, eine Zahlungsart anzulegen.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            
            return;
        }

        ctx.wizard.state.data.name = text;
        ctx.wizard.state.lastQuestion = `Alles klar: *${text}*.\n\nBitte sende mir jetzt die **Zahlungsadresse** (Wallet-ID, E-Mail oder Instruktion).\n\nFalls keine Adresse nötig ist (z.B. bei Barzahlung), klicke auf "Überspringen".`;

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
            await uiHelper.sendTemporary(ctx, 'Vorgang abgebrochen.', 2);
            return ctx.scene.leave();
        }

        let address = null;

        if (ctx.callbackQuery && ctx.callbackQuery.data === 'skip_address') {
            await ctx.answerCbQuery('Übersprungen');
        } else {
            if (!ctx.message || !ctx.message.text) return;
            
            const text = ctx.message.text;
            ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

            if (text.startsWith('/')) {
                try { await ctx.deleteMessage(); } catch (e) {}
                
                const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, eine Zahlungsart anzulegen.\n\n${ctx.wizard.state.lastQuestion}`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⏭ Überspringen', callback_data: 'skip_address' }],
                            [{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]
                        ]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
                
                return;
            }
            address = text;
        }

        const name = ctx.wizard.state.data.name;

        try {
            await paymentRepo.addPaymentMethod(name, address);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, `✅ Zahlungsart gespeichert:\n\n*Name:* ${name}\n*Adresse:* ${address || 'Keine'}\n\nDiese wird Kunden nun beim Checkout angezeigt.`, 6);
        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '❌ Fehler beim Speichern.', 3);
        }
        
        return ctx.scene.leave();
    }
);

module.exports = addPaymentMethodScene;
