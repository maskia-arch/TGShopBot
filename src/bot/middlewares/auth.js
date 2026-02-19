const userRepo = require('../../database/repositories/userRepo');
const config = require('../../config');
const uiHelper = require('../../utils/uiHelper');

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

module.exports = {
    isMasterAdmin,
    isAdmin
};
