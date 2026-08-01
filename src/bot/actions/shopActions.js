/**
 * shopActions.js – v0.5.64
 * 
 * Shop-Aktionen mit flicker-freier Medien-Anzeige via editMessageMedia.
 * Verwendet showProductWithMedia für intelligente Media/Text-Übergänge.
 */

const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const texts = require('../../utils/texts');
const masterMenu = require('../keyboards/masterMenu');
const adminKeyboards = require('../keyboards/adminKeyboards');
const customerMenu = require('../keyboards/customerMenu');
const config = require('../../config');

module.exports = (bot) => {

    bot.action('back_to_main', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);

            await userRepo.upsertUser(userId, ctx.from.username || ctx.from.first_name || 'Kunde');
            const role = await userRepo.getUserRole(userId);

            let text, keyboard;
            if (isMaster) {
                text = texts.getWelcomeText(true, 'master');
                keyboard = masterMenu();
            } else if (role === 'admin') {
                text = texts.getWelcomeText(false, 'admin');
                keyboard = adminKeyboards.getAdminMenu(false);
            } else {
                const hasOrders = await orderRepo.hasActiveOrders(userId);
                text = texts.getWelcomeText(false, 'customer');
                keyboard = customerMenu(hasOrders);
            }

            // Zurück zum Hauptmenü → immer Text (löscht Media-Nachricht falls nötig)
            if (ctx.callbackQuery?.message) {
                const hasMedia = !!(ctx.callbackQuery.message.photo || ctx.callbackQuery.message.animation || ctx.callbackQuery.message.video);
                if (hasMedia) {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                    return;
                }
            }
            await ctx.deleteMessage().catch(() => {});
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Back to Main Error:', error.message);
        }
    });

    bot.action('help_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await uiHelper.updateOrSend(ctx, texts.getHelpText(), {
                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]]
            });
        } catch (error) { console.error(error.message); }
    });

    bot.action('shop_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const text = '🛍 *Shop*\n\nWähle eine Kategorie:';
            
            if (!categories || categories.length === 0) {
                const emptyText = '🛍 *Shop*\n\nDerzeit sind keine Produkte verfügbar.';
                const emptyKb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] };
                return await uiHelper.updateOrSend(ctx, emptyText, emptyKb);
            }

            const keyboard = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `category_${c.id}` }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);

            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^category_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            let keyboard = [];
            const text = 'Wähle eine Option:';

            if (subcats.length > 0) {
                subcats.forEach(sc => keyboard.push([{ text: `📂 ${sc.name}`, callback_data: `subcategory_${sc.id}` }]));
                const uncategorized = await productRepo.getProductsByCategory(categoryId, false);
                const noSubcatProducts = uncategorized.filter(p => !p.subcategory_id);
                noSubcatProducts.forEach(p => {
                    let label = p.is_out_of_stock ? `❌ ${p.name}` : p.name;
                    keyboard.push([{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }]);
                });
            } else {
                const products = await productRepo.getProductsByCategory(categoryId, false);
                if (!products || products.length === 0) {
                    const emptyText = 'Diese Kategorie ist aktuell leer.';
                    const emptyKb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'shop_menu' }]] };
                    return await uiHelper.updateOrSend(ctx, emptyText, emptyKb);
                }
                products.forEach(p => {
                    let label = p.is_out_of_stock ? `❌ ${p.name}` : p.name;
                    keyboard.push([{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }]);
                });
            }
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);
            
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^subcategory_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const products = await productRepo.getProductsBySubcategory(subcatId, false);
            const backCb = subcat ? `category_${subcat.category_id}` : 'shop_menu';

            if (!products || products.length === 0) {
                const emptyText = 'Keine Produkte verfügbar.';
                const emptyKb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: backCb }]] };
                return await uiHelper.updateOrSend(ctx, emptyText, emptyKb);
            }

            const keyboard = products.map(p => {
                let label = p.is_out_of_stock ? `❌ ${p.name}` : p.name;
                return [{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }];
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: backCb }]);
            
            const title = `📂 *${subcat ? subcat.name : ''}*`;
            await uiHelper.updateOrSend(ctx, title, { inline_keyboard: keyboard });
        } catch (error) { console.error(error.message); }
    });

    // ─── PRODUKT-DETAIL MIT INTELLIGENTER MEDIEN-ANZEIGE ───────────────────
    bot.action(/^product_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;

            let path = '';
            try {
                if (product.category_id) {
                    const categories = await productRepo.getActiveCategories();
                    const cat = categories.find(c => String(c.id) === String(product.category_id));
                    path = cat ? cat.name : '';
                    if (product.subcategory_id) {
                        const subcat = await subcategoryRepo.getSubcategoryById(product.subcategory_id);
                        if (subcat) path += ` » ${subcat.name}`;
                    }
                }
            } catch (e) {}

            let text = `*${product.name}*\n`;
            if (path) text += `_In: ${path}_\n`;
            text += `\n💰 ${formatters.formatPrice(product.price)}`;
            if (product.description) text += `\n\n📝 ${product.description}`;
            
            const backCb = product.subcategory_id 
                ? `subcategory_${product.subcategory_id}` 
                : (product.category_id ? `category_${product.category_id}` : 'shop_menu');
            
            const keyboard = { inline_keyboard: [] };
            if (!product.is_out_of_stock) {
                keyboard.inline_keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            } else {
                keyboard.inline_keyboard.push([{ text: '❌ Ausverkauft', callback_data: 'noop' }]);
            }
            keyboard.inline_keyboard.push([{ text: '🔙 Zurück', callback_data: backCb }]);

            // Intelligente Media-Anzeige: editMessageMedia wenn möglich, sonst delete+send
            await uiHelper.showProductWithMedia(ctx, product.image_url, text, keyboard);
        } catch (error) { console.error(error.message); }
    });

    bot.action(/^add_to_cart_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            let path = '';
            
            if (product) {
                try {
                    const categories = await productRepo.getActiveCategories();
                    const cat = categories.find(c => String(c.id) === String(product.category_id));
                    path = cat ? cat.name : '';
                    
                    if (product.subcategory_id) {
                        const subcat = await subcategoryRepo.getSubcategoryById(product.subcategory_id);
                        if (subcat) path += ` » ${subcat.name}`;
                    }
                } catch (e) {}
            }
            
            await ctx.scene.enter('askQuantityScene', { productId: ctx.match[1], categoryPath: path }); 
        } 
        catch (error) { console.error(error.message); }
    });

    bot.action('admin_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, texts.getAdminInfoText(), adminKeyboards.getBackToAdminPanel());
    });

    bot.action('master_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, texts.getMasterInfoText(), 
            { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]] });
    });

    bot.action('noop', async (ctx) => {
        ctx.answerCbQuery('Dieses Produkt ist leider nicht verfügbar.').catch(() => {});
    });
};
