// provision-org-agent
// Lead dispara MANUALMENTE la creación del org-server de Vera (OpenClaw) para una org.
//
// Contexto: la auto-creación automática (webhook de Supabase + org-sync cada 5min)
// fue ELIMINADA por ser riesgosa — cada provisión levanta una VM Hetzner de pago +
// API key Anthropic por org (billable, multitenant). Ahora la única vía es este botón
// en dev/lead → esta function → POST /agents/provision del ai-engine.
//
// Guardia anti-doble-provisión: si la org ya tiene una instancia activa
// (healthy/provisioning/starting) y no se fuerza, se rechaza con 409.
//
// Secrets requeridos (supabase secrets set):
//   AI_ENGINE_URL          → https://api.aismartcontent.io
//   AI_ENGINE_INTERNAL_KEY → mismo valor que INTERNAL_API_KEY del ai-engine

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

interface Payload {
  organization_id?: string;
  force?: boolean;
}

const ACTIVE_STATUSES = ["healthy", "provisioning", "starting"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { userId: leadId, service } = await requireLead(req);
    const body = (await req.json().catch(() => ({}))) as Payload;

    const organizationId = body?.organization_id?.trim();
    const force = body?.force === true;

    if (!organizationId) return errorResponse("organization_id es requerido", 400);

    // Validar que la org existe (y no está soft-deleted)
    const { data: org, error: orgErr } = await service
      .from("organizations")
      .select("id, name, deleted_at")
      .eq("id", organizationId)
      .maybeSingle();

    if (orgErr) return errorResponse(`Error leyendo organización: ${orgErr.message}`, 500);
    if (!org) return errorResponse("La organización no existe", 404);
    if (org.deleted_at) return errorResponse("La organización está eliminada", 409);

    // Guardia: ¿ya tiene un agente activo?
    const { data: existing } = await service
      .from("openclaw_instances")
      .select("status, sleeping, server_ip, updated_at")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (existing && ACTIVE_STATUSES.includes(existing.status) && !force) {
      // 200 (no error duro): es informativo, evita doble-provisión accidental.
      return jsonResponse({
        already_provisioned: true,
        status: existing.status,
        message: `La org ya tiene a Vera (estado: ${existing.status}).`,
      }, 200);
    }

    // Secrets del ai-engine
    const aiEngineUrl = Deno.env.get("AI_ENGINE_URL");
    const internalKey = Deno.env.get("AI_ENGINE_INTERNAL_KEY");
    if (!aiEngineUrl || !internalKey) {
      return errorResponse("Faltan secrets AI_ENGINE_URL / AI_ENGINE_INTERNAL_KEY", 500);
    }

    // Disparar provisión en el ai-engine
    let engineRes: Response;
    try {
      engineRes = await fetch(`${aiEngineUrl.replace(/\/$/, "")}/agents/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({ organization_id: organizationId }),
      });
    } catch (e) {
      return errorResponse(`No se pudo contactar al ai-engine: ${(e as Error).message}`, 502);
    }

    const engineBody = await engineRes.json().catch(() => ({}));
    if (!engineRes.ok) {
      return jsonResponse({
        error: engineBody?.error || `ai-engine respondió ${engineRes.status}`,
        engine_status: engineRes.status,
      }, engineRes.status === 403 ? 502 : engineRes.status);
    }

    console.log(`provision-org-agent: lead=${leadId} org=${organizationId} name="${org.name}" disparado`);

    return jsonResponse({
      success: true,
      organization_id: organizationId,
      message: `Provisión de Vera iniciada para "${org.name}". Tarda ~3-5 min en quedar healthy.`,
      engine: engineBody,
    });
  } catch (err) {
    // requireLead lanza Response en error de auth
    if (err instanceof Response) return err;
    return errorResponse((err as Error)?.message || "Error interno", 500);
  }
});
