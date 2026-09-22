import { supabase } from '../lib/supabase.js';

class UsuariosService {
    async getAll() {
        const { data, error } = await supabase.from('usuarios').select('*, roles(nombre)');
        if (error) throw error;
        return data;
    }

    async getById(id) {
        const { data, error } = await supabase.from('usuarios').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    }

    async create(userData) {
        // 1. Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: userData.email,
            password: userData.password
        });
        
        if (authError) throw authError;

        // 2. Create profile
        const { data, error } = await supabase.from('usuarios').insert([{
            id: authData.user.id,
            nombre: userData.nombre,
            rol_id: userData.rol_id,
            activo: userData.activo ?? true
        }]);
        
        if (error) throw error;
        return data;
    }

    async update(id, userData) {
        const { data, error } = await supabase.from('usuarios').update(userData).eq('id', id);
        if (error) throw error;
        return data;
    }

    async toggleActive(id) {
        const user = await this.getById(id);
        return this.update(id, { activo: !user.activo });
    }

    async getRoles() {
        const { data, error } = await supabase.from('roles').select('*');
        if (error) throw error;
        return data;
    }

    async getAuditLog(filtros = {}) {
        let query = supabase.from('auditoria').select('*, usuarios(nombre)').order('fecha', { ascending: false }).limit(50);
        if (filtros.usuario_id) query = query.eq('usuario_id', filtros.usuario_id);
        if (filtros.tabla) query = query.eq('tabla', filtros.tabla);
        
        const { data, error } = await query;
        if (error) throw error;
        return data;
    }
}

export const usuariosService = new UsuariosService();
