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

const cancelAndLeave = async (ctx) => {
    await cleanup(ctx);
    const cancelMsg = await ctx.reply(texts.getActionCanceled(), { reply_markup: { remove_keyboard: true } });
    setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat.id, cancelMsg.message_id).catch(() => {});
    }, 3000);
    return ctx.scene.leave();
};

const editProductImageScene = new Scenes.WizardScene(
    'editProductImageScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.productId = ctx.scene.state.productId;
        ctx.wizard.state.lastQuestion = '🖼 *Bild ändern*\nBitte sende ein neues Foto oder einen direkten Bild-Link.\nTippe "Löschen", um das Bild zu entfernen.';

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
        const input = ctx.message.text;

        if (input && input.toLowerCase() === 'abbrechen') {
            return cancelAndLeave(ctx);
        }

        if (input && input.startsWith('/')) {
            try { await ctx.deleteMessage(); } catch (e) {}
            
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\nDu bist gerade dabei, ein Produktbild zu ändern.\n\n${ctx.wizard.state.lastQuestion}`, {
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
                finalImageUrl = null;
            }
        } else if (input && input.toLowerCase() === 'löschen') {
            finalImageUrl = null;
        } else if (input && input.startsWith('http')) {
            finalImageUrl = input.trim();
        }

        if (finalImageUrl !== undefined) {
            await productRepo.updateProductImage(productId, finalImageUrl);
            await cleanup(ctx);
            const successMsg = await ctx.reply('✅ Bild erfolgreich aktualisiert!', { reply_markup: { remove_keyboard: true } });
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat.id, successMsg.message_id).catch(() => {});
            }, 3000);
        } else {
            await cleanup(ctx);
            const errorMsg = await ctx.reply(texts.getGeneralError(), { reply_markup: { remove_keyboard: true } });
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat.id, errorMsg.message_id).catch(() => {});
            }, 3000);
        }

        return ctx.scene.leave();
    }
);

module.exports = editProductImageScene;
