# 🤖 t.me/autoacts - Shop Bot Core

Ein hochprofessionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, Echtzeit-Lagerverwaltung und dezentraler Datenstruktur. Entwickelt von [t.me/autoacts](https://t.me/autoacts).

## ✨ Hauptfunktionen

### 👑 Master Admin (Inhaber)
- **Hard-Coded Sicherheit:** Zugriff ist exklusiv an die in den Environment Variables hinterlegte `MASTER_ADMIN_ID` gebunden.
- **Personalverwaltung:** Ernennung und Entlassung von Admins (Mitarbeitern) direkt über den Bot.
- **Kontrollinstanz:** Finales Freigabesystem (Approval-Queue) für kritische Änderungen wie Preis-Updates oder das Löschen von Produkten.

### 🛠 Admin Panel (Mitarbeiter)
- **Sortimentspflege:** Erstellen und Bearbeiten von Kategorien und Produkten.
- **Lager-Steuerung:** Produkte können per Knopfdruck als "Ausverkauft" markiert werden (Kauf-Button wird für Kunden gesperrt).
- **Diskretion:** "Unsichtbar"-Modus für Produkte, die vorbereitet, aber noch nicht veröffentlicht werden sollen.

### 💳 Kunden-Interface & UI
- **Modernes Design:** Dynamische Nachrichten-Updates (Edit-Mode) für einen sauberen Chat ohne Spam.
- **Warenkorb-System:** Intuitive Bedienung mit Mengenwahl und automatischer Summenberechnung.
- **Rechnungswesen:** Formatiert ausgegebene Bestellübersichten mit Unterstützung für verschiedene Zahlungsarten.

### 🔒 Sicherheit & Datenschutz
- **Dezentrales Bild-Hosting:** Bilder werden anonymisiert über Telegra.ph verarbeitet. Es findet keine Speicherung sensibler Bilddaten auf dem eigenen Server statt.
- **Middleware-Schutz:** Jede Interaktion wird durch eine Authentifizierungs-Ebene geprüft.

## 🚀 Installation & Betrieb

1. **Repository:** Lade das Repository in deinen Editor (z. B. Spck Editor) oder klone es lokal.
2. **Abhängigkeiten:** Installiere die nötigen Pakete mit `npm install`.
3. **Datenbank:** Führe die SQL-Befehle aus der `SETUP.txt` in deinem Supabase SQL-Editor aus.
4. **Hosting:** Erstelle einen neuen Web Service bei einem Hoster deiner Wahl (Empfehlung: **Render.com**).
5. **Environment Variables:** Hinterlege folgende Variablen im Hosting-Dashboard:
   - `TELEGRAM_BOT_TOKEN`: Dein Token vom @BotFather.
   - `SUPABASE_URL`: Deine Supabase Projekt-URL.
   - `SUPABASE_KEY`: Dein Service-Role-Key (nicht der Anon-Key!).
   - `MASTER_ADMIN_ID`: Deine persönliche Telegram-ID.

## 🛠 Wartung
- **Versionierung:** Die aktuelle Bot-Version wird zentral in der Datei `version.txt` gesteuert.
- **Struktur-Updates:** Bei Änderungen an den Datenbank-Tabellen ist die `SETUP.txt` entsprechend zu aktualisieren.

---
**Powered by [t.me/autoacts](https://t.me/autoacts)** *Sicherheit, Diskretion und Effizienz in einem System.*
