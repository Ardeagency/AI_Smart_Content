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
