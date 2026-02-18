const axios = require('axios');
const FormData = require('form-data');

/**
 * Lädt ein Bild von Telegram herunter und speichert es permanent auf Telegra.ph.
 * @param {string} fileLink - Der temporäre Download-Link von Telegram.
 * @returns {Promise<string|null>} - Der permanente Telegra.ph Link.
 */
const uploadToDezentral = async (fileLink) => {
    try {
        // 1. Bild in den Buffer laden
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        
        // 2. FormData vorbereiten
        const form = new FormData();
        // Wir setzen einen festen Dateinamen und Content-Type für die API
        form.append('file', response.data, { 
            filename: 'photo.jpg',
            contentType: 'image/jpeg' 
        });

        // 3. Upload zu Telegra.ph
        const uploadRes = await axios.post('https://telegra.ph/upload', form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // 4. Pfad extrahieren
        if (Array.isArray(uploadRes.data) && uploadRes.data[0]?.src) {
            return 'https://telegra.ph' + uploadRes.data[0].src;
        }
        
        throw new Error('Telegra.ph hat keinen Pfad zurückgegeben');
    } catch (error) {
        console.error('Bild-Upload Fehler (imageUploader):', error.response?.data || error.message);
        return null;
    }
};

module.exports = { uploadToDezentral };
