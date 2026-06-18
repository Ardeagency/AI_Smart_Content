// admin-consumers — solo Lead.
// Backend de la pagina "Consumidores": administra usuarios NO-developers.
//
// Acciones (body.action):
//   - "list"               → lista consumidores con sus afiliaciones + cat. de orgs
//   - "affiliate"          → upsert de membresia { user_id, organization_id, role }
//   - "remove_affiliation" → borra la membresia { user_id, organization_id }
//
// Usa service role (bypassa RLS) porque afiliar escribe en organization_members.
// Tabla pensada para crecer (monitoreo de usuarios), por ahora ver + completar orgs.

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

// Roles afiliables desde aqui. 'owner' se excluye a proposito: pertenece a la
// creacion/transferencia de la org (organizations.owner_user_id), no a una
// afiliacion suelta.
const AFFILIABLE_ROLES = new Set(["admin", "editor", "creator", "vera_user", "viewer"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { service } = await requireLead(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "list";

    // ── LIST ────────────────────────────────────────────────────────────
    if (action === "list") {
      // Consumidores = perfiles que NO son developers.
      const { data: profiles, error: pErr } = await service
        .from("profiles")
        .select("id, email, full_name, role, default_view_mode, plan_type, form_verified, created_at")
        .or("is_developer.is.null,is_developer.eq.false")
        .order("created_at", { ascending: false });
      if (pErr) return errorResponse(`profiles: ${pErr.message}`, 500);

      const ids = (profiles || []).map((p) => p.id);

      // Afiliaciones (membresias) de esos usuarios.
      let membersByUser = {};
      if (ids.length) {
        const { data: members, error: mErr } = await service
          .from("organization_members")
          .select("user_id, organization_id, role, organizations(id, name, logo_url, deleted_at)")
          .in("user_id", ids);
        if (mErr) return errorResponse(`organization_members: ${mErr.message}`, 500);
        for (const m of members || []) {
          const org = m.organizations;
          if (!org || org.deleted_at) continue; // ignorar orgs borradas
          (membersByUser[m.user_id] ||= []).push({
            organization_id: m.organization_id,
            name: org.name,
            logo_url: org.logo_url || null,
            role: m.role,
          });
        }
      }

      // Catalogo de orgs activas para el selector de afiliacion.
      const { data: orgs, error: oErr } = await service
        .from("organizations")
        .select("id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (oErr) return errorResponse(`organizations: ${oErr.message}`, 500);

      const consumers = (profiles || []).map((p) => ({
        ...p,
        affiliations: membersByUser[p.id] || [],
      }));

      return jsonResponse({ consumers, orgs: orgs || [] });
    }

    // ── AFFILIATE (upsert membresia) ─────────────────────────────────────
    if (action === "affiliate") {
      const userId = (body?.user_id || "").toString();
      const orgId = (body?.organization_id || "").toString();
      const role = (body?.role || "viewer").toString().toLowerCase();
      if (!userId || !orgId) return errorResponse("user_id y organization_id son requeridos", 400);
      if (!AFFILIABLE_ROLES.has(role)) return errorResponse(`Rol invalido: ${role}`, 400);

      const { error } = await service
        .from("organization_members")
        .upsert(
          { organization_id: orgId, user_id: userId, role },
          { onConflict: "organization_id,user_id" },
        );
      if (error) return errorResponse(`organization_members upsert: ${error.message}`, 500);
      return jsonResponse({ success: true });
    }

    // ── REMOVE AFFILIATION ───────────────────────────────────────────────
    if (action === "remove_affiliation") {
      const userId = (body?.user_id || "").toString();
      const orgId = (body?.organization_id || "").toString();
      if (!userId || !orgId) return errorResponse("user_id y organization_id son requeridos", 400);

      const { error } = await service
        .from("organization_members")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", orgId);
      if (error) return errorResponse(`delete membership: ${error.message}`, 500);
      return jsonResponse({ success: true });
    }

    return errorResponse(`Accion desconocida: ${action}`, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse((err as Error)?.message || "Error interno", 500);
  }
});
