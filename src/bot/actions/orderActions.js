const orderRepo = require('../../database/repositories/orderRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo'); 
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const orderHelper = require('../../utils/orderHelper'); 
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const config = require('../../config');
const notificationService = require('../../services/notificationService');

const FINAL_STATUSES = ['abgeschlossen', 'abgebrochen', 'loeschung_angefragt'];

module.exports = (bot) => {

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
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            const backCb = isMaster ? 'master_orders_hub' : 'admin_panel';
            keyboard.push([{ text: '🔙 Zurück', callback_data: backCb, style: 'danger' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^oview_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.reply(`⚠️ Bestellung "${orderId}" nicht gefunden.`);

            await orderHelper.clearOldNotifications(ctx, order);
            const payload = await orderHelper.buildOrderViewPayload(order);

            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^admin_view_kyc_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order || !order.kyc_submission || !order.kyc_submission.fileId) {
                return ctx.reply('⚠️ Keine KYC-Einsendung für diese Bestellung vorhanden.');
            }

            const kyc = order.kyc_submission;
            const caption = `🆔 *KYC-Legitimierung für Bestellung #${order.order_id}*\n\n` +
                `👤 Kunde ID: \`${order.user_id}\`\n` +
                `📋 Modus: ${kyc.mode || 'verbindlich'}\n` +
                `📸 Nachweis: ${kyc.option || 'selfie'}\n` +
                `⏰ Eingereicht: ${kyc.submittedAt ? new Date(kyc.submittedAt).toLocaleString('de-DE') : 'Unbekannt'}`;

            const keyboard = {
                inline_keyboard: [[{ text: '🔙 Zurück zur Bestellung', callback_data: `oview_${order.order_id}`, style: 'danger' }]]
            };

            await uiHelper.showProductWithMedia(ctx, kyc.fileId, caption, keyboard);
        } catch (error) {
            console.error('admin_view_kyc error:', error.message);
            await ctx.reply(`⚠️ Fehler beim Laden der KYC-Einsendung: ${error.message}`);
        }
    });

    bot.action(/^ostatus_([a-zA-Z0-9]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            let newStatus = ctx.match[2];
            if (newStatus === 'processing') newStatus = 'in_bearbeitung';

            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            if (FINAL_STATUSES.includes(order.status)) {
                return uiHelper.updateOrSend(ctx, `⚠️ Status ist bereits final (${order.status}). Wirklich ändern?`, {
                    inline_keyboard: [
                        [{ text: '✅ Erzwingen', callback_data: `oforce_${orderId}_${newStatus}` }],
                        [{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]
                    ]
                });
            }

            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            
            const payload = await orderHelper.buildOrderViewPayload(updated);
            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            ctx.answerCbQuery(`✅ Status: ${texts.getStatusLabel(newStatus)}`).catch(() => {});
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^oforce_([a-zA-Z0-9]+)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const newStatus = ctx.match[2];
            const updated = await orderRepo.updateOrderStatus(orderId, newStatus);
            await notificationService.notifyCustomerStatusUpdate(updated.user_id, orderId, newStatus);
            const payload = await orderHelper.buildOrderViewPayload(updated);
            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            ctx.answerCbQuery(`✅ Status erzwungen: ${newStatus}`).catch(() => {});
        } catch (e) { console.error(e); }
    });

    // ─── AUTOMATISCHE TRESOR-AUSLIEFERUNG (AUS DEM VORRAT) ───────────────────
    bot.action(/^odeliv_vault_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            if (!order.details || order.details.length === 0) {
                return ctx.answerCbQuery('Keine Artikel in der Bestellung.', { show_alert: true });
            }

            // 1. Vorrats-Prüfung für alle enthaltenen Artikel
            for (const item of order.details) {
                const prodId = item.product_id || item.id;
                const count = await deliverableRepo.getAvailableCount(prodId);
                const needed = item.quantity || 1;

                if (count < needed) {
                    return ctx.answerCbQuery(`⚠️ Kein ausreichender Vorrat für "${item.name}" (${count}/${needed} verfügbar). Bitte Vorrat auffüllen oder manuell eingeben.`, { show_alert: true });
                }
            }

            // 2. Atomare Entnahme aus dem Tresor-Vorrat
            const allDeliveredLines = [];
            for (const item of order.details) {
                const prodId = item.product_id || item.id;
                const needed = item.quantity || 1;
                const result = await deliverableRepo.popAvailableDeliverables(prodId, needed, order.order_id, order.user_id);
                
                if (!result.success) {
                    return ctx.answerCbQuery(`❌ Fehler beim Entnehmen aus dem Vorrat.`, { show_alert: true });
                }
                allDeliveredLines.push(...result.items);
            }

            const formattedContent = allDeliveredLines.map(line => `▪️ ${line}`).join('\n');
            const customerMessage = texts.getDigitalDeliveryCustomerMessage(orderId, formattedContent);

            const tresorKeyboard = {
                inline_keyboard: [[
                    { text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${orderId}` }
                ]]
            };

            const sentMsg = await bot.telegram.sendMessage(order.user_id, customerMessage, { parse_mode: 'Markdown', reply_markup: tresorKeyboard }).catch(() => null);

            if (sentMsg) {
                await orderRepo.setDigitalDelivery(orderId, formattedContent);
                await orderRepo.updateOrderStatus(orderId, 'abgeschlossen');
                await orderRepo.addAdminNote(orderId, ctx.from.username || ctx.from.id, `Automatisch aus Tresor-Vorrat geliefert (${allDeliveredLines.length} Items).`);
                
                ctx.answerCbQuery('🟢 ✅ Aus dem Tresor geliefert!').catch(() => {});
                
                const payload = await orderHelper.buildOrderViewPayload(await orderRepo.getOrderByOrderId(orderId));
                await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            } else {
                ctx.answerCbQuery('❌ Kunde konnte nicht benachrichtigt werden.', { show_alert: true }).catch(() => {});
            }
        } catch (error) {
            console.error('odeliv_vault error:', error.message);
            ctx.answerCbQuery(`❌ Fehler: ${error.message}`, { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odeliv_(?:manual_)?([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingDigitalDelivery = orderId;
            await ctx.reply(texts.getDigitalDeliveryPrompt(orderId), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔴 ❌ Abbrechen', callback_data: 'cancel_delivery' }]] }
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action('cancel_delivery', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingDigitalDelivery = null;
        await ctx.reply('❌ Digitale Auslieferung abgebrochen.');
    });

    bot.action(/^odel_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        const orderId = ctx.match[1];
        if (ctx.from.id === Number(config.MASTER_ADMIN_ID)) {
            return uiHelper.updateOrSend(ctx, `⚠️ \`#${orderId}\` endgültig löschen?`, {
                inline_keyboard: [
                    [{ text: '🗑 Endgültig löschen', callback_data: `odel_confirm_${orderId}` }],
                    [{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]
                ]
            });
        }
        
        const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
        const approval = await approvalRepo.createApproval(orderId, 'ORDER_DELETE', null, adminName);
        
        ctx.reply('📨 Löschanfrage an Master gesendet.');
        notificationService.sendTo(config.MASTER_ADMIN_ID, `🗑 *Löschanfrage*\nBestellung: \`#${orderId}\``, {
            reply_markup: { inline_keyboard: [[{ text: '✅ OK', callback_data: `odel_approve_${approval.id}` }, { text: '❌ NO', callback_data: `odel_reject_${approval.id}` }]] }
        });
    });

    bot.action(/^odel_confirm_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) return;
        try {
            const orderId = ctx.match[1];
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Bestellung gelöscht.').catch(() => {});
            
            await uiHelper.updateOrSend(ctx, `🗑 Bestellung \`#${orderId}\` wurde endgültig gelöscht.`, {
                inline_keyboard: [[{ text: '🔙 Zurück zum Panel', callback_data: 'admin_open_orders' }]]
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_del_approve_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('✅ Löschung bestätigt.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Gelöscht ✅*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Approve Customer Delete Error:', error.message); }
    });

    bot.action(/^cust_del_reject_(.+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.updateOrderStatus(orderId, 'abgeschlossen');
            ctx.answerCbQuery('❌ Löschung abgelehnt.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Abgelehnt ❌ (Wieder beim Kunden sichtbar)*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Reject Customer Delete Error:', error.message); }
    });

    bot.action(/^allow_fb_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });
            if (order.feedback_invited) return ctx.answerCbQuery('Bereits für Feedback qualifiziert.', { show_alert: true });

            await orderRepo.setFeedbackInvited(orderId, true);

            if (notificationService.notifyCustomerFeedbackInvite) {
                await notificationService.notifyCustomerFeedbackInvite(order.user_id, orderId);
            }

            order.feedback_invited = true;
            const payload = await orderHelper.buildOrderViewPayload(order);
            await uiHelper.updateOrSend(ctx, payload.text, payload.reply_markup);
            
            ctx.answerCbQuery('✅ Kunde wurde zum Feedback eingeladen!').catch(() => {});
        } catch (error) {
            console.error('Allow Feedback Error:', error.message);
            ctx.answerCbQuery('❌ Fehler beim Qualifizieren.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^fb_approve_(.+)$/, isAdmin, async (ctx) => {
        try {
            const feedbackId = ctx.match[1];
            await feedbackRepo.updateFeedbackStatus(feedbackId, 'approved');
            ctx.answerCbQuery('✅ Feedback freigegeben.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Freigegeben ✅*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Approve FB Error:', error.message); }
    });

    bot.action(/^fb_reject_(.+)$/, isAdmin, async (ctx) => {
        try {
            const feedbackId = ctx.match[1];
            await feedbackRepo.updateFeedbackStatus(feedbackId, 'rejected');
            ctx.answerCbQuery('❌ Feedback abgelehnt.').catch(() => {});
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n*STATUS: Abgelehnt ❌*', { parse_mode: 'Markdown' });
            }
        } catch (error) { console.error('Reject FB Error:', error.message); }
    });

    // ─── NOTIZ BUTTON (fehlte bisher!) ──────────────────────────────────────
    bot.action(/^onote_([a-zA-Z0-9]+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingNote = orderId;
            await ctx.reply(`📝 *Notiz für #${orderId}*\n\nBitte sende jetzt den Notiztext:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `oview_${orderId}` }]] }
            });
        } catch (error) { console.error('onote_ error:', error.message); }
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            ctx.session.awaitingNote = null;
            ctx.session.awaitingDigitalDelivery = null;
            return next();
        }

        if (ctx.session.awaitingDigitalDelivery) {
            const orderId = ctx.session.awaitingDigitalDelivery;
            ctx.session.awaitingDigitalDelivery = null;
            try {
                const order = await orderRepo.getOrderByOrderId(orderId);
                if (!order) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await orderHelper.clearOldNotifications(ctx, order);
                const formattedContent = input.split(',').map(item => `▪️ ${item.trim()}`).join('\n');
                const customerMessage = texts.getDigitalDeliveryCustomerMessage(orderId, formattedContent);
                // Permanente Liefernachricht mit Tresor-Zugang (kein Lösch-Button)
                const tresorKeyboard = {
                    inline_keyboard: [[
                        { text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${orderId}` }
                    ]]
                };
                const sentMsg = await bot.telegram.sendMessage(order.user_id, customerMessage, { parse_mode: 'Markdown', reply_markup: tresorKeyboard }).catch(() => null);
                
                if (sentMsg) {
                    await orderRepo.setDigitalDelivery(orderId, formattedContent);
                    await orderRepo.updateOrderStatus(orderId, 'abgeschlossen');
                    await orderRepo.addNotificationMsgId(orderId, sentMsg.chat.id, sentMsg.message_id);
                    await orderRepo.addAdminNote(orderId, ctx.from.username || ctx.from.id, `Digitale Lieferung gesendet.`);
                    await ctx.reply(texts.getDigitalDeliverySuccess(orderId), { 
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${orderId}` }]] }
                    });
                } else {
                    await ctx.reply(`❌ Fehler: Nachricht konnte nicht gesendet werden.`);
                }
            } catch (error) { console.error(error.message); }
            return;
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            const updated = await orderRepo.updateOrderTxId(orderId, input);
            ctx.reply(texts.getTxIdConfirmed(orderId), { parse_mode: 'Markdown' });
            
            const username = ctx.from.username ? `@${ctx.from.username}` : 'Kunde';
            notificationService.notifyAdminsTxId({ 
                orderId, userId: ctx.from.id, txId: input, 
                username, total: formatters.formatPrice(updated.total_amount) 
            }).catch(() => {});
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
