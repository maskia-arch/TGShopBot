# 🤖 t.me/autoacts – Shop Bot Core | v0.3.4

Ein professionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, flexiblem Liefersystem, manuellem Zahlungsflow und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

---

## 🆕 Changelog

### v0.3.4 – Stabiler Bezahl- & Bestellfluss
- **💸 TX-ID Zahlungsflow:** Kunden bestätigen Zahlungen per TX-ID. Admins werden sofort benachrichtigt und prüfen manuell.
- **🧾 Persistente Kunden-Receipts:** Nach Bestellabschluss erhält der Kunde eine dauerhafte Rechnung mit Zahlungsadresse zum Kopieren und "Zahlung bestätigen"-Button.
- **🔧 UUID-Crash behoben:** `payment_method_id` wird nicht mehr in die Order geschrieben (Typkonflikt UUID vs. Integer).
- **🔙 Zurück-Button (Kunde) repariert:** `back_to_main` Handler fehlte komplett – jetzt rollenbasiert (Kunde/Admin/Master).
- **📋 Offene Bestellungen repariert:** Button löschte sich nach Klick – Fix: alle Order-Ansichten als neue Nachricht statt Edit.
- **📦 /orders Ladefehler behoben:** Supabase Foreign-Key-Join entfernt, robuste Queries ohne User-Join.
- **🚫 Keine Auto-Löschung:** Wichtige Nachrichten (Receipts, Order-Details, Benachrichtigungen) werden nie automatisch gelöscht.

### v0.3.2 – Liefersystem & Kundenmanagement
- **🚚🏪 Flexible Lieferoptionen:** Pro Produkt konfigurierbar: Digital (kein Versand), Versand, Abholung oder beides.
- **📦 Privnote-Adressen:** Versandadressen nur als Privnote-Link akzeptiert – Klartext wird automatisch gelöscht.
- **👥 Erweiterte Kundenübersicht (Master):** Umsatz, Bestellhistorie, Ban/Lösch-Funktionen pro Kunde.
- **🔗 Klickbare Order-IDs:** Überall `/orderid ORD-XXXXX` statt Plaintext.
- **💳 Zahlungsarten-Details:** Master sieht Name und Adresse vor dem Löschen (kein versehentliches Löschen mehr).

### v0.3.0 – Bestellsystem & Benachrichtigungen
- **📋 Vollständiges Bestellsystem:** Warenkorb → Checkout → Rechnung → Statusverfolgung.
- **🔔 Echtzeit-Benachrichtigungen:** Admins erhalten Push bei neuen Bestellungen, Kunden bei Statusänderungen.
- **📝 Admin-Notizen:** Interne Notizen pro Bestellung für Teamkommunikation.
- **🔨 Ban-System:** 48h Pending-Ban mit Master-Bestätigung, automatische Datenlöschung.
- **📢 Broadcast:** Rundnachrichten an alle Kunden mit Zustellbericht.

---

## 🏗 Architektur

### Bestellfluss (v0.3.4)

```
Kunde: Shop → Warenkorb → Checkout
         ↓
  [Lieferoption wählen: Versand / Abholung / keine]
         ↓
  [Versandadresse als Privnote-Link (nur bei Versand)]
         ↓
  Zahlungsart wählen → Rechnung mit Wallet-Adresse
         ↓
  "Bestellung abschicken" → Order erstellt
         ↓
  Receipt an Kunden (persistent):
    • Order-ID, Betrag, Zahlungsadresse
    • Button "💸 Zahlung bestätigen"
         ↓
  Admin/Master erhält: "NEUE BESTELLUNG"
         ↓
  Kunde: "Zahlung bestätigen" → TX-ID eingeben
         ↓
  Status: "Bezahlt? (Prüfung)" → Admin prüft
         ↓
  Admin: Status manuell ändern → Kunde erhält Update
```

### Rollensystem

| Rolle | Rechte |
|---|---|
| **👑 Master** | Alles. Admins verwalten, Zahlungsarten, Kundenübersicht, Freigaben, Bans bestätigen |
| **🛠 Admin** | Produkte/Kategorien verwalten, Bestellungen bearbeiten, Broadcasts, Statusänderungen |
| **👤 Kunde** | Shop durchsuchen, bestellen, Zahlung bestätigen, Ping/Kontakt |

### Bestell-Status

| Status | Bedeutung |
|---|---|
| 📬 Offen | Bestellung eingegangen, Zahlung ausstehend |
| 💸 Bezahlt? (Prüfung) | Kunde hat TX-ID übermittelt, Admin prüft |
| ⚙️ In Bearbeitung | Zahlung bestätigt, wird vorbereitet |
| 📦 Versendet | Unterwegs zum Kunden |
| ✅ Abgeschlossen | Abgeschlossen |
| ❌ Abgebrochen | Storniert |

### Lieferoptionen (pro Produkt)

| Option | Checkout-Verhalten |
|---|---|
| 📱 Digital | Direkt zur Zahlung, keine Adressabfrage |
| 🚚 Versand | Privnote-Adresse erforderlich |
| 🏪 Abholung | Direkt zur Zahlung |
| 🚚🏪 Beide | Kunde wählt Versand oder Abholung |

---

## ✨ Features

### 👑 Master-Dashboard
- Admins hinzufügen/entfernen (`/addadmin`)
- Zahlungsarten verwalten (Name + Wallet-Adresse)
- Kundenübersicht mit Umsatz, Bestellhistorie, Ban/Lösch-Aktionen
- Freigabe-Workflow für Admin-Aktionen (Preise, Löschungen)
- Ban-System mit 48h Bestätigungsfrist

### 🛠 Admin-Panel
- Kategorien & Unterkategorien (CRUD, Sortierung)
- Produkte verwalten (Preis, Bild, Beschreibung, Lieferoption, Aktiv/Ausverkauft)
- Lieferoption zyklisch ändern: Digital → Versand → Abholung → Beide
- Offene Bestellungen mit 1-Klick Statusänderung
- Admin-Notizen pro Bestellung
- Rundnachrichten an alle Kunden

### 💳 Kunden-Interface
- Kategorien & Produkte durchsuchen
- Warenkorb mit Mengenauswahl
- Checkout mit Lieferoptionswahl
- Privnote-basierte Adresseingabe (Sicherheit)
- Rechnung mit kopierbarer Zahlungsadresse
- TX-ID Zahlungsbestätigung
- Bestellübersicht mit Status-Tracking
- Ping & Kontaktanfrage an Admins

### 🔔 Benachrichtigungen
- Admin: Neue Bestellung, TX-ID eingegangen, Kunden-Ping, Kontaktanfrage
- Kunde: Statusänderungen, Bestellbestätigung
- Master: Neue Produkte von Admins, Ban-Anfragen

---

## 🚀 Installation

### 1. Abhängigkeiten
```bash
npm install
```

### 2. Datenbank (Supabase)
SQL-Befehle der Reihe nach ausführen:
1. `SETUP.txt` (Basis-Schema)
2. `SUPABASE_MIGRATION_v0.3.0.sql`
3. `SUPABASE_MIGRATION_v0.3.1.sql`
4. `SUPABASE_MIGRATION_v0.3.2.sql` (enthält `delivery_option`, `delivery_method`, `tx_id`)

### 3. Environment Variables
```
TELEGRAM_BOT_TOKEN=your_bot_token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
MASTER_ADMIN_ID=your_telegram_id
PORT=10000
```

### 4. Starten
```bash
node src/index.js
```

Für Hosting auf Render.com: Web Service erstellen, Health-Check auf Port 10000.

---

## 📁 Projektstruktur

```
src/
├── index.js                    # Bot-Setup, Middleware, Stage
├── config/index.js             # Konfiguration & Version
├── database/
│   ├── supabaseClient.js       # Supabase-Verbindung
│   └── repositories/
│       ├── productRepo.js      # Produkte & Kategorien
│       ├── orderRepo.js        # Bestellungen & TX-ID
│       ├── cartRepo.js         # Warenkorb
│       ├── userRepo.js         # User, Rollen, Bans
│       ├── paymentRepo.js      # Zahlungsarten
│       ├── subcategoryRepo.js  # Unterkategorien
│       └── approvalRepo.js     # Freigabe-Workflow
├── bot/
│   ├── commands/
│   │   ├── start.js            # /start (rollenbasiert)
│   │   ├── addadmin.js         # /addadmin
│   │   └── orderCommands.js    # /orders, /orderid, /id, /deleteid, /ban
│   ├── actions/
│   │   ├── shopActions.js      # Shop-Navigation, back_to_main, Hilfe
│   │   ├── cartActions.js      # Warenkorb-Aktionen
│   │   ├── checkoutActions.js  # Checkout-Einstieg
│   │   ├── adminActions.js     # Admin-Panel, Produkt-/Kategorie-Verwaltung
│   │   ├── masterActions.js    # Master-Dashboard, Zahlungsarten, Admins
│   │   └── orderActions.js     # Order-Aktionen, TX-ID, Kundenübersicht
│   ├── scenes/
│   │   ├── checkoutScene.js    # State-Machine Checkout
│   │   ├── addProductScene.js  # Produkt erstellen (mit Lieferoption)
│   │   ├── addCategoryScene.js
│   │   ├── addSubcategoryScene.js
│   │   ├── addPaymentMethodScene.js
│   │   ├── askQuantityScene.js
│   │   ├── broadcastScene.js
│   │   ├── contactScene.js
│   │   ├── editPriceScene.js
│   │   ├── editProductImageScene.js
│   │   ├── renameCategoryScene.js
│   │   ├── renameProductScene.js
│   │   └── renameSubcategoryScene.js
│   ├── keyboards/
│   │   ├── customerMenu.js
│   │   ├── adminMenu.js
│   │   └── masterMenu.js
│   └── middlewares/
│       └── auth.js             # isAdmin, isMasterAdmin, checkBan
├── services/
│   ├── notificationService.js  # Push an Admins/Kunden/Master
│   └── cronService.js          # Ban-Ablauf Prüfung
└── utils/
    ├── texts.js                # Alle Bot-Texte (DE)
    ├── formatters.js           # Preis, Datum, Rechnung
    ├── uiHelper.js             # updateOrSend, sendTemporary
    └── imageUploader.js        # Bild-Upload Handling
```

---

## 🔧 Bot-Befehle

| Befehl | Rolle | Beschreibung |
|---|---|---|
| `/start` | Alle | Hauptmenü (rollenbasiert) |
| `/orders` | Admin | Alle Bestellungen anzeigen |
| `/orderid ORD-XXXXX` | Admin | Einzelne Bestellung öffnen |
| `/id ORD-XXXXX` | Admin | Alias für /orderid |
| `/deleteid ORD-XXXXX` | Admin | Bestellung löschen |
| `/ban 123456789` | Admin | User sperren |
| `/addadmin 123456789` | Master | Admin hinzufügen |

---

## 🛡 Sicherheit

- **Privnote-Adressen:** Versandadressen nur als selbstzerstörende Privnote-Links. Klartext wird automatisch gelöscht.
- **Hierarchische Rechte:** Master → Admin → Kunde. Jede Aktion prüft die Rolle.
- **Ban-System:** 48h Pending mit Master-Override. Gebannte User können den Bot nicht mehr nutzen.
- **Approval-Workflow:** Admin-Aktionen (Preisänderungen, Löschungen) erfordern Master-Freigabe.

---

## 📦 Tech Stack

- **Runtime:** Node.js
- **Bot Framework:** Telegraf v4 (WizardScene, Session)
- **Datenbank:** Supabase (PostgreSQL)
- **Hosting:** Render.com (mit Health-Check Server)

---

**Powered by [t.me/autoacts](https://t.me/autoacts)** – *Sicherheit, Diskretion und Effizienz.*
