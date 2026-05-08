---
title: 02 — Arquitectura de la plataforma
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-05-05
audience: humanos del equipo + LLMs
---

# 02 · Arquitectura

## Las 5 capas

La plataforma se entiende como **5 capas que viven juntas pero hacen cosas distintas**.

```
┌────────────────────────────────────────────────────────────────────┐
│                       1. CAPA DE INGESTA                           │
│                                                                    │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │
│  │ Scrapers Hetzner   │  │ Meta/Google APIs   │  │ Inputs UI    │  │
│  │ (Apify actors)     │  │ (sensores diarios) │  │ (manual)     │  │
│  └─────────┬──────────┘  └─────────┬──────────┘  └──────┬───────┘  │
└────────────┼────────────────────────┼────────────────────┼──────────┘
             │                        │                    │
             ▼                        ▼                    ▼
┌────────────────────────────────────────────────────────────────────┐
│                    2. TABLAS NÚCLEO (writes)                       │
│                                                                    │
│  intelligence_signals · brand_posts · retail_prices                │
│  trend_topics · competitor_ads · brand_vulnerabilities             │
│  brand_audience_heatmap · brand_analytics_snapshots                │
└────────────────────────────────────────────────────────────────────┘
             │
             │  (triggers AFTER INSERT — pg_net + lógica detectiva)
             │
┌────────────▼───────────────────────────────────────────────────────┐
│                  3. CAPA DE INTELIGENCIA                           │
│                                                                    │
│  ai-engine services (Hetzner):                                     │
│   • threat-detector → escribe vulnerabilidades                      │
│   • brand-indexer   → embeddings en ai_*_vectors                    │
│   • mission-generator → pending_actions → body_missions             │
│   • job-worker      → procesa agent_queue_jobs                      │
│   • action-executor → ejecuta missions aprobadas                    │
│                                                                    │
│  Tablas resultantes:                                                │
│   vera_pending_actions · body_missions · brand_vulnerabilities     │
│   ai_brand_vectors · ai_global_vectors · mission_runs              │
└────────────┬───────────────────────────────────────────────────────┘
             │
             │  (pg_cron cada 5/15/60 min — agregaciones)
             │
┌────────────▼───────────────────────────────────────────────────────┐
│                 4. CAPA PRECOMPUTADA (PROYECTADA)                  │
│                                                                    │
│  Materialized views:                                                │
│   • mv_dashboard_health      (refresh 5 min)                       │
│   • mv_threat_level          (refresh 5 min)                       │
│   • mv_signal_velocity_24h   (refresh 15 min)                      │
│   • mv_brand_format_stats    (refresh 1 h)                         │
│   • brand_metrics_daily      (cron 00:00)                          │
│                                                                    │
│  Vistas existentes:                                                 │
│   • v_orphan_topics (matview ya creada)                            │
│   • recent_analyzed_signals                                         │
│   • v_org_server_status                                             │
│   • v_org_provisioning_status                                       │
└────────────┬───────────────────────────────────────────────────────┘
             │
             │  RPC SECURITY DEFINER · is_org_member check
             │
┌────────────▼───────────────────────────────────────────────────────┐
│                    5. CAPA DE LECTURA / UI                         │
│                                                                    │
│  RPCs por dashboard (lectura ultra-rápida):                         │
│   • dashboard_mi_marca      (aplicada — leerá matviews v2)         │
│   • dashboard_competencia   (pendiente)                             │
│   • dashboard_tendencias    (pendiente)                             │
│   • dashboard_estrategia    (pendiente)                             │
│                                                                    │
│  Frontend (Vanilla JS SPA):                                         │
│   • DashboardView con 4 tabs                                       │
│   • supabase.channel() para realtime                                │
│   • Widgets se actualizan sin reload                                │
└────────────────────────────────────────────────────────────────────┘
```

## Principios de diseño aplicados

### Single source of truth: Supabase

Todo dato de negocio vive en Supabase Postgres. El AI Engine es **stateless**: no guarda state local que no esté replicado en BD. Un reinicio del servidor pierde **cero información**. Esto permite:

- Provisionar otra VM de respaldo en minutos.
- Probar features en producción sin riesgo (la BD es la verdad).
- Que cualquier cliente (web, mobile, CLI, otro LLM) consulte el mismo estado.

Excepción: **caches en memoria** dentro del ai-engine para sessions de OpenClaw (`session-manager.js`) y registries de orgs (`openclaw.registry.js`). Pero estos se rehidratan al arranque desde la BD.

### Eventos vs polling

Donde es posible: **eventos**. Donde no: **polling con intervalo razonable**.

- `intelligence_signals` AFTER INSERT → trigger `pg_net.http_request` a `/webhooks/signal` (event).
- `flow_schedules` ↔ `pg_cron` sync via trigger (event).
- `vera_pending_actions` cambios → realtime al frontend (event).
- `agent_queue_jobs` worker poll cada 10s (polling — porque locks distribuidos son simples así).
- Sensores corren por `cadence` (cada 5 min, daily, etc) según `monitoring_triggers.next_run_at` (polling).

### Multi-tenant por diseño, no por acomodo

Toda fila relevante tiene `organization_id uuid REFERENCES organizations(id)`. Las RLS policies usan `is_org_member(organization_id)` consistentemente. Las RPCs `SECURITY DEFINER` validan al inicio.

Excepciones documentadas (tablas que **scopean por FK indirecta** porque su entidad padre tiene `organization_id`):
- `intelligence_signals` → vía `entity_id` → `intelligence_entities.organization_id`
- `brand_posts` → vía `brand_container_id` → `brand_containers.organization_id`
- `visual_references` → vía `brand_container_id`
- `mission_runs` → vía `mission_id` → `body_missions.organization_id`

Detalle en `03-database.md`.

### LLMs son tools, no decisores

Vera (Claude/OpenClaw) **propone**. La plataforma **decide** y **ejecuta**. Cada tool call que Vera intente:

1. Pasa por `validateToolCallBatch` (schema + injection check).
2. Pasa por `checkPolicy` (plan + rol + créditos).
3. Pasa por consent gate (según `level_of_autonomy`).
4. Se ejecuta con timeout y se audita.

Vera no puede:
- Borrar nada (no hay tools de delete).
- Modificar `organizations` (sólo lectura).
- Llamar APIs externas sin tool sancionado.
- Saltarse el policy engine (todos los `dispatchTool` lo invocan).

Detalle en `07-vera.md`.

### Idempotencia en jobs

Todo job que escribe debe ser idempotente:
- `brand_indexer` cachea por SHA-256 del contenido. Re-runs no llaman OpenAI.
- `brand_sensor_sync` solo inserta `monitoring_triggers` si no existen.
- `mission_generator` checa si ya existe `body_missions` para una `pending_action` antes de crearla.
- `threat_detector` usa `metadata.triggering_post_id` o `flagged_window_start` como clave natural anti-duplicación.

### Backups inline (.bak.{tag})

El equipo usa la convención `archivo.js.bak.{TAG}` antes de cambios grandes. Estos archivos se ignoran en producción (Node solo importa lo referenciado). Son útiles para diff/rollback rápido sin perder en git history.

Tags vistos: `B1`, `phase1`, `phase4`, `noai`, `race-revert`, `20260417`, `20260428-norm`, `20260428-events`, etc.

**Limpieza recomendada:** los .bak con más de 30 días pueden borrarse (git history los preserva igual).

## Diagrama de despliegue

```
┌──────────────┐                                       
│ aismartcont… │  https · CDN Cloudflare              
│  .io (web)   │  (Netlify)                           
└──────┬───────┘                                       
       │                                               
       │  user JWT (anon o authenticated)              
       ▼                                               
┌──────────────┐         ┌─────────────────────────┐  
│  Supabase    │ ◀──────▶│  api.aismartcontent.io  │  
│  Postgres    │  pg_net │  (Cloudflared tunnel    │  
│  + Storage   │         │   → ai-engine :3000)    │  
│  + Realtime  │         │                         │  
│  + Edge*     │         │  Hetzner CCX33          │  
└──────────────┘         │  (Ubuntu 22.04)         │  
       ▲                 │   • ai-engine.service   │  
       │                 │   • openclaw × 2        │  
       │ JWT             │   • cloudflared.service │  
       │                 └─────────────────────────┘  
┌──────┴───────┐                                       
│  funciones   │                                       
│  netlify     │  (28 funciones — webhooks META,      
│  /functions/*│   AI proxies, integration callbacks) │
└──────────────┘                                       

(*) Edge Functions de Supabase: instalado pero no en uso. Toda la lógica
    de fondo vive en Hetzner via ai-engine.
```

## Flujo canónico end-to-end (resumen)

Una **señal** entra al sistema y se convierte en una **acción aprobable** en este recorrido:

```
[scraper Hetzner] writes →
  intelligence_signals (INSERT) →
    [Postgres trigger pg_net] POST /webhooks/signal →
      [ai-engine signal-webhook.controller] →
        agent_queue_jobs (INSERT, status='queued') →
          [ai-engine job-worker] dequeues →
            llama a tool de análisis (puede invocar Vera) →
              update intelligence_signals.ai_analysis →
                si threat_level HIGH/CRITICAL:
                  brand_vulnerabilities (INSERT) →
                    [threat-detector también puede aportar] →
                      vera_pending_actions (INSERT, status='pending') →
                        [usuario ve en realtime el card] →
                          [usuario aprueba] →
                            vera_pending_actions.status = 'approved' →
                              [mission-generator cada 5 min] →
                                body_missions (INSERT) →
                                  [job-worker] →
                                    action-executor → ejecuta →
                                      mission_runs (INSERT, status='completed') →
                                        update vera_pending_actions.status='executed'
```

Detalle paso a paso en `06-data-flows.md`.

## Multi-org y provisioning

Cada organización puede tener:
- Su propio `brand_container` (o varios).
- Su propio set de `intelligence_entities` (competidores, cuentas a vigilar).
- Sus propios `monitoring_triggers` (sensores activos).
- Su propia VM Hetzner — provisionada via `hetzner.provisioner.js` (campo `openclaw_instances`).
- Su propio `organization_credits`.
- Su propio `level_of_autonomy`.

El servicio `org-sync.service` mantiene esto en sincronía. Cuando se crea una organization, se dispara un cascade de provisioning.

## Qué falta vs qué sobra

| Pieza | Estado | Comentario |
|---|---|---|
| Capa 1 (ingesta) | ✅ funcional | Scrapers Meta/GA4 corren bien; tablas como `competitor_ads`, `retail_prices` están vacías por falta de `intelligence_entities` configuradas |
| Capa 2 (tablas) | ✅ esquema completo | algunos `organization_id` están NULL por jobs viejos — necesita backfill |
| Capa 3 (inteligencia) | ⚠️ parcial | threat-detector y brand-indexer corren; brand-indexer no genera vectors (BUG-003: HTTP 429 OpenAI quota — bloqueado por billing); flujo `competitor_signal_analysis` ✅ eliminado 2026-05-05 (BUG-001 opción A post-Apify) |
| Capa 4 (precomputado) | 🚧 proyectada | Solo existe `v_orphan_topics`. Las matviews del plan están pendientes de implementar |
| Capa 5 (lectura) | 🚧 parcial | `dashboard_mi_marca` aplicada (v1). Las otras 3 RPCs pendientes. Frontend tiene 2 services (Mi Marca, Estrategia) con queries directas — los otros 2 dashboards no tienen service aún |

Detalle en `09-current-state.md`.

---

*Anterior: [01 — Overview](./01-overview.md) · Siguiente: [03 — Base de datos](./03-database.md)*
