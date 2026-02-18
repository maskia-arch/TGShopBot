const supabase = require('../supabaseClient');

const getCart = async (userId) => {
    const { data, error } = await supabase
        .from('carts')
        .select(`
            quantity,
            products ( id, name, price, is_unit_price )
        `)
        .eq('user_id', userId);

    if (error) throw error;
    return data;
};

const addToCart = async (userId, productId, quantity) => {
    const { data: existing, error: fetchError } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    if (existing) {
        const { error } = await supabase
            .from('carts')
            .update({ quantity: existing.quantity + quantity })
            .eq('user_id', userId)
            .eq('product_id', productId);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('carts')
            .insert([{ user_id: userId, product_id: productId, quantity }]);
        if (error) throw error;
    }
};

const getCartTotal = async (userId) => {
    const cart = await getCart(userId);
    let total = 0;
    for (const item of cart) {
        total += item.quantity * item.products.price;
    }
    return total.toFixed(2);
};

const getCartDetails = async (userId) => {
    const cart = await getCart(userId);
    return cart.map(item => ({
        name: item.products.name,
        quantity: item.quantity,
        price: item.products.price,
        total: (item.quantity * item.products.price).toFixed(2)
    }));
};

const clearCart = async (userId) => {
    const { error } = await supabase
        .from('carts')
        .delete()
        .eq('user_id', userId);

    if (error) throw error;
};

module.exports = {
    getCart,
    addToCart,
    getCartTotal,
    getCartDetails,
    clearCart
};
