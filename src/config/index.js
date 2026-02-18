const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../../version.txt');

let botVersion = '0.1.2'; // Fallback-Version

try {
    if (fs.existsSync(versionFilePath)) {
        botVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
    }
} catch (error) {
    console.error('Fehler beim Lesen der version.txt:', error.message);
}

module.exports = {
    VERSION: botVersion,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    // Sicherstellen, dass die ID eine Zahl ist, um Vergleiche in der auth.js zu ermöglichen
    MASTER_ADMIN_ID: process.env.MASTER_ADMIN_ID ? parseInt(process.env.MASTER_ADMIN_ID, 10) : null
};
