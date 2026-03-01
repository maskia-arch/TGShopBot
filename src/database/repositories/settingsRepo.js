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

module.exports = {
    getSetting,
    setSetting
};
