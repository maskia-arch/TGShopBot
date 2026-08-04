const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');
const uiHelper = require('../../utils/uiHelper');
const config = require('../../config');

module.exports = (bot) => {

    // ─── 1. MEINE BESTELLUNGEN (ÜBERSICHT) ───────────────────────────────────
    bot.action('my_orders', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const orders = await orderRepo.getActiveOrdersByUser(userId);

            if (!orders || orders.length === 0) {
                const emptyText = texts.getMyOrdersEmpty();
                const kb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] };
                return await ctx.editMessageText(emptyText, { parse_mode: 'Markdown', reply_markup: kb }).catch(async () => {
                    await ctx.reply(emptyText, { parse_mode: 'Markdown', reply_markup: kb });
                });
            }

            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const statusLabel = texts.getCustomerStatusLabel(order.status);

                text += `${i + 1}. \`#${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${statusLabel}\n`;
                if (order.digital_delivery) {
                    text += `🔐 _Digitale Lieferung verfügbar_\n`;
                }
                text += `📅 ${date}\n\n`;

                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }

                keyboard.push([{ text: `📋 Bestellung #${order.order_id}`, callback_data: `cust_order_detail_${order.order_id}` }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('My Orders Error:', error.message);
        }
    });

    // ─── 2. EINZEL-BESTELLÜBERSICHT FÜR KUNDEN ───────────────────────────────
    bot.action(/^cust_order_detail_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            let order = await orderRepo.getOrderByOrderId(orderId);

            if (!order || Number(order.user_id) !== Number(userId)) {
                return ctx.answerCbQuery('⚠️ Bestellung nicht gefunden.', { show_alert: true });
            }

            // 30-Minuten Ablauf & Kursanpassung prüfen
            let rateNotice = '';
            if ((order.status === 'offen' || order.status === 'nachzahlung_erforderlich') && order.payment_identifier) {
                const lastUpdate = new Date(order.last_rate_update || order.created_at).getTime();
                const diffMinutes = (Date.now() - lastUpdate) / (1000 * 60);

                if (diffMinutes >= 30) {
                    const cryptoExchangeService = require('../../services/cryptoExchangeService');
                    const paymentRepo = require('../../database/repositories/paymentRepo');
                    const methods = await paymentRepo.getActivePaymentMethods();
                    const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));
                    const symbol = paymentMethod?.crypto_symbol || 'BTC';

                    try {
                        const cryptoCalc = await cryptoExchangeService.calculateCryptoPayment(parseFloat(order.total_amount), symbol, order.payment_identifier);
                        order = await orderRepo.updateCryptoAmountAndRate(order.order_id, cryptoCalc.amountFormatted, cryptoCalc.rate);
                        rateNotice = `\n⏱️ *Zahlungsfrist abgelaufen (30 Min.)*\nDer Betrag wurde an den aktuellen Wechselkurs angepasst: \`${cryptoCalc.amountFormatted}\`\n`;
                    } catch (e) {
                        console.error('Recalculate rate error:', e.message);
                    }
                }
            }

            const date = new Date(order.created_at).toLocaleDateString('de-DE');
            const statusLabel = texts.getCustomerStatusLabel(order.status);

            let text = `📋 *Bestellung #${order.order_id}*\n\n`;
            text += `📅 Datum: ${date}\n`;
            text += `💰 Betrag: ${formatters.formatPrice(order.total_amount)}\n`;
            text += `💳 Zahlung: ${order.payment_method_name || 'N/A'}\n`;
            text += `📦 Status: ${statusLabel}\n`;

            if (order.crypto_amount) text += `🪙 Krypto-Betrag: \`${order.crypto_amount}\`\n`;
            if (order.payment_identifier) text += `📌 Kennziffer: \`${order.payment_identifier}\`\n`;
            if (rateNotice) text += rateNotice;

            if (order.delivery_method === 'shipping') text += `🚚 Lieferung: Versand\n`;
            else if (order.delivery_method === 'pickup') text += `🏪 Lieferung: Abholung\n`;
            else text += `📱 Lieferung: Digital\n`;

            if (order.tx_id) text += `🔑 TX-ID: \`${order.tx_id}\`\n`;

            if (order.details && order.details.length > 0) {
                text += `\n*Artikel:*`;
                order.details.forEach(item => {
                    const path = item.category_path ? `_${item.category_path}_ » ` : '';
                    text += `\n▪️ ${item.quantity}x ${path}${item.name} = ${formatters.formatPrice(item.total)}`;
                });
            }

            if (order.digital_delivery) {
                text += `\n\n🔐 *Gelieferte Artikel / Keys:*\n${order.digital_delivery}`;
            }

            const keyboard = [];

            if (order.digital_delivery) {
                keyboard.push([{ text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${orderId}`, style: 'success' }]);
                keyboard.push([{ text: '🔄 Replace anfragen', callback_data: `cust_replace_${orderId}`, style: 'primary' }]);
            }

            if (order.feedback_invited) {
                const alreadyFeedbacked = await feedbackRepo.hasUserAlreadyFeedbacked(orderId).catch(() => false);
                if (!alreadyFeedbacked) {
                    keyboard.push([{ text: '⭐ Diese Bestellung bewerten', callback_data: `start_feedback_${orderId}`, style: 'success' }]);
                }
            }

            if (order.status === 'abgeschlossen') {
                keyboard.push([{ text: '🗑 Bestellung löschen', callback_data: `cust_del_order_${orderId}`, style: 'danger' }]);
            }

            keyboard.push([
                { text: '🔔 Ping senden', callback_data: `cust_ping_${orderId}`, style: 'primary' },
                { text: '💬 Kontakt', callback_data: `cust_contact_${orderId}`, style: 'primary' }
            ]);

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'my_orders', style: 'danger' }]);

            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('Customer Order Detail Error:', error.message);
        }
    });

    // ─── 3. DELIVERABLES TRESOR ──────────────────────────────────────────────
    bot.action(/^cust_tresor_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const order = await orderRepo.getOrderByOrderId(orderId);

            if (!order || Number(order.user_id) !== Number(userId)) {
                return ctx.answerCbQuery('⚠️ Bestellung nicht gefunden.', { show_alert: true });
            }

            if (!order.digital_delivery) {
                return ctx.answerCbQuery('Noch keine digitalen Artikel geliefert.', { show_alert: true });
            }

            const msgText = texts.getDigitalDeliveryCustomerMessage(orderId, order.digital_delivery);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔙 Zur Bestellung', callback_data: `cust_order_detail_${orderId}` }]
                ]
            };

            // Permanente Nachricht – kein Lösch-Button, bleibt im Chat
            await ctx.reply(msgText, { parse_mode: 'Markdown', reply_markup: keyboard });

        } catch (error) {
            console.error('Tresor Error:', error.message);
            ctx.answerCbQuery('Fehler beim Laden.', { show_alert: true }).catch(() => {});
        }
    });

    // ─── 4. REPLACE ANFRAGEN ─────────────────────────────────────────────────
    bot.action(/^cust_replace_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const order = await orderRepo.getOrderByOrderId(orderId);

            if (!order || Number(order.user_id) !== Number(userId)) {
                return ctx.answerCbQuery('⚠️ Bestellung nicht gefunden.', { show_alert: true });
            }

            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `ID: ${userId}`);

            notificationService.notifyAdminReplaceRequest({
                orderId,
                userId,
                username
            }).catch(() => {});

            await ctx.reply(texts.getReplaceRequestSent(orderId), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📋 Zur Bestellung', callback_data: `cust_order_detail_${orderId}` }]]
                }
            });
        } catch (error) {
            console.error('Replace Request Error:', error.message);
        }
    });

    // ─── 5. DIGITALE LIEFERUNG LEGACY (view_dig_del_) ────────────────────────
    bot.action(/^view_dig_del_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order || !order.digital_delivery) return ctx.answerCbQuery('⚠️ Keine Keys gefunden.', { show_alert: true });

            const keyboard = {
                inline_keyboard: [[{ text: '🔙 Zur Bestellung', callback_data: `cust_order_detail_${orderId}` }]]
            };
            const msgText = texts.getDigitalDeliveryCustomerMessage(orderId, order.digital_delivery);
            await ctx.reply(msgText, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            ctx.answerCbQuery('Fehler beim Laden.', { show_alert: true }).catch(() => {});
        }
    });

    // ─── 6. BESTELLUNG LÖSCHEN ───────────────────────────────────────────────
    bot.action(/^cust_del_order_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.updateOrderStatus(orderId, 'loeschung_angefragt');
            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');

            if (notificationService.notifyAdminOrderDeleteRequest) {
                notificationService.notifyAdminOrderDeleteRequest({ orderId, userId: ctx.from.id, username }).catch(() => {});
            }

            ctx.answerCbQuery('🗑 Löschung angefragt.').catch(() => {});
            ctx.update.callback_query.data = 'my_orders';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Customer Delete Order Error:', error.message);
        }
    });

    // ─── 7. ZAHLUNGS-LOGIK & CHECKOUT AKTIONEN ──────────────────────────────
    bot.action(/^confirm_pay_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            let order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const paymentRepo = require('../../database/repositories/paymentRepo');
            const methods = await paymentRepo.getActivePaymentMethods();
            const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));

            const isAutoVerify = (paymentMethod && paymentMethod.auto_verify) || !!order.payment_identifier;

            let lastUpdate = order.last_rate_update || order.created_at;
            let baseTime = lastUpdate ? new Date(lastUpdate).getTime() : Date.now();
            let remainingMs = (baseTime + 30 * 60 * 1000) - Date.now();

            if (isAutoVerify && remainingMs <= 0) {
                const cryptoExchangeService = require('../../services/cryptoExchangeService');
                const symbol = paymentMethod?.crypto_symbol || 'BTC';
                const cryptoCalc = await cryptoExchangeService.calculateCryptoPayment(order.total_amount, symbol);
                const updated = await orderRepo.updateCryptoDetails(order.order_id, cryptoCalc.amountFormatted, cryptoCalc.identifier, cryptoCalc.rate);
                if (updated) {
                    order = updated;
                    remainingMs = 30 * 60 * 1000;
                }
            }

            const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
            const mins = Math.floor(totalSec / 60);
            const secs = totalSec % 60;
            const remainingStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            const wallet = paymentMethod?.wallet_address || '';
            const cryptoStr = order.crypto_amount || '';
            const identifier = order.payment_identifier || '';

            let invoiceText = texts.getCustomerInvoice({
                orderId: order.order_id,
                total: parseFloat(order.total_amount).toFixed(2),
                paymentName: order.payment_method_name || 'Krypto',
                walletAddress: wallet,
                deliveryMethod: order.delivery_method,
                cryptoAmountFormatted: cryptoStr
            });

            if (isAutoVerify) {
                invoiceText += `\n\n⚡ *AUTOMATISCHE ZAHLUNGSERKENNUNG AKTIV*\n` +
                    `📌 *Deine 4-stellige Kennziffer:* \`${identifier}\`\n` +
                    `💰 *Kopierbarer Betrag:* \`${cryptoStr}\`\n` +
                    `⏱️ *Verbleibende Zahlungsfrist:* \`${remainingStr} Min.\` (Kurs & Reservierung)\n` +
                    `⚠️ _Nach Ablauf von 30 Minuten wird der Wechselkurs automatisch angepasst._\n\n` +
                    `_Das System prüft die Blockchain automatisch im Hintergrund. Nach 1 Bestätigung wird deine Bestellung freigeschaltet!_`;
            }

            const keyboard = [];
            if (isAutoVerify) {
                keyboard.push([{ text: '🟢 💸 Zahlung bestätigen (Live-Scan)', callback_data: `co_live_scan_${order.order_id}`, style: 'success' }]);
                keyboard.push([{ text: '🔑 TX-ID / Zahlungsbeleg eingeben (Optional)', callback_data: `enter_optional_txid_${order.order_id}`, style: 'primary' }]);
                keyboard.push([{ text: '📱 QR-Code für Wallet generieren', callback_data: `co_qr_${order.order_id}`, style: 'primary' }]);
                if (wallet) {
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

            const sentMsg = await uiHelper.updateOrSend(ctx, invoiceText, { inline_keyboard: keyboard });

            if (isAutoVerify) {
                const checkoutTickerService = require('../../services/checkoutTickerService');
                const msgId = ctx.callbackQuery?.message?.message_id || sentMsg?.message_id;
                if (msgId) {
                    checkoutTickerService.startCheckoutTicker(ctx.telegram, ctx.chat.id, msgId, order.order_id, order);
                }
            }
        } catch (error) { console.error('Confirm Pay Error:', error.message); }
    });

    bot.action(/^co_live_scan_(.+)$/, async (ctx) => {
        ctx.answerCbQuery('⚡ Automatischer Blockchain-Scan aktiv!').catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const paymentRepo = require('../../database/repositories/paymentRepo');
            const methods = await paymentRepo.getActivePaymentMethods();
            const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));
            const wallet = paymentMethod?.wallet_address || '';

            let liveText = `⚡ *AUTOMATISCHE BLOCKCHAIN-ZAHLUNGSERKENNUNG AKTIV*\n\n` +
                `📋 *Order-ID:* \`#${order.order_id}\`\n` +
                `💶 *Euro-Betrag:* ${formatters.formatPrice(order.total_amount)}\n` +
                `💳 *Zahlungsart:* ${order.payment_method_name || 'Krypto'}\n\n`;

            if (wallet) {
                liveText += `📍 *Zahlungsadresse:*\n\`${wallet}\`\n_(Tippe zum Kopieren)_\n\n`;
            }

            if (order.crypto_amount) {
                liveText += `🪙 *Exakter Krypto-Betrag:* \`${order.crypto_amount}\`\n\n`;
            }

            if (order.payment_identifier) {
                liveText += `📌 *Deine Kennziffer:* \`${order.payment_identifier}\`\n\n`;
            }

            liveText += `⏳ *Status:* *Warten auf Blockchain-Zahlungseingang...*\n` +
                `🔎 *Letzter Blockchain-Check:* vor wenigen Sekunden\n` +
                `⏱️ *Verbleibende Zahlungsfrist:* \`30:00 Min.\` (Kurs & Reservierung)\n\n` +
                `_Das System scannt das Netzwerk automatisch im Hintergrund. Sobald 1 Bestätigung eingeht, wird deine Bestellung sofort freigeschaltet!_\n\n` +
                `💡 *Hinweis:* Die Eingabe der TX-ID ist optional, hilft dem System jedoch, deine Überweisung noch schneller zuzuordnen.`;

            const liveKb = {
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

            await uiHelper.updateOrSend(ctx, liveText, liveKb);

            const checkoutTickerService = require('../../services/checkoutTickerService');
            const messageId = ctx.callbackQuery?.message?.message_id;
            if (messageId) {
                checkoutTickerService.startCheckoutTicker(ctx.telegram, ctx.chat.id, messageId, order.order_id, order);
            }
        } catch (error) { console.error('Co Live Scan Error:', error.message); }
    });

    bot.action(/^co_qr_(.+)$/, async (ctx) => {
        ctx.answerCbQuery('📱 QR-Code wird generiert...').catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return;

            const paymentRepo = require('../../database/repositories/paymentRepo');
            const methods = await paymentRepo.getActivePaymentMethods();
            const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));

            const wallet = paymentMethod?.wallet_address || '';
            const rawCryptoStr = (order.crypto_amount || '').split(' ')[0] || '';
            const symbol = (paymentMethod?.crypto_symbol || 'BTC').toLowerCase();

            let scheme = symbol;
            if (symbol === 'btc') scheme = 'bitcoin';
            if (symbol === 'ltc') scheme = 'litecoin';
            if (symbol === 'eth') scheme = 'ethereum';
            if (symbol === 'sol') scheme = 'solana';

            let qrUri = wallet;
            if (wallet && rawCryptoStr) {
                qrUri = `${scheme}:${wallet}?amount=${rawCryptoStr}`;
            }

            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrUri)}`;

            const caption = `📱 *ZAHLUNGS-QR-CODE FÜR ORDER #${order.order_id}*\n\n` +
                `💳 *Zahlungsart:* ${order.payment_method_name || symbol.toUpperCase()}\n` +
                `📍 *Adresse:* \`${wallet}\`\n` +
                `🪙 *Betrag:* \`${order.crypto_amount || 'N/A'}\`\n\n` +
                `_Scanne diesen QR-Code mit deiner Crypto Wallet App, um Adresse & Betrag direkt zu übernehmen!_`;

            await ctx.replyWithPhoto({ url: qrUrl }, {
                caption,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]]
                }
            });
        } catch (error) {
            console.error('QR Code Generation Error:', error.message);
            ctx.reply('❌ Fehler beim Generieren des QR-Codes.');
        }
    });

    bot.action(/^co_copy_wallet_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const paymentRepo = require('../../database/repositories/paymentRepo');
            const methods = await paymentRepo.getActivePaymentMethods();
            const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));
            const wallet = paymentMethod?.wallet_address;

            if (wallet) {
                await ctx.answerCbQuery(`📍 Wallet-Adresse:\n${wallet}`, { show_alert: true }).catch(() => {});
                await ctx.reply(`📍 *Zahlungsadresse (Kopierbar):*\n\`${wallet}\``, { parse_mode: 'Markdown' });
            } else {
                ctx.answerCbQuery('Keine Wallet-Adresse hinterlegt.', { show_alert: true }).catch(() => {});
            }
        } catch (error) { console.error('Copy Wallet Error:', error.message); }
    });

    bot.action(/^co_copy_amount_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const cryptoStr = order.crypto_amount || '';
            if (cryptoStr) {
                await ctx.answerCbQuery(`🪙 Exakter Betrag:\n${cryptoStr}`, { show_alert: true }).catch(() => {});
                await ctx.reply(`🪙 *Exakter Krypto-Betrag (Kopierbar):*\n\`${cryptoStr}\``, { parse_mode: 'Markdown' });
            } else {
                ctx.answerCbQuery('Kein Krypto-Betrag vorhanden.', { show_alert: true }).catch(() => {});
            }
        } catch (error) { console.error('Copy Amount Error:', error.message); }
    });

    bot.action('cancel_txid', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingTxId = null;
        await ctx.reply('❌ TX-ID Eingabe abgebrochen.', {
            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
        });
    });

    // ─── 8. SUPPORT (PING & KONTAKT) ─────────────────────────────────────────
    bot.action(/^cust_ping_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const canPing = await userRepo.canPing(userId);
            if (!canPing) return ctx.answerCbQuery(texts.getPingCooldown().replace('⏰ ', ''), { show_alert: true });

            await userRepo.setPingTimestamp(userId);
            notificationService.notifyAdminsPing({ userId, username: ctx.from.username || 'Kunde', orderId }).catch(() => {});
            ctx.answerCbQuery('✅ Ping gesendet!').catch(() => {});
        } catch (error) { console.error('Ping Error:', error.message); }
    });

    bot.action(/^cust_contact_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const canContact = await userRepo.canContact(ctx.from.id);
            if (!canContact) return ctx.answerCbQuery(texts.getContactCooldown().replace('⏰ ', ''), { show_alert: true });
            ctx.answerCbQuery().catch(() => {});
            await ctx.scene.enter('contactScene', { orderId });
        } catch (error) { console.error('Contact Error:', error.message); }
    });

    // ─── 9. FEEDBACK-SYSTEM (MIT PAGINIERUNG) ────────────────────────────────
    bot.action(/^view_feedbacks(?:_(\d+))?$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const page = ctx.match && ctx.match[1] ? parseInt(ctx.match[1]) : 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const stats = await feedbackRepo.getFeedbackStats();
            const { data: feedbacks, count: totalFeedbacks } = await feedbackRepo.getApprovedFeedbacks(limit, offset);

            let text = '';
            const inline_keyboard = [];

            if (!feedbacks || feedbacks.length === 0) {
                text = texts.getPublicFeedbacksEmpty();
            } else {
                text = texts.getPublicFeedbacksHeader(stats.average, stats.total);
                feedbacks.forEach(fb => {
                    text += `${'⭐'.repeat(fb.rating)} - *${fb.username}*\n${fb.comment ? `_"${fb.comment}"_` : ''}\n\n`;
                });

                const totalPages = Math.ceil(totalFeedbacks / limit);
                if (totalPages > 1) {
                    const navRow = [];
                    if (page > 1) navRow.push({ text: '⬅️', callback_data: `view_feedbacks_${page - 1}` });
                    navRow.push({ text: `Seite ${page} / ${totalPages}`, callback_data: 'ignore_click' });
                    if (page < totalPages) navRow.push({ text: '➡️', callback_data: `view_feedbacks_${page + 1}` });
                    inline_keyboard.push(navRow);
                }
            }

            inline_keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } }).catch(() => {
                ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });
            });
        } catch (error) { console.error('View Feedbacks Error:', error.message); }
    });

    bot.action(/^enter_optional_txid_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingTxId = orderId;

            const text = `🔑 *TX-ID / ZAHLUNGSBELEG EINGEBEN* (Optional)\n\n` +
                `Bitte sende jetzt deine Transaktions-ID (TX-Hash) als Text in den Chat:\n\n` +
                `💡 *Hinweis:* Die Eingabe ist optional, hilft dem System jedoch, deine Überweisung noch schneller auf der Blockchain zuzuordnen.`;

            await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_txid' }]] }
            });
        } catch (error) { console.error('Enter Optional TxId Error:', error.message); }
    });

    bot.action('ignore_click', (ctx) => ctx.answerCbQuery().catch(() => {}));

    bot.action(/^start_feedback_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const alreadyDone = await feedbackRepo.hasUserAlreadyFeedbacked(orderId).catch(() => false);
            if (alreadyDone) {
                return ctx.reply('⚠️ Du hast für diese Bestellung bereits ein Feedback abgegeben. Vielen Dank!', { parse_mode: 'Markdown' });
            }
            await ctx.scene.enter('feedbackScene', { orderId });
        } catch (error) {}
    });

    // ─── 10. MESSAGE HANDLER (TX-ID SAMMLER & ECHTZEIT-VALIDIERUNG) ─────────
    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            return next();
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            try {
                const order = await orderRepo.getOrderByOrderId(orderId);
                if (!order) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);

                const paymentRepo = require('../../database/repositories/paymentRepo');
                const cryptoPaymentService = require('../../services/cryptoPaymentService');
                const methods = await paymentRepo.getActivePaymentMethods();
                const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));

                const symbol = paymentMethod?.crypto_symbol || 'BTC';
                const wallet = paymentMethod?.wallet_address;

                await orderRepo.updateOrderTxId(orderId, input);

                if (wallet && paymentMethod?.auto_verify) {
                    await ctx.reply(`🔎 *TX-ID empfangen:* \`${input}\`\n\nPrüfe Transaktion auf der Blockchain (${symbol})...`, { parse_mode: 'Markdown' });

                    const verification = await cryptoPaymentService.validateSpecificTxId(symbol, wallet, input, order.crypto_amount, order.payment_identifier);

                    if (verification.valid && verification.confirmed) {
                        await cryptoPaymentService.fulfillOrderAutomatically(bot, order, input, symbol);
                        await ctx.reply(`⚡ *Zahlung erfolgreich verifiziert!*\n\nDeine Transaktion \`${input}\` ist auf der Blockchain bestätigt. Die Ware wurde freigeschaltet!`, {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                        });
                        return;
                    } else if (verification.valid && !verification.confirmed) {
                        await orderRepo.updateOrderStatus(orderId, 'bezahlt_pending');
                        await ctx.reply(`⏳ *Transaktion im Netzwerk gefunden!*\n\nTX-ID: \`${input}\` ist unbestätigt (0 Bestätigungen). Das System wartet auf 1 Bestätigung und schaltet deine Bestellung danach automatisch frei!`, {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                        });
                        return;
                    } else {
                        await ctx.reply(`ℹ️ *TX-ID hinterlegt!*\n\nTX-ID: \`${input}\` wurde gespeichert (${verification.reason}).\n\n_Der automatische Scanner prüft das Netzwerk weiter im Hintergrund._`, {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                        });
                        notificationService.notifyAdminsTxId({ orderId, userId: ctx.from.id, username: ctx.from.username || 'Kunde', txId: input }).catch(() => {});
                        return;
                    }
                }

                await ctx.reply(texts.getTxIdConfirmed(orderId), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                });
                notificationService.notifyAdminsTxId({ orderId, userId: ctx.from.id, username: ctx.from.username || 'Kunde', txId: input }).catch(() => {});
            } catch (error) {
                console.error('TX-ID Handler Error:', error.message);
                ctx.reply('❌ Fehler beim Speichern.');
            }
            return;
        }
        return next();
    });
};
