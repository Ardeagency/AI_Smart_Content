// provision-user-finalize
// Llamado cuando job.status='email_confirmed' (post step 3 verificacion).
// Recibe los datos del step 4 (Afiliar / Crear org / Permisos) segun user_type,
// hace upsert de profiles + inserts en organizations/organization_members,
// y cierra el job como 'completed' o 'failed'.

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

// Whitelists alineadas con los enums de BD (FEAT-035, 2026-05-29).
const VALID_MEMBER_ROLES = new Set(["admin", "editor", "creator", "vera_user", "viewer"]);
const VALID_DEV_ROLES    = new Set(["lead", "senior", "contributor", "viewer"]);
const VALID_DEV_RANKS    = new Set(["rookie", "junior", "builder", "expert", "master", "legend"]);

interface Step4MemberOrg {
  organization_id: string;
  role?: string;
}

interface Step4OwnerOrg {
  name: string;
  brand_name_oficial?: string | null;
  brand_slogan?: string | null;
  logo_url?: string | null;
}

interface Step4Developer {
  dev_role: string;
  dev_rank: string;
}

interface Payload {
  job_id: string;
  user_type: "member_org" | "owner_org" | "developer";
  member_org?: Step4MemberOrg;
  owner_org?: Step4OwnerOrg;
  developer?: Step4Developer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { userId: leadId, service } = await requireLead(req);
    const body = (await req.json()) as Payload;

    if (!body?.job_id) return errorResponse("job_id is required", 400);
    if (!body?.user_type) return errorResponse("user_type is required", 400);
    if (!["member_org", "owner_org", "developer"].includes(body.user_type)) {
      return errorResponse(`user_type invalido: ${body.user_type}`, 400);
    }

    const { data: job, error: jobErr } = await service
      .from("provisioning_jobs")
      .select("id, auth_user_id, status, payload")
      .eq("id", body.job_id)
      .maybeSingle();

    if (jobErr) return errorResponse(jobErr.message, 500);
    if (!job) return errorResponse("job not found", 404);
    if (job.status !== "email_confirmed") {
      return errorResponse(
        `job no esta listo para finalizar (status=${job.status})`,
        409,
      );
    }
    if (!job.auth_user_id) return errorResponse("auth_user_id missing", 500);

    // Marcar 'finalizing' para evitar dobles ejecuciones concurrentes.
    await service
      .from("provisioning_jobs")
      .update({ status: "finalizing" })
      .eq("id", job.id);

    // Datos del step 2 (account) viven en job.payload.
    const account = (job.payload?.account ?? {}) as {
      full_name?: string;
      email?: string;
    };

    try {
      const isDev = body.user_type === "developer";

      // Validaciones step 4 por tipo
      let validDevRole: string | null = null;
      let validDevRank: string | null = null;
      if (isDev) {
        const dr = body.developer?.dev_role;
        const dk = body.developer?.dev_rank;
        if (!dr || !VALID_DEV_ROLES.has(dr)) {
          throw new Error(`developer.dev_role invalido: ${dr}`);
        }
        if (!dk || !VALID_DEV_RANKS.has(dk)) {
          throw new Error(`developer.dev_rank invalido: ${dk}`);
        }
        validDevRole = dr;
        validDevRank = dk;
      }

      // 1) profile upsert con campos derivados de user_type
      const profileRow = {
        id: job.auth_user_id,
        email: account.email,
        full_name: account.full_name ?? null,
        role: isDev ? "dev" : "user",
        default_view_mode: isDev ? "developer" : "user",
        is_developer: isDev,
        dev_role: validDevRole,
        dev_rank: validDevRank,
      };

      const { error: profErr } = await service
        .from("profiles")
        .upsert(profileRow, { onConflict: "id" });
      if (profErr) throw new Error(`profiles upsert: ${profErr.message}`);

      // 2) Acciones especificas por tipo
      let organizationId: string | null = null;

      if (body.user_type === "member_org") {
        const orgId = body.member_org?.organization_id;
        if (!orgId) throw new Error("member_org.organization_id requerido");

        const rawRole = (body.member_org?.role || "viewer").toLowerCase();
        const memberRole = VALID_MEMBER_ROLES.has(rawRole) ? rawRole : "viewer";

        const { error } = await service
          .from("organization_members")
          .upsert({
            organization_id: orgId,
            user_id: job.auth_user_id,
            role: memberRole,
          }, { onConflict: "organization_id,user_id" });
        if (error) throw new Error(`organization_members upsert: ${error.message}`);

        organizationId = orgId;
      } else if (body.user_type === "owner_org") {
        const name = (body.owner_org?.name || "").trim();
        if (!name) throw new Error("owner_org.name requerido");

        const { data: newOrg, error: orgErr } = await service
          .from("organizations")
          .insert({
            name,
            owner_user_id: job.auth_user_id,
            brand_name_oficial: body.owner_org?.brand_name_oficial?.trim() || null,
            brand_slogan: body.owner_org?.brand_slogan?.trim() || null,
            logo_url: body.owner_org?.logo_url?.trim() || null,
          })
          .select("id")
          .single();
        if (orgErr || !newOrg) {
          throw new Error(`organizations insert: ${orgErr?.message ?? "unknown"}`);
        }
        organizationId = newOrg.id;

        const { error: memErr } = await service
          .from("organization_members")
          .insert({
            organization_id: newOrg.id,
            user_id: job.auth_user_id,
            role: "owner",
          });
        if (memErr) throw new Error(`owner member insert: ${memErr.message}`);
      }
      // developer: no requiere org_member ni organization insert

      // 3) Cerrar job
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
        user_type: body.user_type,
        status: "completed",
        finalized_by: leadId,
      });
    } catch (innerError) {
      await service
        .from("provisioning_jobs")
        .update({
          status: "failed",
          error: (innerError as Error).message,
        })
        .eq("id", job.id);
      return errorResponse((innerError as Error).message, 500);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
