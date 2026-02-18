const userRepo = require('../database/repositories/userRepo');
const paymentRepo = require('../database/repositories/paymentRepo');
const config = require('../config');

let bot;

const init = (botInstance) => {
    bot = botInstance;
};

/**
 * Sendet eine Nachricht an alle registrierten Kunden und meldet Fehler an Admins
 */
const sendBroadcast = async (messageText, senderId) => {
    try {
        const customers = await userRepo.getAllCustomers();
        const admins = await userRepo.getAllAdmins();

        let successCount = 0;
        let failCount = 0;
        const failedUsers = [];

        for (const customer of customers) {
            try {
                await bot.telegram.sendMessage(customer.telegram_id, messageText, { 
                    parse_mode: 'Markdown' 
                });
                successCount++;
            } catch (error) {
                if (error.description.includes('forbidden') || error.description.includes('blocked') || error.description.includes('chat not found')) {
                    failedUsers.push(customer);
                }
                failCount++;
            }
        }

        const report = `📢 *Broadcast Report*\n\n` +
                       `✅ Erfolgreich: ${successCount}\n` +
                       `❌ Fehlgeschlagen: ${failCount}\n\n` +
                       `Gesendet von ID: ${senderId}`;

        const allStaff = [...admins, { telegram_id: config.MASTER_ADMIN_ID }];
        const uniqueStaff = [...new Map(allStaff.map(s => [s.telegram_id, s])).values()];

        for (const staff of uniqueStaff) {
            const keyboard = { inline_keyboard: [] };
            
            if (failCount > 0 && Number(staff.telegram_id) === Number(config.MASTER_ADMIN_ID)) {
                keyboard.inline_keyboard.push([{ text: '🗑 Blockierte User bereinigen', callback_data: 'master_cleanup_blocked' }]);
            }

            await bot.telegram.sendMessage(staff.telegram_id, report, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined
            }).catch(() => {});
        }

        return { successCount, failCount, failedUsers };
    } catch (error) {
        console.error('Broadcast Error:', error.message);
    }
};

/**
 * Informiert Admins über eine neue Bestellung
 * Unterstützt nun paymentId 'MANUAL' für Bestellungen ohne hinterlegte Zahlungsart
 */
const notifyAdminsNewOrder = async ({ userId, username, orderDetails, paymentId }) => {
    try {
        let paymentMethodName = "Manuelle Abwicklung / Privat-Chat";
        
        // Nur in DB suchen, wenn eine echte ID vorhanden ist
        if (paymentId !== 'MANUAL') {
            try {
                const method = await paymentRepo.getPaymentMethod(paymentId);
                if (method) paymentMethodName = method.name;
            } catch (e) {
                console.warn("Payment method fetch failed, using fallback name.");
            }
        }

        const admins = await userRepo.getAllAdmins();
        
        let orderText = `🛍️ *Neue Bestellung*\n\n`;
        orderText += `👤 Kunde: ${username} (ID: ${userId})\n`;
        orderText += `💳 Zahlung: ${paymentMethodName}\n\n`;
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
 * Informiert den Master-Admin über eine neue Freigabeanfrage
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
    sendBroadcast,
    notifyAdminsNewOrder,
    notifyMasterNewApproval
};
