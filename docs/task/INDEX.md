# Index de tareas activas

Ordenado por severity desc → prioridad.
Cuando se cierra una tarea: eliminar el archivo Y la línea aquí.

Última actualización: **2026-05-22** (VERA v3 cobertura 26/26 cerrada — Fase A aliases + Fase B bloques 1/2/3. Fase C14 prompt cycle-pulse reescrito al canonical v3: 23/23 tools inyectadas + 3 movimientos + Reglas NUNCA + AUTONOMOUS_TOOLS 39. Bucket A billing fix deployed. Bug brands table parcialmente cerrado en brand.tools.js — falta brand-write.tools.js y context.builder.js. FEAT-019 + FEAT-020 + FEAT-021b siguen pendientes solo de activación externa / prueba humana E2E. **Cleanup docs/task/ (2026-05-22)**: 7 archivos eliminados sin deuda + 2 TODOs de codigo resueltos — BuilderPersistence.js (RPC `can_access_flow`) y FEAT-021 OAuth buttons (DemoGuard inline). **Round 2 cleanup**: FEAT-016 eliminado (DONE), AUDIT-001 y ROADMAP-POST convertidos a tasks formales (FEAT-026, OPS-012, FEAT-027, FEAT-028) y eliminados, FEAT-021-demo-preview renombrado a FEAT-021b para resolver colision de ID. 6 tasks "sueltas" agregadas formalmente al INDEX (FEAT-018, FEAT-025, CHARTJS_FORMAT_SUPPORT, fa-subset-regen + las 4 nuevas + FEAT-021b).

**Leyenda de columnas:**
- 🤖 = `auto_eligible: yes` — agente programado puede ejecutar sola en ventana 23:00–03:00 Bogota
- 👤 = `auto_eligible: no` — requiere humano (input, decisión, acceso externo, UX visible)
- ⏱ short (<30min) · medium (30-90min) · long (90min-3h)

## 🟣 Deployed pending external activation

Código en producción, falta acción humana o credenciales externas para cerrar.

| ID | Título | Bloqueante para cerrar | Commit |
|---|---|---|---|
| [FEAT-019](./FEAT-019-payment-gateway.md) | Pasarela de pago dual Stripe (USD) + Wompi (COP). Schema, 6 functions Netlify, BillingService, tab Facturación, seeds COP. Wompi sandbox validado E2E (pago $240k aprobado, webhook procesado, créditos sumados). | Cuenta Stripe + 2 env vars · Wompi producción cuando llegue | b7364115, d6a0004a, a9fd7af8, 6e73e713, 6579456d |
| [FEAT-020](./FEAT-020-auth-mfa.md) | MFA TOTP + magic link + revoke sessions. Migration `mfa_required` + RPC + VIEW aplicadas. UI tab Seguridad live. | 5 escenarios E2E en browser real con Authenticator | b9511e19 |
| [FEAT-021b](./FEAT-021b-demo-preview-public.md) | Demo `/demo` con anon auth + RLS + DemoGuard sobre IGNIS. TODO #3 (OAuth buttons) cerrado 2026-05-22. | Verificacion live post-deploy: entrar a `/demo`, validar 6 known limitations + abrir modal "Solicitar acceso" en Meta/Google/Shopify | (varios) |

## 🔴 Critical

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [SPRINT-FRONTEND-100](./SPRINT-FRONTEND-100-2026-05-06.md) | Sprint 14 días para exponer 100% del backend al usuario — entrega martes 26/05 (scope reducido: sin ActivityView ni HealthView) | feature | 👤 | long | — |

## 🟠 High

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [DATA-001](./DATA-001-configure-competitor-entities.md) | Faltan `intelligence_entities` competidoras → 4 tablas vacías + Apify gastando créditos en vacío | data | 👤 | short | — |
| [FEAT-015](./FEAT-015-cost-confirmation-pre-flight.md) | Pre-flight cost confirmation — heurística + confirm() en VeraView. Falta validación visual humana. | feature | 👤 | short | — |
| [FEAT-011](./FEAT-011-studio-programar-button.md) | Botón "Programar" en StudioView — desbloquea cadena schedule end-to-end | feature | 👤 | medium | — |
| [FEAT-012](./FEAT-012-user-provisioning-end-to-end.md) | Provisioning de usuarios end-to-end (función backend + email + onboarding) | feature | 👤 | long | — |
| [FEAT-017](./FEAT-017-content-feed.md) | Content Feed unificado — reescribir ContentView como feed estilo IA_Partner sobre `brand_posts` + `competitor_ads` + `intelligence_signals` (en progreso) | feature | 👤 | long | — |
| [AUDIT-003](./AUDIT-003-enterprise-readiness-2026-05-12.md) | Auditoría enterprise readiness — gap analysis front vs back vs SaaS B2B; matriz P0-P3 + 6 tasks hijas (FEAT-019/020/021/022, OPS-010/011) | audit | 👤 | short | — |
| [AUDIT-004](./AUDIT-004-premium-saas-tier1-brands-2026-05-13.md) | Premium SaaS readiness Tier-1 (Coca-Cola/Oster/Postobón) — Fase A (8-12 sem), Fase B (3-6m), Fase C (12m+) + bloqueos críticos (ai-engine SPOF, SSO, billing, CI gates, API pública) + costos $0-5K → $80-150K | audit | 👤 | short | — |
| [FEAT-021](./FEAT-021-audit-log-ui.md) | Panel de auditoría para admin del tenant — exponer `user_audit_log` (datos ya se escriben) | feature | 👤 | medium | — |
| [FEAT-022](./FEAT-022-rbac-granular.md) | RBAC granular — roles formales (owner/admin/editor/viewer) + matriz permisos + UI + invitaciones email | feature | 👤 | long | — |
| [OPS-010](./OPS-010-ci-gates-staging.md) | CI/CD — vitest gate en Netlify pre-deploy + staging branch separado de prod | ops | 👤 | medium | — |
| [FEAT-023](./FEAT-023-mis-campanas-dashboard.md) | Dashboard "Mis Campañas" (FEAT-023) — Ola 1 (backend+frontend) live: ad_insights_daily, sync Meta cron, 4 RPCs causales, mixin MyBrands con KPI strip + winners/burners + tabla + briefs. Ola 2 pendiente: pulse orgánico (15 dimensiones del director creativo) | feature | 👤 | long | — |
| [CHARTJS_FORMAT_SUPPORT](./CHARTJS_FORMAT_SUPPORT.md) | Soporte Chart.js en chat — codigo ya en `VeraView.js:776`. **Bloqueante: realizar pruebas manuales con Vera** (10 chart types, prompt incluido) | test | 👤 | short | — |
| [FEAT-018](./FEAT-018-notifications-rich-model.md) | Notifications rich model — Fase 1A definida, Fases 1B-1E pendientes (UI frontend del modelo rico) | feature | 👤 | long | — |
| [FEAT-026](./FEAT-026-notification-bell.md) | NotificationBell + inbox per-user en navbar (consumir `org_notifications` + `org_notification_user_state`). Backend listo, frontend no consume nada | feature | 👤 | medium | — |

## 🟡 Medium

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [FEAT-007](./FEAT-007-frontend-services-refactor.md) | Refactor services frontend para llamar 1 RPC por dashboard | feature | 👤 | medium | — |
| [FEAT-008](./FEAT-008-frontend-new-services.md) | Crear `TendenciasDataService` (Competencia ya existe) + render | feature | 👤 | long | — |
| [FEAT-013](./FEAT-013-monitoring-crud.md) | CRUD de sensores y URL watchers en MonitoringView | feature | 👤 | medium | — |
| [OPS-006](./OPS-006-meta-ad-library-diagnostico.md) | Meta Ad Library — decidir A (Meta App Review) / B (Apify actor) / C (pausar). Legacy fallback ya eliminado. | ops | 👤 | medium | — |
| [OPS-011](./OPS-011-rls-hygiene-review.md) | RLS hygiene — clasificar/activar las 13 tablas con RLS off (catalogos globales vs leak potencial) | ops | 👤 | short | — |
| [FEAT-025](./FEAT-025-mercadolibre-api-publica-fiche.md) | Ficha MercadoLibre via API publica — plan especificado, 5 tareas concretas sin checkmarks | feature | 👤 | medium | — |
| [OPS-012](./OPS-012-lexicon-review-admin.md) | UI admin de revision de lexicon (`dimension_lexicon` + `enrich_lexicon_proposal`). Backend listo, frontend no consume | ops | 👤 | medium | — |
| [FEAT-028](./FEAT-028-modal-migration.md) | Migrar ~20 modales custom a `window.Modal` (a11y consistente, mata duplicacion). Strategia: 3-5 modales por sesion | refactor | 👤 | long | — |

## 🟢 Low

| ID | Título | Tipo | 🤖/👤 | ⏱ | Owner |
|---|---|---|---|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales de Hetzner CCX33 | ops | 👤 | short | — |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot) | ops | 👤 | short | — |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | `supabase` CLI — instalar + link + baseline. Estructura `supabase/` ya creada. | ops | 👤 | short | — |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Backup del `.env` del ai-engine en secret manager (Supabase Vault) | ops | 👤 | medium | — |
| [OPS-007](./OPS-007-tokens-encryption-supabase-vault.md) | Cifrado global de tokens de integración (Meta/Google/Shopify) vía Supabase Vault | ops | 👤 | long | — |
| [BUG-004](./BUG-004-vera-chat-uso.md) | Verificar VeraView end-to-end (no es bug — auditoría backend OK, falta prueba humana) | test | 👤 | short | — |
| [fa-subset-regen](./fa-subset-regen.md) | Script `scripts/fa-subset.sh` para regenerar Font Awesome subset (pasos 1-4 documentados) | ops | 👤 | short | — |
| [FEAT-027](./FEAT-027-web-vitals-dashboard.md) | Web Vitals Dashboard UI (`/dev/web-vitals` con p75/p95 LCP/CLS/FCP/INP/TTFB). `webvitals.js` ya envia samples a `frontend_errors` | feature | 👤 | short | — |

---

**Total:** 26 tareas activas + 3 deployed pendientes activación (0 auto-eligibles 🤖 + 29 requieren humano 👤).

| Estado | Total | Auto-eligibles 🤖 | Requieren humano 👤 |
|---|---|---|---|
| 🟣 deployed pending | 3 | 0 | 3 |
| 🔴 critical | 1 | 0 | 1 |
| 🟠 high | 12 | 0 | 12 |
| 🟡 medium | 8 | 0 | 8 |
| 🟢 low | 8 | 0 | 8 |
| **Suma** | **29** | **0** | **29** |

## Movidas a "Deployed pending" el 2026-05-19

- **FEAT-019** — pasarela de pago dual Stripe + Wompi end-to-end. Schema en Supabase (`stripe_customers`, `stripe_invoices`, `stripe_webhook_events`, `wompi_customers`, `wompi_transactions`, `wompi_webhook_events`, columnas en `plans`/`credit_packages`/`subscriptions`). 6 Netlify functions: `api-billing-{checkout, portal, webhook, gateways}` + `api-billing-wompi-{checkout, webhook}`. `js/services/BillingService.js` con orquestación auto/Stripe/Wompi y modal selector. `PlanesView` y `CreditsShopView` con buttons cableados. Tab "Facturación" en `OrganizationView` con plan activo, próximo cobro, listado unificado Stripe+Wompi y botón Customer Portal Stripe. Seeds COP aplicados (Creator/Team/Agency + 4 packs). **Validado E2E en sandbox**: pago $240k aprobado, webhook procesado en 434ms, 500 créditos sumados a `organization_credits` (commits `b7364115`, `d6a0004a`, `a9fd7af8`, `6e73e713`, `6579456d`).
- **FEAT-020** — MFA TOTP + magic link + revoke sessions deployed 2026-05-18 (commit `b9511e19`). Falta solo prueba humana E2E con Authenticator real.

## Resueltas el 2026-05-22

- **VERA v3 cobertura 26/26 (100%)** — protocolo `VERA_AI-ENGINE_v3_Protocolo_Tecnico.docx` §04 cerrado en tres bloques:
  - **Fase A (aliases canonicos)**: 10/12 aliases registrados en `tool.dispatcher.js` TOOL_REGISTRY mapeando nombres v3 → handlers existentes (`getBrandDNA`, `getPendingBriefs`, `getFlows`, `getScraperStatus`, `updateBrandDNA`, `updateProduct`, `updateAudienceConcept`, `addCompetitorToMonitoring`, `triggerFlow`, `inspectRun`). `getMonitoringTargets` bumpeado a MISSING porque no existía canonical equivalente.
  - **Fase B bloque 1**: 6 tools MISSING implementadas en `vera-actions.tools.js` — `getMonitoringTriggers`, `pauseFlow`, `updateCampaignConcept`, `addKeywordToTrends`, `removeKeywordFromTrends`, `createDefensiveWatch`. Migración tabla `defensive_watches` aplicada via Management API.
  - **Fase B bloque 2**: `triggerDeepScrape` implementado bumpeando `priority` y `next_run_at` en `monitoring_triggers` (no invoca Apify directo; el scheduler lo agarra en ~5min). Smoke E2E con Liquid Death/IGNIS OK.
  - **Fase B bloque 3**: `getBrandHealthMetrics(bc?, org, windowHours?)` calcula engagement_avg + sentiment_score + fatigue_curve (4 buckets) + posting_rhythm sobre `brand_posts` propios (clamp [24h, 4380h]). `searchIntelligence({query, scope?, max_results?}, bc?, org)` con OpenAI `text-embedding-3-large` dim=1536 + RPC `match_ai_brand_vectors`/`match_ai_global_vectors` (cosine) + fallback ILIKE. Validados via `dispatchTool()` en IGNIS: 5/5 smoke cases pasan.
  - **Fase C tarea 14**: prompt `cycle-pulse-analysis` reescrito en `vera-brain-feed.service.js` al canonical v3. SKILL_CYCLE_PULSE (+2347 chars) con catálogo de 26 tools + sección "3 movimientos cuando ai-engine no puede" + 8 reglas NUNCA. `buildVeraPrompt` (+1776 chars) inyecta 23/23 tools v3 con sintaxis `[[TOOL:nombre|params]]` agrupadas en LECTURA/ESCRITURA/INTELIGENCIA ACTIVA/FLOWS+NOTIFS, prompt template 4938 chars (holgado vs 16KB CLI limit). `AUTONOMOUS_TOOLS` expandido de 11 a 39 entradas (incluye aliases v3 + canonicos legacy para soportar transición). Restart ai-engine limpio.
  - Total: 9 tools nuevas en `vera-actions.tools.js`, 10 aliases en TOOL_REGISTRY, schemas en `tool-call.validator.js`, ambas listadas en `tool-phases.js` PHASE_B_TOOLS, prompt cycle-pulse alineado al protocolo. Pendientes Fase C: C15 (fix parser `[[TOOL:...]]` para params con JSON anidado), C16 (E2E del Brain Feed con catálogo v3 en IGNIS), C17 (cierre de memoria).

- **Bucket A billing fix (vera chat)** — ai-engine + 3 Netlify functions (`api-products-generate-fiche`, `api-services-generate-fiche`, `api-places-generate-fiche`) ahora cobran fraccional via `use_credits_numeric` (1 cred = $0.10 → conversión decimal interna). Audit drift residual $0.99 (no refund, dentro de tolerancia). Modelo cambiado a 1 cred = $1 USD con `v_org_credits_display` + FLOOR; refund retroactivo 99.59 cr a IGNIS aplicado.

- **Bug brands table fix (parcial)** — 3 sites en `brand.tools.js` migrados de tabla legacy `brands` (no existe) a `brand_containers` + `audience_personas`. `getBrandProfile` / `getBrandDNA` / `getOrgOverview` funcionando E2E. **Falta**: 4 sites en `brand-write.tools.js` + 1 site en `context.builder.js`.

- **B1 multi-sesion descartado** — auditoría confirma que OpenClaw bridge SI respeta `sessionId` per request, no hay mezcla de contexto entre conversaciones distintas. B2 del roadmap Vera chat no aplica.

- **Cleanup docs/task/ Round 2 (2026-05-22)** — formalizacion de tasks sueltas para que aparezcan en el INDEX:
  - **3 archivos borrados**: `FEAT-016-tendencias-engine-refactor` (DONE 2026-05-21), `AUDIT-001-frontend-vs-backend` (items convertidos en FEAT-026 + OPS-012), `ROADMAP-POST-OPTIMIZATION-2026-05-12` (items convertidos en FEAT-027 + FEAT-028).
  - **1 archivo renombrado**: `FEAT-021-demo-preview-public.md` → `FEAT-021b-demo-preview-public.md` (resolver colision de ID con `FEAT-021-audit-log-ui.md`).
  - **4 tasks formales creadas**:
    - `FEAT-026` NotificationBell + inbox per-user (🟠 High, medium) — desde AUDIT-001 P1
    - `OPS-012` UI admin lexicon review (🟡 Medium, medium) — desde AUDIT-001 P4
    - `FEAT-027` Web Vitals Dashboard UI (🟢 Low, short) — desde ROADMAP-POST item 1
    - `FEAT-028` Modal migration ~20 archivos (🟡 Medium, long) — desde ROADMAP-POST item 2
  - **5 sueltas agregadas al INDEX** (existian como archivo pero no estaban listadas): `CHARTJS_FORMAT_SUPPORT`, `FEAT-018-notifications-rich-model`, `FEAT-025-mercadolibre`, `fa-subset-regen`, `FEAT-021b-demo-preview` (la ultima en 🟣 Deployed pending).
  - **Total: docs/task/ de 35 → 36 archivos** (mismo total nominal pero ahora todas las tasks reales aparecen en INDEX; activas suben de 23 → 29).

- **Cleanup docs/task/ Round 1 (2026-05-22)** — auditoria profunda de 15 archivos sospechosos contra el codigo vivo. Resultado:
  - **7 archivos eliminados sin deuda**: `AUDIT-005-fase1-bd-applied`, `AUDIT-005-fase2a-productivity-applied`, `AUDIT-005-fase2b-advanced-applied`, `AUDIT-005-fase2c-3-4-applied`, `AUDIT-005-builder-paas-readiness` (los 4 subhijos + el master doc), `FEAT-024-dev-rank-gradients`, `SESSION-IMPACT-2026-05-12`. Codigo verificado activo en repo.
  - **2 deudas obvias de codigo resueltas**:
    - `BuilderPersistence.js:89` TODO "Verificar si es colaborador" → ahora invoca RPC `can_access_flow(_flow_id)` (existente en BD desde Fase 1 AUDIT-005). Owner OR developer OR collaborator pueden cargar el flujo.
    - `FEAT-021` TODO #3 (OAuth buttons en demo): `startBrandIntegrationOAuth` y `disconnectBrandIntegration` en `InfoPanel.mixin.js` chequean `DemoGuard.isDemo()` antes del fetch a Netlify y abren el signup modal en vez de bloquearse silenciosamente.
  - **4 archivos actualizados con status claro para futuras sesiones** (en vez de re-investigar):
    - `FEAT-016-tendencias-engine-refactor` → DONE 2026-05-21 (cableado via `monitoring_triggers` sensor `trends_run`, no via systemd)
    - `CHARTJS_FORMAT_SUPPORT` → "Realizar pruebas manuales con Vera" (codigo en `VeraView.js:776`, falta validar los 10 chart types con prompt en Vera)
    - `AUDIT-001-frontend-vs-backend` → marcado historico + tabla de cobertura actual; gaps reales: `FEAT-026 NotificationBell` y `OPS-012 lexicon review` (sin task formal aun)
    - `ROADMAP-POST-OPTIMIZATION-2026-05-12` → marcado historico + items 1-2 pendientes con sugerencia de task formal (`FEAT-027 web-vitals-dashboard`, `FEAT-028 modal-migration`)

## Resueltas el 2026-05-18

- **BUG-003** — quota OpenAI ya no es problema. Verificado: `ai_brand_vectors` = 61 filas, `ai_global_vectors` = 90 filas, últimos 5 runs de `brand_indexer` en `sensor_runs` con `status=success` y `error_message=null`. El archivo del task estaba obsoleto desde la rotación de la key OpenAI del 2026-05-13.
- **AUDIT-002 H1** — bug histórico `tipo_producto_enum: "fisico"` ya no aplica. La columna `resource_type` fue removida del schema de `external_resource_map`; query `internal_id IS NULL` retorna 0 orphans. AUDIT-002 queda 100% cerrada (H2 y H3 ya estaban cerradas 2026-05-12).
- **Hetzner provisioner fixes (no estaba como task, pero relevante)** — 3 bugs cerrados en `/root/ai-engine/src/services/hetzner.provisioner.js`: (a) `ReferenceError: AI_ENGINE_URL is not defined` por template literal JS mal escapado, (b) `Hetzner API 422: invalid input in field 'user_data'` por exceder los 32 KB — refactor opción A: `anthropic-proxy/server.js` y `mcp/ai-engine-tools.js` movidos a endpoints `/internal/*.js` con auth `x-webhook-secret`, descargados via curl en setup.sh, y (c) race condition en `org-sync.service.js` que generaba 409 "server name is already used" — lock `_isRunning` per-proceso. Validación end-to-end: server #131677836 "vera-000000000001-ignis" (178.105.170.51, cx23, nbg1) completó cloud-init y respondió `/internal/server-ready` → DB `status=healthy`. Memoria persistida en `project_hetzner_provisioner_fixes_2026_05_18.md`.

## Resueltas el 2026-05-12

- **OPS-009** — fallback legacy `brand_colors.brand_id` eliminado en `OrgBrandTheme.js` (commit `ecd6df9`). Verificado contra `information_schema`: la columna `brand_id` ya no existe en el schema vivo, así que el path legacy era código muerto retornando error silencioso de PostgREST. Borrados `getBrandContainerIds()` entera + fallback `in('brand_id', ...)` + cache key `theme:containers:${orgId}`. Net: −50 líneas, sin migración de datos.
- **OPS-008** — escrituras zombi de `--brand-gradient-dynamic*` eliminadas en `BrandstorageView` y `BrandOrganizationView` (commit `ecd6df9`). `_refreshVisualChrome` ahora invalida cache `theme:colors:${orgId}` y llama `OrgBrandTheme.applyOrgBrandTheme(orgId)`. `grep -rn "setProperty.*--brand-gradient-dynamic" js/views/` → 0 matches; `OrgBrandTheme.js` es el único escritor.
- **BUG-005** — referencias legacy a `audiences`/`brands` resueltas en todos los sitios; último sitio cerrado en commit `8317ecf` (`devtest` migrado a `brand_colors.organization_id`).
- **FEAT-014** — proxy Anthropic con metering + cap. Código y schema ✅ desde 2026-05-05. **Hoy:** deploy via SSH manual era inviable (VMs piloto se provisionaban sin SSH key autorizada → `Permission denied (publickey)` desde cualquier máquina). Fix aplicado a `hetzner.provisioner.js` (commit `eb72a82` en ai-engine): inyecta `ssh_keys: [107329413]` en payloads `createOrgServer` y wake-from-snapshot. **VM piloto `vera-000000000001-org` (49.13.204.22) eliminada** via API Hetzner — era prototipo descartable. La próxima org-server provisionada nace ya con el proxy activo + SSH habilitado vía cloud-init.
- **AUDIT-002 H2** — git history establecido en ai-engine. Commit inicial `aef6701` con 202 archivos. `.gitignore` ampliado: excluye `.env.bak*`, `*.bak`, `**/.venv/`, `**/__pycache__/`, `backups/`. Sin remote configurado (decisión pospuesta).
- **AUDIT-002 H3** — 21 archivos `.bak` eliminados (2 `.env.bak.*` con secrets viejos, 18 `src/*.bak.*` de deploys previos, 1 `backups/cloudflare-tunnel-credentials.json.bak` duplicado de la credencial viva en `/root/.cloudflared/`). H1 (orphans `external_resource_map`) sigue abierto.

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
