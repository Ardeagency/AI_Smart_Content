// provision-user-start
// Lead crea un usuario en auth (con password, email_confirm:false).
// Dispara email de confirmación de Supabase y crea provisioning_jobs.
// Retorna { job_id, auth_user_id } para que el frontend inicie polling.

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

interface Payload {
  account: {
    full_name: string;
    email: string;
    password: string;
    role?: string;
    default_view_mode?: string;
    is_developer?: boolean;
    dev_role?: string | null;
  };
  permissions?: Record<string, boolean>;
  organization?: {
    mode: "none" | "existing" | "create";
    organization_id?: string | null;
    new_organization_name?: string | null;
    organization_role?: string | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { userId: leadId, service } = await requireLead(req);
    const body = (await req.json()) as Payload;

    const email = body?.account?.email?.toLowerCase().trim();
    const password = body?.account?.password;
    const fullName = body?.account?.full_name?.trim() || null;

    if (!email || !password || password.length < 8) {
      return errorResponse("email y password (8+) son requeridos", 400);
    }

    // 1) Crear el usuario en auth (sin confirmar email).
    const { data: created, error: createErr } = await service.auth.admin
      .createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name: fullName },
      });

    if (createErr || !created?.user) {
      return errorResponse(
        `auth.admin.createUser: ${createErr?.message ?? "unknown error"}`,
        400,
      );
    }
    const authUserId = created.user.id;

    // 2) Generar link de signup. Esto dispara el envío del email vía SMTP del proyecto.
    const { error: linkErr } = await service.auth.admin.generateLink({
      type: "signup",
      email,
      password,
    });
    if (linkErr) {
      // No es fatal: el usuario quedó creado. El Lead puede reintentar el envío.
      console.warn("generateLink failed:", linkErr.message);
    }

    // 3) Insertar el job.
    const { data: job, error: jobErr } = await service
      .from("provisioning_jobs")
      .insert({
        auth_user_id: authUserId,
        email,
        full_name: fullName,
        payload: body,
        status: "pending_email_confirmation",
        created_by: leadId,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return errorResponse(`insert job: ${jobErr?.message ?? "unknown"}`, 500);
    }

    return jsonResponse({
      job_id: job.id,
      auth_user_id: authUserId,
      email,
      status: "pending_email_confirmation",
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
