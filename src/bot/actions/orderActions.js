const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const orderHelper = require('../../utils/orderHelper'); // NEU: Helper importiert
const { isAdmin, isMasterAdmin } = require('../middlewares/auth');
const config = require('../../config');
const notificationService = require('../../services/notificationService');

const FINAL_STATUSES = ['abgeschlossen', 'abgebrochen'];

module.exports = (bot) => {

    bot.action('my_orders', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const orders = await orderRepo.getActiveOrdersByUser(userId);

            if (!orders || orders.length === 0) {
                const emptyText = texts.getMyOrdersEmpty();
                const kb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] };
                return await ctx.editMessageText(emptyText, { parse_mode: 'Markdown', reply_markup: kb }).catch(async () => {
                    await ctx.reply(emptyText, { parse_mode: 'Markdown', reply_markup: kb });
                });
            }

            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const statusLabel = texts.getCustomerStatusLabel(order.status);
                text += `${i + 1}. \`#${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${statusLabel}\n`;
                if (order.delivery_method === 'shipping') text += `🚚 Versand\n`;
                else if (order.delivery_method === 'pickup') text += `🏪 Abholung\n`;
                if (order.tx_id) text += `🔑 TX: \`${order.tx_id}\`\n`;
                text += `📅 ${date}\n\n`;

                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }

                keyboard.push([
                    { text: `🔔 Ping: ${order.order_id}`, callback_data: `cust_ping_${order.order_id}` },
                    { text: `💬 Kontakt`, callback_data: `cust_contact_${order.order_id}` }
                ]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('My Orders Error:', error.message);
        }
    });

    bot.action(/^confirm_pay_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingTxId = orderId;
            await ctx.reply(texts.getTxIdPrompt(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_txid' }]] }
            });
        } catch (error) { console.error('Confirm Pay Error:', error.message); }
    });
    bot.action('admin_open_orders', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orders = await orderRepo.getOpenOrders(20);
            let text = '';
            const keyboard = [];

            if (!orders || orders.length === 0) {
                text = '📋 Keine offenen Bestellungen.';
            } else {
                text = '📋 *Offene Bestellungen*\n\n';
                orders.forEach((order, i) => {
                    const date = new Date(order.created_at).toLocaleDateString('de-DE');
                    const txBadge = order.tx_id ? ' 💸' : '';
                    text += `${i + 1}. \`#${order.order_id}\` | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)}${txBadge} | ${date}\n`;
                    keyboard.push([{
                        text: `📋 ${order.order_id}${order.status === 'bezahlt_pending' ? ' 💸' : ''}`,
                        callback_data: `oview_${order.order_id}`
                    }]);
                });
            }
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^oview_([\w-]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.reply(`⚠️ Bestellung "${orderId}" nicht gefunden.`);

            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);

            await ctx.editMessageText(payload.text, { 
                parse_mode: 'Markdown', 
                reply_markup: payload.reply_markup, 
                disable_web_page_preview: true 
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^ostatus_([\w-]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            if (FINAL_STATUSES.includes(order.status)) {
                return ctx.reply(`⚠️ *Sicherheitsabfrage*\nStatus ist bereits final (${order.status}). Wirklich ändern?`, {
                    reply_markup: { inline_keyboard: [[{ text: '✅ Erzwingen', callback_data: `ostatus_force_${orderId}_${newStatus}` }], [{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]] }
                });
            }

            await orderHelper.clearOldNotifications(ctx, order);
            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            const sentMsg = await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            if (sentMsg) await orderRepo.addNotificationMsgId(orderId, sentMsg.chat.id, sentMsg.message_id);

            const payload = await orderHelper.buildOrderViewPayload(updated);
            await ctx.editMessageText(payload.text, { parse_mode: 'Markdown', reply_markup: payload.reply_markup });
        } catch (error) { console.error(error.message); }
    });
    bot.action(/^odel_([\w-]+)$/, isAdmin, async (ctx) => {
        const orderId = ctx.match[1];
        if (ctx.from.id === Number(config.MASTER_ADMIN_ID)) {
            return ctx.reply(`⚠️ \`#${orderId}\` endgültig löschen?`, {
                reply_markup: { inline_keyboard: [[{ text: '🗑 Löschen', callback_data: `odel_confirm_${orderId}` }], [{ text: '❌ Nein', callback_data: `oview_${orderId}` }]] }
            });
        }
        // Admin-Löschanfrage Logik...
        const approval = await approvalRepo.createApprovalRequest('ORDER_DELETE', ctx.from.id, orderId, orderId);
        ctx.reply('📨 Löschanfrage an Master gesendet.');
        notificationService.sendTo(config.MASTER_ADMIN_ID, `🗑 *Löschanfrage*\nBestellung: \`#${orderId}\``, {
            reply_markup: { inline_keyboard: [[{ text: '✅ OK', callback_data: `odel_approve_${approval.id}` }, { text: '❌ NO', callback_data: `odel_reject_${approval.id}` }]] }
        });
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            ctx.session.awaitingNote = null;
            return next();
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            const updated = await orderRepo.updateOrderTxId(orderId, input);
            ctx.reply(texts.getTxIdConfirmed(orderId), { parse_mode: 'Markdown' });
            notificationService.notifyAdminsTxId({ orderId, userId: ctx.from.id, txId: input });
            return;
        }

        if (ctx.session.awaitingNote) {
            const orderId = ctx.session.awaitingNote;
            ctx.session.awaitingNote = null;
            const author = ctx.from.username || `ID:${ctx.from.id}`;
            await orderRepo.addAdminNote(orderId, author, input);
            ctx.reply(texts.getNoteAdded(orderId), { parse_mode: 'Markdown' });
            return;
        }
        return next();
    });
};
