const escapeMarkdown = (text) => {
    if (!text) return '';
    return String(text).replace(/([_*`\[\]])/g, '\\$1');
};

const formatPrice = (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0,00 €';
    return num.toFixed(2).replace('.', ',') + ' €';
};

const formatInvoice = (items, total, paymentMethod, orderId = null, extraOptions = {}) => {
    const isReview = extraOptions.isReview || false;
    let text = '📦 *Bestellübersicht*\n';
    
    if (orderId) {
        text += `📋 *Order-ID:* \`#${escapeMarkdown(orderId)}\`\n`;
    }
    
    text += '\n';

    items.forEach(item => {
        const safePath = item.category_path ? escapeMarkdown(item.category_path) : '';
        const pathString = safePath ? `_${safePath}_ » ` : ''; 
        const safeName = escapeMarkdown(item.name);
        
        text += `▪️ ${item.quantity}x ${pathString}${safeName} (${formatPrice(item.price)}) = ${formatPrice(item.total)}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━\n`;
    
    if (extraOptions.discountAmount > 0) {
        text += `💶 *Zwischensumme:* ${formatPrice(total)}\n`;
        text += `🎟️ *Gutschein-Rabatt (${escapeMarkdown(extraOptions.couponCode || 'Coupon')}):* -${formatPrice(extraOptions.discountAmount)}\n`;
        const finalTotal = Math.max(0, parseFloat(total) - parseFloat(extraOptions.discountAmount));
        text += `💶 *Euro-Endbetrag:* ${formatPrice(finalTotal)}\n`;
    } else {
        text += `💶 *Euro-Gesamtsumme:* ${formatPrice(total)}\n`;
    }
    
    const safePaymentName = escapeMarkdown(paymentMethod ? paymentMethod.name : 'Gewählte Zahlungsart');
    text += `💳 *Gewählte Zahlungsart:* ${safePaymentName}\n`;

    if (isReview) {
        text += `\nℹ️ *Hinweis zum Checkout:*\n_Mit Klick auf "Bestellung abschicken" wird deine Bestellung verbindlich übermittelt, der tagesaktuelle Krypto-Wechselkurs berechnet und deine persönliche Zahlungsadresse zum Kopieren freigeschaltet._\n`;
        return text;
    }

    if (paymentMethod && paymentMethod.wallet_address) {
        text += `\n📍 *Zahlungsadresse:*\n\`${paymentMethod.wallet_address}\`\n_(Tippe zum Kopieren)_\n`;
    }

    if (extraOptions.cryptoAmountFormatted) {
        text += `\n🪙 *Exakter Krypto-Betrag (inkl. Kennziffer):*\n\`${extraOptions.cryptoAmountFormatted}\`\n_(Tippe zum Kopieren)_\n`;
    }

    if (extraOptions.paymentIdentifier) {
        text += `\n📌 *4-stellige Kennziffer / Zahlungs-ID:* \`${extraOptions.paymentIdentifier}\`\n`;
    }

    if (paymentMethod && paymentMethod.auto_verify) {
        text += `\n⚡ *AUTOMATISCHE ZAHLUNGSERKENNUNG AKTIV*\n` +
            `_Das System prüft die Blockchain automatisch im Hintergrund. Nach 1 Bestätigung wird deine Bestellung freigeschaltet!_\n`;
    }

    if (paymentMethod && paymentMethod.description) {
        const safeDesc = escapeMarkdown(paymentMethod.description);
        text += `\n📝 *Hinweis:* _${safeDesc}_\n`;
    }

    return text;
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
        return new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

module.exports = {
    escapeMarkdown,
    formatPrice,
    formatInvoice,
    formatDate
};
