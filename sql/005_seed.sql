-- 005_seed.sql

-- 1. Insertar roles
INSERT INTO roles (nombre, permisos) VALUES 
('administrador', '{"pos": true, "productos": true, "inventario": true, "clientes": true, "proveedores": true, "compras": true, "reportes": true, "usuarios": true, "configuracion": true, "caja": true}'::jsonb),
('cajero', '{"pos": true, "productos": false, "inventario": false, "clientes": true, "proveedores": false, "compras": false, "reportes": false, "usuarios": false, "configuracion": false, "caja": true}'::jsonb)
ON CONFLICT (nombre) DO UPDATE SET permisos = EXCLUDED.permisos;

-- 2. Insertar categorias
INSERT INTO categorias (nombre, descripcion) VALUES
('Cuadernos', 'Cuadernos argollados, cosidos, grapados de diferentes tamaños'),
('Esferos y Bolígrafos', 'Bolígrafos de diferentes colores y marcas'),
('Resmas de Papel', 'Papel tamaño carta, oficio, carta y especiales'),
('Pinturas', 'Acuarelas, vinilos, témperas y acrílicos'),
('Marcadores', 'Marcadores permanentes, borrables y resaltadores'),
('Carpetas y Folders', 'Carpetas de cartón, plástico y archivadores'),
('Pegamentos y Adhesivos', 'Colbón, pegante en barra, cintas adhesivas'),
('Tijeras', 'Tijeras escolares y de oficina'),
('Reglas y Escuadras', 'Reglas plásticas, metálicas y transportadores'),
('Lápices', 'Lápices negros, rojos y de colores'),
('Borradores y Correctores', 'Borradores de nata, miga de pan y correctores líquidos/cinta'),
('Calculadoras', 'Calculadoras básicas y científicas'),
('Papel y Cartulinas', 'Pliegos y octavos de cartulina, papel seda, papel kraft'),
('Accesorios de Oficina', 'Clips, ganchos, cosedoras, perforadoras'),
('Servicios', 'Fotocopias, impresiones, escáner, anillado, laminado'),
('Gaseosas y Bebidas', 'Bebidas refrescantes y snacks para venta rápida')
ON CONFLICT (nombre) DO NOTHING;

/*
NOTA SOBRE EL USUARIO ADMINISTRADOR INICIAL:
El usuario administrador debe crearse primero a través de Supabase Auth 
(ya sea desde el Dashboard de Supabase o usando la API).
Una vez creado el usuario en auth.users, debe ejecutarse un query como este 
para enlazarlo en la tabla 'usuarios' con el rol de administrador:

INSERT INTO usuarios (auth_user_id, nombre, email, rol_id)
VALUES (
    'UUID_DEL_USUARIO_EN_AUTH', 
    'Nombre del Administrador', 
    'admin@nevepos.com', 
    (SELECT id FROM roles WHERE nombre = 'administrador')
);
*/
