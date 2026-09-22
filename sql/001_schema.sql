-- 001_schema.sql
-- Extension para UUIDs (normalmente habilitada por defecto en Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT UNIQUE NOT NULL CHECK (nombre IN ('administrador', 'cajero')),
    permisos JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id),
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    rol_id UUID REFERENCES roles(id),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT UNIQUE NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    nit TEXT,
    contacto TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_barras TEXT UNIQUE,
    sku TEXT UNIQUE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria_id UUID REFERENCES categorias(id),
    proveedor_id UUID REFERENCES proveedores(id),
    precio_venta NUMERIC(12,0) NOT NULL CHECK (precio_venta >= 0),
    precio_costo NUMERIC(12,0) DEFAULT 0 CHECK (precio_costo >= 0),
    stock_actual INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 5,
    unidad_medida TEXT DEFAULT 'unidad',
    imagen_url TEXT,
    activo BOOLEAN DEFAULT true,
    variantes JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    documento TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE turnos_caja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_caja INTEGER NOT NULL CHECK (numero_caja BETWEEN 1 AND 10),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    monto_apertura NUMERIC(12,0) NOT NULL DEFAULT 0,
    monto_cierre NUMERIC(12,0),
    ventas_efectivo NUMERIC(12,0) DEFAULT 0,
    ventas_transferencia NUMERIC(12,0) DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
    apertura TIMESTAMPTZ DEFAULT now(),
    cierre TIMESTAMPTZ
);

CREATE TABLE ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_venta TEXT UNIQUE NOT NULL,
    cliente_id UUID REFERENCES clientes(id),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    turno_caja_id UUID REFERENCES turnos_caja(id),
    subtotal NUMERIC(12,0) NOT NULL DEFAULT 0,
    descuento NUMERIC(12,0) DEFAULT 0,
    impuesto NUMERIC(12,0) DEFAULT 0,
    total NUMERIC(12,0) NOT NULL DEFAULT 0,
    metodo_pago TEXT NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo', 'transferencia', 'mixto')),
    estado TEXT NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada', 'anulada', 'pendiente')),
    notas TEXT,
    sync_id TEXT UNIQUE,
    fecha TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE detalle_ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,0) NOT NULL,
    descuento NUMERIC(12,0) DEFAULT 0,
    subtotal NUMERIC(12,0) NOT NULL
);

CREATE TABLE compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_compra TEXT UNIQUE NOT NULL,
    proveedor_id UUID REFERENCES proveedores(id),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    total NUMERIC(12,0) NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida', 'pendiente', 'anulada')),
    notas TEXT,
    fecha TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE detalle_compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,0) NOT NULL,
    subtotal NUMERIC(12,0) NOT NULL
);

CREATE TABLE movimientos_inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES productos(id),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'venta', 'devolucion', 'compra')),
    cantidad INTEGER NOT NULL,
    stock_anterior INTEGER NOT NULL,
    stock_nuevo INTEGER NOT NULL,
    referencia TEXT,
    notas TEXT,
    fecha TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE movimientos_caja (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno_caja_id UUID NOT NULL REFERENCES turnos_caja(id),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'venta')),
    monto NUMERIC(12,0) NOT NULL,
    concepto TEXT NOT NULL,
    fecha TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuarios(id),
    accion TEXT NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
    tabla TEXT NOT NULL,
    registro_id UUID,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    fecha TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX idx_productos_nombre ON productos(nombre);
CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras);
CREATE INDEX idx_productos_sku ON productos(sku);
CREATE INDEX idx_productos_categoria_id ON productos(categoria_id);

CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_numero_venta ON ventas(numero_venta);
CREATE INDEX idx_ventas_usuario_id ON ventas(usuario_id);

CREATE INDEX idx_clientes_nombre ON clientes(nombre);
CREATE INDEX idx_clientes_documento ON clientes(documento);

CREATE INDEX idx_movimientos_inventario_producto_id ON movimientos_inventario(producto_id);

CREATE INDEX idx_audit_log_tabla_registro ON audit_log(tabla, registro_id);
