-- 003_functions.sql

CREATE OR REPLACE FUNCTION generar_numero_venta()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix TEXT;
    v_count INTEGER;
    v_result TEXT;
BEGIN
    v_prefix := 'V-' || to_char(now(), 'YYYYMMDD') || '-';
    
    SELECT COUNT(*) INTO v_count
    FROM ventas
    WHERE numero_venta LIKE v_prefix || '%';
    
    v_result := v_prefix || lpad((v_count + 1)::TEXT, 4, '0');
    RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION registrar_venta(
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
AS $$
DECLARE
    v_venta_id UUID;
    v_numero_venta TEXT;
    v_usuario_id UUID;
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
    -- Get current user ID
    SELECT id INTO v_usuario_id FROM usuarios WHERE auth_user_id = auth.uid();
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado para auth.uid()';
    END IF;

    -- Generate ticket number
    v_numero_venta := generar_numero_venta();

    -- Calculate totals
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_subtotal := v_subtotal + (CAST(v_item->>'cantidad' AS INTEGER) * CAST(v_item->>'precio_unitario' AS NUMERIC));
    END LOOP;
    
    v_total := v_subtotal - COALESCE(p_descuento, 0);

    -- Create Venta
    INSERT INTO ventas (
        numero_venta, cliente_id, usuario_id, turno_caja_id,
        subtotal, descuento, total, metodo_pago, notas, sync_id
    ) VALUES (
        v_numero_venta, p_cliente_id, v_usuario_id, p_turno_caja_id,
        v_subtotal, p_descuento, v_total, p_metodo_pago, p_notas, p_sync_id
    ) RETURNING id INTO v_venta_id;

    -- Create Detalle Ventas and update inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := CAST(v_item->>'producto_id' AS UUID);
        v_cantidad := CAST(v_item->>'cantidad' AS INTEGER);
        v_precio_unitario := CAST(v_item->>'precio_unitario' AS NUMERIC);
        v_item_subtotal := v_cantidad * v_precio_unitario;

        -- Detalle
        INSERT INTO detalle_ventas (
            venta_id, producto_id, cantidad, precio_unitario, subtotal
        ) VALUES (
            v_venta_id, v_producto_id, v_cantidad, v_precio_unitario, v_item_subtotal
        );

        -- Update Stock
        SELECT stock_actual INTO v_stock_anterior FROM productos WHERE id = v_producto_id FOR UPDATE;
        v_stock_nuevo := v_stock_anterior - v_cantidad;

        UPDATE productos SET stock_actual = v_stock_nuevo WHERE id = v_producto_id;

        -- Movimiento Inventario
        INSERT INTO movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia
        ) VALUES (
            v_producto_id, v_usuario_id, 'venta', v_cantidad, v_stock_anterior, v_stock_nuevo, v_venta_id::TEXT
        );
    END LOOP;

    -- Create Movimiento Caja
    IF p_turno_caja_id IS NOT NULL THEN
        INSERT INTO movimientos_caja (
            turno_caja_id, usuario_id, tipo, monto, concepto
        ) VALUES (
            p_turno_caja_id, v_usuario_id, 'venta', v_total, 'Venta ' || v_numero_venta
        );
    END IF;

    RETURN v_venta_id;
END;
$$;


CREATE OR REPLACE FUNCTION anular_venta(p_venta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_usuario_id UUID;
    v_item RECORD;
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
    v_estado_actual TEXT;
BEGIN
    SELECT id INTO v_usuario_id FROM usuarios WHERE auth_user_id = auth.uid();

    SELECT estado INTO v_estado_actual FROM ventas WHERE id = p_venta_id FOR UPDATE;
    IF v_estado_actual = 'anulada' THEN
        RAISE EXCEPTION 'La venta ya se encuentra anulada';
    END IF;

    UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;

    FOR v_item IN SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = p_venta_id
    LOOP
        SELECT stock_actual INTO v_stock_anterior FROM productos WHERE id = v_item.producto_id FOR UPDATE;
        v_stock_nuevo := v_stock_anterior + v_item.cantidad;

        UPDATE productos SET stock_actual = v_stock_nuevo WHERE id = v_item.producto_id;

        INSERT INTO movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas
        ) VALUES (
            v_item.producto_id, v_usuario_id, 'devolucion', v_item.cantidad, v_stock_anterior, v_stock_nuevo, p_venta_id::TEXT, 'Anulación de venta'
        );
    END LOOP;
END;
$$;


CREATE OR REPLACE FUNCTION cerrar_turno(p_turno_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ventas_efectivo NUMERIC := 0;
    v_ventas_transferencia NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(total), 0) INTO v_ventas_efectivo
    FROM ventas 
    WHERE turno_caja_id = p_turno_id AND metodo_pago = 'efectivo' AND estado = 'completada';

    SELECT COALESCE(SUM(total), 0) INTO v_ventas_transferencia
    FROM ventas 
    WHERE turno_caja_id = p_turno_id AND (metodo_pago = 'transferencia' OR metodo_pago = 'mixto') AND estado = 'completada';

    UPDATE turnos_caja 
    SET 
        estado = 'cerrado', 
        cierre = now(),
        ventas_efectivo = v_ventas_efectivo,
        ventas_transferencia = v_ventas_transferencia
    WHERE id = p_turno_id;
END;
$$;


CREATE OR REPLACE FUNCTION get_reporte_ventas(p_fecha_inicio TIMESTAMPTZ, p_fecha_fin TIMESTAMPTZ)
RETURNS TABLE (
    fecha DATE,
    total_ventas NUMERIC,
    num_transacciones BIGINT,
    ticket_promedio NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        DATE(fecha) as fecha,
        SUM(total) as total_ventas,
        COUNT(id) as num_transacciones,
        ROUND(AVG(total), 0) as ticket_promedio
    FROM ventas
    WHERE fecha >= p_fecha_inicio AND fecha <= p_fecha_fin AND estado = 'completada'
    GROUP BY DATE(fecha)
    ORDER BY DATE(fecha) DESC;
$$;


CREATE OR REPLACE FUNCTION get_productos_stock_bajo()
RETURNS TABLE (
    id UUID,
    nombre TEXT,
    codigo_barras TEXT,
    stock_actual INTEGER,
    stock_minimo INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT id, nombre, codigo_barras, stock_actual, stock_minimo
    FROM productos
    WHERE activo = true AND stock_actual <= stock_minimo
    ORDER BY (stock_actual - stock_minimo) ASC;
$$;


CREATE OR REPLACE FUNCTION registrar_compra(
    p_proveedor_id UUID,
    p_items JSONB,
    p_notas TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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
    SELECT id INTO v_usuario_id FROM usuarios WHERE auth_user_id = auth.uid();
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado';
    END IF;

    -- Generate purchase number (C-YYYYMMDD-NNNN)
    v_numero_compra := 'C-' || to_char(now(), 'YYYYMMDD') || '-';
    SELECT COUNT(*) INTO v_count FROM compras WHERE numero_compra LIKE v_numero_compra || '%';
    v_numero_compra := v_numero_compra || lpad((v_count + 1)::TEXT, 4, '0');

    -- Calculate total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total := v_total + (CAST(v_item->>'cantidad' AS INTEGER) * CAST(v_item->>'precio_unitario' AS NUMERIC));
    END LOOP;

    -- Create Compra
    INSERT INTO compras (
        numero_compra, proveedor_id, usuario_id, total, notas, estado
    ) VALUES (
        v_numero_compra, p_proveedor_id, v_usuario_id, v_total, p_notas, 'recibida'
    ) RETURNING id INTO v_compra_id;

    -- Create Detalle Compras and update inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := CAST(v_item->>'producto_id' AS UUID);
        v_cantidad := CAST(v_item->>'cantidad' AS INTEGER);
        v_precio_unitario := CAST(v_item->>'precio_unitario' AS NUMERIC);
        v_item_subtotal := v_cantidad * v_precio_unitario;

        INSERT INTO detalle_compras (
            compra_id, producto_id, cantidad, precio_unitario, subtotal
        ) VALUES (
            v_compra_id, v_producto_id, v_cantidad, v_precio_unitario, v_item_subtotal
        );

        SELECT stock_actual INTO v_stock_anterior FROM productos WHERE id = v_producto_id FOR UPDATE;
        v_stock_nuevo := v_stock_anterior + v_cantidad;

        UPDATE productos SET 
            stock_actual = v_stock_nuevo,
            precio_costo = v_precio_unitario
        WHERE id = v_producto_id;

        INSERT INTO movimientos_inventario (
            producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, notas
        ) VALUES (
            v_producto_id, v_usuario_id, 'compra', v_cantidad, v_stock_anterior, v_stock_nuevo, v_compra_id::TEXT, 'Compra ' || v_numero_compra
        );
    END LOOP;

    RETURN v_compra_id;
END;
$$;
