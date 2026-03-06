const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const { parseMedia } = require('../../utils/uiHelper');
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

const editProductImageScene = new Scenes.WizardScene(
    'editProductImageScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.productId = ctx.scene.state.productId;
        ctx.wizard.state.lastQuestion = '🖼 *Bild oder GIF ändern*\n\nBitte sende ein neues Foto, ein GIF oder ein kurzes Video.\nTippe \"Löschen\", um das Medium zu entfernen oder \"Abbrechen\".';

        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [[{ text: 'Löschen' }, { text: 'Abbrechen' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });

        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        const productId = ctx.wizard.state.productId;
        const input = ctx.message.text?.trim();

        if (input && input.toLowerCase() === 'abbrechen') {
            return backToProduct(ctx);
        }

        if (input && input.startsWith('/')) {
            const warningMsg = await ctx.reply(ctx.wizard.state.lastQuestion, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: 'Löschen' }, { text: 'Abbrechen' }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        // finalFileId wird MIT Typ-Präfix gespeichert
        let finalFileId = undefined;

        if (ctx.message.photo && ctx.message.photo.length > 0) {
            // Fotos: höchste Auflösung nehmen
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            finalFileId = `photo:${fileId}`;
        } else if (ctx.message.animation) {
            finalFileId = `animation:${ctx.message.animation.file_id}`;
        } else if (ctx.message.video) {
            finalFileId = `video:${ctx.message.video.file_id}`;
        } else if (input && input.toLowerCase() === 'löschen') {
            finalFileId = null; // null = Bild entfernen
        } else if (input && input.length > 20 && !input.includes(' ')) {
            // Manuelle file_id oder URL (Legacy-Support)
            finalFileId = input;
        }

        try {
            if (finalFileId !== undefined) {
                await productRepo.updateProductImage(productId, finalFileId);
                await cleanup(ctx);
                await ctx.reply('✅ Medium erfolgreich aktualisiert!', { reply_markup: { remove_keyboard: true } });
            } else {
                await cleanup(ctx);
                await ctx.reply('⚠️ Ungültiges Format. Bitte sende ein Bild, GIF oder Video.', { reply_markup: { remove_keyboard: true } });
            }
            return backToProduct(ctx);
        } catch (error) {
            console.error('DB Update Error (editProductImageScene):', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

module.exports = editProductImageScene;
