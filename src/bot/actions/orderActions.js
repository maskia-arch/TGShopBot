const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const { isAdmin, isMasterAdmin } = require('../middlewares/auth');
const config = require('../../config');
const notificationService = require('../../services/notificationService');

const FINAL_STATUSES = ['abgeschlossen', 'abgebrochen'];

async function clearOldNotifications(ctx, order) {
    if (!order || !order.notification_msg_ids || order.notification_msg_ids.length === 0) return;
    const currentMsgId = ctx.callbackQuery?.message?.message_id; // Verhindert das Löschen der aktuellen Admin-Nachricht
    
    for (const msg of order.notification_msg_ids) {
        try {
            if (currentMsgId && msg.message_id === currentMsgId) continue;
            await ctx.telegram.deleteMessage(msg.chat_id, msg.message_id);
        } catch (e) {}
    }
    await orderRepo.clearNotificationMsgIds(order.order_id);
}

// Zentraler Helfer für das Order-View-Layout (inkl. Zurück-Button)
async function buildOrderViewPayload(order) {
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
        [{ text: '🔙 Zurück zum Panel', callback_data: 'admin_panel' }]
    );

    return { text, reply_markup: keyboard };
}

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

    bot.action('cancel_txid', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingTxId = null;
        await ctx.reply('❌ TX-ID Eingabe abgebrochen.', {
            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
        });
    });

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

            // EditMessage statt Reply für saubere Navigation
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('Open Orders Error:', error.message);
            await ctx.reply('❌ Fehler beim Laden.');
        }
    });

    bot.action(/^oview_([\w-]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.reply(`⚠️ Bestellung "${orderId}" nicht gefunden.`);

            await clearOldNotifications(ctx, order);
            const payload = await buildOrderViewPayload(order);

            await ctx.editMessageText(payload.text, { 
                parse_mode: 'Markdown', 
                reply_markup: payload.reply_markup, 
                disable_web_page_preview: true 
            }).catch(async () => {
                await ctx.reply(payload.text, { 
                    parse_mode: 'Markdown', 
                    reply_markup: payload.reply_markup, 
                    disable_web_page_preview: true 
                });
            });
        } catch (error) {
            console.error('Order View Error:', error.message);
        }
    });

    bot.action(/^ostatus_([\w-]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];

            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            if (FINAL_STATUSES.includes(order.status)) {
                ctx.answerCbQuery().catch(() => {});
                await ctx.reply(
                    `⚠️ *Sicherheitsabfrage*\n\n` +
                    `Bestellung \`#${orderId}\` hat den finalen Status: ${texts.getStatusLabel(order.status)}\n\n` +
                    `Wirklich auf *${texts.getStatusLabel(newStatus)}* ändern?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Ja, Status ändern', callback_data: `ostatus_force_${orderId}_${newStatus}` }],
                                [{ text: '❌ Nein, abbrechen', callback_data: `oview_${orderId}` }]
                            ]
                        }
                    }
                );
                return;
            }

            await clearOldNotifications(ctx, order);

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            if (!updated) return ctx.answerCbQuery('Fehler.', { show_alert: true });

            const sentMsg = await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            if (sentMsg) {
                await orderRepo.addNotificationMsgId(orderId, sentMsg.chat.id, sentMsg.message_id);
            }

            ctx.answerCbQuery(`✅ Status aktualisiert auf: ${texts.getStatusLabel(newStatus)}`).catch(() => {});
            
            const payload = await buildOrderViewPayload(updated);
            await ctx.editMessageText(payload.text, { 
                parse_mode: 'Markdown', 
                reply_markup: payload.reply_markup, 
                disable_web_page_preview: true 
            }).catch(() => {});
        } catch (error) {
            console.error('Status Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^ostatus_force_([\w-]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];

            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            await clearOldNotifications(ctx, order);

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            if (!updated) return ctx.answerCbQuery('Fehler.', { show_alert: true });

            const authorName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
            await orderRepo.addAdminNote(orderId, authorName, `Status von finalem Status geändert → ${newStatus}`);

            const sentMsg = await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            if (sentMsg) {
                await orderRepo.addNotificationMsgId(orderId, sentMsg.chat.id, sentMsg.message_id);
            }

            ctx.answerCbQuery(`✅ Status aktualisiert auf: ${texts.getStatusLabel(newStatus)}`).catch(() => {});
            
            const payload = await buildOrderViewPayload(updated);
            await ctx.editMessageText(payload.text, { 
                parse_mode: 'Markdown', 
                reply_markup: payload.reply_markup, 
                disable_web_page_preview: true 
            }).catch(() => {});
        } catch (error) {
            console.error('Force Status Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odelivery_([\w-]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingDigitalDelivery = orderId;
            await ctx.reply(texts.getDigitalDeliveryPrompt(orderId), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_delivery' }]] }
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action('cancel_delivery', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingDigitalDelivery = null;
        await ctx.reply('❌ Digitale Auslieferung abgebrochen.');
    });

    bot.action(/^onote_([\w-]+)$/, isAdmin, async (ctx) => {
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
    bot.action(/^odel_confirm_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        const orderId = ctx.match[1];
        try {
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) {
                ctx.answerCbQuery('Bereits gelöscht.').catch(() => {});
                await ctx.editMessageText(`🗑 \`#${orderId}\` wurde bereits gelöscht.`, { parse_mode: 'Markdown' });
                return;
            }

            await clearOldNotifications(ctx, order);
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});

            await ctx.editMessageText(`🗑 Bestellung \`#${orderId}\` wurde endgültig gelöscht.`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Order Delete Confirm Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odel_approve_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        const approvalId = ctx.match[1];
        try {
            const approval = await approvalRepo.getApprovalById(approvalId);
            if (!approval) return ctx.answerCbQuery('Anfrage nicht gefunden.', { show_alert: true });
            if (approval.status !== 'pending') return ctx.answerCbQuery('Bereits bearbeitet.', { show_alert: true });

            const orderId = approval.new_value; 
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (order) {
                await clearOldNotifications(ctx, order);
                await orderRepo.deleteOrder(orderId);
            }

            await approvalRepo.updateApprovalStatus(approvalId, 'approved');
            ctx.answerCbQuery('✅ Genehmigt & gelöscht!').catch(() => {});
            await ctx.editMessageText(`✅ Löschanfrage genehmigt.\n🗑 \`#${orderId}\` wurde gelöscht.`, { parse_mode: 'Markdown' });

            const adminId = approval.requested_by;
            notificationService.sendTo(adminId,
                `✅ Deine Löschanfrage für \`#${orderId}\` wurde vom Master *genehmigt*.\n🗑 Bestellung wurde gelöscht.`,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
        } catch (error) {
            console.error('Approve Delete Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odel_reject_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        const approvalId = ctx.match[1];
        try {
            const approval = await approvalRepo.getApprovalById(approvalId);
            if (!approval) return ctx.answerCbQuery('Anfrage nicht gefunden.', { show_alert: true });
            if (approval.status !== 'pending') return ctx.answerCbQuery('Bereits bearbeitet.', { show_alert: true });

            await approvalRepo.updateApprovalStatus(approvalId, 'rejected');
            ctx.answerCbQuery('❌ Abgelehnt.').catch(() => {});
            await ctx.editMessageText(`❌ Löschanfrage für \`#${approval.new_value}\` wurde abgelehnt.`, { parse_mode: 'Markdown' });

            const adminId = approval.requested_by;
            notificationService.sendTo(adminId,
                `❌ Deine Löschanfrage für \`#${approval.new_value}\` wurde vom Master *abgelehnt*.\nDie Bestellung bleibt bestehen.`,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
        } catch (error) {
            console.error('Reject Delete Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odel_([\w-]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        const orderId = ctx.match[1];
        const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);

        if (isMaster) {
            await ctx.reply(`⚠️ \`#${orderId}\` endgültig löschen?`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🗑 Ja, endgültig löschen', callback_data: `odel_confirm_${orderId}` }],
                        [{ text: '❌ Nein', callback_data: `oview_${orderId}` }]
                    ]
                }
            });
        } else {
            try {
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApprovalRequest(
                    'ORDER_DELETE', ctx.from.id, orderId, orderId              
                );

                await ctx.reply(
                    `📨 *Löschanfrage gesendet*\n\n` +
                    `Bestellung \`#${orderId}\` kann nur vom Master gelöscht werden.\n` +
                    `Der Master wurde benachrichtigt.`,
                    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: `oview_${orderId}` }]] } }
                );

                notificationService.sendTo(config.MASTER_ADMIN_ID,
                    `🗑 *Löschanfrage*\n\n` +
                    `Admin: ${adminName}\nBestellung: \`#${orderId}\`\n\nSoll die Bestellung gelöscht werden?`,
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
            } catch (error) {
                console.error('Order Delete Approval Error:', error.message);
                await ctx.reply('❌ Fehler beim Senden der Löschanfrage.');
            }
        }
    });

    bot.action('orders_delete_all_confirm', isMasterAdmin, async (ctx) => {
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

    bot.action('orders_delete_all_execute', isMasterAdmin, async (ctx) => {
        try {
            await orderRepo.deleteAllOrders();
            ctx.answerCbQuery('✅').catch(() => {});
            await ctx.editMessageText('🗑 Alle Bestellungen gelöscht.', { parse_mode: 'Markdown' });
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();
            let text = '';
            const keyboard = [];

            if (!customers || customers.length === 0) {
                text = '📊 Keine Kunden registriert.';
            } else {
                text = `📊 *Kundenübersicht* (${customers.length})\n\n`;
                customers.slice(0, 20).forEach((c, i) => {
                    const name = c.username ? `@${c.username}` : `ID: ${c.telegram_id}`;
                    text += `${i + 1}. ${name}${c.is_banned ? ' 🚫' : ''}\n`;
                    keyboard.push([{ text: `👤 ${c.username || c.telegram_id}`, callback_data: `cust_detail_${c.telegram_id}` }]);
                });
            }
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);

            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
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
                    text += `${i + 1}. /${o.order_id} | ${formatters.formatPrice(o.total_amount)} | ${texts.getStatusLabel(o.status)}\n`;
                });
            }

            const kb = {
                inline_keyboard: [
                    [{ text: '👤 Kontaktieren', url: `tg://user?id=${targetId}` }],
                    [{ text: '🔨 Bannen', callback_data: `cust_ban_${targetId}` }],
                    [{ text: '🗑 Löschen', callback_data: `cust_delete_${targetId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_customer_overview' }]
                ]
            };

            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
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

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            if (ctx.session) { 
                ctx.session.awaitingTxId = null; 
                ctx.session.awaitingNote = null; 
                ctx.session.awaitingDigitalDelivery = null;
            }
            return next();
        }

        if (ctx.session.awaitingDigitalDelivery) {
            const orderId = ctx.session.awaitingDigitalDelivery;
            ctx.session.awaitingDigitalDelivery = null;
            try {
                const order = await orderRepo.getOrderByOrderId(orderId);
                if (!order) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);

                await clearOldNotifications(ctx, order);

                const formattedContent = input.split(',').map(item => `▪️ ${item.trim()}`).join('\n');
                const customerMessage = texts.getDigitalDeliveryCustomerMessage(orderId, formattedContent);
                const sentMsg = await bot.telegram.sendMessage(order.user_id, customerMessage, { parse_mode: 'Markdown' }).catch(() => null);

                if (sentMsg) {
                    await orderRepo.updateOrderStatus(orderId, 'abgeschlossen');
                    await orderRepo.addNotificationMsgId(orderId, sentMsg.chat.id, sentMsg.message_id);
                    
                    const author = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                    await orderRepo.addAdminNote(orderId, author, `Digitale Lieferung erfolgreich an Kunde gesendet.`);
                    
                    await ctx.reply(texts.getDigitalDeliverySuccess(orderId), { 
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${orderId}` }]] }
                    });
                } else {
                    await ctx.reply(`❌ Fehler: Die Nachricht konnte nicht an den Kunden (ID: ${order.user_id}) gesendet werden. Evtl. hat er den Bot blockiert.`);
                }
            } catch (error) {
                console.error('Digital Delivery Error:', error.message);
                ctx.reply('❌ Fehler bei der Auslieferung.');
            }
            return;
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            try {
                const updated = await orderRepo.updateOrderTxId(orderId, input);
                if (!updated) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await ctx.reply(texts.getTxIdConfirmed(orderId), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                });
                const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
                notificationService.notifyAdminsTxId({
                    orderId, userId: ctx.from.id, username,
                    total: formatters.formatPrice(updated.total_amount || 0),
                    paymentName: updated.payment_method_name || 'N/A',
                    txId: input
                }).catch(() => {});
            } catch (error) {
                console.error('TX-ID Save Error:', error.message);
                ctx.reply('❌ Fehler beim Speichern.');
            }
            return;
        }

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
                ctx.reply('❌ Fehler.');
            }
            return;
        }

        return next();
    });
};
