const supabase = require('../supabaseClient');

const getSubcategoriesByCategory = async (categoryId) => {
    const { data, error } = await supabase
        .from('subcategories')
        .select('id, name, category_id, sort_order')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
};

const getSubcategoryById = async (id) => {
    const { data, error } = await supabase
        .from('subcategories')
        .select('id, name, category_id, sort_order, is_active')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
};

const addSubcategory = async (categoryId, name) => {
    const { data, error } = await supabase
        .from('subcategories')
        .insert([{ category_id: categoryId, name, sort_order: 0 }])
        .select('id, name');
    if (error) throw error;
    return data[0];
};

const renameSubcategory = async (id, newName) => {
    const { data, error } = await supabase
        .from('subcategories')
        .update({ name: newName })
        .eq('id', id)
        .select('id, name');
    if (error) throw error;
    return data[0];
};

const deleteSubcategory = async (id) => {
    // Produkte in dieser Unterkategorie verlieren ihre Zuordnung
    await supabase
        .from('products')
        .update({ subcategory_id: null })
        .eq('subcategory_id', id);

    const { error } = await supabase
        .from('subcategories')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return true;
};

const updateSubcategorySortOrder = async (id, sortOrder) => {
    const { data, error } = await supabase
        .from('subcategories')
        .update({ sort_order: sortOrder })
        .eq('id', id)
        .select('id');
    if (error) throw error;
    return data[0];
};

module.exports = {
    getSubcategoriesByCategory,
    getSubcategoryById,
    addSubcategory,
    renameSubcategory,
    deleteSubcategory,
    updateSubcategorySortOrder
};
