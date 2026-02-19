const supabase = require('../supabaseClient');

const createApprovalRequest = async (actionType, requestedBy, targetId, newValue = null) => {
    // Wir nutzen .select('id'), um nicht das ganze Objekt zurückzugeben, 
    // da wir meist nur die ID für die Bestätigung brauchen.
    const { data, error } = await supabase
        .from('pending_approvals')
        .insert([{
            action_type: actionType,
            requested_by: requestedBy,
            target_id: targetId,
            new_value: newValue ? newValue.toString() : null,
            status: 'pending'
        }])
        .select('id');

    if (error) throw new Error(error.message);
    return data[0];
};

const getPendingApprovals = async () => {
    // Reduzierung der geladenen Spalten beschleunigt die Antwortzeit von Supabase
    const { data, error } = await supabase
        .from('pending_approvals')
        .select(`
            id,
            action_type,
            target_id,
            requested_by,
            users:requested_by (username)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }); // Neueste Anfragen zuerst

    if (error) throw new Error(error.message);
    return data;
};

const getApprovalById = async (id) => {
    const { data, error } = await supabase
        .from('pending_approvals')
        .select(`
            id,
            action_type,
            target_id,
            new_value,
            requested_by,
            users:requested_by (username)
        `)
        .eq('id', id)
        .single();

    if (error) throw new Error(error.message);
    return data;
};

const updateApprovalStatus = async (id, status) => {
    const { data, error } = await supabase
        .from('pending_approvals')
        .update({ status: status })
        .eq('id', id)
        .select('id, status');

    if (error) throw new Error(error.message);
    return data[0];
};

module.exports = {
    createApprovalRequest,
    getPendingApprovals,
    getApprovalById,
    updateApprovalStatus
};
