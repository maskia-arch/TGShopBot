const supabase = require('../supabaseClient');

const getActiveCategories = async () => {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true);
    if (error) throw error;
    return data;
};

const getProductsByCategory = async (categoryId, isAdmin = false) => {
    let query = supabase.from('products').select('*').eq('category_id', categoryId);
    if (!isAdmin) {
        query = query.eq('is_active', true);
    }
    if (error) throw error;
    return data;
};

const toggleProductStatus = async (productId, field, value) => {
    const { data, error } = await supabase
        .from('products')
        .update({ [field]: value })
        .eq('id', productId)
        .select();
    if (error) throw error;
    return data[0];
};

const getProductById = async (productId) => {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
    if (error) throw error;
    return data;
};

const addProduct = async (productData) => {
    const { categoryId, name, description, price, isUnitPrice, imageUrl } = productData;
    const { data, error } = await supabase
        .from('products')
        .insert([{
            category_id: categoryId,
            name: name,
            description: description,
            price: price,
            is_unit_price: isUnitPrice,
            image_url: imageUrl,
            is_active: true,
            is_out_of_stock: false
        }]);
    if (error) throw error;
    return data;
};

module.exports = {
    getActiveCategories,
    getProductsByCategory,
    getProductById,
    addProduct,
    toggleProductStatus
};
