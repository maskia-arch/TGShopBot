const userRepo = require('../../database/repositories/userRepo');
const config = require('../../config');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');

const isMasterAdmin = async (ctx, next) => {
    try {
        if (ctx.from.id === Number(config.MASTER_ADMIN_ID)) {
            return next();
        }
        
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery('⛔ Zugriff verweigert: Master-Admin Rechte erforderlich.', { show_alert: true });
        }
        return uiHelper.sendTemporary(ctx, '⛔ Zugriff verweigert: Master-Admin Rechte erforderlich.', 5);
    } catch (error) {
        console.error('Auth Error (Master):', error.message);
    }
};

const isAdmin = async (ctx, next) => {
    try {
        const userId = ctx.from.id;

        if (userId === Number(config.MASTER_ADMIN_ID)) {
            return next();
        }

        const role = await userRepo.getUserRole(userId);
        if (role === 'admin' || role === 'master') {
            return next();
        }

        if (ctx.callbackQuery && !ctx.callbackQuery.data.startsWith('admin_')) {
            return next();
        }

        if (ctx.callbackQuery) {
            return ctx.answerCbQuery('🚫 Zugriff verweigert: Admin-Rechte erforderlich.', { show_alert: true });
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
        if (userId === Number(config.MASTER_ADMIN_ID)) return next();
        
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

module.exports = {
    isMasterAdmin,
    isAdmin,
    checkBan
};
