# FEAT-037 — Taguear producciones a su estrategia (campaign/brief/persona)

**Estado:** FASE 1 (plumbing backend) HECHA Y DESPLEGADA 2026-06-24. Falta FASE 2 (captura en el disparo).
**Prioridad:** Alta — es la base para que las producciones aparezcan en una estrategia.

## Problema (original)

Las producciones (`runs_outputs`) tienen las columnas `campaign_id`, `brief_id`,
`persona_id` para enlazarse a una estrategia, **pero estan NULL en todas** (verificado
en IGNIS: 0 de 23 producciones tenian algun enlace). Por eso una estrategia no puede
"encontrar" sus producciones, y los satelites de produccion en el Command Center
(FEAT-038) no tendrian de donde salir.

## Diagnostico verificado (2026-06-24)

El contexto se perdia en DOS niveles:
1. **`flow_runs` nace sin contexto** en el path del runner (comfy-flow-runner
   `persistOutputs`, rama `else` ~L219, path Vera/autopilot). Solo el path frontend
   lo poblaba via la RPC `deduct_credits_and_create_run` (que SI inserta
   brief/campaign/persona en `flow_runs`).
2. **`runs_outputs` leia de `inp`** (los inputs del job), que casi nunca trae el
   contexto -> todo NULL. Y NO heredaba de su `flow_run` padre (FK
   `runs_outputs.run_id -> flow_runs.id`).
   - `entity_id` SI llegaba porque se resuelve desde `inp.entity_map`/`inp.entity_id`.

`strategy-orchestrator.service.js` (consumidor) lee `runs_outputs` por
brief_id/campaign_id en `deriveStrategyState`; sin tags, las estrategias quedaban
atascadas en `planificada`.

## FASE 1 — plumbing backend (HECHO 2026-06-24)

En `ai-engine/src/services/comfy-flow-runner.service.js` (`persistOutputs`), commit
`406bd3b`, desplegado (restart ai-engine.service):
- Al crear el `flow_run` del path Vera/autopilot (rama `else`) se capturan
  `brief_id/campaign_id/persona_id/entity_id` desde `inp`.
- Antes del loop se lee el contexto del **flow_run padre** (`frCtx`, fuente de verdad).
- El insert de `runs_outputs` hereda de `frCtx` con `inp` como fallback. Aditivo y
  null-safe (sin contexto = null, sin regresion).
- **Backfill** aplicado: `runs_outputs` NULL rellenados desde su flow_run padre
  (13 filas -> entity_id recuperado). brief=4, campaign=0 (la fuente no los tiene aun).

Resultado: el backend queda correcto end-to-end. Cualquier produccion cuyo flow_run
tenga contexto (o cuyos inputs lo traigan) nace tagueada.

## FASE 2 — captura en el disparo (PENDIENTE)

El plumbing ya hereda el contexto, pero hoy las producciones casi no se disparan CON
una estrategia seleccionada, asi que la fuente (`flow_runs`) sigue sin brief/campaign:
- **Studio (`js/views/StudioView.js`):** el form extrae campaign/persona/brief
  (~L2243) y la RPC los pone en `flow_runs` (~L2280), PERO no siempre se propagan al
  `webhookBody`/inputs del job (~L2345) y hay mismatch de naming `audience_id` vs
  `persona_id`. El brief rara vez esta en el form.
- **Vera/autopilot (`flow.tools.js:runContentFlow` -> `enqueueComfyFlow`):** no
  pre-crea flow_run con contexto y Vera debe pasar `brief_id/campaign_id` en `inputs`
  cuando produce desde un nodo de estrategia (tooling de Vera).
- **Scheduled/autopilot:** path de `flow_schedules` (Netlify/n8n) tambien debe pasar
  el contexto.

Hasta cerrar Fase 2, FEAT-038 tendra producciones con `entity_id` pero pocas con
brief/campaign. Cerrar cuando se trabaje el disparo desde estrategia.

## Relacionado
- FEAT-038 (satelites de produccion en el canvas) depende de esto para tener datos.
- Tablas: `runs_outputs` (produccion), `social_publications` (publicacion organica),
  `campaigns`/`campaign_briefs`/`audience_personas` (estrategia), `flow_runs` (run = fuente de verdad del contexto).

## Relacionado
- FEAT-038 (satelites de produccion en el canvas) depende de esto para tener datos.
- Tablas: `runs_outputs` (produccion), `social_publications` (publicacion organica),
  `campaigns`/`campaign_briefs`/`audience_personas` (estrategia).
