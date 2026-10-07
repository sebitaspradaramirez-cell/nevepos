CREATE OR REPLACE FUNCTION public.ocultar_producto_en_caja(
    p_producto_id UUID,
    p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para ocultar productos' USING ERRCODE = '42501';
    END IF;

    IF p_password IS DISTINCT FROM '081426' THEN
        RAISE EXCEPTION 'Contraseña incorrecta' USING ERRCODE = '42501';
    END IF;

    v_rol := public.get_user_role();
    IF v_rol NOT IN ('administrador', 'cajero') THEN
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

REVOKE ALL ON FUNCTION public.ocultar_producto_en_caja(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ocultar_producto_en_caja(UUID, TEXT) TO authenticated;