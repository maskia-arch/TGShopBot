module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '👥 Admins verwalten', callback_data: 'master_manage_admins' }],
            [{ text: '✅ Ausstehende Freigaben', callback_data: 'master_pending_approvals' }],
            [{ text: '💳 Zahlungsarten verwalten', callback_data: 'master_manage_payments' }],
            [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders' }],
            [{ text: '📊 Kundenübersicht', callback_data: 'master_customer_overview' }],
            [{ text: '📝 Begrüßungsnachricht', callback_data: 'master_edit_welcome_msg' }],
            [{ text: '🛠️ Admin Panel öffnen', callback_data: 'admin_panel' }],
            [{ text: 'ℹ️ Befehle & Info', callback_data: 'master_info' }]
        ]
    };
};
