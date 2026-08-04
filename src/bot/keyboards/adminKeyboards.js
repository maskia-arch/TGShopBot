const formatters = require('../../utils/formatters');
const masterMenu = require('./masterMenu');

module.exports = {
    getAdminMenu: (isMaster) => {
        if (isMaster) return masterMenu();
        const kb = [
            [{ text: '📦 Sortiment verwalten', callback_data: 'admin_manage_catalog_hub', style: 'primary' }],
            [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders', style: 'primary' }],
            [{ text: '📢 Rundnachricht senden', callback_data: 'admin_start_broadcast', style: 'primary' }],
            [{ text: '👁️ Kundenansicht testen', callback_data: 'shop_menu', style: 'primary' }],
            [{ text: 'ℹ️ Befehle & Info', callback_data: 'admin_info', style: 'primary' }]
        ];
        return { inline_keyboard: kb };
    },

    getCatalogHubMenu: (backCb = 'admin_panel') => ({
        inline_keyboard: [
            [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products', style: 'primary' }],
            [{ text: '📁 Kategorien & Unterkategorien', callback_data: 'admin_manage_categories', style: 'primary' }],
            [{ text: '🔙 Zurück', callback_data: backCb, style: 'danger' }]
        ]
    }),

    getBackToAdminPanel: () => ({
        inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel', style: 'danger' }]]
    }),

    getManageCategoriesMenu: (categories) => {
        const kb = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_edit_cat_${c.id}`, style: 'primary' }]));
        kb.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category', style: 'success' }]);
        kb.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_catalog_hub', style: 'danger' }]);
        return { inline_keyboard: kb };
    },

    getEditCategoryMenu: (categoryId, subcats) => {
        const kb = [];
        if (subcats && subcats.length > 0) {
            subcats.forEach(sc => {
                kb.push([{ text: `📂 ${sc.name}`, callback_data: `admin_edit_subcat_${sc.id}`, style: 'primary' }]);
            });
        }
        kb.push(
            [{ text: '✏️ Namen ändern', callback_data: `admin_rename_cat_${categoryId}`, style: 'primary' }],
            [{ text: '📂 Unterkategorie hinzufügen', callback_data: `admin_add_subcat_${categoryId}`, style: 'success' }],
            [
                { text: '🔼 Hoch', callback_data: `admin_sort_cat_up_${categoryId}`, style: 'primary' },
                { text: '🔽 Runter', callback_data: `admin_sort_cat_down_${categoryId}`, style: 'primary' }
            ],
            [{ text: '🗑 Löschen', callback_data: `admin_del_cat_${categoryId}`, style: 'danger' }],
            [{ text: '🔙 Zurück', callback_data: 'admin_manage_categories', style: 'danger' }]
        );
        return { inline_keyboard: kb };
    },

    getEditSubcategoryMenu: (subcat) => ({
        inline_keyboard: [
            [{ text: '✏️ Umbenennen', callback_data: `admin_rename_subcat_${subcat.id}`, style: 'primary' }],
            [
                { text: '🔼 Hoch', callback_data: `admin_sort_subcat_up_${subcat.id}`, style: 'primary' },
                { text: '🔽 Runter', callback_data: `admin_sort_subcat_down_${subcat.id}`, style: 'primary' }
            ],
            [{ text: '🗑 Löschen', callback_data: `admin_del_subcat_${subcat.id}`, style: 'danger' }],
            [{ text: '🔙 Zurück', callback_data: `admin_edit_cat_${subcat.category_id}`, style: 'danger' }]
        ]
    }),

    getManageProductsMenu: (categories) => {
        const kb = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_prod_cat_${c.id}`, style: 'primary' }]));
        kb.push([{ text: '📦 Kategorielose Produkte', callback_data: 'admin_prod_cat_none', style: 'primary' }]);
        kb.push([{ text: '➕ Neues Produkt', callback_data: 'admin_add_prod_none', style: 'success' }]);
        kb.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_catalog_hub', style: 'danger' }]);
        return { inline_keyboard: kb };
    },

    getProductCategoryMenu: (categoryId, subcats, directProducts) => {
        const kb = [];
        if (subcats && subcats.length > 0) {
            subcats.forEach(sc => {
                kb.push([{ text: `📂 ${sc.name}`, callback_data: `admin_prod_subcat_${sc.id}`, style: 'primary' }]);
            });
        }
        if (directProducts && directProducts.length > 0) {
            directProducts.forEach(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                const opt = p.delivery_option || 'none';
                if (opt === 'shipping') label = `🚚 ${label}`;
                else if (opt === 'pickup') label = `🏪 ${label}`;
                else if (opt === 'both') label = `🚚🏪 ${label}`;
                kb.push([{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}`, style: 'primary' }]);
            });
        }
        kb.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_${categoryId || 'none'}`, style: 'success' }]);
        kb.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products', style: 'danger' }]);
        return { inline_keyboard: kb };
    },

    getProductSubcategoryMenu: (subcat, products) => {
        const kb = products.map(p => {
            let label = p.name;
            if (!p.is_active) label = `👻 ${label}`;
            if (p.is_out_of_stock) label = `❌ ${label}`;
            const opt = p.delivery_option || 'none';
            if (opt === 'shipping') label = `🚚 ${label}`;
            else if (opt === 'pickup') label = `🏪 ${label}`;
            else if (opt === 'both') label = `🚚🏪 ${label}`;
            return [{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}`, style: 'primary' }];
        });
        const backCb = subcat ? `admin_prod_cat_${subcat.category_id}` : 'admin_manage_products';
        kb.push([{ text: '🔙 Zurück', callback_data: backCb, style: 'danger' }]);
        return { inline_keyboard: kb };
    },

    getEditProductMenu: (product, deliveryLabel, backCb, stockCount = 0) => {
        const kb = [
            [
                { text: product.is_active ? '👻 Deaktivieren' : '✅ Aktivieren', callback_data: `admin_toggle_active_${product.id}`, style: product.is_active ? 'danger' : 'success' },
                { text: product.is_out_of_stock ? '📦 Verfügbar' : '❌ Ausverkauft', callback_data: `admin_toggle_stock_${product.id}`, style: product.is_out_of_stock ? 'success' : 'danger' }
            ],
            [{ text: `🔐 Tresor-Vorrat (${stockCount} verfügbar)`, callback_data: `admin_prod_stock_menu_${product.id}`, style: 'primary' }],
            [{ text: `🚚 Lieferoption: ${deliveryLabel}`, callback_data: `admin_cycle_delivery_${product.id}`, style: 'primary' }]
        ];

        const opt = product.delivery_option || 'none';
        if (opt === 'shipping' || opt === 'both') {
            const kycLabel = product.kyc_mode === 'required' ? '🔴 Pflicht' : (product.kyc_mode === 'optional' ? '🟡 Optional' : '❌ Keins');
            kb.push([{ text: `🆔 KYC: ${kycLabel} (bearbeiten)`, callback_data: `admin_edit_kyc_${product.id}`, style: 'primary' }]);
        }

        kb.push(
            [{ text: '💰 Preis ändern', callback_data: `admin_price_${product.id}`, style: 'primary' }],
            [{ text: '✏️ Umbenennen', callback_data: `admin_rename_prod_${product.id}`, style: 'primary' }],
            [{ text: '📝 Beschreibung bearbeiten', callback_data: `admin_desc_${product.id}`, style: 'primary' }],
            [{ text: '🖼 Bild ändern', callback_data: `admin_img_${product.id}`, style: 'primary' }],
            [
                { text: '🔼 Nach oben', callback_data: `admin_sort_prod_up_${product.id}`, style: 'primary' },
                { text: '🔽 Nach unten', callback_data: `admin_sort_prod_down_${product.id}`, style: 'primary' }
            ],
            [{ text: '🗑 Löschen', callback_data: `admin_del_prod_${product.id}`, style: 'danger' }],
            [{ text: '🔙 Zurück', callback_data: backCb, style: 'danger' }]
        );
        return { inline_keyboard: kb };
    },

    getTresorStockMenu: (product, stockCount = 0) => {
        const kb = [
            [{ text: '➕ Massen-Import (Zeilenweise)', callback_data: `admin_stock_bulk_${product.id}`, style: 'success' }],
            [{ text: '➕ Einzelnes Item hinzufügen', callback_data: `admin_stock_single_${product.id}`, style: 'success' }]
        ];
        if (stockCount > 0) {
            kb.push([{ text: '📋 Vorrat auflisten', callback_data: `admin_stock_list_${product.id}`, style: 'primary' }]);
            kb.push([{ text: '🗑 Vorrat leeren', callback_data: `admin_stock_clear_${product.id}`, style: 'danger' }]);
        }
        kb.push([{ text: '🔙 Zurück zum Produkt', callback_data: `admin_edit_prod_${product.id}`, style: 'danger' }]);
        return { inline_keyboard: kb };
    },

    getCancelBackToProduct: (productId) => ({
        inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `admin_edit_prod_${productId}`, style: 'danger' }]]
    })
};
