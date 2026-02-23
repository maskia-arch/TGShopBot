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

    // ── STEP 0: Produktname ──
    async (ctx) => {
        ctx.wizard.state.productData = {
            categoryId: ctx.scene.state?.categoryId || null,
            subcategoryId: null,
            deliveryOption: 'none'
        };

        // Prüfe Unterkategorien
        if (ctx.wizard.state.productData.categoryId) {
            try {
                const subcats = await subcategoryRepo.getSubcategoriesByCategory(ctx.wizard.state.productData.categoryId);
                if (subcats && subcats.length > 0) {
                    ctx.wizard.state.subcats = subcats;
                    const keyboard = subcats.map(sc => ([{
                        text: sc.name, callback_data: `subcat_${sc.id}`
                    }]));
                    keyboard.push([{ text: 'Ohne Unterkategorie', callback_data: 'subcat_none' }]);
                    keyboard.push([{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]);

                    await ctx.reply('📂 *Unterkategorie wählen:*', {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: keyboard }
                    });
                    return ctx.wizard.next();
                }
            } catch (e) {}
        }

        // Kein Subcategory-Step → direkt Name abfragen
        await ctx.reply('📦 *Neues Produkt*\n\nBitte sende den *Namen* des Produkts:', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]] }
        });
        ctx.wizard.state.step = 'name';
        return ctx.wizard.next();
    },

    // ── STEP 1: Unterkategorie / Name ──
    async (ctx) => {
        // Callback: Unterkategorie gewählt
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            ctx.answerCbQuery().catch(() => {});

            if (data === 'cancel_add') {
                await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
                return ctx.scene.leave();
            }

            if (data.startsWith('subcat_')) {
                const subcatId = data.replace('subcat_', '');
                ctx.wizard.state.productData.subcategoryId = subcatId === 'none' ? null : subcatId;

                await ctx.reply('📦 Bitte sende den *Namen* des Produkts:', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_add' }]] }
                });
                ctx.wizard.state.step = 'name';
                return;
            }
        }

        // Text: Name empfangen
        if (ctx.wizard.state.step === 'name' && ctx.message && ctx.message.text) {
            const name = ctx.message.text.trim();
            if (name.startsWith('/')) return;
            ctx.wizard.state.productData.name = name;
            ctx.wizard.state.step = 'description';

            await ctx.reply('📝 Beschreibung eingeben (oder "skip"):',{
                reply_markup: { inline_keyboard: [[{ text: '⏩ Überspringen', callback_data: 'skip_desc' }]] }
            });
            return;
        }

        // Text: Beschreibung
        if (ctx.wizard.state.step === 'description') {
            if (ctx.callbackQuery && ctx.callbackQuery.data === 'skip_desc') {
                ctx.answerCbQuery().catch(() => {});
                ctx.wizard.state.productData.description = null;
            } else if (ctx.message && ctx.message.text) {
                ctx.wizard.state.productData.description = ctx.message.text.trim();
            } else return;

            ctx.wizard.state.step = 'price';
            await ctx.reply('💰 Preis eingeben (z.B. `12.50`):', { parse_mode: 'Markdown' });
            return;
        }

        // Text: Preis
        if (ctx.wizard.state.step === 'price' && ctx.message && ctx.message.text) {
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

        // Bild
        if (ctx.wizard.state.step === 'image') {
            if (ctx.callbackQuery && ctx.callbackQuery.data === 'skip_img') {
                ctx.answerCbQuery().catch(() => {});
                ctx.wizard.state.productData.imageUrl = null;
            } else if (ctx.message && ctx.message.photo) {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                try {
                    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                    ctx.wizard.state.productData.imageUrl = fileLink.href;
                } catch (e) {
                    ctx.wizard.state.productData.imageUrl = null;
                }
            } else return;

            // Lieferoption abfragen
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

        // Lieferoption
        if (ctx.wizard.state.step === 'delivery' && ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            ctx.answerCbQuery().catch(() => {});

            const deliveryMap = {
                'delivery_none': 'none',
                'delivery_shipping': 'shipping',
                'delivery_pickup': 'pickup',
                'delivery_both': 'both'
            };

            if (deliveryMap[data]) {
                ctx.wizard.state.productData.deliveryOption = deliveryMap[data];

                // Produkt erstellen
                try {
                    const pd = ctx.wizard.state.productData;
                    const result = await productRepo.addProduct(pd);

                    const deliveryLabel = texts.getDeliveryLabel(pd.deliveryOption);
                    let successText = `✅ *Produkt erstellt!*\n\n📦 *${pd.name}*\n💰 ${pd.price.toFixed(2)}€\n🚚 ${deliveryLabel}`;

                    await ctx.reply(successText, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]]
                        }
                    });

                    // Master benachrichtigen
                    if (ctx.from.id !== Number(config.MASTER_ADMIN_ID)) {
                        notificationService.notifyAdminsNewProduct({
                            adminName: ctx.from.username ? `@${ctx.from.username}` : `ID: ${ctx.from.id}`,
                            productName: pd.name,
                            categoryName: pd.categoryId || 'Keine',
                            productId: result[0].id,
                            time: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
                        }).catch(() => {});
                    }
                } catch (error) {
                    console.error('Add Product Error:', error.message);
                    await ctx.reply(texts.getGeneralError());
                }

                return ctx.scene.leave();
            }
        }
    }
);

addProductScene.action('cancel_add', async (ctx) => {
    ctx.answerCbQuery('Abgebrochen').catch(() => {});
    await uiHelper.sendTemporary(ctx, texts.getActionCanceled(), 2);
    return ctx.scene.leave();
});

addProductScene.action('skip_desc', async (ctx) => {
    // Handled in step
});

addProductScene.action('skip_img', async (ctx) => {
    // Handled in step
});

module.exports = addProductScene;
