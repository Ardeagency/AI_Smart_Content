# Actualización del sistema de desarrolladores al nuevo schema (flujos, logs, runs, módulos)

Este documento describe las diferencias entre el código actual del portal de desarrolladores y el schema actualizado en `SQL/schema.sql`, y cómo actualizar cada parte.

**Estado:** Implementado (DevTestView, DevWebhooksView, DevLogsView, DevDashboardView y RLS actualizados).

---

## 1. Resumen del nuevo modelo de datos

| Concepto | Antes (asumido en código) | Ahora (schema) |
|----------|---------------------------|----------------|
| **Webhooks** | Por flujo (`content_flows.webhook_url` o `flow_technical_details` por flujo) | Por **módulo**: `flow_modules.webhook_url_test` / `webhook_url_prod`; opcionalmente `flow_technical_details` por `flow_module_id` |
| **Detalles técnicos** | `flow_technical_details.flow_id` | `flow_technical_details.flow_module_id` (uno por módulo) |
| **Inputs de una ejecución** | `flow_runs.inputs_used` (JSONB en la misma fila) | Tabla **`runs_inputs`**: `run_id`, `flow_module_id`, `input_data` |
| **Outputs de una ejecución** | Implícito o en `flow_runs` | Tabla **`runs_outputs`**: `run_id`, `flow_module_id`, `output_type`, `generated_copy`, etc. |
| **Logs** | Solo `flow_id` y `run_id` | `developer_logs` tiene además **`flow_module_id`** (opcional) para ubicar el error en un paso |

Relaciones clave:

- **content_flows** 1 → N **flow_modules** (cada flujo puede tener varios pasos/módulos).
- **flow_modules**: `webhook_url_test`, `webhook_url_prod`, `input_schema`, `output_schema`, `step_order`.
- **flow_technical_details**: vinculado a **flow_module_id** (no a flow_id); campos de plataforma (n8n, editor_url, health, etc.).
- **flow_runs**: ya no tiene `inputs_used`; los inputs van en **runs_inputs** (por run y opcionalmente por módulo).
- **developer_logs**: tiene `flow_module_id` opcional para asociar el log a un módulo concreto.

---

## 2. Cambios por archivo / área

### 2.1 DevTestView.js

| Ubicación | Problema | Cambio recomendado |
|-----------|----------|--------------------|
| **loadTechnicalDetails(flowId)** | Usa `flow_technical_details.eq('flow_id', flowId)`. En el schema no existe `flow_id`; la FK es `flow_module_id`. | 1) Obtener el (o los) módulo del flujo: `flow_modules.select('id, webhook_url_test, webhook_url_prod, input_schema').eq('content_flow_id', flowId)`. 2) Para “detalles técnicos” (plataforma, editor, health): cargar `flow_technical_details` por `flow_module_id` del primer módulo (o el que corresponda al paso que se está probando). |
| **updateWebhookInfo()** | Usa `this.technicalDetails?.webhook_url_test` y `this.selectedFlow?.webhook_url`. | Las URLs deben salir de **flow_modules** (y opcionalmente fallback desde technical details si se mantiene una copia). En el schema canónico las URLs están solo en `flow_modules`. |
| **runTest() – insert flow_runs** | Inserta `inputs_used: inputs` en `flow_runs`. | El schema no tiene columna `inputs_used`. Crear el run sin ese campo y luego insertar en **runs_inputs**: `run_id`, `flow_module_id` (del módulo que se está probando), `input_data: inputs`. |
| **runTest() – developer_logs** | Inserta solo `flow_id`, `run_id`, `environment`, etc. | Añadir **flow_module_id** si en el test se conoce el módulo (p. ej. el único módulo del flujo o el paso que falló). |
| **loadRunHistory()** | Hace `select(..., inputs_used, ...)` de `flow_runs`. | Quitar `inputs_used` del select. Para cada run, los inputs se obtienen de **runs_inputs** (por ejemplo el primer registro por `run_id`, o el que tenga `flow_module_id` del módulo actual). |
| **showRunDetail() / loadInputsFromRun()** | Usan `run.inputs_used`. | Cargar inputs desde **runs_inputs**: filtrar por `run_id` y, si hay varios, por `flow_module_id` del módulo en uso; usar `input_data` en lugar de `inputs_used`. |

Resumen: en DevTestView hay que pasar de “un flujo = un webhook y un bloque de inputs en flow_runs” a “flujo → módulo(s) → webhooks e inputs en flow_modules y runs_inputs”.

---

### 2.2 DevWebhooksView.js

| Ubicación | Problema | Cambio recomendado |
|-----------|----------|--------------------|
| **loadWebhooks()** | Hace `content_flows.select(..., flow_technical_details(...)).eq('owner_id', ...)`. En el schema no hay relación directa `content_flows` → `flow_technical_details`; la relación es **content_flows** → **flow_modules** → **flow_technical_details**. Además, las URLs de webhook están en **flow_modules**, no en `flow_technical_details`. | Cargar flujos con sus **módulos** y, por módulo, detalles técnicos. Por ejemplo: `content_flows.select('id, name, status, run_count, flow_modules(id, name, step_order, webhook_url_test, webhook_url_prod, flow_technical_details(...)))`. Cada fila de “webhook” en la tabla debería ser un **flow_module** (flujo + nombre de módulo), con URLs en el módulo y estado/plataforma en `flow_technical_details` si existe. |
| **applyFilters() / updateStats()** | Usan `w.technical?.webhook_url_test`, `webhook_url_prod`, `is_healthy`, etc. | Mantener la misma lógica pero con datos que vengan de **flow_modules** (URLs) y **flow_technical_details** (is_healthy, last_health_check, platform_name, etc.) por módulo. |
| **runHealthCheck()** | Usa `tech.id` y actualiza por `flow_technical_details.eq('id', tech.id)`. | Sigue siendo correcto si `tech` es una fila de **flow_technical_details** (cada una con `flow_module_id`). Ajustar solo si se cambia la estructura de `this.webhooks` a “por módulo”. |
| **saveWebhook()** | Inserta/actualiza **flow_technical_details** con `flow_id` y campos `webhook_url_*`. | En el schema, `flow_technical_details` no tiene `flow_id` ni `webhook_url_*`. 1) Crear o actualizar **flow_modules** (incluyendo `webhook_url_test`, `webhook_url_prod`) para el flujo elegido. 2) Crear o actualizar **flow_technical_details** usando el `flow_module_id` de ese módulo y los campos que sí tiene la tabla (platform_name, platform_flow_id, editor_url, credential_id, is_healthy, etc.). |
| **Eliminar webhook** | Borra por `flow_technical_details.eq('id', ...)`. | Si “eliminar webhook” significa quitar la configuración del módulo: borrar o vaciar la fila de **flow_technical_details** para ese `flow_module_id` y, si aplica, vaciar URLs en **flow_modules**. No borrar el módulo si el flujo sigue existiendo y solo se desactiva el webhook. |

Resumen: la vista debe pasar de “un webhook por flujo” a “uno o más webhooks por flujo (uno por flow_module)”, con URLs en `flow_modules` y metadatos en `flow_technical_details`.

---

### 2.3 DevLogsView.js

| Ubicación | Problema | Cambio recomendado |
|-----------|----------|--------------------|
| **loadLogs() – select** | No incluye `flow_module_id` ni nombre del módulo. | Añadir al select: `flow_module_id`, y opcionalmente `flow_modules(name)` (join con flow_modules). En la tabla, añadir columna “Módulo” y mostrar el nombre del módulo cuando exista. |
| **showLogDetail()** | No muestra el módulo. | Incluir en el modal el nombre del módulo (desde `flow_modules.name`) cuando `flow_module_id` no sea nulo. |

No hay que cambiar la política de acceso si se mantiene “solo ver logs de mis flujos” (por `flow_id` y ownership); el schema ya tiene `flow_module_id` como dato adicional.

---

### 2.4 DevDashboardView.js

| Ubicación | Problema | Cambio recomendado |
|-----------|----------|--------------------|
| **loadRecentLogs()** | No incluye `flow_module_id` ni módulo. | Igual que DevLogsView: opcionalmente incluir `flow_modules(name)` en el select y mostrar el módulo en la lista de “Logs recientes” si se desea. |
| **loadRecentRuns()** | Select de `flow_runs` con `content_flows(name)`. | El schema de `flow_runs` es compatible (tiene `flow_id`, `status`, `tokens_consumed`, `webhook_response_code`, `created_at`). No usar `inputs_used` si en algún momento se añade a la vista. |

El resto del dashboard (developer_stats, flows, counts) sigue siendo válido.

---

### 2.5 DevBuilderView.js

| Ubicación | Problema | Cambio recomendado |
|-----------|----------|--------------------|
| Carga de módulo y technical details | Ya usa **flow_modules** por `content_flow_id` y **flow_technical_details** por `flow_module_id`. | Coherente con el schema. Solo asegurarse de que al guardar se actualicen tanto **flow_modules** (input_schema, webhook_url_*) como **flow_technical_details** (platform, editor_url, etc.) por `flow_module_id`. |
| Eliminación de flujo | Borra `flow_technical_details` por `flow_module_id` y luego `flow_modules` por `content_flow_id`. | Correcto con el schema. |

Aquí los cambios son mínimos; sobre todo no reintroducir `flow_id` en technical details.

---

### 2.6 RLS (security_RLS.sql)

| Tabla | Estado | Comentario |
|-------|--------|------------|
| **developer_logs** | Política “Devs only” con `is_developer()`. | Si se quiere que cada dev solo vea logs de flujos a los que tiene acceso: usar `can_access_flow(flow_id)` en la política en lugar de (o además de) `is_developer()`. |
| **flow_runs** | Usa `user_id = auth.uid() OR is_developer()`. | Válido. |
| **runs_inputs / runs_outputs** | Usan `EXISTS (flow_runs ... user_id = auth.uid() OR is_developer())`. | Válidos. No es necesario filtrar por `flow_module_id` a nivel RLS. |

Opcional: restringir **developer_logs** por `can_access_flow(flow_id)` para que los desarrolladores solo vean logs de sus propios flujos (o en los que son colaboradores).

---

### 2.7 living.js y otros consumidores de flow_runs / runs_outputs

- **living.js** ya usa **flow_runs** y **runs_outputs** con `run_id`; el schema incluye **flow_module_id** en `runs_outputs`. Si en el futuro se muestran outputs por paso, se puede filtrar o agrupar por `flow_module_id`. No es obligatorio cambiar nada si solo se listan outputs por run.
- **Navigation.js**: cuenta `flow_runs` por `user_id`; compatible con el schema.

---

## 3. Orden sugerido de implementación

1. **DevTestView**
   - Ajustar `loadTechnicalDetails` para obtener módulo(s) y, a partir de ellos, webhooks (desde `flow_modules`) y detalles técnicos (desde `flow_technical_details` por `flow_module_id`).
   - Quitar `inputs_used` de `flow_runs`; al ejecutar un test, insertar en **runs_inputs** (`run_id`, `flow_module_id`, `input_data`).
   - En historial y detalle de run, leer inputs desde **runs_inputs** en lugar de `run.inputs_used`.
   - Añadir `flow_module_id` al insertar en **developer_logs** cuando se conozca el módulo.

2. **DevWebhooksView**
   - Cambiar **loadWebhooks** a un modelo “por flow_module”: cargar `content_flows` con `flow_modules` y, por cada módulo, `flow_technical_details`.
   - Guardar webhooks: actualizar o crear **flow_modules** (URLs) y **flow_technical_details** (resto) por `flow_module_id`.
   - Ajustar filtros, estadísticas y health check para que operen por módulo.

3. **DevLogsView y DevDashboardView**
   - Incluir `flow_module_id` y opcionalmente `flow_modules(name)` en las consultas de logs y mostrar “Módulo” donde aplique.

4. **RLS**
   - Opcional: restringir **developer_logs** por `can_access_flow(flow_id)` si se desea que los devs solo vean logs de sus flujos.

---

## 4. Compatibilidad con flow_runs sin inputs_used

Si en la base de datos actual **flow_runs** todavía tiene la columna **inputs_used** (por migraciones anteriores), se puede:

- Mantenerla como copia redundante durante una transición: al crear un run, rellenar tanto **runs_inputs** como `flow_runs.inputs_used` (si la columna existe), y en lecturas usar primero **runs_inputs** y hacer fallback a `inputs_used` para runs antiguos.
- O migrar datos históricos de `inputs_used` a **runs_inputs** (un registro por run con `flow_module_id` null o el primer módulo) y luego eliminar la columna en una migración posterior.

Si en tu schema actual **flow_runs** ya no tiene `inputs_used`, entonces el código debe usar solo **runs_inputs** desde ya.

---

## 5. Resumen de tablas afectadas

| Tabla | Uso en el nuevo sistema |
|-------|--------------------------|
| **content_flows** | Flujo; owner_id, status, run_count, etc. Sin webhook_url. |
| **flow_modules** | Pasos del flujo; webhook_url_test, webhook_url_prod, input_schema, output_schema, step_order. |
| **flow_technical_details** | Metadatos por módulo (flow_module_id): platform_name, editor_url, is_healthy, etc. Sin flow_id ni URLs. |
| **flow_runs** | Ejecución; flow_id, user_id, status, tokens_consumed, webhook_response_code. Sin inputs_used. |
| **runs_inputs** | Inputs por ejecución (y por módulo): run_id, flow_module_id, input_data. |
| **runs_outputs** | Outputs por ejecución (y por módulo): run_id, flow_module_id, output_type, generated_copy, etc. |
| **developer_logs** | flow_id, run_id, flow_module_id (opcional), severity, error_message, raw_details. |

Con estos cambios, el sistema de desarrolladores queda alineado con el nuevo schema de flujos, logs, runs y módulos.
