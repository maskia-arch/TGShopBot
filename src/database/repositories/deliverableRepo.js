/**
 * deliverableRepo.js – Repository für den digitalen Vorrat (Deliverables Tresor)
 */
const supabase = require('../supabaseClient');

const deliverableRepo = {
    /**
     * Fügt ein Array von Content-Strings als verfügbare Vorräte für ein Produkt hinzu
     */
    async addDeliverables(productId, items) {
        if (!items || items.length === 0) return 0;
        
        const records = items.map(content => ({
            product_id: String(productId),
            content: content.trim(),
            status: 'available',
            created_at: new Date().toISOString()
        })).filter(r => r.content.length > 0);

        if (records.length === 0) return 0;

        const { data, error } = await supabase
            .from('product_deliverables')
            .insert(records)
            .select();

        if (error) throw new Error(`Fehler beim Speichern der Vorräte: ${error.message}`);
        return data ? data.length : records.length;
    },

    /**
     * Zählt die Anzahl der verfügbaren Einheiten für ein Produkt
     */
    async getAvailableCount(productId) {
        const { data, error } = await supabase
            .from('product_deliverables')
            .select('id')
            .eq('product_id', String(productId))
            .eq('status', 'available');

        if (error) return 0;
        return data ? data.length : 0;
    },

    /**
     * Holt alle verfügbaren Einträge für ein Produkt
     */
    async getAvailableItems(productId) {
        const { data, error } = await supabase
            .from('product_deliverables')
            .select('*')
            .eq('product_id', String(productId))
            .eq('status', 'available')
            .order('created_at', { ascending: true });

        if (error) return [];
        return data || [];
    },

    /**
     * ATOMAR & MANIPULATIONSSICHER: Entnimmt 'count' verfügbare Items aus dem Vorrat,
     * markiert sie als 'delivered' für die Bestellung/Nutzer und gibt den Inhalt zurück.
     */
    async popAvailableDeliverables(productId, count, orderId, userId) {
        const available = await this.getAvailableItems(productId);
        if (available.length < count) {
            return { success: false, needed: count, available: available.length };
        }

        const selected = available.slice(0, count);
        const deliveredItems = [];

        for (const item of selected) {
            const { data, error } = await supabase
                .from('product_deliverables')
                .update({
                    status: 'delivered',
                    order_id: String(orderId),
                    delivered_to: userId,
                    delivered_at: new Date().toISOString()
                })
                .eq('id', item.id)
                .eq('status', 'available') // Strikter Optimistic Locking Guard gegen Doppel-Auslieferung!
                .select();

            if (error || !data || data.length === 0) {
                throw new Error(`Konflikt bei der Entnahme von Item ${item.id}. Aktion abgebrochen.`);
            }
            deliveredItems.push(item.content);
        }

        return { success: true, items: deliveredItems };
    },

    /**
     * Löscht ein einzelnes Vorrats-Item aus der Datenbank
     */
    async deleteDeliverable(id) {
        const { error } = await supabase
            .from('product_deliverables')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Fehler beim Löschen des Items: ${error.message}`);
        return true;
    },

    /**
     * Löscht den gesamten unbenutzten Vorrat eines Produkts
     */
    async clearAvailableDeliverables(productId) {
        const { error } = await supabase
            .from('product_deliverables')
            .delete()
            .eq('product_id', String(productId))
            .eq('status', 'available');

        if (error) throw new Error(`Fehler beim Leeren des Vorrats: ${error.message}`);
        return true;
    }
};

module.exports = deliverableRepo;
