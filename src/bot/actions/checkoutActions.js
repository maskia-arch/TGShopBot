const cartRepo = require('../../database/repositories/cartRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const uiHelper = require('../../utils/uiHelper');
const notificationService = require('../../services/notificationService');
const formatters = require('../../utils/formatters');
const texts = require('../../utils/texts');

module.exports = (bot) => {
    bot.action('checkout', async (ctx) => {
        // Sofort quittieren, da nun DB-Abfragen für Cart und Payments folgen
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            
            // Abfragen parallelisieren
            const [cart, paymentMethods] = await Promise.all([
                cartRepo.getCart(userId),
                paymentRepo.getActivePaymentMethods()
            ]);

            if (!cart || cart.length === 0) {
                return uiHelper.updateOrSend(ctx, texts.getCartEmptyText(), {
                    inline_keyboard: [[{ text: 'Zurück zum Shop', callback_data: 'shop_menu' }]]
                });
            }

            if (!paymentMethods || paymentMethods.length === 0) {
                // Details für manuelle Abwicklung laden
                const [cartTotal, orderDetails] = await Promise.all([
                    cartRepo.getCartTotal(userId),
                    cartRepo.getCartDetails(userId)
                ]);
                
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

            await uiHelper.updateOrSend(ctx, texts.getCheckoutSelectPayment(), { 
                inline_keyboard: keyboard 
            });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('confirm_manual', async (ctx) => {
        // Hier kein sofortiges answerCbQuery, damit der User merkt, dass die Bestellung verarbeitet wird (Sicherheit)
        try {
            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name;
            
            const [orderDetails, cartTotal] = await Promise.all([
                cartRepo.getCartDetails(userId),
                cartRepo.getCartTotal(userId)
            ]);
            
            await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails);

            await notificationService.notifyAdminsNewOrder({
                userId,
                username,
                orderDetails,
                paymentId: 'MANUAL'
            });

            await cartRepo.clearCart(userId);
            
            // Jetzt bestätigen
            ctx.answerCbQuery('✅ Bestellung aufgegeben').catch(() => {});

            const text = '🎉 *Vielen Dank für deine Bestellung!*\n\nDeine Anfrage wurde übermittelt. Ein Admin wird dich in Kürze kontaktieren, um die Zahlung privat zu klären.';
            const keyboard = [[{ text: '🏠 Zum Hauptmenü', callback_data: 'back_to_main' }]];

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('❌ Fehler bei der Bestellung').catch(() => {});
        }
    });

    bot.action(/^payment_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const paymentId = ctx.match[1];
            const userId = ctx.from.id;
            
            const [cartTotal, orderDetails, paymentMethod] = await Promise.all([
                cartRepo.getCartTotal(userId),
                cartRepo.getCartDetails(userId),
                paymentRepo.getPaymentMethod(paymentId)
            ]);

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
        // Bei finalen Klicks lassen wir die Sanduhr kurz laufen, während die Order in die DB geschrieben wird
        try {
            const paymentId = ctx.match[1];
            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name;
            
            const [cartTotal, orderDetails, paymentMethod] = await Promise.all([
                cartRepo.getCartTotal(userId),
                cartRepo.getCartDetails(userId),
                paymentRepo.getPaymentMethod(paymentId)
            ]);
            
            await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails);

            await notificationService.notifyAdminsNewOrder({
                userId,
                username,
                orderDetails,
                paymentId
            });

            await cartRepo.clearCart(userId);
            
            ctx.answerCbQuery('✅ Bestellung erfolgreich').catch(() => {});

            const text = texts.getCheckoutFinalInstructions(
                paymentMethod.name, 
                paymentMethod.wallet_address, 
                `${cartTotal}€`
            ) + '\n\nEin Admin wird deine Zahlung prüfen und sich schnellstmöglich bei dir melden.';
            
            const keyboard = [[{ text: '🏠 Zum Hauptmenü', callback_data: 'back_to_main' }]];

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('❌ Fehler beim Abschluss').catch(() => {});
        }
    });
};
