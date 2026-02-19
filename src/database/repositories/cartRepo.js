const supabase = require('../supabaseClient');

const getCart = async (userId) => {
    const { data, error } = await supabase
        .from('carts')
        .select(`
            id,
            quantity,
            products ( id, name, price, is_unit_price )
        `)
        .eq('user_id', userId);

    if (error) throw error;
    return data;
};

const addToCart = async (userId, productId, quantity, username = 'Kunde') => {
    // Upsert parallel zum Check oder minimiert
    await supabase.from('users').upsert(
        { telegram_id: userId, username: username }, 
        { onConflict: 'telegram_id' }
    );

    // Nutze rpc (Stored Procedure) oder optimierten Check
    const { data: existing, error: fetchError } = await supabase
        .from('carts')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle(); // Schneller als .single() mit Error-Handling

    if (fetchError) throw fetchError;

    if (existing) {
        return supabase
            .from('carts')
            .update({ quantity: existing.quantity + quantity })
            .eq('id', existing.id);
    } else {
        return supabase
            .from('carts')
            .insert([{ user_id: userId, product_id: productId, quantity }]);
    }
};

const getCartTotal = async (userId) => {
    const { data, error } = await supabase
        .from('carts')
        .select('quantity, products(price)')
        .eq('user_id', userId);

    if (error) throw error;
    
    const total = data.reduce((sum, item) => sum + (item.quantity * item.products.price), 0);
    return parseFloat(total.toFixed(2));
};

const getCartDetails = async (userId) => {
    const cart = await getCart(userId);
    return cart.map(item => {
        const itemPrice = item.products.price;
        const itemTotal = item.quantity * itemPrice;
        return {
            id: item.id,
            product_id: item.products.id, // Konsistente Benennung für Actions
            name: item.products.name,
            quantity: item.quantity,
            price: itemPrice,
            total: itemTotal
        };
    });
};

const removeFromCart = async (cartId) => {
    const { error } = await supabase
        .from('carts')
        .delete()
        .eq('id', cartId);

    if (error) throw error;
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
    removeFromCart,
    clearCart
};
