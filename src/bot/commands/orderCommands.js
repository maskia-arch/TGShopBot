const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');

async function clearOldNotifications(ctx, order) {
    if (!order || !order.notification_msg_ids || order.notification_msg_ids.length === 0) return;
    for (const msg of order.notification_msg_ids) {
        try {
            await ctx.telegram.deleteMessage(msg.chat_id, msg.message_id);
        } catch (e) {}
    }
    await orderRepo.clearNotificationMsgIds(order.order_id);
}

module.exports = (bot) => {

    // Dynamischer Regex-Handler für klickbare IDs (reagiert auf /orderXXXXXX)
    bot.hears(/^\/order[a-z0-9]{6}$/i, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.message.text.replace('/', '').trim().toLowerCase();
            const order = await orderRepo.getOrderByOrderId(orderId);
            
            if (!order) return ctx.reply(`⚠️ Bestellung \`${orderId}\` nicht gefunden.`, { parse_mode: 'Markdown' });
            
            await clearOldNotifications(ctx, order);
            await showOrderView(ctx, order);
        } catch (error) {
            console.error('Dynamic Order Command Error:', error.message);
            ctx.reply('❌ Fehler beim Laden der Bestellung.');
        }
    });

    bot.command('orderid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/orderid order26lc54`', { parse_mode: 'Markdown' });
            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply(`⚠️ Bestellung "${args}" nicht gefunden.`);
            
            await clearOldNotifications(ctx, order);
            await showOrderView(ctx, order);
        } catch (error) {
            console.error('OrderID Error:', error.message);
            ctx.reply('❌ Fehler beim Laden.');
        }
    });

    bot.command('id', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/id order26lc54`', { parse_mode: 'Markdown' });
            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply('⚠️ Nicht gefunden.');
            
            await clearOldNotifications(ctx, order);
            await showOrderView(ctx, order);
        } catch (error) {
            console.error('ID Error:', error.message);
            ctx.reply('❌ Fehler.');
        }
    });

    bot.command('deleteid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) return ctx.reply('⚠️ Beispiel: `/deleteid order26lc54`', { parse_mode: 'Markdown' });

            const order = await orderRepo.getOrderByOrderId(args);
            if (!order) return ctx.reply(`⚠️ Bestellung "${args}" nicht gefunden.`);

            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);

            if (isMaster) {
                await clearOldNotifications(ctx, order);
                await orderRepo.deleteOrder(args);
                ctx.reply(`🗑 Bestellung \`${order.order_id}\` gelöscht.`, { parse_mode: 'Markdown' });
            } else {
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApprovalRequest(
                    'ORDER_DELETE', ctx.from.id, order.order_id, order.order_id
                );

                ctx.reply(
                    `📨 Löschanfrage für \`${order.order_id}\` an den Master gesendet.`,
                    { parse_mode: 'Markdown' }
                );

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

// VEREINHEITLICHTE VIEW (Identisch mit der neuen Ansicht in orderActions.js)
async function showOrderView(ctx, order) {
    const date = formatters.formatDate(order.created_at);
    let text = `📋 *Bestellung #${order.order_id}*\n\n`;
    text += `👤 Kunde: ID ${order.user_id}\n📅 Datum: ${date}\n`;
    text += `💰 Betrag: ${formatters.formatPrice(order.total_amount)}\n`;
    text += `💳 Zahlung: ${order.payment_method_name || 'N/A'}\n`;
    text += `📦 Status: ${texts.getStatusLabel(order.status)}\n`;

    const method = order.delivery_method;
    if (method === 'shipping') text += `🚚 Lieferung: Versand\n`;
    else if (method === 'pickup') text += `🏪 Lieferung: Abholung\n`;
    else if (method === 'none' || !method) text += `📱 Lieferung: Digital\n`;

    if (order.shipping_link) text += `\n📦 Adresse: [Privnote](${order.shipping_link})`;
    if (order.tx_id) text += `\n🔑 TX-ID: \`${order.tx_id}\``;

    if (order.admin_notes && order.admin_notes.length > 0) {
        text += `\n\n📝 *Notizen:*`;
        order.admin_notes.forEach((note, i) => {
            const nd = new Date(note.date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
            text += `\n${i + 1}. _${note.author}_ (${nd}): ${note.text}`;
        });
    }

    if (order.details && order.details.length > 0) {
        text += `\n\n*Artikel:*`;
        order.details.forEach(item => {
            text += `\n▪️ ${item.quantity}x ${item.name} = ${formatters.formatPrice(item.total)}`;
        });
    }

    const keyboard = { inline_keyboard: [] };
    keyboard.inline_keyboard.push([{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${order.user_id}` }]);

    // Digitaler Lieferbutton
    if (method === 'none' || !method) {
        keyboard.inline_keyboard.push([{ text: '📥 Digital Liefern', callback_data: `odelivery_${order.order_id}` }]);
    }

    keyboard.inline_keyboard.push(
        [
            { text: '⚙️ In Bearbeitung', callback_data: `ostatus_${order.order_id}_in_bearbeitung` },
            { text: '📦 Versendet', callback_data: `ostatus_${order.order_id}_versand` }
        ],
        [
            { text: '✅ Abgeschlossen', callback_data: `ostatus_${order.order_id}_abgeschlossen` },
            { text: '❌ Abgebrochen', callback_data: `ostatus_${order.order_id}_abgebrochen` }
        ],
        [{ text: '📝 Notiz', callback_data: `onote_${order.order_id}` }],
        [{ text: '🗑 Löschen', callback_data: `odel_${order.order_id}` }],
        [{ text: '🔙 Zurück zum Panel', callback_data: 'admin_panel' }] // <-- NEU HINZUGEFÜGT
    );

    await ctx.reply(text, { 
        parse_mode: 'Markdown', 
        reply_markup: keyboard, 
        disable_web_page_preview: true 
    });
}
