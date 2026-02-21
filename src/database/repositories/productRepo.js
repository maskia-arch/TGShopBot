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
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name, sort_order: 0 }])
        .select('id, name');
    if (error) throw error;
    return data[0];
};

const renameCategory = async (id, newName) => {
    const { data, error } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('id', id)
        .select('id, name');
    if (error) throw error;
    return data[0];
};

const deleteCategory = async (id) => {
    // Unterkategorien der Kategorie löschen
    await supabase.from('subcategories').delete().eq('category_id', id);
    // Produkte entkoppeln
    await supabase.from('products').update({ category_id: null, subcategory_id: null }).eq('category_id', id);
    // Kategorie löschen
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    return true;
};

const deleteCategoryCompletely = async (id) => {
    // Alle Produkte der Kategorie finden
    const { data: products } = await supabase.from('products').select('id, image_url').eq('category_id', id);
    // Produkte löschen (inkl. Warenkorb-Einträge)
    if (products && products.length > 0) {
        const productIds = products.map(p => p.id);
        await supabase.from('carts').delete().in('product_id', productIds);
        await supabase.from('products').delete().in('id', productIds);
    }
    // Unterkategorien löschen
    await supabase.from('subcategories').delete().eq('category_id', id);
    // Kategorie löschen
    await supabase.from('categories').delete().eq('id', id);
    return true;
};

const updateCategorySortOrder = async (id, sortOrder) => {
    const { data, error } = await supabase
        .from('categories')
        .update({ sort_order: sortOrder })
        .eq('id', id)
        .select('id');
    if (error) throw error;
    return data[0];
};

const getProductsByCategory = async (categoryId, isAdmin = false) => {
    let query = supabase
        .from('products')
        .select('id, name, price, is_active, is_out_of_stock, category_id, subcategory_id, requires_shipping, sort_order');
    
    if (categoryId === null || categoryId === 'none') {
        query = query.is('category_id', null);
    } else {
        query = query.eq('category_id', categoryId);
    }

    if (!isAdmin) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const getProductsBySubcategory = async (subcategoryId, isAdmin = false) => {
    let query = supabase
        .from('products')
        .select('id, name, price, is_active, is_out_of_stock, category_id, subcategory_id, requires_shipping, sort_order')
        .eq('subcategory_id', subcategoryId);

    if (!isAdmin) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const updateProductCategory = async (productId, categoryId) => {
    const { data, error } = await supabase
        .from('products')
        .update({ category_id: categoryId })
        .eq('id', productId)
        .select('id, category_id');
    if (error) throw error;
    return data[0];
};

const toggleProductStatus = async (productId, field, value) => {
    const { data, error } = await supabase
        .from('products')
        .update({ [field]: value })
        .eq('id', productId)
        .select('id, is_active, is_out_of_stock, price, requires_shipping');
    if (error) throw error;
    return data[0];
};

const updateProductImage = async (productId, imageUrl) => {
    const { data, error } = await supabase
        .from('products')
        .update({ image_url: imageUrl })
        .eq('id', productId)
        .select('id, image_url');
    if (error) throw error;
    return data[0];
};

const updateProductName = async (productId, newName) => {
    const { data, error } = await supabase
        .from('products')
        .update({ name: newName })
        .eq('id', productId)
        .select('id, name');
    if (error) throw error;
    return data[0];
};

const updateProductSortOrder = async (id, sortOrder) => {
    const { data, error } = await supabase
        .from('products')
        .update({ sort_order: sortOrder })
        .eq('id', id)
        .select('id');
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
    const { categoryId, subcategoryId, name, description, price, isUnitPrice, imageUrl, requiresShipping } = productData;
    const { data, error } = await supabase
        .from('products')
        .insert([{
            category_id: categoryId,
            subcategory_id: subcategoryId || null,
            name: name,
            description: description,
            price: price,
            is_unit_price: isUnitPrice,
            image_url: imageUrl,
            requires_shipping: requiresShipping || false,
            is_active: true,
            is_out_of_stock: false,
            sort_order: 0
        }])
        .select('id');
    if (error) throw error;
    return data;
};

const deleteProduct = async (id) => {
    // Warenkorb-Einträge entfernen
    await supabase.from('carts').delete().eq('product_id', id);
    // Produkt löschen
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
};

const deleteAllProducts = async () => {
    await supabase.from('carts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('subcategories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return true;
};

// ── Versand-Flag ──

const toggleShipping = async (productId, value) => {
    const { data, error } = await supabase
        .from('products')
        .update({ requires_shipping: value })
        .eq('id', productId)
        .select('id, requires_shipping');
    if (error) throw error;
    return data[0];
};

const requiresShipping = async (productId) => {
    const { data } = await supabase.from('products').select('requires_shipping').eq('id', productId).maybeSingle();
    return data ? data.requires_shipping === true : false;
};

module.exports = {
    getActiveCategories,
    addCategory,
    renameCategory,
    deleteCategory,
    deleteCategoryCompletely,
    updateCategorySortOrder,
    getProductsByCategory,
    getProductsBySubcategory,
    getProductById,
    addProduct,
    deleteProduct,
    deleteAllProducts,
    toggleProductStatus,
    updateProductCategory,
    updateProductImage,
    updateProductName,
    updateProductSortOrder,
    toggleShipping,
    requiresShipping
};
