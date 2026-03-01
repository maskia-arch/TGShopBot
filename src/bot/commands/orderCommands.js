const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const orderHelper = require('../../utils/orderHelper');
const notificationService = require('../../services/notificationService');

module.exports = (bot) => {

    // GEFIXT: Erkennt nun das Format /order + beliebige Zeichenfolge (z.B. /orderc4ae82)
    bot.hears(/^\/order.+/i, isAdmin, async (ctx) => {
        try {
            const input = ctx.message.text.trim().toLowerCase();
            const orderId = input.replace('/', ''); // Entfernt nur den Slash
            
            const order = await orderRepo.getOrderByOrderId(orderId);
            
            if (!order) return ctx.reply(`⚠️ Bestellung \`${orderId}\` nicht gefunden.`, { parse_mode: 'Markdown' });
            
            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);
            await ctx.reply(payload.text, { 
                parse_mode: 'Markdown', 
                reply_markup: payload.reply_markup, 
                disable_web_page_preview: true 
            });
        } catch (error) {
            console.error('Dynamic Order Command Error:', error.message);
            ctx.reply('❌ Fehler beim Laden der Bestellung.');
        }
    });

    bot.command('orderid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/orderid orderc4ae82`', { parse_mode: 'Markdown' });
            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply(`⚠️ Bestellung "${args}" nicht gefunden.`);
            
            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);
            await ctx.reply(payload.text, { parse_mode: 'Markdown', reply_markup: payload.reply_markup, disable_web_page_preview: true });
        } catch (error) {
            console.error('OrderID Error:', error.message);
            ctx.reply('❌ Fehler beim Laden.');
        }
    });

    bot.command('id', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/id orderc4ae82`', { parse_mode: 'Markdown' });
            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply('⚠️ Nicht gefunden.');
            
            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);
            await ctx.reply(payload.text, { parse_mode: 'Markdown', reply_markup: payload.reply_markup, disable_web_page_preview: true });
        } catch (error) {
            console.error('ID Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });

    bot.command('deleteid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/deleteid orderc4ae82`', { parse_mode: 'Markdown' });

            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply(`⚠️ Bestellung "${args}" nicht gefunden.`);

            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);

            if (isMaster) {
                await orderHelper.clearOldNotifications(ctx, order);
                await orderRepo.deleteOrder(args);
                ctx.reply(`🗑 Bestellung \`${order.order_id}\` gelöscht.`, { parse_mode: 'Markdown' });
            } else {
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApprovalRequest(
                    'ORDER_DELETE', ctx.from.id, order.order_id, order.order_id
                );

                ctx.reply(`📨 Löschanfrage für \`${order.order_id}\` an den Master gesendet.`, { parse_mode: 'Markdown' });

                notificationService.sendTo(config.MASTER_ADMIN_ID,
                    `🗑 *Löschanfrage*\n\nAdmin: ${adminName}\nBestellung: \`${order.order_id}\`\n\nSoll die Bestellung gelöscht werden?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Genehmigen', callback_data: `odel_approve_${approval.id}` }],
                                [{ text: '❌ Ablehnen', callback_data: `odel_reject_${approval.id}` }]
                            ]
                        }
                    }
                ).catch(() => {});
            }
        } catch (error) {
            console.error('DeleteID Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });

    bot.command('orders', isAdmin, async (ctx) => {
        try {
            const orders = await orderRepo.getAllOrders(30);
            if (!orders || orders.length === 0) return ctx.reply('📋 Keine Bestellungen vorhanden.');

            let text = '📋 *Alle Bestellungen*\n\n';
            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const txBadge = order.status === 'bezahlt_pending' ? '💸 ' : '';
                text += `${i + 1}. ${txBadge}/${order.order_id} | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)} | ${date}\n`;
            });

            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            const keyboard = { inline_keyboard: [] };
            if (isMaster) {
                keyboard.inline_keyboard.push([{ text: '🗑 ALLE löschen', callback_data: 'orders_delete_all_confirm' }]);
            }

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Orders Error:', error.message);
            ctx.reply('❌ Fehler beim Laden.');
        }
    });

    bot.command('ban', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args || !/^\d+$/.test(args)) return ctx.reply('⚠️ Beispiel: `/ban 123456789`', { parse_mode: 'Markdown' });
            const targetId = Number(args);
            if (targetId === ctx.from.id) return ctx.reply(texts.getBanSelfError());
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.reply(texts.getBanMasterError());
            if (await userRepo.isUserBanned(targetId)) return ctx.reply(texts.getBanAlreadyBanned());
            
            await userRepo.banUser(targetId);
            const pendingBan = await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});
            
            const bannedBy = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
            notificationService.notifyMasterBan({
                userId: targetId, bannedBy, banId: pendingBan.id,
                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            }).catch(() => {});
            
            ctx.reply(texts.getBanConfirmation(targetId), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ban Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });
};
