# Index de tareas activas

Ordenado por severity desc → prioridad.
Cuando se cierra una tarea: eliminar el archivo Y la línea aquí.

Última actualización: **2026-05-06** (sprint frontend 100% iniciado).

**Leyenda de columnas:**
- 🤖 = `auto_eligible: yes` — agente programado puede ejecutar sola en ventana 23:00–03:00 Bogota
- 👤 = `auto_eligible: no` — requiere humano (input, decisión, acceso externo, UX visible)
- ⏱ short (<30min) · medium (30-90min) · long (90min-3h)

## 🔴 Critical

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [SPRINT-FRONTEND-100](./SPRINT-FRONTEND-100-2026-05-06.md) | Sprint 16 días para exponer 100% del backend al usuario — D1 hoy 6/05, entrega 22/05 | feature | 👤 | long | — |

## 🟠 High

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [DATA-001](./DATA-001-configure-competitor-entities.md) | Faltan `intelligence_entities` competidoras → 4 tablas vacías + Apify gastando créditos en vacío | data | 👤 | short | — |
| [BUG-003](./BUG-003-openai-quota-brand-indexer.md) | `brand_indexer` no genera vectors — quota OpenAI agotada (BLOQUEADO por billing) | bug | 👤 | short | — |
| [FEAT-014](./FEAT-014-anthropic-proxy-metering-cap.md) | Anthropic proxy + cap + notifications (3 fases). Solo falta deploy SSH en VM piloto (~5 min). | ops | 👤 | short | — |
| [FEAT-015](./FEAT-015-cost-confirmation-pre-flight.md) | Pre-flight cost confirmation — heurística + confirm() en VeraView. Falta validación visual humana. | feature | 👤 | short | — |
| [FEAT-011](./FEAT-011-studio-programar-button.md) | Botón "Programar" en StudioView — desbloquea cadena schedule end-to-end | feature | 👤 | medium | — |
| [FEAT-012](./FEAT-012-user-provisioning-end-to-end.md) | Provisioning de usuarios end-to-end (función backend + email + onboarding) | feature | 👤 | long | — |
| [FEAT-017](./FEAT-017-content-feed.md) | Content Feed unificado — reescribir ContentView como feed estilo IA_Partner sobre `brand_posts` + `competitor_ads` + `intelligence_signals` (en progreso) | feature | 👤 | long | — |

## 🟡 Medium

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [FEAT-007](./FEAT-007-frontend-services-refactor.md) | Refactor services frontend para llamar 1 RPC por dashboard | feature | 👤 | medium | — |
| [FEAT-008](./FEAT-008-frontend-new-services.md) | Crear `TendenciasDataService` (Competencia ya existe) + render | feature | 👤 | long | — |
| [FEAT-013](./FEAT-013-monitoring-crud.md) | CRUD de sensores y URL watchers en MonitoringView | feature | 👤 | medium | — |
| [OPS-006](./OPS-006-meta-ad-library-diagnostico.md) | Meta Ad Library — decidir A (Meta App Review) / B (Apify actor) / C (pausar). Legacy fallback ya eliminado. | ops | 👤 | medium | — |

## 🟢 Low

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales de Hetzner CCX33 | ops | 👤 | short | — |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot) | ops | 👤 | short | — |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | `supabase` CLI — instalar + link + baseline. Estructura `supabase/` ya creada. | ops | 👤 | short | — |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Backup del `.env` del ai-engine en secret manager (Supabase Vault) | ops | 👤 | medium | — |
| [OPS-007](./OPS-007-tokens-encryption-supabase-vault.md) | Cifrado global de tokens de integración (Meta/Google/Shopify) vía Supabase Vault | ops | 👤 | long | — |
| [BUG-004](./BUG-004-vera-chat-uso.md) | Verificar VeraView end-to-end (no es bug — auditoría backend OK, falta prueba humana) | test | 👤 | short | — |

---

**Total:** 15 tareas activas (0 auto-eligibles 🤖 + 15 requieren humano 👤).

| Estado | Total | Auto-eligibles 🤖 | Requieren humano 👤 |
|---|---|---|---|
| 🔴 critical | 0 | 0 | 0 |
| 🟠 high | 6 | 0 | 6 |
| 🟡 medium | 4 | 0 | 4 |
| 🟢 low | 5 | 0 | 5 |
| **Suma** | **15** | **0** | **15** |

## Resueltas el 2026-05-05

- **BUG-001** — flujo `competitor_signal_analysis` eliminado (opción A). Editados `signal-webhook.controller.js` (la función `enqueueSignalAnalysis` ya no crea body_missions ni jobs; solo crea `brand_vulnerabilities` para HIGH/CRITICAL) y `audience-alignment.service.js` (ya no crea `vera_pending_actions{action_type:'update_persona'}`). Servicio `ai-engine` reiniciado vía systemd.
- **DATA-004** — 46 body_missions colgadas → `failed` y 3 `vera_pending_actions` (`update_persona`) → `expired`. Backups en `_bak_stuck_missions_2026_05_05` y `_bak_stuck_actions_2026_05_05` (drop tras 30 días).
- **DATA-003** — `cron.unschedule('production_master_autonomous_v1')` ejecutado. Auditoría de otros zombies (LEFT JOIN entre `cron.job` y `flow_schedules`) devolvió 0 candidatos.
- **DOCS-002** — `02-architecture.md`, `04-ai-engine.md`, `07-vera.md`, `08-deployment.md` y `ESTADO_EXPANDIDO_2026-05-05.md` actualizados: eliminadas referencias a `advanced-scraper.service.js`, "Playwright stealth" descritas como histórico, agregada sección "Apify integration" en `04-ai-engine.md`, y bumpeado `last_review` a 2026-05-05.
- **FEAT-009** — `DashboardView.js`: agregados `_subscribeRealtime()` / `_unsubscribeRealtime()` / `_onRealtimeChange()`. Suscribe a 6 tablas (`vera_pending_actions`, `brand_vulnerabilities`, `body_missions`, `retail_prices`, `trend_topics`, `intelligence_signals`) con filter `organization_id` salvo signals que se filtra cliente-side por entity_id. Cleanup en `onLeave()`. Cuando llega un cambio: invalida cache del scope afectado y, si el tab activo coincide, re-renderiza.
- **TEST-001** — Foundation con vitest creada: `package.json`, `vitest.config.js`, `test/setup.js`, `test/helpers.js`, 3 archivos de smoke tests (`endpoints.test.js` · 3 tests, `rls.test.js` · 4 tests, `rpcs.test.js` · 4 tests opt-in con service role), `test/README.md`, `.env.test.example`. `.gitignore` actualizado para no commitear `.env.test`.

## Reclasificadas el 2026-05-05

- **BUG-004** — bajada de High a Low + retipada como `test`. Auditoría backend confirmó que NO hay bug técnico: proxy Netlify vivo, `chat.controller.js` correcto, `VeraView.js` accesible, ruta registrada, realtime habilitado, último flujo end-to-end exitoso (PONG del 30-04). El `request_count=0` que reportaba el task original es métrica engañosa: `openclaw_instances.request_count`/`last_request_at` solo se actualizan en provisioning, no en cada `/chat`. Lo único que falta es prueba interactiva humana en browser.
- **BUG-003** — sigue High pero marcado BLOQUEADO en INDEX. 5 días consecutivos de `sensor_runs.status='failed'` con error 429 OpenAI. Código del indexer y `test-brand-indexer.mjs` están listos; solo falta saldo OpenAI en `info@ardeagency.com`.

## Cambios 2026-05-05 (auditoría post-Apify)

**Reescritas (1):**
- BUG-001 — confirmada causa raíz como migración Apify del 28/4. Handler removido. Decisión de producto requerida.

**Actualizadas (5):**
- DATA-001 — agregado contexto Apify (los actors corren pero gastan créditos sin entities).
- TEST-001 — actualizada lista de archivos `.mjs` de diagnóstico (removidos los obsoletos Playwright, agregados los demos post-Apify).
- FEAT-007 — quitado `blocked_by: [FEAT-006]` (FEAT-006 cerrada el 2026-04-30).
- FEAT-008 — quitado `blocked_by: [FEAT-006]` + nota de que `CompetenciaDataService` ya existe.
- FEAT-009 — quitado `blocked_by: [FEAT-005]` (FEAT-005 cerrada el 2026-04-30).

**Nuevas (9):**
- BUG-003 — quota OpenAI (root cause de `brand_indexer` que aún persiste).
- BUG-004 — VeraView sin uso real (verificar end-to-end).
- FEAT-011 — botón "Programar" en StudioView (cadena schedule end-to-end).
- FEAT-012 — provisioning de usuarios end-to-end.
- FEAT-013 — CRUD sensores + URL watchers en MonitoringView.
- DATA-003 — cleanup zombie cron.
- DATA-004 — limpiar 46 missions + 1 pending action colgadas (depende de BUG-001).
- DOCS-002 — actualizar platform docs post-migración Apify.
- OPS-006 — diagnóstico Meta Ad Library (sensor fallando en ambos paths).

## Resueltas el 2026-04-30 (sesión autónoma — referencia histórica)

11 tareas auto-eligibles cerradas en una sesión:

- DATA-002 — backfill 771 filas con `organization_id` NULL
- FEAT-010 — 14 triggers BEFORE INSERT auto-fill organization_id
- FEAT-001 — funciones SQL `health_score`, `threat_level`, `mention_velocity`
- FEAT-002 — 5 matviews con UNIQUE INDEX (CONCURRENTLY-ready)
- FEAT-003 — tabla `brand_metrics_daily` + función `compute_brand_metrics_daily()`
- FEAT-004 — 7 pg_cron jobs (5 refresh matviews + v_orphan_topics + snapshot diario)
- FEAT-005 — 7 tablas agregadas a `supabase_realtime` publication (total 11)
- FEAT-006 — 4 RPCs (`dashboard_competencia`, `_tendencias`, `_estrategia`, `_mi_marca_v2`)
- BUG-002 — root cause = OpenAI quota 429; fix de reporte silencioso aplicado (`brand_indexer` ahora marca `sensor_runs.status='failed'` con error visible). **Acción humana pendiente reabierta como BUG-003.**
- OPS-004 — 0 archivos `.bak >30d` (no había qué limpiar; los 42 actuales son recientes)
- DOCS-001 — `docs/platform/sensor-types-catalog.md` con 13 sensores documentados
