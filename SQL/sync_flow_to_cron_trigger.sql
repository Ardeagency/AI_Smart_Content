-- Trigger: sincronizar flow_schedules con el sistema de cron (n8n, pg_cron, etc.)
-- Se ejecuta después de INSERT, UPDATE o DELETE en flow_schedules.
-- Requiere que exista la función sync_flow_to_cron().

-- ---------------------------------------------------------------------------
-- 1. Función (stub): reemplazar el cuerpo por la lógica real de sincronización
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_flow_to_cron()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stub: aquí debe ir la lógica que actualiza el sistema de cron con los
  -- datos de flow_schedules (por ejemplo, insertar/actualizar/borrar en
  -- pg_cron, o notificar a un servicio externo como n8n).
  -- OLD = fila antes del cambio (UPDATE/DELETE); NEW = fila después (INSERT/UPDATE).
  -- Ejemplo de esqueleto:
  -- IF TG_OP = 'INSERT' THEN ... registrar NEW en cron ...
  -- ELSIF TG_OP = 'UPDATE' THEN ... actualizar cron con NEW ...
  -- ELSIF TG_OP = 'DELETE' THEN ... quitar OLD del cron ...
  -- END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.sync_flow_to_cron() IS 'Sincroniza flow_schedules con el sistema de cron; reemplazar el cuerpo por la lógica real.';

-- ---------------------------------------------------------------------------
-- 2. Trigger en flow_schedules
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_sync_flow_cron ON public.flow_schedules;

CREATE TRIGGER tr_sync_flow_cron
  AFTER INSERT OR DELETE OR UPDATE
  ON public.flow_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_flow_to_cron();

COMMENT ON TRIGGER tr_sync_flow_cron ON public.flow_schedules IS 'Sincroniza la fila con el runner de cron al crear/actualizar/eliminar una tarea programada.';
