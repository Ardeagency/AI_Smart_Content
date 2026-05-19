/**
 * Netlify Function: POST /api/billing/portal
 *
 * Crea una Stripe Customer Portal Session para que el user gestione su
 * suscripción (cancelar, actualizar tarjeta, ver facturas) en una UI hosted
 * por Stripe.
 *
 * Body: { organization_id, return_path? }
 * Response: { url }
 *
 * FEAT-019.
 */

const Stripe = require("stripe");
const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  supabaseRest,
  assertOrgMember,
} = require("./lib/ai-shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      statusCode: 500, headers: corsHeaders(event),
      body: JSON.stringify({ error: "STRIPE_SECRET_KEY no configurada." }),
    };
  }

  const user = await requireAuth(event);
  if (!user) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: "No autenticado" }) };
  }

  let body = {};
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "Body JSON inválido" }) }; }

  const { organization_id, return_path } = body;
  if (!organization_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "organization_id requerido" }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
  } catch (e) {
    return { statusCode: e.statusCode || 403, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  // Lookup Stripe Customer
  let stripeCustomerId;
  try {
    const customers = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "stripe_customers",
      searchParams: { select: "stripe_customer_id", organization_id: `eq.${organization_id}` },
    });
    stripeCustomerId = Array.isArray(customers) && customers[0] ? customers[0].stripe_customer_id : null;
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  if (!stripeCustomerId) {
    return {
      statusCode: 404, headers: corsHeaders(event),
      body: JSON.stringify({ error: "Esta organización aún no tiene cuenta Stripe. Realiza una compra primero." }),
    };
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });
  const origin = event.headers?.origin || `https://${event.headers?.host || "console.aismartcontent.io"}`;
  const returnUrl = origin + (return_path || "/configuracion");

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   stripeCustomerId,
      return_url: returnUrl,
    });
    return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify({ url: session.url }) };
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: `Stripe portal error: ${e.message}` }) };
  }
};
