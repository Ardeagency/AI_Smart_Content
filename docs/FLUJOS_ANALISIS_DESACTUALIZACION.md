# Análisis: Desactualización frontend/builds vs schema de flujos modular

## Resumen del nuevo schema (sistemas modulares)

- **content_flows**: Define el flujo como entidad. Ya **no** tiene `input_schema` ni `webhook_url`; tiene `execution_mode` (`single_step` | `multi_step` | `sequential`), `builder_version`, `ui_layout_config`, `subcategory_id`, etc.
- **flow_modules**: Cada flujo tiene **varios** módulos. Cada módulo tiene: `input_schema`, `webhook_url_test`, `webhook_url_prod`, `step_order`, `output_schema`, `is_human_approval_required`. Las URLs y el schema de entrada viven aquí.
- **flow_runs**: Tiene `current_module_order`, `total_modules_count`, `step_history`, `is_paused` para ejecución multi-paso.
- **flow_technical_details**: Por `flow_module_id` (no por flow_id). Plataforma, editor_url, health.
- **runs_inputs / runs_outputs**: Tienen `flow_module_id` para asociar a un módulo concreto.

---

## 1. StudioView.js — **CRÍTICO (roto)**

| Aspecto | Estado actual | Debería ser |
|--------|----------------|-------------|
| Query de flujos | `content_flows` con `input_schema, webhook_url` | Esas columnas **no existen** en `content_flows` → siempre `null`. |
| Habilitar "Producir" | `flow.webhook_url` | Obtener URL del **módulo** (p. ej. primer módulo para `single_step`). |
| Formulario de inputs | `flow.input_schema` | Cargar `input_schema` del módulo (o del primer módulo). |
| Ejecución `producir()` | `fetch(flow.webhook_url, …)` | Usar webhook del módulo; para multi-paso: crear `flow_run`, ejecutar por pasos. |

**Conclusión**: Studio no puede mostrar formularios ni ejecutar flujos hasta que cargue datos desde `flow_modules` (como mínimo para flujos single_step).

---

## 2. DevBuilderView.js — **Parcialmente actualizado**

| Aspecto | Estado actual | Debería ser |
|--------|----------------|-------------|
| Carga de flujo | Usa `flow_modules` con `limit(1)` y guarda en un solo módulo | OK para single-step. Para multi-step faltaría UI de varios módulos. |
| Campos de content_flows | `loadFlow()` no asigna `subcategory_id` ni `execution_mode` | Incluir en `flowData` y en payload de guardado. |
| Payload guardado | Incluye `subcategory_id` pero no `execution_mode` | Schema tiene `execution_mode`; añadir (default `single_step`). |
| UI | Un solo bloque "Técnico" / un módulo | Opcional: pestaña o sección "Módulos" para flujos multi-step. |

**Conclusión**: Funciona para flujos de un solo módulo. Falta alinear `loadFlow` con `subcategory_id`/`execution_mode` y, a medio plazo, soporte explícito para múltiples módulos.

---

## 3. DevFlowsView.js — **Menor**

- Solo lista `content_flows` (nombre, estado, métricas). No usa `flow_modules`.
- Podría enriquecer con: número de módulos, `execution_mode`, o indicador "multi-paso".

---

## 4. FlowCatalogView.js — **Indirectamente afectado**

- `loadFlows()` solo lee `content_flows` (sin `flow_modules`). Para el catálogo está bien.
- Al elegir un flujo y abrir Studio, Studio hace su propia carga; si Studio no obtiene `input_schema`/webhook desde módulos, la experiencia en Studio sigue rota hasta arreglar StudioView.

---

## 5. DevTestView.js — **Actualizado**

- Carga `flow_modules`, usa el primer módulo, copia `input_schema` y webhooks a `selectedFlow` para la UI.
- Crea `flow_runs` y usa `flow_module_id` en logs. Alineado con el schema modular.

---

## 6. DevWebhooksView.js — **Parcial**

- Carga flujos con `flow_modules` pero muestra "una fila por flujo (primer módulo)".
- No hay UI para editar/ver varios módulos por flujo.

---

## 7. DevDashboardView.js / DevLogsView.js

- Usan `content_flows` y `flow_modules` en joins (logs, runs). Correcto con el schema actual.

---

## 8. living.js

- `loadFlowRuns()` y `loadFlowOutputs()` no filtran por `flow_module_id`. El schema permite varios outputs por run (uno por módulo); la lógica actual sigue siendo válida (lista runs y sus outputs). Opcional: mostrar en UI qué módulo generó cada output usando `flow_module_id`.

---

## Acciones recomendadas (prioridad)

1. **StudioView**: ✅ Hecho. Carga flujos con `flow_modules` anidado, normaliza con `normalizeFlowFromModules()` para obtener `input_schema` y `webhook_url` del primer módulo (por `step_order`); "Producir" usa esa URL.
2. **DevBuilderView**: ✅ Hecho. `loadFlow()` asigna `subcategory_id` y `execution_mode` a `flowData`; payload de guardado y duplicado incluyen `execution_mode` (default `single_step`).
3. Opcional: En Studio, para flujos `multi_step`/`sequential`, crear `flow_run` y orquestar llamadas por módulo usando `step_order` y `step_history`.
4. Opcional: DevBuilderView y DevWebhooksView con UI para varios módulos por flujo.

Este documento se puede ir actualizando según se implementen los cambios.
