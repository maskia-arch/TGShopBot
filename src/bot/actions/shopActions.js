const productRepo = require('../../database/repositories/productRepo');
const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');

module.exports = (bot) => {
    bot.action('shop_menu', async (ctx) => {
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ text: c.name, callback_data: `category_${c.id}` }]));
            
            // Button für Produkte ohne Kategorie hinzufügen
            keyboard.push([{ text: '📦 Sonstiges / Einzelstücke', callback_data: 'category_none' }]);
            keyboard.push([{ text: '🛒 Warenkorb', callback_data: 'cart_view' }]);

            const text = 'Bitte wähle eine Kategorie:';

            if (ctx.callbackQuery.message.photo) {
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply(text, { reply_markup: { inline_keyboard: keyboard } });
            } else {
                await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
            }
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^category_(.+)$/, async (ctx) => {
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            const allProducts = await productRepo.getProductsByCategory(categoryId);
            const visibleProducts = allProducts.filter(p => p.is_active);

            const keyboard = visibleProducts.map(p => ([{ 
                text: p.is_out_of_stock ? `❌ ${p.name} (Ausverkauft)` : p.name, 
                callback_data: `product_${p.id}` 
            }]));
            
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);

            const text = categoryId === null ? 'Sonstige Produkte:' : 'Verfügbare Produkte:';

            if (ctx.callbackQuery.message.photo) {
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply(text, { reply_markup: { inline_keyboard: keyboard } });
            } else {
                await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
            }
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^product_(.+)$/, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);
            
            let caption = `📦 *${product.name}*\n\n${product.description}\n\nPreis: *${formatters.formatPrice(product.price)}*`;
            if (product.is_unit_price) {
                caption += ' (pro Stück)';
            }

            const keyboard = [];
            if (product.is_out_of_stock) {
                caption += '\n\n⚠️ _Dieses Produkt ist zurzeit leider ausverkauft._';
                keyboard.push([{ text: '❌ Aktuell nicht verfügbar', callback_data: 'noop' }]);
            } else {
                keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            }
            
            // Dynamischer Zurück-Button (entweder zur Kategorie oder zu "none")
            const backTarget = product.category_id ? `category_${product.category_id}` : 'category_none';
            keyboard.push([{ text: '🔙 Zurück', callback_data: backTarget }]);

            if (product.image_url) {
                await ctx.deleteMessage().catch(() => {});
                await ctx.replyWithPhoto(product.image_url, {
                    caption: caption,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                await uiHelper.updateOrSend(ctx, caption, { 
                    inline_keyboard: keyboard,
                    parse_mode: 'Markdown'
                });
            }
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('noop', async (ctx) => {
        await ctx.answerCbQuery('Dieses Produkt ist momentan nicht auf Lager.', { show_alert: true });
    });

    bot.action(/^add_to_cart_(.+)$/, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);

            if (product.is_out_of_stock) {
                return ctx.answerCbQuery('Fehler: Produkt ist mittlerweile ausverkauft.');
            }

            if (product.is_unit_price) {
                return ctx.scene.enter('askQuantityScene', { productId });
            }

            await cartRepo.addToCart(ctx.from.id, productId, 1);
            
            const backTarget = product.category_id ? `category_${product.category_id}` : 'category_none';
            const keyboard = [
                [{ text: '🛍️ Weiter einkaufen', callback_data: backTarget }],
                [{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]
            ];
            
            const text = `✅ ${product.name} wurde zum Warenkorb hinzugefügt.`;

            if (ctx.callbackQuery.message.photo) {
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply(text, { reply_markup: { inline_keyboard: keyboard } });
            } else {
                await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
            }
        } catch (error) {
            console.error(error.message);
        }
    });
};
