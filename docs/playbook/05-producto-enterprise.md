---
chapter: 05
title: Producto enterprise
part: V — Producto enterprise
estimated_reading_time: 45 min
---

# 05 · Producto enterprise

> El producto que vende un SaaS a Coca-Cola no es solo la feature; es **cómo se entrega**, **cómo se cobra**, **cómo se soporta** y **cómo se extiende**. Este capítulo cubre todo eso.

---

## 5.1 Onboarding

### 5.1.1 Onboarding self-serve (SMB / Mid-market)

#### Estado actual
- Signup → email confirmation → dashboard.
- Sin checklist guiado, sin templates por industria, sin "first success" momento claro.
- `mark_org_notification_checklist_step` ya existe en backend, UI incompleta.

#### Target Fase A

**First-time onboarding wizard:**
1. Sign-up con email/password/Google OAuth + MFA prompt (Fase A).
2. Crear primera org: nombre, industria (CPG / Retail / B2B / Servicios / Otro), tamaño, región.
3. Skip o conectar primera integración (Meta / Google / Shopify).
4. Skip o crear primer brand_container con import de logo + colors (autodetect via Brandfetch API o user upload).
5. Llegar al dashboard "Mi Marca" — incluso vacío, ver explicación de qué se llenará.
6. Trigger primer scrape demo (cuenta benchmark pública) para tener datos visualizables inmediatos.

**Checklist persistente** (top-right del dashboard):
```
□ Conecta Meta Business (5 min)
□ Agrega tu primer competidor (2 min)
□ Configura objetivos de marca (3 min)
□ Habla con Vera por primera vez (5 min)
□ Aprueba tu primera mission (1 min)
□ Invita a un compañero (1 min)
```

Cada checked → confetti animation + analytics event.

**Time-to-value target**: <15 minutos del signup al primer "insight" útil.

#### Target Fase B

**Industry templates:**
- CPG (Coca-Cola, Postobón, Bavaria patterns).
- Retail (Cencosud, Falabella patterns).
- D2C (Oster, Tron patterns).
- Agencia (multi-cliente patterns).

Cada template precarga:
- Competidores típicos.
- Sensores recomendados.
- Lexicon dimensional con keywords del sector.
- Vera memory banks con context industria.

### 5.1.2 Onboarding enterprise (Tier-1)

**Diferencias:**
- White-glove. Customer Success Manager dedicado.
- Kickoff call 60-90 min con el cliente (Brand Manager + IT + Compliance).
- Security review (questionnaire + DPA firmado).
- Provisioning de VM dedicada en su región.
- Configuración avanzada: SSO, IP allowlist, BYOK si aplica.
- Custom integrations si requieren (data warehouse, BI tool).
- 30-day onboarding plan documentado.

**Sales engineer co-construye con cliente:**
- Mapeo de brand_containers (marcas, sub-marcas, líneas).
- Configuración inicial de competidores + targets.
- Conexión integraciones (a veces involucra IT del cliente).
- Setup de Vera memory banks con doc del cliente (brand guidelines, tone of voice).

**SLA inicial de onboarding:** <2 semanas hasta "first insight on real data".

---

## 5.2 Customer Success y soporte

### 5.2.1 Tiered support

| Tier cliente | Soporte ofrecido |
|---|---|
| **Free** | Help center público. No support directo. |
| **Creator** | Help center + email response 5 business days. |
| **Team** | Help center + email response 2 business days + community Slack. |
| **Agency** | Help center + email response 1 business day + scheduled monthly call. |
| **Enterprise** | All above + dedicated email + scheduled call 2×/mo + Slack Connect channel. |
| **Tier-1 Dedicated** | All above + dedicated CSM + 24/7 P1 escalation + quarterly business review (QBR) + Slack Connect channel + emergency phone line. |

### 5.2.2 Customer Success role (Fase B)

Hiring Fase B:
- 1 CSM por cada $200K-500K ARR de Enterprise+.
- Responsabilidades:
  - Onboarding acompañamiento.
  - Health score monitoring (uso bajo → outreach).
  - QBRs (Quarterly Business Reviews) para Tier-1.
  - Upsell signal flagging.
  - Renewal management.
  - Voice of customer back to product.

### 5.2.3 Health score

Composite por org:
```
health_score = weighted_sum(
  login_frequency,         # daily / weekly / never
  active_users_ratio,      # used users / seats
  feature_adoption,        # cuántas features usadas
  data_freshness,          # último sensor success
  missions_approved,       # engagement con Vera
  support_tickets_open,    # negative
  payment_status           # fail → red
)
```

Buckets: green / yellow / red.
- Yellow = automated nudge email.
- Red = CSM outreach manual.

### 5.2.4 Help center público

URL: `help.aismartcontent.io`.
Construido en Mintlify / Docusaurus / GitBook.
Secciones:
- Getting Started (onboarding paso a paso).
- Integraciones (Meta, Google, Shopify, YouTube).
- Vera (cómo conversar, cómo memorizar, cómo aprobar).
- Dashboards (Mi Marca, Competencia, Tendencias, Estrategia).
- Studio (creación de contenido).
- Admin (members, roles, billing, security).
- API (Fase B).
- Troubleshooting.
- FAQ.
- Glossary.

### 5.2.5 In-app support widget — 🟡 P2

Opciones:
- Plain (~$39/mo, simple).
- Crisp (~$25/mo, chat).
- Intercom ($74/mo, full suite).

Comportamiento:
- Widget bottom-right en `/console/*`.
- Help suggestions contextuales por vista.
- Chat con team (business hours) o async ticket fuera.
- Para Tier-1: bypass de queue, escalación directa.

---

## 5.3 API pública v1 — 🟠 P1 (Fase B)

### 5.3.1 Por qué importa

Sin API pública, AI Smart Content queda como "una herramienta más". Con API, se vuelve **infraestructura** que el cliente integra con su stack (data warehouse, BI, DAM, CRM).

**Diferencia revenue:** $5K/mes vs $50K/mes.

### 5.3.2 Diseño general

#### Base URL
```
https://api.aismartcontent.io/v1
```

#### Auth
- API keys generadas por org admin en `/org/admin/api-keys`.
- Key format: `aisc_live_<random32>` / `aisc_test_<random32>` (test mode separado).
- Header: `Authorization: Bearer aisc_live_...`.
- Scope: key tiene `org_id` implícito + role optionally configurable.

#### Versioning
- URL versioning: `/v1`, `/v2` (no `Accept` header version).
- Cambios backwards-compatible permitidos dentro de `/v1`.
- Breaking changes → `/v2` con deprecation period 12 meses.
- Sunset header: `Sunset: Sat, 31 Dec 2027 23:59:59 GMT`.

#### Rate limiting
- Per API key: 1000 req/hour default, configurable por plan.
- 429 response con `Retry-After` header.
- Burst limit: 50 req/10s.

#### Idempotency
- Endpoints POST/PUT aceptan `Idempotency-Key` header.
- Retornan misma response para misma key en 24h.

#### Pagination
- Cursor-based:
  ```
  GET /v1/intelligence/signals?limit=50&cursor=eyJ...
  Response: {
    data: [...],
    next_cursor: "eyJ...",
    has_more: true
  }
  ```

### 5.3.3 Endpoints core (Fase B)

#### Organizations
```
GET    /v1/orgs/me                          # current org from API key
PATCH  /v1/orgs/me                          # update settings
```

#### Brand containers
```
GET    /v1/brand-containers
POST   /v1/brand-containers
GET    /v1/brand-containers/{id}
PATCH  /v1/brand-containers/{id}
DELETE /v1/brand-containers/{id}
```

#### Products
```
GET    /v1/products
POST   /v1/products
GET    /v1/products/{id}
PATCH  /v1/products/{id}
DELETE /v1/products/{id}
POST   /v1/products/import                  # bulk import via Shopify-like format
```

#### Intelligence signals (read-only)
```
GET    /v1/intelligence/signals
GET    /v1/intelligence/signals/{id}
GET    /v1/intelligence/vulnerabilities
GET    /v1/intelligence/trends              # global trends + targeted
```

#### Brand posts (Meta/Instagram captured)
```
GET    /v1/brand-posts
GET    /v1/brand-posts/{id}
```

#### Missions
```
GET    /v1/missions
GET    /v1/missions/{id}
POST   /v1/missions/{id}/approve
POST   /v1/missions/{id}/reject
```

#### Vera
```
POST   /v1/vera/conversations               # start new
POST   /v1/vera/conversations/{id}/messages # continue
GET    /v1/vera/conversations/{id}
```

#### Webhooks
```
GET    /v1/webhooks/subscriptions
POST   /v1/webhooks/subscriptions
DELETE /v1/webhooks/subscriptions/{id}
POST   /v1/webhooks/subscriptions/{id}/test # send test event
GET    /v1/webhooks/deliveries              # delivery history
```

#### Analytics / dashboards (proxy a RPCs Postgres)
```
GET    /v1/analytics/mi-marca
GET    /v1/analytics/competencia
GET    /v1/analytics/tendencias
GET    /v1/analytics/estrategia
```

### 5.3.4 OpenAPI spec

- Generada desde código (no escrita a mano).
- Tools: `swagger-jsdoc` (Node) o `pydantic` schemas (Python).
- Publicada en `https://api.aismartcontent.io/openapi.json`.
- Renderizada en `https://docs.aismartcontent.io/api`.

### 5.3.5 SDK clients

Prioridad:
1. **TypeScript SDK** (`@aismartcontent/sdk`) — npm. Fase B.
2. **Python SDK** (`aismartcontent`) — pip. Fase B late.
3. **Go SDK** — Fase C si demanda.

SDK comportamiento:
- Auto-retry con exponential backoff.
- Certificate pinning (capítulo 03.3.2).
- Pagination helpers (`.list().auto_paginate()`).
- Idempotency keys auto-generadas.
- Tipos strongly-typed.
- Async/await native.

Ejemplo TS:
```ts
import { AISmartContent } from "@aismartcontent/sdk";

const client = new AISmartContent({
  apiKey: process.env.AISC_API_KEY!,
});

const signals = await client.intelligence.signals.list({
  brand_container: "coca-cola-andina",
  severity: "high",
  since: "2026-05-01",
});

for await (const signal of signals.autoPaginate()) {
  console.log(signal);
}
```

### 5.3.6 Webhooks salientes — `events`

Lista de events que el cliente puede subscribe (Fase B):

```
signal.detected                   # nuevo intelligence_signal
signal.high_severity              # severity >= high
vulnerability.created
vulnerability.resolved
mission.created                   # Vera generó propuesta
mission.approved                  # human approved
mission.executed                  # action-executor terminó
mission.failed
content.ready                     # asset listo en Studio
trend.emerging                    # trend targeted a un brand_container
competitor.new_post               # competidor publicó algo relevante
integration.disconnected          # token expirado / revoked
plan.limit_approaching            # >80% credit usage
plan.limit_reached
```

Payload structure:
```json
{
  "id": "evt_abc123",
  "type": "signal.detected",
  "created": 1715600000,
  "org_id": "uuid-...",
  "data": {
    "object": "intelligence_signal",
    "id": "...",
    // full object
  }
}
```

### 5.3.7 Developer experience

**Developer portal** (`developers.aismartcontent.io`):
- API docs interactivas (Try it now).
- Quick start guides per lenguaje.
- Webhook testing tool.
- API key management.
- Usage analytics (calls/day, errors, costs).
- Status page link.
- Changelog API.

**Sandbox environment:**
- `api.sandbox.aismartcontent.io` — test mode keys.
- Datos demo refrescados nightly.
- Sin cost vendor (Anthropic/Apify mockeados).

---

## 5.4 Billing — `FEAT-019` (🔴 P0 Fase A)

### 5.4.1 Schema (ya existe)

```sql
plans                  -- 6 tiers definidos (capítulo 01)
subscriptions          -- relación org ↔ plan
credit_packages        -- top-ups one-time
credit_usage           -- aggregated por org per period
storage_usage          -- aggregated por org
invoices               -- emitidas
payment_methods        -- stored payment methods
payment_attempts       -- history de cargos
```

### 5.4.2 Stripe integration (Fase A) ✅ **DEPLOYED 2026-05-19 (FEAT-019, commit `b7364115`)**

#### Implementado
- Stripe direct charges, modes `subscription` + `payment` (paquetes únicos).
- Schema vivo: `stripe_customers` (PK org_id, UNIQUE stripe_customer_id), `stripe_invoices` (PK invoice_id, idx por org+fecha), `stripe_webhook_events` (PK event_id, dedup), `subscriptions` extendida con `stripe_subscription_id`/`stripe_customer_id`/`cancel_at_period_end`/`canceled_at` + idx parcial UNIQUE `one_active_sub_per_org`. Columnas `stripe_price_id_month/year` en `plans` y `stripe_price_id` en `credit_packages`. RLS habilitado.
- Webhook handler `/api/billing/webhook` con validación firma Stripe-Signature, dedup por event_id (409 → 200 silent), dispatch a 5 eventos: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.{created,updated,deleted}`. Sync automático a `subscriptions` y `organization_credits` (paquetes).
- `js/services/BillingService.js` orquesta el flujo end-to-end con `_authHeaders` (Bearer JWT del Supabase session).

#### Customer portal ✅
- Stripe-hosted via `/api/billing/portal`. Botón "Gestionar suscripción" en `OrganizationView` tab "Facturación".
- Self-serve: change plan, update payment method, view invoices, cancel.

#### Activación pendiente (externo)
- Cuenta Stripe verificada (ARDE Agency SAS o Stripe Atlas si requiere US entity).
- 2 env vars en Netlify: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Crear Products + Prices en Stripe Dashboard, mapear `stripe_price_id_*` en BD.
- Configurar webhook endpoint en Stripe Dashboard.

#### Pricing model
- **Subscription** mensual o anual (anual con 17% descuento).
- **Usage-based add-on**: credits prepaid + overage.
- **Per-seat**: cargo por usuario activo en el dashboard (excludes API-only access).

#### Stripe Tax
- Activar para auto-cálculo IVA EU, sales tax US.
- US: collect after $X umbral por state.
- EU: VAT MOSS-like via Stripe.

### 5.4.3 Wompi (Colombia) ✅ **DEPLOYED 2026-05-19 (FEAT-019, commit `d6a0004a`)** · MercadoPago LatAm (Fase B)

**Wompi (Bancolombia)** ya en producción end-to-end. Razón: clientes CO pagan en COP con PSE/Nequi; Stripe no cubre esos métodos.

#### Implementado
- Schema simétrico a Stripe: `wompi_customers` (mapping org → `payment_source_id` para recurring), `wompi_transactions` (PK transaction_id, status PENDING/APPROVED/VOIDED/DECLINED/ERROR), `wompi_webhook_events` (PK = `checksum_timestamp` para dedup). Columnas `wompi_amount_cents_month/year` en `plans`, `wompi_amount_cents` en `credit_packages`. `subscriptions += provider ('stripe'|'wompi')`, `wompi_last_transaction_id`, `wompi_payment_source_id`, `next_charge_at`. Idx parcial para job recurring.
- `/api/billing/wompi/checkout` firma SHA256(reference + amount + currency + expirationTime + integrity_secret) server-side, registra pre-tx PENDING, retorna params para el Widget JS.
- `/api/billing/wompi/webhook` valida firma SHA256 contra `X-Event-Checksum` (concatena `signature.properties` resueltos contra `data` + timestamp + events_secret), dedup, dispatch `transaction.updated`. Si APPROVED: guarda payment_source en `wompi_customers`, suma créditos a `organization_credits` (paquete), o crea subscription con `next_charge_at = +1mes|+1año` (suscripción).
- `BillingService` carga widget.js lazy desde `checkout.wompi.co`, instancia `WidgetCheckout` con la firma del server.
- Validado E2E sandbox 2026-05-19 09:52: pago $240.000 COP con VISA `4242 4242 4242 4242` aprobado, webhook procesado en 434ms, +500 créditos en `organization_credits` de IGNIS, sin errores.
- Seeds COP aplicados (TRM ≈ 4000): Creator $320k/mes · Team $720k · Agency $2M; Mini $240k · Standard $640k · Plus $1.92M · Mega $5.2M.

#### Diferencia clave Stripe vs Wompi
| Feature | Stripe | Wompi |
|---|---|---|
| Customer persistente | Sí (`cus_xxx`) | No — `wompi_customers` solo mapping `payment_source_id` |
| Subscription recurrente | Nativa | **Manual** — cron mensual con `POST /v1/transactions` usando `payment_source_id` (Fase 2) |
| Customer Portal | Hosted | No — UI propia para cancelar |
| Métodos | Tarjeta, ACH | Tarjeta, **PSE**, **Nequi**, Bancolombia Transfer, Daviplata |

#### Activación pendiente (externo)
- Habilitar cuenta Wompi producción cuando llegue (sandbox ya activo).
- 4 env vars en Netlify: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` + opcional `WOMPI_ENVIRONMENT=production`.
- Configurar webhook endpoint en Wompi Dashboard (`/api/billing/wompi/webhook`, evento `transaction.updated`).

#### Fase 2 Wompi
- Para suscripciones recurrentes: añadir flujo `acceptance_token` (GET `/v1/merchants/{public_key}`) + checkbox "Guardar tarjeta" + `POST /v1/payment_sources` server-side para tokenizar. Sin esto Wompi solo cobra pagos únicos.
- Cron mensual para renovaciones: itera `subscriptions WHERE provider='wompi' AND status='active' AND next_charge_at < now()`, cobra con `payment_source_id` guardado.
- UI cancelar suscripción Wompi (no hay Customer Portal hosted).

**MercadoPago** (Fase B late) para Brasil/Argentina/México/Chile:
- Cobertura tarjetas locales, Boleto Brasil, Pix Brasil.
- Patrón simétrico al de Wompi (`mercadopago_*` tablas, function checkout, function webhook).
- Backend trackea revenue normalizado a USD para reporting.

### 5.4.4 Invoicing

#### Self-serve plans (Free/Creator/Team/Agency)
- Invoice auto-generada por Stripe/Wompi.
- Email a billing contact.
- Visible en customer portal.

#### Enterprise / Tier-1
- Negotiated annual contracts.
- Invoice mensual o annual upfront.
- NET 30/60 payment terms común.
- PO required.
- Invoice custom branded con Stripe Invoicing API o Sage / QuickBooks integration.

### 5.4.5 Dunning (cobros fallidos)

Política:
- Día 0: payment fails → retry next day.
- Día 3: email "payment failed, please update".
- Día 7: email "service may be suspended in 7 days".
- Día 14: in-app banner "suspended in 3 days".
- Día 17: email "service suspended, restore now".
- Día 30: cancel subscription (data retained 60 more days).
- Día 90: data deleted (post DPA termination clause).

Excepción Tier-1: nunca auto-suspend. CSM contacta directo.

### 5.4.6 Usage-based metering

Eventos counted:
- LLM tokens (input + output) → cost per token tabulado por model.
- Video generation → cost per video.
- Apify scrapes → cost per actor run.
- Storage GB-month.
- API requests / month (>1M = additional fee).

Cómo se cuenta:
- Gateway logs cada call con cost.
- Cron hourly agrega a `credit_usage`.
- Cron daily emite usage report al user.
- Cron monthly genera invoice line items.

### 5.4.7 Refunds y disputes

- Self-serve: refund prorated dentro de 30 días (visible en customer portal).
- Enterprise: per contract.
- Stripe disputes: CSM responde con evidencia (uso registrado, audit log).

---

## 5.5 Plans y pricing — `project_pricing_phase1` extensión

### 5.5.1 Tiers públicos

#### Free — $0/mo
**Para:** Trial, evaluación, individuals.
- 30 días.
- 1 brand_container.
- 1 user.
- 50 credits / mes (vera + signals).
- 1 GB storage.
- Sin integraciones.
- Watermark en assets generados.

#### Creator — $49-99/mo
**Para:** Freelancers, creators individuales, micro-marcas.
- 1 brand_container.
- 1 user.
- 500 credits / mes.
- 5 GB storage.
- Conectar Meta + Google.
- Vera chat ilimitado (sujeto a credits).
- Sin watermark.

#### Team — $299-499/mo
**Para:** Equipos pequeños, agencias boutique, 1 marca regional.
- 3 brand_containers.
- 5 seats.
- 5K credits / mes.
- 50 GB storage.
- Todas integraciones.
- API access read-only.
- Email support 2 business days.

#### Agency — $999-2999/mo
**Para:** Agencias mid-size, retailers regionales.
- 10 brand_containers.
- 20 seats.
- 30K credits / mes.
- 200 GB storage.
- Full API.
- Webhook subscriptions (5).
- Slack community.
- 1 monthly call.

#### Enterprise — $5K-15K/mo
**Para:** Marcas medianas, retailers grandes regionales.
- 50 brand_containers.
- 100 seats.
- 200K credits / mes.
- 1 TB storage.
- VM dedicada (Fase B+).
- SSO (SAML).
- Audit log API.
- Dedicated CSM.
- 99.5% SLA.

#### Tier-1 Dedicated — $20K-50K+/mo
**Para:** Multinacionales, Tier-1 brands.
- Unlimited brand_containers.
- Unlimited seats.
- Custom credits + BYOK option.
- VM dedicada multi-región.
- SCIM provisioning.
- 24/7 P1 support.
- 99.9% SLA contractual.
- QBR mensual.
- Custom contract terms (DPA, MSA, NDA).

### 5.5.2 Add-ons (any tier)

- **Extra credits**: paquetes one-time. $0.01/credit típico ($100 = 10K credits).
- **Extra storage**: $0.05/GB/mo.
- **Extra brand_container**: $XX/mo per (Team/Agency tiers).
- **Extra seats**: $XX/seat/mo.
- **Premium support**: upgrade tier de soporte.

### 5.5.3 Annual commitment discount

- 17% off (~2 meses gratis equivalent).
- Pagado upfront.
- Auto-renewal con email 60 días antes.
- Cancellation antes de renewal sin penalty.

### 5.5.4 Custom enterprise pricing

Negociado por sales:
- Floor: Enterprise tier price.
- Variables: # brand_containers, # seats, # regions, BYOK include/extra, SLA level, support level.
- MSA + DPA + custom terms.
- Multi-year deal con price lock.

---

## 5.6 Free trial / freemium strategy

### 5.6.1 Decisión: Free 30 días, no eterno

Razones:
- Eterno atrae freeloaders sin intent de pago.
- 30 días con feature completo permite evaluación honesta.
- Trial expiration → automatic downgrade a "frozen" (read-only) hasta upgrade.

### 5.6.2 Trial-to-paid conversion

KPI: % de trials que convierten a paid en 90 días.
- Target Fase A: >10%.
- Target Fase B: >15%.
- Target Fase C: >20%.

Drivers:
- Onboarding rápido (capítulo 5.1).
- First insight <15 min (mostrar valor pronto).
- Lifecycle emails:
  - Día 1: welcome + tutorial.
  - Día 3: "did you connect Meta?" outreach if not done.
  - Día 7: "see Vera in action" video.
  - Día 14: case study email.
  - Día 21: testimonial + pricing.
  - Día 28: "trial ends in 2 days, save 17% annual".
  - Día 30: trial ended, frozen.

---

## 5.7 In-product UX para enterprise

### 5.7.1 Workspace switcher (multi-org)

Hoy: 1 user → 1 org típicamente.
Target Fase B: user puede ser member en multiple orgs (agencias, consultoras).

UI:
- Top-left dropdown con switcher.
- Cada org tiene su `org_short_id` slug en URL.
- Session state mantiene última org visitada.

### 5.7.2 Roles y permisos UI

`/org/admin/members`:
- Lista de members con role.
- Botón "Invitar" → email + role.
- Edit role inline.
- "Transferir ownership" botón (con confirmation extensa).
- Activity por member (cuándo último login, qué acciones).

### 5.7.3 Settings hierarchy

```
/org/admin/general          # org name, logo, region
/org/admin/members          # users y roles
/org/admin/billing          # plan, invoices, payment
/org/admin/integrations     # Meta, Google, Shopify connections
/org/admin/api-keys         # API keys management
/org/admin/webhooks         # webhook subscriptions
/org/admin/security         # MFA enforcement, SSO config, IP allowlist
/org/admin/audit            # audit log viewer
/org/admin/data             # export, deletion
```

### 5.7.4 Vera "Brain" view

Para Tier-1: visibilidad de qué sabe Vera sobre la marca.
- Memory banks viewer (con permission edit).
- Brand intelligence context preview (las 10 capas).
- Embeddings count + last refresh.
- "Re-train" trigger button.

### 5.7.5 White-label / co-branding (Tier-1)

- Custom logo en navbar.
- Custom colors (limited palette).
- Custom email "from" address.
- Custom domain `aisc.cliente.com` (CNAME).
- Branded reports PDF.

---

## 5.8 Notificaciones

### 5.8.1 Tipos de notificaciones

```
[In-app]
- Mission Vera lista para aprobar
- Vulnerability detectada
- Signal high severity
- Integration disconnected
- Plan limit approaching
- New member invited

[Email]
- Onboarding sequence (capítulo 5.6.2)
- Weekly digest opcional
- Critical alerts (high severity)
- Billing events
- Maintenance notifications

[Webhook]
(Capítulo 5.3.6)

[Slack / Teams] — Fase B
- Integration con Slack workspace cliente
- Channel dedicado para alerts
- Vera responde en thread
```

### 5.8.2 Preference center

`/account/notifications`:
- Toggle por categoría + canal.
- Quiet hours.
- Email frequency (real-time / daily digest / weekly).

### 5.8.3 Transactional email infrastructure

- Resend (ya en deps) — primary.
- DKIM/SPF/DMARC configurado.
- Templates en MJML o React Email.
- Tracking opens/clicks (con opt-out).

---

## 5.9 Mobile

### 5.9.1 Estado actual
- SPA responsive funciona en mobile browser.
- No app nativa.

### 5.9.2 Estrategia

**Fase A-B**: mantener web responsive. PWA con Service Worker (✅ ya hay sw.js + manifest).

**Fase C** (opcional, solo si demanda real):
- App nativa (React Native).
- Solo features clave: ver dashboards, aprobar missions, chat Vera, push notifications.
- Studio + admin se quedan web.

---

## 5.10 Internacionalización (i18n)

### 5.10.1 Estado actual
- Texto principalmente en español.
- Algún inglés mezclado (legacy).

### 5.10.2 Target Fase B

Soporte i18n con framework simple:
- Strings extraídas a `locales/{lang}/translation.json`.
- Idiomas inicio: ES (Colombia/LatAm) + EN (US/EU).
- Detection: browser Accept-Language + user preference.

Fase C:
- Portugués (Brasil) si entra Bavaria-class client BR.
- Otros idiomas por demand.

### 5.10.3 Localización per-region

- Currency: por org.region.
- Date format: por user.locale.
- Number format: por user.locale.
- Tax/invoice format: por org.region (DIAN Colombia, etc.).

---

## 5.11 Accesibilidad

### 5.11.1 Target Fase A

WCAG 2.1 Level AA (no AAA inicialmente).

Concretos:
- Contraste mínimo 4.5:1 texto, 3:1 large text.
- Keyboard navigation completa (Tab order lógico, Esc cierra modales).
- Screen reader support (aria-label, role).
- Focus visible.
- No solo-color para indicar estado.

### 5.11.2 Audit
- Lighthouse Accessibility score >90 en views críticas.
- axe-core en CI tests.
- Manual test con NVDA o VoiceOver cada release mayor.

---

## 5.12 Checklist de cierre por fase

### Fase A
- [ ] Onboarding wizard self-serve <15 min time-to-first-insight.
- [ ] Stripe + Wompi integration funcional.
- [ ] 6 tiers en `plans` table + customer portal.
- [ ] Help center público.
- [ ] Transactional emails configurados (Resend).
- [ ] Audit log UI (capítulo 03).
- [ ] WCAG AA baseline.

### Fase B
- [ ] API pública v1 documentada + SDK TypeScript.
- [ ] Webhooks salientes operacionales.
- [ ] CSM hired (1).
- [ ] Industry templates (CPG, Retail, D2C, Agencia).
- [ ] In-app support widget (Plain/Crisp).
- [ ] Multi-language ES + EN.
- [ ] Notification preference center.

### Fase C
- [ ] White-label / co-branding Tier-1.
- [ ] App móvil nativa (si demanda).
- [ ] Custom contract negotiation flow.
- [ ] QBR templates + cadence.
- [ ] Multi-currency support.
- [ ] BYOK option.

---

## 5.13 Lectura corta

- **Onboarding self-serve <15 min time-to-value.** Wizard con checklist persistente. Industry templates Fase B.
- **Tiered support** con CSM dedicado desde Enterprise. Help center público obligatorio Fase A.
- **API pública v1** es el diferenciador para enterprise. Sin esto, AI Smart Content es "herramienta", no "infra".
- **6 tiers** desde Free a Tier-1 Dedicated. Annual commitment con 17% off.
- **Stripe + Wompi/MercadoPago** híbrido. Factura electrónica DIAN obligatoria para B2B Colombia.
- **30-day free trial** (no eterno). Conversion target 10-20%.
- **Workspace switcher multi-org** Fase B. Roles + permisos UI granular.
- **White-label Tier-1** Fase C.
- **i18n ES + EN** Fase B, otros por demanda.
- **WCAG AA** baseline Fase A.

---

*Capítulo siguiente: [06 · Compliance y Trust](./06-compliance.md)*
