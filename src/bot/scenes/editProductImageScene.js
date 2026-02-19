const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const { uploadToDezentral } = require('../../utils/imageUploader');
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
        ctx.wizard.state.lastQuestion = '🖼 *Bild ändern*\n\nBitte sende ein neues Foto.\nTippe "Löschen", um das Bild zu entfernen oder "Abbrechen".';

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
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
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

        let finalImageUrl = undefined;

        if (ctx.message.photo) {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                const statusMsg = await ctx.reply('⏳ Bild wird verarbeitet...', { reply_markup: { remove_keyboard: true } });
                ctx.wizard.state.messagesToDelete.push(statusMsg.message_id);
                finalImageUrl = await uploadToDezentral(fileLink.href);
            } catch (error) {
                console.error('Upload Error:', error.message);
                finalImageUrl = null;
            }
        } else if (input && input.toLowerCase() === 'löschen') {
            finalImageUrl = null;
        } else if (input && input.startsWith('http')) {
            finalImageUrl = input;
        }

        try {
            if (finalImageUrl !== undefined) {
                await productRepo.updateProductImage(productId, finalImageUrl);
                await cleanup(ctx);
                await ctx.reply('✅ Bild erfolgreich aktualisiert!', { reply_markup: { remove_keyboard: true } });
            } else {
                await cleanup(ctx);
                await ctx.reply(texts.getGeneralError(), { reply_markup: { remove_keyboard: true } });
            }
            return backToProduct(ctx);
        } catch (error) {
            console.error('DB Update Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError());
            return ctx.scene.leave();
        }
    }
);

module.exports = editProductImageScene;
