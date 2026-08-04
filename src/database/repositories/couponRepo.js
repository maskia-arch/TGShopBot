const supabase = require('../supabaseClient');

/**
 * Ruft alle gespeicherten Coupons ab (absteigend sortiert)
 */
const getAllCoupons = async () => {
    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

/**
 * Sucht einen Coupon anhand des Codes (großgeschrieben)
 */
const getCouponByCode = async (code) => {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();

    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle();

    if (error) throw error;
    return data;
};

/**
 * Erstellt einen neuen Coupon
 */
const createCoupon = async (couponData) => {
    const code = (couponData.code || '').trim().toUpperCase();

    const newCoupon = {
        code: code,
        discount_type: couponData.discount_type || 'percent', // 'percent' oder 'fixed'
        discount_value: parseFloat(couponData.discount_value) || 0,
        product_id: couponData.product_id || null,
        max_uses: couponData.max_uses ? parseInt(couponData.max_uses) : null,
        uses_count: 0,
        expires_at: couponData.expires_at || null,
        is_active: couponData.is_active !== false
    };

    const { data, error } = await supabase
        .from('coupons')
        .insert([newCoupon])
        .select();

    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
};

/**
 * Erhöht den Einlöse-Zähler eines Coupons atomar um 1
 */
const incrementCouponUses = async (code) => {
    const coupon = await getCouponByCode(code);
    if (!coupon) return;

    const newUses = (coupon.uses_count || 0) + 1;
    const { data, error } = await supabase
        .from('coupons')
        .update({ uses_count: newUses })
        .eq('id', coupon.id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Schaltet den Aktiv-Status eines Coupons um (Aktivieren / Deaktivieren)
 */
const toggleCouponActive = async (id) => {
    const { data: current } = await supabase.from('coupons').select('is_active').eq('id', id).maybeSingle();
    const newStatus = current ? !current.is_active : false;

    const { data, error } = await supabase
        .from('coupons')
        .update({ is_active: newStatus })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Löscht einen Coupon anhand seiner ID
 */
const deleteCoupon = async (id) => {
    const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
};

/**
 * Prüft und validiert einen Coupon für den aktuellen Warenkorb
 */
const validateCoupon = async (code, cartItems = [], cartTotal = 0) => {
    if (!code) return { valid: false, message: 'Kein Coupon-Code angegeben.' };

    const coupon = await getCouponByCode(code);
    if (!coupon) {
        return { valid: false, message: '❌ Ungültiger Coupon-Code.' };
    }

    if (!coupon.is_active) {
        return { valid: false, message: '⚠️ Dieser Coupon ist momentan deaktiviert.' };
    }

    if (coupon.expires_at) {
        const expDate = new Date(coupon.expires_at);
        if (expDate < new Date()) {
            return { valid: false, message: '⏱️ Dieser Coupon ist leider abgelaufen.' };
        }
    }

    if (coupon.max_uses !== null && coupon.max_uses !== undefined) {
        if ((coupon.uses_count || 0) >= coupon.max_uses) {
            return { valid: false, message: '🚫 Maximale Anzahl der Einlösungen für diesen Coupon erreicht.' };
        }
    }

    const total = parseFloat(cartTotal) || 0;
    let eligibleTotal = total;

    if (coupon.product_id) {
        const eligibleItems = cartItems.filter(item => 
            String(item.product_id || item.id) === String(coupon.product_id)
        );

        if (eligibleItems.length === 0) {
            return { valid: false, message: '⚠️ Dieser Coupon gilt nur für ein bestimmtes Produkt, welches sich nicht in deinem Warenkorb befindet.' };
        }

        eligibleTotal = eligibleItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'percent') {
        discountAmount = (eligibleTotal * (parseFloat(coupon.discount_value) / 100));
    } else {
        discountAmount = Math.min(parseFloat(coupon.discount_value), eligibleTotal);
    }

    discountAmount = Math.min(discountAmount, total);
    discountAmount = parseFloat(discountAmount.toFixed(2));

    return {
        valid: true,
        coupon: coupon,
        discountAmount: discountAmount,
        finalTotal: parseFloat((total - discountAmount).toFixed(2)),
        message: `✅ Coupon "${coupon.code}" angewendet! Rabatt: -${discountAmount.toFixed(2).replace('.', ',')} €`
    };
};

module.exports = {
    getAllCoupons,
    getCouponByCode,
    createCoupon,
    incrementCouponUses,
    toggleCouponActive,
    deleteCoupon,
    validateCoupon
};
