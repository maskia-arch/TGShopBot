module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products' }],
            [{ text: '📁 Kategorien verwalten', callback_data: 'admin_manage_categories' }],
            [{ text: '📢 Rundnachricht (Broadcast)', callback_data: 'admin_start_broadcast' }],
            [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders' }],
            [{ text: '👁 Kundenansicht testen', callback_data: 'shop_menu' }],
            [{ text: 'ℹ️ Befehle & Info', callback_data: 'admin_info' }]
        ]
    };
};
