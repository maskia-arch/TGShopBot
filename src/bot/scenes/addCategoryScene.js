const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');

const addCategoryScene = new Scenes.WizardScene(
    'addCategoryScene',
    async (ctx) => {
        // Wir speichern die IDs der Nachrichten, um sie später zu löschen
        ctx.wizard.state.messagesToDelete = [];
        
        const msg = await ctx.reply('📂 *Neue Kategorie*\nBitte sende mir den Namen der Kategorie:');
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        
        // Die Antwort des Users ebenfalls zum Löschen vormerken
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        const name = ctx.message.text;
        
        try {
            await productRepo.addCategory(name);
            
            // Alle gesammelten Nachrichten löschen
            for (const msgId of ctx.wizard.state.messagesToDelete) {
                ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
            }
            
            // Kurze Erfolgsmeldung, die von selbst verschwindet
            await uiHelper.sendTemporary(ctx, `Kategorie "${name}" erstellt!`, 3);
            
            // Zurück zum Admin-Menü triggern
            return ctx.scene.enter('admin_panel_scene_trigger'); // Falls vorhanden, sonst manueller Aufruf:
        } catch (error) {
            console.error(error.message);
            await uiHelper.sendTemporary(ctx, 'Fehler beim Erstellen!', 3);
        }
        
        // Aufräumen und Szene verlassen
        return ctx.scene.leave();
    }
);

// Hilfs-Funktion zum sauberen Verlassen der Szene (optional)
addCategoryScene.leave(async (ctx) => {
    // Falls der User die Szene abbricht, löschen wir trotzdem die Fragen
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
    }
});

module.exports = addCategoryScene;
