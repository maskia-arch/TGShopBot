const supabase = require('../supabaseClient');

const getActiveCategories = async () => {
    const { data, error } = await supabase
        .from('categories')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const addCategory = async (name) => {
    const { data, error } = await supabase.from('categories').insert([{ name, sort_order: 0 }]).select('id, name');
    if (error) throw error;
    return data[0];
};

const renameCategory = async (id, newName) => {
    const { data, error } = await supabase.from('categories').update({ name: newName }).eq('id', id).select('id, name');
    if (error) throw error;
    return data[0];
};

const deleteCategory = async (id) => {
    await supabase.from('subcategories').delete().eq('category_id', id);
    await supabase.from('products').update({ category_id: null, subcategory_id: null }).eq('category_id', id);
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    return true;
};

const updateCategorySortOrder = async (id, sortOrder) => {
    const { data, error } = await supabase.from('categories').update({ sort_order: sortOrder }).eq('id', id).select('id');
    if (error) throw error;
    return data[0];
};

const getProductsByCategory = async (categoryId, isAdmin = false) => {
    let query = supabase
        .from('products')
        .select('id, name, price, is_active, is_out_of_stock, category_id, subcategory_id, delivery_option, sort_order');
    
    if (categoryId === null || categoryId === 'none') {
        query = query.is('category_id', null);
    } else {
        query = query.eq('category_id', categoryId);
    }
    if (!isAdmin) query = query.eq('is_active', true);

    const { data, error } = await query.order('sort_order', { ascending: true }).order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const getProductsBySubcategory = async (subcategoryId, isAdmin = false) => {
    let query = supabase
        .from('products')
        .select('id, name, price, is_active, is_out_of_stock, category_id, subcategory_id, delivery_option, sort_order')
        .eq('subcategory_id', subcategoryId);
    if (!isAdmin) query = query.eq('is_active', true);

    const { data, error } = await query.order('sort_order', { ascending: true }).order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const updateProductCategory = async (productId, categoryId) => {
    const { data, error } = await supabase.from('products').update({ category_id: categoryId }).eq('id', productId).select('id, category_id');
    if (error) throw error;
    return data[0];
};

const toggleProductStatus = async (productId, field, value) => {
    const { data, error } = await supabase.from('products').update({ [field]: value }).eq('id', productId).select('id, is_active, is_out_of_stock, price, delivery_option');
    if (error) throw error;
    return data[0];
};

const updateProductImage = async (productId, imageUrl) => {
    const { data, error } = await supabase.from('products').update({ image_url: imageUrl }).eq('id', productId).select('id, image_url');
    if (error) throw error;
    return data[0];
};

const updateProductName = async (productId, newName) => {
    const { data, error } = await supabase.from('products').update({ name: newName }).eq('id', productId).select('id, name');
    if (error) throw error;
    return data[0];
};

const updateProductSortOrder = async (id, sortOrder) => {
    const { data, error } = await supabase.from('products').update({ sort_order: sortOrder }).eq('id', id).select('id');
    if (error) throw error;
    return data[0];
};

const getProductById = async (productId) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', productId).single();
    if (error) throw error;
    return data;
};

const addProduct = async (productData) => {
    const { categoryId, subcategoryId, name, description, price, isUnitPrice, imageUrl, deliveryOption } = productData;
    const { data, error } = await supabase
        .from('products')
        .insert([{
            category_id: categoryId, subcategory_id: subcategoryId || null,
            name, description, price, is_unit_price: isUnitPrice,
            image_url: imageUrl, delivery_option: deliveryOption || 'none',
            is_active: true, is_out_of_stock: false, sort_order: 0
        }])
        .select('id');
    if (error) throw error;
    return data;
};

const deleteProduct = async (id) => {
    await supabase.from('carts').delete().eq('product_id', id);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
};

const setDeliveryOption = async (productId, option) => {
    const { data, error } = await supabase.from('products').update({ delivery_option: option }).eq('id', productId).select('id, delivery_option');
    if (error) throw error;
    return data[0];
};

module.exports = {
    getActiveCategories, addCategory, renameCategory, deleteCategory,
    updateCategorySortOrder, getProductsByCategory, getProductsBySubcategory,
    getProductById, addProduct, deleteProduct,
    toggleProductStatus, updateProductCategory, updateProductImage,
    updateProductName, updateProductSortOrder, setDeliveryOption
};
