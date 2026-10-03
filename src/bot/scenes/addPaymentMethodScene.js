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
        const isCash = ctx.scene.state && ctx.scene.state.isCash;
        ctx.wizard.state.data.isAutoCrypto = isAutoCrypto;
        ctx.wizard.state.data.isCash = isCash;

        if (isCash) {
            // Mode C: Barzahlung für physische Artikel
            ctx.wizard.state.lastQuestion = '💵 *Barzahlung für physische Artikel einrichten*\n\n' +
                'Hier richtest du Barzahlung für deine physischen Produkte (Versand / Abholung) ein.\n' +
                'Kunden können bei diesen Artikeln bar bezahlen. Für physische Waren wird *automatisch kein Krypto* angeboten.\n\n' +
                'Wie soll die Zahlungsart heißen?';

            const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Standard: "💵 Barzahlung bei Abholung / Übergabe"', callback_data: 'cash_name_default', style: 'success' }],
                        [{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]
                    ]
                }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return ctx.wizard.next();
        } else if (isAutoCrypto) {
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
        const isCash = ctx.wizard.state.data.isCash;

        if (isCash) {
            let cashName = '💵 Barzahlung bei Abholung / Übergabe';
            if (ctx.callbackQuery && ctx.callbackQuery.data === 'cash_name_default') {
                ctx.answerCbQuery().catch(() => {});
            } else if (ctx.message && ctx.message.text) {
                const input = ctx.message.text.trim();
                ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
                if (input.startsWith('/')) return;
                cashName = input;
            } else {
                return;
            }

            ctx.wizard.state.data.name = cashName;
            ctx.wizard.state.data.symbol = null;
            ctx.wizard.state.data.autoVerify = false;
            ctx.wizard.state.data.methodType = 'cash';

            ctx.wizard.state.lastQuestion = `Alles klar: *${cashName}*.\n\n` +
                'Möchtest du eine kurze Anweisung oder einen Hinweis für den Kunden hinterlegen?\n' +
                '(z.B. _"Bitte passend in bar bereithalten. Treffpunkt wird nach Bestellung abgestimmt."_)\n\n' +
                'Falls kein gesonderter Hinweis nötig ist, klicke auf "Überspringen".';

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

        if (isAutoCrypto) {
            if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('coin_')) {
                const coin = ctx.callbackQuery.data.replace('coin_', '');
                ctx.answerCbQuery().catch(() => {});

                ctx.wizard.state.data.symbol = coin;
                ctx.wizard.state.data.name = COIN_NAMES[coin] || `${coin} (Auto-Verify)`;
                ctx.wizard.state.data.autoVerify = true;
                ctx.wizard.state.data.methodType = 'crypto';

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

            const isDetectedCash = paymentRepo.isCashMethod({ name: input });
            ctx.wizard.state.data.name = input;
            ctx.wizard.state.data.methodType = isDetectedCash ? 'cash' : 'manual';
            ctx.wizard.state.data.symbol = isDetectedCash ? null : null;
            ctx.wizard.state.data.autoVerify = false;

            ctx.wizard.state.lastQuestion = `Alles klar: *${input}*.\n\nBitte sende mir jetzt die **Zahlungsadresse oder Instruktion** (Wallet-ID, E-Mail, Bankverbindung oder Abhol-Info).\n\nFalls keine Adresse nötig ist, klicke auf "Überspringen".`;

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
        const methodType = ctx.wizard.state.data.methodType || (ctx.wizard.state.data.isCash ? 'cash' : 'manual');
        const isCash = methodType === 'cash' || paymentRepo.isCashMethod({ name, method_type: methodType });
        const symbol = isCash ? null : (ctx.wizard.state.data.symbol || null);
        const autoVerify = isCash ? false : (ctx.wizard.state.data.autoVerify || false);

        try {
            await paymentRepo.addPaymentMethod(name, address, symbol, autoVerify, isCash ? 'cash' : methodType);
            await cleanup(ctx);
            
            let savedMsg = '';
            if (isCash) {
                savedMsg = `✅ *Barzahlung erfolgreich eingerichtet!*\n\n` +
                    `💵 *Name:* ${name}\n` +
                    (address ? `📝 *Kundenhinweis:* ${address}\n` : '') +
                    `\nℹ️ *Info:* Diese Zahlungsart wird Kunden bei physischen Artikeln angeboten. Für physische Waren wird *automatisch kein Krypto* angeboten.`;
            } else {
                savedMsg = texts.getPaymentSaved(name, address);
                if (autoVerify) {
                    savedMsg += `\n\n⚡ *Automatische Blockchain-Erkennung AKTIV für ${symbol}!*`;
                }
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

addPaymentMethodScene.action('cash_name_default', async (ctx) => {
    return ctx.wizard.steps[ctx.wizard.cursor](ctx);
});

module.exports = addPaymentMethodScene;
