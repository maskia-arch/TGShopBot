const userRepo = require('../../database/repositories/userRepo');

module.exports = (bot) => {
    bot.command('addadmin', async (ctx) => {
        const senderId = ctx.from.id;

        try {
            const isMaster = await userRepo.isMasterAdmin(senderId);
            
            if (!isMaster) {
                return ctx.reply('Du hast keine Berechtigung für diesen Befehl.');
            }

            const parts = ctx.message.text.split(' ');

            if (parts.length !== 2) {
                return ctx.reply('Bitte verwende das Format: /addadmin <TelegramID>');
            }

            const targetId = parseInt(parts[1], 10);

            if (isNaN(targetId)) {
                return ctx.reply('Die Telegram-ID muss eine gültige Zahl sein.');
            }

            const success = await userRepo.addAdmin(targetId);

            if (success) {
                await ctx.reply(`Erfolg: Der User mit der ID ${targetId} wurde als temporärer Admin hinzugefügt.`);
            } else {
                await ctx.reply('Fehler: Der Admin konnte nicht hinzugefügt werden. Möglicherweise existiert er bereits.');
            }

        } catch (error) {
            console.error(error.message);
            await ctx.reply('Es gab einen internen Fehler bei der Datenbank-Kommunikation.');
        }
    });
};
