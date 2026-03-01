const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const userRepo = require('../../database/repositories/userRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const formatters = require('../../utils/formatters');
const config = require('../../config');
const texts = require('../../utils/texts');
const notificationService = require('../../services/notificationService');

module.exports = (bot) => {
    bot.action('admin_panel', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products' }],
                    [{ text: '📁 Kategorien verwalten', callback_data: 'admin_manage_categories' }],
                    [{ text: '📢 Rundnachricht', callback_data: 'admin_start_broadcast' }],
                    [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders' }],
                    [{ text: '👁 Kundenansicht', callback_data: 'shop_menu' }],
                    [{ text: 'ℹ️ Befehle & Info', callback_data: 'admin_info' }]
                ]
            };
            if (isMaster) keyboard.inline_keyboard.unshift([{ text: '👑 Master-Dashboard', callback_data: 'master_panel' }]);
            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(isMaster, role), keyboard);
        } catch (error) { 
            console.error('Admin Panel Error:', error.message); 
        }
    });

    bot.action('admin_start_broadcast', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('broadcastScene'); 
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('admin_manage_categories', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_edit_cat_${c.id}` }]));
            keyboard.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await uiHelper.updateOrSend(ctx, '📁 *Kategorien verwalten*', { inline_keyboard: keyboard });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action('admin_add_category', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('addCategoryScene'); 
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_edit_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const category = categories.find(c => c.id == categoryId);
            if (!category) return;
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            const keyboard = { inline_keyboard: [] };
            if (subcats.length > 0) {
                subcats.forEach(sc => {
                    keyboard.inline_keyboard.push([{ text: `📂 ${sc.name}`, callback_data: `admin_edit_subcat_${sc.id}` }]);
                });
            }
            keyboard.inline_keyboard.push(
                [{ text: '✏️ Namen ändern', callback_data: `admin_rename_cat_${categoryId}` }],
                [{ text: '📂 Unterkategorie hinzufügen', callback_data: `admin_add_subcat_${categoryId}` }],
                [
                    { text: '🔼 Hoch', callback_data: `admin_sort_cat_up_${categoryId}` },
                    { text: '🔽 Runter', callback_data: `admin_sort_cat_down_${categoryId}` }
                ],
                [{ text: '🗑 Löschen', callback_data: `admin_del_cat_${categoryId}` }],
                [{ text: '🔙 Zurück', callback_data: 'admin_manage_categories' }]
            );
            let text = `Kategorie: *${category.name}*`;
            if (subcats.length > 0) text += `\n📂 ${subcats.length} Unterkategorie(n)`;
            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_sort_cat_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const id = ctx.match[2];
            const categories = await productRepo.getActiveCategories();
            const index = categories.findIndex(c => c.id == id);
            if ((direction === 'up' && index > 0) || (direction === 'down' && index < categories.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                await Promise.all(categories.map((cat, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return productRepo.updateCategorySortOrder(cat.id, newOrder);
                }));
                ctx.answerCbQuery('✅').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            ctx.update.callback_query.data = `admin_edit_cat_${id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_rename_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('renameCategoryScene', { categoryId: ctx.match[1] }); 
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_del_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            await productRepo.deleteCategory(ctx.match[1]);
            ctx.answerCbQuery('✅ Gelöscht.').catch(() => {});
            ctx.update.callback_query.data = 'admin_manage_categories';
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_add_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const cat = categories.find(c => c.id == categoryId);
            await ctx.scene.enter('addSubcategoryScene', { categoryId, categoryName: cat ? cat.name : 'Unbekannt' });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_edit_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcat = await subcategoryRepo.getSubcategoryById(ctx.match[1]);
            if (!subcat) return;
            const keyboard = { inline_keyboard: [
                [{ text: '✏️ Umbenennen', callback_data: `admin_rename_subcat_${subcat.id}` }],
                [
                    { text: '🔼 Hoch', callback_data: `admin_sort_subcat_up_${subcat.id}` },
                    { text: '🔽 Runter', callback_data: `admin_sort_subcat_down_${subcat.id}` }
                ],
                [{ text: '🗑 Löschen', callback_data: `admin_del_subcat_${subcat.id}` }],
                [{ text: '🔙 Zurück', callback_data: `admin_edit_cat_${subcat.category_id}` }]
            ]};
            await uiHelper.updateOrSend(ctx, `📂 Unterkategorie: *${subcat.name}*`, keyboard);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_sort_subcat_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const id = ctx.match[2];
            const subcat = await subcategoryRepo.getSubcategoryById(id);
            if (!subcat) return;

            const subcats = await subcategoryRepo.getSubcategoriesByCategory(subcat.category_id);
            const index = subcats.findIndex(sc => sc.id == id);

            if ((direction === 'up' && index > 0) || (direction === 'down' && index < subcats.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                await Promise.all(subcats.map((sc, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return subcategoryRepo.updateSubcategorySortOrder(sc.id, newOrder);
                }));
                ctx.answerCbQuery('✅').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            
            ctx.update.callback_query.data = `admin_edit_subcat_${id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_rename_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('renameSubcategoryScene', { subcategoryId: ctx.match[1] }); 
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_del_subcat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const subcat = await subcategoryRepo.getSubcategoryById(ctx.match[1]);
            await subcategoryRepo.deleteSubcategory(ctx.match[1]);
            ctx.answerCbQuery('✅ Gelöscht.').catch(() => {});
            if (subcat) {
                ctx.update.callback_query.data = `admin_edit_cat_${subcat.category_id}`;
                return bot.handleUpdate(ctx.update);
            }
        } catch (error) { 
            console.error(error.message); 
        }
    });
    bot.action('admin_manage_products', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_prod_cat_${c.id}` }]));
            keyboard.push([{ text: '📦 Kategorielose Produkte', callback_data: 'admin_prod_cat_none' }]);
            keyboard.push([{ text: '➕ Neues Produkt', callback_data: 'admin_add_prod_none' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            await uiHelper.updateOrSend(ctx, '📦 *Produkte verwalten*\n\nWähle eine Kategorie:', { inline_keyboard: keyboard });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_prod_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            const keyboard = [];

            if (categoryId !== null) {
                const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
                subcats.forEach(sc => {
                    keyboard.push([{ text: `📂 ${sc.name}`, callback_data: `admin_prod_subcat_${sc.id}` }]);
                });
            }

            const allProducts = await productRepo.getProductsByCategory(categoryId, true);
            const directProducts = categoryId === null ? allProducts : allProducts.filter(p => !p.subcategory_id);

            directProducts.forEach(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                const opt = p.delivery_option || 'none';
                if (opt === 'shipping') label = `🚚 ${label}`;
                else if (opt === 'pickup') label = `🏪 ${label}`;
                else if (opt === 'both') label = `🚚🏪 ${label}`;
                keyboard.push([{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }]);
            });

            keyboard.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_${ctx.match[1]}` }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]);
            
            await uiHelper.updateOrSend(ctx, 'Wähle eine Unterkategorie oder ein Produkt:', { inline_keyboard: keyboard });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_prod_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const products = await productRepo.getProductsBySubcategory(subcatId, true);

            const keyboard = products.map(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                const opt = p.delivery_option || 'none';
                if (opt === 'shipping') label = `🚚 ${label}`;
                else if (opt === 'pickup') label = `🏪 ${label}`;
                else if (opt === 'both') label = `🚚🏪 ${label}`;
                return [{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }];
            });

            const backCb = subcat ? `admin_prod_cat_${subcat.category_id}` : 'admin_manage_products';
            keyboard.push([{ text: '🔙 Zurück', callback_data: backCb }]);

            const title = `📂 *${subcat ? subcat.name : 'Unterkategorie'}*\n\nWähle ein Produkt:`;
            await uiHelper.updateOrSend(ctx, title, { inline_keyboard: keyboard });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_add_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const catId = ctx.match[1] === 'none' ? null : ctx.match[1];
            await ctx.scene.enter('addProductScene', { categoryId: catId });
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;
            
            let path = 'Kategorielos';
            try {
                if (product.category_id) {
                    const categories = await productRepo.getActiveCategories();
                    const cat = categories.find(c => String(c.id) === String(product.category_id));
                    path = cat ? cat.name : 'Unbekannt';

                    if (product.subcategory_id) {
                        const subcat = await subcategoryRepo.getSubcategoryById(product.subcategory_id);
                        if (subcat) path += ` » ${subcat.name}`;
                    }
                }
            } catch (e) {}

            const deliveryOpt = product.delivery_option || 'none';
            const deliveryLabel = texts.getDeliveryLabel(deliveryOpt);
            
            let text = `*${product.name}*\n`;
            text += `📂 _In: ${path}_\n\n`;
            text += `💰 Preis: ${formatters.formatPrice(product.price)}\n`;
            text += `📦 Aktiv: ${product.is_active ? '✅' : '❌'}\n`;
            text += `📋 Verfügbar: ${product.is_out_of_stock ? '❌ Ausverkauft' : '✅'}\n`;
            text += `🚚 Lieferoption: ${deliveryLabel}\n`;
            if (product.description) text += `\n📝 ${product.description}`;
            
            const backCb = product.subcategory_id 
                ? `admin_prod_subcat_${product.subcategory_id}` 
                : (product.category_id ? `admin_prod_cat_${product.category_id}` : 'admin_prod_cat_none');

            const keyboard = { inline_keyboard: [
                [
                    { text: product.is_active ? '👻 Deaktivieren' : '✅ Aktivieren', callback_data: `admin_toggle_active_${product.id}` },
                    { text: product.is_out_of_stock ? '📦 Verfügbar' : '❌ Ausverkauft', callback_data: `admin_toggle_stock_${product.id}` }
                ],
                [{ text: `🚚 Lieferoption: ${deliveryLabel}`, callback_data: `admin_cycle_delivery_${product.id}` }],
                [{ text: '💰 Preis ändern', callback_data: `admin_price_${product.id}` }],
                [{ text: '✏️ Umbenennen', callback_data: `admin_rename_prod_${product.id}` }],
                [{ text: '🖼 Bild ändern', callback_data: `admin_img_${product.id}` }],
                [
                    { text: '🔼 Nach oben', callback_data: `admin_sort_prod_up_${product.id}` },
                    { text: '🔽 Nach unten', callback_data: `admin_sort_prod_down_${product.id}` }
                ],
                [{ text: '🗑 Löschen', callback_data: `admin_del_prod_${product.id}` }],
                [{ text: '🔙 Zurück', callback_data: backCb }]
            ]};

            const hasMedia = ctx.callbackQuery && ctx.callbackQuery.message && (ctx.callbackQuery.message.photo || ctx.callbackQuery.message.animation);

            if (product.image_url) {
                if (hasMedia) {
                    await ctx.editMessageCaption(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
                } else {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.replyWithPhoto(product.image_url, { caption: text, parse_mode: 'Markdown', reply_markup: keyboard });
                }
            } else {
                if (hasMedia) {
                    await ctx.deleteMessage().catch(() => {});
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                } else {
                    await uiHelper.updateOrSend(ctx, text, keyboard);
                }
            }
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_cycle_delivery_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });
            const cycle = ['none', 'shipping', 'pickup', 'both'];
            const currentIndex = cycle.indexOf(product.delivery_option || 'none');
            const nextOption = cycle[(currentIndex + 1) % cycle.length];
            await productRepo.setDeliveryOption(product.id, nextOption);
            ctx.answerCbQuery(`Lieferoption: ${texts.getDeliveryLabel(nextOption)}`).catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error(error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^admin_toggle_active_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;
            await productRepo.toggleProductStatus(product.id, 'is_active', !product.is_active);
            ctx.answerCbQuery(product.is_active ? '👻 Deaktiviert' : '✅ Aktiviert').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_toggle_stock_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return;
            await productRepo.toggleProductStatus(product.id, 'is_out_of_stock', !product.is_out_of_stock);
            ctx.answerCbQuery(product.is_out_of_stock ? '📦 Verfügbar' : '❌ Ausverkauft').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_price_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            if (isMaster) {
                await ctx.scene.enter('editPriceScene', { productId: ctx.match[1] });
            } else {
                ctx.session.pendingPriceProduct = ctx.match[1];
                await uiHelper.updateOrSend(ctx, '💰 *Neuen Preis eingeben:*\n\nBitte sende den neuen Preis (z.B. `12.50`):', {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `admin_edit_prod_${ctx.match[1]}` }]]
                });
            }
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_rename_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('renameProductScene', { productId: ctx.match[1] }); 
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_img_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('editProductImageScene', { productId: ctx.match[1] }); 
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_sort_prod_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const prodId = ctx.match[2];
            const product = await productRepo.getProductById(prodId);
            if (!product) return;
            
            let products;
            if (product.subcategory_id) {
                products = await productRepo.getProductsBySubcategory(product.subcategory_id, true);
            } else {
                const allCatProducts = await productRepo.getProductsByCategory(product.category_id, true);
                products = allCatProducts.filter(p => !p.subcategory_id);
            }

            const index = products.findIndex(p => p.id == prodId);
            if ((direction === 'up' && index > 0) || (direction === 'down' && index < products.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                await Promise.all(products.map((p, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return productRepo.updateProductSortOrder(p.id, newOrder);
                }));
                ctx.answerCbQuery('✅').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            ctx.update.callback_query.data = `admin_edit_prod_${prodId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { 
            console.error(error.message); 
        }
    });

    bot.action(/^admin_del_prod_(.+)$/, isAdmin, async (ctx) => {
        try {
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            const product = await productRepo.getProductById(ctx.match[1]);
            
            const backCb = product && product.subcategory_id 
                ? `admin_prod_subcat_${product.subcategory_id}` 
                : (product && product.category_id ? `admin_prod_cat_${product.category_id}` : 'admin_prod_cat_none');

            if (isMaster) {
                await productRepo.deleteProduct(ctx.match[1]);
                ctx.answerCbQuery('🗑 Gelöscht.').catch(() => {});
                ctx.update.callback_query.data = backCb;
                return bot.handleUpdate(ctx.update);
            } else {
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                await approvalRepo.createApproval(ctx.match[1], 'DELETE', null, adminName);
                ctx.answerCbQuery('Löschanfrage gesendet.').catch(() => {});
                await uiHelper.updateOrSend(ctx, `🔔 Löschanfrage für *${product.name || 'Produkt'}* wurde an den Master gesendet.`, {
                    inline_keyboard: [[{ text: '🔙 Zurück', callback_data: backCb }]]
                });
            }
        } catch (error) { 
            console.error(error.message); 
        }
    });
};
