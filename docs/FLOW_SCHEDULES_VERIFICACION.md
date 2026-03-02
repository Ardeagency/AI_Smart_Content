# Verificación: flujo automatizado → programable como task (flow_schedules)

Para que un flujo con `flow_category_type = 'automated'` pueda ser **programado** como tarea, debe cumplirse la relación entre `content_flows.schedule_schema` y la tabla `flow_schedules`, más el trigger que sincroniza con el cron.

---

## 1. Relación lógica

| Origen | Uso |
|--------|-----|
| **content_flows.schedule_schema** | Define *qué campos* ve quien programa la tarea (Builder y/o pantalla “Programar”). Se guarda en el flujo y se usa para generar el formulario de programación. |
| **flow_schedules** | Cada fila = una *tarea programada* (cuándo corre, con qué entidad/campaña/audiencia, etc.). Obligatorios: `cron_expression`, `job_name`. |
| **Trigger `tr_sync_flow_cron`** | Después de INSERT/UPDATE/DELETE en `flow_schedules`, ejecuta `sync_flow_to_cron()` para mantener el sistema de cron (n8n, pg_cron, etc.) al día. |

---

## 2. Mapeo: schedule_schema.fields → flow_schedules

El `DEFAULT_SCHEDULE_SCHEMA` del Builder (DevBuilderView.js) y la doc (AUTOMATED_FLOW_SCHEDULE_INPUTS.md) definen campos que deben corresponder a columnas de `flow_schedules`:

| schedule_schema field (key) | flow_schedules columna | Notas |
|-----------------------------|-------------------------|--------|
| `cron_expression` | `cron_expression` | NOT NULL. Requerido para programar. |
| `entity_id` | `entity_id` o `entity_ids` | Ver diferencia de esquema más abajo. |
| `campaign_id` | `campaign_id` o `campaign_ids` | Idem. |
| `audience_id` | `audience_id` o `audience_ids` | Idem. |
| `aspect_ratio` | `aspect_ratio` | CHECK 1:1, 9:16, 16:9, 4:5. |
| `production_count` | `production_count` | Entero, default 1. |
| `production_specifications` | `production_specifications` | Texto. |

Además, al **crear** una fila en `flow_schedules` hacen falta:

- `job_name`: NOT NULL, UNIQUE (identificador legible de la tarea).
- `flow_id`: flujo que se programa (FK a content_flows).
- `user_id` / `brand_id`: según tu modelo de permisos y contexto.

**Conclusión:** Los campos del `schedule_schema` están alineados con las columnas de `flow_schedules` que el código y la doc asumen. Si en tu BD usas `entity_ids`, `campaign_ids`, `audience_ids` (arrays), el mapeo lógico es el mismo; solo cambia el tipo y cómo se escribe/lee en el backend o en una API.

---

## 3. Diferencia de esquema: repo vs tu definición

En el repo (SQL/schema.sql), `flow_schedules` tiene:

- `entity_id uuid`, `campaign_id uuid`, `audience_id uuid` (singular, uno por fila).

Tú has indicado un esquema con:

- `entity_ids uuid[]`, `campaign_ids uuid[]`, `audience_ids uuid[]`
- `composition_mode text null default 'individual'`
- Trigger: `tr_sync_flow_cron` AFTER INSERT OR DELETE OR UPDATE ON flow_schedules FOR EACH ROW EXECUTE FUNCTION sync_flow_to_cron();`

**Qué hacer:**

- Si la **BD real** usa `entity_ids`/`campaign_ids`/`audience_ids` y `composition_mode`, hay que:
  - Actualizar el schema del repo (o una migración) para reflejar esas columnas.
  - En el backend/API que crea o actualiza `flow_schedules`, rellenar esos arrays (y `composition_mode`) en lugar de los singulares, o mapear desde el formulario generado por `schedule_schema`.
- Si la BD real sigue con `entity_id`/`campaign_id`/`audience_id` (singular), el código actual de TasksView (select/update por `entity_id`, `campaign_id`, `audience_id`) está alineado con el schema del repo.

---

## 4. Trigger `tr_sync_flow_cron`

- En el repo **no** existe la función `sync_flow_to_cron()` ni el trigger `tr_sync_flow_cron`.
- Para que “programar” como task tenga efecto en el cron real, hace falta:
  - Crear la función `sync_flow_to_cron()` (por ejemplo en pl/pgsql o llamando a un job que actualice pg_cron/n8n/otro).
  - Crear el trigger tal como lo indicaste.

El trigger y la función `sync_flow_to_cron` ya existen en la base de datos; no se incluyen en el repo.

---

## 5. Creación de filas en flow_schedules (INSERT)

- **TasksView** solo hace **SELECT** y **UPDATE** sobre `flow_schedules`; no hay **INSERT** en el frontend.
- El mensaje en la UI dice que las tareas se crean “al programar un flujo desde el Estudio”.
- En el código actual **no** hay implementado el flujo “programar este flujo” que haga INSERT en `flow_schedules` (ni en Builder ni en TasksView ni en Studio que hayamos revisado).

Para que un flujo automatizado sea realmente “programable” como task hace falta:

1. Algún flujo de UI/API que, a partir de un `content_flow` con `flow_category_type = 'automated'` y su `schedule_schema`, muestre un formulario con los campos del schema (cron, entity, campaign, audience, aspect_ratio, production_count, etc.).
2. Al enviar ese formulario, hacer **INSERT** en `flow_schedules` con:
   - `cron_expression`, `job_name` (obligatorios),
   - `flow_id`, `user_id`, `brand_id` (según modelo),
   - y el resto de columnas mapeadas desde los valores del formulario (entity_id(s), campaign_id(s), audience_id(s), aspect_ratio, production_count, production_specifications, composition_mode si aplica).
3. Que el trigger `tr_sync_flow_cron` exista y ejecute `sync_flow_to_cron()` para que el sistema de cron use la nueva fila.

---

## 6. Checklist rápido

| Requisito | Estado en repo |
|-----------|----------------|
| content_flows.schedule_schema definido y guardado | Sí (Builder guarda schedule_schema). |
| schedule_schema.fields alineados con columnas de flow_schedules | Sí (cron_expression, entity_id, campaign_id, audience_id, aspect_ratio, production_count, production_specifications). |
| flow_schedules en schema.sql | Sí (con entity_id, campaign_id, audience_id singulares). |
| Tu BD con entity_ids/campaign_ids/audience_ids y composition_mode | Pendiente de alinear en repo/migración si aplica. |
| Trigger tr_sync_flow_cron + sync_flow_to_cron() | Ya existen en la BD (no en repo). |
| INSERT en flow_schedules (programar flujo) | No implementado en el frontend revisado. |

Si quieres, el siguiente paso puede ser: (1) añadir un stub de `sync_flow_to_cron` + trigger en SQL, y (2) esbozar el flujo (o endpoint) para crear una fila en `flow_schedules` desde el formulario generado por `schedule_schema`.
