const userRepo = require('../../database/repositories/userRepo');
const config = require('../../config');
const uiHelper = require('../../utils/uiHelper');

const isMasterAdmin = async (ctx, next) => {
    try {
        const userId = ctx.from.id;
        
        if (userId === Number(config.MASTER_ADMIN_ID)) {
            return next();
        }
        
        const text = '⛔ Zugriff verweigert: Master-Admin Rechte erforderlich.';
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery(text, { show_alert: true });
        }
        return uiHelper.sendTemporary(ctx, text, 5);
    } catch (error) {
        console.error('Auth Error (Master):', error.message);
    }
};

const isAdmin = async (ctx, next) => {
    try {
        const userId = ctx.from.id;

        // Master-Admin immer zulassen
        if (userId === Number(config.MASTER_ADMIN_ID)) {
            return next();
        }

        const role = await userRepo.getUserRole(userId);
        if (role === 'admin' || role === 'master') {
            return next();
        }

        // WICHTIGER FIX: Wenn es KEINE Admin-Aktion ist (z.B. shop_menu), 
        // lassen wir den User einfach passieren.
        if (ctx.callbackQuery && !ctx.callbackQuery.data.startsWith('admin_')) {
            return next();
        }

        // Nur wenn eine admin_ Aktion aufgerufen wird, blockieren wir
        const text = '🚫 Zugriff verweigert: Admin-Rechte erforderlich.';
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery(text, { show_alert: true });
        }
        return uiHelper.sendTemporary(ctx, text, 5);
    } catch (error) {
        console.error('Auth Error (Admin):', error.message);
    }
};

module.exports = {
    isMasterAdmin,
    isAdmin
};
