const { Scenes } = require('telegraf');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');

const editPriceScene = new Scenes.WizardScene(
    'editPriceScene',
    async (ctx) => {
        const productId = ctx.wizard.state.productId;
        const product = await productRepo.getProductById(productId);
        
        ctx.wizard.state.productName = product.name;
        
        await ctx.reply(`💰 Neuer Preis für "${product.name}"\n\nAktueller Preis: ${product.price}€\n\nBitte sende mir nun den neuen Preis (nur die Zahl, z.B. 24.50):`, {
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await ctx.reply('Vorgang abgebrochen.');
            return ctx.scene.leave();
        }

        const input = ctx.message ? ctx.message.text.replace(',', '.') : null;
        const newPrice = parseFloat(input);

        if (isNaN(newPrice) || newPrice <= 0) {
            await ctx.reply('⚠️ Ungültiger Preis. Bitte sende eine positive Zahl (z.B. 12.99):');
            return;
        }

        try {
            const productId = ctx.wizard.state.productId;
            await approvalRepo.createApprovalRequest(
                'PRICE_CHANGE', 
                ctx.from.id, 
                productId, 
                newPrice.toFixed(2)
            );

            await ctx.reply(`✅ Anfrage gesendet!\n\nDer Master Admin muss die Preisänderung von ${newPrice.toFixed(2)}€ für "${ctx.wizard.state.productName}" noch bestätigen.`);
            return ctx.scene.leave();
        } catch (error) {
            console.error(error.message);
            await ctx.reply('Fehler beim Erstellen der Anfrage.');
            return ctx.scene.leave();
        }
    }
);

module.exports = editPriceScene;
