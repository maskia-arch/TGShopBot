const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const { isAdmin, isMasterAdmin } = require('../middlewares/auth');
const config = require('../../config');
const notificationService = require('../../services/notificationService');

module.exports = (bot) => {

    // ════════════════════════════════════
    // KUNDEN: Meine Bestellungen
    // ════════════════════════════════════

    bot.action('my_orders', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const orders = await orderRepo.getActiveOrdersByUser(userId);

            if (!orders || orders.length === 0) {
                return uiHelper.updateOrSend(ctx, texts.getMyOrdersEmpty(), {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]]
                });
            }

            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                text += `${i + 1}. \`${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)}\n`;
                if (order.delivery_method === 'shipping') text += `🚚 Versand\n`;
                else if (order.delivery_method === 'pickup') text += `🏪 Abholung\n`;
                text += `📅 ${date}\n\n`;

                keyboard.push([
                    { text: `🔔 Ping: ${order.order_id}`, callback_data: `cust_ping_${order.order_id}` },
                    { text: `💬 Kontakt: ${order.order_id}`, callback_data: `cust_contact_${order.order_id}` }
                ]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error('My Orders Error:', error.message);
        }
    });

    // ── Kunden-Ping ──
    bot.action(/^cust_ping_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;

            const canPing = await userRepo.canPing(userId);
            if (!canPing) return ctx.answerCbQuery(texts.getPingCooldown().replace('⏰ ', ''), { show_alert: true });

            await userRepo.setPingTimestamp(userId);
            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
            notificationService.notifyAdminsPing({ userId, username, orderId }).catch(() => {});

            ctx.answerCbQuery('✅ Ping gesendet!').catch(() => {});
            await uiHelper.updateOrSend(ctx, texts.getPingSent(), {
                inline_keyboard: [[{ text: '📋 Zurück zu Bestellungen', callback_data: 'my_orders' }]]
            });
        } catch (error) {
            console.error('Ping Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Kunden-Kontaktanfrage ──
    bot.action(/^cust_contact_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const canContact = await userRepo.canContact(userId);
            if (!canContact) return ctx.answerCbQuery(texts.getContactCooldown().replace('⏰ ', ''), { show_alert: true });

            ctx.answerCbQuery().catch(() => {});
            await ctx.scene.enter('contactScene', { orderId });
        } catch (error) {
            console.error('Contact Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // ADMIN: Order-Aktionen via Buttons
    // ════════════════════════════════════

    // ── Bestellung anzeigen (Callback) ──
    bot.action(/^oview_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const username = order.users?.username ? `@${order.users.username}` : `ID: ${order.user_id}`;
            const date = formatters.formatDate(order.created_at);

            let text = `📋 *Bestellung ${order.order_id}*\n\n`;
            text += `👤 ${username}\n📅 ${date}\n💰 ${formatters.formatPrice(order.total_amount)}\n`;
            text += `💳 ${order.payment_method_name || 'N/A'}\n📦 ${texts.getStatusLabel(order.status)}\n`;

            if (order.delivery_method === 'shipping') text += `🚚 Versand\n`;
            else if (order.delivery_method === 'pickup') text += `🏪 Abholung\n`;
            if (order.shipping_link) text += `\n📦 Adresse: [Privnote](${order.shipping_link})`;
            if (order.payment_link) text += `\n🔗 TX: [Privnote](${order.payment_link})`;

            if (order.admin_notes && order.admin_notes.length > 0) {
                text += `\n\n📝 *Notizen:*`;
                order.admin_notes.forEach((note, i) => {
                    const nd = new Date(note.date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
                    text += `\n${i + 1}. _${note.author}_ (${nd}): ${note.text}`;
                });
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '👤 Kontaktieren', url: `tg://user?id=${order.user_id}` }],
                    [
                        { text: '⚙️ Bearb.', callback_data: `ostatus_${order.order_id}_in_bearbeitung` },
                        { text: '📦 Versand', callback_data: `ostatus_${order.order_id}_versand` }
                    ],
                    [
                        { text: '✅ Fertig', callback_data: `ostatus_${order.order_id}_abgeschlossen` },
                        { text: '❌ Abbruch', callback_data: `ostatus_${order.order_id}_abgebrochen` }
                    ],
                    [{ text: '📝 Notiz', callback_data: `onote_${order.order_id}` }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error('Order View Error:', error.message);
        }
    });

    // ── Status ändern (FIXED regex: matches ORD-00001) ──
    bot.action(/^ostatus_(ORD-\d+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            if (!updated) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus).catch(() => {});
            ctx.answerCbQuery(`Status: ${texts.getStatusLabel(newStatus)}`).catch(() => {});

            // Refresh der Ansicht
            ctx.update.callback_query.data = `oview_${orderId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Status Update Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Notiz hinzufügen ──
    bot.action(/^onote_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            ctx.session.awaitingNote = orderId;
            await uiHelper.updateOrSend(ctx, `📝 *Notiz zu ${orderId}*\n\nBitte sende jetzt deine Notiz als Text:`, {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]]
            });
        } catch (error) {
            console.error('Note Prompt Error:', error.message);
        }
    });

    // ── Bestellung löschen ──
    bot.action(/^odel_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await uiHelper.updateOrSend(ctx, texts.getOrderDeleted(orderId), {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
            });
        } catch (error) {
            console.error('Order Delete Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Alle Bestellungen löschen ──
    bot.action('orders_delete_all_confirm', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, '⚠️ *ACHTUNG*\n\nAlle Bestellungen werden unwiderruflich gelöscht!', {
            inline_keyboard: [
                [{ text: '🗑 JA, ALLE LÖSCHEN', callback_data: 'orders_delete_all_execute' }],
                [{ text: '❌ Abbrechen', callback_data: 'admin_panel' }]
            ]
        });
    });

    bot.action('orders_delete_all_execute', isAdmin, async (ctx) => {
        try {
            await orderRepo.deleteAllOrders();
            ctx.answerCbQuery('✅ Alle gelöscht!').catch(() => {});
            await uiHelper.updateOrSend(ctx, texts.getOrdersDeletedAll(), {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
            });
        } catch (error) {
            console.error('Delete All Orders Error:', error.message);
        }
    });

    // ── Offene Bestellungen (Panel) ──
    bot.action('admin_open_orders', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orders = await orderRepo.getOpenOrders(20);
            if (!orders || orders.length === 0) {
                return uiHelper.updateOrSend(ctx, '📋 Keine offenen Bestellungen.', {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
                });
            }

            let text = '📋 *Offene Bestellungen*\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const username = order.users?.username ? `@${order.users.username}` : `ID: ${order.user_id}`;
                text += `${i + 1}. /orderid ${order.order_id} | ${username} | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)}\n`;
                keyboard.push([{ text: `📋 ${order.order_id}`, callback_data: `oview_${order.order_id}` }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Open Orders Error:', error.message);
        }
    });

    // ════════════════════════════════════
    // MASTER: Kundenübersicht (erweitert)
    // ════════════════════════════════════

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();

            if (!customers || customers.length === 0) {
                return uiHelper.updateOrSend(ctx, '📊 *Kundenübersicht*\n\nKeine Kunden registriert.', {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]]
                });
            }

            let text = `📊 *Kundenübersicht* (${customers.length} Kunden)\n\n`;
            const keyboard = [];

            // Zeige die letzten 20 Kunden
            const shown = customers.slice(0, 20);
            shown.forEach((c, i) => {
                const name = c.username ? `@${c.username}` : `ID: ${c.telegram_id}`;
                const banned = c.is_banned ? ' 🚫' : '';
                text += `${i + 1}. ${name}${banned}\n`;
                keyboard.push([{ text: `👤 ${c.username || c.telegram_id}`, callback_data: `cust_detail_${c.telegram_id}` }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Customer Overview Error:', error.message);
        }
    });

    // ── Kunden-Detail (Master) ──
    bot.action(/^cust_detail_(\d+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const targetId = ctx.match[1];
            const orders = await orderRepo.getOrdersByUser(targetId);

            let text = `👤 *Kunde: ${targetId}*\n\n`;
            text += `📋 *Bestellungen:* ${orders.length}\n`;

            if (orders.length > 0) {
                const totalSpent = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
                const activeOrders = orders.filter(o => ['offen', 'in_bearbeitung', 'versand'].includes(o.status));
                text += `💰 *Gesamtumsatz:* ${formatters.formatPrice(totalSpent)}\n`;
                text += `📬 *Offene Bestellungen:* ${activeOrders.length}\n`;
                text += `📅 *Letzte Bestellung:* ${new Date(orders[0].created_at).toLocaleDateString('de-DE')}\n`;

                text += `\n*Letzte Bestellungen:*\n`;
                orders.slice(0, 5).forEach((o, i) => {
                    text += `${i + 1}. /orderid ${o.order_id} | ${formatters.formatPrice(o.total_amount)} | ${texts.getStatusLabel(o.status)}\n`;
                });
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '👤 Kontaktieren', url: `tg://user?id=${targetId}` }],
                    [{ text: '🔨 User bannen', callback_data: `cust_ban_${targetId}` }],
                    [{ text: '🗑 User & Daten löschen', callback_data: `cust_delete_${targetId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_customer_overview' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error('Customer Detail Error:', error.message);
        }
    });

    // ── Kunde bannen (aus Kundenübersicht) ──
    bot.action(/^cust_ban_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = Number(ctx.match[1]);
            if (targetId === Number(config.MASTER_ADMIN_ID)) {
                return ctx.answerCbQuery(texts.getBanMasterError(), { show_alert: true });
            }

            const alreadyBanned = await userRepo.isUserBanned(targetId);
            if (alreadyBanned) return ctx.answerCbQuery(texts.getBanAlreadyBanned(), { show_alert: true });

            await userRepo.banUser(targetId);
            const pendingBan = await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});

            notificationService.notifyMasterBan({
                userId: targetId, bannedBy: `Master`,
                banId: pendingBan.id,
                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            }).catch(() => {});

            ctx.answerCbQuery('🔨 User gebannt!').catch(() => {});
            ctx.update.callback_query.data = `cust_detail_${targetId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Customer Ban Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Kunde löschen (aus Kundenübersicht) ──
    bot.action(/^cust_delete_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = ctx.match[1];
            await userRepo.deleteUserCompletely(targetId);
            ctx.answerCbQuery('🗑 User & Daten gelöscht!').catch(() => {});
            ctx.update.callback_query.data = 'master_customer_overview';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Customer Delete Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // MASTER: Ban-Aktionen via Buttons
    // ════════════════════════════════════

    bot.action(/^master_revert_ban_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const banId = ctx.match[1];
            const ban = await userRepo.revertBan(banId);
            if (!ban) return ctx.answerCbQuery('Ban nicht gefunden.', { show_alert: true });

            ctx.answerCbQuery('✅ Ban rückgängig!').catch(() => {});
            await ctx.editMessageText(texts.getBanReverted(ban.user_id), { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            console.error('Revert Ban Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^master_confirm_ban_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const banId = ctx.match[1];
            const ban = await userRepo.getPendingBan(banId);
            if (!ban) return ctx.answerCbQuery('Ban nicht gefunden.', { show_alert: true });

            await userRepo.confirmBan(banId);
            await userRepo.deleteUserCompletely(ban.user_id);

            ctx.answerCbQuery('✅ Bestätigt & gelöscht!').catch(() => {});
            await ctx.editMessageText(texts.getBanConfirmed(ban.user_id), { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            console.error('Confirm Ban Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // TEXT HANDLER: Notizen empfangen
    // ════════════════════════════════════

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.session.awaitingNote || !ctx.message.text) return next();

        const orderId = ctx.session.awaitingNote;
        const noteText = ctx.message.text.trim();

        if (noteText.startsWith('/')) {
            ctx.session.awaitingNote = null;
            return next();
        }

        try {
            const authorName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
            const result = await orderRepo.addAdminNote(orderId, authorName, noteText);
            ctx.session.awaitingNote = null;

            if (!result) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
            await ctx.reply(texts.getNoteAdded(orderId), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Add Note Error:', error.message);
            ctx.session.awaitingNote = null;
            ctx.reply(texts.getGeneralError());
        }
    });
};
