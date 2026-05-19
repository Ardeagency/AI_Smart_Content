/**
 * Netlify Function: POST /api/billing/webhook
 *
 * Recibe webhooks de Stripe. Valida firma con STRIPE_WEBHOOK_SECRET y dedupe
 * por event_id en `stripe_webhook_events`.
 *
 * Eventos manejados:
 *   - checkout.session.completed     → si mode=subscription: vincula stripe_customer_id a org
 *                                       si mode=payment (one-time): registra invoice y suma créditos
 *   - invoice.paid                   → upsert stripe_invoices + sync subscription.current_period_end
 *   - invoice.payment_failed         → marca subscription.status='past_due'
 *   - customer.subscription.created  → upsert subscription
 *   - customer.subscription.updated  → upsert subscription
 *   - customer.subscription.deleted  → subscription.status='canceled', canceled_at=now
 *
 * NO requiere Bearer token — la auth es la firma Stripe.
 * FEAT-019.
 */

const Stripe = require("stripe");
const {
  getSupabaseEnv,
  supabaseRest,
} = require("./lib/ai-shared");

// El webhook no necesita CORS (Stripe llama server-to-server) pero respondemos
// con headers mínimos.
const PLAIN_HEADERS = { "Content-Type": "application/json" };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const stripeKey   = process.env.STRIPE_SECRET_KEY;
  const webhookSec  = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSec) {
    console.error("[billing-webhook] STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET no configuradas");
    return { statusCode: 500, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Stripe env vars missing" }) };
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });

  // ── Validación de firma ─────────────────────────────────────────
  // Stripe necesita el raw body exacto. Netlify entrega event.body como string
  // (UTF-8). Si está base64-encoded (rare), lo decodificamos.
  const signature = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];
  if (!signature) {
    return { statusCode: 400, headers: PLAIN_HEADERS, body: JSON.stringify({ error: "Stripe-Signature header missing" }) };
  }
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSec);
  } catch (e) {
    console.error("[billing-webhook] firma inválida:", e.message);
    return { statusCode: 400, headers: PLAIN_HEADERS, body: JSON.stringify({ error: `Firma inválida: ${e.message}` }) };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) {
    console.error("[billing-webhook] supabase env:", e.message);
    return { statusCode: 500, headers: PLAIN_HEADERS, body: JSON.stringify({ error: e.message }) };
  }

  // ── Dedup por event_id ──────────────────────────────────────────
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "stripe_webhook_events", method: "POST",
      body: [{ event_id: stripeEvent.id, type: stripeEvent.type, payload: stripeEvent.data?.object || null }],
    });
  } catch (e) {
    // Si el evento ya existe (PK violation 23505 / 409), retornar 200 silenciosamente.
    if (e.statusCode === 409 || /duplicate|already exists/i.test(e.message || "")) {
      console.log(`[billing-webhook] evento ${stripeEvent.id} ya procesado — skip`);
      return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true, deduped: true }) };
    }
    console.error("[billing-webhook] insert event:", e.message);
    // No retornamos error a Stripe — re-encolaría el webhook. Mejor 200 + log.
    return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true, log_error: e.message }) };
  }

  // ── Dispatch por tipo ───────────────────────────────────────────
  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted({ stripe, env, session: stripeEvent.data.object });
        break;
      case "invoice.paid":
        await handleInvoicePaid({ env, invoice: stripeEvent.data.object });
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed({ env, invoice: stripeEvent.data.object });
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert({ env, sub: stripeEvent.data.object });
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted({ env, sub: stripeEvent.data.object });
        break;
      default:
        console.log(`[billing-webhook] tipo no manejado: ${stripeEvent.type}`);
    }

    // Marcar processed_at
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `stripe_webhook_events?event_id=eq.${stripeEvent.id}`, method: "PATCH",
      body: { processed_at: new Date().toISOString() },
    });

    return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true }) };
  } catch (e) {
    console.error(`[billing-webhook] error en ${stripeEvent.type}:`, e.message);
    // Marcar error en la fila para debugging
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `stripe_webhook_events?event_id=eq.${stripeEvent.id}`, method: "PATCH",
      body: { error_message: String(e.message || e).slice(0, 1000) },
    }).catch(() => {});
    // 200 igual para que Stripe no reintente indefinidamente; los logs y la fila quedan.
    return { statusCode: 200, headers: PLAIN_HEADERS, body: JSON.stringify({ received: true, handler_error: e.message }) };
  }
};

// ── Handlers ───────────────────────────────────────────────────────

async function handleCheckoutCompleted({ stripe, env, session }) {
  const orgId       = session.metadata?.organization_id;
  const target      = session.metadata?.target;
  const customerId  = session.customer;
  if (!orgId) return console.warn("[billing-webhook] checkout.session.completed sin organization_id en metadata");

  // Asegurar mapping en stripe_customers (puede ya existir vía checkout endpoint)
  if (customerId) {
    const existing = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "stripe_customers",
      searchParams: { select: "organization_id", stripe_customer_id: `eq.${customerId}` },
    });
    if (!Array.isArray(existing) || existing.length === 0) {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "stripe_customers", method: "POST",
        body: [{ organization_id: orgId, stripe_customer_id: customerId, email: session.customer_details?.email || null }],
      });
    }
  }

  // Si es subscription, esperar el evento customer.subscription.created/updated
  // (Stripe los emite junto con checkout.session.completed) para sync DB.
  // Si es payment one-time (paquete de créditos), sumarlos ya.
  if (target === "package" && session.mode === "payment") {
    const packageId = session.metadata?.package_id;
    if (!packageId) return console.warn("[billing-webhook] package checkout sin package_id");

    const pkgs = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "credit_packages",
      searchParams: { select: "credits,bonus_credits", id: `eq.${packageId}` },
    });
    const pkg = Array.isArray(pkgs) ? pkgs[0] : null;
    if (!pkg) return console.warn(`[billing-webhook] credit_package "${packageId}" no encontrado`);

    const totalCredits = (pkg.credits || 0) + (pkg.bonus_credits || 0);
    if (totalCredits > 0) {
      // Sumar a organization_credits (upsert manual)
      const existing = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey, path: "organization_credits",
        searchParams: { select: "credits_available,credits_total", organization_id: `eq.${orgId}` },
      });
      const cur = Array.isArray(existing) && existing[0] ? existing[0] : { credits_available: 0, credits_total: 0 };
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
      console.log(`[billing-webhook] org ${orgId} +${totalCredits} créditos por paquete ${packageId}`);
    }
  }
}

async function handleInvoicePaid({ env, invoice }) {
  const customerId = invoice.customer;
  const orgId      = await orgFromCustomer({ env, customerId });
  if (!orgId) return console.warn("[billing-webhook] invoice.paid sin org mapeada para customer", customerId);

  await upsertInvoice({ env, invoice, orgId, status: invoice.status || "paid" });

  // Sync subscription si aplica
  if (invoice.subscription) {
    const subPeriodEnd = invoice.lines?.data?.[0]?.period?.end;
    if (subPeriodEnd) {
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: `subscriptions?stripe_subscription_id=eq.${invoice.subscription}`, method: "PATCH",
        body: {
          status: "active",
          current_period_end: new Date(subPeriodEnd * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      }).catch((e) => console.warn("[billing-webhook] subscription period sync skip:", e.message));
    }
  }
}

async function handleInvoiceFailed({ env, invoice }) {
  const customerId = invoice.customer;
  const orgId      = await orgFromCustomer({ env, customerId });
  if (!orgId) return;

  await upsertInvoice({ env, invoice, orgId, status: "uncollectible" });

  if (invoice.subscription) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `subscriptions?stripe_subscription_id=eq.${invoice.subscription}`, method: "PATCH",
      body: { status: "past_due", updated_at: new Date().toISOString() },
    }).catch(() => {});
  }
}

async function handleSubscriptionUpsert({ env, sub }) {
  const customerId = sub.customer;
  const orgId      = await orgFromCustomer({ env, customerId });
  if (!orgId) return console.warn("[billing-webhook] subscription upsert sin org mapeada para customer", customerId);

  const planId = sub.metadata?.plan_id || null;

  const row = {
    organization_id:        orgId,
    plan_id:                planId,
    status:                 sub.status,
    current_period_start:   sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end:     sub.current_period_end   ? new Date(sub.current_period_end   * 1000).toISOString() : null,
    stripe_subscription_id: sub.id,
    stripe_customer_id:     customerId,
    cancel_at_period_end:   Boolean(sub.cancel_at_period_end),
    canceled_at:            sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    metadata:               sub.metadata || {},
    updated_at:             new Date().toISOString(),
  };

  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "subscriptions",
    searchParams: { select: "id", stripe_subscription_id: `eq.${sub.id}` },
  });

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `subscriptions?stripe_subscription_id=eq.${sub.id}`, method: "PATCH",
      body: row,
    });
  } else {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "subscriptions", method: "POST",
      body: [row],
    });
  }
}

async function handleSubscriptionDeleted({ env, sub }) {
  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: `subscriptions?stripe_subscription_id=eq.${sub.id}`, method: "PATCH",
    body: {
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    },
  }).catch(() => {});
}

// ── Helpers ────────────────────────────────────────────────────────

async function orgFromCustomer({ env, customerId }) {
  if (!customerId) return null;
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "stripe_customers",
    searchParams: { select: "organization_id", stripe_customer_id: `eq.${customerId}` },
  });
  return Array.isArray(rows) && rows[0] ? rows[0].organization_id : null;
}

async function upsertInvoice({ env, invoice, orgId, status }) {
  const row = {
    invoice_id:         invoice.id,
    organization_id:    orgId,
    stripe_customer_id: invoice.customer,
    subscription_id:    invoice.subscription || null,
    amount_paid_cents:  invoice.amount_paid || 0,
    currency:           invoice.currency || "usd",
    status:             status,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    invoice_pdf:        invoice.invoice_pdf || null,
    period_start:       invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
    period_end:         invoice.period_end   ? new Date(invoice.period_end   * 1000).toISOString() : null,
    paid_at:            invoice.status_transitions?.paid_at
                          ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                          : (status === "paid" ? new Date().toISOString() : null),
  };

  const existing = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey, path: "stripe_invoices",
    searchParams: { select: "invoice_id", invoice_id: `eq.${invoice.id}` },
  });

  if (Array.isArray(existing) && existing.length > 0) {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: `stripe_invoices?invoice_id=eq.${invoice.id}`, method: "PATCH",
      body: row,
    });
  } else {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "stripe_invoices", method: "POST",
      body: [row],
    });
  }
}
