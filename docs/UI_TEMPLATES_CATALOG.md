# Catálogo de Componentes (Dev Builder)

> Última actualización: 2026-03-09

La tabla `ui_component_templates` ahora está organizada por **categorías creativas** para que el desarrollador arrastre bloques como si fuese un editor visual (Figma/Wix). Cada componente ya trae `container_type`, `options`, `validaciones` y `default_ui_config` para minimizar trabajo manual.

## Bloques creativos

| Categoría | Propósito | Ejemplos |
|-----------|-----------|----------|
| **Presets** | Combos listos (lighting + cámara + mensaje). | `preset_editorial_macro`, `preset_dark_luxury_hero` |
| **Estilo & Cámara** | Look & feel, óptica, composición. | `lighting_style`, `camera_angle`, `lens_focal_length`, `depth_of_field`, `shot_type`, `composition_structure`, `finish_type` |
| **Motion & Perspectiva** | Movimiento de cámara, puntos de fuga, framerate. | `camera_movement`, `shot_speed`, `perspective_grid`, `vanishing_point_bias`, `parallax_layers`, `focus_pull`, `camera_roll`, `motion_style_video`, `frame_rate_style`, `transition_anchor` |
| **Escenarios** | Fondos, props, atmósferas. | `background_type`, `environment_theme`, `props_density`, `colores` |
| **Protagonistas** | Personas, atributos físicos. | `hair_style`, `hair_color`, `eye_color`, `ethnicity_profile`, `flags` |
| **Branding & Copy** | Tono, mensaje, espacios para overlays. | `brand_positioning`, `message_focus`, `tags`, `tone_selector`, `overlay_safe_zone`, `cta_layering`, `length_selector` |
| **Distribución / Operación** | Formatos, horarios, alcance. | `aspect_ratio`, `cron_schedule`, `scope_picker` |
| **Contexto & Productos** | Datos de marca, entidades, audiencias. | `brand_selector`, `entity_selector`, `product_selector`, `audience_selector` |
| **Media / Referencias** | Archivos de soporte. | `image_selector`, `file` |
| **Controles UI** | Componentes de formulario genéricos. | `dropdown`, `choice_chips`, `multi_select_chips`, `radio`, `selection_checkboxes`, `checkboxes`, `toggle_switch`, `range`, `num_stepper` |
| **Básicos** | Campos primarios (texto, números). | `string` |
| **Estructura** | Layout dentro del formulario. | `section`, `heading`, `divider`, `description` |

Cada plantilla mantiene `template_level` (shell, core, domain, preset) y `for_flow_type` (`automated` cuando sólo aplica a cronjobs).

## JSON de referencia

El inventario completo se genera en tiempo real desde la API (`/rest/v1/ui_component_templates`). Ejecutar:

```bash
supabase functions invoke ui-templates-snapshot
# o
curl -H "apikey: <service_role>" \
  "https://tsdpbqcwjckbfsdqacam.supabase.co/rest/v1/ui_component_templates?select=*"
```

Guarda el resultado en `docs/ui_component_templates.snapshot.json` si necesitas un backup.

---

Si necesitas una nueva plantilla:
1. Define la categoría creativa.
2. Lista las opciones (si aplica) y la validación mínima.
3. Yo la incorporo al catálogo con su `container_type` y defaults.
