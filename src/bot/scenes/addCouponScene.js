const { Scenes } = require('telegraf');
const couponRepo = require('../../database/repositories/couponRepo');
const productRepo = require('../../database/repositories/productRepo');
const uiHelper = require('../../utils/uiHelper');
const formatters = require('../../utils/formatters');
const config = require('../../config');

const addCouponScene = new Scenes.WizardScene(
    'addCouponScene',

    // ─── STEP 0: Coupon Code eingeben ───────────────────────────────────────
    async (ctx) => {
        const isMaster = ctx.from.id === Number(config.MASTER_ADMIN_ID);
        if (!isMaster) {
            await ctx.reply('⚠️ *Zugriff verweigert*\n\nNur der Master Admin besitzt die Berechtigung, Coupons zu erstellen.', { parse_mode: 'Markdown' });
            return ctx.scene.leave();
        }

        ctx.wizard.state.coupon = {};
        const text = `🎟️ *NEUEN COUPON ERSTELLEN* (Schritt 1/6)\n\n` +
            `Bitte gib den gewünschten *Coupon-Code* ein (z. B. \`SUMMER20\` oder \`VIP50\`):\n\n` +
            `_Wird automatisch in Großbuchstaben umgewandelt._`;

        const keyboard = {
            inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_coupon_wizard', style: 'danger' }]]
        };

        await uiHelper.updateOrSend(ctx, text, keyboard);
        return ctx.wizard.next();
    },

    // ─── STEP 1: Code empfangen & Rabatt-Typ wählen ─────────────────────────
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_coupon_wizard') {
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            await ctx.scene.leave();
            const masterActions = require('../actions/masterActions');
            return masterActions.showCouponsMenu ? masterActions.showCouponsMenu(ctx) : ctx.reply('Abgebrochen.');
        }

        const inputCode = ctx.message?.text?.trim()?.toUpperCase();
        if (!inputCode) {
            await ctx.reply('⚠️ Ungültiger Code. Bitte gib einen gültigen Text-Code ein (z. B. `SUMMER20`).');
            return;
        }

        const existing = await couponRepo.getCouponByCode(inputCode).catch(() => null);
        if (existing) {
            await ctx.reply(`⚠️ Ein Coupon mit dem Code \`${inputCode}\` existiert bereits. Bitte gib einen anderen Code ein:`);
            return;
        }

        ctx.wizard.state.coupon.code = inputCode;

        const text = `🎟️ *COUPON:* \`${inputCode}\` (Schritt 2/6)\n\n` +
            `Wähle den *Rabatt-Typ*:`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '📊 Prozentual (% Rabatt)', callback_data: 'type_percent', style: 'primary' }],
                [{ text: '💶 Festbetrag (€ Rabatt)', callback_data: 'type_fixed', style: 'primary' }],
                [{ text: '❌ Abbrechen', callback_data: 'cancel_coupon_wizard', style: 'danger' }]
            ]
        };

        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        return ctx.wizard.next();
    },

    // ─── STEP 2: Rabatt-Typ empfangen & Wert abfragen ───────────────────────
    async (ctx) => {
        const cbData = ctx.callbackQuery?.data;

        if (cbData === 'cancel_coupon_wizard') {
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            return ctx.scene.leave();
        }

        if (cbData === 'type_percent') {
            ctx.wizard.state.coupon.discount_type = 'percent';
            await ctx.answerCbQuery('Prozentual').catch(() => {});
        } else if (cbData === 'type_fixed') {
            ctx.wizard.state.coupon.discount_type = 'fixed';
            await ctx.answerCbQuery('Festbetrag').catch(() => {});
        } else if (!ctx.wizard.state.coupon.discount_type) {
            await ctx.reply('Bitte wähle einen Rabatt-Typ über die Buttons.');
            return;
        }

        const typeLabel = ctx.wizard.state.coupon.discount_type === 'percent' ? '% Rabatt (z. B. 20 für 20%)' : '€ Festbetrag (z. B. 5.00 für 5€ Rabatt)';

        const text = `🎟️ *COUPON:* \`${ctx.wizard.state.coupon.code}\` (Schritt 3/6)\n\n` +
            `Gib den *Rabatt-Wert* ein:\n` +
            `_${typeLabel}_`;

        const keyboard = {
            inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_coupon_wizard', style: 'danger' }]]
        };

        await uiHelper.updateOrSend(ctx, text, keyboard);
        return ctx.wizard.next();
    },

    // ─── STEP 3: Wert empfangen & Produkt-Einschränkung wählen ──────────────
    async (ctx) => {
        if (ctx.callbackQuery?.data === 'cancel_coupon_wizard') {
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            return ctx.scene.leave();
        }

        const val = parseFloat(ctx.message?.text?.replace(',', '.'));
        if (isNaN(val) || val <= 0) {
            await ctx.reply('⚠️ Ungültiger Wert. Bitte gib eine Zahl ein (z. B. `15` oder `5.50`).');
            return;
        }

        ctx.wizard.state.coupon.discount_value = val;

        const products = await productRepo.getAllProducts().catch(() => []);

        const text = `🎟️ *COUPON:* \`${ctx.wizard.state.coupon.code}\` (Schritt 4/6)\n\n` +
            `Gilt dieser Coupon für *alle Produkte* oder nur für ein *spezifisches Produkt*?`;

        const kb = [
            [{ text: '🌐 Für ALLE Produkte gültig', callback_data: 'prod_all', style: 'success' }]
        ];

        if (products && products.length > 0) {
            products.slice(0, 10).forEach(p => {
                kb.push([{ text: `📦 Nur für: ${p.name}`, callback_data: `prod_${p.id}`, style: 'primary' }]);
            });
        }

        kb.push([{ text: '❌ Abbrechen', callback_data: 'cancel_coupon_wizard', style: 'danger' }]);

        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
        return ctx.wizard.next();
    },

    // ─── STEP 4: Produkt empfangen & Max-Einlösungen abfragen ───────────────
    async (ctx) => {
        const cbData = ctx.callbackQuery?.data;

        if (cbData === 'cancel_coupon_wizard') {
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            return ctx.scene.leave();
        }

        if (cbData) {
            await ctx.answerCbQuery().catch(() => {});
            if (cbData === 'prod_all') {
                ctx.wizard.state.coupon.product_id = null;
            } else if (cbData.startsWith('prod_')) {
                ctx.wizard.state.coupon.product_id = cbData.replace('prod_', '');
            }
        }

        const text = `🎟️ *COUPON:* \`${ctx.wizard.state.coupon.code}\` (Schritt 5/6)\n\n` +
            `Wie oft darf dieser Coupon *insgesamt eingelöst werden*?`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '♾️ Unbegrenzt oft', callback_data: 'uses_unlimited', style: 'success' }],
                [
                    { text: '🔢 1x Einlösbar', callback_data: 'uses_1', style: 'primary' },
                    { text: '🔢 10x Einlösbar', callback_data: 'uses_10', style: 'primary' }
                ],
                [
                    { text: '🔢 50x Einlösbar', callback_data: 'uses_50', style: 'primary' },
                    { text: '🔢 100x Einlösbar', callback_data: 'uses_100', style: 'primary' }
                ],
                [{ text: '✏️ Individuelle Anzahl (Eingabe im Chat)', callback_data: 'uses_custom', style: 'primary' }],
                [{ text: '❌ Abbrechen', callback_data: 'cancel_coupon_wizard', style: 'danger' }]
            ]
        };

        await uiHelper.updateOrSend(ctx, text, keyboard);
        return ctx.wizard.next();
    },

    // ─── STEP 5: Max-Einlösungen empfangen & Ablaufdatum wählen ─────────────
    async (ctx) => {
        const cbData = ctx.callbackQuery?.data;

        if (cbData === 'cancel_coupon_wizard') {
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            return ctx.scene.leave();
        }

        if (cbData === 'uses_custom') {
            await ctx.answerCbQuery().catch(() => {});
            await ctx.reply('✏️ Bitte gib die gewünschte maximale Einlöse-Anzahl als Zahl im Chat ein (z. B. `5` oder `250`):', { parse_mode: 'Markdown' });
            return;
        }

        if (cbData) {
            await ctx.answerCbQuery().catch(() => {});
            if (cbData === 'uses_unlimited') {
                ctx.wizard.state.coupon.max_uses = null;
            } else if (cbData.startsWith('uses_')) {
                ctx.wizard.state.coupon.max_uses = parseInt(cbData.replace('uses_', ''));
            }
        } else if (ctx.message?.text) {
            const num = parseInt(ctx.message.text.trim());
            if (isNaN(num) || num <= 0) {
                await ctx.reply('⚠️ Ungültige Zahl. Bitte gib eine positive Zahl für die Einlösungen ein (z. B. `5`):');
                return;
            }
            ctx.wizard.state.coupon.max_uses = num;
        }

        const text = `🎟️ *COUPON:* \`${ctx.wizard.state.coupon.code}\` (Schritt 6/6)\n\n` +
            `Wie lange ist dieser Coupon *gültig*?`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '♾️ Kein Ablaufdatum', callback_data: 'exp_never', style: 'success' }],
                [{ text: '⏱️ 7 Tage gültig', callback_data: 'exp_7d', style: 'primary' }],
                [{ text: '⏱️ 30 Tage gültig', callback_data: 'exp_30d', style: 'primary' }],
                [{ text: '❌ Abbrechen', callback_data: 'cancel_coupon_wizard', style: 'danger' }]
            ]
        };

        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        return ctx.wizard.next();
    },

    // ─── STEP 6: Speichern & Bestätigen ─────────────────────────────────────
    async (ctx) => {
        const cbData = ctx.callbackQuery?.data;

        if (cbData === 'cancel_coupon_wizard') {
            await ctx.answerCbQuery('Abgebrochen').catch(() => {});
            return ctx.scene.leave();
        }

        if (cbData) {
            await ctx.answerCbQuery().catch(() => {});
            if (cbData === 'exp_never') {
                ctx.wizard.state.coupon.expires_at = null;
            } else if (cbData === 'exp_7d') {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                ctx.wizard.state.coupon.expires_at = d.toISOString();
            } else if (cbData === 'exp_30d') {
                const d = new Date();
                d.setDate(d.getDate() + 30);
                ctx.wizard.state.coupon.expires_at = d.toISOString();
            }
        }

        try {
            const created = await couponRepo.createCoupon(ctx.wizard.state.coupon);

            const valueStr = created.discount_type === 'percent' ? `${created.discount_value}%` : `${formatters.formatPrice(created.discount_value)}`;

            const successText = `✅ *COUPON ERFOLGREICH ERSTELLT!*\n\n` +
                `🎟️ *Code:* \`${created.code}\`\n` +
                `💰 *Rabatt:* ${valueStr}\n` +
                `🔢 *Max. Einlösungen:* ${created.max_uses || 'Unbegrenzt'}\n` +
                `⏱️ *Gültig bis:* ${created.expires_at ? new Date(created.expires_at).toLocaleDateString('de-DE') : 'Unbegrenzt'}`;

            const keyboard = {
                inline_keyboard: [
                    [{ text: '🎟️ Zur Coupon-Übersicht', callback_data: 'master_manage_coupons', style: 'primary' }],
                    [{ text: '🏠 Hauptmenü', callback_data: 'master_panel', style: 'primary' }]
                ]
            };

            await uiHelper.updateOrSend(ctx, successText, keyboard);
        } catch (error) {
            console.error('Create Coupon Error:', error.message);
            await ctx.reply(`❌ Fehler beim Erstellen des Coupons: ${error.message}`);
        }

        return ctx.scene.leave();
    }
);

addCouponScene.action('cancel_coupon_wizard', async (ctx) => {
    ctx.answerCbQuery('Abgebrochen').catch(() => {});
    await ctx.reply('❌ Coupon-Erstellung abgebrochen.');
    return ctx.scene.leave();
});

module.exports = addCouponScene;
