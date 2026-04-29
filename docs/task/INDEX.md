# Index de tareas activas

Ordenado por severity desc → prioridad.
Cuando se cierra una tarea: eliminar el archivo Y la línea aquí.

Última actualización: **2026-04-29**.

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
| [BUG-002](./BUG-002-brand-indexer-no-vectors.md) | `brand_indexer` corre sin errores pero `ai_*_vectors` siguen vacíos | bug | 🤖 | medium | — |
| [DATA-001](./DATA-001-configure-competitor-entities.md) | Faltan `intelligence_entities` competidoras → 4 tablas vacías | data | 👤 | short | — |
| [DATA-002](./DATA-002-backfill-organization-id-null.md) | 5 tablas con `organization_id` NULL en filas viejas | data | 🤖 | short | — |
| [FEAT-001](./FEAT-001-scoring-functions-sql.md) | Funciones SQL puras: `health_score`, `threat_level`, `mention_velocity` | feature | 🤖 | medium | — |
| [FEAT-002](./FEAT-002-materialized-views-precomputed-layer.md) | 5 matviews precomputadas para los 4 dashboards | feature | 🤖 | long | — |

## 🟡 Medium

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [FEAT-003](./FEAT-003-historical-snapshot-table.md) | Tabla `brand_metrics_daily` + cron 00:00 UTC para snapshots | feature | 🤖 | medium | — |
| [FEAT-004](./FEAT-004-pg-cron-refresh-jobs.md) | pg_cron jobs para refresh de matviews (5/15/60 min) | feature | 🤖 | short | — |
| [FEAT-005](./FEAT-005-extend-realtime-publication.md) | Habilitar realtime en 7 tablas más | feature | 🤖 | short | — |
| [FEAT-006](./FEAT-006-dashboard-rpcs-remaining.md) | Crear `dashboard_competencia/tendencias/estrategia` + v2 de mi_marca | feature | 🤖 | long | — |
| [FEAT-007](./FEAT-007-frontend-services-refactor.md) | Refactor services frontend para llamar 1 RPC por dashboard | feature | 👤 | medium | — |
| [FEAT-008](./FEAT-008-frontend-new-services.md) | Crear `CompetenciaDataService` y `TendenciasDataService` | feature | 👤 | long | — |
| [FEAT-009](./FEAT-009-frontend-realtime-subscriptions.md) | Suscripciones realtime en `DashboardView` | feature | 👤 | medium | — |
| [FEAT-010](./FEAT-010-organization-id-auto-fill-triggers.md) | Triggers BEFORE INSERT que rellenen `organization_id` desde FK | feature | 🤖 | short | — |

## 🟢 Low

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales de Hetzner CCX33 | ops | 👤 | short | — |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot) | ops | 👤 | short | — |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | Configurar `supabase` CLI con migraciones versionadas | ops | 👤 | medium | — |
| [OPS-004](./OPS-004-cleanup-bak-files.md) | Limpiar archivos `.bak.*` con > 30 días en ai-engine | ops | 🤖 | short | — |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Backup del `.env` del ai-engine en secret manager | ops | 👤 | medium | — |
| [DOCS-001](./DOCS-001-sensor-types-payload-schemas.md) | Documentar todos los `sensor_type` con su payload schema | docs | 🤖 | medium | — |
| [TEST-001](./TEST-001-test-suite-foundation.md) | Test suite: arrancar al menos smoke tests de RPCs y endpoints | test | 👤 | long | — |

---

**Total:** 19 tareas activas.

| Estado | Total | Auto-eligibles 🤖 | Requieren humano 👤 |
|---|---|---|---|
| 🔴 critical | 1 | 0 | 1 |
| 🟠 high | 5 | 3 | 2 |
| 🟡 medium | 8 | 5 | 3 |
| 🟢 low | 7 | 2 | 5 |
| **Suma** | **21** | **10** | **11** |

(Suma 21 ≠ 19 porque conteo de auto/humano se solapa con severity counts. Ver detalle por fila.)

## Plan de ejecución autónoma propuesto

Cadencia: **2-3 cortas o 1 larga por noche**, ventana 23:00–03:00 Bogota. Respeta dependencias `blocked_by`.

| Noche | Tareas | Densidad |
|---|---|---|
| 1 | DATA-002 (short) + FEAT-010 (short) | 2 cortas |
| 2 | FEAT-001 (medium) | 1 medium |
| 3 | FEAT-002 (long) | 1 larga |
| 4 | FEAT-004 (short) + FEAT-005 (short) + OPS-004 (short) | 3 cortas |
| 5 | FEAT-003 (medium) + DOCS-001 (medium) | 2 medium |
| 6 | FEAT-006 (long) | 1 larga |
| 7 | BUG-002 (medium) | 1 medium · evaluamos resultados |

Después de la Noche 7: pausa para que el usuario evalúe lo construido y decida siguiente lote (las 👤 con su input directo o las que queden auto-eligibles).
