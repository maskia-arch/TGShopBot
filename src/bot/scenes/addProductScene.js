const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const subcategoryRepo = require('../../database/repositories/subcategoryRepo');
const imageUploader = require('../../utils/imageUploader');
const uiHelper = require('../../utils/uiHelper');
const texts = require('../../utils/texts');
const config = require('../../config');
const notificationService = require('../../services/notificationService');

const addProductScene = new Scenes.WizardScene(
    'addProductScene',
    async (ctx) => {
        ctx.wizard.state.productData = {
            categoryId: ctx.scene.state?.categoryId || null,
            subcategoryId: null,
            deliveryOption: 'none'
        };

        if (!ctx.wizard.state.productData.categoryId) {
            try {
                // HIER GEFIXT: Wir nutzen productRepo statt categoryRepo
                const categories = await productRepo.getActiveCategories();
                if (categories && categories.length > 0) {
                    const keyboard = categories.map(c => ([{
                        text: c.name, callback_data: `cat_${c.id}`
                    }]));
                    keyboard.push([{ text: 'Ohne Kategorie', callback_data: 'cat_none' }]);
                    keyboard.push([{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]);

                    await ctx.reply('📂 *Kategorie wählen:*', {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    ctx.wizard.state.step = 'category';
                    return ctx.wizard.next();
                }
            } catch (e) {}
        }

        if (ctx.wizard.state.productData.categoryId) {
            try {
                const subcats = await subcategoryRepo.getSubcategoriesByCategory(ctx.wizard.state.productData.categoryId);
                if (subcats && subcats.length > 0) {
                    const keyboard = subcats.map(sc => ([{
                        text: sc.name, callback_data: `subcat_${sc.id}`
                    }]));
                    keyboard.push([{ text: 'Ohne Unterkategorie', callback_data: 'subcat_none' }]);
                    keyboard.push([{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]);

                    await ctx.reply('📂 *Unterkategorie wählen:*', {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    ctx.wizard.state.step = 'subcategory';
                    return ctx.wizard.next();
                }
            } catch (e) {}
        }

        await ctx.reply('📦 *Neues Produkt*\n\nBitte sende den *Namen* des Produkts:', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]] }
        });
        ctx.wizard.state.step = 'name';
        return ctx.wizard.next();
    },

    async (ctx) => {
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;

            if (data === 'cancel_add') {
                ctx.answerCbQuery().catch(() => {});
                await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
                return ctx.scene.leave();
            }

            if (ctx.wizard.state.step === 'category' && data.startsWith('cat_')) {
                ctx.answerCbQuery().catch(() => {});
                const catId = data.replace('cat_', '');
                ctx.wizard.state.productData.categoryId = catId === 'none' ? null : catId;

                if (ctx.wizard.state.productData.categoryId) {
                    try {
                        const subcats = await subcategoryRepo.getSubcategoriesByCategory(ctx.wizard.state.productData.categoryId);
                        if (subcats && subcats.length > 0) {
                            const keyboard = subcats.map(sc => ([{
                                text: sc.name, callback_data: `subcat_${sc.id}`
                            }]));
                            keyboard.push([{ text: 'Ohne Unterkategorie', callback_data: 'subcat_none' }]);
                            keyboard.push([{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]);

                            await ctx.reply('📂 *Unterkategorie wählen:*', {
                                parse_mode: 'Markdown',
                                reply_markup: { inline_keyboard: keyboard }
                            });
                            ctx.wizard.state.step = 'subcategory';
                            return;
                        }
                    } catch (e) {}
                }

                await ctx.reply('📦 Bitte sende den *Namen* des Produkts:', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]] }
                });
                ctx.wizard.state.step = 'name';
                return;
            }

            if (ctx.wizard.state.step === 'subcategory' && data.startsWith('subcat_')) {
                ctx.answerCbQuery().catch(() => {});
                const subcatId = data.replace('subcat_', '');
                ctx.wizard.state.productData.subcategoryId = subcatId === 'none' ? null : subcatId;

                await ctx.reply('📦 Bitte sende den *Namen* des Produkts:', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]] }
                });
                ctx.wizard.state.step = 'name';
                return;
            }

            if (ctx.wizard.state.step === 'delivery') {
                ctx.answerCbQuery().catch(() => {});
                const deliveryMap = {
                    'delivery_none': 'none',
                    'delivery_shipping': 'shipping',
                    'delivery_pickup': 'pickup',
                    'delivery_both': 'both'
                };

                if (deliveryMap[data]) {
                    ctx.wizard.state.productData.deliveryOption = deliveryMap[data];
                    try {
                        const pd = ctx.wizard.state.productData;
                        const result = await productRepo.addProduct(pd);
                        const deliveryLabel = texts.getDeliveryLabel ? texts.getDeliveryLabel(pd.deliveryOption) : pd.deliveryOption;
                        let successText = `✅ *Produkt erstellt!*\n\n📦 *${pd.name}*\n💰 ${pd.price.toFixed(2)}€\n🚚 ${deliveryLabel}`;

                        await ctx.reply(successText, {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]]
                            }
                        });

                        if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) {
                            notificationService.notifyAdminsNewProduct({
                                adminName: ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`,
                                productName: pd.name,
                                categoryName: pd.categoryId || 'Keine',
                                productId: result && result[0] ? result[0].id : 'Unbekannt',
                                time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
                            }).catch(() => {});
                        }
                    } catch (error) {
                        console.error('Add Product Error:', error.message);
                        await ctx.reply(`⚠️ Fehler beim Speichern: ${error.message}`);
                    }
                    return ctx.scene.leave();
                }
            }
        }

        if (ctx.wizard.state.step === 'name' && ctx.message?.text) {
            const name = ctx.message.text.trim();
            if (name.startsWith('/')) return;
            ctx.wizard.state.productData.name = name;
            ctx.wizard.state.step = 'description';

            await ctx.reply('📝 Beschreibung eingeben (oder "skip"):',{
                reply_markup: { inline_keyboard: [[{ text: '⏩ Überspringen', callback_data: 'skip_desc' }]] }
            });
            return;
        }

        if (ctx.wizard.state.step === 'description') {
            if (ctx.callbackQuery && ctx.callbackQuery.data === 'skip_desc') {
                ctx.answerCbQuery().catch(() => {});
                ctx.wizard.state.productData.description = null;
            } else if (ctx.message?.text) {
                ctx.wizard.state.productData.description = ctx.message.text.trim();
            } else return;

            ctx.wizard.state.step = 'price';
            await ctx.reply('💰 Preis eingeben (z.B. `12.50`):', { parse_mode: 'Markdown' });
            return;
        }

        if (ctx.wizard.state.step === 'price' && ctx.message?.text) {
            const price = parseFloat(ctx.message.text.replace(',', '.'));
            if (isNaN(price) || price <= 0) {
                return ctx.reply('⚠️ Ungültiger Preis. Bitte eine Zahl eingeben:');
            }
            ctx.wizard.state.productData.price = price;
            ctx.wizard.state.step = 'image';

            await ctx.reply('🖼 Produktbild senden oder überspringen:', {
                reply_markup: { inline_keyboard: [[{ text: '⏩ Überspringen', callback_data: 'skip_img' }]] }
            });
            return;
        }

        if (ctx.wizard.state.step === 'image') {
            if (ctx.callbackQuery && ctx.callbackQuery.data === 'skip_img') {
                ctx.answerCbQuery().catch(() => {});
                ctx.wizard.state.productData.imageUrl = null;
            } else if (ctx.message?.photo) {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                try {
                    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                    ctx.wizard.state.productData.imageUrl = fileLink.href;
                } catch (e) {
                    ctx.wizard.state.productData.imageUrl = null;
                }
            } else return;

            ctx.wizard.state.step = 'delivery';
            await ctx.reply('🚚 *Lieferoption für dieses Produkt:*', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 Kein Versand (digital)', callback_data: 'delivery_none' }],
                        [{ text: '🚚 Nur Versand', callback_data: 'delivery_shipping' }],
                        [{ text: '🏪 Nur Abholung', callback_data: 'delivery_pickup' }],
                        [{ text: '🚚🏪 Versand & Abholung', callback_data: 'delivery_both' }]
                    ]
                }
            });
            return;
        }
    }
);

addProductScene.action('cancel_add', async (ctx) => {
    ctx.answerCbQuery('Abgebrochen').catch(() => {});
    await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
    return ctx.scene.leave();
});

addProductScene.action('skip_desc', async (ctx) => {});
addProductScene.action('skip_img', async (ctx) => {});

module.exports = addProductScene;
