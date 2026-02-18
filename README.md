# 🤖 t.me/autoacts - Shop Bot Core | v0.1.3

Ein hochprofessionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, Echtzeit-Lagerverwaltung und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

## ✨ Neue Funktionen in v0.1.3

- **Chat-Hygiene & Auto-Cleanup:** Einzigartiges System zur automatischen Löschung von Zwischennachrichten in Wizards (Produkterstellung, Mengenwahl, Preisänderung). Der Chat bleibt stets sauber.
- **Intelligenter Edit-Mode:** Nachrichten werden bevorzugt aktualisiert (`editMessageText`). Bei Medienwechseln sorgt ein automatischer Delete/Resend-Mechanismus für eine nahtlose UI.
- **Strikte UI-Rechtetrennung:** Dynamische Anpassung der Menüs. Admins sehen Test-Buttons und Admin-Panels, während Kunden eine reine Shop-Oberfläche (Warenkorb etc.) erhalten.
- **Master-Notification-Service:** Sofortige Push-Benachrichtigungen an den Inhaber bei kritischen Freigabeanfragen (Löschungen/Preisänderungen) und neuen Bestellungen.
- **Temporary Feedback:** Systembestätigungen ("Hinzugefügt", "Verschoben") verschwinden automatisch nach wenigen Sekunden.

## ✨ Hauptfunktionen

### 👑 Master Admin (Inhaber)
- **Hard-Coded Sicherheit:** Zugriff exklusiv über die `MASTER_ADMIN_ID`.
- **Approval-System:** Master-Freigabe-Queue für Preisänderungen und Löschanträge von Mitarbeitern.
- **Personalverwaltung:** Ernennung/Entlassung von Admins per Bot-Kommando.

### 🛠 Admin Panel (Mitarbeiter)
- **Vollständiges Management:** CRUD-Operationen für Kategorien und Produkte direkt in Telegram.
- **Lager-Status:** Produkte in Echtzeit auf "Ausverkauft" oder "Unsichtbar" setzen.
- **Saubere Wizards:** Schritt-für-Schritt Erstellung ohne Nachrichten-Müll.

### 💳 Kunden-Interface
- **Modernes Shopping:** Mengenwahl bei Stückartikeln, automatisierte Summenberechnung und professionelle Rechnungsdarstellung.
- **Kategorien-Navigation:** Unterstützung für hierarchische Strukturen sowie einen "Sonstiges"-Bereich für Einzelstücke.



## 🚀 Installation & Betrieb

1. **Repository:** Repository klonen oder in Spck/Editor laden.
2. **Abhängigkeiten:** `npm install` ausführen.
3. **Datenbank:** SQL-Befehle aus der `SETUP.txt` (v0.1.3) in Supabase ausführen.
4. **Hosting:** Web Service auf Render.com erstellen.
5. **Environment Variables:** - `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`
   - `MASTER_ADMIN_ID` (Deine ID)
   - `PORT`: 10000

## 🛠 Wartung & Performance
- **Datenbank-Optimierung:** v0.1.3 führt Indexe für schnellere Abfragen ein.
- **Health-Check:** Automatisches Port-Binding sorgt für 24/7 Erreichbarkeit auf PaaS-Plattformen.

---
**Powered by [t.me/autoacts](https://t.me/autoacts)** *Sicherheit, Diskretion und Effizienz in einem System.*
