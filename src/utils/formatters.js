const formatPrice = (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '0,00 €';
    return num.toFixed(2).replace('.', ',') + ' €';
};

const formatInvoice = (items, total, paymentMethod, orderId = null) => {
    let text = '📦 *Bestellübersicht*\n';
    
    if (orderId) {
        text += `🆔 *Bestellung:* #${orderId}\n`;
    }
    
    text += '\n';

    items.forEach(item => {
        text += `▪️ ${item.quantity}x ${item.name} (${formatPrice(item.price)}) = ${formatPrice(item.total)}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━\n`;
    text += `💰 *Gesamtsumme: ${formatPrice(total)}*\n`;
    text += `💳 *Zahlung:* ${paymentMethod.name}\n`;

    if (paymentMethod.wallet_address) {
        text += `\n📋 *Zahlungsadresse:*\n\`${paymentMethod.wallet_address}\`\n_(Tippe zum Kopieren)_\n`;
    }

    if (paymentMethod.description) {
        text += `\n📝 *Hinweis:* _${paymentMethod.description}_\n`;
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
    formatPrice,
    formatInvoice,
    formatDate
};
