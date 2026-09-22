-- 002_rls_policies.sql

-- Helper function to get the role of the current authenticated user
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT r.nombre
  FROM public.usuarios u
  JOIN public.roles r ON u.rol_id = r.id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- Enable RLS on all tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 1. Admin Policies: Full CRUD on all tables
CREATE POLICY admin_all_roles ON roles FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_usuarios ON usuarios FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_categorias ON categorias FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_proveedores ON proveedores FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_productos ON productos FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_clientes ON clientes FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_turnos_caja ON turnos_caja FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_ventas ON ventas FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_detalle_ventas ON detalle_ventas FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_compras ON compras FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_detalle_compras ON detalle_compras FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_movimientos_inventario ON movimientos_inventario FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_movimientos_caja ON movimientos_caja FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');
CREATE POLICY admin_all_audit_log ON audit_log FOR ALL USING ((SELECT public.get_user_role()) = 'administrador');

-- 2. Cajero Policies
-- SELECT on productos, categorias, proveedores, clientes
CREATE POLICY cajero_select_productos ON productos FOR SELECT USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_select_categorias ON categorias FOR SELECT USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_select_proveedores ON proveedores FOR SELECT USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_select_clientes ON clientes FOR SELECT USING ((SELECT public.get_user_role()) = 'cajero');

-- INSERT/UPDATE on ventas, detalle_ventas, clientes
CREATE POLICY cajero_insert_ventas ON ventas FOR INSERT WITH CHECK ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_update_ventas ON ventas FOR UPDATE USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_insert_detalle_ventas ON detalle_ventas FOR INSERT WITH CHECK ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_update_detalle_ventas ON detalle_ventas FOR UPDATE USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_insert_clientes ON clientes FOR INSERT WITH CHECK ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_update_clientes ON clientes FOR UPDATE USING ((SELECT public.get_user_role()) = 'cajero');

-- SELECT/INSERT on movimientos_caja, movimientos_inventario
CREATE POLICY cajero_select_movimientos_caja ON movimientos_caja FOR SELECT USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_insert_movimientos_caja ON movimientos_caja FOR INSERT WITH CHECK ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_select_movimientos_inventario ON movimientos_inventario FOR SELECT USING ((SELECT public.get_user_role()) = 'cajero');
CREATE POLICY cajero_insert_movimientos_inventario ON movimientos_inventario FOR INSERT WITH CHECK ((SELECT public.get_user_role()) = 'cajero');

-- SELECT/INSERT/UPDATE on turnos_caja (own records only)
CREATE POLICY cajero_select_turnos_caja ON turnos_caja FOR SELECT USING (
    (SELECT public.get_user_role()) = 'cajero' AND 
    usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY cajero_insert_turnos_caja ON turnos_caja FOR INSERT WITH CHECK (
    (SELECT public.get_user_role()) = 'cajero' AND 
    usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY cajero_update_turnos_caja ON turnos_caja FOR UPDATE USING (
    (SELECT public.get_user_role()) = 'cajero' AND 
    usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
);

-- SELECT on own usuario record
CREATE POLICY cajero_select_usuarios ON usuarios FOR SELECT USING (
    (SELECT public.get_user_role()) = 'cajero' AND 
    auth_user_id = auth.uid()
);
