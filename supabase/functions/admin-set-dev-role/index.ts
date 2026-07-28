// admin-set-dev-role — solo Lead.
//
// Asignación y revocación de privilegios de developer. Reemplaza la escritura
// directa a `profiles` que hacía DevLeadTeamView desde el navegador.
//
// Motivo (2026-07-28): `authenticated` tenía GRANT UPDATE sobre profiles.dev_role
// e is_developer, así que cualquier usuario podía auto-promoverse a lead con una
// llamada desde la consola del browser. Se revocó ese grant y se añadió un trigger
// guardián; el cambio de privilegios ahora sólo ocurre aquí, con service_role,
// detrás de requireLead() y dejando rastro en staff_audit_log.
//
// Acciones (body.action):
//   - "set_role"         → { user_id, dev_role, dev_rank }
//   - "revoke_developer" → { user_id }

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

// Espejo de las constantes de la vista. Se validan aquí porque el cliente no
// es una fuente de verdad: el navegador puede mandar cualquier cosa.
const ROLES = new Set(["viewer", "contributor", "senior", "lead"]);
const RANKS = new Set(["rookie", "junior", "builder", "expert", "master", "legend"]);

async function writeAudit(
  service: ReturnType<typeof Object>,
  entry: Record<string, unknown>,
) {
  // La auditoría nunca debe tumbar la operación: si falla, se registra y sigue.
  // deno-lint-ignore no-explicit-any
  const { error } = await (service as any).from("staff_audit_log").insert(entry);
  if (error) console.error("staff_audit_log insert failed:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { service, userId: actorId, email: actorEmail } = await requireLead(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const targetId = body?.user_id;

    if (!targetId) return errorResponse("user_id requerido", 400);

    // Estado previo del objetivo — sirve para validar y para la auditoría.
    const { data: target, error: tErr } = await service
      .from("profiles")
      .select("id, email, full_name, dev_role, dev_rank, is_developer, role, default_view_mode")
      .eq("id", targetId)
      .maybeSingle();
    if (tErr) return errorResponse(`profiles: ${tErr.message}`, 500);
    if (!target) return errorResponse("Usuario no encontrado", 404);

    const ip = req.headers.get("x-forwarded-for");
    const ua = req.headers.get("user-agent");

    // ── SET ROLE ────────────────────────────────────────────────────────
    if (action === "set_role") {
      const devRole = body?.dev_role;
      const devRank = body?.dev_rank;
      if (!ROLES.has(devRole)) return errorResponse("dev_role invalido", 400);
      if (!RANKS.has(devRank)) return errorResponse("dev_rank invalido", 400);

      // Un lead no puede quitarse a sí mismo el rol (lock-out).
      // La vista ya lo impedía, pero el servidor no puede confiar en eso.
      if (targetId === actorId && target.dev_role === "lead" && devRole !== "lead") {
        return errorResponse("No puedes quitarte tu propio rol de Lead", 400);
      }

      // Nunca dejar el sistema sin ningún lead.
      if (target.dev_role === "lead" && devRole !== "lead") {
        const { count, error: cErr } = await service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("dev_role", "lead");
        if (cErr) return errorResponse(`conteo de leads: ${cErr.message}`, 500);
        if ((count ?? 0) <= 1) {
          return errorResponse("No puedes degradar al ultimo Lead del sistema", 400);
        }
      }

      const { error: uErr } = await service
        .from("profiles")
        .update({ dev_role: devRole, dev_rank: devRank })
        .eq("id", targetId);
      if (uErr) return errorResponse(`update: ${uErr.message}`, 500);

      await writeAudit(service, {
        actor_user_id: actorId,
        actor_email: actorEmail,
        action: "set_dev_role",
        target_type: "profile",
        target_id: targetId,
        before_state: { dev_role: target.dev_role, dev_rank: target.dev_rank },
        after_state: { dev_role: devRole, dev_rank: devRank },
        metadata: { target_email: target.email },
        ip_address: ip,
        user_agent: ua,
      });

      return jsonResponse({ ok: true, dev_role: devRole, dev_rank: devRank });
    }

    // ── REVOKE DEVELOPER ────────────────────────────────────────────────
    if (action === "revoke_developer") {
      if (targetId === actorId) {
        return errorResponse("No puedes quitarte tu propio acceso developer", 400);
      }

      if (target.dev_role === "lead") {
        const { count, error: cErr } = await service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("dev_role", "lead");
        if (cErr) return errorResponse(`conteo de leads: ${cErr.message}`, 500);
        if ((count ?? 0) <= 1) {
          return errorResponse("No puedes revocar al ultimo Lead del sistema", 400);
        }
      }

      const { error: uErr } = await service
        .from("profiles")
        .update({
          is_developer: false,
          dev_role: null,
          dev_rank: null,
          role: "user",
          default_view_mode: "user",
        })
        .eq("id", targetId);
      if (uErr) return errorResponse(`update: ${uErr.message}`, 500);

      await writeAudit(service, {
        actor_user_id: actorId,
        actor_email: actorEmail,
        action: "revoke_developer",
        target_type: "profile",
        target_id: targetId,
        before_state: {
          is_developer: target.is_developer,
          dev_role: target.dev_role,
          dev_rank: target.dev_rank,
          role: target.role,
        },
        after_state: { is_developer: false, dev_role: null, dev_rank: null, role: "user" },
        metadata: { target_email: target.email },
        ip_address: ip,
        user_agent: ua,
      });

      return jsonResponse({ ok: true });
    }

    return errorResponse(`Accion no soportada: ${action}`, 400);
  } catch (e) {
    // requireLead lanza un Response ya formado (401/403).
    if (e instanceof Response) return e;
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});
