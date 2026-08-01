const supabase = require('../supabaseClient');

const getActivePaymentMethods = async () => {
    // Wir laden nur die Felder, die für die Button-Anzeige im Checkout wichtig sind
    const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) throw error;
    return data;
};

const getPaymentMethod = async (id) => {
    // Wenn eine spezifische Methode geladen wird (z.B. für Wallet-Details), 
    // laden wir alle relevanten Daten für die Rechnung.
    const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, wallet_address, is_active')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
};

const addPaymentMethod = async (name, address = null) => {
    // Minimierter Rückgabewert: Wir brauchen meist nur die ID zur Bestätigung
    const { data, error } = await supabase
        .from('payment_methods')
        .insert([{
            name: name,
            wallet_address: address,
            is_active: true
        }])
        .select('id, name');

    if (error) throw error;
    return data[0];
};

const deletePaymentMethod = async (id) => {
    // Ein einfaches DELETE ohne Rückgabe des Objekts ist schneller
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
