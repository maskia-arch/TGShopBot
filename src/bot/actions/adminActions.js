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
                text: `✏️ ${c.name}`, 
                callback_data: `admin_edit_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Kategorien verwalten:', { inline_keyboard: keyboard });
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
            
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, 'Wähle eine Kategorie, um Produkte zu verwalten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_prod_cat_(.+)$/, isAdmin, async (ctx) => {
        try {
            const categoryId = ctx.match[1];
            const products = await productRepo.getProductsByCategory(categoryId, true);
            
            const keyboard = products.map(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                
                return [{ 
                    text: `${label} (${formatters.formatPrice(p.price)})`, 
                    callback_data: `admin_edit_prod_${p.id}` 
                }];
            });

            keyboard.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_to_${categoryId}` }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]);

            await uiHelper.updateOrSend(ctx, 'Produkte in dieser Kategorie (Admins sehen alles):', { inline_keyboard: keyboard });
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
                    [{ text: '💰 Preis ändern (Anfrage)', callback_data: `admin_req_price_${p.id}` }],
                    [{ text: '🗑 Löschen (Anfrage)', callback_data: `admin_req_del_${p.id}` }],
                    [{ text: '🔙 Zurück', callback_data: `admin_prod_cat_${p.category_id}` }]
                ]
            };

            const info = `EINSTELLUNGEN FÜR:\n📦 *${p.name}*\n\nStatus: ${p.is_active ? 'Sichtbar' : 'Versteckt'}\nLager: ${p.is_out_of_stock ? 'Ausverkauft' : 'Verfügbar'}`;
            
            await uiHelper.updateOrSend(ctx, info, keyboard);
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
            const newValue = !p[field];
            
            await productRepo.toggleProductStatus(productId, field, newValue);
            await ctx.answerCbQuery('Status wurde aktualisiert!');
            
            ctx.match = [null, productId]; 
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_req_del_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            await approvalRepo.createApprovalRequest('DELETE', ctx.from.id, productId);
            await ctx.answerCbQuery('🗑 Löschanfrage wurde an Master gesendet!', { show_alert: true });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_req_price_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            await ctx.scene.enter('editPriceScene', { productId });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_add_prod_to_(.+)$/, isAdmin, async (ctx) => {
        try {
            const categoryId = ctx.match[1];
            await ctx.scene.enter('addProductScene', { categoryId });
        } catch (error) {
            console.error(error.message);
        }
    });
};
