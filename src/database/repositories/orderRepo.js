const supabase = require('../supabaseClient');
const crypto = require('crypto');

const generateCustomOrderId = () => {
    return 'order' + crypto.randomBytes(3).toString('hex');
};

const SELECT_FULL = `id, order_id, user_id, total_amount, status, details,
    shipping_link, payment_method_name,
    delivery_method, admin_notes, tx_id, created_at, notification_msg_ids, feedback_invited, digital_delivery,
    crypto_amount, payment_identifier, confirmations, received_crypto_amount, crypto_rate, last_rate_update, kyc_submission, auto_delivery_disabled`;

const createOrder = async (userId, totalAmount, orderDetails, options = {}) => {
    const { shippingLink, paymentMethodName, deliveryMethod, cryptoAmount, paymentIdentifier, cryptoRate, kycSubmission } = options;
    const customId = generateCustomOrderId();

    const { data, error } = await supabase
        .from('orders')
        .insert([{
            user_id: userId,
            order_id: customId,
            total_amount: totalAmount,
            details: orderDetails, 
            status: 'offen',
            shipping_link: shippingLink || null,
            payment_method_name: paymentMethodName || 'Nicht angegeben',
            delivery_method: deliveryMethod || 'none',
            admin_notes: [],
            notification_msg_ids: [],
            feedback_invited: false,
            digital_delivery: null,
            crypto_amount: cryptoAmount || null,
            payment_identifier: paymentIdentifier || null,
            confirmations: 0,
            received_crypto_amount: null,
            crypto_rate: cryptoRate || null,
            last_rate_update: new Date().toISOString(),
            kyc_submission: kycSubmission || null
        }])
        .select(SELECT_FULL);

    if (error) throw error;
    return data[0];
};

const getOrderByOrderId = async (orderId) => {
    if (!orderId) return null;
    const searchId = orderId.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('order_id', searchId)
        .maybeSingle();

    if (error) throw error;
    return data;
};

const getOrderById = async (id) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
};

const updateOrderStatus = async (orderId, newStatus) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('order_id', orderId)
        .select(SELECT_FULL);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
};

const updateOrderTxId = async (orderId, txId) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ tx_id: txId, status: 'bezahlt_pending' })
        .eq('order_id', orderId)
        .select(SELECT_FULL);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
};

const addAdminNote = async (orderId, authorName, noteText) => {
    const order = await getOrderByOrderId(orderId);
    if (!order) return null;
    const notes = order.admin_notes || [];
    notes.push({ author: authorName, text: noteText, date: new Date().toISOString() });
    const { data, error } = await supabase
        .from('orders')
        .update({ admin_notes: notes })
        .eq('order_id', orderId)
        .select(SELECT_FULL);
    if (error) throw error;
    return data[0];
};

const deleteOrder = async (orderId) => {
    const { error } = await supabase.from('orders').delete().eq('order_id', orderId);
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
        .select(SELECT_FULL)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return data || [];
};

const getActiveOrdersByUser = async (userId) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('user_id', userId)
        .in('status', ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand', 'abgeschlossen'])
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
        .from('orders')
        .select(SELECT_FULL)
        .in('status', ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand', 'loeschung_angefragt'])
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};

const getAllOrders = async (limit = 50) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};

const addNotificationMsgId = async (orderId, chatId, messageId) => {
    try {
        const order = await getOrderByOrderId(orderId);
        if (!order) return null;
        const currentIds = order.notification_msg_ids || [];
        currentIds.push({ chat_id: chatId, message_id: messageId });
        const { error } = await supabase
            .from('orders')
            .update({ notification_msg_ids: currentIds })
            .eq('order_id', order.order_id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error adding notification msg id:', error.message);
        return false;
    }
};

const clearNotificationMsgIds = async (orderId) => {
    try {
        const order = await getOrderByOrderId(orderId);
        if (!order) return false;
        const { error } = await supabase
            .from('orders')
            .update({ notification_msg_ids: [] })
            .eq('order_id', order.order_id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error clearing notification msg ids:', error.message);
        return false;
    }
};

const setFeedbackInvited = async (orderId, isInvited) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ feedback_invited: isInvited })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error setting feedback invited:', error.message);
        return null;
    }
};

const setDigitalDelivery = async (orderId, content) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ digital_delivery: content })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error saving digital delivery:', error.message);
        return null;
    }
};

const getOrdersWithDigitalDelivery = async (limit = 10, offset = 0) => {
    try {
        const { data, error, count } = await supabase
            .from('orders')
            .select(SELECT_FULL, { count: 'exact' })
            .not('digital_delivery', 'is', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) throw error;
        return { data: data || [], count: count || 0 };
    } catch (error) {
        console.error('Error getting digital delivery orders:', error.message);
        return { data: [], count: 0 };
    }
};

const updateCryptoAmountAndRate = async (orderId, newCryptoAmount, newRate) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                crypto_amount: newCryptoAmount, 
                crypto_rate: newRate,
                last_rate_update: new Date().toISOString()
            })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error updating crypto amount and rate:', error.message);
        return null;
    }
};

const updateReceivedCryptoAmount = async (orderId, receivedCryptoAmount) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ received_crypto_amount: receivedCryptoAmount })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error updating received crypto amount:', error.message);
        return null;
    }
};

const updateCryptoDetails = async (orderId, newCryptoAmount, newIdentifier, newRate) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ 
                crypto_amount: newCryptoAmount, 
                payment_identifier: newIdentifier,
                crypto_rate: newRate,
                last_rate_update: new Date().toISOString()
            })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error updating crypto details:', error.message);
        return null;
    }
};

const disableAutoDelivery = async (orderId) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ auto_delivery_disabled: true })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error disabling auto delivery:', error.message);
        return null;
    }
};

module.exports = {
    createOrder, getOrderByOrderId, getOrderById,
    updateOrderStatus, updateOrderTxId, addAdminNote,
    deleteOrder, deleteAllOrders,
    getOrdersByUser, getActiveOrdersByUser, hasActiveOrders,
    getOpenOrders, getAllOrders,
    addNotificationMsgId, clearNotificationMsgIds,
    setFeedbackInvited, setDigitalDelivery, getOrdersWithDigitalDelivery,
    updateCryptoAmountAndRate, updateReceivedCryptoAmount, updateCryptoDetails,
    disableAutoDelivery
};
