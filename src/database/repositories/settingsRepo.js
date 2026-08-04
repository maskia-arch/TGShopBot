const supabase = require('../supabaseClient');

const getSetting = async (key) => {
    const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error) throw error;
    return data ? data.value : null;
};

const setSetting = async (key, value) => {
    const { data, error } = await supabase
        .from('settings')
        .upsert([{ key, value }], { onConflict: 'key' })
        .select('value');

    if (error) throw error;
    return data && data.length > 0 ? data[0].value : null;
};

const isShowExactStock = async () => {
    const val = await getSetting('show_exact_stock');
    return val === 'true' || val === true;
};

const toggleShowExactStock = async () => {
    const current = await isShowExactStock();
    const newValue = !current;
    await setSetting('show_exact_stock', String(newValue));
    return newValue;
};

const getShopStatus = async () => {
    const val = await getSetting('shop_status');
    return val || 'open'; // 'open', 'closed', 'schedule'
};

const setShopStatus = async (status) => {
    return await setSetting('shop_status', status);
};

const getOpeningHours = async () => {
    const start = (await getSetting('opening_hours_start')) || '08:00';
    const end = (await getSetting('opening_hours_end')) || '20:00';
    return { start, end };
};

const setOpeningHours = async (start, end) => {
    await setSetting('opening_hours_start', start);
    await setSetting('opening_hours_end', end);
    return { start, end };
};

const getAbsenceMessage = async () => {
    const msg = await getSetting('absence_message');
    return msg || 'Wir befinden uns aktuell im Feierabend. Deine Anfragen und Bestellungen werden während unserer regulären Service-Zeiten umgehend bearbeitet.';
};

const setAbsenceMessage = async (msg) => {
    return await setSetting('absence_message', msg);
};

const isShopOpenNow = async () => {
    const status = await getShopStatus();
    const absenceMsg = await getAbsenceMessage();
    const hours = await getOpeningHours();

    if (status === 'open') {
        return { open: true, status, hours, message: absenceMsg };
    }

    if (status === 'closed') {
        return { open: false, status, reason: 'manual_closed', hours, message: absenceMsg };
    }

    if (status === 'schedule') {
        const now = new Date();
        const berlinTimeStr = now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });
        
        const parts = berlinTimeStr.split(':');
        const curH = parseInt(parts[0], 10);
        const curM = parseInt(parts[1], 10);

        const startParts = (hours.start || '08:00').split(':');
        const startH = parseInt(startParts[0], 10);
        const startM = parseInt(startParts[1], 10);

        const endParts = (hours.end || '20:00').split(':');
        const endH = parseInt(endParts[0], 10);
        const endM = parseInt(endParts[1], 10);

        const currentMinutes = curH * 60 + curM;
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        let isOpen = false;
        if (startMinutes <= endMinutes) {
            isOpen = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        } else {
            isOpen = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
        }

        if (isOpen) {
            return { open: true, status, hours, message: absenceMsg };
        } else {
            return { open: false, status, reason: 'outside_hours', hours, message: absenceMsg };
        }
    }

    return { open: true, status, hours, message: absenceMsg };
};

module.exports = {
    getSetting,
    setSetting,
    isShowExactStock,
    toggleShowExactStock,
    getShopStatus,
    setShopStatus,
    getOpeningHours,
    setOpeningHours,
    getAbsenceMessage,
    setAbsenceMessage,
    isShopOpenNow
};
