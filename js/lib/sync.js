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

    async uploadVenta(ventaLocal) {
        // Implement upload logic using Supabase RPC or direct insert
        // On success, update local record with real ID
        const { data, error } = await supabase.rpc('registrar_venta', { payload: ventaLocal });
        if (error) throw error;
        
        if (data && data.id) {
            await db.ventas.update(ventaLocal.id, { ...data, sync_estado: 'sincronizado' });
        }
        return true;
    }

    async uploadTurno(turnoLocal) {
        const { error } = await supabase.from('turnos_caja').upsert([turnoLocal]);
        if (error) throw error;
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
