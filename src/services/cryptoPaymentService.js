/**
 * cryptoPaymentService.js – Multi-Chain Krypto-Zahlungsscanner (BTC, LTC, ETH, SOL)
 * mit 5% Unterzahlungs-Toleranz und automatischer Tresor-Auslieferung
 * © 2026 t.me/autoacts
 */

const supabase = require('../database/supabaseClient');
const orderRepo = require('../database/repositories/orderRepo');
const deliverableRepo = require('../database/repositories/deliverableRepo');
const notificationService = require('./notificationService');
const cryptoExchangeService = require('./cryptoExchangeService');
const formatters = require('../utils/formatters');
const https = require('https');

// Rate Limit Guard: Scanne max. 1 Bestellung alle 15 Sekunden
const SCAN_INTERVAL_MS = 15000;
let isRunning = false;
let scanTimer = null;

function fetchJson(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { headers: { 'User-Agent': 'TGShopBot-MultiScanner/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

/**
 * BTC Scanner via Mempool.space
 */
async function checkBtcAddress(address, identifier, expectedCrypto = null) {
    const url = `https://mempool.space/api/address/${address}/txs`;
    const txs = await fetchJson(url);
    if (!Array.isArray(txs)) return null;

    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    for (const tx of txs) {
        if (!tx.status || !tx.status.confirmed) continue;
        if (tx.vout && Array.isArray(tx.vout)) {
            for (const out of tx.vout) {
                if (out.scriptpubkey_address === address) {
                    const receivedSat = out.value;
                    const receivedBtc = parseFloat((receivedSat / 100000000).toFixed(8));
                    
                    if (expectedClean && Math.abs(receivedBtc - expectedClean) < 0.00000005) {
                        return { txId: tx.txid, confirmations: 1, receivedCrypto: receivedBtc.toFixed(8) };
                    }
                    if (identifier && String(receivedSat).includes(String(identifier))) {
                        return { txId: tx.txid, confirmations: 1, receivedCrypto: receivedBtc.toFixed(8) };
                    }
                    if (expectedClean && Math.abs(receivedBtc - expectedClean) / expectedClean <= 0.05) {
                        return { txId: tx.txid, confirmations: 1, receivedCrypto: receivedBtc.toFixed(8) };
                    }
                }
            }
        }
    }
    return null;
}

/**
 * LTC Scanner via Blockcypher Public API
 */
async function checkLtcAddress(address, identifier, expectedCrypto = null) {
    const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/full`;
    const data = await fetchJson(url);
    if (!data || !Array.isArray(data.txs)) return null;

    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    for (const tx of data.txs) {
        if (!tx.confirmations || tx.confirmations < 1) continue;
        if (tx.outputs && Array.isArray(tx.outputs)) {
            for (const out of tx.outputs) {
                if (out.addresses && out.addresses.includes(address)) {
                    const receivedSat = out.value;
                    const receivedLtc = parseFloat((receivedSat / 100000000).toFixed(8));

                    if (expectedClean && Math.abs(receivedLtc - expectedClean) < 0.00000005) {
                        return { txId: tx.hash, confirmations: tx.confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                    }
                    if (identifier && String(receivedSat).includes(String(identifier))) {
                        return { txId: tx.hash, confirmations: tx.confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                    }
                    if (expectedClean && Math.abs(receivedLtc - expectedClean) / expectedClean <= 0.05) {
                        return { txId: tx.hash, confirmations: tx.confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                    }
                }
            }
        }
    }
    return null;
}

/**
 * ETH Scanner via Blockscout Public API
 */
async function checkEthAddress(address, identifier, expectedCrypto = null) {
    const url = `https://eth.blockscout.com/api?module=account&action=txlist&address=${address}`;
    const data = await fetchJson(url);
    if (!data || !Array.isArray(data.result)) return null;

    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    for (const tx of data.result) {
        if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
            if (parseInt(tx.confirmations || '0') >= 1) {
                const ethValue = parseFloat((parseFloat(tx.value) / 1e18).toFixed(7));
                if (expectedClean && Math.abs(ethValue - expectedClean) < 0.0000005) {
                    return { txId: tx.hash, confirmations: parseInt(tx.confirmations), receivedCrypto: ethValue.toFixed(7) };
                }
                if (identifier && ethValue.toFixed(7).includes(String(identifier))) {
                    return { txId: tx.hash, confirmations: parseInt(tx.confirmations), receivedCrypto: ethValue.toFixed(7) };
                }
                if (expectedClean && Math.abs(ethValue - expectedClean) / expectedClean <= 0.05) {
                    return { txId: tx.hash, confirmations: parseInt(tx.confirmations), receivedCrypto: ethValue.toFixed(7) };
                }
            }
        }
    }
    return null;
}

/**
 * SOL Scanner via Solscan Public API
 */
async function checkSolAddress(address, identifier, expectedCrypto = null) {
    const url = `https://public-api.solscan.io/account/transactions?account=${address}&limit=10`;
    const txs = await fetchJson(url);
    if (!Array.isArray(txs)) return null;

    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    for (const tx of txs) {
        if (tx.status === 'Success') {
            const solVal = parseFloat(((tx.lamport || 0) / 1e9).toFixed(7));
            if (expectedClean && Math.abs(solVal - expectedClean) < 0.0000005) {
                return { txId: tx.txHash, confirmations: 1, receivedCrypto: solVal.toFixed(7) };
            }
            if (identifier && solVal.toFixed(7).includes(String(identifier))) {
                return { txId: tx.txHash, confirmations: 1, receivedCrypto: solVal.toFixed(7) };
            }
            if (expectedClean && Math.abs(solVal - expectedClean) / expectedClean <= 0.05) {
                return { txId: tx.txHash, confirmations: 1, receivedCrypto: solVal.toFixed(7) };
            }
        }
    }
    return null;
}

/**
 * Haupt-Scanschleife für alle ausstehenden Krypto-Bestellungen
 */
async function scanPendingOrders(bot) {
    if (isRunning) return;
    isRunning = true;

    try {
        const { data: pendingOrders, error } = await supabase
            .from('orders')
            .select('*')
            .in('status', ['offen', 'bezahlt_pending', 'nachzahlung_erforderlich'])
            .not('payment_identifier', 'is', null);

        if (error || !pendingOrders || pendingOrders.length === 0) {
            isRunning = false;
            return;
        }

        const order = pendingOrders[0];
        const paymentRepo = require('../database/repositories/paymentRepo');
        const methods = await paymentRepo.getActivePaymentMethods();
        const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));

        if (!paymentMethod || !paymentMethod.auto_verify || !paymentMethod.wallet_address) {
            isRunning = false;
            return;
        }

        const symbol = (paymentMethod.crypto_symbol || 'BTC').toUpperCase();
        let match = null;

        if (symbol === 'BTC') {
            match = await checkBtcAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
        } else if (symbol === 'LTC') {
            match = await checkLtcAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
        } else if (symbol === 'ETH') {
            match = await checkEthAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
        } else if (symbol === 'SOL') {
            match = await checkSolAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
        }

        if (match && match.confirmations >= 1) {
            console.log(`[CryptoScanner] MATCH für Bestellung #${order.order_id}! TX: ${match.txId} (${symbol})`);

            await orderRepo.updateOrderTxId(order.order_id, match.txId);
            await orderRepo.updateReceivedCryptoAmount(order.order_id, match.receivedCrypto);

            // Unterzahlungs- & Toleranzprüfung (5% Schwankungsbreite)
            const expectedNum = parseFloat((order.crypto_amount || '0').replace(/[^0-9.]/g, '')) || 0;
            const receivedNum = parseFloat(match.receivedCrypto) || expectedNum;
            const rate = order.crypto_rate || (await cryptoExchangeService.getCryptoRateInEur(symbol));

            const tolerance = cryptoExchangeService.checkUnderpaymentTolerance(expectedNum, receivedNum, rate);

            if (!tolerance.isWithinTolerance) {
                // UNTERZAHLUNG > 5%: Nachzahlung anfordern!
                await orderRepo.updateOrderStatus(order.order_id, 'nachzahlung_erforderlich');
                await orderRepo.addAdminNote(order.order_id, 'System (Blockchain Auto-Verify)', `Unterzahlung erkannt: Empfangen ${receivedNum} ${symbol}, gefordert ${expectedNum} ${symbol} (Differenz: ${tolerance.diffPercent}%).`);

                const customerMsg = `⚠️ *Teilzahlung auf der Blockchain empfangen!*\n\n` +
                    `Bestellung \`#${order.order_id}\`:\n` +
                    `Du hast \`${receivedNum} ${symbol}\` überwiesen. Es fehlen jedoch mehr als 5 % zum geforderten Betrag (\`${expectedNum} ${symbol}\`).\n\n` +
                    `💰 *Bitte überweise die verbleibende Differenz:*\n` +
                    `Exakt \`${tolerance.missingCrypto} ${symbol}\` (~${tolerance.missingEuro} €)\n` +
                    `an: \`${paymentMethod.wallet_address}\`\n\n` +
                    `_Sobald der Restbetrag bestätigt ist, wird deine Bestellung sofort freigeschaltet!_`;

                await bot.telegram.sendMessage(order.user_id, customerMsg, { parse_mode: 'Markdown' }).catch(() => {});

                notificationService.notifyAdminsTxId({
                    orderId: order.order_id,
                    userId: order.user_id,
                    txId: match.txId,
                    username: 'Auto-Scanner (Unterzahlung)',
                    total: formatters.formatPrice(order.total_amount)
                }).catch(() => {});

                isRunning = false;
                return;
            }

            // Atomic Status Re-Check: Verhindere Doppel-Auslieferung durch synchrone Admin-Bestätigung
            const freshOrder = await orderRepo.getOrderByOrderId(order.order_id);
            if (!freshOrder || freshOrder.status === 'abgeschlossen') {
                console.log(`[CryptoScanner] Order #${order.order_id} bereits abgeschlossen. Überspringe automatische Auslieferung.`);
                isRunning = false;
                return;
            }

            let allHasStock = true;
            if (order.details && order.details.length > 0) {
                for (const item of order.details) {
                    const prodId = item.product_id || item.id;
                    const count = await deliverableRepo.getAvailableCount(prodId);
                    if (count < (item.quantity || 1)) {
                        allHasStock = false;
                        break;
                    }
                }
            } else {
                allHasStock = false;
            }

            if (allHasStock) {
                // AUTOMATISCHE TRESOR-AUSLIEFERUNG
                const allDeliveredLines = [];
                for (const item of order.details) {
                    const prodId = item.product_id || item.id;
                    const needed = item.quantity || 1;
                    const result = await deliverableRepo.popAvailableDeliverables(prodId, needed, order.order_id, order.user_id);
                    if (result.success) {
                        allDeliveredLines.push(...result.items);
                    }
                }

                const formattedContent = allDeliveredLines.map(line => `▪️ ${line}`).join('\n');
                const customerMsg = `⚡ *Krypto-Zahlung automatisch bestätigt!* (${symbol})\n\n` +
                    `Bestellung \`#${order.order_id}\` wurde auf der Blockchain bestätigt.\n\n` +
                    `📦 *Deine Auslieferung:*\n${formattedContent}`;

                const tresorKeyboard = {
                    inline_keyboard: [[{ text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${order.order_id}`, style: 'success' }]]
                };

                await bot.telegram.sendMessage(order.user_id, customerMsg, { parse_mode: 'Markdown', reply_markup: tresorKeyboard }).catch(() => {});

                await orderRepo.setDigitalDelivery(order.order_id, formattedContent);
                await orderRepo.updateOrderStatus(order.order_id, 'abgeschlossen');
                await orderRepo.addAdminNote(order.order_id, 'System (Blockchain Auto-Verify)', `Zahlung bestätigt (TX: ${match.txId}) & ${allDeliveredLines.length} Items geliefert.`);

                notificationService.notifyAdminsTxId({
                    orderId: order.order_id,
                    userId: order.user_id,
                    txId: match.txId,
                    username: 'Auto-Scanner',
                    total: formatters.formatPrice(order.total_amount)
                }).catch(() => {});
            } else {
                // MANUELLE AUSLIEFERUNG FÜR PHYSICAL/MANUAL ITEMS
                await orderRepo.updateOrderStatus(order.order_id, 'in_bearbeitung');
                await orderRepo.addAdminNote(order.order_id, 'System (Blockchain Auto-Verify)', `Zahlung per Blockchain bestätigt (TX: ${match.txId}). Auslieferung manuell erforderlich.`);

                const customerMsg = `⚡ *Krypto-Zahlung bestätigt!* (${symbol})\n\n` +
                    `Deine Zahlung für Bestellung \`#${order.order_id}\` wurde auf der Blockchain bestätigt.\n` +
                    `Der Shop-Admin bereitet deine Auslieferung vor.`;

                await bot.telegram.sendMessage(order.user_id, customerMsg, { parse_mode: 'Markdown' }).catch(() => {});

                notificationService.notifyAdminsTxId({
                    orderId: order.order_id,
                    userId: order.user_id,
                    txId: match.txId,
                    username: 'Auto-Scanner',
                    total: formatters.formatPrice(order.total_amount)
                }).catch(() => {});
            }
        }
    } catch (error) {
        console.error('[CryptoScanner] Multi-Chain Scanner Error:', error.message);
    } finally {
        isRunning = false;
    }
}

async function validateSpecificTxId(symbol, walletAddress, txId, expectedCrypto = null, identifier = null) {
    if (!txId || !walletAddress) return { valid: false, reason: 'Ungültige Parameter' };

    const cleanTxId = txId.trim();
    const cleanWallet = walletAddress.trim().toLowerCase();
    const sym = (symbol || 'BTC').toUpperCase().trim();

    try {
        if (sym === 'BTC') {
            const url = `https://mempool.space/api/tx/${cleanTxId}`;
            const tx = await fetchJson(url);
            if (!tx || !tx.txid) return { valid: false, reason: 'Transaktion im Bitcoin-Netzwerk noch nicht gefunden.' };

            const isConfirmed = tx.status && tx.status.confirmed;
            let receivedSat = 0;
            if (tx.vout && Array.isArray(tx.vout)) {
                for (const out of tx.vout) {
                    if (out.scriptpubkey_address && out.scriptpubkey_address.toLowerCase() === cleanWallet) {
                        receivedSat += (out.value || 0);
                    }
                }
            }
            if (receivedSat === 0) return { valid: false, reason: 'Zahlungsadresse ist nicht Empfänger dieser Transaktion.' };

            const receivedCrypto = (receivedSat / 100000000).toFixed(8);
            return {
                valid: true,
                confirmed: isConfirmed,
                confirmations: isConfirmed ? 1 : 0,
                receivedCrypto,
                txId: tx.txid
            };
        } else if (sym === 'LTC') {
            const url = `https://api.blockcypher.com/v1/ltc/main/txs/${cleanTxId}`;
            const tx = await fetchJson(url);
            if (!tx || !tx.hash) return { valid: false, reason: 'Transaktion im Litecoin-Netzwerk noch nicht gefunden.' };

            const confirmations = tx.confirmations || 0;
            let receivedSat = 0;
            if (tx.outputs && Array.isArray(tx.outputs)) {
                for (const out of tx.outputs) {
                    if (out.addresses && out.addresses.some(a => a.toLowerCase() === cleanWallet)) {
                        receivedSat += (out.value || 0);
                    }
                }
            }
            if (receivedSat === 0) return { valid: false, reason: 'Zahlungsadresse ist nicht Empfänger dieser Transaktion.' };

            const receivedCrypto = (receivedSat / 100000000).toFixed(8);
            return {
                valid: true,
                confirmed: confirmations >= 1,
                confirmations,
                receivedCrypto,
                txId: tx.hash
            };
        } else if (sym === 'ETH') {
            const url = `https://eth.blockscout.com/api?module=transaction&action=gettxinfo&txhash=${cleanTxId}`;
            const res = await fetchJson(url);
            const tx = res ? res.result : null;
            if (!tx || !tx.hash) return { valid: false, reason: 'Transaktion im Ethereum-Netzwerk noch nicht gefunden.' };

            const confirmations = parseInt(tx.confirmations || '0');
            const toAddress = (tx.to || '').toLowerCase();
            if (toAddress !== cleanWallet) return { valid: false, reason: 'Zahlungsadresse ist nicht Empfänger dieser Transaktion.' };

            const ethVal = (parseFloat(tx.value || '0') / 1e18).toFixed(7);
            return {
                valid: true,
                confirmed: confirmations >= 1,
                confirmations,
                receivedCrypto: ethVal,
                txId: tx.hash
            };
        } else if (sym === 'SOL') {
            const url = `https://public-api.solscan.io/transaction/${cleanTxId}`;
            const tx = await fetchJson(url);
            if (!tx || !tx.txHash) return { valid: false, reason: 'Transaktion im Solana-Netzwerk noch nicht gefunden.' };

            const isSuccess = tx.status === 'Success';
            const solVal = ((tx.lamport || 0) / 1e9).toFixed(7);
            return {
                valid: true,
                confirmed: isSuccess,
                confirmations: isSuccess ? 1 : 0,
                receivedCrypto: solVal,
                txId: tx.txHash
            };
        }
    } catch (e) {
        console.error('[CryptoPaymentService] TX-ID Validation Error:', e.message);
    }

    return { valid: false, reason: 'Verifizierung derzeit nicht möglich. Der automatische Scanner prüft im Hintergrund weiter.' };
}

async function fulfillOrderAutomatically(bot, order, txId, symbol = 'BTC') {
    let allHasStock = true;
    if (order.details && order.details.length > 0) {
        for (const item of order.details) {
            const prodId = item.product_id || item.id;
            const count = await deliverableRepo.getAvailableCount(prodId);
            if (count < (item.quantity || 1)) {
                allHasStock = false;
                break;
            }
        }
    } else {
        allHasStock = false;
    }

    if (allHasStock) {
        const allDeliveredLines = [];
        for (const item of order.details) {
            const prodId = item.product_id || item.id;
            const needed = item.quantity || 1;
            const result = await deliverableRepo.popAvailableDeliverables(prodId, needed, order.order_id, order.user_id);
            if (result.success) {
                allDeliveredLines.push(...result.items);
            }
        }

        const formattedContent = allDeliveredLines.map(line => `▪️ ${line}`).join('\n');
        const customerMsg = `⚡ *Krypto-Zahlung erfolgreich verifiziert!* (${symbol})\n\n` +
            `Bestellung \`#${order.order_id}\` wurde auf der Blockchain bestätigt!\n\n` +
            `📦 *Deine Auslieferung:*\n${formattedContent}`;

        const tresorKeyboard = {
            inline_keyboard: [[{ text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${order.order_id}`, style: 'success' }]]
        };

        if (bot) {
            await bot.telegram.sendMessage(order.user_id, customerMsg, { parse_mode: 'Markdown', reply_markup: tresorKeyboard }).catch(() => {});
        }

        await orderRepo.setDigitalDelivery(order.order_id, formattedContent);
        await orderRepo.updateOrderStatus(order.order_id, 'abgeschlossen');
        await orderRepo.addAdminNote(order.order_id, 'System (TX-ID Verify)', `Zahlung bestätigt (TX: ${txId}) & ${allDeliveredLines.length} Items geliefert.`);

        notificationService.notifyAdminsTxId({
            orderId: order.order_id,
            userId: order.user_id,
            txId: txId,
            username: 'Kunde (TX-ID Verified)',
            total: formatters.formatPrice(order.total_amount)
        }).catch(() => {});
    } else {
        await orderRepo.updateOrderStatus(order.order_id, 'in_bearbeitung');
        await orderRepo.addAdminNote(order.order_id, 'System (TX-ID Verify)', `Zahlung per TX-ID bestätigt (TX: ${txId}). Manuelle Auslieferung erforderlich.`);

        const customerMsg = `⚡ *Krypto-Zahlung verifiziert!* (${symbol})\n\n` +
            `Deine Zahlung für Bestellung \`#${order.order_id}\` wurde auf der Blockchain verifiziert!\n` +
            `Der Shop-Admin bereitet deine Auslieferung vor.`;

        if (bot) {
            await bot.telegram.sendMessage(order.user_id, customerMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }

        notificationService.notifyAdminsTxId({
            orderId: order.order_id,
            userId: order.user_id,
            txId: txId,
            username: 'Kunde (TX-ID Verified)',
            total: formatters.formatPrice(order.total_amount)
        }).catch(() => {});
    }
}

let masterAuditTimer = null;

async function runMaster15MinAudit(bot) {
    try {
        console.log('[MasterAudit] 15-Minuten Blockchain-Check gestartet für alle Hinterlegten Wallets...');
        const paymentRepo = require('../database/repositories/paymentRepo');
        const methods = await paymentRepo.getActivePaymentMethods();
        if (!methods || methods.length === 0) return;

        const { data: openOrders } = await supabase
            .from('orders')
            .select('*')
            .in('status', ['offen', 'bezahlt_pending', 'nachzahlung_erforderlich'])
            .not('payment_identifier', 'is', null);

        if (!openOrders || openOrders.length === 0) return;

        for (const order of openOrders) {
            const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));
            if (!paymentMethod || !paymentMethod.wallet_address) continue;

            const symbol = (paymentMethod.crypto_symbol || 'BTC').toUpperCase();
            let match = null;

            if (symbol === 'BTC') {
                match = await checkBtcAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
            } else if (symbol === 'LTC') {
                match = await checkLtcAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
            } else if (symbol === 'ETH') {
                match = await checkEthAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
            } else if (symbol === 'SOL') {
                match = await checkSolAddress(paymentMethod.wallet_address, order.payment_identifier, order.crypto_amount);
            }

            if (match) {
                console.log(`[MasterAudit] Transaktion erkannt für Bestellung #${order.order_id} (TX: ${match.txId})`);

                const masterMsg = `🚨 *MASTER BLOCKCHAIN AUDIT (15-MIN-CHECK)*\n\n` +
                    `Zahlungseingang auf der Blockchain festgestellt!\n\n` +
                    `📋 *Bestellung:* \`#${order.order_id}\`\n` +
                    `👤 *Kunde (User-ID):* \`${order.user_id}\`\n` +
                    `💶 *Euro-Wert:* ${formatters.formatPrice(order.total_amount)}\n` +
                    `🪙 *Krypto-Betrag:* \`${match.receivedCrypto} ${symbol}\`\n` +
                    `📌 *Kennziffer-Match:* \`${order.payment_identifier}\`\n` +
                    `🔗 *TX-Hash:* \`${match.txId}\`\n\n` +
                    `Möchtest du diese Zahlung bestätigen und die Auslieferung für den Kunden freischalten?`;

                const keyboard = {
                    inline_keyboard: [
                        [{ text: `✅ Zahlung bestätigen (#${order.order_id})`, callback_data: `master_confirm_pay_${order.order_id}`, style: 'success' }],
                        [{ text: `📋 Bestellung #${order.order_id} öffnen`, callback_data: `admin_order_detail_${order.order_id}` }]
                    ]
                };

                const masterId = config.MASTER_ADMIN_ID;
                if (bot && masterId) {
                    await bot.telegram.sendMessage(masterId, masterMsg, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('[MasterAudit] Error:', e.message);
    }
}

const cryptoPaymentService = {
    start(bot) {
        if (scanTimer) clearInterval(scanTimer);
        if (masterAuditTimer) clearInterval(masterAuditTimer);

        console.log('[CryptoScanner] Multi-Chain Krypto-Zahlungsscanner gestartet (BTC, LTC, ETH, SOL).');
        scanTimer = setInterval(() => scanPendingOrders(bot), SCAN_INTERVAL_MS);

        const AUDIT_INTERVAL_MS = 15 * 60 * 1000; // 15 Minuten
        masterAuditTimer = setInterval(() => runMaster15MinAudit(bot), AUDIT_INTERVAL_MS);
        runMaster15MinAudit(bot).catch(() => {});
    },
    stop() {
        if (scanTimer) clearInterval(scanTimer);
        if (masterAuditTimer) clearInterval(masterAuditTimer);
        console.log('[CryptoScanner] Krypto-Zahlungsscanner gestoppt.');
    },
    validateSpecificTxId,
    fulfillOrderAutomatically,
    runMaster15MinAudit
};

module.exports = cryptoPaymentService;
