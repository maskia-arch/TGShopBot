const fs = require('fs');
const path = require('path');

// Automatisches Laden von Umgebungsvariablen aus .env.local oder .env im lokalen Modus
try {
    const dotenv = require('dotenv');
    const envLocalPath = path.join(__dirname, '../../.env.local');
    const envPath = path.join(__dirname, '../../.env');

    if (fs.existsSync(envLocalPath)) {
        dotenv.config({ path: envLocalPath });
    } else if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    } else {
        dotenv.config();
    }
} catch (e) {
    // In Produktionsumgebungen (z.B. Render) liefert das Hosting-System process.env bereit.
}

const versionFilePath = path.join(__dirname, '../../version.txt');
let botVersion = '0.6';

try {
    if (fs.existsSync(versionFilePath)) {
        botVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
    }
} catch (error) {
    console.error('Version Read Error:', error.message);
}

const masterAdminIdRaw = process.env.MASTER_ADMIN_ID ? String(process.env.MASTER_ADMIN_ID).trim() : null;
const masterAdminId = masterAdminIdRaw && !isNaN(Number(masterAdminIdRaw)) ? Number(masterAdminIdRaw) : null;

module.exports = {
    VERSION: botVersion,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.trim() : '',
    SUPABASE_URL: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : '',
    SUPABASE_KEY: process.env.SUPABASE_KEY ? process.env.SUPABASE_KEY.trim() : '',
    MASTER_ADMIN_ID: masterAdminId
};
