const supabase = require('../supabaseClient');
const config = require('../../config');

const upsertUser = async (userId, username) => {
    // Optimierung: Direkt ein upsert mit onConflict nutzen statt erst zu suchen.
    // Das spart einen kompletten Datenbank-Roundtrip.
    const { error } = await supabase
        .from('users')
        .upsert(
            { telegram_id: userId, username: username, role: 'customer' },
            { onConflict: 'telegram_id', ignoreDuplicates: true }
        );

    if (error) throw error;
};

const getUserRole = async (userId) => {
    // Hardcoded Master-Check ist bereits sehr schnell
    if (Number(userId) === Number(config.MASTER_ADMIN_ID)) return 'master';

    // Optimierung: Nur das 'role' Feld anfragen, nicht den ganzen Datensatz
    const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('telegram_id', userId)
        .maybeSingle(); // maybeSingle() ist performanter als .single() mit Error-Handling

    if (error) throw error;
    
    return data ? data.role : 'customer';
};

const isMasterAdmin = async (userId) => {
    return Number(userId) === Number(config.MASTER_ADMIN_ID);
};

const updateUserRole = async (targetId, role) => {
    // Optimierung: Nur ID zurückgeben zur Bestätigung
    const { data, error } = await supabase
        .from('users')
        .update({ role: role })
        .eq('telegram_id', targetId)
        .select('telegram_id');

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
    // Optimierung: Felder einschränken
    const { data, error } = await supabase
        .from('users')
        .select('telegram_id, username, role')
        .eq('role', 'admin');

    if (error) throw error;
    
    const admins = data || [];
    
    admins.unshift({
        telegram_id: config.MASTER_ADMIN_ID,
        username: 'Master (System)',
        role: 'master'
    });

    return admins;
};

const getAllCustomers = async () => {
    // Optimierung: Felder einschränken (keine unnötigen Metadaten laden)
    const { data, error } = await supabase
        .from('users')
        .select('telegram_id, username, role')
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
