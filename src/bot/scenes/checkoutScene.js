const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');
const texts = require('../../utils/texts');

const PRIVNOTE_REGEX = /^https?:\/\/(www\.)?privnote\.com\/.+$/i;

const isPrivnoteLink = (text) => PRIVNOTE_REGEX.test(text.trim());
const isUrl = (text) => /^https?:\/\/.+/i.test(text.trim());

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

const checkoutScene = new Scenes.WizardScene(
    'checkoutScene',

    // ── STEP 0: Versandadresse prüfen ──
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.shippingLink = null;
        ctx.wizard.state.paymentId = null;
        ctx.wizard.state.paymentLink = null;

        try {
            const userId = ctx.from.id;
            const cart = await cartRepo.getCartDetails(userId);

            if (!cart || cart.length === 0) {
                await ctx.reply(texts.getCartEmptyText(), { parse_mode: 'Markdown' });
                return ctx.scene.leave();
            }

            // Prüfen ob irgendein Produkt im Warenkorb Versand erfordert
            let needsShipping = false;
            for (const item of cart) {
                const product = await productRepo.getProductById(item.product_id || item.id);
                if (product && product.requires_shipping) {
                    needsShipping = true;
                    break;
                }
            }

            ctx.wizard.state.needsShipping = needsShipping;

            if (needsShipping) {
                // Versandadresse abfragen
                const msg = await ctx.reply(texts.getShippingAddressPrompt(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
                return ctx.wizard.next(); // → Step 1: Adresse empfangen
            } else {
                // Direkt zur Zahlungsauswahl
                return ctx.wizard.selectStep(2);
            }
        } catch (error) {
            console.error('Checkout Init Error:', error.message);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    },

    // ── STEP 1: Versandadresse empfangen ──
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_checkout') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelCheckout(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const msg = await ctx.reply('⚠️ Bitte sende einen Privnote-Link, keinen Befehl.', {
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return;
        }

        // Validierung: Muss ein Privnote-Link sein
        if (isPrivnoteLink(input)) {
            ctx.wizard.state.shippingLink = input;
            return ctx.wizard.selectStep(2); // → Zahlungsauswahl
        }

        // URL aber kein Privnote
        if (isUrl(input)) {
            const msg = await ctx.reply(texts.getShippingInvalidLink(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return;
        }

        // Klartext (keine URL)
        const msg = await ctx.reply(texts.getShippingPlaintextWarning(), {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]] }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);

        // Nachricht mit Klartext-Adresse sofort löschen (Sicherheit)
        try {
            await ctx.deleteMessage(ctx.message.message_id).catch(() => {});
        } catch (e) {}
    },

    // ── STEP 2: Zahlungsauswahl ──
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_checkout') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelCheckout(ctx);
        }

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
                // Manuelle Abwicklung
                const manualMethod = { name: 'Privat-Chat / Manuelle Abwicklung', wallet_address: null };
                const text = "ℹ️ *Manuelle Zahlungsabwicklung*\n\n" +
                    formatters.formatInvoice(orderDetails, cartTotal, manualMethod) +
                    '\n\nEs sind keine automatischen Zahlungsdaten hinterlegt.\n\n*Bestellung jetzt abschicken?*';

                const msg = await ctx.reply(text, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Kaufpflichtig bestellen', callback_data: 'checkout_confirm_manual' }],
                            [{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]
                        ]
                    }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
                return ctx.wizard.next(); // → Step 3: Bestätigung
            }

            const keyboard = paymentMethods.map(pm => ([{
                text: pm.name,
                callback_data: `checkout_pay_${pm.id}`
            }]));
            keyboard.push([{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]);

            const msg = await ctx.reply(texts.getCheckoutSelectPayment(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
            ctx.wizard.state.messagesToDelete.push(msg.message_id);

            return ctx.wizard.next(); // → Step 3
        } catch (error) {
            console.error('Payment Select Error:', error.message);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    },

    // ── STEP 3: Zahlungsart gewählt / Bestätigung / TX-ID ──
    async (ctx) => {
        if (!ctx.callbackQuery) {
            // Text-Eingabe ignorieren in diesem Step
            if (ctx.message) ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
            return;
        }

        const data = ctx.callbackQuery.data;
        ctx.answerCbQuery().catch(() => {});

        if (data === 'cancel_checkout') return cancelCheckout(ctx);

        if (data === 'checkout_confirm_manual') {
            // Manuelle Bestellung abschließen
            return await finalizeOrder(ctx, null);
        }

        if (data.startsWith('checkout_pay_')) {
            const paymentId = data.replace('checkout_pay_', '');
            ctx.wizard.state.paymentId = paymentId;

            try {
                const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);
                ctx.wizard.state.paymentMethodName = paymentMethod.name;

                const text = formatters.formatInvoice(
                    ctx.wizard.state.orderDetails,
                    ctx.wizard.state.cartTotal,
                    paymentMethod
                ) + '\n\n*Möchtest du den Kauf zahlungspflichtig abschließen?*';

                if (paymentMethod.wallet_address) {
                    text + `\n\nSende nach Bezahlung optional einen Privnote-Link mit der Transaktions-ID:`;
                }

                const keyboard = [
                    [{ text: '✅ Bestellung abschicken', callback_data: 'checkout_finalize' }],
                    [{ text: '🔙 Andere Zahlungsart', callback_data: 'checkout_back_payment' }],
                    [{ text: '❌ Abbrechen', callback_data: 'cancel_checkout' }]
                ];

                const msg = await ctx.reply(text, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
                ctx.wizard.state.messagesToDelete.push(msg.message_id);
                return ctx.wizard.next(); // → Step 4
            } catch (error) {
                console.error('Payment Method Error:', error.message);
                await ctx.reply(texts.getGeneralError());
                return ctx.scene.leave();
            }
        }
    },

    // ── STEP 4: Finalisierung ──
    async (ctx) => {
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            ctx.answerCbQuery().catch(() => {});

            if (data === 'cancel_checkout') return cancelCheckout(ctx);
            if (data === 'checkout_back_payment') return ctx.wizard.selectStep(2);
            if (data === 'checkout_finalize') return await finalizeOrder(ctx, ctx.wizard.state.paymentId);
        }

        // TX-ID als Privnote-Link (optional)
        if (ctx.message && ctx.message.text) {
            const input = ctx.message.text.trim();
            ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

            if (isPrivnoteLink(input)) {
                ctx.wizard.state.paymentLink = input;
                return await finalizeOrder(ctx, ctx.wizard.state.paymentId);
            }
        }
    }
);

// ── Order finalisieren ──
async function finalizeOrder(ctx, paymentId) {
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
        if (paymentId) {
            try {
                const pm = await paymentRepo.getPaymentMethod(paymentId);
                if (pm) paymentMethodName = pm.name;
            } catch (e) {}
        }

        const order = await orderRepo.createOrder(userId, parseFloat(cartTotal), orderDetails, {
            shippingLink: ctx.wizard.state.shippingLink,
            paymentLink: ctx.wizard.state.paymentLink,
            paymentMethodId: paymentId,
            paymentMethodName: paymentMethodName
        });

        await cartRepo.clearCart(userId);
        await cleanup(ctx);

        // Receipt an Kunden
        notificationService.sendOrderReceipt(userId, {
            orderId: order.order_id,
            total: parseFloat(cartTotal).toFixed(2),
            paymentName: paymentMethodName,
            status: 'Offen'
        }).catch(() => {});

        // Admins benachrichtigen
        notificationService.notifyAdminsNewOrder({
            userId,
            username,
            orderDetails,
            paymentId: paymentId || 'MANUAL',
            orderId: order.order_id,
            shippingLink: ctx.wizard.state.shippingLink
        }).catch(() => {});

        const text = `🎉 *Vielen Dank für deine Bestellung!*\n\n` +
            `📋 *Order-ID:* \`${order.order_id}\`\n\n` +
            `Deine Bestellung wird bearbeitet. Du kannst den Status unter "Meine Bestellungen" verfolgen.`;

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

// ── Cancel Action Handler ──
checkoutScene.action('cancel_checkout', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return cancelCheckout(ctx);
});

module.exports = checkoutScene;
