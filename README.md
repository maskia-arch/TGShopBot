# 🤖 t.me/autoacts - Shop Bot Core | v0.1.6

Ein hochprofessionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, Echtzeit-Lagerverwaltung und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

## ✨ Neue Funktionen in v0.1.6

- **📢 Smart Broadcast System:** Admins und Master können Push-Nachrichten an alle registrierten Kunden senden. Inklusive Echtzeit-Zustellungsreport und Erkennung von Bot-Blockierungen.
- **🧹 Automatisierte Datenpflege:** Der Master Admin kann blockierte oder inaktive User-Datensätze nach einem Broadcast-Fehler direkt per Knopfdruck löschen, um die Datenbank-Hygiene zu wahren.
- **💳 Dynamische Zahlungs-Instruktionen:** Vollständige Verwaltung von Zahlungsarten über das Master-Panel. Hinterlegte Wallet-Adressen werden dem Kunden beim Checkout als klickbare (kopierbare) Monospace-Texte angezeigt.
- **🛡️ ID-basiertes Admin-Management:** Sichere Ernennung von neuen Admins direkt über das Master-Panel durch einfache Eingabe der Telegram-ID.
- **🖼️ UI-Resilience & Fixes:** Optimierter `uiHelper` erkennt Mediennachrichten (Fotos) automatisch und verhindert Interface-Fehler beim Wechsel zwischen Produktbildern und Textmenüs.

## ✨ Hauptfunktionen

### 👑 Master Admin (Inhaber)
- **Absolute Systemgewalt:** Exklusiver Zugriff auf das Master-Dashboard via `MASTER_ADMIN_ID`.
- **Approval-Workflow:** Finale Freigabe von Preisänderungen und Löschanträgen durch Mitarbeiter.
- **System-Management:** Zahlungsarten verwalten, Admins steuern und inaktive User-Daten bereinigen.

### 🛠 Admin Panel (Mitarbeiter)
- **Produkt-Management:** CRUD-Operationen für Kategorien und Produkte direkt in Telegram.
- **Broadcast-Rechte:** Versenden von Rundnachrichten an die gesamte Kundschaft für Angebote oder News.
- **Lager-Logik:** Produkte mit einem Klick auf "Ausverkauft" setzen oder für Kunden unsichtbar schalten.

### 💳 Kunden-Interface
- **Seamless Shopping:** Intuitive Mengenwahl, Warenkorb-Management und professionelle Rechnungsstellung.
- **Kopier-Funktion:** Zahlungsadressen (Wallets/PayPal) werden so dargestellt, dass sie durch einfaches Tippen kopiert werden können.
- **Kategorie-Filter:** Automatische Ausblendung leerer Kategorien für eine saubere Storefront.

## 🚀 Installation & Betrieb

1. **Repository:** Repository klonen oder in Spck/Editor laden.
2. **Abhängigkeiten:** `npm install` ausführen.
3. **Datenbank:** SQL-Befehle aus der `SETUP.txt` (v0.1.6) in Supabase ausführen.
4. **Hosting:** Web Service auf Render.com erstellen.
5. **Environment Variables:** - `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`
   - `MASTER_ADMIN_ID` (Deine numerische ID)
   - `VERSION`: 0.1.6
   - `PORT`: 10000

## 🛠 Wartung & Performance
- **Datenbank-Integrität:** `ON DELETE SET NULL` Logik verschiebt Produkte beim Löschen von Kategorien automatisch in "Sonstiges".
- **Skalierbarkeit:** v0.1.6 nutzt optimierte Indexe auf Rollen und Status-Felder für blitzschnelle Broadcasts.

---
**Powered by [t.me/autoacts](https://t.me/autoacts)** *Sicherheit, Diskretion und Effizienz in einem System.*
