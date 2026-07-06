# Inputs de programación para flujos automatizados

## Contexto

Los flujos con `flow_category_type = 'automated'` no tienen formulario de entrada para el usuario final (no se ejecutan desde la librería con un form). En su lugar, el usuario **programa una tarea** que el sistema ejecutará en el momento configurado. Esa programación se guarda en `flow_schedules`.

## Análisis de `flow_schedules`

Cada fila es una **tarea programada** de un flujo automatizado. Los campos que el usuario puede personalizar al crear/editar la tarea son los "inputs" de este contexto:

| Columna `flow_schedules` | Descripción | Tipo lógico | input_type propuesto |
|--------------------------|-------------|-------------|----------------------|
| `cron_expression` | Cuándo se ejecuta (ej. todos los días a las 9:00) | programación | `cron_schedule` |
| `brand_id` | Marca (contexto) | uuid | `brand_selector` (existente) |
| `entity_id` | Entidad (producto/servicio) | uuid | `entity_selector` (existente) |
| `campaign_id` | Campaña | uuid | `campaign_selector` (existente) |
| `audience_id` | Audiencia | uuid | `audience_selector` (existente) |
| `aspect_ratio` | Relación de aspecto (1:1, 9:16, 16:9, 4:5) | string | `aspect_ratio` (existente, opciones acotadas) |
| `production_count` | Nº de producciones por ejecución | number | `number` / `stepper` |
| `production_specifications` | Especificaciones de producción (texto libre) | text | `string` / `textarea` |
| `metadata_config` | Config extra (JSON) | object | opcional, avanzado |
| `job_name` | Nombre de la tarea (identificador legible) | string | `string` |
| `is_active` | Tarea activa o pausada | boolean | `toggle_switch` (existente) |

Así, el usuario puede **personalizar la programación** (horario), la **entidad**, **campaña**, **audiencia**, **aspect_ratio**, cuántas producciones y texto de especificaciones.

## Objetivo: input_types solo para flujos "automated"

1. **Reutilizar** input_types ya existentes donde aplique: `entity_selector`, `campaign_selector`, `audience_selector`, `aspect_ratio`, `number`, `string`, `textarea`, `toggle_switch`, `brand_selector`.
2. **Añadir** un input_type nuevo exclusivo de este contexto: **`cron_schedule`** (selector de programación de horas / expresión cron o presets como "Diario 9:00", "Cada 6 horas").
3. **Definir** los campos de programación en **`flow_modules.input_schema`** del primer módulo: mismo formato que para flujos manuales; para flujos `flow_category_type = 'automated'` ese `input_schema` define qué campos ve quien programa la tarea.

## Schema: un solo formato en `flow_modules.input_schema`

### 1. `flow_modules.input_schema` (primer módulo del flujo)

Para **manual** y **automated** los formatos de entrada viven en `flow_modules.input_schema`. En flujos automatizados, ese schema se usa para el formulario "Programar tarea" (Studio) y para el canvas del Builder.

```json
{
  "fields": [
    { "key": "cron_expression", "label": "Programación", "input_type": "cron_schedule", "required": true },
    { "key": "entity_id", "label": "Entidad", "input_type": "entity_selector", "required": false },
    { "key": "campaign_id", "label": "Campaña", "input_type": "campaign_selector", "required": false },
    { "key": "audience_id", "label": "Audiencia", "input_type": "audience_selector", "required": false },
    { "key": "aspect_ratio", "label": "Formato", "input_type": "aspect_ratio", "options": ["1:1", "9:16", "16:9", "4:5"], "required": true },
    { "key": "production_count", "label": "Producciones por ejecución", "input_type": "number", "min": 1, "max": 10, "defaultValue": 1 },
    { "key": "production_specifications", "label": "Especificaciones", "input_type": "textarea", "required": false }
  ]
}
```

Así el desarrollador define en el Builder (canvas del primer módulo) qué campos de programación se muestran y con qué control.

### 2. `ui_component_templates.for_flow_type` (opcional)

Para mostrar en el Builder solo plantillas relevantes según el tipo de flujo:

- `NULL` o vacío: se muestra en manual y en automated.
- `'manual'`: solo flujos manuales (formulario de entrada del usuario).
- `'automated'`: solo flujos automatizados (configuración de la programación, schedule_schema).

Plantillas exclusivas de **automated** (ejemplo):

- `cron_schedule`: selector de programación (presets + cron expression).
- El resto (entity_selector, campaign_selector, audience_selector, aspect_ratio, number, textarea) se reutilizan; se pueden marcar como `for_flow_type = 'automated'` en copias específicas si se quiere una lista separada en el Builder para "Configuración de programación".

## Resumen

- **flow_schedules** ya tiene las columnas que el usuario configura al programar una tarea (cron, entidad, campaña, audiencia, aspect_ratio, production_count, etc.).
- Los **input_types** para este contexto son en su mayoría existentes; el único nuevo necesario es **cron_schedule** (programación de horas).
- Los campos de programación se definen en **flow_modules.input_schema** (primer módulo); no existe columna `schedule_schema` en `content_flows` para evitar redundancia.
- Opcional: **for_flow_type** en `ui_component_templates` para filtrar plantillas por tipo de flujo (manual vs automated).
