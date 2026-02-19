const supabase = require('../supabaseClient');

const createOrder = async (userId, totalAmount, orderDetails) => {
    // Optimierung: Nur die ID zurückgeben, da der Bot nach dem Erstellen 
    // meist nur eine Erfolgsmeldung zeigt und nicht das ganze Objekt braucht.
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            user_id: userId,
            total_amount: totalAmount,
            details: orderDetails
        }])
        .select('id');

    if (error) throw error;
    return data[0];
};

const getLatestOrders = async (limit = 10) => {
    // Selektives Laden der Felder reduziert die Last bei großen Bestellhistorien.
    const { data, error } = await supabase
        .from('orders')
        .select(`
            id,
            created_at,
            total_amount,
            user_id,
            users:user_id ( username )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
};

module.exports = {
    createOrder,
    getLatestOrders
};
