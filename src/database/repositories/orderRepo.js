const supabase = require('../supabaseClient');

const createOrder = async (userId, totalAmount, orderDetails, options = {}) => {
    const { shippingLink, paymentLink, paymentMethodId, paymentMethodName, deliveryMethod } = options;
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            user_id: userId,
            total_amount: totalAmount,
            details: orderDetails,
            status: 'offen',
            shipping_link: shippingLink || null,
            payment_link: paymentLink || null,
            payment_method_id: paymentMethodId || null,
            payment_method_name: paymentMethodName || 'Nicht angegeben',
            delivery_method: deliveryMethod || null,
            admin_notes: []
        }])
        .select('id, order_id, status');
    if (error) throw error;
    return data[0];
};

// Left join with !left to avoid errors when user doesn't exist
const SELECT_FULL = `id, order_id, user_id, total_amount, status, details,
    shipping_link, payment_link, payment_method_name, payment_method_id,
    delivery_method, admin_notes, tx_id, created_at`;

const SELECT_WITH_USER = `${SELECT_FULL},
    users!left ( username, telegram_id )`;

const getOrderByOrderId = async (orderId) => {
    let searchId = orderId.toString().trim().toUpperCase();
    if (!searchId.startsWith('ORD-')) searchId = 'ORD-' + searchId.replace(/^0+/, '').padStart(5, '0');
    const { data, error } = await supabase.from('orders').select(SELECT_WITH_USER).eq('order_id', searchId).maybeSingle();
    if (error) {
        // Fallback without join
        const { data: d2, error: e2 } = await supabase.from('orders').select(SELECT_FULL).eq('order_id', searchId).maybeSingle();
        if (e2) throw e2;
        return d2;
    }
    return data;
};

const getOrderById = async (id) => {
    const { data, error } = await supabase.from('orders').select(SELECT_WITH_USER).eq('id', id).single();
    if (error) throw error;
    return data;
};

const updateOrderStatus = async (orderId, newStatus) => {
    const { data, error } = await supabase
        .from('orders').update({ status: newStatus }).eq('order_id', orderId).select('id, order_id, status, user_id');
    if (error) throw error;
    return data && data[0] ? data[0] : null;
};

const updateOrderTxId = async (orderId, txId) => {
    const { data, error } = await supabase
        .from('orders').update({ tx_id: txId, status: 'bezahlt_pending' }).eq('order_id', orderId)
        .select('id, order_id, status, user_id, tx_id');
    if (error) throw error;
    return data && data[0] ? data[0] : null;
};

const addAdminNote = async (orderId, authorName, noteText) => {
    const order = await getOrderByOrderId(orderId);
    if (!order) return null;
    const notes = order.admin_notes || [];
    notes.push({ author: authorName, text: noteText, date: new Date().toISOString() });
    const { data, error } = await supabase
        .from('orders').update({ admin_notes: notes }).eq('order_id', orderId).select('order_id, admin_notes');
    if (error) throw error;
    return data[0];
};

const deleteOrder = async (orderId) => {
    let searchId = orderId.toString().trim().toUpperCase();
    if (!searchId.startsWith('ORD-')) searchId = 'ORD-' + searchId.replace(/^0+/, '').padStart(5, '0');
    const { error } = await supabase.from('orders').delete().eq('order_id', searchId);
    if (error) throw error;
    return true;
};

const deleteAllOrders = async () => {
    const { error } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return true;
};

const getOrdersByUser = async (userId) => {
    const { data, error } = await supabase
        .from('orders')
        .select('id, order_id, total_amount, status, details, payment_method_name, payment_method_id, delivery_method, tx_id, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return data || [];
};

const getActiveOrdersByUser = async (userId) => {
    const { data, error } = await supabase
        .from('orders')
        .select('id, order_id, total_amount, status, details, payment_method_name, payment_method_id, delivery_method, tx_id, created_at')
        .eq('user_id', userId).in('status', ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand'])
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

const hasActiveOrders = async (userId) => {
    const { data, error } = await supabase.from('orders').select('id').eq('user_id', userId).limit(1);
    if (error) throw error;
    return data && data.length > 0;
};

const getOpenOrders = async (limit = 20) => {
    const { data, error } = await supabase
        .from('orders').select(SELECT_FULL)
        .in('status', ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand'])
        .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
};

const getAllOrders = async (limit = 50) => {
    const { data, error } = await supabase
        .from('orders').select(SELECT_FULL)
        .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
};

const getLatestOrders = async (limit = 10) => {
    const { data, error } = await supabase
        .from('orders').select(SELECT_FULL)
        .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
};

module.exports = {
    createOrder, getOrderByOrderId, getOrderById,
    updateOrderStatus, updateOrderTxId, addAdminNote,
    deleteOrder, deleteAllOrders,
    getOrdersByUser, getActiveOrdersByUser, hasActiveOrders,
    getOpenOrders, getAllOrders, getLatestOrders
};
