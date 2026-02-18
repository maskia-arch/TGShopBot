const userRepo = require('../../database/repositories/userRepo');
const masterMenu = require('../keyboards/masterMenu');
const adminMenu = require('../keyboards/adminMenu');
const customerMenu = require('../keyboards/customerMenu');
const config = require('../../config');

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name;

            await userRepo.upsertUser(userId, username);

            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            let text = `Willkommen beim *Shop Bot*!\n\n`;
            let keyboard;

            if (isMaster) {
                text += `👑 *Master-Kontrollzentrum* (v${config.VERSION})\n\nSie sind als Systeminhaber angemeldet.`;
                keyboard = masterMenu();
            } else if (role === 'admin') {
                text += `🛠 *Admin-Bereich*\n\nVerwalten Sie Produkte und Kategorien.`;
                keyboard = adminMenu();
            } else {
                text += `Bitte wähle eine Option aus dem Menü:`;
                keyboard = customerMenu();
            }

            await ctx.reply(text, { 
                reply_markup: keyboard,
                parse_mode: 'Markdown' 
            });
        } catch (error) {
            console.error('Start Command Error:', error.message);
        }
    });
};
