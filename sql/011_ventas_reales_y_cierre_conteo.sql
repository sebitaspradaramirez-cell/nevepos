CREATE OR REPLACE FUNCTION public.cerrar_turno_con_conteo(
    p_turno_id UUID,
    p_monto_real NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_usuario_id UUID;
    v_turno_usuario UUID;
    v_estado TEXT;
    v_monto_cierre NUMERIC(12, 0);
    v_ventas_efectivo NUMERIC(12, 0) := 0;
    v_ventas_transferencia NUMERIC(12, 0) := 0;
BEGIN
    v_role := public.get_user_role();
    IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('administrador', 'cajero') THEN
        RAISE EXCEPTION 'Usuario sin permiso para cerrar turnos' USING ERRCODE = '42501';
    END IF;

    IF p_monto_real IS NULL OR p_monto_real < 0 OR p_monto_real <> trunc(p_monto_real) THEN
        RAISE EXCEPTION 'El efectivo contado debe ser un entero igual o mayor que cero' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_usuario_id
    FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND activo = true;
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado o inactivo' USING ERRCODE = '42501';
    END IF;

    SELECT usuario_id, estado, monto_cierre
    INTO v_turno_usuario, v_estado, v_monto_cierre
    FROM public.turnos_caja
    WHERE id = p_turno_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Turno no encontrado';
    END IF;

    IF v_role = 'cajero' AND v_turno_usuario <> v_usuario_id THEN
        RAISE EXCEPTION 'El cajero solo puede cerrar su propio turno' USING ERRCODE = '42501';
    END IF;

    IF v_estado = 'cerrado' THEN
        IF v_monto_cierre = p_monto_real THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'El turno ya fue cerrado con otro monto contado';
    END IF;

    SELECT COALESCE(SUM(total), 0) INTO v_ventas_efectivo
    FROM public.ventas
    WHERE turno_caja_id = p_turno_id
      AND metodo_pago = 'efectivo'
      AND estado = 'completada';

    SELECT COALESCE(SUM(total), 0) INTO v_ventas_transferencia
    FROM public.ventas
    WHERE turno_caja_id = p_turno_id
      AND metodo_pago IN ('transferencia', 'mixto')
      AND estado = 'completada';

    UPDATE public.turnos_caja
    SET estado = 'cerrado',
        cierre = now(),
        monto_cierre = p_monto_real,
        ventas_efectivo = v_ventas_efectivo,
        ventas_transferencia = v_ventas_transferencia
    WHERE id = p_turno_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_drawer_closed_totals(
    p_pin TEXT,
    p_today_start TIMESTAMPTZ,
    p_today_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_role TEXT;
    v_pin_status TEXT;
    v_today JSONB;
    v_previous JSONB;
    v_all_time JSONB;
BEGIN
    v_role := public.get_user_role();
    IF auth.uid() IS NULL OR COALESCE(v_role, '') NOT IN ('administrador', 'cajero') THEN
        RAISE EXCEPTION 'Usuario no autorizado.' USING ERRCODE = '42501';
    END IF;

    IF p_today_start IS NULL OR p_today_end IS NULL
       OR p_today_end <= p_today_start
       OR p_today_end - p_today_start > interval '26 hours' THEN
        RAISE EXCEPTION 'Rango diario inválido.' USING ERRCODE = '22023';
    END IF;

    v_pin_status := private.verify_cash_drawer_pin(p_pin);
    IF v_pin_status = 'setup_required' THEN
        RETURN jsonb_build_object('ok', false, 'setup_required', true);
    ELSIF v_pin_status = 'locked' THEN
        RETURN jsonb_build_object('ok', false, 'locked', true);
    ELSIF v_pin_status <> 'ok' THEN
        RETURN jsonb_build_object('ok', false, 'locked', false);
    END IF;

    SELECT jsonb_build_object(
        'amount', COALESCE(SUM(monto_cierre), 0),
        'turns', COUNT(monto_cierre)
    ) INTO v_today
    FROM public.turnos_caja
    WHERE estado = 'cerrado'
      AND cierre >= p_today_start
      AND cierre < p_today_end;

    SELECT jsonb_build_object(
        'amount', COALESCE(SUM(monto_cierre), 0),
        'turns', COUNT(monto_cierre)
    ) INTO v_previous
    FROM public.turnos_caja
    WHERE estado = 'cerrado'
      AND cierre < p_today_start;

    SELECT jsonb_build_object(
        'amount', COALESCE(SUM(monto_cierre), 0),
        'turns', COUNT(monto_cierre)
    ) INTO v_all_time
    FROM public.turnos_caja
    WHERE estado = 'cerrado';

    RETURN jsonb_build_object(
        'ok', true,
        'today', v_today,
        'previous_days', v_previous,
        'all_time', v_all_time
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_turno_con_conteo(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cash_drawer_closed_totals(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_turno_con_conteo(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_drawer_closed_totals(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
