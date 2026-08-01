const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const texts = require('../../utils/texts');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        ctx.wizard.state.messagesToDelete = [];
    }
};

const backToProduct = async (ctx) => {
    await cleanup(ctx);
    const productId = ctx.wizard.state.productId;
    ctx.update.callback_query = { data: `admin_edit_prod_${productId}`, from: ctx.from };
    return ctx.scene.leave();
};

const editDescriptionScene = new Scenes.WizardScene(
    'editDescriptionScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        const productId = ctx.scene.state.productId;
        const product = await productRepo.getProductById(productId);

        ctx.wizard.state.productId = productId;

        const currentDesc = product.description
            ? `Aktuelle Beschreibung:\n_${product.description}_\n\n`
            : `_Noch keine Beschreibung vorhanden._\n\n`;

        ctx.wizard.state.lastQuestion =
            `📝 *Beschreibung bearbeiten*\n\n${currentDesc}` +
            `Sende die neue Beschreibung.\nOder sende *-* um die Beschreibung zu entfernen.`;

        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);

        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            return backToProduct(ctx);
        }

        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]]
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        // "-" = Beschreibung löschen
        const newDescription = input === '-' ? null : input;

        try {
            await productRepo.updateProductDescription(ctx.wizard.state.productId, newDescription);
            await cleanup(ctx);

            const confirmText = newDescription
                ? `✅ Beschreibung aktualisiert.`
                : `✅ Beschreibung entfernt.`;
            await ctx.reply(confirmText, { parse_mode: 'Markdown' });

            return backToProduct(ctx);
        } catch (error) {
            console.error('EditDescription Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

editDescriptionScene.action('cancel_scene', async (ctx) => {
    await ctx.answerCbQuery('Abgebrochen');
    return backToProduct(ctx);
});

module.exports = editDescriptionScene;
