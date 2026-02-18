const { Telegraf, Scenes, session } = require('telegraf');
const http = require('http');
const config = require('./config');

const startCommand = require('./bot/commands/start');
const addadminCommand = require('./bot/commands/addadmin');

const shopActions = require('./bot/actions/shopActions');
const checkoutActions = require('./bot/actions/checkoutActions');
const adminActions = require('./bot/actions/adminActions');
const masterActions = require('./bot/actions/masterActions');
const cartActions = require('./bot/actions/cartActions');

const addProductScene = require('./bot/scenes/addProductScene');
const addCategoryScene = require('./bot/scenes/addCategoryScene');
const renameCategoryScene = require('./bot/scenes/renameCategoryScene');
const askQuantityScene = require('./bot/scenes/askQuantityScene');
const editPriceScene = require('./bot/scenes/editPriceScene');
const broadcastScene = require('./bot/scenes/broadcastScene');
const editProductImageScene = require('./bot/scenes/editProductImageScene');

const notificationService = require('./services/notificationService');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Shop Bot is alive!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Health-check server listening on port ${PORT}`);
});

if (!config.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is missing');
    process.exit(1);
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

notificationService.init(bot);

const stage = new Scenes.Stage([
    addProductScene,
    addCategoryScene,
    renameCategoryScene,
    askQuantityScene,
    editPriceScene,
    broadcastScene,
    editProductImageScene
]);

bot.use(session());
bot.use(stage.middleware());

startCommand(bot);
addadminCommand(bot);

shopActions(bot);
cartActions(bot);
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
