const { Scenes } = require('telegraf');
const settingsRepo = require('../../database/repositories/settingsRepo');

const editAbsenceMsgScene = new Scenes.WizardScene(
    'editAbsenceMsgScene',
    async (ctx) => {
        try {
            const currentMsg = await settingsRepo.getAbsenceMessage();
            let text = '📝 *Individuelle Abwesenheitsnachricht bearbeiten*\n\n';
            
            if (currentMsg) {
                text += `Aktuelle Abwesenheitsnachricht:\n_${currentMsg}_\n\n`;
            } else {
                text += `Aktuell ist der Standard-Text gesetzt.\n\n`;
            }
            
            text += 'Bitte sende jetzt den neuen Text für die Abwesenheitsnachricht (oder tippe `Reset`, um auf Standard zurückzusetzen):';

            if (ctx.callbackQuery) {
                await ctx.deleteMessage().catch(() => {});
            }

            const msg = await ctx.reply(text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_edit_absence' }]]
                }
            });
            
            ctx.wizard.state.promptMsgId = msg.message_id;
            return ctx.wizard.next();
        } catch (error) {
            console.error('editAbsenceMsgScene Init Error:', error.message);
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_edit_absence') {
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

            if (input.length > 1000) {
                await ctx.reply('⚠️ Text zu lang (max. 1000 Zeichen). Bitte sende eine kürzere Abwesenheitsnachricht.');
                return;
            }
            
            await ctx.deleteMessage().catch(() => {});
            if (ctx.wizard.state.promptMsgId) {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.wizard.state.promptMsgId).catch(() => {});
            }
            
            if (input.toLowerCase() === 'reset') {
                const defaultMsg = 'Wir befinden uns aktuell im Feierabend. Deine Anfragen und Bestellungen werden während unserer regulären Service-Zeiten umgehend bearbeitet.';
                await settingsRepo.setAbsenceMessage(defaultMsg);
                await ctx.reply('🗑 Die Abwesenheitsnachricht wurde auf den Standardtext zurückgesetzt.', {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Zum Status-Menü', callback_data: 'master_shop_status_hub' }]]
                    }
                });
            } else {
                await settingsRepo.setAbsenceMessage(input);
                await ctx.reply('✅ Die neue Abwesenheitsnachricht wurde gespeichert!', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Zum Status-Menü', callback_data: 'master_shop_status_hub' }]]
                    }
                });
            }
            return ctx.scene.leave();
        }
        
        await ctx.reply('⚠️ Bitte sende nur Text oder klicke auf Abbrechen.');
    }
);

module.exports = editAbsenceMsgScene;
