/**
 * Netlify Scheduled Function: cron-wompi-recurring
 *
 * Corre diariamente. Cobra suscripciones Wompi cuyo `next_charge_at` ya pasó
 * usando el `payment_source_id` almacenado durante el setup inicial. Wompi
 * NO tiene suscripciones nativas: este job es el corazón del recurring.
 *
 * Selección:
 *   subscriptions WHERE provider='wompi'
 *               AND status IN ('active','past_due')
 *               AND cancel_at_period_end = false
 *               AND wompi_payment_source_id IS NOT NULL
 *               AND next_charge_at <= now()
 *
 * Por cada fila:
 *   1. Llama internamente a api-billing-wompi-charge-source con internal_cron=true.
 *   2. Si Wompi acepta (200 con status=PENDING/APPROVED): adelanta next_charge_at
 *      +1 mes o +1 año según metadata.billing. El webhook actualizará el status
 *      final + sumará créditos / activará servicios cuando llegue APPROVED.
 *   3. Si Wompi rechaza (HTTP non-2xx o status=DECLINED/ERROR): marca la sub
 *      como past_due, incrementa retry_count en metadata, no avanza
 *      next_charge_at hasta el próximo intento (reintenta cada día).
 *
 * Schedule: diario a las 06:00 UTC (01:00 Bogotá) — fuera de horario pico.
 * Activación: env CRON_SECRET debe coincidir entre cron y charge-source.
 *
 * FEAT-019 Fase 2.
 */

const { schedule } = require("@netlify/functions");
const { getSupabaseEnv, supabaseRest } = require("./lib/ai-shared");

const MAX_PER_RUN     = 50;   // cap por corrida para no exceder timeout Netlify (10s default)
const RETRY_LIMIT     = 3;    // tras 3 fallos consecutivos: queda past_due hasta intervención
const BILLING_TO_MS   = { month: 30 * 24 * 3600 * 1000, year: 365 * 24 * 3600 * 1000 };

const handler = async () => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron-wompi] CRON_SECRET no configurado — abortando");
    return { statusCode: 500, body: "CRON_SECRET missing" };
  }

  let env;
  try { env = getSupabaseEnv(); }
  catch (e) {
    console.error("[cron-wompi] supabase env:", e.message);
    return { statusCode: 500, body: e.message };
  }

  // ── 1. Localizar suscripciones a cobrar ─────────────────────────
  const nowIso = new Date().toISOString();
  let subs;
  try {
    subs = await supabaseRest({
      url: env.url, serviceKey: env.serviceKey, path: "subscriptions",
      searchParams: {
        select:                   "id,organization_id,plan_id,status,wompi_payment_source_id,next_charge_at,metadata",
        provider:                 "eq.wompi",
        status:                   "in.(active,past_due)",
        cancel_at_period_end:     "eq.false",
        wompi_payment_source_id:  "not.is.null",
        next_charge_at:           `lte.${nowIso}`,
        order:                    "next_charge_at.asc",
        limit:                    String(MAX_PER_RUN),
      },
    });
  } catch (e) {
    console.error("[cron-wompi] select subs:", e.message);
    return { statusCode: 500, body: e.message };
  }

  if (!Array.isArray(subs) || subs.length === 0) {
    console.log("[cron-wompi] nada que cobrar");
    return { statusCode: 200, body: JSON.stringify({ run_at: nowIso, charged: 0 }) };
  }

  console.log(`[cron-wompi] candidatos: ${subs.length}`);

  // URL base para llamar a charge-source — Netlify expone URL en process.env.URL
  const siteBase = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://console.aismartcontent.io";

  const results = { ok: 0, failed: 0, errors: [] };

  for (const sub of subs) {
    const billing = sub.metadata?.billing === "year" ? "year" : "month";
    const retryCount = Number(sub.metadata?.retry_count || 0);

    if (retryCount >= RETRY_LIMIT) {
      console.warn(`[cron-wompi] sub ${sub.id} excedió retry_limit, manteniéndola past_due hasta intervención manual`);
      continue;
    }

    let chargeOk = false, chargeMsg = "";
    try {
      const res = await fetch(`${siteBase}/.netlify/functions/api-billing-wompi-charge-source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id:    sub.organization_id,
          payment_source_id:  sub.wompi_payment_source_id,
          target:             "subscription",
          plan_id:            sub.plan_id,
          billing,
          internal_cron:      true,
          cron_secret:        cronSecret,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.status === "APPROVED" || json.status === "PENDING")) {
        chargeOk = true;
      } else {
        chargeMsg = json.error || `HTTP ${res.status}`;
      }
    } catch (e) {
      chargeMsg = e.message;
    }

    if (chargeOk) {
      // Avanza next_charge_at +periodo. El webhook después confirmará/declinará
      // y sumará créditos si era paquete. Aquí solo movemos la ventana de cobranza.
      const nextCharge = new Date(Date.now() + BILLING_TO_MS[billing]).toISOString();
      try {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: `subscriptions?id=eq.${sub.id}`, method: "PATCH",
          body: {
            status:                "active",
            next_charge_at:        nextCharge,
            current_period_start:  nowIso,
            current_period_end:    nextCharge,
            updated_at:            nowIso,
            metadata:              { ...(sub.metadata || {}), retry_count: 0, last_cron_run: nowIso },
          },
        });
        results.ok += 1;
      } catch (e) {
        console.error(`[cron-wompi] update sub ${sub.id} tras éxito:`, e.message);
        results.errors.push({ sub_id: sub.id, error: e.message });
      }
    } else {
      // Marca past_due + incrementa retry_count. No avanza next_charge_at:
      // el cron volverá a intentar mañana.
      console.warn(`[cron-wompi] cobro falló sub ${sub.id}: ${chargeMsg}`);
      try {
        await supabaseRest({
          url: env.url, serviceKey: env.serviceKey,
          path: `subscriptions?id=eq.${sub.id}`, method: "PATCH",
          body: {
            status:    "past_due",
            updated_at: nowIso,
            metadata:  { ...(sub.metadata || {}), retry_count: retryCount + 1, last_cron_error: chargeMsg, last_cron_run: nowIso },
          },
        });
      } catch (e) {
        console.error(`[cron-wompi] update sub ${sub.id} tras fallo:`, e.message);
      }
      results.failed += 1;
      results.errors.push({ sub_id: sub.id, error: chargeMsg });
    }
  }

  console.log(`[cron-wompi] done — ok=${results.ok} failed=${results.failed}`);
  return {
    statusCode: 200,
    body: JSON.stringify({ run_at: nowIso, candidates: subs.length, ...results }),
  };
};

// Cron syntax: "0 6 * * *" = diario a las 06:00 UTC (01:00 Bogotá)
exports.handler = schedule("0 6 * * *", handler);
