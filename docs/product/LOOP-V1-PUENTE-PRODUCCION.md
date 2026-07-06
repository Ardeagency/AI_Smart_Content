# LOOP V1 — Puente "aprobar → producir → publicar → medir" (blueprint verificado)

> Síntesis de la investigación de 3 capas (ai-engine, frontend, Supabase), 2026-07-02.
> Objetivo: que LA PLATAFORMA cocine sola — la cata del humano en el tab Estrategia
> dispara producción automática, con gate humano solo en PUBLICAR (autonomía parcial).
> Todo lo citado abajo está VERIFICADO con file:line por los investigadores.

## El loop y el estado de cada eslabón

| Eslabón | Estado | Pieza real |
|---|---|---|
| 1. Chef escribe recetas (diario) | ✅ | `strategy-review.service.js` (desplegado) |
| 2. Cata en la app | ✅ | Tab Estrategia → `approve/reject/iterate_strategic_recommendation` |
| 3. Aprobar → PRODUCIR | ❌ **EL PUENTE** | approve solo marca status; no existe conexión (confirmado en UI y backend) |
| 4. Producción ejecuta | ✅ | Camino n8n: webhook `flow_modules.webhook_url_prod` → output a `runs_outputs` vía `rpc_ingest_flow_output` |
| 5. Publicar (gate humano) | ✅ | `api-social-publish {output_id, platforms, caption}` → `social_publications` + `runs_outputs.published_at` |
| 6. Link publicación→receta | 🟡 | auto-link Jaccard existe (indeterminista); falta link directo |
| 7. Medir → rendir cuentas | ✅ | `measure_recommendation_outcomes` + `outcome-measurement` corriendo |

## Los dos caminos de producción (verificados)

**A. n8n (el estándar del Studio — RECOMENDADO para el puente):**
`deduct_credits_and_create_run(org, user, flow_id, costo, brief_id?, persona_id?, campaign_id?)`
→ devuelve `run_id` (cobra créditos + crea `flow_runs` en un paso)
→ INSERT `runs_inputs {run_id, input_data, metadata}`
→ `rpc_build_manual_context(p_run_id, …)` para enriquecer el payload
→ **POST a `flow_modules.webhook_url_prod`** (n8n genera; hasta ~29 min)
→ n8n responde → `rpc_ingest_flow_output` → `runs_outputs` (storage bucket `production-outputs`).
Es 100% replicable desde backend (RPC + HTTP POST). No depende de flags.

**B. Comfy (`runContentFlow → comfy_flow_jobs → comfy-flow-runner`):** completo en
ai-engine PERO: gated por `COMFY_BRIDGE_ENABLED`, y solo existe **1**
`comfy_flow_definitions` (`ignis-cat01-hero-ingredientes`, específica de IGNIS).
No sirve para WAKEUP hoy. Descartado para V1.

## Flujo candidato V1 (verificado)

**"Minimalismo 3D / Product Render Futurista"** (`flow_id 24c1c871-…`):
único required = `image_selector` (producto con `id` entity + `images[]`),
`is_human_approval_required=false`, tiene `webhook_url_prod`. Ideal para
`single_image` / `carrusel_imgs`.
**"UGC Secuencial"** tiene gates humanos en steps 1-2 → los videos van por Studio
en V1 (el gate secuencial ya existe y es correcto).

## Las 3 piezas de traducción que faltan (el puente en sí)

1. **`format → flow`**: mapa v1: `single_image|carrusel_imgs` → Minimalismo 3D;
   `reel_meme|long_video` → notificación "produce en Studio" (gates secuenciales).
2. **`producto → entity_id + imágenes`**: la receta menciona el producto por nombre
   (texto); resolver contra `products` (ILIKE sobre anchor_product_name/description)
   → si no resuelve, org_notification "no pude resolver el producto — produce manual"
   (fail-open al humano, jamás adivinar).
   *Mejora al generador:* que `strategy-review` llene `anchor_product_name` +
   `metadata.entity_id` al generar (resuelve en la fuente).
3. **Canal del `copy_seed`**: NO entra a la generación de imagen — **se vuelve el
   CAPTION al publicar** (`api-social-publish` acepta `caption`; el copy viaja en
   `runs_inputs.metadata.copy_seed` y se prefill-ea en el modal de publicación).

## El link receta↔producción (no existe FK — decisión)

`flow_runs` NO tiene `recommendation_id`. V1: guardar `recommendation_id` en
`runs_inputs.metadata` + `runs_outputs.metadata`; al crear el run, setear
`strategic_recommendations.in_production_at` + `metadata.run_id`. Al publicar:
enhancer en auto-link — si la rec tiene `metadata.remote_post_id` (del publish),
matchear `brand_posts.post_id` DIRECTO (determinista) en vez de Jaccard.

## Diseño del servicio puente: `recommendation-producer.service.js`

Patrón `recommendation-auto-link` (poll + idempotente). Cada 10 min:
1. `strategic_recommendations` con `status='approved'`, `in_production_at IS NULL`,
   `reviewed_at ≤ 30d`.
2. Resolver producto (pieza 2) y flujo (pieza 1).
3. `deduct_credits_and_create_run(org, owner_user, flow_id, token_cost)` —
   si `insufficient_credits` → org_notification + skip.
4. INSERT `runs_inputs` con `input_data {image_selector, aspect_ratio}` +
   `metadata {recommendation_id, copy_seed, captured_from:'strategy_bridge'}`.
5. `rpc_build_manual_context` → merge → POST `webhook_url_prod`.
6. UPDATE rec: `in_production_at=now()`, `metadata.run_id`.
7. El resto lo hace la maquinaria existente (ingesta → gate publicar → medir).

## BUG descubierto (arreglar junto al puente)

`mission-generator` convierte pending_actions approved en `body_missions` de tipo
`execute_*` que **ningún worker ejecuta** (job-worker solo maneja tipos de
populators) Y marca la acción `executing`, **bloqueando** el camino directo que sí
funciona (`executeAction` lockea por status approved/pending). Carrera que mata
ejecuciones reales. Fix: mission-generator debe excluir los action_types que
action-executor ejecuta directo (o el executor correr antes). El puente V1 evita
pending_actions por completo (la aprobación humana ya ocurrió en la cata).

## Verificaciones previas al build

- Créditos de WAKEUP suficientes (token_cost=50 del flujo candidato).
- `user_id` del sistema para `deduct_credits_and_create_run` (owner de la org).
- El webhook n8n del flujo candidato está sano (`flow_technical_details.is_healthy`).
- Los `content_flows` son catálogo global → sirven para WAKEUP aunque solo IGNIS
  haya producido antes (primer run de WAKEUP será el estreno).
