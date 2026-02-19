const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');

module.exports = (bot) => {
    bot.action('cart_view', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        
        try {
            const userId = ctx.from.id;
            
            const [cartItems, cartTotal] = await Promise.all([
                cartRepo.getCartDetails(userId),
                cartRepo.getCartTotal(userId)
            ]);
            
            if (!cartItems || cartItems.length === 0) {
                return uiHelper.updateOrSend(ctx, texts.getCartEmptyText(), {
                    inline_keyboard: [[{ text: '🔙 Zurück zum Shop', callback_data: 'shop_menu' }]]
                });
            }

            let text = texts.getCartContentHeader() + '\n\n';
            const keyboard = [];

            cartItems.forEach((item, index) => {
                text += `${index + 1}. *${item.name}*\n`;
                text += `Menge: ${item.quantity} | Preis: ${parseFloat(item.total).toFixed(2)}€\n\n`;
                keyboard.push([{ text: `❌ ${item.name} entfernen`, callback_data: `remove_item_${item.id}` }]);
            });

            text += `💰 *Gesamtsumme: ${parseFloat(cartTotal).toFixed(2)}€*`;

            keyboard.push([{ text: '💳 Zur Kasse gehen', callback_data: 'checkout' }]);
            keyboard.push([{ text: '🗑 Kompletten Warenkorb leeren', callback_data: 'clear_cart' }]);
            keyboard.push([{ text: '🛍 Weiter einkaufen', callback_data: 'shop_menu' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Cart View Error:', error.message);
        }
    });

    bot.action(/^remove_item_(.+)$/, async (ctx) => {
        try {
            const cartId = ctx.match[1];
            await cartRepo.removeFromCart(cartId);
            
            ctx.answerCbQuery('🗑 Artikel entfernt!').catch(() => {});
            
            ctx.match = null;
            ctx.update.callback_query.data = 'cart_view';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Cart Remove Error:', error.message);
            ctx.answerCbQuery('❌ Fehler beim Entfernen', { show_alert: true }).catch(() => {});
        }
    });

    bot.action('clear_cart', async (ctx) => {
        try {
            await cartRepo.clearCart(ctx.from.id);
            
            ctx.answerCbQuery('🧹 Warenkorb geleert!').catch(() => {});
            
            await uiHelper.updateOrSend(ctx, texts.getCartEmptyText(), {
                inline_keyboard: [[{ text: '🔙 Zurück zum Shop', callback_data: 'shop_menu' }]]
            });
        } catch (error) {
            console.error('Cart Clear Error:', error.message);
            ctx.answerCbQuery('❌ Fehler beim Leeren', { show_alert: true }).catch(() => {});
        }
    });
};
