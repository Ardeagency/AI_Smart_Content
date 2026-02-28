-- Reorganiza ui_component_templates en:
-- 1) Cascarones (shell): 11 plantillas vacías UI = contenedores base personalizables desde cero.
-- 2) Plantillas predefinidas (preset): variantes con opciones/uso definido (prompts, flags, tone_selector, etc.).
-- 3) Domain: selectores de contexto (marca, audiencia, producto, etc.).
--
-- Plantillas "basic" = inputs vacíos: el desarrollador configura opciones, min/max, etc. desde cero
-- (toggle_switch, num_stepper, range, choice_chips, multi_select_chips, radio, selection_checkboxes, checkboxes).
-- Por eso llevan category = 'basic' y aparecen como controles básicos/vacíos en el Builder.
--
-- Se eliminan ambos nombres habituales del CHECK (template_level_check y level_check).
-- Si aún falla, buscar el nombre real con:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.ui_component_templates'::regclass AND contype = 'c';

-- ---------------------------------------------------------------------------
-- PASO 1: Permitir template_level = 'shell'
-- (Eliminar ambos nombres posibles del CHECK; en algunas BDs es _level_check)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ui_component_templates
  DROP CONSTRAINT IF EXISTS ui_component_templates_template_level_check;

ALTER TABLE public.ui_component_templates
  DROP CONSTRAINT IF EXISTS ui_component_templates_level_check;

ALTER TABLE public.ui_component_templates
  ADD CONSTRAINT ui_component_templates_template_level_check
  CHECK (template_level = ANY (ARRAY['shell'::text, 'core'::text, 'preset'::text, 'domain'::text]));

-- ---------------------------------------------------------------------------
-- PASO 2: Marcar las 11 CASCARONES (contenedores base) y orden
-- Correspondencia con input-registry CONTAINER_TYPES:
-- STRING_CONTAINER → string | SELECT_CONTAINER → dropdown | COLORS_CONTAINER → colores
-- ASPECT_RATIO_CONTAINER → aspect_ratio | SCOPE_PICKER_CONTAINER → scope_picker
-- MEDIA_CONTAINER → image_selector | BOOLEAN_CONTAINER → toggle_switch
-- NUMBER_CONTAINER → num_stepper | RANGE_CONTAINER → range | FILE_CONTAINER → file (insert)
-- STRUCTURAL_CONTAINER → section
-- ---------------------------------------------------------------------------
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 10  WHERE name = 'string';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 20  WHERE name = 'dropdown';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 30  WHERE name = 'colores';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 40  WHERE name = 'aspect_ratio';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 50  WHERE name = 'scope_picker';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'media', order_index = 60  WHERE name = 'image_selector';
-- Controles vacíos (basic): el desarrollador configura desde cero
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 70  WHERE name = 'toggle_switch';
-- Asegurar que toggle_switch tenga input_type explícito (evita confusión con checkbox; data_type sigue siendo boolean)
UPDATE public.ui_component_templates
SET base_schema = COALESCE(base_schema, '{}'::jsonb) || '{"input_type": "toggle_switch", "data_type": "boolean"}'::jsonb
WHERE name = 'toggle_switch';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 80  WHERE name = 'num_stepper';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 90  WHERE name = 'range';
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'structural', order_index = 100 WHERE name = 'section';

-- ---------------------------------------------------------------------------
-- PASO 3: Plantilla CASCARÓN "file" (FILE_CONTAINER) si no existe
-- ---------------------------------------------------------------------------
INSERT INTO public.ui_component_templates (
  id, name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index, template_level
)
SELECT
  uuid_generate_v4(),
  'file',
  'Subida de archivo (hoja en blanco)',
  'basic',
  'upload-simple',
  '{"type": "file", "data_type": "object", "input_type": "file", "accept": "image/*,application/pdf"}'::jsonb,
  '{}'::jsonb,
  true,
  95,
  'shell'
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates WHERE name = 'file');

-- Ajustar order_index del file si ya existía para que quede entre range y section
UPDATE public.ui_component_templates SET template_level = 'shell', category = 'basic', order_index = 95 WHERE name = 'file';

-- ---------------------------------------------------------------------------
-- PASO 4: Plantillas PREDEFINIDAS (preset) — variantes con opciones/uso definido
-- Inputs vacíos (basic): choice_chips, multi_select_chips, radio, checkboxes, selection_checkboxes
-- ---------------------------------------------------------------------------
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'basic', order_index = 200 WHERE name = 'choice_chips';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'basic', order_index = 210 WHERE name = 'multi_select_chips';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'basic', order_index = 220 WHERE name = 'radio';
-- Checkboxes (una opción): variable = valor elegido (ej. cabello = rubio). SELECT_CONTAINER, data_type string.
INSERT INTO public.ui_component_templates (
  id, name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index, template_level
)
SELECT
  uuid_generate_v4(),
  'checkboxes',
  'Opciones con casillas: una elegida → variable = valor (ej. cabello = rubio)',
  'basic',
  'list-checks',
  '{"input_type": "checkboxes", "type": "checkboxes", "data_type": "string", "options": [{"value": "rubio", "label": "Rubio"}, {"value": "negro", "label": "Negro"}, {"value": "castaño", "label": "Castaño"}]}'::jsonb,
  '{}'::jsonb,
  true,
  232,
  'preset'
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates WHERE name = 'checkboxes');
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'basic', order_index = 232 WHERE name = 'checkboxes';
-- Selection checkboxes: varias opciones → variable = array. SELECT_CONTAINER, data_type array. Input vacío (basic).
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'basic', order_index = 230 WHERE name = 'selection_checkboxes';
UPDATE public.ui_component_templates
SET base_schema = COALESCE(base_schema, '{}'::jsonb) || '{"input_type": "selection_checkboxes", "data_type": "array"}'::jsonb
WHERE name = 'selection_checkboxes';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'basic', order_index = 240 WHERE name = 'tags';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'semantic', order_index = 250 WHERE name = 'flags';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'semantic', order_index = 260 WHERE name = 'tone_selector';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'semantic', order_index = 270 WHERE name = 'length_selector';
-- Estructurales predefinidos (usan STRUCTURAL_CONTAINER con config específica)
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'structural', order_index = 280 WHERE name = 'heading';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'structural', order_index = 290 WHERE name = 'divider';
UPDATE public.ui_component_templates SET template_level = 'preset', category = 'structural', order_index = 300 WHERE name = 'description';

-- ---------------------------------------------------------------------------
-- PASO 5: Plantillas DOMAIN (selectores de contexto)
-- ---------------------------------------------------------------------------
UPDATE public.ui_component_templates SET template_level = 'domain', category = 'brand', order_index = 400 WHERE name = 'brand_selector';
UPDATE public.ui_component_templates SET template_level = 'domain', category = 'brand', order_index = 410 WHERE name = 'product_selector';
UPDATE public.ui_component_templates SET template_level = 'domain', category = 'context', order_index = 420 WHERE name = 'entity_selector';
UPDATE public.ui_component_templates SET template_level = 'domain', category = 'context', order_index = 430 WHERE name = 'audience_selector';

-- campaign_selector: si existe en la tabla, mantener como domain
UPDATE public.ui_component_templates SET template_level = 'domain', category = 'context', order_index = 440 WHERE name = 'campaign_selector';

-- ---------------------------------------------------------------------------
-- PASO 6: updated_at
-- ---------------------------------------------------------------------------
UPDATE public.ui_component_templates SET updated_at = now();

-- Resumen esperado:
-- template_level 'shell'  → 11 filas (string, dropdown, colores, aspect_ratio, scope_picker, image_selector, toggle_switch, num_stepper, range, file, section)
-- template_level 'preset'→ choice_chips, multi_select_chips, radio, checkboxes, selection_checkboxes, tags, flags, tone_selector, length_selector, heading, divider, description
-- template_level 'domain'→ brand_selector, product_selector, entity_selector, audience_selector, campaign_selector
