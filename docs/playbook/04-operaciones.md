---
chapter: 04
title: Operaciones de plataforma
part: IV — Operaciones
estimated_reading_time: 50 min
---

# 04 · Operaciones de plataforma

> "An incident isn't an emergency — it's a daily occurrence in any production system. What matters is how fast you detect it, how cleanly you respond, and how much you learn from it."
>
> Este capítulo cubre todo lo operacional: CI/CD, deploys, observability, backups, DR, runbooks, on-call, costo, performance. Es donde un SaaS bien diseñado se diferencia de uno frágil.

---

## 4.1 Principios operacionales

1. **Push a `main` no es deploy.** Hay un gate de CI antes. Hoy NO se cumple — bloqueante de Fase A (`OPS-010`).
2. **Staging existe y se parece a producción.** Hoy no existe — bloqueante de Fase A.
3. **Migraciones versionadas o no son producibles.** `supabase/migrations/` está vacío. Bloqueante de Fase A (`OPS-003`).
4. **Toda alerta tiene un runbook.** Si no hay runbook, no hay alerta — produce ruido sin acción.
5. **Toda métrica tiene un dueño.** Si nadie es responsable de mantenerla, no se mide.
6. **Falla detectable > falla silenciosa.** Preferir crash visible a degradación oculta.
7. **Cada cambio en producción es revertible.** Migraciones forward/backward, deploys con rollback, schema changes con downward-compatible windows.
8. **Documentar como lo que sabe el de turno, no como lo que sabe el que escribe.** Runbooks deben funcionar para alguien que despertó a las 3am.
9. **Costo es una métrica de operación.** FinOps no es opcional. Sin observar costo, se rompe la unit economics sin que se note.
10. **El cliente debe poder saber el estado de la plataforma sin escribirnos.** Status page pública (Fase A).

---

## 4.2 CI/CD — `OPS-010` (🔴 P0)

### 4.2.1 Estado actual
- Push a `main` → Netlify deploy automático a producción.
- vitest tests existen (smoke RLS + RPCs + endpoints) pero **NO son gate**.
- No hay staging environment separado.
- No hay deploy previews por feature branch.

### 4.2.2 Target Fase A

#### Branch model
```
main          ← producción (auto-deploy a prod después de gate)
staging       ← staging (auto-deploy a staging env)
feat/*        ← feature branches → deploy preview en Netlify
fix/*         ← bug fix branches
release/*     ← release candidate (opcional, cuando madure el flow)
```

#### CI pipeline (GitHub Actions)
```yaml
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - npm run lint
      - npm run prettier:check

  test:
    needs: lint
    runs-on: ubuntu-latest
    services:
      postgres: { image: supabase/postgres }
    steps:
      - npm run test          # vitest smoke
      - npm run test:rls      # RLS isolation tests
      - npm run test:rpc      # RPC contract tests

  security:
    runs-on: ubuntu-latest
    steps:
      - npm audit --audit-level=high
      - detect-secrets scan
      - snyk test (or equivalent)

  build:
    needs: [test, security]
    runs-on: ubuntu-latest
    steps:
      - npm run build
      - upload artifacts

  deploy-preview:
    if: github.event_name == 'pull_request'
    needs: build
    steps:
      - netlify deploy --dir=dist --alias=pr-${{ github.event.number }}

  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    needs: build
    steps:
      - apply supabase migrations to staging DB
      - netlify deploy --prod --site=staging.aismartcontent.io

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    needs: build
    steps:
      - apply supabase migrations to prod DB (with manual approval gate for risky migrations)
      - netlify deploy --prod
      - notify Slack #deploys
```

#### Gates obligatorios
- **No merge a `main` sin PR approval** (1 reviewer minimum, 2 para áreas críticas como auth/RLS/billing).
- **No merge sin tests verdes** + security scan limpio.
- **No deploy a prod sin staging green ≥24h.**

#### Deploy previews
- Cada PR → URL `pr-N.deploy.aismartcontent.io`.
- Bot comenta en PR con link.
- Útil para QA visual antes de merge.

### 4.2.3 Target Fase B — deploy distribuido a N VMs

Cuando empiece a haber VMs org (data plane):

```yaml
deploy-data-plane:
  needs: deploy-control-plane
  strategy:
    matrix:
      cohort: [canary, 5pct, 50pct, 100pct]
  steps:
    - select VMs for cohort (criterios: tier, region, last-deploy-age)
    - parallel: ssh + run update script en cada VM
    - health check post-deploy per VM
    - rollback automático si error rate > threshold
    - pause 30 min entre cohorts
```

Tooling sugerido:
- **Ansible** para deploy a VMs (simple, idempotente).
- **ArgoCD** si se migra a Kubernetes (Fase C).
- **GitHub Actions matrix** para paralelizar.

### 4.2.4 Anti-patrones CI/CD

- ❌ Deploy directo a prod sin staging. (Hoy ocurre — debe cambiar Fase A).
- ❌ Tests opcionales (skippable). Tests son gate o no existen.
- ❌ "We'll add tests later". Later nunca llega. Tests con la feature.
- ❌ `--no-verify` o `--force` para saltar checks. Si hook falla, se arregla la causa.
- ❌ Deploys manuales como práctica. Excepción solo para hotfix de prod down con post-mortem.

---

## 4.3 Schema migrations — `OPS-003` (🔴 P0)

### 4.3.1 Estado actual
- `supabase/migrations/` está **vacío**.
- Cambios SQL aplicados manualmente vía Management API o SQL Editor.
- Carpeta `SQL/` gitignored (memoria: `project_aismartcontent_sql_gitignored`).
- Sin baseline, sin reproducibilidad.

### 4.3.2 Target Fase A

**Bootstrap con Supabase CLI:**
```bash
supabase init
supabase link --project-ref buftwjpdycrahlbftinl
supabase db pull             # baseline desde prod
git add supabase/migrations/0000_baseline.sql
git commit -m "feat: baseline migrations from production"
```

**Workflow de nueva migración:**
```bash
# Crear nueva migración
supabase migration new add_audit_log_index

# Editar el archivo generado
# supabase/migrations/20260513120000_add_audit_log_index.sql

# Aplicar local (Docker)
supabase db reset           # reset + apply all

# Tests
npm run test:rls

# Commit + PR
git add supabase/migrations/20260513120000_add_audit_log_index.sql
git commit -m "feat: add index on user_audit_log(created_at)"
```

**Aplicar a staging/prod desde CI:**
```yaml
- name: Apply migrations to staging
  run: |
    supabase link --project-ref staging-ref
    supabase db push
```

### 4.3.3 Reglas para migraciones

1. **Forward-only por default.** No editar migración aplicada en prod. Si error → nueva migración correctiva.
2. **Backward-compatible window obligatorio para cambios riesgosos:**
   - DROP COLUMN: primero deprecate (no usar más en código) → deploy → próxima release drop.
   - RENAME: agregar columna nueva → backfill → cambiar lectura → cambiar escritura → drop vieja.
3. **No DDL durante hot-path traffic** para tablas grandes. Schedule en maintenance window.
4. **Lock-aware:** evitar locks largos. Para `ALTER TABLE ... ADD COLUMN` con default, usar:
   ```sql
   ALTER TABLE foo ADD COLUMN bar text;          -- no lock largo
   UPDATE foo SET bar = 'default' WHERE bar IS NULL;  -- batched
   ALTER TABLE foo ALTER COLUMN bar SET NOT NULL;     -- después
   ```
5. **Tests de migración** en CI: aplicar migración a clon de prod data, verificar:
   - No timeout.
   - Queries críticas siguen rápidas (regressión performance).
   - RLS policies siguen funcionando.

### 4.3.4 Target Fase B — migraciones a N VMs

Cada VM org tiene su propia DB con su propio set de migraciones (data plane).

**Runner distribuido:**
```python
# pseudo-code
def apply_migration_to_all_vms(migration_id):
    vms = get_active_org_servers()
    for vm in vms:
        acquire_lock(vm, migration_id)
        try:
            apply_migration(vm.ssh, migration_id)
            verify_health(vm)
            release_lock(vm)
        except Exception:
            rollback(vm)
            pause_rollout(reason=str(e))
            alert_oncall()
            return
    mark_migration_complete(migration_id)
```

Con observability: dashboard "Migration progress: 23/47 VMs complete, 2 failed, 22 pending".

---

## 4.4 Multi-region — 🟡 P2 (Fase C)

### 4.4.1 Cuándo importa
- Cliente EU exige datos en EU (GDPR Schrems II).
- Cliente US gov / regulated industry exige US-only.
- Cliente Brasil exige LGPD-compliant (típicamente Brasil region).
- Latencia: usuario en Asia → infra EU = 200-400ms RTT. Penaliza UX.

### 4.4.2 Estrategia de regiones

| Región | Hetzner DC | Use case |
|---|---|---|
| **EU** | Falkenstein, Helsinki | Default. EU clients. |
| **US** | Ashburn (USA-East) | US clients. |
| **LatAm** | (no Hetzner directo) — AWS São Paulo o partner local | Brasil/Argentina con latency low. |
| **Asia** | (no Hetzner) — AWS/GCP Singapore | Solo si cliente lo justifica. |

### 4.4.3 Arquitectura multi-region

**Control plane:**
- Una instancia maestra (EU por default por economía).
- Read replicas en otras regiones para queries low-latency.
- Writes solo en master.

**Data plane:**
- VM org se provisiona en la región del cliente (atributo `region` en `organizations`).
- Cliente puede pedir multi-region (VMs replicadas en N regiones, con sync DB).

**Gateway externo:**
- Edge entry vía Cloudflare → ruta al control plane.
- Per-org subdomain también pasa por Cloudflare → ruta a la VM org en su región.

### 4.4.4 Data residency contract

Cliente Tier-1 firma cláusula:
> "Customer data shall be stored and processed exclusively within {region} datacenter(s). No customer data shall traverse outside the agreed region without prior written consent."

Cómo se garantiza:
- VM org en `region` específica.
- Backups en mismo `region`.
- Logs en mismo `region`.
- Excepción: control plane metadata (org name, billing) puede estar central (notificar en DPA).

---

## 4.5 Observability

### 4.5.1 Stack target

| Capa | Tool | Cobertura |
|---|---|---|
| **Error tracking** | Sentry | Frontend + Netlify Functions + ai-engine + VM workers |
| **APM / tracing** | Datadog APM o Sentry Performance | End-to-end traces (frontend → API → DB) |
| **Metrics / dashboards** | Grafana Cloud (with Prometheus) | Infrastructure + app metrics |
| **Logs centralizados** | Better Stack o Datadog Logs | Structured logs cross-component |
| **Uptime externo** | Better Stack | Public-facing endpoints |
| **Status page pública** | Better Stack (free para basic) o Atlassian Statuspage | Customer visibility |
| **Real User Monitoring (RUM)** | Sentry RUM o LogRocket | Frontend perf real |
| **Web Vitals** | Custom dashboard sobre `frontend_errors` (ya hay samples) | Performance frontend |

### 4.5.2 SLI / SLO / SLA

#### Service Level Indicators (SLIs) — qué medimos

```
[Availability]
- Control plane uptime
- VM org uptime per tenant
- Gateway uptime
- Webhook ingress uptime
- Database availability

[Latency]
- API p50/p95/p99 per endpoint
- Gateway latency (excluyendo vendor)
- DB query latency
- LCP, FCP, INP (web vitals)

[Quality]
- 5xx error rate
- 4xx error rate (sin 401/403 esperados)
- Webhook delivery success rate
- LLM call success rate

[Saturation]
- CPU % per VM
- Memory % per VM
- Disk % per VM
- Postgres connections used vs max
- Storage % vs plan

[Business]
- Active orgs / mo
- Active users / org
- Missions created / mo
- Mission approval rate
- Vera response time
- Vera approval rate post-conversation
```

#### Service Level Objectives (SLOs) — qué prometemos internamente

| SLI | SLO Fase A | SLO Fase B | SLO Fase C |
|---|---|---|---|
| Control plane uptime | 99% | 99.9% | 99.95% |
| VM org uptime | n/a (no VM aun) | 99% | 99.9% (Tier-1: 99.95%) |
| API p95 latency | <1000ms | <500ms | <300ms |
| Gateway p95 latency | <500ms | <300ms | <200ms |
| 5xx error rate | <1% | <0.5% | <0.1% |
| Webhook delivery success | n/a | >95% | >99% |
| LCP p75 | <2.5s | <2.0s | <1.5s |

#### Service Level Agreement (SLA) — qué prometemos contractualmente

Solo prometer 80-90% del SLO interno. Margen de seguridad.

| Plan | SLA uptime |
|---|---|
| Free/Creator/Team | Best effort, no SLA. |
| Agency | 99% (no credits). |
| Enterprise | 99.5% (credits si <). |
| Tier-1 Dedicated | 99.9% (credits + escalation path). |

**Importante:** no prometer SLA antes de medir 90+ días continuos. Promete 99% (riesgo bajo) y supera. No 99.9% (~43min downtime/mes) sin red.

### 4.5.3 Alerting

#### Severity matrix

| Severity | Definición | Response |
|---|---|---|
| **P1 / Critical** | Servicio caído o data loss | Page on-call inmediato. Slack #incidents. Status page update. |
| **P2 / High** | Degradación severa (>50% errors, latency 3× baseline) | Slack #incidents. On-call respond <15min. |
| **P3 / Medium** | Degradación parcial o métricas fuera de SLO | Slack #ops. Investigate next business hour. |
| **P4 / Low** | Anomalía sin impacto user | Slack #ops. Triage en standup. |

#### Alert routing

- **Better Stack** uptime → on-call rotation via PagerDuty / Better Stack call.
- **Sentry** error rate spike → Slack #engineering + email lead.
- **Grafana** SLO breach → PagerDuty (P1/P2) o Slack (P3/P4).
- **Stripe** payment failures → Slack #revenue + email finance.

#### Alert fatigue prevention
- Threshold con histeresis (no alert por 1 spike).
- Grouping (10 errors en 1 min = 1 alert, no 10).
- Mute conocidos (vendor outages mientras se aceptan).
- Quincenal review de alerts: cuáles dispararon, cuáles fueron actionable.

### 4.5.4 Logging guidelines

**Structured logs (JSON) obligatorio:**
```json
{
  "timestamp": "2026-05-13T15:23:01.123Z",
  "level": "info",
  "service": "ai-engine.gateway",
  "request_id": "req_abc123",
  "org_id": "uuid-...",
  "user_id": "uuid-...",
  "event": "openai.completion",
  "duration_ms": 542,
  "cost_usd": 0.0023,
  "model": "gpt-4o-mini",
  "status": "success"
}
```

**Niveles:**
- `error`: algo falló y requiere atención.
- `warn`: degradación o suposición violada.
- `info`: event significativo (business event, user action).
- `debug`: detalle para troubleshoot (off en prod).

**NO logear:**
- Passwords, API keys, tokens.
- PII de clientes finales (emails, IPs en mensajes).
- Full request/response bodies (resúmenes solamente).

### 4.5.5 Distributed tracing

Con OpenTelemetry:
- Frontend genera `trace_id` per request.
- Pasa como `X-Trace-Id` header.
- Netlify Function lo propaga al control plane.
- Control plane lo propaga al gateway.
- Gateway lo propaga al vendor llamado.
- Cuando el vendor responde, todo viene de vuelta con el mismo `trace_id`.
- Sentry/Datadog reconstruye el flow end-to-end.

Permite responder: "el usuario X tuvo error a las 14:23, ¿qué pasó?" en <30s sin grep manual.

---

## 4.6 Status page pública — `OPS-002` (🟠 P1 Fase A)

### 4.6.1 Por qué importa
- Cuando hay outage, el cliente no llama si la status page le confirma que ya sabemos.
- Comunica profesionalismo. Cliente Tier-1 lo busca antes de firmar.
- Histórico de incidentes construye confianza (transparencia).

### 4.6.2 Implementación

**Better Stack Status Page** (free para basic, $29/mes para custom domain):
- URL: `status.aismartcontent.io`.
- Monitores en:
  - `aismartcontent.io` (landing).
  - `console.aismartcontent.io` (app).
  - `api.aismartcontent.io` (cuando exista).
  - Gateway endpoints.
  - Webhook ingress.
- Cada VM org tiene su sub-status page interno (no público).

### 4.6.3 Comunicación de incidentes

**Plantilla:**
```
[INVESTIGATING] We're investigating elevated error rates affecting dashboards.
First detected: 2026-05-13 14:23 UTC.
Affected: dashboards "Mi Marca" and "Competencia".
Workaround: refresh in 5 min.
```

```
[IDENTIFIED] Root cause: Supabase connection pool exhaustion.
Working on fix.
```

```
[MONITORING] Fix deployed. Error rate returning to baseline. Monitoring.
```

```
[RESOLVED] Incident resolved. Duration: 47 min. Postmortem in 5 business days.
```

Postmortem público (anonimizado) para incidentes >30 min P1/P2.

---

## 4.7 Backup, restore, disaster recovery

### 4.7.1 Backup strategy

#### Control plane (Supabase central)
- **PITR (Point-in-Time Recovery)** habilitado (Supabase Pro+ feature).
- Retention: 7 días en Pro, 14 días en Team, 28 días en Enterprise.
- Daily snapshots adicionales export a S3-compatible (90 días retention).

#### Data plane (VMs Hetzner)
- **Snapshots Hetzner** semanales (`OPS-001`) — retention 30 días.
- **WAL streaming continuous** a S3 (Cloudflare R2 o Wasabi) — retention 7 días para PITR de la VM.
- **Logical dumps diarios** vía `pg_dump` → S3 — retention 90 días.

#### Storage (assets, videos)
- VM local storage → CDN sync (Cloudflare R2).
- R2 con versioning habilitado.
- Cross-region replication para Tier-1.

### 4.7.2 RTO / RPO

| Tier | RTO target | RPO target |
|---|---|---|
| Shared (Free/Creator/Team/Agency) | 4h | 1h |
| Enterprise | 1h | 15 min |
| Tier-1 Dedicated | 30 min | 5 min |

RTO = max time hasta restaurar servicio.
RPO = max data loss aceptable.

### 4.7.3 Disaster recovery — runbook

#### Escenario A: Supabase central caído
1. ACK on-call.
2. Confirmar con Supabase status page.
3. Si Supabase resuelve <30 min → esperar + comunicar via status page.
4. Si >30 min → considerar failover a réplica (si configurada).
5. Si data loss → restore PITR a último point antes de la falla.
6. Post-mortem.

#### Escenario B: VM org caída
1. ACK on-call.
2. SSH a VM via Hetzner console (si network up).
3. Si OS caído → reboot.
4. Si VM perdida → provisionar nueva, restore último snapshot.
5. Si data corrupto → restore + replay WAL.
6. Comunicar al cliente afectado.

#### Escenario C: Hetzner Falkenstein DC caído
1. ACK on-call + Hetzner status.
2. Esperar update Hetzner.
3. Si confirmado outage prolongado (>2h):
   - Failover VMs críticas (Tier-1) a Helsinki o Ashburn via snapshot restore.
   - Cliente shared infra: degraded mode (read-only desde réplica si configurada).
4. Comunicar status page.
5. Post-incident: revisar criterios de multi-region para Tier-1.

#### Escenario D: Data breach detectado
- Ver capítulo 03.9.7.

#### Escenario E: Ransomware en VM
- Aislar VM (firewall off network excepto SSH).
- Snapshot forense.
- Restore desde último snapshot pre-infection.
- Investigación + post-mortem.
- Notificación cliente afectado (DPA breach SLA).

### 4.7.4 Restore testing — `OPS-001` extension

**Trimestralmente:**
- Restore aleatorio de una VM a entorno staging.
- Verificar integridad.
- Documentar tiempo real vs RTO target.
- Actualizar runbook si gap detectado.

**Anualmente:**
- Tabletop exercise DR completo (simulación full outage Hetzner).
- Equipo participa, mide RTO/RPO real.

---

## 4.8 On-call rotation

### 4.8.1 Fase A (1-3 personas técnicas)
- **Primary on-call**: CTO + 1 senior backend.
- **Schedule**: weekly rotation.
- **Coverage**: business hours estricto + emergencias 24/7 limitadas (P1 critical only).
- Tool: Better Stack on-call (incluido).

### 4.8.2 Fase B (4-6 personas)
- **Primary + secondary**: 2 personas, rotación semanal.
- **Coverage**: 24/7 con backup.
- **Hand-off**: pre-shift summary en doc compartido.

### 4.8.3 Fase C (10+ personas)
- **Follow-the-sun**: 3 zonas geográficas.
- **Tiered support**: L1 (operator) → L2 (engineer) → L3 (SME).
- Tool: PagerDuty (Free → Business).

### 4.8.4 On-call playbook

**Cuando page:**
1. ACK page <5 min.
2. Comunicar en #incidents: "I'm on it, investigating".
3. Asignar Incident Commander (IC) si P1/P2 — coordina + comunica.
4. Trabajar el runbook applicable.
5. Si no hay runbook o no resuelve → escalar a L2/L3.
6. Status page update cada 30 min mínimo durante P1.
7. Resolución → post-mortem doc abierto.

**Post-mortem:**
- Blameless culture: no busca culpables, busca mejoras de sistema.
- Plantilla:
  - Timeline.
  - Impact (cuánto tiempo, cuántos usuarios, qué se perdió).
  - Root cause (5 whys).
  - Action items con owners + deadlines.
- Compartir en Slack + agendar review.

---

## 4.9 FinOps — Cost monitoring

### 4.9.1 Por qué importa

LatAm SaaS premium pierde dinero por:
- LLM cost descontrolado (incident `project_openclaw_gateway_leak` documentado: $7 en 24h).
- VMs Hetzner facturadas pero idle.
- Storage R2 con basura nunca limpiada.
- Apify quotas exhaustas (`BUG-003` documentado).

**Sin FinOps activo, la unit economics se rompe sin notar.**

### 4.9.2 Métricas a trackear

```
[Per vendor]
- OpenAI USD/día/org
- Anthropic USD/día/org
- Apify USD/día/org
- KIE/Kling USD/día/org
- Meta API: free pero count requests para no exceder rate

[Per service]
- Supabase: storage GB, DB size, egress, function invocations
- Netlify: function invocations, bandwidth, build minutes
- Hetzner: VM cost, snapshot cost, traffic egress
- Cloudflare: requests, R2 storage + reads + writes
- Resend: emails sent
- Sentry: events stored
- Better Stack: monitors + log volume

[Per tenant]
- Total infra cost / org / month
- Total infra cost / active_user / month
- LLM cost / mission generated
- Apify cost / signal captured
```

### 4.9.3 Dashboards y alertas

**Dashboard FinOps mensual:**
- Total OPEX vs budget.
- Per-vendor breakdown.
- Per-tier cost per active org.
- Margin per tier (revenue - cost).
- Outliers: orgs con cost 10× promedio.

**Alertas:**
- Vendor cost >120% del mes anterior → review.
- Single org >$X/día → investigate (abuso o config mal).
- Apify daily spend >80% quota → throttle + alert.
- OpenAI/Anthropic spike >300% baseline → cap automático + alert.

### 4.9.4 Cost controls — `FEAT-015`

**Pre-flight estimation:**
- Antes de ejecutar operación cara (video gen, batch LLM), mostrar estimated cost.
- User confirma con `confirm()` o equivalente.
- Already in backlog as `FEAT-015`.

**Per-org budget caps:**
- `plans.daily_cap_usd` por servicio.
- Gateway rechaza requests si excede.
- Soft cap = warning + degrade. Hard cap = block.

**Auto-throttle:**
- Si vendor account spend >80% diario → throttle next requests.
- Recovery: next day quota reset.

---

## 4.10 Performance

### 4.10.1 Frontend performance

#### Web Vitals (hoy ya hay samples en `frontend_errors`)

| Metric | Target Fase A | Target Fase B | Target Fase C |
|---|---|---|---|
| LCP p75 | <2.5s | <2.0s | <1.5s |
| FCP p75 | <1.8s | <1.5s | <1.0s |
| INP p75 | <200ms | <100ms | <50ms |
| CLS | <0.1 | <0.05 | <0.05 |
| TTFB p75 | <800ms | <500ms | <300ms |

#### Optimizations done (commits 2026-05-12)
- Critical CSS extracted.
- Prefetch idle navigation.
- Content-visibility lazy.
- Service Worker cache.
- Lazy load images.

#### Pending
- Web Vitals dashboard UI (ya documentado en `ROADMAP-POST-OPTIMIZATION-2026-05-12`).
- Image srcset con Supabase Pro Image Transform (cuando justificable).
- Code splitting más agresivo por route.
- HTTP/2 push (donde Netlify lo soporte).

### 4.10.2 Backend performance

#### Query optimization
- `pg_stat_statements` analysis weekly.
- Top 20 slowest queries → review monthly.
- Index recommendations via Postgres advisors.
- N+1 detection en Netlify Functions logs.

#### Connection pooling
- Supabase incluye pooler (PgBouncer).
- Verificar `max_connections` vs uso (especialmente bajo load).

#### Caching layer
- Redis para session cache (Fase B).
- Cloudflare cache para responses públicas (landing, docs).
- HTTP cache headers en API (Cache-Control, ETag).

### 4.10.3 LLM / Vera performance

#### Token consumption
- Cache de embeddings (hash → vector).
- Prompt caching (Anthropic supporta) — reduce 90% input tokens.
- Truncar context histórico cuando excede límite (recent + summary).

#### Vera response time
- Target: <5s primera token p95.
- Streaming response (no esperar full).
- Background prefetch de context build.

---

## 4.11 Capacity planning

### 4.11.1 Métricas por componente

| Componente | Métrica | Threshold scale-up |
|---|---|---|
| Postgres central | Connections used / max | >70% |
| Postgres central | Storage GB / plan max | >80% |
| Postgres central | Replica lag | >5s |
| Netlify Functions | Invocations / mo / quota | >80% |
| Hetzner VM | CPU % | >70% sustained |
| Hetzner VM | RAM % | >80% sustained |
| Hetzner VM | Disk % | >75% |
| Cloudflare R2 | Storage GB | >budget |

### 4.11.2 Forecasting

Mensual:
- Trend de active orgs, signals/día, missions/día.
- Proyección 6 meses adelante.
- Identificar componente que será cuello primero.
- Plan upgrade (Supabase Pro → Team → Enterprise, Hetzner CCX23 → CCX33 → CCX43).

### 4.11.3 Auto-scaling

- Netlify Functions: auto (managed).
- Supabase: manual upgrade (con maintenance window).
- Hetzner VMs: manual (con `provisioner upgrade` endpoint).
- Tier-1: pre-emptive provisioning de VM más grande antes que el cliente note degrade.

---

## 4.12 Maintenance windows

### 4.12.1 Política

- **Comunicación**: 7 días antes vía email + status page.
- **Frecuencia**: máximo 1× por mes para shared infra.
- **Duración**: max 30 min (Enterprise+ no acepta más).
- **Horario**: domingo 03:00-04:00 UTC (impacto mínimo).
- **Tier-1**: maintenance coordinada con cliente; nunca sin aviso.

### 4.12.2 Actividades típicas
- Major Postgres version upgrades.
- Schema migrations grandes que requieren lock prolongado.
- Hetzner host moves.

---

## 4.13 Checklist de cierre por fase

### Fase A
- [ ] CI/CD con tests gate + staging environment.
- [ ] Schema migrations en `supabase/migrations/` versionadas.
- [ ] Sentry frontend + Netlify Functions.
- [ ] Better Stack uptime + status page pública.
- [ ] Hetzner snapshots semanales.
- [ ] On-call rotation 2 personas.
- [ ] Runbooks documentados: DB caída, Supabase outage, deploy roto, security incident.
- [ ] FinOps dashboard mensual.

### Fase B
- [ ] Deploy distribuido a N VMs (Ansible o ArgoCD).
- [ ] Migrations runner distribuido.
- [ ] APM con tracing distribuido.
- [ ] Restore testing trimestral.
- [ ] SIEM agregando logs.
- [ ] Webhook delivery monitoring + dead letter.
- [ ] SLO/SLA medidos y reportados.

### Fase C
- [ ] Multi-region operacional (EU + US + LatAm).
- [ ] Kubernetes (si justifica) + CrunchyData operator.
- [ ] Auto-scaling per VM tier.
- [ ] DR drills anuales.
- [ ] Capacity forecasting automático.
- [ ] SOC 2 evidence collection automated.

---

## 4.14 Lectura corta

- **CI/CD Fase A**: staging branch + vitest gate + deploy previews + GitHub Actions.
- **Migraciones versionadas** (`OPS-003`) son blocking. Sin esto no hay rollback.
- **Observability stack**: Sentry + Datadog/Grafana + Better Stack + RUM. Distributed tracing.
- **SLO ≠ SLA**: SLO interno (~99.9% Fase B), SLA contractual (~99.5% Fase B). Margin.
- **Backups + restore**: PITR Supabase + snapshots Hetzner + WAL streaming. Restore testing trimestral.
- **On-call**: rotación, runbooks, post-mortems blameless.
- **FinOps**: per-vendor, per-tenant cost. Caps automáticos. Alertas spike.
- **Performance**: Web Vitals (samples ya), query opt, caching layered.
- **Maintenance windows**: 1×/mes max, anuncio 7 días, max 30 min.
- **Anti-patrones**: deploy directo sin staging, tests opcionales, manuales, runbooks faltantes, alerts sin owner.

---

*Capítulo siguiente: [05 · Producto enterprise](./05-producto-enterprise.md)*
