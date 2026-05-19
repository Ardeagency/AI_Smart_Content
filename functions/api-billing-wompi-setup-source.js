/**
 * Netlify Function: POST /api/billing/wompi/setup-source
 *
 * Crea un `payment_source` persistente en Wompi a partir de un card_token
 * tokenizado por el frontend (vía `/v1/tokens/cards`). Necesario para
 * suscripciones recurrentes — Wompi no las tiene nativas, así que guardamos
 * el payment_source_id y lo reusamos en cobranzas mensuales/anuales.
 *
 * Body:
 *   {
 *     organization_id: uuid,
 *     card_token:      'tok_test_...',   // del frontend tras POST /v1/tokens/cards
 *     customer_email?: string            // default: user.email
 *   }
 *
 * Response (ok):
 *   {
 *     payment_source_id: number,
 *     status:            'AVAILABLE' | 'PENDING' | 'DECLINED' | 'ERROR',
 *     brand:             string,
 *     last_four:         string,
 *     status_reason?:    string          // si DECLINED/ERROR
 *   }
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

const WOMPI_API_PROD = "https://production.wompi.co/v1";
const WOMPI_API_SBX  = "https://sandbox.wompi.co/v1";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const publicKey  = process.env.WOMPI_PUBLIC_KEY;
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return {
      statusCode: 500, headers: corsHeaders(event),
      body: JSON.stringify({ error: "WOMPI_PUBLIC_KEY o WOMPI_PRIVATE_KEY no configuradas." }),
    };
  }

  const wompiBase = (process.env.WOMPI_ENVIRONMENT === "production") ? WOMPI_API_PROD : WOMPI_API_SBX;

  const user = await requireAuth(event);
  if (!user) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: "No autenticado" }) };
  }

  let body = {};
  try { body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {}; }
  catch (_) { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "Body JSON inválido" }) }; }

  const { organization_id, card_token, customer_email } = body;
  if (!organization_id) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "organization_id requerido" }) };
  if (!card_token || typeof card_token !== "string") {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "card_token requerido (tokenizar primero con /v1/tokens/cards)" }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
  } catch (e) {
    return { statusCode: e.statusCode || 403, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const finalEmail = (customer_email || user.email || "").trim();
  if (!finalEmail) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: "customer_email requerido (sin email en sesión)" }) };
  }

  // 1) Obtener acceptance tokens
  let acceptanceToken, acceptPersonalAuth;
  try {
    const merchantRes = await fetch(`${wompiBase}/merchants/${encodeURIComponent(publicKey)}`);
    if (!merchantRes.ok) {
      const t = await merchantRes.text().catch(() => "");
      throw new Error(`merchants ${merchantRes.status} ${t.slice(0, 200)}`);
    }
    const mj = await merchantRes.json();
    acceptanceToken     = mj?.data?.presigned_acceptance?.acceptance_token   || null;
    acceptPersonalAuth  = mj?.data?.presigned_personal_data_auth?.acceptance_token || null;
    if (!acceptanceToken || !acceptPersonalAuth) {
      throw new Error("Wompi no devolvió acceptance_token o accept_personal_auth");
    }
  } catch (e) {
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: `Wompi merchants: ${e.message}` }) };
  }

  // 2) Crear payment_source
  let payment_source;
  try {
    const psRes = await fetch(`${wompiBase}/payment_sources`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${privateKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        type:                  "CARD",
        token:                 card_token,
        customer_email:        finalEmail,
        acceptance_token:      acceptanceToken,
        accept_personal_auth:  acceptPersonalAuth,
      }),
    });
    const psJson = await psRes.json().catch(() => ({}));
    if (!psRes.ok) {
      const reason = psJson?.error?.reason || psJson?.error?.messages || JSON.stringify(psJson?.error || {}).slice(0, 300);
      return {
        statusCode: 422, headers: corsHeaders(event),
        body: JSON.stringify({ error: `Wompi payment_sources rechazó la tarjeta: ${reason}` }),
      };
    }
    payment_source = psJson?.data;
    if (!payment_source?.id) throw new Error("Respuesta sin payment_source.id");
  } catch (e) {
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: `Wompi payment_sources: ${e.message}` }) };
  }

  const status        = payment_source.status || "PENDING";
  const statusReason  = payment_source.status_reason || null;
  const publicData    = payment_source.public_data || {};
  const brand         = publicData.brand     || publicData.card_brand || null;
  const lastFour      = publicData.last_four || publicData.last_4     || null;

  // 3) Persistir en wompi_customers (upsert)
  try {
    const existing = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "wompi_customers",
      searchParams: { select: "organization_id", organization_id: `eq.${organization_id}` },
    });
    const row = {
      organization_id,
      email:                          finalEmail,
      last_payment_source_id:         payment_source.id,
      last_payment_source_brand:      brand,
      last_payment_source_last_four:  lastFour,
    };
    if (Array.isArray(existing) && existing.length > 0) {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: `wompi_customers?organization_id=eq.${organization_id}`, method: "PATCH",
        body: row,
      });
    } else {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "wompi_customers", method: "POST",
        body: [row],
      });
    }
  } catch (e) {
    console.warn("[wompi-setup-source] persistencia wompi_customers falló:", e.message);
    // no abortamos: el payment_source ya existe en Wompi, devolvemos al frontend.
  }

  await logUserAudit({
    env, event, user, organizationId: organization_id,
    action: "billing.wompi.payment_source.created",
    resourceType: "wompi_payment_source",
    resourceId:   String(payment_source.id),
    metadata: { status, brand, last_four: lastFour },
  });

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      payment_source_id: payment_source.id,
      status,
      brand,
      last_four:     lastFour,
      status_reason: statusReason,
    }),
  };
};
