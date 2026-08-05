const { Scenes } = require('telegraf');
const cartRepo = require('../../database/repositories/cartRepo');
const texts = require('../../utils/texts');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const askQuantityScene = new Scenes.WizardScene(
    'askQuantityScene',
    async (ctx) => {
        ctx.wizard.state.productId = ctx.scene.state.productId;
        ctx.wizard.state.categoryPath = ctx.scene.state.categoryPath || null;
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.lastQuestion = '🔢 *Menge wählen*\n\nBitte gib die gewünschte Menge als Zahl ein:';

        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            await cleanup(ctx);
            
            const productId = ctx.wizard.state.productId;
            ctx.update.callback_query = { data: `product_${productId}`, from: ctx.from };
            
            return ctx.scene.leave();
        }

        if (!ctx.message || !ctx.message.text) return;
        
        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        const quantity = parseInt(input, 10);

        if (isNaN(quantity) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
            const errorMsg = await ctx.reply('⚠️ Bitte gib eine gültige Zahl zwischen 1 und 1000 ein (z.B. 5):', {
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene', style: 'danger' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(errorMsg.message_id);
            return;
        }

        try {
            const productId = ctx.wizard.state.productId;
            const categoryPath = ctx.wizard.state.categoryPath;
            const username = ctx.from.username || ctx.from.first_name || 'Kunde';

            const productRepo = require('../../database/repositories/productRepo');
            const deliverableRepo = require('../../database/repositories/deliverableRepo');

            const product = await productRepo.getProductById(productId).catch(() => null);
            if (!product || !product.is_active) {
                await cleanup(ctx);
                await ctx.reply('⚠️ Das Produkt ist derzeit nicht verfügbar.');
                return ctx.scene.leave();
            }

            const availableCount = await deliverableRepo.getAvailableCount(productId);
            const userCart = await cartRepo.getCart(ctx.from.id).catch(() => []);
            const existingCartItem = userCart.find(item => item.products && String(item.products.id) === String(productId));
            const existingCartQty = existingCartItem ? existingCartItem.quantity : 0;

            // Prüfe Tresor-Vorrat falls Vorräte vorhanden oder digitales Produkt
            if (availableCount > 0 || product.delivery_option === 'none' || !product.delivery_option) {
                if (availableCount === 0) {
                    await productRepo.toggleProductStatus(productId, 'is_out_of_stock', true).catch(() => {});
                    await cleanup(ctx);
                    await ctx.reply(`⚠️ Das Produkt *"${product.name}"* ist derzeit ausverkauft.`, { parse_mode: 'Markdown' });
                    return ctx.scene.leave();
                }

                if (existingCartQty >= availableCount) {
                    await cleanup(ctx);
                    await ctx.reply(`⚠️ Du hast bereits die maximal verfügbare Menge (*${availableCount} Stück*) von *"${product.name}"* in deinem Warenkorb.`, { parse_mode: 'Markdown' });
                    return ctx.scene.leave();
                }

                if (existingCartQty + quantity > availableCount) {
                    const maxCanAdd = availableCount - existingCartQty;
                    await cartRepo.addToCart(ctx.from.id, productId, maxCanAdd, username, categoryPath);
                    await cleanup(ctx);

                    await ctx.reply(`⚠️ *Bestellmenge angepasst (Maximaler Vorrat)*\n\nVon *"${product.name}"* sind derzeit nur noch *${availableCount} Stück* auf Lager.\n(Du hattest bereits ${existingCartQty}x im Warenkorb)\n\nEs wurden *${maxCanAdd} Stück* zum Warenkorb hinzugefügt.`, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view', style: 'success' }],
                                [{ text: '🛍 Weiter einkaufen', callback_data: 'shop_menu', style: 'primary' }]
                            ]
                        }
                    });
                    return ctx.scene.leave();
                }
            }
            
            await cartRepo.addToCart(ctx.from.id, productId, quantity, username, categoryPath);
            await cleanup(ctx);
            
            await ctx.reply(`✅ *${quantity}x zum Warenkorb hinzugefügt!*`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view', style: 'success' }],
                        [{ text: '🛍 Weiter einkaufen', callback_data: 'shop_menu', style: 'primary' }]
                    ]
                }
            });

            return ctx.scene.leave();
        } catch (error) {
            console.error('AskQuantity Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

askQuantityScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    await cleanup(ctx);
    await ctx.scene.leave();
});

module.exports = askQuantityScene;
