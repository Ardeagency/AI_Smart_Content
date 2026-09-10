// Helpers compartidos para Edge Functions de provisioning.
// - cors(): respuestas CORS uniformes
// - requireLead(): verifica que el caller tenga JWT válido y profile.dev_role='lead'

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface LeadContext {
  userId: string;
  email: string | null;
  service: SupabaseClient;
}

// Verifica que el caller esté autenticado y sea Lead (profiles.dev_role='lead').
// Retorna { userId, email, service } o lanza con un Response listo.
export async function requireLead(req: Request): Promise<LeadContext> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw errorResponse("Missing Authorization header", 401);

  const service = getServiceClient();
  const { data: userData, error: userErr } = await service.auth.getUser(token);
  if (userErr || !userData?.user) {
    throw errorResponse("Invalid token", 401);
  }

  const userId = userData.user.id;
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("dev_role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) throw errorResponse(profileErr.message, 500);
  if (!profile || profile.dev_role !== "lead") {
    throw errorResponse("Forbidden: dev_role=lead required", 403);
  }

  return { userId, email: userData.user.email ?? null, service };
}

// ── Auditoría de staff ────────────────────────────────────────────────
// `staff_audit_log` existía desde 2026-07-28 pero durante más de un mes tuvo
// UN SOLO escritor (admin-set-dev-role), así que se midió con 0 filas: el
// problema no era que nadie la mirara, era que casi nada la escribía. En
// particular la impersonación (lead-switch-user) no dejaba rastro.
//
// Regla: toda operación de staff con service_role escribe aquí. La auditoría
// nunca tumba la operación — si falla, se registra en consola y se sigue.

export interface StaffAuditEntry {
  actor_user_id: string;
  actor_email?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  before_state?: unknown;
  after_state?: unknown;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function writeAudit(
  service: SupabaseClient,
  entry: StaffAuditEntry,
): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const { error } = await (service as any)
    .from("staff_audit_log")
    .insert({ ...entry, metadata: entry.metadata ?? {} });
  if (error) console.error("staff_audit_log insert failed:", error.message);
}

// Azúcar para no repetir la lectura de cabeceras en cada función.
export function auditContext(req: Request): { ip_address: string | null; user_agent: string | null } {
  return {
    ip_address: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
  };
}
