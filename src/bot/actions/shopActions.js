const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const texts = require('../../utils/texts');
const masterMenu = require('../keyboards/masterMenu');
const adminMenu = require('../keyboards/adminMenu');
const customerMenu = require('../keyboards/customerMenu');
const config = require('../../config');

module.exports = (bot) => {

    // ═══ ZURÜCK ZUM HAUPTMENÜ ═══
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
                keyboard = adminMenu();
            } else {
                const hasOrders = await orderRepo.hasActiveOrders(userId);
                text = texts.getWelcomeText(false, 'customer');
                keyboard = customerMenu(hasOrders);
            }

            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Back to Main Error:', error.message);
        }
    });

    // ═══ HILFE & INFO ═══
    bot.action('help_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.reply(texts.getHelpText(), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]]
                }
            });
        } catch (error) {
            console.error('Help Menu Error:', error.message);
        }
    });

    // ═══ SHOP-MENÜ ═══
    bot.action('shop_menu', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();

            if (!categories || categories.length === 0) {
                return ctx.reply('🛍 *Shop*\n\nDerzeit sind keine Produkte verfügbar.', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] }
                });
            }

            const keyboard = categories.map(c => ([{
                text: `📁 ${c.name}`,
                callback_data: `category_${c.id}`
            }]));
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);

            await ctx.reply('🛍 *Shop*\n\nWähle eine Kategorie:', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) { console.error('Shop Menu Error:', error.message); }
    });

    // ── Kategorie anzeigen ──
    bot.action(/^category_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);

            if (subcats.length > 0) {
                const keyboard = subcats.map(sc => ([{
                    text: `📂 ${sc.name}`,
                    callback_data: `subcategory_${sc.id}`
                }]));

                const uncategorized = await productRepo.getProductsByCategory(categoryId, false);
                const noSubcatProducts = uncategorized.filter(p => !p.subcategory_id);
                noSubcatProducts.forEach(p => {
                    let label = p.name;
                    if (p.is_out_of_stock) label = `❌ ${label}`;
                    keyboard.push([{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }]);
                });

                keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);
                await ctx.reply('Wähle eine Unterkategorie oder ein Produkt:', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                const products = await productRepo.getProductsByCategory(categoryId, false);
                if (!products || products.length === 0) {
                    return ctx.reply('Diese Kategorie ist aktuell leer.', {
                        reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'shop_menu' }]] }
                    });
                }

                const keyboard = products.map(p => {
                    let label = p.name;
                    if (p.is_out_of_stock) label = `❌ ${label}`;
                    return [{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }];
                });
                keyboard.push([{ text: '🔙 Zurück', callback_data: 'shop_menu' }]);

                await ctx.reply('Wähle ein Produkt:', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
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
                return ctx.reply(`📂 *${subcat?.name || 'Unterkategorie'}*\n\nKeine Produkte verfügbar.`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: subcat ? `category_${subcat.category_id}` : 'shop_menu' }]] }
                });
            }

            const keyboard = products.map(p => {
                let label = p.name;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                return [{ text: `${label} – ${formatters.formatPrice(p.price)}`, callback_data: `product_${p.id}` }];
            });
            keyboard.push([{ text: '🔙 Zurück', callback_data: subcat ? `category_${subcat.category_id}` : 'shop_menu' }]);

            await ctx.reply(`📂 *${subcat?.name || ''}*\n\nWähle ein Produkt:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
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
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                }
            } else {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
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

    bot.action('admin_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await ctx.reply(texts.getAdminInfoText(), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]] }
        });
    });

    bot.action('master_info', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        await ctx.reply(texts.getMasterInfoText(), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'master_panel' }]] }
        });
    });

    // ═══ NOOP ═══
    bot.action('noop', async (ctx) => {
        ctx.answerCbQuery('Dieses Produkt ist leider nicht verfügbar.').catch(() => {});
    });

    // ═══ MASTER ACK (Benachrichtigung gelesen) ═══
    bot.action('master_ack_msg', async (ctx) => {
        ctx.answerCbQuery('✅ Gelesen').catch(() => {});
        try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (e) {}
    });
};
