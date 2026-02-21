const userRepo = require('../database/repositories/userRepo');
const paymentRepo = require('../database/repositories/paymentRepo');
const config = require('../config');
const texts = require('../utils/texts');

let bot;

const init = (botInstance) => {
    bot = botInstance;
};

const sendBroadcast = async (messageText, senderId) => {
    try {
        const [customers, admins] = await Promise.all([
            userRepo.getAllCustomers(),
            userRepo.getAllAdmins()
        ]);

        let successCount = 0;
        let failCount = 0;
        const failedUsers = [];

        for (const customer of customers) {
            try {
                await bot.telegram.sendMessage(customer.telegram_id, messageText, { parse_mode: 'Markdown' });
                successCount++;
            } catch (error) {
                if (error.description && (error.description.includes('forbidden') || error.description.includes('blocked') || error.description.includes('chat not found'))) {
                    failedUsers.push(customer);
                }
                failCount++;
            }
        }

        const report = texts.getBroadcastReport({ successCount, failCount, blockCount: failedUsers.length }) + `\nGesendet von ID: ${senderId}`;

        const masterId = Number(config.MASTER_ADMIN_ID);
        const allStaff = [...admins, { telegram_id: masterId }];
        const uniqueStaffIds = [...new Set(allStaff.map(s => Number(s.telegram_id)))];

        await Promise.all(uniqueStaffIds.map(async (staffId) => {
            const keyboard = { inline_keyboard: [] };
            if (failedUsers.length > 0 && staffId === masterId) {
                keyboard.inline_keyboard.push([{ text: '🗑 Blockierte User bereinigen', callback_data: 'master_cleanup_blocked' }]);
            }
            return bot.telegram.sendMessage(staffId, report, {
                parse_mode: 'Markdown',
                reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined
            }).catch(() => {});
        }));

        return { successCount, failCount, failedUsers };
    } catch (error) {
        console.error('Broadcast Error:', error.message);
    }
};

const notifyAdminsNewOrder = async ({ userId, username, orderDetails, paymentId, orderId, shippingLink }) => {
    try {
        let paymentMethodName = "Manuelle Abwicklung";

        const [method, admins] = await Promise.all([
            paymentId !== 'MANUAL' ? paymentRepo.getPaymentMethod(paymentId).catch(() => null) : null,
            userRepo.getAllAdmins()
        ]);

        if (method) paymentMethodName = method.name;

        const total = orderDetails.reduce((sum, item) => sum + parseFloat(item.total), 0);

        const orderText = texts.getAdminNewOrderNotify({
            username,
            userId,
            total: total.toFixed(2),
            paymentName: paymentMethodName,
            orderId: orderId || 'N/A',
            shippingLink: shippingLink || null
        });

        const keyboard = {
            inline_keyboard: [
                [{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${userId}` }]
            ]
        };

        if (orderId) {
            keyboard.inline_keyboard.push([{ text: '📋 Bestellung anzeigen', callback_data: `order_view_${orderId}` }]);
        }

        const masterId = Number(config.MASTER_ADMIN_ID);
        const uniqueStaffIds = [...new Set([...admins.map(a => Number(a.telegram_id)), masterId])];

        await Promise.all(uniqueStaffIds.map(staffId =>
            bot.telegram.sendMessage(staffId, orderText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }).catch(() => {})
        ));
    } catch (error) {
        console.error('Order Notify Error:', error.message);
    }
};

const notifyMasterApproval = async ({ approvalId, actionType, productId, productName, requestedBy, newValue }) => {
    try {
        const masterId = config.MASTER_ADMIN_ID;
        if (!masterId) return;

        const typeLabel = actionType === 'DELETE' ? '🗑 LÖSCHUNG' : '💰 PREISÄNDERUNG';
        const text = texts.getApprovalRequestText({
            type: typeLabel, requestedBy, productName,
            newValue: newValue ? `${newValue}€` : 'N/A'
        });

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Annehmen', callback_data: `master_approve_${approvalId}` },
                    { text: '❌ Ablehnen', callback_data: `master_reject_${approvalId}` }
                ],
                [{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]
            ]
        };

        bot.telegram.sendMessage(masterId, text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } catch (error) {
        console.error('Approval Notify Error:', error.message);
    }
};

const notifyMasterNewProduct = async ({ adminName, productName, categoryName, time, productId }) => {
    try {
        const masterId = config.MASTER_ADMIN_ID;
        if (!masterId) return;

        const text = texts.getAdminNewProductNotify({ adminName, productName, categoryName, time, productId });

        const keyboard = {
            inline_keyboard: [
                [{ text: '✅ Zur Kenntnis genommen', callback_data: 'master_ack_msg' }],
                [{ text: '↩️ Rückgängig machen', callback_data: `master_undo_prod_${productId}` }]
            ]
        };

        bot.telegram.sendMessage(masterId, text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } catch (error) {
        console.error('New Product Notify Error:', error.message);
    }
};

// ── v0.3.0: Status-Benachrichtigung an Kunden ──

const notifyCustomerStatusUpdate = async (userId, orderId, newStatus) => {
    try {
        const text = texts.getStatusUpdateText(orderId, newStatus);
        await bot.telegram.sendMessage(userId, text, { parse_mode: 'Markdown' }).catch(() => {});
    } catch (error) {
        console.error('Status Notify Error:', error.message);
    }
};

// ── v0.3.0: Receipt an Kunden ──

const sendOrderReceipt = async (userId, receiptData) => {
    try {
        const text = texts.getOrderReceipt(receiptData);
        await bot.telegram.sendMessage(userId, text, { parse_mode: 'Markdown' }).catch(() => {});
    } catch (error) {
        console.error('Receipt Error:', error.message);
    }
};

// ── v0.3.1: Ping-Benachrichtigung ──

const notifyAdminsPing = async ({ userId, username, orderId }) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminPingNotify({ userId, username, orderId });
        const keyboard = {
            inline_keyboard: [
                [{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${userId}` }],
                [{ text: '📋 Bestellung anzeigen', callback_data: `order_view_${orderId}` }]
            ]
        };

        const masterId = Number(config.MASTER_ADMIN_ID);
        const uniqueStaffIds = [...new Set([...admins.map(a => Number(a.telegram_id)), masterId])];

        await Promise.all(uniqueStaffIds.map(staffId =>
            bot.telegram.sendMessage(staffId, text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {})
        ));
    } catch (error) {
        console.error('Ping Notify Error:', error.message);
    }
};

// ── v0.3.1: Kontaktanfrage-Benachrichtigung ──

const notifyAdminsContact = async ({ userId, username, orderId, message }) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminContactNotify({ userId, username, orderId, message });
        const keyboard = {
            inline_keyboard: [
                [{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${userId}` }],
                [{ text: '📋 Bestellung anzeigen', callback_data: `order_view_${orderId}` }]
            ]
        };

        const masterId = Number(config.MASTER_ADMIN_ID);
        const uniqueStaffIds = [...new Set([...admins.map(a => Number(a.telegram_id)), masterId])];

        await Promise.all(uniqueStaffIds.map(staffId =>
            bot.telegram.sendMessage(staffId, text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {})
        ));
    } catch (error) {
        console.error('Contact Notify Error:', error.message);
    }
};

// ── v0.3.1: Ban-Benachrichtigung an Master ──

const notifyMasterBan = async ({ userId, bannedBy, banId, time }) => {
    try {
        const masterId = config.MASTER_ADMIN_ID;
        if (!masterId) return;

        const text = texts.getMasterBanNotify({ userId, bannedBy, time });
        const keyboard = {
            inline_keyboard: [
                [{ text: '↩️ Ban rückgängig machen', callback_data: `master_revert_ban_${banId}` }],
                [{ text: '✅ Sofort bestätigen & löschen', callback_data: `master_confirm_ban_${banId}` }]
            ]
        };

        await bot.telegram.sendMessage(masterId, text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } catch (error) {
        console.error('Ban Notify Error:', error.message);
    }
};

module.exports = {
    init,
    sendBroadcast,
    notifyAdminsNewOrder,
    notifyMasterApproval,
    notifyMasterNewProduct,
    notifyCustomerStatusUpdate,
    sendOrderReceipt,
    notifyAdminsPing,
    notifyAdminsContact,
    notifyMasterBan
};
