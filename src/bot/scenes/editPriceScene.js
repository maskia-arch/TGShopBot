const { Scenes } = require('telegraf');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');
const notificationService = require('../../services/notificationService');
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

const editPriceScene = new Scenes.WizardScene(
    'editPriceScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        const productId = ctx.wizard.state.productId || ctx.scene.state.productId;
        const product = await productRepo.getProductById(productId);
        
        ctx.wizard.state.productId = productId;
        ctx.wizard.state.productName = product.name;
        
        ctx.wizard.state.lastQuestion = `💰 *Preisänderung*\nProdukt: "${product.name}"\nAktuell: ${product.price}€\n\nBitte sende mir den neuen Preis:`;
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelAndLeave(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;
        
        const input = ctx.message.text;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            try { await ctx.deleteMessage(); } catch (e) {}
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, einen Preis zu ändern.\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        const cleanInput = input.replace(',', '.');
        const newPrice = parseFloat(cleanInput);

        if (isNaN(newPrice) || newPrice <= 0) {
            ctx.wizard.state.lastQuestion = '⚠️ Bitte sende eine gültige Zahl (z.B. 12.99):';
            const errorMsg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(errorMsg.message_id);
            return;
        }

        try {
            const productId = ctx.wizard.state.productId;
            const formattedPrice = newPrice.toFixed(2);
            
            const approval = await approvalRepo.createApprovalRequest(
                'PRICE_CHANGE', 
                ctx.from.id, 
                productId, 
                formattedPrice
            );

            const requestedBy = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;

            if (notificationService.notifyMasterApproval) {
                await notificationService.notifyMasterApproval({
                    approvalId: approval ? approval.id : 'NEW',
                    actionType: 'PRICE_CHANGE',
                    productId: productId,
                    productName: ctx.wizard.state.productName,
                    requestedBy: requestedBy,
                    newValue: formattedPrice
                });
            }

            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, `Anfrage für ${ctx.wizard.state.productName} (${formattedPrice}€) gesendet!`, 5);
            
        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, texts.getGeneralError(), 3);
        }
        
        return ctx.scene.leave();
    }
);

module.exports = editPriceScene;
