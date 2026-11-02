ALTER TABLE public.movimientos_caja
    ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES public.compras(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_caja_compra_salida
    ON public.movimientos_caja (compra_id)
    WHERE compra_id IS NOT NULL AND tipo = 'salida';

CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_caja_compra_entrada
    ON public.movimientos_caja (compra_id)
    WHERE compra_id IS NOT NULL AND tipo = 'entrada';

CREATE OR REPLACE FUNCTION public.registrar_compra(
    p_proveedor_id UUID,
    p_items JSONB,
    p_notas TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'Actualiza NevePOS para elegir la caja que pagará la compra.'
        USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_compra(
    p_proveedor_id UUID,
    p_items JSONB,
    p_notas TEXT,
    p_turno_caja_id UUID
)
RETURNS JSONB
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
    v_efectivo_disponible NUMERIC;
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
    v_turno_estado TEXT;
    v_count INTEGER;
    v_movimiento_id UUID;
    v_movimiento_fecha TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede registrar compras'
            USING ERRCODE = '42501';
    END IF;

    IF p_turno_caja_id IS NULL THEN
        RAISE EXCEPTION 'Selecciona la caja abierta que pagará esta compra.'
            USING ERRCODE = '22023';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe contener al menos un producto.'
            USING ERRCODE = '22023';
    END IF;

    SELECT estado INTO v_turno_estado
    FROM public.turnos_caja
    WHERE id = p_turno_caja_id
    FOR UPDATE;
    IF NOT FOUND OR v_turno_estado <> 'abierto' THEN
        RAISE EXCEPTION 'La caja seleccionada no existe o ya está cerrada.'
            USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND activo = true;
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo.'
            USING ERRCODE = '42501';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_cantidad := (v_item->>'cantidad')::INTEGER;
        v_precio_unitario := (v_item->>'precio_unitario')::NUMERIC;
        IF v_item->>'producto_id' IS NULL
           OR v_cantidad IS NULL
           OR v_precio_unitario IS NULL
           OR v_cantidad < 1
           OR v_precio_unitario < 0
           OR v_precio_unitario <> trunc(v_precio_unitario) THEN
            RAISE EXCEPTION 'La compra contiene un producto, cantidad o costo inválido.'
                USING ERRCODE = '22023';
        END IF;
        v_total := v_total + v_cantidad * v_precio_unitario;
    END LOOP;

    SELECT COALESCE(t.monto_apertura, 0)
           + COALESCE((
               SELECT SUM(v.total)
               FROM public.ventas AS v
               WHERE v.turno_caja_id = t.id
                 AND v.estado = 'completada'
                 AND v.metodo_pago = 'efectivo'
           ), 0)
           + COALESCE((
               SELECT SUM(mc.monto)
               FROM public.movimientos_caja AS mc
               WHERE mc.turno_caja_id = t.id AND mc.tipo = 'entrada'
           ), 0)
           - COALESCE((
               SELECT SUM(mc.monto)
               FROM public.movimientos_caja AS mc
               WHERE mc.turno_caja_id = t.id AND mc.tipo = 'salida'
           ), 0)
    INTO v_efectivo_disponible
    FROM public.turnos_caja AS t
    WHERE t.id = p_turno_caja_id;

    IF v_total > v_efectivo_disponible THEN
        RAISE EXCEPTION 'Efectivo insuficiente en la caja seleccionada.'
            USING ERRCODE = '23514',
                  DETAIL = jsonb_build_object(
                      'disponible', v_efectivo_disponible,
                      'requerido', v_total
                  )::TEXT;
    END IF;

    v_numero_compra := 'C-' || to_char(now(), 'YYYYMMDD') || '-';
    SELECT COUNT(*) INTO v_count
    FROM public.compras
    WHERE numero_compra LIKE v_numero_compra || '%';
    v_numero_compra := v_numero_compra || lpad((v_count + 1)::TEXT, 4, '0');

    INSERT INTO public.compras (
        numero_compra, proveedor_id, usuario_id, total, notas, estado
    ) VALUES (
        v_numero_compra, p_proveedor_id, v_usuario_id, v_total, p_notas, 'recibida'
    ) RETURNING id INTO v_compra_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := (v_item->>'producto_id')::UUID;
        v_cantidad := (v_item->>'cantidad')::INTEGER;
        v_precio_unitario := (v_item->>'precio_unitario')::NUMERIC;
        v_item_subtotal := v_cantidad * v_precio_unitario;

        INSERT INTO public.detalle_compras (
            compra_id, producto_id, cantidad, precio_unitario, subtotal
        ) VALUES (
            v_compra_id, v_producto_id, v_cantidad, v_precio_unitario, v_item_subtotal
        );

        SELECT stock_actual INTO v_stock_anterior
        FROM public.productos
        WHERE id = v_producto_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_producto_id;
        END IF;

        v_stock_nuevo := COALESCE(v_stock_anterior, 0) + v_cantidad;
        UPDATE public.productos
        SET stock_actual = v_stock_nuevo, precio_costo = v_precio_unitario
        WHERE id = v_producto_id;

        INSERT INTO public.movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas
        ) VALUES (
            v_producto_id, v_usuario_id, 'compra', v_cantidad, COALESCE(v_stock_anterior, 0),
            v_stock_nuevo, v_compra_id::TEXT, 'Compra ' || v_numero_compra
        );
    END LOOP;

    INSERT INTO public.movimientos_caja (
        turno_caja_id, usuario_id, tipo, monto, concepto, compra_id
    ) VALUES (
        p_turno_caja_id, v_usuario_id, 'salida', v_total, 'Compra ' || v_numero_compra, v_compra_id
    )
    RETURNING id, fecha INTO v_movimiento_id, v_movimiento_fecha;

    RETURN jsonb_build_object(
        'compra_id', v_compra_id,
        'movimiento_caja', jsonb_build_object(
            'id', v_movimiento_id,
            'turno_caja_id', p_turno_caja_id,
            'usuario_id', v_usuario_id,
            'tipo', 'salida',
            'monto', v_total,
            'concepto', 'Compra ' || v_numero_compra,
            'compra_id', v_compra_id,
            'fecha', v_movimiento_fecha
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_compra(
    p_compra_id UUID,
    p_turno_reembolso_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_compra RECORD;
    v_turno_estado TEXT;
    v_egreso_id UUID;
    v_egreso_monto NUMERIC;
    v_movimiento_id UUID;
    v_movimiento_fecha TIMESTAMPTZ;
    v_detalle RECORD;
    v_stock_actual INTEGER;
    v_stock_nuevo INTEGER;
    v_movimiento_caja JSONB := NULL;
BEGIN
    IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede anular compras.'
            USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND activo = true;
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo.'
            USING ERRCODE = '42501';
    END IF;

    SELECT id, numero_compra, total, estado
    INTO v_compra
    FROM public.compras
    WHERE id = p_compra_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra no encontrada.';
    END IF;
    IF v_compra.estado = 'anulada' THEN
        RAISE EXCEPTION 'La compra ya está anulada.';
    END IF;

    SELECT id, monto INTO v_egreso_id, v_egreso_monto
    FROM public.movimientos_caja
    WHERE compra_id = p_compra_id AND tipo = 'salida';

    IF v_egreso_id IS NOT NULL THEN
        IF p_turno_reembolso_id IS NULL THEN
            RAISE EXCEPTION 'Selecciona una caja abierta para registrar el reembolso.'
                USING ERRCODE = '22023';
        END IF;

        SELECT estado INTO v_turno_estado
        FROM public.turnos_caja
        WHERE id = p_turno_reembolso_id
        FOR UPDATE;
        IF NOT FOUND OR v_turno_estado <> 'abierto' THEN
            RAISE EXCEPTION 'La caja que recibirá el reembolso no existe o está cerrada.'
                USING ERRCODE = '22023';
        END IF;
    ELSIF p_turno_reembolso_id IS NOT NULL THEN
        RAISE EXCEPTION 'Esta compra no tiene un egreso de caja que reembolsar.'
            USING ERRCODE = '22023';
    END IF;

    FOR v_detalle IN
        SELECT producto_id, SUM(cantidad)::INTEGER AS cantidad
        FROM public.detalle_compras
        WHERE compra_id = p_compra_id
        GROUP BY producto_id
        ORDER BY producto_id
    LOOP
        SELECT COALESCE(stock_actual, 0) INTO v_stock_actual
        FROM public.productos
        WHERE id = v_detalle.producto_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_detalle.producto_id;
        END IF;
        IF v_stock_actual < v_detalle.cantidad THEN
            RAISE EXCEPTION 'No se puede anular: el inventario actual es menor que lo comprado para el producto %.',
                v_detalle.producto_id
                USING ERRCODE = '23514';
        END IF;

        v_stock_nuevo := v_stock_actual - v_detalle.cantidad;
        UPDATE public.productos
        SET stock_actual = v_stock_nuevo
        WHERE id = v_detalle.producto_id;

        INSERT INTO public.movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas
        ) VALUES (
            v_detalle.producto_id, v_usuario_id, 'salida', v_detalle.cantidad,
            v_stock_actual, v_stock_nuevo, p_compra_id::TEXT,
            'Anulación de compra ' || v_compra.numero_compra
        );
    END LOOP;

    UPDATE public.compras
    SET estado = 'anulada'
    WHERE id = p_compra_id;

    IF v_egreso_id IS NOT NULL THEN
        INSERT INTO public.movimientos_caja (
            turno_caja_id, usuario_id, tipo, monto, concepto, compra_id
        ) VALUES (
            p_turno_reembolso_id, v_usuario_id, 'entrada', v_egreso_monto,
            'Reembolso compra ' || v_compra.numero_compra, p_compra_id
        )
        RETURNING id, fecha INTO v_movimiento_id, v_movimiento_fecha;

        v_movimiento_caja := jsonb_build_object(
            'id', v_movimiento_id,
            'turno_caja_id', p_turno_reembolso_id,
            'usuario_id', v_usuario_id,
            'tipo', 'entrada',
            'monto', v_egreso_monto,
            'concepto', 'Reembolso compra ' || v_compra.numero_compra,
            'compra_id', p_compra_id,
            'fecha', v_movimiento_fecha
        );
    END IF;

    RETURN jsonb_build_object(
        'compra_id', p_compra_id,
        'movimiento_caja', v_movimiento_caja
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_compra(UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_compra(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anular_compra(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra(UUID, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_compra(UUID, UUID) TO authenticated;
