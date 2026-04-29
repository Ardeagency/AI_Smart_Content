---
title: 06 — Flujos de datos end-to-end
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 06 · Flujos de datos

Este documento traza los recorridos completos: cómo una **señal externa** termina convertida en una **acción aprobable** y luego ejecutada.

## Flujo 1 — Señal externa → Acción aprobada → Misión ejecutada

```
┌──────────────────────────────────────────────────────────────────┐
│ A. CAPTURA                                                       │
│                                                                  │
│   Scraper (Hetzner)  /  Sensor Meta-API  /  Webhook externo      │
│                              │                                   │
│                              ▼                                   │
│   intelligence_signals ←─ INSERT (row con entity_id)             │
└──────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │  AFTER INSERT trigger en intelligence_signals│
        │  pg_net.http_request(                        │
        │    'https://api.aismartcontent.io/webhooks/  │
        │      signal',                                 │
        │    'POST',                                    │
        │    headers: { x-supabase-signature: HMAC },  │
        │    body: row jsonb                           │
        │  )                                            │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ B. RECEPCIÓN (ai-engine)                                         │
│                                                                  │
│   POST /webhooks/signal                                          │
│   signal-webhook.controller.js:                                  │
│     1. verifySupabaseSignature(req) — Bearer o HMAC              │
│     2. Determina threat_level por keywords (promo/urgencia)      │
│     3. Inserta agent_queue_jobs:                                 │
│         { task_type: 'analysis', signal_id, priority }           │
│     4. Inserta mission_runs (tracking)                           │
│     5. Si threat_level HIGH/CRITICAL:                            │
│        Inserta brand_vulnerabilities                             │
│     6. Responde 200 OK                                           │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ C. PROCESAMIENTO (job-worker)                                    │
│                                                                  │
│   Cada 10s, job-worker.service.js poll agent_queue_jobs WHERE    │
│     status='queued' AND locked_by IS NULL                        │
│                                                                  │
│   Por cada job:                                                  │
│     1. tryLockJob(jobId) — UPDATE optimista                      │
│     2. Resuelve handler según task_type                          │
│     3. Para 'analysis':                                          │
│        - Carga signal completa + entity + brand_container        │
│        - Invoca tool de análisis (puede llamar a Vera/OpenClaw)  │
│        - update intelligence_signals.ai_analysis = result        │
│        - Si detecta amenaza concreta → crea brand_vulnerabilities│
│        - Si la amenaza requiere acción → crea pending_action     │
│     4. update agent_queue_jobs.status = 'completed' / 'failed'   │
│     5. update mission_runs.status, completed_at                  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ D. PROPUESTA DE ACCIÓN                                           │
│                                                                  │
│   vera_pending_actions ← INSERT por:                             │
│     - signal-webhook si threat es accionable                     │
│     - threat-detector tras detección estadística                 │
│     - Vera explícitamente en chat con humano                     │
│                                                                  │
│   La fila tiene:                                                 │
│     status='pending', priority 1-10, action_type,                │
│     proposed_payload jsonb, vera_reasoning, vera_confidence,     │
│     impact_estimate, expires_at, source_signal_id                │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼ (realtime supabase_realtime)
┌──────────────────────────────────────────────────────────────────┐
│ E. UI — Dashboard de Estrategia                                  │
│                                                                  │
│   StrategiaDataService recibe el INSERT por suscripción          │
│   La card aparece en el tab HOY/SEMANA/MES según expires_at      │
│                                                                  │
│   Usuario ve:                                                    │
│     - Título imperativo, score de oportunidad, badges            │
│     - Razonamiento Vera, signals fuente, preview                 │
│   Click APROBAR → POST /rpc/fn_vpa_approve                       │
│   (o RECHAZAR → fn_vpa_reject)                                   │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ F. APROBACIÓN                                                    │
│                                                                  │
│   fn_vpa_approve(p_action_id, p_approver):                       │
│     - Valida is_org_member                                       │
│     - update vera_pending_actions:                               │
│         status='approved', approved_by=p_approver                │
│     - return { success, action_id, status }                      │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ G. GENERACIÓN DE MISIÓN                                          │
│                                                                  │
│   Cada 5 min: sensor mission_generation                          │
│   mission-generator.service.js:                                  │
│     1. Lee vera_pending_actions WHERE status='approved'          │
│     2. Para cada una sin body_mission:                           │
│        INSERT body_missions {                                    │
│          mission_type: `execute_${action_type}`,                 │
│          action_payload: { target_id, proposed_payload, ... },   │
│          trigger_signal_id: source_signal_id                     │
│        }                                                          │
│     3. update vera_pending_actions.status = 'executing'          │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ H. EJECUCIÓN                                                     │
│                                                                  │
│   action-executor.service.js o job-worker procesa la mission     │
│   Según mission_type:                                            │
│     - publish_post → llama a Meta Graph API                      │
│     - update_price → llama a Shopify/Mercado Libre               │
│     - send_email   → Resend                                      │
│     - update_persona → update audience_personas                  │
│     - link_brief_to_campaign → fn_link_brief_to_campaign RPC     │
│                                                                  │
│   Resultado:                                                     │
│     mission_runs ← INSERT { status='completed', result, duration}│
│     update body_missions.status = 'completed'                    │
│     update vera_pending_actions.status = 'executed'              │
│     update vera_pending_actions.execution_result = result        │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼ (realtime)
┌──────────────────────────────────────────────────────────────────┐
│ I. UI — Historial de Misiones (Zona 5)                           │
│   La card pasa a "EJECUTADO" con link al output.                 │
│   Tasa de éxito por tipo se acumula → ajusta scores futuros.     │
└──────────────────────────────────────────────────────────────────┘
```

## Flujo 2 — Sensor diario brand-wide (ej: meta_audience_demographics)

```
┌────────────────────────────────────────────────────┐
│ Cada 5 min: brand-sensor-sync                      │
│   asegura monitoring_triggers row para sensor      │
│   con cadence='daily', next_run_at calculado       │
└─────────────────┬──────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────────┐
│ ai-engine scheduler (cada 10 min):                 │
│   busca monitoring_triggers WHERE                  │
│     next_run_at <= now() AND status='active'       │
│   ejecuta el handler del sensor_type               │
└─────────────────┬──────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────────┐
│ Handler meta_audience_demographics:                │
│   1. Carga brand_integrations.access_token (Meta)  │
│   2. token-refresh.service refresca si expira      │
│   3. GET Meta Graph API:                           │
│      /{ig-user-id}/insights?metric=                │
│        audience_gender_age,audience_locale         │
│   4. Procesa, mapea a estructura interna           │
│   5. UPSERT brand_audience_heatmap o tabla afín    │
│   6. INSERT sensor_runs { status='success' }       │
│   7. UPDATE monitoring_triggers.next_run_at = +24h │
└────────────────────────────────────────────────────┘
```

## Flujo 3 — Chat con Vera

```
1. Usuario abre Vera en UI → VeraView.js
2. Frontend opens supabase channel a ai_messages WHERE conversation_id=X
3. User escribe → POST /chat con { message, organizationId, conversationId }
4. ai-engine: ai.service.js procesa:
   a. Extrae approved intents del historial
   b. Carga memoria (short + long + goal)
   c. Activa sesión OpenClaw aislada por org+conv
   d. Consent gate pre-OpenClaw (bloquea acciones de escritura si phase A)
   e. Carga contexto org-scoped → ViewModel
   f. Llama a OpenClaw con el prompt
   g. Loop de tool calls:
      - validateToolCallBatch (schema + injection)
      - checkToolBudget (TOOL_LIMITS)
      - dispatchTool (allowlist + policy + consent + timeout)
   h. Actualiza ai_messages con respuesta + activity events
   i. maybeSummarize (asíncrono, comprime memoria si pasa threshold)
5. Frontend recibe el INSERT en ai_messages via realtime → renderiza
```

Detalle de la lógica de policy/autonomy en `07-vera.md`.

## Flujo 4 — Provisioning de una org nueva

```
1. Admin crea organization (UI o API directa)
2. Trigger fn_intelligence_entities_after_insert NO aplica aún (no hay entities)
3. Cuando se agrega primera brand_integration:
   trigger fn_brand_integrations_after_insert dispara
4. brand-sensor-sync detecta brand_container nuevo y crea los 9 sensores brand-wide
5. Si plan exige VM dedicada:
   hetzner.provisioner.createServer() → openclaw_instances ← INSERT
6. provisioning_events log el cascade
```

## Flujo 5 — Refresh de matview

```
pg_cron job:
  cron.schedule('*/5 * * * *', $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_health;
  $$);
```

Hoy solo `v_orphan_topics` existe y se refresca manualmente. La capa precomputada (mv_dashboard_*) está pendiente.

## Flujo 6 — Aprobar un body_mission desde frontend

```
1. UI muestra misión en estado pending
2. Click "Ejecutar" → POST /api/missions/:id/execute (Netlify Function)
3. Function valida JWT + permisos
4. Llama a ai-engine: POST /missions/:id/execute (con INTERNAL_ADMIN_TOKEN)
5. ai-engine: action-executor.service procesa el mission_type
6. Resultado se escribe en mission_runs y body_missions.status
```

## Flujo 7 — Captura de un post propio (Meta Insights)

```
Sensor meta_posts (per-entity):
  1. Lee brand_integrations + tokens
  2. GET /v22.0/{page}/posts?fields=id,message,created_time,permalink_url,
       attachments,insights.metric(post_impressions,post_reach,post_engaged_users)
  3. Para cada post:
       UPSERT brand_posts { brand_container_id, post_id (unique), content,
                            metrics jsonb, captured_at, post_source='own' }
  4. Si VERA_PER_POST_ANALYSIS_ENABLED:
       Encola job de content-analysis para ese post
  5. content-analysis.service:
       UPSERT brand_content_analysis { brand_post_id (unique), tone_*,
                                       why_it_worked, fatigue_risk, ... }
```

## Idempotencia — el patrón general

| Tipo de write | Cómo se evita duplicado |
|---|---|
| Embeddings | hash SHA-256 del contenido en `metadata.content_hash` |
| Sensores | UNIQUE en `(brand_container_id, sensor_type, entity_id)` |
| Body missions | check `metadata.parent_action_id` antes de insertar |
| Threats (virality) | `metadata.triggering_post_id` en clave |
| Threats (drop/sentiment) | `flagged_window_start` |
| Posts capturados | UPSERT por (`brand_container_id`, `post_id`) |
| Pending actions | `source_signal_id` + `action_type` con expiración (no insertar duplicado activo) |

## Latencias típicas

| Camino | Latencia esperada |
|---|---|
| INSERT signal → webhook recibido en ai-engine | <500ms (pg_net asíncrono) |
| Webhook → INSERT en agent_queue_jobs | <50ms |
| job-worker dequeue → ejecución completada | 1-30s (depende del task_type) |
| INSERT vera_pending_actions → realtime al frontend | <500ms |
| User aprueba → fn_vpa_approve responde | <100ms |
| pending_action approved → body_mission creada | hasta 5 min (mission_generation cadence) |
| body_mission → ejecutada | 5s-3 min según task |

## Métricas de salud (lo que vigilar)

- `intelligence_signals.captured_at` más reciente — si no hay señales en 1h algo está roto.
- `agent_queue_jobs WHERE status='queued' AND created_at < now() - interval '5 min'` — debería ser 0.
- `body_missions WHERE status='pending' AND created_at < now() - interval '15 min'` — alerta si crece.
- `sensor_runs WHERE status='failed' AND started_at > now() - interval '24 hours'` — debería ser 0 o muy bajo.
- `mission_runs WHERE status='running' AND started_at < now() - interval '10 min'` — runs colgados.

## Errores típicos y dónde mirar

| Síntoma | Posible causa | Dónde mirar |
|---|---|---|
| Signal no llega a ai-engine | HMAC mal calculado, network, ai-engine down | logs del ai-engine, `journalctl -u ai-engine` |
| Job nunca se procesa | worker caído, lock no se libera | `agent_queue_jobs.locked_by`, restart ai-engine |
| Mission se queda pending | dispatcher rompió camino para ese mission_type | logs ai-engine + `mission_runs` correlacionado |
| Vera no responde en chat | OpenClaw down, token expirado, presupuesto agotado | logs ai-engine, `sessions/`, OpenClaw gateway status |
| Realtime no llega al frontend | tabla no en publication, RLS bloquea | `pg_publication_tables`, network tab |
| 400 Bad Request al cargar dashboard | orgId no es UUID válido | router.js debe resolver orgIdShort, ver `05-frontend.md` |

---

*Anterior: [05 — Frontend](./05-frontend.md) · Siguiente: [07 — Vera (la IA)](./07-vera.md)*
