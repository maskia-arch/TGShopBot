const supabase = require('../supabaseClient');

const createApprovalRequest = async (actionType, requestedBy, targetId, newValue = null) => {
    const { data, error } = await supabase
        .from('pending_approvals')
        .insert([{
            action_type: actionType,
            requested_by: requestedBy,
            target_id: targetId,
            new_value: newValue ? newValue.toString() : null,
            status: 'pending'
        }])
        .select();

    if (error) throw new Error(error.message);
    return data[0];
};

const getPendingApprovals = async () => {
    const { data, error } = await supabase
        .from('pending_approvals')
        .select(`
            *,
            users:requested_by (username)
        `)
        .eq('status', 'pending');

    if (error) throw new Error(error.message);
    return data;
};

const getApprovalById = async (id) => {
    const { data, error } = await supabase
        .from('pending_approvals')
        .select(`
            *,
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
        .select();

    if (error) throw new Error(error.message);
    return data[0];
};

module.exports = {
    createApprovalRequest,
    getPendingApprovals,
    getApprovalById,
    updateApprovalStatus
};
