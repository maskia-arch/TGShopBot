const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');

module.exports = (bot) => {
    bot.action('cart_view', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const cartItems = await cartRepo.getCartDetails(userId);
            
            if (!cartItems || cartItems.length === 0) {
                return uiHelper.updateOrSend(ctx, '🛒 *Dein Warenkorb ist aktuell leer.*', {
                    inline_keyboard: [[{ text: '🔙 Zurück zum Shop', callback_data: 'shop_menu' }]]
                });
            }

            let text = '🛒 *Dein Warenkorb*\n\n';
            let total = 0;
            const keyboard = [];

            cartItems.forEach((item, index) => {
                text += `${index + 1}. *${item.name}*\n`;
                text += `Menge: ${item.quantity} | Preis: ${item.total}€\n\n`;
                total += parseFloat(item.total);
                keyboard.push([{ text: `❌ ${item.name} entfernen`, callback_data: `remove_item_${item.id}` }]);
            });

            text += `💰 *Gesamtsumme: ${total.toFixed(2)}€*`;

            keyboard.push([{ text: '💳 Zur Kasse gehen', callback_data: 'checkout' }]);
            keyboard.push([{ text: '🗑 Kompletten Warenkorb leeren', callback_data: 'clear_cart' }]);
            keyboard.push([{ text: '🛍 Weiter einkaufen', callback_data: 'shop_menu' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^remove_item_(.+)$/, async (ctx) => {
        try {
            const cartId = ctx.match[1];
            await cartRepo.removeFromCart(cartId);
            await ctx.answerCbQuery('Artikel entfernt!');
            
            ctx.match = null;
            bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'cart_view' } });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('clear_cart', async (ctx) => {
        try {
            await cartRepo.clearCart(ctx.from.id);
            await ctx.answerCbQuery('Warenkorb geleert!');
            await uiHelper.updateOrSend(ctx, '🛒 *Dein Warenkorb ist nun leer.*', {
                inline_keyboard: [[{ text: '🔙 Zurück zum Shop', callback_data: 'shop_menu' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });
};
