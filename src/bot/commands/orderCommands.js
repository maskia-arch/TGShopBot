const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');

const showOrderDetail = async (ctx, searchId) => {
    const order = await orderRepo.getOrderByOrderId(searchId);
    if (!order) {
        return ctx.reply(`⚠️ Bestellung "${searchId}" nicht gefunden.`);
    }

    const username = order.users?.username ? `@${order.users.username}` : `ID: ${order.user_id}`;
    const date = formatters.formatDate(order.created_at);

    let text = `📋 *Bestellung ${order.order_id}*\n\n`;
    text += `👤 Kunde: ${username}\n📅 Datum: ${date}\n`;
    text += `💰 Betrag: ${formatters.formatPrice(order.total_amount)}\n`;
    text += `💳 Zahlung: ${order.payment_method_name || 'N/A'}\n`;
    text += `📦 Status: ${texts.getStatusLabel(order.status)}\n`;

    if (order.delivery_method === 'shipping') text += `🚚 Lieferung: Versand\n`;
    else if (order.delivery_method === 'pickup') text += `🏪 Lieferung: Abholung\n`;

    if (order.shipping_link) text += `\n📦 Adresse: [Privnote öffnen](${order.shipping_link})`;
    if (order.payment_link) text += `\n🔗 TX-Link: [Privnote öffnen](${order.payment_link})`;

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

    const keyboard = {
        inline_keyboard: [
            [{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${order.user_id}` }],
            [
                { text: '⚙️ In Bearbeitung', callback_data: `ostatus_${order.order_id}_in_bearbeitung` },
                { text: '📦 Versendet', callback_data: `ostatus_${order.order_id}_versand` }
            ],
            [
                { text: '✅ Abgeschlossen', callback_data: `ostatus_${order.order_id}_abgeschlossen` },
                { text: '❌ Abgebrochen', callback_data: `ostatus_${order.order_id}_abgebrochen` }
            ],
            [{ text: '📝 Notiz hinzufügen', callback_data: `onote_${order.order_id}` }],
            [{ text: '🗑 Bestellung löschen', callback_data: `odel_${order.order_id}` }]
        ]
    };

    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
};

module.exports = (bot) => {

    // ── /orderid [ORD-XXXXX] – Bestellung abrufen (Haupt-Befehl) ──
    bot.command('orderid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) {
                return ctx.reply('⚠️ Bitte gib eine Order-ID an.\n\nBeispiel: `/orderid ORD-00001`', { parse_mode: 'Markdown' });
            }
            await showOrderDetail(ctx, args);
        } catch (error) {
            console.error('OrderID Command Error:', error.message);
            ctx.reply(texts.getGeneralError());
        }
    });

    // ── /id [ORD-XXXXX] – Alias für /orderid ──
    bot.command('id', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) {
                return ctx.reply('⚠️ Bitte gib eine Order-ID an.\n\nBeispiel: `/id ORD-00001`', { parse_mode: 'Markdown' });
            }
            await showOrderDetail(ctx, args);
        } catch (error) {
            console.error('ID Command Error:', error.message);
            ctx.reply(texts.getGeneralError());
        }
    });

    // ── /deleteid [ORD-XXXXX] – Bestellung löschen ──
    bot.command('deleteid', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args) {
                return ctx.reply('⚠️ Bitte gib eine Order-ID an.\n\nBeispiel: `/deleteid ORD-00001`', { parse_mode: 'Markdown' });
            }
            await orderRepo.deleteOrder(args);
            ctx.reply(texts.getOrderDeleted(args), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('DeleteID Command Error:', error.message);
            ctx.reply(texts.getGeneralError());
        }
    });

    // ── /orders – Alle Bestellungen anzeigen ──
    bot.command('orders', isAdmin, async (ctx) => {
        try {
            const orders = await orderRepo.getAllOrders(30);

            if (!orders || orders.length === 0) {
                return ctx.reply(texts.getOrdersEmpty());
            }

            let text = texts.getOrdersListHeader() + '\n';

            orders.forEach((order, i) => {
                const username = order.users?.username ? `@${order.users.username}` : `ID: ${order.user_id}`;
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                text += `${i + 1}. /orderid ${order.order_id} | ${username} | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)} | ${date}\n`;
            });

            const keyboard = {
                inline_keyboard: [
                    [{ text: '🗑 ALLE Bestellungen löschen', callback_data: 'orders_delete_all_confirm' }]
                ]
            };

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Orders Command Error:', error.message);
            ctx.reply(texts.getGeneralError());
        }
    });

    // ── /ban [TelegramID] – User sperren ──
    bot.command('ban', isAdmin, async (ctx) => {
        try {
            const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!args || !/^\d+$/.test(args)) {
                return ctx.reply('⚠️ Bitte gib eine gültige Telegram-ID an.\n\nBeispiel: `/ban 123456789`', { parse_mode: 'Markdown' });
            }

            const targetId = Number(args);
            const userId = ctx.from.id;

            if (targetId === userId) return ctx.reply(texts.getBanSelfError());
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.reply(texts.getBanMasterError());

            const alreadyBanned = await userRepo.isUserBanned(targetId);
            if (alreadyBanned) return ctx.reply(texts.getBanAlreadyBanned());

            await userRepo.banUser(targetId);

            const bannedByName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${userId}`;
            const pendingBan = await userRepo.createPendingBan(targetId, userId);

            try { await bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {}); } catch (e) {}

            notificationService.notifyMasterBan({
                userId: targetId, bannedBy: bannedByName, banId: pendingBan.id,
                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            }).catch(() => {});

            ctx.reply(texts.getBanConfirmation(targetId), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ban Command Error:', error.message);
            ctx.reply(texts.getGeneralError());
        }
    });
};
