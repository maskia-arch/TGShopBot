const { Telegraf, Scenes, session } = require('telegraf');
const http = require('http'); // Neu hinzugefügt
const config = require('./config');

const startCommand = require('./bot/commands/start');
const addadminCommand = require('./bot/commands/addadmin');

const shopActions = require('./bot/actions/shopActions');
const checkoutActions = require('./bot/actions/checkoutActions');
const adminActions = require('./bot/actions/adminActions');
const masterActions = require('./bot/actions/masterActions');

const addProductScene = require('./bot/scenes/addProductScene');
const askQuantityScene = require('./bot/scenes/askQuantityScene');
const editPriceScene = require('./bot/scenes/editPriceScene');

const notificationService = require('./services/notificationService');

// --- RENDER PORT BINDING (NEU) ---
// Dies verhindert, dass Render den Bot wegen fehlendem Port neu startet
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Shop Bot is alive!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Health-check server listening on port ${PORT}`);
});
// ---------------------------------

if (!config.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is missing');
    process.exit(1);
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

notificationService.init(bot);

const stage = new Scenes.Stage([
    addProductScene, 
    askQuantityScene, 
    editPriceScene
]);

bot.use(session());
bot.use(stage.middleware());

startCommand(bot);
addadminCommand(bot);

shopActions(bot);
checkoutActions(bot);
adminActions(bot);
masterActions(bot);

bot.launch().then(() => {
    console.log(`Bot v${config.VERSION} started`);
}).catch((error) => {
    console.error(error.message);
});

process.once('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});
