import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { getCurrentUser } from '../lib/auth.js';
import { generateUUID, generateNumeroVenta, isOnline } from '../lib/utils.js';

export const VentasService = {
    registrar: async (items, clienteId, metodoPago, descuento, notas, turnoId) => {
        const syncId = generateUUID();
        const numeroVenta = generateNumeroVenta();
        const usuario = getCurrentUser();
        const fecha = new Date().toISOString();

        const subtotal = items.reduce((sum, item) => sum + (item.precio_unitario * item.cantidad), 0);
        const total = Math.max(0, subtotal - descuento);

        const venta = {
            id: generateUUID(),
            numero_venta: numeroVenta,
            cliente_id: clienteId || null,
            usuario_id: usuario.id,
            turno_caja_id: turnoId,
            subtotal, 
            descuento, 
            impuesto: 0, 
            total,
            metodo_pago: metodoPago,
            estado: 'completada',
            notas: notas || null,
            sync_id: syncId,
            fecha
        };

        const detalles = items.map(item => ({
            id: generateUUID(),
            venta_id: venta.id,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            descuento: item.descuento || 0,
            subtotal: item.precio_unitario * item.cantidad - (item.descuento || 0)
        }));

        // Save locally first
        await db.ventas.put(venta);
        await db.detalle_ventas.bulkPut(detalles);

        // Update local stock
        for (const item of items) {
            await db.productos.where('id').equals(item.producto_id).modify(p => {
                p.stock_actual = (p.stock_actual || 0) - item.cantidad;
            });
        }

        if (isOnline()) {
            try {
                const { data, error } = await supabase.rpc('registrar_venta', {
                    p_items: items.map(i => ({
                        producto_id: i.producto_id,
                        cantidad: i.cantidad,
                        precio_unitario: i.precio_unitario,
                        descuento: i.descuento || 0
                    })),
                    p_cliente_id: clienteId || null,
                    p_metodo_pago: metodoPago,
                    p_descuento: descuento,
                    p_notas: notas || null,
                    p_turno_caja_id: turnoId,
                    p_sync_id: syncId
                });
                
                if (error) throw error;
                
                // Update local with server ID if returned
                if (data) {
                    await db.ventas.where('sync_id').equals(syncId).modify({ id: data });
                }
            } catch (err) {
                console.error('Error syncing venta, queued for offline:', err);
                await db.syncQueue.add({
                    tabla: 'ventas', operacion: 'INSERT',
                    datos: { venta, detalles },
                    timestamp: Date.now(), intentos: 0, estado: 'pendiente'
                });
            }
        } else {
            await db.syncQueue.add({
                tabla: 'ventas', operacion: 'INSERT',
                datos: { venta, detalles },
                timestamp: Date.now(), intentos: 0, estado: 'pendiente'
            });
        }

        return { venta, detalles };
    },

    anular: async (ventaId) => {
        // Find locally
        const venta = await db.ventas.get(ventaId);
        if (!venta) throw new Error('Venta no encontrada');

        await db.ventas.update(ventaId, { estado: 'anulada' });

        if (isOnline()) {
            try {
                const { error } = await supabase.from('ventas').update({ estado: 'anulada' }).eq('id', ventaId);
                if (error) throw error;
            } catch (err) {
                await db.syncQueue.add({
                    tabla: 'ventas', operacion: 'UPDATE',
                    datos: { id: ventaId, estado: 'anulada' },
                    timestamp: Date.now(), intentos: 0, estado: 'pendiente'
                });
            }
        } else {
            await db.syncQueue.add({
                tabla: 'ventas', operacion: 'UPDATE',
                datos: { id: ventaId, estado: 'anulada' },
                timestamp: Date.now(), intentos: 0, estado: 'pendiente'
            });
        }
    },

    getByRango: async (fechaInicio, fechaFin) => {
        return await db.ventas
            .filter(v => v.fecha >= fechaInicio && v.fecha <= fechaFin)
            .toArray();
    },

    getDetalle: async (ventaId) => {
        const venta = await db.ventas.get(ventaId);
        const detalles = await db.detalle_ventas.where('venta_id').equals(ventaId).toArray();
        return { venta, detalles };
    },

    getVentasHoy: async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return await db.ventas
            .filter(v => new Date(v.fecha) >= today)
            .toArray();
    },

    getUltimaVenta: async () => {
        const ventas = await db.ventas.orderBy('fecha').reverse().limit(1).toArray();
        if (ventas.length > 0) {
            return await VentasService.getDetalle(ventas[0].id);
        }
        return null;
    }
};
