const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const productRepo = require('../../database/repositories/productRepo');
const couponRepo = require('../../database/repositories/couponRepo');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');
const cryptoExchangeService = require('../../services/cryptoExchangeService');
const texts = require('../../utils/texts');
const { extractMediaFromMessage, validateFileId } = require('../../utils/imageUploader');

const isPrivnoteLink = (text) => {
    return /^https?:\/\/(www\.)?privnote\.com\/[^\s]+/i.test(text.trim());
};

const escapeMarkdown = (text) => {
    if (!text) return '';
    return String(text).replace(/([_*`\[\]])/g, '\\$1');
};

const checkoutScene = new Scenes.WizardScene(
    'checkoutScene',
    async (ctx) => {
        ctx.wizard.state.shippingLink = null;
        ctx.wizard.state.paymentMethod = null;
        ctx.wizard.state.deliveryMethod = null;
        ctx.wizard.state.cartTotal = null;
        ctx.wizard.state.orderDetails = null;
        ctx.wizard.state.appliedCoupon = null;
        ctx.wizard.state.discountAmount = 0;
        ctx.wizard.state.finalTotal = null;
        ctx.wizard.state.phase = 'init';
        ctx.wizard.state.kycMode = 'none';
        ctx.wizard.state.kycOption = 'selfie';
        ctx.wizard.state.kycSubmission = null;

        try {
            const userId = ctx.from.id;
            const cart = await cartRepo.getCartDetails(userId);

            if (!cart || cart.length === 0) {
                await ctx.reply('🛒 Dein Warenkorb ist leer.', { parse_mode: 'Markdown' });
                return ctx.scene.leave();
            }

            let hasShipping = false;
            let hasPickup = false;
            let highestKycMode = 'none';
            let selectedKycOption = 'selfie';

            for (const item of cart) {
                const product = await productRepo.getProductById(item.product_id || item.id);
                if (product) {
                    const opt = product.delivery_option || 'none';
                    if (opt === 'shipping' || opt === 'both') hasShipping = true;
                    if (opt === 'pickup' || opt === 'both') hasPickup = true;

                    if (product.kyc_mode === 'required') {
                        highestKycMode = 'required';
                        if (product.kyc_options && product.kyc_options[0]) selectedKycOption = product.kyc_options[0];
                    } else if (product.kyc_mode === 'optional' && highestKycMode !== 'required') {
                        highestKycMode = 'optional';
                        if (product.kyc_options && product.kyc_options[0]) selectedKycOption = product.kyc_options[0];
                    }
                }
            }

            ctx.wizard.state.kycMode = highestKycMode;
            ctx.wizard.state.kycOption = selectedKycOption;
            ctx.wizard.state.cartTotal = await cartRepo.getCartTotal(userId);
            ctx.wizard.state.orderDetails = cart;

            if (hasShipping && hasPickup) {
                ctx.wizard.state.phase = 'delivery_choice';
                await ctx.reply(texts.getDeliveryChoicePrompt(), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚚 Versand', callback_data: 'co_delivery_shipping', style: 'success' }],
                            [{ text: '🏪 Abholung', callback_data: 'co_delivery_pickup', style: 'success' }],
                            [{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]
                        ]
                    }
                });
            } else if (hasShipping) {
                ctx.wizard.state.deliveryMethod = 'shipping';
                ctx.wizard.state.phase = 'shipping_address';
                await ctx.reply(texts.getShippingAddressPrompt(), {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]] }
                });
            } else if (hasPickup) {
                ctx.wizard.state.deliveryMethod = 'pickup';
                await showPaymentSelection(ctx);
            } else {
                ctx.wizard.state.deliveryMethod = 'none';
                await showPaymentSelection(ctx);
            }

            return ctx.wizard.next();
        } catch (error) {
            console.error('Checkout Init Error:', error.message);
            await ctx.reply('❌ Fehler beim Starten des Checkouts.');
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        const phase = ctx.wizard.state.phase;
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            ctx.answerCbQuery().catch(() => {});

            if (data === 'co_cancel') {
                await ctx.reply('❌ Bestellung abgebrochen.');
                return ctx.scene.leave();
            }

            if (data === 'co_skip_kyc' && ctx.wizard.state.kycMode === 'optional') {
                ctx.wizard.state.kycSubmission = null;
                await showPaymentSelection(ctx);
                return;
            }

            if (phase === 'delivery_choice') {
                if (data === 'co_delivery_shipping') {
                    ctx.wizard.state.deliveryMethod = 'shipping';
                    ctx.wizard.state.phase = 'shipping_address';
                    await ctx.reply(texts.getShippingAddressPrompt(), {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true,
                        reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]] }
                    });
                    return;
                }
                if (data === 'co_delivery_pickup') {
                    ctx.wizard.state.deliveryMethod = 'pickup';
                    await showPaymentSelection(ctx);
                    return;
                }
            }

            if (data === 'co_enter_coupon') {
                ctx.wizard.state.phase = 'coupon_code_input';
                const text = `🎟️ *GUTSCHEIN / COUPON EINLÖSEN*\n\n` +
                    `Bitte gib deinen Rabatt-Code im Chat ein (z. B. \`SUMMER20\`):`;
                const keyboard = {
                    inline_keyboard: [[{ text: '🔙 Zurück zur Zahlungsart', callback_data: 'co_back_payment', style: 'danger' }]]
                };
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                return;
            }

            if (phase === 'payment_select' && data.startsWith('co_pay_')) {
                const paymentId = data.replace('co_pay_', '');
                try {
                    const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);
                    ctx.wizard.state.paymentMethod = paymentMethod;

                    const rawName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
                    const username = escapeMarkdown(rawName);

                    const currentTotal = ctx.wizard.state.discountAmount > 0 ? ctx.wizard.state.finalTotal : ctx.wizard.state.cartTotal;

                    if (notificationService.notifyAdminsInterest) {
                        notificationService.notifyAdminsInterest({
                            username: username,
                            total: formatters.formatPrice(currentTotal),
                            paymentName: paymentMethod.name
                        }).catch(() => {});
                    }

                    // In der Bestellübersicht (Review) werden noch KEINE Wallet-Adresse & Krypto-Betrag gezeigt!
                    const invoiceText = formatters.formatInvoice(
                        ctx.wizard.state.orderDetails,
                        ctx.wizard.state.cartTotal,
                        paymentMethod,
                        null,
                        { 
                            isReview: true, 
                            discountAmount: ctx.wizard.state.discountAmount, 
                            couponCode: ctx.wizard.state.appliedCoupon?.code 
                        }
                    ) + '\n\n*Möchtest du den Kauf jetzt verbindlich abschließen und das Checkout öffnen?*';

                    await ctx.reply(invoiceText, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Bestellung abschicken', callback_data: 'co_finalize', style: 'success' }],
                                [{ text: '🔙 Andere Zahlungsart', callback_data: 'co_back_payment', style: 'danger' }],
                                [{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]
                            ]
                        }
                    });
                    ctx.wizard.state.phase = 'payment_confirm';
                } catch (error) {
                    console.error('Payment Method Error:', error.message);
                    return ctx.scene.leave();
                }
                return;
            }

            if (phase === 'payment_confirm' && (data === 'co_confirm_manual' || data === 'co_finalize')) {
                return await finalizeOrder(ctx);
            }

            if (data === 'co_back_payment') {
                await showPaymentSelection(ctx);
                return;
            }
            return;
        }

        if (phase === 'kyc_upload' && ctx.message) {
            const media = extractMediaFromMessage(ctx.message);
            if (!media) {
                const isOptional = ctx.wizard.state.kycMode === 'optional';
                const kb = [];
                if (isOptional) kb.push([{ text: '⏩ Überspringen', callback_data: 'co_skip_kyc', style: 'primary' }]);
                kb.push([{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]);
                await ctx.reply('⚠️ Bitte sende ein Foto (Selfie / Ausweis).', {
                    reply_markup: { inline_keyboard: kb }
                });
                return;
            }

            const isValid = await validateFileId(ctx, media.fileId);
            if (!isValid) {
                await ctx.reply('⚠️ Das Foto konnte nicht verarbeitet werden. Bitte versuche es erneut.');
                return;
            }

            ctx.wizard.state.kycSubmission = {
                mode: ctx.wizard.state.kycMode,
                option: ctx.wizard.state.kycOption || 'selfie',
                fileId: media.prefixedId,
                submittedAt: new Date().toISOString()
            };

            await ctx.reply('✅ Legitimierungs-Foto erfolgreich empfangen!');
            await new Promise(r => setTimeout(r, 400));
            await showPaymentSelection(ctx);
            return;
        }

        if (ctx.message && ctx.message.text) {
            const input = ctx.message.text.trim();
            if (input.startsWith('/')) return;

            if (phase === 'coupon_code_input') {
                const couponCode = input.toUpperCase();
                const res = await couponRepo.validateCoupon(couponCode, ctx.wizard.state.orderDetails, ctx.wizard.state.cartTotal);

                if (!res.valid) {
                    await ctx.reply(res.message);
                    return await showPaymentSelection(ctx);
                }

                ctx.wizard.state.appliedCoupon = res.coupon;
                ctx.wizard.state.discountAmount = res.discountAmount;
                ctx.wizard.state.finalTotal = res.finalTotal;

                await ctx.reply(res.message);
                return await showPaymentSelection(ctx);
            }

            if (phase === 'shipping_address') {
                if (isPrivnoteLink(input)) {
                    ctx.wizard.state.shippingLink = input;

                    // KYC-Prüfung nach Adresseingabe für Versand
                    if (ctx.wizard.state.kycMode && ctx.wizard.state.kycMode !== 'none') {
                        ctx.wizard.state.phase = 'kyc_upload';
                        const promptText = texts.getCheckoutKycPrompt ? texts.getCheckoutKycPrompt(ctx.wizard.state.kycMode, ctx.wizard.state.kycOption) : '🆔 *Legitimierung erforderlich:* Bitte sende ein Selfie / Ausweis-Foto.';
                        const kb = [];
                        if (ctx.wizard.state.kycMode === 'optional') {
                            kb.push([{ text: '⏩ Überspringen', callback_data: 'co_skip_kyc', style: 'primary' }]);
                        }
                        kb.push([{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]);
                        await ctx.reply(promptText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
                        return;
                    }

                    await showPaymentSelection(ctx);
                    return;
                }
                ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
                await ctx.reply(texts.getShippingPlaintextWarning(), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]] }
                });
                return;
            }
        }
    }
);

async function showPaymentSelection(ctx) {
    try {
        const paymentMethods = await paymentRepo.getActivePaymentMethods();
        const rawTotal = parseFloat(ctx.wizard.state.cartTotal);
        const finalTotal = ctx.wizard.state.discountAmount > 0 ? ctx.wizard.state.finalTotal : rawTotal;

        if (!paymentMethods || paymentMethods.length === 0) {
            const text = 'ℹ️ *Manuelle Zahlungsabwicklung*\n\n' +
                `💰 *Gesamtsumme: ${formatters.formatPrice(finalTotal)}*\n\n` +
                'Bestellung trotzdem abschicken?';

            await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '✅ Bestellen', callback_data: 'co_confirm_manual', style: 'success' }], [{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]]
                }
            });
            ctx.wizard.state.phase = 'payment_confirm';
            return;
        }

        let selectHeader = texts.getCheckoutSelectPayment();
        if (ctx.wizard.state.discountAmount > 0) {
            selectHeader = `🎟️ *Gutschein "${ctx.wizard.state.appliedCoupon.code}" angewendet!*\n` +
                `💰 *Rabatt:* -${formatters.formatPrice(ctx.wizard.state.discountAmount)}\n` +
                `💶 *Neuer Endbetrag:* ${formatters.formatPrice(finalTotal)}\n\n` +
                `Bitte wähle deine bevorzugte Zahlungsart aus:`;
        }

        const keyboard = paymentMethods.map(pm => ([{ text: `💳 ${pm.name}`, callback_data: `co_pay_${pm.id}`, style: 'primary' }]));
        
        if (!ctx.wizard.state.appliedCoupon) {
            keyboard.push([{ text: '🎟️ Rabatt-Coupon einlösen', callback_data: 'co_enter_coupon', style: 'success' }]);
        }
        keyboard.push([{ text: '❌ Abbrechen', callback_data: 'co_cancel', style: 'danger' }]);

        await ctx.reply(selectHeader, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        ctx.wizard.state.phase = 'payment_select';
    } catch (error) {
        console.error('Payment Select Error:', error.message);
        return ctx.scene.leave();
    }
}

async function finalizeOrder(ctx) {
    try {
        const userId = ctx.from.id;
        const rawName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
        const username = escapeMarkdown(rawName);
        
        const rawTotal = parseFloat(ctx.wizard.state.cartTotal);
        const discountAmount = ctx.wizard.state.discountAmount || 0;
        const finalTotal = Math.max(0, rawTotal - discountAmount);
        const orderDetails = ctx.wizard.state.orderDetails;

        if (!orderDetails || orderDetails.length === 0) return ctx.scene.leave();

        // Vorrats- & Status-Guard: Verhindert Käufe ausverkaufter oder unzureichender Produkte
        const productRepo = require('../../database/repositories/productRepo');
        const deliverableRepo = require('../../database/repositories/deliverableRepo');

        for (const item of orderDetails) {
            const prodId = item.product_id || item.id;
            const product = await productRepo.getProductById(prodId).catch(() => null);
            if (!product || !product.is_active) {
                await ctx.reply(`⚠️ Das Produkt "${item.name}" ist derzeit nicht mehr verfügbar.`, {
                    reply_markup: { inline_keyboard: [[{ text: '🛍 Zum Shop', callback_data: 'shop_menu' }]] }
                });
                return ctx.scene.leave();
            }

            const availCount = await deliverableRepo.getAvailableCount(prodId);
            if (product.is_out_of_stock || (availCount === 0 && (product.delivery_option === 'none' || !product.delivery_option))) {
                await productRepo.toggleProductStatus(prodId, 'is_out_of_stock', true).catch(() => {});
                await ctx.reply(`⚠️ Das Produkt "${item.name}" ist derzeit leider ausverkauft.`, {
                    reply_markup: { inline_keyboard: [[{ text: '🛍 Zum Shop', callback_data: 'shop_menu' }]] }
                });
                return ctx.scene.leave();
            }

            if (availCount > 0 && item.quantity > availCount) {
                await ctx.reply(`⚠️ *Vorrat nicht ausreichend für "${item.name}"*\n\nDerzeit sind nur noch *${availCount} Stück* im Tresor auf Lager.\n(Gewünschte Menge: ${item.quantity} Stück)\n\nBitte passe deine Menge im Warenkorb an.`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]] }
                });
                return ctx.scene.leave();
            }
        }

        const paymentMethod = ctx.wizard.state.paymentMethod;
        const paymentMethodName = paymentMethod ? paymentMethod.name : 'Manuelle Abwicklung';
        const walletAddress = paymentMethod ? paymentMethod.wallet_address : null;
        const deliveryMethod = ctx.wizard.state.deliveryMethod;

        let paymentIdentifier = null;
        let cryptoAmount = null;
        let cryptoAmountFormatted = null;

        if (paymentMethod && paymentMethod.auto_verify) {
            const symbol = paymentMethod.crypto_symbol || 'BTC';
            try {
                const cryptoCalc = await cryptoExchangeService.calculateCryptoPayment(finalTotal, symbol);
                cryptoAmountFormatted = cryptoCalc.amountFormatted;
                cryptoAmount = cryptoCalc.rawAmount;
                paymentIdentifier = cryptoCalc.identifier;
            } catch (e) {
                console.error('[Checkout Finalize] Krypto-Berechnungsfehler:', e.message);
                paymentIdentifier = Math.floor(1000 + Math.random() * 9000).toString();
                cryptoAmountFormatted = `${finalTotal.toFixed(2)} EUR (ID: ${paymentIdentifier})`;
                cryptoAmount = finalTotal;
            }
        }

        const order = await orderRepo.createOrder(userId, finalTotal, orderDetails, {
            shippingLink: ctx.wizard.state.shippingLink,
            paymentMethodName: paymentMethodName,
            deliveryMethod: deliveryMethod,
            cryptoAmount: cryptoAmountFormatted || cryptoAmount,
            paymentIdentifier: paymentIdentifier,
            kycSubmission: ctx.wizard.state.kycSubmission
        });

        if (ctx.wizard.state.appliedCoupon) {
            await couponRepo.incrementCouponUses(ctx.wizard.state.appliedCoupon.code).catch(() => {});
        }

        await cartRepo.clearCart(userId);

        let receiptText = texts.getCustomerInvoice({
            orderId: order.order_id,
            total: finalTotal.toFixed(2),
            paymentName: paymentMethodName,
            walletAddress: walletAddress,
            deliveryMethod: deliveryMethod,
            cryptoAmountFormatted: cryptoAmountFormatted
        });

        if (paymentMethod && paymentMethod.auto_verify) {
            receiptText += `\n\n⚡ *AUTOMATISCHE ZAHLUNGSERKENNUNG AKTIV*\n` +
                `📌 *Deine 4-stellige Kennziffer:* \`${paymentIdentifier}\`\n` +
                `💰 *Kopierbarer Betrag:* \`${cryptoAmountFormatted}\`\n` +
                `⏱️ *Verbleibende Zahlungsfrist:* \`30:00 Min.\` (Kurs & Reservierung gültig)\n` +
                `⚠️ _Nach Ablauf von 30 Minuten wird der Wechselkurs automatisch angepasst._\n\n` +
                `_Das System prüft die Blockchain automatisch im Hintergrund. Nach 1 Bestätigung wird deine Bestellung freigeschaltet!_`;
        }

        const checkoutTickerService = require('../../services/checkoutTickerService');

        const keyboard = [];
        if (paymentMethod && paymentMethod.auto_verify) {
            keyboard.push([{ text: '🟢 💸 Zahlung bestätigen (Live-Scan)', callback_data: `co_live_scan_${order.order_id}`, style: 'success' }]);
            keyboard.push([{ text: '🔑 TX-ID / Zahlungsbeleg eingeben (Optional)', callback_data: `enter_optional_txid_${order.order_id}`, style: 'primary' }]);
            keyboard.push([{ text: '📱 QR-Code für Wallet generieren', callback_data: `co_qr_${order.order_id}`, style: 'primary' }]);
            if (walletAddress) {
                keyboard.push([
                    { text: '📋 Wallet kopieren', callback_data: `co_copy_wallet_${order.order_id}` },
                    { text: '🪙 Betrag kopieren', callback_data: `co_copy_amount_${order.order_id}` }
                ]);
            }
        } else {
            keyboard.push([{ text: '🔑 TX-ID / Zahlungsbeleg eingeben', callback_data: `enter_optional_txid_${order.order_id}`, style: 'success' }]);
        }

        keyboard.push([
            { text: '📋 Meine Bestellungen', callback_data: 'my_orders', style: 'primary' },
            { text: '🏠 Hauptmenü', callback_data: 'back_to_main', style: 'primary' }
        ]);

        const receiptMsg = await ctx.reply(receiptText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

        if (paymentMethod && paymentMethod.auto_verify && receiptMsg && receiptMsg.message_id) {
            checkoutTickerService.startCheckoutTicker(ctx.telegram, ctx.chat.id, receiptMsg.message_id, order.order_id, order);
        }

        await notificationService.notifyAdminsNewOrder({
            userId, username, orderDetails,
            total: parseFloat(cartTotal).toFixed(2),
            paymentName: paymentMethodName,
            orderId: order.order_id,
            shippingLink: ctx.wizard.state.shippingLink,
            deliveryMethod
        }).catch(e => console.error('Admin Notify Error:', e.message));

        return ctx.scene.leave();
    } catch (error) {
        console.error('Finalize Order Error:', error.message);
        return ctx.scene.leave();
    }
}

checkoutScene.action('co_cancel', async (ctx) => {
    ctx.answerCbQuery('Abgebrochen').catch(() => {});
    await ctx.reply('❌ Bestellung abgebrochen.');
    return ctx.scene.leave();
});

module.exports = checkoutScene;
