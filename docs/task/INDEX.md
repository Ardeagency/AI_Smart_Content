# Index de tareas activas

Ordenado por severity desc. Cuando se cierra una tarea: eliminar el archivo Y la
linea aqui. Las que solo esperan accion humana viven en
[`PENDING-HUMAN-VERIFICATION.md`](./PENDING-HUMAN-VERIFICATION.md).

**Ultima actualizacion: 2026-06-03** — barrido de cierre. Se eliminaron 2 tareas
verificadas COMPLETED (FEAT-035 roles/permisos: enums confirmados en BD; FEAT-035
flows-market: rediseño entregado, solo extras diferidos) y se indexo FEAT-037
(dashboard Tier-1, en curso). Ver "Resueltas / reclasificadas" al final.

**2026-05-27** — reconciliacion total docs/task vs codigo vivo + BD. Se verifico
el estado real de las 29 tareas que el INDEX listaba como pendientes; el INDEX
estaba masivamente desactualizado. Resultado: 7 ya estaban COMPLETED (borradas),
9 solo esperan verificacion humana (consolidadas en 1 doc), y quedan las que de
verdad faltan por construir.

---

## 🧪 Pendiente SOLO de verificacion / activacion humana

Codigo hecho y desplegado; falta una accion humana (prueba en browser, credenciales,
click-through). 9 items consolidados en un solo doc:

→ [`PENDING-HUMAN-VERIFICATION.md`](./PENDING-HUMAN-VERIFICATION.md)
(FEAT-019, FEAT-020, FEAT-021b, FEAT-015, FEAT-017, OPS-007, CHARTJS_FORMAT_SUPPORT,
BUG-004, SPRINT-FRONTEND-100)

---

## 🔴 Critical — falta construir

| ID | Que falta EXACTAMENTE |
|---|---|
| [FEAT-036](./FEAT-036-kie-rate-governor-and-queue.md) | Governor de tasa KIE: limite real 20 createTask/10s POR CUENTA y 429 NO encola (= job perdido en picos). **Fase 1 CERRADA 2026-05-29**: token bucket Postgres + Path A (6 funciones Netlify, commit 6463f55a) + Path B (comfy-flow-runner cuenta nodos KIE_* y reserva tokens). Riesgo confirmado real (1 flow = 6 nodos KIE × 5 concurrentes = 30 > 20). Pendiente: observabilidad de throttle + Fases 2-4 (foreground>background, cola unificada con prioridad por plan, turbo por plan). |

## 🟠 High — falta construir

| ID | Que falta EXACTAMENTE |
|---|---|
| [FEAT-022](./FEAT-022-rbac-granular.md) | RBAC formal owner/admin/editor/viewer: matriz de permisos + audit de RLS policies + UI + transfer ownership. Hoy solo hay selector de rol suelto. |
| [FEAT-018](./FEAT-018-notifications-rich-model.md) | Modelo rico de notifs: render ya existe (`Navigation.js:944`), pero falta backfill SQL de `metadata.label` (solo 2 de ~50 filas lo tienen) + backend que escriba metadata al crear. |
| [FEAT-031](./FEAT-031-dev-portal-iteration-2026-05-22.md) | Backend ai-engine: B1 endpoint `POST /api/vera/train` (vectoriza file/prompt/image en `ai_global_vectors`); B2 extender edge function `provision-user-start` para guardar `new_brand_name_oficial`/`slogan`/`logo_url`. Frontend ya cablea ambos. |
| [FEAT-037](./FEAT-037-dashboard-tier1-gap-closure.md) | Dashboard Tier-1 gap closure: ~33 RPCs `dashboard_*` huerfanas + capacidades de plataforma (frescura, deltas, export, alertas). **Fase 1 EN CURSO** (commit 21f032c4: benchmark Mi Marca vs Competencia cableado). Falta Fases 2-3 + verificacion humana. |

## 🟡 Medium — falta construir

| ID | Que falta EXACTAMENTE |
|---|---|
| [PERF-001](./PERF-001-cleanup-optimization.md) | Limpieza+optimizacion. HECHO en rama `perf/cleanup-optimization` (perf glass/animaciones, 3 bugs runtime, -825 lineas muertas, command-center.css route-split + infra `_loadCss`). PENDIENTE QA visual: route-split del resto del CSS (developer.css 351KB con class-moves + mapa de inyeccion verificado), consolidar escapeHtml (seguridad), `.card` glass->solido, keyframes, z-index tokens, dividir monolitos. |
| [FEAT-034](./FEAT-034-dev-flows-test-button.md) | `DevFlowsView.js:396` `testFlow()` es stub (console.log + toast "en desarrollo"); cablear corrida real en modo test (coordinar con FEAT-033). |
| [FEAT-036](./FEAT-036-billing-console.md) | Billing console `/dev/lead/billing`. Fase 1 cerrada (Plans CRUD BD + Credit Packages CRUD completo sobre `credit_packages`). Pendiente Fase 2 (Subscriptions + Usage history) y Fase 3 (auto-sync Stripe/Wompi al editar precio). |
| [FEAT-028](./FEAT-028-modal-migration.md) | Migrar ~17 modales custom restantes a `window.Modal` (1 migrado + validado). 3-5 por sesion. |
| [FEAT-029](./FEAT-029-brand-creative-brief-rebalance.md) | Fase 1 cerrada (caps + IGNIS limpiado). Falta Fase 2b (validacion server-side de hard caps en `InfoPanel.mixin.js` saveBrandContainerFieldById + generador de brief con LLM cheap) y Fase 3 (schema redesign formal). No urgente. |
| [FEAT-025](./FEAT-025-mercadolibre-api-publica-fiche.md) | **BLOQUEADA-EXTERNO** (verificado 2026-05-27): la API de ML ya no es publica, devuelve 403 `PA_UNAUTHORIZED` sin token. Requiere registrar app ML + OAuth, o seguir con scrape HTML + headless. Decision de producto pendiente. |
| [FEAT-030](./FEAT-030-n8n-flow-output-semantics.md) | BD ya parchada (2026-05-23); falta tocar el flow IGNIS en n8n: renombrar `copys`->`scene_prompt` y agregar `post_copy`/`post_hashtags`. Owner: equipo n8n (herramienta externa). |
| [FEAT-032](./FEAT-032-comfyui-flows-publishing.md) | Build del comfy-kie-adapter: `parser.js` + `resolver.js` + `orchestrator.js` + executors en ai-engine + POC con flow IGNIS. Discovery cerrado 2026-05-23. |
| [FEAT-033](./FEAT-033-comfy-flow-bridge.md) | Puente orquestacion ComfyUI ai-engine<->content-flows: migracion tabla `comfy_flow_jobs` + `comfy-flow-runner.service.js` + pool de N workers en content-flows. Diseño aprobado 2026-05-25. |
| [FEAT-012](./FEAT-012-user-provisioning-end-to-end.md) | Provisioning end-to-end: requiere decision de producto (invitation-only vs autoservicio) + email sender (Resend). 3 endpoints hardcoded inexistentes en `DevLeadUserProvisioningView`. |
| [OPS-006](./OPS-006-meta-ad-library-diagnostico.md) | Decidir path A (Meta App Review) / B (Apify) / C (pausar). `meta_ad_library_sync` activo pero `competitor_ads` vacia. Decision estrategica. |
| [OPS-012](./OPS-012-lexicon-review-admin.md) | `DevLeadLexiconView.js` es shell ("Proximamente"). Falta UI `/dev/lexicon` (review de `dimension_lexicon`, 215 filas) + crear tabla `enrich_lexicon_proposal` (no existe en BD). |
| [OPS-010](./OPS-010-ci-gates-staging.md) | `netlify.toml` no tiene gate `npm test` (solo cache-buster); `.github/workflows/ci.yml` corre tests en PR/push pero no bloquea el deploy. Falta gate en build + branch staging + Supabase staging separado. |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | Existe `supabase/migrations/.gitkeep` pero no el baseline. Falta `supabase link` + `supabase db dump` -> baseline.sql. |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Backup del `.env` de ai-engine: decidir A (Supabase Vault) / B (1Password) / C (archivo cifrado) e implementar. Hoy solo `.env`. |
| [DATA-001](./DATA-001-configure-competitor-entities.md) | 22 `intelligence_entities` pero `competitor_ads`/`retail_prices`/`visual_references` siguen en 0. Configurar competidores reales con dominio/target valido (depende en parte de OPS-006). Requiere input del usuario sobre que marcas. |

## 🟢 Low — falta construir (infra, no verificable desde el repo)

| ID | Que falta EXACTAMENTE |
|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales del CCX33 en consola Hetzner. |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot). |

---

## 📄 Referencia (no son tareas accionables)

Documentos de auditoria/discovery/diagnostico que informan trabajo pendiente; se
conservan como referencia, no se ejecutan directamente.

- [AUDIT-003](./AUDIT-003-enterprise-readiness-2026-05-12.md) — gap analysis enterprise readiness (roadmap/decisiones).
- [AUDIT-004](./AUDIT-004-premium-saas-tier1-brands-2026-05-13.md) — premium SaaS Tier-1 (Fase A/B/C + costos).
- [AUDIT-005](./AUDIT-005-db-architecture-tech-debt-2026-05-29.md) — deuda DB schema (56 fn definer sin search_path, 23 vistas sin security_invoker, 15 indices duplicados, ~17 no usados, ~98 FKs sin indice, 4 backups). DOCUMENTADO, no aplicado; re-auditar antes de corregir. Queries reproducibles incluidas.
- [FEAT-032-DISCOVERY-PFA-vs-SAUL](./FEAT-032-DISCOVERY-PFA-vs-SAUL.md) — discovery PFA vs workflow Saul (soporte de FEAT-032).
- [FEAT-032-INFORME-DIRECTOR-CREATIVO](./FEAT-032-INFORME-DIRECTOR-CREATIVO.md) — diagnostico de 14 obstaculos ComfyUI (soporte de FEAT-032/033).

---

## Resueltas / reclasificadas 2026-06-03

- **FEAT-035 (migracion roles/permisos)** — RESUELTA y borrada. DDL aplicado
  (commit `bb0fef35`) y verificado contra BD: enums `organization_member_role`
  `{owner,admin,editor,creator,vera_user,viewer}`, `developer_rank_type`
  `{rookie,junior,builder,expert,master,legend}`, `developer_role_type`
  `{lead,senior,contributor,viewer}` existen con los valores canonicos.
  `AuthService.js` ya usa fallback `'rookie'`. (Nota: este archivo nunca estuvo
  en el INDEX; reusaba el numero FEAT-035 — colision resuelta al borrarlo.)

- **FEAT-035 (rediseño Market de Flows)** — CERRADA y borrada. Fases 1-4 HECHAS
  + Fase 5 (rails de personalizacion, descubrimiento dinamico sin LLM, Destacado
  del dia, brand-fit, Novedades, Favoritos) entregada. Solo quedaron diferidos
  como feature futura (no deuda del rediseño): Colecciones/bundles curados y
  `content_flows.created_by` — requieren schema + tooling de curaduria + catalogo
  real. Si se retoman seran un FEAT nuevo.

- **FEAT-037 (Dashboard Tier-1)** — INDEXADA. Creada 2026-06-03, Fase 1 en curso.

---

## Resueltas / reclasificadas 2026-05-27

**Reconciliacion total docs/task vs codigo vivo.** Se auditaron las 29 tareas
listadas como activas + 3 deployed-pending verificando contra `js/` y la BD
(`tsdpbqcwjckbfsdqacam`).

- **FEAT-027 (Web Vitals dashboard)** — CODIGO HECHO. RPC `dashboard_web_vitals` +
  `DevWebVitalsView.js` + ruta `/dev/web-vitals` + link en nav dev. Solo falta
  verificacion visual en browser → movida a [`PENDING-HUMAN-VERIFICATION.md`](./PENDING-HUMAN-VERIFICATION.md).

- **OPS-011 (RLS hygiene)** — RESUELTA. Las 17 tablas `public` sin RLS quedaron en 0.
  Verificado contra `js/` + `functions/`: solo el frontend lee `trend_query_jobs`
  (con filtro org) y `comfy_flow_definitions` (catalogo global). Clasificacion aplicada:
  - **13 deny-all** (enable RLS, sin policy; solo service_role): `_bak_stuck_actions/missions_2026_05_05`,
    `external_api_cache`, `viral_predictions`, `emerging_patterns`, `lexicon_enrichment_runs`,
    `pending_downloads`, `classifier_blacklist`, `commercial_query_qualifiers`, `country_aliases`,
    `intent_classifier_rules`, `trends_category_templates`, `provocative_brand_exceptions`.
  - **2 backups extra** detectados (`content_subcategor*_bak_20260527`) → deny-all.
  - **comfy_flow_definitions** → enable RLS (ya tenia `comfy_def_read` SELECT USING(true)).
  - **trend_query_jobs** → enable RLS + nueva policy `trend_query_jobs_select` FOR SELECT
    `USING (is_developer() OR is_org_member(organization_id))` (patron canonico). Las 3
    policies demo-block de write seguian inertes por RLS off; ahora activas.
  - Los `_bak_stuck_*` (org data) ya no son leak. Drop opcional tras 2026-06-04.

- **DEBT-system-ai-outputs-run-id** — RESUELTA. `system_ai_outputs.run_id uuid` FK
  `flow_runs` ON DELETE SET NULL + indice; `living.js` (loadSystemAiOutputs select,
  `_detectSourceProductInfo` resuelve runId, `_runStandaloneKieOp` puebla run_id).
  Las ediciones standalone ya aparecen en el canvas run-scoped. Commit `73a48e00`.

- **7 verificadas COMPLETED y borradas** (el codigo ya hacia lo que el .md pedia):
  - **FEAT-007** — `MiBrandaDataService`/`StrategiaDataService` ya hacen 1 batch de RPCs paralelas + cache 60s.
  - **FEAT-008** — `CompetenciaDataService` y `TendenciasDataService` existen y rinden (12 + 7 RPCs).
  - **FEAT-011** — boton "Programar" en `StudioView.js:1225` inserta en `flow_schedules` (active/draft).
  - **FEAT-013** — `MonitoringView.js:397` CRUD completo de entities + URL watchers con diff SHA-256.
  - **FEAT-021** — `OrganizationView.js:1285` consulta `user_audit_log` con panel + filtros.
  - **FEAT-023** — `CampanasDataService` 5 RPCs + `MyBrands.mixin` KPI strip/winners/briefs + realtime.
  - **FEAT-026** — `Navigation.js:495` bell+badge+modal+dropdown consumiendo `org_notifications` via RPC.

- **9 movidas a [`PENDING-HUMAN-VERIFICATION.md`](./PENDING-HUMAN-VERIFICATION.md)**
  (codigo hecho, solo falta accion humana): FEAT-019, FEAT-020, FEAT-021b, FEAT-015,
  FEAT-017, OPS-007, CHARTJS_FORMAT_SUPPORT, BUG-004, SPRINT-FRONTEND-100.

- **4 reclasificadas como referencia** (no son tareas): AUDIT-003, AUDIT-004,
  FEAT-032-DISCOVERY, FEAT-032-INFORME.
