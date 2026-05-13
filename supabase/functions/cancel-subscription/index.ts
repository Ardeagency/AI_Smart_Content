// cancel-subscription
// Cancela una suscripción.
//
// Estado actual (Stripe NO conectado):
//   - Marca subscriptions.status = 'cancellation_pending' con cancel_at_period_end
//   - Guarda razón/comentario en metadata
//   - El downgrade real a 'cancelled' lo hará un job al llegar period_end
//   - No envía email todavía (Resend pendiente)
//
// Cuando Stripe se conecte:
//   - Llama a stripe.subscriptions.update({cancel_at_period_end: true})
//   - El webhook customer.subscription.deleted finaliza el ciclo
//   - Resend manda email de confirmación

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Missing Authorization" }, 401);

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { subscription_id, organization_id, reason, comment } = body || {};
    if (!subscription_id || !organization_id) {
      return jsonResponse({ error: "subscription_id y organization_id requeridos" }, 400);
    }

    // Authorize: caller debe ser owner o admin de la org.
    const [ownerRes, memberRes] = await Promise.all([
      service.from("organizations").select("owner_user_id").eq("id", organization_id).maybeSingle(),
      service.from("organization_members").select("role")
        .eq("organization_id", organization_id).eq("user_id", userId).maybeSingle(),
    ]);
    const isOwner = ownerRes.data?.owner_user_id === userId;
    const role = memberRes.data?.role;
    const isAdmin = role === "owner" || role === "admin";
    if (!isOwner && !isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    // Marcar cancelación pendiente. El downgrade real ocurre al llegar period_end
    // (por ahora manual; cuando Stripe esté conectado, vía webhook).
    const { data: sub, error: subErr } = await service
      .from("subscriptions")
      .select("id, metadata, status, current_period_end")
      .eq("id", subscription_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (subErr || !sub) return jsonResponse({ error: "Subscription no encontrada" }, 404);
    if (sub.status === "cancelled") return jsonResponse({ error: "Ya cancelada" }, 409);

    const newMeta = {
      ...(sub.metadata || {}),
      cancel_at_period_end: true,
      cancelled_by: userId,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
      cancellation_comment: comment || null,
    };

    const { error: updErr } = await service
      .from("subscriptions")
      .update({ status: "cancellation_pending", metadata: newMeta })
      .eq("id", sub.id);
    if (updErr) return jsonResponse({ error: updErr.message }, 500);

    // TODO when Stripe is wired up:
    //   await stripe.subscriptions.update(sub.metadata?.stripe_subscription_id ?? sub.stripe_subscription_id, { cancel_at_period_end: true });
    //   await resend.send({ to: ..., subject: 'Cancellation confirmed', ... });

    return jsonResponse({
      subscription_id: sub.id,
      status: "cancellation_pending",
      active_until: sub.current_period_end,
      stripe_connected: false,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
