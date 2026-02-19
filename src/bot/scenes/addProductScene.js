const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const { uploadToDezentral } = require('../../utils/imageUploader');
const uiHelper = require('../../utils/uiHelper');
const notificationService = require('../../services/notificationService');
const config = require('../../config');
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
    await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
    
    ctx.update.callback_query = { 
        data: ctx.wizard.state.productData.categoryId ? `admin_prod_cat_${ctx.wizard.state.productData.categoryId}` : 'admin_manage_products', 
        from: ctx.from 
    };
    
    return ctx.scene.leave();
};

const addProductScene = new Scenes.WizardScene(
    'addProductScene',
    async (ctx) => {
        ctx.wizard.state.productData = {};
        ctx.wizard.state.messagesToDelete = [];
        ctx.wizard.state.productData.categoryId = ctx.scene.state.categoryId || null;
        
        ctx.wizard.state.lastQuestion = '📦 *Neues Produkt*\nBitte sende den Namen des Produkts:';
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]] }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelAndLeave(ctx);
        }
        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        ctx.wizard.state.productData.name = input;
        ctx.wizard.state.lastQuestion = 'Bitte sende die Beschreibung:';
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]] }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelAndLeave(ctx);
        }
        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        ctx.wizard.state.productData.description = input;
        ctx.wizard.state.lastQuestion = 'Bitte sende den Preis in Euro (z.B. 10.50):';
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_scene' }]] }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_scene') {
            await ctx.answerCbQuery('Abgebrochen');
            return cancelAndLeave(ctx);
        }
        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Vorgang abbrechen', callback_data: 'cancel_scene' }]] }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        const price = parseFloat(input.replace(',', '.'));
        if (isNaN(price)) {
            const msg = await ctx.reply('⚠️ Ungültig. Bitte sende eine Zahl:');
            ctx.wizard.state.messagesToDelete.push(msg.message_id);
            return;
        }
        
        ctx.wizard.state.productData.price = price;
        ctx.wizard.state.lastQuestion = 'Ist dies ein Preis pro Stück?';
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            reply_markup: {
                keyboard: [[{ text: 'Ja' }, { text: 'Nein' }], [{ text: '❌ Abbrechen' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;

        const input = ctx.message.text.trim();
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        if (input === '❌ Abbrechen') return cancelAndLeave(ctx);

        if (input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: 'Ja' }, { text: 'Nein' }], [{ text: '❌ Abbrechen' }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        ctx.wizard.state.productData.isUnitPrice = input.toLowerCase() === 'ja';
        ctx.wizard.state.lastQuestion = 'Bitte sende ein Foto oder tippe "Überspringen":';
        
        const msg = await ctx.reply(ctx.wizard.state.lastQuestion, {
            reply_markup: {
                keyboard: [[{ text: 'Überspringen' }], [{ text: '❌ Abbrechen' }]],
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message) ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);
        
        const input = ctx.message?.text;
        if (input === '❌ Abbrechen') return cancelAndLeave(ctx);

        if (input && input.startsWith('/')) {
            const warningMsg = await ctx.reply(`⚠️ *Vorgang aktiv*\n\n${ctx.wizard.state.lastQuestion}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: 'Überspringen' }], [{ text: '❌ Abbrechen' }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        let finalImageUrl = null;

        if (ctx.message && ctx.message.photo) {
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                const statusMsg = await ctx.reply('⏳ Bild wird verarbeitet...', { reply_markup: { remove_keyboard: true } });
                ctx.wizard.state.messagesToDelete.push(statusMsg.message_id);
                finalImageUrl = await uploadToDezentral(fileLink.href);
            } catch (error) {
                console.error('Image Upload Error:', error.message);
            }
        } else {
            await ctx.reply('⏳ Speichere...', { reply_markup: { remove_keyboard: true } });
        }

        ctx.wizard.state.productData.imageUrl = finalImageUrl;
        
        try {
            const newProduct = await productRepo.addProduct(ctx.wizard.state.productData);
            await cleanup(ctx); 
            
            const createdId = (newProduct && newProduct.id) || (newProduct && newProduct[0] && newProduct[0].id);
            
            let catName = 'Kategorielos';
            if (ctx.wizard.state.productData.categoryId) {
                const categories = await productRepo.getActiveCategories();
                const cat = categories.find(c => c.id == ctx.wizard.state.productData.categoryId);
                if (cat) catName = cat.name;
            }

            if (createdId && Number(ctx.from.id) !== Number(config.MASTER_ADMIN_ID)) {
                notificationService.notifyMasterNewProduct({
                    adminName: ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`,
                    productName: ctx.wizard.state.productData.name,
                    categoryName: catName,
                    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                    productId: createdId
                }).catch(() => {});
            }
            
            await ctx.reply(`✅ Produkt "${ctx.wizard.state.productData.name}" erstellt!`);

            ctx.update.callback_query = { 
                data: ctx.wizard.state.productData.categoryId ? `admin_prod_cat_${ctx.wizard.state.productData.categoryId}` : 'admin_prod_cat_none', 
                from: ctx.from 
            };
            
            return ctx.scene.leave();
        } catch (error) {
            console.error('AddProduct Error:', error.message);
            await cleanup(ctx);
            await uiHelper.sendTemporary(ctx, texts.getGeneralError(), 3);
            return ctx.scene.leave();
        }
    }
);

module.exports = addProductScene;
