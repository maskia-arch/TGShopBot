const userRepo = require('../database/repositories/userRepo');
const texts = require('../utils/texts');
const config = require('../config');

let bot;
let intervalId;

const init = (botInstance) => {
    bot = botInstance;
};

const processExpiredBans = async () => {
    try {
        const expiredBans = await userRepo.getExpiredPendingBans();
        
        for (const ban of expiredBans) {
            try {
                // Ban bestätigen
                await userRepo.confirmBan(ban.id);
                
                // Alle Daten des Users löschen
                await userRepo.deleteUserCompletely(ban.user_id);
                
                // Master benachrichtigen
                const masterId = Number(config.MASTER_ADMIN_ID);
                if (masterId && bot) {
                    const text = texts.getBanConfirmed(ban.user_id);
                    await bot.telegram.sendMessage(masterId, text, { parse_mode: 'Markdown' }).catch(() => {});
                }
                
                console.log(`[CRON] Ban für User ${ban.user_id} auto-bestätigt, Daten gelöscht.`);
            } catch (error) {
                console.error(`[CRON] Fehler bei Ban ${ban.id}:`, error.message);
            }
        }
    } catch (error) {
        console.error('[CRON] processExpiredBans Error:', error.message);
    }
};

const start = (intervalMs = 3600000) => {
    // Standard: jede Stunde prüfen
    console.log(`[CRON] Ban-Prüfung gestartet (Intervall: ${intervalMs / 1000}s)`);
    processExpiredBans(); // Sofort einmal ausführen
    intervalId = setInterval(processExpiredBans, intervalMs);
};

const stop = () => {
    if (intervalId) {
        clearInterval(intervalId);
        console.log('[CRON] Ban-Prüfung gestoppt.');
    }
};

module.exports = {
    init,
    start,
    stop,
    processExpiredBans
};
