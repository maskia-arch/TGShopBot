const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const { isAdmin } = require('../middlewares/auth');
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
            if (!canPing) {
                return ctx.answerCbQuery(texts.getPingCooldown().replace('⏰ ', ''), { show_alert: true });
            }

            await userRepo.setPingTimestamp(userId);
            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');

            notificationService.notifyAdminsPing({ userId, username, orderId }).catch(() => {});

            ctx.answerCbQuery('✅ Ping gesendet!').catch(() => {});
            await uiHelper.updateOrSend(ctx, texts.getPingSent(), {
                inline_keyboard: [[{ text: '📋 Zurück zu Bestellungen', callback_data: 'my_orders' }]]
            });
        } catch (error) {
            console.error('Ping Error:', error.message);
            ctx.answerCbQuery('Fehler beim Senden.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Kunden-Kontaktanfrage ──
    bot.action(/^cust_contact_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;

            const canContact = await userRepo.canContact(userId);
            if (!canContact) {
                return ctx.answerCbQuery(texts.getContactCooldown().replace('⏰ ', ''), { show_alert: true });
            }

            ctx.answerCbQuery().catch(() => {});

            // In die Kontakt-Scene eintreten
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
    bot.action(/^order_view_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) {
                return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });
            }

            const username = order.users?.username ? `@${order.users.username}` : `ID: ${order.user_id}`;
            const date = formatters.formatDate(order.created_at);

            let text = `📋 *Bestellung ${order.order_id}*\n\n`;
            text += `👤 Kunde: ${username}\n📅 ${date}\n`;
            text += `💰 ${formatters.formatPrice(order.total_amount)}\n`;
            text += `💳 ${order.payment_method_name || 'N/A'}\n`;
            text += `📦 ${texts.getStatusLabel(order.status)}\n`;

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
                        { text: '⚙️ Bearb.', callback_data: `order_status_${order.order_id}_in_bearbeitung` },
                        { text: '📦 Versand', callback_data: `order_status_${order.order_id}_versand` }
                    ],
                    [
                        { text: '✅ Fertig', callback_data: `order_status_${order.order_id}_abgeschlossen` },
                        { text: '❌ Abbruch', callback_data: `order_status_${order.order_id}_abgebrochen` }
                    ],
                    [{ text: '📝 Notiz', callback_data: `order_note_${order.order_id}` }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error('Order View Error:', error.message);
        }
    });

    // ── Status ändern ──
    bot.action(/^order_status_([A-Z]+-\d+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            if (!updated) {
                return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });
            }

            // Kunden benachrichtigen
            notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus).catch(() => {});

            ctx.answerCbQuery(`Status: ${texts.getStatusLabel(newStatus)}`).catch(() => {});

            // Bestellansicht aktualisieren
            ctx.update.callback_query.data = `order_view_${orderId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Status Update Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Notiz hinzufügen (Prompt) ──
    bot.action(/^order_note_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            ctx.session.awaitingNote = orderId;

            await uiHelper.updateOrSend(ctx, `📝 *Notiz zu ${orderId}*\n\nBitte sende jetzt deine Notiz als Text:`, {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `order_view_${orderId}` }]]
            });
        } catch (error) {
            console.error('Note Prompt Error:', error.message);
        }
    });

    // ── Bestellung löschen (Einzeln) ──
    bot.action(/^order_delete_(.+)$/, isAdmin, async (ctx) => {
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

    // ── Alle Bestellungen löschen (Bestätigung) ──
    bot.action('orders_delete_all_confirm', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, '⚠️ *ACHTUNG*\n\nAlle Bestellungen werden unwiderruflich gelöscht!\n\nBist du sicher?', {
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
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Offene Bestellungen (Panel Button) ──
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
                text += `${i + 1}. \`${order.order_id}\` | ${username} | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)}\n`;
                keyboard.push([{ text: `📋 ${order.order_id}`, callback_data: `order_view_${order.order_id}` }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Open Orders Error:', error.message);
        }
    });

    // ════════════════════════════════════
    // MASTER: Ban-Aktionen via Buttons
    // ════════════════════════════════════

    bot.action(/^master_revert_ban_(.+)$/, async (ctx) => {
        try {
            if (ctx.from.id !== Number(require('../../config').MASTER_ADMIN_ID)) {
                return ctx.answerCbQuery('⛔ Nur für den Master.', { show_alert: true });
            }

            const banId = ctx.match[1];
            const ban = await userRepo.revertBan(banId);

            if (!ban) {
                return ctx.answerCbQuery('Ban nicht gefunden.', { show_alert: true });
            }

            ctx.answerCbQuery('✅ Ban rückgängig gemacht!').catch(() => {});
            await ctx.editMessageText(texts.getBanReverted(ban.user_id), { parse_mode: 'Markdown' }).catch(() => {});
        } catch (error) {
            console.error('Revert Ban Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^master_confirm_ban_(.+)$/, async (ctx) => {
        try {
            if (ctx.from.id !== Number(require('../../config').MASTER_ADMIN_ID)) {
                return ctx.answerCbQuery('⛔ Nur für den Master.', { show_alert: true });
            }

            const banId = ctx.match[1];
            const ban = await userRepo.getPendingBan(banId);

            if (!ban) {
                return ctx.answerCbQuery('Ban nicht gefunden.', { show_alert: true });
            }

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

            if (!result) {
                return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
            }

            await ctx.reply(texts.getNoteAdded(orderId), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Add Note Error:', error.message);
            ctx.session.awaitingNote = null;
            ctx.reply(texts.getGeneralError());
        }
    });
};
