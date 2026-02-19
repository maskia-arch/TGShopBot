const { Scenes } = require('telegraf');
const notificationService = require('../../services/notificationService');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const cancelAndLeave = async (ctx) => {
    await cleanup(ctx);
    await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
    return ctx.scene.leave();
};

const broadcastScene = new Scenes.WizardScene(
    'broadcastScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '📢 *Broadcast-Modus*\n\nBitte sende mir jetzt den Text für die Push-Nachricht.\n\n_Hinweis: Markdown wird unterstützt. Der Versand erfolgt an alle registrierten Kunden._';
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_broadcast' }]]
            }
        });
        
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_broadcast') {
            await ctx.answerCbQuery('Broadcast abgebrochen');
            return cancelAndLeave(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            try { await ctx.deleteMessage(); } catch (e) {}
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, einen Broadcast zu erstellen.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_broadcast' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        ctx.wizard.state.broadcastText = input;
        const previewText = `📝 *Vorschau deiner Nachricht:*\n\n---\n${input}\n---\n\n*Möchtest du diese Nachricht jetzt an alle Kunden senden?*`;
        ctx.wizard.state.lastQuestion = previewText;

        const msg = await ctx.reply(previewText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Jetzt senden', callback_data: 'confirm_send' }],
                    [{ text: '✏️ Korrigieren', callback_data: 'retry_broadcast' }],
                    [{ text: '❌ Abbrechen', callback_data: 'cancel_broadcast' }]
                ]
            }
        });
        
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        const action = ctx.callbackQuery?.data;

        if (action === 'cancel_broadcast') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelAndLeave(ctx);
        }

        if (action === 'retry_broadcast') {
            await ctx.answerCbQuery('Eingabe wiederholen');
            await cleanup(ctx);
            
            ctx.wizard.state.messagesToDelete = [];
            ctx.wizard.state.lastQuestion = '📢 *Broadcast-Modus*\n\nBitte sende mir jetzt den *neuen Text* für die Push-Nachricht:';
            
            const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_broadcast' }]]
                }
            });
            
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return ctx.wizard.selectStep(1);
        }

        if (action === 'confirm_send') {
            await ctx.answerCbQuery('Versand gestartet...');
            await notificationService.sendBroadcast(ctx.wizard.state.broadcastText, ctx.from.id);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '✅ Broadcast wurde erfolgreich versendet! Den Report findest du in deinen privaten Nachrichten.', 5);
            return ctx.scene.leave();
        }

        if (ctx.message && ctx.message.text) {
            ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
            const input = ctx.message.text;
            
            if (input.startsWith('/')) {
                try { await ctx.deleteMessage(); } catch (e) {}
            }
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nBitte nutze die Buttons unter der Vorschau.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Jetzt senden', callback_data: 'confirm_send' }],
                        [{ text: '✏️ Korrigieren', callback_data: 'retry_broadcast' }],
                        [{ text: '❌ Abbrechen', callback_data: 'cancel_broadcast' }]
                    ]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }
    }
);

module.exports = broadcastScene;
