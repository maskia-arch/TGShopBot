const productRepo = require('../../database/repositories/productRepo');
const cartRepo = require('../../database/repositories/cartRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const config = require('../../config');
const texts = require('../../utils/texts');
const { isAdmin } = require('../middlewares/auth');

const masterMenu = require('../keyboards/masterMenu');
const adminMenu = require('../keyboards/adminMenu');
const customerMenu = require('../keyboards/customerMenu');

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
                               (ctx.callbackQuery.message && ctx.callbackQuery.message.text && ctx.callbackQuery.message.text.includes('Admin'));

            if (userIsAdmin === true && isTestMode) {
                keyboard.push([{ text: '🛠 Zurück zum Admin-Panel', callback_data: 'admin_panel' }]);
            } else {
                keyboard.push([{ text: '🛒 Warenkorb', callback_data: 'cart_view' }]);
                keyboard.push([{ text: '🔙 Zurück zum Hauptmenü', callback_data: 'back_to_main' }]);
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

            const cart = await cartRepo.getCart(ctx.from.id);
            if (cart && cart.length > 0) {
                keyboard.push([{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]);
            }

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
                caption += `\n\n${texts.getOutOfStockError()}`;
                keyboard.push([{ text: '❌ Nicht verfügbar', callback_data: 'noop' }]);
            } else {
                keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            }
            
            const backTarget = product.category_id ? `category_${product.category_id}` : 'category_none';
            keyboard.push([{ text: '🔙 Zurück', callback_data: backTarget }]);

            const cart = await cartRepo.getCart(ctx.from.id);
            if (cart && cart.length > 0) {
                keyboard.push([{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]);
            }

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
                return ctx.answerCbQuery(texts.getOutOfStockError());
            }

            if (product.is_unit_price) {
                return ctx.scene.enter('askQuantityScene', { productId });
            }

            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            await cartRepo.addToCart(ctx.from.id, productId, 1, username);
            
            await uiHelper.sendTemporary(ctx, texts.getAddToCartSuccess(product.name), 3);
            await ctx.answerCbQuery('Hinzugefügt!');

            ctx.match = [null, productId];
            bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: `product_${productId}` } });

        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('noop', async (ctx) => {
        await ctx.answerCbQuery(texts.getOutOfStockError().replace(/⚠️\s*/, ''), { show_alert: true });
    });

    bot.action('back_to_main', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            const text = texts.getWelcomeText(isMaster, role);
            let keyboard;

            if (isMaster) keyboard = masterMenu();
            else if (role === 'admin') keyboard = adminMenu();
            else keyboard = customerMenu();

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^(info|help|info_menu|help_menu)$/, async (ctx) => {
        try {
            const keyboard = {
                inline_keyboard: [[{ text: '🔙 Zurück zum Hauptmenü', callback_data: 'back_to_main' }]]
            };
            await uiHelper.updateOrSend(ctx, texts.getHelpText(), keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });
};
