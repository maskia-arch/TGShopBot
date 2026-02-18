const { Scenes } = require('telegraf');
const paymentRepo = require('../../database/repositories/paymentRepo');
const uiHelper = require('../../utils/uiHelper');

const addPaymentMethodScene = new Scenes.WizardScene(
    'addPaymentMethodScene',
    // Schritt 1: Name der Zahlungsart
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.reply('💳 *Neue Zahlungsart*\n\nWie soll die Zahlungsart heißen? (z.B. Bitcoin, PayPal, Barzahlung)', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel' }]] }
        });
        return ctx.wizard.next();
    },
    // Schritt 2: Adresse (Optional)
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel') return ctx.scene.leave();
        if (!ctx.message?.text) return;

        ctx.wizard.state.data.name = ctx.message.text;
        await ctx.reply(`Alles klar: *${ctx.message.text}*.\n\nBitte sende mir jetzt die **Zahlungsadresse** (Wallet-ID, E-Mail oder Instruktion).\n\nFalls keine Adresse nötig ist (z.B. bei Barzahlung), klicke auf "Überspringen".`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⏭ Überspringen', callback_data: 'skip_address' }],
                    [{ text: '❌ Abbrechen', callback_data: 'cancel' }]
                ]
            }
        });
        return ctx.wizard.next();
    },
    // Schritt 3: Speichern
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel') return ctx.scene.leave();
        
        const address = ctx.callbackQuery?.data === 'skip_address' ? null : ctx.message?.text;
        const name = ctx.wizard.state.data.name;

        try {
            await paymentRepo.addPaymentMethod(name, address);
            await ctx.reply(`✅ Zahlungsart gespeichert:\n\n*Name:* ${name}\n*Adresse:* ${address || 'Keine'}\n\nDiese wird Kunden nun beim Checkout angezeigt.`, { parse_mode: 'Markdown' });
        } catch (error) {
            await ctx.reply('❌ Fehler beim Speichern.');
        }
        return ctx.scene.leave();
    }
);

module.exports = addPaymentMethodScene;
