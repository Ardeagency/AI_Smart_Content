-- Migración: Lista canónica de plantillas Builder V1
-- 1) Desactiva plantillas duplicadas/variantes (is_active = false), sin borrar historial.
-- 2) Inserta plantillas canónicas si no existen.
-- @see docs/INPUT_TAXONOMY.md y análisis de duplicados (string/select/number/boolean/range estructurales).

-- Desactivar solo variantes/duplicados (no los nombres canónicos que ya existan)
UPDATE public.ui_component_templates
SET is_active = false
WHERE name IN (
  'text', 'textarea', 'prompt_input', 'tag_input', 'tags',
  'dropdown', 'choice_chips', 'multi_select_chips', 'flags',
  'tone_selector', 'length_selector', 'brand_selector', 'entity_selector',
  'audience_selector', 'campaign_selector', 'product_selector',
  'stepper_num', 'num_stepper', 'slider',
  'checkbox', 'switch', 'toggle_switch',
  'radio', 'selection_checkboxes',
  'image_selector'
);

-- Actualizar filas existentes con nombre canónico al base_schema nuevo
UPDATE public.ui_component_templates SET description = 'Selector (desplegable o chips, una/varias opciones)', category = 'inputs', icon_name = 'list-bullets', base_schema = '{"input_type":"select","type":"select","data_type":"string","ui_variant":"dropdown","selection_mode":"single","data_source":"static","options":[{"value":"opcion1","label":"Opción 1"},{"value":"opcion2","label":"Opción 2"}]}'::jsonb, order_index = 20 WHERE name = 'select';
UPDATE public.ui_component_templates SET description = 'Número (campo o stepper)', category = 'inputs', icon_name = 'hash', base_schema = '{"input_type":"number","type":"number","data_type":"number","ui_variant":"input","min":0,"max":100,"step":1}'::jsonb, order_index = 30 WHERE name = 'number';
UPDATE public.ui_component_templates SET description = 'Slider min/max/step', category = 'inputs', icon_name = 'sliders', base_schema = '{"input_type":"range","type":"range","data_type":"number","min":0,"max":100,"step":1,"defaultValue":50}'::jsonb, order_index = 70 WHERE name = 'range';
UPDATE public.ui_component_templates SET description = 'Sección (agrupador)', category = 'structural', icon_name = 'square', base_schema = '{"input_type":"section","type":"section"}'::jsonb, order_index = 400 WHERE name = 'section';
UPDATE public.ui_component_templates SET description = 'Divisor', category = 'structural', icon_name = 'minus', base_schema = '{"input_type":"divider","type":"divider"}'::jsonb, order_index = 410 WHERE name = 'divider';

-- Insertar plantillas canónicas que no existan (todas; WHERE NOT EXISTS evita duplicar)
INSERT INTO public.ui_component_templates (name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
SELECT v.name, v.description, v.category, v.icon_name, v.base_schema, v.default_ui_config, true, v.order_index
FROM (VALUES
  ('string', 'Texto (una línea, multilínea, prompt o tags según modo)', 'inputs', 'textbox',
   '{"input_type":"string","type":"string","data_type":"string","mode":"single_line","placeholder":"","maxLength":255}'::jsonb, '{}'::jsonb, 10),
  ('select', 'Selector (desplegable o chips, una/varias opciones)', 'inputs', 'list-bullets',
   '{"input_type":"select","type":"select","data_type":"string","ui_variant":"dropdown","selection_mode":"single","data_source":"static","options":[{"value":"opcion1","label":"Opción 1"},{"value":"opcion2","label":"Opción 2"}]}'::jsonb, '{}'::jsonb, 20),
  ('number', 'Número (campo o stepper)', 'inputs', 'hash',
   '{"input_type":"number","type":"number","data_type":"number","ui_variant":"input","min":0,"max":100,"step":1}'::jsonb, '{}'::jsonb, 30),
  ('boolean', 'Sí/No (checkbox o switch)', 'inputs', 'check-square',
   '{"input_type":"boolean","type":"boolean","data_type":"boolean","ui_variant":"checkbox","defaultValue":false}'::jsonb, '{}'::jsonb, 40),
  ('radio_group', 'Opción única (radio)', 'inputs', 'radio-button',
   '{"input_type":"radio_group","type":"radio_group","data_type":"string","options":[{"value":"a","label":"Opción A"},{"value":"b","label":"Opción B"}]}'::jsonb, '{}'::jsonb, 50),
  ('checkbox_group', 'Opciones múltiples (casillas)', 'inputs', 'list-checks',
   '{"input_type":"checkbox_group","type":"checkbox_group","data_type":"array","options":[{"value":"1","label":"Opción 1"},{"value":"2","label":"Opción 2"}]}'::jsonb, '{}'::jsonb, 60),
  ('range', 'Slider min/max/step', 'inputs', 'sliders',
   '{"input_type":"range","type":"range","data_type":"number","min":0,"max":100,"step":1,"defaultValue":50}'::jsonb, '{}'::jsonb, 70),
  ('media_selector', 'Selector de medio (imagen/galería)', 'inputs', 'image',
   '{"input_type":"media_selector","type":"media_selector","data_type":"object"}'::jsonb, '{}'::jsonb, 80),
  ('file_upload', 'Subir archivo', 'inputs', 'upload-simple',
   '{"input_type":"file_upload","type":"file_upload","data_type":"object"}'::jsonb, '{}'::jsonb, 90),
  ('section', 'Sección (agrupador)', 'structural', 'square',
   '{"input_type":"section","type":"section"}'::jsonb, '{}'::jsonb, 400),
  ('divider', 'Divisor', 'structural', 'minus',
   '{"input_type":"divider","type":"divider"}'::jsonb, '{}'::jsonb, 410),
  ('heading', 'Título', 'structural', 'type',
   '{"input_type":"heading","type":"heading","text":"Título","level":2}'::jsonb, '{}'::jsonb, 420),
  ('description', 'Texto informativo', 'structural', 'align-left',
   '{"input_type":"description","type":"description","text":""}'::jsonb, '{}'::jsonb, 430)
) AS v(name, description, category, icon_name, base_schema, default_ui_config, order_index)
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates t WHERE t.name = v.name);
