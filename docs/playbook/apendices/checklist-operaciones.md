---
appendix: B
title: Checklist completo de operaciones
referenced_from: capítulo 04
---

# Apéndice B — Checklist completo de operaciones

> Checklist consolidado de todos los controles operacionales (CI/CD, observability, backup, DR, FinOps) referenciados en el libro.

---

## B.1 Por fase

### Fase A — Operational baseline

#### CI/CD
- [ ] `staging` branch creado + Netlify site `staging.aismartcontent.io`
- [ ] GitHub Actions pipeline: lint → test → security → build → deploy
- [ ] vitest gate pre-deploy (no merge si fail)
- [ ] Deploy previews por PR (`pr-N.deploy.aismartcontent.io`)
- [ ] PR approval obligatorio (1 reviewer min, 2 para auth/RLS/billing)
- [ ] npm audit + detect-secrets + snyk en CI
- [ ] Manual approval gate para migrations riesgosas a prod

#### Migrations
- [ ] `supabase` CLI instalado + linked
- [ ] `supabase db pull` baseline aplicado
- [ ] Commit baseline en `supabase/migrations/0000_*`
- [ ] Workflow doc para nuevas migraciones
- [ ] Apply automation desde CI a staging
- [ ] Manual approval para prod

#### Observability básica
- [ ] Sentry frontend deployed (DSN configurado)
- [ ] Sentry Netlify Functions deployed
- [ ] Better Stack uptime monitors:
  - [ ] `aismartcontent.io`
  - [ ] `console.aismartcontent.io`
  - [ ] `api.aismartcontent.io` (cuando exista)
- [ ] Status page público `status.aismartcontent.io`
- [ ] Alert routing a Slack (#incidents + #ops)

#### Backup
- [ ] Supabase PITR habilitado (7+ días)
- [ ] Hetzner snapshots semanales (`OPS-001`)
- [ ] Daily export logical dump a S3 (Cloudflare R2)
- [ ] Backup retention policy documented

#### On-call
- [ ] Better Stack on-call rotation configurado
- [ ] 2 personas en rotación semanal
- [ ] PagerDuty (Free tier) o equivalent
- [ ] Phone numbers verificados

#### Runbooks (mínimo Fase A)
- [ ] Supabase central outage
- [ ] Netlify outage
- [ ] DB caída
- [ ] Deploy rollback
- [ ] Security incident
- [ ] Data corruption sospechada
- [ ] Vendor outage (OpenAI/Anthropic)
- [ ] Mass exports inusuales

#### FinOps
- [ ] Cost dashboard mensual (Notion/Sheet base ok)
- [ ] Per-vendor breakdown (OpenAI, Anthropic, Apify, Supabase, Netlify, Hetzner, Cloudflare)
- [ ] Daily spending alerts >$X
- [ ] Per-org cost calculable
- [ ] OpenAI/Anthropic spend caps en proxy

#### Performance
- [ ] Web Vitals samples capturando (✅ ya hay)
- [ ] Lighthouse score >85 en views críticas
- [ ] Critical CSS extracted (✅ done)
- [ ] Service Worker activo (✅)
- [ ] Lazy load images
- [ ] Bundle size monitored

---

### Fase B — Distributed operations

#### CI/CD distribuido
- [ ] Deploy a N VMs via Ansible o ArgoCD
- [ ] Rolling deploy con canary (1 → 5% → 50% → 100%)
- [ ] Auto-rollback on error rate spike
- [ ] Cohort selection por tier/region/age

#### Migration runner distribuido
- [ ] Aplicar a N VMs concurrentemente
- [ ] Lock por VM durante apply
- [ ] Health check post-apply
- [ ] Pause rollout on error
- [ ] Dashboard "23/47 VMs migrated"

#### APM + tracing
- [ ] OpenTelemetry instrumented
- [ ] `trace_id` propagado frontend → API → DB → vendor
- [ ] Datadog APM o Sentry Performance deployed
- [ ] Distributed traces visibles para support

#### Observability avanzada
- [ ] Grafana Cloud (Prometheus) configurado
- [ ] Custom dashboards por dominio (api, db, gateway, billing)
- [ ] SLO dashboard
- [ ] Per-tenant dashboard (Tier-1)
- [ ] Web Vitals dashboard UI

#### Status page detallada
- [ ] Sub-status per servicio (api, console, integrations, AI)
- [ ] Histórico de incidentes
- [ ] Subscribe via email/RSS/webhook
- [ ] Custom domain `status.aismartcontent.io`

#### Backup avanzado
- [ ] WAL streaming continuous a R2 (Tier-1: per-VM)
- [ ] Cross-region replication para Tier-1
- [ ] Restore testing trimestral documentado
- [ ] DR drill tabletop anual

#### Capacity planning
- [ ] Forecasting mensual de growth
- [ ] Component bottleneck identification
- [ ] Pre-emptive upgrades para Tier-1
- [ ] Headroom 30%+ en componentes críticos

#### Maintenance windows
- [ ] Política definida (1×/mo max, 30 min max)
- [ ] Communication automation
- [ ] Coordinación cliente Tier-1

#### Multi-region prep
- [ ] Provisioner soporta `region` parameter
- [ ] Catálogos replication cross-region
- [ ] Latency monitoring multi-región

#### Cost controls
- [ ] Per-org budget caps enforced en gateway
- [ ] Daily cap alerts
- [ ] Vendor spike alerts (>120% baseline)
- [ ] FinOps weekly review

---

### Fase C — Enterprise operations

#### Multi-region operacional
- [ ] EU region (Falkenstein/Helsinki) live
- [ ] US region (Ashburn) live
- [ ] LatAm (Brasil/regional partner) live
- [ ] Customer can choose region en signup
- [ ] Data residency contractual cumplida

#### Auto-scaling
- [ ] Auto-scaling shared infra (Supabase plan upgrade automatable)
- [ ] Per-VM tier upgrades automated
- [ ] Pre-emptive scaling Tier-1

#### Kubernetes (si justifica)
- [ ] K8s cluster operacional
- [ ] CrunchyData operator para Postgres-per-tenant
- [ ] ArgoCD para deploys
- [ ] Helm charts versionados

#### SRE team
- [ ] 2-3 SREs contratados
- [ ] On-call follow-the-sun (3 zonas)
- [ ] Lead SRE / Director of Platform
- [ ] SLI/SLO ownership formal

#### DR avanzado
- [ ] DR drill anual completo
- [ ] RTO Tier-1 <30min validado
- [ ] RPO Tier-1 <5min validado
- [ ] Cross-region failover documented + tested

#### Cost optimization
- [ ] FinOps engineer / role
- [ ] Reserved capacity (Hetzner / AWS)
- [ ] Spot/preemptible para non-critical
- [ ] LLM cost engineering (prompt caching, batch, model selection)

#### Compliance evidence
- [ ] SOC 2 auto-evidence collection
- [ ] Quarterly access reviews
- [ ] Annual policy review
- [ ] Continuous compliance via Vanta/Drata

---

## B.2 Por dominio

### Deployment

```
[Source control]
- Git workflow: feature → staging → main
- Protected branches: main, staging
- PR template
- Conventional commits
- Squash merge para feature

[CI gates]
- Lint pass
- Tests pass (vitest unit + integration)
- Security scan pass
- Build success
- No regression in bundle size >10%
- Lighthouse score check

[Deploy]
- Preview per PR
- Staging auto-deploy on staging branch push
- Production: main + manual approval para migrations risky
- Rollback button en deploy notification

[Release notes]
- Auto-generated from commit messages
- Posted to #engineering + customer-facing changelog
- Major versions bumped en API
```

### Database operations

```
[Schema]
- All changes via supabase/migrations/
- Forward-only por default
- Backward-compatible window para riesgosos
- Tests aplicados a snapshot prod-like

[Performance]
- pg_stat_statements analysis weekly
- Top 20 slow queries reviewed monthly
- Index recommendations
- N+1 detection

[Maintenance]
- VACUUM ANALYZE scheduled
- Bloat monitored
- Connections monitored
- Replication lag (Tier-1 read replicas)
```

### Infrastructure

```
[Hetzner]
- Snapshots weekly (auto)
- Snapshot retention 30 días
- Tag per environment + tier
- Provisioner via API (no manual)
- LUKS encryption (Fase B)

[Cloudflare]
- DNS records audited monthly
- Tunnel configs in version control
- WAF rules reviewed
- Rate limiting per endpoint

[Netlify]
- Sites: main prod, staging, dev previews
- Functions: per region
- Edge functions opcional
- Build minutes monitored
```

### Observability stack

```
[Errors]
- Sentry frontend (browser errors)
- Sentry backend (Functions errors)
- Sentry ai-engine (Python errors)
- Source maps uploaded

[Tracing]
- OpenTelemetry instrumented
- Distributed traces visible
- Trace-to-log correlation
- Trace-to-metric correlation

[Metrics]
- Prometheus on each VM
- Push to Grafana Cloud central
- Custom dashboards per domain
- Alerts en thresholds

[Logs]
- Structured JSON
- Aggregated en Datadog Logs / Better Stack
- 30 días hot retention
- 1 año cold (compressed)

[Uptime]
- Better Stack monitors
- Multi-region check
- Public status page
- Custom alerts
```

### Backup & DR

```
[Backup matrix]
| Component | Method | Frequency | Retention |
|---|---|---|---|
| Supabase central | PITR | Continuous | 7-28 días |
| Supabase central | Snapshot S3 | Daily | 90 días |
| VM Postgres | WAL streaming | Continuous | 7 días |
| VM Postgres | pg_dump | Daily | 90 días |
| VM filesystem | Hetzner snapshot | Weekly | 30 días |
| Object storage | R2 versioning | On-write | 90 días |
| Code | GitHub | Push | Perpetual |

[Restore procedures]
- Documented runbook per scenario
- Restore testing quarterly
- DR drill annual
- RTO/RPO measured and tracked
```

### On-call

```
[Rotation]
- 2 personas mín
- Weekly rotation
- Coverage hours documented
- Backup if primary unavailable

[Tools]
- Better Stack on-call (Fase A)
- PagerDuty (Fase B+)
- Phone tree backup

[Process]
- ACK in 5min P1
- Status update in 15min P1
- Status page update in 30min P1
- Post-mortem in 5 business days

[Hand-off]
- Pre-shift summary in shared doc
- Outstanding issues documented
- Recent deploys flagged
```

### FinOps

```
[Tracking]
- Cost per vendor monthly
- Cost per service
- Cost per tenant
- Cost per active user

[Optimization]
- Reserved capacity where applicable
- Right-sizing weekly
- Unused resources cleanup
- LLM prompt caching

[Forecasting]
- 6-month projection updated monthly
- Component bottleneck identified
- Capacity planning per growth scenario
- Budget vs actual variance reported
```

### Customer success ops

```
[Health score]
- Calculated daily
- Bucketed (green/yellow/red)
- Auto-nudge yellow
- CSM outreach red

[Renewal]
- 90/60/30 days alerts
- Renewal playbook
- Negotiation framework

[Expansion]
- Usage signals identified
- Upsell triggers
- Cross-sell opportunities
```

---

## B.3 SLI/SLO tracker

| SLI | SLO Fase A | SLO Fase B | SLO Fase C | Current measurement |
|---|---|---|---|---|
| Control plane uptime | 99% | 99.9% | 99.95% | Not measured |
| VM org uptime | n/a | 99% | 99.9% (T1: 99.95%) | n/a |
| API gateway p95 | <1000ms | <500ms | <300ms | Not measured |
| 5xx error rate | <1% | <0.5% | <0.1% | Not measured |
| Webhook delivery | n/a | >95% | >99% | Not measured |
| LCP p75 | <2.5s | <2.0s | <1.5s | ~3s baseline |
| Sentry crash-free rate | >99% | >99.5% | >99.9% | Not deployed |
| Time-to-first-deploy | <30min | <15min | <10min | Not measured |
| MTTR P1 | <2h | <1h | <30min | Not measured |
| Backup success rate | 100% | 100% | 100% | 100% (snapshots) |

Updated mensualmente.

---

## B.4 Incident severity matrix

| Severity | Definición | Examples | Response time | Communication |
|---|---|---|---|---|
| **P1 Critical** | Production down or data loss | Supabase total outage, mass data deletion, security breach | ACK 5min, status 15min | Status page, customer email, post-mortem |
| **P2 High** | Severe degradation | 50%+ errors, latency 3× baseline, single tenant down | ACK 15min | Status page, internal Slack |
| **P3 Medium** | Partial degradation | Single feature broken, errors <10% | Next business hour | Internal Slack |
| **P4 Low** | Anomaly without user impact | Single VM warning, low priority bug | Next standup | Backlog |

---

## B.5 Runbook templates

### Template

```markdown
# Runbook: <scenario>

## Trigger
- What alert/situation triggers this runbook

## Severity
- P1/P2/P3/P4

## Affected components
- List

## Impact
- What users see
- What data is at risk

## Diagnosis (5min)
1. Step 1 to verify
2. Step 2
3. Decision tree

## Mitigation (15min)
1. Quick action to reduce impact
2. ...

## Resolution
1. Full fix
2. Verification

## Post-resolution
1. Verify metrics back to baseline
2. Communicate resolution
3. Open post-mortem if P1/P2

## Related
- Other runbooks
- Documentation links
```

### Runbooks que se deben tener escritos Fase A
- [ ] Supabase central outage
- [ ] Netlify outage
- [ ] DB connection pool exhausted
- [ ] OpenAI/Anthropic outage
- [ ] Apify outage
- [ ] Webhook backlog
- [ ] Failed deploy
- [ ] Security incident
- [ ] Data deletion request
- [ ] Customer locked out

### Runbooks adicionales Fase B
- [ ] VM org down
- [ ] Migration failure mid-rollout
- [ ] Cross-region replication lag
- [ ] Sub-processor breach notification
- [ ] DDoS attack

### Runbooks adicionales Fase C
- [ ] Multi-region failover
- [ ] BYOK key rotation
- [ ] SCIM provisioning error
- [ ] Compliance auditor request

---

*Apéndice anterior: [A · Checklist seguridad](./checklist-seguridad.md) · Apéndice siguiente: [C · Glosario](./glossary.md)*
