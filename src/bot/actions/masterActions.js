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
        try {
            const role = await userRepo.getUserRole(ctx.from.id);
            const text = texts.getWelcomeText(true, role);
            await uiHelper.updateOrSend(ctx, text, masterMenu());
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_manage_payments', isMasterAdmin, async (ctx) => {
        try {
            const methods = await paymentRepo.getActivePaymentMethods();
            const keyboard = methods.map(m => ([{ 
                text: `🗑 ${m.name}`, 
                callback_data: `master_del_pay_${m.id}` 
            }]));

            keyboard.push([{ text: '➕ Zahlungsart hinzufügen', callback_data: 'master_add_payment' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);

            const text = '💳 *Zahlungsarten verwalten*\n\nHier kannst du neue Methoden anlegen oder bestehende durch Anklicken löschen:';
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_add_payment', isMasterAdmin, async (ctx) => {
        try {
            await ctx.scene.enter('addPaymentMethodScene');
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_del_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const payId = ctx.match[1];
            await paymentRepo.deletePaymentMethod(payId);
            await ctx.answerCbQuery('✅ Zahlungsart gelöscht');
            
            const methods = await paymentRepo.getActivePaymentMethods();
            const keyboard = methods.map(m => ([{ text: `🗑 ${m.name}`, callback_data: `master_del_pay_${m.id}` }]));
            keyboard.push([{ text: '➕ Zahlungsart hinzufügen', callback_data: 'master_add_payment' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            
            await uiHelper.updateOrSend(ctx, 'Zahlungsart wurde erfolgreich entfernt.', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_start_broadcast', isMasterAdmin, async (ctx) => {
        try {
            await ctx.scene.enter('broadcastScene');
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_cleanup_blocked', isMasterAdmin, async (ctx) => {
        try {
            const customers = await userRepo.getAllCustomers();
            const keyboard = customers.slice(0, 15).map(c => ([{ 
                text: `🗑 ${c.username || c.telegram_id} löschen`, 
                callback_data: `master_del_user_${c.telegram_id}` 
            }]));

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, '⚠️ *Datenpflege*\nKlicke auf einen User, um dessen Datensatz (z.B. nach Blockierung) endgültig zu löschen:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_del_user_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = ctx.match[1];
            await userRepo.deleteUser(targetId);
            await ctx.answerCbQuery('✅ User-Daten gelöscht.');
            const customers = await userRepo.getAllCustomers();
            const keyboard = customers.slice(0, 15).map(c => ([{ text: `🗑 ${c.username || c.telegram_id} löschen`, callback_data: `master_del_user_${c.telegram_id}` }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, 'User gelöscht. Weitere Datensätze verwalten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        try {
            const recentOrders = await orderRepo.getLatestOrders(10);

            if (!recentOrders || recentOrders.length === 0) {
                return uiHelper.updateOrSend(ctx, '📊 *Kundenübersicht*\n\nBisher wurden noch keine Bestellungen aufgegeben.', {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]]
                });
            }

            let text = '📊 *Die letzten 10 Bestellungen:*\n\n';
            
            recentOrders.forEach((order, index) => {
                const date = new Date(order.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
                const username = order.users?.username ? `@${order.users.username}` : `ID: ${order.user_id}`;
                
                text += `${index + 1}. *${username}*\n`;
                text += `🗓 ${date} | 💰 ${parseFloat(order.total_amount).toFixed(2)}€\n\n`;
            });

            await uiHelper.updateOrSend(ctx, text, {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]]
            });
        } catch (error) {
            console.error('Customer Overview Error:', error.message);
            await ctx.answerCbQuery(texts.getGeneralError().replace('❌ ', ''), { show_alert: true });
        }
    });

    bot.action('master_pending_approvals', isMasterAdmin, async (ctx) => {
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
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_view_appr_(.+)$/, isMasterAdmin, async (ctx) => {
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
                    [
                        { text: '✅ Annehmen', callback_data: `master_approve_${approvalId}` },
                        { text: '❌ Ablehnen', callback_data: `master_reject_${approvalId}` }
                    ],
                    [{ text: '🔙 Zurück zur Queue', callback_data: 'master_pending_approvals' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_approve_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const approvalId = ctx.match[1];
            const request = await approvalRepo.getApprovalById(approvalId);

            if (request.action_type === 'PRICE_CHANGE') {
                await productRepo.toggleProductStatus(request.target_id, 'price', parseFloat(request.new_value));
            } else if (request.action_type === 'DELETE') {
                await productRepo.deleteProduct(request.target_id);
            }

            await approvalRepo.updateApprovalStatus(approvalId, 'approved');
            await ctx.answerCbQuery('✅ Anfrage genehmigt!');
            
            await uiHelper.updateOrSend(ctx, '✅ Die Änderung wurde erfolgreich im System übernommen.', {
                inline_keyboard: [[{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_reject_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await approvalRepo.updateApprovalStatus(ctx.match[1], 'rejected');
            await ctx.answerCbQuery('❌ Abgelehnt.');
            
            await uiHelper.updateOrSend(ctx, '❌ Die Anfrage wurde abgelehnt und aus dem System entfernt.', { 
                inline_keyboard: [[{ text: '🛡 Zum Master-Panel', callback_data: 'master_panel' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_manage_admins', isMasterAdmin, async (ctx) => {
        try {
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => Number(a.telegram_id) !== Number(config.MASTER_ADMIN_ID))
                .map(a => ([{ 
                    text: `❌ ${a.username || a.telegram_id} entlassen`, 
                    callback_data: `master_fire_${a.telegram_id}` 
                }]));

            keyboard.push([{ text: '➕ Admin ernennen (ID)', callback_data: 'master_prompt_add_admin' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            
            await uiHelper.updateOrSend(ctx, '👥 *Personalverwaltung*\nHier kannst du Admins verwalten oder neue hinzufügen:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_prompt_add_admin', isMasterAdmin, async (ctx) => {
        ctx.session.awaitingAdminId = true;
        await uiHelper.updateOrSend(ctx, '🆔 *Admin ernennen*\n\nBitte sende mir jetzt die **Telegram ID** des Nutzers, den du zum Admin machen möchtest.\n(Oder tippe /cancel)', {
            inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'master_manage_admins' }]]
        });
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.session.awaitingAdminId || !ctx.message.text) return next();
        if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) return next();
        
        const targetId = ctx.message.text.trim();
        if (!/^\d+$/.test(targetId)) {
            return ctx.reply('⚠️ Das ist keine gültige ID. Bitte sende nur Zahlen.');
        }

        try {
            await userRepo.updateUserRole(targetId, 'admin');
            ctx.session.awaitingAdminId = false;
            await ctx.reply(`✅ Nutzer ${targetId} wurde zum Admin ernannt!`);
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => Number(a.telegram_id) !== Number(config.MASTER_ADMIN_ID))
                .map(a => ([{ text: `❌ ${a.username || a.telegram_id} entlassen`, callback_data: `master_fire_${a.telegram_id}` }]));
            keyboard.push([{ text: '➕ Admin ernennen', callback_data: 'master_prompt_add_admin' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            await ctx.reply('Aktualisierte Admin-Liste:', { reply_markup: { inline_keyboard: keyboard } });
        } catch (error) {
            ctx.reply(texts.getGeneralError());
        }
    });

    bot.action(/^master_fire_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.removeAdmin(ctx.match[1]);
            await ctx.answerCbQuery('Admin entlassen.');
            
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => Number(a.telegram_id) !== Number(config.MASTER_ADMIN_ID))
                .map(a => ([{ text: `❌ ${a.username || a.telegram_id} entlassen`, callback_data: `master_fire_${a.telegram_id}` }]));
            keyboard.push([{ text: '➕ Admin ernennen', callback_data: 'master_prompt_add_admin' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_panel' }]);
            
            await uiHelper.updateOrSend(ctx, 'Admin erfolgreich entfernt.', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_ack_msg', isMasterAdmin, async (ctx) => {
        try {
            const msgText = ctx.callbackQuery.message.text || 'Information zur Kenntnis genommen.';
            await ctx.editMessageText(`✅ *Gelesen*\n~${msgText}~`, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery('Bestätigt.');
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_undo_prod_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const prodId = ctx.match[1];
            await productRepo.deleteProduct(prodId);
            await ctx.answerCbQuery('Rückgängig gemacht!');
            
            const msgText = ctx.callbackQuery.message.text || 'Produkterstellung';
            await ctx.editMessageText(`↩️ *Rückgängig gemacht*\n~${msgText}~`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(error.message);
            await ctx.answerCbQuery('Fehler beim Löschen.', { show_alert: true });
        }
    });
};
