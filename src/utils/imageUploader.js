const axios = require('axios');
const FormData = require('form-data');

const uploadToDezentral = async (fileLink) => {
    try {
        // Wir laden das Bild kurz in den RAM und schieben es direkt weiter
        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const form = new FormData();
        form.append('file', response.data, { filename: 'photo.jpg' });

        // Telegra.ph (anonym, dezentral, keine Registrierung nötig)
        const uploadRes = await axios.post('https://telegra.ph/upload', form, {
            headers: form.getHeaders()
        });

        if (uploadRes.data && uploadRes.data[0] && uploadRes.data[0].src) {
            return 'https://telegra.ph' + uploadRes.data[0].src;
        }
        throw new Error('Upload fehlgeschlagen');
    } catch (error) {
        console.error('Bild-Upload Fehler:', error.message);
        return null;
    }
};

module.exports = { uploadToDezentral };
