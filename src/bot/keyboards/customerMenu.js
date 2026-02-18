module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '🛍️ Shop durchsuchen', callback_data: 'shop_menu' }],
            [{ text: '🛒 Warenkorb', callback_data: 'cart_view' }],
            [{ text: 'ℹ️ Hilfe', callback_data: 'help_menu' }]
        ]
    };
};
