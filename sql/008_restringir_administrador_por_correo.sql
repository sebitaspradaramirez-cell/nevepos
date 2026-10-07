CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) = 'natalypradaramirez@gmail.com'
            THEN 'administrador'
        ELSE 'cajero'
    END
    FROM public.usuarios AS u
    WHERE u.auth_user_id = auth.uid()
      AND u.activo = true
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

UPDATE public.roles
SET permisos = '{"pos": true, "caja": true, "productos": false, "inventario": false, "clientes": false, "proveedores": false, "compras": false, "reportes": false, "usuarios": false, "configuracion": false, "admin": false}'::jsonb
WHERE nombre = 'cajero';

DROP POLICY IF EXISTS cajero_insert_ventas ON public.ventas;
DROP POLICY IF EXISTS cajero_update_ventas ON public.ventas;
DROP POLICY IF EXISTS cajero_insert_detalle_ventas ON public.detalle_ventas;
DROP POLICY IF EXISTS cajero_update_detalle_ventas ON public.detalle_ventas;
DROP POLICY IF EXISTS cajero_update_turnos_caja ON public.turnos_caja;
DROP POLICY IF EXISTS cajero_insert_clientes ON public.clientes;
DROP POLICY IF EXISTS cajero_update_clientes ON public.clientes;
DROP POLICY IF EXISTS cajero_insert_movimientos_caja ON public.movimientos_caja;
DROP POLICY IF EXISTS cajero_insert_movimientos_inventario ON public.movimientos_inventario;

CREATE OR REPLACE FUNCTION public.registrar_venta(
    p_items JSONB,
    p_cliente_id UUID,
    p_metodo_pago TEXT,
    p_descuento NUMERIC,
    p_notas TEXT,
    p_turno_caja_id UUID,
    p_sync_id TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venta_id UUID;
    v_numero_venta TEXT;
    v_usuario_id UUID;
    v_rol TEXT;
    v_subtotal NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_producto_id UUID;
    v_cantidad INTEGER;
    v_precio_unitario NUMERIC;
    v_item_subtotal NUMERIC;
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
BEGIN
    v_rol := public.get_user_role();
    IF COALESCE(v_rol, '') NOT IN ('administrador', 'cajero') THEN
        RAISE EXCEPTION 'Usuario sin permiso para registrar ventas' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND activo = true;
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo';
    END IF;

    IF v_rol = 'cajero' AND NOT EXISTS (
        SELECT 1 FROM public.turnos_caja
        WHERE id = p_turno_caja_id AND usuario_id = v_usuario_id AND estado = 'abierto'
    ) THEN
        RAISE EXCEPTION 'El cajero solo puede vender en su turno abierto' USING ERRCODE = '42501';
    END IF;

    v_numero_venta := public.generar_numero_venta();

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_subtotal := v_subtotal + (CAST(v_item->>'cantidad' AS INTEGER) * CAST(v_item->>'precio_unitario' AS NUMERIC));
    END LOOP;

    v_total := v_subtotal - COALESCE(p_descuento, 0);

    INSERT INTO public.ventas (
        numero_venta, cliente_id, usuario_id, turno_caja_id,
        subtotal, descuento, total, metodo_pago, notas, sync_id
    ) VALUES (
        v_numero_venta, p_cliente_id, v_usuario_id, p_turno_caja_id,
        v_subtotal, p_descuento, v_total, p_metodo_pago, p_notas, p_sync_id
    ) RETURNING id INTO v_venta_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := CAST(v_item->>'producto_id' AS UUID);
        v_cantidad := CAST(v_item->>'cantidad' AS INTEGER);
        v_precio_unitario := CAST(v_item->>'precio_unitario' AS NUMERIC);
        v_item_subtotal := v_cantidad * v_precio_unitario;

        INSERT INTO public.detalle_ventas (
            venta_id, producto_id, cantidad, precio_unitario, subtotal
        ) VALUES (
            v_venta_id, v_producto_id, v_cantidad, v_precio_unitario, v_item_subtotal
        );

        SELECT stock_actual INTO v_stock_anterior
        FROM public.productos WHERE id = v_producto_id FOR UPDATE;
        IF v_stock_anterior IS NULL OR v_stock_anterior < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para el producto %', v_producto_id;
        END IF;
        v_stock_nuevo := v_stock_anterior - v_cantidad;

        UPDATE public.productos SET stock_actual = v_stock_nuevo WHERE id = v_producto_id;

        INSERT INTO public.movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia
        ) VALUES (
            v_producto_id, v_usuario_id, 'venta', v_cantidad, v_stock_anterior, v_stock_nuevo, v_venta_id::TEXT
        );
    END LOOP;

    IF p_turno_caja_id IS NOT NULL THEN
        INSERT INTO public.movimientos_caja (
            turno_caja_id, usuario_id, tipo, monto, concepto
        ) VALUES (
            p_turno_caja_id, v_usuario_id, 'venta', v_total, 'Venta ' || v_numero_venta
        );
    END IF;

    RETURN v_venta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_venta(p_venta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_item RECORD;
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
    v_estado_actual TEXT;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede anular ventas' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid() AND activo = true;
    SELECT estado INTO v_estado_actual FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
    IF v_estado_actual IS NULL THEN
        RAISE EXCEPTION 'Venta no encontrada';
    END IF;
    IF v_estado_actual = 'anulada' THEN
        RAISE EXCEPTION 'La venta ya se encuentra anulada';
    END IF;

    UPDATE public.ventas SET estado = 'anulada' WHERE id = p_venta_id;

    FOR v_item IN SELECT producto_id, cantidad FROM public.detalle_ventas WHERE venta_id = p_venta_id
    LOOP
        SELECT stock_actual INTO v_stock_anterior FROM public.productos WHERE id = v_item.producto_id FOR UPDATE;
        v_stock_nuevo := v_stock_anterior + v_item.cantidad;
        UPDATE public.productos SET stock_actual = v_stock_nuevo WHERE id = v_item.producto_id;
        INSERT INTO public.movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas
        ) VALUES (
            v_item.producto_id, v_usuario_id, 'devolucion', v_item.cantidad, v_stock_anterior, v_stock_nuevo,
            p_venta_id::TEXT, 'Anulación de venta'
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_turno_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol TEXT;
    v_usuario_id UUID;
    v_turno_usuario UUID;
    v_ventas_efectivo NUMERIC := 0;
    v_ventas_transferencia NUMERIC := 0;
BEGIN
    v_rol := public.get_user_role();
    IF COALESCE(v_rol, '') NOT IN ('administrador', 'cajero') THEN
        RAISE EXCEPTION 'Usuario sin permiso para cerrar turnos' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid() AND activo = true;
    SELECT usuario_id INTO v_turno_usuario FROM public.turnos_caja WHERE id = p_turno_id FOR UPDATE;
    IF v_turno_usuario IS NULL THEN
        RAISE EXCEPTION 'Turno no encontrado';
    END IF;
    IF v_rol = 'cajero' AND v_turno_usuario <> v_usuario_id THEN
        RAISE EXCEPTION 'El cajero solo puede cerrar su propio turno' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM(total), 0) INTO v_ventas_efectivo
    FROM public.ventas WHERE turno_caja_id = p_turno_id AND metodo_pago = 'efectivo' AND estado = 'completada';
    SELECT COALESCE(SUM(total), 0) INTO v_ventas_transferencia
    FROM public.ventas WHERE turno_caja_id = p_turno_id
      AND (metodo_pago = 'transferencia' OR metodo_pago = 'mixto') AND estado = 'completada';

    UPDATE public.turnos_caja
    SET estado = 'cerrado', cierre = now(), ventas_efectivo = v_ventas_efectivo,
        ventas_transferencia = v_ventas_transferencia
    WHERE id = p_turno_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_compra(
    p_proveedor_id UUID,
    p_items JSONB,
    p_notas TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_compra_id UUID;
    v_numero_compra TEXT;
    v_usuario_id UUID;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_producto_id UUID;
    v_cantidad INTEGER;
    v_precio_unitario NUMERIC;
    v_item_subtotal NUMERIC;
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
    v_count INTEGER;
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede registrar compras' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid() AND activo = true;
    IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado o inactivo'; END IF;

    v_numero_compra := 'C-' || to_char(now(), 'YYYYMMDD') || '-';
    SELECT COUNT(*) INTO v_count FROM public.compras WHERE numero_compra LIKE v_numero_compra || '%';
    v_numero_compra := v_numero_compra || lpad((v_count + 1)::TEXT, 4, '0');

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total := v_total + (CAST(v_item->>'cantidad' AS INTEGER) * CAST(v_item->>'precio_unitario' AS NUMERIC));
    END LOOP;

    INSERT INTO public.compras (numero_compra, proveedor_id, usuario_id, total, notas, estado)
    VALUES (v_numero_compra, p_proveedor_id, v_usuario_id, v_total, p_notas, 'recibida')
    RETURNING id INTO v_compra_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := CAST(v_item->>'producto_id' AS UUID);
        v_cantidad := CAST(v_item->>'cantidad' AS INTEGER);
        v_precio_unitario := CAST(v_item->>'precio_unitario' AS NUMERIC);
        v_item_subtotal := v_cantidad * v_precio_unitario;

        INSERT INTO public.detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (v_compra_id, v_producto_id, v_cantidad, v_precio_unitario, v_item_subtotal);

        SELECT stock_actual INTO v_stock_anterior FROM public.productos WHERE id = v_producto_id FOR UPDATE;
        IF v_stock_anterior IS NULL THEN RAISE EXCEPTION 'Producto no encontrado: %', v_producto_id; END IF;
        v_stock_nuevo := v_stock_anterior + v_cantidad;
        UPDATE public.productos SET stock_actual = v_stock_nuevo, precio_costo = v_precio_unitario WHERE id = v_producto_id;

        INSERT INTO public.movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas
        ) VALUES (
            v_producto_id, v_usuario_id, 'compra', v_cantidad, v_stock_anterior, v_stock_nuevo,
            v_compra_id::TEXT, 'Compra ' || v_numero_compra
        );
    END LOOP;

    RETURN v_compra_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ocultar_producto_en_caja(
    p_producto_id UUID,
    p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede ocultar productos' USING ERRCODE = '42501';
    END IF;
    IF p_password IS DISTINCT FROM '081426' THEN
        RAISE EXCEPTION 'Contraseña incorrecta' USING ERRCODE = '42501';
    END IF;

    UPDATE public.productos SET disponible_en_caja = false
    WHERE id = p_producto_id AND activo = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no existe o está inactivo'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reporte_ventas(
    p_fecha_inicio TIMESTAMPTZ,
    p_fecha_fin TIMESTAMPTZ
)
RETURNS TABLE (
    fecha DATE,
    total_ventas NUMERIC,
    num_transacciones BIGINT,
    ticket_promedio NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede consultar reportes' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT DATE(v.fecha), SUM(v.total), COUNT(v.id), ROUND(AVG(v.total), 0)
    FROM public.ventas AS v
    WHERE v.fecha >= p_fecha_inicio AND v.fecha <= p_fecha_fin AND v.estado = 'completada'
    GROUP BY DATE(v.fecha)
    ORDER BY DATE(v.fecha) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_productos_stock_bajo()
RETURNS TABLE (
    id UUID,
    nombre TEXT,
    codigo_barras TEXT,
    stock_actual INTEGER,
    stock_minimo INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede consultar inventario' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT p.id, p.nombre, p.codigo_barras, p.stock_actual, p.stock_minimo
    FROM public.productos AS p
    WHERE p.activo = true AND p.stock_actual <= p.stock_minimo
    ORDER BY (p.stock_actual - p.stock_minimo) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta(JSONB, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta(JSONB, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.anular_venta(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_venta(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.cerrar_turno(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cerrar_turno(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_compra(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_compra(UUID, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.ocultar_producto_en_caja(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ocultar_producto_en_caja(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_reporte_ventas(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reporte_ventas(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.get_productos_stock_bajo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_productos_stock_bajo() TO authenticated;