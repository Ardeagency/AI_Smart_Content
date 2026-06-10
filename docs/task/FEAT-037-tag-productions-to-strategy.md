# FEAT-037 — Taguear producciones a su estrategia (campaign/brief/persona)

**Estado:** DEUDA TECNICA (pendiente, diferido 2026-06-10)
**Prioridad:** Alta — es la base para que las producciones aparezcan en una estrategia.

## Problema

Las producciones (`runs_outputs`) tienen las columnas `campaign_id`, `brief_id`,
`persona_id` para enlazarse a una estrategia, **pero estan NULL en todas** (verificado
en IGNIS: 0 de 23 producciones tienen algun enlace). Por eso una estrategia no puede
"encontrar" sus producciones, y los satelites de produccion en el Command Center
(FEAT-038) no tendrian de donde salir.

## Que hay que hacer

Que el flujo de produccion (ai-engine: flow worker / comfy-flow-runner / el path que
inserta en `runs_outputs`) **taguee cada output con el contexto de la estrategia** al
generarlo: `campaign_id`, `brief_id`, `persona_id` (y opcional `entity_id`/producto).

- Investigar donde se generan los `runs_outputs` y por que no se setea el contexto.
- Propagar el contexto desde los inputs del flow (`runs_inputs` / content_flow / brief
  que dispara la produccion) hasta el insert del output.
- Backfill opcional para producciones existentes que puedan inferirse.

## Por que es tedioso (nota del usuario)

Toca el pipeline de generacion (n8n/comfy/ai-engine), varios paths de entrada
(studio manual vs autopilot), y la propagacion de contexto end-to-end. Se resuelve
en una sesion enfocada aparte.

## Relacionado
- FEAT-038 (satelites de produccion en el canvas) depende de esto para tener datos.
- Tablas: `runs_outputs` (produccion), `social_publications` (publicacion organica),
  `campaigns`/`campaign_briefs`/`audience_personas` (estrategia).
