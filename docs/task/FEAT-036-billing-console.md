# FEAT-036 — Billing Console (dev/lead/billing)

Console admin de billing para el equipo: editar plans (subs mensuales) y
credit packages (compras puntuales). Acceso solo lead (gated por `is_lead()`).

## Fase 1 — Plans + Credit Packages CRUD (CERRADA)

**Ruta:** `/dev/lead/billing` (registered en `app.js`)
**View:** `js/views/DevLeadBillingView.js`
**Sidebar entry:** Admin > Billing (icon credits.svg)
**CSS:** `dev-lead-billing` scope en `css/modules/developer.css`

**Tabs:**
- **Plans** — list/edit BD (`plans` table). Precio, creditos/mes, storage,
  features, popular, active, display_order, stripe_price_ids, wompi_cents.
  Toggle active in-row. Stripe sync = warning visual; no toca Stripe API aun.
- **Credit Packages** — CRUD completo sobre `credit_packages` (los packs
  one-shot que pinta CreditsShopView en `/credits`). Incluye crear/borrar/
  togglear ademas de editar. Muestra columna calculada "$/credito efectivo"
  (price / (credits + bonus_credits)) para validar pricing.
- **Subscriptions** — placeholder (Fase 2).
- **Usage** — placeholder (Fase 2).

**Validacion en createPackage:**
- ID slug obligatorio, lowercase + digits + `_-` only
- credits > 0, price >= 0
- Borrar package falla si hay FK referencias (compras historicas) → ofrece
  desactivar en su lugar.

## Fase 2 — Subscriptions + Usage history (PENDIENTE)

- Tab Subscriptions: lista de subs activas (status active|trialing|past_due) con:
  - org, plan actual, provider (stripe|wompi), current_period_end, cancel_at_period_end
  - Accion "Force migrate": cambia plan_id de la sub a otro plan (cubre el caso
    de [[migrar-subs-antes-de-retirar-plan]]: IGNIS quedo en `business` legacy
    hasta migrar manual a `agency`).
- Tab Usage: historial credit_usage por org (consumos, grants, refunds).
  Filtro por kind + rango fechas. Export CSV.
- RPC nuevo: `force_migrate_subscription(p_sub_id uuid, p_new_plan_id text, p_reason text)`
  con audit log en una tabla nueva `subscription_migrations` (o metadata jsonb
  en subscriptions).

## Fase 3 — Auto-sync Stripe/Wompi (PENDIENTE)

- Endpoint Netlify `api-billing-sync-plan-stripe` y `api-billing-sync-package-stripe`:
  al editar precio_usd / price_usd_month, crea nuevo Stripe Price, archiva el
  anterior, actualiza el `stripe_price_id*` en BD.
- Endpoint Netlify `api-billing-sync-*-wompi`: equivalente para Wompi.
- Requiere credenciales activas en Netlify env (segun memoria
  [[feat019-billing]] pendiente desde 2026-05-19).
- UI: boton "Sincronizar con Stripe" en el modal de edit + indicator de
  ultimo sync.

## Notas

- 1 credito = $1 USD a tasa interna ([[credits-1usd-per-credit]]); los packages
  venden creditos a descuento (ej. Standard Pack = $159 por 1500 creditos =
  ~$0.106/credito, 9.4x mejor que 1:1).
- Frontend de orgs lee `v_org_credits_display` (FLOOR); admin console usa el
  numerico crudo para precision.
- `plans.id` y `credit_packages.id` son PK text (slug). Inmutables en edit.
- Borrar credit_package solo funciona si no hay compras historicas
  referenciadas. Si tiene FK, desactivar (`is_active=false`) es el path correcto.
