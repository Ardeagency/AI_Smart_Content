---
title: 04 — AI Engine (Hetzner)
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-05-05
audience: humanos del equipo + LLMs
---

# 04 · AI Engine

## Qué es

El **AI Engine** es el cerebro server-side de la plataforma. Una app Express en Node.js que corre en una VM dedicada Hetzner, expone un API a través de Cloudflared tunnel, y orquesta toda la lógica que no vive en Postgres:

- Conversación con Vera (chat con humanos).
- Scrapers (Apify actors para IG/TikTok/X/YouTube/Amazon/FB invocados desde `src/lib/apify.client.js`).
- Sensores periódicos (Meta Insights, GA4, demographics, heatmap).
- Detección de threats sin LLM.
- Generación de embeddings.
- Worker que procesa la cola de jobs.
- Provisioning de VMs nuevas para orgs adicionales.

> Reglas de oro:
> 1. **El AI Engine es stateless.** Toda persistencia va a Supabase.
> 2. **Cero LLM en background** (memoria del proyecto: scrapers/sensores/alignment usan reglas+templates+matemática).
> 3. **OpenAI text-embedding-3-large** sí está sancionado para encoders idempotentes.

## Topología

```
                    ┌────────────────────────────────────────┐
                    │  Hetzner CCX33 — Ubuntu 22.04 ARM64    │
                    │  hostname: ubuntu-32gb-ash-1            │
                    │  uptime: 42+ días, RAM 30Gi (1.2Gi used)│
                    └────────────────────────────────────────┘

systemd services:
  ai-engine.service  ─── /usr/bin/node /root/ai-engine/src/index.js
                         WorkingDirectory=/root/ai-engine
                         EnvironmentFile=/root/ai-engine/.env
                         Restart=always

  cloudflared.service ── tunnel "vera-prod"
                         /etc/cloudflared/config.yml
                         expose ai-engine :3000 → api.aismartcontent.io

Procesos extras:
  openclaw-gateway ×2  (puertos localhost 18080/18789, browsers headless)
  fail2ban             (anti brute force ssh)
```

## Estructura del repo

```
/root/ai-engine/
├── src/
│   ├── index.js                       — entry, monta Express y arranca services
│   ├── controllers/                   — handlers de routes
│   │   ├── chat.controller.js
│   │   ├── agents.controller.js
│   │   ├── signal-webhook.controller.js   ← recibe trigger de Supabase
│   │   ├── task-event.controller.js
│   │   └── internal.controller.js
│   ├── routes/                        — Express routers
│   │   ├── chat.routes.js             POST /chat, GET /chat/conversation/:id/status
│   │   ├── agents.routes.js
│   │   ├── missions.routes.js
│   │   ├── task.routes.js
│   │   ├── webhooks.routes.js         POST /webhooks/{signal,url-trigger,run-scraper}
│   │   ├── server.routes.js
│   │   └── internal.routes.js
│   ├── services/                      — lógica core
│   │   ├── ai.service.js              ← orquestador del flow de chat
│   │   ├── social-scraper.service.js  ← scheduler cada 10 min, orquesta Apify
│   │   ├── threat-detector.service.js ← detección sin LLM
│   │   ├── brand-indexer.service.js   ← embeddings 1536-dim
│   │   ├── mission-generator.service.js ← pending → mission cada 5 min
│   │   ├── job-worker.service.js      ← consume agent_queue_jobs
│   │   ├── action-executor.service.js
│   │   ├── pending-action.service.js
│   │   ├── content-analysis.service.js
│   │   ├── audience-alignment.service.js
│   │   ├── brand-sensor-sync.service.js ← auto-crea sensores brand-wide
│   │   ├── org-sync.service.js
│   │   ├── token-refresh.service.js   ← refresh OAuth Meta/Google
│   │   ├── server.health.service.js
│   │   ├── notification.service.js
│   │   ├── memory.service.js          ← memoria de Vera
│   │   ├── media-processor.service.js
│   │   ├── resource.governor.js
│   │   ├── tool.dispatcher.js         ← invoca tools de Vera
│   │   ├── agent.manager.js / agent.provisioner.js
│   │   ├── hetzner.provisioner.js     ← crea VMs por org
│   │   ├── openclaw.adapter.js
│   │   ├── openclaw.provisioner.js
│   │   └── openclaw.registry.js
│   ├── lib/                           — helpers
│   │   ├── supabase.js                ← cliente service_role
│   │   ├── policy.engine.js           ← plan + rol + créditos check
│   │   ├── autonomy.js                ← phase A/B/C según level_of_autonomy
│   │   ├── chat-security.js
│   │   ├── tool-call.validator.js     ← schema + injection check
│   │   ├── intent.detector.js
│   │   ├── context.builder.js / context.serializer.js
│   │   ├── view-model.builder.js
│   │   ├── session.manager.js / session-manager.js
│   │   ├── activity-emitter.js        ← emit a frontend
│   │   ├── audit-logger.js
│   │   ├── cost.controller.js         ← TOOL_LIMITS, budgets
│   │   ├── org-jwt.js
│   │   ├── org-resolver.js
│   │   ├── brand-resolver.js
│   │   ├── content-lexicon.js
│   │   └── provisioning-events.js
│   ├── tools/                         — set de tools que Vera puede invocar
│   │   ├── action.tools.js
│   │   ├── brand.tools.js / brand-write.tools.js
│   │   ├── campaign.tools.js
│   │   ├── flow.tools.js
│   │   ├── intelligence.tools.js
│   │   ├── scraper.tools.js
│   │   └── social.tools.js
│   ├── middleware/
│   │   └── request-logger.js
│   ├── mcp/                           — MCP server (futuro)
│   └── scripts/
│       ├── backfill-3months.js
│       ├── session-status.js
│       └── setup-session.js
├── package.json / package-lock.json
├── .env                               — secrets (chmod 600)
├── ai-engine.log                      — log file (rotado)
├── ai-engine.pid
├── docs/                              — docs internos
├── SQL/                               — SQLs ad-hoc
├── sessions/                          — runtime cache
├── workspaces/                        — OpenClaw workspaces
└── *.mjs                              — scripts de diagnóstico/test (verify-state, test-*, etc)
```

> Convención de backups: `archivo.js.bak.{TAG}` antes de cambios grandes. `B1`, `phase4`, `noai`, `20260417`, `20260428-norm`, etc. Node solo importa lo referenciado, los .bak son inertes.

## Bootstrapping (qué pasa al arrancar)

`src/index.js` orquesta:

1. Carga `.env` desde `/root/ai-engine/.env`.
2. Configura Express con CORS por `ALLOWED_ORIGINS`, body parser con `req.rawBody` para HMAC.
3. Monta routes (`/chat`, `/agents`, `/missions`, `/task`, `/internal`, `/server`, `/webhooks`).
4. Llama a:
   - `initRegistry()` — carga `openclaw_instances` activas en memoria.
   - `startHealthService()` — health check propio (`v_org_server_status`).
   - `startScraperScheduler(intervalMinutes=10)` — `runCompetitorScraper` cada 10 min.
   - `startJobWorker()` — poll `agent_queue_jobs` cada 10s, max 3 concurrent.
   - `startOrgSyncService()` — sincronía con tabla `organizations`.
   - `startTokenRefreshService()` — refresh OAuth tokens antes de expirar.
   - `startBrandSensorSync()` — cada 5 min, asegura los 9 sensores brand-wide.
5. `app.listen(PORT)` → :3000.

## Endpoints expuestos

### Públicos (vía Cloudflared → api.aismartcontent.io)

| Método | Path | Uso |
|---|---|---|
| POST | `/chat` | Conversación con Vera. Body: `{ message, organizationId, userId, conversationId }` |
| GET | `/chat/conversation/:id/status` | Polling status (alternativa a realtime) |
| POST | `/webhooks/signal` | Database Webhook de Supabase (HMAC `x-supabase-signature`) |
| POST | `/webhooks/url-trigger` | Análisis ad-hoc de URL (Bearer token org) |
| POST | `/webhooks/run-scraper` | Forzar scraping (admin, `X-Internal-Token`) |
| POST | `/missions` | Crear mission manualmente |
| GET | `/missions` | Listar missions |
| POST | `/agents` | Endpoints de agents |
| GET | `/server/health` | Health check |
| POST | `/internal/*` | Endpoints internos (admin token) |
| POST | `/task/*` | Eventos de tareas |

### HMAC en `/webhooks/signal`

El controller (`signal-webhook.controller.js`) acepta dos modos:

1. **Bearer literal**: header `x-supabase-signature` igual al `SUPABASE_WEBHOOK_SECRET` (uso típico de Database Webhooks de Supabase, que pueden enviar headers custom sin computar HMAC).
2. **HMAC SHA-256 del body raw**: header `x-supabase-signature: <hex>` o `sha256=<hex>`. Se valida contra `crypto.createHmac('sha256', SUPABASE_WEBHOOK_SECRET).update(req.rawBody)`.

⚠️ El body que entra a `req.rawBody` debe ser bytes idénticos a lo que firmó Supabase, por eso `webhooks.routes.js` usa middleware de raw body antes de `express.json()`.

## Scheduler interno (no usa pg_cron)

El AI Engine tiene su propio scheduling en JS:

```js
// services/social-scraper.service.js
export function startScraperScheduler(intervalMinutes = 10) {
  _schedulerTimer  = setInterval(_runScrapingCycle, intervalMinutes * 60_000);
  _keepaliveTimer  = setInterval(_runSessionKeepalive, KEEPALIVE_INTERVAL_MS);
}
```

Y los sensores se ejecutan según `monitoring_triggers.next_run_at`. Cada brand_container tiene 9 sensores brand-wide auto-creados por `brand-sensor-sync.service`:

| Sensor | Cadencia | Prioridad |
|---|---|---|
| `meta_audience_demographics` | daily | 6 |
| `ga4_audience_demographics` | daily | 6 |
| `meta_ads_audiences_sync` | daily | 5 |
| `audience_alignment_analysis` | daily | 4 |
| `brand_audience_heatmap_compute` | daily | 5 |
| `mission_generation` | every 5 min | 7 |
| `brand_indexer` | daily | 4 |
| `threat_detection` | daily | 6 |
| `meta_ad_library_sync` | daily | 5 |

Y per-entity (cuando hay `intelligence_entities` configuradas):
- `meta_page_insights`, `meta_posts`, `social`, `ga4_analytics`, etc.

Cuando un sensor corre, escribe a `sensor_runs` con `status` (success/failed) y duración.

## Servicios — qué hace cada uno

### `social-scraper.service.js`

- `startScraperScheduler(intervalMinutes=10)` — arranca el ciclo.
- `runCompetitorScraper(brandContainerId=null)` — corre scrapers de competencia.
- Internamente delega a `src/lib/apify.client.js` para la captura (post-migración 2026-04-28 "droplegacy"; el motor in-house basado en Playwright fue removido).
- Escribe a `intelligence_signals`, `brand_posts` (con `is_competitor=true`), `competitor_ads`.
- Idempotencia por `signal_type + entity_id + content_text` (evita duplicados).

### Apify integration (`src/lib/apify.client.js`)

Hoy todo el scraping pasa por Apify. La biblioteca expone:

- `runActor({ actorKey, input, organizationId, brandContainerId, entityId })` — ejecuta el actor, contabiliza créditos, escribe en `apify_runs`.
- `lookupActor(actorKey)` — resuelve el `actor_id` registrado en la tabla `scraper_actors`.
- Cache global con TTL por plan (free/pro/enterprise) — antes de invocar Apify revisa si hay un `apify_runs` reciente con el mismo input hash.

Tablas asociadas:

| Tabla | Función |
|---|---|
| `scraper_actors` | Registry de actors disponibles por plataforma con costos en créditos. |
| `apify_runs` | Una fila por ejecución, con `status` (`SUCCEEDED`, `TIMED-OUT`, `FAILED`, `CHARGED`), `input_hash`, `output_dataset_id`, créditos consumidos. |
| `organization_credits` | Saldo por org, decrementado por trigger después de cada `runActor` exitoso. |
| `credit_usage` | Ledger inmutable de cada cargo de créditos (para auditoría). |

Plataformas cubiertas hoy: Instagram, TikTok, X/Twitter, YouTube, Amazon, Facebook. Apify gestiona Playwright/Puppeteer bajo el capó pero el control plane no lo ve. Los únicos paths legacy locales que sobreviven: Instagram web API y TikTok HTML scrape como fallback de bajo costo.

### `threat-detector.service.js`

**Sin LLM, cero tokens.** Detecta 3 anomalías estadísticas:

1. **`competitor_virality`** — post de competidor con engagement > 2.5× su baseline rolling de 14 días.
2. **`own_engagement_drop`** — caída de engagement promedio propio (7d vs 30d previos).
3. **`negative_sentiment_spike`** — % de posts propios con sentiment < -0.1 supera threshold.

Outputs:
- `intelligence_signals` con `signal_type='threat:{tipo}'` y `ai_analysis` estructurado.
- `brand_vulnerabilities` con `detected_signal_id`, `severity`, `metadata.threat_type`.

Idempotencia: `metadata.triggering_post_id` (virality) o `flagged_window_start` (drop/sentiment).

### `brand-indexer.service.js`

Pobla `ai_brand_vectors` con embeddings de:
- `brand_profiles` (filosofia, mision, etc.)
- `brand_containers` (verbal_dna, propuesta_valor, palabras_clave)
- `brand_entities`
- `products` / `services`
- `brand_assets` (futuro: PDFs)

Modelo: OpenAI `text-embedding-3-large` con `dimensions=1536` (Matryoshka). Costo ~$0.13/1M tokens. Para Arde indexar todo cuesta ~$0.0013 (un milésimo de centavo).

Idempotencia: `metadata.content_hash` con SHA-256. Si ya existe → no llama OpenAI.

### `mission-generator.service.js`

Cada 5 min (sensor `mission_generation`):

1. Lee `vera_pending_actions` con `status='approved'`.
2. Filtra las que ya tienen body_mission (`metadata.parent_action_id`).
3. Crea `body_missions` con `mission_type='execute_${action_type}'` y `action_payload`.
4. Marca `pending_action.status='executing'`.

**Sin LLM.** Pura traducción.

### `job-worker.service.js`

Consume `agent_queue_jobs`:

```js
const POLL_INTERVAL_MS = 10_000;
const LOCK_TTL_MIN     = 5;
const JOB_TIMEOUT_MS   = 180_000;
const MAX_CONCURRENT   = 3;
```

Loop:
1. `tryLockJob(jobId)` — UPDATE optimista (`status=queued AND locked_by IS NULL → status=assigned`).
2. Si gana el lock, ejecuta el handler según `payload.task_type`.
3. Escribe `agent_queue_jobs.status='completed'/'failed'` y `result`.
4. Crea/actualiza `mission_runs` correspondiente.

Tipos de job: `analysis` (default desde signal-webhook), `execute_action`, `provision`, etc.

### `action-executor.service.js`

Lee `body_missions` con `status='pending'`, dispatch según `mission_type`. Ejecuta la acción real (publicar post, ajustar precio, mandar email, etc.) llamando a APIs externas o a otras tablas.

### `pending-action.service.js`

Helpers para crear `vera_pending_actions` consistentes (`createPendingAction({ orgId, brandId, type, payload, reasoning, confidence, ... })`).

### `content-analysis.service.js`

Análisis de posts (sentiment, dominant_emotion, narrative_pillar, why_it_worked, clarity_score, fatigue_risk). Escribe `brand_content_analysis`.

### `audience-alignment.service.js`

Calcula `alignment_score`: ¿qué tan alineada está la audiencia real (de Meta Audience Demographics) con la persona target definida en `audience_personas`?

### `brand-sensor-sync.service.js`

Cada 5 min: para cada `brand_container` con `brand_integrations` activas, asegura que existan los 9 sensores brand-wide en `monitoring_triggers`. Idempotente.

### `org-sync.service.js`

Sincronía: cuando una nueva organization aparece en BD, dispara su provisioning (Hetzner VM si aplica, OpenClaw instance, sensores).

### `token-refresh.service.js`

Refresh de OAuth tokens (Meta, Google) antes de expirar. Lee `brand_integrations`, calcula expiración, refresca via API del proveedor, actualiza la fila.

### `hetzner.provisioner.js`

Crea VMs nuevas en Hetzner via API (`HETZNER_API_TOKEN`). Cada org puede tener su propia VM aislada para scrapers pesados.

### `openclaw.*`

OpenClaw es la integración con un sistema interno de browsers headless con personalidad y contexto. Las dos instancias (`openclaw-gateway`) corren en `:18080` y `:18789`. Se gestionan vía:

- `openclaw.adapter.js` — `callOpenClaw(prompt, sessionConfig)`.
- `openclaw.registry.js` — registro en memoria de instancias activas.
- `openclaw.provisioner.js` — provisioning por org.

Detalle en `07-vera.md`.

## Tools — qué puede invocar Vera

| Archivo | Tools incluidos |
|---|---|
| `action.tools.js` | `approveAction`, `rejectAction`, `createPendingAction` |
| `brand.tools.js` | `getBrandContainer`, `getBrandProfile`, `listEntities` (read-only) |
| `brand-write.tools.js` | `updateBrandContainer`, `addPalabraClave`, `removePalabraClave` (write con consent) |
| `campaign.tools.js` | `createCampaign`, `linkBriefToCampaign` |
| `flow.tools.js` | `triggerFlowRun`, `createFlowSchedule` |
| `intelligence.tools.js` | `searchSignals`, `getRecentTrends`, `findSimilarSignals` (futuro) |
| `scraper.tools.js` | `runManualScrape`, `addUrlWatcher` |
| `social.tools.js` | `getPostMetrics`, `analyzePostSentiment` |

Cada tool pasa por `dispatchTool` (`services/tool.dispatcher.js`):

```
dispatchTool(toolName, args, ctx) →
  1. validateToolCallBatch  (schema + injection)
  2. checkToolBudget        (TOOL_LIMITS, sesión)
  3. checkPolicy            (plan + rol + créditos)
  4. consent gate           (level_of_autonomy)
  5. ejecutar handler con timeout
  6. audit log
```

Detalle del policy engine en `07-vera.md`.

## Variables de entorno (`.env`)

Cargado desde `/root/ai-engine/.env` por `dotenv`. Contiene:

| Variable | Uso |
|---|---|
| `PORT` | 3000 (default) |
| `ALLOWED_ORIGINS` | CORS allowlist |
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | para `supabase` con RLS |
| `SUPABASE_SERVICE_KEY` | para escritura administrativa (sin RLS) |
| `SUPABASE_JWT_SECRET` | validación de JWTs custom |
| `SUPABASE_WEBHOOK_SECRET` | HMAC del webhook de signal |
| `ANTHROPIC_API_KEY` | Claude (Vera) |
| `OPENAI_API_KEY` | embeddings |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `HETZNER_API_TOKEN` | para `hetzner.provisioner` |
| `OPENCLAW_DEFAULT_MODEL` / `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_TIMEOUT_MS` / `OPENCLAW_WORKSPACES_DIR` | OpenClaw |
| `INTERNAL_ADMIN_TOKEN` / `INTERNAL_API_KEY` / `INTERNAL_WEBHOOK_SECRET` | endpoints internos |
| `RESEND_VERA_API_KEY` | emails (Resend) |
| `SCRAPER_INTERVAL_MINUTES` / `SCRAPER_PROXY` | scraper config |
| `SESSION_TOKEN_BUDGET` / `SESSION_TOOL_BUDGET` / `SESSION_TTL_MS` | límites de sesión Vera |
| `TOOL_TIMEOUT_MS` | timeout de tool calls |
| `VERA_PER_POST_ANALYSIS_ENABLED` | feature flag |
| `MONITORING_REPORT_ENABLED` / `RECENT_COMMENTS_ENABLED` | feature flags |
| `AI_ENGINE_URL` | self URL para callbacks |

⚠️ **Nunca** mostrar valores en pantalla, logs o commits.

## Operación

### Logs

```bash
# Tail logs en vivo
ssh ai-engine 'tail -f /root/ai-engine/ai-engine.log'

# journalctl
ssh ai-engine 'journalctl -u ai-engine -n 100 --no-pager'
```

### Restart sin downtime

```bash
ssh ai-engine 'systemctl restart ai-engine'   # ~2s, requests caen y vuelven
```

### Diagnóstico rápido

```bash
ssh ai-engine 'systemctl status ai-engine cloudflared'
ssh ai-engine 'ps aux | grep -E "node|openclaw"'
ssh ai-engine 'ss -tlnp'   # puertos en escucha
```

### Scripts de verificación incluidos

- `verify-state.mjs` — chequeo del estado general
- `final-verify.mjs` — verificación post-deploy
- `full-table-audit.mjs` — auditoría de tablas
- `test-brand-sync.mjs`, `test-brand-content.mjs`, `test-mission-gen.mjs`, `test-threats.mjs` — tests de servicios
- `run-backfill.mjs` — backfill de datos históricos
- `diag-adlib.mjs`, `test-adlib-pw.mjs`, `test-adlibrary.mjs` — diagnóstico Meta Ad Library

## Salud actual (snapshot 2026-04-29)

✅ **Funcionando:**
- ai-engine.service: up 1h45min sin restarts.
- mission_generation: 97 runs hoy, 0 errores.
- meta_posts/meta_page_insights/meta_ad_library_sync: 4 runs hoy cada uno, 0 errores.
- ga4_analytics: 2 runs hoy, 0 errores.
- threat_detection: 1 run hoy, 0 errores.
- brand_indexer: 1 run hoy, 0 errores (pero no produjo vectores — debug pendiente).
- agent_queue_jobs: 33 completed, 1 failed, 0 pending.

🔴 **Roto / pendiente:**
- 13 `body_missions` colgadas tipo `competitor_signal_analysis` desde 27/4. Última `mission_run` completada: 21/4. Algo del dispatcher cambió.
- `ai_brand_vectors` y `ai_global_vectors` siguen vacíos pese a indexer corriendo.
- `competitor_ads`, `retail_prices`, `url_watchers`, `visual_references` vacíos — falta configurar `intelligence_entities` competidoras.

Detalle en `09-current-state.md`.

---

*Anterior: [03 — Base de datos](./03-database.md) · Siguiente: [05 — Frontend](./05-frontend.md)*
