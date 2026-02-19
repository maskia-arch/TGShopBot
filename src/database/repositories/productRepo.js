const supabase = require('../supabaseClient');

const getActiveCategories = async () => {
    // Nur ID und Namen laden, um die Payload klein zu halten
    const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const addCategory = async (name) => {
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name }])
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
    // Parallelisierung: Produkte auf "kategorielos" setzen und Kategorie löschen geht hier nicht (Foreign Key),
    // aber wir optimieren den Ablauf.
    const { error: updateError } = await supabase
        .from('products')
        .update({ category_id: null })
        .eq('category_id', id);
    
    if (updateError) throw updateError;

    const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
        
    if (deleteError) throw deleteError;
    return true;
};

const getProductsByCategory = async (categoryId, isAdmin = false) => {
    // WICHTIG: In der Listenansicht laden wir KEINE Beschreibungen oder Bild-URLs.
    // Das spart massiv Bandbreite und Rechenzeit bei der UI-Generierung.
    let query = supabase
        .from('products')
        .select('id, name, price, is_active, is_out_of_stock, category_id');
    
    if (categoryId === null || categoryId === 'none') {
        query = query.is('category_id', null);
    } else {
        query = query.eq('category_id', categoryId);
    }

    if (!isAdmin) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('name', { ascending: true });
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
        .select('id, is_active, is_out_of_stock, price');
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

const getProductById = async (productId) => {
    // Hier laden wir alles (*), da diese Funktion für die Detailansicht genutzt wird.
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
        }])
        .select('id');
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
    updateProductCategory,
    updateProductImage
};
