const { Scenes } = require('telegraf');
const approvalRepo = require('../../database/repositories/approvalRepo');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');
const notificationService = require('../../services/notificationService');
const texts = require('../../utils/texts');
const config = require('../../config');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const backToProduct = async (ctx) => {
    await cleanup(ctx);
    const productId = ctx.wizard.state.productId;
    ctx.update.callback_query = { data: `admin_edit_prod_${productId}`, from: ctx.from };
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
        ctx.wizard.state.lastQuestion = `💰 *Preisänderung*\n\nProdukt: "${product.name}"\nAktuell: ${product.price.toFixed(2)}€\n\nBitte sende mir den neuen Preis:`;
        
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
            return backToProduct(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;
        
        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        const newPrice = parseFloat(input.replace(',', '.'));

        if (isNaN(newPrice) || newPrice <= 0) {
            const errorMsg = await ctx.reply('⚠️ Bitte sende eine gültige Zahl (z.B. 12.99):', {
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
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);

            if (isMaster) {
                if (typeof productRepo.updateProductPrice === 'function') {
                    await productRepo.updateProductPrice(productId, newPrice);
                } else if (typeof productRepo.updateProduct === 'function') {
                    await productRepo.updateProduct(productId, { price: newPrice });
                } else {
                    const supabase = require('../../database/supabaseClient');
                    await supabase.from('products').update({ price: newPrice }).eq('id', productId);
                }

                await cleanup(ctx);
                await ctx.reply(`✅ Preis für "${ctx.wizard.state.productName}" wurde sofort auf ${formattedPrice}€ geändert.`);
                return backToProduct(ctx);
            }
            
            const approval = await approvalRepo.createApprovalRequest(
                'PRICE_CHANGE', 
                ctx.from.id, 
                productId, 
                formattedPrice
            );

            if (notificationService.notifyMasterApproval) {
                notificationService.notifyMasterApproval({
                    approvalId: approval.id,
                    actionType: 'PRICE_CHANGE',
                    productId: productId,
                    productName: ctx.wizard.state.productName,
                    requestedBy: ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`,
                    newValue: formattedPrice
                }).catch(() => {});
            }

            await cleanup(ctx);
            await ctx.reply(`✅ Anfrage für "${ctx.wizard.state.productName}" (${formattedPrice}€) wurde an den Master gesendet.`);
            
            return backToProduct(ctx);
        } catch (error) {
            console.error('EditPrice Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

editPriceScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return backToProduct(ctx);
});

module.exports = editPriceScene;
