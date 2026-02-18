const userRepo = require('../database/repositories/userRepo');
const paymentRepo = require('../database/repositories/paymentRepo');

let bot;

const init = (botInstance) => {
    bot = botInstance;
};

const notifyAdminsNewOrder = async ({ userId, username, orderDetails, paymentId }) => {
    try {
        const paymentMethod = await paymentRepo.getPaymentMethod(paymentId);
        const admins = await userRepo.getAllAdmins();
        
        let orderText = `🚨 Neuer Kaufinteressent!\n\n`;
        orderText += `Kunde: ${username} (ID: ${userId})\n`;
        orderText += `Zahlungswunsch: ${paymentMethod.name}\n\n`;
        orderText += `Bestellung:\n`;
        
        let total = 0;
        orderDetails.forEach((item) => {
            orderText += `- ${item.quantity}x ${item.name} (${item.price}€) = ${item.total}€\n`;
            total += parseFloat(item.total);
        });
        
        orderText += `\nGesamtsumme: ${total.toFixed(2)}€`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '👤 Kontaktieren', url: `tg://user?id=${userId}` }]
            ]
        };

        for (const admin of admins) {
            await bot.telegram.sendMessage(admin.telegram_id, orderText, {
                reply_markup: keyboard
            }).catch(() => {});
        }
    } catch (error) {
        console.error(error.message);
    }
};

module.exports = {
    init,
    notifyAdminsNewOrder
};
