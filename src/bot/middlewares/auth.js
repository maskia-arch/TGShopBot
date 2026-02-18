const userRepo = require('../../database/repositories/userRepo');
const config = require('../../config');

const isMasterAdmin = async (ctx, next) => {
    try {
        const userId = ctx.from.id;
        
        if (userId === config.MASTER_ADMIN_ID) {
            return next();
        }
        
        await ctx.reply('Zugriff verweigert: Diese Aktion erfordert Master Admin Rechte.');
    } catch (error) {
        console.error(error.message);
    }
};

const isAdmin = async (ctx, next) => {
    try {
        const userId = ctx.from.id;

        if (userId === config.MASTER_ADMIN_ID) {
            return next();
        }

        const role = await userRepo.getUserRole(userId);
        
        if (role === 'admin') {
            return next();
        }
        
        await ctx.reply('Zugriff verweigert: Diese Aktion erfordert Admin Rechte.');
    } catch (error) {
        console.error(error.message);
    }
};

module.exports = {
    isMasterAdmin,
    isAdmin
};
