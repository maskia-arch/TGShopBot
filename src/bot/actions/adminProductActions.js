/**
 * adminProductActions.js – v0.5.65
 * 
 * Admin-Produktverwaltung mit Tresor-Vorrat (Digital Inventory Stock)
 */

const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const deliverableRepo = require('../../database/repositories/deliverableRepo');
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

    // ─── PRODUKT ANZEIGEN (MIT FLICKER-FREIER MEDIEN-ANZEIGE & TRESOR-VORRAT) ──
    bot.action(/^admin_edit_prod_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);
            if (!product) return ctx.answerCbQuery('⚠️ Produkt nicht gefunden.', { show_alert: true });

            const stockCount = await deliverableRepo.getAvailableCount(productId);
            const { deliveryLabel, text } = await buildProductText(product);
            const backCb = getBackCb(product);
            const keyboard = adminKeyboards.getEditProductMenu(product, deliveryLabel, backCb, stockCount);

            await uiHelper.showProductWithMedia(ctx, product.image_url, text, keyboard);
        } catch (error) { console.error('admin_edit_prod error:', error.message); }
    });

    // ─── TRESOR-VORRAT MENÜ FÜR EIN PRODUKT ──────────────────────────────────
    bot.action(/^admin_prod_stock_menu_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);
            if (!product) return ctx.answerCbQuery('⚠️ Produkt nicht gefunden.', { show_alert: true });

            const stockCount = await deliverableRepo.getAvailableCount(productId);
            const keyboard = adminKeyboards.getTresorStockMenu(product, stockCount);
            const text = `🔐 *Tresor-Vorrat für "${product.name}"*\n\n` +
                `📦 Aktueller Bestand: *${stockCount} Stück*\n\n` +
                `Wähle eine Option zum Einlagern oder Verwalten:`;

            await uiHelper.updateOrSend(ctx, text, keyboard);
        } catch (error) { console.error('admin_prod_stock_menu error:', error.message); }
    });

    bot.action(/^admin_stock_bulk_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingBulkStock = productId;
            await ctx.reply(`🟢 *Massen-Import für #${productId}*\n\nBitte sende jetzt die einzulagernden Einheiten als Text blockweise.\n*Jede Zeile wird als 1 separates Deliverable gespeichert.*\n\nBeispiel:\n\`KEY-1001-XXXX\`\n\`KEY-1002-YYYY\`\n\`KEY-1003-ZZZZ\``, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔴 ❌ Abbrechen', callback_data: `admin_prod_stock_menu_${productId}` }]] }
            });
        } catch (error) { console.error('admin_stock_bulk error:', error.message); }
    });

    bot.action(/^admin_stock_single_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingSingleStock = productId;
            await ctx.reply(`🟢 *Einzelnes Item einlagern für #${productId}*\n\nBitte sende jetzt den Text/Code des neuen Vorrats-Items:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔴 ❌ Abbrechen', callback_data: `admin_prod_stock_menu_${productId}` }]] }
            });
        } catch (error) { console.error('admin_stock_single error:', error.message); }
    });

    bot.action(/^admin_stock_list_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);
            const items = await deliverableRepo.getAvailableItems(productId);

            if (items.length === 0) {
                return uiHelper.updateOrSend(ctx, '📦 Keine verfügbaren Vorräte im Tresor.', {
                    inline_keyboard: [[{ text: '🔴 🔙 Zurück', callback_data: `admin_prod_stock_menu_${productId}` }]]
                });
            }

            let text = `📦 *Verfügbare Vorräte für ${product ? product.name : productId}* (${items.length})\n\n`;
            const keyboard = [];

            items.slice(0, 15).forEach((item, index) => {
                const shortContent = item.content.length > 20 ? item.content.substring(0, 20) + '...' : item.content;
                text += `${index + 1}. \`${shortContent}\`\n`;
                keyboard.push([{ text: `🔴 🗑 Item ${index + 1} löschen`, callback_data: `admin_del_stock_item_${item.id}_${productId}` }]);
            });

            keyboard.push([{ text: '🔴 🔙 Zurück', callback_data: `admin_prod_stock_menu_${productId}` }]);
            await uiHelper.updateOrSend(ctx, text, { inline_keyboard: keyboard });
        } catch (error) { console.error('admin_stock_list error:', error.message); }
    });

    bot.action(/^admin_del_stock_item_([a-zA-Z0-9-]+)_([a-zA-Z0-9-]+)$/, isAdmin, async (ctx) => {
        try {
            const itemId = ctx.match[1];
            const productId = ctx.match[2];
            await deliverableRepo.deleteDeliverable(itemId);
            ctx.answerCbQuery('🗑 Item gelöscht.').catch(() => {});
            ctx.update.callback_query.data = `admin_stock_list_${productId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_del_stock_item error:', error.message); }
    });

    bot.action(/^admin_stock_clear_(.+)$/, isAdmin, async (ctx) => {
        try {
            const productId = ctx.match[1];
            await deliverableRepo.clearAvailableDeliverables(productId);
            ctx.answerCbQuery('🗑 Vorrat komplett geleert!').catch(() => {});
            ctx.update.callback_query.data = `admin_prod_stock_menu_${productId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_stock_clear error:', error.message); }
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

    // ─── KYC LEGITIMIERUNG BEARBEITEN ─────────────────────────────────────────
    bot.action(/^admin_edit_kyc_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId);
            if (!product) return ctx.answerCbQuery('Produkt nicht gefunden.', { show_alert: true });

            const keyboard = {
                inline_keyboard: [
                    [{ text: '❌ Keins', callback_data: `admin_set_kycmode_none_${productId}`, style: 'primary' }],
                    [{ text: '🟡 Optional', callback_data: `admin_set_kycmode_optional_${productId}`, style: 'primary' }],
                    [{ text: '🔴 Pflicht (Verbindlich)', callback_data: `admin_set_kycmode_required_${productId}`, style: 'primary' }],
                    [{ text: '🔙 Zurück zum Produkt', callback_data: `admin_edit_prod_${productId}`, style: 'danger' }]
                ]
            };
            const currentMode = texts.getKycModeLabel ? texts.getKycModeLabel(product.kyc_mode || 'none') : (product.kyc_mode || 'none');
            await uiHelper.updateOrSend(ctx, `🆔 *KYC-Legitimierung bearbeiten für "${product.name}"*\n\nAktueller Status: *${currentMode}*\n\nWähle eine Option:`, keyboard);
        } catch (error) { console.error('admin_edit_kyc error:', error.message); }
    });

    bot.action(/^admin_set_kycmode_(none|optional|required)_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const mode = ctx.match[1];
            const productId = ctx.match[2];
            if (mode === 'none') {
                await productRepo.setProductKyc(productId, 'none', []);
                ctx.update.callback_query.data = `admin_edit_prod_${productId}`;
                return bot.handleUpdate(ctx.update);
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '📸 Selfie des Kunden', callback_data: `admin_set_kyctype_selfie_${productId}_${mode}`, style: 'primary' }],
                    [{ text: '🆔 Personalausweis / ID', callback_data: `admin_set_kyctype_idcard_${productId}_${mode}`, style: 'primary' }],
                    [{ text: '🤳 Selfie mit Ausweis', callback_data: `admin_set_kyctype_selfieid_${productId}_${mode}`, style: 'primary' }],
                    [{ text: '📝 Freitext / Dokument', callback_data: `admin_set_kyctype_custom_${productId}_${mode}`, style: 'primary' }],
                    [{ text: '🔙 Zurück', callback_data: `admin_edit_kyc_${productId}`, style: 'danger' }]
                ]
            };
            const modeText = texts.getKycModeLabel ? texts.getKycModeLabel(mode) : mode;
            await uiHelper.updateOrSend(ctx, `🆔 *KYC-Typ wählen (${modeText})*\n\nWelchen Nachweis muss der Kunde einreichen?`, keyboard);
        } catch (error) { console.error('admin_set_kycmode error:', error.message); }
    });

    bot.action(/^admin_set_kyctype_(selfie|idcard|selfieid|custom)_([a-zA-Z0-9-]+)_(optional|required)$/, isAdmin, async (ctx) => {
        try {
            const rawType = ctx.match[1];
            const productId = ctx.match[2];
            const mode = ctx.match[3];
            const typeMap = { 'selfie': 'selfie', 'idcard': 'id_card', 'selfieid': 'selfie_with_id', 'custom': 'custom' };
            const type = typeMap[rawType] || 'selfie';

            await productRepo.setProductKyc(productId, mode, [type]);
            ctx.answerCbQuery('✅ KYC-Einstellung gespeichert!').catch(() => {});
            ctx.update.callback_query.data = `admin_edit_prod_${productId}`;
            return bot.handleUpdate(ctx.update);
        } catch (error) { console.error('admin_set_kyctype error:', error.message); }
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

    // ─── PRODUKT LÖSCHEN ──────────────────────────────────────────────────────
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
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApproval(product.id, 'DELETE', null, adminName);

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

    bot.action(/^admin_del_prod_confirm_(.+)$/, isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) {
                return ctx.answerCbQuery('⛔ Nur der Master kann endgültig löschen.', { show_alert: true });
            }

            const productId = ctx.match[1];
            const product = await productRepo.getProductById(productId).catch(() => null);
            const productName = product?.name || `ID: ${productId}`;
            const backCb = product ? getBackCb(product) : 'admin_manage_products';

            await productRepo.deleteProduct(productId);
            ctx.answerCbQuery('🗑 Produkt gelöscht.').catch(() => {});

            await uiHelper.updateOrSend(ctx,
                `✅ *Produkt gelöscht*\n\n📦 *${productName}* wurde endgültig entfernt.`,
                { inline_keyboard: [[{ text: '🔙 Zurück zu Produkten', callback_data: backCb }]] }
            );
        } catch (error) {
            console.error('[adminProductActions] admin_del_prod_confirm error:', error.message);
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

    // ─── MESSAGE LISTENER FÜR VORRATS-IMPORT ─────────────────────────────────
    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message?.text) return next();
        const input = ctx.message.text.trim();

        if (input.startsWith('/')) {
            ctx.session.awaitingBulkStock = null;
            ctx.session.awaitingSingleStock = null;
            return next();
        }

        if (ctx.session.awaitingBulkStock) {
            const productId = ctx.session.awaitingBulkStock;
            ctx.session.awaitingBulkStock = null;

            const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) {
                await ctx.reply('⚠️ Keine gültigen Zeilen gefunden.');
                return;
            }

            try {
                const count = await deliverableRepo.addDeliverables(productId, lines);
                await ctx.reply(`✅ *Massen-Import erfolgreich*\n\n📦 *${count} Einheiten* wurden im Tresor-Vorrat eingelagert.`, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Bulk stock error:', error.message);
                await ctx.reply(`❌ Fehler beim Einlagern: ${error.message}`);
            }
            return;
        }

        if (ctx.session.awaitingSingleStock) {
            const productId = ctx.session.awaitingSingleStock;
            ctx.session.awaitingSingleStock = null;

            try {
                const count = await deliverableRepo.addDeliverables(productId, [input]);
                await ctx.reply(`✅ *Item eingelagert*\n\n1 Einheit wurde im Tresor-Vorrat hinterlegt.`, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Single stock error:', error.message);
                await ctx.reply(`❌ Fehler beim Einlagern: ${error.message}`);
            }
            return;
        }

        return next();
    });

};
