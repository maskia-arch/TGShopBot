/**
 * cryptoPaymentService.js – Multi-Chain Krypto-Zahlungsscanner (BTC, LTC, ETH, SOL)
 * mit 5% Unterzahlungs-Toleranz, Mempool-Erkennung und robuster automatischer Tresor-Auslieferung
 * © 2026 t.me/autoacts
 */

const supabase = require('../database/supabaseClient');
const orderRepo = require('../database/repositories/orderRepo');
const deliverableRepo = require('../database/repositories/deliverableRepo');
const productRepo = require('../database/repositories/productRepo');
const notificationService = require('./notificationService');
const cryptoExchangeService = require('./cryptoExchangeService');
const uiHelper = require('../utils/uiHelper');
const formatters = require('../utils/formatters');
const config = require('../config');
const https = require('https');

// Rate Limit Guard: Scanne Bestellungen im Intervall (15s)
const SCAN_INTERVAL_MS = 15000;
let isRunning = false;
let scanTimer = null;
let currentScanOrderIndex = 0;

/**
 * Universeller JSON HTTP-GET Client mit Timeout
 */
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
 * Universeller JSON HTTP-POST Client mit Timeout (z. B. für Solana JSON-RPC)
 */
function postJson(url, body) {
    return new Promise((resolve) => {
        try {
            const u = new URL(url);
            const data = JSON.stringify(body);
            const req = https.request({
                hostname: u.hostname,
                port: u.port || 443,
                path: u.pathname + (u.search || ''),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'User-Agent': 'TGShopBot-MultiScanner/1.0'
                }
            }, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(JSON.parse(resData));
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
            req.write(data);
            req.end();
        } catch (err) {
            resolve(null);
        }
    });
}

/**
 * BTC Scanner via Mempool.space (unterstützt bestätigte und unbestätigte Transaktionen)
 */
async function checkBtcAddress(address, identifier, expectedCrypto = null) {
    const url = `https://mempool.space/api/address/${address}/txs`;
    const txs = await fetchJson(url);
    if (!Array.isArray(txs)) return null;

    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    for (const tx of txs) {
        if (!tx.vout || !Array.isArray(tx.vout)) continue;
        const isConfirmed = !!(tx.status && tx.status.confirmed);
        const confirmations = isConfirmed ? 1 : 0;

        for (const out of tx.vout) {
            if (out.scriptpubkey_address && out.scriptpubkey_address.toLowerCase() === address.toLowerCase()) {
                const receivedSat = out.value;
                const receivedBtc = parseFloat((receivedSat / 100000000).toFixed(8));

                if (expectedClean && Math.abs(receivedBtc - expectedClean) < 0.00000005) {
                    return { txId: tx.txid, confirmations, receivedCrypto: receivedBtc.toFixed(8) };
                }
                if (identifier && String(receivedSat).includes(String(identifier))) {
                    return { txId: tx.txid, confirmations, receivedCrypto: receivedBtc.toFixed(8) };
                }
                if (expectedClean && Math.abs(receivedBtc - expectedClean) / expectedClean <= 0.05) {
                    return { txId: tx.txid, confirmations, receivedCrypto: receivedBtc.toFixed(8) };
                }
            }
        }
    }
    return null;
}

/**
 * LTC Scanner via Litecoinspace (Mempool-Engine) mit Blockcypher als Fallback
 */
async function checkLtcAddress(address, identifier, expectedCrypto = null) {
    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    // 1. Primär: Litecoinspace.org (Open Source Mempool, keine harten Rate-Limits)
    try {
        const mempoolUrl = `https://litecoinspace.org/api/address/${address}/txs`;
        const txs = await fetchJson(mempoolUrl);
        if (Array.isArray(txs)) {
            for (const tx of txs) {
                if (!tx.vout || !Array.isArray(tx.vout)) continue;
                const isConfirmed = !!(tx.status && tx.status.confirmed);
                const confirmations = isConfirmed ? 1 : 0;

                for (const out of tx.vout) {
                    if (out.scriptpubkey_address && out.scriptpubkey_address.toLowerCase() === address.toLowerCase()) {
                        const receivedSat = out.value;
                        const receivedLtc = parseFloat((receivedSat / 100000000).toFixed(8));

                        if (expectedClean && Math.abs(receivedLtc - expectedClean) < 0.00000005) {
                            return { txId: tx.txid, confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                        }
                        if (identifier && String(receivedSat).includes(String(identifier))) {
                            return { txId: tx.txid, confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                        }
                        if (expectedClean && Math.abs(receivedLtc - expectedClean) / expectedClean <= 0.05) {
                            return { txId: tx.txid, confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                        }
                    }
                }
            }
        }
    } catch (e) {}

    // 2. Sekundär Fallback: Blockcypher API
    try {
        const bcUrl = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/full`;
        const data = await fetchJson(bcUrl);
        if (data && Array.isArray(data.txs)) {
            for (const tx of data.txs) {
                if (!tx.outputs || !Array.isArray(tx.outputs)) continue;
                const confirmations = tx.confirmations || 0;

                for (const out of tx.outputs) {
                    if (out.addresses && out.addresses.some(a => a.toLowerCase() === address.toLowerCase())) {
                        const receivedSat = out.value;
                        const receivedLtc = parseFloat((receivedSat / 100000000).toFixed(8));

                        if (expectedClean && Math.abs(receivedLtc - expectedClean) < 0.00000005) {
                            return { txId: tx.hash, confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                        }
                        if (identifier && String(receivedSat).includes(String(identifier))) {
                            return { txId: tx.hash, confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                        }
                        if (expectedClean && Math.abs(receivedLtc - expectedClean) / expectedClean <= 0.05) {
                            return { txId: tx.hash, confirmations, receivedCrypto: receivedLtc.toFixed(8) };
                        }
                    }
                }
            }
        }
    } catch (e) {}

    return null;
}

/**
 * ETH Scanner via Blockscout Public API (mit Paginierung für maximale Performance)
 */
async function checkEthAddress(address, identifier, expectedCrypto = null) {
    const url = `https://eth.blockscout.com/api?module=account&action=txlist&address=${address}&page=1&offset=25`;
    const data = await fetchJson(url);
    if (!data || !Array.isArray(data.result)) return null;

    const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

    for (const tx of data.result) {
        if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
            const confs = parseInt(tx.confirmations || '0');
            const ethValue = parseFloat((parseFloat(tx.value) / 1e18).toFixed(7));

            if (expectedClean && Math.abs(ethValue - expectedClean) < 0.0000005) {
                return { txId: tx.hash, confirmations: confs, receivedCrypto: ethValue.toFixed(7) };
            }
            if (identifier && ethValue.toFixed(7).includes(String(identifier))) {
                return { txId: tx.hash, confirmations: confs, receivedCrypto: ethValue.toFixed(7) };
            }
            if (expectedClean && Math.abs(ethValue - expectedClean) / expectedClean <= 0.05) {
                return { txId: tx.hash, confirmations: confs, receivedCrypto: ethValue.toFixed(7) };
            }
        }
    }
    return null;
}

/**
 * SOL Scanner via offiziellem Solana JSON-RPC Endpoint (zuverlässig & ohne Solscan Abhängigkeit)
 */
async function checkSolAddress(address, identifier, expectedCrypto = null) {
    try {
        const sigRes = await postJson('https://api.mainnet-beta.solana.com', {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [address, { limit: 10 }]
        });

        if (!sigRes || !sigRes.data || !Array.isArray(sigRes.data.result)) {
            // Falls fetchJson-Struktur direkt zurückkam
            const resArray = Array.isArray(sigRes?.result) ? sigRes.result : null;
            if (!resArray) return null;
        }

        const signatures = sigRes.result || (sigRes.data && sigRes.data.result) || [];
        if (!Array.isArray(signatures) || signatures.length === 0) return null;

        const expectedClean = expectedCrypto ? parseFloat(String(expectedCrypto).replace(/[^0-9.]/g, '')) : null;

        for (const sigInfo of signatures) {
            if (sigInfo.err) continue; // Fehlgeschlagene Solana-Transaktion überspringen
            const sig = sigInfo.signature;
            if (!sig) continue;

            const txRes = await postJson('https://api.mainnet-beta.solana.com', {
                jsonrpc: '2.0',
                id: 2,
                method: 'getTransaction',
                params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            });

            const txData = txRes?.result || (txRes?.data && txRes.data.result);
            if (!txData || !txData.meta || txData.meta.err) continue;

            const accountKeys = txData.transaction?.message?.accountKeys || [];
            const idx = accountKeys.findIndex(k => {
                const pk = typeof k === 'string' ? k : k.pubkey;
                return pk && pk.toLowerCase() === address.toLowerCase();
            });

            if (idx === -1) continue;

            const pre = txData.meta.preBalances?.[idx] || 0;
            const post = txData.meta.postBalances?.[idx] || 0;
            const diffLamports = post - pre;

            if (diffLamports <= 0) continue; // Kein Zahlungseingang für diese Zieladresse

            const solVal = parseFloat((diffLamports / 1e9).toFixed(7));

            if (expectedClean && Math.abs(solVal - expectedClean) < 0.0000005) {
                return { txId: sig, confirmations: 1, receivedCrypto: solVal.toFixed(7) };
            }
            if (identifier && solVal.toFixed(7).includes(String(identifier))) {
                return { txId: sig, confirmations: 1, receivedCrypto: solVal.toFixed(7) };
            }
            if (expectedClean && Math.abs(solVal - expectedClean) / expectedClean <= 0.05) {
                return { txId: sig, confirmations: 1, receivedCrypto: solVal.toFixed(7) };
            }
        }
    } catch (e) {
        console.error('[CryptoScanner] SOL Check Error:', e.message);
    }
    return null;
}

/**
 * Scannt eine einzelne Krypto-Bestellung gegen die Blockchain
 */
async function scanSingleOrder(bot, order) {
    if (!order || !order.order_id) return null;

    const paymentRepo = require('../database/repositories/paymentRepo');
    const methods = await paymentRepo.getActivePaymentMethods();
    const paymentMethod = methods.find(m => m.name === order.payment_method_name || (order.payment_method_name && order.payment_method_name.includes(m.name)));

    if (!paymentMethod || !paymentMethod.auto_verify || !paymentMethod.wallet_address) {
        return null;
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

    if (!match) return null;

    // Transaktion gefunden, aber noch 0 Bestätigungen (im Mempool)
    if (match.confirmations === 0 && order.status === 'offen') {
        console.log(`[CryptoScanner] 0-Conf Transaktion im Mempool für Bestellung #${order.order_id}! TX: ${match.txId}`);
        await orderRepo.updateOrderTxId(order.order_id, match.txId);
        await orderRepo.updateOrderStatus(order.order_id, 'bezahlt_pending');
        await orderRepo.addAdminNote(order.order_id, 'System (Mempool Scanner)', `Transaktion im Netzwerk erkannt (TX: ${match.txId}). Warte auf 1 Bestätigung.`);
        return { status: 'pending', match };
    }

    if (match.confirmations >= 1) {
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

            if (bot) {
                await bot.telegram.sendMessage(order.user_id, customerMsg, { parse_mode: 'Markdown' }).catch(() => {});
            }

            notificationService.notifyAdminsTxId({
                orderId: order.order_id,
                userId: order.user_id,
                txId: match.txId,
                username: 'Auto-Scanner (Unterzahlung)',
                total: formatters.formatPrice(order.total_amount)
            }).catch(() => {});

            return { status: 'underpaid', match };
        }

        // Automatische Freischaltung & Tresor-Auslieferung ausführen
        await fulfillOrderAutomatically(bot, order, match.txId, symbol);
        return { status: 'fulfilled', match };
    }

    return null;
}

/**
 * Haupt-Scanschleife für alle ausstehenden Krypto-Bestellungen.
 * Verwendet Round-Robin-Batching, sodass ein unbezahlter Auftrag niemals die restliche Queue blockiert.
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

        const paymentRepo = require('../database/repositories/paymentRepo');
        const methods = await paymentRepo.getActivePaymentMethods();

        // Filtere Bestellungen heraus, deren Zahlungsart nicht auto_verify oder keine Krypto-Wallet hat
        const eligibleOrders = pendingOrders.filter(o => {
            const pm = methods.find(m => m.name === o.payment_method_name || (o.payment_method_name && o.payment_method_name.includes(m.name)));
            return pm && pm.auto_verify && pm.wallet_address;
        });

        if (eligibleOrders.length === 0) {
            isRunning = false;
            return;
        }

        // Scanne bis zu 3 Bestellungen pro Tick im Round-Robin-Verfahren
        const BATCH_SIZE = Math.min(3, eligibleOrders.length);
        for (let i = 0; i < BATCH_SIZE; i++) {
            currentScanOrderIndex = currentScanOrderIndex % eligibleOrders.length;
            const order = eligibleOrders[currentScanOrderIndex];
            currentScanOrderIndex++;

            if (order) {
                await scanSingleOrder(bot, order).catch(err => {
                    console.error(`[CryptoScanner] Scan-Fehler für #${order.order_id}:`, err.message);
                });
            }
        }
    } catch (error) {
        console.error('[CryptoScanner] Multi-Chain Scanner Error:', error.message);
    } finally {
        isRunning = false;
    }
}

/**
 * Validiert eine spezifische TX-ID auf der jeweiligen Blockchain
 */
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

            const isConfirmed = !!(tx.status && tx.status.confirmed);
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
            // 1. Primär: Litecoinspace Mempool-API
            try {
                const mempoolUrl = `https://litecoinspace.org/api/tx/${cleanTxId}`;
                const mtx = await fetchJson(mempoolUrl);
                if (mtx && mtx.txid) {
                    const isConfirmed = !!(mtx.status && mtx.status.confirmed);
                    let receivedSat = 0;
                    if (mtx.vout && Array.isArray(mtx.vout)) {
                        for (const out of mtx.vout) {
                            if (out.scriptpubkey_address && out.scriptpubkey_address.toLowerCase() === cleanWallet) {
                                receivedSat += (out.value || 0);
                            }
                        }
                    }
                    if (receivedSat > 0) {
                        const receivedCrypto = (receivedSat / 100000000).toFixed(8);
                        return {
                            valid: true,
                            confirmed: isConfirmed,
                            confirmations: isConfirmed ? 1 : 0,
                            receivedCrypto,
                            txId: mtx.txid
                        };
                    }
                }
            } catch (e) {}

            // 2. Sekundär: Blockcypher Fallback
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
            const txRes = await postJson('https://api.mainnet-beta.solana.com', {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [cleanTxId, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            });

            const txData = txRes?.result || (txRes?.data && txRes.data.result);
            if (!txData || !txData.meta) return { valid: false, reason: 'Transaktion im Solana-Netzwerk noch nicht gefunden.' };
            if (txData.meta.err) return { valid: false, reason: 'Transaktion auf Solana ist fehlgeschlagen (Error Status).' };

            const accountKeys = txData.transaction?.message?.accountKeys || [];
            const idx = accountKeys.findIndex(k => {
                const pk = typeof k === 'string' ? k : k.pubkey;
                return pk && pk.toLowerCase() === cleanWallet;
            });

            if (idx === -1) return { valid: false, reason: 'Zahlungsadresse ist nicht Empfänger dieser Transaktion.' };

            const pre = txData.meta.preBalances?.[idx] || 0;
            const post = txData.meta.postBalances?.[idx] || 0;
            const diffLamports = post - pre;

            if (diffLamports <= 0) return { valid: false, reason: 'Transaktion enthält keine Gutschrift an die Zahlungsadresse.' };

            const solVal = (diffLamports / 1e9).toFixed(7);
            return {
                valid: true,
                confirmed: true,
                confirmations: 1,
                receivedCrypto: solVal,
                txId: cleanTxId
            };
        }
    } catch (e) {
        console.error('[CryptoPaymentService] TX-ID Validation Error:', e.message);
    }

    return { valid: false, reason: 'Verifizierung derzeit nicht möglich. Der automatische Scanner prüft im Hintergrund weiter.' };
}

/**
 * Führt die automatische Auslieferung für eine bezahlte Bestellung durch
 */
async function fulfillOrderAutomatically(bot, order, txId, symbol = 'BTC') {
    // 1. Atomic Status Re-Check: Verhindere Doppel-Auslieferung
    const freshOrder = await orderRepo.getOrderByOrderId(order.order_id);
    if (!freshOrder || freshOrder.status === 'abgeschlossen' || freshOrder.auto_delivery_disabled) {
        console.log(`[FulfillOrder] Order #${order.order_id} bereits abgeschlossen oder automatische Lieferung deaktiviert. Überspringe.`);
        return;
    }

    let allHasStock = true;
    let stockDetails = [];
    const itemsToDeliver = [];
    const itemsToPop = [];

    if (freshOrder.details && freshOrder.details.length > 0) {
        for (const item of freshOrder.details) {
            let prodId = item.product_id || item.id;
            let available = await deliverableRepo.getAvailableItems(prodId);

            // Fallback: Falls cart item ID anstelle von product_id vorlag, suche über Produktname
            if (available.length === 0 && item.name) {
                const prod = await productRepo.getProductByName(item.name).catch(() => null);
                if (prod && prod.id && String(prod.id) !== String(prodId)) {
                    const fallbackAvail = await deliverableRepo.getAvailableItems(prod.id);
                    if (fallbackAvail.length > 0) {
                        prodId = prod.id;
                        available = fallbackAvail;
                    }
                }
            }

            const needed = item.quantity || 1;
            stockDetails.push({ name: item.name, count: available.length, needed });

            if (available.length < needed) {
                allHasStock = false;
            } else {
                const selected = available.slice(0, needed);
                itemsToDeliver.push(...selected.map(s => s.content));
                itemsToPop.push({ prodId, needed });
            }
        }
    } else {
        allHasStock = false;
    }

    if (allHasStock && itemsToDeliver.length > 0) {
        // Transaktionaler Versand an Kunden (mit Plaintext Fallback & Chunking)
        const sentSuccess = bot ? await uiHelper.sendSafeDeliveryMessage(bot.telegram, freshOrder.user_id, freshOrder.order_id, itemsToDeliver) : false;

        if (sentSuccess) {
            // ERST NACH ERFOLGREICHEM VERSAND: Atomare Entnahme & Purge aus dem Vorrat
            for (const popItem of itemsToPop) {
                await deliverableRepo.popAvailableDeliverables(popItem.prodId, popItem.needed, freshOrder.order_id, freshOrder.user_id);
            }

            const formattedContent = itemsToDeliver.map(line => line.startsWith('▪️ ') ? line : `▪️ ${line}`).join('\n');
            await orderRepo.setDigitalDelivery(freshOrder.order_id, formattedContent);
            await orderRepo.updateOrderStatus(freshOrder.order_id, 'abgeschlossen');
            await orderRepo.addAdminNote(freshOrder.order_id, 'System (Blockchain Auto-Verify)', `Zahlung bestätigt (TX: ${txId}) & ${itemsToDeliver.length} Items automatisch geliefert.`);

            notificationService.notifyAdminsTxId({
                orderId: freshOrder.order_id,
                userId: freshOrder.user_id,
                txId: txId,
                username: 'Auto-Scanner / TX-ID Verifiziert',
                total: formatters.formatPrice(freshOrder.total_amount)
            }).catch(() => {});
        } else {
            await orderRepo.updateOrderStatus(freshOrder.order_id, 'in_bearbeitung');
            await orderRepo.addAdminNote(freshOrder.order_id, 'System (Blockchain Auto-Verify)', `Zahlung verifiziert (TX: ${txId}), aber Nachricht-Versand an Kunden fehlgeschlagen. Vorräte im Tresor geschützt.`);

            notificationService.notifyAdminsTxId({
                orderId: freshOrder.order_id,
                userId: freshOrder.user_id,
                txId: txId,
                username: 'Auto-Scanner (⚠️ KUNDE BLOCKIERT / VERSAND-FEHLER)',
                total: formatters.formatPrice(freshOrder.total_amount)
            }).catch(() => {});
        }
    } else {
        // MANUELLE AUSLIEFERUNG ERFORDERLICH (UNZUREICHENDER VORRAT ODER PHYSICAL ITEMS)
        await orderRepo.updateOrderStatus(freshOrder.order_id, 'in_bearbeitung');
        await orderRepo.addAdminNote(freshOrder.order_id, 'System (Blockchain Auto-Verify)', `Zahlung per Blockchain bestätigt (TX: ${txId}). Manuelle Auslieferung erforderlich / Vorrat unzureichend.`);

        const customerMsg = `⚡ *Krypto-Zahlung bestätigt!* (${symbol})\n\n` +
            `Deine Zahlung für Bestellung \`#${freshOrder.order_id}\` wurde auf der Blockchain verifiziert!\n` +
            `Der Shop-Admin bereitet deine Auslieferung vor.`;

        if (bot) {
            await bot.telegram.sendMessage(freshOrder.user_id, customerMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }

        const stockSummary = stockDetails.length > 0
            ? stockDetails.map(s => `▪️ ${s.name}: ${s.count}/${s.needed} verfügbar`).join('\n')
            : 'Keine digitalen Vorräte vorhanden';

        notificationService.notifyAdminsTxId({
            orderId: freshOrder.order_id,
            userId: freshOrder.user_id,
            txId: txId,
            username: `Auto-Scanner (⚠️ VORRAT UNZUREICHEND:\n${stockSummary})`,
            total: formatters.formatPrice(freshOrder.total_amount)
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
    scanSingleOrder,
    scanPendingOrders,
    validateSpecificTxId,
    fulfillOrderAutomatically,
    runMaster15MinAudit,
    checkBtcAddress,
    checkLtcAddress,
    checkEthAddress,
    checkSolAddress
};

module.exports = cryptoPaymentService;
