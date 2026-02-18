const supabase = require('../supabaseClient');

const getActiveCategories = async () => {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true);
    if (error) throw error;
    return data;
};

const addCategory = async (name) => {
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name }])
        .select();
    if (error) throw error;
    return data[0];
};

const renameCategory = async (id, newName) => {
    const { data, error } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
};

const deleteCategory = async (id) => {
    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return true;
};

const getProductsByCategory = async (categoryId, isAdmin = false) => {
    let query = supabase.from('products').select('*');
    
    if (categoryId === null || categoryId === 'none') {
        query = query.is('category_id', null);
    } else {
        query = query.eq('category_id', categoryId);
    }

    if (!isAdmin) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
};

const updateProductCategory = async (productId, categoryId) => {
    const { data, error } = await supabase
        .from('products')
        .update({ category_id: categoryId })
        .eq('id', productId)
        .select();
    if (error) throw error;
    return data[0];
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
    addCategory,
    renameCategory,
    deleteCategory,
    getProductsByCategory,
    getProductById,
    addProduct,
    toggleProductStatus,
    updateProductCategory
};
