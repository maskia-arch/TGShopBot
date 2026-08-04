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
const addCouponScene = require('./bot/scenes/addCouponScene');
const editOpeningHoursScene = require('./bot/scenes/editOpeningHoursScene');
const editAbsenceMsgScene = require('./bot/scenes/editAbsenceMsgScene');

const notificationService = require('./services/notificationService');
const cronService = require('./services/cronService');
const keepAlive = require('./services/keepAlive');
const cryptoPaymentService = require('./services/cryptoPaymentService');

const { checkBan, checkShopStatus } = require('./bot/middlewares/auth');

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
    feedbackScene,
    addCouponScene,
    editOpeningHoursScene,
    editAbsenceMsgScene
]);

bot.use(session());
bot.use(stage.middleware());
bot.use(checkBan);
bot.use(checkShopStatus);
const uiHelper = require('./utils/uiHelper');

bot.use((ctx, next) => {
    keepAlive.notifyUpdate();
    uiHelper.touchSession(ctx);
    return next();
});

const userRepo = require('./database/repositories/userRepo');
const customerMenu = require('./bot/keyboards/customerMenu');
const adminKeyboards = require('./bot/keyboards/adminKeyboards');
const masterMenu = require('./bot/keyboards/masterMenu');

bot.catch(async (err, ctx) => {
    const errMsg = (err.message || '').toLowerCase();
    console.error(`Update Error [${ctx?.updateType || 'unknown'}]:`, err.message);

    if (ctx && ctx.callbackQuery) {
        ctx.answerCbQuery('⚠️ Diese Ansicht ist veraltet.', { show_alert: true }).catch(() => {});
        ctx.deleteMessage().catch(() => {});

        try {
            const role = await userRepo.getUserRole(ctx.from.id);
            if (role === 'master') {
                await uiHelper.updateOrSend(ctx, '⚠️ *Ansicht veraltet*\nDu wurdest automatisch zum Master-Panel weitergeleitet:', masterMenu());
            } else if (role === 'admin') {
                await uiHelper.updateOrSend(ctx, '⚠️ *Ansicht veraltet*\nDu wurdest automatisch zum Admin-Panel weitergeleitet:', adminKeyboards.getAdminMenu());
            } else {
                await uiHelper.updateOrSend(ctx, '⚠️ *Ansicht veraltet*\nDu wurdest automatisch zum Hauptmenü weitergeleitet:', customerMenu());
            }
        } catch (e) {}
    }
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

// ─── BOT STARTEN mit automatischer Konflikt-Lösung & Exponentiellem Backoff ──
let retryDelay = 3000;
const MAX_RETRY_DELAY = 30000;

const startBot = async () => {
    try {
        // 1. Zwinge Telegram, alle alten Webhooks & Polling-Sessions sofort zu trennen
        await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));

        // 2. Starte Launch mit dropPendingUpdates: true
        await bot.launch({ dropPendingUpdates: true });
        retryDelay = 3000;
        console.log(`✅ Bot v${config.VERSION} erfolgreich gestartet.`);
        cronService.start(3600000);
        keepAlive.start(bot);
        cryptoPaymentService.start(bot);
    } catch (error) {
        if (error.message && error.message.includes('409')) {
            console.warn(`[StartBot] Polling-Sperre durch alte Instanz erkannt (409 Conflict). Trenne Verbindung... (Versuch in 2s)`);
            await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
            setTimeout(() => startBot(), 2000);
        } else {
            console.error(`[StartBot] Telegram Fehler: ${error.message} – Erneuter Versuch in ${retryDelay / 1000}s...`);
            setTimeout(() => {
                retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY);
                startBot();
            }, retryDelay);
        }
    }
};

startBot();

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────────────
let shuttingDown = false;

const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[Shutdown] ${signal} empfangen, fahre herunter...`);
    keepAlive.stop();
    cronService.stop();
    cryptoPaymentService.stop();
    bot.stop(signal);

    const forceExit = setTimeout(() => {
        console.log('[Shutdown] Timeout – harter Abbruch.');
        process.exit(0);
    }, 3000);
    forceExit.unref();

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
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Unhandled Rejection:', reason);
});
