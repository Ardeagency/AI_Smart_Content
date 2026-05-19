---
chapter: 02
title: Arquitectura federada — Control Plane / Data Plane
part: II — Arquitectura técnica
estimated_reading_time: 60 min
---

# 02 · Arquitectura federada — Control Plane / Data Plane

> Este capítulo define **la arquitectura técnica target** de AI Smart Content. Es el plano que cualquier decisión de implementación debe respetar. El producto actual no cumple esto al 100% — el roadmap (capítulo 08) describe cómo se llega.

---

## 2.1 La decisión arquitectónica fundamental

AI Smart Content adopta el patrón **Control Plane / Data Plane** (también llamado "federated tenancy" o "instance-per-tenant" para tiers altos).

Es el modelo que usan los SaaS B2B premium del mundo:

| Empresa | Modelo | Revenue ARR (ref) |
|---|---|---|
| **ServiceNow** | Instance-per-tenant (VM dedicada) | $11B |
| **Snowflake** | Control plane central + virtual warehouses por cuenta | $3.6B |
| **MongoDB Atlas** | Control plane central + clusters dedicados | $2B |
| **Confluent Cloud** | Control plane + Kafka clusters dedicados | $900M |
| **Workday** | Tenant-per-instance | $7B |
| **Salesforce Hyperforce** | Org-isolated + per-region dedicated | $34B |
| **PlanetScale** | Control plane + DB branches por org | $30M |

**No es exótico. Es el estándar enterprise.**

---

## 2.2 Diagrama maestro

```
        ┌──────────────────────────────────────────────────────────────────┐
        │  CONTROL PLANE  —  ai-engine central + Postgres central          │
        │  (Hetzner CCX33 redundante × 2, idealmente activo/pasivo)         │
        │                                                                    │
        │  ┌────────────────────────────────────────────────────────────┐   │
        │  │ Postgres central (Supabase Pro+ o self-hosted)             │   │
        │  │  • users, sessions, user_audit_log                          │   │
        │  │  • organizations, organization_members, invitations          │   │
        │  │  • plans, subscriptions, credit_packages, credit_usage      │   │
        │  │  • org_servers (registry de VMs activas)                    │   │
        │  │  • api_keys, webhook_subscriptions                          │   │
        │  │  • trends_topics global, trends_category_templates          │   │
        │  │  • external_api_cache (cache cross-tenant)                  │   │
        │  │  • dimension_lexicon (catálogo distribuido a VMs)           │   │
        │  └────────────────────────────────────────────────────────────┘   │
        │                                                                    │
        │  ┌────────────────────────────────────────────────────────────┐   │
        │  │ Servicios del control plane                                 │   │
        │  │  • Gateway APIs externas (Apify/OpenAI/Anthropic/KIE/Kling) │   │
        │  │  • Webhook ingress (Meta, Shopify, GA4, YouTube)            │   │
        │  │  • OAuth broker (handshake → token cifrado a VM)            │   │
        │  │  • Trends Engine global discovery                           │   │
        │  │  • Provisioner (Hetzner Cloud API + cloud-init)             │   │
        │  │  • Sync orchestrator (gRPC + Postgres logical replication)  │   │
        │  │  • Billing reconciler                                       │   │
        │  └────────────────────────────────────────────────────────────┘   │
        └─────────┬────────────────────────────────────────────┬────────────┘
                  │ JWT firmado, scope=org_id                  │
                  │ gRPC firmado, mTLS                          │
                  │ Postgres logical replication (catálogos)    │
                  │                                             │
            ┌─────┼─────────────┐                  ┌────────────┼─────────┐
            ▼                  ▼                  ▼                       ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       ┌──────────────┐
    │ DATA PLANE   │   │ DATA PLANE   │   │ DATA PLANE   │       │ DATA PLANE   │
    │ VM org Coca  │   │ VM org Oster │   │ VM org Posto │  ...  │ VM org N     │
    │ Hetzner      │   │ Hetzner      │   │ Hetzner      │       │ Hetzner      │
    │ Falkenstein  │   │ Helsinki     │   │ Falkenstein  │       │ Ashburn      │
    │ ─────────────│   │              │   │              │       │              │
    │ • PG local   │   │ • PG local   │   │ • PG local   │       │ • PG local   │
    │ • pg_cron    │   │ • pg_cron    │   │ • pg_cron    │       │ • pg_cron    │
    │ • Worker     │   │ • Worker     │   │ • Worker     │       │ • Worker     │
    │ • Vera Opus  │   │ • Vera Opus  │   │ • Vera Opus  │       │ • Vera Opus  │
    │ • Sensors    │   │ • Sensors    │   │ • Sensors    │       │ • Sensors    │
    │ • Scheduler  │   │ • Scheduler  │   │ • Scheduler  │       │ • Scheduler  │
    │ • Storage    │   │ • Storage    │   │ • Storage    │       │ • Storage    │
    │ • CF Tunnel  │   │ • CF Tunnel  │   │ • CF Tunnel  │       │ • CF Tunnel  │
    └──────────────┘   └──────────────┘   └──────────────┘       └──────────────┘
```

---

## 2.3 Qué corre en el Control Plane

### 2.3.1 Postgres central — schema

**Tablas que viven SOLO en control plane:**

```sql
-- Identidad
users
sessions
user_audit_log                  -- audit cross-tenant
mfa_enrollments
sso_configurations              -- SAML/OIDC por org

-- Tenancy
organizations                    -- metadata (no brand data)
organization_members
organization_invitations
organization_features            -- feature flags por org
organization_settings            -- settings org-level

-- Servers registry
org_servers                      -- qué VM corresponde a qué org, su IP, su región, su status
org_server_provisioning_events   -- lifecycle events

-- Billing
plans
subscriptions
credit_packages
credit_usage                     -- agregado, no por evento; los eventos viven en VM
storage_usage                    -- agregado
invoices
payment_methods
payment_attempts

-- Plataforma para devs
api_keys                         -- API keys por org
webhook_subscriptions            -- webhooks salientes que el cliente subscribió
api_rate_limits

-- Trends globales (datos públicos agregados, no tenant-specific)
trends_topics
trends_category_templates
emerging_patterns
viral_predictions
country_aliases

-- Catálogos compartidos (publicados a VMs)
dimension_lexicon
classifier_blacklist
commercial_query_qualifiers
intent_classifier_rules
provocative_brand_exceptions

-- Cache cross-tenant
external_api_cache               -- responses HTTP cacheables sin contexto sensible
```

### 2.3.2 Servicios del control plane

#### A) Gateway de APIs externas

Patrón ya validado con `FEAT-014` (Anthropic proxy). Extender a:

```
POST /gateway/apify/actor/run
POST /gateway/openai/completions
POST /gateway/openai/embeddings
POST /gateway/anthropic/messages    (ya existe — FEAT-014)
POST /gateway/kie/video/create
POST /gateway/kling/video/create
GET  /gateway/meta/graph/...
```

**Comportamiento del gateway:**
1. Verifica JWT de la VM org caller. Scope debe incluir `org_id`.
2. Lee `plans.daily_cap_*` y `credit_usage` agregado para esa org.
3. Si excede cap → 402 Payment Required, no llama vendor.
4. Aplica dedupe oportunista: si N VMs piden la misma query genérica en ventana < 60s, sirve cache.
5. Llama al vendor (Apify/OpenAI/etc.) con cuenta maestra o BYOK del cliente si aplica.
6. Loguea: `org_id, endpoint, cost_usd, latency_ms, request_id, vendor_request_id`.
7. Decrementa `credit_usage`.
8. Devuelve resultado a VM caller.

#### B) Webhook ingress

URLs públicas que reciben webhooks de vendors:
- `POST /webhooks/meta/{org_short_id}` — Meta page mentions, comment notifications.
- `POST /webhooks/shopify/{org_short_id}` — orders, products updates.
- `POST /webhooks/ga4` — GA4 conversions.

**Flujo:**
1. Valida firma HMAC del vendor.
2. Verifica replay protection (timestamp dentro de ventana, idempotency key).
3. Identifica `org_id` desde URL o payload.
4. Forward al endpoint privado de la VM org correspondiente (vía CF Tunnel o gRPC).
5. Persiste en `integration_webhooks_log` central (solo metadata, no payload completo).
6. ACK al vendor (200 OK).

#### C) OAuth broker

Para conexiones Meta/Google/Shopify:
1. Cliente click "Conectar Meta" en frontend → redirect a `/oauth/meta/start?org_id=X`.
2. Control plane redirige a OAuth de Meta con state firmado.
3. Meta callback → control plane recibe code.
4. Control plane intercambia code → token.
5. Control plane envía token cifrado (AES-256-GCM) a la VM org vía gRPC.
6. VM org persiste token en su `integration_credentials` local.
7. Control plane **borra** el token de su memoria. **No persiste.**
8. Cualquier llamada futura a Meta sale **desde la VM org** con su token local.

#### D) Trends Engine global

Único componente que mantiene visión cross-tenant. Razón: detectar virality global requiere ver agregado.

Corre:
- `trend_discovery` (cada hora) — scrapea sources públicos (Twitter trends, Google Trends, TikTok discover).
- `viral_prediction` (cada 6h) — scoring de trends emergentes.
- `targeted_trend_signal` (per-VM trigger) — cuando un trend matchea categoría de una brand, **notifica** a la VM org. La VM org corre `build_full_brand_intelligence_context` localmente para decidir si es relevante.

**Crítico:** trends globales NUNCA incluyen data del cliente. Solo datos públicos agregados.

#### E) Provisioner

Servicio que crea/destruye VMs vía Hetzner Cloud API.

```
POST /provisioner/create
  body: { org_id, region, plan_tier, ssh_keys, image_id }
  effect: crea VM, cloud-init instala stack, registra en org_servers, devuelve IP
  duration: 5-10 min (con warm pool: <60s)

POST /provisioner/destroy
  body: { org_id, retain_snapshot: true }
  effect: snapshot final, destroy VM, libera IP, marca org_servers.status=destroyed

POST /provisioner/upgrade
  body: { org_id, new_type: "ccx33" }
  effect: snapshot, destroy old, create new, restore snapshot, swap IP

GET /provisioner/health/{org_id}
  effect: heartbeat de la VM, last_seen, version, metrics
```

**Warm pool:** mantener 3-5 VMs pre-creadas por región esperando asignación. Reduce onboarding de 5-10 min a <60s.

#### F) Sync orchestrator

Mantiene catálogos consistentes entre central y VMs.

- **Push** (central → VMs): cuando se actualiza `dimension_lexicon`, `trends_category_templates`, plans, features → broadcast a todas las VMs activas.
- **Pull** (VMs → central): cada VM ejecuta `pull_catalogs()` al boot y cada 1h.
- **Reconciliation**: nightly job que verifica checksums por catálogo. Si mismatch → re-sync.

Tech: gRPC streaming + Postgres logical replication para tablas grandes.

#### G) Billing reconciler

- Cada hora: agrega `credit_usage` event-level del control plane (gateway calls).
- Cada hora: pulls heartbeat de VMs → agrega `storage_usage` y `internal_cost` (CPU/RAM).
- Cada día: ejecuta billing rules → genera `invoices` borrador.
- Cada mes: emite invoices oficiales vía Stripe + factura electrónica DIAN si cliente Colombia.

---

## 2.4 Qué corre en el Data Plane (VM org)

### 2.4.1 Postgres local — schema

**Tablas que viven en CADA VM org:**

```sql
-- Brand context
brand_containers
brand_profiles
brand_assets, brand_fonts, brand_colors, brand_places, brand_rules

-- Productos / catálogo del cliente
products
product_variants
options
brand_entities
services
business_units
business_unit_products

-- Inteligencia de mercado (per-tenant)
intelligence_entities            -- competidores, targets de este tenant
intelligence_signals
brand_posts
brand_content_analysis
competitor_ads
retail_prices
url_watchers
visual_references
trend_topics                     -- relevantes para este tenant (filtered desde global)
audience_demand_signals
targeted_trend_signals

-- Vera operacional
vera_pending_actions
body_missions
mission_runs
agent_queue_jobs
ai_conversations
ai_messages
ai_brand_vectors
ai_global_vectors                -- embeddings, no datos crudos
audience_segments
brand_audience_heatmap
brand_analytics_snapshots
brand_vulnerabilities

-- Vera memory
vera_memory_banks                -- identidad, brand_thinking, content_strategy, data_protocol, platform_knowledge per-tenant

-- Integraciones del tenant
integration_credentials          -- tokens Meta/Google/Shopify cifrados localmente
integration_webhooks_log         -- log de webhooks recibidos
monitoring_triggers              -- qué sensores corren con qué cadencia
sensor_runs

-- Eventos de uso (event-level, agregado se envía a central)
credit_usage_events              -- cada call a gateway, event-level
storage_events                   -- cada upload/delete

-- Auditoría local
frontend_errors
developer_logs
system_metrics                   -- self-monitoring de la VM
```

### 2.4.2 Servicios en VM org

#### A) Worker FastAPI (puerto interno 8000)

Endpoints:
```
POST /jobs/enqueue
GET  /jobs/{job_id}
POST /sensors/run/{sensor_name}
POST /vera/strategist/execute
POST /missions/approve
POST /missions/reject
GET  /health
GET  /metrics                   # Prometheus
```

Solo accesible:
- Localmente (localhost).
- Desde el frontend del cliente vía CF Tunnel + auth JWT.
- Desde control plane via gRPC + mTLS.

#### B) Vera strategist

- Recibe `intelligence_signals` recientes.
- Llama LLM (vía gateway control plane → Anthropic).
- Genera `vera_pending_actions` con propuestas.
- Espera aprobación humana en UI.
- Si aprobada → action-executor produce contenido.

#### C) Sensores

13 sensores documentados en `docs/platform/sensor-types-catalog.md`:
- brand-listener (Meta posts del propio brand)
- ga4-pull (analytics)
- youtube-pull
- competitor-monitor
- retail-price-watcher
- url-watcher
- threat-detector
- audience-alignment
- brand-indexer (embeddings)
- mission-generator
- trends-correlation
- visual-references-fetcher
- conversion-tracker

Cada sensor corre con su cadencia (via pg_cron en VM):
- Diarios: brand-listener, ga4-pull, youtube-pull.
- Horarios: competitor-monitor, retail-price-watcher.
- Cada 5 min: mission-generator.
- Cada 15 min: trends-correlation.
- On-demand: brand-indexer, threat-detector.

#### D) Scheduler

pg_cron schedule centralizado en la DB local:
```sql
SELECT cron.schedule('sensors-daily', '0 6 * * *', $$
  SELECT enqueue_daily_sensors();
$$);

SELECT cron.schedule('mat-views-refresh-5min', '*/5 * * * *', $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_health;
$$);
```

#### E) Storage local

Cada VM tiene su disco con `/data/storage/{org_id}/...`:
- Assets generados (imágenes, videos KIE).
- Embeddings caches.
- Snapshot buffer pre-upload.

Cuando se vence el cuota (`plans.storage_mb`), el sistema rechaza nuevos uploads.

Para Tier-1: replicación a S3-compatible (Cloudflare R2) por backup + CDN.

#### F) Cloudflare Tunnel

Cada VM expone su worker FastAPI vía CF Tunnel a un subdomain único:
```
{org_short_id}.workers.aismartcontent.io
```

El frontend del cliente conecta a su subdomain con JWT firmado por control plane. No hay IP pública directa de la VM.

---

## 2.5 Cómo viaja la información

### 2.5.1 Sync de catálogos (control → VMs)

Cuando se actualiza `dimension_lexicon` en central:

1. Trigger AFTER UPDATE en central inserta evento en `catalog_sync_queue`.
2. Sync orchestrator lee la cola y envía gRPC stream a todas las VMs activas:
   ```
   StreamCatalogUpdate {
     catalog_name: "dimension_lexicon",
     operation: "upsert",
     rows: [...]
   }
   ```
3. VM aplica vía función Postgres `apply_catalog_update(catalog_name, rows)`.
4. VM responde con checksum post-aplicación.
5. Central verifica checksum match.

### 2.5.2 Eventos de uso (VM → central)

Cada llamada al gateway desde una VM:

1. VM hace `POST /gateway/openai/completions` con JWT.
2. Gateway resuelve, llama OpenAI, retorna.
3. VM recibe response.
4. **En paralelo:** gateway escribe `credit_usage_events` en central (cost_usd, request_id, org_id).
5. Cada hora: billing reconciler agrega events → actualiza `credit_usage` agregado.

### 2.5.3 Trends globales (central → VMs targeted)

1. Control plane descubre trend "Carnaval Barranquilla viral".
2. Match contra `trends_category_templates` → categoría "evento regional Colombia".
3. Query: ¿qué orgs tienen brand_containers con relevant_categories que incluyan "evento Colombia"?
4. Para cada match → push notification a VM org:
   ```
   PushTrendSignal {
     trend_id: "...",
     trend_name: "Carnaval Barranquilla",
     category: "evento_regional_colombia",
     metrics: { velocity, peak_eta, geo }
   }
   ```
5. VM corre `build_full_brand_intelligence_context` + Vera para decidir si actuar.

### 2.5.4 Webhook entrante (vendor → central → VM)

Meta envía webhook a `/webhooks/meta/{org_short_id}`:

1. Control plane valida firma HMAC.
2. Identifica `org_id` desde URL.
3. Lookup en `org_servers` → IP/subdomain de la VM org.
4. Forward via gRPC: `ForwardWebhook { org_id, vendor: "meta", payload }`.
5. VM org procesa, escribe a `intelligence_signals` local.
6. Control plane responde 200 a Meta.

---

## 2.6 Auth federado

El reto: el usuario hace login en `console.aismartcontent.io` (control plane). Pero la mayoría de sus datos viven en su VM org. ¿Cómo se autentica al hacer request a su VM?

### 2.6.1 Flujo de auth

1. Usuario hace login con email + password (o SSO).
2. Control plane valida credenciales en `users` central, verifica MFA.
3. Control plane emite **2 JWTs**:
   - `cp_token` — válido para llamadas al control plane (org metadata, billing, etc.).
   - `dp_token` — válido para llamadas a su VM org. Incluye `scope=org_id:X`, `role=admin`, `exp=15min`.
4. Frontend almacena ambos. Refresh automático con refresh_token.
5. Al consumir `console.aismartcontent.io/api/...` → usa `cp_token`.
6. Al consumir `{org_short}.workers.aismartcontent.io/api/...` → usa `dp_token`.
7. VM org valida `dp_token` con clave pública de control plane.

### 2.6.2 JWT structure

```json
{
  "iss": "control-plane.aismartcontent.io",
  "sub": "user_uuid",
  "aud": "data-plane.org_uuid",
  "org_id": "uuid",
  "org_short_id": "abc123",
  "role": "admin",
  "permissions": ["read:posts","write:missions","approve:vera"],
  "iat": 1715600000,
  "exp": 1715600900,
  "request_id": "req_..."
}
```

Firmado con RS256 (RSA private/public key). VM tiene la public key cached.

### 2.6.3 Renovación

- `dp_token` expira en 15 min.
- Frontend pide nuevo `dp_token` al control plane usando refresh.
- Si user fue revocado en central, el nuevo `dp_token` no se emite. VM rechaza por `exp` natural en max 15 min.

---

## 2.7 Migración: cómo se llega ahí desde el estado actual

El producto actual NO tiene este split. Migración en etapas:

### Etapa 1 — Documentación + diseño (Fase A, paralelo)
- ✅ Este libro escrito.
- [ ] Schema split detallado (qué tabla migra dónde).
- [ ] Protocolo gRPC definido (proto files).
- [ ] Auth federado prototyped en staging.

### Etapa 2 — Gateway central de APIs (Fase A → B)
- `FEAT-014` (Anthropic proxy) ✅ ya hecho.
- Extender a Apify, OpenAI, KIE, Kling — 6-8 semanas.
- Esto SE PUEDE construir sin migrar data plane todavía.
- Beneficio inmediato: metering riguroso + dedupe cross-tenant + audit centralizado.

### Etapa 3 — Provisioner + warm pool (Fase B inicio)
- Refactor del `hetzner.provisioner.js` actual.
- Cloud-init template para VM nueva (instala Postgres, worker, sensors, Vera).
- Warm pool 3-5 VMs por región.
- 3-4 semanas.

### Etapa 4 — Primera VM dedicated piloto (Fase B mitad)
- Primer cliente Enterprise firma ($5K+).
- Provisionar su VM. Migrar sus datos del shared a su VM.
- Operar 2-3 meses para shakedown de bugs.
- Documentar runbook.

### Etapa 5 — Migración progresiva de tenants pagos (Fase B fin → Fase C)
- Cliente por cliente, según tier, migrar al modelo dedicado.
- Free/Creator/Team/Agency se quedan en shared infra.
- Enterprise/Tier-1 todos en dedicado.

### Etapa 6 — Multi-región (Fase C)
- Falkenstein (EU) ya.
- Agregar Helsinki, Ashburn (US), AWS São Paulo si LatAm lo pide.
- Provisioner soporta `region` parameter.
- Sync orchestrator soporta cross-region replication para catálogos.

---

## 2.8 Operación del split — runbook básico

### 2.8.1 Nuevo cliente Enterprise/Tier-1 firma

1. Sales crea org en control plane con `tier=enterprise`.
2. Provisioner asigna VM del warm pool (o crea nueva si pool vacío).
3. Cloud-init aplica template:
   - Postgres con migrations versionadas.
   - Stack ai-engine (worker, sensores, Vera).
   - CF Tunnel registrado con subdomain `{org_short_id}.workers.aismartcontent.io`.
   - Secret rotation inicial.
4. Control plane registra en `org_servers`.
5. Sync orchestrator inicializa catálogos.
6. Admin del cliente recibe invitación email.
7. Onboarding guiado en UI (conectar Meta, agregar competidores, configurar Vera).

ETA: <60s con warm pool, 5-10 min sin.

### 2.8.2 Despliegue de release a N VMs

Estrategia rolling con canary:

1. Build → push imagen a registry.
2. Deploy a 1 VM canary (interno, IGNIS).
3. Smoke tests automáticos. Si OK → siguen.
4. Deploy a 5% de VMs paying (escogidas por low-risk tier).
5. Esperar 1h. Si error rate < threshold → continuar.
6. Deploy a 50%. Esperar 30 min.
7. Deploy al 100%.

Si en cualquier paso el error rate sube → rollback automático.

Tooling: ArgoCD (K8s) o Ansible playbook (pre-K8s).

### 2.8.3 Migración de schema a N VMs

1. Migración nueva commiteada a `supabase/migrations/`.
2. CI valida en staging shared.
3. CI valida aplicando a 1 VM staging (dry-run).
4. Aprobación humana para producción.
5. Migration runner aplica VM por VM:
   - Adquiere lock en `org_servers.migration_status`.
   - Ejecuta migration.
   - Verifica health check post.
   - Libera lock.
   - Si falla → rollback solo en esa VM, pausa el rollout.

### 2.8.4 VM org cae

Alerta de Better Stack: `{org_short_id}.workers.aismartcontent.io` no responde.

1. On-call investiga via Hetzner Cloud console o SSH.
2. Si crashed → reboot. Si data corrupto → restore desde último snapshot.
3. Si VM perdida → provisionar nueva + restore snapshot.
4. RTO target: 30 min para Enterprise, 15 min para Tier-1.
5. RPO target: 1h (snapshots cada hora) para Enterprise, 5 min (continuous WAL) para Tier-1.

---

## 2.9 Decisiones técnicas detalladas

### 2.9.1 ¿Supabase central o Postgres self-hosted central?

**Decisión: Supabase Pro/Team para el control plane, al menos hasta Fase C.**

Razones:
- Auth nativa con Supabase Auth (MFA TOTP, OAuth, SAML add-on).
- Realtime para notificaciones a frontend.
- Storage si se necesita (assets agregados, logos).
- pg_cron nativo.
- PITR + backups gestionados.
- Migrations CLI maduro.
- Costo razonable ($25-599/mes).

Solo migrar a Postgres self-hosted (probablemente AWS RDS o CrunchyData on Hetzner) si:
- Costo Supabase >$3K/mes (a esa escala ya hay revenue para self-host).
- Compliance lo requiere (cliente Tier-1 con prohibición específica).
- Performance específico no soportado.

### 2.9.2 ¿Postgres en cada VM o DB-as-a-service por tenant?

**Decisión: Postgres self-managed en cada VM (al menos hasta 100 VMs).**

Razones:
- Costo: $40/mes VM con PG vs $100/mes mínimo por DB managed.
- Latencia local: app y DB en misma VM = <1ms vs 5-50ms con DB remoto.
- Aislamiento total: cliente puede pedir "denme el snapshot completo" = snapshot Hetzner VM completa.
- Simplicidad operacional inicial.

A 100+ VMs evaluar:
- Migrar Postgres a CrunchyData operator en Kubernetes (mismo VM + orchestration).
- O DB-as-a-service dedicada (Neon, RDS) cuando volumen lo justifique.

### 2.9.3 Comunicación VM ↔ Control plane — gRPC vs REST vs WebSocket

**Decisión: gRPC con mTLS para sync + control. REST para gateway calls. WebSocket no (overhead).**

- gRPC: streaming bidireccional eficiente, schema-first (protobuf), generación de clients en N lenguajes.
- REST: gateway de APIs externas (simple, debuggable con curl, fácil para clientes externos).
- mTLS: certificados auto-signed gestionados por control plane.

### 2.9.4 Storage — ¿local VM o S3-compatible?

**Decisión:**
- **Local VM** para assets activos (rápido, gratis).
- **Cloudflare R2** (S3-compatible) para backup + CDN público de assets servidos al frontend.
- Cliente Tier-1 con BYOS (Bring Your Own Storage): R2 bucket del cliente, AI Smart Content lo accede con credenciales del cliente.

### 2.9.5 Sensores en VM — Python o Node?

**Decisión: Mantener mix actual.**
- Worker FastAPI (Python) para CPU-intensive: pysentimiento, KeyBERT, embeddings, image processing.
- Worker Node para I/O: webhooks, integraciones REST, pg_cron triggers.
- Comparten Postgres local.

---

## 2.10 Anti-patrones arquitectónicos

### ❌ Control plane que almacena datos del cliente
Si el control plane guarda intelligence_signals o brand_posts "como cache", se rompe el aislamiento. **No.** Solo metadata, billing, identidad.

### ❌ VM que llama directo a APIs externas pagas
Si la VM tiene su token Apify y llama directo, pierdes metering centralizado, pierdes dedupe cross-tenant, pierdes audit de cost. **No.** Todo paga external API call va vía gateway.

### ❌ Sync síncrono entre VMs
"VM A llama VM B" no. Las VMs son aisladas. Si necesitan compartir algo (ej: catálogo), va vía control plane.

### ❌ Cross-tenant queries en data plane
Una RPC en VM que retorna data de otra org. **Imposible:** la VM no tiene data de otra org. Si necesitas agregado, viaja al control plane.

### ❌ Auth solo con cp_token
Si el frontend usa solo cp_token y el control plane reenvía a VMs, el control plane se vuelve cuello de botella. **No.** dp_token directo a VM.

### ❌ Schema diferente por tenant
Si cliente A pide "campo custom X" y se le agrega solo a su VM, divergence en producción. **No.** Schema único, customization via JSON columns (`metadata jsonb`) + feature flags.

### ❌ "Multi-tenant lógico es suficiente"
Para Tier-1, no. Brandwatch y Hootsuite son multi-tenant lógico y por eso no pueden ofrecer data residency real ni BYOK. **El diferenciador es físico.**

---

## 2.11 Métricas operacionales del split

KPIs para validar que la arquitectura funciona:

| Métrica | Target | Cómo se mide |
|---|---|---|
| **Time to provision new VM** | <60s con warm pool | Provisioner logs |
| **Sync lag catálogos central→VM** | <30s p95 | Heartbeat + checksum |
| **Gateway p95 latency** | <500ms (excluye tiempo vendor) | OTEL traces |
| **dp_token validation overhead** | <5ms p99 | Worker FastAPI metrics |
| **VM uptime per Enterprise tenant** | ≥99.9% | Better Stack |
| **Control plane uptime** | ≥99.95% | Better Stack |
| **Cross-VM data leak incidents** | 0 (target absoluto) | Audit log + RLS testing |
| **Gateway cost dedupe rate** | >10% para queries genéricas | Gateway metrics |
| **Apify/OpenAI cost per active org** | <$X/mes (definir por tier) | Billing reconciler |

---

## 2.12 Lectura corta

- **Control Plane / Data Plane** es el modelo target. No es exótico — es lo que hace ServiceNow/Snowflake/MongoDB Atlas.
- **Control Plane** = ai-engine central con Postgres central. Auth, billing, gateways, orquestación, Trends global. Datos del cliente NO viven aquí.
- **Data Plane** = VM dedicada por tenant con su Postgres local + Vera + workers + storage. Aislamiento físico.
- **Solo Enterprise+ tiers** justifican VM dedicada. Free/Creator/Team/Agency comparten infra con RLS.
- **Las APIs externas pagas (Apify/OpenAI/etc.) pasan por gateway central** con metering, dedupe, atribución.
- **Las integraciones del cliente (Meta/Google/Shopify) ejecutan en su VM**. El control plane solo orquesta el OAuth handshake.
- **Auth federado** con 2 JWTs (control + data plane), RS256 firmado, dp_token expira 15 min.
- **Migración progresiva** desde estado actual: gateway primero, provisioner segundo, primera VM dedicated tercero.
- **Anti-patrones críticos:** no almacenar data cliente en control plane, no llamar APIs externas sin pasar por gateway, no cross-tenant queries en data plane.

---

*Capítulo siguiente: [03 · Seguridad enterprise](./03-seguridad.md)*
