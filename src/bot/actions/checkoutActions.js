const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');

module.exports = (bot) => {
    bot.action('checkout', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const cart = await cartRepo.getCart(userId);

            if (!cart || cart.length === 0) {
                return uiHelper.updateOrSend(ctx, texts.getCartEmptyText(), {
                    inline_keyboard: [[{ text: '🔙 Zurück zum Shop', callback_data: 'shop_menu' }]]
                });
            }

            await ctx.scene.enter('checkoutScene');
        } catch (error) {
            console.error('Checkout Error:', error.message);
        }
    });
};
