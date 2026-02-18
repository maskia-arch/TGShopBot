const supabase = require('../supabaseClient');

const getActivePaymentMethods = async () => {
    const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true);

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

const addPaymentMethod = async (paymentData) => {
    const { name, description, walletAddress } = paymentData;
    const { data, error } = await supabase
        .from('payment_methods')
        .insert([{
            name: name,
            description: description,
            wallet_address: walletAddress,
            is_active: true
        }]);

    if (error) throw error;
    return data;
};

module.exports = {
    getActivePaymentMethods,
    getPaymentMethod,
    addPaymentMethod
};
