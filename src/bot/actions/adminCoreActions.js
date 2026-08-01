const userRepo = require('../../database/repositories/userRepo');
const productRepo = require('../../database/repositories/productRepo');
const approvalRepo = require('../../database/repositories/approvalRepo');
const notificationService = require('../../services/notificationService');
const config = require('../../config');
const uiHelper = require('../../utils/uiHelper');
const { isAdmin } = require('../middlewares/auth');
const texts = require('../../utils/texts');
const adminKeyboards = require('../keyboards/adminKeyboards');

module.exports = (bot) => {
    bot.action('admin_panel', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const role = await userRepo.getUserRole(userId);
            const isMaster = userId === Number(config.MASTER_ADMIN_ID);
            const keyboard = adminKeyboards.getAdminMenu(isMaster);
            await uiHelper.updateOrSend(ctx, texts.getWelcomeText(isMaster, role), keyboard);
        } catch (error) {}
    });

    bot.action('admin_info', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            await uiHelper.updateOrSend(ctx, texts.getAdminInfoText(), adminKeyboards.getBackToAdminPanel());
        } catch (error) {}
    });

    bot.action('admin_start_broadcast', isAdmin, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { 
            await ctx.scene.enter('broadcastScene'); 
        } catch (error) {}
    });
    // ─── PREIS-EINGABE FÜR TEMPORÄRE ADMINS ──────────────────────────────────
    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message?.text) return next();
        const input = ctx.message.text.trim();

        if (input.startsWith('/')) {
            ctx.session.pendingPriceProduct = null;
            return next();
        }

        if (ctx.session.pendingPriceProduct) {
            const productId = ctx.session.pendingPriceProduct;
            ctx.session.pendingPriceProduct = null;

            const newPrice = parseFloat(input.replace(',', '.'));
            if (isNaN(newPrice) || newPrice <= 0) {
                await ctx.reply('⚠️ Ungültiger Preis. Bitte versuche es erneut.');
                return;
            }

            try {
                const product = await productRepo.getProductById(productId);
                const formattedPrice = newPrice.toFixed(2);
                const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
                const approval = await approvalRepo.createApproval(productId, 'PRICE_CHANGE', formattedPrice, adminName);

                const text = `💰 *PREISÄNDERUNGS-ANFRAGE*\n\n` +
                    `👤 Admin: ${adminName}\n` +
                    `📦 Produkt: *${product?.name || productId}*\n` +
                    `💲 Neu: ${formattedPrice}€`;
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '✅ Genehmigen', callback_data: `master_approve_${approval.id}` }],
                        [{ text: '❌ Ablehnen', callback_data: `master_reject_appr_${approval.id}` }]
                    ]
                };
                notificationService.sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard }).catch(() => {});
                await ctx.reply(`📨 Preisänderung für *${product?.name || productId}* (${formattedPrice}€) wurde an den Master gesendet.`, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('PendingPrice error:', error.message);
                await ctx.reply('❌ Fehler beim Senden der Anfrage.');
            }
            return;
        }

        return next();
    });

};
