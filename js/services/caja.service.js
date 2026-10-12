import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { getCurrentUser } from '../lib/auth.js';
import { generateUUID, isOnline } from '../lib/utils.js';

export const CajaService = {
    abrirTurno: async (numeroCaja, montoApertura) => {
        const usuario = getCurrentUser();
        const id = generateUUID();
        const fechaApertura = new Date().toISOString();
        
        const turno = {
            id,
            numero_caja: parseInt(numeroCaja),
            usuario_id: usuario.id,
            apertura: fechaApertura,
            monto_apertura: montoApertura,
            estado: 'abierto'
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

    cerrarTurno: async (turnoId, montoReal) => {
        const montoCierre = Number(montoReal);
        if (!Number.isSafeInteger(montoCierre) || montoCierre < 0) {
            throw new Error('El monto real contado debe ser un entero igual o mayor que cero.');
        }

        const cierre = new Date().toISOString();
        const datosCierre = { id: turnoId, estado: 'cerrado', cierre, monto_cierre: montoCierre };
        let encolar = !isOnline();

        if (isOnline()) {
            try {
                const { error } = await supabase.rpc('cerrar_turno_con_conteo', {
                    p_turno_id: turnoId,
                    p_monto_real: montoCierre
                });
                if (error) throw error;
            } catch (error) {
                if (error.code === 'PGRST202' || error.code === '42883') {
                    throw new Error('Falta instalar sql/011_ventas_reales_y_cierre_conteo.sql en Supabase.');
                }
                if (error.code === '42501' || error.code === '22023') throw error;
                encolar = true;
            }

        }
        if (encolar) {
            await db.syncQueue.add({
                tabla: 'turnos_caja', operacion: 'UPDATE',
                datos: datosCierre,
                timestamp: Date.now(), intentos: 0, estado: 'pendiente'
            });
        }

        await db.turnos_caja.update(turnoId, {
            estado: 'cerrado',
            cierre,
            monto_cierre: montoCierre
        });
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
    },

    getCuadreResumen: async (pin, todayStart, todayEnd) => {
        if (!isOnline()) throw new Error('El cuadre protegido requiere conexión a internet.');

        const { data, error } = await supabase.rpc('get_cash_drawer_summary', {
            p_pin: pin,
            p_today_start: todayStart,
            p_today_end: todayEnd
        });
        if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') {
                throw new Error('Falta instalar sql/010_cuadre_caja_protegido.sql en Supabase.');
            }
            throw error;
        }
        if (!data?.ok) return data;

        const { data: cierres, error: cierresError } = await supabase.rpc('get_cash_drawer_closed_totals', {
            p_pin: pin,
            p_today_start: todayStart,
            p_today_end: todayEnd
        });
        if (cierresError) {
            if (cierresError.code === 'PGRST202' || cierresError.code === '42883') {
                throw new Error('Falta instalar sql/011_ventas_reales_y_cierre_conteo.sql en Supabase.');
            }
            throw cierresError;
        }
        if (cierres?.setup_required) throw new Error('Configura el código de acceso al cuadre desde la cuenta administradora.');
        if (cierres?.locked) throw new Error('Demasiados intentos. Espera 15 minutos antes de volver a probar.');
        if (!cierres?.ok) throw new Error('Código incorrecto.');
        return { ...data, closed_cash: cierres };
    },

    configurarPinCuadre: async (pin) => {
        if (!isOnline()) throw new Error('Se requiere conexión a internet para configurar el acceso.');

        const { error } = await supabase.rpc('set_cash_drawer_pin', { p_pin: pin });
        if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') {
                throw new Error('Falta instalar sql/010_cuadre_caja_protegido.sql en Supabase.');
            }
            throw error;
        }
    }
};
