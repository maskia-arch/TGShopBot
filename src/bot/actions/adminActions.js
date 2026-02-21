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
                    [{ text: '📢 Rundnachricht (Broadcast)', callback_data: 'admin_start_broadcast' }],
                    [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders' }],
                    [{ text: '👁 Kundenansicht testen', callback_data: 'shop_menu' }],
                    [{ text: 'ℹ️ Befehle & Info', callback_data: 'admin_info' }]
                ]
            };

            if (isMaster) {
                keyboard.inline_keyboard.unshift([{ text: '👑 Zum Master-Dashboard', callback_data: 'master_panel' }]);
            }

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
            console.error('Broadcast Start Error:', error.message);
        }
    });

    // ════════════════════════════════════
    // KATEGORIEN
    // ════════════════════════════════════

    bot.action('admin_manage_categories', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ 
                text: `📁 ${c.name}`, 
                callback_data: `admin_edit_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
            keyboard.push([{ text: '🔙 Zurück zum Admin-Menü', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, '📁 *Kategorien verwalten*\n\nWähle eine Kategorie zum Bearbeiten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Manage Categories Error:', error.message);
        }
    });

    bot.action('admin_add_category', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('addCategoryScene');
        } catch (error) {
            console.error('Add Category Error:', error.message);
        }
    });

    bot.action(/^admin_edit_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const category = categories.find(c => c.id == categoryId);
            
            if (!category) return ctx.answerCbQuery('Kategorie nicht gefunden.', { show_alert: true }).catch(() => {});

            // Unterkategorien laden
            const subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);

            const keyboard = {
                inline_keyboard: [
                    [{ text: '✏️ Namen ändern', callback_data: `admin_rename_cat_${categoryId}` }],
                    [{ text: '📂 Unterkategorie hinzufügen', callback_data: `admin_add_subcat_${categoryId}` }],
                    [
                        { text: '🔼 Hoch', callback_data: `admin_sort_cat_up_${categoryId}` },
                        { text: '🔽 Runter', callback_data: `admin_sort_cat_down_${categoryId}` }
                    ],
                    [{ text: '🗑 Kategorie löschen', callback_data: `admin_del_cat_${categoryId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'admin_manage_categories' }]
                ]
            };

            // Unterkategorien als Buttons hinzufügen
            if (subcats.length > 0) {
                subcats.forEach(sc => {
                    keyboard.inline_keyboard.splice(-2, 0, [{ text: `📂 ${sc.name}`, callback_data: `admin_edit_subcat_${sc.id}` }]);
                });
            }

            await uiHelper.updateOrSend(ctx, `Kategorie bearbeiten: *${category.name}*${subcats.length > 0 ? `\n\n📂 ${subcats.length} Unterkategorie(n)` : ''}`, keyboard);
        } catch (error) {
            console.error('Edit Cat Error:', error.message);
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
                const promises = categories.map((cat, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return productRepo.updateCategorySortOrder(cat.id, newOrder);
                });
                await Promise.all(promises);
                ctx.answerCbQuery('✅ Sortierung aktualisiert!').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            
            ctx.update.callback_query.data = `admin_edit_cat_${id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Sort Cat Error:', error.message);
            ctx.answerCbQuery('Fehler beim Sortieren.').catch(() => {});
        }
    });

    bot.action(/^admin_rename_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('renameCategoryScene', { categoryId: ctx.match[1] });
        } catch (error) {
            console.error('Rename Cat Error:', error.message);
        }
    });

    bot.action(/^admin_del_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            await productRepo.deleteCategory(ctx.match[1]);
            ctx.answerCbQuery('✅ Kategorie gelöscht.').catch(() => {});
            
            ctx.update.callback_query.data = 'admin_manage_categories';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Delete Cat Error:', error.message);
            ctx.answerCbQuery('Fehler beim Löschen.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // UNTERKATEGORIEN
    // ════════════════════════════════════

    bot.action(/^admin_add_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const cat = categories.find(c => c.id == categoryId);
            await ctx.scene.enter('addSubcategoryScene', { categoryId, categoryName: cat ? cat.name : 'Unbekannt' });
        } catch (error) {
            console.error('Add Subcat Error:', error.message);
        }
    });

    bot.action(/^admin_edit_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            if (!subcat) return ctx.answerCbQuery('Nicht gefunden.', { show_alert: true });

            const keyboard = {
                inline_keyboard: [
                    [{ text: '✏️ Umbenennen', callback_data: `admin_rename_subcat_${subcatId}` }],
                    [{ text: '🗑 Löschen', callback_data: `admin_del_subcat_${subcatId}` }],
                    [{ text: '🔙 Zurück', callback_data: `admin_edit_cat_${subcat.category_id}` }]
                ]
            };

            await uiHelper.updateOrSend(ctx, `📂 Unterkategorie: *${subcat.name}*`, keyboard);
        } catch (error) {
            console.error('Edit Subcat Error:', error.message);
        }
    });

    bot.action(/^admin_rename_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('renameSubcategoryScene', { subcategoryId: ctx.match[1] });
        } catch (error) {
            console.error('Rename Subcat Error:', error.message);
        }
    });

    bot.action(/^admin_del_subcat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const catId = subcat ? subcat.category_id : null;
            
            await subcategoryRepo.deleteSubcategory(subcatId);
            ctx.answerCbQuery('✅ Unterkategorie gelöscht.').catch(() => {});

            if (catId) {
                ctx.update.callback_query.data = `admin_edit_cat_${catId}`;
                return bot.handleUpdate(ctx.update);
            }
        } catch (error) {
            console.error('Del Subcat Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ════════════════════════════════════
    // PRODUKTE
    // ════════════════════════════════════

    bot.action('admin_manage_products', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ 
                text: c.name, 
                callback_data: `admin_prod_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '📦 Kategorielose Produkte', callback_data: 'admin_prod_cat_none' }]);
            keyboard.push([{ text: '➕ Neues Produkt (Kategorielos)', callback_data: 'admin_add_prod_none' }]);
            keyboard.push([{ text: '🔙 Zurück zum Admin-Menü', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, '📦 *Produkte verwalten*\n\nWähle eine Kategorie:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Manage Prod Error:', error.message);
        }
    });

    bot.action(/^admin_prod_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            const products = await productRepo.getProductsByCategory(categoryId, true);
            
            const keyboard = products.map(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                if (p.requires_shipping) label = `🚚 ${label}`;
                return [{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }];
            });

            keyboard.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_${ctx.match[1]}` }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]);

            await uiHelper.updateOrSend(ctx, 'Wähle ein Produkt zum Bearbeiten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error('Cat Prod List Error:', error.message);
        }
    });

    bot.action(/^admin_add_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            await ctx.scene.enter('addProductScene', { categoryId });
        } catch (error) {
            console.error('Add Prod Error:', error.message);
        }
    });

    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const p = await productRepo.getProductById(productId);
            
            const stockLabel = p.is_out_of_stock ? '✅ Wieder auf "Lagernd"' : '📦 Auf "Ausverkauft" setzen';
            const visLabel = p.is_active ? '👻 Unsichtbar machen' : '👁 Öffentlich schalten';
            const shipLabel = p.requires_shipping ? '🚫 Versand deaktivieren' : '🚚 Versand aktivieren';

            const keyboard = {
                inline_keyboard: [
                    [{ text: stockLabel, callback_data: `admin_toggle_stock_${p.id}` }],
                    [{ text: visLabel, callback_data: `admin_toggle_vis_${p.id}` }],
                    [{ text: shipLabel, callback_data: `admin_toggle_ship_${p.id}` }],
                    [
                        { text: '🔼 Hoch', callback_data: `admin_sort_prod_up_${p.id}` },
                        { text: '🔽 Runter', callback_data: `admin_sort_prod_down_${p.id}` }
                    ],
                    [{ text: '✏️ Name ändern', callback_data: `admin_rename_prod_${p.id}` }],
                    [{ text: '🖼 Bild ändern', callback_data: `admin_edit_img_${p.id}` }],
                    [{ text: '💰 Preis ändern (Anfrage)', callback_data: `admin_req_price_${p.id}` }],
                    [{ text: '🗑 Löschen (Anfrage)', callback_data: `admin_req_del_${p.id}` }],
                    [{ text: '🔙 Zurück zur Liste', callback_data: p.category_id ? `admin_prod_cat_${p.category_id}` : 'admin_prod_cat_none' }]
                ]
            };
            
            let text = `🛠 EINSTELLUNGEN: *${p.name}*`;
            if (p.requires_shipping) text += '\n🚚 _Versand aktiv_';

            await uiHelper.updateOrSend(ctx, text, keyboard, p.image_url);
        } catch (error) {
            console.error('Edit Prod Error:', error.message);
        }
    });

    // ── Versand Toggle ──
    bot.action(/^admin_toggle_ship_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const p = await productRepo.getProductById(productId);
            await productRepo.toggleShipping(productId, !p.requires_shipping);
            ctx.answerCbQuery(`🚚 Versand: ${!p.requires_shipping ? 'Aktiviert' : 'Deaktiviert'}`).catch(() => {});
            
            ctx.update.callback_query.data = `admin_edit_prod_${productId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Toggle Shipping Error:', error.message);
            ctx.answerCbQuery('Fehler.', { show_alert: true }).catch(() => {});
        }
    });

    // ── Produkt umbenennen ──
    bot.action(/^admin_rename_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('renameProductScene', { productId: ctx.match[1] });
        } catch (error) {
            console.error('Rename Prod Error:', error.message);
        }
    });

    bot.action(/^admin_sort_prod_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const id = ctx.match[2];
            const product = await productRepo.getProductById(id);
            const products = await productRepo.getProductsByCategory(product.category_id, true);
            const index = products.findIndex(p => p.id == id);
            
            if ((direction === 'up' && index > 0) || (direction === 'down' && index < products.length - 1)) {
                const swapIndex = direction === 'up' ? index - 1 : index + 1;
                const promises = products.map((prod, i) => {
                    let newOrder = i;
                    if (i === index) newOrder = swapIndex;
                    else if (i === swapIndex) newOrder = index;
                    return productRepo.updateProductSortOrder(prod.id, newOrder);
                });
                await Promise.all(promises);
                ctx.answerCbQuery('✅ Sortierung aktualisiert!').catch(() => {});
            } else {
                ctx.answerCbQuery('Nicht möglich.').catch(() => {});
            }
            
            ctx.update.callback_query.data = `admin_edit_prod_${id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Sort Prod Error:', error.message);
            ctx.answerCbQuery('Fehler beim Sortieren.').catch(() => {});
        }
    });

    bot.action(/^admin_toggle_(stock|vis)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const type = ctx.match[1];
            const productId = ctx.match[2];
            
            const p = await productRepo.getProductById(productId);
            const field = type === 'stock' ? 'is_out_of_stock' : 'is_active';
            
            await productRepo.toggleProductStatus(productId, field, !p[field]);
            ctx.answerCbQuery('✅ Status aktualisiert!').catch(() => {});
            
            ctx.update.callback_query.data = `admin_edit_prod_${productId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Toggle Status Error:', error.message);
        }
    });

    bot.action(/^admin_edit_img_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editProductImageScene', { productId: ctx.match[1] });
        } catch (error) {
            console.error('Edit Img Error:', error.message);
        }
    });

    bot.action(/^admin_req_del_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const [approval, product] = await Promise.all([
                approvalRepo.createApprovalRequest('DELETE', ctx.from.id, productId),
                productRepo.getProductById(productId)
            ]);
            
            const requestedBy = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;

            if (notificationService.notifyMasterApproval) {
                notificationService.notifyMasterApproval({
                    approvalId: approval ? approval.id : 'NEW',
                    actionType: 'DELETE',
                    productId: productId,
                    productName: product ? product.name : 'Unbekanntes Produkt',
                    requestedBy: requestedBy
                }).catch(() => {});
            }

            await ctx.answerCbQuery('✅ Löschanfrage gesendet!', { show_alert: true });
            
            ctx.update.callback_query.data = product.category_id ? `admin_prod_cat_${product.category_id}` : 'admin_prod_cat_none';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Req Delete Error:', error.message);
        }
    });

    bot.action(/^admin_req_price_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editPriceScene', { productId: ctx.match[1] });
        } catch (error) {
            console.error('Req Price Error:', error.message);
        }
    });
};
