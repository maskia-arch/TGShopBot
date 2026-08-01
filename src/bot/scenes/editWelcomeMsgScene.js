const { Scenes } = require('telegraf');
const settingsRepo = require('../../database/repositories/settingsRepo');

const editWelcomeMsgScene = new Scenes.WizardScene(
    'editWelcomeMsgScene',
    async (ctx) => {
        try {
            const currentMsg = await settingsRepo.getSetting('welcome_message');
            let text = '📝 *Begrüßungsnachricht bearbeiten*\n\n';
            
            if (currentMsg) {
                text += `Aktuelle Nachricht:\n_${currentMsg}_\n\n`;
            } else {
                text += `Aktuell ist keine Begrüßungsnachricht gesetzt.\n\n`;
            }
            
            text += 'Bitte sende jetzt den neuen Text für die Begrüßungsnachricht (oder tippe `Löschen`, um sie zu entfernen):';

            if (ctx.callbackQuery) {
                await ctx.deleteMessage().catch(() => {});
            }

            const msg = await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_edit_welcome' }]]
                }
            });
            
            ctx.wizard.state.promptMsgId = msg.message_id;
            return ctx.wizard.next();
        } catch (error) {
            console.error(error.message);
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_edit_welcome') {
            ctx.answerCbQuery('Abgebrochen').catch(() => {});
            await ctx.deleteMessage().catch(() => {});
            await ctx.reply('Aktion abgebrochen.', {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Zum Master Panel', callback_data: 'master_panel' }]]
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
            
            if (input.toLowerCase() === 'löschen') {
                await settingsRepo.setSetting('welcome_message', '');
                await ctx.reply('🗑 Die Begrüßungsnachricht wurde entfernt.', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Zum Master Panel', callback_data: 'master_panel' }]]
                    }
                });
            } else {
                await settingsRepo.setSetting('welcome_message', input);
                await ctx.reply('✅ Die neue Begrüßungsnachricht wurde gespeichert!', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Zum Master Panel', callback_data: 'master_panel' }]]
                    }
                });
            }
            return ctx.scene.leave();
        }
        
        await ctx.reply('⚠️ Bitte sende nur Text oder klicke auf Abbrechen.');
    }
);

module.exports = editWelcomeMsgScene;
