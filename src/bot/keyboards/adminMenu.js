module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products' }],
            [{ text: '📁 Kategorien verwalten', callback_data: 'admin_manage_categories' }],
            [{ text: '🛒 Kundenansicht testen', callback_data: 'shop_menu' }]
        ]
    };
};
