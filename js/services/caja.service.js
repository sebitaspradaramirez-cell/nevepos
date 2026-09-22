import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { getCurrentUser } from '../lib/auth.js';
import { generateUUID, isOnline } from '../lib/utils.js';

export const CajaService = {
    abrirTurno: async (numeroCaja, montoApertura) => {
        const usuario = getCurrentUser();
        const id = generateUUID();
        
        const turno = {
            id,
            numero_caja: parseInt(numeroCaja),
            usuario_id: usuario.id,
            fecha_apertura: new Date().toISOString(),
            monto_apertura: montoApertura,
            estado: 'abierto',
            sync_id: id
        };

        await db.turnos_caja.put(turno);

        if (isOnline()) {
            try {
                const { error } = await supabase.from('turnos_caja').insert([turno]);
                if (error) throw error;
            } catch (err) {
                await db.syncQueue.add({
                    tabla: 'turnos_caja', operacion: 'INSERT',
                    datos: turno,
                    timestamp: Date.now(), intentos: 0, estado: 'pendiente'
                });
            }
        } else {
            await db.syncQueue.add({
                tabla: 'turnos_caja', operacion: 'INSERT',
                datos: turno,
                timestamp: Date.now(), intentos: 0, estado: 'pendiente'
            });
        }
        
        return turno;
    },

    cerrarTurno: async (turnoId) => {
        const fecha_cierre = new Date().toISOString();
        
        await db.turnos_caja.update(turnoId, {
            estado: 'cerrado',
            fecha_cierre
        });

        if (isOnline()) {
            try {
                const { error } = await supabase.from('turnos_caja').update({
                    estado: 'cerrado',
                    fecha_cierre
                }).eq('id', turnoId);
                if (error) throw error;
            } catch (err) {
                await db.syncQueue.add({
                    tabla: 'turnos_caja', operacion: 'UPDATE',
                    datos: { id: turnoId, estado: 'cerrado', fecha_cierre },
                    timestamp: Date.now(), intentos: 0, estado: 'pendiente'
                });
            }
        } else {
            await db.syncQueue.add({
                tabla: 'turnos_caja', operacion: 'UPDATE',
                datos: { id: turnoId, estado: 'cerrado', fecha_cierre },
                timestamp: Date.now(), intentos: 0, estado: 'pendiente'
            });
        }
    },

    getTurnoActual: async () => {
        const usuario = getCurrentUser();
        if (!usuario) return null;
        
        const turnos = await db.turnos_caja
            .where('estado').equals('abierto')
            .filter(t => t.usuario_id === usuario.id)
            .toArray();
            
        return turnos.length > 0 ? turnos[0] : null;
    },

    registrarMovimiento: async (turnoId, tipo, monto, concepto) => {
        const id = generateUUID();
        const mov = {
            id,
            turno_caja_id: turnoId,
            tipo,
            monto,
            concepto,
            fecha: new Date().toISOString(),
            sync_id: id
        };

        await db.movimientos_caja.put(mov);

        if (isOnline()) {
            try {
                const { error } = await supabase.from('movimientos_caja').insert([mov]);
                if (error) throw error;
            } catch (err) {
                await db.syncQueue.add({
                    tabla: 'movimientos_caja', operacion: 'INSERT',
                    datos: mov,
                    timestamp: Date.now(), intentos: 0, estado: 'pendiente'
                });
            }
        } else {
            await db.syncQueue.add({
                tabla: 'movimientos_caja', operacion: 'INSERT',
                datos: mov,
                timestamp: Date.now(), intentos: 0, estado: 'pendiente'
            });
        }
        
        return mov;
    },

    getMovimientos: async (turnoId) => {
        return await db.movimientos_caja
            .where('turno_caja_id').equals(turnoId)
            .toArray();
    },

    getArqueo: async (turnoId) => {
        const turno = await db.turnos_caja.get(turnoId);
        if (!turno) throw new Error('Turno no encontrado');

        const movimientos = await CajaService.getMovimientos(turnoId);
        const ventas = await db.ventas
            .where('turno_caja_id').equals(turnoId)
            .filter(v => v.estado !== 'anulada')
            .toArray();

        let entradas = 0;
        let salidas = 0;
        
        movimientos.forEach(m => {
            if (m.tipo === 'entrada') entradas += m.monto;
            if (m.tipo === 'salida') salidas += m.monto;
        });

        let ventas_efectivo = 0;
        let ventas_transferencia = 0;
        
        ventas.forEach(v => {
            if (v.metodo_pago === 'efectivo') ventas_efectivo += v.total;
            if (v.metodo_pago === 'transferencia') ventas_transferencia += v.total;
        });

        const expected_total = (turno.monto_apertura || 0) + entradas - salidas + ventas_efectivo;

        return {
            apertura: turno.monto_apertura || 0,
            entradas,
            salidas,
            ventas_efectivo,
            ventas_transferencia,
            expected_total
        };
    }
};
