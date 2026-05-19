/**
 * Netlify Function: POST /api/billing/checkout
 *
 * Crea una Stripe Checkout Session para suscribir a un plan o comprar un
 * paquete de créditos. Si no existe Stripe Customer para la org, lo crea.
 *
 * Body:
 *   {
 *     organization_id: uuid,
 *     target:          'subscription' | 'package',
 *     plan_id?:        text   // requerido si target=subscription
 *     package_id?:     text   // requerido si target=package
 *     billing?:        'month' | 'year'   // sub: default 'month'
 *     success_path?:   text   // path relativo, default '/configuracion?billing=success'
 *     cancel_path?:    text   // default '/planes?billing=cancelled'
 *   }
 *
 * Response: { url } → frontend hace window.location = url.
 *
 * FEAT-019. Activación: definir STRIPE_SECRET_KEY en Netlify env + mapear
 * stripe_price_id_month/year en plans y stripe_price_id en credit_packages.
 */

const Stripe = require("stripe");
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

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      statusCode: 500, headers: corsHeaders(event),
      body: JSON.stringify({ error: "STRIPE_SECRET_KEY no configurada. Define la variable de entorno en Netlify." }),
    };
  }

  const user = await requireAuth(event);
  if (!user) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: "No autenticado" }) };
  }

  let body = {};
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "Body JSON inválido" }) }; }

  const { organization_id, target, plan_id, package_id, billing, success_path, cancel_path } = body;
  if (!organization_id) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "organization_id requerido" }) };
  if (target !== "subscription" && target !== "package") {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "target debe ser 'subscription' o 'package'" }) };
  }
  if (target === "subscription" && !plan_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "plan_id requerido para target=subscription" }) };
  }
  if (target === "package" && !package_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "package_id requerido para target=package" }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  // Verificar membresía
  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
  } catch (e) {
    return { statusCode: e.statusCode || 403, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  // Resolver Stripe Price ID
  let stripePriceId, mode, planLabel;
  try {
    if (target === "subscription") {
      const plans = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "plans",
        searchParams: { select: "id,name,stripe_price_id_month,stripe_price_id_year", id: `eq.${plan_id}` },
      });
      const plan = Array.isArray(plans) ? plans[0] : null;
      if (!plan) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: "Plan no encontrado" }) };
      stripePriceId = billing === "year" ? plan.stripe_price_id_year : plan.stripe_price_id_month;
      planLabel = plan.name;
      if (!stripePriceId) {
        return {
          statusCode: 400, headers: corsHeaders(event),
          body: JSON.stringify({ error: `Plan "${plan.name}" no tiene Stripe Price ID configurado para billing=${billing || "month"}. Crea el price en Stripe Dashboard y mapéalo en plans.stripe_price_id_${billing === "year" ? "year" : "month"}.` }),
        };
      }
      mode = "subscription";
    } else {
      const pkgs = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "credit_packages",
        searchParams: { select: "id,name,stripe_price_id", id: `eq.${package_id}` },
      });
      const pkg = Array.isArray(pkgs) ? pkgs[0] : null;
      if (!pkg) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: "Paquete no encontrado" }) };
      stripePriceId = pkg.stripe_price_id;
      planLabel = pkg.name;
      if (!stripePriceId) {
        return {
          statusCode: 400, headers: corsHeaders(event),
          body: JSON.stringify({ error: `Paquete "${pkg.name}" no tiene Stripe Price ID. Mapea credit_packages.stripe_price_id.` }),
        };
      }
      mode = "payment";
    }
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: `Error resolviendo price: ${e.message}` }) };
  }

  // Resolver / crear Stripe Customer
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });
  let stripeCustomerId;
  try {
    const existing = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "stripe_customers",
      searchParams: { select: "stripe_customer_id", organization_id: `eq.${organization_id}` },
    });
    if (Array.isArray(existing) && existing.length > 0) {
      stripeCustomerId = existing[0].stripe_customer_id;
    } else {
      // Crear nuevo customer en Stripe
      const orgs = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "organizations",
        searchParams: { select: "name", id: `eq.${organization_id}` },
      });
      const orgName = Array.isArray(orgs) && orgs[0] ? orgs[0].name : null;
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     orgName || user.email,
        metadata: { organization_id, user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "stripe_customers", method: "POST",
        body: [{ organization_id, stripe_customer_id: stripeCustomerId, email: user.email }],
      });
    }
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: `Error con customer Stripe: ${e.message}` }) };
  }

  // Crear Checkout Session
  const origin = event.headers?.origin || `https://${event.headers?.host || "console.aismartcontent.io"}`;
  const successUrl = origin + (success_path || "/configuracion?billing=success&session_id={CHECKOUT_SESSION_ID}");
  const cancelUrl  = origin + (cancel_path  || "/planes?billing=cancelled");

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      customer:        stripeCustomerId,
      line_items:      [{ price: stripePriceId, quantity: 1 }],
      success_url:     successUrl,
      cancel_url:      cancelUrl,
      allow_promotion_codes: true,
      automatic_tax:   { enabled: false },
      metadata: {
        organization_id,
        target,
        plan_id:    plan_id    || "",
        package_id: package_id || "",
        billing:    billing    || "",
      },
      subscription_data: mode === "subscription" ? {
        metadata: { organization_id, plan_id: plan_id || "" },
      } : undefined,
    });

    // Audit best-effort
    await logUserAudit({
      env, event, user, organizationId: organization_id,
      action: target === "subscription" ? "billing.checkout.subscription" : "billing.checkout.package",
      resourceType: target === "subscription" ? "plan" : "credit_package",
      resourceId:   plan_id || package_id || null,
      metadata: { plan: planLabel, billing: billing || null, session_id: session.id },
    });

    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({ url: session.url, session_id: session.id }),
    };
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: `Stripe checkout error: ${e.message}` }) };
  }
};
