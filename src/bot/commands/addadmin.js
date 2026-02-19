const userRepo = require('../../database/repositories/userRepo');
const config = require('../../config');

module.exports = (bot) => {
    bot.command('addadmin', async (ctx) => {
        try {
            const senderId = ctx.from.id;

            if (senderId !== Number(config.MASTER_ADMIN_ID)) {
                const isMaster = await userRepo.isMasterAdmin(senderId).catch(() => false);
                if (!isMaster) {
                    return ctx.reply('⛔ Du hast keine Berechtigung für diesen Befehl.');
                }
            }

            const parts = ctx.message.text.trim().split(/\s+/);

            if (parts.length !== 2) {
                return ctx.reply('⚠️ Bitte verwende das Format: `/addadmin <TelegramID>`', { parse_mode: 'Markdown' });
            }

            const targetId = Number(parts[1]);

            if (isNaN(targetId)) {
                return ctx.reply('⚠️ Die Telegram-ID muss eine gültige Zahl sein.');
            }

            const success = await userRepo.addAdmin(targetId);

            if (success) {
                await ctx.reply(`✅ Erfolg: Der User mit der ID \`${targetId}\` wurde als Admin hinzugefügt.`, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply('❌ Fehler: Der Admin konnte nicht hinzugefügt werden. Möglicherweise existiert er bereits.');
            }

        } catch (error) {
            console.error('AddAdmin Command Error:', error.message);
            await ctx.reply('❌ Es gab einen internen Fehler bei der Datenbank-Kommunikation.');
        }
    });
};
