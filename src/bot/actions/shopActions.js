const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const cartRepo = require('../../database/repositories/cartRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const texts = require('../../utils/texts');
const { isAdmin, isMasterAdmin } = require('../middlewares/auth');

module.exports = (bot) => {

    // ═══ SHOP-MENÜ (Kundenansicht) ═══

    bot.action('shop_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();

            if (!categories || categories.length === 0) {
                return uiHelper.updateOrSend(ctx, '🛍 *Shop*\n\nDerzeit sind keine Produkte verfügbar.', {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]]
                });
            }

            const keyboard = categories.map(c => ([{
                text: `📁 ${c.name}`,
                callback_data: `category_${c.id}`
            }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);

            await uiHelper.updateOrSend(ctx, '🛍 *Shop*\n\nWähle eine Kategorie:', { inline_keyboard: keyboard });
        } catch (error) { console.error('Shop Menu Error:', error.message); }
    });

    // ── Kategorie anzeigen (mit Unterkategorien oder Produkten) ──
    bot.action(/^category_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);

            if (subcats.length > 0) {
                // Hat Unterkategorien → diese anzeigen
                const keyboard = subcats.map(sc => ([{
                    text: `📂 ${sc.name}`,
                    callback_data: `subcategory_${sc.id}`
                }]));

                // Auch Produkte ohne Unterkategorie anzeigen
                const uncategorized = await productRepo.getProductsByCategory(categoryId, false);
                const noSubcatProducts = uncategorized.filter(p => !p.subcategory_id);
                noSubcatProducts.forEach(p => {
                    let label = p.name;
                    if (p.is_out_of_stock) label = `❌ ${label}`;
                    keyboard.push([{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }]);
                });

                keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);
                await uiHelper.updateOrSend(ctx, 'Wähle eine Unterkategorie oder ein Produkt:', { inline_keyboard: keyboard });
            } else {
                // Keine Unterkategorien → Produkte direkt anzeigen
                const products = await productRepo.getProductsByCategory(categoryId, false);
                if (!products || products.length === 0) {
                    return uiHelper.updateOrSend(ctx, 'Diese Kategorie ist aktuell leer.', {
                        inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'shop_menu' }]]
                    });
                }

                const keyboard = products.map(p => {
                    let label = p.name;
                    if (p.is_out_of_stock) label = `❌ ${label}`;
                    return [{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }];
                });
                keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);

                await uiHelper.updateOrSend(ctx, 'Wähle ein Produkt:', { inline_keyboard: keyboard });
            }
        } catch (error) { console.error('Category Error:', error.message); }
    });

    // ── Unterkategorie anzeigen ──
    bot.action(/^subcategory_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const products = await productRepo.getProductsBySubcategory(subcatId, false);

            if (!products || products.length === 0) {
                return uiHelper.updateOrSend(ctx, `📂 *${subcat?.name || 'Unterkategorie'}*\n\nKeine Produkte verfügbar.`, {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: subcat ? `category_${subcat.category_id}` : 'shop_menu' }]]
                });
            }

            const keyboard = products.map(p => {
                let label = p.name;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                return [{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }];
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: subcat ? `category_${subcat.category_id}` : 'shop_menu' }]);

            await uiHelper.updateOrSend(ctx, `📂 *${subcat?.name || ''}*\n\nWähle ein Produkt:`, { inline_keyboard: keyboard });
        } catch (error) { console.error('Subcategory Error:', error.message); }
    });

    // ── Produktdetail ──
    bot.action(/^product_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;

            let text = `*${product.name}*\n\n💰 ${formatters.formatPrice(product.price)}`;
            if (product.is_unit_price) text += ' pro Einheit';
            if (product.description) text += `\n\n📝 ${product.description}`;

            const opt = product.delivery_option || 'none';
            if (opt === 'shipping') text += `\n\n🚚 _Versand erforderlich_`;
            else if (opt === 'pickup') text += `\n\n🏪 _Abholung_`;
            else if (opt === 'both') text += `\n\n🚚🏪 _Versand oder Abholung_`;

            const backCb = product.subcategory_id ? `subcategory_${product.subcategory_id}`
                : product.category_id ? `category_${product.category_id}` : 'shop_menu';

            const keyboard = { inline_keyboard: [] };

            if (!product.is_out_of_stock) {
                keyboard.inline_keyboard.push([{ text: '🛒 In den Warenkorb', callback_data: `add_to_cart_${product.id}` }]);
            } else {
                keyboard.inline_keyboard.push([{ text: '❌ Ausverkauft', callback_data: 'noop' }]);
            }
            keyboard.inline_keyboard.push([{ text: '🔙 Zurück', callback_data: backCb }]);

            if (product.image_url) {
                try {
                    await ctx.replyWithPhoto(product.image_url, {
                        caption: text, parse_mode: 'Markdown', reply_markup: keyboard
                    });
                } catch (e) {
                    await uiHelper.updateOrSend(ctx, text, keyboard);
                }
            } else {
                await uiHelper.updateOrSend(ctx, text, keyboard);
            }
        } catch (error) { console.error('Product Error:', error.message); }
    });

    // ── In den Warenkorb ──
    bot.action(/^add_to_cart_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('askQuantityScene', { productId: ctx.match[1] });
        } catch (error) { console.error(error.message); }
    });

    // ═══ INFO-PANELS ═══

    bot.action('admin_info', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, texts.getAdminInfoText(), {
            inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
        });
    });

    bot.action('master_info', isMasterAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await uiHelper.updateOrSend(ctx, texts.getMasterInfoText(), {
            inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]]
        });
    });

    // ═══ NOOP ═══
    bot.action('noop', async (ctx) => {
        ctx.answerCbQuery('Dieses Produkt ist leider nicht verfügbar.').catch(() => {});
    });
};
