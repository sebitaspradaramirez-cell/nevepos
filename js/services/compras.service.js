import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';

export const ComprasService = {
  async registrar(proveedorId, items, notas) {
    if (!isOnline()) {
      throw new Error('Debe estar conectado a internet para registrar compras');
    }

    if (!items || items.length === 0) {
      throw new Error('La compra debe contener al menos un producto');
    }

    try {
      const { data: compraId, error } = await supabase.rpc('registrar_compra', {
        p_proveedor_id: proveedorId || null,
        p_items: items,
        p_notas: notas || ''
      });

      if (error) throw error;
      
      // Clear product cache to force refresh of new stocks
      // Could also selectively update them
      
      return compraId;
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
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching purchase details:', error);
      throw error;
    }
  },

  async anular(compraId) {
    if (!isOnline()) {
      throw new Error('Esta acción requiere conexión a internet');
    }

    try {
      // NOTE: Normally there should be an RPC for 'anular_compra'
      // Since it wasn't requested in schema explicitly, we might need to implement logic here or it's a gap.
      // For now, updating state to anulada. Stock rollback should ideally be handled via RPC.
      
      // Quick fallback: manual rollback if RPC doesn't exist
      const { data: detalles } = await supabase.from('detalle_compras').select('*').eq('compra_id', compraId);
      const { data: compra } = await supabase.from('compras').select('estado').eq('id', compraId).single();
      
      if (compra.estado === 'anulada') throw new Error('La compra ya está anulada');
      
      const { data: { user } } = await supabase.auth.getUser();
      const { data: usuario } = await supabase.from('usuarios').select('id').eq('auth_user_id', user.id).single();

      for (let item of detalles) {
        const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
        const newStock = prod.stock_actual - item.cantidad;
        
        await supabase.from('productos').update({ stock_actual: newStock }).eq('id', item.producto_id);
        
        await supabase.from('movimientos_inventario').insert([{
          producto_id: item.producto_id,
          usuario_id: usuario.id,
          tipo: 'salida',
          cantidad: item.cantidad,
          stock_anterior: prod.stock_actual,
          stock_nuevo: newStock,
          referencia: compraId,
          notas: 'Anulación de compra'
        }]);
      }

      const { error: updateError } = await supabase
        .from('compras')
        .update({ estado: 'anulada' })
        .eq('id', compraId);

      if (updateError) throw updateError;
      
      return true;
    } catch (error) {
      console.error('Error anular compra:', error);
      throw error;
    }
  }
};
