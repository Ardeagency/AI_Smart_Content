---
chapter: 08
title: Roadmap ejecutable
part: VIII — Ejecución
estimated_reading_time: 35 min
---

# 08 · Roadmap ejecutable

> Este es el capítulo más operacional del libro. Convierte todo lo anterior en **acciones con fechas, owners, y criterios de cierre**. Es lo que se revisa cada semana en standup ejecutivo.

---

## 8.1 Visión global — 3 fases, 24 meses

```
2026                                        2027                            2028

Q3     Q4     Q1     Q2     Q3     Q4     Q1     Q2     Q3     Q4     Q1     Q2

|-----FASE A-----|-----------FASE B-----------|-----------FASE C-----------|
| (8-12 weeks)   |    (3-6 months)            |    (12+ months)            |
| Vendible a     |    Vendible a              |    Vendible a               |
| Oster Colombia |    Postobón/Bavaria        |    Coca-Cola/multinational |
|                |                            |                              |
| MRR target:    |    Per-client:             |    Per-client:               |
| $5K-15K        |    $30K-100K/año           |    >$200K/año                |
|                |                            |                              |
| Investment:    |    Investment:             |    Investment:               |
| $0-5K          |    $15K-40K                |    $80K-150K                 |
```

---

## 8.2 FASE A — Vendible a Oster Colombia

**Target:** primer cliente paying ($5K+/mes) firmado y activado.
**Duración:** 8-12 semanas desde 2026-05-13.
**Target close:** 2026-08-15.

### 8.2.1 Sprint plan — semana por semana

#### Semanas 1-2 (2026-05-19 → 2026-05-30)

**Objetivo:** cerrar `SPRINT-FRONTEND-100` + decisiones humanas pendientes.

```
[Frontend]
- SPRINT-FRONTEND-100 entrega final 26-may
  • Tendencias tab activo (consume RPCs existentes)
  • Estrategia tab activo
  • NotificationBell con org_notifications
  • Lexicon UI
  • Emerging brands approve flow

[Decisiones humanas - capítulo 01.7]
- Target cliente next 12 meses (SMB vs Mid-market)
- Pricing model definitivo (per seat vs hybrid)
- Geografía go-to-market (Colombia first vs LatAm)
- Equity para compliance (SOC 2 Fase B o C)
- Equipo (cuándo hiring)

[Infraestructura preparación]
- Decisión: Wompi + Stripe vs solo Stripe (FEAT-019 architecture)
- Vanta vs Drata vs build (preparación SOC 2 Fase B)
```

**Owner**: CTO + Founder.

#### Semanas 3-4 (2026-06-02 → 2026-06-13)

**Objetivo:** infraestructura de cobro.

```
[FEAT-019 Pasarela de pago] ✅ DEPLOYED 2026-05-19 (adelantado 2 semanas)
- ✅ Schema review (plans, subscriptions, credit_packages)
- ✅ Stripe Checkout integration (api-billing-checkout.js)
- ✅ Webhook /api/billing/webhook (5 eventos + dedup + idempotencia)
- ✅ Customer Portal redirect (api-billing-portal.js)
- ✅ Plan upgrade/downgrade flow (PlanesView wired)
- ✅ Wompi merchant setup (Colombia, sandbox validado E2E)
- ✅ Wompi Widget Checkout + webhook + dedup
- ✅ Tab Facturación en OrganizationView (listado unificado Stripe+Wompi)
- ✅ Seeds COP aplicados (Creator/Team/Agency + 4 packs)
- ⏳ Activación: cuenta Stripe + 2 env vars (externo, esperando aprobación)
- ⏳ Activación: Wompi producción cuando llegue (sandbox ya live)
- ⏳ Fase 2: cron recurring Wompi + acceptance_token + payment_sources
- ⏳ DIAN factura electrónica vía Wompi (Fase 2)

[FEAT-020 MFA] ✅ DEPLOYED 2026-05-18 (adelantado 2 semanas)
- ✅ Supabase Auth MFA enable (TOTP nativo, sin SMS)
- ✅ Enrollment UI (OrganizationView → tab Seguridad → modal QR + verify)
- ✅ Challenge UI (login flow con aal1→aal2)
- ✅ Policy: per-org enforce vía `organizations.mfa_required`
- ✅ Magic link option en signin (signInWithOtp)
- ✅ Revoke sessions ("Cerrar todas las otras sesiones")
- ⏳ Prueba humana E2E (5 escenarios con Authenticator real)
- ⏳ Recovery codes (Fase B)
```

**Owner**: 1 dev backend + 1 dev frontend.

#### Semanas 5-6 (2026-06-16 → 2026-06-27)

**Objetivo:** CI/CD + staging + observability básica.

```
[OPS-010 CI/CD]
- staging branch + Netlify site staging.aismartcontent.io
- GitHub Actions pipeline (lint, test, security, build, deploy)
- vitest gate pre-deploy
- Deploy previews per PR
- npm audit + detect-secrets en CI

[OPS-003 Migrations]
- supabase CLI install + link prod
- supabase db pull baseline
- Commit baseline migration
- Workflow doc para nuevas migraciones

[Observability básica]
- Sentry frontend + Netlify Functions
- Better Stack uptime aismartcontent.io + console + api
- Status page público status.aismartcontent.io
```

**Owner**: 1 SRE / DevOps (puede ser CTO).

#### Semanas 7-8 (2026-06-30 → 2026-07-11)

**Objetivo:** security + audit visible.

```
[FEAT-021 Audit log UI]
- /org/admin/audit view
- Filtros: action, user, date, resource type
- Export CSV (con audit own)
- Retention 12 meses default

[OPS-011 RLS hygiene]
- Clasificar 13 tablas sin RLS
- Activar RLS donde necesario
- Documentar catalogos globales legítimos
- vitest RLS isolation tests

[Security hardening]
- CSP strict deployed
- HSTS confirmed
- SECURITY.md review
- DPA template draft (legal review pending)
- Sub-processors list publicada en /privacy/sub-processors
- Cookie consent banner básico
```

**Owner**: 1 dev backend + abogado externo (review legal).

#### Semanas 9-10 (2026-07-14 → 2026-07-25)

**Objetivo:** product polish + onboarding.

```
[Onboarding wizard]
- 5-step signup flow
- Industry selection
- First integration prompt (skippable)
- First brand_container prompt
- Demo data trigger (benchmark public account)
- Checklist persistente en dashboard

[Notifications]
- FEAT-018 rich notifications model
- Email transaccional templates (Resend)
- DKIM/SPF/DMARC configured
- Welcome sequence (5 emails)

[Helper features]
- FEAT-015 cost confirmation pre-flight
- FEAT-011 botón Programar StudioView
- FEAT-013 monitoring CRUD UI
```

**Owner**: 1 dev frontend + 1 dev backend.

#### Semanas 11-12 (2026-07-28 → 2026-08-08)

**Objetivo:** primer cliente onboarded.

```
[Sales prep]
- Pricing público en aismartcontent.io
- Demo agendable (Calendly)
- Pitch deck listo
- Battle cards documented (capítulo 07.7)
- Trial flow tested end-to-end

[Soft launch]
- 5-10 prospects warm intro
- Demo a 3 leads cualificados
- Negotiate primer contrato
- Onboard primer paying customer
- Documentar learnings → iterar
```

**Owner**: Founder + CSM part-time.

### 8.2.2 Criterios de cierre Fase A

- [ ] 1 cliente paying confirmado ($5K+/mes facturado).
- [ ] MFA enabled rate >80% en owners + admins.
- [ ] Staging environment vivo, gate de tests funcionando.
- [ ] Migraciones versionadas en `supabase/migrations/`.
- [ ] Stripe + Wompi procesando pagos.
- [ ] Audit log UI visible al admin.
- [ ] Status page pública con ≥30 días histórico.
- [ ] DPA template firmable.
- [ ] Sub-processors list pública.
- [ ] 0 incidentes de seguridad reportados.
- [ ] Uptime medido ≥99.5% (no SLA aún).

### 8.2.3 Riesgos Fase A

| Riesgo | Probabilidad | Mitigation |
|---|---|---|
| SPRINT-FRONTEND-100 no entrega 26-may | Medio | Scope reducido aceptable; entrega progresiva |
| Stripe integration delays | Bajo | Stripe es estable, mucha doc |
| Wompi integration delays | Medio | API menos pulida; testear early |
| Primer cliente no se cierra Q3 | Alto | Founder-led sales, target conservador $5K |
| Apify/OpenAI quotas reaparecen | Medio | Budget ready; reactivar al cerrar primer cliente |
| CI/CD breaks production | Medio | Staging primero, manual approval para prod |

---

## 8.3 FASE B — Vendible a Postobón / Bavaria

**Target:** 3-5 clientes paying simultáneos, primero Mid-market firmado.
**Duración:** 3-6 meses post Fase A (2026-08-15 → 2027-02-15).

### 8.3.1 Workstreams paralelos

#### Workstream 1: Arquitectura Control Plane / Data Plane

Mes 1-2 (Aug-Oct 2026):
- Schema split detallado (qué tabla migra dónde) — capítulo 02.
- gRPC proto files definidos.
- Auth federado prototyped en staging (2 JWTs, RS256).

Mes 2-3 (Oct-Dec 2026):
- Gateway central extendido (Apify, OpenAI, KIE, Kling) — capítulo 02.3.2.A.
- Provisioner refactor con cloud-init template.
- Warm pool de VMs 3-5 por región.

Mes 3-4 (Dec 2026 - Feb 2027):
- Primera VM dedicada piloto con primer Enterprise.
- Migración cliente shared → dedicado.
- 2-3 meses operando para shakedown.
- Documentar runbook completo.

#### Workstream 2: Plataforma para devs

Mes 1-3 (Aug-Oct 2026):
- API REST v1 design.
- OpenAPI spec generation.
- Endpoints core (orgs, brand_containers, products, signals, missions, vera).
- API keys management UI.

Mes 3-4 (Oct-Dec 2026):
- Webhooks salientes (subscriptions, delivery, retry, dead letter).
- SDK TypeScript v1.
- Developer portal beta.

#### Workstream 3: Enterprise auth

Mes 1-2 (Aug-Sep 2026):
- SSO SAML SAML/OIDC integration (Supabase Pro+).
- IP allowlist UI.
- Session policies advanced.

Mes 2-3 (Sep-Oct 2026):
- RBAC granular (`FEAT-022`).
- Roles UI + invitations email.
- Transfer ownership.

#### Workstream 4: Observability + ops

Mes 1-2:
- Sentry + APM tracing distribuido.
- Grafana Cloud setup.
- Datadog Logs.

Mes 2-3:
- Custom SLO/SLA dashboard.
- Alert routing (PagerDuty).
- Runbooks documentados.

Mes 3-4:
- Restore testing trimestral.
- DR drill tabletop.

#### Workstream 5: Compliance + commercial readiness

Mes 1-2:
- DPA portal click-to-sign.
- Trust center público beta.
- Pen test interno + cyber insurance contratado.

Mes 3-4:
- Vanta/Drata onboarding ($15K-25K invest).
- SOC 2 controls operating.
- Pen test externo programado.

Mes 5-6:
- Pre-respondida security questionnaire (SIG Lite + CAIQ).
- DPO designado.
- Sub-processors policy formal.

#### Workstream 6: Customer Success + sales scaling

Mes 1:
- Hire primer AE.
- Hire primer CSM.

Mes 2-3:
- Sales playbook documentado.
- Lead qualification framework.
- Demo training.

Mes 4-6:
- Hire SDR.
- Hire SE part-time.
- Industry templates en producto.

### 8.3.2 Criterios de cierre Fase B

- [ ] 5+ clientes paying simultáneos sin degradación cruzada.
- [ ] SSO funcionando con ≥1 cliente real.
- [ ] API pública v1 con ≥1 cliente consumiendo.
- [ ] Pen test externo limpio.
- [ ] DPA firmado con ≥3 clientes.
- [ ] Uptime ≥99.9% medido 90 días.
- [ ] Vanta/Drata onboarded, controles operando.
- [ ] Primer cliente Enterprise migrado a data plane dedicado.
- [ ] Provisioner + warm pool funcionando.
- [ ] 1 AE + 1 CSM + 1 SDR contratados.

### 8.3.3 Riesgos Fase B

| Riesgo | Probabilidad | Mitigation |
|---|---|---|
| Rediseño ai-engine se atrasa 2-3 meses | Alto | Workstream paralelo no bloquea sales |
| Primer Enterprise no firma Q4 2026 | Alto | Focus on sales motion + battle cards |
| Apify/OpenAI cost descontrolado | Medio | Gateway con caps obligatorio Fase A |
| Talent gap (SRE/Security senior) | Alto | LatAm tech talent + remote hiring |
| Investor pressure to accelerate | Medio | Stick to phased plan; no premature scaling |

---

## 8.4 FASE C — Vendible a Coca-Cola / multinational

**Target:** primer cliente Tier-1 firmado (>$200K/año), SOC 2 Type 2 attested.
**Duración:** 12+ meses post Fase B (2027-02-15 → 2028-02-15+).

### 8.4.1 Workstreams principales

#### Workstream 1: SOC 2 Type 2 + ISO 27001

Q1 2027: SOC 2 Type 1 auditoría completed.
Q2-Q3 2027: 6 meses observación Type 2.
Q4 2027: SOC 2 Type 2 auditoría + attestation.
Q1 2028: ISO 27001 (si EU client lo exige).

Total compliance investment: $80K-150K.

#### Workstream 2: Multi-region

Q1-Q2 2027:
- Provisioner soporta `region` parameter (Falkenstein, Helsinki, Ashburn).
- Cross-region replication para catálogos centrales.
- Backup regional (no cross-region).

Q3-Q4 2027:
- AWS São Paulo / partner para LatAm-EU regulations.
- Cliente EU primero on multi-region.

#### Workstream 3: BYOK + advanced security

Q1-Q2 2027:
- BYOK design para Tier-1.
- AWS KMS / Azure Key Vault integration.
- DEK envelope encryption per-record.

Q2-Q3 2027:
- SCIM provisioning 2.0.
- HSM-backed keys option.
- Audit log forward a SIEM cliente.

#### Workstream 4: Mobile (opcional)

Q2-Q3 2027 (solo si demanda real):
- React Native app.
- Features clave: dashboards, mission approval, Vera chat.
- App Store + Play Store launch.

#### Workstream 5: Enterprise sales scale

Q1 2027:
- Hire VP Sales.
- Hire enterprise AE (specialized).
- Enterprise SE full-time.

Q2-Q3 2027:
- Account-based marketing (ABM).
- Tier-1 specific battle cards.
- Industry-specific case studies (CPG, retail, finance).

Q4 2027:
- Field sales presencial Latin America key markets.
- Cannes Lions sponsorship.

#### Workstream 6: Customer Success enterprise

Q1 2027:
- Hire enterprise CSM (1 per $300K ARR).
- QBR templates + cadence.
- Customer Advisory Board (Tier-1 clients).

Q2-Q4 2027:
- Health score automatización.
- Expansion playbooks.
- Renewal management formal.

### 8.4.2 Criterios de cierre Fase C

- [ ] SOC 2 Type 2 attestation obtained.
- [ ] 1 cliente Tier-1 firmado (>$200K/año).
- [ ] Multi-región operacional (EU + US + LatAm).
- [ ] SCIM funcionando con cliente Okta.
- [ ] Uptime ≥99.95% medido 6 meses.
- [ ] Pen test externo limpio (sin findings critical/high).
- [ ] CISO contratado.
- [ ] Customer Advisory Board funcional.
- [ ] $5M+ ARR.

### 8.4.3 Riesgos Fase C

| Riesgo | Probabilidad | Mitigation |
|---|---|---|
| SOC 2 timeline slips 6 meses | Medio | Vanta/Drata acelera; auditor pre-bookeado |
| Tier-1 sales cycle 12+ meses | Alto | Múltiples deals en parallel pipeline |
| Talent compete con global SaaS | Alto | Stock options agresivo + remote-first |
| Cost compliance explode | Alto | Phased investment; no rush |
| Geopolitical (LatAm regulation changes) | Medio | Multi-jurisdiction DPO; flexibility |

---

## 8.5 Tracking y revisión

### 8.5.1 Cadencia de revisión

| Frecuencia | Quién | Foco |
|---|---|---|
| **Diario** | CTO + on-call | Incidentes, deploys, alerts |
| **Semanal** | Equipo eng | Sprint review, blockers, OKRs |
| **Quincenal** | Eng + Product + Sales | Cross-functional alignment |
| **Mensual** | Leadership (CTO + Founder + AEs) | MRR, NPS, churn, health |
| **Trimestral** | Board + advisors | Phase progress, capital allocation |
| **Semestral** | Toda la empresa | Strategy review, OKR reset |

### 8.5.2 OKRs por fase

#### Fase A OKRs (Q3 2026)

```
Objective 1: Cerrar primer cliente paying
- KR1: Stripe + Wompi facturando $5K+ end of Q3
- KR2: Onboarding flow <15 min time-to-value
- KR3: 0 incidents seguridad reportados

Objective 2: Platform infrastructure ready
- KR1: Staging deployed + CI gates funcionando
- KR2: Migraciones versionadas baseline
- KR3: Status page con 30 días histórico
- KR4: MFA enabled >80% admin/owner

Objective 3: Compliance baseline
- KR1: DPA template firmable
- KR2: Sub-processors list pública
- KR3: Privacy/ToS review legal
- KR4: SECURITY.md actualizado
```

#### Fase B OKRs (Q4 2026 - Q1 2027)

```
Objective 1: 5 paying customers simultáneos
- KR1: $50K MRR end Q1 2027
- KR2: NRR >100%
- KR3: Logo churn <5%/mo

Objective 2: Enterprise-ready
- KR1: SSO con 1 cliente real
- KR2: API pública v1 con 1 cliente consumiendo
- KR3: Pen test externo limpio
- KR4: 1 cliente Enterprise migrado a data plane

Objective 3: SOC 2 Type 1
- KR1: Vanta/Drata onboarded
- KR2: Controles operando 90+ días
- KR3: Type 1 attestation by Q3 2027
```

#### Fase C OKRs (Q2 2027 - Q1 2028)

```
Objective 1: Tier-1 customer
- KR1: 1 cliente >$200K firmado
- KR2: Multi-region operacional
- KR3: 99.95% SLA cumplido 6 meses

Objective 2: SOC 2 Type 2
- KR1: 6 meses Type 1 observación
- KR2: Type 2 attestation by Q3 2028
- KR3: Trust center público completo

Objective 3: Revenue scale
- KR1: $5M ARR end Q1 2028
- KR2: NRR >115%
- KR3: GTM team 20+ personas
```

### 8.5.3 Métricas continuas (dashboards)

#### CEO dashboard (semanal)
- MRR / ARR.
- New MRR + churned MRR.
- Active customers.
- Pipeline.
- Cash position.
- Burn rate.

#### Eng dashboard (diario)
- Deploys.
- Incidents.
- Uptime.
- Error rate.
- P95 latency.

#### Product dashboard (semanal)
- DAU/MAU.
- Feature adoption.
- Onboarding completion.
- Vera missions approved.

#### Customer Success dashboard (semanal)
- Health scores distribution.
- Support tickets.
- NPS.
- Expansion / contraction.

---

## 8.6 Decisiones humanas pendientes — para resolver antes de 2026-06-15

(Referenciado en capítulo 01.7 y `AUDIT-004.7`)

| # | Decisión | Bloquea | Recomendación |
|---|---|---|---|
| 1 | Target cliente next 12 meses | Priorización Fase A | SMB/Mid-market LatAm primero |
| 2 | Pricing model definitivo | FEAT-019 design | Híbrido: base + brand_containers + credits |
| 3 | Geografía go-to-market | Multi-region timing | Colombia 100% Año 1, LatAm Año 2 |
| 4 | Pasarela: Stripe vs Wompi vs ambas | FEAT-019 implementation | Ambas (Stripe global + Wompi DIAN) |
| 5 | MFA scope: TOTP vs WebAuthn | FEAT-020 | TOTP primero, WebAuthn Fase B |
| 6 | Compliance line: SOC 2 ahora o Fase C | Vanta investment timing | Fase B late (con LOI Enterprise) |
| 7 | Equipo: cuándo hire SRE | Workstream timing Fase B | Mes 1 Fase B (Aug 2026) |
| 8 | Arquitectura ai-engine: antes o después Fase A close | Resource allocation | Diseño en Fase A paralelo, build Fase B |
| 9 | Inversión externa: bootstrap o raise | Capital allocation | Bootstrap Fase A; evaluar raise Fase B |
| 10 | App móvil: build Fase C o postergar | Engineering allocation | Postergar hasta demanda Tier-1 |

---

## 8.7 Comunicación interna

### 8.7.1 Documentación viva

- `docs/playbook/` — este libro.
- `docs/platform/` — estado actual.
- `docs/task/INDEX.md` — backlog activo.
- `docs/task/*.md` — task individuales.
- `docs/decisions/` — ADRs (Architecture Decision Records). Crear Fase A.

### 8.7.2 Reuniones standing

- **Daily standup** (eng, 15 min, async ok).
- **Weekly sprint review** (eng + product, 60 min).
- **Bi-weekly cross-functional** (eng + sales + cs + marketing, 60 min).
- **Monthly business review** (leadership, 90 min).
- **Quarterly all-hands** (toda la empresa, 90 min).

### 8.7.3 Slack channels

```
#general                 — anuncios todos
#engineering             — discusión técnica
#deploys                 — bot deploy notifications
#incidents               — alertas + war room
#ops                     — operacional medio-prio
#product                 — discusión producto
#sales                   — pipeline, deals
#customer-success        — CS day-to-day
#revenue                 — MRR moves, big wins
#random                  — humano
```

---

## 8.8 Lecciones críticas del playbook

Si solo recuerdas 10 cosas de este libro, que sean estas:

1. **Vera + brand_container model + pipeline cerrado son el moat.** Defiende invertir desproporcionadamente ahí.
2. **Control Plane / Data Plane es el modelo target.** No es opcional para Tier-1.
3. **Las APIs externas pagas pasan por gateway central con metering.** Apify, OpenAI, KIE — todos.
4. **Las integraciones del cliente (Meta/Google/Shopify) ejecutan en su VM.** Aislamiento real.
5. **Sin Stripe + Wompi no hay SaaS.** P0 absoluto Fase A.
6. **Sin MFA no firmas Enterprise.** P0 absoluto Fase A.
7. **Sin staging + CI gates no operas Tier-1.** Riesgo inaceptable.
8. **Sin SSO no pasas procurement >50 seats.** P1 Fase B.
9. **SOC 2 Type 2 solo después de LOI Tier-1.** Anti-patrón gastar antes.
10. **Compliance es Fase C; no aceleres por miedo.** Las marcas pagan por producto, no por papel.

---

## 8.9 Lectura corta

- **Fase A** (8-12 semanas): Stripe + MFA + staging + audit log + DPA. Primer cliente paying.
- **Fase B** (3-6 meses): Control plane / data plane build, SSO, API v1, Vanta. 5+ clientes.
- **Fase C** (12+ meses): SOC 2 Type 2, multi-region, BYOK, SCIM. Primer Tier-1.
- **Workstreams paralelos** Fase B: arquitectura, API, auth, observability, compliance, sales scaling.
- **OKRs trimestrales** + KPIs continuos.
- **10 decisiones humanas pendientes** para resolver antes 2026-06-15.
- **Cadencia revisión**: diaria → semanal → mensual → trimestral → semestral.
- **Slack channels** + reuniones standing definidos.
- **Las 10 lecciones críticas** son el resumen ejecutivo del libro entero.

---

*Apéndices: [A · Checklist seguridad](./apendices/checklist-seguridad.md) · [B · Checklist operaciones](./apendices/checklist-operaciones.md) · [C · Glosario](./apendices/glossary.md)*
