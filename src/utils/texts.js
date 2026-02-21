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
    getAddToCartSuccess: (name) => `✅ ${name} wurde zum Warenkorb hinzugefügt!`,
    getQuantitySuccess: (qty) => `✅ *${qty}x zum Warenkorb hinzugefügt!*\n\nWie möchtest du fortfahren?`,
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

    getAdminNewOrderNotify: (data) =>
        `🛍 *NEUE BESTELLUNG*\n\n` +
        `📋 Order: *${data.orderId || 'N/A'}*\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `💰 Betrag: ${data.total}€\n` +
        `💳 Methode: ${data.paymentName}\n` +
        (data.shippingLink ? `📦 Versandadresse: [Privnote öffnen](${data.shippingLink})\n` : '') +
        `\nDetailinfos via /id ${data.orderId || ''}`,

    getAdminNewProductNotify: (data) =>
        `🔔 *Neues Produkt erstellt*\n\n` +
        `👤 Admin: ${data.adminName}\n` +
        `📦 Produkt: ${data.productName}\n` +
        `📂 Kategorie: ${data.categoryName}\n` +
        `⏰ Zeit: ${data.time}\n\n` +
        `ID: #${data.productId}`,

    getBroadcastReport: (data) =>
        `📊 *Broadcast Report*\n\n` +
        `✅ Zustellungen: ${data.successCount}\n` +
        `❌ Fehlgeschlagen: ${data.failCount}\n` +
        `🧹 Blockierte User erkannt: ${data.blockCount}`,

    getApprovalRequestText: (data) =>
        `⚖️ *Anfrage zur Freigabe*\n\n` +
        `Typ: *${data.type}*\n` +
        `Von: ${data.requestedBy}\n` +
        `Produkt: ${data.productName}\n` +
        `Neuer Wert: *${data.newValue}*`,

    getCategoryCreated: (name) => `✅ Kategorie "${name}" erfolgreich erstellt!`,
    getSubcategoryCreated: (name, catName) => `✅ Unterkategorie "${name}" in *${catName}* erstellt!`,

    getPaymentSaved: (name, addr) => `✅ Zahlungsart gespeichert:\n\n*Name:* ${name}\n*Adresse:* ${addr || 'Keine'}\n\nDiese wird Kunden nun beim Checkout angezeigt.`,

    getGeneralError: () => `❌ Hoppla! Ein Fehler ist aufgetreten. Bitte versuche es später erneut.`,
    getActionCanceled: () => `❌ Vorgang wurde abgebrochen.`,

    // ── v0.3.0: Receipts & Status ──

    getOrderReceipt: (data) =>
        `🧾 *Bestellbestätigung*\n\n` +
        `📋 *Order-ID:* \`${data.orderId}\`\n` +
        `💰 *Betrag:* ${data.total}€\n` +
        `💳 *Zahlungsart:* ${data.paymentName}\n` +
        `📦 *Status:* ${data.status || 'Offen'}\n\n` +
        `Deine Bestellung wird bearbeitet. Du wirst benachrichtigt, wenn sich der Status ändert.`,

    getStatusUpdateText: (orderId, newStatus) => {
        const statusMap = {
            'offen': '📬 Offen',
            'in_bearbeitung': '⚙️ In Bearbeitung',
            'versand': '📦 Versendet',
            'abgeschlossen': '✅ Abgeschlossen',
            'abgebrochen': '❌ Abgebrochen'
        };
        const label = statusMap[newStatus] || newStatus;
        return `🔔 *Status-Update*\n\nDeine Bestellung \`${orderId}\` wurde aktualisiert:\n\n*Neuer Status:* ${label}`;
    },

    getStatusLabel: (status) => {
        const map = {
            'offen': '📬 Offen',
            'in_bearbeitung': '⚙️ In Bearbeitung',
            'versand': '📦 Versendet',
            'abgeschlossen': '✅ Abgeschlossen',
            'abgebrochen': '❌ Abgebrochen'
        };
        return map[status] || status;
    },

    // ── v0.3.0: Info Panel ──

    getAdminInfoText: () =>
        `ℹ️ *Admin-Befehle & Funktionen*\n\n` +
        `*/start* – Bot neu starten\n` +
        `*/id [ORD-XXXXX]* – Bestellung abrufen\n` +
        `*/deleteid [ORD-XXXXX]* – Bestellung löschen\n` +
        `*/orders* – Alle Bestellungen anzeigen\n` +
        `*/ban [TelegramID]* – User sperren\n\n` +
        `*Panel-Funktionen:*\n` +
        `📦 Produkte verwalten (hinzufügen, bearbeiten, löschen)\n` +
        `📁 Kategorien & Unterkategorien\n` +
        `📢 Rundnachrichten senden\n` +
        `🚚 Versand pro Produkt aktivieren`,

    getMasterInfoText: () =>
        `ℹ️ *Master-Befehle & Funktionen*\n\n` +
        `*/start* – Bot neu starten\n` +
        `*/addadmin [TelegramID]* – Admin hinzufügen\n` +
        `*/id [ORD-XXXXX]* – Bestellung abrufen\n` +
        `*/deleteid [ORD-XXXXX]* – Bestellung löschen\n` +
        `*/orders* – Alle Bestellungen anzeigen\n` +
        `*/ban [TelegramID]* – User sperren\n\n` +
        `*Master-Panel:*\n` +
        `👥 Admins verwalten\n` +
        `✅ Freigaben bearbeiten\n` +
        `💳 Zahlungsarten\n` +
        `📊 Kundenübersicht\n` +
        `🛠️ Admin Panel (vollständig)`,

    // ── v0.3.1: Versand ──

    getShippingAddressPrompt: () =>
        `📦 *Versandadresse erforderlich*\n\n` +
        `Mindestens ein Produkt in deinem Warenkorb erfordert einen Versand.\n\n` +
        `⚠️ *Bitte sende deine Adresse als Privnote-Link!*\n\n` +
        `So geht's:\n` +
        `1. Gehe auf https://privnote.com\n` +
        `2. Schreibe dort deine Adresse rein\n` +
        `3. Erstelle die Notiz und kopiere den Link\n` +
        `4. Sende den Link hier\n\n` +
        `_Klartext-Adressen werden aus Sicherheitsgründen nicht akzeptiert._`,

    getShippingInvalidLink: () =>
        `⚠️ *Ungültiger Link!*\n\n` +
        `Bitte sende einen gültigen Privnote-Link.\n` +
        `Der Link muss mit \`https://privnote.com/\` beginnen.\n\n` +
        `_Klartext-Adressen werden nicht akzeptiert!_`,

    getShippingPlaintextWarning: () =>
        `🚫 *Keine Klartext-Adressen!*\n\n` +
        `Aus Sicherheitsgründen akzeptieren wir nur Privnote-Links.\n\n` +
        `Bitte nutze https://privnote.com um deine Adresse zu verschlüsseln und sende uns den generierten Link.`,

    // ── v0.3.1: Kunden-Bestellübersicht ──

    getMyOrdersHeader: () => `📋 *Meine Bestellungen*\n\nHier siehst du den aktuellen Stand deiner Bestellungen:`,

    getMyOrdersEmpty: () => `📋 *Meine Bestellungen*\n\nDu hast aktuell keine aktiven Bestellungen.`,

    getPingSent: () => `✅ *Ping gesendet!*\n\nDas Team wurde benachrichtigt. Bitte habe etwas Geduld.`,
    getPingCooldown: () => `⏰ Du kannst nur einmal pro 24 Stunden einen Ping senden.`,

    getContactSent: () => `✅ *Kontaktanfrage gesendet!*\n\nEin Admin wird sich bei dir melden.`,
    getContactCooldown: () => `⏰ Du kannst nur einmal pro 24 Stunden eine Kontaktanfrage senden.`,
    getContactPrompt: () => `✍️ *Kontaktanfrage*\n\nBitte beschreibe kurz dein Anliegen (max. 500 Zeichen):`,

    // ── v0.3.1: Ban System ──

    getBanConfirmation: (userId) => `🔨 *User gesperrt*\n\nUser ${userId} wurde gebannt.\n\nDer Master erhält eine Benachrichtigung und hat 48h Zeit, dies rückgängig zu machen. Danach werden alle Daten endgültig gelöscht.`,

    getBanAlreadyBanned: () => `⚠️ Dieser User ist bereits gesperrt.`,
    getBanSelfError: () => `⚠️ Du kannst dich nicht selbst bannen.`,
    getBanMasterError: () => `⚠️ Der Master kann nicht gebannt werden.`,
    getBanNotFound: () => `⚠️ User nicht in der Datenbank gefunden.`,

    getBannedMessage: () => `🚫 Du wurdest gesperrt und kannst diesen Bot nicht mehr verwenden.`,

    getMasterBanNotify: (data) =>
        `🔨 *Ban-Benachrichtigung*\n\n` +
        `👤 Gesperrt: User ${data.userId}\n` +
        `🔑 Gesperrt von: ${data.bannedBy}\n` +
        `⏰ Erstellt: ${data.time}\n` +
        `⏳ Auto-Bestätigung in: 48 Stunden\n\n` +
        `Nach Ablauf werden alle Daten des Users endgültig gelöscht.`,

    getBanReverted: (userId) => `↩️ Ban für User ${userId} wurde rückgängig gemacht.`,
    getBanConfirmed: (userId) => `✅ Ban für User ${userId} bestätigt. Alle Daten wurden gelöscht.`,

    // ── v0.3.1: Admin Notizen ──

    getNoteAdded: (orderId) => `✅ Notiz zu Bestellung \`${orderId}\` hinzugefügt.`,

    // ── v0.3.1: Ping/Kontakt Benachrichtigungen ──

    getAdminPingNotify: (data) =>
        `🔔 *Kunden-Ping*\n\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `📋 Bestellung: \`${data.orderId}\`\n\n` +
        `Der Kunde wartet auf ein Update.`,

    getAdminContactNotify: (data) =>
        `💬 *Kontaktanfrage*\n\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `📋 Bestellung: \`${data.orderId}\`\n\n` +
        `*Nachricht:*\n${data.message}`,

    // ── v0.3.1: /orders Befehl ──

    getOrdersListHeader: () => `📋 *Alle Bestellungen*\n`,

    getOrdersEmpty: () => `📋 Keine Bestellungen vorhanden.`,

    getOrdersDeletedAll: () => `🗑 Alle Bestellungen wurden gelöscht.`,
    getOrderDeleted: (id) => `🗑 Bestellung \`${id}\` wurde gelöscht.`
};
