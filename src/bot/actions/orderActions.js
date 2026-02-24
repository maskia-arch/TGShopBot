const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
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
                return ctx.reply(texts.getMyOrdersEmpty(), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] }
                });
            }

            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const statusLabel = texts.getCustomerStatusLabel(order.status);
                text += `${i + 1}. \`${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${statusLabel}\n`;
                if (order.delivery_method === 'shipping') text += `🚚 Versand\n`;
                else if (order.delivery_method === 'pickup') text += `🏪 Abholung\n`;
                if (order.tx_id) text += `🔑 TX: \`${order.tx_id}\`\n`;
                text += `📅 ${date}\n\n`;

                // "Zahlung bestätigen" nur bei offenen ohne TX
                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }

                keyboard.push([
                    { text: `🔔 Ping: ${order.order_id}`, callback_data: `cust_ping_${order.order_id}` },
                    { text: `💬 Kontakt`, callback_data: `cust_contact_${order.order_id}` }
                ]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) {
            console.error('My Orders Error:', error.message);
        }
    });

    // ── Kunden: Zahlung bestätigen → TX-ID Abfrage ──
    bot.action(/^confirm_pay_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingTxId = orderId;

            await ctx.reply(texts.getTxIdPrompt(), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_txid' }]]
                }
            });
        } catch (error) {
            console.error('Confirm Pay Error:', error.message);
        }
    });

    bot.action('cancel_txid', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingTxId = null;
        await ctx.reply('❌ TX-ID Eingabe abgebrochen.', {
            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
        });
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
            await ctx.reply(texts.getPingSent(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
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
            const canContact = await userRepo.canContact(ctx.from.id);
            if (!canContact) return ctx.answerCbQuery(texts.getContactCooldown().replace('⏰ ', ''), { show_alert: true });
            ctx.answerCbQuery().catch(() => {});
            await ctx.scene.enter('contactScene', { orderId });
        } catch (error) {
            console.error('Contact Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // ADMIN: Offene Bestellungen (FIXED – ctx.reply statt updateOrSend)
    // ════════════════════════════════════

    bot.action('admin_open_orders', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orders = await orderRepo.getOpenOrders(20);

            if (!orders || orders.length === 0) {
                return ctx.reply('📋 Keine offenen Bestellungen.', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]] }
                });
            }

            let text = '📋 *Offene Bestellungen*\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const txBadge = order.tx_id ? ' 💸' : '';
                text += `${i + 1}. \`${order.order_id}\` | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)}${txBadge} | ${date}\n`;
                keyboard.push([{
                    text: `📋 ${order.order_id}${order.status === 'bezahlt_pending' ? ' 💸' : ''}`,
                    callback_data: `oview_${order.order_id}`
                }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) {
            console.error('Open Orders Error:', error.message);
            await ctx.reply('❌ Fehler beim Laden der Bestellungen.');
        }
    });

    // ════════════════════════════════════
    // ADMIN: Order-Detail Ansicht
    // ════════════════════════════════════

    bot.action(/^oview_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.reply(`⚠️ Bestellung "${orderId}" nicht gefunden.`);

            const date = formatters.formatDate(order.created_at);
            let text = `📋 *Bestellung ${order.order_id}*\n\n`;
            text += `👤 Kunde: ID ${order.user_id}\n📅 Datum: ${date}\n`;
            text += `💰 Betrag: ${formatters.formatPrice(order.total_amount)}\n`;
            text += `💳 Zahlung: ${order.payment_method_name || 'N/A'}\n`;
            text += `📦 Status: ${texts.getStatusLabel(order.status)}\n`;

            if (order.delivery_method === 'shipping') text += `🚚 Lieferung: Versand\n`;
            else if (order.delivery_method === 'pickup') text += `🏪 Lieferung: Abholung\n`;
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
                    [{ text: '📝 Notiz', callback_data: `onote_${order.order_id}` }],
                    [{ text: '🗑 Löschen', callback_data: `odel_${order.order_id}` }]
                ]
            };

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
        } catch (error) {
            console.error('Order View Error:', error.message);
        }
    });

    // ── Status ändern ──
    bot.action(/^ostatus_(ORD-\d+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            if (!updated) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus).catch(() => {});
            ctx.answerCbQuery(`✅ ${texts.getStatusLabel(newStatus)}`).catch(() => {});

            await ctx.reply(`✅ \`${orderId}\` → ${texts.getStatusLabel(newStatus)}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${orderId}` }]] }
            });
        } catch (error) {
            console.error('Status Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Notiz ──
    bot.action(/^onote_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingNote = orderId;
            await ctx.reply(`📝 *Notiz zu ${orderId}*\n\nSende deine Notiz als Text:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_note' }]] }
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action('cancel_note', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingNote = null;
        await ctx.reply('❌ Abgebrochen.');
    });

    // ── Bestellung löschen (mit Bestätigung) ──
    bot.action(/^odel_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        const orderId = ctx.match[1];
        await ctx.reply(`⚠️ \`${orderId}\` wirklich löschen?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗑 Ja', callback_data: `odel_confirm_${orderId}` }],
                    [{ text: '❌ Nein', callback_data: `oview_${orderId}` }]
                ]
            }
        });
    });

    bot.action(/^odel_confirm_(.+)$/, isAdmin, async (ctx) => {
        try {
            await orderRepo.deleteOrder(ctx.match[1]);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.reply(`🗑 Bestellung \`${ctx.match[1]}\` gelöscht.`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Alle löschen ──
    bot.action('orders_delete_all_confirm', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await ctx.reply('⚠️ *ALLE Bestellungen löschen?*\n\nDies kann nicht rückgängig gemacht werden!', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗑 JA, ALLE LÖSCHEN', callback_data: 'orders_delete_all_execute' }],
                    [{ text: '❌ Abbrechen', callback_data: 'admin_panel' }]
                ]
            }
        });
    });

    bot.action('orders_delete_all_execute', isAdmin, async (ctx) => {
        try {
            await orderRepo.deleteAllOrders();
            ctx.answerCbQuery('✅').catch(() => {});
            await ctx.reply('🗑 Alle Bestellungen gelöscht.', { parse_mode: 'Markdown' });
        } catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // MASTER: Kundenübersicht
    // ════════════════════════════════════

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();
            if (!customers || customers.length === 0) {
                return ctx.reply('📊 Keine Kunden registriert.', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]] }
                });
            }

            let text = `📊 *Kundenübersicht* (${customers.length})\n\n`;
            const keyboard = [];
            customers.slice(0, 20).forEach((c, i) => {
                const name = c.username ? `@${c.username}` : `ID: ${c.telegram_id}`;
                text += `${i + 1}. ${name}${c.is_banned ? ' 🚫' : ''}\n`;
                keyboard.push([{ text: `👤 ${c.username || c.telegram_id}`, callback_data: `cust_detail_${c.telegram_id}` }]);
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_detail_(\d+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const targetId = ctx.match[1];
            const orders = await orderRepo.getOrdersByUser(targetId);

            let text = `👤 *Kunde: ${targetId}*\n\n📋 Bestellungen: ${orders.length}\n`;
            if (orders.length > 0) {
                const total = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
                const active = orders.filter(o => ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand'].includes(o.status));
                text += `💰 Umsatz: ${formatters.formatPrice(total)}\n📬 Offen: ${active.length}\n`;
                text += `\n*Letzte Bestellungen:*\n`;
                orders.slice(0, 5).forEach((o, i) => {
                    text += `${i + 1}. /orderid ${o.order_id} | ${formatters.formatPrice(o.total_amount)} | ${texts.getStatusLabel(o.status)}\n`;
                });
            }

            await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👤 Kontaktieren', url: `tg://user?id=${targetId}` }],
                        [{ text: '🔨 Bannen', callback_data: `cust_ban_${targetId}` }],
                        [{ text: '🗑 Löschen', callback_data: `cust_delete_${targetId}` }],
                        [{ text: '🔙 Zurück', callback_data: 'master_customer_overview' }]
                    ]
                }
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_ban_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = Number(ctx.match[1]);
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.answerCbQuery('Master kann nicht gebannt werden.', { show_alert: true });
            if (await userRepo.isUserBanned(targetId)) return ctx.answerCbQuery('Bereits gebannt.', { show_alert: true });

            await userRepo.banUser(targetId);
            const pendingBan = await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});
            notificationService.notifyMasterBan({
                userId: targetId, bannedBy: 'Master', banId: pendingBan.id,
                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            }).catch(() => {});
            ctx.answerCbQuery('🔨 Gebannt!').catch(() => {});
            await ctx.reply(`🔨 User ${targetId} gebannt.`);
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^cust_delete_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.deleteUserCompletely(ctx.match[1]);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.reply(`🗑 User ${ctx.match[1]} gelöscht.`);
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // Ban-Aktionen
    // ════════════════════════════════════

    bot.action(/^master_revert_ban_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const ban = await userRepo.revertBan(ctx.match[1]);
            if (!ban) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });
            ctx.answerCbQuery('✅').catch(() => {});
            await ctx.reply(texts.getBanReverted(ban.user_id), { parse_mode: 'Markdown' });
        } catch (error) { ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {}); }
    });

    bot.action(/^master_confirm_ban_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const ban = await userRepo.getPendingBan(ctx.match[1]);
            if (!ban) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });
            await userRepo.confirmBan(ctx.match[1]);
            await userRepo.deleteUserCompletely(ban.user_id);
            ctx.answerCbQuery('✅').catch(() => {});
            await ctx.reply(texts.getBanConfirmed(ban.user_id), { parse_mode: 'Markdown' });
        } catch (error) { ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {}); }
    });

    // ════════════════════════════════════
    // TEXT HANDLER: TX-ID & Notizen
    // ════════════════════════════════════

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message || !ctx.message.text) return next();

        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            if (ctx.session) {
                ctx.session.awaitingTxId = null;
                ctx.session.awaitingNote = null;
            }
            return next();
        }

        // ── TX-ID vom Kunden ──
        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;

            try {
                const updated = await orderRepo.updateOrderTxId(orderId, input);
                if (!updated) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);

                // Bestätigung an Kunden
                await ctx.reply(texts.getTxIdConfirmed(orderId), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                });

                // Admin benachrichtigen
                const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
                notificationService.notifyAdminsTxId({
                    orderId, userId: ctx.from.id, username,
                    total: formatters.formatPrice(updated.total_amount || 0),
                    paymentName: updated.payment_method_name || 'N/A',
                    txId: input
                }).catch(() => {});
            } catch (error) {
                console.error('TX-ID Save Error:', error.message);
                ctx.reply('❌ Fehler beim Speichern. Bitte versuche es erneut.');
            }
            return;
        }

        // ── Admin-Notiz ──
        if (ctx.session.awaitingNote) {
            const orderId = ctx.session.awaitingNote;
            ctx.session.awaitingNote = null;

            try {
                const author = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const result = await orderRepo.addAdminNote(orderId, author, input);
                if (!result) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await ctx.reply(texts.getNoteAdded(orderId), { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Note Error:', error.message);
                ctx.reply('❌ Fehler beim Speichern.');
            }
            return;
        }

        return next();
    });
};
