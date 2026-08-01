module.exports = (hasOrders = false) => {
    const keyboard = {
        inline_keyboard: [
            [{ text: '🛍️ Shop durchsuchen', callback_data: 'shop_menu' }],
            [{ text: '🛒 Warenkorb', callback_data: 'cart_view' }]
        ]
    };

    if (hasOrders) {
        keyboard.inline_keyboard.push([{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]);
    }

    keyboard.inline_keyboard.push([{ text: '⭐ Feedbacks', callback_data: 'view_feedbacks' }]);
    keyboard.inline_keyboard.push([{ text: 'ℹ️ Info & Hilfe', callback_data: 'help_menu' }]);

    return keyboard;
};
