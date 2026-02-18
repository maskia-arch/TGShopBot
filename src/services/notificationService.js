const userRepo = require('../database/repositories/userRepo');
const paymentRepo = require('../database/repositories/paymentRepo');
const config = require('../config');

let bot;

const init = (botInstance) => {
    bot = botInstance;
};

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
        console.error(error.message);
    }
};

const notifyAdminsNewOrder = async ({ userId, username, orderDetails, paymentId }) => {
    try {
        let paymentMethodName = "Manuelle Abwicklung / Privat-Chat";
        
        if (paymentId !== 'MANUAL') {
            try {
                const method = await paymentRepo.getPaymentMethod(paymentId);
                if (method) paymentMethodName = method.name;
            } catch (e) {
                console.warn(e.message);
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
        console.error(error.message);
    }
};

const notifyMasterApproval = async ({ approvalId, actionType, productId, productName, requestedBy, newValue }) => {
    try {
        const masterId = config.MASTER_ADMIN_ID;
        if (!masterId) return;

        const typeLabel = actionType === 'DELETE' ? '🗑 LÖSCHUNG' : '💰 PREISÄNDERUNG';
        
        let text = `⚖️ *Neue Freigabeanfrage*\n\n`;
        text += `Typ: *${typeLabel}*\n`;
        text += `Produkt: ${productName}\n`;
        text += `Von: ${requestedBy}\n`;
        
        if (newValue) {
            text += `Neuer Wert: *${newValue}€*\n`;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Annehmen', callback_data: `master_approve_${approvalId}` },
                    { text: '❌ Ablehnen', callback_data: `master_reject_${approvalId}` }
                ],
                [{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]
            ]
        };

        await bot.telegram.sendMessage(masterId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }).catch(() => {});
    } catch (error) {
        console.error(error.message);
    }
};

const notifyMasterNewProduct = async ({ adminName, productName, categoryName, time, productId }) => {
    try {
        const masterId = config.MASTER_ADMIN_ID;
        if (!masterId) return;

        const text = `ℹ️ *Neues Produkt angelegt*\n\nAdmin ${adminName} hat das Produkt *${productName}* in *${categoryName}* um ${time} Uhr erstellt.`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '✅ Zur Kenntnis genommen', callback_data: 'master_ack_msg' }],
                [{ text: '↩️ Rückgängig machen', callback_data: `master_undo_prod_${productId}` }]
            ]
        };

        await bot.telegram.sendMessage(masterId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }).catch(() => {});
    } catch (error) {
        console.error(error.message);
    }
};

module.exports = {
    init,
    sendBroadcast,
    notifyAdminsNewOrder,
    notifyMasterApproval,
    notifyMasterNewProduct
};
