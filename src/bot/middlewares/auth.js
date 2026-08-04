const userRepo = require('../../database/repositories/userRepo');
const config = require('../../config');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');

const isMasterAdmin = async (ctx, next) => {
    try {
        if (!ctx.from) return;
        const userId = ctx.from.id;

        if (Number(userId) === Number(config.MASTER_ADMIN_ID)) {
            return next();
        }
        
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery('⛔ Zugriff verweigert: Master-Admin Rechte erforderlich.', { show_alert: true }).catch(() => {});
        }
        return uiHelper.sendTemporary(ctx, '⛔ Zugriff verweigert: Master-Admin Rechte erforderlich.', 5);
    } catch (error) {
        console.error('Auth Error (Master):', error.message);
    }
};

const isAdmin = async (ctx, next) => {
    try {
        if (!ctx.from) return;
        const userId = ctx.from.id;

        if (Number(userId) === Number(config.MASTER_ADMIN_ID)) {
            return next();
        }

        const role = await userRepo.getUserRole(userId);
        if (role === 'admin' || role === 'master') {
            return next();
        }

        // STRIKTER SCHUTZ: Keine Ausnahmen! Kunden erhalten niemals Admin-Rechte!
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery('🚫 Zugriff verweigert: Admin-Rechte erforderlich.', { show_alert: true }).catch(() => {});
        }
        return uiHelper.sendTemporary(ctx, '🚫 Zugriff verweigert: Admin-Rechte erforderlich.', 5);
    } catch (error) {
        console.error('Auth Error (Admin):', error.message);
    }
};

// Ban-Check Middleware – wird global eingesetzt
const checkBan = async (ctx, next) => {
    try {
        if (!ctx.from) return next();
        
        const userId = ctx.from.id;
        
        // Master wird nie gebannt
        if (Number(userId) === Number(config.MASTER_ADMIN_ID)) return next();
        
        const banned = await userRepo.isUserBanned(userId);
        if (banned) {
            if (ctx.callbackQuery) {
                return ctx.answerCbQuery(texts.getBannedMessage().replace('🚫 ', ''), { show_alert: true }).catch(() => {});
            }
            return ctx.reply(texts.getBannedMessage()).catch(() => {});
        }
        
        return next();
    } catch (error) {
        console.error('Ban Check Error:', error.message);
        return next();
    }
};

const settingsRepo = require('../../database/repositories/settingsRepo');

// Shop Status / Öffnungszeiten Middleware – wird global für Kunden-Anfragen eingesetzt
const checkShopStatus = async (ctx, next) => {
    try {
        if (!ctx.from) return next();
        const userId = ctx.from.id;

        // Master-Admin und Admins werden NIEMALS durch den Offline-Status blockiert!
        if (Number(userId) === Number(config.MASTER_ADMIN_ID)) return next();

        const role = await userRepo.getUserRole(userId).catch(() => 'customer');
        if (role === 'admin' || role === 'master') return next();

        const statusInfo = await settingsRepo.isShopOpenNow();
        if (statusInfo.open) {
            return next();
        }

        const noticeText = texts.getShopClosedCustomerNotice ? texts.getShopClosedCustomerNotice(statusInfo) : '⏰ Der Shop ist aktuell geschlossen.';
        const keyboard = {
            inline_keyboard: [[{ text: '🔄 Erneut versuchen', callback_data: 'back_to_main' }]]
        };

        if (ctx.callbackQuery) {
            ctx.answerCbQuery('⏰ Außerhalb der Service-Zeiten', { show_alert: true }).catch(() => {});
            return await uiHelper.updateOrSend(ctx, noticeText, keyboard);
        }

        return await ctx.reply(noticeText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } catch (error) {
        console.error('Shop Status Check Error:', error.message);
        return next();
    }
};

module.exports = {
    isMasterAdmin,
    isAdmin,
    checkBan,
    checkShopStatus
};
