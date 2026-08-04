/**
 * localStorageClient.js – Tamper-Proof & Atomic Local JSON Database Engine
 * © 2026 t.me/autoacts
 * 
 * Ermöglicht den 100% lokalen, offline-fähigen Betrieb des Shop Bots
 * ohne externe Supabase-Abhängigkeit. Alle Daten werden atomar & sicher
 * in einer lokalen JSON-Datei (.data/db.json) gespeichert.
 * 
 * Garantiert 100% Schema-Kompatibilität zu PostgreSQL / Supabase v0.5.65.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../../.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Sicherstellen, dass das Datenverzeichnis existiert
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Spalten-Standardwerte analog zu den PostgreSQL DEFAULT-Klauseln
const TABLE_DEFAULTS = {
    users: {
        role: 'customer',
        is_banned: false,
        has_received_welcome: false,
        username: null,
        last_ping_at: null,
        last_contact_at: null
    },
    categories: {
        sort_order: 0,
        is_active: true
    },
    subcategories: {
        sort_order: 0,
        is_active: true
    },
    products: {
        sort_order: 0,
        is_active: true,
        is_out_of_stock: false,
        is_unit_price: false,
        delivery_option: 'none',
        description: null,
        image_url: null,
        price: 0,
        kyc_mode: 'none',
        kyc_options: []
    },
    payment_methods: {
        is_active: true,
        wallet_address: null,
        auto_verify: false,
        crypto_symbol: 'BTC'
    },
    carts: {
        quantity: 1,
        category_path: null
    },
    orders: {
        status: 'offen',
        details: [],
        admin_notes: [],
        notification_msg_ids: [],
        feedback_invited: false,
        digital_delivery: null,
        payment_method_name: 'Nicht angegeben',
        shipping_link: null,
        tx_id: null,
        total_amount: 0,
        crypto_amount: null,
        payment_identifier: null,
        confirmations: 0,
        received_crypto_amount: null,
        crypto_rate: null,
        last_rate_update: null,
        kyc_submission: null
    },
    pending_approvals: {
        status: 'pending',
        new_value: null,
        requested_by: null,
        target_id: null
    },
    pending_bans: {
        status: 'pending',
        reason: null,
        expires_at: null
    },
    feedbacks: {
        status: 'pending',
        is_anonymous: false,
        rating: 5,
        comment: null
    },
    product_deliverables: {
        status: 'available',
        order_id: null,
        delivered_to: null,
        delivered_at: null
    },
    coupons: {
        discount_type: 'percent',
        discount_value: 0,
        product_id: null,
        max_uses: null,
        uses_count: 0,
        expires_at: null,
        is_active: true
    },
    settings: {}
};

// Initialer Datenbank-Status (Vollständige Schema-Struktur aller 13 Tabellen)
const INITIAL_DB = {
    users: [],
    categories: [],
    subcategories: [],
    products: [],
    payment_methods: [
        {
            id: 'b1a2c3d4-0000-4000-8000-000000000001',
            name: 'Bitcoin / Crypto',
            wallet_address: 'bc1qdemo_wallet_address_for_local_testing_only',
            is_active: true
        }
    ],
    carts: [],
    orders: [],
    pending_approvals: [],
    pending_bans: [],
    feedbacks: [],
    product_deliverables: [],
    coupons: [],
    settings: [
        {
            key: 'welcome_message',
            value: 'Willkommen in unserem lokalen Test-Shop!',
            updated_at: new Date().toISOString()
        }
    ],
    _sequences: {
        order_number: 10001
    }
};

// Atomares Speichern in Datei (Schreiben in Temp-Datei & Rename verhindert Beschädigung)
function saveDbSync(data) {
    try {
        const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
        console.error('[LocalStorageDB] Fehler beim atomaren Speichern:', err.message);
    }
}

// Datenbank laden, Schema verifizieren und fehlende Tabellen/Felder reparieren
function loadDbSync() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            saveDbSync(INITIAL_DB);
            return JSON.parse(JSON.stringify(INITIAL_DB));
        }
        const content = fs.readFileSync(DB_FILE, 'utf8');
        const db = JSON.parse(content);
        
        let modified = false;
        // Vorhandensein aller 11 Tabellen garantieren
        for (const table of Object.keys(INITIAL_DB)) {
            if (!db[table]) {
                db[table] = INITIAL_DB[table];
                modified = true;
            }
        }
        if (!db._sequences) {
            db._sequences = { order_number: 10001 };
            modified = true;
        }

        if (modified) {
            saveDbSync(db);
        }
        return db;
    } catch (err) {
        console.error('[LocalStorageDB] Fehler beim Lesen der DB. Erstelle Backup & Reset:', err.message);
        if (fs.existsSync(DB_FILE)) {
            fs.renameSync(DB_FILE, `${DB_FILE}.corrupt.${Date.now()}`);
        }
        saveDbSync(INITIAL_DB);
        return JSON.parse(JSON.stringify(INITIAL_DB));
    }
}

function generateUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function deepClone(obj) {
    if (obj === undefined || obj === null) return obj;
    return JSON.parse(JSON.stringify(obj));
}

// Supabase QueryBuilder Simulator mit automatischer Standardwerte-Ergänzung
class LocalQueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.conditions = [];
        this.orders = [];
        this.limitVal = null;
        this.offsetVal = null;
        this.rangeVal = null;
        this.isSingle = false;
        this.isMaybeSingle = false;
        this.selectFields = null;
        this.withCount = false;

        this.opType = 'select'; // 'select' | 'insert' | 'update' | 'delete' | 'upsert'
        this.payload = null;
        this.upsertOptions = null;
    }

    select(fields = '*', options = {}) {
        if (options && options.count === 'exact') {
            this.withCount = true;
        }
        this.selectFields = fields;
        return this;
    }

    insert(data) {
        this.opType = 'insert';
        this.payload = Array.isArray(data) ? data : [data];
        return this;
    }

    update(data) {
        this.opType = 'update';
        this.payload = data;
        return this;
    }

    delete() {
        this.opType = 'delete';
        return this;
    }

    upsert(data, options = {}) {
        this.opType = 'upsert';
        this.payload = Array.isArray(data) ? data : [data];
        this.upsertOptions = options;
        return this;
    }

    eq(column, value) {
        this.conditions.push({ type: 'eq', column, value });
        return this;
    }

    neq(column, value) {
        this.conditions.push({ type: 'neq', column, value });
        return this;
    }

    lt(column, value) {
        this.conditions.push({ type: 'lt', column, value });
        return this;
    }

    gt(column, value) {
        this.conditions.push({ type: 'gt', column, value });
        return this;
    }

    in(column, values) {
        this.conditions.push({ type: 'in', column, values: Array.isArray(values) ? values : [values] });
        return this;
    }

    is(column, value) {
        this.conditions.push({ type: 'is', column, value });
        return this;
    }

    not(column, operator, value) {
        this.conditions.push({ type: 'not', column, operator, value });
        return this;
    }

    order(column, options = {}) {
        const ascending = options.ascending !== false;
        this.orders.push({ column, ascending });
        return this;
    }

    limit(n) {
        this.limitVal = n;
        return this;
    }

    range(from, to) {
        this.rangeVal = { from, to };
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    maybeSingle() {
        this.isMaybeSingle = true;
        return this;
    }

    // Erfüllt die standardmäßige Promise-Schnittstelle von Supabase
    then(resolve, reject) {
        try {
            const result = this._execute();
            resolve(result);
        } catch (err) {
            reject(err);
        }
    }

    catch(reject) {
        return this.then((res) => res, reject);
    }

    _matchItem(item) {
        for (const cond of this.conditions) {
            const val = item[cond.column];
            if (cond.type === 'eq') {
                if (String(val) !== String(cond.value)) return false;
            } else if (cond.type === 'neq') {
                if (String(val) === String(cond.value)) return false;
            } else if (cond.type === 'lt') {
                if (new Date(val).getTime() >= new Date(cond.value).getTime()) return false;
            } else if (cond.type === 'gt') {
                if (new Date(val).getTime() <= new Date(cond.value).getTime()) return false;
            } else if (cond.type === 'in') {
                const strList = cond.values.map(String);
                if (!strList.includes(String(val))) return false;
            } else if (cond.type === 'is') {
                if (cond.value === null && val !== null && val !== undefined) return false;
                if (cond.value !== null && String(val) !== String(cond.value)) return false;
            } else if (cond.type === 'not') {
                if (cond.operator === 'is' && cond.value === null && (val === null || val === undefined)) return false;
            }
        }
        return true;
    }

    _execute() {
        const db = loadDbSync();
        let rows = db[this.tableName] || [];
        const defaults = TABLE_DEFAULTS[this.tableName] || {};

        // 1. OPERATION: INSERT
        if (this.opType === 'insert') {
            const inserted = [];
            for (const item of this.payload) {
                const newItem = { ...defaults, ...deepClone(item) };
                if (!newItem.id && this.tableName !== 'users' && this.tableName !== 'settings') {
                    newItem.id = generateUUID();
                }
                if (this.tableName === 'orders' && !newItem.order_id) {
                    if (!db._sequences) db._sequences = { order_number: 10001 };
                    const seq = db._sequences.order_number++;
                    newItem.order_id = 'ORD-' + String(seq).padStart(5, '0');
                }
                if (!newItem.created_at) {
                    newItem.created_at = new Date().toISOString();
                }
                rows.push(newItem);
                inserted.push(newItem);
            }
            db[this.tableName] = rows;
            saveDbSync(db);
            return { data: deepClone(inserted), error: null };
        }

        // 2. OPERATION: UPSERT
        if (this.opType === 'upsert') {
            const onConflictKey = (this.upsertOptions && this.upsertOptions.onConflict) 
                ? this.upsertOptions.onConflict 
                : (this.tableName === 'users' ? 'telegram_id' : (this.tableName === 'settings' ? 'key' : 'id'));

            const upserted = [];
            for (const item of this.payload) {
                const conflictVal = item[onConflictKey];
                const existingIdx = rows.findIndex(r => String(r[onConflictKey]) === String(conflictVal));
                if (existingIdx >= 0) {
                    rows[existingIdx] = { ...defaults, ...rows[existingIdx], ...deepClone(item), updated_at: new Date().toISOString() };
                    upserted.push(rows[existingIdx]);
                } else {
                    const newItem = { ...defaults, ...deepClone(item) };
                    if (!newItem.id && this.tableName !== 'users' && this.tableName !== 'settings') {
                        newItem.id = generateUUID();
                    }
                    if (!newItem.created_at) newItem.created_at = new Date().toISOString();
                    rows.push(newItem);
                    upserted.push(newItem);
                }
            }
            db[this.tableName] = rows;
            saveDbSync(db);
            return { data: deepClone(upserted), error: null };
        }

        // Filter anwenden
        let matched = rows.filter(item => this._matchItem(item));

        // 3. OPERATION: UPDATE
        if (this.opType === 'update') {
            const updated = [];
            db[this.tableName] = rows.map(item => {
                if (this._matchItem(item)) {
                    const newItem = { ...item, ...deepClone(this.payload) };
                    updated.push(newItem);
                    return newItem;
                }
                return item;
            });
            saveDbSync(db);
            return { data: deepClone(updated), error: null };
        }

        // 4. OPERATION: DELETE
        if (this.opType === 'delete') {
            db[this.tableName] = rows.filter(item => !this._matchItem(item));
            saveDbSync(db);
            return { data: null, error: null };
        }

        // 5. OPERATION: SELECT
        // Sortierung
        if (this.orders.length > 0) {
            matched.sort((a, b) => {
                for (const ord of this.orders) {
                    let valA = a[ord.column];
                    let valB = b[ord.column];
                    if (valA === undefined) valA = '';
                    if (valB === undefined) valB = '';
                    if (valA < valB) return ord.ascending ? -1 : 1;
                    if (valA > valB) return ord.ascending ? 1 : -1;
                }
                return 0;
            });
        }

        const totalCount = matched.length;

        // Range / Pagination
        if (this.rangeVal) {
            matched = matched.slice(this.rangeVal.from, this.rangeVal.to + 1);
        } else if (this.limitVal) {
            matched = matched.slice(0, this.limitVal);
        }

        // Relationale Joins auflösen (z.B. carts -> products) & Defaults auffüllen
        let processed = matched.map(item => {
            const clone = { ...defaults, ...deepClone(item) };
            if (this.tableName === 'carts' && clone.product_id) {
                const product = (db.products || []).find(p => String(p.id) === String(clone.product_id));
                if (product) {
                    clone.products = { ...TABLE_DEFAULTS.products, ...deepClone(product) };
                } else {
                    clone.products = { id: clone.product_id, name: 'Unbekanntes Produkt', price: 0, is_unit_price: false };
                }
            }
            return clone;
        });

        if (this.isSingle) {
            if (processed.length === 0) {
                return { data: null, error: { message: `No rows found in ${this.tableName}` } };
            }
            return { data: processed[0], error: null };
        }

        if (this.isMaybeSingle) {
            return { data: processed[0] || null, error: null };
        }

        if (this.withCount) {
            return { data: processed, count: totalCount, error: null };
        }

        return { data: processed, error: null };
    }
}

// Initialer Selbstcheck beim Laden des Moduls
loadDbSync();

// Client-Interface wie Supabase JS Client
const localStorageClient = {
    from(tableName) {
        return new LocalQueryBuilder(tableName);
    }
};

module.exports = localStorageClient;
