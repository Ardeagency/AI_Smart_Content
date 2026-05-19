---
id: FEAT-019
title: Pasarela de pago — Stripe (USD) + Wompi (COP) dual
severity: critical
type: feature
status: in_progress
auto_eligible: no
auto_eligible_reason: requiere credenciales reales de Stripe + Wompi para cerrar
est_duration: long
created: 2026-05-12
updated: 2026-05-19
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

# Pasarela de pago dual (Stripe + Wompi)

## Estado actual (2026-05-19)

**Implementado** en código y schema (commits `b7364115` Stripe + WIP Wompi):

- Schema Supabase Stripe (`stripe_customers`, `stripe_invoices`, `stripe_webhook_events`, columnas en `plans`/`credit_packages`/`subscriptions`).
- Schema Supabase Wompi simétrico (`wompi_customers`, `wompi_transactions`, `wompi_webhook_events`, columnas en `plans`/`credit_packages`/`subscriptions` con `provider` enum).
- 6 Netlify Functions:
  - `api-billing-checkout.js` — Stripe Checkout Session (sub o paquete)
  - `api-billing-portal.js` — Stripe Customer Portal
  - `api-billing-webhook.js` — Stripe webhook (5 eventos, dedupe por event_id)
  - `api-billing-wompi-checkout.js` — Wompi: firma SHA256 integrity, registra pre-tx PENDING, retorna params para Widget JS
  - `api-billing-wompi-webhook.js` — Wompi: verifica X-Event-Checksum, dedupe, dispatch transaction.updated
  - `api-billing-gateways.js` — reporta qué pasarelas están activas
- `js/services/BillingService.js` — orquesta checkout, carga Widget Wompi lazy, redirect Stripe, modal selector cuando ambas están activas.
- UI wired: `PlanesView._handleCtaKind` y `CreditsShopView._onBuyClick` llaman `billingService.startCheckout`.
- Tab "Facturación" en `OrganizationView`: plan activo, próximo cobro, pasarela, listado unificado Stripe + Wompi, botón Customer Portal Stripe.
- Seed COP listo en plans/credit_packages activos (TRM aprox 4000 COP/USD).

**Pendiente operativo**:

- [ ] Crear cuenta Stripe + 2 env vars + Products/Prices mapeados.
- [ ] Configurar webhook endpoint Stripe.
- [ ] Crear cuenta Wompi + 4 env vars.
- [ ] Configurar webhook endpoint Wompi.
- [ ] (Fase 2) Job recurring para cobranzas Wompi mensuales/anuales con `payment_source_id`.

## Activación Stripe

1. **Cuenta Stripe**: crear en stripe.com/co (o Stripe Atlas si requiere setup global). Esperar verificación.
2. **Crear Products + Prices**: 1 Product por plan, 2 Prices por plan (monthly + yearly).
   - Mapeo en Supabase:
     ```sql
     UPDATE plans SET stripe_price_id_month='price_xxx', stripe_price_id_year='price_yyy' WHERE id='creator';
     -- repetir para team y agency
     UPDATE credit_packages SET stripe_price_id='price_zzz' WHERE id='pack_mini';
     -- repetir para los 4 packs
     ```
3. **Webhook endpoint** en Stripe Dashboard → Developers → Webhooks:
   - URL: `https://console.aismartcontent.io/api/billing/webhook`
   - Eventos: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copiar el "Signing secret" → `STRIPE_WEBHOOK_SECRET`.
4. **Env vars en Netlify**:
   - `STRIPE_SECRET_KEY` = `sk_live_...` (o `sk_test_...` para sandbox)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
5. Verificar con un pago de prueba: tarjeta `4242 4242 4242 4242`, CVC `123`, fecha futura.

## Activación Wompi (demo lista para CO)

1. **Cuenta Wompi**: registrarse en wompi.co (Bancolombia). Flujo sandbox inmediato sin papeleo; producción requiere validación de comercio.
2. **Obtener llaves**: comercios.wompi.co → Mi cuenta → "Secretos para integración técnica":
   - Llave pública → `WOMPI_PUBLIC_KEY` (pub_test_... o pub_prod_...)
   - Llave privada → `WOMPI_PRIVATE_KEY`
   - Secreto de integridad → `WOMPI_INTEGRITY_SECRET`
   - Secreto de eventos → `WOMPI_EVENTS_SECRET`
3. **Webhook endpoint** en Wompi Dashboard → Eventos:
   - URL: `https://console.aismartcontent.io/api/billing/wompi/webhook`
   - Eventos: `transaction.updated` (basta; los otros 2 los ignora el handler).
4. **Env vars en Netlify**:
   - `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`
   - `WOMPI_ENVIRONMENT` = `sandbox` o `production` (opcional, default sandbox).
5. **Precios COP** ya seedeados:
   - Creator: $320.000/mes · $3.040.000/año
   - Team:    $720.000/mes · $6.880.000/año
   - Agency:  $2.000.000/mes · $19.200.000/año
   - Mini Pack: $240.000 · Standard: $640.000 · Plus: $1.920.000 · Mega: $5.200.000
6. Verificar en sandbox con tarjeta `4242 4242 4242 4242` CVC `123`.

## Diferencias Stripe vs Wompi (importantes)

| Feature | Stripe | Wompi |
|---|---|---|
| Customer persistente | Sí (`cus_xxx`) | No — `wompi_customers` solo guarda `payment_source_id` |
| Suscripción recurrente | Nativa | **Manual**: tokenizar tarjeta + cron mensual con `POST /v1/transactions` |
| Customer Portal | Hosted | No existe — gestionamos cancelación nosotros |
| Métodos | Tarjeta, ACH | Tarjeta, **PSE**, **Nequi**, Bancolombia Transfer, Daviplata |
| Reembolsos | API + Portal | API privada Wompi (no implementado todavía) |

## Pendiente Fase 2 (post-demo)

- Job programado mensual: itera `subscriptions WHERE provider='wompi' AND status='active' AND next_charge_at < now()`, llama `POST /v1/transactions` con `wompi_payment_source_id` y monto del plan. Actualiza `next_charge_at`. Si falla → `status='past_due'` + notificación.
- UI para cancelar suscripción Wompi (toggle `cancel_at_period_end`) con confirmación.
- Reembolsos Wompi via API privada.
- Manejo de chargebacks (Stripe `charge.dispute.created`; eventos Wompi de disputas).

## Cuándo borrar este task

Cuando los 5 escenarios E2E pasen con **al menos una pasarela real** (no sandbox):

1. Suscripción Creator mensual → invoice aparece en tab Facturación.
2. Compra Mini Pack → créditos suman a `organization_credits`.
3. Pago fallido → banner "Pago pendiente" + `subscriptions.status='past_due'`.
4. Cancelación → `cancel_at_period_end=true` + banner amarillo.
5. Webhook duplicado → segundo POST devuelve `deduped:true` sin alterar estado.
