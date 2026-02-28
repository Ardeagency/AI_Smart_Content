-- Migración: inputs de programación solo para flujos automated (flow_schedules).
-- Añade schedule_schema en content_flows, for_flow_type en ui_component_templates,
-- y la plantilla cron_schedule (programación de horas). Ver docs/AUTOMATED_FLOW_SCHEDULE_INPUTS.md

-- ---------------------------------------------------------------------------
-- 1. content_flows.schedule_schema (solo para flow_category_type = 'automated')
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_flows
  ADD COLUMN IF NOT EXISTS schedule_schema jsonb DEFAULT '{"fields":[]}'::jsonb;

COMMENT ON COLUMN public.content_flows.schedule_schema IS 'Schema de campos para programar la tarea (cron, entity, audience, aspect_ratio, etc.). Solo usado cuando flow_category_type = automated.';

-- ---------------------------------------------------------------------------
-- 2. ui_component_templates.for_flow_type (null = todos, manual | automated)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ui_component_templates' AND column_name = 'for_flow_type'
  ) THEN
    ALTER TABLE public.ui_component_templates
      ADD COLUMN for_flow_type text DEFAULT NULL
      CHECK (for_flow_type IS NULL OR for_flow_type = ANY (ARRAY['manual'::text, 'automated'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.ui_component_templates.for_flow_type IS 'Si no es null, la plantilla solo se ofrece en el Builder para ese tipo de flujo (manual = formulario usuario; automated = configuración de programación).';

-- ---------------------------------------------------------------------------
-- 3. Plantilla cron_schedule (solo para flujos automated)
-- ---------------------------------------------------------------------------
INSERT INTO public.ui_component_templates (
  id, name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index, template_level, for_flow_type
)
SELECT
  uuid_generate_v4(),
  'cron_schedule',
  'Programación de ejecución (horario: diario, cada X horas, expresión cron)',
  'basic',
  'clock',
  '{
    "input_type": "cron_schedule",
    "type": "cron_schedule",
    "data_type": "string",
    "placeholder": "0 9 * * *",
    "presets": [
      {"label": "Todos los días a las 9:00", "value": "0 9 * * *"},
      {"label": "Cada 6 horas", "value": "0 */6 * * *"},
      {"label": "Cada hora", "value": "0 * * * *"},
      {"label": "Diario a medianoche", "value": "0 0 * * *"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  true,
  500,
  'preset',
  'automated'
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates WHERE name = 'cron_schedule');

-- Actualizar for_flow_type si la plantilla ya existía
UPDATE public.ui_component_templates SET for_flow_type = 'automated', order_index = 500 WHERE name = 'cron_schedule';
