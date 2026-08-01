const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
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

const askQuantityScene = new Scenes.WizardScene(
    'askQuantityScene',
    async (ctx) => {
        ctx.wizard.state.productId = ctx.scene.state.productId;
        ctx.wizard.state.categoryPath = ctx.scene.state.categoryPath || null;
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '🔢 *Menge wählen*\n\nBitte gib die gewünschte Menge als Zahl ein:';

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
            
            const productId = ctx.wizard.state.productId;
            ctx.update.callback_query = { data: `product_${productId}`, from: ctx.from };
            
            return ctx.scene.leave();
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

        const quantity = parseInt(input, 10);

        if (isNaN(quantity) || quantity <= 0) {
            const errorMsg = await ctx.reply('⚠️ Bitte gib eine gültige Zahl ein (z.B. 5):', {
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(errorMsg.message_id);
            return;
        }

        try {
            const productId = ctx.wizard.state.productId;
            const categoryPath = ctx.wizard.state.categoryPath;
            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            
            await cartRepo.addToCart(ctx.from.id, productId, quantity, username, categoryPath);
            await cleanup(ctx);
            
            await ctx.reply(`✅ *${quantity}x zum Warenkorb hinzugefügt!*`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }],
                        [{ text: '🛍 Weiter einkaufen', callback_data: 'shop_menu' }]
                    ]
                }
            });

            return ctx.scene.leave();
        } catch (error) {
            console.error('AskQuantity Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

askQuantityScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    await cleanup(ctx);
    await ctx.scene.leave();
});

module.exports = askQuantityScene;
