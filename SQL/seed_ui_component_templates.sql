-- Seed de plantillas de inputs (taxonomía schema-driven)
-- Ejecutar una vez. No duplica si ya existe una fila con el mismo name.
-- @see docs/INPUT_TAXONOMY.md

INSERT INTO public.ui_component_templates (name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
SELECT * FROM (VALUES
  ('text', 'Texto corto (una línea)', 'basic', 'textbox', '{"input_type":"text","type":"text","data_type":"string","placeholder":"","maxLength":255}'::jsonb, '{}'::jsonb, true, 10),
  ('textarea', 'Texto largo (multilínea)', 'basic', 'article', '{"input_type":"textarea","type":"textarea","data_type":"string","placeholder":"","rows":4,"maxLength":2000}'::jsonb, '{}'::jsonb, true, 20),
  ('prompt_input', 'Prompt para IA', 'smart_text', 'terminal', '{"input_type":"prompt_input","type":"prompt_input","data_type":"string","placeholder":"Describe el contenido...","rows":6}'::jsonb, '{}'::jsonb, true, 25),
  ('tag_input', 'Tags / palabras clave', 'smart_text', 'tag', '{"input_type":"tag_input","type":"tag_input","data_type":"array","placeholder":"Añade tags..."}'::jsonb, '{}'::jsonb, true, 26),
  ('select', 'Lista desplegable', 'basic', 'list-bullets', '{"input_type":"select","type":"select","data_type":"string","options":[]}'::jsonb, '{}'::jsonb, true, 30),
  ('dropdown', 'Dropdown', 'basic', 'caret-down', '{"input_type":"dropdown","type":"dropdown","data_type":"string","options":[{"value":"opcion1","label":"Opción 1"},{"value":"opcion2","label":"Opción 2"}]}'::jsonb, '{}'::jsonb, true, 32),
  ('number', 'Número', 'basic', 'hash', '{"input_type":"number","type":"number","data_type":"number","min":0,"max":100,"step":1}'::jsonb, '{}'::jsonb, true, 40),
  ('checkbox', 'Casilla de verificación', 'basic', 'check-square', '{"input_type":"checkbox","type":"checkbox","data_type":"boolean","defaultValue":false}'::jsonb, '{}'::jsonb, true, 50),
  ('radio', 'Opciones (una elegida)', 'basic', 'radio-button', '{"input_type":"radio","type":"radio","data_type":"string","options":[]}'::jsonb, '{}'::jsonb, true, 60),
  ('range', 'Slider numérico', 'controls', 'sliders', '{"input_type":"range","type":"range","data_type":"number","min":0,"max":100,"step":1,"defaultValue":50}'::jsonb, '{}'::jsonb, true, 70),
  ('switch', 'Interruptor on/off', 'controls', 'toggle-left', '{"input_type":"switch","type":"switch","data_type":"boolean","defaultValue":false}'::jsonb, '{}'::jsonb, true, 75),
  ('brand_selector', 'Selector de marca', 'brand', 'storefront', '{"input_type":"brand_selector","type":"brand_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 100),
  ('entity_selector', 'Selector de entidad (producto/servicio)', 'brand', 'package', '{"input_type":"entity_selector","type":"entity_selector","data_type":"object","entityTypes":["product","service"]}'::jsonb, '{}'::jsonb, true, 110),
  ('audience_selector', 'Selector de audiencia', 'brand', 'users', '{"input_type":"audience_selector","type":"audience_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 120),
  ('campaign_selector', 'Selector de campaña', 'brand', 'megaphone', '{"input_type":"campaign_selector","type":"campaign_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 130),
  ('tone_selector', 'Tono de voz', 'semantic', 'microphone', '{"input_type":"tone_selector","type":"tone_selector","data_type":"string","options":[{"value":"profesional","label":"Profesional"},{"value":"casual","label":"Casual"},{"value":"inspirador","label":"Inspirador"}]}'::jsonb, '{}'::jsonb, true, 200),
  ('length_selector', 'Longitud del contenido', 'semantic', 'text-align-left', '{"input_type":"length_selector","type":"length_selector","data_type":"string","options":[{"value":"corto","label":"Corto"},{"value":"medio","label":"Medio"},{"value":"largo","label":"Largo"}]}'::jsonb, '{}'::jsonb, true, 210),
  ('image_selector', 'Selector de imagen', 'media', 'image', '{"input_type":"image_selector","type":"image_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 300),
  ('product_selector', 'Selector de producto', 'brand', 'shopping-bag', '{"input_type":"product_selector","type":"product_selector","data_type":"object"}'::jsonb, '{}'::jsonb, true, 115),
  ('section', 'Sección (agrupador)', 'structural', 'square', '{"input_type":"section","type":"section"}'::jsonb, '{}'::jsonb, true, 400),
  ('divider', 'Divisor', 'structural', 'minus', '{"input_type":"divider","type":"divider"}'::jsonb, '{}'::jsonb, true, 410)
) AS v(name, description, category, icon_name, base_schema, default_ui_config, is_active, order_index)
WHERE NOT EXISTS (SELECT 1 FROM public.ui_component_templates t WHERE t.name = v.name);
