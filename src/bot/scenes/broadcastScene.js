const { Scenes } = require('telegraf');
const notificationService = require('../../services/notificationService');
const uiHelper = require('../../utils/uiHelper');

/**
 * Szene für den Versand von Rundnachrichten (Broadcast)
 * Führt den Admin durch Erstellung, Vorschau und Versand.
 */
const broadcastScene = new Scenes.WizardScene(
    'broadcastScene',
    // Schritt 1: Text abfragen
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        const text = '📢 *Broadcast-Modus*\n\nBitte sende mir jetzt den Text für die Push-Nachricht.\n\n_Hinweis: Markdown wird unterstützt. Der Versand erfolgt an alle registrierten Kunden._';
        
        const msg = await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_broadcast' }]]
            }
        });
        
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    // Schritt 2: Vorschau und Bestätigung
    async (ctx) => {
        // Abbruch über Button
        if (ctx.callbackQuery?.data === 'cancel_broadcast') {
            await ctx.answerCbQuery('Broadcast abgebrochen');
            return ctx.scene.leave();
        }

        // Validierung: Nur Textnachrichten erlauben
        if (!ctx.message || !ctx.message.text) {
            const warning = await ctx.reply('⚠️ Bitte sende einen gültigen Text.');
            ctx.wizard.state.messagesToDelete.push(warning.message_id);
            return;
        }

        ctx.wizard.state.broadcastText = ctx.message.text;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        const previewText = `📝 *Vorschau deiner Nachricht:*\n\n---\n${ctx.message.text}\n---\n\n*Möchtest du diese Nachricht jetzt an alle Kunden senden?*`;

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
    // Schritt 3: Versand ausführen
    async (ctx) => {
        const action = ctx.callbackQuery?.data;

        if (action === 'retry_broadcast') {
            // Zurück zum ersten Schritt (Textabfrage)
            await ctx.answerCbQuery('Eingabe wiederholen');
            return ctx.wizard.selectStep(0);
        }

        if (action === 'confirm_send') {
            await ctx.answerCbQuery('Versand gestartet...');
            
            // Aufruf des Notification Services
            await notificationService.sendBroadcast(ctx.wizard.state.broadcastText, ctx.from.id);
            
            await uiHelper.sendTemporary(ctx, 'Broadcast wurde erfolgreich versendet! Den Report findest du in deinen privaten Nachrichten.', 5);
        } else {
            await ctx.answerCbQuery('Vorgang beendet');
        }

        // Automatischer Cleanup der Wizard-Nachrichten für Chat-Hygiene
        for (const id of ctx.wizard.state.messagesToDelete) {
            ctx.telegram.deleteMessage(ctx.chat.id, id).catch(() => {});
        }
        
        return ctx.scene.leave();
    }
);

module.exports = broadcastScene;
