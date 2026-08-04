/**
 * cryptoExchangeService.js – Echtzeit-Krypto-Kursservice (Coinbase / CoinGecko API)
 * mit stufenloser, fairer 4-stelliger Kennziffer-Einarbeitung (Cent-Bereich Aufschlag)
 * © 2026 t.me/autoacts
 */

const https = require('https');

// 2 Minuten In-Memory-Cache für Krypto-Kurse
const cache = {
    BTC: { rate: 54600, timestamp: 0 },
    LTC: { rate: 65, timestamp: 0 },
    ETH: { rate: 2800, timestamp: 0 },
    SOL: { rate: 160, timestamp: 0 }
};

const CACHE_TTL_MS = 120000; // 2 Minuten

function fetchJson(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { headers: { 'User-Agent': 'TGShopBot-Exchange/1.0' } }, (res) => {
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
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

/**
 * Holt den tagesaktuellen Euro-Kurs für eine Kryptowährung (BTC, LTC, ETH, SOL)
 */
async function getCryptoRateInEur(symbol = 'BTC') {
    const sym = (symbol || 'BTC').toUpperCase().trim();
    const now = Date.now();

    if (cache[sym] && (now - cache[sym].timestamp) < CACHE_TTL_MS) {
        return cache[sym].rate;
    }

    try {
        const coinbaseRes = await fetchJson(`https://api.coinbase.com/v2/prices/${sym}-EUR/spot`);
        if (coinbaseRes && coinbaseRes.data && coinbaseRes.data.amount) {
            const rate = parseFloat(coinbaseRes.data.amount);
            if (!isNaN(rate) && rate > 0) {
                cache[sym] = { rate, timestamp: now };
                return rate;
            }
        }
    } catch (e) {}

    try {
        const cgSymbolMap = { BTC: 'bitcoin', LTC: 'litecoin', ETH: 'ethereum', SOL: 'solana' };
        const cgId = cgSymbolMap[sym] || 'bitcoin';
        const cgRes = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=eur`);
        if (cgRes && cgRes[cgId] && cgRes[cgId].eur) {
            const rate = parseFloat(cgRes[cgId].eur);
            if (!isNaN(rate) && rate > 0) {
                cache[sym] = { rate, timestamp: now };
                return rate;
            }
        }
    } catch (e) {}

    return cache[sym] ? cache[sym].rate : 54600;
}

const CRYPTO_SYMBOLS = {
    BTC: '₿',
    LTC: 'Ł',
    ETH: 'Ξ',
    SOL: '◎'
};

/**
 * Berechnet den exakten Krypto-Betrag inklusive 4-stelliger Kennziffer am Ende.
 * Aufschlag beträgt maximal wenige Cents (0.01 € - 0.40 €).
 */
async function calculateCryptoPayment(euroTotal, symbol = 'BTC') {
    const sym = (symbol || 'BTC').toUpperCase().trim();
    const rate = await getCryptoRateInEur(sym);

    const rawCrypto = euroTotal / rate;
    let cryptoStr = rawCrypto.toFixed(8);

    let parts = cryptoStr.split('.');
    if (parts[1] && (parts[1].endsWith('00') || parts[1].endsWith('0'))) {
        const rand1 = Math.floor(Math.random() * 3); // 0, 1 oder 2
        const rand2 = Math.floor(Math.random() * 3); // 0, 1 oder 2
        cryptoStr = cryptoStr.replace(/0+$/, '') + rand1 + rand2;
        parts = cryptoStr.split('.');
        if (parts[1].length < 8) parts[1] = parts[1].padEnd(8, '1');
        cryptoStr = parts[0] + '.' + parts[1].slice(0, 8);
    }

    const identifier = cryptoStr.slice(-4);
    const icon = CRYPTO_SYMBOLS[sym] || '';
    const formattedWithSymbol = `${cryptoStr} ${sym} ${icon}`.trim();

    return {
        symbol: sym,
        icon: icon,
        rate: rate,
        identifier: identifier,
        amountFormatted: formattedWithSymbol,
        rawAmount: cryptoStr
    };
}

/**
 * Prüft ob eine Unterzahlung innerhalb der 5% Toleranzgrenze liegt
 */
function checkUnderpaymentTolerance(expectedCrypto, receivedCrypto, rate = 1) {
    const expected = parseFloat(expectedCrypto) || 0;
    const received = parseFloat(receivedCrypto) || 0;

    if (received >= expected) {
        return { isWithinTolerance: true, diffPercent: 0, missingCrypto: '0.00', missingEuro: '0.00' };
    }

    const missingCryptoNum = expected - received;
    const diffPercent = ((missingCryptoNum / expected) * 100);
    const missingEuroNum = missingCryptoNum * rate;

    return {
        isWithinTolerance: diffPercent <= 5.0,
        diffPercent: parseFloat(diffPercent.toFixed(2)),
        missingCrypto: missingCryptoNum.toFixed(8),
        missingEuro: missingEuroNum.toFixed(2)
    };
}

module.exports = {
    getCryptoRateInEur,
    calculateCryptoPayment,
    checkUnderpaymentTolerance
};
