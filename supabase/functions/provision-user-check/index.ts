// provision-user-check
// Polling endpoint llamado por el frontend cada ~3s.
// Lee auth.users.email_confirmed_at del auth_user_id del job;
// si está confirmado, actualiza status='email_confirmed' y retorna ese estado.
// Si el job ya está en estado terminal, retorna sin tocar nada.

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
    const { service } = await requireLead(req);
    const { job_id } = await req.json();
    if (!job_id) return errorResponse("job_id is required", 400);

    const { data: job, error: jobErr } = await service
      .from("provisioning_jobs")
      .select("id, auth_user_id, status, confirmed_at, error")
      .eq("id", job_id)
      .maybeSingle();

    if (jobErr) return errorResponse(jobErr.message, 500);
    if (!job) return errorResponse("job not found", 404);

    // Estados terminales: nada que hacer.
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return jsonResponse({ job });
    }

    // Si todavía estamos esperando confirmación, revisar auth.users.
    if (job.status === "pending_email_confirmation" && job.auth_user_id) {
      const { data: userData, error: userErr } = await service.auth.admin
        .getUserById(job.auth_user_id);

      if (userErr) {
        console.warn("getUserById failed:", userErr.message);
        return jsonResponse({ job });
      }

      const confirmedAt = userData?.user?.email_confirmed_at ?? null;
      if (confirmedAt) {
        const { data: updated, error: updErr } = await service
          .from("provisioning_jobs")
          .update({ status: "email_confirmed", confirmed_at: confirmedAt })
          .eq("id", job.id)
          .select("id, auth_user_id, status, confirmed_at, error")
          .single();

        if (updErr) return errorResponse(updErr.message, 500);
        return jsonResponse({ job: updated });
      }
    }

    return jsonResponse({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
