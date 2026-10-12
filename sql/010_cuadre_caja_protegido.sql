CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.cash_drawer_security (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    pin_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.cash_drawer_attempts (
    auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    failures INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ
);

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.verify_cash_drawer_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
    v_pin_hash TEXT;
    v_failures INTEGER;
    v_window_started_at TIMESTAMPTZ;
    v_locked_until TIMESTAMPTZ;
BEGIN
    SELECT pin_hash INTO v_pin_hash
    FROM private.cash_drawer_security
    WHERE singleton = true;

    IF v_pin_hash IS NULL THEN
        RETURN 'setup_required';
    END IF;

    SELECT failures, window_started_at, locked_until
    INTO v_failures, v_window_started_at, v_locked_until
    FROM private.cash_drawer_attempts
    WHERE auth_user_id = auth.uid()
    FOR UPDATE;

    IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
        RETURN 'locked';
    END IF;

    IF p_pin IS NULL OR crypt(p_pin, v_pin_hash) <> v_pin_hash THEN
        IF v_window_started_at IS NULL OR v_window_started_at < now() - interval '15 minutes' THEN
            v_failures := 1;
            v_window_started_at := now();
            v_locked_until := NULL;
        ELSE
            v_failures := v_failures + 1;
            IF v_failures >= 5 THEN
                v_locked_until := now() + interval '15 minutes';
            END IF;
        END IF;

        INSERT INTO private.cash_drawer_attempts (auth_user_id, failures, window_started_at, locked_until)
        VALUES (auth.uid(), v_failures, v_window_started_at, v_locked_until)
        ON CONFLICT (auth_user_id) DO UPDATE
            SET failures = EXCLUDED.failures,
                window_started_at = EXCLUDED.window_started_at,
                locked_until = EXCLUDED.locked_until;

        IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
            RETURN 'locked';
        END IF;
        RETURN 'invalid';
    END IF;

    DELETE FROM private.cash_drawer_attempts WHERE auth_user_id = auth.uid();
    RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION private.verify_cash_drawer_pin(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_cash_drawer_pin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.get_user_role() IS DISTINCT FROM 'administrador' THEN
        RAISE EXCEPTION 'Solo la cuenta administradora puede configurar el acceso.'
            USING ERRCODE = '42501';
    END IF;

    IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'El código debe tener seis dígitos.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO private.cash_drawer_security (singleton, pin_hash)
    VALUES (true, crypt(p_pin, gen_salt('bf', 12)))
    ON CONFLICT (singleton) DO UPDATE
        SET pin_hash = EXCLUDED.pin_hash,
            updated_at = now();
    DELETE FROM private.cash_drawer_attempts
    WHERE auth_user_id IS NOT NULL;

    RETURN true;
END;
$$;

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

    RETURN jsonb_build_object(
        'ok', true,
        'today', v_today,
        'previous_days', v_previous,
        'all_time', v_all_time,
        'open_turns', v_open_turns,
        'expected_cash', v_expected_cash
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ocultar_producto_en_caja(
    p_producto_id UUID,
    p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_role TEXT;
    v_pin_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para ocultar productos' USING ERRCODE = '42501';
    END IF;

    v_pin_status := private.verify_cash_drawer_pin(p_password);
    IF v_pin_status <> 'ok' THEN
        RAISE EXCEPTION 'Código incorrecto o acceso no configurado' USING ERRCODE = '42501';
    END IF;

    v_role := public.get_user_role();
    IF COALESCE(v_role, '') NOT IN ('administrador', 'cajero') THEN
        RAISE EXCEPTION 'Tu usuario no tiene permiso para ocultar productos' USING ERRCODE = '42501';
    END IF;

    UPDATE public.productos
    SET disponible_en_caja = false
    WHERE id = p_producto_id AND activo = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto no existe o está inactivo';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_cash_drawer_pin(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cash_drawer_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ocultar_producto_en_caja(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cash_drawer_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_drawer_summary(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ocultar_producto_en_caja(UUID, TEXT) TO authenticated;