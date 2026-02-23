-- Consolidación: eliminar plantillas duplicadas/obsoletas e insertar solo las canónicas.
-- Ejecutar en Supabase SQL Editor.
--
-- Duplicados eliminados (misma función, otro nombre/estructura):
--   text, textarea, prompt_input, tag_input → usar "string"
--   select → usar "dropdown"
--   number, stepper_num → usar "num_stepper"
--   checkbox, switch → usar "toggle_switch"
--   checkboxes → usar "selection_checkboxes"
--   radio_buttons → usar "radio" (misma función, nombre distinto)
--   slider → usar "range" (misma función, mismo control)
--   description_block → usar "description" (mismo bloque de texto informativo)
--   multi_select → usar "multi_select_chips" o dropdown con is_multiple (selección múltiple)

-- 1) Eliminar plantillas duplicadas/obsoletas
DELETE FROM public.ui_component_templates
WHERE name IN (
  'text',
  'textarea',
  'prompt_input',
  'tag_input',
  'select',
  'number',
  'stepper_num',
  'checkbox',
  'switch',
  'checkboxes',
  'radio_buttons',
  'slider',
  'description_block',
  'multi_select'
);

-- 2) Insertar solo plantillas canónicas que falten (por name)
INSERT INTO public.ui_component_templates (name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
SELECT v.name, v.description, v.category, v.icon_name, v.base_schema, v.default_ui_config, v.is_active, v.order_index
FROM (VALUES
  ('string', 'Texto (línea, multilínea o prompt)', 'basic', 'textbox', '{"input_type":"string","type":"string","data_type":"string","mode":"single_line","placeholder":"","maxLength":255}'::jsonb, '{}'::jsonb, true, 5),
  ('dropdown', 'Menú desplegable', 'basic', 'caret-down', '{"input_type":"dropdown","type":"dropdown","data_type":"string","options":[{"value":"opcion1","label":"Opción 1"},{"value":"opcion2","label":"Opción 2"}]}'::jsonb, '{}'::jsonb, true, 10),
  ('choice_chips', 'Chips (selección única)', 'basic', 'squares-four', '{"input_type":"choice_chips","type":"choice_chips","data_type":"string","options":[]}'::jsonb, '{}'::jsonb, true, 15),
  ('multi_select_chips', 'Chips (selección múltiple)', 'basic', 'squares-four', '{"input_type":"multi_select_chips","type":"multi_select_chips","data_type":"array","options":[]}'::jsonb, '{}'::jsonb, true, 20),
  ('radio', 'Opciones radio', 'basic', 'radio-button', '{"input_type":"radio","type":"radio","data_type":"string","options":[]}'::jsonb, '{}'::jsonb, true, 25),
  ('selection_checkboxes', 'Checkboxes (múltiple)', 'basic', 'list-checks', '{"input_type":"selection_checkboxes","type":"selection_checkboxes","data_type":"array","options":[{"value":"1","label":"Opción 1"},{"value":"2","label":"Opción 2"}]}'::jsonb, '{}'::jsonb, true, 30),
  ('num_stepper', 'Número con stepper', 'basic', 'caret-up-down', '{"input_type":"num_stepper","type":"num_stepper","data_type":"number","min":0,"max":999,"step":1,"defaultValue":0,"unit":""}'::jsonb, '{}'::jsonb, true, 35),
  ('range', 'Slider', 'controls', 'sliders', '{"input_type":"range","type":"range","data_type":"number","min":0,"max":100,"step":1,"defaultValue":50}'::jsonb, '{}'::jsonb, true, 40),
  ('toggle_switch', 'Switch on/off', 'basic', 'toggle-left', '{"input_type":"toggle_switch","type":"toggle_switch","data_type":"boolean","defaultValue":false}'::jsonb, '{}'::jsonb, true, 45),
  ('tags', 'Etiquetas', 'basic', 'tag', '{"input_type":"tags","type":"tags","data_type":"array","placeholder":"Añade tags...","defaultValue":[]}'::jsonb, '{}'::jsonb, true, 50),
  ('flags', 'Banderas (locale/país)', 'basic', 'flag', '{"input_type":"flags","type":"flags","data_type":"string","options":[{"value":"es","label":"ES"},{"value":"en","label":"EN"}]}'::jsonb, '{}'::jsonb, true, 55),
  ('brand_selector', 'Selector de Marca', 'brand', 'storefront', '{"input_type":"brand_selector","type":"brand_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 140),
  ('entity_selector', 'Selector de Entidad', 'brand', 'package', '{"input_type":"entity_selector","type":"entity_selector","data_type":"object","entityTypes":["product","service"]}'::jsonb, '{}'::jsonb, true, 145),
  ('audience_selector', 'Selector de Audiencia', 'brand', 'users', '{"input_type":"audience_selector","type":"audience_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 150),
  ('product_selector', 'Selector de Producto', 'brand', 'shopping-bag', '{"input_type":"product_selector","type":"product_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 148),
  ('image_selector', 'Selector de Imagen', 'media', 'image', '{"input_type":"image_selector","type":"image_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 170),
  ('tone_selector', 'Tono de Voz', 'semantic', 'microphone', '{"input_type":"tone_selector","type":"tone_selector","data_type":"string","options":[{"value":"profesional","label":"Profesional"},{"value":"casual","label":"Casual"}]}'::jsonb, '{}'::jsonb, true, 160),
  ('length_selector', 'Longitud del contenido', 'semantic', 'text-align-left', '{"input_type":"length_selector","type":"length_selector","data_type":"string","options":[{"value":"corto","label":"Corto"},{"value":"medio","label":"Medio"},{"value":"largo","label":"Largo"}]}'::jsonb, '{}'::jsonb, true, 165),
  ('section', 'Sección (agrupador)', 'structural', 'layout', '{"input_type":"section","type":"section","data_type":"object"}'::jsonb, '{}'::jsonb, true, 200),
  ('divider', 'Divisor', 'structural', 'minus', '{"input_type":"divider","type":"divider","data_type":"string"}'::jsonb, '{}'::jsonb, true, 201),
  ('heading', 'Título', 'structural', 'text-h', '{"input_type":"heading","type":"heading","data_type":"string"}'::jsonb, '{}'::jsonb, true, 202),
  ('description', 'Descripción', 'structural', 'info', '{"input_type":"description","type":"description","data_type":"string"}'::jsonb, '{}'::jsonb, true, 203)
) AS v(name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates t WHERE t.name = v.name);
