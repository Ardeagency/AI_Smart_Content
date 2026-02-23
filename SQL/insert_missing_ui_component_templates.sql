-- Insertar plantillas del frontend que aún no existen en ui_component_templates.
-- Las que ya tienes (por name) son: string, dropdown, num_stepper, checkboxes, radio_buttons,
-- choice_chips, multi_select_chips, toggle_switch, slider, section, divider, heading, description.
-- Este script añade el resto para poder configurarlas una por una.
-- Ejecutar en Supabase SQL Editor.

INSERT INTO public.ui_component_templates (name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
SELECT v.name, v.description, v.category, v.icon_name, v.base_schema, v.default_ui_config, v.is_active, v.order_index
FROM (VALUES
  ('text', 'Texto corto (una línea)', 'basic', 'textbox', '{"input_type":"text","type":"text","data_type":"string","placeholder":"","maxLength":255}'::jsonb, '{}'::jsonb, true, 5),
  ('textarea', 'Texto largo (multilínea)', 'basic', 'article', '{"input_type":"textarea","type":"textarea","data_type":"string","placeholder":"","rows":4,"maxLength":2000}'::jsonb, '{}'::jsonb, true, 15),
  ('prompt_input', 'Prompt para generación con IA', 'smart_text', 'terminal', '{"input_type":"prompt_input","type":"prompt_input","data_type":"string","placeholder":"Describe el contenido...","rows":6}'::jsonb, '{}'::jsonb, true, 25),
  ('tag_input', 'Tags (texto)', 'smart_text', 'tag', '{"input_type":"tag_input","type":"tag_input","data_type":"array","placeholder":"Añade tags..."}'::jsonb, '{}'::jsonb, true, 26),
  ('select', 'Lista desplegable', 'basic', 'list-bullets', '{"input_type":"select","type":"select","data_type":"string","options":[]}'::jsonb, '{}'::jsonb, true, 22),
  ('number', 'Campo numérico', 'basic', 'hash', '{"input_type":"number","type":"number","data_type":"number","min":0,"max":100,"step":1}'::jsonb, '{}'::jsonb, true, 35),
  ('stepper_num', 'Número con botones subir/bajar (Stepper)', 'controls', 'caret-up-down', '{"input_type":"stepper_num","type":"stepper_num","data_type":"number","min":0,"max":999,"step":1,"defaultValue":0,"unit":""}'::jsonb, '{}'::jsonb, true, 38),
  ('checkbox', 'Casilla de verificación (una)', 'basic', 'check-square', '{"input_type":"checkbox","type":"checkbox","data_type":"boolean","defaultValue":false}'::jsonb, '{}'::jsonb, true, 45),
  ('radio', 'Opciones mutuamente excluyentes (radio)', 'basic', 'radio-button', '{"input_type":"radio","type":"radio","data_type":"string","options":[]}'::jsonb, '{}'::jsonb, true, 52),
  ('selection_checkboxes', 'Lista de casillas por opción', 'basic', 'list-checks', '{"input_type":"selection_checkboxes","type":"selection_checkboxes","data_type":"array","display_style":"selection_checkboxes","options":[{"value":"1","label":"Opción 1"},{"value":"2","label":"Opción 2"}]}'::jsonb, '{}'::jsonb, true, 55),
  ('range', 'Control deslizante (slider)', 'controls', 'sliders', '{"input_type":"range","type":"range","data_type":"number","min":0,"max":100,"step":1,"defaultValue":50}'::jsonb, '{}'::jsonb, true, 88),
  ('switch', 'Interruptor on/off', 'controls', 'toggle-left', '{"input_type":"switch","type":"switch","data_type":"boolean","defaultValue":false}'::jsonb, '{}'::jsonb, true, 58),
  ('tags', 'Etiquetas añadibles/eliminables', 'basic', 'tag', '{"input_type":"tags","type":"tags","data_type":"array","placeholder":"Añade tags...","defaultValue":[]}'::jsonb, '{}'::jsonb, true, 65),
  ('flags', 'Selector tipo banderas (locale/país)', 'basic', 'flag', '{"input_type":"flags","type":"flags","data_type":"string","options":[{"value":"es","label":"ES"},{"value":"en","label":"EN"},{"value":"fr","label":"FR"}]}'::jsonb, '{}'::jsonb, true, 75),
  ('brand_selector', 'Selector de Marca', 'brand', 'storefront', '{"input_type":"brand_selector","type":"brand_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 140),
  ('entity_selector', 'Selector de Entidad (producto/servicio)', 'brand', 'package', '{"input_type":"entity_selector","type":"entity_selector","data_type":"object","entityTypes":["product","service"]}'::jsonb, '{}'::jsonb, true, 145),
  ('audience_selector', 'Selector de Audiencia', 'brand', 'users', '{"input_type":"audience_selector","type":"audience_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 150),
  ('tone_selector', 'Tono de Voz', 'semantic', 'microphone', '{"input_type":"tone_selector","type":"tone_selector","data_type":"string","options":[{"value":"profesional","label":"Profesional"},{"value":"casual","label":"Casual"},{"value":"inspirador","label":"Inspirador"}]}'::jsonb, '{}'::jsonb, true, 160),
  ('length_selector', 'Longitud del contenido', 'semantic', 'text-align-left', '{"input_type":"length_selector","type":"length_selector","data_type":"string","options":[{"value":"corto","label":"Corto"},{"value":"medio","label":"Medio"},{"value":"largo","label":"Largo"}]}'::jsonb, '{}'::jsonb, true, 165),
  ('image_selector', 'Selector de Imagen', 'media', 'image', '{"input_type":"image_selector","type":"image_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 170),
  ('product_selector', 'Selector de Producto', 'brand', 'shopping-bag', '{"input_type":"product_selector","type":"product_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 148)
) AS v(name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates t WHERE t.name = v.name);
