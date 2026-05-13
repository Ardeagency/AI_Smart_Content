// provision-user-cancel
// Cancela un job pendiente. Si delete_auth=true, también borra el auth.user
// (útil si el Lead se equivocó de email antes de que el usuario confirme).

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
    const { job_id, delete_auth = false } = await req.json();
    if (!job_id) return errorResponse("job_id is required", 400);

    const { data: job, error: jobErr } = await service
      .from("provisioning_jobs")
      .select("id, auth_user_id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (jobErr) return errorResponse(jobErr.message, 500);
    if (!job) return errorResponse("job not found", 404);
    if (job.status === "completed") {
      return errorResponse("no se puede cancelar un job ya completado", 409);
    }

    if (delete_auth && job.auth_user_id) {
      const { error: delErr } = await service.auth.admin.deleteUser(job.auth_user_id);
      if (delErr) console.warn("deleteUser failed:", delErr.message);
    }

    const { error: updErr } = await service
      .from("provisioning_jobs")
      .update({ status: "cancelled" })
      .eq("id", job.id);
    if (updErr) return errorResponse(updErr.message, 500);

    return jsonResponse({ job_id: job.id, status: "cancelled" });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
