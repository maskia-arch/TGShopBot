const supabase = require('../supabaseClient');

const createApproval = async (targetId, actionType, newValue = null, requestedBy = null) => {
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
    const { data, error } = await supabase
        .from('pending_approvals')
        .select(`
            id,
            action_type,
            target_id,
            new_value,
            requested_by
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

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
            requested_by
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
    createApproval,
    getPendingApprovals,
    getApprovalById,
    updateApprovalStatus
};
