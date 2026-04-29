---
title: 03 — Base de datos (Supabase / Postgres)
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 03 · Base de datos

## Project ref y conexión

- **Project ref:** `tsdpbqcwjckbfsdqacam`
- **URL HTTP:** `https://tsdpbqcwjckbfsdqacam.supabase.co`
- **Postgres:** versión `17.6` (aarch64)
- **SQL Editor:** `https://supabase.com/dashboard/project/tsdpbqcwjckbfsdqacam/sql/new`
- **Management API SQL endpoint:** `POST https://api.supabase.com/v1/projects/{ref}/database/query` con header `Authorization: Bearer {SUPABASE_ACCESS_TOKEN}` — **corre como `postgres`** (bypass RLS). Útil para DDL.

Las API keys del cliente (anon, service_role) y el JWT secret están en `.env.local` del proyecto frontend (chmod 600, gitignored). El access token de Management API está allí también como `SUPABASE_ACCESS_TOKEN`.

## Extensiones instaladas

| Extensión | Versión | Para qué se usa |
|---|---|---|
| `pg_cron` | 1.6.4 | Scheduled jobs (refresh de matviews, sync) |
| `pgvector` | 0.8.0 | Embeddings: `ai_brand_vectors`, `ai_global_vectors` (cols `embedding vector(1536)`) |
| `pg_net` | 0.19.5 | HTTP requests desde triggers (webhook a ai-engine) |
| `supabase_vault` | 0.3.1 | Secrets cifrados |
| `pg_stat_statements` | 1.11 | Tracking de queries |
| `pg_graphql` | 1.5.11 | GraphQL automático (no usado por frontend, pero disponible) |
| `pgcrypto` | 1.3 | Hashing |
| `uuid-ossp` | 1.1 | Generación de UUIDs |

## Inventario (a 2026-04-29)

| Categoría | Cantidad |
|---|---|
| Tablas (`public`) | 84 |
| Vistas | 3 |
| Materialized views | 1 (`v_orphan_topics`) |
| Funciones (`public.*`) | 61 |
| Triggers | 24 |
| RLS policies | 105 |
| Tablas con RLS activado | 83 / 84 |
| Tablas con realtime habilitado | 4 (`vera_pending_actions`, `ai_messages`, `ai_conversations`, `user_notifications`) |
| Storage buckets | 8 |
| pg_cron jobs activos | 1 (`production_master_autonomous_v1` cron `5 14 * * *`) |
| Auth users | 1 (info@ardeagency.com) |

## Tablas — modelo conceptual

### Identidad de organización (multi-tenant)

| Tabla | PK | Notas |
|---|---|---|
| `organizations` | `id uuid` | `owner_user_id`, `level_of_autonomy`, `logo_url`, `brand_name_oficial` |
| `organization_members` | (org_id, user_id) | role: `owner` / `admin` / `member` / `viewer` |
| `organization_credits` | `organization_id` | `credits_available`, `credits_used` |
| `organization_features` | `organization_id` | feature flags por org |
| `subscriptions` | `id` | `plan_type`: basico / starter / pro / business / enterprise |
| `profiles` | `id = auth.users.id` | datos extendidos del usuario |
| `business_units` | `id` | sub-niveles dentro de una org |

### Marca (brand layer)

| Tabla | Para qué |
|---|---|
| `brand_containers` | "Marca" en sentido amplio. `verbal_dna`, `visual_dna`, `palabras_clave`, `palabras_prohibidas`, `arquetipo`, `propuesta_valor`, `objetivos_estrategicos` |
| `brand_profiles` | Texto largo por sección (filosofia, mision, etc.) |
| `brand_entities` | Productos/servicios/conceptos de la marca con `entity_type` |
| `brand_colors`, `brand_fonts` | Theme |
| `brand_assets` | Archivos en Storage |
| `brand_places` | Ubicaciones físicas |
| `brand_rules` | Reglas hard de marca |
| `brand_narrative_pillars` | Pilares narrativos (`pillar_name`, `post_count`, `avg_engagement`) |
| `brand_audience_heatmap` | Mejor hora/día por plataforma (`hour_engagement`, `day_engagement`, `best_hour`, `best_day`) |

### Productos

`products` ← `product_variants` ← `product_variant_option_values` → `product_option_values` → `product_options`. Imágenes en `product_images` y `product_variant_images`.

### Capa de contenido propio (capturado)

| Tabla | Para qué |
|---|---|
| `brand_posts` | Posts capturados (propios, competidor, influencer, press, other). Cols clave: `metrics jsonb`, `sentiment jsonb`, `media_assets jsonb`, `enrichment jsonb`, `network`, `post_source`, `is_competitor`, `captured_at` |
| `brand_content_analysis` | Output de análisis Vera por post: `tone_detected`, `tone_coherence_score`, `dominant_emotion`, `narrative_pillar`, `why_it_worked jsonb`, `clarity_score`, `fatigue_risk` |
| `brand_analytics_snapshots` | Snapshots periódicos por plataforma+período (`platform`, `period_type`, `period_start`, `period_end`, `metrics jsonb`) |

### Capa de inteligencia externa

| Tabla | Para qué |
|---|---|
| `intelligence_entities` | Entidades vigiladas (cuentas competidoras, dominios, ASINs). `domain` ∈ `social/marketplace/web/news/analytics`. `target_identifier` |
| `intelligence_signals` | Cada captura individual de scraping/sensor. `signal_type`, `content_text`, `content_numeric`, `media_assets jsonb`, `ai_analysis jsonb`, `entity_id` |
| `trend_topics` | Tendencias capturadas. `keyword`, `velocity_score`, `relevance_score`, `source`, `category`, `metadata jsonb`, `scope` ∈ `organization/brand` |
| `competitor_ads` | Ads del rival detectados via Meta Ad Library. `platform`, `creative_url`, `copy_text`, `first_seen_at`, `last_seen_at`, `estimated_spend_range jsonb`, `targeting jsonb` |
| `retail_prices` | Precios capturados por SKU/retailer. `retailer`, `sku`, `price`, `currency`, `stock_status`, `promo_label`, `promo_details jsonb` |
| `url_watchers` | URLs vigiladas con hash diff. `url`, `last_hash`, `last_checked_at`, `label` |
| `visual_references` | Referencias visuales para Studio. `category`, `visual_type`, `prompt_details jsonb`, `bucket` |

### Capa de acción y ejecución (Vera)

| Tabla | Para qué |
|---|---|
| `vera_pending_actions` | Acciones que Vera propone. `action_type`, `proposed_payload jsonb`, `vera_reasoning`, `vera_confidence`, `impact_estimate jsonb`, `expires_at`, `status` ∈ pending/approved/executing/executed/rejected/failed, `priority 1-10`, `source_signal_id` |
| `body_missions` | Misiones derivadas de pending_actions aprobadas. `mission_type`, `status`, `action_payload jsonb`, `result_reference jsonb`, `trigger_signal_id` |
| `mission_runs` | Ejecuciones de body_missions. `status`, `result jsonb`, `duration_ms`, `tokens_used`, `completed_at` |
| `runs_inputs` / `runs_outputs` | I/O de mission_runs |
| `agent_queue_jobs` | Cola de trabajo del job-worker. `payload jsonb`, `status` ∈ queued/assigned/running/completed/failed, `locked_by`, `locked_at`, `started_at` |
| `brand_vulnerabilities` | Crisis/threats detectadas. `severity` ∈ low/medium/high/critical, `status` ∈ open/in_progress/resolved, `detected_signal_id`, `scope` ∈ brand/organization |
| `monitoring_triggers` | Sensores activos por brand/entity. `sensor_type`, `cadence`, `cadence_value`, `priority`, `status`, `next_run_at`, `config jsonb` |
| `sensor_runs` | Histórico de ejecuciones de sensores. `status` (success/failed) |

### Capa de campañas/flujos

`campaigns`, `campaign_briefs`, `campaign_entities`, `campaign_brief_entities`, `audience_personas`, `audience_segments`, `content_flows`, `flow_modules`, `flow_runs`, `flow_schedules`, `flow_collaborators`, `flow_test_cases`, `flow_technical_details`, `services`.

### Capa de IA / memoria

| Tabla | Para qué |
|---|---|
| `ai_conversations` | Sesiones de chat con Vera (realtime habilitado) |
| `ai_messages` | Mensajes individuales. Trigger valida `organization_id` consistency en INSERT/UPDATE. Realtime habilitado |
| `ai_chat_context` | Contexto adicional inyectado al sistema |
| `ai_chat_actions` | Acciones disparadas desde chat |
| `ai_brand_vectors` | Embeddings de la marca (1536-dim, vacío hoy) |
| `ai_global_vectors` | Embeddings globales (1536-dim, vacío hoy) |
| `ai_agent_runtime` / `ai_agents` | Runtime de agentes |

### OpenClaw / provisioning

`openclaw_instances` (instancia OpenClaw por org), `provisioning_events` (audit), `agent_queue_jobs` (cola), `external_api_cache`.

### Soporte

`developer_logs`, `developer_notifications`, `developer_stats`, `system_metrics` (70k filas — health/logs internos), `system_ai_outputs`, `storage_usage`, `credit_usage`, `user_notifications` (realtime), `user_flow_favorites`, `user_business_units`, `business_unit_products`, `contact_leads`, `contact_lead_notes`.

## RLS — el modelo de seguridad

83 de 84 tablas tienen RLS activo. **Patrón canónico** (`SQL/security_RLS.sql`):

```sql
-- Lectura
USING (is_developer() OR is_org_member(organization_id))

-- Escritura
WITH CHECK (is_developer() OR is_org_member(organization_id))
```

Funciones helper relevantes (todas `SECURITY DEFINER`):

| Función | Devuelve | Lógica |
|---|---|---|
| `is_org_member(_org_id uuid)` | bool | `auth.uid()` está en `organization_members` o es `owner_user_id` |
| `is_developer()` | bool | role del JWT contiene `developer` o user_id en lista hardcoded |
| `org_has_feature(p_org_id, p_feature_key)` | bool | feature está en `organization_features` |

**Tablas sin `organization_id` directo** que se scopean por FK:

| Tabla | Ruta de scoping |
|---|---|
| `intelligence_signals` | `entity_id` → `intelligence_entities.organization_id` |
| `brand_posts` | `brand_container_id` → `brand_containers.organization_id` |
| `visual_references` | `brand_container_id` |
| `mission_runs` | `mission_id` → `body_missions.organization_id` |
| `runs_inputs/outputs` | `run_id` → `flow_runs.organization_id` |

⚠️ **Bug recurrente**: el frontend a veces hace `intelligence_signals?organization_id=eq.X` lo cual falla porque la columna no existe. Usar siempre `entity_id IN (entityIds)`.

## RPCs — las 61 funciones existentes

Selección comentada (lista completa en pg_proc):

### Auth / org / créditos
- `is_org_member(_org_id uuid)` — ya descrita
- `is_developer()` — ya descrita
- `org_has_feature(p_org_id, p_feature_key)`
- `create_user_profile(p_user_id, p_email, p_full_name, ...)`
- `create_user_subscription(p_user_id, p_plan_type, p_credits)`
- `use_credits(p_organization_id, p_user_id, p_credits)`, `deduct_credits_for_video(...)`, `deduct_credits_and_create_run(...)`, `refund_credits_for_run(...)`
- `delete_all_app_data()` — wipe completo (ojo)
- `touch_org_activity(p_org_id)`
- `log_provisioning_event(p_org_id, p_event_type, p_server_type)`

### Pending actions / Vera
- `fn_vpa_approve(p_action_id, p_approver)` — usuario aprueba
- `fn_vpa_reject(p_action_id, p_rejecter, p_reason)` — usuario rechaza
- `fn_link_brief_to_campaign(...)`, `fn_unlink_brief_from_campaign(...)`
- `update_signal_analysis(p_signal_id, p_analysis)` — Vera escribe ai_analysis

### Flow execution
- `register_flow_execution(p_brand_id, p_user_id, p_flow_id, ...)`
- `execute_scheduled_flow(p_schedule_id)` — invocada por pg_cron
- `can_access_flow(_flow_id)`
- `rpc_intelligence_context(p_schedule_id)` — contexto inteligente para schedules
- `rpc_ai_full_brand_product_context(schedule_id)`
- `get_complete_schedule_context(p_schedule_id)`

### Provisioning
- `fn_provision_trigger_for_entity(p_entity_id)` — provisiona sensores per-entity
- `fn_provision_triggers_for_integration(p_integration_id)`
- `fn_run_scheduled_scraping_v2()` — corre scrapers programados

### Embeddings (pgvector)
- `match_ai_brand_vectors(query_embedding vector, brand_id, match_count)` — similarity search en vectores de marca
- `match_ai_global_vectors(query_embedding vector, match_count)` — similarity en vectores globales

### Lectura específica de UI
- `get_org_brand_container(_org_id)` — brand_container default de la org
- `get_brand_audiences_dropdown(p_brand_id)`, `get_brand_campaigns_dropdown(p_brand_container_id)`
- `get_brand_products_with_images(p_brand_container_id)`
- `get_active_campaign_summary(p_brand_id)`, `get_top_produced_entity(p_brand_container_id)`
- `get_key_productions(p_brand_id, p_limit)`, `get_latest_generated_content(p_brand_id, p_limit)`
- `get_production_by_user(p_organization_id)`, `get_production_efficiency(p_brand_id)`, `get_production_format_distribution(p_brand_id)`
- `get_studio_activity_status(p_brand_id)`, `get_team_activity_status(p_organization_id)`, `get_team_activity_summary(p_organization_id)`, `get_team_living_overview(p_organization_id)`
- `get_user_content_specialization(p_organization_id)`, `get_user_flow_usage(p_organization_id)`
- `get_activity_timeline(p_brand_id, p_days)`
- `get_smart_visual_references(p_search_term, p_limit)`
- `get_product_with_variants(p_product_id, p_org_id)`, `get_products_full_by_ids(p_product_ids)`
- `register_daily_production(p_user_id, p_brand_id, p_product_id, ...)`

### Dashboards (la nueva familia)
- `dashboard_mi_marca(p_org_id, p_window_d, p_sections)` — agregador del Dashboard Mi Marca (v1, leerá matviews en v2)
- `dashboard_competencia(...)` — pendiente
- `dashboard_tendencias(...)` — pendiente
- `dashboard_estrategia(...)` — pendiente

## Triggers — los 24 activos

| Trigger | Tabla | Cuándo dispara | Qué hace |
|---|---|---|---|
| `*_set_updated_at()` / `update_updated_at_column()` | varias | BEFORE UPDATE | actualiza `updated_at` |
| `ai_messages_enforce_org_consistency()` | `ai_messages` | BEFORE INSERT/UPDATE | valida que `organization_id` matchee con la conversación |
| `fn_brand_integrations_after_insert()` | `brand_integrations` | AFTER INSERT | dispara provisioning de sensores |
| `fn_intelligence_entities_after_insert()` | `intelligence_entities` | AFTER INSERT | dispara `fn_provision_trigger_for_entity` |
| `sync_flow_to_cron()` | `flow_schedules` | AFTER INSERT/UPDATE/DELETE | sincroniza con `pg_cron` |
| `fn_propagate_run_context()` | `runs_outputs` | BEFORE INSERT | propaga campaign_id/brand_id desde el run |
| `fn_vpa_set_updated_at()` | `vera_pending_actions` | BEFORE UPDATE | timestamps |
| **Webhook trigger** | `intelligence_signals` | AFTER INSERT | `pg_net.http_request` POST a `https://api.aismartcontent.io/webhooks/signal` con HMAC firmado en header `x-supabase-signature` |

## Materialized views y vistas

### Matview existente

```sql
-- v_orphan_topics: keywords en tendencia que la marca no ha cubierto aún
CREATE MATERIALIZED VIEW v_orphan_topics AS
SELECT t.brand_container_id, t.keyword, t.velocity_score, t.relevance_score
FROM trend_topics t
LEFT JOIN brand_narrative_pillars p
  ON p.brand_container_id = t.brand_container_id
  AND p.pillar_name ILIKE '%' || t.keyword || '%'
WHERE p.id IS NULL AND t.velocity_score > 0.6;
```
Refresh manual hoy. Plan: refresh por pg_cron cada 15 min.

### Vistas

- `v_org_server_status` — estado de servidores por org
- `v_org_provisioning_status` — qué orgs tienen qué provisionado
- `recent_analyzed_signals` — JOIN de `intelligence_signals` + `intelligence_entities` últimos 7 días

### Matviews proyectadas (no implementadas)

```
mv_dashboard_health         (refresh 5 min)
mv_threat_level             (refresh 5 min)
mv_signal_velocity_24h      (refresh 15 min)
mv_brand_format_stats       (refresh 1 h)
brand_metrics_daily         (cron diario 00:00 UTC)
```

## pg_cron — jobs activos

```sql
SELECT jobid, schedule, jobname, command FROM cron.job;
```

| jobid | schedule | jobname | comando |
|---|---|---|---|
| ? | `5 14 * * *` | `production_master_autonomous_v1` | `SELECT public.execute_scheduled_flow('3ae2c78c-…')` |

Solo 1 cron job manual; el resto del scheduling vive en `monitoring_triggers.next_run_at` y lo procesa el ai-engine cada N minutos.

`flow_schedules` se sincroniza automáticamente con pg_cron via trigger `sync_flow_to_cron()`.

## Realtime — qué tablas están suscriptas

```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public';
```

Activo en:
- `vera_pending_actions` — clave para Estrategia
- `ai_messages` — chat con Vera
- `ai_conversations` — sesiones
- `user_notifications` — toasts en UI

**Plan extender a:** `brand_vulnerabilities`, `intelligence_signals`, `body_missions`, `retail_prices`, `competitor_ads`, `trend_topics`, `monitoring_triggers`.

```sql
-- Agregar tabla a realtime:
ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_vulnerabilities;
```

## Storage buckets

| Bucket | Público | Para qué |
|---|---|---|
| `product-images` | sí | Imágenes de productos |
| `production-outputs` | sí | Outputs de Studio |
| `production-inputs` | sí | Inputs subidos para producción |
| `visual-references` | sí | Moodboards y referencias |
| `images_flows` | sí | Imágenes de flujos |
| `org-assets` | sí | Logos y branding |
| `brand-core` | sí | Assets de marca core |
| `ai-knowledge` | **no** | Contenido sensible, knowledge base privada |

Buckets públicos sirven URLs directas. El privado `ai-knowledge` requiere signed URLs.

## Convenciones de columnas

- `id uuid DEFAULT uuid_generate_v4()` (o `gen_random_uuid()` en tablas nuevas)
- `created_at timestamptz DEFAULT now()`
- `updated_at timestamptz DEFAULT now()` (con trigger `update_updated_at_column()`)
- `organization_id uuid REFERENCES public.organizations(id)` cuando aplica
- `brand_container_id uuid REFERENCES public.brand_containers(id)` cuando aplica
- `entity_id uuid REFERENCES public.intelligence_entities(id)` cuando aplica
- `metadata jsonb DEFAULT '{}'::jsonb` para extensión flexible
- Enums implementados como `text` con `CHECK (status = ANY(ARRAY[...]))` (no se usan tipos `enum` de Postgres)

## Cómo aplicar cambios al schema

### Vía Management API (recomendado para Claude/agentes)

```bash
SQL=$(cat archivo.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$SQL" '{query: $q}')"
```

Corre como `postgres` (bypass RLS). Útil para CREATE FUNCTION, ALTER, etc.

### Vía SQL Editor del dashboard

`https://supabase.com/dashboard/project/tsdpbqcwjckbfsdqacam/sql/new` — pegar y Run.

### Vía supabase CLI (no configurado todavía)

Permitiría `supabase db push` con migraciones versionadas en `SQL/migrations/`. Recomendado a futuro.

### Convención de archivos SQL

```
SQL/schema.sql              — schema completo dump (regenerable)
SQL/security_RLS.sql        — todas las RLS policies
SQL/storage_buckets.sql     — definición de buckets
SQL/functions/              — RPCs nuevas (uno por archivo)
SQL/migrations/             — migraciones versionadas (timestamp prefijo)
SQL/seeds/                  — seed data inicial
SQL/v_*.sql                 — views/matviews
```

---

*Anterior: [02 — Arquitectura](./02-architecture.md) · Siguiente: [04 — AI Engine](./04-ai-engine.md)*
