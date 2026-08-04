const formatters = require('./formatters');

async function clearOldNotifications(ctx, order) {
    if (!order || !order.notification_msg_ids || !Array.isArray(order.notification_msg_ids)) return;
    for (const msgObj of order.notification_msg_ids) {
        try {
            await ctx.telegram.deleteMessage(msgObj.chat_id, msgObj.message_id).catch(() => {});
        } catch (e) {}
    }
}

function buildAdminOrderView(order) {
    const method = order.delivery_method || 'none';
    let methodText = '⚡ *Digital / Automatisch*';
    if (method === 'shipping') methodText = '🚚 *Versand an Adresse*';
    if (method === 'pickup') methodText = '🏪 *Abholung vor Ort*';

    const statusBadge = order.status === 'abgeschlossen' ? '🟢 Abgeschlossen' : 
                        (order.status === 'abgebrochen' ? '🔴 Abgebrochen' : 
                        (order.status === 'in_bearbeitung' ? '⚙️ In Bearbeitung' : '🟡 Offen'));

    let text = `📋 *Bestellung #${order.order_id}*\n\n`;
    text += `👤 *Kunde:* \`${order.user_id}\`\n`;
    text += `💰 *Gesamtsumme:* ${formatters.formatPrice(order.total_amount)}\n`;
    text += `💳 *Zahlungsart:* ${order.payment_method_name || 'Nicht angegeben'}\n`;
    if (order.crypto_amount) text += `🪙 *Krypto-Betrag:* \`${order.crypto_amount}\`\n`;
    if (order.payment_identifier) text += `📌 *Kennziffer:* \`${order.payment_identifier}\`\n`;
    text += `🚚 *Lieferart:* ${methodText}\n`;
    text += `📊 *Status:* ${statusBadge}\n`;

    if (order.tx_id) text += `🔗 *TX-ID:* \`${order.tx_id}\`\n`;

    if (order.kyc_submission) {
        const kyc = order.kyc_submission;
        const optLabel = kyc.option === 'selfie' ? '📸 Selfie' : (kyc.option === 'id_card' ? '🆔 Personalausweis' : (kyc.option === 'selfie_with_id' ? '🤳 Selfie mit Ausweis' : '📝 Dokument'));
        text += `🆔 *KYC-Legitimierung:* ${optLabel} übermittelt ✅\n`;
    }

    if (method === 'shipping' && order.shipping_link) {
        text += `\n📍 *Versandadresse (Privnote):*\n${order.shipping_link}\n`;
    }

    if (order.digital_delivery) {
        text += `\n🔐 *Gelieferte Tresor-Daten:*\n${order.digital_delivery}\n`;
    }

    if (order.admin_notes && order.admin_notes.length > 0) {
        text += `\n📝 *Admin-Notizen:*\n`;
        order.admin_notes.forEach(n => {
            text += `▪️ _${n.admin}_: ${n.note}\n`;
        });
    }

    if (order.details && Array.isArray(order.details) && order.details.length > 0) {
        text += `\n📦 *Artikel:*\n`;
        order.details.forEach(item => {
            const path = item.category_path ? `_${item.category_path}_ » ` : '';
            text += `\n▪️ ${item.quantity}x ${path}${item.name} = ${formatters.formatPrice(item.total)}`;
        });
    }

    const keyboard = { inline_keyboard: [] };
    keyboard.inline_keyboard.push([{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${order.user_id}`, style: 'primary' }]);
    if (order.kyc_submission && order.kyc_submission.fileId) {
        keyboard.inline_keyboard.push([{ text: '🆔 KYC-Selfie / Medium anzeigen', callback_data: `admin_view_kyc_${order.order_id}`, style: 'primary' }]);
    }
    if (method === 'none' || !method) {
        keyboard.inline_keyboard.push([
            { text: '🔐 Aus dem Tresor liefern', callback_data: `odeliv_vault_${order.order_id}`, style: 'success' },
            { text: '📥 Manuell eingeben', callback_data: `odeliv_manual_${order.order_id}`, style: 'success' }
        ]);
    }
    keyboard.inline_keyboard.push(
        [{ text: '⚙️ In Bearbeitung', callback_data: `ostatus_${order.order_id}_processing`, style: 'primary' }, { text: '📦 Versendet', callback_data: `ostatus_${order.order_id}_versand`, style: 'primary' }],
        [{ text: '✅ Abgeschlossen', callback_data: `ostatus_${order.order_id}_abgeschlossen`, style: 'success' }, { text: '❌ Abgebrochen', callback_data: `ostatus_${order.order_id}_abgebrochen`, style: 'danger' }]
    );
    if (order.feedback_invited) {
        keyboard.inline_keyboard.push([{ text: '✅ Für Feedback qualifiziert', callback_data: 'noop', style: 'success' }]);
    } else {
        keyboard.inline_keyboard.push([{ text: '⭐ Feedback erlauben', callback_data: `allow_fb_${order.order_id}`, style: 'success' }]);
    }
    keyboard.inline_keyboard.push(
        [{ text: '📝 Notiz', callback_data: `onote_${order.order_id}`, style: 'primary' }],
        [{ text: '🗑 Löschen', callback_data: `odel_${order.order_id}`, style: 'danger' }],
        [{ text: '🔙 Zurück zum Panel', callback_data: 'admin_open_orders', style: 'danger' }]
    );
    return { text, reply_markup: keyboard };
}

module.exports = {
    clearOldNotifications,
    buildAdminOrderView,
    buildOrderViewPayload: buildAdminOrderView
};
