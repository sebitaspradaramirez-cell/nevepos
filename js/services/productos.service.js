import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline, generateUUID } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';

export const ProductosService = {
  async getAll(filtros = {}) {
    const { categoria_id, activo, search, page = 1, pageSize = 50 } = filtros;
    
    if (isOnline()) {
      try {
        let query = supabase.from('productos').select(`
          *,
          categorias (nombre),
          proveedores (nombre)
        `, { count: 'exact' });
        
        if (categoria_id) query = query.eq('categoria_id', categoria_id);
        if (activo !== undefined) query = query.eq('activo', activo);
        if (search) {
          query = query.or(`nombre.ilike.%${search}%,codigo_barras.ilike.%${search}%,sku.ilike.%${search}%`);
        }
        
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('nombre');
        
        const { data, count, error } = await query;
        if (error) throw error;
        
        // Background sync to IndexedDB
        if (data && data.length > 0) {
          db.productos.bulkPut(data).catch(console.error);
        }
        
        return { data, total: count || 0 };
      } catch (error) {
        console.error('Error fetching online products:', error);
        // Fallback to IndexedDB
      }
    }
    
    // IndexedDB
    let collection = db.productos;
    if (categoria_id) {
      collection = collection.where('categoria_id').equals(categoria_id);
    }
    
    let results = await collection.toArray();
    
    if (activo !== undefined) {
      results = results.filter(p => p.activo === activo);
    }
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(p => 
        (p.nombre && p.nombre.toLowerCase().includes(s)) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase().includes(s)) ||
        (p.sku && p.sku.toLowerCase().includes(s))
      );
    }
    
    // Manual sorting and pagination
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
          .from('productos')
          .select('*, categorias(nombre), proveedores(nombre)')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (data) db.productos.put(data).catch(console.error);
        return data;
      } catch (error) {
        console.error('Error fetching product by ID:', error);
      }
    }
    return await db.productos.get(id);
  },

  async create(data) {
    if (!data.nombre || data.precio_venta === undefined) {
      throw new Error('Nombre y precio de venta son requeridos');
    }

    const newProduct = {
      id: generateUUID(),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isOnline()) {
      const { data: inserted, error } = await supabase
        .from('productos')
        .insert([newProduct])
        .select()
        .single();
        
      if (error) throw error;
      await db.productos.put(inserted);
      return inserted;
    } else {
      await db.productos.put(newProduct);
      await db.syncQueue.add({
        id: generateUUID(),
        action: 'INSERT',
        table: 'productos',
        data: newProduct,
        created_at: new Date().toISOString()
      });
      Toast.info('Guardado localmente. Se sincronizará cuando haya conexión.');
      return newProduct;
    }
  },

  async update(id, data) {
    const updatedData = { ...data, updated_at: new Date().toISOString() };
    
    if (isOnline()) {
      const { data: result, error } = await supabase
        .from('productos')
        .update(updatedData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      await db.productos.put(result);
      return result;
    } else {
      await db.productos.update(id, updatedData);
      const prod = await db.productos.get(id);
      await db.syncQueue.add({
        id: generateUUID(),
        action: 'UPDATE',
        table: 'productos',
        record_id: id,
        data: updatedData,
        created_at: new Date().toISOString()
      });
      Toast.info('Actualizado localmente. Se sincronizará cuando haya conexión.');
      return prod;
    }
  },

  async delete(id) {
    return this.update(id, { activo: false });
  },

  async search(query) {
    if (!query) return [];
    const s = query.toLowerCase();
    
    // Quick search in IndexedDB for POS (<100ms)
    let results = await db.productos
      .filter(p => p.activo && (
        (p.nombre && p.nombre.toLowerCase().includes(s)) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase() === s) ||
        (p.sku && p.sku.toLowerCase() === s)
      ))
      .limit(20)
      .toArray();

    // If online and we have few matches, try to augment from server
    if (isOnline() && results.length < 5) {
      try {
        const { data, error } = await supabase
          .from('productos')
          .select('*')
          .eq('activo', true)
          .or(`nombre.ilike.%${query}%,codigo_barras.eq.${query},sku.eq.${query}`)
          .limit(20);
          
        if (!error && data) {
          data.forEach(d => db.productos.put(d).catch(()=>{}));
          results = data;
        }
      } catch (e) {
        console.error('Fast search online fallback failed:', e);
      }
    }
    
    return results;
  },

  async getStockBajo() {
    if (isOnline()) {
      try {
        const { data, error } = await supabase.rpc('get_productos_stock_bajo');
        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error in getStockBajo RPC', error);
      }
    }
    
    // Offline fallback
    const all = await db.productos.where('activo').equals('true').toArray() || [];
    // If Dexie doesn't support boolean index perfectly, filter manually
    const active = all.filter(p => p.activo === true || p.activo === 'true' || p.activo === 1);
    return active.filter(p => p.stock_actual <= (p.stock_minimo || 5)).sort((a,b) => (a.stock_actual - a.stock_minimo) - (b.stock_actual - b.stock_minimo));
  },

  async getByCategoriaId(categoriaId) {
    return this.getAll({ categoria_id: categoriaId, activo: true, pageSize: 1000 });
  },

  async getCategories() {
    if (isOnline()) {
      try {
        const { data, error } = await supabase.from('categorias').select('*').order('nombre');
        if (error) throw error;
        await db.categorias.bulkPut(data);
        return data;
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    }
    return await db.categorias.toArray();
  },

  async syncFromServer() {
    if (!isOnline()) return;
    try {
      const { data, error } = await supabase.from('productos').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        await db.productos.clear();
        await db.productos.bulkPut(data);
      }
    } catch (error) {
      console.error('Error syncing products:', error);
    }
  }
};
