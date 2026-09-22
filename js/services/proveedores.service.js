import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline, generateUUID } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';

export const ProveedoresService = {
  async getAll(filtros = {}) {
    const { search, activo, page = 1, pageSize = 50 } = filtros;
    
    if (isOnline()) {
      try {
        let query = supabase.from('proveedores').select('*', { count: 'exact' });
        
        if (activo !== undefined) query = query.eq('activo', activo);
        if (search) {
          query = query.or(`nombre.ilike.%${search}%,nit.ilike.%${search}%`);
        }
        
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('nombre');
        
        const { data, count, error } = await query;
        if (error) throw error;
        
        if (data && data.length > 0) {
          db.proveedores.bulkPut(data).catch(console.error);
        }
        
        return { data, total: count || 0 };
      } catch (error) {
        console.error('Error fetching online suppliers:', error);
      }
    }
    
    let results = await db.proveedores.toArray();
    
    if (activo !== undefined) {
      results = results.filter(p => p.activo === activo);
    }
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(p => 
        (p.nombre && p.nombre.toLowerCase().includes(s)) ||
        (p.nit && p.nit.toLowerCase().includes(s))
      );
    }
    
    results.sort((a, b) => a.nombre.localeCompare(b.nombre));
    const total = results.length;
    const from = (page - 1) * pageSize;
    const data = results.slice(from, from + pageSize);
    
    return { data, total };
  },

  async getById(id) {
    if (isOnline()) {
      try {
        const { data, error } = await supabase
          .from('proveedores')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (data) db.proveedores.put(data).catch(console.error);
        return data;
      } catch (error) {
        console.error('Error fetching supplier by ID:', error);
      }
    }
    return await db.proveedores.get(id);
  },

  async create(data) {
    if (!data.nombre) throw new Error('El nombre es requerido');

    const newSupplier = {
      id: generateUUID(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isOnline()) {
      const { data: inserted, error } = await supabase
        .from('proveedores')
        .insert([newSupplier])
        .select()
        .single();
        
      if (error) throw error;
      await db.proveedores.put(inserted);
      return inserted;
    } else {
      await db.proveedores.put(newSupplier);
      await db.syncQueue.add({
        id: generateUUID(),
        action: 'INSERT',
        table: 'proveedores',
        data: newSupplier,
        created_at: new Date().toISOString()
      });
      Toast.info('Proveedor guardado localmente.');
      return newSupplier;
    }
  },

  async update(id, data) {
    const updatedData = { ...data, updated_at: new Date().toISOString() };
    
    if (isOnline()) {
      const { data: result, error } = await supabase
        .from('proveedores')
        .update(updatedData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      await db.proveedores.put(result);
      return result;
    } else {
      await db.proveedores.update(id, updatedData);
      const p = await db.proveedores.get(id);
      await db.syncQueue.add({
        id: generateUUID(),
        action: 'UPDATE',
        table: 'proveedores',
        record_id: id,
        data: updatedData,
        created_at: new Date().toISOString()
      });
      Toast.info('Proveedor actualizado localmente.');
      return p;
    }
  },

  async delete(id) {
    return this.update(id, { activo: false });
  },

  async getProductos(proveedorId) {
    if (isOnline()) {
      const { data, error } = await supabase
        .from('productos')
        .select('*, categorias(nombre)')
        .eq('proveedor_id', proveedorId)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
    const data = await db.productos.where({ proveedor_id: proveedorId, activo: true }).toArray();
    return data;
  }
};
