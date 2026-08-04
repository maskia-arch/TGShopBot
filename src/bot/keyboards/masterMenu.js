module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '📦 Sortiment verwalten', callback_data: 'admin_manage_catalog_hub', style: 'primary' }],
            [{ text: '📋 Bestellungen & Tresor', callback_data: 'master_orders_hub', style: 'primary' }],
            [{ text: '👥 Kunden & Marketing', callback_data: 'master_customers_hub', style: 'primary' }],
            [{ text: '⚙️ Einstellungen & Personal', callback_data: 'master_settings_hub', style: 'primary' }],
            [{ text: '👁️ Kundenansicht testen', callback_data: 'shop_menu', style: 'primary' }],
            [{ text: 'ℹ️ Befehle & Info', callback_data: 'master_info', style: 'primary' }]
        ]
    };
};
