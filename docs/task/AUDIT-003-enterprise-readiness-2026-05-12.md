---
id: AUDIT-003
title: Frontend vs Supabase vs SaaS Enterprise — gap analysis y matriz de prioridad
severity: high
type: audit
status: open
auto_eligible: no
auto_eligible_reason: requiere decisiones estratégicas (pasarela de pago, política compliance, alcance SSO)
est_duration: short
created: 2026-05-12
related:
  - AUDIT-001-frontend-vs-backend-2026-05-05.md (foto previa front↔back)
  - SPRINT-FRONTEND-100-2026-05-06.md (cierre del gap front↔back ya planeado)
  - FEAT-019-payment-gateway.md (P0 — pasarela)
  - FEAT-020-auth-mfa.md (P0 — MFA TOTP)
  - FEAT-021-audit-log-ui.md (P1 — panel auditoría tenant)
  - FEAT-022-rbac-granular.md (P1 — RBAC + UI)
  - OPS-010-ci-gates-staging.md (P1 — vitest pre-deploy + staging)
  - OPS-011-rls-hygiene-review.md (P1 — 13 tablas RLS off)
---

# AUDIT-003 — Enterprise readiness

> **Fecha auditoría:** 2026-05-12 · Org única en producción: IGNIS (demo, ficticia) · 1 user · 430 brand_posts · 19 intelligence_entities · 3 brand_integrations

Esta auditoría amplía `AUDIT-001` (front vs back interno) comparando además contra el estándar de B2B SaaS enterprise (Linear, Vercel, PostHog, Notion, Retool) para identificar qué falta para que AI Smart Content sea **vendible a un cliente mediano/grande**.

---

## 1. Foto actual

| Capa | Estado vivo | Observación |
|---|---|---|
| **Frontend** SPA Vanilla JS | ~41.5K LOC · 40 views · 11 services · index.html + bundle.css | Auto-deploy Netlify desde `main` |
| **Edge layer** Netlify Functions | 30 functions · ~6.5K LOC (Meta/GA4/YouTube/Shopify OAuth · OpenAI · KIE/Kling video · webhooks) | Sin runtime de Edge Functions Supabase |
| **Supabase Postgres** | **134 tablas** · 9 vistas · **8 mat-views** · **199 funciones** · **53 triggers** · **153 policies RLS** | Pesa más que el frontend |
| **ai-engine** (Hetzner CCX33) | Worker FastAPI + scrapers + Vera strategist Opus 4.7 + 30+ endpoints REST | El "cerebro" real, multi-tenant SPOF |
| **Auth** | email + Google OAuth (2 providers · 1 user) | Sin MFA, sin SAML, sin magic link |
| **Cron** | 7 cron Supabase + crons systemd en ai-engine | Refresh de mat-views + audience-demand 6h + vera-strategist semanal |
| **Datos sensibles** | AES-256-GCM tokens at rest (P0 cerrado 2026-05-08) · `user_audit_log` poblándose | OPS-007 (Vault encryption global) pendiente |
| **Extensiones PG** | pg_cron · pg_graphql · pg_net · pg_stat_statements · pgcrypto · supabase_vault · unaccent · uuid-ossp · vector | Vault instalado pero sin uso productivo |

---

## 2. Backend → Frontend: alineación funcional

**Diagnóstico:** el backend está al **~90%**; el frontend expone **~40%**. Ya documentado en `AUDIT-001` y `SPRINT-FRONTEND-100` (entrega 2026-05-26).

| Sistema backend | Vive en BD | UI lo consume | Severidad |
|---|---|---|---|
| Dashboard 1 · Mi Marca (15 RPCs) | ✅ | parcial (RPCs viejas, falta `dashboard_brand_optimization_insights`) | 🟡 |
| Dashboard 2 · Competencia (11 RPCs + `dashboard_competencia_intelligence`) | ✅ | parcial (no consume `_intelligence`) | 🟡 |
| Dashboard 3 · Tendencias (`audience_demand_signals`, `targeted_trend_signals`, 9 RPCs `dashboard_tendencias_*`) | ✅ | **tab deshabilitado** (`TABS_ENABLED.tendencies=false`) | 🔴 |
| Dashboard 4 · Estrategia (`dashboard_strategy_master`, `strategic_recommendations`, workflow approve/reject/iterate) | ✅ | **tab deshabilitado** (`TABS_ENABLED.strategy=false`) | 🔴 |
| Notificaciones org (`org_notifications` + `org_notification_user_state` + `list_my_org_notifications`) | ✅ | sin NotificationBell | 🟠 |
| Emerging brands approve flow (`emerging_brand_candidates`, `approve_emerging_brand`, `provision_multi_platform_entity`) | ✅ | sin UI | 🟠 |
| Lexicon review (`dimension_lexicon` 160 rows, `review_lexicon_proposal`) | ✅ | sin UI | 🟠 |
| Multi-platform provision (`provision_multi_platform_entity`) | ✅ | sin UI | 🟠 |
| Sensores / URL watchers CRUD (`monitoring_triggers`, `url_watchers`) | ✅ | MonitoringView read-only (FEAT-013) | 🟡 |
| Cost / credits pre-flight (`credit_usage`, `org_claude_caps`, `claude_cap_check`) | ✅ | falta confirm() en VeraView (FEAT-015) | 🟠 |
| Brand intelligence context (10 capas, `build_full_brand_intelligence_context`) | ✅ | sin UI dedicada | 🟠 |
| Storage tracking (`storage_usage`, recompute trigger) | ✅ | no se muestra al usuario | 🟡 |
| Frontend errors logger (`log_frontend_error`, `frontend_errors`) | ✅ se escribe | sin panel dev visible | 🟡 |
| User audit log (`user_audit_log` con IP/UA/request_id/action) | ✅ se escribe | sin UI de auditoría → ver FEAT-021 | 🟡 |

> El sprint `SPRINT-FRONTEND-100` ya planea cerrar este bloque entero al 26-may.

---

## 3. Brechas vs estándar SaaS enterprise

Benchmark: lo que un cliente B2B mediano-grande pide para firmar contrato >$1K MRR.

### 3.1 Identity & Access — 🔴 crítico

| Capability | Estado |
|---|---|
| Email + OAuth Google | ✅ |
| **MFA / TOTP** | ❌ Supabase Auth lo soporta nativo, no está activado → ver `FEAT-020` |
| **SAML / OIDC SSO** | ❌ requerido por cualquier cliente >50 seats |
| **SCIM** provisioning | ❌ |
| **RBAC granular** | ⚠️ existe `role` + `permissions jsonb` en `organization_members`, sin UI ni matriz formal → ver `FEAT-022` |
| **Audit log UI** | ❌ `user_audit_log` tiene IP, UA, request_id, action — datos hay, panel falta → ver `FEAT-021` |
| **Session policies** (timeout, IP allowlist) | ❌ |
| **Magic link / passwordless** | ❌ |

### 3.2 Billing & monetización — 🔴 crítico (placeholder)

| Capability | Estado |
|---|---|
| Plan model (`plans`, `subscriptions`, `credit_packages`, `credit_usage`) | ✅ schema completo |
| **Payment gateway** | ❌ `CreditsShopView.js:184` → comentario `// Placeholder: integrar con pasarela de pago (Stripe, etc.)` → ver `FEAT-019` |
| **Facturación / invoices** | ❌ tab "Facturación" existe en `OrganizationView`, sin contenido real |
| **Tax & VAT** | ❌ |
| **Dunning / cobro fallido** | ❌ |
| **Usage-based billing** | ⚠️ hay `credit_usage` por run, falta meters contra Stripe |
| **Self-serve upgrade/downgrade** | ❌ |
| **Customer portal** | ❌ |

### 3.3 Multi-tenancy & seguridad de datos — 🟠 alta

| Capability | Estado |
|---|---|
| RLS por organización | ✅ 153 policies en 113 tablas |
| **Tablas SIN RLS** | ⚠️ **13 tablas** (`_bak_*`, `classifier_blacklist`, `commercial_query_qualifiers`, `country_aliases`, `emerging_patterns`, `external_api_cache`, `intent_classifier_rules`, `lexicon_enrichment_runs`, `provocative_brand_exceptions`, `trend_query_jobs`, `trends_category_templates`, `viral_predictions`) → ver `OPS-011` |
| Tokens encrypted at rest | ✅ AES-256-GCM (P0 cerrado 2026-05-08) |
| **Supabase Vault global** | ❌ `OPS-007` pendiente |
| **Webhook replay window** | ✅ |
| **Data residency** (US/EU) | ❌ Supabase fijo en una región |
| **Backups verificados** | ⚠️ Supabase PITR vivo; sin runbook restore probado; `OPS-001` Hetzner snapshots pendiente |
| **GDPR delete-all-data** | ✅ función `delete_all_app_data` existe |
| **DPA / sub-processors list** | ❌ |

### 3.4 Observabilidad & SRE — 🟠 alta

| Capability | Estado |
|---|---|
| `developer_logs`, `frontend_errors`, `system_metrics`, `provisioning_events`, `integration_webhooks_log` | ✅ tablas existen y se escriben |
| **Dashboards developer** | ⚠️ `DevDashboardView`, `DevLogsView`, `DevWebhooksView` accesibles solo a `is_developer()` |
| **APM / tracing externo** (Sentry / Datadog) | ❌ |
| **Uptime monitor externo** | ❌ `OPS-002` pendiente |
| **Status page pública** | ❌ |
| **Alertas on-call** | ❌ |
| **Health endpoint público** | ⚠️ existe en ai-engine, sin exposición |

### 3.5 Plataforma & DX — 🟡 media

| Capability | Estado |
|---|---|
| API REST pública para clientes | ❌ no hay API versionada |
| **API keys gestionables por org** | ❌ |
| **Webhooks salientes al cliente** | ❌ solo entrantes (Meta, Shopify) |
| **Rate limiting por org** | ⚠️ `plans.scraping_daily_cap` interno, no en API pública |
| **SDK / docs públicas** | ❌ |
| **OpenAPI / Swagger** | ❌ |
| Feature flags por org | ✅ `organization_features` + `org_has_feature()` |
| **Migraciones versionadas** | ❌ `supabase/migrations/` vacío · `OPS-003` pendiente |
| **CI con tests gate** | ⚠️ vitest existe (smoke RLS+RPCs+endpoints), no corre en Netlify pre-deploy → ver `OPS-010` |
| **Staging environment** | ❌ deploy directo a prod desde `main` → ver `OPS-010` |

### 3.6 Compliance — 🟡 media (B2B late stage)

| Capability | Estado |
|---|---|
| Privacy Policy + ToS + DataDeletion pages | ✅ |
| **SOC 2** | ❌ P3 (esperar primer cliente >$50K/año) |
| **ISO 27001** | ❌ P3 |
| **HIPAA / PCI** | n/a por dominio |
| **Pen test report** | ❌ |
| **Vulnerability disclosure** | ⚠️ `SECURITY.md` existe |
| **Data Processing Agreement** | ❌ |
| **Cookie consent / preference center** | ❌ |

### 3.7 Producto enterprise (UX) — 🟡 media

| Capability | Estado |
|---|---|
| Onboarding guiado | ⚠️ `mark_org_notification_checklist_step` existe, UI incompleta |
| **Workspace switcher** multi-org | ⚠️ schema multi-org listo, solo 1 org en prod |
| **Invitaciones por email** | ⚠️ `organization_invitations` schema completo (token, expires_at, role, status); flujo email vivo no verificado |
| **Roles UI** (assign, transfer ownership) | ⚠️ tab existe, profundidad pendiente |
| **Audit log visible para admin del cliente** | ❌ FEAT-021 |
| **Soporte in-app** (Intercom/Crisp/widget propio) | ❌ |
| **Centro de ayuda / docs públicas** | ❌ |
| **Notificaciones email transaccionales** (Resend en deps) | ⚠️ infra sí, plantillas no verificadas |

---

## 4. Matriz de prioridad

| Prio | Bloque | Items | Tracking |
|---|---|---|---|
| 🔴 **P0** | Cierre gap front↔back | tabs Tendencias + Estrategia + NotificationBell + Lexicon UI + Emerging brands approve + FEAT-015 + FEAT-011 | `SPRINT-FRONTEND-100` (target 26-may) |
| 🔴 **P0** | **Cobrar dinero** | Stripe (o Wompi LatAm) + checkout + invoices + customer portal + dunning | `FEAT-019` |
| 🔴 **P0** | **MFA mínimo** | TOTP Supabase nativo + magic link + session policies | `FEAT-020` |
| 🟠 **P1** | Audit log tenant | Panel admin que muestre IP/UA/action/resource | `FEAT-021` |
| 🟠 **P1** | CI/CD gates | vitest en Netlify pre-deploy + staging branch | `OPS-010` |
| 🟠 **P1** | RLS hygiene | Revisar 13 tablas RLS-off, documentar como global/catalog o activar policy | `OPS-011` |
| 🟠 **P1** | RBAC granular | owner/admin/editor/viewer + matriz permisos + transfer ownership + UI | `FEAT-022` |
| 🟠 **P1** | Cierre OPS existentes | snapshots Hetzner, uptime externo, Supabase CLI migrations, Vault | `OPS-001`/`OPS-002`/`OPS-003`/`OPS-007` |
| 🟡 **P2** | Plataforma para devs | API REST pública versionada + API keys por org + webhooks salientes + OpenAPI | nuevo (sin task) |
| 🟡 **P2** | Observabilidad | Sentry frontend + tracing ai-engine + status page pública + alertas | nuevo (sin task) |
| 🟡 **P2** | SSO/SAML | OIDC + SAML (Okta, Azure AD) | nuevo (sin task) |
| 🟢 **P3** | Compliance formal | DPA, SOC 2 Type 1 → Type 2, pen test externo | nuevo (sin task) |
| 🟢 **P3** | Soporte | Widget in-app + help center + plantillas email transaccional | nuevo (sin task) |

---

## 5. Lectura corta

- **Cerca del lado backend.** 199 funciones, 153 RLS policies, AES-256 tokens, audit log capturando, vector store, pg_cron, mat-views auto-refresh. Backend nivel "vendible".
- **Cuello inmediato: UI + facturación.** Sin Stripe no hay SaaS. Sin tabs 3-4 no hay producto. Ambos sin hacer.
- **Cuello siguiente: enterprise-readiness duro.** MFA → SSO → audit log visible → CI gates → migraciones versionadas. Sin esto no se pasa un security questionnaire serio.
- **Lo caro y lejano: compliance formal** (SOC 2, ISO). Sólo invertir cuando el primer cliente >$50K/año lo exija.

---

## 6. Siguiente decisión humana

1. **Pasarela:** ¿Stripe global o Wompi/MercadoPago LatAm o ambas? (decide arquitectura de `FEAT-019`).
2. **MFA scope:** ¿TOTP solo o también WebAuthn? (decide `FEAT-020`).
3. **Compliance line:** ¿se persigue SOC 2 ya o se difiere hasta primer enterprise contract? (decide P3).
