# Index de tareas activas

Ordenado por severity desc. Cuando se cierra una tarea: eliminar el archivo Y la
linea aqui. Las que solo esperan accion humana viven en
[`PENDING-HUMAN-VERIFICATION.md`](./PENDING-HUMAN-VERIFICATION.md).

**Ultima actualizacion: 2026-09-10** — sesion de seguridad. Todo lo de abajo se
midio EJECUTANDO contra la base viva y la config de Auth, no leyendo `SQL/`.

- ✅ **SEC-001 CERRADA.** Las 11 RPCs del panel `/dev` auditadas. Las dos que
  preocupaban (`admin_create_organization`, `soft_delete_organization`) **si**
  validan `is_lead()` por dentro. La unica sin guarda era `bind_comfy_flow`
  —ya la tiene—. Las 11 tienen `SET search_path`.
- 🔴→✅ **El agujero real no estaba en las tablas: estaban en las FUNCIONES.**
  33 funciones `SECURITY DEFINER` que ESCRIBEN, sin guarda, ejecutables **con la
  sola llave publica y sin sesion** (creditos incluidos). Hoy: **0**.
  Ver SEC-002 para la trampa: el permiso lo tenia `PUBLIC`, no `anon`, y el
  primer `REVOKE ... FROM anon` fue un **no-op que no fallo**.
- ✅ `TRUNCATE` para `anon`/`authenticated`: 215/218 → **0/0**.
- ✅ `flow_runs` y `runs_outputs` tenian el INSERT con `WITH CHECK (true)`. Cerrado.
- ⚠️ **La raiz tiene DOS dueños y solo se pudo cerrar uno**: los default
  privileges de `supabase_admin` rechazan el cambio (`42501`). Todo objeto nuevo
  que cree ese rol sigue naciendo con `EXECUTE` para `anon`.
- 🟠 **SEC-005 avanzo**: `staff_audit_log` tenia 0 filas porque tenia UN solo
  escritor. La **impersonacion no dejaba rastro**. Ya lo deja.
- 🟡 **FEAT-018: el "cierre rapido" del INDEX era falso.** El UPDATE de 48 filas
  no habria cambiado nada: el render plano ignoraba `metadata.label`. Resuelto
  en el frontend, sin tocar la base.
- 🔒 **SEC-003 sigue abierta y es DECISION DE PRODUCTO**: cerrar el registro
  rompe `SecretSignupView` y el fallback de `DemoEntryView`. Se resuelve junto
  con FEAT-012. MFA: **0 factores verificados en toda la base** — exige que un
  humano escanee el QR.
- 📉 Contexto que baja el riesgo: la base tiene **3 usuarios** en total y **0**
  sesiones anonimas creadas nunca.

**Ultima actualizacion previa: 2026-07-03** — reconciliacion de reorganizacion documental.
Se indexaron 5 tareas de junio que existian en `docs/task/` pero faltaban en este
INDEX (FEAT-037-tag-productions, FEAT-038, FEAT-040, AUDIT-i18n-mobile; +FEAT-041
CERRADA → movida a `docs/archive/`). Se documentaron 2 colisiones de numero:
**FEAT-037 (×3)** = `centro-de-mando-dev-deploy` (probable cerrada) + `dashboard-tier1-gap-closure`
(en curso) + `tag-productions-to-strategy` (Fase 2 pendiente); **FEAT-036 (×2)** =
`kie-rate-governor` + `billing-console` (ambas activas). Renumerar es riesgoso
(cambia identidad/historial) → se deja la colision documentada, no renumerada. Los
4 docs de referencia se movieron a `docs/task/reference/`.

**2026-06-03** — barrido de cierre. Se eliminaron 3 tareas
(FEAT-035 roles/permisos: enums confirmados en BD; FEAT-035 flows-market: rediseño
entregado; AUDIT-005: deuda DB aplicada en lo sustantivo — seguridad + indices),
se indexo FEAT-037 (dashboard Tier-1, en curso) y BUG-005 (residuo de AUDIT-005:
indice vectorial sin uso). Ver "Resueltas / reclasificadas" al final.

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

## ⚡ Rapido de cerrar (revisado 2026-09-10)

| Que | Estado |
|---|---|
| ~~Cerrar las 6 tablas sin RLS~~ | ✅ **Ya estaba hecho el 09/09.** Las 206 tablas tienen RLS. |
| ~~FEAT-018 backfill `metadata.label`~~ | ✅ **Era un no-op.** El render plano no leia esa etiqueta. Resuelto en el frontend. |
| ~~Borrar las tablas de respaldo~~ | ⏸️ **DECIDIDO 2026-09-10: se dejan quietas.** Las 5 (1.448 filas) ya NO estan expuestas —tienen RLS—. Deja de contar como pendiente; si algun dia estorban, `brand_posts_classifier_backup_20260716` (1.182), `content_subcategory_categories_bak_20260527` (169), `content_subcategories_bak_20260527` (48), `_bak_stuck_missions_2026_05_05` (46), `_bak_stuck_actions_2026_05_05` (3). |
| MFA a los 2 leads | 🔴 **Solo humano.** Hay que escanear el QR del TOTP. 0 factores verificados en toda la base. |
| Actualizar/cerrar DATA-001 y OPS-006 | 🟡 Su premisa cayo. Sigue pendiente reescribirlas o cerrarlas. |
| `password_min_length` 6 → 12 | 🟡 No rompe cuentas existentes. Un PATCH a la config de Auth. |

---|---|---|
| Cerrar las 6 tablas sin RLS | `ALTER TABLE ... ENABLE RLS` + `REVOKE ... FROM anon` + 2 policies. El SQL esta escrito y verificado; solo una tabla (`brand_cmo_brief`) la lee el frontend, las otras 5 tienen **cero** usos en `js/`+`functions/`. | 🔴 hacer ya |
| Borrar 3 tablas de respaldo | `brand_posts_classifier_backup_20260716` (1.182 filas, **expuesta a anon**), `_bak_stuck_missions_2026_05_05` (46), `_bak_stuck_actions_2026_05_05` (3). De mayo y julio; nadie las lee. | 🟠 |
| FEAT-018 backfill `metadata.label` | Un UPDATE sobre 48 filas de `org_notifications`. El render ya existe. | 🟡 |
| MFA a los 2 leads | La maquinaria de MFA ya esta construida (FEAT-020). Es activarla en dos cuentas. | 🔴 |
| Actualizar/cerrar DATA-001 y OPS-006 | Su premisa ya no es cierta; o se reescriben sobre datos de hoy o se cierran. | 🟡 |

---

## 🔴 Critical — falta construir

| ID | Que falta EXACTAMENTE |
|---|---|
| [FEAT-036](./FEAT-036-kie-rate-governor-and-queue.md) | Governor de tasa KIE: limite real 20 createTask/10s POR CUENTA y 429 NO encola (= job perdido en picos). **Fase 1 CERRADA 2026-05-29**: token bucket Postgres + Path A (6 funciones Netlify, commit 6463f55a) + Path B (comfy-flow-runner cuenta nodos KIE_* y reserva tokens). Riesgo confirmado real (1 flow = 6 nodos KIE × 5 concurrentes = 30 > 20). Pendiente: observabilidad de throttle + Fases 2-4 (foreground>background, cola unificada con prioridad por plan, turbo por plan). |

## 🟠 High — falta construir

| ID | Que falta EXACTAMENTE |
|---|---|
| [SEC-002](./SEC-002-barrido-rls-grants-toda-la-base.md) | 🟠 **NUCLEO CERRADO 2026-09-10** (33 funciones sin guarda ejecutables sin sesion → 0; TRUNCATE → 0; policies `true` → 0). Queda: default privileges de `supabase_admin` (no se pueden cambiar desde este acceso) y los grants de escritura de `anon` sobre 215 relaciones (**no exponen: RLS activo**). Historico: (2026-09-09): 6 tablas con RLS apagado y grants a `anon` incluido TRUNCATE; 3 devuelven datos reales de cliente con la llave publica. Ver el encabezado. Son **206** tablas, no ~150. Barrido de RLS+grants (solo se miraron 22). Los 2 fallos hallados fueron **sistemicos**: GRANT UPDATE sobre columnas de privilegio, y policies "de bloqueo" creadas PERMISSIVE que **conceden** (se suman con OR). Buscar tambien UPDATE sin `WITH CHECK` y `USING (true)`. Verificar simulando el rol, no leyendo `SQL/`. **Programado: esta semana.** |
| [SEC-003](./SEC-003-perimetro-identidad-signup-mfa.md) | 🔒 **MEDIDO 2026-09-10 · es DECISION DE PRODUCTO, no un ajuste.** `disable_signup=False` sigue. Cerrarlo **rompe** `SecretSignupView` (usa `auth.signUp()`) y el fallback de `DemoEntryView` → **se resuelve junto con FEAT-012** (invitation-only vs autoservicio). MFA: **0 factores verificados en toda la base** — exige que un humano escanee el QR. Contexto: 3 usuarios en total, 0 sesiones anonimas creadas nunca. Sin romper nada se puede: `password_min_length` 6→12. |
| [FEAT-022](./FEAT-022-rbac-granular.md) | RBAC formal owner/admin/editor/viewer: matriz de permisos + audit de RLS policies + UI + transfer ownership. Hoy solo hay selector de rol suelto. |
| [FEAT-018](./FEAT-018-notifications-rich-model.md) | Modelo rico de notifs. **La mitad de la etiqueta se cerro 2026-09-10** (mapa tipo→label traducible en ambos renderers; el backfill que prometia el INDEX era un no-op). Falta lo que de verdad vale: **backend que escriba metadata rica** (`summary`/`subject`/`checklist`/`actions`) al crear la notificacion — hoy 49 de 50 se renderizan planas porque no hay nada rico que renderizar. |
| [FEAT-031](./FEAT-031-dev-portal-iteration-2026-05-22.md) | Backend ai-engine: B1 endpoint `POST /api/vera/train` (vectoriza file/prompt/image en `ai_global_vectors`); B2 extender edge function `provision-user-start` para guardar `new_brand_name_oficial`/`slogan`/`logo_url`. Frontend ya cablea ambos. |
| [FEAT-037](./FEAT-037-dashboard-tier1-gap-closure.md) | Dashboard Tier-1 gap closure. **Fase 1 HECHA** + **Fase 2 #4 HECHA** (2026-07-06, commit 3416f096: drill-down completo de competidor en el drawer — distribuciones/horas/actividad) + **Fase 2 #7 HECHA** (2026-07-06: DROP de 10 RPCs legacy/superseded + dedup overload `mimarca_health`; inventario 84→74). Falta Fase 2 #5 (Estrategia: hashtags/platform_comparison/sentiments_by_brand), #6 (Mi Marca: 7 RPCs), superficies `featured`/`search`, y Fase 3 (export/alertas/reportes). 21 huerfanas-a-cablear restantes. Todo lo hecho falta QA visual humano. ⚠ Colision de numero FEAT-037 (ver encabezado). |
| [FEAT-037-tag](./FEAT-037-tag-productions-to-strategy.md) | Taguear producciones al contexto de estrategia (`flow_runs`=fuente de verdad; `runs_outputs` hereda). **Fase 1 desplegada** (2026-06-24). Falta Fase 2: capturar brief/campaign en el disparo (Studio form / Vera tool / scheduled). Desbloquea FEAT-038. ⚠ Colision FEAT-037. |
| [FEAT-038](./FEAT-038-production-satellites-canvas.md) | Satelites de produccion/publicacion en canvas. PENDIENTE — bloqueado por FEAT-037-tag (necesita el tagging de producciones a estrategia). |

<!-- FEAT-040 CERRADA 2026-07-06: comentarios propios verificados en prod (87 filas source=meta_api en brand_post_comments); D (reception) cableado — RPC dashboard_brand_post_reception existe en BD y la consume CampanasDataService. Ver "Resueltas 2026-07-06". -->
<!-- FEAT-018-related: reception RPC ya vive; ver seccion Medium. -->

## 🟡 Medium — falta construir

| ID | Que falta EXACTAMENTE |
|---|---|
| [SEC-004](./SEC-004-migrar-panel-dev-a-repo-propio.md) | 🔒 Migrar las **22 vistas** de `/dev/*` (~26k JS + ~15.7k CSS) a repo propio `AISC-Admin`, copia fiel, con **Cloudflare Access delante** (SSO+MFA antes de servir el HTML = la frontera real). Codigo compartido: copia propia, ni npm ni submodulo. **Paso 1 EJECUTADO 2026-08-07** (repo `AISC-Admin` creado); siguen 19 vistas dev en console. **Va DESPUES de SEC-001 y SEC-002** — mover el panel con el canal directo sin auditar es mudar la puerta dejando la pared abierta. Al final: borrar `/dev/*` de console. |
| [SEC-005](./SEC-005-regimen-permanente-staff.md) | 🔒 **AVANZO 2026-09-10.** `staff_audit_log` tenia 0 filas porque tenia UN solo escritor: la **impersonacion no dejaba rastro**. Ya lo deja (`lead-switch-user`, `admin-consumers`, `admin-update-brand`; helper compartido en `_shared/lead-auth.ts`). Falta: **UI para leerla** (va con SEC-004), **test de regresion de seguridad en CI** (hoy `ci.yml` solo corre eslint+vitest), y el rol de staff con minimo privilegio (`lead` sigue siendo super-admin unico). |
| [PERF-001](./PERF-001-cleanup-optimization.md) | Limpieza+optimizacion. HECHO en rama `perf/cleanup-optimization` (perf glass/animaciones, 3 bugs runtime, -825 lineas muertas, command-center.css route-split + infra `_loadCss`). PENDIENTE QA visual: route-split del resto del CSS (developer.css 351KB con class-moves + mapa de inyeccion verificado), consolidar escapeHtml (seguridad), `.card` glass->solido, keyframes, z-index tokens, dividir monolitos. |
| [FEAT-036](./FEAT-036-billing-console.md) | Billing console `/dev/lead/billing`. Fase 1 cerrada (Plans CRUD BD + Credit Packages CRUD completo sobre `credit_packages`). Pendiente Fase 2 (Subscriptions + Usage history) y Fase 3 (auto-sync Stripe/Wompi al editar precio). |
| [FEAT-028](./FEAT-028-modal-migration.md) | Migracion de modales a `window.Modal`. **Ad-hoc de bajo riesgo = HECHO** (12 migrados). Lo que resta son SOLO los diferidos-con-justificacion: persistentes-toggle en tooling dev core (DevWebhooks/DevTest/DevBuilder), Settings/Navigation chrome global — ya tienen role/aria-modal/ESC, refactor de lifecycle de alto blast radius que el doc marca "NO migrar a ciegas". Requiere sesion dedicada CON validacion en browser, no es limpieza mecanica. Decision pendiente: cerrar alcance a "ad-hoc" y borrar, o agendar sesion browser. |
| [FEAT-029](./FEAT-029-brand-creative-brief-rebalance.md) | Fase 1 cerrada (caps + IGNIS limpiado). Falta Fase 2b (validacion server-side de hard caps en `InfoPanel.mixin.js` saveBrandContainerFieldById + generador de brief con LLM cheap) y Fase 3 (schema redesign formal). No urgente. |
| [FEAT-025](./FEAT-025-mercadolibre-api-publica-fiche.md) | **BLOQUEADA-EXTERNO** (verificado 2026-05-27): la API de ML ya no es publica, devuelve 403 `PA_UNAUTHORIZED` sin token. Requiere registrar app ML + OAuth, o seguir con scrape HTML + headless. Decision de producto pendiente. |
| [FEAT-030](./FEAT-030-n8n-flow-output-semantics.md) | BD ya parchada (2026-05-23); falta tocar el flow IGNIS en n8n: renombrar `copys`->`scene_prompt` y agregar `post_copy`/`post_hashtags`. Owner: equipo n8n (herramienta externa). |
| [FEAT-032](./FEAT-032-comfyui-flows-publishing.md) | Build del comfy-kie-adapter: `parser.js` + `resolver.js` + `orchestrator.js` + executors en ai-engine + POC con flow IGNIS. Discovery cerrado 2026-05-23. |
| [FEAT-033](./FEAT-033-comfy-flow-bridge.md) | Puente orquestacion ComfyUI ai-engine<->content-flows: migracion tabla `comfy_flow_jobs` + `comfy-flow-runner.service.js` + pool de N workers en content-flows. Diseño aprobado 2026-05-25. |
| [FEAT-012](./FEAT-012-user-provisioning-end-to-end.md) | Provisioning end-to-end: requiere decision de producto (invitation-only vs autoservicio) + email sender (Resend). 3 endpoints hardcoded inexistentes en `DevLeadUserProvisioningView`. |
| [AUDIT-i18n](./AUDIT-i18n-mobile-2026-06-16.md) | Auditoria de i18n y responsive movil del frontend. Referencia/diagnostico; no accionable como una sola tarea. |
| [OPS-006](./OPS-006-meta-ad-library-diagnostico.md) | ⚠ **PREMISA CAIDA (2026-09-09)**: `competitor_ads` ya NO esta vacia (**98 filas**). La decision path A/B/C se tomo de hecho, no en el doc. Verificar por que via entran y cerrar. Decision estrategica. |
| [OPS-012](./OPS-012-lexicon-review-admin.md) | 🛑 **CHOCA CON SEC-004 — no construir en console.** Medido: `dimension_lexicon` 215 filas, `enrich_lexicon_proposal` no existe, la vista sigue siendo shell. Pero SEC-004 quiere SACAR las 19 vistas `/dev/*`: añadir la vista 20 es sumarle trabajo a esa migracion y nacer del lado inseguro. Decidir: construirla en `AISC-Admin`, o congelarla hasta que SEC-004 termine. |
| [OPS-010](./OPS-010-ci-gates-staging.md) | ✅ **FASE 1 HECHA 2026-09-10**: `netlify.toml` corre `npm run test:gate` antes de construir — si un test falla, el deploy **aborta**. Son los 440 tests HERMETICOS; se excluyen `endpoints`/`rls`/`rpcs` a proposito (salen a la red: colgar el deploy de un tercero impide publicar hasta el hotfix). Falta Fase 2: branch `staging` + proyecto Supabase de staging. ⚠️ Ojo: proteccion de rama que exija PR **rompe** la regla de autopush a `main`. |
| [OPS-003](./OPS-003-supabase-cli-migrations.md) | ⚠️ **El bloqueador escrito es FALSO**: el CLI **si** esta instalado (`/usr/local/bin/supabase`). Falta solo **la contraseña de la base** (no esta en ningun `.env` local). Es **una accion humana de 30s** (Dashboard → Settings → Database) y despues `supabase link` + `db dump`. No se fabrico un baseline a mano: uno reconstruido a medias parece fuente de verdad y no lo es. |
| [OPS-005](./OPS-005-secrets-backup-strategy.md) | Decision pendiente (A/B/C), **no es mecanica**: la opcion B exige leer `/root/ai-engine/.env` por SSH y mover 27 secretos criticos. Riesgo no escrito antes: ese `.env` es **el unico lugar** donde viven algunos valores **y esa VM no tiene snapshots** (OPS-001). Son el mismo riesgo; **OPS-001 es mas barata y va primero**. |
| [DATA-001](./DATA-001-configure-competitor-entities.md) | ⚠ **PREMISA CAIDA (2026-09-09)**: hoy hay **37** `intelligence_entities`, `competitor_ads` tiene **98** filas y `visual_references` **2**. Solo `retail_prices` sigue en 0. Reescribir la tarea sobre lo que de verdad falta o cerrarla. Configurar competidores reales con dominio/target valido (depende en parte de OPS-006). Requiere input del usuario sobre que marcas. |

## 🟢 Low — falta construir (infra, no verificable desde el repo)

| ID | Que falta EXACTAMENTE |
|---|---|
| [OPS-001](./OPS-001-hetzner-snapshots.md) | Configurar snapshots semanales del CCX33 en consola Hetzner. |
| [OPS-002](./OPS-002-uptime-monitor-external.md) | Uptime monitor externo (Better Stack / UptimeRobot). |

---

## 📄 Referencia (no son tareas accionables)

Documentos de auditoria/discovery/diagnostico que informan trabajo pendiente; se
conservan como referencia, no se ejecutan directamente.

- [AUDIT-003](./reference/AUDIT-003-enterprise-readiness-2026-05-12.md) — gap analysis enterprise readiness (roadmap/decisiones).
- [AUDIT-004](./reference/AUDIT-004-premium-saas-tier1-brands-2026-05-13.md) — premium SaaS Tier-1 (Fase A/B/C + costos).
- [FEAT-032-DISCOVERY-PFA-vs-SAUL](./reference/FEAT-032-DISCOVERY-PFA-vs-SAUL.md) — discovery PFA vs workflow Saul (soporte de FEAT-032).
- [FEAT-032-INFORME-DIRECTOR-CREATIVO](./reference/FEAT-032-INFORME-DIRECTOR-CREATIVO.md) — diagnostico de 14 obstaculos ComfyUI (soporte de FEAT-032/033).

---

## Resueltas / reclasificadas 2026-07-07

- **DATA-002 (hashtags en posts propios)** — RESUELTA y borrada. Causa: la ingesta
  own no extraia `#tags` del texto (0/250 en toda org). Fix en los 2 caminos:
  Netlify `api-brand-sync-meta.js` (`extractHashtags` deterministico en FB+IG,
  insert+patch) y ai-engine `social.tools.js`/`social-scraper.service.js`
  (`fetchOwnPostsPage` normalizers + `persistOwnPosts` row+update; desplegado y
  commiteado en server, commit e36f74b). Backfill de 159 posts historicos
  (extraccion con el MISMO JS). Verificado IGNIS: `dashboard_estrategia_hashtags`
  devuelve datos reales (brandsthatnourish, madeincolombia, branding...). Desbloqueo
  FEAT-037 #5 hashtags → widget "Hashtags que funcionan" cableado en Mi Marca.

## Resueltas / reclasificadas 2026-07-06 (barrido deuda "grupo verde")

- **FEAT-040 (comentarios posts propios)** — CERRADA y borrada. Verificado en prod:
  `brand_post_comments` tiene 87 filas `source='meta_api'` (recoleccion automatica
  por el sensor `meta_posts` de ai-engine + sync Netlify). Componente D (recepcion):
  la RPC `dashboard_brand_post_reception` EXISTE en BD y la consume
  `CampanasDataService.js` con los params del spec (`p_min_comments`, etc.); las RPCs
  `dashboard_brand_comment_risk` y `dashboard_mimarca_comments` tambien existen. Nada
  pendiente de codigo.

- **FEAT-034 (boton "Probar flujo")** — CERRADA y borrada. `testFlow()` en
  `DevFlowsView.js` ya no es stub: navega a `/dev/builder?flow={id}&test=1` y el
  builder auto-abre su modal de prueba real (`showTestModal`, runner contra
  `webhook_url_test`). Se reusa el runner existente en vez de un segundo camino de
  ejecucion. Sin TODO/console.log restantes. `checkUrlParams()` lee `test=1` →
  `autoOpenTest`; `init()` dispara el modal tras cargar el flujo.

- **BUG-005 (indice vectorial dormido)** — RESUELTA (root cause distinto al
  hipotetizado). Causa real: el indice era `ivfflat vector_cosine_ops` pero las 2
  RPCs (`match_ai_brand_vectors*`) ordenaban por `<->` (L2), no `<=>` (coseno) → el
  planner NUNCA podia usar el indice (opclass ≠ operador), independiente del tamaño
  del corpus. Ademas `lists=100` sobre 147 filas estaba mal dimensionado. FIX
  aplicado: migrado a `hnsw vector_cosine_ops` (autoajustado, apto para corpus chico)
  + alineadas ambas RPCs a `<=>`. Embeddings OpenAI 1536 normalizados → ranking
  identico, sin cambio de comportamiento. (`track_functions=none` explica el
  `pg_stat_user_functions` vacio; no era evidencia de "nunca se llama".)

- **Limpieza:** borrados 2 duplicados de Finder huerfanos (gitignored, no trackeados,
  sin referencias): `js/components/ColorPickerModal 2.js`, `js/views/CreditsShopView 2.js`.

- **FEAT-028 (modales)** — reclasificada al estado real: los ad-hoc de bajo riesgo
  estan migrados; lo que resta son solo los diferidos-con-justificacion (alto riesgo,
  requieren browser). No es "grupo verde". Ver linea en Medium.

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

- **AUDIT-005 (deuda DB)** — RESUELTA en lo sustantivo y borrada. Aplicado a BD:
  S1 (56 fn definer -> search_path fijo), S3 (13 vistas invoker + RPC
  `get_org_server_status` con gate + revoke; `v_user_mfa_status` se deja definer
  self-scoped), P1 (15 indices duplicados dropeados), P3 (17 indices FK en tablas
  calientes). Diferido: P2 (indices `idx_scan=0` — no dropear en BD joven) se
  extrajo a [BUG-005](./BUG-005-semantic-search-vector-index-unused.md); Bloque 3
  limpieza (backups con gate 2026-06-04, vacias, naming) sin valor de tracking.
  Audit completo + queries reproducibles viven en git history.

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
