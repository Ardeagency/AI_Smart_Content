/**
 * Netlify Function: POST /api/billing/wompi/webhook
 *
 * Recibe eventos Wompi. Valida la firma SHA256 con WOMPI_EVENTS_SECRET
 * (concatena los valores de signature.properties + timestamp + secreto, hashea
 * y compara con X-Event-Checksum o signature.checksum). Dedup por event_id.
 *
 * Eventos manejados:
 *   - transaction.updated  → actualiza wompi_transactions.status. Si APPROVED:
 *                            guarda payment_source para recurring, suma créditos
 *                            (paquete) o crea/actualiza subscription (sub).
 *
 * NO requiere Bearer token — la auth es la firma Wompi.
 * FEAT-019.
 */

const crypto = require("crypto");
const {
  getSupabaseEnv,
  supabaseRest,
} = require("./lib/ai-shared");

const PLAIN_HEADERS = { "Content-Type": "application/json" };
const WOMPI_API_PROD = "https://production.wompi.co/v1";
const WOMPI_API_SBX  = "https://sandbox.wompi.co/v1";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  if (!eventsSecret) {
    console.error("[wompi-webhook] WOMPI_EVENTS_SECRET no configurada");
    return { statusCode: 500, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Wompi events secret missing" }) };
  }

  // ── Parse payload ───────────────────────────────────────────────
  let payload;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    payload   = JSON.parse(raw || "{}");
  } catch (e) {
    return { statusCode: 400, headers: PLAIN_HEADERS, body: JSON.stringify({ error: `Body JSON inválido: ${e.message}` }) };
  }

  const eventType = payload.event;
  const sigObj    = payload.signature || {};
  const sigProps  = Array.isArray(sigObj.properties) ? sigObj.properties : [];
  const sigCheck  = sigObj.checksum || "";
  const timestamp = payload.timestamp;
  if (!eventType || !timestamp || sigProps.length === 0 || !sigCheck) {
    return { statusCode: 400, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Payload Wompi inválido (faltan campos signature/timestamp)" }) };
  }

  // ── Validar firma ────────────────────────────────────────────────
  // Concatena los valores de signature.properties (resolviendo dot-paths sobre data)
  // + timestamp + WOMPI_EVENTS_SECRET → SHA256 → compara contra checksum.
  const concatValues = sigProps.map((path) => String(getByPath(payload.data, path) ?? "")).join("");
  const expected     = crypto.createHash("sha256").update(`${concatValues}${timestamp}${eventsSecret}`).digest("hex").toUpperCase();
  const received     = String(sigCheck).toUpperCase();
  const headerCheck  = String(event.headers?.["x-event-checksum"] || event.headers?.["X-Event-Checksum"] || "").toUpperCase();

  if (expected !== received && expected !== headerCheck) {
    console.error("[wompi-webhook] firma inválida", { eventType });
    return { statusCode: 401, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Firma inválida" }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) {
    console.error("[wompi-webhook] supabase env:", e.message);
    return { statusCode: 500, headers: PLAIN_HEADERS, body: JSON.stringify({ error: e.message }) };
  }

  // ── event_id determinístico: checksum + timestamp para idempotencia ─────
  const eventId = `${received}_${timestamp}`;

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "wompi_webhook_events", method: "POST",
      body: [{ event_id: eventId, type: eventType, payload }],
    });
  } catch (e) {
    if (e.statusCode === 409 || /duplicate|already exists/i.test(e.message || "")) {
      console.log(`[wompi-webhook] evento ${eventId} ya procesado — skip`);
      return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true, deduped: true }) };
    }
    console.error("[wompi-webhook] insert event:", e.message);
    return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true, log_error: e.message }) };
  }

  // ── Dispatch ────────────────────────────────────────────────────
  try {
    switch (eventType) {
      case "transaction.updated":
        await handleTransactionUpdated({ env, payload });
        break;
      case "nequi_token.updated":
      case "bancolombia_transfer_token.updated":
        // No-op por ahora; los registramos para audit pero no actuamos.
        console.log(`[wompi-webhook] ${eventType} recibido — sin acción`);
        break;
      default:
        console.log(`[wompi-webhook] tipo no manejado: ${eventType}`);
    }

    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `wompi_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, method: "PATCH",
      body: { processed_at: new Date().toISOString() },
    });

    return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true }) };
  } catch (e) {
    console.error(`[wompi-webhook] error en ${eventType}:`, e.message);
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `wompi_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, method: "PATCH",
      body: { error_message: String(e.message || e).slice(0, 1000) },
    }).catch(() => {});
    return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true, handler_error: e.message }) };
  }
};

// ── Handlers ─────────────────────────────────────────────────────────

async function handleTransactionUpdated({ env, payload }) {
  const tx = payload?.data?.transaction;
  if (!tx) return console.warn("[wompi-webhook] transaction.updated sin data.transaction");

  const reference = tx.reference;
  if (!reference) return console.warn("[wompi-webhook] tx sin reference — no se puede mapear");

  // Localizar pre-transacción local
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "wompi_transactions",
    searchParams: { select: "transaction_id,organization_id,target,plan_id,package_id,billing,status", reference: `eq.${reference}` },
  });
  const local = Array.isArray(existing) && existing[0] ? existing[0] : null;
  if (!local) {
    console.warn(`[wompi-webhook] no se encontró wompi_transactions con reference=${reference}`);
    return;
  }

  // payment_source_id puede venir directo en tx (Widget guardado) o haber que
  // consultar /v1/transactions/<id> para obtenerlo. Usamos el directo si existe.
  const paymentSourceId   = tx.payment_source_id || tx.payment_method?.installments_data?.payment_source_id || null;
  const paymentMethodType = tx.payment_method_type || tx.payment_method?.type || null;

  // Update fila local con el id real de Wompi y campos finales
  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: `wompi_transactions?reference=eq.${encodeURIComponent(reference)}`, method: "PATCH",
    body: {
      transaction_id:      tx.id || local.transaction_id,
      status:              tx.status || local.status,
      payment_method_type: paymentMethodType,
      payment_source_id:   paymentSourceId,
      customer_email:      tx.customer_email || null,
      finalized_at:        new Date().toISOString(),
    },
  });

  // Solo seguimos si la tx fue aprobada
  if (tx.status !== "APPROVED") {
    console.log(`[wompi-webhook] tx ${reference} status=${tx.status} — no se aplica.`);
    return;
  }

  const orgId  = local.organization_id;
  const target = local.target;

  // Actualizar wompi_customers (para recurring futuro)
  if (paymentSourceId) {
    const last4 = tx.payment_method?.extra?.last_four || null;
    const brand = tx.payment_method?.extra?.brand     || tx.payment_method?.extra?.card_type || null;
    const upsert = {
      organization_id:              orgId,
      email:                        tx.customer_email || null,
      last_payment_source_id:       paymentSourceId,
      last_payment_source_brand:    brand,
      last_payment_source_last_four: last4,
      last_customer_id:             tx.customer_id || null,
    };
    const existingCust = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "wompi_customers",
      searchParams: { select: "organization_id", organization_id: `eq.${orgId}` },
    });
    if (Array.isArray(existingCust) && existingCust.length > 0) {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: `wompi_customers?organization_id=eq.${orgId}`, method: "PATCH",
        body: upsert,
      });
    } else {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "wompi_customers", method: "POST",
        body: [upsert],
      });
    }
  }

  if (target === "package") {
    await applyPackageCredits({ env, orgId, packageId: local.package_id });
  } else if (target === "subscription") {
    await applySubscription({ env, orgId, planId: local.plan_id, billing: local.billing, paymentSourceId, txId: tx.id });
  }
}

async function applyPackageCredits({ env, orgId, packageId }) {
  if (!packageId) return console.warn("[wompi-webhook] package sin package_id");
  const pkgs = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "credit_packages",
    searchParams: { select: "credits,bonus_credits", id: `eq.${packageId}` },
  });
  const pkg = Array.isArray(pkgs) ? pkgs[0] : null;
  if (!pkg) return console.warn(`[wompi-webhook] credit_package "${packageId}" no encontrado`);

  const totalCredits = (pkg.credits || 0) + (pkg.bonus_credits || 0);
  if (totalCredits <= 0) return;

  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "organization_credits",
    searchParams: { select: "credits_available,credits_total", organization_id: `eq.${orgId}` },
  });
  const cur      = Array.isArray(existing) && existing[0] ? existing[0] : { credits_available: 0, credits_total: 0 };
  const newAvail = Number(cur.credits_available || 0) + totalCredits;
  const newTotal = Number(cur.credits_total     || 0) + totalCredits;
  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `organization_credits?organization_id=eq.${orgId}`, method: "PATCH",
      body: { credits_available: newAvail, credits_total: newTotal, updated_at: new Date().toISOString() },
    });
  } else {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "organization_credits", method: "POST",
      body: [{ organization_id: orgId, credits_available: newAvail, credits_total: newTotal }],
    });
  }
  console.log(`[wompi-webhook] org ${orgId} +${totalCredits} créditos (paquete ${packageId})`);
}

async function applySubscription({ env, orgId, planId, billing, paymentSourceId, txId }) {
  if (!planId) return console.warn("[wompi-webhook] subscription sin plan_id");

  const periodMs   = billing === "year" ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  const now        = Date.now();
  const periodStart = new Date(now).toISOString();
  const periodEnd   = new Date(now + periodMs).toISOString();

  const row = {
    organization_id:           orgId,
    plan_id:                   planId,
    status:                    "active",
    current_period_start:      periodStart,
    current_period_end:        periodEnd,
    provider:                  "wompi",
    wompi_last_transaction_id: txId,
    wompi_payment_source_id:   paymentSourceId,
    next_charge_at:            periodEnd,
    cancel_at_period_end:      false,
    canceled_at:               null,
    metadata:                  { billing },
    updated_at:                new Date().toISOString(),
  };

  // Upsert por organization_id + provider (la idx parcial one_active_sub_per_org
  // ya garantiza máx 1 sub activa por org)
  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "subscriptions",
    searchParams: { select: "id,status", organization_id: `eq.${orgId}`, provider: `eq.wompi` },
  });

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `subscriptions?organization_id=eq.${orgId}&provider=eq.wompi`, method: "PATCH",
      body: row,
    });
  } else {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "subscriptions", method: "POST",
      body: [row],
    });
  }
  console.log(`[wompi-webhook] org ${orgId} subscription wompi ${billing} activa hasta ${periodEnd}`);
}

// ── Helpers ──────────────────────────────────────────────────────────

function getByPath(obj, path) {
  if (!obj || typeof path !== "string") return undefined;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
