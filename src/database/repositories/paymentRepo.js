const supabase = require('../supabaseClient');

const getActivePaymentMethods = async () => {
    const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, wallet_address, is_active, auto_verify, crypto_symbol')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) throw error;
    return data;
};

const getPaymentMethod = async (id) => {
    const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, wallet_address, is_active, auto_verify, crypto_symbol')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
};

const addPaymentMethod = async (name, address = null, cryptoSymbol = 'BTC', autoVerify = false) => {
    const { data, error } = await supabase
        .from('payment_methods')
        .insert([{
            name: name,
            wallet_address: address,
            is_active: true,
            auto_verify: autoVerify,
            crypto_symbol: cryptoSymbol
        }])
        .select('id, name');

    if (error) throw error;
    return data[0];
};

const toggleAutoVerify = async (id, autoVerify) => {
    const { data, error } = await supabase
        .from('payment_methods')
        .update({ auto_verify: autoVerify })
        .eq('id', id)
        .select();

    if (error) throw error;
    return data ? data[0] : null;
};

const updateCryptoSymbol = async (id, symbol) => {
    const { data, error } = await supabase
        .from('payment_methods')
        .update({ crypto_symbol: symbol.toUpperCase().trim() })
        .eq('id', id)
        .select();

    if (error) throw error;
    return data ? data[0] : null;
};

const deletePaymentMethod = async (id) => {
    const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
};

module.exports = {
    getActivePaymentMethods,
    getPaymentMethod,
    addPaymentMethod,
    toggleAutoVerify,
    updateCryptoSymbol,
    deletePaymentMethod
};
