# 🤖 t.me/autoacts – TGSHOPBOT Core | v0.6.2

Ein professionelles, gehärtetes Telegram-E-Commerce-System mit transaktionaler Tresor-Auslieferung, Multi-Coin Blockchain Auto-Verifizierung, KYC-Legitimierung, Coupon-System, hierarchischer Rechteverwaltung und dezentraler Datenstruktur.

Entwickelt von **t.me/autoacts**.

---

## 🆕 Release Notes v0.6.2 – Transaktionale Sicherheit & Massen-Auslieferung

- ⚡ **Transaktionale Tresor-Auslieferung & Purge-Schutz**: Digitale Artikel (`product_deliverables`) werden erst **nach** erfolgreicher Telegram-Zustellungsbestätigung aus der Vorrats-Datenbank gelöscht. Scheitert das Senden (z. B. Kunde hat den Bot blockiert), verbleiben 100% aller Artikel sicher im Tresor.
- 🛡️ **Plaintext-Fallback & Sonderzeichen-Schutz**: Schützt Auslieferungen vor Telegram-Markdown-Parsing-Fehlern bei unentkommenen Zeichen in Zugangsdaten oder Keys (wie `[iPhone]`, `reg_date`, `|`).
- 📦 **Massenbestellungs-Chunking**: Auslieferungen mit vielen Artikeln oder langem Inhalt (> 3.000 Zeichen) werden automatisch in Telegram-Teilnachrichten (`Teil 1/2`, `Teil 2/2`) aufgeteilt.
- 🔑 **Auto-Delivery Override Guard**: Führt ein Betreiber eine manuelle Lieferung durch (aus dem Tresor oder per Freitext), wird der automatische Krypto-Blockchain-Scanner pro Order geräuschlos deaktiviert (`auto_delivery_disabled = true`).

## 🆕 Features v0.6.1 & v0.6.0

- 📊 **Vorratsgrenzen & Kunden-Transparenz (v0.6.1)**: Dynamische Mengeneinschränkung im Checkout und Mengenausgabe-Menü auf den realen Tresor-Bestand.
- 🪪 **KYC-Legitimierung für Produkte (v0.6.0)**: Konfigurierbare Nachweis-Pflicht (Selfie, Ausweis, Dokumente) bei Versand & Lieferung.
- ₿ **Multi-Coin Blockchain Auto-Verifizierung (v0.6.0)**: Automatische Überwachung für **BTC**, **LTC**, **ETH** & **SOL** mit 4-stelliger Zuordnungs-Kennziffer (`payment_identifier`) und Live Ticker Countdown.
- 🎟️ **Gutschein- & Coupon-System (v0.6.0)**: Rabatt-Codes (% & €) mit Ablaufdaten, Maximalnutzung und Produktbindung.
- ⏰ **Bot-Status & Öffnungszeiten (v0.6.0)**: `🟢 Geöffnet`, `🔴 Sofort geschlossen` oder `⏰ Feste Öffnungszeiten` mit individuellen Abwesenheitsnachrichten.

---

## ✨ Hauptfunktionen

### 🛍️ Bestell- & Bezahlsystem
- **Multi-Coin Krypto-Automatisierung**: Automatische Blockchain-Zahlungserkennung für Bitcoin, Litecoin, Ethereum und Solana.
- **TX-ID Zahlungsflow (Manuell)**: Kunden können Zahlungen auch manuell per TX-ID bestätigen.
- **Persistente Kunden-Receipts**: Dauerhafte digitale Rechnungen inklusive kopierbarer Wallet-Adresse und Ticker.

### 🚚 Intelligentes Liefersystem
- **Flexible Lieferoptionen**: Digital (kein Versand), Versand, Abholung oder Versand & Abholung wählbar.
- **Transaktionaler Digitalkey-Tresor**: Atomare Entnahme digitaler Güter aus `product_deliverables` mit Purge-Schutz.
- **Datenschutz bei Versand**: Versandadressen werden nur als selbstzerstörende Privnote-Links akzeptiert.

### 🛠️ Hierarchische Verwaltung (Master & Admin)
- **Drill-Down Admin-Panel**: Kategorien » Unterkategorien » Produkte übersichtlich verwalten.
- **Smart Cleaning**: Automatische Löschung obsolet gewordener Admin-Benachrichtigungen beim Bearbeiten von Bestellungen.
- **Master-Panel**: Vollständige Übersicht über Umsätze, Kundenhistorien, Admin-Rechte, Ban-Verwaltung und Master-Tresor.

---

## 🏗️ Architektur & Rollensystem

### 👥 Rollenmatrix

| Rolle | Rechte |
|---|---|
| **👑 Master** | Vollzugriff: Admins verwalten, Zahlungsarten, Kundenübersicht, Gutscheine, Freigaben, Bans bestätigen, Master-Tresor |
| **🛠️ Admin** | Produkte & Kategorien verwalten, Vorräte aufstocken, Bestellungen bearbeiten & manuell ausliefern, Broadcasts |
| **👤 Kunde** | Shop durchsuchen, bestellen, Krypto bezahlen, KYC-Dokumente hochladen, Deliverables Tresor einsehen, ⭐ Feedback abgeben |

### 📦 Lieferoptionen

| Option | Checkout-Verhalten |
|---|---|
| ⚡ Digital | Automatische oder manuelle Tresor-Auslieferung, keine Adresse erforderlich |
| 🚚 Versand | Privnote-Adresse erforderlich (+ optional KYC-Dokumente) |
| 🏪 Abholung | Direkte Zahlungsabwicklung (+ optional KYC-Dokumente) |
| 🚚🏪 Beide | Kunde wählt im Checkout zwischen Versand und Abholung |

---

## 🚀 Installation & Setup

### 1. Abhängigkeiten
Es wird Node.js (v18+) benötigt.
```bash
npm install
```

### 2. Datenbank (Supabase PostgreSQL)
1. Erstelle ein Projekt auf [supabase.com](https://supabase.com).
2. Führe unter **SQL Editor** den Inhalt von `Setup/FULL_SCHEMA.sql` aus.
3. Führe für Updates bestehender Versionen die Migrations-Skripte aus (`Setup/MIGRATION_UPDATE_v0.6.sql` & `Setup/MIGRATION_UPDATE_v0.6.1.sql`).

### 3. Umgebungsvariablen (.env)
```env
TELEGRAM_BOT_TOKEN=dein_bot_token
SUPABASE_URL=https://dein-projekt.supabase.co
SUPABASE_KEY=dein_service_role_key
MASTER_ADMIN_ID=deine_telegram_id
VERSION=0.6.2
PORT=10000
```

### 4. Bot starten
```bash
# Entwicklung / Lokal
npm run dev

# Produktion
npm start
```

---

## 🔧 Bot-Befehle (v0.6.2)

| Befehl | Rolle | Beschreibung |
| :--- | :--- | :--- |
| `/start` | Alle | Hauptmenü (rollenbasiert) |
| `/myorders` | Kunde | Eigene Bestellhistorie & Deliverables Tresor öffnen |
| `/feedbacks` | Kunde | Öffentliche Shop-Bewertungen einsehen |
| `/allorders` | Admin/Master | Alle Kundenbestellungen auflisten |
| `/allopenorders` | Admin/Master | Alle offenen Bestellungen auflisten |
| `/orderid ORD-XXXX` | Admin/Master | Einzelne Bestellung im Admin-Panel öffnen |
| `/deleteid ORD-XXXX` | Admin/Master | Bestellung löschen |
| `/ban 123456789` | Admin/Master | User sperren |
| `/addadmin 123456789` | Master | Admin hinzufügen |

---

## 🛡️ Sicherheit & Tech Stack

- **Tech Stack**: Node.js (v18+), Telegraf v4, Supabase (PostgreSQL), Render.com.
- **Sicherheits-Features**: Row Level Security (RLS), Privnote-Verschlüsselung, 48h Ban-Pending mit Master-Override, Anti-Flood Rate-Limiting.

---

## 📄 Lizenz & Nutzungsbedingungen

© 2026 t.me/autoacts. Alle Rechte vorbehalten.

Mit dem Erhalt oder Erwerb dieser Software wird dir eine **einfache, nicht-exklusive und nicht-übertragbare Nutzungslizenz** für den eigenen Gebrauch eingeräumt.

❌ **Folgendes ist strengstens untersagt:**
- Der Weiterverkauf (Reselling) der Software, des Codes oder Teilen davon.
- Die Weitergabe, Veröffentlichung oder Unterlizenzierung an Dritte.
- Das Kopieren des Codes, um ihn als eigenes Produkt (White-Labeling) auf den Markt zu bringen.

Dieses Projekt ist **keine** Open-Source-Software. Jegliche Zuwiderhandlung führt zum sofortigen Entzug der Nutzungslizenz und kann rechtliche Konsequenzen nach sich ziehen.
