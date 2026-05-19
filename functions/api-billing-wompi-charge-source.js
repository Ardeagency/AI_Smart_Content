/**
 * Netlify Function: POST /api/billing/wompi/charge-source
 *
 * Cobra una transacción usando un `payment_source_id` previamente creado por
 * `api-billing-wompi-setup-source.js`. Usado para:
 *   - Cobranza inicial de una suscripción (tras crear el payment_source).
 *   - Renovaciones recurrentes (mensual/anual) invocado desde el cron.
 *
 * Body:
 *   {
 *     organization_id:   uuid,
 *     payment_source_id: number,
 *     target:            'subscription' | 'package',
 *     plan_id?:          text,
 *     package_id?:       text,
 *     billing?:          'month' | 'year',
 *     internal_cron?:    boolean,        // si true, no exige auth user (lo invoca cron-wompi-recurring)
 *     cron_secret?:      text            // requerido si internal_cron=true; debe matchear CRON_SECRET env
 *   }
 *
 * Response:
 *   {
 *     transaction_id: text,
 *     reference:      text,
 *     status:         'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED',
 *     amount_in_cents: bigint,
 *     currency:       'COP'
 *   }
 *
 * El status final llega por webhook (transaction.updated) que actualiza la
 * fila en wompi_transactions. Este endpoint solo dispara la transacción.
 *
 * FEAT-019 Fase 2.
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

const WOMPI_API_PROD = "https://production.wompi.co/v1";
const WOMPI_API_SBX  = "https://sandbox.wompi.co/v1";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const privateKey      = process.env.WOMPI_PRIVATE_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!privateKey || !integritySecret) {
    return {
      statusCode: 500, headers: corsHeaders(event),
      body: JSON.stringify({ error: "WOMPI_PRIVATE_KEY o WOMPI_INTEGRITY_SECRET no configuradas." }),
    };
  }
  const wompiBase = (process.env.WOMPI_ENVIRONMENT === "production") ? WOMPI_API_PROD : WOMPI_API_SBX;

  let body = {};
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "Body JSON inválido" }) }; }

  const { organization_id, payment_source_id, target, plan_id, package_id, billing, internal_cron, cron_secret } = body;
  if (!organization_id)   return jsonErr(event, 400, "organization_id requerido");
  if (!payment_source_id) return jsonErr(event, 400, "payment_source_id requerido");
  if (target !== "subscription" && target !== "package") {
    return jsonErr(event, 400, "target debe ser 'subscription' o 'package'");
  }
  if (target === "subscription" && !plan_id)    return jsonErr(event, 400, "plan_id requerido para target=subscription");
  if (target === "package"      && !package_id) return jsonErr(event, 400, "package_id requerido para target=package");
  const billingPeriod = billing === "year" ? "year" : "month";

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return jsonErr(event, 500, e.message); }

  // ── Auth: usuario humano o cron interno ───────────────────────
  let user = null;
  if (internal_cron) {
    const expected = process.env.CRON_SECRET;
    if (!expected || cron_secret !== expected) {
      return jsonErr(event, 401, "Cron secret inválido");
    }
  } else {
    user = await requireAuth(event);
    if (!user) return jsonErr(event, 401, "No autenticado");
    try {
      await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
    } catch (e) {
      return jsonErr(event, e.statusCode || 403, e.message);
    }
  }

  // ── Resolver amount + customer_email ──────────────────────────
  let amountInCents, planLabel, customerEmail;
  try {
    if (target === "subscription") {
      const plans = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "plans",
        searchParams: { select: "id,name,wompi_amount_cents_month,wompi_amount_cents_year", id: `eq.${plan_id}` },
      });
      const plan = Array.isArray(plans) ? plans[0] : null;
      if (!plan) return jsonErr(event, 404, "Plan no encontrado");
      amountInCents = billingPeriod === "year" ? plan.wompi_amount_cents_year : plan.wompi_amount_cents_month;
      planLabel     = plan.name;
      if (!amountInCents) return jsonErr(event, 400, `Plan "${plan.name}" sin precio Wompi (${billingPeriod}).`);
    } else {
      const pkgs = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "credit_packages",
        searchParams: { select: "id,name,wompi_amount_cents", id: `eq.${package_id}` },
      });
      const pkg = Array.isArray(pkgs) ? pkgs[0] : null;
      if (!pkg) return jsonErr(event, 404, "Paquete no encontrado");
      amountInCents = pkg.wompi_amount_cents;
      planLabel     = pkg.name;
      if (!amountInCents) return jsonErr(event, 400, `Paquete "${pkg.name}" sin precio Wompi.`);
    }

    // customer_email del wompi_customers (lo persistimos en setup-source)
    const custRows = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "wompi_customers",
      searchParams: { select: "email", organization_id: `eq.${organization_id}` },
    });
    customerEmail = (Array.isArray(custRows) && custRows[0]?.email) || user?.email || null;
    if (!customerEmail) return jsonErr(event, 400, "customer_email no resoluble (registra payment_source primero)");
  } catch (e) {
    return jsonErr(event, e.statusCode || 500, `Resolviendo monto: ${e.message}`);
  }

  // ── Generar reference + signature integrity ───────────────────
  const ts        = Date.now();
  const rand      = crypto.randomBytes(4).toString("hex");
  const prefix    = internal_cron ? "rcrn" : "init";
  const reference = `org-${organization_id}-${prefix}-${ts}-${rand}`;
  const currency  = "COP";
  const integrityInput = `${reference}${amountInCents}${currency}${integritySecret}`;
  const signature      = crypto.createHash("sha256").update(integrityInput).digest("hex");

  // ── Pre-registrar wompi_transactions PENDING ──────────────────
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "wompi_transactions", method: "POST",
      body: [{
        transaction_id:  reference,   // placeholder hasta que webhook traiga id real
        organization_id,
        reference,
        target,
        plan_id:    target === "subscription" ? plan_id    : null,
        package_id: target === "package"      ? package_id : null,
        billing:    target === "subscription" ? billingPeriod : null,
        amount_in_cents: amountInCents,
        currency,
        status: "PENDING",
        payment_source_id,
        customer_email: customerEmail,
        metadata: { plan_label: planLabel, internal_cron: !!internal_cron },
      }],
    });
  } catch (e) {
    return jsonErr(event, e.statusCode || 500, `Pre-tx insert: ${e.message}`);
  }

  // ── POST /v1/transactions con payment_source_id ───────────────
  let wompiTx;
  try {
    const txRes = await fetch(`${wompiBase}/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${privateKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        amount_in_cents:    amountInCents,
        currency,
        signature,
        customer_email:     customerEmail,
        payment_source_id,
        reference,
        recurrent:          target === "subscription",
      }),
    });
    const txJson = await txRes.json().catch(() => ({}));
    if (!txRes.ok) {
      const reason = txJson?.error?.reason || txJson?.error?.messages || JSON.stringify(txJson?.error || {}).slice(0, 300);
      // Marca pre-tx como ERROR para auditoría
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: `wompi_transactions?reference=eq.${encodeURIComponent(reference)}`, method: "PATCH",
        body: { status: "ERROR", finalized_at: new Date().toISOString(), metadata: { error: reason } },
      }).catch(() => {});
      return jsonErr(event, 422, `Wompi rechazó la transacción: ${reason}`);
    }
    wompiTx = txJson?.data;
    if (!wompiTx?.id) throw new Error("Respuesta sin transaction.id");
  } catch (e) {
    return jsonErr(event, 502, `Wompi transactions: ${e.message}`);
  }

  // ── Update pre-tx con transaction_id real ─────────────────────
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `wompi_transactions?reference=eq.${encodeURIComponent(reference)}`, method: "PATCH",
      body: { transaction_id: wompiTx.id, status: wompiTx.status || "PENDING" },
    });
  } catch (e) {
    console.warn("[wompi-charge-source] update tx_id falló:", e.message);
  }

  if (user) {
    await logUserAudit({
      env, event, user, organizationId: organization_id,
      action: target === "subscription" ? "billing.wompi.charge.subscription" : "billing.wompi.charge.package",
      resourceType: target === "subscription" ? "plan" : "credit_package",
      resourceId:   plan_id || package_id || null,
      metadata: { plan: planLabel, reference, transaction_id: wompiTx.id, amount_in_cents: amountInCents, recurrent: target === "subscription" },
    });
  }

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      transaction_id:  wompiTx.id,
      reference,
      status:          wompiTx.status || "PENDING",
      amount_in_cents: amountInCents,
      currency,
    }),
  };
};

function jsonErr(event, statusCode, message) {
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: message }) };
}
