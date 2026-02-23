const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');
const texts = require('../../utils/texts');

const isPrivnoteLink = (text) => {
    const trimmed = text.trim();
    return /^https?:\/\/(www\.)?privnote\.com\/[^\s]+/i.test(trimmed);
};

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const cancelCheckout = async (ctx) => {
    await cleanup(ctx);
    await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
    return ctx.scene.leave();
};

// ── Helper: Zahlungsauswahl anzeigen ──
async function showPaymentSelection(ctx) {
    try {
        const userId = ctx.from.id;
        const [cartTotal, orderDetails, paymentMethods] = await Promise.all([
            cartRepo.getCartTotal(userId),
            cartRepo.getCartDetails(userId),
            paymentRepo.getActivePaymentMethods()
        ]);

        ctx.wizard.state.cartTotal = cartTotal;
        ctx.wizard.state.orderDetails = orderDetails;

        if (!paymentMethods || paymentMethods.length === 0) {
            const manualMethod = { name: 'Manuelle Abwicklung', wallet_address: null };
            const text = "ℹ️ *Manuelle Zahlungsabwicklung*\n\n" +
                formatters.formatInvoice(orderDetails, cartTotal, manualMethod) +
                '\n\nKeine automatischen Zahlungsdaten hinterlegt.\n\n*Bestellung jetzt abschicken?*';

            const msg = await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Kaufpflichtig bestellen', callback_data: 'co_confirm_manual' }],
                        [{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]
                    ]
                }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            // Setze Phase auf payment_confirm
            ctx.wizard.state.phase = 'payment_confirm';
            return;
        }

        const keyboard = paymentMethods.map(pm => ([{
            text: pm.name,
            callback_data: `co_pay_${pm.id}`
        }]));
        keyboard.push([{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]);

        const msg = await ctx.reply(texts.getCheckoutSelectPayment(), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        ctx.wizard.state.phase = 'payment_select';
    } catch (error) {
        console.error('Payment Select Error:', error.message);
        await ctx.reply(texts.getGeneralError());
        return ctx.scene.leave();
    }
}

// ── Helper: Order finalisieren ──
async function finalizeOrder(ctx) {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');

        const [cartTotal, orderDetails] = await Promise.all([
            cartRepo.getCartTotal(userId),
            cartRepo.getCartDetails(userId)
        ]);

        if (!orderDetails || orderDetails.length === 0) {
            await ctx.reply(texts.getCartEmptyText(), { parse_mode: 'Markdown' });
            return ctx.scene.leave();
        }

        let paymentMethodName = 'Manuelle Abwicklung';
        if (ctx.wizard.state.paymentId) {
            try {
                const pm = await paymentRepo.getPaymentMethod(ctx.wizard.state.paymentId);
                if (pm) paymentMethodName = pm.name;
            } catch (e) {}
        }

        const order = await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails, {
            shippingLink: ctx.wizard.state.shippingLink,
            paymentLink: ctx.wizard.state.paymentLink,
            paymentMethodId: ctx.wizard.state.paymentId,
            paymentMethodName: paymentMethodName,
            deliveryMethod: ctx.wizard.state.deliveryMethod
        });

        await cartRepo.clearCart(userId);
        await cleanup(ctx);

        const deliveryMethod = ctx.wizard.state.deliveryMethod;

        notificationService.sendOrderReceipt(userId, {
            orderId: order.order_id,
            total: parseFloat(cartTotal).toFixed(2),
            paymentName: paymentMethodName,
            status: 'Offen',
            deliveryMethod
        }).catch(() => {});

        notificationService.notifyAdminsNewOrder({
            userId, username, orderDetails,
            paymentId: ctx.wizard.state.paymentId || 'MANUAL',
            orderId: order.order_id,
            shippingLink: ctx.wizard.state.shippingLink,
            deliveryMethod
        }).catch(() => {});

        let text = `🎉 *Vielen Dank für deine Bestellung!*\n\n📋 *Order-ID:* /orderid ${order.order_id}\n`;
        if (deliveryMethod === 'pickup') text += `🏪 Lieferung: *Abholung*\n`;
        else if (deliveryMethod === 'shipping') text += `🚚 Lieferung: *Versand*\n`;
        text += `\nDu kannst den Status unter "Meine Bestellungen" verfolgen.`;

        await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }],
                    [{ text: '🏠 Hauptmenü', callback_data: 'back_to_main' }]
                ]
            }
        });

        return ctx.scene.leave();
    } catch (error) {
        console.error('Finalize Order Error:', error.message);
        await ctx.reply(texts.getGeneralError());
        return ctx.scene.leave();
    }
}

// ════════════════════════════════════════════
// CHECKOUT SCENE - Single-Step State Machine
// ════════════════════════════════════════════

const checkoutScene = new Scenes.WizardScene(
    'checkoutScene',

    // ── STEP 0: Init & Lieferoption bestimmen ──
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.shippingLink = null;
        ctx.wizard.state.paymentId = null;
        ctx.wizard.state.paymentLink = null;
        ctx.wizard.state.deliveryMethod = null;
        ctx.wizard.state.phase = 'init';

        try {
            const userId = ctx.from.id;
            const cart = await cartRepo.getCartDetails(userId);

            if (!cart || cart.length === 0) {
                await ctx.reply(texts.getCartEmptyText(), { parse_mode: 'Markdown' });
                return ctx.scene.leave();
            }

            // Lieferoptionen der Produkte im Warenkorb bestimmen
            let hasShipping = false;
            let hasPickup = false;

            for (const item of cart) {
                const product = await productRepo.getProductById(item.product_id || item.id);
                if (product) {
                    const opt = product.delivery_option || 'none';
                    if (opt === 'shipping' || opt === 'both') hasShipping = true;
                    if (opt === 'pickup' || opt === 'both') hasPickup = true;
                }
            }

            if (hasShipping && hasPickup) {
                // Kunde muss wählen: Versand oder Abholung
                const msg = await ctx.reply(texts.getDeliveryChoicePrompt(), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚚 Versand', callback_data: 'co_delivery_shipping' }],
                            [{ text: '🏪 Abholung', callback_data: 'co_delivery_pickup' }],
                            [{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]
                        ]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
                ctx.wizard.state.phase = 'delivery_choice';
            } else if (hasShipping) {
                // Nur Versand → Adresse abfragen
                ctx.wizard.state.deliveryMethod = 'shipping';
                ctx.wizard.state.phase = 'shipping_address';
                const msg = await ctx.reply(texts.getShippingAddressPrompt(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]] }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
            } else if (hasPickup) {
                // Nur Abholung → direkt zur Zahlung
                ctx.wizard.state.deliveryMethod = 'pickup';
                await showPaymentSelection(ctx);
            } else {
                // Kein Versand/Abholung → direkt zur Zahlung
                await showPaymentSelection(ctx);
            }

            return ctx.wizard.next();
        } catch (error) {
            console.error('Checkout Init Error:', error.message);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    },

    // ── STEP 1: Universal Handler (State Machine) ──
    async (ctx) => {
        const phase = ctx.wizard.state.phase;

        // ── CALLBACK QUERY ──
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            ctx.answerCbQuery().catch(() => {});

            if (data === 'co_cancel') return cancelCheckout(ctx);

            // Lieferwahl
            if (data === 'co_delivery_shipping' && phase === 'delivery_choice') {
                ctx.wizard.state.deliveryMethod = 'shipping';
                ctx.wizard.state.phase = 'shipping_address';
                const msg = await ctx.reply(texts.getShippingAddressPrompt(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]] }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
                return;
            }

            if (data === 'co_delivery_pickup' && phase === 'delivery_choice') {
                ctx.wizard.state.deliveryMethod = 'pickup';
                await showPaymentSelection(ctx);
                return;
            }

            // Zahlungsauswahl
            if (data.startsWith('co_pay_') && phase === 'payment_select') {
                const paymentId = data.replace('co_pay_', '');
                ctx.wizard.state.paymentId = paymentId;

                try {
                    const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);
                    ctx.wizard.state.paymentMethodName = paymentMethod.name;

                    const invoiceText = formatters.formatInvoice(
                        ctx.wizard.state.orderDetails,
                        ctx.wizard.state.cartTotal,
                        paymentMethod
                    ) + '\n\n*Möchtest du den Kauf zahlungspflichtig abschließen?*';

                    const keyboard = [
                        [{ text: '✅ Bestellung abschicken', callback_data: 'co_finalize' }],
                        [{ text: '🔙 Andere Zahlungsart', callback_data: 'co_back_payment' }],
                        [{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]
                    ];

                    const msg = await ctx.reply(invoiceText, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    ctx.wizard.state.messagesToDelete.push(msg.message_id);
                    ctx.wizard.state.phase = 'payment_confirm';
                } catch (error) {
                    console.error('Payment Method Error:', error.message);
                    await ctx.reply(texts.getGeneralError());
                    return ctx.scene.leave();
                }
                return;
            }

            // Manuelle Bestellung
            if (data === 'co_confirm_manual' && phase === 'payment_confirm') {
                return await finalizeOrder(ctx);
            }

            // Finalisierung
            if (data === 'co_finalize' && phase === 'payment_confirm') {
                return await finalizeOrder(ctx);
            }

            // Zurück zur Zahlungsauswahl
            if (data === 'co_back_payment') {
                await showPaymentSelection(ctx);
                return;
            }

            return; // Unbekannter Callback
        }

        // ── TEXT-EINGABE ──
        if (ctx.message && ctx.message.text) {
            const input = ctx.message.text.trim();
            ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

            if (input.startsWith('/')) return; // Befehle ignorieren

            // Versandadresse (Privnote-Link)
            if (phase === 'shipping_address') {
                if (isPrivnoteLink(input)) {
                    ctx.wizard.state.shippingLink = input;
                    await showPaymentSelection(ctx);
                    return;
                }

                // Klartext → Warnung
                const msg = await ctx.reply(texts.getShippingPlaintextWarning(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]] }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);

                // Klartext-Nachricht löschen
                ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
                return;
            }
        }
    }
);

// ── Global Cancel Handler ──
checkoutScene.action('co_cancel', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return cancelCheckout(ctx);
});

module.exports = checkoutScene;
