/**
 * editProductImageScene.js – v0.5.64
 * 
 * Robustes Bild-Bearbeitungs-System mit Validierung.
 * Unterstützt Fotos, GIFs, Videos und als Datei gesendete Medien.
 * 
 * Verbesserungen:
 * - Nutzt extractMediaFromMessage + validateFileId aus imageUploader
 * - Saubere Fehlerbehandlung und Logging
 * - Kein Legacy-Support für manuelle file_id-Eingabe (unsicher)
 */

const { Scenes } = require('telegraf');
const productRepo = require('../../database/repositories/productRepo');
const texts = require('../../utils/texts');
const { extractMediaFromMessage, validateFileId } = require('../../utils/imageUploader');

const PROMPT_TEXT = '🖼 *Bild oder GIF ändern*\n\nBitte sende ein neues Foto, ein GIF oder ein kurzes Video.\n_(Du kannst auch als Datei senden)_\n\nTippe "Löschen", um das Medium zu entfernen oder "Abbrechen".';

const PROMPT_KEYBOARD = {
    keyboard: [[{ text: 'Löschen' }, { text: 'Abbrechen' }]],
    one_time_keyboard: true,
    resize_keyboard: true
};

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

        const msg = await ctx.reply(PROMPT_TEXT, {
            parse_mode: 'Markdown',
            reply_markup: PROMPT_KEYBOARD
        });

        ctx.wizard.state.messagesToDelete.push(msg.message_id);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        ctx.wizard.state.messagesToDelete.push(ctx.message.message_id);

        const productId = ctx.wizard.state.productId;
        const input = ctx.message.text?.trim();

        // Abbrechen
        if (input && input.toLowerCase() === 'abbrechen') {
            await cleanup(ctx);
            await ctx.reply('Aktion abgebrochen.', { reply_markup: { remove_keyboard: true } });
            return backToProduct(ctx);
        }

        // Befehle ignorieren
        if (input && input.startsWith('/')) {
            const warningMsg = await ctx.reply(PROMPT_TEXT, {
                parse_mode: 'Markdown',
                reply_markup: PROMPT_KEYBOARD
            });
            ctx.wizard.state.messagesToDelete.push(warningMsg.message_id);
            return;
        }

        // Löschen
        if (input && input.toLowerCase() === 'löschen') {
            try {
                await productRepo.updateProductImage(productId, null);
                await cleanup(ctx);
                await ctx.reply('✅ Medium erfolgreich entfernt!', { reply_markup: { remove_keyboard: true } });
                return backToProduct(ctx);
            } catch (error) {
                console.error('[editProductImageScene] DB Update Error (delete):', error.message);
                await cleanup(ctx);
                await ctx.reply(texts.getGeneralError(), { reply_markup: { remove_keyboard: true } });
                return ctx.scene.leave();
            }
        }

        // ─── MEDIA ERKENNUNG ─────────────────────────────────────────────

        const media = extractMediaFromMessage(ctx.message);

        if (!media) {
            // Kein Medium erkannt → Hinweis
            const hintMsg = await ctx.reply('⚠️ Nicht erkannt. Bitte sende ein *Foto*, *GIF* oder *Video*.\n_(Du kannst auch als Datei senden)_', {
                parse_mode: 'Markdown',
                reply_markup: PROMPT_KEYBOARD
            });
            ctx.wizard.state.messagesToDelete.push(hintMsg.message_id);
            return;
        }

        // Lade-Indikator
        const loadingMsg = await ctx.reply('⏳ Medium wird überprüft...').catch(() => null);
        if (loadingMsg) ctx.wizard.state.messagesToDelete.push(loadingMsg.message_id);

        // Validierung über Telegram API
        const isValid = await validateFileId(ctx, media.fileId);

        if (!isValid) {
            if (loadingMsg) {
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
            }
            const retryMsg = await ctx.reply('⚠️ Das Medium konnte nicht verarbeitet werden. Bitte versuche es erneut.', {
                reply_markup: PROMPT_KEYBOARD
            });
            ctx.wizard.state.messagesToDelete.push(retryMsg.message_id);
            return;
        }

        // Speichern mit Typ-Präfix
        try {
            await productRepo.updateProductImage(productId, media.prefixedId);
            await cleanup(ctx);

            const typeLabels = { 'photo': '📷 Foto', 'animation': '🎞 GIF', 'video': '🎬 Video' };
            const label = typeLabels[media.type] || '📎 Medium';
            await ctx.reply(`✅ ${label} erfolgreich gespeichert!`, { reply_markup: { remove_keyboard: true } });
            return backToProduct(ctx);
        } catch (error) {
            console.error('[editProductImageScene] DB Update Error:', error.message);
            await cleanup(ctx);
            await ctx.reply(texts.getGeneralError(), { reply_markup: { remove_keyboard: true } });
            return ctx.scene.leave();
        }
    }
);

module.exports = editProductImageScene;
