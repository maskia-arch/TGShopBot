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

            let text = `Willkommen beim *Shop Bot*!\n\n`;
            let keyboard;

            if (role === 'master') {
                text += `🔧 *Master Panel* (v${config.VERSION})`;
                keyboard = masterMenu();
            } else if (role === 'admin') {
                text += `🛠 *Admin Bereich*`;
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
            console.error(error.message);
        }
    });
};
