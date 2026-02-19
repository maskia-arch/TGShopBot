# 🤖 t.me/autoacts - Shop Bot Core | v0.2.1

Ein hochprofessionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, Echtzeit-Lagerverwaltung und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

## ✨ Neue Funktionen in v0.2.1

- **🛡️ Anti-Lost & Scene Protection:** Kugelsichere Wizard-Szenen. Tippt ein Nutzer während eines laufenden Prozesses (z.B. Produkterstellung, Mengenauswahl) aus Versehen `/start`, stürzt das Menü nicht mehr ab. Der Bot fängt Fehleingaben ab, räumt den Chat auf und wiederholt intelligent die letzte offene Frage inkl. Abbruch-Button.
- **⚡ 24/7 Auto-Reconnect & Keep-Alive:** Integrierter HTTP-Webserver für UptimeRobot-Pings kombiniert mit einer automatischen Wiederbelebungs-Schleife. Der Bot übersteht Telegram-Verbindungsabbrüche oder Server-Lags ab sofort völlig autonom und verbindet sich selbst neu.
- **👁️ Flicker-Free UI & Chat-Hygiene:** Das Hauptmenü (`/start`) lädt jetzt blitzschnell im Vordergrund, während alte Menüs und User-Eingaben nahtlos im Hintergrund gelöscht werden. Absolut sauberes Chat-Interface ohne Lade-Flackern.
- **🔔 Smart Admin Tracking:** Der Master-Admin erhält sofortige Push-Benachrichtigungen, sobald ein Sub-Admin ein neues Produkt anlegt – inklusive 1-Klick "Rückgängig"-Button (Undo-Funktion) für die absolute Qualitätskontrolle.
- **📦 UX-Optimierungen:** Intuitive "Kategorielos"-Zuweisung bei neuen Produkten und globale Abbrechen-Funktionen ("❌") in jedem einzelnen Schritt der Shop-Navigation.

## ✨ Hauptfunktionen

### 👑 Master Admin (Inhaber)
- **Absolute Systemgewalt:** Exklusiver Zugriff auf das Master-Dashboard via `MASTER_ADMIN_ID`.
- **Approval-Workflow:** Finale Freigabe von Preisänderungen und Löschanträgen durch Mitarbeiter.
- **System-Management:** Zahlungsarten verwalten, Admins steuern und inaktive User-Daten bereinigen.
- **Live-Überwachung:** Benachrichtigungen über alle relevanten Änderungen im Shop-Inventar.

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
3. **Datenbank:** SQL-Befehle aus der `SETUP.txt` (v0.2.1) in Supabase ausführen.
4. **Hosting:** Web Service auf Render.com (oder ähnlichen Anbietern) erstellen.
5. **Environment Variables:** - `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`
   - `MASTER_ADMIN_ID` (Deine numerische ID)
   - `VERSION`: 0.2.1
   - `PORT`: 10000

## 🛠 Wartung & Performance
- **Datenbank-Integrität:** `ON DELETE SET NULL` Logik verschiebt Produkte beim Löschen von Kategorien automatisch in "Kategorielos".
- **Skalierbarkeit:** v0.2.1 nutzt optimierte Indexe auf Rollen und Status-Felder für blitzschnelle Broadcasts.
- **Session-Management:** Temporäre Speicherung von Zwischenschritten (`lastQuestion`) im RAM verhindert fehlerhafte Datenbankeinträge bei Nutzer-Abbrüchen.

---
**Powered by [t.me/autoacts](https://t.me/autoacts)** *Sicherheit, Diskretion und Effizienz in einem System.*
