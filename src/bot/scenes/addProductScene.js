const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const { uploadToDezentral } = require('../../utils/imageUploader');

const addProductScene = new Scenes.WizardScene(
    'addProductScene',
    async (ctx) => {
        ctx.wizard.state.productData = {};
        ctx.wizard.state.productData.categoryId = ctx.scene.state.categoryId || null;
        await ctx.reply('Bitte sende den Namen des Produkts:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.productData.name = ctx.message.text;
        await ctx.reply('Bitte sende die Beschreibung des Produkts:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.productData.description = ctx.message.text;
        await ctx.reply('Bitte sende den Preis in Euro (z.B. 10.50):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        const price = parseFloat(ctx.message.text.replace(',', '.'));
        if (isNaN(price)) {
            await ctx.reply('Ungültiger Preis. Bitte sende eine Zahl (z.B. 10.50):');
            return;
        }
        ctx.wizard.state.productData.price = price;
        await ctx.reply('Ist dies ein Preis pro Stück?', {
            reply_markup: {
                keyboard: [[{ text: 'Ja' }, { text: 'Nein' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;
        ctx.wizard.state.productData.isUnitPrice = ctx.message.text.toLowerCase() === 'ja';
        await ctx.reply('Bitte sende ein Produktbild (als Foto) oder tippe "Überspringen":', {
            reply_markup: {
                keyboard: [[{ text: 'Überspringen' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        let finalImageUrl = null;

        if (ctx.message && ctx.message.photo) {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                await ctx.reply('⏳ Bild wird dezentral verarbeitet...');
                finalImageUrl = await uploadToDezentral(fileLink.href);
            } catch (error) {
                console.error('Bild-Upload Fehler:', error.message);
                await ctx.reply('⚠️ Bild-Upload fehlgeschlagen, fahre ohne Bild fort.');
            }
        }

        ctx.wizard.state.productData.imageUrl = finalImageUrl;
        
        try {
            await productRepo.addProduct(ctx.wizard.state.productData);
            await ctx.reply('✅ Produkt erfolgreich mit dezentralem Bild-Hosting angelegt!', {
                reply_markup: { remove_keyboard: true }
            });
        } catch (error) {
            console.error(error.message);
            await ctx.reply('Fehler beim Speichern des Produkts.', {
                reply_markup: { remove_keyboard: true }
            });
        }
        return ctx.scene.leave();
    }
);

module.exports = addProductScene;
