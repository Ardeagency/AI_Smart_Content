/**
 * Netlify Function: POST /api/billing/wompi/checkout
 *
 * Inicia un cobro Wompi. Resuelve el monto en COP desde plans/credit_packages,
 * firma la transacción con SHA256 (integrity) y registra una pre-transacción
 * PENDING en wompi_transactions. El frontend usa la respuesta para abrir el
 * Widget Wompi o redirigir a Checkout Web.
 *
 * Body:
 *   {
 *     organization_id: uuid,
 *     target:          'subscription' | 'package',
 *     plan_id?:        text   // requerido si target=subscription
 *     package_id?:     text   // requerido si target=package
 *     billing?:        'month' | 'year'   // default 'month'
 *     redirect_path?:  text   // default '/configuracion?billing=success'
 *   }
 *
 * Response:
 *   {
 *     public_key,
 *     reference,
 *     amount_in_cents,
 *     currency,
 *     signature,
 *     redirect_url,
 *     expiration_time,
 *     customer_email,
 *     transaction_local_id   // = reference (para tracking en frontend)
 *   }
 *
 * Activación: env vars WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET,
 * WOMPI_ENVIRONMENT (sandbox|production, default sandbox).
 * FEAT-019.
 */

const crypto = require("crypto");
const {
  corsHeaders,
  getSupabaseEnv,
  requireAuth,
  supabaseRest,
  assertOrgMember,
  logUserAudit,
} = require("./lib/ai-shared");

const EXPIRATION_MINUTES = 30;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const publicKey      = process.env.WOMPI_PUBLIC_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!publicKey || !integritySecret) {
    return {
      statusCode: 500, headers: corsHeaders(event),
      body: JSON.stringify({ error: "WOMPI_PUBLIC_KEY o WOMPI_INTEGRITY_SECRET no configuradas. Define las variables en Netlify." }),
    };
  }

  const user = await requireAuth(event);
  if (!user) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: "No autenticado" }) };
  }

  let body = {};
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "Body JSON inválido" }) }; }

  const { organization_id, target, plan_id, package_id, billing, redirect_path } = body;
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
  const billingPeriod = billing === "year" ? "year" : "month";

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  // Membresía
  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
  } catch (e) {
    return { statusCode: e.statusCode || 403, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  // Resolver amount_in_cents (COP)
  let amountInCents, planLabel;
  try {
    if (target === "subscription") {
      const plans = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "plans",
        searchParams: { select: "id,name,wompi_amount_cents_month,wompi_amount_cents_year", id: `eq.${plan_id}` },
      });
      const plan = Array.isArray(plans) ? plans[0] : null;
      if (!plan) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: "Plan no encontrado" }) };
      amountInCents = billingPeriod === "year" ? plan.wompi_amount_cents_year : plan.wompi_amount_cents_month;
      planLabel     = plan.name;
      if (!amountInCents) {
        return {
          statusCode: 400, headers: corsHeaders(event),
          body: JSON.stringify({ error: `Plan "${plan.name}" no tiene precio Wompi configurado para billing=${billingPeriod}. Setea plans.wompi_amount_cents_${billingPeriod}.` }),
        };
      }
    } else {
      const pkgs = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "credit_packages",
        searchParams: { select: "id,name,wompi_amount_cents", id: `eq.${package_id}` },
      });
      const pkg = Array.isArray(pkgs) ? pkgs[0] : null;
      if (!pkg) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: "Paquete no encontrado" }) };
      amountInCents = pkg.wompi_amount_cents;
      planLabel     = pkg.name;
      if (!amountInCents) {
        return {
          statusCode: 400, headers: corsHeaders(event),
          body: JSON.stringify({ error: `Paquete "${pkg.name}" no tiene precio Wompi configurado. Setea credit_packages.wompi_amount_cents.` }),
        };
      }
    }
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: `Error resolviendo monto: ${e.message}` }) };
  }

  // Generar reference única: org-<id>-<ts>-<rand>
  const ts        = Date.now();
  const rand      = crypto.randomBytes(4).toString("hex");
  const reference = `org-${organization_id}-${ts}-${rand}`;
  const currency  = "COP";

  // expirationTime: ISO8601 UTC con sufijo .000Z (formato Wompi)
  const expirationDate = new Date(ts + EXPIRATION_MINUTES * 60 * 1000);
  const expirationTime = expirationDate.toISOString().replace(/\.\d{3}Z$/, ".000Z");

  // Firma de integridad: SHA256(reference + amount + currency + expirationTime + integritySecret)
  const integrityInput = `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`;
  const signature      = crypto.createHash("sha256").update(integrityInput).digest("hex");

  // URL de retorno
  const origin     = event.headers?.origin || `https://${event.headers?.host || "console.aismartcontent.io"}`;
  const redirectUrl = origin + (redirect_path || `/configuracion?billing=success&ref=${encodeURIComponent(reference)}`);

  // Registrar pre-transacción PENDING en wompi_transactions
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "wompi_transactions", method: "POST",
      body: [{
        transaction_id:  reference,   // placeholder hasta que Wompi devuelva el real (lo actualiza el webhook)
        organization_id,
        reference,
        target,
        plan_id:    target === "subscription" ? plan_id    : null,
        package_id: target === "package"      ? package_id : null,
        billing:    target === "subscription" ? billingPeriod : null,
        amount_in_cents: amountInCents,
        currency,
        status: "PENDING",
        customer_email: user.email || null,
        metadata: { plan_label: planLabel, expiration_time: expirationTime, signature_input_hash: signature },
      }],
    });
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: `Error registrando pre-tx: ${e.message}` }) };
  }

  // Audit best-effort
  await logUserAudit({
    env, event, user, organizationId: organization_id,
    action: target === "subscription" ? "billing.wompi.checkout.subscription" : "billing.wompi.checkout.package",
    resourceType: target === "subscription" ? "plan" : "credit_package",
    resourceId:   plan_id || package_id || null,
    metadata: { plan: planLabel, billing: billingPeriod, reference, amount_in_cents: amountInCents },
  });

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      public_key:           publicKey,
      reference,
      amount_in_cents:      amountInCents,
      currency,
      signature,
      redirect_url:         redirectUrl,
      expiration_time:      expirationTime,
      customer_email:       user.email || null,
      transaction_local_id: reference,
    }),
  };
};
