const userRepo = require('../../database/repositories/userRepo');
const paymentRepo = require('../../database/repositories/paymentRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo');
const uiHelper = require('../../utils/uiHelper');
const orderHelper = require('../../utils/orderHelper');
const formatters = require('../../utils/formatters');
const { isMasterAdmin } = require('../middlewares/auth');
const config = require('../../config');
const texts = require('../../utils/texts');
const masterMenu = require('../keyboards/masterMenu');
const notificationService = require('../../services/notificationService');

const CRYPTO_ICONS = { BTC: '₿', LTC: 'Ł', ETH: 'Ξ', SOL: '◎' };

module.exports = (bot) => {
    bot.action('master_panel', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const role = await userRepo.getUserRole(ctx.from.id);
            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(true, role), masterMenu());
        } catch (error) { 
            console.error('Master Panel Error:', error.message); 
        }
    });

    bot.action(/^master_confirm_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery('⚡ Bestätige Zahlung...').catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const cryptoPaymentService = require('../../services/cryptoPaymentService');
            const symbol = order.payment_method_name || 'Krypto';

            await cryptoPaymentService.fulfillOrderAutomatically(bot, order, 'MASTER_MANUAL_CONFIRM', symbol);

            await ctx.answerCbQuery('✅ Zahlung erfolgreich bestätigt und Ware ausgeliefert!', { show_alert: true }).catch(() => {});
            await ctx.reply(`✅ *Bestellung #${order.order_id} manuell bestätigt!*\n\nDie Auslieferung wurde an den Kunden (ID: \`${order.user_id}\`) gesendet.`, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Master Confirm Pay Error:', error.message);
            ctx.reply('❌ Fehler beim Bestätigen der Zahlung.');
        }
    });

    bot.action('master_info', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const text = texts.getMasterInfoText();
            await uiHelper.updateOrSend(ctx, text, {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel', style: 'danger' }]]
            });
        } catch (error) {
            console.error('Master Info Error:', error.message);
        }
    });

    // ─── NEUE UNTER-HUBS DER INTUITIVEN MENÜFÜHRUNG ──────────────────────────

    // 1. Bestellungen & Tresor Hub
    bot.action('master_orders_hub', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders', style: 'primary' }],
                    [{ text: '🔐 Deliverables Tresor', callback_data: 'master_deliverables_tresor', style: 'primary' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_panel', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, '📋 *Bestellungen & Tresor*\n\nWähle eine Übersicht:', keyboard);
        } catch (error) { console.error('master_orders_hub error:', error.message); }
    });

    // 2. Kunden & Marketing Hub
    bot.action('master_customers_hub', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📊 Kundenübersicht & Banning', callback_data: 'master_customer_overview', style: 'primary' }],
                    [{ text: '🎟️ Coupons verwalten', callback_data: 'master_manage_coupons', style: 'primary' }],
                    [{ text: '📢 Rundnachricht senden', callback_data: 'admin_start_broadcast', style: 'primary' }],
                    [{ text: '⭐ Feedbacks verwalten', callback_data: 'master_manage_feedbacks', style: 'primary' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_panel', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, '👥 *Kunden & Marketing*\n\nWähle eine Aktion:', keyboard);
        } catch (error) { console.error('master_customers_hub error:', error.message); }
    });

    // 3. Einstellungen & Personal Hub
    // 3. Einstellungen & Personal Hub
    bot.action('master_settings_hub', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const settingsRepo = require('../../database/repositories/settingsRepo');
            const showExactStock = await settingsRepo.isShowExactStock();
            const currentStatus = await settingsRepo.getShopStatus();
            let statusBtnLabel = '🟢 Bot-Status: Geöffnet';
            if (currentStatus === 'closed') statusBtnLabel = '🔴 Bot-Status: Sofort geschlossen';
            else if (currentStatus === 'schedule') statusBtnLabel = '⏰ Bot-Status: Öffnungszeiten aktiv';

            const keyboard = {
                inline_keyboard: [
                    [{ text: statusBtnLabel, callback_data: 'master_shop_status_hub', style: 'primary' }],
                    [{ text: '👥 Personal & Admins', callback_data: 'master_manage_admins', style: 'primary' }],
                    [{ text: '💳 Zahlungsarten verwalten', callback_data: 'master_manage_payments', style: 'primary' }],
                    [{ text: showExactStock ? '📦 Vorrats-Anzeige: Exakte Stückzahl' : '📦 Vorrats-Anzeige: Allgemein (Verfügbar)', callback_data: 'master_toggle_stock_vis', style: 'primary' }],
                    [{ text: '⏳ Ausstehende Freigaben', callback_data: 'master_pending_approvals', style: 'primary' }],
                    [{ text: '📝 Begrüßungstext bearbeiten', callback_data: 'master_edit_welcome_msg', style: 'primary' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_panel', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, '⚙️ *Shop-Einstellungen & Personal*\n\nWähle einen Bereich:', keyboard);
        } catch (error) { console.error('master_settings_hub error:', error.message); }
    });

    // ─── BOT STATUS & ÖFFNUNGSZEITEN HUB ─────────────────────────────────────
    bot.action('master_shop_status_hub', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const settingsRepo = require('../../database/repositories/settingsRepo');
            const status = await settingsRepo.getShopStatus();
            const hours = await settingsRepo.getOpeningHours();
            const absenceMsg = await settingsRepo.getAbsenceMessage();

            const text = texts.getShopStatusHubText ? texts.getShopStatusHubText(status, hours, absenceMsg) : '⚙️ *Bot-Status & Öffnungszeiten*';
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: `${status === 'open' ? '✅ ' : ''}🟢 Shop öffnen (Immer aktiv)`, callback_data: 'master_set_status_open', style: status === 'open' ? 'success' : 'primary' }],
                    [{ text: `${status === 'closed' ? '✅ ' : ''}🔴 Sofort schließen (Offline)`, callback_data: 'master_set_status_closed', style: status === 'closed' ? 'danger' : 'primary' }],
                    [{ text: `${status === 'schedule' ? '✅ ' : ''}⏰ Feste Öffnungszeiten (${hours.start} - ${hours.end})`, callback_data: 'master_set_status_schedule', style: status === 'schedule' ? 'success' : 'primary' }],
                    [{ text: '⏱️ Öffnungszeiten bearbeiten', callback_data: 'master_edit_hours', style: 'primary' }],
                    [{ text: '📝 Abwesenheitsnachricht bearbeiten', callback_data: 'master_edit_absence', style: 'primary' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_settings_hub', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error('master_shop_status_hub error:', error.message); }
    });

    bot.action('master_set_status_open', isMasterAdmin, async (ctx) => {
        try {
            const settingsRepo = require('../../database/repositories/settingsRepo');
            await settingsRepo.setShopStatus('open');
            ctx.answerCbQuery('🟢 Shop ist nun dauerhaft geöffnet!').catch(() => {});
            ctx.update.callback_query.data = 'master_shop_status_hub';
            return bot.handleUpdate(ctx.update);
        } catch (e) { console.error(e.message); }
    });

    bot.action('master_set_status_closed', isMasterAdmin, async (ctx) => {
        try {
            const settingsRepo = require('../../database/repositories/settingsRepo');
            await settingsRepo.setShopStatus('closed');
            ctx.answerCbQuery('🔴 Shop ist nun sofort geschlossen!').catch(() => {});
            ctx.update.callback_query.data = 'master_shop_status_hub';
            return bot.handleUpdate(ctx.update);
        } catch (e) { console.error(e.message); }
    });

    bot.action('master_set_status_schedule', isMasterAdmin, async (ctx) => {
        try {
            const settingsRepo = require('../../database/repositories/settingsRepo');
            await settingsRepo.setShopStatus('schedule');
            ctx.answerCbQuery('⏰ Feste Öffnungszeiten aktiviert!').catch(() => {});
            ctx.update.callback_query.data = 'master_shop_status_hub';
            return bot.handleUpdate(ctx.update);
        } catch (e) { console.error(e.message); }
    });

    bot.action('master_edit_hours', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editOpeningHoursScene');
        } catch (e) { console.error(e.message); }
    });

    bot.action('master_edit_absence', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editAbsenceMsgScene');
        } catch (e) { console.error(e.message); }
    });

    bot.action('master_toggle_stock_vis', isMasterAdmin, async (ctx) => {
        try {
            const settingsRepo = require('../../database/repositories/settingsRepo');
            const newVis = await settingsRepo.toggleShowExactStock();
            ctx.answerCbQuery(newVis ? '📦 Vorrats-Anzeige: Exakte Stückzahl aktiviert!' : '📦 Vorrats-Anzeige: Allgemein (Verfügbar) aktiviert!').catch(() => {});

            ctx.update.callback_query.data = 'master_settings_hub';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('toggle_stock_vis error:', error.message); }
    });

    // Kompatibilität
    bot.action('master_shop_management', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        ctx.update.callback_query.data = 'master_settings_hub';
        return bot.handleUpdate(ctx.update);
    });

    bot.action('master_manage_payments', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const methods = await paymentRepo.getActivePaymentMethods();
            const keyboard = methods.map(m => ([{
                text: `${m.auto_verify ? '⚡' : '💳'} ${m.name}`,
                callback_data: `master_view_pay_${m.id}`,
                style: 'primary'
            }]));
            keyboard.push([{ text: '➕ ⚡ Auto-Krypto Zahlungsart', callback_data: 'master_add_auto_payment', style: 'success' }]);
            keyboard.push([{ text: '➕ 💳 Manuelle Zahlungsart', callback_data: 'master_add_payment', style: 'primary' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_settings_hub', style: 'danger' }]);
            await uiHelper.updateOrSend(ctx, '💳 *Zahlungsarten verwalten*', { inline_keyboard: keyboard });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('master_add_auto_payment', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('addPaymentMethodScene', { isAutoCrypto: true });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('master_add_payment', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('addPaymentMethodScene', { isAutoCrypto: false });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^master_view_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const method = await paymentRepo.getPaymentMethod(ctx.match[1]);
            if (!method) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });
            
            const icon = CRYPTO_ICONS[method.crypto_symbol] || '🪙';
            let text = `💳 *${method.name}*\n\n`;
            if (method.wallet_address) text += `📍 *Adresse:* \`${method.wallet_address}\`\n`;
            text += `⚡ *Auto-Erkennung:* ${method.auto_verify ? 'Aktiviert ✅' : 'Deaktiviert ❌'}\n`;
            if (method.crypto_symbol) text += `🪙 *Coin:* \`${icon} ${method.crypto_symbol}\`\n`;

            const keyboard = {
                inline_keyboard: [
                    [{ text: method.auto_verify ? '⚡ Auto-Erkennung: Aktiviert' : '⚡ Auto-Erkennung: Deaktiviert', callback_data: `master_toggle_autoverify_${method.id}`, style: method.auto_verify ? 'success' : 'danger' }],
                    [{ text: '🗑 Zahlungsart löschen', callback_data: `master_del_pay_${method.id}`, style: 'danger' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_manage_payments', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^master_toggle_autoverify_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const methodId = ctx.match[1];
            const method = await paymentRepo.getPaymentMethod(methodId);
            if (!method) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            await paymentRepo.toggleAutoVerify(methodId, !method.auto_verify);
            ctx.answerCbQuery(!method.auto_verify ? '⚡ Auto-Erkennung aktiviert!' : '❌ Auto-Erkennung deaktiviert.').catch(() => {});
            
            ctx.update.callback_query.data = `master_view_pay_${methodId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('toggle_autoverify error:', error.message); }
    });

    bot.action(/^master_del_pay_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await paymentRepo.deletePaymentMethod(ctx.match[1]);
            ctx.answerCbQuery('✅ Gelöscht').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_payments';
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('master_customer_overview', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const customers = await userRepo.getAllCustomers();
            let text = customers.length > 0 ? `📊 *Kundenübersicht* (${customers.length})\n\n` : '📊 Keine Kunden registriert.';
            const keyboard = customers.slice(0, 20).map(c => ([{ text: `👤 ${c.username || c.telegram_id}`, callback_data: `cust_detail_${c.telegram_id}`, style: 'primary' }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_customers_hub', style: 'danger' }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_detail_(\d+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const targetId = ctx.match[1];
            const orders = await orderRepo.getOrdersByUser(targetId);
            let text = `👤 *Kunde: ${targetId}*\n\n📋 Bestellungen: ${orders.length}\n`;
            const kb = {
                inline_keyboard: [
                    [{ text: '👤 Kontaktieren', url: `tg://user?id=${targetId}`, style: 'primary' }],
                    [{ text: '🔨 Bannen', callback_data: `cust_ban_${targetId}`, style: 'danger' }],
                    [{ text: '🗑 Löschen', callback_data: `cust_delete_${targetId}`, style: 'danger' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_customer_overview', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, kb);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_ban_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            const targetId = Number(ctx.match[1]);
            if (targetId === Number(config.MASTER_ADMIN_ID)) return ctx.answerCbQuery('Nicht möglich.', { show_alert: true });
            await userRepo.banUser(targetId);
            await userRepo.createPendingBan(targetId, ctx.from.id);
            bot.telegram.sendMessage(targetId, texts.getBannedMessage()).catch(() => {});
            ctx.answerCbQuery('🔨 Gebannt!').catch(() => {});
            await ctx.reply(`🔨 User ${targetId} gebannt.`);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^cust_delete_(\d+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.deleteUserCompletely(ctx.match[1]);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.reply(`🗑 User ${ctx.match[1]} gelöscht.`);
        } catch (error) { console.error(error.message); }
    });

    // ─── COUPON VERWALTUNG ──────────────────────────────────────────────────
    const couponRepo = require('../../database/repositories/couponRepo');

    bot.action('master_manage_coupons', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const rawCoupons = await couponRepo.getAllCoupons().catch(() => []);
            const coupons = Array.isArray(rawCoupons) ? rawCoupons.filter(Boolean) : [];
            let text = '🎟️ *GUTSCHEINE & COUPONS VERWALTEN*\n\n';

            const kb = [];
            if (coupons.length === 0) {
                text += '_Derzeit sind keine Coupons eingerichtet._\n\n' +
                    'Klicke unten, um deinen ersten Rabatt-Coupon zu erstellen!';
            } else {
                text += `Insgesamt *${coupons.length}* Coupon(s) gefunden:\n\n`;
                coupons.forEach(c => {
                    if (!c || !c.code) return;
                    const statusIcon = c.is_active ? '🟢' : '🔴';
                    const valStr = c.discount_type === 'percent' ? `${c.discount_value}%` : `${formatters.formatPrice(c.discount_value)}`;
                    const usesStr = c.max_uses ? `${c.uses_count || 0}/${c.max_uses}` : `${c.uses_count || 0}/♾️`;
                    const targetId = c.id || c.code;
                    
                    text += `${statusIcon} *Code:* \`${c.code}\` | Rabatt: *${valStr}* | Einlösungen: *${usesStr}*\n`;
                    kb.push([{ text: `🎟️ ${c.code} (${valStr})`, callback_data: `master_view_coupon_${targetId}`, style: 'primary' }]);
                });
            }

            kb.push([{ text: '➕ Neuen Coupon erstellen', callback_data: 'master_add_coupon', style: 'success' }]);
            kb.push([{ text: '🔙 Zurück', callback_data: 'master_customers_hub', style: 'danger' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: kb });
        } catch (error) { console.error('master_manage_coupons error:', error.message); }
    });

    bot.action('master_add_coupon', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('addCouponScene');
        } catch (error) { console.error('master_add_coupon error:', error.message); }
    });

    bot.action(/^master_view_coupon_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const couponId = ctx.match[1];
            const coupons = await couponRepo.getAllCoupons().catch(() => []);
            const coupon = (coupons || []).find(c => c && (String(c.id) === String(couponId) || String(c.code) === String(couponId)));
            if (!coupon) return ctx.answerCbQuery('Coupon nicht gefunden.', { show_alert: true });

            const valStr = coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `${formatters.formatPrice(coupon.discount_value)}`;
            const usesStr = coupon.max_uses ? `${coupon.uses_count || 0} von ${coupon.max_uses}` : `${coupon.uses_count || 0} (Unbegrenzt)`;
            const expStr = coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('de-DE') : 'Kein Ablaufdatum';

            let text = `🎟️ *COUPON DETAILS*\n\n` +
                `📌 *Code:* \`${coupon.code}\`\n` +
                `💰 *Rabatt:* ${valStr}\n` +
                `🟢 *Status:* ${coupon.is_active ? 'Aktiv ✅' : 'Deaktiviert ❌'}\n` +
                `🔢 *Einlösungen:* ${usesStr}\n` +
                `⏱️ *Gültig bis:* ${expStr}\n`;

            if (coupon.product_id) {
                try {
                    const prod = await productRepo.getProductById(coupon.product_id);
                    if (prod) text += `📦 *Produkt-Beschränkung:* Nur für *${prod.name}*\n`;
                } catch (e) {}
            } else {
                text += `🌐 *Gültigkeit:* Für alle Produkte im Shop\n`;
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: coupon.is_active ? '🔴 Deaktivieren' : '🟢 Aktivieren', callback_data: `master_toggle_coupon_${coupon.id}`, style: coupon.is_active ? 'danger' : 'success' }],
                    [{ text: '🗑 Coupon löschen', callback_data: `master_del_coupon_${coupon.id}`, style: 'danger' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_manage_coupons', style: 'danger' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error('master_view_coupon error:', error.message); }
    });

    bot.action(/^master_toggle_coupon_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await couponRepo.toggleCouponActive(ctx.match[1]);
            ctx.update.callback_query.data = `master_view_coupon_${ctx.match[1]}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_del_coupon_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await couponRepo.deleteCoupon(ctx.match[1]);
            ctx.answerCbQuery('🗑 Coupon gelöscht.', { show_alert: true }).catch(() => {});
            ctx.update.callback_query.data = 'master_manage_coupons';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_pending_approvals', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const pending = await approvalRepo.getPendingApprovals();
            if (pending.length === 0) return uiHelper.updateOrSend(ctx, '✅ Keine ausstehenden Freigaben.', { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_settings_hub', style: 'danger' }]] });
            const keyboard = pending.map(p => {
                const icon = p.action_type === 'DELETE' ? '🗑' : '💰';
                return [{ text: `${icon} Anfrage prüfen`, callback_data: `master_view_appr_${p.id}`, style: 'primary' }];
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_settings_hub', style: 'danger' }]);
            await uiHelper.updateOrSend(ctx, '📋 *Ausstehende Anfragen:*', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_view_appr_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const request = await approvalRepo.getApprovalById(ctx.match[1]);
            if (!request) return ctx.answerCbQuery('Anfrage nicht gefunden.', { show_alert: true });
            
            let text = `📋 *Anfrage Details*\n\n`;
            text += `Typ: ${request.action_type === 'DELETE' ? '🗑 Produkt löschen' : '💰 Preisänderung'}\n`;
            text += `Angefragt von: ${request.requested_by}\n`;
            try {
                const prod = await productRepo.getProductById(request.target_id);
                if (prod) text += `Produkt: *${prod.name}*\n`;
            } catch (e) {}
            if (request.action_type === 'PRICE_CHANGE') {
                text += `Neuer Preis: ${request.new_value}€\n`;
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ Genehmigen', callback_data: `master_approve_${request.id}`, style: 'success' }],
                    [{ text: '❌ Ablehnen', callback_data: `master_reject_appr_${request.id}`, style: 'danger' }],
                    [{ text: '🔙 Zurück', callback_data: 'master_pending_approvals', style: 'danger' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_approve_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const request = await approvalRepo.getApprovalById(ctx.match[1]);
            if (request.action_type === 'PRICE_CHANGE') {
                await productRepo.updateProductPrice(request.target_id, parseFloat(request.new_value));
            } else if (request.action_type === 'DELETE') {
                await productRepo.deleteProduct(request.target_id);
            }
            await approvalRepo.updateApprovalStatus(request.id, 'approved');
            ctx.answerCbQuery('✅ Genehmigt!').catch(() => {});
            ctx.update.callback_query.data = 'master_pending_approvals';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_reject_appr_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await approvalRepo.updateApprovalStatus(ctx.match[1], 'rejected');
            ctx.answerCbQuery('❌ Abgelehnt.').catch(() => {});
            ctx.update.callback_query.data = 'master_pending_approvals';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^odel_confirm_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        const orderId = ctx.match[1];
        try {
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (order) await orderHelper.clearOldNotifications(ctx, order);
            await orderRepo.deleteOrder(orderId);
            ctx.answerCbQuery('🗑 Gelöscht!').catch(() => {});
            await ctx.editMessageText(`🗑 Bestellung \`#${orderId}\` wurde endgültig gelöscht.`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^odel_approve_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        try {
            const approval = await approvalRepo.getApprovalById(ctx.match[1]);
            const order = await orderRepo.getOrderByOrderId(approval.new_value);
            if (order) {
                await orderHelper.clearOldNotifications(ctx, order);
                await orderRepo.deleteOrder(order.order_id);
            }
            await approvalRepo.updateApprovalStatus(approval.id, 'approved');
            ctx.answerCbQuery('✅ Bestellung gelöscht!').catch(() => {});
            await ctx.editMessageText(`✅ Löschanfrage genehmigt für \`#${approval.new_value}\`.`);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^odel_reject_([\w-]+)$/, isMasterAdmin, async (ctx) => {
        try {
            await approvalRepo.updateApprovalStatus(ctx.match[1], 'rejected');
            ctx.answerCbQuery('❌ Abgelehnt.').catch(() => {});
            await ctx.editMessageText('❌ Löschanfrage abgelehnt.');
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_manage_admins', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const admins = await userRepo.getAllAdmins();
            const keyboard = admins
                .filter(a => Number(a.telegram_id) !== Number(config.MASTER_ADMIN_ID))
                .map(a => ([{ text: `❌ ${a.username || a.telegram_id} entlassen`, callback_data: `master_fire_${a.telegram_id}`, style: 'danger' }]));
            keyboard.push([{ text: '➕ Admin ernennen (ID)', callback_data: 'master_prompt_add_admin', style: 'success' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_settings_hub', style: 'danger' }]);
            await uiHelper.updateOrSend(ctx, '👥 *Personalverwaltung*', { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^master_fire_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            await userRepo.removeAdmin(ctx.match[1]);
            ctx.answerCbQuery('Admin entlassen.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_admins';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_ack_msg', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery('Gelesen.').catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    });

    bot.action('master_edit_welcome_msg', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editWelcomeMsgScene');
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^master_manage_feedbacks(?:_(\d+))?$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const page = ctx.match && ctx.match[1] ? parseInt(ctx.match[1]) : 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const stats = await feedbackRepo.getFeedbackStats();
            const { data: feedbacks, count: totalFeedbacks } = await feedbackRepo.getApprovedFeedbacks(limit, offset);

            const text = texts.getMasterFeedbackManagement(stats.average, stats.total);
            const inline_keyboard = [];

            feedbacks.forEach(fb => {
                const stars = '⭐'.repeat(fb.rating);
                const shortComment = fb.comment ? ` - "${fb.comment.substring(0, 15)}..."` : '';
                const label = `${stars} | ${fb.username}${shortComment}`;
                inline_keyboard.push([{ text: `❌ Löschen: ${label}`, callback_data: `master_del_fb_${fb.id}`, style: 'danger' }]);
            });

            const totalPages = Math.ceil(totalFeedbacks / limit);
            if (totalPages > 1) {
                const navRow = [];
                if (page > 1) navRow.push({ text: '⬅️', callback_data: `master_manage_feedbacks_${page - 1}`, style: 'primary' });
                navRow.push({ text: `Seite ${page}/${totalPages}`, callback_data: 'ignore_click', style: 'primary' });
                if (page < totalPages) navRow.push({ text: '➡️', callback_data: `master_manage_feedbacks_${page + 1}`, style: 'primary' });
                inline_keyboard.push(navRow);
            }

            if (totalFeedbacks > 0) {
                inline_keyboard.push([{ text: '🗑 ALLE Feedbacks löschen', callback_data: 'master_del_all_fb_confirm', style: 'danger' }]);
            }
            
            inline_keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_customers_hub', style: 'danger' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard });
        } catch (error) { console.error('Manage Feedbacks Error:', error.message); }
    });

    bot.action(/^master_del_fb_(.+)$/, isMasterAdmin, async (ctx) => {
        try {
            const fbId = ctx.match[1];
            await feedbackRepo.deleteFeedback(fbId); 
            ctx.answerCbQuery('🗑 Feedback gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_feedbacks';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action('master_del_all_fb_confirm', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, '⚠️ *Möchtest du WIRKLICH alle freigegebenen Feedbacks unwiderruflich löschen?*', {
            inline_keyboard: [
                [{ text: '🚨 JA, ALLE LÖSCHEN', callback_data: 'master_del_all_fb_exec', style: 'danger' }],
                [{ text: '❌ Abbrechen', callback_data: 'master_manage_feedbacks', style: 'danger' }]
            ],
            parse_mode: 'Markdown'
        });
    });

    bot.action('master_del_all_fb_exec', isMasterAdmin, async (ctx) => {
        try {
            await feedbackRepo.deleteAllFeedbacks(); 
            ctx.answerCbQuery('🗑 Alle Feedbacks gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'master_manage_feedbacks';
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error(error.message); }
    });

    bot.action('orders_delete_all_confirm', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, '⚠️ *WARNUNG: Möchtest du WIRKLICH ALLE BESTELLUNGEN in der Datenbank unwiderruflich löschen?*', {
            inline_keyboard: [
                [{ text: '🚨 JA, ALLE BESTELLUNGEN LÖSCHEN', callback_data: 'orders_delete_all_exec', style: 'danger' }],
                [{ text: '❌ Abbrechen', callback_data: 'master_orders_hub', style: 'danger' }]
            ],
            parse_mode: 'Markdown'
        });
    });

    bot.action('orders_delete_all_exec', isMasterAdmin, async (ctx) => {
        try {
            await orderRepo.deleteAllOrders();
            ctx.answerCbQuery('🗑 Alle Bestellungen wurden gelöscht.').catch(() => {});
            await uiHelper.updateOrSend(ctx, '✅ *Alle Bestellungen wurden erfolgreich gelöscht.*', {
                inline_keyboard: [[{ text: '🔙 Zurück zum Hub', callback_data: 'master_orders_hub', style: 'danger' }]]
            });
        } catch (error) {
            console.error('Delete All Orders Error:', error.message);
            ctx.answerCbQuery('❌ Fehler beim Löschen.', { show_alert: true }).catch(() => {});
        }
    });

    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message?.text || ctx.from.id !== Number(config.MASTER_ADMIN_ID)) return next();
        const input = ctx.message.text.trim();

        if (input.startsWith('/')) {
            ctx.session.awaitingAdminId = null;
            ctx.session.awaitingCryptoSymbol = null;
            return next();
        }

        if (ctx.session.awaitingCryptoSymbol) {
            const methodId = ctx.session.awaitingCryptoSymbol;
            ctx.session.awaitingCryptoSymbol = null;
            try {
                await paymentRepo.updateCryptoSymbol(methodId, input);
                await ctx.reply(`✅ Krypto-Symbol auf \`${input.toUpperCase()}\` aktualisiert.`, { parse_mode: 'Markdown' });
            } catch (e) {
                await ctx.reply(`❌ Fehler beim Aktualisieren: ${e.message}`);
            }
            return;
        }

        if (ctx.session.awaitingAdminId) {
            const targetId = input;
            if (!/^\d+$/.test(targetId)) return ctx.reply('⚠️ Nur IDs senden.');
            await userRepo.updateUserRole(targetId, 'admin');
            ctx.session.awaitingAdminId = false;
            await ctx.reply(`✅ Nutzer ${targetId} ist nun Admin.`);
            return;
        }

        return next();
    });

    bot.action(/^master_deliverables_tresor(?:_(\d+))?$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const page = ctx.match && ctx.match[1] ? parseInt(ctx.match[1]) : 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const { data: orders, count: total } = await orderRepo.getOrdersWithDigitalDelivery(limit, offset);

            if (!orders || orders.length === 0) {
                return uiHelper.updateOrSend(ctx, texts.getMasterDeliveredOrdersHeader() + '\n\nKeine Bestellungen mit digitaler Lieferung gefunden.', {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_orders_hub', style: 'danger' }]]
                });
            }

            let text = texts.getMasterDeliveredOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach(order => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                text += `📋 \`#${order.order_id}\` | ID: ${order.user_id} | ${date}\n`;
                keyboard.push([{ text: `🔐 #${order.order_id} – Tresor öffnen`, callback_data: `master_tresor_view_${order.order_id}`, style: 'primary' }]);
            });

            const totalPages = Math.ceil((total || 0) / limit);
            const navRow = [];
            if (page > 1) navRow.push({ text: '⬅️', callback_data: `master_deliverables_tresor_${page - 1}`, style: 'primary' });
            if (totalPages > 1) navRow.push({ text: `${page}/${totalPages}`, callback_data: 'noop', style: 'primary' });
            if (page < totalPages) navRow.push({ text: '➡️', callback_data: `master_deliverables_tresor_${page + 1}`, style: 'primary' });
            if (navRow.length > 0) keyboard.push(navRow);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'master_orders_hub', style: 'danger' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Master Tresor Error:', error.message);
        }
    });

    bot.action(/^master_tresor_view_(.+)$/, isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order) return ctx.answerCbQuery('Bestellung nicht gefunden.', { show_alert: true });

            const date = new Date(order.created_at).toLocaleDateString('de-DE');
            let text = `🔐 *Deliverables Tresor*\n\n`;
            text += `📋 Bestellung: \`#${orderId}\`\n`;
            text += `👤 Kunden-ID: ${order.user_id}\n`;
            text += `📅 Datum: ${date}\n\n`;
            text += `📦 *Gelieferter Inhalt:*\n`;
            text += `➖➖➖➖➖➖➖➖➖➖\n`;
            text += order.digital_delivery || '_Kein Inhalt_';
            text += `\n➖➖➖➖➖➖➖➖➖➖`;

            const keyboard = {
                inline_keyboard: [
                    [{ text: '📋 Bestellung öffnen (Admin)', callback_data: `oview_${orderId}`, style: 'primary' }],
                    [{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${order.user_id}`, style: 'primary' }],
                    [{ text: '🔙 Zurück zum Tresor', callback_data: 'master_deliverables_tresor', style: 'danger' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error('Master Tresor View Error:', error.message);
        }
    });

    bot.action('noop', (ctx) => ctx.answerCbQuery().catch(() => {}));
};
