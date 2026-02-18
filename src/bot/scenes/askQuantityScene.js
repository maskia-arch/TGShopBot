const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');

const askQuantityScene = new Scenes.WizardScene(
    'askQuantityScene',
    async (ctx) => {
        ctx.wizard.state.productId = ctx.scene.state.productId;
        await ctx.reply('Bitte gib die gewünschte Menge als Zahl ein (z.B. 2):', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Abbrechen', callback_data: 'cancel_scene' }]]
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery();
            await uiHelper.updateOrSend(ctx, 'Vorgang abgebrochen.', {
                inline_keyboard: [[{ text: 'Zurück zum Shop', callback_data: 'shop_menu' }]]
            });
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;

        const quantity = parseInt(ctx.message.text, 10);

        if (isNaN(quantity) || quantity <= 0) {
            await ctx.reply('Ungültige Eingabe. Bitte gib eine gültige Zahl größer als 0 ein:');
            return;
        }

        try {
            const productId = ctx.wizard.state.productId;
            await cartRepo.addToCart(ctx.from.id, productId, quantity);

            const keyboard = [
                [{ text: '🛍️ Weiter einkaufen', callback_data: 'shop_menu' }],
                [{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]
            ];

            await ctx.reply('Erfolgreich zum Warenkorb hinzugefügt.', {
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error(error.message);
            await ctx.reply('Es gab einen Fehler beim Hinzufügen zum Warenkorb.');
        }

        return ctx.scene.leave();
    }
);

module.exports = askQuantityScene;
