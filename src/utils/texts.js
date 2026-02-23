const config = require('../config');

module.exports = {
    getHelpText: () =>
        `ℹ️ *Hilfe & Informationen*\n\n` +
        `*Version:* ${config.VERSION}\n\n` +
        `🛍 *Wie kaufe ich hier ein?*\n\n` +
        `1️⃣ *Shop durchsuchen:* Wähle eine Kategorie und ein Produkt.\n` +
        `2️⃣ *In den Warenkorb:* Bestimme die Menge und lege es ab.\n` +
        `3️⃣ *Bestellung aufgeben:* Gehe zum Warenkorb und wähle die Zahlungsart.\n` +
        `4️⃣ *Warten:* Wir bestätigen den Erhalt umgehend!\n\n` +
        `Bei Fragen wende dich an den Support.`,

    getWelcomeText: (isMaster, role) => {
        if (isMaster) return `👑 *Master-Kontrollzentrum* (v${config.VERSION})\n\nSie sind als Systeminhaber angemeldet.`;
        if (role === 'admin') return `🛠 *Admin-Bereich*\n\nVerwalten Sie Produkte und Kategorien.`;
        return `Willkommen beim *Shop Bot*!\n\nBitte wähle eine Option aus dem Menü:`;
    },

    getCartEmptyText: () => `🛒 *Dein Warenkorb*\n\nDein Warenkorb ist aktuell leer. Schau doch mal im Shop vorbei!`,
    getCartContentHeader: () => `🛒 *Dein Warenkorb*\n\nHier sind deine Artikel:`,
    getOutOfStockError: () => `⚠️ Dieses Produkt ist momentan leider ausverkauft.`,
    getCheckoutSelectPayment: () => `💳 *Bezahlung*\nBitte wähle deine bevorzugte Zahlungsart aus:`,

    getCheckoutFinalInstructions: (methodName, address, total) => {
        let text = `🏁 *Bestellung fast abgeschlossen*\n\nGesamtbetrag: *${total}*\nZahlungsart: *${methodName}*\n\n`;
        if (address) {
            text += `Bitte sende den Betrag an folgende Adresse:\n\n\`${address}\`\n\n_(Tippe auf die Adresse, um sie zu kopieren)_`;
        } else {
            text += `Bitte folge den Anweisungen für: *${methodName}*`;
        }
        return text;
    },

    // ── Bestellbenachrichtigungen ──

    getAdminNewOrderNotify: (data) => {
        let text = `🛍 *NEUE BESTELLUNG*\n\n` +
            `📋 Order: /orderid ${data.orderId || 'N/A'}\n` +
            `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
            `💰 Betrag: ${data.total}€\n` +
            `💳 Methode: ${data.paymentName}\n`;
        if (data.deliveryMethod === 'shipping') text += `🚚 Lieferung: Versand\n`;
        else if (data.deliveryMethod === 'pickup') text += `🏪 Lieferung: Abholung\n`;
        if (data.shippingLink) text += `📦 Adresse: [Privnote öffnen](${data.shippingLink})\n`;
        return text;
    },

    getAdminNewProductNotify: (data) =>
        `🔔 *Neues Produkt erstellt*\n\n` +
        `👤 Admin: ${data.adminName}\n📦 Produkt: ${data.productName}\n` +
        `📂 Kategorie: ${data.categoryName}\n⏰ Zeit: ${data.time}\n\nID: #${data.productId}`,

    getBroadcastReport: (data) =>
        `📊 *Broadcast Report*\n\n✅ Zustellungen: ${data.successCount}\n❌ Fehlgeschlagen: ${data.failCount}\n🧹 Blockierte User: ${data.blockCount}`,

    getApprovalRequestText: (data) =>
        `⚖️ *Anfrage zur Freigabe*\n\nTyp: *${data.type}*\nVon: ${data.requestedBy}\nProdukt: ${data.productName}\nNeuer Wert: *${data.newValue}*`,

    getCategoryCreated: (name) => `✅ Kategorie "${name}" erfolgreich erstellt!`,
    getSubcategoryCreated: (name, catName) => `✅ Unterkategorie "${name}" in *${catName}* erstellt!`,
    getPaymentSaved: (name, addr) => `✅ Zahlungsart gespeichert:\n\n*Name:* ${name}\n*Adresse:* ${addr || 'Keine'}\n\nDiese wird Kunden nun beim Checkout angezeigt.`,
    getGeneralError: () => `❌ Hoppla! Ein Fehler ist aufgetreten. Bitte versuche es später erneut.`,
    getActionCanceled: () => `❌ Vorgang wurde abgebrochen.`,

    // ── Receipts & Status ──

    getOrderReceipt: (data) => {
        let text = `🧾 *Bestellbestätigung*\n\n📋 *Order-ID:* /orderid ${data.orderId}\n` +
            `💰 *Betrag:* ${data.total}€\n💳 *Zahlungsart:* ${data.paymentName}\n📦 *Status:* ${data.status || 'Offen'}\n`;
        if (data.deliveryMethod === 'shipping') text += `🚚 *Lieferung:* Versand\n`;
        else if (data.deliveryMethod === 'pickup') text += `🏪 *Lieferung:* Abholung\n`;
        text += `\nDeine Bestellung wird bearbeitet.`;
        return text;
    },

    getStatusUpdateText: (orderId, newStatus) => {
        const label = module.exports.getStatusLabel(newStatus);
        return `🔔 *Status-Update*\n\nDeine Bestellung /orderid ${orderId} wurde aktualisiert:\n\n*Neuer Status:* ${label}`;
    },

    getStatusLabel: (status) => {
        const map = {
            'offen': '📬 Offen', 'in_bearbeitung': '⚙️ In Bearbeitung',
            'versand': '📦 Versendet', 'abgeschlossen': '✅ Abgeschlossen', 'abgebrochen': '❌ Abgebrochen'
        };
        return map[status] || status;
    },

    getDeliveryLabel: (option) => {
        const map = { 'none': '📱 Digital/Kein Versand', 'shipping': '🚚 Versand', 'pickup': '🏪 Abholung', 'both': '🚚🏪 Versand & Abholung' };
        return map[option] || option;
    },

    // ── Info Panels ──

    getAdminInfoText: () =>
        `ℹ️ *Admin-Befehle & Funktionen*\n\n` +
        `*/start* – Bot neu starten\n` +
        `*/orderid [ORD-XXXXX]* – Bestellung abrufen\n` +
        `*/deleteid [ORD-XXXXX]* – Bestellung löschen\n` +
        `*/orders* – Alle Bestellungen anzeigen\n` +
        `*/ban [TelegramID]* – User sperren\n\n` +
        `*Panel-Funktionen:*\n` +
        `📦 Produkte verwalten\n📁 Kategorien & Unterkategorien\n📢 Rundnachrichten\n🚚 Lieferoptionen pro Produkt`,

    getMasterInfoText: () =>
        `ℹ️ *Master-Befehle & Funktionen*\n\n` +
        `*/start* – Bot neu starten\n` +
        `*/addadmin [TelegramID]* – Admin hinzufügen\n` +
        `*/orderid [ORD-XXXXX]* – Bestellung abrufen\n` +
        `*/deleteid [ORD-XXXXX]* – Bestellung löschen\n` +
        `*/orders* – Alle Bestellungen anzeigen\n` +
        `*/ban [TelegramID]* – User sperren\n\n` +
        `*Master-Panel:*\n` +
        `👥 Admins verwalten\n✅ Freigaben\n💳 Zahlungsarten\n📊 Kundenübersicht`,

    // ── Shipping ──

    getShippingAddressPrompt: () =>
        `📦 *Versandadresse erforderlich*\n\n` +
        `⚠️ *Bitte sende deine Adresse als Privnote-Link!*\n\n` +
        `So geht's:\n1. Gehe auf https://privnote.com\n2. Schreibe dort deine Adresse rein\n3. Erstelle die Notiz und kopiere den Link\n4. Sende den Link hier\n\n` +
        `_Klartext-Adressen werden aus Sicherheitsgründen nicht akzeptiert._`,

    getShippingPlaintextWarning: () =>
        `🚫 *Keine Klartext-Adressen!*\n\nBitte nutze https://privnote.com und sende uns den generierten Link.`,

    getDeliveryChoicePrompt: () =>
        `🚚 *Wie möchtest du deine Bestellung erhalten?*\n\nBitte wähle eine Lieferoption:`,

    // ── Kunden-Bestellübersicht ──

    getMyOrdersHeader: () => `📋 *Meine Bestellungen*\n\nHier siehst du den aktuellen Stand:`,
    getMyOrdersEmpty: () => `📋 *Meine Bestellungen*\n\nDu hast aktuell keine aktiven Bestellungen.`,

    getPingSent: () => `✅ *Ping gesendet!*\n\nDas Team wurde benachrichtigt.`,
    getPingCooldown: () => `⏰ Du kannst nur einmal pro 24 Stunden einen Ping senden.`,
    getContactSent: () => `✅ *Kontaktanfrage gesendet!*\n\nEin Admin wird sich bei dir melden.`,
    getContactCooldown: () => `⏰ Du kannst nur einmal pro 24 Stunden eine Kontaktanfrage senden.`,
    getContactPrompt: () => `✍️ *Kontaktanfrage*\n\nBitte beschreibe kurz dein Anliegen (max. 500 Zeichen):`,

    // ── Ban ──

    getBanConfirmation: (userId) => `🔨 *User gesperrt*\n\nUser ${userId} wurde gebannt.\nDer Master hat 48h Zeit dies rückgängig zu machen.`,
    getBanAlreadyBanned: () => `⚠️ Dieser User ist bereits gesperrt.`,
    getBanSelfError: () => `⚠️ Du kannst dich nicht selbst bannen.`,
    getBanMasterError: () => `⚠️ Der Master kann nicht gebannt werden.`,
    getBannedMessage: () => `🚫 Du wurdest gesperrt und kannst diesen Bot nicht mehr verwenden.`,
    getMasterBanNotify: (data) =>
        `🔨 *Ban-Benachrichtigung*\n\n👤 Gesperrt: User ${data.userId}\n🔑 Von: ${data.bannedBy}\n⏰ ${data.time}\n⏳ Auto-Bestätigung in 48h`,
    getBanReverted: (userId) => `↩️ Ban für User ${userId} wurde rückgängig gemacht.`,
    getBanConfirmed: (userId) => `✅ Ban für User ${userId} bestätigt. Alle Daten gelöscht.`,

    // ── Notizen / Ping ──

    getNoteAdded: (orderId) => `✅ Notiz zu Bestellung \`${orderId}\` hinzugefügt.`,

    getAdminPingNotify: (data) =>
        `🔔 *Kunden-Ping*\n\n👤 ${data.username} (ID: ${data.userId})\n📋 /orderid ${data.orderId}\n\nDer Kunde wartet auf ein Update.`,

    getAdminContactNotify: (data) =>
        `💬 *Kontaktanfrage*\n\n👤 ${data.username} (ID: ${data.userId})\n📋 /orderid ${data.orderId}\n\n*Nachricht:*\n${data.message}`,

    // ── Orders ──

    getOrdersListHeader: () => `📋 *Alle Bestellungen*\n`,
    getOrdersEmpty: () => `📋 Keine Bestellungen vorhanden.`,
    getOrdersDeletedAll: () => `🗑 Alle Bestellungen wurden gelöscht.`,
    getOrderDeleted: (id) => `🗑 Bestellung \`${id}\` wurde gelöscht.`
};
