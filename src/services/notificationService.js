const userRepo = require('../database/repositories/userRepo');
const paymentRepo = require('../database/repositories/paymentRepo');
const config = require('../config');

let bot;

const init = (botInstance) => {
    bot = botInstance;
};

/**
 * Informiert Admins über eine neue Bestellung
 */
const notifyAdminsNewOrder = async ({ userId, username, orderDetails, paymentId }) => {
    try {
        const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);
        const admins = await userRepo.getAllAdmins();
        
        let orderText = `🛍️ *Neue Bestellung*\n\n`;
        orderText += `👤 Kunde: ${username} (ID: ${userId})\n`;
        orderText += `💳 Zahlung: ${paymentMethod.name}\n\n`;
        orderText += `📦 Details:\n`;
        
        let total = 0;
        orderDetails.forEach((item) => {
            orderText += `- ${item.quantity}x ${item.name} (${item.price}€) = ${item.total}€\n`;
            total += parseFloat(item.total);
        });
        
        orderText += `\n💰 *Gesamtsumme: ${total.toFixed(2)}€*`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${userId}` }]
            ]
        };

        // Nachricht an alle Admins und den Master senden
        const allStaff = [...admins, { telegram_id: config.MASTER_ADMIN_ID }];
        const uniqueStaff = [...new Map(allStaff.map(s => [s.telegram_id, s])).values()];

        for (const staff of uniqueStaff) {
            await bot.telegram.sendMessage(staff.telegram_id, orderText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }).catch(() => {});
        }
    } catch (error) {
        console.error('Notification Error (Order):', error.message);
    }
};

/**
 * Informiert den Master-Admin über eine neue Freigabeanfrage (Löschen/Preis)
 */
const notifyMasterNewApproval = async (request) => {
    try {
        const masterId = config.MASTER_ADMIN_ID;
        if (!masterId) return;

        let typeLabel = request.action_type === 'DELETE' ? '🗑 LÖSCHUNG' : '💰 PREISÄNDERUNG';
        
        let text = `⚖️ *Neue Freigabeanfrage*\n\n`;
        text += `Typ: ${typeLabel}\n`;
        text += `Von Admin-ID: ${request.requested_by}\n`;
        if (request.new_value) text += `Neuer Wert: ${request.new_value}\n`;
        text += `\nBitte prüfe das Master-Panel für die Entscheidung.`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]
            ]
        };

        await bot.telegram.sendMessage(masterId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }).catch(() => {});
    } catch (error) {
        console.error('Notification Error (Approval):', error.message);
    }
};

module.exports = {
    init,
    notifyAdminsNewOrder,
    notifyMasterNewApproval
};
