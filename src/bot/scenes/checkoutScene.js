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
    return /^https?:\/\/(www\.)?privnote\.com\/[^\s]+/i.test(text.trim());
};

const cancelCheckout = async (ctx) => {
    await ctx.reply(texts.getActionCanceled());
    return ctx.scene.leave();
};

// ════════════════════════════════════════════
// CHECKOUT SCENE - State Machine in 2 Wizard Steps
// ════════════════════════════════════════════

const checkoutScene = new Scenes.WizardScene(
    'checkoutScene',

    // ── STEP 0: Init ──
    async (ctx) => {
        ctx.wizard.state.shippingLink = null;
        ctx.wizard.state.paymentId = null;
        ctx.wizard.state.paymentMethod = null;
        ctx.wizard.state.deliveryMethod = null;
        ctx.wizard.state.cartTotal = null;
        ctx.wizard.state.orderDetails = null;
        ctx.wizard.state.phase = 'init';

        try {
            const userId = ctx.from.id;
            const cart = await cartRepo.getCartDetails(userId);

            if (!cart || cart.length === 0) {
                await ctx.reply(texts.getCartEmptyText(), { parse_mode: 'Markdown' });
                return ctx.scene.leave();
            }

            // Lieferoptionen bestimmen
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

            ctx.wizard.state.cartTotal = await cartRepo.getCartTotal(userId);
            ctx.wizard.state.orderDetails = cart;

            if (hasShipping && hasPickup) {
                ctx.wizard.state.phase = 'delivery_choice';
                await ctx.reply(texts.getDeliveryChoicePrompt(), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚚 Versand', callback_data: 'co_delivery_shipping' }],
                            [{ text: '🏪 Abholung', callback_data: 'co_delivery_pickup' }],
                            [{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]
                        ]
                    }
                });
            } else if (hasShipping) {
                ctx.wizard.state.deliveryMethod = 'shipping';
                ctx.wizard.state.phase = 'shipping_address';
                await ctx.reply(texts.getShippingAddressPrompt(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]] }
                });
            } else if (hasPickup) {
                ctx.wizard.state.deliveryMethod = 'pickup';
                await showPaymentSelection(ctx);
            } else {
                await showPaymentSelection(ctx);
            }

            return ctx.wizard.next();
        } catch (error) {
            console.error('Checkout Init Error:', error.message);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    },

    // ── STEP 1: Universal Handler ──
    async (ctx) => {
        const phase = ctx.wizard.state.phase;

        // ── CALLBACK ──
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            ctx.answerCbQuery().catch(() => {});

            if (data === 'co_cancel') return cancelCheckout(ctx);

            // Lieferwahl
            if (data === 'co_delivery_shipping' && phase === 'delivery_choice') {
                ctx.wizard.state.deliveryMethod = 'shipping';
                ctx.wizard.state.phase = 'shipping_address';
                await ctx.reply(texts.getShippingAddressPrompt(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]] }
                });
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
                    ctx.wizard.state.paymentMethod = paymentMethod;

                    const invoiceText = formatters.formatInvoice(
                        ctx.wizard.state.orderDetails,
                        ctx.wizard.state.cartTotal,
                        paymentMethod
                    ) + '\n\n*Möchtest du den Kauf zahlungspflichtig abschließen?*';

                    await ctx.reply(invoiceText, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Bestellung abschicken', callback_data: 'co_finalize' }],
                                [{ text: '🔙 Andere Zahlungsart', callback_data: 'co_back_payment' }],
                                [{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]
                            ]
                        }
                    });
                    ctx.wizard.state.phase = 'payment_confirm';
                } catch (error) {
                    console.error('Payment Method Error:', error.message);
                    await ctx.reply(texts.getGeneralError());
                    return ctx.scene.leave();
                }
                return;
            }

            // Manuelle Bestellung bestätigen
            if (data === 'co_confirm_manual' && phase === 'payment_confirm') {
                return await finalizeOrder(ctx);
            }

            // Bestellung finalisieren
            if (data === 'co_finalize' && phase === 'payment_confirm') {
                return await finalizeOrder(ctx);
            }

            // Zurück zur Zahlungsauswahl
            if (data === 'co_back_payment') {
                await showPaymentSelection(ctx);
                return;
            }

            return;
        }

        // ── TEXT ──
        if (ctx.message && ctx.message.text) {
            const input = ctx.message.text.trim();
            if (input.startsWith('/')) return;

            if (phase === 'shipping_address') {
                if (isPrivnoteLink(input)) {
                    ctx.wizard.state.shippingLink = input;
                    await showPaymentSelection(ctx);
                    return;
                }

                // Klartext löschen + Warnung
                ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
                await ctx.reply(texts.getShippingPlaintextWarning(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]] }
                });
                return;
            }
        }
    }
);

// ── Zahlungsauswahl ──
async function showPaymentSelection(ctx) {
    try {
        const paymentMethods = await paymentRepo.getActivePaymentMethods();

        if (!paymentMethods || paymentMethods.length === 0) {
            const text = 'ℹ️ *Manuelle Zahlungsabwicklung*\n\n' +
                `💰 *Gesamtsumme: ${formatters.formatPrice(ctx.wizard.state.cartTotal)}*\n\n` +
                'Keine automatischen Zahlungsdaten hinterlegt.\n\n*Bestellung jetzt abschicken?*';

            await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Kaufpflichtig bestellen', callback_data: 'co_confirm_manual' }],
                        [{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]
                    ]
                }
            });
            ctx.wizard.state.phase = 'payment_confirm';
            return;
        }

        const keyboard = paymentMethods.map(pm => ([{
            text: pm.name,
            callback_data: `co_pay_${pm.id}`
        }]));
        keyboard.push([{ text: '❌ Abbrechen', callback_data: 'co_cancel' }]);

        await ctx.reply(texts.getCheckoutSelectPayment(), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        ctx.wizard.state.phase = 'payment_select';
    } catch (error) {
        console.error('Payment Select Error:', error.message);
        await ctx.reply(texts.getGeneralError());
        return ctx.scene.leave();
    }
}

// ── Order finalisieren + Receipt an Kunden ──
async function finalizeOrder(ctx) {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
        const cartTotal = ctx.wizard.state.cartTotal;
        const orderDetails = ctx.wizard.state.orderDetails;

        if (!orderDetails || orderDetails.length === 0) {
            await ctx.reply(texts.getCartEmptyText(), { parse_mode: 'Markdown' });
            return ctx.scene.leave();
        }

        let paymentMethodName = 'Manuelle Abwicklung';
        let walletAddress = null;
        if (ctx.wizard.state.paymentId && ctx.wizard.state.paymentMethod) {
            paymentMethodName = ctx.wizard.state.paymentMethod.name;
            walletAddress = ctx.wizard.state.paymentMethod.wallet_address;
        }

        const deliveryMethod = ctx.wizard.state.deliveryMethod;

        const order = await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails, {
            shippingLink: ctx.wizard.state.shippingLink,
            paymentMethodId: ctx.wizard.state.paymentId,
            paymentMethodName: paymentMethodName,
            deliveryMethod: deliveryMethod
        });

        await cartRepo.clearCart(userId);

        // ── KUNDEN-RECEIPT (bleibt bestehen, wird NICHT gelöscht) ──
        const receiptText = texts.getCustomerInvoice({
            orderId: order.order_id,
            total: parseFloat(cartTotal).toFixed(2),
            paymentName: paymentMethodName,
            walletAddress: walletAddress,
            deliveryMethod: deliveryMethod
        });

        const receiptKeyboard = {
            inline_keyboard: [
                [{ text: '💸 Zahlung bestätigen', callback_data: `confirm_pay_${order.order_id}` }],
                [{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]
            ]
        };

        // Sende Receipt als neue Nachricht (persistent!)
        await ctx.reply(receiptText, {
            parse_mode: 'Markdown',
            reply_markup: receiptKeyboard
        });

        // ── ADMIN-BENACHRICHTIGUNG ──
        notificationService.notifyAdminsNewOrder({
            userId, username, orderDetails,
            total: parseFloat(cartTotal).toFixed(2),
            paymentId: ctx.wizard.state.paymentId || 'MANUAL',
            paymentName: paymentMethodName,
            orderId: order.order_id,
            shippingLink: ctx.wizard.state.shippingLink,
            deliveryMethod
        }).catch(() => {});

        return ctx.scene.leave();
    } catch (error) {
        console.error('Finalize Order Error:', error.message);
        await ctx.reply(texts.getGeneralError());
        return ctx.scene.leave();
    }
}

// Global Cancel
checkoutScene.action('co_cancel', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return cancelCheckout(ctx);
});

module.exports = checkoutScene;
