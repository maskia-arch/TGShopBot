const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const askQuantityScene = new Scenes.WizardScene(
    'askQuantityScene',
    async (ctx) => {
        ctx.wizard.state.productId = ctx.scene.state.productId;
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '🔢 *Menge wählen*\nBitte gib die gewünschte Menge als Zahl ein:';

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
            await uiHelper.sendTemporary(ctx, 'Vorgang abgebrochen.', 2);
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;
        
        const text = ctx.message.text;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (text.startsWith('/')) {
            try { await ctx.deleteMessage(); } catch (e) {}
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, eine Menge auszuwählen.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            
            return;
        }

        const quantity = parseInt(text, 10);

        if (isNaN(quantity) || quantity <= 0) {
            ctx.wizard.state.lastQuestion = '⚠️ Bitte gib eine gültige Zahl ein (z.B. 5):';
            const errorMsg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(errorMsg.message_id);
            
            return;
        }

        try {
            const productId = ctx.wizard.state.productId;
            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            
            await cartRepo.addToCart(ctx.from.id, productId, quantity, username);

            await cleanup(ctx);
            
            await ctx.reply(`✅ *${quantity}x zum Warenkorb hinzugefügt!*\n\nWie möchtest du fortfahren?`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }],
                        [{ text: '🔙 Zurück zum Produkt', callback_data: `product_${productId}` }],
                        [{ text: '🛍 Shop-Menü', callback_data: 'shop_menu' }]
                    ]
                }
            });

        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '❌ Fehler beim Hinzufügen', 3);
        }

        return ctx.scene.leave();
    }
);

module.exports = askQuantityScene;
