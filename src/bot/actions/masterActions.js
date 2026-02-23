const userRepo = require('../../database/repositories/userRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const uiHelper = require('../../utils/uiHelper');
const { isMasterAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const masterMenu = require('../keyboards/masterMenu');

module.exports = (bot) => {
    bot.action('master_panel', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const role = await userRepo.getUserRole(ctx.from.id);
            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(true, role), masterMenu());
        } catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // ZAHLUNGSARTEN (FIXED: nicht sofort löschen)
    // ════════════════════════════════════

    bot.action('master_manage_payments', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const methods = await paymentRepo.getActivePaymentMethods();
            const keyboard = methods.map(m => ([{
                text: `💳 ${m.name}`,
                callback_data: `master_view_pay_${m.id}`
            }]));

            keyboard.push([{ text: '➕ Zahlungsart hinzufügen', callback_data: 'master_add_payment' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);

            const text = '💳 *Zahlungsarten verwalten*\n\nWähle eine Zahlungsart zum Ansehen/Löschen oder füge eine neue hinzu:';
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    // ── Zahlungsart anzeigen (Details + Lösch-Option) ──
    bot.action(/^master_view_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const payId = ctx.match[1];
            const method = await paymentRepo.getPaymentMethod(payId);

            if (!method) {
                return ctx.answerCbQuery('Zahlungsart nicht gefunden.', { show_alert: true });
            }

            let text = `💳 *${method.name}*\n\n`;
            if (method.wallet_address) text += `*Adresse:* \`${method.wallet_address}\`\n`;
            if (method.description) text += `*Beschreibung:* ${method.description}\n`;

            const keyboard = {
                inline_keyboard: [
                    [{ text: '🗑 Zahlungsart löschen', callback_data: `master_del_pay_${payId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_manage_payments' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_add_payment', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { await ctx.scene.enter('addPaymentMethodScene'); }
        catch (error) { console.error(error.message); }
    });

    bot.action(/^master_del_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const payId = ctx.match[1];
            await paymentRepo.deletePaymentMethod(payId);
            ctx.answerCbQuery('✅ Zahlungsart gelöscht').catch(() => {});

            // Zurück zur Liste
            ctx.update.callback_query.data = 'master_manage_payments';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // BROADCAST
    // ════════════════════════════════════

    bot.action('master_start_broadcast', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { await ctx.scene.enter('broadcastScene'); }
        catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // DATENPFLEGE
    // ════════════════════════════════════

    bot.action('master_cleanup_blocked', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();
            const keyboard = customers.slice(0, 15).map(c => ([{
                text: `🗑 ${c.username || c.telegram_id} löschen`,
                callback_data: `master_del_user_${c.telegram_id}`
            }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, '⚠️ *Datenpflege*\nKlicke auf einen User, um dessen Datensatz zu löschen:', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_del_user_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = ctx.match[1];
            await userRepo.deleteUser(targetId);
            ctx.answerCbQuery('✅ User-Daten gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'master_cleanup_blocked';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // FREIGABEN
    // ════════════════════════════════════

    bot.action('master_pending_approvals', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const pending = await approvalRepo.getPendingApprovals();
            if (pending.length === 0) {
                return uiHelper.updateOrSend(ctx, '✅ Keine ausstehenden Freigaben.', {
                    inline_keyboard: [[{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]]
                });
            }
            const keyboard = pending.map(p => ([{
                text: `${p.action_type === 'DELETE' ? '🗑' : '💰'} ID:${p.target_id} von ${p.requested_by}`,
                callback_data: `master_view_appr_${p.id}`
            }]));
            keyboard.push([{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, '📋 *Ausstehende Anfragen:*', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_view_appr_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const approvalId = ctx.match[1];
            const request = await approvalRepo.getApprovalById(approvalId);
            const product = await productRepo.getProductById(request.target_id);
            const text = texts.getApprovalRequestText({
                type: request.action_type === 'DELETE' ? '🗑 LÖSCHUNG' : '💰 PREISÄNDERUNG',
                requestedBy: request.requested_by,
                productName: product ? product.name : 'Unbekannt',
                newValue: request.new_value ? `${request.new_value}€` : null
            });
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ Annehmen', callback_data: `master_approve_${approvalId}` }, { text: '❌ Ablehnen', callback_data: `master_reject_${approvalId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'master_pending_approvals' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_approve_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const approvalId = ctx.match[1];
            const request = await approvalRepo.getApprovalById(approvalId);
            const tasks = [approvalRepo.updateApprovalStatus(approvalId, 'approved')];
            if (request.action_type === 'PRICE_CHANGE') tasks.push(productRepo.toggleProductStatus(request.target_id, 'price', parseFloat(request.new_value)));
            else if (request.action_type === 'DELETE') tasks.push(productRepo.deleteProduct(request.target_id));
            await Promise.all(tasks);
            ctx.answerCbQuery('✅ Genehmigt!').catch(() => {});
            await uiHelper.updateOrSend(ctx, '✅ Änderung übernommen.', { inline_keyboard: [[{ text: '🛡 Master-Panel', callback_data: 'master_panel' }]] });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_reject_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await approvalRepo.updateApprovalStatus(ctx.match[1], 'rejected');
            ctx.answerCbQuery('❌ Abgelehnt.').catch(() => {});
            await uiHelper.updateOrSend(ctx, '❌ Anfrage abgelehnt.', { inline_keyboard: [[{ text: '🛡 Master-Panel', callback_data: 'master_panel' }]] });
        } catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // ADMIN VERWALTUNG
    // ════════════════════════════════════

    bot.action('master_manage_admins', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        if (ctx.session) ctx.session.awaitingAdminId = false;
        try {
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => Number(a.telegram_id) !== Number(config.MASTER_ADMIN_ID))
                .map(a => ([{ text: `❌ ${a.username || a.telegram_id} entlassen`, callback_data: `master_fire_${a.telegram_id}` }]));
            keyboard.push([{ text: '➕ Admin ernennen (ID)', callback_data: 'master_prompt_add_admin' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, '👥 *Personalverwaltung*\nAdmins verwalten oder neue hinzufügen:', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_prompt_add_admin', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        ctx.session.awaitingAdminId = true;
        await uiHelper.updateOrSend(ctx, '🆔 *Admin ernennen*\n\nBitte sende die Telegram-ID:', {
            inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'master_manage_admins' }]]
        });
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.session.awaitingAdminId || !ctx.message.text) return next();
        if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) return next();

        const targetId = ctx.message.text.trim();
        if (targetId.toLowerCase() === '/cancel') {
            ctx.session.awaitingAdminId = false;
            return ctx.reply('Abgebrochen.');
        }
        if (!/^\d+$/.test(targetId)) return ctx.reply('⚠️ Bitte nur Zahlen senden.');

        try {
            await userRepo.updateUserRole(targetId, 'admin');
            ctx.session.awaitingAdminId = false;
            await ctx.reply(`✅ Nutzer ${targetId} wurde zum Admin ernannt!`);
        } catch (error) {
            console.error(error.message);
            ctx.reply(texts.getGeneralError());
        }
    });

    bot.action(/^master_fire_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.removeAdmin(ctx.match[1]);
            ctx.answerCbQuery('Admin entlassen.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_admins';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    // ════════════════════════════════════
    // SONSTIGE
    // ════════════════════════════════════

    bot.action('master_ack_msg', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery('Bestätigt.').catch(() => {});
        try {
            const msgText = ctx.callbackQuery.message.text || 'Gelesen.';
            await ctx.editMessageText(`✅ *Gelesen*\n~${msgText}~`, { parse_mode: 'Markdown' });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_undo_prod_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await productRepo.deleteProduct(ctx.match[1]);
            ctx.answerCbQuery('Rückgängig!').catch(() => {});
            const msgText = ctx.callbackQuery.message.text || 'Produkt';
            await ctx.editMessageText(`↩️ *Rückgängig*\n~${msgText}~`, { parse_mode: 'Markdown' });
        } catch (error) { console.error(error.message); ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {}); }
    });
};
