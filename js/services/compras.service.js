import { supabase } from '../lib/supabase.js';
import { formatCOP, isOnline } from '../lib/utils.js';

const throwPurchaseMigrationError = (error) => {
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42703') {
    throw new Error('Falta ejecutar sql/013_compras_afectan_caja.sql en Supabase para habilitar los movimientos de caja de Compras.');
  }
  throw error;
};

const toPurchaseError = (error) => {
  if (error.code === '23514' && error.message === 'Efectivo insuficiente en la caja seleccionada.') {
    let details;
    try {
      details = JSON.parse(error.details);
    } catch {
      throw new Error('Efectivo insuficiente en la caja seleccionada.');
    }
    throw new Error(`Efectivo insuficiente. Disponible: ${formatCOP(Number(details.disponible))}; compra: ${formatCOP(Number(details.requerido))}.`);
  }
  throwPurchaseMigrationError(error);
};

export const ComprasService = {
  async registrar(proveedorId, items, notas, turnoCajaId) {
    if (!isOnline()) {
      throw new Error('Debe estar conectado a internet para registrar compras');
    }

    if (!items || items.length === 0) {
      throw new Error('La compra debe contener al menos un producto');
    }
    if (!turnoCajaId) {
      throw new Error('Selecciona la caja abierta que pagará esta compra');
    }

    try {
      const { data, error } = await supabase.rpc('registrar_compra', {
        p_proveedor_id: proveedorId || null,
        p_items: items,
        p_notas: notas || '',
        p_turno_caja_id: turnoCajaId
      });

      if (error) toPurchaseError(error);
      return data.compra_id;
    } catch (error) {
      console.error('Error registrando compra:', error);
      throw error;
    }
  },

  async getAll(filtros = {}) {
    if (!isOnline()) {
      throw new Error('Esta acción requiere conexión a internet');
    }

    const { proveedor_id, estado, fecha_inicio, fecha_fin, page = 1, pageSize = 50 } = filtros;
    
    try {
      let query = supabase.from('compras').select(`
        *,
        proveedores (nombre),
        usuarios (nombre)
      `, { count: 'exact' });
      
      if (proveedor_id) query = query.eq('proveedor_id', proveedor_id);
      if (estado) query = query.eq('estado', estado);
      if (fecha_inicio) query = query.gte('fecha', fecha_inicio);
      if (fecha_fin) query = query.lte('fecha', fecha_fin);
      
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('fecha', { ascending: false });
      
      const { data, count, error } = await query;
      if (error) throw error;
      
      return { data, total: count || 0 };
    } catch (error) {
      console.error('Error fetching compras:', error);
      throw error;
    }
  },

  async getDetalle(compraId) {
    if (!isOnline()) {
      throw new Error('Esta acción requiere conexión a internet');
    }

    try {
      const { data, error } = await supabase
        .from('detalle_compras')
        .select(`
          *,
          productos (nombre, sku, codigo_barras)
        `)
        .eq('compra_id', compraId);
        
      if (error) throwPurchaseMigrationError(error);
      return data;
    } catch (error) {
      console.error('Error fetching purchase details:', error);
      throw error;
    }
  },

  async getMovimientoCaja(compraId) {
    if (!isOnline()) {
      throw new Error('Esta acción requiere conexión a internet');
    }

    const { data, error } = await supabase
      .from('movimientos_caja')
      .select('id, monto')
      .eq('compra_id', compraId)
      .eq('tipo', 'salida')
      .maybeSingle();

    if (error) throwPurchaseMigrationError(error);
    return data;
  },

  async anular(compraId, turnoReembolsoId = null) {
    if (!isOnline()) {
      throw new Error('Esta acción requiere conexión a internet');
    }

    try {
      const { data, error } = await supabase.rpc('anular_compra', {
        p_compra_id: compraId,
        p_turno_reembolso_id: turnoReembolsoId
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error anular compra:', error);
      throw error;
    }
  }
};
