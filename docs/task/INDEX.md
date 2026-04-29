# Index de tareas activas

Ordenado por severity desc → prioridad.
Cuando se cierra una tarea: eliminar el archivo Y la línea aquí.

Última actualización: **2026-04-29**.

## 🔴 Critical

| ID | Título | Tipo | Owner |
|---|---|---|---|
| [BUG-001](./BUG-001-body-missions-stuck-competitor-signal-analysis.md) | Body missions tipo `competitor_signal_analysis` colgadas desde 27/4 | bug | — |

## 🟠 High

| ID | Título | Tipo | Owner |
|---|---|---|---|
| [BUG-002](./BUG-002-brand-indexer-no-vectors.md) | `brand_indexer` corre sin errores pero `ai_*_vectors` siguen vacíos | bug | — |
| [DATA-001](./DATA-001-configure-competitor-entities.md) | Faltan `intelligence_entities` competidoras → 4 tablas vacías | data | — |
| [DATA-002](./DATA-002-backfill-organization-id-null.md) | 5 tablas con `organization_id` NULL en filas viejas | data | — |
| [FEAT-001](./FEAT-001-scoring-functions-sql.md) | Funciones SQL puras: `health_score`, `threat_level`, `mention_velocity` | feature | — |
| [FEAT-002](./FEAT-002-materialized-views-precomputed-layer.md) | 5 matviews precomputadas para los 4 dashboards | feature | — |

## 🟡 Medium

| ID | Título | Tipo | Owner |
|---|---|---|---|
| [FEAT-003](./FEAT-003-historical-snapshot-table.md) | Tabla `brand_metrics_daily` + cron 00:00 UTC para snapshots | feature | — |
| [FEAT-004](./FEAT-004-pg-cron-refresh-jobs.md) | pg_cron jobs para refresh de matviews (5/15/60 min) | feature | — |
| [FEAT-005](./FEAT-005-extend-realtime-publication.md) | Habilitar realtime en 7 tablas más (vulnerabilities, signals, etc.) | feature | — |
| [FEAT-006](./FEAT-006-dashboard-rpcs-remaining.md) | Crear `dashboard_competencia/tendencias/estrategia` + v2 de mi_marca | feature | — |
| [FEAT-007](./FEAT-007-frontend-services-refactor.md) | Refactor services frontend para llamar 1 RPC por dashboard | feature | — |
| [FEAT-008](./FEAT-008-frontend-new-services.md) | Crear `CompetenciaDataService` y `TendenciasDataService` | feature | — |
| [FEAT-009](./FEAT-009-frontend-realtime-subscriptions.md) | Suscripciones realtime en `DashboardView` | feature | — |
| [FEAT-010](./FEAT-010-organization-id-auto-fill-triggers.md) | Triggers BEFORE INSERT que rellenen `organization_id` desde FK | feature | — |

## 🟢 Low

| ID | Título | Tipo | Owner |
|---|---|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales de Hetzner CCX33 | ops | — |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot) | ops | — |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | Configurar `supabase` CLI con migraciones versionadas | ops | — |
| [OPS-004](./OPS-004-cleanup-bak-files.md) | Limpiar archivos `.bak.*` con > 30 días en ai-engine | ops | — |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Backup del `.env` del ai-engine en secret manager | ops | — |
| [DOCS-001](./DOCS-001-sensor-types-payload-schemas.md) | Documentar todos los `sensor_type` con su payload schema | docs | — |
| [TEST-001](./TEST-001-test-suite-foundation.md) | Test suite: arrancar al menos smoke tests de RPCs y endpoints | test | — |

---

**Total:** 19 tareas activas.

Stats por tipo: 2 bugs · 2 data · 10 features · 5 ops · 1 docs · 1 test.
