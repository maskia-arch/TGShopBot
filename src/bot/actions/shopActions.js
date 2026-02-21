const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const cartRepo = require('../../database/repositories/cartRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const config = require('../../config');
const texts = require('../../utils/texts');

const masterMenu = require('../keyboards/masterMenu');
const adminMenu = require('../keyboards/adminMenu');
const customerMenu = require('../keyboards/customerMenu');

module.exports = (bot) => {
    bot.action('shop_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});

        try {
            const userId = ctx.from.id;
            
            const [allCategories, role, noneProducts] = await Promise.all([
                productRepo.getActiveCategories(),
                userRepo.getUserRole(userId),
                productRepo.getProductsByCategory(null)
            ]);

            const keyboard = [];

            const categoryChecks = await Promise.all(allCategories.map(async (cat) => {
                const products = await productRepo.getProductsByCategory(cat.id);
                const subcats = await subcategoryRepo.getSubcategoriesByCategory(cat.id).catch(() => []);
                return (products.some(p => p.is_active) || subcats.length > 0) ? cat : null;
            }));

            categoryChecks.forEach(cat => {
                if (cat) keyboard.push([{ text: cat.name, callback_data: `category_${cat.id}` }]);
            });

            if (noneProducts.some(p => p.is_active)) {
                keyboard.push([{ text: '📦 Sonstiges / Einzelstücke', callback_data: 'category_none' }]);
            }

            keyboard.push([{ text: '🛒 Warenkorb', callback_data: 'cart_view' }]);
            keyboard.push([{ text: '🔙 Zurück zum Hauptmenü', callback_data: 'back_to_main' }]);

            await uiHelper.updateOrSend(ctx, '🛒 *Shop-Menü*\nBitte wähle eine Kategorie:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^category_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            
            // Unterkategorien prüfen
            let subcategories = [];
            if (categoryId) {
                subcategories = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            }

            if (subcategories.length > 0) {
                // Unterkategorien anzeigen
                const keyboard = subcategories.map(sc => ([{
                    text: sc.name,
                    callback_data: `subcategory_${sc.id}`
                }]));

                // Produkte ohne Unterkategorie in dieser Kategorie
                const uncategorized = await productRepo.getProductsByCategory(categoryId);
                const directProducts = uncategorized.filter(p => !p.subcategory_id && p.is_active);
                if (directProducts.length > 0) {
                    keyboard.push([{ text: '📦 Weitere Produkte', callback_data: `subcat_direct_${categoryId}` }]);
                }

                keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);
                await uiHelper.updateOrSend(ctx, '*Unterkategorien:*', { inline_keyboard: keyboard });
                return;
            }

            // Keine Unterkategorien → direkt Produkte zeigen
            const allProducts = await productRepo.getProductsByCategory(categoryId);
            const visibleProducts = allProducts.filter(p => p.is_active);
            const cart = await cartRepo.getCart(ctx.from.id);

            const keyboard = visibleProducts.map(p => ([{ 
                text: p.is_out_of_stock ? `❌ ${p.name}` : p.name, 
                callback_data: `product_${p.id}` 
            }]));
            
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);
            if (cart && cart.length > 0) {
                keyboard.push([{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]);
            }

            const text = categoryId === null ? '*Sonstige Produkte:*' : '*Verfügbare Produkte:*';
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^subcategory_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const products = await productRepo.getProductsBySubcategory(subcatId);
            const visibleProducts = products.filter(p => p.is_active);
            const cart = await cartRepo.getCart(ctx.from.id);

            const subcat = await subcategoryRepo.getSubcategoryById(subcatId).catch(() => null);
            const parentCatId = subcat ? subcat.category_id : null;

            const keyboard = visibleProducts.map(p => ([{
                text: p.is_out_of_stock ? `❌ ${p.name}` : p.name,
                callback_data: `product_${p.id}`
            }]));

            keyboard.push([{ text: '🔙 Zurück', callback_data: parentCatId ? `category_${parentCatId}` : 'shop_menu' }]);
            if (cart && cart.length > 0) {
                keyboard.push([{ text: '🛒 Zum Warenkorb', callback_data: 'cart_view' }]);
            }

            await uiHelper.updateOrSend(ctx, `*${subcat ? subcat.name : 'Produkte'}:*`, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^subcat_direct_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const allProducts = await productRepo.getProductsByCategory(categoryId);
            const directProducts = allProducts.filter(p => !p.subcategory_id && p.is_active);

            const keyboard = directProducts.map(p => ([{
                text: p.is_out_of_stock ? `❌ ${p.name}` : p.name,
                callback_data: `product_${p.id}`
            }]));

            keyboard.push([{ text: '🔙 Zurück', callback_data: `category_${categoryId}` }]);
            await uiHelper.updateOrSend(ctx, '*Weitere Produkte:*', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^product_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const [product, cart] = await Promise.all([
                productRepo.getProductById(productId),
                cartRepo.getCart(ctx.from.id)
            ]);
            
            let caption = `📦 *${product.name}*\n\n${product.description}\n\nPreis: *${formatters.formatPrice(product.price)}*`;
            if (product.is_unit_price) caption += ' (pro Stück)';
            if (product.requires_shipping) caption += '\n🚚 _Versand erforderlich_';

            const keyboard = [];
            if (product.is_out_of_stock) {
                caption += `\n\n${texts.getOutOfStockError()}`;
                keyboard.push([{ text: '❌ Nicht verfügbar', callback_data: 'noop' }]);
            } else {
                keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            }
            
            const backTarget = product.subcategory_id ? `subcategory_${product.subcategory_id}` : 
                               product.category_id ? `category_${product.category_id}` : 'category_none';
            keyboard.push([{ text: '🔙 Zurück', callback_data: backTarget }]);

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
                ctx.answerCbQuery().catch(() => {});
                return ctx.scene.enter('askQuantityScene', { productId });
            }

            const username = ctx.from.username || ctx.from.first_name || 'Kunde';
            await cartRepo.addToCart(ctx.from.id, productId, 1, username);
            
            ctx.answerCbQuery('Hinzugefügt!').catch(() => {});
            
            bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: `product_${productId}` } });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('noop', async (ctx) => {
        await ctx.answerCbQuery(texts.getOutOfStockError().replace(/⚠️\s*/, ''), { show_alert: true });
    });

    bot.action('back_to_main', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            const text = texts.getWelcomeText(isMaster, role);
            let keyboard;

            if (isMaster) keyboard = masterMenu();
            else if (role === 'admin') keyboard = adminMenu();
            else {
                const hasOrders = await orderRepo.hasActiveOrders(userId);
                keyboard = customerMenu(hasOrders);
            }

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    // ── Info/Hilfe Panels ──
    bot.action(/^(info|help|info_menu|help_menu)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await uiHelper.updateOrSend(ctx, texts.getHelpText(), {
                inline_keyboard: [[{ text: '🔙 Zurück zum Hauptmenü', callback_data: 'back_to_main' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('admin_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await uiHelper.updateOrSend(ctx, texts.getAdminInfoText(), {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('master_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await uiHelper.updateOrSend(ctx, texts.getMasterInfoText(), {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]]
            });
        } catch (error) {
            console.error(error.message);
        }
    });
};
