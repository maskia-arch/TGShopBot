/**
 * checkoutTickerService.js – Live-Countdown & Echtzeit-Blockchain-Polling für Checkout-Rechnungen
 * © 2026 t.me/autoacts
 */

const cryptoPaymentService = require('./cryptoPaymentService');
const orderRepo = require('../database/repositories/orderRepo');
const deliverableRepo = require('../database/repositories/deliverableRepo');
const notificationService = require('./notificationService');
const formatters = require('../utils/formatters');
const texts = require('../utils/texts');

// Map<orderId, { chatId, messageId, intervalId, expiresAt, order } >
const activeCheckouts = new Map();

/**
 * Startet den 30-Minuten Ticker für eine Checkout-Rechnung (Aktualisierung alle 30s)
 */
function startCheckoutTicker(bot, chatId, messageId, orderId, orderDetails) {
    stopCheckoutTicker(orderId);

    const DURATION_MS = 30 * 60 * 1000; // 30 Minuten
    const lastUpdate = orderDetails?.last_rate_update || orderDetails?.created_at;
    const baseTime = lastUpdate ? new Date(lastUpdate).getTime() : Date.now();
    let expiresAt = baseTime + DURATION_MS;

    const tick = async () => {
        let remainingMs = expiresAt - Date.now();

        if (remainingMs <= 0) {
            try {
                const currentOrder = await orderRepo.getOrderByOrderId(orderId);
                if (currentOrder && currentOrder.status === 'offen') {
                    const paymentRepo = require('../database/repositories/paymentRepo');
                    const cryptoExchangeService = require('./cryptoExchangeService');
                    const methods = await paymentRepo.getActivePaymentMethods().catch(() => []);
                    const paymentMethod = methods.find(m => m.name === currentOrder.payment_method_name || (currentOrder.payment_method_name && currentOrder.payment_method_name.includes(m.name)));
                    const symbol = paymentMethod?.crypto_symbol || 'BTC';
                    
                    const cryptoCalc = await cryptoExchangeService.calculateCryptoPayment(currentOrder.total_amount, symbol);
                    const updatedOrder = await orderRepo.updateCryptoDetails(orderId, cryptoCalc.amountFormatted, cryptoCalc.identifier, cryptoCalc.rate);
                    
                    if (updatedOrder) {
                        expiresAt = Date.now() + DURATION_MS;
                        remainingMs = DURATION_MS;
                        await updateInvoiceCountdown(bot, chatId, messageId, updatedOrder, '30:00');
                        return;
                    }
                }
            } catch (e) {
                console.error('[CheckoutTicker Expired] Recalculate Error:', e.message);
            }

            stopCheckoutTicker(orderId);
            await handleCheckoutExpired(bot, chatId, messageId, orderId);
            return;
        }

        const totalSec = Math.floor(remainingMs / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const countdownStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        try {
            const currentOrder = await orderRepo.getOrderByOrderId(orderId);
            if (!currentOrder || currentOrder.status === 'abgeschlossen' || currentOrder.status === 'abgebrochen') {
                stopCheckoutTicker(orderId);
                return;
            }

            await updateInvoiceCountdown(bot, chatId, messageId, currentOrder, countdownStr);
        } catch (e) {
            console.error('[CheckoutTicker] Update-Fehler:', e.message);
        }
    };

    // Sofortige Aktualisierung beim Aufruf
    tick().catch(() => {});

    // Kontinuierliche Aktualisierung alle 30 Sekunden
    const intervalId = setInterval(tick, 30000);

    activeCheckouts.set(orderId, { chatId, messageId, intervalId, expiresAt });
}

/**
 * Stoppt den Countdown-Ticker für eine Bestellung
 */
function stopCheckoutTicker(orderId) {
    if (activeCheckouts.has(orderId)) {
        const item = activeCheckouts.get(orderId);
        if (item.intervalId) clearInterval(item.intervalId);
        activeCheckouts.delete(orderId);
    }
}

/**
 * Aktualisiert die Rechnungsnachricht mit dem aktuellen Countdown
 */
async function updateInvoiceCountdown(bot, chatId, messageId, order, countdownStr) {
    try {
        const paymentRepo = require('../database/repositories/paymentRepo');
        const methods = await paymentRepo.getActivePaymentMethods().catch(() => []);
        const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));
        const wallet = paymentMethod?.wallet_address;

        let text = `⚡ *AUTOMATISCHE BLOCKCHAIN-ZAHLUNGSERKENNUNG AKTIV*\n\n` +
            `📋 *Order-ID:* \`#${order.order_id}\`\n` +
            `💶 *Euro-Betrag:* ${formatters.formatPrice(order.total_amount)}\n` +
            `💳 *Zahlungsart:* ${order.payment_method_name || 'Krypto'}\n\n`;

        if (wallet) {
            text += `📍 *Zahlungsadresse:*\n\`${wallet}\`\n_(Tippe zum Kopieren)_\n\n`;
        }

        if (order.crypto_amount) {
            text += `🪙 *Exakter Krypto-Betrag (inkl. Kennziffer):*\n\`${order.crypto_amount}\`\n_(Tippe zum Kopieren)_\n\n`;
        }

        if (order.payment_identifier) {
            text += `📌 *Deine 4-stellige Kennziffer:* \`${order.payment_identifier}\`\n\n`;
        }

        text += `⏳ *Status:* *Warten auf Blockchain-Zahlungseingang...*\n` +
            `🔎 *Letzter Blockchain-Check:* vor wenigen Sekunden\n` +
            `⏱️ *Verbleibende Zahlungsfrist:* \`${countdownStr} Min.\`\n\n` +
            `_Das System scannt das Netzwerk automatisch im Hintergrund. Sobald 1 Bestätigung eingeht, wird deine Bestellung sofort freigeschaltet!_\n\n` +
            `💡 *Hinweis:* Die Eingabe der TX-ID ist optional, hilft dem System jedoch, deine Überweisung noch schneller zuzuordnen.`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '🔑 TX-ID / Zahlungsbeleg eingeben (Optional)', callback_data: `enter_optional_txid_${order.order_id}`, style: 'success' }],
                [{ text: '📱 QR-Code für Wallet generieren', callback_data: `co_qr_${order.order_id}`, style: 'primary' }],
                [
                    { text: '📋 Wallet kopieren', callback_data: `co_copy_wallet_${order.order_id}` },
                    { text: '🪙 Betrag kopieren', callback_data: `co_copy_amount_${order.order_id}` }
                ],
                [
                    { text: '📋 Meine Bestellungen', callback_data: 'my_orders', style: 'primary' },
                    { text: '🏠 Hauptmenü', callback_data: 'back_to_main', style: 'primary' }
                ]
            ]
        };

        await bot.telegram.editMessageText(chatId, messageId, null, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }).catch(() => {});
    } catch (e) {}
}

/**
 * Wenn das 30-Minuten-Zeitfenster abläuft
 */
async function handleCheckoutExpired(bot, chatId, messageId, orderId) {
    try {
        const expiredText = `⏱️ *Checkout abgelaufen (30 Min.)*\n\n` +
            `Die Zahlungsfrist für Bestellung \`#${orderId}\` ist abgelaufen.\n` +
            `Falls du die Zahlung bereits gesendet hast, wird sie auf der Blockchain automatisch erkannt.\n\n` +
            `Klicke unten, um ins Hauptmenü zurückzukehren:`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '🔄 Hauptmenü (/start)', callback_data: 'back_to_main', style: 'primary' }]
            ]
        };

        await bot.telegram.editMessageText(chatId, messageId, null, expiredText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }).catch(async () => {
            await bot.telegram.deleteMessage(chatId, messageId).catch(() => {});
            await bot.telegram.sendMessage(chatId, expiredText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }).catch(() => {});
        });
    } catch (e) {
        console.error('[CheckoutTicker Expired] Error:', e.message);
    }
}

module.exports = {
    startCheckoutTicker,
    stopCheckoutTicker
};
