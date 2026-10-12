import { supabase } from '../lib/supabase.js';
import { isOnline } from '../lib/utils.js';

const requireConnection = () => {
  if (!isOnline()) throw new Error('Se requiere conexión a internet para gestionar créditos.');
};

const throwCreditError = (error) => {
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

  async create({ trabajador_nombre, producto_id, producto_nombre, cantidad, precio_unitario, created_by }) {
    requireConnection();

    const safeQuantity = Number(cantidad);
    const safePrice = Number(precio_unitario);
    if (!trabajador_nombre?.trim()) throw new Error('Escribe el nombre del trabajador.');
    if (!producto_nombre?.trim()) throw new Error('Selecciona un producto.');
    if (!Number.isSafeInteger(safeQuantity) || safeQuantity < 1) throw new Error('La cantidad debe ser un entero mayor que cero.');
    if (!Number.isSafeInteger(safePrice) || safePrice < 1) throw new Error('El precio debe ser un entero mayor que cero.');
    if (!created_by) throw new Error('No se pudo identificar al usuario administrador.');

    const total = safeQuantity * safePrice;
    if (!Number.isSafeInteger(total)) throw new Error('El total excede el valor permitido.');

    const { data, error } = await supabase
      .from('creditos_trabajadores')
      .insert({
        trabajador_nombre: trabajador_nombre.trim(),
        producto_id,
        producto_nombre: producto_nombre.trim(),
        cantidad: safeQuantity,
        precio_unitario: safePrice,
        total,
        saldo: total,
        estado: 'pendiente',
        created_by
      })
      .select()
      .single();

    if (error) throwCreditError(error);
    return data;
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