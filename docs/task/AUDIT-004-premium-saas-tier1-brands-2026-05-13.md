---
id: AUDIT-004
title: Premium SaaS readiness para marcas Tier-1 (Coca-Cola, Oster, Postobón) — análisis estratégico multi-tenant + escalabilidad
severity: high
type: audit
status: open
auto_eligible: no
auto_eligible_reason: requiere decisiones estratégicas (target client tier, arquitectura ai-engine, compliance budget, pricing)
est_duration: short
created: 2026-05-13
related:
  - AUDIT-003-enterprise-readiness-2026-05-12.md (auditoría enterprise base)
  - AUDIT-001-frontend-vs-backend-2026-05-05.md
  - SPRINT-FRONTEND-100-2026-05-06.md
  - FEAT-019-payment-gateway.md
  - FEAT-020-auth-mfa.md
  - FEAT-021-audit-log-ui.md
  - FEAT-022-rbac-granular.md
  - OPS-010-ci-gates-staging.md
  - OPS-011-rls-hygiene-review.md
---

# AUDIT-004 — Premium SaaS readiness para marcas Tier-1

> **Fecha:** 2026-05-13 · Trigger: análisis estratégico solicitado por dirección — "¿cuándo es AI Smart Content vendible a una marca tipo Coca-Cola, Oster, Postobón?" · Org única en producción: IGNIS (demo ficticia) · 1 user · 430 brand_posts · 19 intelligence_entities

Este documento extiende `AUDIT-003` con un análisis estratégico de qué falta para vender AI Smart Content como **infraestructura de marca** a clientes Tier-1 (multinacionales y marcas premium regionales), no como herramienta SaaS de uso general.

La diferencia importa: una herramienta SaaS se vende a $50-500/mes/seat con flujo de adquisición self-serve. Una **infraestructura de marca** se vende a $5K-200K/año con ciclo enterprise, RFPs, security questionnaires, DPAs, y un único punto de falla mata el contrato.

---

## 0. TL;DR — Tres horizontes

| Horizonte | Cliente target | MRR target | Tiempo | Inversión estimada |
|---|---|---|---|---|
| **Fase A** | Oster Colombia, marcas medianas LatAm, agencias boutique | $5K-15K MRR | 8-12 semanas | $0-5K (solo dev time) |
| **Fase B** | Postobón, Bavaria, Oster Internacional, retailers mid-market | $30K-100K/año por cliente | 3-6 meses adicionales | $15K-40K (pen test + Stripe + infra) |
| **Fase C** | Coca-Cola FEMSA, Femsa, Unilever, multinacionales | $200K+ /año por cliente | 12+ meses | $80K-150K (SOC 2, compliance, redundancia) |

**Estado al 2026-05-13:** se está cerrando Fase A. Fase B requiere decisión estratégica antes del 2026-06-15 sobre target cliente. Fase C es planning, no execution.

---

## 1. Foto realista del stack al 2026-05-13

| Capa | Estado vivo | Veredicto enterprise |
|---|---|---|
| **Postgres / Supabase** | 134 tablas · 199 funciones · 153 RLS policies · 8 mat-views · pgvector · pg_cron · Vault instalado · AES-256-GCM tokens · `user_audit_log` poblándose con IP/UA/request_id | ✅ **Nivel vendible.** Lo más maduro del stack. |
| **Multi-tenancy lógico** | `organizations` → `brand_containers` (sub-marcas regionales) → `products`/`brand_entities`/`services` org-scope. Feature flags por org (`organization_features` + `org_has_feature()`). Storage tracking por plan vía triggers. | ✅ Modelo sólido. Pensado para Coca-Cola Andina vs Coca-Cola FEMSA como `brand_containers` distintos bajo una misma `organization`. |
| **Frontend SPA** | Vanilla JS · ~41.5K LOC · 40 views · 11 services · auto-deploy Netlify desde `main` · cache busting `?v=__BUILD_ID__` · Service Worker · Web Vitals samples · routing `/org/:orgIdShort/:orgNameSlug/...` | 🟡 Funciona, expone **~40%** del backend. Tabs Tendencias y Estrategia desactivados (`TABS_ENABLED.tendencies=false`, `TABS_ENABLED.strategy=false`). Sprint `SPRINT-FRONTEND-100` ataca esto. |
| **Edge layer** | 30 Netlify Functions · ~6.5K LOC (OAuth Meta/Google/Shopify · OpenAI · KIE/Kling video · webhooks) | 🟡 Aceptable como capa de integración. **No es API pública.** |
| **ai-engine (Hetzner CCX33)** | El "cerebro": worker FastAPI + scrapers Apify + Vera strategist Opus 4.7 + 30+ endpoints REST + job worker + threat-detector + brand-indexer + mission-generator + action-executor | 🔴 **Multi-tenant SPOF.** Una sola VM. Sesión global de scraping. Un ban en una cuenta tumba a todos los tenants. |
| **Auth** | Email + Google OAuth · 2 providers · 1 user en prod · sin MFA · sin SSO · sin SCIM · sin session policies | 🔴 **Bloqueante de procurement** para marcas >50 seats. |
| **Billing** | Schema completo (`plans`, `subscriptions`, `credit_packages`, `credit_usage`) · 5 tiers Phase 1 (Free/Creator/Team/Agency/Enterprise) · cancel flow · página Credits real | 🔴 **Stripe es placeholder.** `CreditsShopView.js:184` literal: `// Placeholder: integrar con pasarela de pago`. |
| **Observabilidad** | `frontend_errors`, `developer_logs`, `system_metrics`, `provisioning_events`, `integration_webhooks_log` — todos se escriben. Web Vitals samples vivos. | 🟡 Datos sí, **paneles no**. Sin Sentry/Datadog. Sin uptime externo. Sin status page pública. Sin alertas on-call. |
| **CI/CD** | Push a `main` → producción · vitest existe (smoke RLS+RPCs+endpoints) no es gate · sin staging · `supabase/migrations/` vacío | 🔴 **No es enterprise-grade.** Un commit malo = caída en vivo sin rollback fácil. |
| **Datos sensibles** | AES-256-GCM en tokens at rest (P0 cerrado 2026-05-08) · `user_audit_log` con IP/UA/request_id/action poblándose · webhook replay window · función `delete_all_app_data` (GDPR) | ✅ Pasarías security questionnaire básica. |
| **Compliance** | Privacy Policy + ToS + DataDeletion pages · `SECURITY.md` | 🟡 Suficiente para SMB, insuficiente para procurement Tier-1. Sin DPA, sin SOC 2, sin pen test, sin sub-processors list, sin cookie consent. |

---

## 2. Los 5 bloqueos críticos para vender a una marca Tier-1

Estos son los que matan la venta. No son "nice to have".

### 🔴 Bloqueo 1 — ai-engine como SPOF multi-tenant

Es el **riesgo arquitectónico más grande**. Una sola VM Hetzner CCX33 corre scrapers + análisis + Vera para todos los tenants con sesión de scraping compartida. Para una marca Tier-1 esto es inviable:

- **Blast radius compartido:** un ban de Meta a la cuenta scraper tumba a todos los clientes simultáneamente.
- **Sin aislamiento por tenant:** un cliente con 50 marcas configuradas degrada performance al resto.
- **Sin failover real:** la VM cae → toda la plataforma cae → contrato roto.
- **SLA imposible:** no se puede comprometer 99.9%+ uptime sobre un solo nodo.
- **Documentado en memoria:** `project_aiengine_multitenant.md` — "sesión global de scraping = SPOF para todos los tenants; ban en una cuenta tumba a todos".

**Lo que necesita la arquitectura:**
- Worker pool con aislamiento por tenant (sesiones de scraping por org, rate-limits por org, queue separada).
- VMs efímeras por job pesado (idealmente Kubernetes o Hetzner Cloud + Pulumi).
- Failover activo-pasivo o activo-activo.
- Health checks externos + auto-restart.

> Nota: el proyecto ya tenía VMs piloto org-server descartables (`project_vm_piloto_descartable`) y un provisioner Hetzner con SSH key autorizada (`reference_hetzner_ssh_access`). Esa dirección era correcta, pero la inteligencia hoy vive centralizada en ai-engine. **Rediseñar este bloque es el trabajo más grande del roadmap.**

### 🔴 Bloqueo 2 — Identidad enterprise (MFA → SSO/SAML → SCIM)

Hoy: email + Google OAuth. Para Oster pasa. Para Coca-Cola **no pasa procurement**:

| Capability | Estado | Trabajo necesario |
|---|---|---|
| Email + OAuth Google | ✅ | — |
| **MFA TOTP** | ❌ Supabase Auth lo soporta nativo, no está activado | 1-2 días — `FEAT-020` |
| **SAML / OIDC SSO** | ❌ requerido por cualquier cliente >50 seats | 2-3 semanas, requiere Supabase Pro+ |
| **SCIM** provisioning | ❌ no soportado nativo | 3-4 semanas, build endpoint custom |
| **Session policies** (timeout, IP allowlist, device trust) | ❌ | 1 semana |
| **Magic link / passwordless** | ❌ | 2 días |
| **RBAC granular UI** | ⚠️ existe `role` + `permissions jsonb` en `organization_members`, sin UI ni matriz formal | `FEAT-022` — 1-2 semanas |
| **Audit log UI visible al admin del tenant** | ❌ `user_audit_log` se escribe, panel falta | `FEAT-021` — 3-5 días |
| **Transfer ownership** | ❌ | 2 días dentro de `FEAT-022` |

### 🔴 Bloqueo 3 — Sin pasarela = sin SaaS

`CreditsShopView.js:184` es el comentario más caro del repo. Para venderle a una marca premium necesitas:

- **Stripe** (recomendado) + invoicing automático + Stripe Tax o Avalara para VAT.
- **Wompi / MercadoPago** para LatAm si Oster/Postobón paga en peso colombiano (requerido para facturar localmente con DIAN).
- **Customer portal** self-serve (upgrade, downgrade, payment method, invoices).
- **Dunning** automático (cobros fallidos).
- **Usage-based billing** contra `credit_usage` (meters → Stripe).
- **Invoicing manual** para enterprise (NET 30/60, PO, contratos anuales).
- **Tax compliance** (Colombia: DIAN factura electrónica obligatoria para B2B; US: sales tax estatal; EU: VAT).

Tracking: `FEAT-019`.

### 🔴 Bloqueo 4 — Sin staging + sin CI gates = riesgo operacional inaceptable

Push a `main` → producción, sin vitest gate, sin staging, sin migraciones versionadas (`supabase/migrations/` vacío). Para SMB es tolerable. Para una marca Tier-1 en medio de una crisis de comunicación es **terminal**: el dashboard de Mi Marca se cae el día del lanzamiento de campaña → contrato cancelado.

**Cierre obligatorio antes de firmar el primer contrato anual >$50K:**
- `OPS-010` staging branch + vitest gate en Netlify pre-deploy.
- `OPS-003` Supabase CLI migrations versionadas en `supabase/migrations/`.
- `OPS-001` snapshots semanales Hetzner.
- `OPS-002` uptime monitor externo (Better Stack / UptimeRobot).
- Status page pública (sin esto el cliente no sabe cuándo es caída suya vs nuestra).
- Runbook de restore probado al menos 1 vez.

### 🔴 Bloqueo 5 — Sin API pública + sin webhooks salientes = "una herramienta más"

Marcas grandes integran AI Smart Content con su data lake / Snowflake / Tableau / Power BI / DAM corporativo. Sin:

- **API REST versionada** (`/v1/...`) con API keys por org + rate limit + paginación.
- **Webhooks salientes** firmados (signal detectado, vulnerabilidad nueva, content listo, mission completada).
- **OpenAPI / Swagger** spec autogenerada.
- **SDK** mínimo (TypeScript primero, Python después).
- **Audit de uso de API** (qué key llamó qué endpoint, cuándo, desde qué IP).

...AI Smart Content queda como "una herramienta más" en el stack del cliente, no como **infraestructura de marca**. **La diferencia entre $5K/mes y $50K/mes está aquí.**

---

## 3. Fortalezas reales que el equipo subestima

No todo es gap. Hay base real defendible:

### 3.1 Modelo de datos pensado para escala desde el día 1
El split `organization` ↔ `brand_container` ↔ `products/services/brand_entities` org-scope permite naturalmente "Coca-Cola global → Coca-Cola Colombia → Coca-Cola Andina → SKUs locales". Documentado en `project_data_model_org_vs_brand_container`. Esto **ya está construido** y es lo que diferencia de un Hootsuite/Brandwatch que tratan a todos los tenants igual.

### 3.2 Vera + brand intelligence context (10 capas)
`build_full_brand_intelligence_context` es el producto. Es lo único defendible. Lo demás (scraping, dashboards, video gen) lo replica un equipo de 10 ingenieros en 6 meses. **Los 10 layers de contexto + memoria viva + simbiosis Vera↔humano (`project_simbiosis_v1`) no se copian rápido.** Es el moat.

### 3.3 Pipeline sensor → signal → vulnerability → mission → action
Es real, corre, está documentado en `06-data-flows.md`. Esta es la diferencia con un Brandwatch (que solo escucha) y un Jasper (que solo genera). AI Smart Content **cierra el ciclo**: escucha → decide → produce → publica. Eso es defendible vs incumbents.

### 3.4 Multi-tenant billing infra real
`storage_usage` se calcula con triggers en `assets` + plan activo (`project_aismartcontent_storage_tracking`). `credit_usage` se registra por run. Cuando se conecte Stripe, el metering ya existe. **No es un MVP de billing — es infraestructura completa esperando pasarela.**

### 3.5 Security baseline P0 cerrado
AES-256-GCM en tokens at rest, webhook replay window, `user_audit_log` con IP/UA/request_id, RLS en 113 tablas, función `delete_all_app_data` (GDPR delete). **Pasarías una security questionnaire básica.** Documentado en `project_security_baseline`. Eso es ~$50K-100K de trabajo de seguridad ya hecho.

### 3.6 Trends Engine completo
Pipeline E2E Fases 1-5 cerrado 2026-05-08, validado en IGNIS (`project_trends_engine`). Cuando se enciendan las quotas Apify+OpenAI, el producto Tendencias está listo. **No hay que construirlo, hay que pagarlo.**

---

## 4. Roadmap detallado en 3 fases

### FASE A — "Vendible a Oster" (8-12 semanas, $0-5K inversión)

**Objetivo:** cerrar primer contrato enterprise de $5K-15K MRR. Cliente target: Oster Colombia, marcas medianas LatAm, agencias boutique.

| Item | Tracking | Estimación | Bloqueante de venta |
|---|---|---|---|
| Cerrar `SPRINT-FRONTEND-100` (Tendencias + Estrategia + NotificationBell + Lexicon UI + Emerging brands approve) | `SPRINT-FRONTEND-100` | hasta 26-may | 🔴 sí — producto incompleto sin esto |
| Stripe + customer portal + facturación + Wompi LatAm | `FEAT-019` | 3-4 semanas | 🔴 sí — sin cobrar no hay SaaS |
| MFA TOTP + session policies + magic link | `FEAT-020` | 1-2 semanas | 🔴 sí — security questionnaire |
| Staging branch + vitest gate + Netlify deploy previews | `OPS-010` | 1 semana | 🟠 alto — riesgo operacional |
| Supabase CLI migrations versionadas | `OPS-003` | 3-5 días | 🟠 alto — sin esto no hay rollback |
| Uptime monitor externo + status page pública | `OPS-002` | 2-3 días | 🟠 alto — confianza cliente |
| Audit log UI para el admin del tenant | `FEAT-021` | 3-5 días | 🟠 alto — compliance básico |
| RLS hygiene — clasificar/activar las 13 tablas RLS-off | `OPS-011` | 2-3 días | 🟠 alto — security leak potencial |
| Hetzner snapshots semanales | `OPS-001` | 1 día | 🟡 medio |
| Vera Edge Function — confirmación pre-flight de costo | `FEAT-015` | 2 días | 🟡 medio |
| Botón "Programar" en StudioView | `FEAT-011` | 2 días | 🟡 medio |
| Onboarding email transaccional (Resend ya en deps) | nuevo | 3-5 días | 🟡 medio |

**Criterio de salida Fase A:**
- [ ] 1 cliente paying ($5K+/mes) firmado y activado.
- [ ] Staging environment vivo, deploys con gate de tests.
- [ ] MFA TOTP obligatorio para owner/admin.
- [ ] Status page pública con histórico 30 días.
- [ ] Audit log visible al admin del tenant.
- [ ] Stripe procesando pagos automáticos + invoices.

### FASE B — "Vendible a Postobón / Bavaria / Oster Internacional" (3-6 meses adicionales, $15K-40K inversión)

**Objetivo:** contratos $30K-100K/año por cliente. Cliente target: Postobón, Bavaria, Oster Internacional, retailers mid-market regionales.

#### B.1 Rediseño ai-engine multi-tenant (el trabajo más grande)
- Worker pool con aislamiento por tenant.
- Sesiones de scraping por org (no global).
- Rate-limit por org configurable según plan.
- Queue separada por tenant (Redis/BullMQ o pg_boss).
- VMs efímeras por job pesado (Hetzner Cloud API + Pulumi/Terraform).
- Failover activo-pasivo mínimo, activo-activo deseable.
- Health checks externos + auto-restart.
- Métricas por tenant (CPU/RAM/jobs/min) en Grafana o similar.

**Estimación:** 8-12 semanas de un dev senior. **Es el bloqueo arquitectónico para escalar más allá de 3 clientes simultáneos.**

#### B.2 Identidad enterprise
- SAML / OIDC SSO (Okta, Azure AD, Google Workspace). Requiere Supabase Pro+ ($25/mes baseline + add-ons SSO).
- RBAC granular (`FEAT-022`) — owner/admin/editor/viewer + matriz permisos + UI + invitaciones email + transfer ownership.
- IP allowlist por tenant (configurable desde UI admin).
- Session policies avanzadas (max session duration, idle timeout, force re-auth para acciones críticas).

#### B.3 Plataforma para devs (diferenciador real)
- API REST pública v1 con API keys por org + rate limit + paginación cursor-based.
- Webhooks salientes firmados (HMAC) — eventos: `signal.detected`, `vulnerability.created`, `mission.approved`, `mission.completed`, `content.ready`, `trend.emerged`.
- OpenAPI / Swagger spec autogenerada desde código.
- SDK TypeScript publicado en npm (`@aismartcontent/sdk`).
- Developer portal con docs interactivas (Mintlify / Redocly).

#### B.4 Observabilidad enterprise
- Sentry frontend + backend + ai-engine (errors + performance).
- Tracing distribuido (OpenTelemetry) — request id que viaja frontend → Netlify → Supabase → ai-engine.
- Métricas custom en Grafana Cloud o Datadog (jobs/min por tenant, latencia RPC, cache hit rate, OpenAI cost por org).
- Alertas on-call PagerDuty / Better Stack (severidad: critical = wake up, warning = email).
- Web Vitals dashboard interno (ya hay samples vivos en `frontend_errors`, falta UI).

#### B.5 Compliance B2B mid-market
- DPA (Data Processing Agreement) firmable digitalmente.
- Sub-processors list pública (Supabase, Netlify, OpenAI, Anthropic, Apify, Hetzner, Cloudflare, Resend, Stripe).
- Cookie consent / preference center (LatAm: Ley 1581 Colombia, EU: GDPR).
- Pen test externo anual (Cobalt, HackerOne, o boutique local) — $8K-15K.
- Security questionnaire template pre-respondida (SIG Lite, CAIQ, Vanta).

**Criterio de salida Fase B:**
- [ ] 3-5 clientes paying simultáneos sin degradación cruzada.
- [ ] SLA 99.9% comprometido contractualmente y cumplido (medido por status page externa).
- [ ] SSO funcionando con al menos 1 cliente real.
- [ ] API pública v1 con al menos 1 cliente consumiendo.
- [ ] Pen test report disponible para procurement.
- [ ] DPA + sub-processors list publicados.

### FASE C — "Vendible a Coca-Cola / multinacional" (12+ meses, $80K-150K inversión)

**Objetivo:** contratos anuales >$200K, RFPs corporativos, posibilidad de master agreement multi-año. Cliente target: Coca-Cola FEMSA, FEMSA, Unilever, P&G, multinacionales con compras centralizadas.

#### C.1 Compliance formal
- **SOC 2 Type 1** con Vanta o Drata ($15K-25K plataforma) + auditoría ($15K-30K) → 4-6 meses.
- **SOC 2 Type 2** (6 meses adicionales de evidencia continua).
- ISO 27001 si cliente EU lo pide ($20K-40K adicional).
- HIPAA / PCI no aplica por dominio (a menos que se procese pago de fan a marca).
- Vulnerability disclosure program público (HackerOne / Bugcrowd).

#### C.2 Multi-región + data residency
- Supabase Pro+ permite región dedicada — desplegar instancia separada EU (para clientes EU) y US (para clientes US).
- ai-engine en EU (Hetzner Falkenstein / Helsinki) + ai-engine en US (Hetzner Ashburn o AWS).
- Data residency declarada por contrato (cliente EU = datos nunca salen de EU).
- Backups regionales (no cross-region).

#### C.3 BYOK (Bring Your Own Key)
- Cliente puede traer su propia OpenAI API key, Meta App, Google Cloud project.
- Tokens encriptados con master key del cliente (no master key del SaaS).
- Compliance bonus: cliente tiene control completo sobre LLM cost + data.

#### C.4 SCIM provisioning
- Endpoint SCIM 2.0 compatible (Okta, Azure AD, OneLogin).
- Auto-provisioning de usuarios cuando el admin del cliente los crea en su IdP.
- Auto-deprovisioning cuando se desactivan en IdP (critical para offboarding seguro).

#### C.5 Redundancia real
- Supabase Pro+ con Point-in-Time Recovery (PITR) ya hay, falta runbook **probado**.
- ai-engine activo-activo en 2 regiones con load balancer.
- Database read replicas para queries pesadas (dashboards).
- CDN para assets (Cloudflare R2 o Bunny.net) — Supabase Storage tiene latencia variable.

#### C.6 Soporte enterprise
- Widget in-app (Crisp / Intercom / Plain).
- Help center público con docs + videos + best practices.
- Customer Success dedicado (1 CSM por cuenta >$100K/año).
- Slack Connect compartido con el cliente.
- Plantillas email transaccionales pulidas (currently Resend instalado, plantillas no verificadas).

**Criterio de salida Fase C:**
- [ ] SOC 2 Type 2 attestation firmada.
- [ ] 1 cliente >$200K/año firmado.
- [ ] Multi-región operacional con cliente EU.
- [ ] SCIM funcionando con cliente Okta.
- [ ] Status page pública con SLA 99.95%+ cumplido 6 meses consecutivos.
- [ ] Pen test externo limpio (sin findings críticos ni high).

---

## 5. Recomendaciones puntuales no obvias

### 5.1 No migres a React por moda
El frontend Vanilla JS a 41.5K LOC sigue siendo manejable. Migra solo cuando el equipo crezca >5 devs frontend y el costo de onboarding supere la deuda. **Pero sí** introduce TypeScript en services nuevos (no en views legacy) para reducir bugs de contrato con RPCs Supabase. Empezar por `*DataService.js` nuevos.

### 5.2 El `brand_container` model es tu ventaja competitiva en LatAm
Coca-Cola FEMSA opera distinto que Coca-Cola Andina vs Coca-Cola Embonor. Brandwatch / Hootsuite los tratan igual. AI Smart Content los modela como sub-marcas regionales con `brand_containers` distintos bajo una `organization`. **Documenta esto en el marketing.** Es el argumento de venta más fuerte en la región.

### 5.3 Vera es el moat
Todo lo demás se replica. El brand intelligence context de 10 capas + memoria viva + simbiosis Vera↔humano (`project_simbiosis_v1`) **no se copia rápido**. Invierte ahí:
- Más memory banks por dominio (CPG, retail, B2B).
- Sensor demografía por campaña (ya está en `project_simbiosis_v1`).
- Better simbiosis Vera↔humano (bandeja Vera, link manual).
- Memory persistente entre sesiones (la conversación con Vera debería acumular contexto).
- Pero **respeta la regla `feedback_no_llm_in_background`** — scrapers, sensores, alignment, todo background usa reglas + templates + matemática + embeddings. LLM solo en chat cara al usuario o batch deliberado.

### 5.4 Multi-tenancy "real" empieza el día 2 de paying customers
Hoy con 1 user (IGNIS demo) la SPOF del ai-engine no se nota. Con 3 clientes ya estás en problemas. Con 10 es desastre. **No esperes a romperlo en vivo.** Empezar B.1 (rediseño ai-engine) antes de Fase A cierre el primer cliente.

### 5.5 No empieces SOC 2 hasta tener un cliente que lo exija
$50K-100K en compliance que no se traduce en revenue es el clásico error de startup. Hazlo cuando tengas LOI firmada de un cliente >$100K/año que lo exija como precondición. Mientras tanto: **prepara la documentación** (políticas internas, asset inventory, vendor list) pero no pagues auditoría.

### 5.6 Wompi + Stripe, no solo Stripe
Postobón paga en peso colombiano con factura electrónica DIAN. Si solo aceptas Stripe USD, pierdes el contrato local más fácil de cerrar. Wompi (Bancolombia) o ePayco para Colombia, MercadoPago para LatAm en general. Stripe para internacionales (que pueden pagar USD).

### 5.7 No subestimes el costo de OpenAI/Anthropic en producción
La memoria documenta `project_openclaw_gateway_leak` — $7 OpenAI quemados en 24h por un systemd service mal configurado. A escala Coca-Cola con 1000 marcas monitoreadas, el costo LLM por mes puede llegar fácil a $10K-30K/mes. **El metering por org (`credit_usage`) tiene que ser estricto y auditable.** El proxy Anthropic con metering + cap (`FEAT-014`, ya cerrado) es la dirección correcta.

### 5.8 El frontend deploy directo a `main` se va a romper en producción
Es cuestión de cuándo, no de si. Sprint-frontend-100 va a tener bugs visibles al cliente. `OPS-010` (staging + CI gates) no es opcional — es la red de seguridad mínima antes de que el primer cliente entre. Implementarlo **antes** del go-live de Fase A.

### 5.9 No vendas SLA 99.9% antes de medirlo
Hoy no hay uptime monitor externo. No sabes cuál es tu uptime real. Antes de comprometer SLA en contrato, hay que medirlo 90 días continuos (`OPS-002`). Cliente te puede demandar reembolso si no cumples. Promete 99% (riesgo bajo) y supera, no promete 99.9% (~43min downtime/mes) sin red.

### 5.10 No olvides la pieza humana
El proyecto documenta `feedback_autonomous_window` (agentes programados 11pm-3am Bogotá con pre-aprobación). Eso es excelente higiene. Pero para Tier-1 también necesitas Customer Success dedicado — un CSM por cuenta >$100K/año. El producto puede ser autónomo, la relación comercial no.

---

## 6. Costos estimados Fase A → C

| Bloque | Fase A | Fase B | Fase C |
|---|---|---|---|
| Dev time (3 devs senior @$8K/mes) | $24K-72K (incluido en costo de operación) | $72K-144K | $200K+ |
| Supabase | $25/mes (Pro) | $599/mes (Team) | $599 + add-ons SSO/SCIM $400 |
| Hetzner | $40/mes (CCX33) | $200/mes (pool VMs) | $800/mes (multi-región redundante) |
| Stripe | 2.9% + $0.30 por txn | igual | igual |
| Sentry / Datadog | $0 (free tier) | $99-499/mes | $1K-3K/mes |
| Vanta/Drata (SOC 2) | $0 | $0 (preparación interna) | $15K-25K/año |
| Pen test | $0 | $8K-15K/año | $15K-30K/año |
| Auditoría SOC 2 | $0 | $0 | $15K-30K (Type 1) + $20K (Type 2) |
| Status page | $0 (Better Stack free) | $29/mes | $99/mes |
| Email transaccional (Resend) | $0 (free 3K/mes) | $20-100/mes | $200-500/mes |
| Resend / Postmark | — | $100/mes | $500/mes |
| Cloudflare R2 / CDN | $0 (Supabase Storage) | $20/mes | $200/mes |
| Soporte tools (Plain/Crisp) | $0 | $39/mes | $200/mes |
| **OPEX mensual estimado** | **~$65/mes** | **~$1.5K/mes** | **~$5K-8K/mes** |
| **Inversión incremental para llegar a la fase** | $0-5K | $15K-40K | $80K-150K |

> **Nota:** estimaciones de dev time excluidas del OPEX. El dev time es la inversión más grande pero variable según el equipo.

---

## 7. Matriz de decisión humana — qué definir antes del 2026-06-15

### 7.1 Target cliente
¿El siguiente cliente que se quiere firmar es **Oster Colombia** ($5K MRR, le basta MFA + Stripe + dashboard limpio) o ya hay conversación con alguien tipo **Postobón / Bavaria / FEMSA** ($30K+/mes, exige SSO + SLA + audit log visible)?

**La respuesta cambia qué se prioriza en las próximas 12 semanas.** Sin decisión, se construye scope creep de Fase B sobre Fase A no cerrada.

### 7.2 Pasarela
¿Stripe global, Wompi/MercadoPago LatAm, o ambas? (decide arquitectura de `FEAT-019`).
- Si target = Oster/Postobón → ambas obligatorio.
- Si target = solo US/EU → Stripe basta.

### 7.3 MFA scope
¿TOTP solo, o también WebAuthn (passkeys)? (decide `FEAT-020`).
- TOTP es el mínimo viable.
- WebAuthn es lo que esperan los clientes Tier-1 modernos.

### 7.4 Compliance line
¿Se persigue SOC 2 ya o se difiere hasta primer enterprise contract? (decide P3).
- Recomendación: **diferir** hasta tener LOI de cliente que lo exija.

### 7.5 Arquitectura ai-engine
¿Se rediseña ai-engine antes o después de cerrar primer cliente Fase A?
- **Antes:** retrasa cierre Fase A 6-8 semanas, pero garantiza no romperse con cliente real.
- **Después:** cierra Fase A más rápido, pero arriesga incidente público con cliente paying.
- **Recomendación:** después si el primer cliente es chico (1-2 marcas monitoreadas). Antes si es mid-market con 10+ marcas.

### 7.6 Equipo
¿Cuántos devs senior dedicados? Roadmap asume 2-3. Con 1 dev, multiplicar timelines x2.5.

### 7.7 Pricing definitivo
`project_pricing_phase1` documenta 5 tiers (Free/Creator/Team/Agency/Enterprise) con Stripe pendiente. Falta definir:
- Pricing público vs custom Enterprise.
- Credits add-on packaging.
- Volume discounts > 5 brand_containers.
- Annual commitment discount (típico 15-20%).

---

## 8. Lectura corta

- **El backend está al ~90%.** 199 funciones, 153 RLS, AES-256, audit log capturando, vector store, pg_cron, mat-views. Nivel "vendible".
- **El frontend está al ~40%.** Sprint-frontend-100 cierra a 80%+ para 26-may.
- **No hay billing.** Sin Stripe no hay SaaS. Bloqueante absoluto.
- **El ai-engine es el SPOF más grande.** Inviable para cliente Tier-1 sin rediseño multi-tenant real.
- **Identidad enterprise no existe.** Sin MFA → SSO → audit visible no pasas procurement >50 seats.
- **Sin staging + sin CI gates** es riesgo operacional para Tier-1.
- **Vera + el modelo `org / brand_container` son el moat.** Defendible vs Brandwatch/Jasper/Hootsuite.
- **Compliance formal (SOC 2) es Fase C.** No invertir hasta tener cliente que lo exija.
- **Fase A es alcanzable Q3 2026.** Fase B es Q4 2026 / Q1 2027. Fase C es 2027+.

---

## 9. Próximos pasos accionables (esta semana)

1. **Revisar este audit con dirección.** Validar Fase A / B / C como horizontes correctos.
2. **Decisión target cliente** (sección 7.1) antes del 2026-06-15.
3. **Confirmar prioridad Stripe vs Wompi** (sección 7.2).
4. **Lanzar `FEAT-019` (Stripe MVP) y `FEAT-020` (MFA TOTP) en paralelo** la próxima semana.
5. **Schedulear arquitectura ai-engine multi-tenant** para revisión técnica antes del 2026-06-30.
6. **No empezar SOC 2 / pen test** hasta cierre Fase A.
7. **Documentar este audit como input** del próximo board / sales conversation.

---

## 10. Anexo — Benchmark vs incumbents

| Capability | AI Smart Content (hoy) | Brandwatch | Hootsuite | Jasper | Notion |
|---|---|---|---|---|---|
| Brand listening multi-señal | ✅ pipeline propio | ✅ | parcial | ❌ | ❌ |
| Content generation IA | ✅ Vera + video KIE | ❌ | parcial | ✅ | parcial |
| Sub-brand multi-tenancy (`brand_container`) | ✅ nativo | ❌ flat | ❌ flat | ❌ | ✅ workspaces |
| MFA TOTP | ❌ | ✅ | ✅ | ✅ | ✅ |
| SSO/SAML | ❌ | ✅ Enterprise | ✅ Enterprise | ✅ Enterprise | ✅ |
| SCIM | ❌ | ✅ Enterprise | ✅ Enterprise | parcial | ✅ |
| Audit log UI | ❌ datos sí, UI no | ✅ | ✅ | parcial | ✅ |
| API pública versionada | ❌ | ✅ | ✅ | ✅ | ✅ |
| Webhooks salientes | ❌ | ✅ | ✅ | parcial | ✅ |
| SOC 2 Type 2 | ❌ | ✅ | ✅ | ✅ | ✅ |
| Data residency US/EU | ❌ | ✅ | ✅ | parcial | ✅ |
| Status page pública | ❌ | ✅ | ✅ | ✅ | ✅ |
| Pricing público | parcial | ❌ "contact us" | ✅ | ✅ | ✅ |
| Self-serve trial | ❌ | ❌ | ✅ | ✅ | ✅ |

**Lectura:** AI Smart Content tiene 2 ventajas únicas (multi-señal cerrado + sub-brand multi-tenancy nativo) y 9 brechas vs incumbents. Las brechas son cerrables; las ventajas son defendibles si Vera evoluciona como moat.

---

*Audit creado 2026-05-13 por análisis estratégico solicitado a Claude Opus 4.7. Fuentes: `AUDIT-003-enterprise-readiness-2026-05-12.md`, `docs/platform/02-architecture.md`, `docs/platform/09-current-state.md`, `docs/task/INDEX.md`, `docs/task/ROADMAP-POST-OPTIMIZATION-2026-05-12.md`, schema vivo de Supabase, memoria persistente del proyecto (28 entries). Revisar y refinar antes de presentar a board.*
