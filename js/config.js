// Configuration for NevePOS
export const CONFIG = {
    // Supabase - replace with your project values
    SUPABASE_URL: 'https://sfywjyyxrkgpkkivatun.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeXdqeXl4cmtncGtraXZhdHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjIyNTgsImV4cCI6MjEwNTMzODI1OH0.uRDsA98QD5Hoc9PKamFgSyPOnt2y8kMBE8NpB6BZJVI',
    
    // App
    APP_NAME: 'NevePOS',
    APP_VERSION: '1.0.0',
    MONEDA: 'COP',
    IVA_PORCENTAJE: 0, // 0 = precio final incluye IVA, 19 = se calcula aparte
    NUMERO_CAJA: 1,
    
    // Offline
    OFFLINE_ENABLED: true,
    SYNC_INTERVAL_MS: 30000, // 30 seconds
    MAX_SYNC_RETRIES: 5,
    
    // UI
    ITEMS_PER_PAGE: 20,
    TOAST_DURATION_MS: 3000,
    SEARCH_DEBOUNCE_MS: 300,
};
