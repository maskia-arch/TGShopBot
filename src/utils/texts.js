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

    getAdminNewOrderNotify: (data) => 
        `🛍 *NEUE BESTELLUNG*\n\n` +
        `👤 Kunde: ${data.username} (ID: ${data.userId})\n` +
        `💰 Betrag: ${data.total}€\n` +
        `💳 Methode: ${data.paymentName}\n\n` +
        `Detaillierte Infos findest du in der Bestellübersicht.`,

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
    
    getPaymentSaved: (name, addr) => `✅ Zahlungsart gespeichert:\n\n*Name:* ${name}\n*Adresse:* ${addr || 'Keine'}\n\nDiese wird Kunden nun beim Checkout angezeigt.`,

    getGeneralError: () => `❌ Hoppla! Ein Fehler ist aufgetreten. Bitte versuche es später erneut.`,
    
    getActionCanceled: () => `❌ Vorgang wurde abgebrochen.`
};
