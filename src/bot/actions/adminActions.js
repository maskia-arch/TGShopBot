const productRepo = require('../../database/repositories/productRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const formatters = require('../../utils/formatters');
const config = require('../../config');
const texts = require('../../utils/texts');
const notificationService = require('../../services/notificationService');

module.exports = (bot) => {
    bot.action('admin_panel', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {}); // Sofort quittieren
        try {
            const userId = ctx.from.id;
            // Rollenabfrage parallel zur Logik (falls Repo-Funktion asynchron ist)
            const role = await require('../../database/repositories/userRepo').getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products' }],
                    [{ text: '📁 Kategorien verwalten', callback_data: 'admin_manage_categories' }],
                    [{ text: '📢 Rundnachricht (Broadcast)', callback_data: 'admin_start_broadcast' }],
                    [{ text: '👁 Kundenansicht testen', callback_data: 'shop_menu' }]
                ]
            };

            if (isMaster) {
                keyboard.inline_keyboard.unshift([{ text: '👑 Zum Master-Dashboard', callback_data: 'master_panel' }]);
            }

            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(isMaster, role), keyboard);
        } catch (error) {
            console.error(error.message);
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
            const keyboard = categories.map(c => ([{ 
                text: `📁 ${c.name}`, 
                callback_data: `admin_edit_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
            keyboard.push([{ text: '🔙 Zurück zum Admin-Menü', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, '📁 *Kategorien verwalten*\nWähle eine Kategorie zum Bearbeiten:', { inline_keyboard: keyboard });
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
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '✏️ Namen ändern', callback_data: `admin_rename_cat_${categoryId}` }],
                    [{ text: '🗑 Kategorie löschen', callback_data: `admin_del_cat_${categoryId}` }],
                    [{ text: '🔙 Zurück', callback_data: 'admin_manage_categories' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, `Kategorie bearbeiten: *${category.name}*`, keyboard);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action('admin_manage_products', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = categories.map(c => ([{ 
                text: c.name, 
                callback_data: `admin_prod_cat_${c.id}` 
            }]));
            
            keyboard.push([{ text: '📦 Kategorielose Produkte', callback_data: 'admin_prod_cat_none' }]);
            keyboard.push([{ text: '➕ Neues Produkt (Kategorielos)', callback_data: 'admin_add_prod_to_none' }]);
            keyboard.push([{ text: '🔙 Zurück zum Admin-Menü', callback_data: 'admin_panel' }]);

            await uiHelper.updateOrSend(ctx, '📦 *Produkte verwalten*\nWähle eine Kategorie:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
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
                return [{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }];
            });

            keyboard.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_to_${ctx.match[1]}` }]);
            keyboard.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]);

            await uiHelper.updateOrSend(ctx, 'Wähle ein Produkt zum Bearbeiten:', { inline_keyboard: keyboard });
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const p = await productRepo.getProductById(productId);
            
            const stockLabel = p.is_out_of_stock ? '✅ Wieder auf "Lagernd"' : '📦 Auf "Ausverkauft" setzen';
            const visLabel = p.is_active ? '👻 Unsichtbar machen' : '👁 Öffentlich schalten';

            const keyboard = {
                inline_keyboard: [
                    [{ text: stockLabel, callback_data: `admin_toggle_stock_${p.id}` }],
                    [{ text: visLabel, callback_data: `admin_toggle_vis_${p.id}` }],
                    [{ text: '🖼 Bild ändern', callback_data: `admin_edit_img_${p.id}` }],
                    [{ text: '📁 Kategorie verschieben', callback_data: `admin_move_prod_${p.id}` }],
                    [{ text: '💰 Preis ändern (Anfrage)', callback_data: `admin_req_price_${p.id}` }],
                    [{ text: '🗑 Löschen (Anfrage)', callback_data: `admin_req_del_${p.id}` }],
                    [{ text: '🔙 Zurück zur Liste', callback_data: p.category_id ? `admin_prod_cat_${p.category_id}` : 'admin_prod_cat_none' }]
                ]
            };
            
            await uiHelper.updateOrSend(ctx, `🛠 EINSTELLUNGEN: *${p.name}*`, keyboard, p.image_url);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_toggle_(stock|vis)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const type = ctx.match[1];
            const productId = ctx.match[2];
            
            // Erst umschalten
            const p = await productRepo.getProductById(productId);
            const field = type === 'stock' ? 'is_out_of_stock' : 'is_active';
            await productRepo.toggleProductStatus(productId, field, !p[field]);
            
            // Sofort Bestätigung senden
            ctx.answerCbQuery('✅ Status aktualisiert!').catch(() => {});
            
            // Dann aktualisierte Daten laden
            const updatedP = await productRepo.getProductById(productId);
            const stockLabel = updatedP.is_out_of_stock ? '✅ Wieder auf "Lagernd"' : '📦 Auf "Ausverkauft" setzen';
            const visLabel = updatedP.is_active ? '👻 Unsichtbar machen' : '👁 Öffentlich schalten';

            const keyboard = {
                inline_keyboard: [
                    [{ text: stockLabel, callback_data: `admin_toggle_stock_${updatedP.id}` }],
                    [{ text: visLabel, callback_data: `admin_toggle_vis_${updatedP.id}` }],
                    [{ text: '🖼 Bild ändern', callback_data: `admin_edit_img_${updatedP.id}` }],
                    [{ text: '📁 Kategorie verschieben', callback_data: `admin_move_prod_${updatedP.id}` }],
                    [{ text: '💰 Preis ändern (Anfrage)', callback_data: `admin_req_price_${updatedP.id}` }],
                    [{ text: '🗑 Löschen (Anfrage)', callback_data: `admin_req_del_${updatedP.id}` }],
                    [{ text: '🔙 Zurück zur Liste', callback_data: updatedP.category_id ? `admin_prod_cat_${updatedP.category_id}` : 'admin_prod_cat_none' }]
                ]
            };
            await uiHelper.updateOrSend(ctx, `🛠 EINSTELLUNGEN: *${updatedP.name}*`, keyboard, updatedP.image_url);
        } catch (error) {
            console.error(error.message);
        }
    });

    bot.action(/^admin_req_del_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            // Parallel: Anfrage erstellen und Produkt für Notification laden
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
                }).catch(e => console.error('Notify Error:', e.message));
            }

            await ctx.answerCbQuery('Löschanfrage gesendet!', { show_alert: true });
        } catch (error) {
            console.error(error.message);
        }
    });

    // Andere Szenen-Starts ebenfalls mit sofortigem Feedback
    bot.action(/^admin_req_price_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editPriceScene', { productId: ctx.match[1] });
        } catch (error) {
            console.error(error.message);
        }
    });
};
