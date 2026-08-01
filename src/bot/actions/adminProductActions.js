/**
 * adminProductActions.js – v0.5.65
 * 
 * Admin-Produktverwaltung mit flicker-freier Medien-Anzeige.
 * 
 * FIX v0.5.65: Kritischer Regex-Overlap behoben!
 * ─────────────────────────────────────────────────────
 * BUG: /^admin_del_prod_(.+)$/ matchte auch "admin_del_prod_confirm_XXX"
 *      weil (.+) ALLES matcht inkl. Unterstriche.
 *      → Beide Handler feuerten gleichzeitig beim Bestätigen.
 *      → Handler 1 versuchte getProductById("confirm_XXX") → Supabase Error.
 *      → "❌ Fehler beim Löschen." wurde pro Klick 1x extra gesendet.
 * 
 * FIX: Negative Lookahead (?!confirm_) verhindert den Overlap.
 *      /^admin_del_prod_((?!confirm_).+)$/ matcht NUR echte Produkt-IDs.
 */

const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const formatters = require('../../utils/formatters');
const config = require('../../config');
const texts = require('../../utils/texts');
const adminKeyboards = require('../keyboards/adminKeyboards');
const notificationService = require('../../services/notificationService');

// Hilfsfunktion: Bestimme Zurück-Callback für ein Produkt
const getBackCb = (product) => {
    if (product?.subcategory_id) return `admin_prod_subcat_${product.subcategory_id}`;
    if (product?.category_id) return `admin_prod_cat_${product.category_id}`;
    return 'admin_prod_cat_none';
};

// Hilfsfunktion: Baue Produkt-Detailtext
const buildProductText = async (product) => {
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
    return { path, deliveryLabel, text: texts.getAdminProductDetails(product, path, deliveryLabel, formatters.formatPrice(product.price)) };
};

module.exports = (bot) => {

    // ─── PRODUKT-KATEGORIEN NAVIGIEREN ───────────────────────────────────────
    bot.action('admin_manage_products', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categories = await productRepo.getActiveCategories();
            const keyboard = adminKeyboards.getManageProductsMenu(categories);
            await uiHelper.updateOrSend(ctx, texts.getAdminProductManageHeader(), keyboard);
        } catch (error) { console.error('admin_manage_products error:', error.message); }
    });

    bot.action(/^admin_prod_cat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const categoryId = ctx.match[1] === 'none' ? null : ctx.match[1];
            let subcats = [];
            if (categoryId !== null) {
                subcats = await subcategoryRepo.getSubcategoriesByCategory(categoryId).catch(() => []);
            }
            const allProducts = await productRepo.getProductsByCategory(categoryId, true);
            const directProducts = categoryId === null ? allProducts : allProducts.filter(p => !p.subcategory_id);
            const keyboard = adminKeyboards.getProductCategoryMenu(categoryId, subcats, directProducts);
            await uiHelper.updateOrSend(ctx, texts.getAdminProductSelectSubcat(), keyboard);
        } catch (error) { console.error('admin_prod_cat error:', error.message); }
    });

    bot.action(/^admin_prod_subcat_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const subcatId = ctx.match[1];
            const subcat = await subcategoryRepo.getSubcategoryById(subcatId);
            const products = await productRepo.getProductsBySubcategory(subcatId, true);
            const keyboard = adminKeyboards.getProductSubcategoryMenu(subcat, products);
            await uiHelper.updateOrSend(ctx, texts.getAdminProductSubcatHeader(subcat ? subcat.name : 'Unterkategorie'), keyboard);
        } catch (error) { console.error('admin_prod_subcat error:', error.message); }
    });

    // ─── PRODUKT ANZEIGEN (MIT FLICKER-FREIER MEDIEN-ANZEIGE) ──────────────
    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return ctx.answerCbQuery('⚠️ Produkt nicht gefunden.', { show_alert: true });

            const { deliveryLabel, text } = await buildProductText(product);
            const backCb = getBackCb(product);
            const keyboard = adminKeyboards.getEditProductMenu(product, deliveryLabel, backCb);

            await uiHelper.showProductWithMedia(ctx, product.image_url, text, keyboard);
        } catch (error) { console.error('admin_edit_prod error:', error.message); }
    });

    // ─── PRODUKT HINZUFÜGEN ───────────────────────────────────────────────────
    bot.action(/^admin_add_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const catId = ctx.match[1] === 'none' ? null : ctx.match[1];
            await ctx.scene.enter('addProductScene', { categoryId: catId });
        } catch (error) { console.error('admin_add_prod error:', error.message); }
    });

    // ─── LIEFEROPTION WECHSELN ────────────────────────────────────────────────
    bot.action(/^admin_cycle_delivery_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });
            const cycle = ['none', 'shipping', 'pickup', 'both'];
            const currentIndex = cycle.indexOf(product.delivery_option || 'none');
            const nextOption = cycle[(currentIndex + 1) % cycle.length];
            await productRepo.setDeliveryOption(product.id, nextOption);
            ctx.answerCbQuery(`✅ Lieferoption: ${texts.getDeliveryLabel(nextOption)}`).catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_cycle_delivery error:', error.message); }
    });

    // ─── AKTIV/INAKTIV TOGGLE ─────────────────────────────────────────────────
    bot.action(/^admin_toggle_active_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });
            await productRepo.toggleProductStatus(product.id, 'is_active', !product.is_active);
            ctx.answerCbQuery(product.is_active ? '👻 Deaktiviert' : '✅ Aktiviert').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_toggle_active error:', error.message); }
    });

    // ─── LAGER TOGGLE ────────────────────────────────────────────────────────
    bot.action(/^admin_toggle_stock_(.+)$/, isAdmin, async (ctx) => {
        try {
            const product = await productRepo.getProductById(ctx.match[1]);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });
            await productRepo.toggleProductStatus(product.id, 'is_out_of_stock', !product.is_out_of_stock);
            ctx.answerCbQuery(product.is_out_of_stock ? '📦 Verfügbar' : '❌ Ausverkauft').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${product.id}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_toggle_stock error:', error.message); }
    });

    // ─── PREIS ÄNDERN ────────────────────────────────────────────────────────
    bot.action(/^admin_price_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            if (isMaster) {
                await ctx.scene.enter('editPriceScene', { productId: ctx.match[1] });
            } else {
                ctx.session.pendingPriceProduct = ctx.match[1];
                const keyboard = adminKeyboards.getCancelBackToProduct(ctx.match[1]);
                await uiHelper.updateOrSend(ctx, texts.getAdminPricePrompt(), keyboard);
            }
        } catch (error) { console.error('admin_price error:', error.message); }
    });

    // ─── UMBENENNEN ──────────────────────────────────────────────────────────
    bot.action(/^admin_rename_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('renameProductScene', { productId: ctx.match[1] });
        } catch (error) { console.error('admin_rename_prod error:', error.message); }
    });

    // ─── BILD ÄNDERN ──────────────────────────────────────────────────────────
    bot.action(/^admin_img_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editProductImageScene', { productId: ctx.match[1] });
        } catch (error) { console.error('admin_img error:', error.message); }
    });

    // ─── BESCHREIBUNG BEARBEITEN ──────────────────────────────────────────────
    bot.action(/^admin_desc_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await ctx.scene.enter('editDescriptionScene', { productId: ctx.match[1] });
        } catch (error) { console.error('admin_desc error:', error.message); }
    });

    // ─── SORTIERUNG ──────────────────────────────────────────────────────────
    bot.action(/^admin_sort_prod_(up|down)_(.+)$/, isAdmin, async (ctx) => {
        try {
            const direction = ctx.match[1];
            const prodId = ctx.match[2];
            const product = await productRepo.getProductById(prodId);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });

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
                ctx.answerCbQuery('✅ Sortierung aktualisiert').catch(() => {});
            } else {
                ctx.answerCbQuery('⚠️ Nicht möglich – bereits am Ende.').catch(() => {});
            }
            ctx.update.callback_query.data = `admin_edit_prod_${prodId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_sort_prod error:', error.message); }
    });

    // ─── PRODUKT LÖSCHEN (FIX: Negative Lookahead gegen Regex-Overlap) ──────
    //
    // WICHTIG: (?!confirm_) stellt sicher, dass "admin_del_prod_confirm_XXX"
    // NICHT von diesem Handler gefangen wird. Ohne diesen Fix feuerten BEIDE
    // Handler gleichzeitig, was zu "Fehler beim Löschen" führte.
    //
    bot.action(/^admin_del_prod_((?!confirm_).+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
            const product = await productRepo.getProductById(productId);
            
            if (!product) {
                return ctx.answerCbQuery('⚠️ Produkt nicht gefunden.', { show_alert: true }).catch(() => {});
            }

            const backCb = getBackCb(product);

            if (isMaster) {
                // Master kann direkt löschen – Bestätigungsdialog
                await uiHelper.updateOrSend(ctx,
                    `🗑 *Produkt endgültig löschen?*\n\n📦 *${product.name}*\n\n⚠️ Diese Aktion kann nicht rückgängig gemacht werden!`,
                    {
                        inline_keyboard: [
                            [{ text: '✅ Ja, endgültig löschen', callback_data: `admin_del_prod_confirm_${product.id}` }],
                            [{ text: '❌ Abbrechen', callback_data: backCb }]
                        ]
                    }
                );
            } else {
                // Temporärer Admin → Anfrage an Master
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApproval(product.id, 'DELETE', null, adminName);

                // Master per Direktnachricht benachrichtigen
                await notificationService.notifyMasterProductDeleteRequest({
                    adminName,
                    productName: product.name,
                    productId: product.id,
                    approvalId: approval.id
                });

                await uiHelper.updateOrSend(ctx,
                    `📨 *Löschanfrage gesendet*\n\n📦 *${product.name}*\n\nDeine Anfrage wurde an den Master weitergeleitet. Du erhältst eine Rückmeldung sobald sie bearbeitet wurde.`,
                    { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: backCb }]] }
                );
            }
        } catch (error) {
            console.error('[adminProductActions] admin_del_prod error:', error.message);
            await ctx.reply('❌ Fehler beim Löschen. Bitte versuche es erneut.').catch(() => {});
        }
    });

    // ─── PRODUKT LÖSCHEN BESTÄTIGEN (NUR MASTER) ─────────────────────────────
    bot.action(/^admin_del_prod_confirm_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) {
                return ctx.answerCbQuery('⛔ Nur der Master kann endgültig löschen.', { show_alert: true });
            }

            const productId = ctx.match[1];

            // Produkt-Info VOR dem Löschen laden (für Bestätigung + backCb)
            const product = await productRepo.getProductById(productId).catch(() => null);
            const productName = product?.name || `ID: ${productId}`;
            const backCb = product ? getBackCb(product) : 'admin_manage_products';

            // Löschung durchführen
            await productRepo.deleteProduct(productId);

            ctx.answerCbQuery('🗑 Produkt gelöscht.').catch(() => {});

            await uiHelper.updateOrSend(ctx,
                `✅ *Produkt gelöscht*\n\n📦 *${productName}* wurde endgültig entfernt.`,
                { inline_keyboard: [[{ text: '🔙 Zurück zu Produkten', callback_data: backCb }]] }
            );
        } catch (error) {
            console.error('[adminProductActions] admin_del_prod_confirm error:', error.message);
            
            // Spezifische Fehlermeldung je nach Problem
            const errMsg = (error.message || '').toLowerCase();
            if (errMsg.includes('violates foreign key') || errMsg.includes('foreign key')) {
                await ctx.reply('❌ Produkt kann nicht gelöscht werden – es gibt noch zugehörige Bestellungen.').catch(() => {});
            } else if (errMsg.includes('not found') || errMsg.includes('no rows')) {
                await ctx.reply('⚠️ Produkt wurde bereits gelöscht oder existiert nicht mehr.').catch(() => {});
            } else {
                await ctx.reply(`❌ Fehler beim Löschen: ${error.message}`).catch(() => {});
            }
        }
    });
};
