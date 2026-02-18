const cartRepo = require('../../database/repositories/cartRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const uiHelper = require('../../utils/uiHelper');
const notificationService = require('../../services/notificationService');
const formatters = require('../../utils/formatters');

module.exports = (bot) => {
    bot.action('checkout', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const cart = await cartRepo.getCart(userId);

            if (!cart || cart.length === 0) {
                return uiHelper.updateOrSend(ctx, 'Dein Warenkorb ist leer.', {
                    inline_keyboard: [[{ text: 'Zurück zum Shop', callback_data: 'shop_menu' }]]
                });
            }

            const paymentMethods = await paymentRepo.getActivePaymentMethods();

            if (!paymentMethods || paymentMethods.length === 0) {
                const cartTotal = await cartRepo.getCartTotal(userId);
                const orderDetails = await cartRepo.getCartDetails(userId);
                
                const manualMethod = { name: 'Privat-Chat / Manuelle Abwicklung', wallet_address: null };
                
                const text = "ℹ️ *Manuelle Zahlungsabwicklung*\n\n" +
                             formatters.formatInvoice(orderDetails, cartTotal, manualMethod) + 
                             '\n\nEs sind keine automatischen Zahlungsdaten hinterlegt. Die Details klären wir persönlich im Chat.\n\n*Bestellung jetzt abschicken?*';
                
                const keyboard = [
                    [{ text: '✅ Kaufpflichtig bestellen', callback_data: 'confirm_manual' }],
                    [{ text: '🔙 Zurück zum Warenkorb', callback_data: 'cart_view' }]
                ];
                
                return uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
            }

            const keyboard = paymentMethods.map(pm => ([{
                text: pm.name,
                callback_data: `payment_${pm.id}`
            }]));
            
            keyboard.push([{ text: '❌ Abbrechen', callback_data: 'cart_view' }]);

            await uiHelper.updateOrSend(ctx, '💳 *Bezahlvorgang*\nBitte wähle deine bevorzugte Zahlungsmethode:', { 
                inline_keyboard: keyboard 
            });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('confirm_manual', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name;
            const orderDetails = await cartRepo.getCartDetails(userId);
            const cartTotal = await cartRepo.getCartTotal(userId);
            
            await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails);

            await notificationService.notifyAdminsNewOrder({
                userId,
                username,
                orderDetails,
                paymentId: 'MANUAL'
            });

            await cartRepo.clearCart(userId);

            const text = '🎉 *Vielen Dank für deine Bestellung!*\n\nDeine Anfrage wurde übermittelt. Ein Admin wird dich in Kürze kontaktieren, um die Zahlung privat zu klären.';
            const keyboard = [[{ text: '🏠 Zum Hauptmenü', callback_data: 'shop_menu' }]];

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^payment_(.+)$/, async (ctx) => {
        try {
            const paymentId = ctx.match[1];
            const userId = ctx.from.id;
            
            const cartTotal = await cartRepo.getCartTotal(userId);
            const orderDetails = await cartRepo.getCartDetails(userId);
            const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);

            const text = formatters.formatInvoice(orderDetails, cartTotal, paymentMethod) + 
                         '\n\n*Möchtest du den Kauf nun zahlungspflichtig abschließen?*';
            
            const keyboard = [
                [{ text: '✅ Bestellung abschicken', callback_data: `confirm_${paymentId}` }],
                [{ text: '🔙 Zurück zur Auswahl', callback_data: 'checkout' }]
            ];

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^confirm_(.+)$/, async (ctx) => {
        try {
            const paymentId = ctx.match[1];
            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name;
            
            const cartTotal = await cartRepo.getCartTotal(userId);
            const orderDetails = await cartRepo.getCartDetails(userId);
            const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);
            
            await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails);

            await notificationService.notifyAdminsNewOrder({
                userId,
                username,
                orderDetails,
                paymentId
            });

            await cartRepo.clearCart(userId);

            let text = '🎉 *Vielen Dank für deine Bestellung!*\n\n';
            
            if (paymentMethod && paymentMethod.wallet_address) {
                text += `Bitte sende den Betrag an folgende Adresse:\n\n` +
                        `📍 *${paymentMethod.name} Adresse:*\n` +
                        `\`${paymentMethod.wallet_address}\`\n\n` +
                        `_Tippe auf die Adresse, um sie zu kopieren._\n\n`;
            }

            text += 'Ein Admin wird deine Zahlung prüfen und sich schnellstmöglich bei dir melden.';
            
            const keyboard = [[{ text: '🏠 Zum Hauptmenü', callback_data: 'shop_menu' }]];

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });
};
