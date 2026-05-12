---
id: FEAT-019
title: Pasarela de pago — integrar Stripe (o Wompi/MercadoPago LatAm) end-to-end
severity: critical
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere decisión de proveedor + credenciales + cuenta business + revisión legal/tax
est_duration: long
created: 2026-05-12
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

# Pasarela de pago end-to-end

## Contexto

Hoy hay schema completo de monetización (`plans`, `subscriptions`, `credit_packages`, `credit_usage`) pero **cero capacidad de cobrar**:

- `CreditsShopView.js:184` — comentario `// Placeholder: integrar con pasarela de pago (Stripe, etc.) o redirigir a contacto/facturación`
- `OrganizationView.js` — tab "Facturación" vacío
- No hay tabla de invoices, ni webhook handler de Stripe, ni customer portal

Sin esto **no hay SaaS**: solo demo.

## Decisión bloqueante

| Opción | Pros | Contras |
|---|---|---|
| **Stripe global** | Estándar mundial · Customer Portal listo · webhooks robustos · billing usage-based nativo · invoicing legal | No soporta cobro directo COP en algunos casos · fees ~3.4%+30¢ |
| **Wompi (Colombia)** | Cobro local COP · PSE + tarjetas LatAm | Solo CO · sin customer portal · invoicing manual |
| **MercadoPago** | Cobertura LatAm completa · cuotas | API menos limpia · billing recurrente más rudimentario |
| **Híbrido Stripe + Wompi** | Cubre internacional + LatAm | Doble integración, doble reconciliación |

**Recomendación inicial:** Stripe primero (mercado total) + Wompi después si hay clientes CO grandes pidiendo PSE.

## Scope mínimo

1. **Cuenta Stripe** + productos/precios mapeados a `plans.id` y `credit_packages.id` (probable: precios en Stripe, plan vivo en BD, sync por webhook).
2. **Checkout** — Stripe Checkout Session (más simple que Elements). `POST /api/billing/checkout` crea sesión, redirige.
3. **Customer Portal** — Stripe-hosted, endpoint `POST /api/billing/portal` devuelve URL firmada.
4. **Webhook** `POST /api/billing/webhook` — verificar firma + manejar: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Idempotencia obligatoria (revisar prior `webhook replay window` ya implementado).
5. **Tablas nuevas:**
   - `stripe_customers` (`organization_id`, `customer_id`, `created_at`)
   - `stripe_subscriptions` (`organization_id`, `subscription_id`, `status`, `current_period_end`, `plan_stripe_price_id`, `cancel_at_period_end`)
   - `stripe_invoices` (`organization_id`, `invoice_id`, `amount_paid`, `currency`, `status`, `pdf_url`, `period_start`, `period_end`)
   - `stripe_webhook_events` (`event_id` PK, `type`, `received_at`, `processed_at`) — idempotencia
6. **Sync `subscriptions` ↔ `stripe_subscriptions`** — cuando llega `subscription.updated` o `invoice.paid`, actualizar `subscriptions.status`, `subscriptions.current_period_end`, y disparar `on_subscription_change` (ya existe en BD).
7. **UI:**
   - `PlanesView` — botón "Suscribirme" → Checkout Session
   - `CreditsShopView` — botón "Comprar paquete" → Checkout Session (mode='payment')
   - `OrganizationView` tab "Facturación" — listado de invoices, link Customer Portal, plan actual, próximo cobro
8. **Dunning** — Stripe lo maneja por defecto (Smart Retries + emails). Solo agregar bandera visible en UI cuando `subscription.status='past_due'`.

## Tax/legal

- ¿Tax IDs en checkout? (Stripe Tax si se vende a US/EU).
- ¿Facturación electrónica COL (DIAN) si hay clientes CO? — fuera de Stripe, decisión separada.

## Criterio de cierre

- [ ] Una compra real de crédito o suscripción procesa fin a fin
- [ ] Webhook actualiza `subscriptions` y `organization_credits` correctamente
- [ ] Customer Portal accesible desde "Facturación"
- [ ] Invoice PDF descargable
- [ ] Dunning visible cuando aplica
- [ ] Tests vitest con Stripe en modo test

## Dependencias

- Decisión humana: Stripe vs Wompi vs híbrido
- Cuenta Stripe business verificada (ARDE Agency SAS)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` en Netlify env
