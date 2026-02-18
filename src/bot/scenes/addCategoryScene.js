const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');

const addCategoryScene = new Scenes.WizardScene(
    'addCategoryScene',
    async (ctx) => {
        await ctx.reply('Bitte sende den Namen der neuen Kategorie:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        const name = ctx.message.text;
        
        try {
            await productRepo.addCategory(name);
            await ctx.reply(`✅ Kategorie "${name}" wurde erfolgreich erstellt!`);
        } catch (error) {
            console.error(error.message);
            await ctx.reply('Fehler beim Erstellen der Kategorie.');
        }
        return ctx.scene.leave();
    }
);

module.exports = addCategoryScene;
