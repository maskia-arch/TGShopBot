const config = require('../config');
const userRepo = require('../database/repositories/userRepo');
const orderRepo = require('../database/repositories/orderRepo'); 
const texts = require('../utils/texts');

let botInstance = null;

const init = (bot) => {
    botInstance = bot;
};

const sendTo = async (chatId, text, options = {}) => {
    if (!botInstance) throw new Error('NotificationService not initialized');
    try {
        return await botInstance.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
    } catch (e) {
        // Ignoriere Blockierungen leise für den Log, liefere null zurück
        return null;
    }
};

const sendOrderReceipt = async (userId, data) => {
    const text = texts.getOrderReceipt(data);
    return sendTo(userId, text);
};

const notifyCustomerStatusUpdate = async (userId, orderId, newStatus) => {
    const text = texts.getStatusUpdateText(orderId, newStatus);
    return sendTo(userId, text);
};

const notifyAdminsNewOrder = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();

        const text = texts.getAdminNewOrderNotify({
            ...data,
            total: data.total || '0.00',
            paymentName: data.paymentName || (data.paymentId === 'MANUAL' ? 'Manuelle Abwicklung' : data.paymentId)
        });

        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }]
            ]
        };

        const notifyPromises = [];

        for (const admin of admins) {
            const p = sendTo(admin.telegram_id, text, {
                reply_markup: keyboard, disable_web_page_preview: true
            }).then(msg => {
                if (msg && msg.message_id) {
                    return orderRepo.addNotificationMsgId(data.orderId, admin.telegram_id, msg.message_id);
                }
            }).catch(() => {});
            notifyPromises.push(p);
        }

        if (!admins.find(a => Number(a.telegram_id) === Number(config.MASTER_ADMIN_ID))) {
            const p = sendTo(config.MASTER_ADMIN_ID, text, {
                reply_markup: keyboard, disable_web_page_preview: true
            }).then(msg => {
                if (msg && msg.message_id) {
                    return orderRepo.addNotificationMsgId(data.orderId, config.MASTER_ADMIN_ID, msg.message_id);
                }
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        await Promise.all(notifyPromises);
    } catch (error) {
        console.error('Notify Admins New Order Error:', error.message);
    }
};

const notifyAdminsTxId = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminTxIdNotify(data);

        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }],
                [{ text: '✅ Zahlung bestätigen', callback_data: `ostatus_${data.orderId}_in_bearbeitung` }]
            ]
        };

        const notifyPromises = [];

        for (const admin of admins) {
            const p = sendTo(admin.telegram_id, text, { reply_markup: keyboard }).then(msg => {
                if (msg && msg.message_id) {
                    return orderRepo.addNotificationMsgId(data.orderId, admin.telegram_id, msg.message_id);
                }
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        if (!admins.find(a => Number(a.telegram_id) === Number(config.MASTER_ADMIN_ID))) {
             const p = sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).then(msg => {
                if (msg && msg.message_id) {
                     return orderRepo.addNotificationMsgId(data.orderId, config.MASTER_ADMIN_ID, msg.message_id);
                }
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        await Promise.all(notifyPromises);
    } catch (error) {
        console.error('Notify TxId Error:', error.message);
    }
};

const notifyAdminsPing = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminPingNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}` }],
            [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }]
        ]};
        
        const notifyPromises = [];
        
        for (const admin of admins) {
            const p = sendTo(admin.telegram_id, text, { reply_markup: keyboard }).then(msg => {
                if (msg && msg.message_id) return orderRepo.addNotificationMsgId(data.orderId, admin.telegram_id, msg.message_id);
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        if (!admins.find(a => Number(a.telegram_id) === Number(config.MASTER_ADMIN_ID))) {
            const p = sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).then(msg => {
                if (msg && msg.message_id) return orderRepo.addNotificationMsgId(data.orderId, config.MASTER_ADMIN_ID, msg.message_id);
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        await Promise.all(notifyPromises);
    } catch (error) {
        console.error('Notify Ping Error:', error.message);
    }
};

const notifyAdminsContact = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminContactNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}` }],
            [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }]
        ]};
        
        const notifyPromises = [];
        
        for (const admin of admins) {
            const p = sendTo(admin.telegram_id, text, { reply_markup: keyboard }).then(msg => {
                if (msg && msg.message_id) return orderRepo.addNotificationMsgId(data.orderId, admin.telegram_id, msg.message_id);
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        if (!admins.find(a => Number(a.telegram_id) === Number(config.MASTER_ADMIN_ID))) {
            const p = sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).then(msg => {
                if (msg && msg.message_id) return orderRepo.addNotificationMsgId(data.orderId, config.MASTER_ADMIN_ID, msg.message_id);
            }).catch(() => {});
            notifyPromises.push(p);
        }
        
        await Promise.all(notifyPromises);
    } catch (error) {
        console.error('Notify Contact Error:', error.message);
    }
};

const notifyMasterBan = async (data) => {
    try {
        const text = texts.getMasterBanNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '↩️ Ban aufheben', callback_data: `master_revert_ban_${data.banId}` }],
            [{ text: '✅ Sofort bestätigen', callback_data: `master_confirm_ban_${data.banId}` }]
        ]};
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});
    } catch (error) {
        console.error('Notify Master Ban Error:', error.message);
    }
};

const notifyAdminsNewProduct = async (data) => {
    try {
        const text = texts.getAdminNewProductNotify(data);
        const keyboard = {
            inline_keyboard: [
                [{ text: '↩️ Rückgängig', callback_data: `master_undo_prod_${data.productId}` }],
                [{ text: '✅ Gelesen', callback_data: 'master_ack_msg' }]
            ]
        };
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});
    } catch (error) {
        console.error('Notify New Product Error:', error.message);
    }
};

const sendBroadcast = async (text, adminId) => {
    try {
        const customers = await userRepo.getAllCustomers();
        
        if (!customers || customers.length === 0) {
            await sendTo(adminId, '⚠️ Es wurden keine registrierten Kunden gefunden.');
            return;
        }

        let successCount = 0;
        let failCount = 0;
        let blockCount = 0;
        const promises = customers.map(async (customer) => {
            const result = await sendTo(customer.telegram_id, text);
            if (result) {
                successCount++;
            } else {
                failCount++;
                blockCount++;
            }
        });

        await Promise.all(promises);

        const reportText = texts.getBroadcastReport({
            successCount,
            failCount,
            blockCount
        });

        await sendTo(adminId, reportText);
        
    } catch (error) {
        console.error('Broadcast Error:', error.message);
        await sendTo(adminId, '❌ Ein Fehler ist beim Ausführen des Broadcasts aufgetreten.');
    }
};

module.exports = {
    init, sendTo,
    sendOrderReceipt, notifyCustomerStatusUpdate,
    notifyAdminsNewOrder, notifyAdminsTxId,
    notifyAdminsPing, notifyAdminsContact,
    notifyMasterBan, notifyAdminsNewProduct,
    sendBroadcast
};
