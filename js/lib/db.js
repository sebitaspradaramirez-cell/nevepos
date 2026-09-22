// Dexie is loaded via CDN and available globally
export const db = new window.Dexie('NevePOS_DB');

db.version(1).stores({
    productos: 'id, codigo_barras, sku, nombre, categoria_id, activo',
    categorias: 'id, nombre, activo',
    clientes: 'id, nombre, documento',
    proveedores: 'id, nombre, activo',
    ventas: 'id, numero_venta, sync_id, fecha, estado, usuario_id',
    detalle_ventas: 'id, venta_id, producto_id',
    turnos_caja: 'id, numero_caja, usuario_id, estado',
    movimientos_caja: 'id, turno_caja_id',
    syncQueue: '++id, tabla, operacion, datos, timestamp, intentos, estado',
    meta: 'id'
});

export const clearAllData = async () => {
    try {
        await Promise.all(db.tables.map(table => table.clear()));
    } catch (error) {
        console.error('Error clearing database:', error);
        throw error;
    }
};

export const getLastSyncTime = async (tabla) => {
    try {
        const record = await db.meta.get(tabla);
        return record ? record.timestamp : null;
    } catch (error) {
        console.error(`Error getting last sync time for ${tabla}:`, error);
        return null;
    }
};

export const seedInitialData = async () => {
    try {
        const prodCount = await db.productos.count();
        if (prodCount === 0) {
            const initialCategorias = [
                { id: 'cat-1', nombre: 'Cuadernos', activo: 1 },
                { id: 'cat-2', nombre: 'Esferos y Bolígrafos', activo: 1 },
                { id: 'cat-3', nombre: 'Resmas de Papel', activo: 1 },
                { id: 'cat-4', nombre: 'Pinturas', activo: 1 },
                { id: 'cat-5', nombre: 'Marcadores', activo: 1 },
                { id: 'cat-6', nombre: 'Gaseosas y Bebidas', activo: 1 },
                { id: 'cat-7', nombre: 'Servicios', activo: 1 }
            ];
            await db.categorias.bulkPut(initialCategorias);

            const initialProductos = [
                { id: 'prod-1', nombre: 'Cuaderno Cuadriculado 100 Hojas', codigo_barras: '7701234567890', sku: 'CUA-100-C', categoria_id: 'cat-1', precio_venta: 4500, precio_costo: 3000, stock_actual: 50, stock_minimo: 10, activo: 1 },
                { id: 'prod-2', nombre: 'Cuaderno Ferrocarril 100 Hojas', codigo_barras: '7701234567891', sku: 'CUA-100-F', categoria_id: 'cat-1', precio_venta: 4500, precio_costo: 3000, stock_actual: 40, stock_minimo: 10, activo: 1 },
                { id: 'prod-3', nombre: 'Bolígrafo Kilométrico Negro', codigo_barras: '7701234567892', sku: 'BOL-KIL-N', categoria_id: 'cat-2', precio_venta: 1500, precio_costo: 800, stock_actual: 120, stock_minimo: 20, activo: 1 },
                { id: 'prod-4', nombre: 'Bolígrafo Kilométrico Azul', codigo_barras: '7701234567893', sku: 'BOL-KIL-A', categoria_id: 'cat-2', precio_venta: 1500, precio_costo: 800, stock_actual: 100, stock_minimo: 20, activo: 1 },
                { id: 'prod-5', nombre: 'Resma Papel Carta Reprograf 75g', codigo_barras: '7701234567894', sku: 'RES-CAR-75', categoria_id: 'cat-3', precio_venta: 18500, precio_costo: 14000, stock_actual: 25, stock_minimo: 5, activo: 1 },
                { id: 'prod-6', nombre: 'Resma Papel Oficio Reprograf 75g', codigo_barras: '7701234567895', sku: 'RES-OFI-75', categoria_id: 'cat-3', precio_venta: 21000, precio_costo: 16500, stock_actual: 20, stock_minimo: 5, activo: 1 },
                { id: 'prod-7', nombre: 'Marcador Borrable Sharpie Negro', codigo_barras: '7701234567896', sku: 'MAR-BOR-N', categoria_id: 'cat-5', precio_venta: 3800, precio_costo: 2400, stock_actual: 35, stock_minimo: 8, activo: 1 },
                { id: 'prod-8', nombre: 'Coca Cola 400ml Pet', codigo_barras: '7701234567897', sku: 'BEB-CC-400', categoria_id: 'cat-6', precio_venta: 3000, precio_costo: 2100, stock_actual: 48, stock_minimo: 12, activo: 1 },
                { id: 'prod-9', nombre: 'Postobón Manzana 400ml Pet', codigo_barras: '7701234567898', sku: 'BEB-PM-400', categoria_id: 'cat-6', precio_venta: 2800, precio_costo: 1900, stock_actual: 36, stock_minimo: 12, activo: 1 },
                { id: 'prod-10', nombre: 'Fotocopia Blanco y Negro', codigo_barras: 'SRV-001', sku: 'SRV-FOTO-BN', categoria_id: 'cat-7', precio_venta: 200, precio_costo: 50, stock_actual: 9999, stock_minimo: 0, activo: 1 },
                { id: 'prod-11', nombre: 'Impresión Color Carta', codigo_barras: 'SRV-002', sku: 'SRV-IMP-COL', categoria_id: 'cat-7', precio_venta: 1000, precio_costo: 300, stock_actual: 9999, stock_minimo: 0, activo: 1 }
            ];
            await db.productos.bulkPut(initialProductos);

            const initialClientes = [
                { id: 'cli-1', nombre: 'Cliente Mostrador', documento: '222222222222', telefono: '', email: '' }
            ];
            await db.clientes.bulkPut(initialClientes);
        }
    } catch (err) {
        console.warn('Could not seed initial data in Dexie:', err);
    }
};

// Seed initial data asynchronously on load
seedInitialData();

