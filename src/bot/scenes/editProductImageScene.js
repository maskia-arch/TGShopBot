const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const { uploadToDezentral } = require('../../utils/imageUploader');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
    }
};

const editProductImageScene = new Scenes.WizardScene(
    'editProductImageScene',
    async (ctx) => {
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.productId = ctx.scene.state.productId;

        const msg = await ctx.reply('🖼 *Bild ändern*\nBitte sende ein neues Foto oder einen direkten Bild-Link.\nTippe "Löschen", um das Bild zu entfernen.', {
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
        let finalImageUrl = undefined;

        if (ctx.message.text && ctx.message.text.toLowerCase() === 'abbrechen') {
            await cleanup(ctx);
            const cancelMsg = await ctx.reply('❌ Aktion abgebrochen.', { reply_markup: { remove_keyboard: true } });
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat.id, cancelMsg.message_id).catch(() => {});
            }, 3000);
            return ctx.scene.leave();
        }

        if (ctx.message.photo) {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                const statusMsg = await ctx.reply('⏳ Bild wird verarbeitet...');
                ctx.wizard.state.messagesToDelete.push(statusMsg.message_id);
                finalImageUrl = await uploadToDezentral(fileLink.href);
            } catch (error) {
                finalImageUrl = null;
            }
        } else if (ctx.message.text && ctx.message.text.toLowerCase() === 'löschen') {
            finalImageUrl = null;
        } else if (ctx.message.text && ctx.message.text.startsWith('http')) {
            finalImageUrl = ctx.message.text.trim();
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
            const errorMsg = await ctx.reply('❌ Ungültige Eingabe oder Fehler beim Upload.', { reply_markup: { remove_keyboard: true } });
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat.id, errorMsg.message_id).catch(() => {});
            }, 3000);
        }

        return ctx.scene.leave();
    }
);

module.exports = editProductImageScene;
