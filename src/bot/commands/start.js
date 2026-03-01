const userRepo = require('../../database/repositories/userRepo');
const orderRepo = require('../../database/repositories/orderRepo');
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
            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            if (!isMaster) {
                const banned = await userRepo.isUserBanned(userId);
                if (banned) {
                    return ctx.reply(texts.getBannedMessage()).catch(() => {});
                }
            }

            await userRepo.upsertUser(userId, username);
            const role = await userRepo.getUserRole(userId);

            const text = texts.getWelcomeText(isMaster, role);
            let keyboard;

            if (isMaster) {
                keyboard = masterMenu();
            } else if (role === 'admin') {
                keyboard = adminMenu();
            } else {
                const hasOrders = await orderRepo.hasActiveOrders(userId);
                keyboard = customerMenu(hasOrders);
            }

            const sentMessage = await ctx.reply(text, {
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            });

            ctx.deleteMessage().catch(() => {});

            if (ctx.session.lastMenuMessageId) {
                ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.lastMenuMessageId).catch(() => {});
            }

            ctx.session.lastMenuMessageId = sentMessage.message_id;

        } catch (error) {
            console.error('Start Command Error:', error.message);
        }
    });
};
