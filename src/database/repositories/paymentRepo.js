const supabase = require('../supabaseClient');

const isCashMethod = (pm) => {
    if (!pm) return false;
    if (pm.method_type === 'cash') return true;
    const name = (pm.name || '').toLowerCase();
    return name.includes('bar') || name.includes('cash') || name.includes('bargeld') || name.includes('vor ort');
};

const isCryptoMethod = (pm) => {
    if (!pm) return false;
    if (isCashMethod(pm)) return false;
    if (pm.auto_verify) return true;
    if (pm.method_type === 'crypto') return true;
    const name = (pm.name || '').toLowerCase();
    if (pm.crypto_symbol && ['BTC', 'LTC', 'ETH', 'SOL', 'XMR', 'USDT'].includes(pm.crypto_symbol.toUpperCase())) {
        if (!name.includes('paypal') && !name.includes('überweisung') && !name.includes('bank') && !name.includes('sepa')) {
            return true;
        }
    }
    return name.includes('btc') || name.includes('bitcoin') || name.includes('crypto') || name.includes('krypto') ||
           name.includes('ltc') || name.includes('litecoin') || name.includes('eth') || name.includes('ethereum') ||
           name.includes('sol') || name.includes('solana') || name.includes('xmr') || name.includes('monero');
};

const getActivePaymentMethods = async () => {
    const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) throw error;
    return data;
};

const getPaymentMethod = async (id) => {
    const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
};

const addPaymentMethod = async (name, address = null, cryptoSymbol = 'BTC', autoVerify = false, methodType = null) => {
    const isCash = methodType === 'cash' || isCashMethod({ name, method_type: methodType });
    const type = methodType || (isCash ? 'cash' : (autoVerify || cryptoSymbol ? 'crypto' : 'manual'));
    const sym = isCash ? null : (cryptoSymbol || (type === 'crypto' ? 'BTC' : null));

    const insertObj = {
        name: name,
        wallet_address: address,
        is_active: true,
        auto_verify: isCash ? false : autoVerify,
        crypto_symbol: sym,
        method_type: type
    };

    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .insert([insertObj])
            .select('*');

        if (error) throw error;
        return data[0];
    } catch (err) {
        // Fallback falls method_type Spalte in Legacy-Tabellen noch nicht existiert
        if (err.message && err.message.includes('method_type')) {
            delete insertObj.method_type;
            const { data, error } = await supabase
                .from('payment_methods')
                .insert([insertObj])
                .select('*');
            if (error) throw error;
            return data[0];
        }
        throw err;
    }
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
        .update({ crypto_symbol: symbol ? symbol.toUpperCase().trim() : null })
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
    isCashMethod,
    isCryptoMethod,
    getActivePaymentMethods,
    getPaymentMethod,
    addPaymentMethod,
    toggleAutoVerify,
    updateCryptoSymbol,
    deletePaymentMethod
};
