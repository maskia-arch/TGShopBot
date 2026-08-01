/*
 * © 2026 t.me/autoacts. Alle Rechte vorbehalten.
 * PROPRIETARY LICENSE. Weiterverkauf, Weitergabe und Vervielfältigung sind strengstens untersagt.
 * Siehe LICENSE Datei für Details.
 */
const { Telegraf, Scenes, session } = require('telegraf');
const config = require('./config');

const startCommand = require('./bot/commands/start');
const addadminCommand = require('./bot/commands/addadmin');
const orderCommands = require('./bot/commands/orderCommands');

const shopActions = require('./bot/actions/shopActions');
const checkoutActions = require('./bot/actions/checkoutActions');
const adminCoreActions = require('./bot/actions/adminCoreActions');
const adminCategoryActions = require('./bot/actions/adminCategoryActions');
const adminProductActions = require('./bot/actions/adminProductActions');
const masterActions = require('./bot/actions/masterActions');
const cartActions = require('./bot/actions/cartActions');
const orderActions = require('./bot/actions/orderActions');
const customerActions = require('./bot/actions/customerActions');

const addProductScene = require('./bot/scenes/addProductScene');
const addCategoryScene = require('./bot/scenes/addCategoryScene');
const renameCategoryScene = require('./bot/scenes/renameCategoryScene');
const renameProductScene = require('./bot/scenes/renameProductScene');
const addSubcategoryScene = require('./bot/scenes/addSubcategoryScene');
const renameSubcategoryScene = require('./bot/scenes/renameSubcategoryScene');
const askQuantityScene = require('./bot/scenes/askQuantityScene');
const editPriceScene = require('./bot/scenes/editPriceScene');
const broadcastScene = require('./bot/scenes/broadcastScene');
const editProductImageScene = require('./bot/scenes/editProductImageScene');
const editDescriptionScene = require('./bot/scenes/editDescriptionScene');
const addPaymentMethodScene = require('./bot/scenes/addPaymentMethodScene');
const checkoutScene = require('./bot/scenes/checkoutScene');
const contactScene = require('./bot/scenes/contactScene');
const editWelcomeMsgScene = require('./bot/scenes/editWelcomeMsgScene');
const feedbackScene = require('./bot/scenes/feedbackScene');

const notificationService = require('./services/notificationService');
const cronService = require('./services/cronService');
const keepAlive = require('./services/keepAlive');

const { checkBan } = require('./bot/middlewares/auth');

// ─── HEALTH SERVER ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
const server = keepAlive.createServer(PORT);

// ─── BOT SETUP ───────────────────────────────────────────────────────────
if (!config.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is missing');
    process.exit(1);
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

notificationService.init(bot);
cronService.init(bot);

const stage = new Scenes.Stage([
    addProductScene,
    addCategoryScene,
    renameCategoryScene,
    renameProductScene,
    addSubcategoryScene,
    renameSubcategoryScene,
    askQuantityScene,
    editPriceScene,
    broadcastScene,
    editProductImageScene,
    editDescriptionScene,
    addPaymentMethodScene,
    checkoutScene,
    contactScene,
    editWelcomeMsgScene,
    feedbackScene
]);

bot.use(session());
bot.use(stage.middleware());
bot.use(checkBan);
bot.use((ctx, next) => {
    keepAlive.notifyUpdate();
    return next();
});

bot.catch((err, ctx) => {
    console.error(`Update Error [${ctx.updateType}]:`, err.message);
});

startCommand(bot);
addadminCommand(bot);
orderCommands(bot);

shopActions(bot);
cartActions(bot);
checkoutActions(bot);
adminCoreActions(bot);
adminCategoryActions(bot);
adminProductActions(bot);
masterActions(bot);
orderActions(bot);
customerActions(bot);

// ─── BOT STARTEN mit exponentiellem Backoff ──────────────────────────────
// Verhindert Hammering der Telegram API bei wiederholten Verbindungsfehlern.
let retryDelay = 5000;
const MAX_RETRY_DELAY = 60000;

const startBot = () => {
    bot.launch().then(() => {
        retryDelay = 5000; // Reset nach erfolgreichem Start
        console.log(`Bot v${config.VERSION} started`);
        cronService.start(3600000);
        keepAlive.start(bot);
    }).catch((error) => {
        console.error(`Telegram Connection Error: ${error.message} – Retry in ${retryDelay / 1000}s`);
        setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
            startBot();
        }, retryDelay);
    });
};

startBot();

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────────────
// Render.com sendet SIGTERM bei Deploys und Scale-Downs.
// Wir räumen auf und beenden sauber. Render startet danach automatisch neu.
let shuttingDown = false;

const shutdown = (signal) => {
    if (shuttingDown) return; // Doppelten Shutdown verhindern
    shuttingDown = true;

    console.log(`[Shutdown] ${signal} empfangen, fahre herunter...`);
    keepAlive.stop();
    cronService.stop();
    bot.stop(signal);

    // Server schließen mit Timeout-Absicherung
    const forceExit = setTimeout(() => {
        console.log('[Shutdown] Timeout – harter Abbruch.');
        process.exit(0);
    }, 5000);
    forceExit.unref(); // Verhindert dass der Timer den Prozess offen hält

    server.close(() => {
        console.log('[Shutdown] Server geschlossen.');
        clearTimeout(forceExit);
        process.exit(0);
    });
};

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// ─── CRASH PROTECTION ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message);
    console.error(err.stack);
    setTimeout(() => process.exit(1), 2000);
});

process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Unhandled Rejection:', reason);
});
