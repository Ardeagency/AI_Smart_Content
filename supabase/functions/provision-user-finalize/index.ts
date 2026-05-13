// provision-user-finalize
// Solo corre cuando el job está en status='email_confirmed'.
// Inserta profiles, organizaciones, organization_members según payload.
// Marca el job como 'completed' o 'failed' con el error.

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

interface JobPayload {
  account: {
    full_name: string;
    email: string;
    role?: string;
    default_view_mode?: string;
    is_developer?: boolean;
    dev_role?: string | null;
  };
  organization?: {
    mode: "none" | "existing" | "create";
    organization_id?: string | null;
    new_organization_name?: string | null;
    organization_role?: string | null;
    capabilities?: Record<string, boolean>;
  };
}

// Whitelist de capabilities válidas. Mantener en sync con js/utils/capabilities.js.
const VALID_CAPABILITIES = new Set([
  "studio.create", "video.create", "production.create", "references.manage",
  "vera.chat", "vera.actions.approve",
  "brand.identity.edit", "brand.storage.manage", "monitoring.view",
  "insights.view",
  "org.team.manage", "org.integrations.manage", "org.billing.manage", "org.settings.edit",
]);

const VALID_ROLES = new Set(["owner", "admin", "editor", "creator", "vera_user", "viewer"]);

function sanitizeCapabilities(input: Record<string, boolean> | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input) return out;
  for (const key of VALID_CAPABILITIES) {
    out[key] = input[key] === true;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { userId: leadId, service } = await requireLead(req);
    const { job_id } = await req.json();
    if (!job_id) return errorResponse("job_id is required", 400);

    const { data: job, error: jobErr } = await service
      .from("provisioning_jobs")
      .select("id, auth_user_id, status, payload")
      .eq("id", job_id)
      .maybeSingle();

    if (jobErr) return errorResponse(jobErr.message, 500);
    if (!job) return errorResponse("job not found", 404);
    if (job.status !== "email_confirmed") {
      return errorResponse(
        `job no está listo para finalizar (status=${job.status})`,
        409,
      );
    }
    if (!job.auth_user_id) return errorResponse("auth_user_id missing", 500);

    // Marcar 'finalizing' para evitar dobles ejecuciones.
    await service
      .from("provisioning_jobs")
      .update({ status: "finalizing" })
      .eq("id", job.id);

    const payload = job.payload as JobPayload;
    const account = payload?.account ?? ({} as JobPayload["account"]);
    const org = payload?.organization ?? { mode: "none" };

    try {
      // 1) Profile (upsert por si ya existe).
      const profileRow = {
        id: job.auth_user_id,
        email: account.email,
        full_name: account.full_name ?? null,
        role: account.role || "user",
        default_view_mode: account.default_view_mode || "user",
        is_developer: !!account.is_developer || account.dev_role === "lead" || account.dev_role === "contributor",
        dev_role: account.dev_role || null,
      };

      const { error: profileErr } = await service
        .from("profiles")
        .upsert(profileRow, { onConflict: "id" });
      if (profileErr) throw new Error(`profiles upsert: ${profileErr.message}`);

      // 2) Organización.
      let organizationId: string | null = null;

      if (org.mode === "create" && org.new_organization_name) {
        const { data: newOrg, error: orgErr } = await service
          .from("organizations")
          .insert({
            name: org.new_organization_name.trim(),
            owner_user_id: job.auth_user_id,
          })
          .select("id")
          .single();
        if (orgErr || !newOrg) {
          throw new Error(`org insert: ${orgErr?.message ?? "unknown"}`);
        }
        organizationId = newOrg.id;
      } else if (org.mode === "existing" && org.organization_id) {
        organizationId = org.organization_id;
      }

      // 3) Membership (si aplica).
      if (organizationId) {
        const rawRole = (org.organization_role || "viewer").toLowerCase();
        // Si crea la org, el usuario se vuelve owner por organizations.owner_user_id;
        // organization_members.role se setea a 'admin' como fallback (owner es implícito por la FK).
        const memberRole =
          org.mode === "create"
            ? "admin"
            : (VALID_ROLES.has(rawRole) ? rawRole : "viewer");

        const capabilities = sanitizeCapabilities(org.capabilities);

        const { error: memberErr } = await service
          .from("organization_members")
          .upsert(
            {
              organization_id: organizationId,
              user_id: job.auth_user_id,
              role: memberRole,
              permissions: capabilities,
            },
            { onConflict: "organization_id,user_id" },
          );
        if (memberErr) throw new Error(`member upsert: ${memberErr.message}`);
      }

      // 4) Cerrar job.
      const { error: doneErr } = await service
        .from("provisioning_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          organization_id: organizationId,
          error: null,
        })
        .eq("id", job.id);
      if (doneErr) throw new Error(`close job: ${doneErr.message}`);

      return jsonResponse({
        job_id: job.id,
        auth_user_id: job.auth_user_id,
        organization_id: organizationId,
        status: "completed",
        finalized_by: leadId,
      });
    } catch (innerError) {
      await service
        .from("provisioning_jobs")
        .update({ status: "failed", error: (innerError as Error).message })
        .eq("id", job.id);
      return errorResponse((innerError as Error).message, 500);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
