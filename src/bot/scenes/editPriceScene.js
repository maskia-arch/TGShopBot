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
        ctx.wizard.state.currentPrice = product.price;
        ctx.wizard.state.lastQuestion = `💰 *Preisänderung*\n\nProdukt: *${product.name}*\nAktuell: ${product.price.toFixed(2)}€\n\nBitte sende mir den neuen Preis:`;

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
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            return backToProduct(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(ctx.wizard.state.lastQuestion, {
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
            const errorMsg = await ctx.reply('⚠️ Ungültiger Preis. Bitte eine Zahl wie z.B. 12.99 eingeben:', {
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
                // Master ändert Preis sofort
                await productRepo.updateProductPrice(productId, newPrice);
                await cleanup(ctx);
                await ctx.reply(`✅ Preis für *${ctx.wizard.state.productName}* wurde auf ${formattedPrice}€ geändert.`, { parse_mode: 'Markdown' });
                return backToProduct(ctx);
            }

            // Temporärer Admin → Anfrage an Master via approval
            const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
            const approval = await approvalRepo.createApproval(productId, 'PRICE_CHANGE', formattedPrice, adminName);

            // Master benachrichtigen
            const text = `💰 *PREISÄNDERUNGS-ANFRAGE*\n\n` +
                `👤 Admin: ${adminName}\n` +
                `📦 Produkt: *${ctx.wizard.state.productName}*\n` +
                `💲 Aktuell: ${ctx.wizard.state.currentPrice?.toFixed(2) || '?'}€\n` +
                `💲 Neu: ${formattedPrice}€\n\n` +
                `Bitte Anfrage prüfen und genehmigen oder ablehnen.`;
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✅ Genehmigen', callback_data: `master_approve_${approval.id}` }],
                    [{ text: '❌ Ablehnen', callback_data: `master_reject_appr_${approval.id}` }]
                ]
            };
            notificationService.sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});

            await cleanup(ctx);
            await ctx.reply(`📨 Anfrage für *${ctx.wizard.state.productName}* (${formattedPrice}€) wurde an den Master gesendet.`, { parse_mode: 'Markdown' });
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
    await ctx.answerCbQuery('Abgebrochen').catch(() => {});
    return backToProduct(ctx);
});

module.exports = editPriceScene;
