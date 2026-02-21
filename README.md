# 🤖 t.me/autoacts - Shop Bot Core | v0.3.0

Ein hochprofessionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, vollständigem Bestellmanagement, Echtzeit-Lagerverwaltung und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

---

## ✨ Neue Funktionen in v0.3.0

### 📋 Vollständiges Bestellsystem
- **Order-IDs:** Jede Bestellung erhält eine eindeutige ID (`ORD-10001`, `ORD-10002`, ...) und wird als offener Posten gespeichert.
- **Statusverwaltung:** Admins können den Status jeder Bestellung ändern — *Offen → In Bearbeitung → Versand → Abgeschlossen / Abgebrochen*.
- **Kunden-Benachrichtigungen:** Bei jedem Statuswechsel erhält der Kunde automatisch eine Nachricht mit dem aktuellen Bearbeitungsstand.
- **Meine Bestellungen:** Kunden sehen einen "📋 Meine Bestellungen"-Button im Hauptmenü, sobald ihnen eine Bestellung zugeordnet ist.
- **Bestellübersicht für Master:** Offene Bestellungen auf einen Blick im Master-Dashboard mit direktem Zugriff auf Details, Links und Statusänderung.

### 🔐 Neuer Checkout-Flow (5 Stufen)
1. **Versandadresse:** Der Kunde wird aufgefordert, seine Versandadresse als einmaligen Privnote-Link zu senden (Datenschutz).
2. **Zahlungsauswahl:** Alle vom Betreiber eingerichteten Zahlungsarten werden zur Auswahl angeboten.
3. **Zahlungsdetails:** Nach Auswahl werden die Zahlungsinformationen (Wallet, IBAN, etc.) angezeigt — mit Option zur Korrektur der Zahlungsart.
4. **Transaktions-ID:** Nach erfolgter Zahlung sendet der Kunde seine TX-ID ebenfalls als Privnote-Link.
5. **Bestätigung:** Bestellung wird erstellt, Order-ID zugewiesen, Receipts an alle Admins versendet.

### 📂 Unterkategorien
- **Dreistufige Hierarchie:** Kategorie → Unterkategorie → Produkt (z.B. *PC Service → Reparatur → Motherboard Reparatur*).
- **Volle Verwaltung:** Unterkategorien erstellen, umbenennen und löschen — direkt aus der Kategorie-Ansicht im Admin-Panel.
- **Shop-Navigation:** Kunden navigieren intuitiv durch Kategorien und Unterkategorien zum gewünschten Produkt.

### 🧾 Admin Receipts
- Bei jeder neuen Bestellung erhalten Admin und Master ein vollständiges Receipt mit: Bestell-ID, Kundendaten, bestellten Artikeln (inkl. Kategorie-Pfad), Zahlungsart, Versand- und TX-Links sowie Betrag.
- Direkt am Receipt: Buttons zur Statusänderung und Kundenkontakt.

### 🔧 Weitere Verbesserungen
- **Produktnamen bearbeiten (Bugfix):** Admins können Produktnamen jetzt direkt über "✏️ Namen ändern" im Produkt-Editor bearbeiten.
- **`/id [ORDERID]`:** Admin und Master können jede Bestellung per Befehl aufrufen und verwalten.
- **`/deleteid [ORDERID]`:** Master kann Bestellungen gezielt aus dem System entfernen.
- **Info-Button:** Admin und Master sehen im Hauptmenü einen Info-Button mit allen freigeschalteten Befehlen und der aktuellen Bot-Version.
- **Dynamisches Kundenmenü:** Der "Meine Bestellungen"-Button erscheint nur, wenn der Kunde tatsächlich Bestellungen hat.

---

## 🏗 Systemarchitektur

### 👑 Master Admin (Inhaber)
- Exklusiver Zugriff auf das Master-Dashboard via `MASTER_ADMIN_ID`
- Approval-Workflow: Finale Freigabe von Preisänderungen und Löschanträgen
- Zahlungsarten, Admins und User-Daten verwalten
- Offene Bestellungen einsehen, Status ändern, Bestellungen löschen
- Bestelldetails inkl. Versand- und Zahlungslinks einsehen
- Info-Panel mit allen verfügbaren Befehlen
- Befehle: `/start`, `/id`, `/deleteid`, `/addadmin`

### 🛠 Admin (Mitarbeiter)
- Produkt-Management: Erstellen, bearbeiten, Name/Bild/Preis ändern, sortieren
- Kategorien und Unterkategorien verwalten
- Broadcast-Nachrichten an alle Kunden senden
- Bestellungen per `/id` aufrufen und Status ändern
- Kundenansicht zum Testen
- Info-Panel mit Befehlsübersicht
- Befehle: `/start`, `/id`, `/addadmin`

### 💳 Kunden-Interface
- Intuitive Shop-Navigation durch Kategorien → Unterkategorien → Produkte
- Warenkorb mit Mengenverwaltung
- Sicherer Checkout: Versandadresse und TX-ID über einmalige Links (Privnote)
- "Meine Bestellungen" mit Statusübersicht
- Automatische Benachrichtigungen bei Statusänderungen

---

## 📁 Projektstruktur

```
TGShopBot_v0.3.0/
├── src/
│   ├── bot/
│   │   ├── actions/
│   │   │   ├── adminActions.js      # Produkt/Kategorie/Unterkategorie-Verwaltung
│   │   │   ├── cartActions.js       # Warenkorb-Logik
│   │   │   ├── checkoutActions.js   # Checkout-Einstieg → Scene
│   │   │   ├── masterActions.js     # Master-Dashboard & Freigaben
│   │   │   ├── orderActions.js      # Bestellungen, Status, Kundenansicht
│   │   │   └── shopActions.js       # Shop-Navigation, Info-Buttons
│   │   ├── commands/
│   │   │   ├── start.js             # /start mit dynamischem Menü
│   │   │   ├── addadmin.js          # /addadmin
│   │   │   └── orderCommands.js     # /id, /deleteid
│   │   ├── keyboards/
│   │   │   ├── adminMenu.js         # Admin-Menü mit Info-Button
│   │   │   ├── customerMenu.js      # Kunden-Menü (dynamisch)
│   │   │   └── masterMenu.js        # Master-Menü mit Bestellungen
│   │   ├── middlewares/
│   │   │   └── auth.js              # Rechteprüfung
│   │   └── scenes/
│   │       ├── addCategoryScene.js
│   │       ├── addPaymentMethodScene.js
│   │       ├── addProductScene.js         # Erweitert: Unterkategorie-Support
│   │       ├── addSubcategoryScene.js     # NEU
│   │       ├── askQuantityScene.js
│   │       ├── broadcastScene.js
│   │       ├── checkoutScene.js           # NEU: 5-Stufen Checkout
│   │       ├── editPriceScene.js
│   │       ├── editProductImageScene.js
│   │       ├── renameCategoryScene.js
│   │       ├── renameProductScene.js      # NEU: Produktnamen bearbeiten
│   │       └── renameSubcategoryScene.js  # NEU
│   ├── config/
│   │   └── index.js                 # Konfiguration + Version aus version.txt
│   ├── database/
│   │   ├── supabaseClient.js
│   │   └── repositories/
│   │       ├── approvalRepo.js
│   │       ├── cartRepo.js
│   │       ├── orderRepo.js         # Erweitert: Order-IDs, Status, Links
│   │       ├── paymentRepo.js
│   │       ├── productRepo.js       # Erweitert: Unterkategorien, Name ändern
│   │       ├── subcategoryRepo.js   # NEU
│   │       └── userRepo.js
│   ├── services/
│   │   └── notificationService.js   # Receipts, Status-Benachrichtigungen
│   ├── utils/
│   │   ├── formatters.js
│   │   ├── imageUploader.js
│   │   ├── texts.js                 # Alle Bot-Texte zentral
│   │   └── uiHelper.js
│   └── index.js                     # Hauptdatei / Bot-Start
├── SUPABASE_MIGRATION_v0.3.0.sql    # Datenbank-Migration
├── UPDATE_CHECKLIST_v0.3.0.md       # Migrations-Checkliste
├── SETUP.txt                        # Initiales DB-Setup
├── package.json
├── version.txt                      # 0.3.0
└── README.md
```

---

## 🗄 Datenbank-Schema (Supabase)

### Tabellen

| Tabelle | Beschreibung |
|---------|-------------|
| `users` | Telegram-User mit Rollen (customer, admin, master) |
| `categories` | Produkt-Hauptkategorien |
| `subcategories` | Produkt-Unterkategorien (FK → categories) |
| `products` | Artikel mit Preis, Bild, Status, Kategorie- und Unterkategorie-Zuordnung |
| `carts` | Warenkorb-Einträge pro User |
| `orders` | Bestellungen mit Order-ID, Status, Versand/Zahlungs-Links |
| `payment_methods` | Zahlungsarten (Name + Wallet/Adresse) |
| `pending_approvals` | Freigabe-Queue für Preis/Lösch-Anfragen |

### Bestellstatus-Lifecycle

```
offen → in_bearbeitung → versand → abgeschlossen
                                  → abgebrochen
```

Jeder Statuswechsel löst automatisch eine Benachrichtigung an den Kunden aus.

---

## 🚀 Installation & Betrieb

### Erstinstallation

1. **Repository klonen** und Abhängigkeiten installieren:
   ```bash
   npm install
   ```

2. **Supabase einrichten:**
   - Neues Projekt auf [supabase.com](https://supabase.com) erstellen
   - SQL aus `SETUP.txt` im SQL Editor ausführen (Basis-Schema)
   - SQL aus `SUPABASE_MIGRATION_v0.3.0.sql` ausführen (v0.3.0 Erweiterungen)

3. **Environment Variables** setzen:
   ```
   TELEGRAM_BOT_TOKEN=dein_bot_token
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_KEY=dein_anon_key
   MASTER_ADMIN_ID=deine_telegram_id
   PORT=10000
   ```

4. **Starten:**
   ```bash
   npm start
   ```

### Update von v0.2.x

1. **Backup** der Supabase-Datenbank erstellen
2. `SUPABASE_MIGRATION_v0.3.0.sql` im SQL Editor ausführen
3. Alle Dateien mit dem neuen Release ersetzen
4. Bot neu starten

Bestehende Bestellungen erhalten automatisch eine Order-ID. Detaillierte Anleitung in `UPDATE_CHECKLIST_v0.3.0.md`.

---

## ⚙️ Befehle

| Befehl | Rolle | Beschreibung |
|--------|-------|-------------|
| `/start` | Alle | Hauptmenü öffnen |
| `/id [ORDERID]` | Admin, Master | Bestellung aufrufen und verwalten |
| `/deleteid [ORDERID]` | Master | Bestellung aus dem System löschen |
| `/addadmin [ID]` | Master | Nutzer zum Admin ernennen |

**Order-ID Format:** `ORD-10001` oder kurz `10001` (wird automatisch ergänzt).

---

## 🔒 Sicherheit & Datenschutz

- **Privnote-Integration:** Versandadressen und Transaktions-IDs werden als einmalige Links übermittelt und sind nach dem Öffnen nicht mehr abrufbar.
- **Rollenbasierte Zugriffskontrolle:** Dreistufiges System (Customer → Admin → Master) mit Middleware-Prüfung auf jeder Aktion.
- **Row Level Security:** Supabase RLS-Policies auf allen Tabellen aktiv.
- **Session-Schutz:** Wizard-Scenes fangen Fehleingaben ab und verhindern Datenverlust bei Nutzer-Abbrüchen.

---

## 🛠 Technischer Stack

| Komponente | Technologie |
|------------|-------------|
| Runtime | Node.js ≥ 18 |
| Bot Framework | Telegraf 4.x |
| Datenbank | Supabase (PostgreSQL) |
| Bild-Hosting | Telegra.ph (dezentral) |
| Hosting | Render.com / beliebig |

---

## 📊 Performance

- Optimierte Supabase-Queries: Selektives Laden von Feldern, Indizes auf Status/Rollen
- Parallele API-Calls wo möglich (`Promise.all`)
- Automatische Reconnect-Schleife bei Telegram-Verbindungsabbrüchen
- Integrierter Health-Check-Server für Uptime-Monitoring

---

**Powered by [t.me/autoacts](https://t.me/autoacts)** — *Sicherheit, Diskretion und Effizienz in einem System.*
