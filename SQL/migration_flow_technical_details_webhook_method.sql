-- Añadir método HTTP a flow_technical_details para que DevTestView y Builder lo usen
-- Ejecutar en Supabase SQL Editor si aún no existe la columna.

ALTER TABLE public.flow_technical_details
  ADD COLUMN IF NOT EXISTS webhook_method text NOT NULL DEFAULT 'POST';

COMMENT ON COLUMN public.flow_technical_details.webhook_method IS 'Método HTTP para el webhook (POST, GET, etc.)';
