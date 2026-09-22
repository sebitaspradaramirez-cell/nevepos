import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline, generateUUID } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';

export const InventarioService = {
  async getMovimientos(filtros = {}) {
    const { producto_id, tipo, fecha_inicio, fecha_fin, page = 1, pageSize = 50 } = filtros;

    if (isOnline()) {
      try {
        let query = supabase.from('movimientos_inventario').select(`
          *,
          productos (nombre, sku)
        `, { count: 'exact' });

        if (producto_id) query = query.eq('producto_id', producto_id);
        if (tipo) query = query.eq('tipo', tipo);
        if (fecha_inicio) query = query.gte('fecha', fecha_inicio);
        if (fecha_fin) query = query.lte('fecha', fecha_fin);

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('fecha', { ascending: false });

        const { data, count, error } = await query;
        if (error) throw error;
        
        return { data, total: count || 0 };
      } catch (error) {
        console.error('Error fetching inventory movements:', error);
        throw error;
      }
    } else {
      throw new Error('Esta acción requiere conexión a internet');
    }
  },

  async registrarAjuste(productoId, cantidad, tipo, notas) {
    if (!['entrada', 'salida', 'ajuste'].includes(tipo)) {
      throw new Error('Tipo de movimiento inválido');
    }

    if (!isOnline()) {
      throw new Error('Los ajustes de inventario requieren conexión a internet para evitar inconsistencias');
    }

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Usuario no autenticado');

      // Get user id in DB
      const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      
      if (userError || !usuario) throw new Error('Usuario no encontrado en base de datos');

      // Get current stock
      const { data: producto, error: prodError } = await supabase
        .from('productos')
        .select('stock_actual')
        .eq('id', productoId)
        .single();

      if (prodError || !producto) throw new Error('Producto no encontrado');

      const stockAnterior = producto.stock_actual;
      let stockNuevo = stockAnterior;

      if (tipo === 'entrada') stockNuevo = stockAnterior + parseInt(cantidad, 10);
      else if (tipo === 'salida') stockNuevo = stockAnterior - parseInt(cantidad, 10);
      else if (tipo === 'ajuste') stockNuevo = parseInt(cantidad, 10); // for ajuste, amount is the new stock

      if (stockNuevo < 0) {
        throw new Error('El stock no puede ser negativo');
      }

      const cantidadMovimiento = Math.abs(stockNuevo - stockAnterior);

      // Perform updates
      const { error: updateError } = await supabase
        .from('productos')
        .update({ stock_actual: stockNuevo })
        .eq('id', productoId);

      if (updateError) throw updateError;

      const movimiento = {
        producto_id: productoId,
        usuario_id: usuario.id,
        tipo,
        cantidad: cantidadMovimiento,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        notas,
        fecha: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from('movimientos_inventario')
        .insert([movimiento]);

      if (insertError) throw insertError;

      // Update local IndexedDB
      await db.productos.update(productoId, { stock_actual: stockNuevo });

      return true;
    } catch (error) {
      console.error('Error registrando ajuste:', error);
      throw error;
    }
  },

  async getStockActual() {
    if (isOnline()) {
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, codigo_barras, sku, stock_actual, stock_minimo, categorias(nombre)')
        .eq('activo', true)
        .order('stock_actual', { ascending: true });
        
      if (error) throw error;
      return data;
    }
    const data = await db.productos.filter(p => p.activo).toArray();
    return data.sort((a, b) => a.stock_actual - b.stock_actual);
  },

  async getAlertasStock() {
    const productos = await this.getStockActual();
    return productos.filter(p => p.stock_actual <= p.stock_minimo);
  },

  async getHistorialProducto(productoId) {
    return this.getMovimientos({ producto_id: productoId, pageSize: 100 });
  }
};
