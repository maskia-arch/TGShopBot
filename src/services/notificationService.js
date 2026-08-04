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
        console.warn(`[Bot] Markdown Error für Chat ${chatId} (${e.message}). Versuche sicheren Fallback...`);
        try {
            const fallbackOptions = { ...options };
            delete fallbackOptions.parse_mode; 
            return await botInstance.telegram.sendMessage(chatId, text, fallbackOptions);
        } catch (fallbackError) {
            console.error(`[Bot] Fataler Sende-Fehler für Chat ${chatId}:`, fallbackError.message);
            return null;
        }
    }
};

const editAdminMessage = async (chatId, messageId, text, options = {}) => {
    if (!botInstance) return null;
    try {
        return await botInstance.telegram.editMessageText(chatId, messageId, null, text, { parse_mode: 'Markdown', ...options });
    } catch (e) {
        console.warn(`[Bot] Edit Markdown Error für Chat ${chatId} (${e.message}). Versuche sicheren Fallback...`);
        try {
            const fallbackOptions = { ...options };
            delete fallbackOptions.parse_mode;
            return await botInstance.telegram.editMessageText(chatId, messageId, null, text, fallbackOptions);
        } catch (fallbackError) {
            return null;
        }
    }
};

const sendOrderReceipt = async (userId, data) => {
    const text = texts.getOrderReceipt(data);
    return sendTo(userId, text);
};

const notifyCustomerStatusUpdate = async (userId, orderId, newStatus) => {
    try {
        const order = await orderRepo.getOrderByOrderId(orderId).catch(() => null);
        let text = texts.getStatusUpdateText(orderId, newStatus);
        const keyboard = { inline_keyboard: [] };

        if (order && order.digital_delivery) {
            text += `\n\n🔐 *Gelieferte Artikel / Keys:*\n${order.digital_delivery}`;
            keyboard.inline_keyboard.push([{ text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${orderId}`, style: 'primary' }]);
        }

        keyboard.inline_keyboard.push([{ text: '📋 Bestellung anzeigen', callback_data: `cust_order_detail_${orderId}`, style: 'primary' }]);
        return sendTo(userId, text, { reply_markup: keyboard });
    } catch (e) {
        console.error('notifyCustomerStatusUpdate error:', e.message);
        return sendTo(userId, texts.getStatusUpdateText(orderId, newStatus));
    }
};

const notifyAdminsInterest = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminInterestNotify(data);
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        
        for (const id of targetIds) {
            sendTo(id, text);
        }
    } catch (error) {
        console.error('Notify Interest Error:', error.message);
    }
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
            inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}`, style: 'primary' }]]
        };

        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));

        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard, disable_web_page_preview: true })
                .then(msg => {
                    if (msg && msg.message_id) orderRepo.addNotificationMsgId(data.orderId, id, msg.message_id);
                }).catch(() => {});
        }
    } catch (error) {
        console.error('Notify New Order Error:', error.message);
    }
};

const notifyAdminsTxId = async (data) => {
    try {
        const order = await orderRepo.getOrderByOrderId(data.orderId);
        const safeData = {
            orderId: data.orderId,
            userId: data.userId || (order ? order.user_id : 'Unbekannt'),
            username: (data.username && data.username !== 'undefined') ? data.username : 'Kunde',
            total: (data.total && data.total !== 'undefined' && data.total !== 'NaN €') ? data.total : (order ? (parseFloat(order.total_amount).toFixed(2).replace('.', ',') + ' €') : '0,00 €'),
            paymentName: (data.paymentName && data.paymentName !== 'undefined') ? data.paymentName : (order ? order.payment_method_name : 'Unbekannt'),
            txId: data.txId
        };

        const text = texts.getAdminTxIdNotify(safeData);
        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 Bestellung öffnen', callback_data: `oview_${safeData.orderId}`, style: 'primary' }],
                [{ text: '✅ Zahlung bestätigen', callback_data: `ostatus_${safeData.orderId}_in_bearbeitung`, style: 'success' }]
            ]
        };

        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));

        const adminNotifs = (order && order.notification_msg_ids)
            ? order.notification_msg_ids.filter(n => targetIds.has(String(n.chat_id)))
            : [];

        if (adminNotifs.length > 0) {
            for (const notif of adminNotifs) {
                editAdminMessage(notif.chat_id, notif.message_id, text, { reply_markup: keyboard })
                    .then(res => {
                        if (!res) sendTo(notif.chat_id, text, { reply_markup: keyboard });
                    }).catch(() => sendTo(notif.chat_id, text, { reply_markup: keyboard }));
            }
        } else {
            for (const id of targetIds) {
                sendTo(id, text, { reply_markup: keyboard })
                    .then(msg => {
                        if (msg && msg.message_id) orderRepo.addNotificationMsgId(safeData.orderId, id, msg.message_id);
                    }).catch(() => {});
            }
        }
    } catch (error) {
        console.error('Notify TxId Error:', error.message);
    }
};

const notifyAdminsPing = async (data) => {
    try {
        const text = texts.getAdminPingNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}`, style: 'primary' }],
            [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}`, style: 'primary' }]
        ]};
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error(error.message); }
};

const notifyAdminsContact = async (data) => {
    try {
        const text = texts.getAdminContactNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}`, style: 'primary' }],
            [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}`, style: 'primary' }]
        ]};
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error(error.message); }
};

const notifyMasterBan = async (data) => {
    try {
        const text = texts.getMasterBanNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '↩️ Ban aufheben', callback_data: `master_revert_ban_${data.banId}`, style: 'danger' }],
            [{ text: '✅ Sofort bestätigen', callback_data: `master_confirm_ban_${data.banId}`, style: 'success' }]
        ]};
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard });
    } catch (error) { console.error(error.message); }
};

const sendBroadcast = async (text, adminId) => {
    try {
        const customers = await userRepo.getAllCustomers();
        if (!customers || customers.length === 0) return sendTo(adminId, '⚠️ Keine Kunden gefunden.');
        let successCount = 0;
        for (const customer of customers) {
            const res = await sendTo(customer.telegram_id, text);
            if (res) successCount++;
        }
        await sendTo(adminId, `📢 Broadcast beendet. Erreicht: ${successCount}/${customers.length}`);
    } catch (error) { console.error(error.message); }
};

const notifyCustomerFeedbackInvite = async (userId, orderId) => {
    try {
        const order = await orderRepo.getOrderByOrderId(orderId).catch(() => null);
        let text = texts.getFeedbackInviteText(orderId);
        const keyboard = { inline_keyboard: [] };

        if (order && order.digital_delivery) {
            text += `\n\n🔐 *Gelieferte Artikel / Keys:*\n${order.digital_delivery}`;
            keyboard.inline_keyboard.push([{ text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${orderId}`, style: 'primary' }]);
        }

        keyboard.inline_keyboard.push([{ text: '⭐ Feedback abgeben', callback_data: `start_feedback_${orderId}`, style: 'success' }]);
        keyboard.inline_keyboard.push([{ text: '📋 Bestellung anzeigen', callback_data: `cust_order_detail_${orderId}`, style: 'primary' }]);

        // Dauerhafte Benachrichtigung – KEIN Selbstlöschungs-Timer!
        const sentMsg = await sendTo(userId, text, { reply_markup: keyboard });
        return sentMsg;
    } catch (error) { console.error(error.message); }
};

const notifyAdminNewFeedback = async (data) => {
    try {
        const text = texts.getAdminFeedbackReviewNotify(data);
        const keyboard = {
            inline_keyboard: [
                [{ text: '✅ Freigeben', callback_data: `fb_approve_${data.feedbackId}`, style: 'success' },
                 { text: '❌ Ablehnen', callback_data: `fb_reject_${data.feedbackId}`, style: 'danger' }]
            ]
        };
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error(error.message); }
};

const notifyAdminOrderDeleteRequest = async (data) => {
    try {
        const text = texts.getAdminOrderDeleteRequest(data);
        const keyboard = { inline_keyboard: [
            [{ text: '✅ Löschung zustimmen', callback_data: `cust_del_approve_${data.orderId}`, style: 'success' }],
            [{ text: '❌ Ablehnen & Wiederherstellen', callback_data: `cust_del_reject_${data.orderId}`, style: 'danger' }],
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}`, style: 'primary' }],
            [{ text: '📋 Bestellung prüfen', callback_data: `oview_${data.orderId}`, style: 'primary' }]
        ]};
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error(error.message); }
};

const notifyAdminReplaceRequest = async (data) => {
    try {
        const text = texts.getAdminReplaceRequest(data);
        const keyboard = { inline_keyboard: [
            [{ text: '📋 Bestellung prüfen', callback_data: `oview_${data.orderId}`, style: 'primary' }],
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}`, style: 'primary' }]
        ]};
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error('notifyAdminReplaceRequest error:', error.message); }
};

const notifyMasterProductDeleteRequest = async (data) => {
    try {
        const text = `🗑 *LÖSCHANFRAGE – PRODUKT*\n\n` +
            `👤 Admin: ${data.adminName}\n` +
            `📦 Produkt: *${data.productName}*\n` +
            `🆔 Produkt-ID: \`${data.productId}\`\n\n` +
            `Soll dieses Produkt endgültig gelöscht werden?`;
        const keyboard = {
            inline_keyboard: [
                [{ text: '✅ Löschen genehmigen', callback_data: `master_approve_${data.approvalId}`, style: 'success' }],
                [{ text: '❌ Ablehnen', callback_data: `master_reject_appr_${data.approvalId}`, style: 'danger' }]
            ]
        };
        await sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard });
    } catch (error) { console.error('notifyMasterProductDeleteRequest error:', error.message); }
};

const notifyAdminsNewProduct = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminNewProductNotify(data);
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text);
        }
    } catch (error) { console.error(error.message); }
};

module.exports = {
    init, sendTo, editAdminMessage, sendOrderReceipt, notifyCustomerStatusUpdate,
    notifyAdminsInterest, notifyAdminsNewOrder, notifyAdminsTxId, 
    notifyAdminsPing, notifyAdminsContact, notifyMasterBan, sendBroadcast,
    notifyCustomerFeedbackInvite, notifyAdminNewFeedback,
    notifyAdminOrderDeleteRequest, notifyAdminReplaceRequest, notifyAdminsNewProduct, notifyMasterProductDeleteRequest
};
