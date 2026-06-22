// signup-self-finalize
// Self-service (sign up secreto). A diferencia de provision-user-finalize NO
// requiere un Lead: lo llama el PROPIO usuario recien confirmado con su JWT.
//
// Seguridad:
//   - Verifica el JWT (service.auth.getUser) → el caller es quien dice ser.
//   - Exige email confirmado (anti-abuso: solo cuentas reales crean org).
//   - Rechaza sesiones anonimas (demo).
//   - Idempotente: si el usuario ya tiene org, no crea otra.
//   - Anti-abuso: una sola org self-service por usuario (la del owner).
//
// Datos de la org: viajan en user_metadata.pending_org (los puso el cliente en
// supabase.auth.signUp). Se leen aqui server-side — el cliente no puede
// manipularlos despues de la confirmacion. Tras crear, se limpian del metadata.
//
// Crea: profiles (upsert) + organizations (owner) + organization_members (owner)
// + brand_containers (mercado por defecto, para que la org quede usable).

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
} from "../_shared/lead-auth.ts";

const VALID_AUTONOMY = new Set(["restringido", "parcial", "total"]);

interface PendingOrg {
  name?: string;
  slogan?: string | null;
  brand_name_oficial?: string | null;
  logo_url?: string | null;
  level_of_autonomy?: string;
  idiomas_contenido?: string[];
  mercado_objetivo?: string[];
}

// deno-lint-ignore no-explicit-any
async function clearPending(service: any, uid: string, meta: Record<string, unknown>) {
  try {
    const next: Record<string, unknown> = { ...(meta || {}) };
    delete next.pending_org;
    next.signup_finalized_at = new Date().toISOString();
    await service.auth.admin.updateUserById(uid, { user_metadata: next });
  } catch (_) { /* no es fatal: la org ya quedo creada */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return errorResponse("Missing Authorization header", 401);

    const service = getServiceClient();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData?.user) return errorResponse("Invalid token", 401);

    const user = userData.user;
    const uid = user.id;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    // Solo cuentas reales y confirmadas.
    if ((user as { is_anonymous?: boolean }).is_anonymous === true) {
      return errorResponse("Las cuentas anonimas no pueden crear organizaciones", 403);
    }
    if (!user.email_confirmed_at && !user.confirmed_at) {
      return errorResponse("El email aun no esta confirmado", 403);
    }

    // Idempotencia: si ya posee una org, devolverla y limpiar el metadata.
    const { data: existing } = await service
      .from("organizations")
      .select("id")
      .eq("owner_user_id", uid)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      await clearPending(service, uid, meta);
      return jsonResponse({ organization_id: existing.id, already: true });
    }

    const pending = (meta.pending_org ?? {}) as PendingOrg;
    // Nombre de la org: el de pending_org si vino del alta por email; si no
    // (p.ej. alta por Google/Facebook), se deriva del usuario.
    const fullName = (meta.full_name as string) || (meta.name as string) || "";
    const emailLocal = (user.email || "").split("@")[0] || "";
    const name = (pending.name || fullName || emailLocal || "Mi organizacion").trim();
    const autonomy = pending.level_of_autonomy &&
        VALID_AUTONOMY.has(pending.level_of_autonomy)
      ? pending.level_of_autonomy
      : "parcial";

    // 1) Perfil consumidor.
    const { error: profErr } = await service
      .from("profiles")
      .upsert({
        id: uid,
        email: user.email,
        full_name: fullName || null,
        role: "user",
        default_view_mode: "user",
        is_developer: false,
        dev_role: null,
        dev_rank: null,
      }, { onConflict: "id" });
    if (profErr) throw new Error(`profiles upsert: ${profErr.message}`);

    // 2) Organizacion (el usuario es owner).
    const { data: newOrg, error: orgErr } = await service
      .from("organizations")
      .insert({
        name,
        owner_user_id: uid,
        level_of_autonomy: autonomy,
        brand_name_oficial: pending.brand_name_oficial?.trim() || null,
        brand_slogan: pending.slogan?.trim() || null,
        logo_url: pending.logo_url?.trim() || null,
      })
      .select("id")
      .single();
    if (orgErr || !newOrg) {
      throw new Error(`organizations insert: ${orgErr?.message ?? "unknown"}`);
    }
    const orgId = newOrg.id as string;

    // 3) Membership owner.
    const { error: memErr } = await service
      .from("organization_members")
      .insert({ organization_id: orgId, user_id: uid, role: "owner" });
    if (memErr) throw new Error(`owner member insert: ${memErr.message}`);

    // 4) Mercado por defecto (brand_container) para que la org sea usable.
    //    No fatal si falla: el usuario puede crear su mercado luego.
    const idiomas = Array.isArray(pending.idiomas_contenido) &&
        pending.idiomas_contenido.length
      ? pending.idiomas_contenido
      : ["es"];
    const mercados = Array.isArray(pending.mercado_objetivo)
      ? pending.mercado_objetivo
      : [];
    const { error: bcErr } = await service
      .from("brand_containers")
      .insert({
        user_id: uid,
        nombre_marca: name,
        organization_id: orgId,
        idiomas_contenido: idiomas,
        mercado_objetivo: mercados,
      });
    if (bcErr) console.warn(`brand_container insert (no fatal): ${bcErr.message}`);

    // 5) Limpiar pending_org del metadata.
    await clearPending(service, uid, meta);

    return jsonResponse({ organization_id: orgId, status: "created" });
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`unexpected: ${(e as Error).message}`, 500);
  }
});
