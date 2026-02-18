const { Scenes } = require('telegraf');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
    }
};

const editPriceScene = new Scenes.WizardScene(
    'editPriceScene',
    async (ctx) => {
        // IDs für Aufräumaktion initialisieren
        ctx.wizard.state.messagesToDelete = [];
        const productId = ctx.wizard.state.productId;
        const product = await productRepo.getProductById(productId);
        
        ctx.wizard.state.productName = product.name;
        
        const msg = await ctx.reply(
            `💰 *Preisänderung*\nProdukt: "${product.name}"\nAktuell: ${product.price}€\n\nBitte sende mir den neuen Preis:`, 
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            }
        );
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Abbrechen-Logik
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, 'Vorgang abgebrochen.', 2);
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        const input = ctx.message.text.replace(',', '.');
        const newPrice = parseFloat(input);

        if (isNaN(newPrice) || newPrice <= 0) {
            const errorMsg = await ctx.reply('⚠️ Bitte sende eine gültige Zahl (z.B. 12.99):');
            ctx.wizard.state.messagesToDelete.push(errorMsg.message_id);
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

            // Alles aufräumen
            await cleanup(ctx);
            
            // Dezente Bestätigung
            await uiHelper.sendTemporary(
                ctx, 
                `Anfrage für ${ctx.wizard.state.productName} (${newPrice.toFixed(2)}€) gesendet!`, 
                5
            );
            
            await ctx.answerCbQuery('✅ Anfrage an Master gesendet');
        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '❌ Fehler beim Senden der Anfrage.', 3);
        }
        return ctx.scene.leave();
    }
);

module.exports = editPriceScene;
