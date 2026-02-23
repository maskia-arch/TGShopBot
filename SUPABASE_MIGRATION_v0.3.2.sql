-- ============================================================
-- SUPABASE MIGRATION: v0.3.1 → v0.3.2
-- Ausführen in: Supabase Dashboard → SQL Editor
-- BACKUP EMPFOHLEN vor Ausführung!
-- ============================================================

-- ============================================================
-- 1. PRODUCTS: Lieferoption (none/shipping/pickup/both)
-- ============================================================
-- Ersetzt das bisherige requires_shipping BOOLEAN
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_option TEXT DEFAULT 'none';

-- Bestehende requires_shipping Werte migrieren
UPDATE products SET delivery_option = 'shipping' WHERE requires_shipping = true;

-- ============================================================
-- 2. ORDERS: Liefermethode die der Kunde gewählt hat
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT NULL;
-- Werte: 'shipping', 'pickup', NULL (kein Versand nötig)

-- ============================================================
-- FERTIG! Migration v0.3.2 abgeschlossen.
-- ============================================================
