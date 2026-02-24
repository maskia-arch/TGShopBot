const config = require('../config');
const userRepo = require('../database/repositories/userRepo');
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
        console.error(`Send to ${chatId} failed:`, e.message);
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

        for (const admin of admins) {
            sendTo(admin.telegram_id, text, {
                reply_markup: keyboard, disable_web_page_preview: true
            }).catch(() => {});
        }

        // Master extra benachrichtigen falls nicht in Admin-Liste
        if (!admins.find(a => Number(a.telegram_id) === Number(config.MASTER_ADMIN_ID))) {
            sendTo(config.MASTER_ADMIN_ID, text, {
                reply_markup: keyboard, disable_web_page_preview: true
            }).catch(() => {});
        }
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

        for (const admin of admins) {
            sendTo(admin.telegram_id, text, { reply_markup: keyboard }).catch(() => {});
        }
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});
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
            [{ text: '📋 Bestellung', callback_data: `oview_${data.orderId}` }]
        ]};
        for (const admin of admins) {
            sendTo(admin.telegram_id, text, { reply_markup: keyboard }).catch(() => {});
        }
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});
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
            [{ text: '📋 Bestellung', callback_data: `oview_${data.orderId}` }]
        ]};
        for (const admin of admins) {
            sendTo(admin.telegram_id, text, { reply_markup: keyboard }).catch(() => {});
        }
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});
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

module.exports = {
    init, sendTo,
    sendOrderReceipt, notifyCustomerStatusUpdate,
    notifyAdminsNewOrder, notifyAdminsTxId,
    notifyAdminsPing, notifyAdminsContact,
    notifyMasterBan, notifyAdminsNewProduct
};
