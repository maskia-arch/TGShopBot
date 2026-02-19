const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../../version.txt');
let botVersion = '0.1.2';

try {
    if (fs.existsSync(versionFilePath)) {
        botVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
    }
} catch (error) {
    console.error('Version Read Error:', error.message);
}

module.exports = {
    VERSION: botVersion,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    MASTER_ADMIN_ID: process.env.MASTER_ADMIN_ID ? Number(process.env.MASTER_ADMIN_ID) : null
};
