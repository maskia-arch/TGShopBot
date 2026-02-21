const supabase = require('../supabaseClient');
const config = require('../../config');

const upsertUser = async (userId, username) => {
    const { error } = await supabase
        .from('users')
        .upsert(
            { telegram_id: userId, username: username, role: 'customer' },
            { onConflict: 'telegram_id', ignoreDuplicates: true }
        );
    if (error) throw error;
};

const getUserRole = async (userId) => {
    if (Number(userId) === Number(config.MASTER_ADMIN_ID)) return 'master';
    const { data, error } = await supabase.from('users').select('role').eq('telegram_id', userId).maybeSingle();
    if (error) throw error;
    return data ? data.role : 'customer';
};

const isMasterAdmin = async (userId) => Number(userId) === Number(config.MASTER_ADMIN_ID);

// ── Ban System ──

const isUserBanned = async (userId) => {
    const { data } = await supabase.from('users').select('is_banned').eq('telegram_id', userId).maybeSingle();
    return data ? data.is_banned === true : false;
};

const banUser = async (userId) => {
    await supabase.from('users').update({ is_banned: true }).eq('telegram_id', userId);
    return true;
};

const unbanUser = async (userId) => {
    await supabase.from('users').update({ is_banned: false }).eq('telegram_id', userId);
    return true;
};

const createPendingBan = async (userId, bannedBy, reason = null) => {
    const { data, error } = await supabase
        .from('pending_bans')
        .insert([{ user_id: userId, banned_by: bannedBy, reason, status: 'pending' }])
        .select('id, expires_at');
    if (error) throw error;
    return data[0];
};

const getPendingBan = async (banId) => {
    const { data, error } = await supabase.from('pending_bans').select('*').eq('id', banId).single();
    if (error) throw error;
    return data;
};

const revertBan = async (banId) => {
    const ban = await getPendingBan(banId);
    if (!ban) return null;
    await unbanUser(ban.user_id);
    await supabase.from('pending_bans').update({ status: 'reverted' }).eq('id', banId);
    return ban;
};

const getExpiredPendingBans = async () => {
    const { data, error } = await supabase
        .from('pending_bans')
        .select('*')
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString());
    if (error) return [];
    return data || [];
};

const confirmBan = async (banId) => {
    await supabase.from('pending_bans').update({ status: 'confirmed' }).eq('id', banId);
};

const deleteUserCompletely = async (telegramId) => {
    await supabase.from('carts').delete().eq('user_id', telegramId);
    await supabase.from('orders').delete().eq('user_id', telegramId);
    await supabase.from('pending_bans').delete().eq('user_id', telegramId);
    await supabase.from('users').delete().eq('telegram_id', telegramId);
    return true;
};

// ── Cooldowns ──

const canPing = async (userId) => {
    const { data } = await supabase.from('users').select('last_ping_at').eq('telegram_id', userId).maybeSingle();
    if (!data || !data.last_ping_at) return true;
    return (Date.now() - new Date(data.last_ping_at).getTime()) >= 86400000;
};

const setPingTimestamp = async (userId) => {
    await supabase.from('users').update({ last_ping_at: new Date().toISOString() }).eq('telegram_id', userId);
};

const canContact = async (userId) => {
    const { data } = await supabase.from('users').select('last_contact_at').eq('telegram_id', userId).maybeSingle();
    if (!data || !data.last_contact_at) return true;
    return (Date.now() - new Date(data.last_contact_at).getTime()) >= 86400000;
};

const setContactTimestamp = async (userId) => {
    await supabase.from('users').update({ last_contact_at: new Date().toISOString() }).eq('telegram_id', userId);
};

// ── Standard CRUD ──

const updateUserRole = async (targetId, role) => {
    const { data, error } = await supabase.from('users').update({ role }).eq('telegram_id', targetId).select('telegram_id');
    if (error) throw error;
    return data && data.length > 0;
};
const addAdmin = async (targetId) => updateUserRole(targetId, 'admin');
const removeAdmin = async (targetId) => updateUserRole(targetId, 'customer');

const deleteUser = async (telegramId) => {
    const { error } = await supabase.from('users').delete().eq('telegram_id', telegramId);
    if (error) throw error;
    return true;
};

const getAllAdmins = async () => {
    const { data, error } = await supabase.from('users').select('telegram_id, username, role').eq('role', 'admin');
    if (error) throw error;
    const admins = data || [];
    admins.unshift({ telegram_id: config.MASTER_ADMIN_ID, username: 'Master (System)', role: 'master' });
    return admins;
};

const getAllCustomers = async () => {
    const { data, error } = await supabase.from('users').select('telegram_id, username, role').eq('role', 'customer');
    if (error) throw error;
    return data;
};

module.exports = {
    upsertUser, getUserRole, isMasterAdmin,
    isUserBanned, banUser, unbanUser,
    createPendingBan, getPendingBan, revertBan, getExpiredPendingBans, confirmBan,
    deleteUserCompletely,
    canPing, setPingTimestamp, canContact, setContactTimestamp,
    addAdmin, removeAdmin, updateUserRole, deleteUser,
    getAllAdmins, getAllCustomers
};
