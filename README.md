# 🤖 t.me/autoacts - Shop Bot Core | v0.1.2

Ein hochprofessionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, Echtzeit-Lagerverwaltung und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

## ✨ Neue Funktionen in v0.1.2

- **Flexible Kategorisierung:** Produkte können nun optional ohne Kategorie ("Sonstiges") erstellt werden.
- **Kategorie-Management:** Admins können Kategorien nun direkt im Bot erstellen, umbenennen und löschen.
- **Smart Relocation:** Beim Löschen einer Kategorie werden enthaltene Produkte automatisch in den Bereich "Sonstiges" verschoben, statt gelöscht zu werden.
- **Product Shifting:** Bestehende Produkte können jederzeit zwischen Kategorien verschoben werden.
- **Health-Check Integration:** Integrierter Mini-Webserver für stabiles Hosting auf Plattformen wie Render.com.

## ✨ Hauptfunktionen

### 👑 Master Admin (Inhaber)
- **Hard-Coded Sicherheit:** Zugriff ist exklusiv an die in den Environment Variables hinterlegte `MASTER_ADMIN_ID` gebunden.
- **Personalverwaltung:** Ernennung und Entlassung von Admins (Mitarbeitern) direkt über den Bot.
- **Kontrollinstanz:** Finales Freigabesystem (Approval-Queue) für kritische Änderungen wie Preis-Updates oder das Löschen von Produkten.

### 🛠 Admin Panel (Mitarbeiter)
- **Vollständiges CRUD:** Erstellen, Bearbeiten und Löschen von Kategorien und Produkten im laufenden Betrieb.
- **Lager-Steuerung:** Produkte per Knopfdruck als "Ausverkauft" markieren (Kauf-Button wird für Kunden gesperrt).
- **Diskretion:** "Unsichtbar"-Modus für Produkte, die vorbereitet, aber noch nicht veröffentlicht werden sollen.

### 💳 Kunden-Interface & UI
- **Kategorie-Übersicht:** Intuitive Navigation durch Kategorien oder den globalen "Sonstiges"-Bereich.
- **Modernes Design:** Dynamische Nachrichten-Updates (Edit-Mode) für einen sauberen Chat ohne Spam.
- **Warenkorb-System:** Intuitive Bedienung mit Mengenwahl und automatischer Summenberechnung.

### 🔒 Sicherheit & Datenschutz
- **Dezentrales Bild-Hosting:** Bilder werden anonymisiert über Telegra.ph verarbeitet. Keine Speicherung sensibler Bilddaten auf dem eigenen Server.
- **Middleware-Schutz:** Jede Interaktion wird durch eine Authentifizierungs-Ebene geprüft.

## 🚀 Installation & Betrieb

1. **Repository:** Lade das Repository in deinen Editor oder klone es.
2. **Abhängigkeiten:** Installiere die Pakete mit `npm install`.
3. **Datenbank:** Führe die SQL-Befehle aus der `SETUP.txt` (v0.1.2) in deinem Supabase SQL-Editor aus.
4. **Hosting:** Erstelle einen **Web Service** bei einem Hoster (Empfehlung: **Render.com**).
5. **Environment Variables:** Hinterlege folgende Variablen:
   - `TELEGRAM_BOT_TOKEN`: Dein Token vom @BotFather.
   - `SUPABASE_URL`: Deine Supabase Projekt-URL.
   - `SUPABASE_KEY`: Dein Service-Role-Key.
   - `MASTER_ADMIN_ID`: Deine persönliche Telegram-ID.
   - `PORT`: 10000 (für den Health-Check).

## 🛠 Wartung
- **Versionierung:** Die aktuelle Version wird in der `package.json` und `version.txt` gesteuert.
- **Stabilität:** Der Bot nutzt ein automatisches Port-Binding, um Deaktivierungen durch den Hoster zu vermeiden.

---
**Powered by [t.me/autoacts](https://t.me/autoacts)** *Sicherheit, Diskretion und Effizienz in einem System.*
