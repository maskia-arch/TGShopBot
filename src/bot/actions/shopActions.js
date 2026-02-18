const productRepo = require('../../database/repositories/productRepo');
const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const { isAdmin } = require('../middlewares/auth');

module.exports = (bot) => {
    bot.action('shop_menu', async (ctx) => {
        try {
            const allCategories = await productRepo.getActiveCategories();
            const keyboard = [];

            for (const cat of allCategories) {
                const products = await productRepo.getProductsByCategory(cat.id);
                const activeProducts = products.filter(p => p.is_active);
                if (activeProducts.length > 0) {
                    keyboard.push([{ text: cat.name, callback_data: `category_${cat.id}` }]);
                }
            }

            const noneProducts = await productRepo.getProductsByCategory(null);
            const activeNoneProducts = noneProducts.filter(p => p.is_active);
            if (activeNoneProducts.length > 0) {
                keyboard.push([{ text: '📦 Sonstiges / Einzelstücke', callback_data: 'category_none' }]);
            }

            const userIsAdmin = await new Promise(resolve => {
                isAdmin(ctx, () => resolve(true)).catch(() => resolve(false));
            });

            const isTestMode = ctx.callbackQuery.data.includes('admin') || 
                               (ctx.callbackQuery.message.text && ctx.callbackQuery.message.text.includes('Admin'));

            if (userIsAdmin === true && isTestMode) {
                keyboard.push([{ text: '🛠 Zurück zum Admin-Panel', callback_data: 'admin_panel' }]);
            } else {
                keyboard.push([{ text: '🛒 Warenkorb', callback_data: 'cart_view' }]);
            }

            const text = '🛒 *Shop-Menü*\nBitte wähle eine Kategorie:';
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });

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
                text: p.is_out_of_stock ? `❌ ${p.name}` : p.name, 
                callback_data: `product_${p.id}` 
            }]));
            
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);

            const text = categoryId === null ? '*Sonstige Produkte:*' : '*Verfügbare Produkte:*';
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });

        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^product_(.+)$/, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);
            
            let caption = `📦 *${product.name}*\n\n${product.description}\n\nPreis: *${formatters.formatPrice(product.price)}*`;
            if (product.is_unit_price) caption += ' (pro Stück)';

            const keyboard = [];
            if (product.is_out_of_stock) {
                caption += '\n\n⚠️ _Dieses Produkt ist zurzeit leider ausverkauft._';
                keyboard.push([{ text: '❌ Nicht verfügbar', callback_data: 'noop' }]);
            } else {
                keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            }
            
            const backTarget = product.category_id ? `category_${product.category_id}` : 'category_none';
            keyboard.push([{ text: '🔙 Zurück', callback_data: backTarget }]);

            await uiHelper.updateOrSend(ctx, caption, { inline_keyboard: keyboard }, product.image_url);

        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^add_to_cart_(.+)$/, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);

            if (product.is_out_of_stock) {
                return ctx.answerCbQuery('Fehler: Produkt ist ausverkauft.');
            }

            if (product.is_unit_price) {
                return ctx.scene.enter('askQuantityScene', { productId });
            }

            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            await cartRepo.addToCart(ctx.from.id, productId, 1, username);
            
            await uiHelper.sendTemporary(ctx, `✅ ${product.name} im Warenkorb!`, 3);
            await ctx.answerCbQuery('Hinzugefügt!');

        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('noop', async (ctx) => {
        await ctx.answerCbQuery('Dieses Produkt ist momentan nicht auf Lager.', { show_alert: true });
    });
};
