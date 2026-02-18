const productRepo = require('../../database/repositories/productRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const formatters = require('../../utils/formatters');

module.exports = (bot) => {
    bot.action('admin_panel', isAdmin, async (ctx) => {
        try {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products' }],
                    [{ text: '📁 Kategorien verwalten', callback_data: 'admin_manage_categories' }],
                    [{ text: '🔙 Hauptmenü', callback_data: 'shop_menu' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, 'Admin-Panel: Was möchtest du tun?', keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('admin_manage_categories', isAdmin, async (ctx) => {
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ 
                text: `📁 ${c.name}`, 
                callback_data: `admin_edit_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Kategorien verwalten: Wähle eine Kategorie zum Bearbeiten.', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_edit_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const categoryId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const category = categories.find(c => c.id == categoryId);
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✏️ Namen ändern', callback_data: `admin_rename_cat_${categoryId}` }],
                    [{ text: '🗑 Kategorie löschen', callback_data: `admin_del_cat_${categoryId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'admin_manage_categories' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, `Kategorie bearbeiten: *${category.name}*\n\nHinweis: Produkte werden beim Löschen der Kategorie automatisch auf "Sonstiges" verschoben.`, keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_rename_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            await ctx.scene.enter('renameCategoryScene', { categoryId: ctx.match[1] });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_del_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const categoryId = ctx.match[1];
            await productRepo.deleteCategory(categoryId);
            await ctx.answerCbQuery('✅ Kategorie gelöscht!');
            
            // Zurück zur Übersicht
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_edit_cat_${c.id}` }]));
            keyboard.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
            
            await uiHelper.updateOrSend(ctx, 'Kategorie wurde entfernt. Übersicht aktualisiert:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('admin_add_category', isAdmin, async (ctx) => {
        try {
            await ctx.scene.enter('addCategoryScene');
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('admin_manage_products', isAdmin, async (ctx) => {
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ 
                text: c.name, 
                callback_data: `admin_prod_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '📦 Kategorielose Produkte', callback_data: 'admin_prod_cat_none' }]);
            keyboard.push([{ text: '➕ Neues Produkt (Allgemein)', callback_data: 'admin_add_prod_to_none' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Wähle eine Kategorie:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_prod_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            const products = await productRepo.getProductsByCategory(categoryId, true);
            
            const keyboard = products.map(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                return [{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }];
            });

            keyboard.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_to_${ctx.match[1]}` }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]);

            await uiHelper.updateOrSend(ctx, 'Produkte verwalten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const p = await productRepo.getProductById(productId);
            
            const stockLabel = p.is_out_of_stock ? '✅ Wieder auf "Lagernd"' : '📦 Auf "Ausverkauft" setzen';
            const visLabel = p.is_active ? '👻 Unsichtbar machen' : '👁 Öffentlich schalten';

            const keyboard = {
                inline_keyboard: [
                    [{ text: stockLabel, callback_data: `admin_toggle_stock_${p.id}` }],
                    [{ text: visLabel, callback_data: `admin_toggle_vis_${p.id}` }],
                    [{ text: '📁 Kategorie verschieben', callback_data: `admin_move_prod_${p.id}` }],
                    [{ text: '💰 Preis ändern (Anfrage)', callback_data: `admin_req_price_${p.id}` }],
                    [{ text: '🗑 Löschen (Anfrage)', callback_data: `admin_req_del_${p.id}` }],
                    [{ text: '🔙 Zurück', callback_data: p.category_id ? `admin_prod_cat_${p.category_id}` : 'admin_prod_cat_none' }]
                ]
            };
            
            await uiHelper.updateOrSend(ctx, `EINSTELLUNGEN: *${p.name}*`, keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_move_prod_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ text: c.name, callback_data: `admin_confirm_move_${productId}_${c.id}` }]));
            keyboard.push([{ text: '📦 Keine Kategorie', callback_data: `admin_confirm_move_${productId}_none` }]);
            keyboard.push([{ text: '🔙 Abbrechen', callback_data: `admin_edit_prod_${productId}` }]);
            await uiHelper.updateOrSend(ctx, 'Wähle die neue Kategorie:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_confirm_move_(.+)_+(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            const categoryId = ctx.match[2] === 'none' ? null : ctx.match[2];
            await productRepo.updateProductCategory(productId, categoryId);
            await ctx.answerCbQuery('✅ Kategorie wurde verschoben!');
            const p = await productRepo.getProductById(productId);
            const keyboard = [[{ text: '🔙 Zurück', callback_data: categoryId ? `admin_prod_cat_${categoryId}` : 'admin_prod_cat_none' }]];
            await uiHelper.updateOrSend(ctx, `Produkt ${p.name} erfolgreich verschoben.`, { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_toggle_(stock|vis)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const type = ctx.match[1];
            const productId = ctx.match[2];
            const p = await productRepo.getProductById(productId);
            const field = type === 'stock' ? 'is_out_of_stock' : 'is_active';
            await productRepo.toggleProductStatus(productId, field, !p[field]);
            await ctx.answerCbQuery('Aktualisiert!');
            ctx.match = [null, productId]; 
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_req_del_(.+)$/, isAdmin, async (ctx) => {
        try {
            await approvalRepo.createApprovalRequest('DELETE', ctx.from.id, ctx.match[1]);
            await ctx.answerCbQuery('Löschanfrage gesendet!', { show_alert: true });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_req_price_(.+)$/, isAdmin, async (ctx) => {
        try {
            await ctx.scene.enter('editPriceScene', { productId: ctx.match[1] });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_add_prod_to_(.+)$/, isAdmin, async (ctx) => {
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            await ctx.scene.enter('addProductScene', { categoryId });
        } catch (error) {
            console.error(error.message);
        }
    });
};
