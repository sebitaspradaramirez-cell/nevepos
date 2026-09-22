import { supabase } from './supabase.js';

let currentUser = null;
let pendingMfa = null;
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
        const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance?.currentLevel === 'aal2' || assurance?.nextLevel !== 'aal2') {
            await fetchUserRole(session.user.id, session.user.email);
        }
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

        if (error) {
            if (error.code === 'PGRST116') {
                throw new Error('El usuario de Supabase no está vinculado en la tabla usuarios. Ejecuta el INSERT con su auth_user_id.');
            }
            throw error;
        }

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
        throw err;
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

        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const verifiedFactor = factorsData?.totp?.find(factor => factor.status === 'verified');
        if (verifiedFactor) {
            const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
                factorId: verifiedFactor.id
            });
            if (challengeError) throw challengeError;
            pendingMfa = { factorId: verifiedFactor.id, challengeId: challenge.id, email };
            return { requiresMfa: true };
        }

        const user = await fetchUserRole(data.user.id, data.user.email);
        if (!user) {
            throw new Error('No se pudo cargar el perfil del usuario.');
        }
        return user;
    } catch (error) {
        throw error;
    }
};

export const verifyMfaLogin = async (code) => {
    if (!pendingMfa) throw new Error('No hay una verificación 2FA pendiente.');
    const { error } = await supabase.auth.mfa.verify({
        factorId: pendingMfa.factorId,
        challengeId: pendingMfa.challengeId,
        code: code.trim()
    });
    if (error) throw error;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = await fetchUserRole(sessionData.session.user.id, sessionData.session.user.email);
    pendingMfa = null;
    return user;
};

export const enrollMfa = async (friendlyName = 'NevePOS') => {
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName
    });
    if (error) throw error;
    return data;
};

export const verifyMfaEnrollment = async (factorId, code) => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;
    const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim()
    });
    if (error) throw error;
};

export const listMfaFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data?.totp || [];
};

export const unenrollMfa = async (factorId) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
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
    verifyMfaLogin,
    enrollMfa,
    verifyMfaEnrollment,
    listMfaFactors,
    unenrollMfa,
    getSession: async () => currentUser
};

