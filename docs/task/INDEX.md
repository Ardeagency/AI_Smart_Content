# Index de tareas activas

Ordenado por severity desc → prioridad.
Cuando se cierra una tarea: eliminar el archivo Y la línea aquí.

Última actualización: **2026-04-30**.

**Leyenda de columnas:**
- 🤖 = `auto_eligible: yes` — agente programado puede ejecutar sola en ventana 23:00–03:00 Bogota
- 👤 = `auto_eligible: no` — requiere humano (input, decisión, acceso externo, UX visible)
- ⏱ short (<30min) · medium (30-90min) · long (90min-3h)

## 🔴 Critical

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [BUG-001](./BUG-001-body-missions-stuck-competitor-signal-analysis.md) | Body missions tipo `competitor_signal_analysis` colgadas desde 27/4 | bug | 👤 | medium | — |

## 🟠 High

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [DATA-001](./DATA-001-configure-competitor-entities.md) | Faltan `intelligence_entities` competidoras → 4 tablas vacías | data | 👤 | short | — |

## 🟡 Medium

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [FEAT-007](./FEAT-007-frontend-services-refactor.md) | Refactor services frontend para llamar 1 RPC por dashboard | feature | 👤 | medium | — |
| [FEAT-008](./FEAT-008-frontend-new-services.md) | Crear `CompetenciaDataService` y `TendenciasDataService` | feature | 👤 | long | — |
| [FEAT-009](./FEAT-009-frontend-realtime-subscriptions.md) | Suscripciones realtime en `DashboardView` | feature | 👤 | medium | — |

## 🟢 Low

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales de Hetzner CCX33 | ops | 👤 | short | — |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot) | ops | 👤 | short | — |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | Configurar `supabase` CLI con migraciones versionadas | ops | 👤 | medium | — |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Backup del `.env` del ai-engine en secret manager | ops | 👤 | medium | — |
| [TEST-001](./TEST-001-test-suite-foundation.md) | Test suite: arrancar al menos smoke tests de RPCs y endpoints | test | 👤 | long | — |

---

**Total:** 10 tareas activas (todas requieren humano 👤).

| Estado | Total | Auto-eligibles 🤖 | Requieren humano 👤 |
|---|---|---|---|
| 🔴 critical | 1 | 0 | 1 |
| 🟠 high | 1 | 0 | 1 |
| 🟡 medium | 3 | 0 | 3 |
| 🟢 low | 5 | 0 | 5 |
| **Suma** | **10** | **0** | **10** |

## Resueltas el 2026-04-30 (sesión autónoma)

11 tareas auto-eligibles cerradas en una sesión:

- DATA-002 — backfill 771 filas con `organization_id` NULL
- FEAT-010 — 14 triggers BEFORE INSERT auto-fill organization_id
- FEAT-001 — funciones SQL `health_score`, `threat_level`, `mention_velocity`
- FEAT-002 — 5 matviews con UNIQUE INDEX (CONCURRENTLY-ready)
- FEAT-003 — tabla `brand_metrics_daily` + función `compute_brand_metrics_daily()`
- FEAT-004 — 7 pg_cron jobs (5 refresh matviews + v_orphan_topics + snapshot diario)
- FEAT-005 — 7 tablas agregadas a `supabase_realtime` publication (total 11)
- FEAT-006 — 4 RPCs (`dashboard_competencia`, `_tendencias`, `_estrategia`, `_mi_marca_v2`)
- BUG-002 — root cause = OpenAI quota 429; fix de reporte silencioso aplicado (`brand_indexer` ahora marca `sensor_runs.status='failed'` con error visible)
- OPS-004 — 0 archivos `.bak >30d` (no había qué limpiar; los 42 actuales son recientes)
- DOCS-001 — `docs/platform/sensor-types-catalog.md` con 13 sensores documentados

**Acción humana pendiente del trabajo de esa sesión:** resolver quota OpenAI para que `brand_indexer` realmente genere vectores (BUG-002 root cause).
