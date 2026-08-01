const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const localStorageClient = require('./localStorageClient');

const supabaseUrl = config.SUPABASE_URL;
const supabaseKey = config.SUPABASE_KEY;

const isPlaceholderUrl = !supabaseUrl || supabaseUrl.includes('your-project') || supabaseUrl === 'local';
const isPlaceholderKey = !supabaseKey || supabaseKey.includes('YOUR_SUPABASE') || supabaseKey === 'local';
const isForceLocal = process.env.USE_LOCAL_STORAGE === 'true';

let client;

if (isForceLocal || isPlaceholderUrl || isPlaceholderKey) {
    console.log('[DATABASE] 📁 Lokaler JSON-Speicher-Modus aktiv (.data/db.json) – Supabase entbunden.');
    client = localStorageClient;
} else {
    try {
        console.log('[DATABASE] ⚡ Verbinde mit Supabase Cloud...');
        client = createClient(supabaseUrl, supabaseKey);
    } catch (error) {
        console.warn('[DATABASE] Supabase-Verbindungsfehler. Wechsel auf lokalen Modus:', error.message);
        client = localStorageClient;
    }
}

module.exports = client;
