const { Scenes } = require('telegraf');
const paymentRepo = require('../../database/repositories/paymentRepo');
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
            inline_keyboard: [[{ text: '🔙 Zurück zu Zahlungsarten', callback_data: 'master_manage_payments', style: 'danger' }]]
        }
    });
    return ctx.scene.leave();
};

const COIN_NAMES = {
    BTC: '₿ Bitcoin (BTC)',
    LTC: 'Ł Litecoin (LTC)',
    ETH: 'Ξ Ethereum (ETH)',
    SOL: '◎ Solana (SOL)'
};

const addPaymentMethodScene = new Scenes.WizardScene(
    'addPaymentMethodScene',
    async (ctx) => {
        ctx.wizard.state.data = {};
        ctx.wizard.state.messagesToDelete = [];
        
        const isAutoCrypto = ctx.scene.state && ctx.scene.state.isAutoCrypto;
        ctx.wizard.state.data.isAutoCrypto = isAutoCrypto;

        if (isAutoCrypto) {
            // Mode A: Automatische Krypto-Zahlungsart – Zeige sofort Coin-Auswahl mit echten Symbolen!
            ctx.wizard.state.lastQuestion = '⚡ *Automatische Krypto-Zahlungsart einrichten*\n\nBitte wähle den Coin aus, der automatisch über die Blockchain überwacht werden soll:';

            const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '₿ BTC (Bitcoin)', callback_data: 'coin_BTC', style: 'primary' }, { text: 'Ł LTC (Litecoin)', callback_data: 'coin_LTC', style: 'primary' }],
                        [{ text: 'Ξ ETH (Ethereum)', callback_data: 'coin_ETH', style: 'primary' }, { text: '◎ SOL (Solana)', callback_data: 'coin_SOL', style: 'primary' }],
                        [{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]
                    ]
                }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return ctx.wizard.next();
        } else {
            // Mode B: Manuelle Zahlungsart – Frage nach Namen
            ctx.wizard.state.lastQuestion = '💳 *Manuelle Zahlungsart einrichten*\n\nWie soll die Zahlungsart heißen? (z.B. PayPal, Banküberweisung, Barzahlung)';

            const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return ctx.wizard.next();
        }
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            return backToPaymentsMenu(ctx);
        }

        const isAutoCrypto = ctx.wizard.state.data.isAutoCrypto;

        if (isAutoCrypto) {
            if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('coin_')) {
                const coin = ctx.callbackQuery.data.replace('coin_', '');
                ctx.answerCbQuery().catch(() => {});

                ctx.wizard.state.data.symbol = coin;
                ctx.wizard.state.data.name = COIN_NAMES[coin] || `${coin} (Auto-Verify)`;
                ctx.wizard.state.data.autoVerify = true;

                ctx.wizard.state.lastQuestion = `Gewählter Coin: *${COIN_NAMES[coin]}*\n\n📍 Bitte sende mir jetzt deine **${coin} Wallet-Adresse** (z.B. \`bc1q...\` oder \`0x...\`).`;

                const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]
                        ]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
                return ctx.wizard.next();
            }
            return;
        } else {
            // Manuelle Zahlungsart
            if (!ctx.message || !ctx.message.text) return;

            const input = ctx.message.text.trim();
            ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

            if (input.startsWith('/')) {
                const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nBitte sende erst den Namen oder klicke auf Abbrechen.\n\n${ctx.wizard.state.lastQuestion}`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]] }
                });
                ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
                return;
            }

            ctx.wizard.state.data.name = input;
            ctx.wizard.state.data.symbol = 'BTC';
            ctx.wizard.state.data.autoVerify = false;

            ctx.wizard.state.lastQuestion = `Alles klar: *${input}*.\n\nBitte sende mir jetzt die **Zahlungsadresse** (Wallet-ID, E-Mail oder Instruktion).\n\nFalls keine Adresse nötig ist (z.B. Barzahlung), klicke auf "Überspringen".`;

            const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⏭ Überspringen', callback_data: 'skip_address', style: 'primary' }],
                        [{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]
                    ]
                }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return ctx.wizard.next();
        }
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
                const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nBitte sende die Adresse oder klicke auf "Abbrechen".\n\n${ctx.wizard.state.lastQuestion}`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]
                        ]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
                return;
            }
            address = input;
        }

        const name = ctx.wizard.state.data.name;
        const symbol = ctx.wizard.state.data.symbol || 'BTC';
        const autoVerify = ctx.wizard.state.data.autoVerify || false;

        try {
            await paymentRepo.addPaymentMethod(name, address, symbol, autoVerify);
            await cleanup(ctx);
            
            let savedMsg = texts.getPaymentSaved(name, address);
            if (autoVerify) {
                savedMsg += `\n\n⚡ *Automatische Blockchain-Erkennung AKTIV für ${symbol}!*`;
            }
            await ctx.reply(savedMsg, { parse_mode: 'Markdown' });

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
