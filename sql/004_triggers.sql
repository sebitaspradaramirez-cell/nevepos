-- 004_triggers.sql

-- updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach updated_at triggers
CREATE TRIGGER set_updated_at_productos
    BEFORE UPDATE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_usuarios
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_clientes
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_proveedores
    BEFORE UPDATE ON proveedores
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- audit_trigger function
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario_id UUID;
    v_accion TEXT;
    v_datos_anteriores JSONB;
    v_datos_nuevos JSONB;
    v_registro_id UUID;
BEGIN
    -- Get user
    SELECT id INTO v_usuario_id FROM usuarios WHERE auth_user_id = auth.uid();
    
    v_accion := TG_OP;
    
    IF TG_OP = 'INSERT' THEN
        v_registro_id := NEW.id;
        v_datos_nuevos := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_registro_id := NEW.id;
        v_datos_anteriores := to_jsonb(OLD);
        v_datos_nuevos := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_registro_id := OLD.id;
        v_datos_anteriores := to_jsonb(OLD);
    END IF;

    INSERT INTO audit_log (
        usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos
    ) VALUES (
        v_usuario_id, v_accion, TG_TABLE_NAME::TEXT, v_registro_id, v_datos_anteriores, v_datos_nuevos
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit triggers
CREATE TRIGGER audit_productos
    AFTER INSERT OR UPDATE OR DELETE ON productos
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_ventas
    AFTER INSERT OR UPDATE OR DELETE ON ventas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_compras
    AFTER INSERT OR UPDATE OR DELETE ON compras
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_turnos_caja
    AFTER INSERT OR UPDATE OR DELETE ON turnos_caja
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_usuarios
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
