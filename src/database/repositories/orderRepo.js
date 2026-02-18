const supabase = require('../supabaseClient');

const createOrder = async (userId, totalAmount, orderDetails) => {
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            user_id: userId,
            total_amount: totalAmount,
            details: orderDetails
        }])
        .select();

    if (error) throw error;
    return data[0];
};

const getLatestOrders = async (limit = 10) => {
    const { data, error } = await supabase
        .from('orders')
        .select(`
            id,
            created_at,
            total_amount,
            user_id,
            users ( username )
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
