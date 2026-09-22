import { supabase } from './supabase.js';

let currentUser = null;
const SESSION_KEY = 'nevepos_user';
const listeners = new Set();

const loadCachedUser = () => {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
        try {
            currentUser = JSON.parse(cached);
        } catch (e) {
            console.error('Error parsing cached user', e);
        }
    }
};

const notifyListeners = () => {
    listeners.forEach(callback => callback(currentUser));
};

// Initialize from cache
loadCachedUser();

supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
        currentUser = null;
        sessionStorage.removeItem(SESSION_KEY);
        notifyListeners();
    } else if (session?.user && !currentUser) {
        // Just token refresh or initial load, we might need to fetch the role if missing
        await fetchUserRole(session.user.id, session.user.email);
    }
});

const fetchUserRole = async (userId, email) => {
    try {
        if (!navigator.onLine) {
            // If offline, rely on cached user
            return currentUser;
        }

        const { data, error } = await supabase
            .from('usuarios')
            .select(`
                id,
                nombre,
                email,
                rol:roles (
                    nombre,
                    permisos
                )
            `)
            .eq('auth_user_id', userId)
            .single();

        if (error) throw error;

        currentUser = {
            id: data.id,
            nombre: data.nombre,
            email: data.email,
            rol: data.rol
        };

        sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
        notifyListeners();
        return currentUser;
    } catch (err) {
        console.error('Error fetching user role:', err);
        return null;
    }
};

export const login = async (email, password) => {
    try {
        if (!navigator.onLine) {
            // Offline login check
            if (currentUser && currentUser.email === email) {
                // Warning: Can't verify password offline in a completely secure way without proper hashing,
                // but for this PWA we rely on cached session. This is a simplified offline login.
                return currentUser;
            }
            throw new Error('No hay conexión para verificar credenciales y no hay sesión activa.');
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        return await fetchUserRole(data.user.id, data.user.email);
    } catch (error) {
        throw error;
    }
};

export const logout = async () => {
    try {
        if (navigator.onLine) {
            await supabase.auth.signOut();
        }
        currentUser = null;
        sessionStorage.removeItem(SESSION_KEY);
        notifyListeners();
    } catch (error) {
        console.error('Logout error:', error);
    }
};

export const getCurrentUser = () => currentUser;

export const isAuthenticated = () => !!currentUser;

export const hasPermission = (modulo) => {
    if (!currentUser || !currentUser.rol || !currentUser.rol.permisos) return false;
    return currentUser.rol.permisos[modulo] === true || currentUser.rol.permisos['admin'] === true;
};

export const requireAuth = () => {
    if (!isAuthenticated()) {
        window.location.hash = '#/login';
        return false;
    }
    return true;
};

export const requirePermission = (modulo) => {
    if (!hasPermission(modulo)) {
        window.location.hash = '#/';
        return false;
    }
    return true;
};

export const onAuthStateChange = (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
};

export const setDemoUser = (rolNombre = 'administrador') => {
    currentUser = {
        id: '00000000-0000-0000-0000-000000000001',
        nombre: 'Administrador Demo',
        email: 'admin@nevepos.local',
        rol: {
            nombre: rolNombre,
            permisos: {
                pos: true,
                caja: true,
                productos: true,
                inventario: true,
                clientes: true,
                proveedores: true,
                compras: true,
                reportes: true,
                usuarios: true,
                configuracion: true,
                admin: true
            }
        }
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    notifyListeners();
    return currentUser;
};



export const Auth = {
    login,
    logout,
    getCurrentUser,
    isAuthenticated,
    hasPermission,
    requireAuth,
    requirePermission,
    onAuthStateChange,
    setDemoUser,
    getSession: async () => currentUser
};

