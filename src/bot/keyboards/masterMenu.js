module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '👥 Admins verwalten', callback_data: 'master_manage_admins' }],
            [{ text: '✅ Ausstehende Freigaben', callback_data: 'master_pending_approvals' }],
            [{ text: '💳 Zahlungsarten verwalten', callback_data: 'master_manage_payments' }],
            [{ text: '📊 Kundenübersicht', callback_data: 'master_customer_overview' }],
            [{ text: '🛠️ Admin Panel öffnen', callback_data: 'admin_panel' }]
        ]
    };
};
