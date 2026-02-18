const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../../version.txt');

let botVersion = 'Unknown';

try {
    botVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
} catch (error) {
    console.error(error.message);
    botVersion = 'Error-Reading-Version';
}

module.exports = {
    VERSION: botVersion,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    MASTER_ADMIN_ID: parseInt(process.env.MASTER_ADMIN_ID)
};
