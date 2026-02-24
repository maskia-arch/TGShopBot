# v0.3.4 PATCH – Nur geänderte Dateien

## Kritische Fixes

### 1. "Bestellung abschicken" crashte (UUID-Fehler)
- **Fehler:** `invalid input syntax for type uuid: "3"`
- **Ursache:** `payment_method_id` in orders-Tabelle ist UUID, Callback liefert Integer
- **Fix:** `payment_method_id` wird NICHT mehr in die Order geschrieben. `payment_method_name` reicht.
- **Datei:** `src/database/repositories/orderRepo.js`

### 2. "Zurück" Button (Kundenansicht) tat nichts
- **Ursache:** `back_to_main` Callback hatte keinen Handler
- **Fix:** Handler in shopActions.js hinzugefügt (zeigt Hauptmenü je nach Rolle)
- **Datei:** `src/bot/actions/shopActions.js`

### 3. "Offene Bestellungen" Button löschte sich
- **Ursache:** `updateOrSend` versuchte Nachricht zu editieren → scheiterte
- **Fix:** Alle Order-Aktionen nutzen `ctx.reply()` (neue Nachricht)
- **Dateien:** `src/bot/actions/orderActions.js`

### 4. /orders Ladefehler
- **Ursache:** Supabase Foreign Key Join auf `users` schlug fehl
- **Fix:** `SELECT_FULL` ohne User-Join, Order-Queries robust
- **Datei:** `src/database/repositories/orderRepo.js`

### 5. Checkout-Abbruch unzuverlässig
- **Fix:** Cancel-Handler sowohl im Step-Handler als auch Scene-Level
- **Datei:** `src/bot/scenes/checkoutScene.js`

## Bestellfluss (v0.3.4)

```
Kunde: Warenkorb → Checkout
  ↓
[Lieferoption falls nötig]
  ↓
Zahlungsart wählen → Rechnung mit Wallet-Adresse anzeigen
  ↓
"Bestellung abschicken" → Order erstellt
  ↓
Kunden-Receipt (PERSISTENT):
  - Order-ID, Betrag, Zahlungsadresse
  - Button "💸 Zahlung bestätigen"
  ↓
Admin erhält Benachrichtigung: "NEUE BESTELLUNG"
  ↓
Kunde klickt "Zahlung bestätigen" → TX-ID eingeben
  ↓
TX-ID gespeichert → Status: "bezahlt_pending"
  ↓
Admin erhält: "ZAHLUNG EINGEGANGEN?" mit TX-ID
  ↓
Admin setzt Status: "In Bearbeitung" → Kunde erhält Update
```

## Dateien ersetzen

| Patch-Datei | Ziel |
|---|---|
| `version.txt` | `/version.txt` |
| `src/database/repositories/orderRepo.js` | gleiches Verzeichnis |
| `src/bot/scenes/checkoutScene.js` | gleiches Verzeichnis |
| `src/bot/actions/shopActions.js` | gleiches Verzeichnis |
| `src/bot/actions/orderActions.js` | gleiches Verzeichnis |
| `src/bot/commands/orderCommands.js` | gleiches Verzeichnis |
| `src/utils/texts.js` | gleiches Verzeichnis |
| `src/utils/formatters.js` | gleiches Verzeichnis |
| `src/services/notificationService.js` | gleiches Verzeichnis |

## Keine Migration nötig
`tx_id` Spalte muss vorhanden sein (aus v0.3.2 Migration).
