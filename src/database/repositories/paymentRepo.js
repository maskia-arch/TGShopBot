const supabase = require('../supabaseClient');

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

const addPaymentMethod = async (name, address = null) => {
    const { data, error } = await supabase
        .from('payment_methods')
        .insert([{
            name: name,
            wallet_address: address,
            is_active: true
        }])
        .select();

    if (error) throw error;
    return data[0];
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
    deletePaymentMethod
};
