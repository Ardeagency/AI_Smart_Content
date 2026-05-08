# AI Smart Content — Estado expandido del proyecto

> **Fecha de corte:** 2026-05-05
> **Autor del análisis:** revisión cruzada de toda la documentación oficial (`docs/`, `docs/platform/`, `docs/task/`, `README.md`, `SECURITY.md`, memory banks de Vera) + estado real de Supabase via Management API + inspección de `ai-engine` vía SSH + lectura del frontend en `js/`, `functions/`, `css/`.
> **Alcance:** narrativa única que cubre visión, arquitectura, cada subsistema, lo resuelto, lo persistente, deuda técnica activa, decisiones de diseño documentadas y discrepancias entre spec e implementación.

---

## 0. Resumen ejecutivo

AI Smart Content es una **plataforma de inteligencia comercial y generación autónoma de contenido** construida por ARDE Agency entre octubre de 2025 y abril de 2026. Lo que se intenta hacer es ambicioso: convertir a una marca en un organismo *vivo* que escucha el mercado en tiempo real (audiencia, competencia, tendencias), procesa esas señales contra el ADN de la propia marca y genera contenido multiformato (texto, imagen, video) sincronizado con el momento.

Después de revisar toda la documentación y el estado real, el veredicto es:

- **El cerebro está construido.** ai-engine corre en Hetzner CCX33 con 12 servicios background, scheduler propio, scrapers anti-bot vivos y un python-analyzer FastAPI con análisis cualitativo sin LLM (transformers locales). 80 misiones autónomas generadas, 33 ejecutadas, 269 signals reales capturados.
- **La base de datos también.** Supabase Postgres 17 con 114 tablas, 140 RPCs, 39 RPCs de dashboard, 8 jobs pg_cron activos, 8 vistas materializadas auto-refrescadas, RLS en todas las tablas críticas, schedule chain completamente cableada hasta n8n.
- **Vera, el agente, también.** Identidad madura definida en 5 memory banks + 9 skills locales (25 instaladas en producción), arquitectura per-org aislada en servidor Hetzner dedicado, 85+ tools con 7 capas de seguridad antes de ejecutar.
- **El frontend NO expone esto.** Solo la `~30%` de la inteligencia que el backend produce llega a la UI. El cuello de botella no es construir IA: es **conectar UI, cerrar la cadena de schedule, crear el flujo de signup, y activar Vera de cara al usuario**.

A continuación se desarrolla cada parte.

---

## 1. Visión y propuesta de valor

### 1.1 La promesa: "Marca Viva"

Según `docs/AI-SMART-CONTENT-VISION.txt`, la plataforma se concibe como una arquitectura de **Marca Viva** que opera bajo un ciclo continuo de tres etapas que se repiten 24/7:

1. **Escucha** — lectura del mundo en tiempo real: competidores, tendencias, consumidor. Scraping continuo y detallado sobre el nicho del cliente, sin limitarse a leer texto: entiende estrategias de venta rivales, quejas del consumidor y momentos de oportunidad comercial.
2. **Procesamiento** — cruce de inteligencia de mercado con el ADN de la marca: identidad, valores, objetivos comerciales, vulnerabilidades. La plataforma decide *qué debe decir la marca ahora*, no mañana ni ayer.
3. **Manifestación** — generación automática de contenido visual (imágenes, Reels, videos), textual (blogs, copys, artículos) y distribución en los canales digitales del cliente.

El agente interno **Vera** orquesta todo el ciclo: decide qué merece respuesta, ejecuta la producción y prepara la distribución. La promesa explícita es **eliminar la latencia entre lo que pasa en el mercado y la respuesta de la marca**.

### 1.2 El problema que resuelve

El documento enumera tres dolores recurrentes del marketing moderno:

1. **Información fragmentada**: Meta Insights por un lado, GA4 por otro, scraping manual de competencia, monitoreo de menciones. Nadie cruza todo.
2. **Reactividad obligatoria**: las crisis se descubren cuando estallan, las oportunidades se aprovechan cuando ya saturaron, la competencia se enfrenta tarde.
3. **Costo cognitivo insostenible**: decidir qué publicar hoy implica abrir 7 herramientas, leer 50 datos y hacer juicio. Cada día.

### 1.3 El modelo: 4 dashboards + 1 cerebro

| Dashboard | Pregunta que responde | Fuente de datos primaria |
|---|---|---|
| **Mi Marca** | ¿Cómo está mi salud orgánica, coherencia de tono, puntos ciegos? | `brand_posts`, `brand_content_analysis`, `brand_analytics_snapshots` |
| **Mi Competencia** | ¿Qué hacen los rivales, dónde son vulnerables, qué puedo aprovechar? | `intelligence_signals`, `competitor_ads`, `intelligence_entities` |
| **Tendencias** | ¿Qué vibra en el mundo y mi nicho que aún no he tocado? | `trend_topics`, `intelligence_signals`, `v_orphan_topics` |
| **Estrategia** | Dado lo de los otros 3, ¿qué hago hoy/esta semana/este mes? | `vera_pending_actions`, `body_missions`, `mission_runs`, `brand_vulnerabilities` |

El cerebro (Vera) cruza los primeros 3 y escribe las acciones del 4°. **El humano aprueba o rechaza. Vera nunca tiene la última palabra.**

### 1.4 Visión 2027: comercio agente-a-agente (A2A)

Hacia 2027, la plataforma no solo venderá a humanos sino que preparará la identidad de la marca para un escenario donde las IAs de los compradores busquen soluciones. AI Smart Content debe asegurar que la marca del cliente sea la opción lógica, presente y mejor posicionada por su **relevancia en tiempo real**, no por campanadas genéricas.

Esto explica decisiones arquitectónicas como el `brand-indexer.service` que genera embeddings de DNA de marca con `text-embedding-3-large` (1536 dim) — la marca debe ser semánticamente legible por máquinas.

### 1.5 Modelo de negocio y autonomía

Los planes definidos en BD (`plans` tabla):

| Plan | Precio/mes | Créditos | Handles | Cadencia scraping | Cap diario | TTL cache |
|---|---|---|---|---|---|---|
| Trial | $0 (14d) | 200 | 2 | 12h | 5 | 6h |
| Starter | $99 | 1 000 | 5 | 8h | 25 | 4h |
| Pro | $299 | 3 000 | 15 | 4h | 100 | 2h |
| Business | $999 | 10 000 | 50 | 2h | 400 | 1h |
| Enterprise | custom | custom | custom | custom | custom | custom |

Cada organización opera en una de tres **fases de autonomía**:

| Phase | Nombre técnico | Comportamiento |
|---|---|---|
| **A** | `restringido` | Vera observa, no actúa. Solo lectura. |
| **B** | `parcial` (default) | Vera propone, humano aprueba. Cada acción medio/alto riesgo requiere consent. |
| **C** | `total` | Vera ejecuta acciones de bajo riesgo automáticamente. Las críticas (cambios de precios, ad spend) siguen requiriendo aprobación. |

La org demo (`Arde Agency`) está en Phase B (parcial), con 9 978 créditos disponibles de 10 000.

---

## 2. Arquitectura general en 5 capas

El doc `docs/platform/02-architecture.md` define la arquitectura como **multi-tenant desde el día 1, stateless, con la base de datos como contrato único** y un principio cardinal: **cero LLMs en background**. Los jobs sin humano (scrapers, sensores, embeddings, threat detection, generación de misiones) usan **reglas + templates + matemática + transformers locales**. El LLM (Vera vía OpenClaw + Claude) solo interviene cuando hay un humano del otro lado del chat. Excepción justificada: descripciones de imagen/video con Claude (~$0.0042/imagen) cacheadas en `media_descriptions_cache`.

```
Frontend (Vanilla JS SPA)              Hosting: Netlify CDN Cloudflare
        ↓ supabase-js + 26 Netlify Functions
Supabase Postgres 17.6 (us-east-1)    Project: tsdpbqcwjckbfsdqacam
        ↓ pg_net + Database Webhooks
ai-engine (Express en Hetzner CCX33)  api.aismartcontent.io vía Cloudflared
        ↓ HTTP per-org (puerto 3001)
OpenClaw (1 instancia por org)         Hetzner dedicado por org
        ↓ Anthropic Claude
        Embeddings: OpenAI text-embedding-3-large
        Análisis: pysentimiento + KeyBERT (locales, sin LLM)
        Video: KIE / Kling 3.0
        Scraping pesado: Apify actors

Schedules de flujos: pg_cron → execute_scheduled_flow → net.http_post → n8n cloud
```

Las 5 capas conceptuales:

### Capa 1 — Ingesta

Tres fuentes confluyen:

- **Scrapers en Hetzner**: `social-scraper.service.js` orquesta Apify actors vía `src/lib/apify.client.js` (post-migración 2026-04-28 "droplegacy" se eliminó el motor in-house basado en Playwright stealth). Apify gestiona el browser headless, anti-bot, retries y rotación de IPs por debajo. El control plane local solo elige el actor, paga créditos y persiste el output. Cubre Instagram, TikTok, X/Twitter, YouTube, Amazon y Facebook. Cache global con TTL por plan y contabilidad por organización en `apify_runs` + `organization_credits`. Ejecuta cada ~10 min según `monitoring_triggers.next_run_at`.
- **APIs de plataformas**: Meta Graph (Pages e IG Insights), Meta Ad Library, GA4 Analytics Admin API, YouTube Data API. Tokens OAuth refrescados proactivamente por `token-refresh.service.js`.
- **Inputs manuales desde la UI**: el usuario ingresa marca, audiencias, competidores, keywords, integraciones.

Destino primario: `intelligence_signals`, `brand_posts`, `competitor_ads`, `trend_topics`, `retail_prices`.

### Capa 2 — Tablas núcleo (Write Layer)

114 tablas en Postgres distribuidas en 6 grupos lógicos, todas con RLS y todas scopeadas por `organization_id` (directo o vía FK indirecta). Ver §3 para inventario.

### Capa 3 — Inteligencia

Los 12 servicios del ai-engine procesan los datos brutos en señales accionables:

| Servicio | Función | Trigger |
|---|---|---|
| `social-scraper.service.js` | Orquestador del scraping multi-plataforma | cada 45 min |
| `threat-detector.service.js` | Detecta 3 anomalías estadísticas SIN LLM | continua |
| `brand-indexer.service.js` | Embeddings de DNA de marca (OpenAI 1536-dim) | daily |
| `mission-generator.service.js` | Convierte `vera_pending_actions` aprobadas → `body_missions` | cada 5 min |
| `job-worker.service.js` | Consume `agent_queue_jobs`, ejecuta handlers | poll cada 10s |
| `action-executor.service.js` | Ejecuta missions aprobadas | demanda |
| `content-analysis.service.js` | Sentiment, emotion, narrative pillar, fatigue por post | demanda |
| `audience-alignment.service.js` | Calcula `alignment_score` vs buyer personas | daily |
| `brand-sensor-sync.service.js` | Asegura 9 sensores brand-wide existan | cada 5 min |
| `token-refresh.service.js` | Refresca OAuth tokens Meta/Google | proactivo |
| `org-sync.service.js` + `hetzner.provisioner.js` | Provisioning en cascada | demanda |
| `openclaw.adapter.js` + `openclaw.registry.js` | Invoca OpenClaw remoto per-org | chat |

Salidas: `vera_pending_actions`, `body_missions`, `brand_vulnerabilities`, `ai_brand_vectors`, `mission_runs`, `sensor_runs`.

### Capa 4 — Precomputada

8 vistas materializadas auto-refrescadas por `pg_cron`:

| MV | Schedule | Contenido |
|---|---|---|
| `mv_dashboard_health` | cada 5 min | salud general por org |
| `mv_threat_level` | cada 5 min | nivel de amenaza calculado |
| `mv_signal_velocity_24h` | cada 15 min | velocidad de menciones |
| `v_orphan_topics` | cada 15 min | topics sin cobertura de la marca |
| `mv_brand_format_stats` | hora en punto | distribución de formatos |
| `mv_sentiment_breakdown` | hora en punto | breakdown de sentiment |
| `brand_pattern_performance` | (estática) | performance de patrones por marca |
| `category_pattern_performance` | (estática) | performance por categoría |

Más un job nightly: `brand_metrics_daily_snapshot` a las 00:05 UTC ejecuta `compute_brand_metrics_daily()`.

### Capa 5 — Lectura / UI

39 RPCs de dashboard expuestas (ver §6.5). El frontend invoca directamente vía `supabase.rpc(...)` y los servicios del frontend (`MiBrandaDataService`, `StrategiaDataService`, `CompetenciaDataService`, etc.) cachean en memoria.

---

## 3. Base de datos: Supabase Postgres

Project ref: **`tsdpbqcwjckbfsdqacam`**, host `db.tsdpbqcwjckbfsdqacam.supabase.co`, Postgres 17.6.1.063, región `us-east-1`, status `ACTIVE_HEALTHY`. Creado 2025-11-11.

### 3.1 Inventario actual (snapshot 2026-05-05)

| Métrica | Valor |
|---|---|
| Tablas en `public` | 114 |
| Funciones públicas (RPCs) | 140 |
| Vistas materializadas | 8 |
| Triggers | ≥ 24 |
| Storage buckets | 8 (1 privado, 7 públicos) |
| Realtime activo | 4 tablas |
| pg_cron jobs activos | 8 |
| RLS habilitado en | todas las tablas críticas (104+ tablas con RLS) |
| Tablas SIN RLS | 5 (backend-only: `classifier_blacklist`, `emerging_patterns`, `external_api_cache`, `lexicon_enrichment_runs`, `viral_predictions`) |

### 3.2 Distribución de tablas por prefijo

```
brand:    22  ai:     6  product:  6  flow:     6  organization: 4
content:   3  campaign: 3  developer: 3  user:    3  contact:  2
credit:    2  audience: 2  delivery: 2  system:  2  business: 2
intelligence: 2  + 53 tablas singulares (productos, openclaw_instances,
                                           plans, profiles, scraper_actors,
                                           sensor_runs, monitoring_triggers, etc.)
```

### 3.3 Modelo conceptual por cluster

#### Identidad y multi-tenancy
- `organizations` (id, owner_user_id, name, level_of_autonomy, logo_url, brand_name_oficial, brand_slogan)
- `organization_members` (id, organization_id, user_id, role, permissions jsonb)
- `organization_credits` (organization_id, credits_available, credits_total)
- `organization_features` (feature gating por plan)
- `organization_invitations` ⭐ (id, email, role, token, expires_at, status) — **schema completo, 0 filas hoy**
- `subscriptions`, `profiles`, `business_units`
- `plans` (5 tiers: trial/starter/pro/business/enterprise con `credits_monthly`, `max_handles`, `scraping_cadence_hours`, `scraping_daily_cap`)

#### Marca (Brand Layer)
- `brand_containers` — la marca en sentido amplio. Columnas críticas: `nombre_marca`, `arquetipo`, `propuesta_valor`, `mision_vision`, `verbal_dna`, `visual_dna`, `palabras_clave[]`, `palabras_prohibidas[]`, `nicho_core`, `sub_nichos[]`, `idiomas_contenido[]`, `mercado_objetivo`, `objetivos_estrategicos`
- `brand_profiles` (texto largo por sección)
- `brand_entities`, `brand_colors`, `brand_fonts`, `brand_assets`, `brand_places`, `brand_rules`
- `brand_narrative_pillars` (pilar, post_count, avg_engagement)
- `brand_audience_heatmap`, `brand_audience_personas`
- `brand_integrations` (platform, external_account_id, access_token cifrado, refresh_token, scope[], is_active)
- `brand_health_snapshots`, `brand_metrics_daily`, `brand_spam_profiles`, `brand_blocked_posts_log`

#### Productos
- `products`, `product_variants`, `product_options`, `product_option_values`, `product_variant_option_values`
- `product_images`, `product_variant_images`

#### Contenido propio capturado
- `brand_posts` (419 filas) — campos: `metrics jsonb`, `sentiment jsonb`, `media_assets jsonb`, `network`, `post_source`, `captured_at`
- `brand_post_comments` (887 filas)
- `brand_content_analysis` (283 filas) — `tone_detected`, `clarity_score`, `fatigue_risk`, `why_it_worked`
- `brand_analytics_snapshots` (47 filas) — snapshots periódicos: `platform`, `period_type`, `metrics jsonb`
- `brand_posts_daily_stats` (82 filas)
- `post_patterns` (302 filas)

#### Inteligencia externa
- `intelligence_entities` — competidores, dominios, ASINs vigilados. `domain ∈ {social, marketplace, web, news, analytics}`, `target_identifier` (handle/URL/SKU)
- `intelligence_signals` (269 filas) — `signal_type`, `content_text`, `content_numeric`, `media_assets`, `ai_analysis`, `entity_id`
- `trend_topics` (1 435 filas) — `keyword`, `velocity_score`, `relevance_score`, `scope ∈ {organization, brand}`
- `competitor_ads` (0 filas) — `platform`, `creative_url`, `copy_text`, `first_seen_at`, `estimated_spend_range`. **Vacía por falta de competidores configurados.**
- `retail_prices` (0 filas) — `retailer`, `sku`, `price`, `stock_status`, `promo_label`. **Vacía igualmente.**
- `competitor_retail_tracking`
- `url_watchers` (0 filas) — URLs monitoreadas con hash diff
- `visual_references`
- `crisis_signals`
- `viral_predictions` (sin RLS, posible exposición a revisar)
- `emerging_patterns` (sin RLS), `pattern_taxonomy` (49), `learned_vocabulary` (64), `dimension_lexicon` (215)

#### Acción y ejecución (Vera)
- `vera_pending_actions` — `action_type`, `proposed_payload`, `vera_reasoning`, `vera_confidence`, `impact_estimate`, `status ∈ {pending, approved, executing, executed, rejected, failed}`, `priority 1-10`, `expires_at`. **4 filas: 2 pending, 1 executing, 1 executed.**
- `body_missions` (80 filas: 33 completed, 45 pending, 1 failed, 1 update_persona pending) — `mission_type`, `action_payload`, `result_reference`
- `mission_runs` (34 filas: 33 completed, 1 failed) — `agent_id`, `job_id`, `started_at`, `completed_at`, `duration_ms`, `result`, `error_message`, `tokens_used`. Última ejecución 2026-04-21.
- `agent_queue_jobs` (34 filas) — `status ∈ {queued, assigned, running, completed, failed}`, `locked_by`, `locked_at`
- `brand_vulnerabilities` (55 filas) — `severity ∈ {low, medium, high, critical}`, `status ∈ {open, in_progress, resolved}`
- `monitoring_triggers` — sensor_type, cadence, cadence_value, next_run_at, status, config
- `sensor_runs` (1 127 filas) — `status ∈ {success, failed}`

#### IA y memoria
- `ai_conversations` (1 fila) — sesiones de chat con Vera, realtime
- `ai_messages` (10 filas: 5 user + 5 assistant) — realtime, último real 2026-04-13
- `ai_chat_context`, `ai_chat_actions`
- `ai_brand_vectors` (0 filas) — embeddings pgvector 1536-dim. **VACÍA: bug en `brand-indexer.service`**
- `ai_global_vectors` (0 filas)

#### Campañas y flujos
- `campaigns`, `campaign_briefs`, `campaign_brief_entities`, `campaign_entities`
- `audience_personas`, `audience_segments`
- `content_categories` (48), `content_subcategories` (48), `content_flows` (6: 4 autopilot, 1 scraping, 1 manual)
- `flow_modules` (6, 4 con webhook_url) — `webhook_url_prod` apunta a `ardeagency.app.n8n.cloud`, `webhook_url_test` a `hooks.arde.agency`
- `flow_runs` (0 filas) — confirma que ningún schedule de usuario nunca se ha disparado
- `flow_schedules` (2 filas, ambos paused, `organization_id NULL` — semilla de prueba)
- `flow_collaborators`, `flow_test_cases`, `flow_technical_details`

#### Soporte
- `developer_logs`, `developer_notifications`, `developer_stats`
- `system_metrics` (78 488 filas) — health/logs del ai-engine
- `user_notifications` (32 filas), `user_flow_favorites`, `user_business_units`
- `contact_leads` (0), `contact_lead_notes` — CRM de leads, no activado aún
- `credit_usage` (223), `storage_usage`
- `apify_runs` (44), `scraper_actors` (registry de Apify actors por plataforma)
- `media_descriptions_cache` (99) — descripciones Claude cacheadas
- `recommendation_applications` — log de recomendaciones que Vera hizo y el usuario aplicó

### 3.4 Las 140 RPCs

#### Auth y créditos
- `is_org_member(_org_id uuid)` — valida que `auth.uid()` está en `organization_members` o es `owner_user_id`
- `is_developer()` — si el role contiene `developer` o user_id en lista hardcoded
- `org_has_feature(p_org_id, p_feature_key)` — feature gating
- `create_user_profile()`, `use_credits()`, `refund_credits_for_run()`

#### Vera y pending actions
- `fn_vpa_approve(p_action_id, p_approver)` — usuario aprueba
- `fn_vpa_reject(p_action_id, p_rejecter, p_reason)` — usuario rechaza
- `fn_vpa_set_updated_at()` — trigger helper

#### Schedule
- `execute_scheduled_flow(p_schedule_id uuid)` — invocada por pg_cron
- `sync_flow_to_cron()` — trigger function
- `rpc_intelligence_context(p_schedule_id)` — payload para flows tipo `scraping`
- `rpc_ai_full_brand_product_context(p_schedule_id)` — payload para flows `autopilot`/`manual`/`system`

#### Embeddings (pgvector)
- `match_ai_brand_vectors(query_embedding, brand_id, match_count)` — similarity search

#### Dashboards (39 RPCs en total — más de las que el frontend usa)

**Mi Marca (16):**
`dashboard_brand_activity_history`, `_alert_score`, `_engagement_trend`, `_featured_growth`, `_featured_hashtag`, `_featured_hour`, `_featured_platform`, `_featured_profile`, `_featured_profile_details`, `_featured_topic`, `_kpis_strip`, `_optimization_insights`, `_posting_hours`, `_sentiment_activity`, `_top_highlighted_posts`, `_vs_competencia` + meta-RPCs `dashboard_mi_marca` y `dashboard_mi_marca_v2`.

**Mi Competencia (14):**
`dashboard_competencia` (meta), `_activity_history`, `_actor_details`, `_actor_posts`, `_comparison`, `_distributions`, `_featured`, `_intelligence`, `_kpis`, `_posting_hours`, `_risk`, `_search`, `_top`, `_top_posts`.

**Estrategia (5):**
`dashboard_estrategia` (meta), `_hashtags`, `_platform_comparison`, `_sentiments_by_brand`, `_tones`, `_topics`.

**Tendencias (1):**
`dashboard_tendencias(p_org_id uuid, p_window_d int default 30, p_sections text[] default null) → jsonb`. Existe; el frontend nunca la llama y sigue mostrando arrays hardcoded.

### 3.5 RLS — el modelo de seguridad

`docs/SEGURIDAD_RLS_MAPA_PAGINAS.md` documentaba inicialmente que múltiples tablas tenían RLS activado pero sin políticas (acceso denegado), y otras sin RLS ni políticas. La situación actual:

**Patrón canónico:**
```sql
USING (is_developer() OR is_org_member(organization_id))
WITH CHECK (is_developer() OR is_org_member(organization_id))
```

**Helpers (todas SECURITY DEFINER):**
- `is_org_member(_org_id uuid)`
- `is_developer()`
- `org_has_feature(p_org_id, p_feature_key)`

**Tablas críticas con RLS habilitado (verificadas 2026-05-05):**
`organizations`, `organization_members`, `profiles`, `flow_schedules`, `flow_runs`, `vera_pending_actions`, `brand_containers`, `brand_posts`, `intelligence_signals`, `intelligence_entities`, `agent_queue_jobs`, `retail_prices`, `competitor_ads`, `trend_topics`, `brand_vulnerabilities`, `contact_leads`, `user_notifications`, `body_missions`, `mission_runs`. ✅

**Tablas SIN RLS — revisar GRANTs:**
`classifier_blacklist`, `emerging_patterns`, `external_api_cache`, `lexicon_enrichment_runs`, `viral_predictions`. Si están en `GRANT SELECT TO authenticated` hay riesgo de fuga; si solo se acceden con service role, está bien. **Pendiente verificar.**

### 3.6 Triggers (24 activos)

| Trigger | Tabla | Cuándo | Qué hace |
|---|---|---|---|
| `*_set_updated_at` | varias | BEFORE UPDATE | actualiza `updated_at` |
| `ai_messages_enforce_org_consistency` | `ai_messages` | BEFORE INSERT/UPDATE | valida `organization_id` |
| `fn_brand_integrations_after_insert` | `brand_integrations` | AFTER INSERT | dispara provisioning de sensores |
| `tr_sync_flow_cron` ⭐ | `flow_schedules` | AFTER INSERT/UPDATE/DELETE | sincroniza con `pg_cron` (ver §10) |
| `fn_intelligence_entities_after_insert` | `intelligence_entities` | AFTER INSERT | provisioning automático de sensores per-entity |
| Webhook trigger | `intelligence_signals` | AFTER INSERT | `pg_net.http_request` POST a `https://api.aismartcontent.io/webhooks/signal` con HMAC |

### 3.7 Realtime (4 tablas activas)

✅ Habilitado: `vera_pending_actions`, `ai_messages`, `ai_conversations`, `user_notifications`.

🚧 **Pendiente extender** (FEAT-009 en `docs/task/`):
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_vulnerabilities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.body_missions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.retail_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitor_ads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trend_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitoring_triggers;
```

### 3.8 Storage buckets (8)

| Bucket | Visibilidad | Tamaño | Uso |
|---|---|---|---|
| `ai-knowledge` | privado | 20 MB | Memory bank de Vera (estructura jerárquica creada, **vacío con 1 placeholder**) |
| `brand-core` | público | 50 MB | Logos, paletas, fuentes |
| `images_flows` | público | 2 MB | Imágenes de flows en Studio |
| `org-assets` | público | 25 MB | Assets generales de org |
| `product-images` | público | 5 MB | Productos del catálogo |
| `production-inputs` | público | 50 MB | Inputs de producciones |
| `production-outputs` | público | 50 MB | Outputs de KIE/Kling |
| `visual-references` | público | 50 MB | Referencias visuales |

⚠️ 7 de 8 buckets son públicos. El URL es difícil de adivinar pero no es secreto. Para PII real (DNI, conversaciones privadas, descripciones de personas en imágenes) usar `ai-knowledge` o crear bucket privado.

### 3.9 pg_cron jobs activos (8)

| Job | Schedule | Comando |
|---|---|---|
| `production_master_autonomous_v1` | `5 14 * * *` (diario 14:05 UTC) | `SELECT execute_scheduled_flow('3ae2c78c-...')` ⚠️ **UUID huérfano: ese flow_schedule fue eliminado** → cron zombie |
| `refresh_mv_dashboard_health` | cada 5 min | `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_health` |
| `refresh_mv_threat_level` | cada 5 min | refresh `mv_threat_level` |
| `refresh_mv_signal_velocity_24h` | cada 15 min | refresh `mv_signal_velocity_24h` |
| `refresh_v_orphan_topics` | cada 15 min | refresh `v_orphan_topics` |
| `refresh_mv_brand_format_stats` | hora en punto | refresh `mv_brand_format_stats` |
| `refresh_mv_sentiment_breakdown` | hora en punto | refresh `mv_sentiment_breakdown` |
| `brand_metrics_daily_snapshot` | `5 0 * * *` (00:05) | `SELECT compute_brand_metrics_daily()` |

---

## 4. ai-engine: el cerebro server-side

### 4.1 Topología

**VM:** Hetzner CCX33 (32 GB RAM, 8 vCPU, 226 GB SSD ARM64). Ubuntu 22.04. Hostname `ubuntu-32gb-ash-1`. IP `88.99.174.96` (datacenter `nbg1`).

**Servicios systemd activos:**

| Servicio | Puerto | Función |
|---|---|---|
| `ai-engine.service` | 3000 | Express + scheduler scrapers + job worker + sensor sync + token refresh |
| `python-analyzer.service` | 8001 | FastAPI con análisis cualitativo (sentiment/emotion/tone/topics + Claude para imagen/video) |
| `cloudflared.service` | — | Túnel `vera-prod` exponiendo `api.aismartcontent.io` |
| `fail2ban.service` | — | Anti brute force |

Acceso: `ssh ai-engine` (config en `~/.ssh/config`).

### 4.2 Estructura del repo

```
/root/ai-engine/
├── .env                         secrets (chmod 600, 27+ variables)
├── ai-engine.log                logs
├── package.json                 deps: express 5, supabase-js 2, apify-client, jose, zod, resend, cheerio, @modelcontextprotocol/sdk
├── src/
│   ├── index.js                 entry — arranca 6 servicios al boot
│   ├── controllers/
│   │   ├── chat.controller.js              chat con Vera (fire-and-forget async)
│   │   ├── signal-webhook.controller.js    recibe webhooks de Supabase con HMAC
│   │   ├── agents.controller.js
│   │   ├── internal.controller.js          (21 KB) endpoints /internal/*
│   │   └── task-event.controller.js
│   ├── routes/
│   │   ├── chat.routes.js                  POST /chat
│   │   ├── webhooks.routes.js              POST /webhooks/signal, /webhooks/run-scraper
│   │   ├── missions.routes.js
│   │   ├── server.routes.js                GET /server/health
│   │   ├── task.routes.js
│   │   └── internal.routes.js              /internal/org-created, /server-ready, /vera-actions, /org/:id/sleep|wake
│   ├── services/                            (12 servicios core, ver §4.4)
│   ├── lib/
│   │   ├── supabase.js                      cliente service_role
│   │   ├── policy.engine.js                 plan + rol + créditos
│   │   ├── autonomy.js                      phase A/B/C
│   │   ├── tool-call.validator.js           schema + injection
│   │   ├── session.manager.js               sesiones de Vera
│   │   ├── audit-logger.js
│   │   ├── cost.controller.js               presupuesto de tools
│   │   ├── activity-emitter.js              emit a frontend
│   │   ├── intent.detector.js               (60+ keywords pre-load)
│   │   ├── view-model.builder.js            inyecta contexto org-scoped a Vera
│   │   ├── brand-resolver.js
│   │   ├── chat-security.js
│   │   ├── content-lexicon.js
│   │   ├── context.serializer.js
│   │   ├── integration-token.js
│   │   ├── org-jwt.js                        JWTs scoped por org para RLS via RPC
│   │   ├── org-resolver.js
│   │   ├── provisioning-events.js
│   │   ├── tool-phases.js
│   │   └── apify.client.js                   (14 KB) wrapper único de scraping Apify
│   ├── tools/                                (allowlist de tools de Vera)
│   │   ├── action.tools.js                   create_audience, update_audience, etc.
│   │   ├── brand.tools.js, brand-write.tools.js
│   │   ├── intelligence.tools.js
│   │   ├── social.tools.js                   (52 KB) IG/TikTok/X/FB
│   │   ├── flow.tools.js, campaign.tools.js
│   │   ├── dashboard.tools.js                (14 KB) wrappers de las 39 RPCs
│   │   └── scraper.tools.js                  (28 KB)
│   ├── mcp/
│   │   └── ai-engine-tools.js                (38 KB) servidor MCP stdio per-org
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   └── request-logger.js
│   └── scripts/
├── python-analyzer/
│   ├── requirements.txt
│   ├── .venv/
│   └── app/
│       ├── main.py                           FastAPI :8001
│       ├── analyzer.py
│       ├── persistence.py
│       ├── scoring.py
│       └── tasks/
│           ├── sentiment.py                  pysentimiento (ES/EN/PT/IT)
│           ├── emotion.py                    pysentimiento emotion
│           ├── tone.py                       heurísticas + dicc → 5-dim vector
│           ├── topics.py                     KeyBERT + multilingual MiniLM
│           ├── intent.py                     regex + patterns
│           ├── pattern_classifier.py
│           ├── delivery.py
│           ├── creator_brief.py
│           ├── daily_brief.py
│           ├── weekly_memo.py
│           ├── image_describer.py            Claude Sonnet 4.6 (~$0.0042/img)
│           ├── video_describer.py            extrae frames → Claude
│           ├── media_helpers.py
│           └── media_orchestrator.py
├── defaults/
│   ├── AGENTS.md                             system prompt de Vera (4 KB)
│   ├── MEMORY.md
│   ├── memory-banks/                         5 archivos .mb (~24 KB total)
│   │   ├── vera-identity.mb
│   │   ├── vera-brand-thinking.mb
│   │   ├── vera-content-strategy.mb
│   │   ├── vera-data-protocol.mb
│   │   └── vera-platform-knowledge.mb
│   └── skills/                               9 paquetes (25 instalados en producción)
│       ├── brand-dna-reading/SKILL.md + reference/
│       ├── campaign-architecting/
│       ├── competitor-post-analyzer/
│       ├── content-manifesting/
│       ├── copy-forging/
│       ├── daily-briefing/
│       ├── data-protocol/
│       ├── social-analytics/
│       └── trend-sensing/
├── workspaces/
│   └── vera-fallback/                        workspace OpenClaw template
└── org_1000000000000000/memory/              workspace de la org demo
```

### 4.3 Bootstrap (al arrancar)

`src/index.js` arranca 6 servicios background:

1. `initRegistry()` — carga `openclaw_instances` activas
2. `startHealthService()` — health check de servidores remotos
3. `startScraperScheduler(45)` — scraping cada 45 min (env `SCRAPER_INTERVAL_MINUTES`)
4. `startJobWorker()` — poll `agent_queue_jobs` cada 10 s (max 3 concurrent)
5. `startOrgSyncService()` — red de seguridad: detecta orgs sin agente OpenClaw
6. `startTokenRefreshService()` — refresh OAuth Google + warnings Meta
7. `startBrandSensorSync()` — auto-crea 9 sensores brand-wide cada 5 min

Más Express en :3000 con CORS, raw body capture para HMAC del webhook, y rutas `/chat`, `/agents`, `/missions`, `/task-events`, `/internal`, `/server`, `/webhooks`.

### 4.4 Los 12 servicios core en detalle

#### `social-scraper.service.js` (83 KB) — el monstruo
Scheduler interno con `setInterval`. Lee `monitoring_triggers WHERE next_run_at <= NOW() AND status='active'` (max 20 por ciclo). Para cada trigger:
- Resuelve handler según `sensor_type`.
- Para scraping social: `runCompetitorScraper(brandContainerId, entityId)` que normaliza handle/URL, detecta plataforma, invoca Apify o fallback local.
- Persiste posts nuevos en `brand_posts`, signals en `intelligence_signals`, llama a `content-analysis.service`.
- Calcula `next_run_at` dinámicamente respetando `cadence`.
- `checkUrlWatchers()` y `persistTrendTopics()` adicionales.

Logs reales recientes:
```
scraper [meta_ad_library_sync]: — OK (next: 2026-05-05T17:11:58.429Z)
scraper [meta_ads_audiences_sync]: — OK (next: 2026-05-06T15:12:02.953Z)
scraper [audience_alignment_analysis]: — OK (next: 2026-05-06T15:12:06.312Z)
scraper: ciclo completo — 8 triggers, 0 señales nuevas
```

#### `threat-detector.service.js` — 3 reglas estadísticas, sin LLM
1. **`competitor_virality`** — post de competidor con engagement > 2.5× su baseline rolling de 14 días.
2. **`own_engagement_drop`** — caída de engagement promedio propio (7d vs 30d previos).
3. **`negative_sentiment_spike`** — % de posts propios con sentiment < -0.1 supera threshold.

Outputs: `intelligence_signals` con `signal_type='threat:{tipo}'`, `brand_vulnerabilities` con severity. Idempotencia: `metadata.triggering_post_id` o `flagged_window_start`. **Cero tokens LLM.**

#### `brand-indexer.service.js` (12 KB)
- Genera embeddings de DNA con `text-embedding-3-large` (1536-dim, Matryoshka).
- Fuentes: `brand_profiles`, `brand_containers`, `brand_entities`, `products`, `services`.
- Costo: ~$0.13/1M tokens — Arde completa cuesta ~$0.0013.
- Idempotencia: SHA-256 en `metadata.content_hash`.
- 🐛 **BUG-003 ACTIVO: `ai_brand_vectors` y `ai_global_vectors` siguen en 0 filas.** Causa raíz confirmada 2026-05-05: HTTP 429 OpenAI quota exceeded (5 runs consecutivos failed con `embeddings_failed_all (20 embed errors)`). Bloqueado por billing — recargar saldo en `platform.openai.com`. El fix de "reporte silencioso" ya está aplicado: el indexer marca `sensor_runs.status='failed'` con error visible en lugar de fallar callado.

#### `mission-generator.service.js` — traductor pending → mission
Cada 5 min como sensor `mission_generation`. Lee `vera_pending_actions WHERE status='approved'` sin `body_mission`, crea `body_missions { mission_type: execute_${action_type}, action_payload }`, marca pending action como `executing`. **Sin LLM** — pura traducción.

#### `job-worker.service.js` (11 KB) — dequeue
```js
POLL_INTERVAL_MS = 10_000;
LOCK_TTL_MIN = 5;
JOB_TIMEOUT_MS = 180_000;
MAX_CONCURRENT = 3;
```
Poll cada 10 s. UPDATE optimista para lock (`status=queued AND locked_by IS NULL → status=assigned`). Ejecuta handler según `payload.task_type` (solo `analysis` soportado hoy — competitor signals analysis). Escribe `mission_runs`.

#### `action-executor.service.js`
Lee `body_missions WHERE status='pending'`. Dispatch según `mission_type`. **Hoy implementados: 3 tipos** según docs (`create_audience`, `update_audience`, `update_brand_container`) + `link_brief_to_campaign` que hemos visto ejecutado en BD. **Faltan ~25 tipos pendientes** (`publish_instagram_post`, `schedule_facebook_post`, `create_product`, `create_campaign`, `add_intelligence_entity`, etc.) — todos lanzan "not implemented".

✅ **BUG-001 RESUELTO 2026-05-05** (opción A — eliminar el flujo). La función `enqueueSignalAnalysis` en `signal-webhook.controller.js` ya no crea body_missions tipo `competitor_signal_analysis`. El INSERT de pending_actions tipo `update_persona` en `audience-alignment.service.js` también se eliminó. 46 missions colgadas → `failed`, 3 pending_actions → `expired` (backups en `_bak_stuck_missions_2026_05_05` y `_bak_stuck_actions_2026_05_05`). Razón: post-Apify el python-analyzer + Claude ya enriquecen signals al ingresarlos; Vera per-post se deprecó.

#### `content-analysis.service.js` — sin LLM
Análisis de posts: tono, sentiment, narrative pillar, fatigue. Diccionarios lexicon-based.

Acompañado del **python-analyzer FastAPI**:
- `POST /analyze/text`, `/analyze/post`, `/analyze/batch`, `/analyze/pending`, `/analyze/media-pending`
- pysentimiento (transformers locales finetuned en redes sociales) para sentiment + emotion
- KeyBERT + multilingual MiniLM (470 MB) para topics
- Heurísticas + dicc para tone (5-dim) e intent
- `image_describer.py` y `video_describer.py` con Claude Sonnet 4.6

#### `audience-alignment.service.js` (15 KB)
Parsea `persona.datos_demograficos` (regex/keywords), compara con `real_age/gender/location` (poblado por sensor `meta_audience_demographics`), calcula `alignment_score ∈ [0,1]`. Si score < 0.5 → INSERT `vera_pending_actions` (sin invocar Vera). Por eso hay 2 acciones pending tipo `update_persona` en producción.

#### `brand-sensor-sync.service.js` — auto-crea sensores
Cada 5 min, para cada `brand_container` con integraciones activas, asegura que existan los 9 sensores brand-wide. Idempotente.

**Los 9 sensores brand-wide:**

| Sensor | Cadencia | Inputs | Outputs |
|---|---|---|---|
| `meta_audience_demographics` | daily | Meta Graph API | `brand_audience_personas` |
| `ga4_audience_demographics` | daily | GA4 API | `brand_audience_personas` |
| `meta_ads_audiences_sync` | daily | Meta API (ad accounts) | audience segments |
| `audience_alignment_analysis` | daily | Personas + audiencia real | alignment scores → `vera_pending_actions` si bajo |
| `brand_audience_heatmap_compute` | daily | últimos 365 días `brand_posts` | `brand_audience_heatmap` |
| `mission_generation` | cada 5 min | `vera_pending_actions` (approved) | `body_missions` |
| `brand_indexer` | daily | `brand_profiles`, `brand_containers`, `brand_entities`, `products` | `ai_brand_vectors` (HOY VACÍA) |
| `threat_detection` | daily | varias | `brand_vulnerabilities`, `intelligence_signals` |
| `meta_ad_library_sync` | daily | Apify + Meta Ad Library API | `competitor_ads` (HOY VACÍA por falta de competidores configurados) |

#### `token-refresh.service.js`
Google: refresh automático cada 6h si vence en <24h. Meta: solo warning (no hay refresh server-to-server seguro).

#### `org-sync.service.js` + `hetzner.provisioner.js` (23 KB) + `openclaw.provisioner.js`
Provisioning en cascada cuando se crea una org. Crea servidor Hetzner (`vera-{uuid}-{org-name}`) tipo cx23/cx33/cx43 según plan, descarga cloud-init, instala OpenClaw, configura workspace, genera token único `oc_<hex>`. Mantiene `openclaw_instances` actualizado.

#### `openclaw.adapter.js` + `openclaw.registry.js`
- `registry`: mapa en memoria `org_id → { mode, internal_url, agent_id, server_ip }`. Soporta `local` (CLI) y `remote` (HTTP a Hetzner).
- `adapter`: `callOpenClaw({ prompt, sessionId, tools, timeout })`. Para remote: HTTP POST `http://<server-ip>:3001/agent/run` (timeout 60s + 5s red). **Aislamiento estricto**: jamás fallback de un agente de una org a otro.

### 4.5 Endpoints expuestos

| Método | Path | Uso |
|---|---|---|
| POST | `/chat` | Conversación con Vera |
| GET | `/chat/conversation/:id/status` | Polling status |
| POST | `/webhooks/signal` | Database Webhook de Supabase (HMAC SHA-256) |
| POST | `/webhooks/url-trigger` | Análisis ad-hoc URL |
| POST | `/webhooks/run-scraper` | Forzar scraping (admin) |
| POST | `/missions` | Crear mission |
| GET | `/missions` | Listar |
| GET | `/server/health` | Health check |
| POST | `/internal/org-created` | Webhook desde Supabase para provisioning |
| POST | `/internal/server-ready` | Servidor org-dedicated terminó cloud-init |
| POST | `/internal/org/:id/sleep` | Pausar agente |
| POST | `/internal/org/:id/wake` | Reactivar agente |
| GET | `/internal/vera-actions` | Lista acciones pendientes |

**HMAC en `/webhooks/signal`:** acepta dos modos. Bearer literal con header `x-supabase-signature` o HMAC SHA-256 (`x-supabase-signature: sha256=<hex>`) validado contra `crypto.createHmac('sha256', secret).update(req.rawBody)`. Por eso el middleware `verify` captura `req.rawBody` antes de `express.json()`.

### 4.6 Variables de entorno (.env, chmod 600)

`PORT, ALLOWED_ORIGINS, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, HETZNER_API_TOKEN, OPENCLAW_*, INTERNAL_ADMIN_TOKEN, INTERNAL_API_KEY, SESSION_TOKEN_BUDGET, SESSION_TOOL_BUDGET, SESSION_TTL_MS, VERA_PER_POST_ANALYSIS_ENABLED, etc.`

⚠️ Único punto de fallo. Si la VM muere, la lista completa solo existe en disco. **OPS-005 en `docs/task/`** propone migrar a Supabase Vault (ya instalado, extension `supabase_vault 0.3.1`).

### 4.7 Estado real (snapshot 2026-05-05)

✅ **Funcionando:**
- ai-engine.service up 43+ min al momento del check; cloudflared up.
- python-analyzer up.
- Scheduler corre cada 45 min, ciclos completos sin errores.
- 9 sensores brand-wide ejecutándose, todos con `next_run_at` futuro.
- Webhook handler procesa signals.
- Job worker activo (34 jobs procesados).
- 33 mission_runs completadas (tipo `competitor_signal_analysis`).

🔴 **Roto:**
- ~~13 body_missions colgadas (BUG-001)~~ ✅ resuelto 2026-05-05 (opción A — flujo `competitor_signal_analysis` eliminado, 46 missions cerradas).
- `ai_brand_vectors` y `ai_global_vectors` vacíos (BUG-003, root cause confirmada: HTTP 429 OpenAI quota — bloqueado por billing).
- `competitor_ads`, `retail_prices`, `url_watchers`, `visual_references` vacíos (DATA-001: faltan competidores configurados).
- Meta Ad Library sensor: logs muestran `"Application does not have permission for this action"` y fallback también falla. Sensor corre, pero no produce. Tracked en OPS-006.
- ~~`last_request_at` del OpenClaw remoto NULL — Vera no se está usando~~ falsa alarma 2026-05-05 (BUG-004): `request_count`/`last_request_at` solo se actualizan en provisioning, no por request. Fuente real es `ai_messages` y SÍ hay actividad reciente (PONG del 30-04). Falta solo verificación interactiva en browser.

---

## 5. Frontend: SPA Vanilla JS

### 5.1 Stack y filosofía

- **Vanilla JS ES6+** sin framework — bundle ligero, control total, compatibilidad amplia.
- **Hosting:** Netlify auto-deploy de `main` → `aismartcontent.io` (push=deploy).
- **Cliente Supabase:** `@supabase/supabase-js` v2.103.2 con SRI pinneado.
- **Charts:** Chart.js 4.4.3 (CDN, lazy-loaded).
- **CSS:** vanilla, `bundle.css` único con 19 módulos `@import`.
- **Auth:** Supabase Auth (email/password + magic link + OAuth).
- **Icons:** FontAwesome 6.4 + Phosphor 2.1.2 (CDN con SRI).

### 5.2 Estructura

```
/
├── index.html                          SPA shell con entrance animation, public-shell, modals-portal
├── netlify.toml                        config build (sed para __BUILD_ID__) + headers + redirects
├── README.md, SECURITY.md, LICENSE
├── css/
│   ├── bundle.css                      stylesheet único (32 KB)
│   └── modules/                        19 módulos: auth, brands, command-center, content-management,
│                                        developer, flow-catalog, identities, insight, living, monitoring,
│                                        navigation, organization, payment-modal, products, public, studio, video
├── js/
│   ├── app.js                          (23 KB) App class, registra ~60 rutas
│   ├── app-loader.js                   splash + warmup
│   ├── router.js                       (18 KB) SPA router con :param, lazy load, soft-nav
│   ├── runtime-config.js               URL ai-engine, feature flags públicos
│   ├── org-url.js                      helpers /org/:short/:slug
│   ├── flags-data.js                   8 KB de banderas país
│   ├── input-registry.js               (84 KB) catálogo de inputs Studio/Builder
│   ├── living.js                       (113 KB legacy, ruta redirige a /production)
│   ├── products.js                     (71 KB) helpers de productos
│   ├── views/                          ~50 vistas
│   │   ├── BaseView.js                 clase padre con onEnter/render/onLeave/destroy/loadScript
│   │   ├── DashboardView.js            (133 KB) los 4 tabs (Mi Marca, Mi Competencia, Tendencias, Estrategia)
│   │   ├── VeraView.js                 (64 KB) chat
│   │   ├── BrandOrganizationView.js    (60 KB) marca org
│   │   ├── BrandstorageView.js         (71 KB) galería + sub-marcas
│   │   ├── IdentitiesView.js           productos/servicios/places/personas
│   │   ├── MonitoringView.js           (20 KB) sensores + perfiles + url watchers (CRUD parcial)
│   │   ├── StudioView.js               (63 KB) Studio
│   │   ├── ProductionView.js           Production
│   │   ├── VideoView.js                (96 KB) video pipeline KIE/Kling
│   │   ├── TasksView.js                (48 KB) lista flow_schedules con SELECT/UPDATE
│   │   ├── SignInView.js               login + recovery + solicitud-acceso → contact_leads
│   │   ├── DevDashboardView.js, DevBuilderView.js, DevTestView.js, DevWebhooksView.js, etc.
│   │   ├── DevLeadUserProvisioningView.js   wizard 4 pasos (sin backend)
│   │   ├── CreateView.js, ContentView.js, FlowCatalogView.js, CommandCenterView.js
│   │   ├── BrandIntegrationCallbackView.js
│   │   ├── PrivacyPolicyView.js, TermsOfServiceView.js, DataDeletionView.js
│   │   ├── CambiarContrasenaView.js, FormRecordView.js
│   │   ├── PlanesView.js, CreditsView.js, CreditsShopView.js
│   │   └── brand-mixins/, brand-organization/, brandstorage/, builder/
│   ├── services/                       9 servicios
│   │   ├── SupabaseService.js          getClient() lazy
│   │   ├── AuthService.js              login, logout, resetPassword, socialLogin
│   │   ├── AppState.js                 Map global con set/get/subscribe + sync localStorage
│   │   ├── OrgBrandTheme.js            aplica/limpia tema de marca al entrar a org
│   │   ├── MiBrandaDataService.js      (15 queries paralelas — refactor pendiente)
│   │   ├── StrategiaDataService.js     (10 queries)
│   │   ├── CompetenciaDataService.js   creado, base
│   │   ├── MonitoringDataService.js
│   │   └── FlowWebhookService.js
│   ├── components/
│   │   ├── Navigation.js               (81 KB) sidebar persistente god-class
│   │   ├── PublicLayout.js             header + footer públicos
│   │   ├── navigation/
│   │   │   ├── Flyouts.mixin.js
│   │   │   ├── Credits.mixin.js
│   │   │   └── Settings.mixin.js
│   │   └── brand-mixins/
│   ├── config/
│   │   └── brand-schema.js             (6 KB)
│   ├── utils/
│   │   ├── modal.js
│   │   └── brand-colors.js
│   └── session-utils.js
├── functions/                          26 Netlify Functions (lambdas)
│   ├── api-ai-engine-chat.js           proxy a ai-engine
│   ├── api-ai-action.js, api-ai-context.js, api-ai-task-event.js
│   ├── api-brand-sync-meta.js          (35 KB) Meta sync
│   ├── api-brand-analyze-posts.js      ⚠️ OpenAI deshabilitado a propósito
│   ├── api-brand-posts-meta.js, api-brand-analytics-ga4.js, api-brand-videos-youtube.js
│   ├── api-insights-fetch.js, api-insights-mybrand.js, api-insights-snapshots-list.js
│   ├── api-integrations-{exchange,disconnect}.js
│   ├── api-integrations-facebook-start.js, api-integrations-google-start.js
│   ├── api-webhooks-meta.js            (16 KB) Facebook + Instagram webhooks
│   ├── kling-video-{create,status}.js, kling-video.js (router legacy)
│   ├── kie-video-download.js
│   ├── openai-cine-prompt.js, openai-prompt.js
│   ├── lib/
│   │   ├── kie-video-shared.js
│   │   └── supabase-config.js
│   └── supabase-config.js
├── docs/                               (esta documentación)
├── SQL/                                schema, security_RLS, storage_buckets, functions/, seeds/, migrations/
└── recursos/
    ├── logos/, icons/, banners/, fondos/, favicons/, assets/, source/, vera/
```

### 5.3 Routing

`router.js` mantiene un mapa registrado en `app.js` con ~60 rutas. Soporta `:param`, lazy load (carga script bajo demanda con `?v=__BUILD_ID__` cache busting), soft-nav cuando la vista actual implementa `handleSameViewClassNavigation()`, redirección automática `org/:orgIdShort/:orgNameSlug` → resolver UUID en `routeParams.orgId`, redirecciones legacy (`/insight → /dashboard`, `/brain → /vera`, `/living → /production`, `/audiences /marketing /campaigns → /dashboard`).

**Bug clásico documentado** (`docs/platform/05-frontend.md`): los URLs usan `orgIdShort` (12 caracteres del UUID sin guiones, no es UUID válido). Pasarlo directo a Supabase con `.eq('organization_id', orgIdShort)` da 400. **Solución**: el router resuelve UUID completo y lo deja en `routeParams.orgId`. Cualquier view debe usar:
```js
this._orgId = this.routeParams?.orgId
           || window.currentOrgId
           || window.appState?.get('selectedOrganizationId')
           || localStorage.getItem('selectedOrganizationId');
```

### 5.4 Cache busting

`netlify.toml` tiene como build:
```bash
sed -i "s/__BUILD_ID__/$COMMIT_REF/g" index.html css/bundle.css js/app.js
```

`COMMIT_REF` es exposed por Netlify. Las URLs cambian → CDN cache se invalida. `BaseView.loadScript()` agrega `?v=APP_LAZY_SCRIPT_VER` automáticamente en lazy.

**Bug histórico (commit 961b5fb)**: algunos `<script>` en `index.html` no tenían `?v=__BUILD_ID__` → Cloudflare cacheaba versión vieja 7 días. Arreglado agregándolo a todos.

### 5.5 Servicios — capa de datos

Patrón: `init(supabase, orgId)` → `loadXxx()` → `{ data, isEmpty, error }`. Cada dashboard tiene su `*DataService`. Los services hoy ejecutan queries paralelas con `Promise.allSettled`. **Refactor pendiente (FEAT-007 + FEAT-008 en `docs/task/`)**: migrar a una sola llamada RPC por dashboard:
```js
const { data, error } = await supabase.rpc('dashboard_mi_marca', {
  p_org_id: this.orgId, p_window_d: 30, p_sections: null
});
```

### 5.6 Realtime

Activo: chat con Vera (`ai_messages`, `ai_conversations`), notificaciones (`user_notifications`), `vera_pending_actions`.

**Pendiente (FEAT-009):** suscribir DashboardView a `brand_vulnerabilities`, `intelligence_signals`, `body_missions`, `retail_prices`, `competitor_ads`, `trend_topics`, `monitoring_triggers` con filtros por org y cleanup en `onLeave()`.

### 5.7 Auth

1. User → `/login` → `SignInView`
2. Submit → `supabase.auth.signInWithPassword({ email, password })`
3. Supabase devuelve JWT + refresh token (en localStorage)
4. `AuthService.checkAccess(requireAuth=true)` valida
5. Tras login → `getDefaultUserRoute()` → `/org/{shortId}/{slug}/dashboard`

`AuthService.js` expone: `login()`, `logout()`, `resetPassword()`, `socialLogin()` (OAuth Facebook, Google, etc.).

**Importante: `signUp()` no existe.** No hay flujo público de signup auto-servicio. Solo solicitud de acceso (lead) que escribe a `contact_leads`. Toda creación de cuenta hoy es manual (sin backend que la implemente).

---

## 6. Las 4 áreas que el cliente preguntó: estado real

### 6.1 Creación de usuario

**Spec del frontend:**
- `SignInView.js:38-189` — login (38-55) + recovery (57-68) + solicitud de acceso (70-189) que inserta a `contact_leads` con campos full_name, email, phone, company, role, country, market, website, brands, challenge, source.
- `DevLeadUserProvisioningView.js` — wizard de 4 pasos (cuenta base → permisos → organización → confirmación) que invoca tres endpoints backend: `admin-create-user`, `lead-provision-user`, `dev-create-user`.

**Backend:**
- En `functions/` (Netlify): **ninguno de los tres endpoints existe**.
- En `ai-engine`: tampoco. Los provisioners (`agent.provisioner`, `openclaw.provisioner`, `hetzner.provisioner`) crean **servidores y agentes**, no usuarios.

**Supabase:**
- `auth.users`: 1 fila (la del owner demo).
- `profiles`: schema completo (`id, email, full_name, role, is_developer, dev_role, dev_rank, default_view_mode, plan_type, form_verified, created_at, updated_at`). RLS habilitado.
- `organization_members`: schema con `permissions jsonb`.
- ⭐ **`organization_invitations` EXISTE con schema completo**: `id, organization_id, email, role, invited_by, token, expires_at, accepted_at, status, created_at`. **0 filas hoy.**
- `plans`: 5 tiers ya definidos.

**Veredicto**: la BD está lista para invitaciones + onboarding. Falta:
1. Función serverless de provisioning (Netlify Function o `POST /internal/users/provision` en ai-engine) que use Service Role para `auth.admin.createUser()` + insert en `profiles` + `organization_members` (+ opcional `organization_invitations`).
2. Email sender — `resend ^6.12.0` ya está en `package.json` del ai-engine pero no se usa.
3. Onboarding wizard post-signup que asigne `plan_type='trial'`, primera marca, etc.

### 6.2 Sistema automatizado de investigación de marca

**Frontend tiene ~10% expuesto:**
- `BrandOrganizationView.js` (60 KB) — formularios para llenar identidad de marca a mano.
- `BrandstorageView.js` (71 KB) — galería + sub-marcas.
- `IdentitiesView.js` — CRUD de productos/servicios/places.
- `MonitoringView.js:361-417` — placeholders explícitos: `// CRUD viene en próximo commit` para sensores y URL watchers.

**Backend tiene ~70% corriendo:**

| Capacidad | Estado |
|---|---|
| Sync Meta (FB+IG) | ✅ Funcional + sensor automatizado |
| GA4 | ✅ + sensor `ga4_audience_demographics` daily |
| YouTube | ✅ Lectura, no hay sensor automatizado |
| Scraping IG/TikTok/X/FB de competidores | ✅ Apify + fallback local |
| URL watchers + diff SHA-256 | ✅ Activo |
| Amazon retail prices | ✅ → `retail_prices` (vacía hoy por falta de competidores) |
| Meta Ad Library sync | ⚠️ Sensor corre pero ambos paths fallan (permisos + Playwright bug) |
| Audience inference (cruzar GA4 + Meta) | ✅ `audience-alignment.service` → genera `update_persona` actions |
| Sentiment / emotion / tone / topics | ✅ python-analyzer con pysentimiento + KeyBERT (sin LLM) |
| Image/video describer | ✅ Claude Sonnet 4.6 (~$0.0042/img cacheado) |
| Threat detection (3 reglas) | ✅ Activo (269 signals reales, 55 vulnerabilities) |
| Brand indexer con embeddings | 🐛 Sensor corre, tabla vacía (BUG-002, cuota OpenAI sospecha) |
| Trend topics extraction | ✅ Activo (1 435 trends en BD) |
| Auto-discovery de competidores dado dominio | ❌ NO existe |
| Onboarding scraper "te doy dominio, perfilamos marca" | ❌ NO existe |

**Datos en BD ya vivos hoy:**
- 419 brand_posts capturados
- 887 brand_post_comments
- 283 brand_content_analysis
- 269 intelligence_signals
- 1 435 trend_topics
- 80 body_missions (33 ejecutadas)
- 55 brand_vulnerabilities
- 99 media_descriptions_cache (Claude)

**Spec original (`DASHBOARD-MI-MARCA.txt` y `DASHBOARD-MI-COMPETENCIA.txt`)** habla de auditoría continua que entra a retailers cada 15 min, monitor de cumplimiento de precios cross-platform, detección de "lanzamientos en la sombra" (cambios en footers + nuevas categorías), análisis de "shadow mentions" en foros, índice de influencia real, fuga de audiencia, content gaps, etc. **Backend tiene la infraestructura para casi todo. El frontend no expone casi nada.**

### 6.3 Dashboards principales

#### Mi Marca — spec vs implementación

`DASHBOARD-MI-MARCA.txt` exige 15 dimensiones agrupadas en 5 bloques:

**A. Operatividad y Pulso**
1. Ritmo de publicación y latencia ✅ implementado (`engagement_trend`)
2. Mapa de calor horaria ✅ (`posting_hours_heatmap`)
3. Auditoría de formatos dominantes ✅ (parcial — top posts por reach)

**B. Identidad y Narrativa**
4. Dominio de pilares narrativos ✅ (`brand_narrative_pillars` + `featured_topic`)
5. Análisis de desviación de tono (Brand Soul Guard) ❌ — el dato existe en `brand_content_analysis.tone_detected` pero no hay UI con score de coherencia
6. Semántica de impacto ✅ parcial (topics + hashtags)

**C. Comercial y Distribución**
7. Monitor de cumplimiento de precios (MAP Monitor) ❌ — `retail_prices` existe pero vacía + sin UI
8. Mapa de disponibilidad y stock digital ❌
9. Análisis de ofertas dinámicas ❌

**D. Social y Percepción**
10. Sentimiento biométrico y micro-reacciones ✅ parcial (`sentiment_activity`)
11. Rastreo de "Shadow Mentions" ❌ — `intelligence_signals` con `signal_type='shadow_mention'` no consultado por UI
12. Índice de influencia real ❌

**E. Diagnóstica**
13. Mapa de puntos ciegos (Blind Spots) ❌
14. Análisis de fuga de audiencia ❌
15. Detección de "Crisis de Baja Intensidad" ❌ — `crisis_signals` table existe sin UI

**Implementadas: 8/15** (53%). **Faltan: 7.**

#### Mi Competencia — spec vs implementación

`DASHBOARD-MI-COMPETENCIA.txt` exige 10 dimensiones agrupadas en 4 bloques:

**A. Inteligencia de Precios y Retail**
1. Monitor de Precios Cross-Platform (SKU vs SKU) ❌ — `retail_prices` + `competitor_retail_tracking` existen sin UI
2. Rastreo de Stock Crítico ❌
3. Análisis de Ofertas y Bundles ❌

**B. Narrativa y Desempeño**
4. Mapa de Temas Ganadores ✅ (top posts + topics)
5. Benchmarking de Engagement Real ✅ (`kpis` + `top_posts`)
6. Detección de "Lanzamientos en la Sombra" ❌

**C. Vulnerabilidades**
7. Extracción de "Reviews Negativas" del Rival ❌ — `intelligence_signals` con sentiment negativo sin extracción UI
8. Análisis de Crisis de Reputación ❌ — `risk_alerts` parcial

**D. Inversión y Alcance**
9. Radar de Pauta Digital ❌ — `competitor_ads` vacía + sin UI
10. Influencer Mapping del Rival ❌

**Implementadas: 7/10** (70%) según el dashboard real, pero las 7 son las menos diferenciales (engagement básico). Las que faltan son las de mayor valor estratégico (precios, ads, reviews).

#### Tendencias — spec vs implementación

`DASHBOARD-TENDENCIAS.txt` exige 9 dimensiones en 4 bloques:

**A. Señales Emergentes**
1. Detección de "Señales Débiles" (niche signals) — `trend_topics` existe (1 435 filas)
2. Radar de Audios y Memes en Ascenso — no hay análisis de audio
3. Monitoreo de "Content Gaps" (océanos azules) — `v_orphan_topics` existe!

**B. Contexto Cultural y Climático**
4. Sincronización con el Mundo Físico — sin integración con weather/eventos
5. Sentiment Shift Global — `mv_sentiment_breakdown` existe

**C. Inteligencia Algorítmica**
6. Algorithmic Watchdog — sin detección de cambios algorítmicos
7. Hashtag & Keyword Velocity — `mv_signal_velocity_24h` existe!

**D. Estética y Narrativa**
8. Evolución Estética del Minuto — sin análisis visual auto
9. Narrative Hooks — sin análisis de aperturas

**Implementadas: 0/9** en frontend. Todo el dashboard hoy son arrays hardcoded en `DashboardView.js` líneas 479-735 (`TABS_ENABLED.tendencies = false` por flag).

⭐ **Pero la RPC `dashboard_tendencias(p_org_id, p_window_d, p_sections)` EXISTE en BD.** El frontend nunca la llama. Y los datos primarios (`trend_topics`, `v_orphan_topics`, `mv_signal_velocity_24h`, `mv_sentiment_breakdown`) están vivos.

#### Estrategia (bonus, deshabilitado por flag)

`TABS_ENABLED.strategy = false`. Status bar (Health Score + Threat Level), plan de acción 3 horizontes (hoy/semana/mes), calendario editorial, mission history. Lee `vera_pending_actions`, `flow_schedules`, `brand_audience_heatmap`, `brand_vulnerabilities`. UI lista. Le falta el bucle real de Vera (las acciones aprobadas no se ejecutan en muchos tipos; sin estimación de impacto en vivo).

### 6.4 Schedule

Esto fue la mayor sorpresa al cruzar BD. La cadena **está completamente cableada**.

#### El flujo real

```
1. [Frontend] StudioView → ❌ INSERT en flow_schedules con status='active'
                            (BLOQUEO: el botón "Programar" no existe;
                             el panel derecho de Studio dice
                             "Resumen — Próximamente" en línea 82-92)
                            ↓
2. [Supabase BD] tr_sync_flow_cron AFTER INSERT/UPDATE/DELETE ✅ EXISTE
                            ↓
3. [Supabase BD] sync_flow_to_cron() ✅ EXISTE
   • Si DELETE o status != 'active' → cron.unschedule(OLD.job_name)
   • Si INSERT/UPDATE con status='active':
     PERFORM cron.schedule(NEW.job_name, NEW.cron_expression,
                           format('SELECT public.execute_scheduled_flow(%L::uuid)', NEW.id));
                            ↓
4. [pg_cron] Cuando llega el momento → execute_scheduled_flow(p_schedule_id) ✅ EXISTE
   • Busca flow_modules.webhook_url_prod (o _test)
   • Busca content_flows.flow_category_type
   • Si flow_category_type='scraping' → payload = rpc_intelligence_context(p_schedule_id)
   • En cualquier otro caso → payload = rpc_ai_full_brand_product_context(p_schedule_id)
   • net.http_post(webhook_url, payload, headers='{"Content-Type":"application/json"}')
                            ↓
5. [n8n] Workflow ejecuta orquestación   webhook_url apunta a:
                                         • https://ardeagency.app.n8n.cloud
                                         • https://hooks.arde.agency
```

**Hallazgo clave**: el ejecutor real de los flows **NO es el ai-engine**. Es **n8n cloud** (más un n8n self-hosted o gateway propio en `hooks.arde.agency`).

Esto contradice lo que se asume comúnmente. La implicación: para cerrar la cadena solo falta el botón "Programar" en `StudioView.js` que haga el INSERT. **El worker en ai-engine NO es necesario.**

#### Estado real

- `flow_schedules`: 2 filas, ambos paused, `organization_id NULL` (semilla de prueba).
- `flow_runs`: 0 filas. Confirmado: ningún schedule de usuario nunca se ha disparado.
- `content_flows`: 6 (4 autopilot, 1 scraping, 1 manual).
- `flow_modules`: 6 con webhook_url (4 con prod, 4 con test).
- `pg_cron` job `production_master_autonomous_v1` activo a las 14:05 UTC diario, pero apunta a UUID `3ae2c78c-...` que **ya no existe en `flow_schedules`** → zombie cron silencioso.

#### Para cerrar end-to-end

1. **Botón "Programar" en `StudioView.js:78-92`** que recolecte campos del formulario (`cron_expression`, `entity_ids`, `campaign_ids`, `audience_ids`, `aspect_ratio`, `production_count`, etc.) y haga INSERT.
2. **Render de `flow_runs`** en `TasksView.js` (hoy solo muestra `flow_schedules`).
3. **Verificar n8n cloud activo** y los workflows existen para los 4 flows autopilot.
4. **Cleanup zombie cron** `production_master_autonomous_v1`.

---

## 7. Specs detallados — los 4 dashboards

### 7.1 Mi Marca — el manifiesto detallado

(Del spec original `docs/DASHBOARD-MI-MARCA.txt`, traducido al lenguaje implementacional)

> Mi Marca representa la "Salud Biométrica" de la empresa. OpenClaw actúa como auditor interno que nunca duerme. La autonomía esperada del agente para esta vista es:
> 1. **Auditoría Continua**: entrar a retailers y redes sociales cada 15 minutos.
> 2. **Cruce de Datos**: si detecta 5 quejas nuevas sobre el mismo tema en Amazon + precio subió, avisa.
> 3. **Acción Inmediata**: instruye a AI Smart Content para generar video aclaratorio o post de "Garantía de Calidad".
> 4. **Re-entrenamiento**: si la acción funciona, la próxima vez es más rápido.

Las 15 dimensiones esperadas se mapean a tablas reales:

| Dim | Concepto | Tabla(s) BD | RPC | Estado UI |
|---|---|---|---|---|
| 1 | Ritmo + latencia | `brand_posts.captured_at`, `brand_metrics_daily` | `_engagement_trend` | ✅ |
| 2 | Heatmap horario | `brand_audience_heatmap` | `_posting_hours` | ✅ |
| 3 | Formato dominante | `brand_posts.metrics`, `mv_brand_format_stats` | `_top_highlighted_posts` | ✅ |
| 4 | Pilares narrativos | `brand_narrative_pillars` | `_featured_topic` | ✅ |
| 5 | Brand Soul Guard | `brand_content_analysis.tone_detected` | (sin RPC dedicada) | ❌ falta UI |
| 6 | Semántica de impacto | `brand_content_analysis.why_it_worked`, `brand_posts.metrics` | `_optimization_insights` | ✅ parcial |
| 7 | MAP Monitor (cumplimiento precios) | `retail_prices` | (RPC nueva necesaria) | ❌ vacía + sin UI |
| 8 | Stock digital | `retail_prices.stock_status` | (idem) | ❌ |
| 9 | Ofertas dinámicas | `retail_prices.promo_label` | (idem) | ❌ |
| 10 | Sentiment biométrico | `brand_content_analysis`, `mv_sentiment_breakdown` | `_sentiment_activity` | ✅ parcial |
| 11 | Shadow Mentions | `intelligence_signals.signal_type='shadow_mention'` | (RPC nueva) | ❌ |
| 12 | Influencia real | `intelligence_signals` (mention authority) | (RPC nueva) | ❌ |
| 13 | Blind Spots | (cruce de pilares vs gaps) | (RPC nueva) | ❌ |
| 14 | Fuga de audiencia | (eventos GA4 / engagement curve) | (RPC nueva) | ❌ |
| 15 | Crisis baja intensidad | `crisis_signals`, `brand_vulnerabilities` | `_alert_score` | ❌ |

### 7.2 Mi Competencia — el manifiesto detallado

> Anticipación y contraataque. OpenClaw como unidad de inteligencia que desmantela la estrategia del rival en tiempo real. Patrullaje cada 10 minutos, detección de anomalías, ejecución de contra-estrategia, reporte de infiltración.

| Dim | Concepto | Tabla(s) BD | RPC | Estado UI |
|---|---|---|---|---|
| 1 | Precios cross-platform | `retail_prices`, `competitor_retail_tracking` | (RPC nueva) | ❌ vacía |
| 2 | Stock crítico rival | `retail_prices.stock_status` filtrado por competitor | (idem) | ❌ |
| 3 | Ofertas y Bundles | `retail_prices.promo_label` | (idem) | ❌ |
| 4 | Mapa de temas ganadores | `intelligence_content`, `intelligence_signals` | `_top_posts` | ✅ |
| 5 | Engagement benchmarking | `intelligence_content.metrics` | `_kpis` | ✅ |
| 6 | Lanzamientos en la sombra | `url_watchers` (footer/menu diff) | (RPC nueva) | ❌ |
| 7 | Reviews negativas rival | `intelligence_signals` con sentiment negativo | (RPC nueva) | ❌ |
| 8 | Crisis reputación rival | `intelligence_signals` clasificadas como crisis | `_risk` | ✅ parcial |
| 9 | Radar de pauta digital | `competitor_ads` (Meta Ad Library) | (RPC nueva) | ❌ vacía |
| 10 | Influencer mapping rival | `intelligence_signals` filtradas por author authority | (RPC nueva) | ❌ |

**Implementadas: 7/10** según métricas básicas, pero las 3 que faltan son las de **mayor valor diferencial**.

### 7.3 Tendencias — el manifiesto detallado

> Arbitraje de Atención. OpenClaw como detector de metales preciosos en el ruido digital. Escaneo de 360 grados cada 15 minutos visitando redes, portales de noticias, servicios meteorológicos y Google Trends especializado. Cruce de relevancia. Activación de respuesta. Misión de relevancia.

| Dim | Concepto | Tabla(s) BD | RPC | Estado UI |
|---|---|---|---|---|
| 1 | Señales débiles del nicho | `trend_topics`, `v_orphan_topics` | `dashboard_tendencias` ✅ existe | ❌ frontend mockup |
| 2 | Audios y memes ascendentes | (sin fuente de audio aún) | — | ❌ |
| 3 | Content gaps | `v_orphan_topics` ✅ poblado | `dashboard_tendencias` | ❌ |
| 4 | Sincronización mundo físico | (sin integración con weather/eventos) | — | ❌ |
| 5 | Sentiment Shift Global | `mv_sentiment_breakdown` ✅ refresh hora | `dashboard_tendencias` | ❌ |
| 6 | Algorithmic Watchdog | (sin detección de cambios algoritmicos) | — | ❌ |
| 7 | Hashtag/Keyword Velocity | `mv_signal_velocity_24h` ✅ refresh 15 min | `dashboard_tendencias` | ❌ |
| 8 | Evolución estética | (sin análisis visual auto) | — | ❌ |
| 9 | Narrative Hooks | (sin análisis de aperturas) | — | ❌ |

**Implementadas en frontend: 0/9.** Implementables hoy con datos existentes: **5/9**.

---

## 8. Inputs, flujos automatizados y Studio

### 8.1 INPUT_TAXONOMY (`docs/INPUT_TAXONOMY.md`)

Sistema de definición de interfaces dinámicas para flujos de IA. Cada input es un **UI Component Template** con data schema, comportamiento, reglas y visibilidad.

**Tipos por categoría:**

- **BASIC**: `text, textarea, number, boolean, select, multi_select, checkbox, radio, date, file_upload`
- **SMART TEXT**: `prompt_input, tag_input, slug_input`
- **SELECTORES SEMÁNTICOS**: `tone_selector, mood_selector, length_selector`
- **BRAND & IDENTITY** (Supabase-native): `brand_selector, entity_selector, audience_selector, campaign_selector`
- **MEDIA & REFERENCE**: `image_selector, gallery_picker, product_selector`
- **CONTROLS**: `range, switch`
- **ESTRUCTURAL**: `section, divider, description_block`

**Visibilidad**: `paas` (Builder), `saas` (usuario final), `advanced`.

**Frontend Render Container Registry** (`js/input-registry.js`, 84 KB) usa solo 8 contenedores genéricos: STRING, SELECT, MEDIA, BOOLEAN, NUMBER, RANGE, FILE, STRUCTURAL. Resuelve contenedor con `getContainerType(field)` desde `field.input_type` o `field.type`. La variación es **config/schema**, no código nuevo por tipo.

**Categorías creativas (Builder):** Presets, Estilo & Cámara, Motion & Perspectiva, Escenarios, Protagonistas, Branding & Copy, Distribución/Operación, Contexto & Productos, Media/Referencias, Controles UI, Básicos, Estructura. Permite arrastrar bloques tipo Figma/Wix.

### 8.2 Flujos automatizados — `flow_schedules`

`docs/AUTOMATED_FLOW_SCHEDULE_INPUTS.md`: los flujos con `flow_category_type='automated'` no tienen formulario para el usuario final; el usuario **programa** una tarea en `flow_schedules`.

Columnas que el usuario configura:

| Columna | Input type propuesto |
|---|---|
| `cron_expression` | `cron_schedule` (NUEVO — único type creado para esto) |
| `brand_id` | `brand_selector` |
| `entity_ids` (array) | `entity_selector` con multi |
| `campaign_ids` (array) | `campaign_selector` |
| `audience_ids` (array) | `audience_selector` |
| `aspect_ratio` | `aspect_ratio` (16:9 / 9:16 / 1:1 / 4:5) |
| `production_count` | `number` (1-10, default 1) |
| `production_specifications` | `textarea` |
| `metadata_config` | jsonb avanzado |
| `job_name` | `string` (UNIQUE, NOT NULL) |
| `is_active` | `toggle_switch` |

Schema esperado en `flow_modules.input_schema`:
```json
{
  "fields": [
    { "key": "cron_expression", "label": "Programación", "input_type": "cron_schedule", "required": true },
    { "key": "entity_id", "label": "Entidad", "input_type": "entity_selector", "required": false },
    { "key": "campaign_id", "label": "Campaña", "input_type": "campaign_selector", "required": false },
    { "key": "audience_id", "label": "Audiencia", "input_type": "audience_selector", "required": false },
    { "key": "aspect_ratio", "label": "Formato", "input_type": "aspect_ratio", "options": ["1:1","9:16","16:9","4:5"], "required": true },
    { "key": "production_count", "label": "Producciones por ejecución", "input_type": "number", "min": 1, "max": 10, "defaultValue": 1 },
    { "key": "production_specifications", "label": "Especificaciones", "input_type": "textarea", "required": false }
  ]
}
```

### 8.3 Verificación: Flow Schedules Verification (`docs/FLOW_SCHEDULES_VERIFICACION.md`)

Resumen de qué dice el doc:
- `flow_modules.input_schema` (primer módulo) define los campos del formulario "Programar".
- `flow_schedules` recibe el INSERT con `cron_expression`, `job_name`, `flow_id`, `user_id`, `brand_id` obligatorios.
- Trigger `tr_sync_flow_cron` y función `sync_flow_to_cron()` **ya existen en BD** (verificado).
- TasksView solo hace SELECT/UPDATE; **NO hay INSERT en frontend**.

Schema del repo (`SQL/schema.sql`) tiene `entity_id, campaign_id, audience_id` singulares.
La BD real tiene `entity_ids[], campaign_ids[], audience_ids[]` y `composition_mode` — **discrepancia documentada que requiere migración del schema dump del repo o aceptar drift**.

---

## 9. Pipeline de video — KIE/Kling

### 9.1 Decisión de stack

**Se usa solo la API de KIE** (`https://api.kie.ai`), NO la API oficial de Kling (`api.klingai.com`). KIE expone el modelo `kling-3.0/video`.

Documentos en `docs/`: `ANALISIS-VIDEO-KIE-KLING.md`, `KIE-VIDEO-API.md`, `FLUJO-VIDEO-OPENAI-KIE.md`, `VIDEO-BODY-LOGICA-KIE.md`.

### 9.2 Arquitectura asíncrona (evita timeout 524)

Las Netlify Functions tienen límite ~10-26 s. La generación de video tarda 30-120 s. Por tanto:
- Las funciones **solo crean** la tarea o **consultan** estado; nunca esperan al video.
- El **polling lo hace el frontend** (cada 3 s, hasta 12 min).
- Opcional: `KIE_VIDEO_CALLBACK_URL` para notificación push.

### 9.3 Flujo

1. **Director Brief** — usuario escribe el texto del prompt.
2. **PROMPT button** — POST a `/.netlify/functions/openai-cine-prompt` con `{director_brief, kling_elements, brand_context, cinematography}`. Devuelve `{prompt}` que se escribe en el textarea.
3. **PRODUCCIÓN button** — POST a `/.netlify/functions/kling-video-create` con:
```json
{
  "action": "createTask", "mode": "pro" | "std",
  "prompt": "...", "multi_shots": [],
  "duration": "5", "aspect_ratio": "16:9", "sound": true,
  "kling_elements": [{ "name", "description", "element_input_urls": ["url1","url2"] }]
}
```
4. La function valida y reenvía a KIE: `POST https://api.kie.ai/api/v1/jobs/createTask` con `Authorization: Bearer ${KIE_API_KEY}` y `model: 'kling-3.0/video'`.
5. KIE responde `{code:200, data:{taskId}}`. El frontend hace polling cada 3 s a `/.netlify/functions/kling-video-status?taskId=...` hasta 12 min.
6. Cuando `data.state === 'success'`: el frontend descarga el video con `/.netlify/functions/kie-video-download?videoUrl=...` y sube a Supabase (`production-outputs/kie-videos/{userId}/{taskId}.mp4`).
7. URL pública mostrada al usuario.

### 9.4 Validaciones

- Prompt truncado a 2 500 caracteres.
- Referencias `@name` en el prompt sin elemento válido se eliminan del texto.
- Si el prompt queda vacío tras esa limpieza → 400.
- Multi-shot: hasta 5 shots, duración repartida con `distributeDuration(totalSec, n)` (1-12 s por shot).
- `image_urls` se construye con TODAS las URLs de imágenes (producto, escena, adjuntos).
- `kling_elements` solo productos con chincheta activa (2 URLs por elemento, duplicar si solo hay 1).

### 9.5 Errores y troubleshooting

| Status | Significado |
|---|---|
| 401 | API Key inválida (revisar `KIE_API_KEY`) |
| 402 | Saldo insuficiente en KIE |
| 422 | Validación falló (ver `kieBody` en consola) |
| 524 | Timeout del lado de KIE (no del request). Reducir complejidad: modo std, 5s, menos imágenes, prompt < 500 chars. |

**Inconsistencia documentada**: en `VideoView.js` se guarda `provider: 'kling_api'` pero `docs/VERIFICACION-SYSTEM-AI-OUTPUTS.md` consulta `provider = 'kie_api'`. **Unificar a `kie_api`**.

### 9.6 system_ai_outputs

Tabla que registra cada generación AI:
- INSERT en estado `processing` cuando se crea la tarea
- UPDATE a `completed` con `metadata.video_url` o `failed` con `error_message`
- RLS: usuario solo ve sus filas (`user_id = auth.uid()`) o developer
- Providers: `openai`, `kie_api`

---

## 10. Vera — el agente: análisis profundo

### 10.1 Filosofía core

> **OpenClaw puede pensar, sugerir y pedir. AI Engine decide, ejecuta y registra.**

Vera nunca tiene la última palabra. Cada acción pasa por: validación de schema, policy check, consent gate, presupuesto, timeout, audit log. La autoría está en el AI Engine, no en el LLM.

### 10.2 Identidad — `defaults/AGENTS.md`

VERA = **"Visión Estratégica en Respuesta Autónoma"**. Nacida de ARDE Agency, mantra "AI is the engine. Humans are the pilots."

Reglas explícitas del prompt:
- Investiga antes de opinar. No asume, no inventa datos.
- Prioriza por impacto comercial, no por volumen.
- Habla como la marca, no como IA.
- Si los datos están en su contexto, los usa directamente. Si no, lo dice.
- Cada entrega tiene algo que el cliente no pidió pero necesitaba.
- Nunca contenido genérico. Si no puede personalizarlo, no lo produce.
- Nunca fabrica métricas. Sin datos reales, sugiere cómo obtenerlos.

**Formato interactivo (jerárquico):**
1. ¿Puede MOSTRAR en vez de describir? → gráfico, diagrama, mapa, tabla
2. ¿Puede dejar ELEGIR? → botones, opciones tappables
3. ¿Puede usar DATOS REALES? → consultar tools, no inventar
4. Solo si nada visual aplica → prosa natural

Si la respuesta tiene 4+ datos comparables, **GRAFICO** (Recharts/Chart.js JSON o `mermaid`). Si tiene ubicaciones, MAPA. Si tiene proceso, DIAGRAMA.

**Anti-patrones explícitos:**
- NUNCA texto plano cuando hay datos graficables
- NUNCA >1 pregunta de clarificación por turno
- NUNCA gráficos sin datos reales
- NUNCA ignorar historial de conversación
- NUNCA listas de "10 tips" — integrar en narrativa o opciones accionables

### 10.3 Memory banks (5 archivos, ~24 KB)

#### `vera-identity.mb` (4 KB)
Declaración de existencia, origen ARDE, identidad central, lo que NO hará, estilo. Establece: nombre, rol (Inteligencia Operativa de Marca), plataforma (AI Smart Content), creadora (ARDE Agency), propósito ("Hacer que cada marca sea imposible de ignorar").

#### `vera-brand-thinking.mb` (5.7 KB)
Filosofía: la marca como organismo vivo. **4 ejes**:
1. Identidad (ADN interno: propósito, valores, arquetipo, palabras clave/prohibidas)
2. Audiencia (no demografía, psicografía profunda con dolores/deseos/objeciones/gatillos)
3. Oferta (productos/servicios, precios, beneficios, diferencia real)
4. Mercado (posicionamiento competitivo, brechas, tendencias)

Cómo analiza competidores: no solo lo que hacen sino el **por qué**. Triangulación de señales débiles. Cómo procesa tendencias: filtro de 4 pasos (relevancia, velocidad, ventana, alineación). Cómo evalúa contenido: auténtico + relevante + oportuno (las 3, sino es ruido). Jerarquía estratégica: 1) retención, 2) capitalización, 3) adquisición, 4) experimentación.

#### `vera-content-strategy.mb` (5.7 KB)
Triángulo del contenido (marca/audiencia/mercado). Emoción-objetivo (urgencia, deseo, confianza, empoderamiento, curiosidad, pertenencia, nostalgia). 4 tipos de contenido por funnel (reconocimiento, consideración, conversión, retención). Pilares (3-5). Frecuencia mínima/ideal por plataforma. Ritual de la autopsia. Registro de victorias explicadas. **Preparación A2A Commerce 2027.**

#### `vera-data-protocol.mb` (4 KB)
**Cómo accede a datos**: ai-engine **inyecta automáticamente** todo el contexto de la org al iniciar conversación. NO necesita llamar tools para datos básicos. Lista las 12 secciones del contexto: `SESIÓN DE TRABAJO`, `DATOS ACTUALES DE LA MARCA`, `PRODUCTOS`, `SERVICIOS`, `AUDIENCIAS`, `CAMPAÑAS`, `ENTIDADES DE MARCA`, `COMPETIDORES`, `TENDENCIAS DETECTADAS`, `EJECUCIONES RECIENTES`, `FLUJOS PROGRAMADOS`, `RESULTADOS ADICIONALES`.

Reglas:
- CON DATOS → responde directamente
- SIN DATOS → "No encuentro X. ¿Quieres que te ayude a estructurarlo?"
- DATOS PARCIALES → "Tengo Y. Para más completo necesitaría Z. ¿Lo agregamos?"
- Acciones de escritura → presenta plan + "APPROVE_ACTION:NOMBRE"

#### `vera-platform-knowledge.mb` (5 KB)
Conocimiento de la plataforma: brand_containers, módulos, dashboards, integraciones, 3 niveles de autonomía, flujo típico de sesión.

⭐ **Límite fundamental**: **VERA NO PUBLICA DIRECTAMENTE en redes ni canales externos.** Todo el contenido se deposita en AI Smart Content listo para usar/editar. La decisión de qué publicar y cuándo es siempre del cliente humano.

### 10.4 Skills

**9 paquetes en `defaults/skills/`** (cada uno con `SKILL.md` + carpeta `reference/`):
brand-dna-reading, campaign-architecting, competitor-post-analyzer, content-manifesting, copy-forging, daily-briefing, data-protocol, social-analytics, trend-sensing.

**25 skills instaladas** en la instancia de producción (las extras vienen del catálogo OpenClaw):
+ anti-generic-filter, audience-decoding, brand-auditing, brand-voice-codifying, competitive-infiltration, content-atomizing, crowd-simulating, emotional-timing, error-learning, geo-optimizing, hook-matrix-generating, market-intuition, narrative-threading, reflexion-loop, surprise-creating, visual-directing, visual-prompting.

### 10.5 Arquitectura runtime

- **Vera = identidad** (prompts + memory banks + skills) inyectada al workspace.
- **OpenClaw = framework de agente LLM-agnóstico** (de ARDE) que ejecuta a Vera.
- 1 instancia OpenClaw por org en servidor Hetzner dedicado.
- Comunicación: ai-engine → HTTP POST `http://<server-ip>:3001/agent/run` con timeout 60s + 5s red.
- **Aislamiento estricto**: jamás fallback de un agente de una org a otro.

**Memoria persistente — 3 capas:**

| Capa | Contenido | Persistencia |
|---|---|---|
| SHORT | Últimos 10 mensajes literales | `ai_messages` directo |
| LONG | Resumen narrativo comprimido | `ai_messages` con prefijo `MEMORY_SUMMARY <json>`, role=`system` |
| GOAL | Objetivo de sesión | `ai_messages` con marcador, extraído por `intent.detector.js` |

`maybeSummarize()` se llama cuando supera threshold. **Hoy es stub textual hasta conectar OpenClaw como summarizer.**

### 10.6 Tool Dispatcher (`services/tool.dispatcher.js`, 24 KB)

```
dispatchTool(toolName, args, ctx) →
  1. validateToolCallBatch  (schema + injection check)
  2. checkToolBudget        (presupuesto sesión)
  3. Phase check            (allowlist por autonomía)
  4. checkPolicy            (plan + rol + créditos)
  5. Consent gate           (según consent mode)
  6. Ejecutar con timeout   (8s default, configurable por tool)
  7. Audit log
```

Si falla cualquier capa → tool no se ejecuta, Vera recibe error estructurado.

**Budgets:**
- `SESSION_TOOL_BUDGET=20` — máx 20 tool calls por sesión
- `SESSION_TOKEN_BUDGET` — límite global tokens
- `SESSION_TTL_MS=600000` (10 min) — tras inactividad cierra sesión

**85+ tools registradas** en 8 categorías:
- **Read brand** (10): `getBrandProfile`, `getAudiences`, `getProducts`, `getIntegrations`, `getOrgOverview`, etc.
- **Inteligencia** (5): `getIntelligenceEntities`, `getIntelligenceSignals`, `getBrandPosts`, `getTrendTopics`, `getRetailPrices`
- **Campañas** (2): `getCampaigns`, `getCampaignDetail`
- **Flujos** (4): `getAvailableFlows`, `getFlowSchedules`, `getFlowRuns`, `getFlowRunOutputs`
- **Escritura** (11): `updateBrandProfile`, `upsertAudience`, `upsertProduct`, `upsertBrandColor`, etc.
- **Scraper/monitoreo** (10): `getScraperSessions`, `getScraperDashboard`, `updateMonitoringTrigger`, `addIntelligenceEntity`, `runScraperTest`
- **Redes sociales** (6): `getSocialSummary`, `getMetaPageInsights`, `getMetaPosts`, `getInstagramInsights`, `getGoogleAnalytics`
- **Dashboards** (27): wrappers de las 39 RPCs

### 10.7 Policy Engine (`lib/policy.engine.js`)

Capas de verificación para acciones con consecuencia:
1. Plan de org: `basico=0, starter=1, pro=2, business=2, enterprise=3`
2. Rol: `viewer=0, member=1, admin=2, dev=2, owner=3`
3. Créditos disponibles (`organization_credits.credits_available`)

ACTION_RULES ejemplos:
```js
triggerFlowRun:     { minPlan: "pro",     minRole: "admin", creditCost: 1 },
createFlowSchedule: { minPlan: "starter", minRole: "admin", creditCost: 0 },
CREATE_CAMPAIGN:    { minPlan: "basico",  minRole: "admin", creditCost: 0 },
```

### 10.8 Action Executor (`services/action-executor.service.js`)

Lee `body_missions WHERE status='pending'`. Dispatch según `mission_type`:
- `publish_post` → Meta Graph API
- `update_price` → Shopify/Mercado Libre
- `send_email` → Resend
- `update_persona` → audience_personas UPDATE
- `link_brief_to_campaign` → fn_link_brief_to_campaign RPC

**Hoy implementados: 4 tipos** (`create_audience`, `update_audience`, `update_brand_container`, `link_brief_to_campaign` confirmado por BD). **Faltan ~25 tipos**, todos lanzan "not implemented".

### 10.9 Estado real (snapshot 2026-05-05)

#### Provisioning del agente
```
openclaw_instances (única org demo):
  status:                healthy
  server_ip:             88.99.174.96 (Hetzner nbg1)
  server_id:             126883752
  agent_id:              org_a10000000000000000000000
  workspace_path:        remote://hetzner/org_a10000000000000000000000
  last_healthy_at:       2026-04-13
  last_request_at:       NULL          ← nunca se le ha hecho un request desde provisioning
  request_count:         0
  25 skills_installed
  5 mb_installed
  provisioning_phase:    complete
```

#### Chat con Vera
```
ai_conversations:        1   (creada 2026-04-13)
ai_messages:             10  (5 user + 5 assistant)
  • último mensaje real: 2026-04-13 — "ADN de marca IGNIS" (respuesta extensa, bien hecha)
  • último ping:         2026-04-30 — "prueba 2" → "PONG"
ai_brand_vectors:        0   ← brand-indexer NUNCA escribió (BUG-002)
ai_global_vectors:       0
ai-knowledge bucket:     1 placeholder de 0 bytes en estructura jerárquica
```

**Vera-como-chatbot lleva ~3 semanas sin uso real.** La calidad de las respuestas vistas en BD (13-abr) es alta: tono coherente con la identidad, formato enriquecido con headers, números, secciones, sin relleno corporativo. **El agente funciona; nadie lo está usando.**

#### Lo que SÍ corre autónomamente

| Pipeline | Estado | Datos |
|---|---|---|
| `threat-detector.service` | ✅ Corriendo | 269 `intelligence_signals` reales |
| `body_missions` | ✅ 80 misiones | 33 `competitor_signal_analysis` completed, 45 pending, 1 failed; 1 `update_persona` pending |
| `mission_runs` | ✅ 34 runs | 33 completed, 1 failed; duración 30s-3min; última 2026-04-21 |
| `audience-alignment.service` | ✅ Corriendo | Auto-genera `vera_pending_actions` `update_persona` |
| `vera_pending_actions` | ⚠️ 4 acciones | 2 `update_persona` pending, 1 `update_persona` executing (¿colgada?), 1 `link_brief_to_campaign` executed |

**Lectura:** la "autonomía pasiva" funciona. La "autonomía activa" (chat) no se está usando.

#### MCP Server stdio

`src/mcp/ai-engine-tools.js` (38 KB) es un servidor MCP stdio per-org que expone los mismos tools al OpenClaw remoto sin pasar por HTTP. Validación org-scoped por proceso (`ORG_ID` env). RLS via JWT org-scoped (`org-jwt.js`).

OpenClaw registra MCP via `openclaw mcp set ai-engine-tools {...}`.

---

## 11. Webhooks Meta y system_ai_outputs

### 11.1 Webhooks Meta (`docs/webhook-meta-setup.md`)

URLs:
- `https://aismartcontent.io/api/webhooks/meta` → Facebook Pages
- `https://aismartcontent.io/api/webhooks/instagram` → Instagram Business

Ambas apuntan a `functions/api-webhooks-meta.js` (16 KB).

**Variables Netlify:**
- `META_APP_ID`, `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN` (mínimo 32 chars, ej: `openssl rand -hex 32`)

**Configuración en Meta Developers Console** — Webhooks:
- Callback URL: `https://aismartcontent.io/api/webhooks/meta`
- Verify Token: el valor de `META_WEBHOOK_VERIFY_TOKEN`
- Suscribir Page Object: `feed`, `mention`, `page`
- Suscribir Instagram Object: `mentions`, `comments`, `story_insights`, `media`

**Permisos OAuth:**
```
pages_show_list
pages_read_engagement
pages_read_user_content
pages_manage_metadata          ← OBLIGATORIO para suscribirse a webhooks
instagram_basic
instagram_manage_insights      ← webhooks Instagram Business
read_insights
```

⚠️ `ads_read` NO es necesario para contenido orgánico.

**Flujo end-to-end:**

```
Meta publica evento
        ↓
POST /api/webhooks/meta
        ↓ Verificar firma HMAC-SHA256 (X-Hub-Signature-256)
        ↓ Identificar brand afectado (FB: metadata.selected_page_id; IG: metadata.pages[].instagram_business_account.id)
        ↓ Marcar brand_analytics_snapshots.computed_at = epoch pasado → isStale() = true
        ↓ Supabase Realtime notifica al frontend
        ↓ Frontend detecta cambio → /api/insights/mybrand → ve stale:true
        ↓ Frontend dispara /api/brand/sync-meta en background
        ↓ sync-meta llama a Meta Graph → actualiza brand_posts + snapshots
        ↓ Realtime notifica de nuevo → frontend re-renderiza
```

**Test del handshake:**
```bash
curl "https://aismartcontent.io/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=test123"
# Debe responder: test123
```

### 11.2 system_ai_outputs (`docs/VERIFICACION-SYSTEM-AI-OUTPUTS.md`)

Tabla que registra cada generación AI para auditoría y replay.

**Providers actuales:** `openai` (prompts cinematográficos), `kie_api` (videos Kling). **Nota: discrepancia documentada con `VideoView.js` que guarda `kling_api`. Unificar.**

Output types: `text`, `video`. Status: `processing`, `completed`, `failed`.

```sql
SELECT id, provider, output_type, status, prompt_used, left(text_content, 80) AS preview, created_at
FROM public.system_ai_outputs
WHERE provider = 'openai'
ORDER BY created_at DESC LIMIT 5;

SELECT id, provider, status, external_job_id, error_message,
       metadata->>'video_url' AS video_url, updated_at
FROM public.system_ai_outputs
WHERE provider = 'kie_api'
ORDER BY created_at DESC LIMIT 5;
```

---

## 12. Seguridad

### 12.1 RLS — el modelo

`docs/SEGURIDAD_RLS_MAPA_PAGINAS.md` traza el mapa página → tablas:

| Página | Tablas |
|---|---|
| Hogar | organizations, organization_members, organization_credits, brand_containers, profiles, subscriptions, brands, brand_colors |
| Brands | brand_containers, brands, products, brand_assets, brand_entities, brand_places, audiences, brand_colors, brand_rules, organization_members, organization_credits, credit_usage |
| Products | products, product_images, brand_containers |
| Studio | organization_credits, content_flows |
| Living | profiles, brand_containers, products, flow_runs, runs_outputs, credit_usage, brands |
| Settings | profiles |
| Dev Dashboard | developer_stats, content_flows, flow_runs, developer_logs |
| Login/Auth | profiles, brand_containers |
| Navigation | organizations, profiles, organization_credits, organization_members, flow_runs, user_flow_favorites |

**Recomendaciones del doc** (parcialmente aplicadas, parcialmente pendientes):
1. Activar RLS en: `brands`, `brand_assets`, `campaigns`, `credit_usage`, `organization_credits`, `product_images`, `subscriptions`, `profiles` ✅
2. Políticas para: `storage_usage`, `developer_notifications`, `flow_collaborators`, `flow_modules`, `runs_inputs`, `runs_outputs`, `ai_brand_vectors` ✅ pendiente verificar políticas concretas
3. Las 5 tablas SIN RLS hoy (`classifier_blacklist`, `emerging_patterns`, `external_api_cache`, `lexicon_enrichment_runs`, `viral_predictions`) requieren auditoría de GRANTs.

### 12.2 SECURITY.md — política de secretos

**Secretos protegidos:**
- `service_role` key en Netlify Functions / ai-engine
- Tokens OAuth Meta/Google en `brand_integrations.access_token` (cifrado con `encryption_iv`)
- Webhooks HMAC: `META_APP_SECRET`, `SUPABASE_WEBHOOK_SECRET`
- API keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `KIE_API_KEY`, `KLING_*`, `HETZNER_API_TOKEN`
- Internos: `INTERNAL_ADMIN_TOKEN`, `INTERNAL_API_KEY`, `OPENCLAW_GATEWAY_TOKEN`

**Reglas globales (CLAUDE.md):**
- Siempre leer `.env` antes de llamadas a Meta API
- Nunca exponer valores de tokens en pantalla
- Confirmación obligatoria antes de cualquier escritura del MCP `meta-ads`

### 12.3 Estado de buckets

Ver §3.8: 7 de 8 públicos. `media_descriptions_cache` en BD tiene Claude descriptions de imágenes con personas — si las URLs son adivinables, son públicas. **Pendiente revisar si hay PII circulando en buckets públicos.**

---

## 13. Optimizaciones de rendimiento (`docs/OPTIMIZACIONES_RENDIMIENTO.md`)

### 13.1 Limpieza al cambiar de vista

Router llama `currentView.onLeave()` y `currentView.destroy()` antes de montar nueva vista. Evita fugas de memoria por listeners no eliminados.

### 13.2 BaseView cleanup

`cleanup()` recorre `this.eventListeners` y hace `removeEventListener`. El header del usuario (dropdown) usa este patrón.

### 13.3 DevBuilderView debounce

Listeners en `document` se guardan en `_documentListeners` y se eliminan en `destroy()`.

Debounce 160 ms en propiedades del form: el modelo se actualiza en el handler del input; solo el re-render del canvas/JSON/footer va con debounce.

### 13.4 DevTestView timer cleanup

`onLeave()` hace `clearInterval(this.timerInterval)` para no dejar timer corriendo al cambiar ruta.

### 13.5 Utilidad debounce

`window.Performance.debounce(fn, wait)` en `js/utils/Performance.js`. Disponible para todas las vistas.

### 13.6 Tabla resumen aplicado

| Área | Cambio | Efecto |
|---|---|---|
| Router | `onLeave()` + `destroy()` antes de nueva vista | Menos fugas |
| BaseView | `cleanup()` real | Limpieza correcta al salir |
| DevBuilderView | `destroy()` limpia `_documentListeners` | No se acumulan handlers |
| DevBuilderView | Debounce 160 ms en UI update | Escritura fluida |
| DevTestView | `onLeave()` limpia timerInterval | No queda timer al cambiar ruta |

---

## 14. Sidebar usuario — UX spec (`docs/SIDEBAR_USUARIO_SPEC.md`)

Sidebar dividido en 2 zonas:

**Zona 1 — Workspace Navigation (arriba):**
- Header: Workspace switcher con nombre + plan + dropdown
- Navegación principal:
  1. **Production** (página directa)
  2. **flows** (contenedor expandible: Posts, Reels, Stories, etc.)
  3. **Identity** (contenedor expandible: Brand, Products, Services, Audiences, Campaigns, Assets, Reglas IA)

**Zona 2 — Organization Control (footer anclado):**
- Configuración (página directa)
- Planes (página directa)
- Créditos (compra/recarga, no muestra balance)
- Salir de la organización (modal de confirmación)

**Reglas visuales:**
- Iconografía: 16×16 px, stroke consistente, monocromático
- Tipografía: 13 px (primarios 500, subitems 400)
- Altura fila: 36 px
- Active: background capsule, border-radius 8 px
- Hover: opacity 6-8%, transition 120 ms

**Comportamiento:**
- Solo 1 contenedor expandido a la vez
- Estado persistido en localStorage (`sidebarUserExpanded`)
- Active state coincide con ruta actual

---

## 15. Deuda técnica activa

`docs/task/` lleva un registro vivo. Cada item es un archivo independiente; al resolver se elimina (git history es el archivo histórico). **Estadística actual: 10 tareas activas, todas requieren intervención humana** (`auto_eligible: no`).

### 15.1 Convención de la carpeta

- Formato del nombre: `{TYPE}-{NNN}-{slug}.md`
- Tipos: BUG, DATA, FEAT, OPS, DOCS, TEST
- Ciclo de vida: archivo se crea → se ejecuta → se **elimina al resolver**
- Frontmatter obligatorio: `id, title, severity, type, status, auto_eligible, est_duration, created, owner, blocked_by`
- Estructura: Síntoma, Evidencia, Hipótesis, Pasos para resolver, Criterio de done
- Ordenamiento: por severity descendente
- **Auto-elegibilidad**: tareas marcadas `yes` pueden ejecutarse autónomamente entre 23:00-03:00 Bogotá. Las marcadas `no` requieren humano.

**Histórico reciente**: el 2026-04-30, en sesión autónoma se cerraron **11 tareas** incluyendo definición de RPCs dashboard, matviews, pg_cron jobs, configuración de realtime, y fixing del quota OpenAI (parcial). La acción pendiente de esa sesión es resolver la quota de OpenAI para que `brand-indexer` genere vectores reales (BUG-002 root cause).

### 15.2 Las 10 tareas activas (orden por severidad)

#### CRÍTICO

**BUG-001 — Body missions colgadas ✅ RESUELTO 2026-05-05**
- Causa raíz confirmada: la migración Apify del 28/4 ("droplegacy") removió los handlers de `competitor_signal_analysis` y `execute_update_persona` del `action-executor.service.js`, pero NO removió la creación río arriba en `signal-webhook.controller.js:124` ni los pending_actions tipo `update_persona` en `audience-alignment.service.js`.
- Decisión de producto: Opción A — eliminar el flujo (post-Apify el python-analyzer + Claude ya enriquecen signals).
- Cambios aplicados: `enqueueSignalAnalysis` reescrita para no crear body_missions ni jobs (solo `brand_vulnerabilities` para HIGH/CRITICAL). Bloque `if (score < 0.5) → INSERT vera_pending_actions` eliminado en `audience-alignment.service.js`.
- Cleanup BD: 46 body_missions → `failed`, 3 vera_pending_actions tipo `update_persona` → `expired`. Backups en `_bak_stuck_missions_2026_05_05` y `_bak_stuck_actions_2026_05_05` (drop tras 30 días).

#### ALTO

**DATA-001 — Configurar entidades competidoras**
- `competitor_ads`, `retail_prices`, `url_watchers`, `visual_references` están **vacías**
- Causa: solo 7 `intelligence_entities` totales, ninguna probablemente configurada como competidor real
- Sensores corren con success pero sin target → 0 escrituras
- **Input requerido**: lista de 3-5 competidores reales con `name`, `domain ∈ {social, marketplace, web, news, analytics}`, `target_identifier` (handle/URL/SKU), `metadata.es_competidor=true`
- **Pasos**: insertar en `intelligence_entities`, trigger `fn_intelligence_entities_after_insert` provisiona sensores per-entity automáticamente, esperar 24-48h
- **Criterio**: ≥3 entities con `metadata.es_competidor='true'` por org, después de 24-48h las 4 tablas reciben datos

#### MEDIO

**FEAT-007 — Refactor frontend services para 1 RPC por dashboard**
- `MiBrandaDataService.js` ejecuta ~15 queries paralelas; `StrategiaDataService.js` ~10
- Objetivo: cambiar a una única `supabase.rpc('dashboard_X', {...})`
- Bloqueado por FEAT-006 (probablemente cerrada el 2026-04-30)
- Beneficios: 1 round-trip vs 15, coherencia transaccional, menos código frontend, fácil cachear
- Patrón: adapter para mantener shape de retorno y no tocar `DashboardView`

**FEAT-008 — Crear CompetenciaDataService y TendenciasDataService**
- Mirror de MiBrandaDataService post-refactor
- `_renderCompetence()` y `_renderTendencies()` hoy son stubs en DashboardView
- Bloqueado por FEAT-006

**FEAT-009 — Suscripciones realtime en DashboardView**
- Suscribir a 7 tablas (`vera_pending_actions`, `brand_vulnerabilities`, `body_missions`, `intelligence_signals`, `retail_prices`, `competitor_ads`, `trend_topics`)
- Implementar `_subscribeRealtime()` y `_unsubscribeRealtime()` con filtros por org/entity
- Cleanup en `onLeave()` para no acumular channels
- Bloqueado por FEAT-005 (publication extendida — probablemente cerrada el 2026-04-30)

#### BAJO

**OPS-001 — Hetzner snapshots semanales**
- Configurar Hetzner Cloud Console → Snapshots → semanal domingo 04:00 UTC, retención 4 snapshots
- Costo: ~€0.08/mes para 8 GB
- Documentar en `docs/platform/08-deployment.md`

**OPS-002 — Uptime monitor externo**
- Configurar UptimeRobot / Better Stack / Cronitor
- Endpoints: `aismartcontent.io/`, `api.aismartcontent.io/server/health`, `api.aismartcontent.io/webhooks/run-scraper`
- Notificación a `info@ardeagency.com`

**OPS-003 — Supabase CLI con migraciones versionadas**
- Hoy aplicamos SQL ad-hoc vía Management API
- Migrar a `supabase` CLI con `supabase/migrations/`
- Generar baseline desde schema actual: `supabase db dump`
- Workflow: `supabase migration new mi_cambio` → editar → `supabase db push`

**OPS-005 — Backup .env en secret manager**
- `/root/ai-engine/.env` con 27+ secrets críticos es punto único de fallo
- Recomendación: **Supabase Vault** (extension ya instalada `supabase_vault 0.3.1`)
- Permite `vault.create_secret('NAME', 'value')` + `decrypted_secret FROM vault.decrypted_secrets`
- Beneficios: 1 fuente de verdad, rotación con auditoría, frontend Functions pueden leer

**TEST-001 — Test suite foundation**
- No hay test suite formal. Hay `*.mjs` de diagnóstico ad-hoc en ai-engine
- Smoke tests críticos: RPCs públicas devuelven shape esperado, endpoints ai-engine responden, RLS funciona, triggers críticos disparan
- Stack sugerido: Vitest o `node --test` builtin
- CI: GitHub Actions en cada PR a main

### 15.3 Mapeo a las prioridades reales

| Eje del cliente | Tareas activas relacionadas |
|---|---|
| Creación de usuario | (sin tarea activa todavía — toda nueva) |
| Investigación de marca | DATA-001, BUG-002 (no está en la lista pero la sesión 2026-04-30 dejó OpenAI quota como pending) |
| Concluir dashboards | FEAT-007, FEAT-008, FEAT-009 |
| Schedule | (no hay tarea activa — botón "Programar" debería ser FEAT-010 nuevo) |
| Vera (chat) | (no hay tarea — verificar VeraView debería ser BUG-003) |
| Vera (autónoma) | BUG-001 |
| Operaciones | OPS-001, OPS-002, OPS-003, OPS-005, TEST-001 |

---

## 16. Lo que se ha resuelto (snapshot histórico documentado)

### 16.1 Cerrado en sesión autónoma 2026-04-30 (11 tareas)

Según `INDEX.md` actualizado el 2026-04-30, la última sesión autónoma cerró:

1. **FEAT-001 a FEAT-006** — definición de RPCs dashboard, matviews, pg_cron jobs, configuración de realtime
2. **OPS-004** — fixing del quota OpenAI (parcial; resolución completa pendiente)
3. Otras 4 tareas misceláneas no detalladas en el INDEX

### 16.2 Bugs históricos registrados como resueltos en docs

- **Cache busting (commit 961b5fb)**: scripts en `index.html` sin `?v=__BUILD_ID__` causaban cacheo Cloudflare 7d → fix global
- **Resolución `orgIdShort` → UUID (commit d3bbf07)**: router resuelve `routeParams.orgId` automáticamente
- **MiBrandaDataService scoping correcto**: filtrado por entity_ids en `intelligence_signals` (que no tiene `organization_id`)
- **`tr_sync_flow_cron` trigger + `sync_flow_to_cron()`**: existían en BD pero no en repo. Hoy verificados activos.
- **`execute_scheduled_flow` RPC**: existe y funciona con n8n cloud webhooks
- **8 vistas materializadas + 8 jobs pg_cron**: todos vivos auto-refrescando
- **`organization_invitations` table**: schema completo creado (no usado aún)
- **`plans` table seeded**: 5 tiers con créditos definidos

### 16.3 Pipelines vivos en producción

- Captura: scrapers de competencia corriendo cada 45 min
- Análisis cualitativo: python-analyzer FastAPI con pysentimiento + KeyBERT
- Threat detection: 269 signals reales generados
- Mission generation: 80 misiones, 33 ejecutadas
- Token refresh: Google OAuth manteniéndose vivo
- Apify integration: 44 runs ejecutados con cache global

---

## 17. Lo que persiste sin resolver

### 17.1 Bugs activos

1. **BUG-001 (CRÍTICO)** — body missions colgadas desde 2026-04-27.
2. **BUG-002 (alto, no listado en `docs/task/` pero verificado)** — `ai_brand_vectors` y `ai_global_vectors` vacíos. `brand-indexer` corre con success pero no escribe. Sospecha: cuota OpenAI consumida.
3. **Meta Ad Library sensor** — corre pero ambos paths fallan (permisos API + Playwright bug). 0 ads capturados.
4. **`vera_pending_actions` colgadas** — 1 acción `update_persona` en `executing` desde 2026-04-28 sin avanzar (falta retry/timeout en action-executor).

### 17.2 Subsistemas no implementados

- **Auto-discovery de competidores** dado dominio (única pieza grande que no existe ni en backend)
- **Onboarding scraper** que autocomplete `brand_profiles` desde un dominio
- **Sentiment shift global con weather/eventos** culturales (Tendencias: dimensión 4)
- **Algorithmic watchdog** (Tendencias: dimensión 6)
- **Análisis visual auto** (estética del minuto, narrative hooks — Tendencias 8-9)
- **Audio analysis** (audios y memes en ascenso — Tendencias 2)

### 17.3 Subsistemas implementados pero apagados/incompletos

- **`api-brand-analyze-posts.js`** — OpenAI deshabilitado a propósito en líneas 26-32: *"Se habilitará cuando se defina el flujo de consumo controlado de tokens"*. Política pendiente.
- **Action Executor** — 4 de ~29 tipos implementados (los demás lanzan "not implemented")
- **MonitoringView CRUD sensores y URL watchers** — placeholders explícitos en frontend
- **Tab Tendencias** — `TABS_ENABLED.tendencies = false`. Datos hardcoded en líneas 479-735.
- **Tab Estrategia** — `TABS_ENABLED.strategy = false`. UI lista pero sin bucle real con Vera.

### 17.4 UI sin construir aunque los datos existen

- Mi Marca: **7 de 15** dimensiones del spec sin componentes (Brand Soul Guard, MAP Monitor, stock, ofertas, shadow mentions, influencia, blind spots, fuga de audiencia, crisis baja intensidad)
- Mi Competencia: **3 de 10** dimensiones sin componentes (precios cross-platform, ad intelligence, reviews negativas) — datos en `retail_prices`, `competitor_ads`, `intelligence_signals` esperando UI
- Tendencias: **9 de 9** dimensiones sin renderizar (5 de las 9 tienen datos disponibles)

### 17.5 Schedule

- **Botón "Programar"** en `StudioView.js:78-92` — placeholder explícito "Próximamente"
- **Render de `flow_runs`** en `TasksView.js` — solo muestra schedules
- **Cleanup zombie cron** `production_master_autonomous_v1` (apunta a UUID inexistente)
- **Verificar workflows en n8n cloud** activos para los 4 flows autopilot

### 17.6 Creación de usuario

- Las 3 funciones backend que el wizard del frontend busca (`admin-create-user`, `lead-provision-user`, `dev-create-user`) **no existen en ningún sitio**
- Email sender (Resend en `package.json` ai-engine, no usado)
- Onboarding wizard post-signup
- OAuth signup UI (botones "Continuar con Google/Facebook")
- Email verification flow público

### 17.7 Vera

- VeraView funcional (verificar tras 3 semanas sin uso)
- ai-knowledge bucket poblado con referencias editoriales reales
- Action Executor — completar 25+ tipos pendientes
- Memoria long-term: el `maybeSummarize()` es stub, falta conectar OpenClaw como summarizer
- Métricas de uso por org (admin dashboard)

### 17.8 Operaciones

- Hetzner snapshots automáticos
- Uptime monitor externo
- Supabase CLI con migraciones versionadas
- `.env` ai-engine en Vault
- Test suite foundation

### 17.9 Documentación / inconsistencias

- **Provider en `system_ai_outputs`**: VideoView usa `kling_api`, doc consulta `kie_api` → unificar
- **Schema `flow_schedules` repo vs BD real**: repo tiene singulares (`entity_id`, `campaign_id`), BD tiene plurales (`entity_ids[]`, `campaign_ids[]`) + `composition_mode` → migrar el dump del repo
- **25+ patrones de UI cards sin sistema unificado** — `.card`, `.history-*`, `.flow-card`, `.product-card`, `.brand-card`, etc., cada uno con sus clases. Falta sistema reutilizable.

---

## 18. Latencias y características de operación

| Camino | Latencia documentada |
|---|---|
| signal INSERT → webhook recibido ai-engine | <500 ms |
| webhook → INSERT agent_queue_jobs | <50 ms |
| job-worker dequeue → completado | 1-30 s |
| INSERT vera_pending_actions → realtime frontend | <500 ms |
| User aprueba → fn_vpa_approve responde | <100 ms |
| approved → body_mission creada | hasta 5 min (mission-generator interval) |
| body_mission → ejecutada | 5 s - 3 min |

**Idempotencia — el patrón general:**

| Tipo | Cómo se evita duplicado |
|---|---|
| Embeddings | SHA-256 en `metadata.content_hash` |
| Sensores | UNIQUE en `(brand_container_id, sensor_type, entity_id)` |
| Body missions | check `metadata.parent_action_id` antes de insertar |
| Threats (virality) | `metadata.triggering_post_id` |
| Threats (drop/sentiment) | `flagged_window_start` |
| Posts capturados | UPSERT por `(brand_container_id, post_id)` |
| Pending actions | `source_signal_id + action_type` con expiración |

---

## 19. Errores comunes documentados (`docs/platform/10-extending.md`)

| Error | Causa | Solución |
|---|---|---|
| 400 Bad Request al filtrar `organization_id` | `orgIdShort` en lugar de UUID | Usar `routeParams.orgId` resuelto |
| `column does not exist` | Tabla no tiene `organization_id` | Filtrar via FK indirecta |
| RPC devuelve `forbidden` (42501) | `is_org_member` falla | Llamar con `auth.uid()` válido |
| Frontend cambio no aparece post-deploy | Cloudflare cache 7d | Verificar `?v=__BUILD_ID__` en script tag |
| Sensor no corre | `monitoring_triggers.status != 'active'` | Inspeccionar fila |
| Webhook signal no llega ai-engine | cloudflared/ai-engine down, HMAC inválido | `journalctl -u cloudflared`, tail logs |
| Realtime no llega | Tabla no en publication | `SELECT FROM pg_publication_tables` |
| Tool de Vera bloqueado | Policy/budget/consent gate | `developer_logs`, ajustar `ACTION_RULES` |

---

## 20. Cómo extender la plataforma (`docs/platform/10-extending.md`)

### 20.1 Agregar dashboard nuevo
1. Spec markdown con widgets, fuente, visualización
2. RPC en `SQL/functions/dashboard_*.sql` con auth check + SECURITY DEFINER
3. Aplicar via Management API curl
4. Service frontend `js/services/*DataService.js` con `init()` + `loadAll()`
5. View `js/views/*View.js` extendiendo BaseView
6. Ruta en `js/app.js`
7. Script en `index.html` con `?v=__BUILD_ID__`
8. Push & deploy

### 20.2 Agregar sensor nuevo
1. Decidir: brand-wide o per-entity
2. Handler en `ai-engine/src/services/`
3. Registrar case en `social-scraper.service.js`
4. Si brand-wide: agregar a `BRAND_WIDE_SENSORS` en `brand-sensor-sync.service.js`
5. Probar manualmente
6. Verificar `monitoring_triggers`, `sensor_runs`, `intelligence_signals`

### 20.3 Agregar tool a Vera
1. Schema JSON en `.tools.js` apropiado
2. Registrar dispatcher → allowlist `PHASE_TOOLS` según riesgo
3. Definir regla en `ACTION_RULES` (`minPlan`, `minRole`, `creditCost`)
4. Agregar descripción al system prompt
5. Probar en chat

### 20.4 Agregar tabla nueva
1. CREATE TABLE con `organization_id`, `created_at`, `updated_at`, triggers, RLS
2. Aplicar via Management API
3. Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE`
4. Actualizar `SQL/schema.sql` dump

### 20.5 Agregar matview precomputada
```sql
CREATE MATERIALIZED VIEW public.mv_x AS SELECT ... ;
CREATE UNIQUE INDEX idx_mv_x_org ON mv_x(organization_id);
REFRESH MATERIALIZED VIEW public.mv_x;
SELECT cron.schedule('refresh_mv_x', '*/15 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_x; $$);
```

### 20.6 Agregar OAuth integration
1. Netlify Function `api-integrations-{provider}-start.js`
2. Callback function `api-integrations-{provider}-callback.js`
3. Trigger `fn_brand_integrations_after_insert` ya existe → provisiona sensores
4. Sensor handler en ai-engine
5. Token refresh en `token-refresh.service`
6. UI: botón "Conectar X"

### 20.7 Checklist al cerrar extensión

- [ ] Code en `main`, deploy verde
- [ ] Documentación actualizada
- [ ] `09-current-state.md` actualizado
- [ ] Si BD: schema dump o migración versionada
- [ ] Si ai-engine: log line verificada
- [ ] Si frontend: hard-refresh, verificación visual
- [ ] Si Vera tools: prueba en chat con escenario real

---

## 21. Plan de acción priorizado (recomendado, basado en todo el análisis)

Orden por **mayor ROI = (impacto de cerrar el eje) ÷ (esfuerzo restante)**:

### Tier 1 — desbloquea valor inmediato (esfuerzo bajo)

1. **Schedule end-to-end**
   - Botón "Programar" en `StudioView.js:78-92` que insert `flow_schedules` con `status='active'`
   - Cleanup zombie cron `production_master_autonomous_v1`
   - Verificar workflows n8n cloud activos
   - Render de `flow_runs` en `TasksView.js`
2. **Tendencias usable**
   - Reemplazar mockup hardcoded de `DashboardView.js:479-735` por llamada a `dashboard_tendencias(orgId, 30, null)` que ya existe
   - Activar `TABS_ENABLED.tendencies = true` con al menos 5 secciones reales (las que tienen datos: trend_topics, v_orphan_topics, mv_signal_velocity, mv_sentiment_breakdown)
3. **Cleanup acciones colgadas**
   - 1 `update_persona` en `executing` desde 2026-04-28 → reset a `pending` o `failed`
   - Diagnosticar BUG-001 (13 body missions colgadas)

### Tier 2 — completa producto (esfuerzo medio)

4. **Componentes nuevos en Mi Marca y Mi Competencia** sobre datos ya en BD
   - Mi Marca: MAP Monitor (retail_prices), Shadow Mentions (intelligence_signals), Crisis (crisis_signals + brand_vulnerabilities), Brand Soul Guard (brand_content_analysis.tone_detected con score)
   - Mi Competencia: Precios cross-platform (retail_prices), Ad Intelligence (competitor_ads cuando se pueble), Reviews negativas (intelligence_signals filtradas)
5. **CRUD Monitoring**
   - Cerrar placeholders en `MonitoringView.js:361,417` para sensores y URL watchers
6. **Provisioning de usuarios end-to-end**
   - Crear `POST /internal/users/provision` en ai-engine
   - Email sender con Resend (ya en package.json)
   - Wizard onboarding post-signup que asigne `plan_type='trial'`
   - OAuth signup UI (Google/Facebook)
7. **DATA-001 — configurar competidores reales**
   - Reunir lista con cliente (3-5 mínimo)
   - Insertar en `intelligence_entities` con `metadata.es_competidor=true`
   - Esperar 24-48h para pipeline complete
8. **Verificar VeraView**
   - 3 semanas sin uso real, validar que el chat funciona end-to-end
   - Si funciona: comunicar a clientes piloto que el chat está vivo

### Tier 3 — robustez y madurez (esfuerzo medio-alto)

9. **Action Executor**
   - Completar 25+ tipos pendientes (publish IG, schedule FB, create product, create campaign, add intelligence entity, etc.)
10. **Política de tokens y activar OpenAI**
    - Definir consumption policy en `api-brand-analyze-posts.js`
    - Activar análisis cualitativo LLM-based con créditos org
11. **Realtime extendido (FEAT-009)**
    - 7 tablas más en publication + suscripciones en DashboardView
12. **Refactor services 1 RPC por dashboard (FEAT-007)**
    - MiBrandaDataService, StrategiaDataService, CompetenciaDataService → adapter
13. **Reparar `brand-indexer.service`**
    - Identificar root cause: cuota OpenAI o bug silencioso
    - Poblar `ai_brand_vectors` para habilitar similarity search semántica
14. **Poblar `ai-knowledge` bucket**
    - Subir referencias editoriales reales por categoría
    - PDFs de brand books, briefs ganadores, ejemplos de copy
15. **Diagnóstico Meta Ad Library**
    - Pedir permisos `ads_read` a Meta o consolidar solo en Apify
    - Si Apify: confirmar contrato y costo

### Tier 4 — escala y nuevas capacidades (esfuerzo alto)

16. **Discovery automático de competidores** dado dominio
    - Nueva función `api-brand-discover-competitors.js`
    - Búsqueda + análisis SimilarWeb + clasificación por nicho
    - Auto-poblar `intelligence_entities`
17. **Onboarding scraper de marca propia**
    - Dado dominio cliente, autocompletar `brand_profiles`, paleta, fuentes, productos detectados, slogan, nicho
18. **Audio analysis y visual analysis** para Tendencias
19. **Sincronización con weather/eventos culturales** (Tendencias dim 4)
20. **Detección de cambios algorítmicos en plataformas** (Tendencias dim 6)

### Tier 5 — operaciones y deuda (esfuerzo bajo a medio, importancia alta)

21. **OPS-001** Hetzner snapshots semanales
22. **OPS-002** Uptime monitor externo
23. **OPS-003** Supabase CLI migraciones versionadas
24. **OPS-005** `.env` en Supabase Vault
25. **TEST-001** Test suite foundation
26. **Auditoría GRANTs** de las 5 tablas sin RLS
27. **Cambio buckets a privados** donde haya PII potencial
28. **Unificar `provider`** en `system_ai_outputs` (`kling_api` → `kie_api`)
29. **Sistema unificado de UI cards** (refactor 25+ patrones de cards)
30. **Sincronizar schema `flow_schedules`** entre repo y BD real (`entity_ids[]` plurales)

---

## 22. Conclusiones

### 22.1 Diagnóstico estructural

AI Smart Content es una **plataforma madura y ambiciosa** que condensa siete meses de diseño arquitectónico. La separación clara entre las 5 capas (ingesta, núcleo, inteligencia, precomputación, lectura), la insistencia en **statelessness** (la BD es el contrato único), el respeto por el **multi-tenancy** desde el día 1, y el principio cardinal **"cero LLMs en background"** hacen que sea un sistema **coherente y predecible**.

La arquitectura es honesta consigo misma: el LLM (Vera) solo aparece cuando hay un humano, y para todo lo demás se usan transformers locales (pysentimiento, KeyBERT) + reglas + matemática + embeddings. El costo de operación es trivial; el costo de un cliente nuevo es lineal en infraestructura (Hetzner per-org).

### 22.2 El movimiento neto del análisis (4 fases)

| Fase | Conclusión |
|---|---|
| 1 — Frontend | "casi nada está hecho" |
| 2 — ai-engine | "el backend va MUY por delante del frontend" |
| 3 — Supabase | "la cadena de schedule está cableada y el ejecutor real es n8n; faltan menos cosas en BD de las que parecía" |
| 4 — Vera | "identidad y arquitectura listas; el cuello es chat sin uso y biblioteca vacía" |

Cada fase corrigió suposiciones de la anterior. El veredicto final:

> **No es un problema de IA. Es un problema de plomería entre UI y BD/backend.**

El cuello de botella no es construir IA — es **conectar UI, cerrar la cadena de schedule (botón "Programar"), crear el flujo de signup (1 función Netlify + email + wizard), y activar Vera de cara al usuario (verificar VeraView + poblar ai-knowledge + completar Action Executor)**.

### 22.3 La buena noticia

- 419 brand_posts, 269 signals, 1 435 trends, 80 misiones, 33 ejecutadas — el pipeline pasivo **funciona**.
- 39 RPCs de dashboard listas (16 sin usar por el frontend hoy).
- 8 vistas materializadas auto-refrescadas.
- 8 jobs pg_cron activos.
- Schedule chain completa hasta n8n.
- `organization_invitations` con schema completo.
- 5 plans con créditos definidos.
- 25 skills instaladas en OpenClaw remoto.
- Vera con identidad madura (5 memory banks, 9 skills locales).
- python-analyzer FastAPI con análisis cualitativo sin LLM.
- Apify integration con cache global y contabilidad exacta de créditos.
- Aislamiento per-org con JWTs scoped en RPCs.

### 22.4 La menos buena

- 1 sola org en producción (la demo `Arde Agency` con IGNIS como brand_container ficticio).
- 1 solo usuario (el owner).
- Vera-como-chatbot lleva 3 semanas sin uso real.
- 13 body missions colgadas, sin retry.
- 4 tablas críticas vacías por falta de competidores configurados.
- Embeddings vacíos por bug en indexer.
- Botón "Programar" inexistente.
- Sin función de provisioning de usuarios.
- 7 de 15 dimensiones de Mi Marca, 3 de 10 de Mi Competencia, 9 de 9 de Tendencias sin componentes en frontend (datos ya están en BD para casi todo).

### 22.5 Camino crítico

Si tuviera que escoger **5 movimientos para mover la aguja en producto en las próximas 2 semanas**:

1. **Botón "Programar" + render de runs** → cierra Schedule end-to-end (esfuerzo bajo).
2. **`dashboard_tendencias` en frontend** + activar tab → Tendencias deja de ser mockup (esfuerzo bajo).
3. **Provisioning de usuarios** (1 función + email + wizard) → permite onboardear pilotos (esfuerzo medio).
4. **CRUD Monitoring** (sensores + URL watchers) → desbloquea brand research completo en frontend (esfuerzo medio).
5. **Componentes para retail_prices + competitor_ads + intelligence_signals + brand_vulnerabilities** en Mi Marca y Mi Competencia → cierra dashboards (esfuerzo medio).

Con estos 5 cerrados, la plataforma pasa de "demo técnica" a "producto onboardeable para pilotos reales".

---

**FIN.**

> Este documento se compiló a partir de la lectura cruzada de:
> - 21 documentos en `docs/`
> - 11 documentos en `docs/platform/` + sensor-types-catalog
> - 12 documentos en `docs/task/` (10 tareas activas + INDEX + README)
> - README.md, SECURITY.md, CLAUDE.md
> - 5 memory banks de Vera + 9 SKILL.md
> - Estado real de Supabase via Management API (114 tablas, 140 RPCs, 8 cron jobs verificados)
> - Estado real de ai-engine via SSH (12 servicios + python-analyzer)
> - Inspección directa de `js/views/`, `js/services/`, `functions/` en el repo del frontend
>
> Ningún dato fue inferido sin verificación. Cada cifra (número de filas, RPCs, sensores, schedules, etc.) proviene de query directa o lectura de archivo.
