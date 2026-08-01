const config = require('../config');

module.exports = {
    getHelpText: () =>
        `ℹ️ *Hilfe & Befehle*\n\n` +
        `*Version:* ${config.VERSION}\n\n` +
        `🛍 *Wie kaufe ich hier ein?*\n\n` +
        `1️⃣ *Shop durchsuchen:* Wähle eine Kategorie und ein Produkt.\n` +
        `2️⃣ *In den Warenkorb:* Bestimme die Menge und lege es ab.\n` +
        `3️⃣ *Bestellung aufgeben:* Gehe zum Warenkorb und wähle die Zahlungsart.\n` +
        `4️⃣ *Bezahlen:* Überweise den Betrag und bestätige mit der TX-ID.\n` +
        `5️⃣ *Warten:* Wir bestätigen den Erhalt umgehend!\n\n` +
        `📋 *Deine Befehle:*\n` +
        `*/myorders* – Deine Bestellungen direkt aufrufen\n` +
        `*/feedbacks* – Shop-Bewertungen anzeigen\n\n` +
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

    getAdminInterestNotify: (data) =>
        `👀 *KAUFINTERESSE*\n\n` +
        `👤 Kunde: ${data.username}\n` +
        `💰 Warenkorb: ${data.total}\n` +
        `💳 Gewählte Methode: ${data.paymentName}\n\n` +
        `_Kunde befindet sich gerade im Checkout._`,

    getAdminNewOrderNotify: (data) => {
        let text = `🛍 *NEUE BESTELLUNG*\n\n` +
            `📋 Order: /${data.orderId}\n` +
            `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
            `💰 Betrag: ${data.total}\n` +
            `💳 Methode: ${data.paymentName}\n`;
        if (data.deliveryMethod === 'shipping') text += `🚚 Lieferung: Versand\n`;
        else if (data.deliveryMethod === 'pickup') text += `🏪 Lieferung: Abholung\n`;
        if (data.shippingLink) text += `📦 Adresse: [Privnote öffnen](${data.shippingLink})\n`;
        text += `\n📦 Status: *Offen* – Warte auf Zahlung`;
        return text;
    },

    getAdminTxIdNotify: (data) =>
        `💸 *ZAHLUNG ÜBERMITTELT*\n\n` +
        `📋 Order: /${data.orderId}\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `💰 Betrag: ${data.total}\n` +
        `💳 Methode: ${data.paymentName}\n` +
        `🔑 TX-ID: \`${data.txId}\`\n\n` +
        `⚠️ *Bitte Zahlungseingang prüfen!*`,

    getAdminNewProductNotify: (data) =>
        `🔔 *Neues Produkt erstellt*\n\n` +
        `👤 Admin: ${data.adminName}\n📦 Produkt: ${data.productName}\n` +
        `📂 Kategorie: ${data.categoryName}\n⏰ Zeit: ${data.time}\n\nID: #${data.productId}`,

    getBroadcastReport: (data) =>
        `📊 *Broadcast Report*\n\n✅ Zustellungen: ${data.successCount}\n❌ Fehlgeschlagen: ${data.failCount}\n🧹 Blockierte User: ${data.blockCount}`,

    getCategoryCreated: (name) => `✅ Kategorie "${name}" erfolgreich erstellt!`,
    getSubcategoryCreated: (name, catName) => `✅ Unterkategorie "${name}" in *${catName}* erstellt!`,
    getPaymentSaved: (name, addr) => `✅ Zahlungsart gespeichert:\n\n*Name:* ${name}\n*Adresse:* ${addr || 'Keine'}\n\nDiese wird Kunden nun beim Checkout angezeigt.`,
    getGeneralError: () => `❌ Hoppla! Ein Fehler ist aufgetreten. Bitte versuche es später erneut.`,
    
    getCustomerInvoice: (data) => {
        let text = `🧾 *Rechnung / Bestellbestätigung*\n\n`;
        text += `📋 *Order-ID:* \`#${data.orderId}\`\n`;
        text += `💰 *Offener Betrag:* ${data.total}\n`;
        text += `💳 *Zahlungsart:* ${data.paymentName}\n`;
        if (data.walletAddress) {
            text += `\n📋 *Zahlungsadresse:*\n\`${data.walletAddress}\`\n_(Tippe zum Kopieren)_\n`;
        }
        if (data.deliveryMethod === 'shipping') text += `\n🚚 *Lieferung:* Versand`;
        else if (data.deliveryMethod === 'pickup') text += `\n🏪 *Lieferung:* Abholung`;
        text += `\n\n⚠️ *Bitte überweise den offenen Betrag und bestätige anschließend deine Zahlung.*`;
        return text;
    },

    getTxIdPrompt: () =>
        `🔑 *TX-ID / Zahlungsbeleg*\n\nBitte sende jetzt deine Transaktions-ID oder Zahlungsreferenz als Text:`,

    getTxIdConfirmed: (orderId) =>
        `✅ *Zahlung übermittelt!*\n\n📋 Order: \`#${orderId}\`\n\nDeine TX-ID wurde gespeichert. Der Verkäufer prüft den Zahlungseingang.\n\n📦 Status: *Pending* – Warte auf Bestätigung`,

    getStatusUpdateText: (orderId, newStatus) => {
        const label = module.exports.getStatusLabel(newStatus);
        return `🔔 *Status-Update*\n\nDeine Bestellung \`#${orderId}\` wurde aktualisiert:\n\n*Neuer Status:* ${label}`;
    },

    getStatusLabel: (status) => {
        const map = {
            'offen': '📬 Offen',
            'bezahlt_pending': '💸 Bezahlt? (Prüfung)',
            'in_bearbeitung': '⚙️ In Bearbeitung',
            'versand': '📦 Versendet',
            'abgeschlossen': '✅ Abgeschlossen',
            'abgebrochen': '❌ Abgebrochen',
            'loeschung_angefragt': '🗑 Löschung angefragt'
        };
        return map[status] || status;
    },

    getCustomerStatusLabel: (status) => {
        const map = {
            'offen': '📬 Offen – Zahlung ausstehend',
            'bezahlt_pending': '⏳ Pending – Zahlung wird geprüft',
            'in_bearbeitung': '⚙️ In Bearbeitung',
            'versand': '📦 Versendet',
            'abgeschlossen': '✅ Abgeschlossen',
            'abgebrochen': '❌ Abgebrochen',
            'loeschung_angefragt': '🗑 Wird geprüft'
        };
        return map[status] || status;
    },

    getDeliveryLabel: (option) => {
        const map = { 'none': '📱 Digital/Kein Versand', 'shipping': '🚚 Versand', 'pickup': '🏪 Abholung', 'both': '🚚🏪 Versand & Abholung' };
        return map[option] || option;
    },

    // Allgemeine UI-Strings
    getActionCanceled: () => 'Aktion abgebrochen.',
    getNoteAdded: (orderId) => `✅ Notiz für \`#${orderId}\` gespeichert.`,

        // --- v0.5.6: Einzel-Bestellübersicht & Tresor ---
    getCustomerOrderDetailHeader: (orderId) => `📋 *Bestellung #${orderId}*`,
    getTresorEmpty: () => `🔐 *Deliverables Tresor*\n\nFür diese Bestellung wurden noch keine digitalen Artikel geliefert.`,
    getReplaceRequestSent: (orderId) =>
        `🔄 *Replace-Anfrage gesendet!*\n\n` +
        `Bestellung \`#${orderId}\`\n\nDeine Anfrage wurde an das Team weitergeleitet. Wir melden uns baldmöglichst.`,
    getAdminReplaceRequest: (data) =>
        `🔄 *REPLACE-ANFRAGE*\n\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `📋 Order: \`#${data.orderId}\`\n\n` +
        `Der Kunde möchte einen Ersatz für seine digitalen Artikel. Bitte Bestellung prüfen.`,
    getMasterDeliveredOrdersHeader: () => `🔐 *Master – Deliverables Tresor*\n\nBestellungen mit digitaler Lieferung:`,

    getAdminInfoText: () =>
        `ℹ️ *Admin-Befehle & Funktionen*\n\n` +
        `*/start* – Bot neu starten\n` +
        `*/allorders* – Alle Bestellungen anzeigen\n` +
        `*/allopenorders* – Alle offenen Bestellungen anzeigen\n` +
        `*/ban [ID]* – User sperren\n\n` +
        `Klicke auf /orderxxxxxx in den Benachrichtigungen, um Details zu sehen.`,

    getMasterInfoText: () =>
        `👑 *Master-Befehle & Funktionen*\n\n` +
        `*/start* – Bot neu starten\n` +
        `*/allorders* – Alle Bestellungen anzeigen\n` +
        `*/allopenorders* – Alle offenen Bestellungen anzeigen\n` +
        `*/addadmin [ID]* – Neuen Admin ernennen\n` +
        `*/ban [ID]* – User sperren\n\n` +
        `Klicke auf /orderxxxxxx in den Benachrichtigungen, um Details zu sehen.`,

    getShippingAddressPrompt: () =>
        `📦 *Versandadresse erforderlich*\n\n` +
        `⚠️ *Bitte sende deine Adresse als Privnote-Link!*\n\n` +
        `_Klartext-Adressen werden aus Sicherheitsgründen nicht akzeptiert._`,

    getDeliveryChoicePrompt: () =>
        `🚚 *Liefermethode wählen*\n\n` +
        `Dieses Produkt bietet dir zwei Optionen.\n` +
        `Bitte wähle deine bevorzugte Liefermethode:`,

    getShippingPlaintextWarning: () =>
        `⚠️ *Klartext-Adressen sind nicht erlaubt!*\n\n` +
        `Bitte sende deine Adresse als *Privnote-Link*.\n` +
        `Erstelle einen auf [privnote.com](https://privnote.com) und sende den Link hier.\n\n` +
        `_Deine letzte Nachricht wurde aus Sicherheitsgründen gelöscht._`,

    getMyOrdersHeader: () => `📋 *Meine Bestellungen*\n\nHier siehst du den aktuellen Stand:`,
    getMyOrdersEmpty: () => `📋 *Meine Bestellungen*\n\nDu hast aktuell keine aktiven Bestellungen.`,

    getPingSent: () => `✅ *Ping gesendet!*\n\nDas Team wurde benachrichtigt.`,
    getPingCooldown: () => `⏰ Du kannst nur einmal pro 24 Stunden einen Ping senden.`,
    getContactSent: () => `✅ *Kontaktanfrage gesendet!*\n\nEin Admin wird sich bei dir melden.`,
    getContactPrompt: () => `✍️ *Kontaktanfrage*\n\nBitte beschreibe kurz dein Anliegen (max. 500 Zeichen):`,
    getContactCooldown: () => `⏰ Du kannst nur einmal pro Stunde eine Kontaktanfrage senden.`,

    getBannedMessage: () => `🚫 *Du wurdest gesperrt.*\n\nDein Zugang zu diesem Shop wurde deaktiviert.`,
    getBanSelfError: () => `❌ Du kannst dich nicht selbst sperren.`,
    getBanMasterError: () => `❌ Der Master-Admin kann nicht gesperrt werden.`,
    getBanAlreadyBanned: () => `⚠️ Dieser User ist bereits gesperrt.`,
    getBanConfirmation: (userId) => `✅ User \`${userId}\` wurde gesperrt und benachrichtigt.`,

    getBanConfirmed: (userId) =>
        `🔨 *Ban auto-bestätigt*\n\n` +
        `User \`${userId}\` wurde nach 48h automatisch bestätigt und die Daten gelöscht.`,

    getMasterBanNotify: (data) =>
        `🔨 *Neuer Ban*\n\n` +
        `👤 User: \`${data.userId}\`\n` +
        `🛡 Gebannt von: \`${data.bannedBy}\`\n` +
        `🕐 Zeit: ${data.time}\n\n` +
        `_Der Ban wird nach 48h automatisch bestätigt, falls du nicht reagierst._`,

    getOrderReceipt: (data) =>
        `🧾 *Bestellbestätigung*\n\n` +
        `📋 Bestellung: \`#${data.orderId}\`\n` +
        `💰 Summe: ${data.total}€\n` +
        `💳 Zahlung: ${data.paymentName}\n\n` +
        `Vielen Dank für deine Bestellung!`,

    getAdminPingNotify: (data) =>
        `🔔 *KUNDEN-PING*\n\n👤 ${data.username}\n📋 /${data.orderId}\n\nDer Kunde wartet auf ein Update!`,

    getAdminContactNotify: (data) =>
        `💬 *KONTAKTANFRAGE*\n\n👤 ${data.username}\n📋 /${data.orderId}\n\n*Nachricht:*\n${data.message}`,

    getDigitalDeliveryPrompt: (orderId) => 
        `📥 *Digitale Lieferung für #${orderId}*\n\n` +
        `Sende jetzt Zugangsdaten oder Keys. Mehrere Einträge mit Komma trennen.`,

    getDigitalDeliveryCustomerMessage: (orderId, content) => 
        `🎉 *Deine Lieferung ist da!*\n\n` +
        `Bestellung \`#${orderId}\` wurde geliefert:\n\n` +
        `📦 *Inhalt:*\n` +
        `➖➖➖➖➖➖➖➖➖➖\n` +
        `${content}\n` +
        `➖➖➖➖➖➖➖➖➖➖\n\n` +
        `Vielen Dank für deinen Einkauf!`,

    getDigitalDeliverySuccess: (orderId) => 
        `✅ *Digital versendet!*\n\nDie Lieferung für \`#${orderId}\` wurde erfolgreich an den Kunden geschickt.\nDer Status wurde automatisch auf "Abgeschlossen" gesetzt.`,

    getFeedbackInviteText: (orderId) => 
        `🎉 *Feedback abgeben*\n\nDeine Bestellung \`#${orderId}\` ist qualifiziert! Wir würden uns sehr über dein Feedback freuen. Bitte bewerte deinen Einkauf bei uns:`,

    getAdminFeedbackReviewNotify: (data) => 
        `🔔 *NEUES FEEDBACK ZUR PRÜFUNG*\n\n` +
        `👤 Kunde: ${data.username}\n` +
        `📋 Order: \`#${data.orderId}\`\n` +
        `⭐ Sterne: ${data.rating}/5\n` +
        `💬 Kommentar: ${data.comment || '_Kein Kommentar_'}\n` +
        `🕵️ Anonym: ${data.isAnonymous ? 'Ja' : 'Nein'}\n\n` +
        `Bitte dieses Feedback freigeben oder ablehnen.`,

    getFeedbackStartPrompt: () => 
        `⭐ *Sterne-Bewertung*\n\nWie viele Sterne gibst du unserem Shop und deiner Bestellung? (1-5)`,

    getFeedbackCommentPrompt: () => 
        `✍️ *Dein Kommentar*\n\nMöchtest du uns noch ein kurzes Feedback hinterlassen? (Maximal 300 Zeichen)\n\n_Sende deinen Text jetzt in den Chat oder klicke auf Überspringen._`,

    getFeedbackAnonymityPrompt: () => 
        `🕵️ *Anonymität*\n\nMöchtest du, dass dein Name ("@Username") in der Bewertung steht, oder möchtest du als "Customer" anonym bleiben?`,

    getFeedbackThanks: () => 
        `✅ *Vielen Dank!*\n\nDein Feedback wurde erfolgreich übermittelt und wird nach kurzer Prüfung veröffentlicht.`,

    getPublicFeedbacksHeader: (average, total) => 
        `⭐ *Kunden-Feedbacks*\n` +
        `📊 Durchschnitt: *${average} / 5.0* (${total} Bewertungen)\n` +
        `➖➖➖➖➖➖➖➖➖➖\n\n`,

    getPublicFeedbacksEmpty: () => 
        `⭐ *Kunden-Feedbacks*\n\nBisher wurden noch keine Feedbacks freigegeben. Werde der Erste!`,

    getMasterShopManagement: () => 
        `⚙️ *Shop Verwaltung*\n\nHier kannst du die administrativen Bereiche deines Shops, Zahlungsarten und dein Team verwalten.`,
    
    getMasterFeedbackManagement: (average, total) => 
        `⭐ *Feedback Verwaltung*\n\n` +
        `📊 *Gesamtdurchschnitt:* ${average} / 5.0\n` +
        `📝 *Freigegebene Feedbacks:* ${total}\n\n` +
        `Hier kannst du die öffentlichen Bewertungen einsehen oder den Feedback-Verlauf komplett zurücksetzen.`,

    getAdminOrderDeleteRequest: (data) => 
        `🗑 *LÖSCHANFRAGE VOM KUNDEN*\n\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `📋 Order: \`#${data.orderId}\`\n\n` +
        `Der Kunde möchte diese abgeschlossene Bestellung aus dem System löschen. Bitte prüfen und entscheiden.`,

    getAdminCategoryManageHeader: () => `📁 *Kategorien verwalten*`,
    
    getAdminCategoryDetails: (name, subcatCount) => {
        let text = `Kategorie: *${name}*`;
        if (subcatCount > 0) text += `\n📂 ${subcatCount} Unterkategorie(n)`;
        return text;
    },

    getAdminSubcategoryDetails: (name) => `📂 Unterkategorie: *${name}*`,

    getAdminProductManageHeader: () => `📦 *Produkte verwalten*\n\nWähle eine Kategorie:`,
    
    getAdminProductSelectSubcat: () => `Wähle eine Unterkategorie oder ein Produkt:`,
    
    getAdminProductSubcatHeader: (name) => `📂 *${name}*\n\nWähle ein Produkt:`,

    getAdminProductDetails: (product, path, deliveryLabel, formattedPrice) => {
        let text = `*${product.name}*\n`;
        text += `📂 _In: ${path}_\n\n`;
        text += `💰 Preis: ${formattedPrice}\n`;
        text += `📦 Aktiv: ${product.is_active ? '✅' : '❌'}\n`;
        text += `📋 Verfügbar: ${product.is_out_of_stock ? '❌ Ausverkauft' : '✅'}\n`;
        text += `🚚 Lieferoption: ${deliveryLabel}\n`;
        if (product.description) text += `\n📝 ${product.description}`;
        return text;
    },

    getAdminImageLoadError: () => `\n\n⚠️ _Bild konnte nicht geladen werden_`,
    
    getAdminPricePrompt: () => `💰 *Neuen Preis eingeben:*\n\nBitte sende den neuen Preis (z.B. \`12.50\`):`,
    
    getAdminDeleteRequestSent: (name) => `🔔 Löschanfrage für *${name}* wurde an den Master gesendet.`,

    // NEU: Diese 3 haben in deiner Version noch gefehlt!
    getDigitalDeliverySavedButton: () => `✅ Keys gespeichert (Nachricht löschen)`,
    getDigitalDeliveryOverviewButton: () => `📥 Digitale Keys abrufen`,
    getDigitalDeliveryOverviewHint: () => `\n_(Deine Keys können jederzeit unten über den Button "Digitale Keys abrufen" erneut angezeigt werden)_`
};
