const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const { uploadToDezentral } = require('../../utils/imageUploader');
const uiHelper = require('../../utils/uiHelper');
const notificationService = require('../../services/notificationService');
const config = require('../../config');

const cleanup = async (ctx) => {
    if (ctx.wizard.state.messagesToDelete) {
        for (const msgId of ctx.wizard.state.messagesToDelete) {
            ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
    }
};

const addProductScene = new Scenes.WizardScene(
    'addProductScene',
    async (ctx) => {
        ctx.wizard.state.productData = {};
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.productData.categoryId = ctx.scene.state.categoryId || null;
        
        const msg = await ctx.reply('📦 *Neues Produkt*\nBitte sende den Namen des Produkts:');
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        ctx.wizard.state.productData.name = ctx.message.text;
        
        const msg = await ctx.reply('Bitte sende die Beschreibung:');
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        ctx.wizard.state.productData.description = ctx.message.text;
        
        const msg = await ctx.reply('Bitte sende den Preis in Euro (z.B. 10.50):');
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        const price = parseFloat(ctx.message.text.replace(',', '.'));
        if (isNaN(price)) {
            const msg = await ctx.reply('⚠️ Ungültig. Bitte sende eine Zahl:');
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return;
        }
        ctx.wizard.state.productData.price = price;
        
        const msg = await ctx.reply('Ist dies ein Preis pro Stück?', {
            reply_markup: {
                keyboard: [[{ text: 'Ja' }, { text: 'Nein' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        ctx.wizard.state.productData.isUnitPrice = ctx.message.text.toLowerCase() === 'ja';
        
        const msg = await ctx.reply('Bitte sende ein Foto oder tippe "Überspringen":', {
            reply_markup: {
                keyboard: [[{ text: 'Überspringen' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message) ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        let finalImageUrl = null;

        if (ctx.message && ctx.message.photo) {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                const statusMsg = await ctx.reply('⏳ Bild wird verarbeitet...');
                ctx.wizard.state.messagesToDelete.push(statusMsg.message_id);
                finalImageUrl = await uploadToDezentral(fileLink.href);
            } catch (error) {
                console.error(error.message);
            }
        }

        ctx.wizard.state.productData.imageUrl = finalImageUrl;
        
        try {
            const newProduct = await productRepo.addProduct(ctx.wizard.state.productData);
            await cleanup(ctx); 
            
            const createdId = newProduct ? (newProduct.id || (newProduct[0] && newProduct[0].id)) : null;
            
            let catName = 'Kategorielos';
            if (ctx.wizard.state.productData.categoryId) {
                const categories = await productRepo.getActiveCategories();
                const cat = categories.find(c => c.id == ctx.wizard.state.productData.categoryId);
                if (cat) catName = cat.name;
            }

            const adminName = ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
            const time = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

            if (createdId && Number(ctx.from.id) !== Number(config.MASTER_ADMIN_ID) && notificationService.notifyMasterNewProduct) {
                await notificationService.notifyMasterNewProduct({
                    adminName,
                    productName: ctx.wizard.state.productData.name,
                    categoryName: catName,
                    time,
                    productId: createdId
                });
            }
            
            await uiHelper.sendTemporary(ctx, `Produkt "${ctx.wizard.state.productData.name}" erstellt!`, 3);
        } catch (error) {
            console.error(error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, '❌ Fehler beim Speichern!', 3);
        }
        return ctx.scene.leave();
    }
);

module.exports = addProductScene;
