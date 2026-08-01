const { Scenes } = require('telegraf');
const feedbackRepo = require('../../database/repositories/feedbackRepo');
const notificationService = require('../../services/notificationService');
const texts = require('../../utils/texts');

const askAnonymity = async (ctx) => {
    const keyboard = {
        inline_keyboard: [
            [{ text: '👤 Name anzeigen', callback_data: 'fb_anon_no' }],
            [{ text: '🕵️ Anonym bleiben', callback_data: 'fb_anon_yes' }],
            [{ text: '❌ Abbrechen', callback_data: 'fb_cancel' }]
        ]
    };
    await ctx.reply(texts.getFeedbackAnonymityPrompt(), { parse_mode: 'Markdown', reply_markup: keyboard });
    return ctx.wizard.next();
};

const feedbackScene = new Scenes.WizardScene(
    'feedbackScene',
    // Schritt 1: Start und Sterneabfrage
    async (ctx) => {
        const orderId = ctx.scene.state.orderId;
        if (!orderId) return ctx.scene.leave();

        try {
            const alreadyDone = await feedbackRepo.hasUserAlreadyFeedbacked(orderId);
            if (alreadyDone) {
                await ctx.reply('⚠️ Du hast für diese Bestellung bereits ein Feedback abgegeben. Vielen Dank!', { parse_mode: 'Markdown' });
                return ctx.scene.leave();
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '⭐', callback_data: 'fb_rate_1' }, { text: '⭐⭐', callback_data: 'fb_rate_2' }],
                    [{ text: '⭐⭐⭐', callback_data: 'fb_rate_3' }, { text: '⭐⭐⭐⭐', callback_data: 'fb_rate_4' }],
                    [{ text: '⭐⭐⭐⭐⭐', callback_data: 'fb_rate_5' }],
                    [{ text: '❌ Abbrechen', callback_data: 'fb_cancel' }]
                ]
            };
            await ctx.reply(texts.getFeedbackStartPrompt(), { parse_mode: 'Markdown', reply_markup: keyboard });
            return ctx.wizard.next();
        } catch (error) {
            console.error('Feedback Scene Init Error:', error.message);
            return ctx.scene.leave();
        }
    },
    // Schritt 2: Sterne verarbeiten, nach Kommentar fragen
    async (ctx) => {
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            if (data === 'fb_cancel') {
                ctx.answerCbQuery('Abgebrochen').catch(() => {});
                await ctx.reply('❌ Feedback abgebrochen.');
                return ctx.scene.leave();
            }
            if (data.startsWith('fb_rate_')) {
                const rating = parseInt(data.replace('fb_rate_', ''));
                ctx.scene.state.rating = rating;
                ctx.answerCbQuery().catch(() => {});

                const keyboard = {
                    inline_keyboard: [
                        [{ text: '⏭️ Überspringen', callback_data: 'fb_skip_comment' }],
                        [{ text: '❌ Abbrechen', callback_data: 'fb_cancel' }]
                    ]
                };
                await ctx.reply(texts.getFeedbackCommentPrompt(), { parse_mode: 'Markdown', reply_markup: keyboard });
                return ctx.wizard.next();
            }
        }
        return;
    },
    // Schritt 3: Kommentar verarbeiten, nach Anonymität fragen
    async (ctx) => {
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            if (data === 'fb_cancel') {
                ctx.answerCbQuery('Abgebrochen').catch(() => {});
                await ctx.reply('❌ Feedback abgebrochen.');
                return ctx.scene.leave();
            }
            if (data === 'fb_skip_comment') {
                ctx.scene.state.comment = null;
                ctx.answerCbQuery().catch(() => {});
                return await askAnonymity(ctx);
            }
        }

        if (ctx.message && ctx.message.text) {
            const input = ctx.message.text.trim();
            if (input.startsWith('/')) return ctx.scene.leave();

            if (input.length > 300) {
                await ctx.reply('⚠️ Dein Kommentar ist leider zu lang (max. 300 Zeichen). Bitte versuche es noch einmal in einer kürzeren Version:');
                return;
            }

            ctx.scene.state.comment = input;
            return await askAnonymity(ctx);
        }
    },
    // Schritt 4: Anonymität auswerten, Speichern und Admin benachrichtigen
    async (ctx) => {
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            if (data === 'fb_cancel') {
                ctx.answerCbQuery('Abgebrochen').catch(() => {});
                await ctx.reply('❌ Feedback abgebrochen.');
                return ctx.scene.leave();
            }

            if (data === 'fb_anon_yes' || data === 'fb_anon_no') {
                ctx.answerCbQuery().catch(() => {});
                const isAnonymous = data === 'fb_anon_yes';
                
                let displayUsername = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');
                
                // Random Customer Name generieren, falls anonym
                if (isAnonymous) {
                    const randomNum = Math.floor(1000 + Math.random() * 9000);
                    displayUsername = `Customer${randomNum}`;
                }

                const feedbackData = {
                    orderId: ctx.scene.state.orderId,
                    userId: ctx.from.id,
                    username: displayUsername,
                    rating: ctx.scene.state.rating,
                    comment: ctx.scene.state.comment,
                    isAnonymous: isAnonymous
                };

                const savedFeedback = await feedbackRepo.saveFeedback(feedbackData);
                
                if (savedFeedback) {
                    await ctx.reply(texts.getFeedbackThanks(), { parse_mode: 'Markdown' });
                    
                    if (notificationService.notifyAdminNewFeedback) {
                        notificationService.notifyAdminNewFeedback({
                            feedbackId: savedFeedback.id,
                            orderId: feedbackData.orderId,
                            username: feedbackData.username,
                            rating: feedbackData.rating,
                            comment: feedbackData.comment,
                            isAnonymous: feedbackData.isAnonymous
                        });
                    }
                } else {
                    await ctx.reply('❌ Fehler beim Speichern. Bitte versuche es später erneut.');
                }
                
                return ctx.scene.leave();
            }
        }
    }
);

module.exports = feedbackScene;
