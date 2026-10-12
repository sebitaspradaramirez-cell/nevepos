CREATE TABLE IF NOT EXISTS public.creditos_trabajadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trabajador_nombre TEXT NOT NULL CHECK (length(btrim(trabajador_nombre)) > 0),
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    producto_nombre TEXT NOT NULL CHECK (length(btrim(producto_nombre)) > 0),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12, 0) NOT NULL CHECK (precio_unitario > 0),
    total NUMERIC(12, 0) NOT NULL CHECK (total > 0),
    saldo NUMERIC(12, 0) NOT NULL CHECK (saldo >= 0 AND saldo <= total),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'liquidado')),
    created_by UUID NOT NULL REFERENCES public.usuarios(id),
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT creditos_trabajadores_estado_saldo_check CHECK (
        (estado = 'pendiente' AND saldo > 0 AND paid_at IS NULL AND paid_by IS NULL)
        OR (estado = 'liquidado' AND saldo = 0 AND paid_at IS NOT NULL AND paid_by IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_creditos_trabajadores_estado_fecha
    ON public.creditos_trabajadores (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creditos_trabajadores_nombre
    ON public.creditos_trabajadores (lower(trabajador_nombre));

ALTER TABLE public.creditos_trabajadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_select_creditos_trabajadores ON public.creditos_trabajadores;
DROP POLICY IF EXISTS admin_insert_creditos_trabajadores ON public.creditos_trabajadores;
DROP POLICY IF EXISTS admin_update_creditos_trabajadores ON public.creditos_trabajadores;

CREATE POLICY admin_select_creditos_trabajadores
    ON public.creditos_trabajadores FOR SELECT
    USING ((SELECT public.get_user_role()) = 'administrador');

CREATE POLICY admin_insert_creditos_trabajadores
    ON public.creditos_trabajadores FOR INSERT
    WITH CHECK ((SELECT public.get_user_role()) = 'administrador');

CREATE POLICY admin_update_creditos_trabajadores
    ON public.creditos_trabajadores FOR UPDATE
    USING ((SELECT public.get_user_role()) = 'administrador')
    WITH CHECK ((SELECT public.get_user_role()) = 'administrador');

REVOKE ALL ON TABLE public.creditos_trabajadores FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.creditos_trabajadores TO authenticated;