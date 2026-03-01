const supabase = require('../supabaseClient');

const getCart = async (userId) => {
    const { data, error } = await supabase
        .from('carts')
        .select(`
            id,
            quantity,
            category_path,
            products ( id, name, price, is_unit_price )
        `)
        .eq('user_id', userId);

    if (error) throw error;
    return data;
};

const addToCart = async (userId, productId, quantity, username = 'Kunde', categoryPath = null) => {
    await supabase.from('users').upsert(
        { telegram_id: userId, username: username }, 
        { onConflict: 'telegram_id' }
    );

    const { data: existing, error: fetchError } = await supabase
        .from('carts')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle();

    if (fetchError) throw fetchError;

    if (existing) {
        return supabase
            .from('carts')
            .update({ 
                quantity: existing.quantity + quantity,
                category_path: categoryPath 
            })
            .eq('id', existing.id);
    } else {
        return supabase
            .from('carts')
            .insert([{ 
                user_id: userId, 
                product_id: productId, 
                quantity,
                category_path: categoryPath
            }]);
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
            product_id: item.products.id,
            name: item.products.name,
            quantity: item.quantity,
            price: itemPrice,
            total: itemTotal,
            category_path: item.category_path
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
