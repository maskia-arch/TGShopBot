const supabase = require('../supabaseClient');
const config = require('../../config');

const upsertUser = async (userId, username) => {
    const { data: existing, error: fetchError } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('telegram_id', userId)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    if (!existing) {
        const { error: insertError } = await supabase
            .from('users')
            .insert([{ telegram_id: userId, username: username, role: 'customer' }]);
        
        if (insertError) throw insertError;
    }
};

const getUserRole = async (userId) => {
    if (Number(userId) === Number(config.MASTER_ADMIN_ID)) return 'master';

    const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('telegram_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? data.role : 'customer';
};

const isMasterAdmin = async (userId) => {
    return Number(userId) === Number(config.MASTER_ADMIN_ID);
};

const updateUserRole = async (targetId, role) => {
    const { data, error } = await supabase
        .from('users')
        .update({ role: role })
        .eq('telegram_id', targetId)
        .select();

    if (error) throw error;
    return data && data.length > 0;
};

const addAdmin = async (targetId) => {
    return await updateUserRole(targetId, 'admin');
};

const removeAdmin = async (targetId) => {
    return await updateUserRole(targetId, 'customer');
};

const deleteUser = async (telegramId) => {
    const { error } = await supabase
        .from('users')
        .delete()
        .eq('telegram_id', telegramId);

    if (error) throw error;
    return true;
};

const getAllAdmins = async () => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'admin');

    if (error) throw error;
    
    const admins = data || [];
    
    admins.unshift({
        telegram_id: config.MASTER_ADMIN_ID,
        username: 'Master (Env)',
        role: 'master'
    });

    return admins;
};

const getAllCustomers = async () => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'customer');

    if (error) throw error;
    return data;
};

module.exports = {
    upsertUser,
    getUserRole,
    isMasterAdmin,
    addAdmin,
    removeAdmin,
    updateUserRole,
    deleteUser,
    getAllAdmins,
    getAllCustomers
};
