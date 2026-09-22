import { CONFIG } from '../config.js';

let client = null;
try {
    if (window.supabase && CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')) {
        client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn('Supabase client failed to initialize with provided credentials:', e);
}

if (!client) {
    // Fallback safe client for offline / demo mode
    client = {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            signInWithPassword: async () => { throw new Error('Supabase no está configurado. Ingrese con Modo Demo / Offline.'); },
            signOut: async () => ({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({ data: null, error: new Error('Modo sin conexión') }),
                    data: []
                }),
                data: []
            }),
            insert: async () => ({ error: null }),
            update: async () => ({ error: null }),
            upsert: async () => ({ error: null })
        }),
        rpc: async () => ({ data: null, error: new Error('RPC offline') })
    };
}

export const supabase = client;

