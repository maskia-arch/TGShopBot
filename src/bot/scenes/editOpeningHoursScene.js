const { Scenes } = require('telegraf');
const settingsRepo = require('../../database/repositories/settingsRepo');

const editOpeningHoursScene = new Scenes.WizardScene(
    'editOpeningHoursScene',
    async (ctx) => {
        try {
            const hours = await settingsRepo.getOpeningHours();
            const text = `⏰ *Öffnungszeiten festlegen*\n\n` +
                `Aktuell eingestellt: *${hours.start} bis ${hours.end} Uhr*\n\n` +
                `Bitte sende jetzt die neuen Zeiten im Format \`HH:MM - HH:MM\` (z. B. \`09:00 - 20:00\` oder \`08:00 22:00\`):`;

            if (ctx.callbackQuery) {
                await ctx.deleteMessage().catch(() => {});
            }

            const msg = await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_edit_hours' }]]
                }
            });

            ctx.wizard.state.promptMsgId = msg.message_id;
            return ctx.wizard.next();
        } catch (error) {
            console.error('editOpeningHoursScene Init Error:', error.message);
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_edit_hours') {
            ctx.answerCbQuery('Abgebrochen').catch(() => {});
            await ctx.deleteMessage().catch(() => {});
            await ctx.reply('Aktion abgebrochen.', {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Zum Status-Menü', callback_data: 'master_shop_status_hub' }]]
                }
            });
            return ctx.scene.leave();
        }

        if (ctx.message && ctx.message.text) {
            const input = ctx.message.text.trim();

            await ctx.deleteMessage().catch(() => {});
            if (ctx.wizard.state.promptMsgId) {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.wizard.state.promptMsgId).catch(() => {});
            }

            // Regex zur Erkennung von Zeitspannen (z.B. "09:00 - 20:00" oder "8:00 - 20:00" oder "09:00 20:00")
            const timeMatch = input.match(/^([0-2]?\d:[0-5]\d)[\s\-–]+([0-2]?\d:[0-5]\d)$/);

            if (!timeMatch) {
                await ctx.reply('⚠️ Ungültiges Format! Bitte sende die Uhrzeiten im Format \`09:00 - 20:00\` (HH:MM - HH:MM):', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_edit_hours' }]]
                    }
                });
                return;
            }

            const formatTime = (t) => {
                const parts = t.split(':');
                return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
            };

            const startTime = formatTime(timeMatch[1]);
            const endTime = formatTime(timeMatch[2]);

            await settingsRepo.setOpeningHours(startTime, endTime);

            await ctx.reply(`✅ *Öffnungszeiten gespeichert!*\n\nNeue Zeiten: \`${startTime} bis ${endTime} Uhr\``, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Zum Status-Menü', callback_data: 'master_shop_status_hub' }]]
                }
            });
            return ctx.scene.leave();
        }

        await ctx.reply('⚠️ Bitte sende einen Text mit den Uhrzeiten oder klicke auf Abbrechen.');
    }
);

module.exports = editOpeningHoursScene;
