/**
 * Netlify Function: POST /api/billing/cancel
 *
 * Cancela la suscripción activa de una organización al fin del período actual
 * (no inmediata). Aplica a Stripe y Wompi por igual: marca
 * `subscriptions.cancel_at_period_end=true`. Para Stripe además llama al API
 * para sincronizar el estado del lado de Stripe (Wompi no tiene equivalente).
 *
 * Body: { organization_id, undo? }
 *   - undo=true → reactiva (cancel_at_period_end=false). Solo si todavía no
 *     pasó la fecha de cancelación.
 *
 * Response: { status: 'scheduled_cancel' | 'reactivated', cancel_at }
 *
 * FEAT-019 Fase 2.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  supabaseRest,
  assertOrgMember,
  logUserAudit,
} = require("./lib/ai-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const user = await requireAuth(event);
  if (!user) return jsonErr(event, 401, "No autenticado");

  let body = {};
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return jsonErr(event, 400, "Body JSON inválido"); }

  const { organization_id, undo } = body;
  if (!organization_id) return jsonErr(event, 400, "organization_id requerido");

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return jsonErr(event, 500, e.message); }

  try {
    // Solo owner/admin pueden cancelar (assertOrgMember acepta cualquier miembro,
    // así que validamos role aquí explícitamente).
    const members = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "organization_members",
      searchParams: { select: "role", organization_id: `eq.${organization_id}`, user_id: `eq.${user.id}` },
    });
    const role = Array.isArray(members) && members[0]?.role;
    if (!role || !["owner", "admin"].includes(role)) {
      return jsonErr(event, 403, "Solo owner o admin pueden cancelar la suscripción");
    }
  } catch (e) {
    return jsonErr(event, e.statusCode || 500, e.message);
  }

  // Localizar subscription activa
  let sub;
  try {
    const subs = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "subscriptions",
      searchParams: {
        select:          "id,plan_id,status,provider,stripe_subscription_id,current_period_end,next_charge_at,cancel_at_period_end",
        organization_id: `eq.${organization_id}`,
        status:          "in.(active,trial,past_due)",
        limit:           "1",
        order:           "updated_at.desc",
      },
    });
    sub = Array.isArray(subs) ? subs[0] : null;
    if (!sub) return jsonErr(event, 404, "No hay suscripción activa para cancelar");
  } catch (e) {
    return jsonErr(event, e.statusCode || 500, e.message);
  }

  const cancelAt = sub.provider === "wompi" ? sub.next_charge_at : sub.current_period_end;

  // Si Stripe: sincronizar con Stripe API
  if (sub.provider === "stripe" && sub.stripe_subscription_id) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      try {
        const Stripe = require("stripe");
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: !undo,
        });
      } catch (e) {
        console.warn("[billing-cancel] Stripe sync falló:", e.message);
        // Continuamos: la BD se actualiza igual; el webhook reconciliará.
      }
    }
  }

  // Actualizar BD
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `subscriptions?id=eq.${sub.id}`, method: "PATCH",
      body: {
        cancel_at_period_end: !undo,
        canceled_at:          undo ? null : new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      },
    });
  } catch (e) {
    return jsonErr(event, e.statusCode || 500, `Update BD: ${e.message}`);
  }

  await logUserAudit({
    env, event, user, organizationId: organization_id,
    action: undo ? "billing.subscription.reactivated" : "billing.subscription.scheduled_cancel",
    resourceType: "subscription",
    resourceId:   sub.id,
    metadata: { provider: sub.provider, plan_id: sub.plan_id, cancel_at: cancelAt },
  });

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      status:    undo ? "reactivated" : "scheduled_cancel",
      cancel_at: undo ? null : cancelAt,
    }),
  };
};

function jsonErr(event, statusCode, message) {
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: message }) };
}
