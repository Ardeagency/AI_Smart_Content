// lead-switch-user
// Genera un magic link para un target user. Solo lo puede llamar un Lead
// (profiles.dev_role='lead'). El target debe ser otro developer.
//
// El frontend, antes de llamar este endpoint, guarda la sesion del Lead en
// localStorage para poder volver despues. Esta funcion solo es el bridge
// hacia auth.admin.generateLink({type:'magiclink'}).

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { userId: leadId, service } = await requireLead(req);
    const { target_user_id } = await req.json();
    if (!target_user_id) return errorResponse("target_user_id requerido", 400);
    if (target_user_id === leadId) {
      return errorResponse("No puedes cambiarte a ti mismo", 400);
    }

    // Validar que el target es developer (no consumer)
    const { data: target, error: targetErr } = await service
      .from("profiles")
      .select("id, email, full_name, is_developer")
      .eq("id", target_user_id)
      .maybeSingle();

    if (targetErr) return errorResponse(targetErr.message, 500);
    if (!target) return errorResponse("Target user no existe", 404);
    if (!target.is_developer) {
      return errorResponse("Target no es developer", 403);
    }
    if (!target.email) return errorResponse("Target sin email", 500);

    // Generar magic link
    const { data: link, error: linkErr } = await service.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (linkErr || !link?.properties?.action_link) {
      return errorResponse(
        `generateLink: ${linkErr?.message ?? "no action_link"}`,
        500,
      );
    }

    return jsonResponse({
      action_link: link.properties.action_link,
      target: {
        id: target.id,
        email: target.email,
        full_name: target.full_name,
      },
      impersonated_by: leadId,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
