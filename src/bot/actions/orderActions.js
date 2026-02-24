const orderRepo = require('../../database/repositories/orderRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
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

                // Zeige "Zahlung bestätigen" nur bei offenen Orders ohne TX-ID
                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }

                keyboard.push([
                    { text: `🔔 Ping: ${order.order_id}`, callback_data: `cust_ping_${order.order_id}` },
                    { text: `💬 Kontakt: ${order.order_id}`, callback_data: `cust_contact_${order.order_id}` }
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

    // ── Abbrechen TX-ID ──
    bot.action('cancel_txid', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingTxId = null;
        try {
            await ctx.editMessageText('❌ TX-ID Eingabe abgebrochen.', { parse_mode: 'Markdown' });
        } catch (e) {}
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
    // ADMIN: Offene Bestellungen
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
                text += `${i + 1}. \`${order.order_id}\` | ${formatters.formatPrice(order.total_amount)} | ${texts.getStatusLabel(order.status)} | ${date}`;
                if (order.tx_id) text += ` | TX: ✅`;
                text += `\n`;
                keyboard.push([{ text: `📋 ${order.order_id} ${order.status === 'bezahlt_pending' ? '💸' : ''}`, callback_data: `oview_${order.order_id}` }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) {
            console.error('Open Orders Error:', error.message);
            await ctx.reply(texts.getGeneralError());
        }
    });

    // ════════════════════════════════════
    // ADMIN: Order-Aktionen via Buttons
    // ════════════════════════════════════

    bot.action(/^oview_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) {
                return ctx.reply(`⚠️ Bestellung "${orderId}" nicht gefunden.`);
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
                    [{ text: '📝 Notiz hinzufügen', callback_data: `onote_${order.order_id}` }],
                    [{ text: '🗑 Bestellung löschen', callback_data: `odel_${order.order_id}` }]
                ]
            };

            // Persistent message (neue Nachricht, nicht editieren)
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
            if (!updated) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            // Kunden über Status-Update benachrichtigen
            notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus).catch(() => {});
            ctx.answerCbQuery(`✅ Status: ${texts.getStatusLabel(newStatus)}`).catch(() => {});

            // Aktualisierte Ansicht als neue Nachricht
            await ctx.reply(`✅ Status von \`${orderId}\` geändert zu: ${texts.getStatusLabel(newStatus)}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${orderId}` }]]
                }
            });
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
            await ctx.reply(`📝 *Notiz zu ${orderId}*\n\nBitte sende jetzt deine Notiz als Text:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `cancel_note` }]] }
            });
        } catch (error) {
            console.error('Note Prompt Error:', error.message);
        }
    });

    bot.action('cancel_note', isAdmin, async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingNote = null;
        try { await ctx.editMessageText('❌ Notiz abgebrochen.'); } catch (e) {}
    });

    // ── Bestellung löschen ──
    bot.action(/^odel_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            ctx.answerCbQuery().catch(() => {});

            await ctx.reply(`⚠️ Bestellung \`${orderId}\` wirklich löschen?`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🗑 Ja, löschen', callback_data: `odel_confirm_${orderId}` }],
                        [{ text: '❌ Nein', callback_data: `oview_${orderId}` }]
                    ]
                }
            });
        } catch (error) {
            console.error('Order Delete Prompt Error:', error.message);
        }
    });

    bot.action(/^odel_confirm_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.editMessageText(texts.getOrderDeleted(orderId), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Order Delete Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Alle Bestellungen löschen ──
    bot.action('orders_delete_all_confirm', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await ctx.reply('⚠️ *ACHTUNG*\n\nAlle Bestellungen werden unwiderruflich gelöscht!', {
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
            ctx.answerCbQuery('✅ Alle gelöscht!').catch(() => {});
            await ctx.editMessageText(texts.getOrdersDeletedAll(), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Delete All Orders Error:', error.message);
        }
    });

    // ════════════════════════════════════
    // MASTER: Kundenübersicht
    // ════════════════════════════════════

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();
            if (!customers || customers.length === 0) {
                return ctx.reply('📊 *Kundenübersicht*\n\nKeine Kunden registriert.', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]] }
                });
            }

            let text = `📊 *Kundenübersicht* (${customers.length} Kunden)\n\n`;
            const keyboard = [];
            const shown = customers.slice(0, 20);
            shown.forEach((c, i) => {
                const name = c.username ? `@${c.username}` : `ID: ${c.telegram_id}`;
                const banned = c.is_banned ? ' 🚫' : '';
                text += `${i + 1}. ${name}${banned}\n`;
                keyboard.push([{ text: `👤 ${c.username || c.telegram_id}`, callback_data: `cust_detail_${c.telegram_id}` }]);
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
        } catch (error) {
            console.error('Customer Overview Error:', error.message);
        }
    });

    bot.action(/^cust_detail_(\d+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const targetId = ctx.match[1];
            const orders = await orderRepo.getOrdersByUser(targetId);

            let text = `👤 *Kunde: ${targetId}*\n\n`;
            text += `📋 *Bestellungen:* ${orders.length}\n`;

            if (orders.length > 0) {
                const totalSpent = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
                const activeOrders = orders.filter(o => ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand'].includes(o.status));
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

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Customer Detail Error:', error.message);
        }
    });

    bot.action(/^cust_ban_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = Number(ctx.match[1]);
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.answerCbQuery(texts.getBanMasterError(), { show_alert: true });

            const alreadyBanned = await userRepo.isUserBanned(targetId);
            if (alreadyBanned) return ctx.answerCbQuery(texts.getBanAlreadyBanned(), { show_alert: true });

            await userRepo.banUser(targetId);
            const pendingBan = await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});

            notificationService.notifyMasterBan({
                userId: targetId, bannedBy: 'Master', banId: pendingBan.id,
                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            }).catch(() => {});

            ctx.answerCbQuery('🔨 User gebannt!').catch(() => {});
            await ctx.reply(`🔨 User ${targetId} wurde gebannt.`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Customer Ban Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^cust_delete_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = ctx.match[1];
            await userRepo.deleteUserCompletely(targetId);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.reply(`🗑 User ${targetId} und alle Daten gelöscht.`);
        } catch (error) {
            console.error('Customer Delete Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // MASTER: Ban-Aktionen
    // ════════════════════════════════════

    bot.action(/^master_revert_ban_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const banId = ctx.match[1];
            const ban = await userRepo.revertBan(banId);
            if (!ban) return ctx.answerCbQuery('Ban nicht gefunden.', { show_alert: true });
            ctx.answerCbQuery('✅ Ban rückgängig!').catch(() => {});
            await ctx.reply(texts.getBanReverted(ban.user_id), { parse_mode: 'Markdown' });
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
            ctx.answerCbQuery('✅ Bestätigt!').catch(() => {});
            await ctx.reply(texts.getBanConfirmed(ban.user_id), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Confirm Ban Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // TEXT HANDLER: TX-ID & Notizen
    // ════════════════════════════════════

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message || !ctx.message.text) return next();

        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            ctx.session.awaitingNote = null;
            return next();
        }

        // ── TX-ID vom Kunden ──
        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;

            try {
                const updated = await orderRepo.updateOrderTxId(orderId, input);
                if (!updated) {
                    return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                }

                // Bestätigung an Kunden (persistent)
                await ctx.reply(texts.getTxIdConfirmed(orderId), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]]
                    }
                });

                // Admin/Master benachrichtigen
                const order = await orderRepo.getOrderByOrderId(orderId);
                const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');

                notificationService.notifyAdminsTxId({
                    orderId, userId: ctx.from.id, username,
                    total: formatters.formatPrice(order?.total_amount || 0),
                    paymentName: order?.payment_method_name || 'N/A',
                    txId: input
                }).catch(() => {});

            } catch (error) {
                console.error('TX-ID Save Error:', error.message);
                ctx.reply(texts.getGeneralError());
            }
            return;
        }

        // ── Admin-Notiz ──
        if (ctx.session.awaitingNote) {
            const orderId = ctx.session.awaitingNote;
            ctx.session.awaitingNote = null;

            try {
                const authorName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const result = await orderRepo.addAdminNote(orderId, authorName, input);
                if (!result) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await ctx.reply(texts.getNoteAdded(orderId), { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Add Note Error:', error.message);
                ctx.reply(texts.getGeneralError());
            }
            return;
        }

        return next();
    });
};
