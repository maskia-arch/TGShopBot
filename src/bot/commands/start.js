const userRepo = require('../../database/repositories/userRepo');
const masterMenu = require('../keyboards/masterMenu');
const adminMenu = require('../keyboards/adminMenu');
const customerMenu = require('../keyboards/customerMenu');
const config = require('../../config');
const texts = require('../../utils/texts');

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        try {
            if (!ctx.session) ctx.session = {};

            const userId = ctx.from.id;
            const username = ctx.from.username || ctx.from.first_name;

            await userRepo.upsertUser(userId, username);

            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            const text = texts.getWelcomeText(isMaster, role);
            let keyboard;

            if (isMaster) {
                keyboard = masterMenu();
            } else if (role === 'admin') {
                keyboard = adminMenu();
            } else {
                keyboard = customerMenu();
            }

            const sentMessage = await ctx.reply(text, { 
                reply_markup: keyboard,
                parse_mode: 'Markdown' 
            });

            try {
                await ctx.deleteMessage();
            } catch (e) {}

            if (ctx.session.lastMenuMessageId) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.lastMenuMessageId);
                } catch (e) {}
            }

            ctx.session.lastMenuMessageId = sentMessage.message_id;

        } catch (error) {
            console.error('Start Command Error:', error.message);
        }
    });
};
