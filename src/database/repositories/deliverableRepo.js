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
        
        const count = data ? data.length : records.length;
        if (count > 0) {
            const productRepo = require('./productRepo');
            await productRepo.toggleProductStatus(productId, 'is_out_of_stock', false).catch(() => {});
        }
        return count;
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
     * ATOMAR, LÖSCHEND & MANIPULATIONSSICHER:
     * Entnimmt 'count' verfügbare Items aus dem Vorrat, LÖSCHT sie sofort aus dem Tresor
     * (damit sie niemals doppelt versendet werden können) und gibt den Inhalt zurück.
     */
    async popAvailableDeliverables(productId, count, orderId, userId) {
        const available = await this.getAvailableItems(productId);
        if (available.length < count) {
            return { success: false, needed: count, available: available.length, items: available.map(i => i.content) };
        }

        const selected = available.slice(0, count);
        const deliveredItems = [];

        for (const item of selected) {
            // Atomares Löschen: Garantiert, dass nur existierende "available" Items entnommen & purged werden!
            const { data, error } = await supabase
                .from('product_deliverables')
                .delete()
                .eq('id', item.id)
                .eq('status', 'available')
                .select();

            if (error || !data || data.length === 0) {
                throw new Error(`Konflikt bei der Entnahme von Item ${item.id} (bereits entnommen). Aktion abgebrochen.`);
            }
            deliveredItems.push(item.content);
        }

        // Nach Entnahme Bestand prüfen & ggf. Status "ausverkauft" setzen
        const remainingCount = await this.getAvailableCount(productId);
        if (remainingCount === 0) {
            const productRepo = require('./productRepo');
            await productRepo.toggleProductStatus(productId, 'is_out_of_stock', true).catch(() => {});
        }

        return { success: true, items: deliveredItems, remainingCount };
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
