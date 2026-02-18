const userRepo = require('../../database/repositories/userRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const uiHelper = require('../../utils/uiHelper');
const { isMasterAdmin } = require('../middlewares/auth');

module.exports = (bot) => {
    bot.action('master_manage_admins', isMasterAdmin, async (ctx) => {
        try {
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => a.role !== 'master')
                .map(a => ([{ 
                    text: `❌ ${a.username || a.telegram_id} entlassen`, 
                    callback_data: `master_fire_${a.telegram_id}` 
                }]));

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Admin-Verwaltung (Temporäre Admins):', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^master_fire_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = ctx.match[1];
            await userRepo.removeAdmin(targetId);
            await ctx.answerCbQuery('Admin wurde entlassen.');
            
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => a.role !== 'master')
                .map(a => ([{ text: `❌ ${a.username || a.telegram_id} entlassen`, callback_data: `master_fire_${a.telegram_id}` }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Admin wurde erfolgreich entfernt. Weitere Admins verwalten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_manage_payments', isMasterAdmin, async (ctx) => {
        try {
            const methods = await paymentRepo.getActivePaymentMethods();
            const keyboard = methods.map(m => ([{ text: `✏️ ${m.name}`, callback_data: `master_edit_pay_${m.id}` }]));
            
            keyboard.push([{ text: '➕ Neue Zahlungsart', callback_data: 'master_add_payment' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Zahlungsoptionen verwalten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_pending_approvals', isMasterAdmin, async (ctx) => {
        try {
            const pending = await approvalRepo.getPendingApprovals();
            if (pending.length === 0) {
                return uiHelper.updateOrSend(ctx, 'Keine ausstehenden Freigaben vorhanden.', {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
                });
            }

            const keyboard = pending.map(p => ([{ 
                text: `${p.action_type}: ID ${p.target_id}`, 
                callback_data: `master_view_appr_${p.id}` 
            }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Ausstehende sensible Änderungen:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        try {
            const customers = await userRepo.getAllCustomers ? await userRepo.getAllCustomers() : [];
            let text = `📊 Kundenübersicht:\nAnzahl: ${customers.length}\n\n`;
            
            customers.slice(0, 10).forEach(c => {
                text += `• ${c.username || 'Unbekannt'} (ID: ${c.telegram_id})\n`;
            });

            await uiHelper.updateOrSend(ctx, text, {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });
};
