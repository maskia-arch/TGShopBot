const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');

const renameCategoryScene = new Scenes.WizardScene(
    'renameCategoryScene',
    async (ctx) => {
        ctx.wizard.state.categoryId = ctx.scene.state.categoryId;
        await ctx.reply('Bitte sende den neuen Namen für die Kategorie:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        const newName = ctx.message.text;
        
        try {
            await productRepo.renameCategory(ctx.wizard.state.categoryId, newName);
            await ctx.reply(`✅ Kategorie erfolgreich in "${newName}" umbenannt!`);
        } catch (error) {
            console.error(error.message);
            await ctx.reply('Fehler beim Umbenennen.');
        }
        return ctx.scene.leave();
    }
);

module.exports = renameCategoryScene;
