CREATE OR REPLACE FUNCTION public.registrar_credito_trabajador(
    p_trabajador_nombre TEXT,
    p_producto_id UUID,
    p_cantidad INTEGER,
    p_precio_unitario NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_producto_nombre TEXT;
    v_stock_anterior INTEGER;
    v_stock_nuevo INTEGER;
    v_total NUMERIC(12, 0);
    v_credito public.creditos_trabajadores%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la administradora puede registrar créditos a trabajadores'
            USING ERRCODE = '42501';
    END IF;

    IF p_trabajador_nombre IS NULL OR length(btrim(p_trabajador_nombre)) = 0 THEN
        RAISE EXCEPTION 'El nombre del trabajador es obligatorio' USING ERRCODE = '22023';
    END IF;
    IF p_producto_id IS NULL OR p_cantidad IS NULL OR p_cantidad < 1 THEN
        RAISE EXCEPTION 'Selecciona un producto y una cantidad válida' USING ERRCODE = '22023';
    END IF;
    IF p_precio_unitario IS NULL OR p_precio_unitario < 1 OR p_precio_unitario <> trunc(p_precio_unitario) THEN
        RAISE EXCEPTION 'El precio debe ser un entero mayor que cero' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND activo = true;
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario administrador no encontrado o inactivo' USING ERRCODE = '42501';
    END IF;

    SELECT nombre, COALESCE(stock_actual, 0)
    INTO v_producto_nombre, v_stock_anterior
    FROM public.productos
    WHERE id = p_producto_id AND activo = true
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto no existe o está inactivo' USING ERRCODE = 'P0002';
    END IF;

    IF v_stock_anterior < p_cantidad THEN
        RAISE EXCEPTION 'Existencia insuficiente. Disponible: %, solicitado: %', v_stock_anterior, p_cantidad
            USING ERRCODE = '23514';
    END IF;

    v_stock_nuevo := v_stock_anterior - p_cantidad;
    v_total := p_cantidad * p_precio_unitario;

    UPDATE public.productos
    SET stock_actual = v_stock_nuevo
    WHERE id = p_producto_id;

    INSERT INTO public.creditos_trabajadores (
        trabajador_nombre,
        producto_id,
        producto_nombre,
        cantidad,
        precio_unitario,
        total,
        saldo,
        estado,
        created_by
    ) VALUES (
        btrim(p_trabajador_nombre),
        p_producto_id,
        v_producto_nombre,
        p_cantidad,
        p_precio_unitario,
        v_total,
        v_total,
        'pendiente',
        v_usuario_id
    ) RETURNING * INTO v_credito;

    INSERT INTO public.movimientos_inventario (
        producto_id,
        usuario_id,
        tipo,
        cantidad,
        stock_anterior,
        stock_nuevo,
        referencia,
        notas
    ) VALUES (
        p_producto_id,
        v_usuario_id,
        'salida',
        p_cantidad,
        v_stock_anterior,
        v_stock_nuevo,
        v_credito.id::TEXT,
        'Crédito a trabajador: ' || btrim(p_trabajador_nombre)
    );

    RETURN jsonb_build_object(
        'credito', to_jsonb(v_credito),
        'stock_actual', v_stock_nuevo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_credito_trabajador(TEXT, UUID, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_credito_trabajador(TEXT, UUID, INTEGER, NUMERIC) TO authenticated;
