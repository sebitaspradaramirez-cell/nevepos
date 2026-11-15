CREATE OR REPLACE FUNCTION public.get_cash_drawer_summary(
    p_pin TEXT,
    p_today_start TIMESTAMPTZ,
    p_today_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
    v_role TEXT;
    v_pin_status TEXT;
    v_today JSONB;
    v_previous JSONB;
    v_all_time JSONB;
    v_open_turns INTEGER;
    v_expected_cash NUMERIC(12, 0);
    v_products_sold_today BIGINT;
    v_suppliers_paid_today NUMERIC(12, 0);
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
        'cash', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'efectivo'), 0),
        'transfer', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'transferencia'), 0),
        'mixed', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'mixto'), 0),
        'total', COALESCE(SUM(total), 0)
    ) INTO v_today
    FROM public.ventas
    WHERE estado = 'completada'
      AND fecha >= p_today_start
      AND fecha < p_today_end;

    SELECT jsonb_build_object(
        'cash', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'efectivo'), 0),
        'transfer', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'transferencia'), 0),
        'mixed', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'mixto'), 0),
        'total', COALESCE(SUM(total), 0)
    ) INTO v_previous
    FROM public.ventas
    WHERE estado = 'completada'
      AND fecha < p_today_start;

    SELECT jsonb_build_object(
        'cash', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'efectivo'), 0),
        'transfer', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'transferencia'), 0),
        'mixed', COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'mixto'), 0),
        'total', COALESCE(SUM(total), 0)
    ) INTO v_all_time
    FROM public.ventas
    WHERE estado = 'completada';

    SELECT COUNT(*)::INTEGER,
           COALESCE(SUM(
               t.monto_apertura
               + COALESCE(s.cash_sales, 0)
               + COALESCE(m.cash_in, 0)
               - COALESCE(m.cash_out, 0)
           ), 0)::NUMERIC(12, 0)
    INTO v_open_turns, v_expected_cash
    FROM public.turnos_caja AS t
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(v.total), 0) AS cash_sales
        FROM public.ventas AS v
        WHERE v.turno_caja_id = t.id
          AND v.estado = 'completada'
          AND v.metodo_pago = 'efectivo'
    ) AS s ON true
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(mc.monto) FILTER (WHERE mc.tipo = 'entrada'), 0) AS cash_in,
               COALESCE(SUM(mc.monto) FILTER (WHERE mc.tipo = 'salida'), 0) AS cash_out
        FROM public.movimientos_caja AS mc
        WHERE mc.turno_caja_id = t.id
    ) AS m ON true
    WHERE t.estado = 'abierto';

    SELECT COALESCE(SUM(dv.cantidad), 0)
    INTO v_products_sold_today
    FROM public.detalle_ventas AS dv
    JOIN public.ventas AS v ON v.id = dv.venta_id
    WHERE v.estado = 'completada'
      AND v.fecha >= p_today_start
      AND v.fecha < p_today_end;

    SELECT COALESCE(SUM(total), 0)
    INTO v_suppliers_paid_today
    FROM public.compras
    WHERE estado = 'recibida'
      AND fecha >= p_today_start
      AND fecha < p_today_end;

    RETURN jsonb_build_object(
        'ok', true,
        'today', v_today,
        'previous_days', v_previous,
        'all_time', v_all_time,
        'open_turns', v_open_turns,
        'expected_cash', v_expected_cash,
        'products_sold_today', v_products_sold_today,
        'suppliers_paid_today', v_suppliers_paid_today
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_drawer_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_drawer_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
