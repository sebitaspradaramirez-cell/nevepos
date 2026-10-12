import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline } from '../lib/utils.js';

const requireConnection = () => {
  if (!isOnline()) throw new Error('Se requiere conexión a internet para gestionar créditos.');
};

const throwCreditError = (error) => {
  if (error.code === 'PGRST202' || error.code === '42883') {
    throw new Error('Falta instalar sql/012_credito_descuenta_existencias.sql en Supabase.');
  }
  if (error.code === 'PGRST205' || error.code === '42P01') {
    throw new Error('Falta instalar sql/009_creditos_trabajadores.sql en Supabase.');
  }
  throw error;
};

export const CreditosTrabajadoresService = {
  async getAll() {
    requireConnection();

    const { data, error } = await supabase
      .from('creditos_trabajadores')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throwCreditError(error);
    return data || [];
  },

  async create({ trabajador_nombre, producto_id, cantidad, precio_unitario }) {
    requireConnection();

    const safeQuantity = Number(cantidad);
    const safePrice = Number(precio_unitario);
    if (!trabajador_nombre?.trim()) throw new Error('Escribe el nombre del trabajador.');
    if (!producto_id) throw new Error('Selecciona un producto.');
    if (!Number.isSafeInteger(safeQuantity) || safeQuantity < 1) throw new Error('La cantidad debe ser un entero mayor que cero.');
    if (!Number.isSafeInteger(safePrice) || safePrice < 1) throw new Error('El precio debe ser un entero mayor que cero.');

    const total = safeQuantity * safePrice;
    if (!Number.isSafeInteger(total)) throw new Error('El total excede el valor permitido.');

    const { data, error } = await supabase.rpc('registrar_credito_trabajador', {
      p_trabajador_nombre: trabajador_nombre.trim(),
      p_producto_id: producto_id,
      p_cantidad: safeQuantity,
      p_precio_unitario: safePrice
    });

    if (error) throwCreditError(error);
    if (!data?.credito) throw new Error('El servidor no confirmó el crédito registrado.');

    await db.productos.update(producto_id, { stock_actual: data.stock_actual });
    return data.credito;
  },

  async settle(id, settled_by) {
    requireConnection();
    if (!settled_by) throw new Error('No se pudo identificar al usuario administrador.');

    const { data, error } = await supabase
      .from('creditos_trabajadores')
      .update({
        estado: 'liquidado',
        saldo: 0,
        paid_at: new Date().toISOString(),
        paid_by: settled_by
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select()
      .maybeSingle();

    if (error) throwCreditError(error);
    if (!data) throw new Error('El crédito ya fue liquidado o no existe.');
    return data;
  }
};