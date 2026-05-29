# FEAT-036 — Billing Console (dev/lead/billing)

Console admin de billing para el equipo: editar plans, ajustar creditos por org,
ver subscriptions y historial. Acceso solo lead (gated por `is_lead()`).

## Fase 1 — Plans CRUD + Org Credits grant (CERRADA)

**Ruta:** `/dev/lead/billing` (registered en `app.js`)
**View:** `js/views/DevLeadBillingView.js`
**RPC:** `public.grant_credits_admin(p_org_id uuid, p_amount numeric, p_reason text)`
  - SECURITY DEFINER, gated por `is_lead()`
  - Validacion: monto != 0, razon min 4 chars, no permite drop debajo de 0
  - Escribe organization_credits + credit_usage con kind='admin_grant'/'admin_debit'
  - Metadata: `{granted_by: uuid, reason: text}`
**Sidebar entry:** Admin > Billing (icon credits.svg)
**CSS:** `dev-lead-billing` scope en `css/modules/developer.css`

**Tabs:**
- **Plans** — list/edit BD (precio, creditos, storage, features, popular, active, display_order, stripe_price_ids, wompi_cents). Stripe sync = warning visual; no toca Stripe API aun.
- **Org Credits** — buscar org, mostrar saldo, ajustar con monto+razon via RPC.
- **Subscriptions** — placeholder (Fase 2).
- **Usage** — placeholder (Fase 2).

## Fase 2 — Subscriptions + Usage history (PENDIENTE)

- Tab Subscriptions: lista de subs activas (status active|trialing|past_due) con:
  - org, plan actual, provider (stripe|wompi), current_period_end, cancel_at_period_end
  - Accion "Force migrate": cambia plan_id de la sub a otro plan (cubre el caso
    de [[migrar-subs-antes-de-retirar-plan]]: IGNIS quedo en `business` legacy
    hasta migrar manual a `agency`).
- Tab Usage: historial credit_usage por org (consumos, grants, refunds).
  Filtro por kind + rango fechas. Export CSV.
- RPC nuevo: `force_migrate_subscription(p_sub_id uuid, p_new_plan_id text, p_reason text)`
  con audit log en una tabla nueva `subscription_migrations` (o metadata jsonb en
  subscriptions).

## Fase 3 — Auto-sync Stripe/Wompi (PENDIENTE)

- Endpoint Netlify `api-billing-sync-plan-stripe`: al editar precio_usd_month,
  crea nuevo Stripe Price, archiva el anterior, actualiza `stripe_price_id_month` en BD.
- Endpoint Netlify `api-billing-sync-plan-wompi`: equivalente para Wompi.
- Requiere credenciales activas en Netlify env (segun memoria
  [[feat019-billing]] pendiente desde 2026-05-19).
- UI: boton "Sincronizar con Stripe" en el modal de edit plan + indicator de
  ultimo sync.

## Notas

- 1 credito = $1 USD (modelo decimal interno, ver memoria [[credits-1usd-per-credit]]).
- Frontend de orgs normales lee `v_org_credits_display` (FLOOR); admin console
  usa el numerico crudo de organization_credits para precision.
- Plans table tiene PK text (slug): `creator`, `team`, `agency`, etc. ID
  inmutable; nombre/precio si.
- Legacy plans (is_active=false con subs activas): no migrar automaticamente,
  requiere accion explicita en Fase 2.
