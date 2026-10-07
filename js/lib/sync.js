import { supabase } from './supabase.js';
import { db } from './db.js';
import { CONFIG } from '../config.js';

class SyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.statusListeners = [];
        this.syncInterval = null;
    }

    init() {
        window.addEventListener('online', () => this.handleConnectionChange(true));
        window.addEventListener('offline', () => this.handleConnectionChange(false));
        
        this.startPeriodicSync();
        this.notifyStatusChange();
    }

    handleConnectionChange(online) {
        this.isOnline = online;
        this.notifyStatusChange();
        
        if (online) {
            this.processQueue();
            this.fullSync();
        }
    }

    startPeriodicSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => {
            if (this.isOnline) {
                this.processQueue();
                this.fullSync();
            }
        }, CONFIG.SYNC_INTERVAL_MS);
    }

    stopPeriodicSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
    }

    onStatusChange(callback) {
        this.statusListeners.push(callback);
        callback(this.getStatus());
    }

    notifyStatusChange() {
        const status = this.getStatus();
        this.statusListeners.forEach(cb => cb(status));
    }

    async getStatus() {
        const pendingCount = await db.syncQueue.where('estado').equals('pendiente').count();
        return {
            isOnline: this.isOnline,
            pendingCount,
            isSyncing: this.isSyncing
        };
    }

    async addToQueue(tabla, operacion, datos) {
        await db.syncQueue.add({
            tabla,
            operacion,
            datos,
            timestamp: new Date().toISOString(),
            intentos: 0,
            estado: 'pendiente'
        });
        
        if (this.isOnline) {
            this.processQueue();
        } else {
            this.notifyStatusChange();
        }
    }

    async processQueue() {
        if (this.isSyncing || !this.isOnline) return;
        
        this.isSyncing = true;
        this.notifyStatusChange();

        try {
            const pendingItems = await db.syncQueue
                .where('estado').equals('pendiente')
                .sortBy('timestamp');

            for (const item of pendingItems) {
                let success = false;
                
                try {
                    if (item.tabla === 'ventas') {
                        success = await this.uploadVenta(item.datos);
                    } else if (item.tabla === 'turnos_caja') {
                        success = await this.uploadTurno(item.datos);
                    } else if (item.tabla === 'productos' && item.operacion === 'UPDATE') {
                        success = await this.uploadProducto(item.datos);
                    }
                    // Add other tables as needed...

                    if (success) {
                        await db.syncQueue.update(item.id, { estado: 'sincronizado' });
                    } else {
                        item.intentos++;
                        if (item.intentos >= CONFIG.MAX_RETRIES) {
                            await db.syncQueue.update(item.id, { estado: 'error' });
                        } else {
                            await db.syncQueue.update(item.id, { intentos: item.intentos });
                        }
                    }
                } catch (err) {
                    console.error('Error processing sync item:', item, err);
                    item.intentos++;
                    if (item.intentos >= CONFIG.MAX_RETRIES) {
                        await db.syncQueue.update(item.id, { estado: 'error' });
                    } else {
                        await db.syncQueue.update(item.id, { intentos: item.intentos });
                    }
                }
            }
        } finally {
            this.isSyncing = false;
            this.notifyStatusChange();
        }
    }

    async uploadVenta({ venta, detalles }) {
        const { data, error } = await supabase.rpc('registrar_venta', {
            p_items: detalles.map(item => ({
                producto_id: item.producto_id,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unitario,
                descuento: item.descuento || 0
            })),
            p_cliente_id: venta.cliente_id || null,
            p_metodo_pago: venta.metodo_pago,
            p_descuento: venta.descuento || 0,
            p_notas: venta.notas || null,
            p_turno_caja_id: venta.turno_caja_id || null,
            p_sync_id: venta.sync_id
        });
        if (error) throw error;
        
        if (data) {
            await db.ventas.where('sync_id').equals(venta.sync_id).modify({ server_id: data, sync_estado: 'sincronizado' });
        }
        return true;
    }

    async uploadTurno(turnoLocal) {
        const { error } = await supabase.from('turnos_caja').upsert([turnoLocal]);
        if (error) throw error;
        return true;
    }

    async uploadProducto({ id, ...datos }) {
        const { data, error } = await supabase
            .from('productos')
            .update(datos)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        if (data) await db.productos.put(data);
        return true;
    }

    async syncTable(tabla) {
        if (!this.isOnline) return;
        
        const { data, error } = await supabase.from(tabla).select('*').eq('activo', true);
        if (error) {
            console.error(`Error syncing table ${tabla}:`, error);
            return;
        }

        if (data) {
            await db.transaction('rw', db[tabla], async () => {
                await db[tabla].clear();
                await db[tabla].bulkAdd(data);
            });
        }
    }

    async fullSync() {
        if (!this.isOnline || this.isSyncing) return;
        
        this.isSyncing = true;
        this.notifyStatusChange();

        try {
            await Promise.all([
                this.syncTable('productos'),
                this.syncTable('categorias'),
                this.syncTable('clientes'),
                this.syncTable('proveedores')
            ]);
        } catch (error) {
            console.error('Full sync failed:', error);
        } finally {
            this.isSyncing = false;
            this.notifyStatusChange();
        }
    }
}

const syncManager = new SyncManager();
export { syncManager as SyncManager };
