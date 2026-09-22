import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline, generateUUID } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';

export const ClientesService = {
  async getAll(filtros = {}) {
    const { search, page = 1, pageSize = 50 } = filtros;
    
    if (isOnline()) {
      try {
        let query = supabase.from('clientes').select('*', { count: 'exact' });
        
        if (search) {
          query = query.or(`nombre.ilike.%${search}%,documento.ilike.%${search}%`);
        }
        
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('nombre');
        
        const { data, count, error } = await query;
        if (error) throw error;
        
        if (data && data.length > 0) {
          db.clientes.bulkPut(data).catch(console.error);
        }
        
        return { data, total: count || 0 };
      } catch (error) {
        console.error('Error fetching online clients:', error);
      }
    }
    
    let results = await db.clientes.toArray();
    
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(c => 
        (c.nombre && c.nombre.toLowerCase().includes(s)) ||
        (c.documento && c.documento.toLowerCase().includes(s))
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
          .from('clientes')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (data) db.clientes.put(data).catch(console.error);
        return data;
      } catch (error) {
        console.error('Error fetching client by ID:', error);
      }
    }
    return await db.clientes.get(id);
  },

  async create(data) {
    if (!data.nombre) throw new Error('El nombre es requerido');

    const newClient = {
      id: generateUUID(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isOnline()) {
      const { data: inserted, error } = await supabase
        .from('clientes')
        .insert([newClient])
        .select()
        .single();
        
      if (error) throw error;
      await db.clientes.put(inserted);
      return inserted;
    } else {
      await db.clientes.put(newClient);
      await db.syncQueue.add({
        id: generateUUID(),
        action: 'INSERT',
        table: 'clientes',
        data: newClient,
        created_at: new Date().toISOString()
      });
      Toast.info('Cliente guardado localmente.');
      return newClient;
    }
  },

  async update(id, data) {
    const updatedData = { ...data, updated_at: new Date().toISOString() };
    
    if (isOnline()) {
      const { data: result, error } = await supabase
        .from('clientes')
        .update(updatedData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      await db.clientes.put(result);
      return result;
    } else {
      await db.clientes.update(id, updatedData);
      const c = await db.clientes.get(id);
      await db.syncQueue.add({
        id: generateUUID(),
        action: 'UPDATE',
        table: 'clientes',
        record_id: id,
        data: updatedData,
        created_at: new Date().toISOString()
      });
      Toast.info('Cliente actualizado localmente.');
      return c;
    }
  },

  async search(query) {
    if (!query) return [];
    const s = query.toLowerCase();
    
    let results = await db.clientes
      .filter(c => 
        (c.nombre && c.nombre.toLowerCase().includes(s)) ||
        (c.documento && c.documento.toLowerCase().includes(s))
      )
      .limit(10)
      .toArray();

    if (isOnline() && results.length < 5) {
      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('*')
          .or(`nombre.ilike.%${query}%,documento.ilike.%${query}%`)
          .limit(10);
          
        if (!error && data) {
          data.forEach(d => db.clientes.put(d).catch(()=>{}));
          results = data;
        }
      } catch (e) {
        console.error('Fast search online fallback failed:', e);
      }
    }
    return results;
  },

  async getHistorial(clienteId) {
    if (!isOnline()) throw new Error('Se requiere conexión para ver el historial');
    
    const { data, error } = await supabase
      .from('ventas')
      .select('*, usuarios(nombre)')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false });
      
    if (error) throw error;
    return data;
  },

  async syncFromServer() {
    if (!isOnline()) return;
    try {
      const { data, error } = await supabase.from('clientes').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        await db.clientes.clear();
        await db.clientes.bulkPut(data);
      }
    } catch (error) {
      console.error('Error syncing clients:', error);
    }
  }
};
