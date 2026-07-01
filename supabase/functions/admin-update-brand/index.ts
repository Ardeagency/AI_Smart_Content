// admin-update-brand — solo Lead.
// Guarda las ediciones de las paginas de aprobacion del auto-builder, por seccion.
//
// body: { organization_id, section, data }
//   section 'identity'    → organizations { name, brand_slogan }
//   section 'market'      → brand_containers { nicho_core, mercado_objetivo[], idiomas_contenido[] } + organizations { locale, timezone }
//   section 'voice'       → brand_containers { propuesta_valor, mision_vision, palabras_clave[], palabras_prohibidas[], verbal_dna(merge tono/tagline/pilares) }
//   section 'colors'      → reemplaza brand_colors [{ color_role, hex_value }]
//   section 'fonts'       → reemplaza brand_fonts [{ font_usage, font_family }] + brand_containers.visual_dna(merge estetica)
//
// Service role (bypassa RLS). Idempotente.

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireLead,
} from "../_shared/lead-auth.ts";

const arr = (v: unknown) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()) : [];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "") || null;
const hostnameOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };
const normalizeUrl = (u: unknown) => {
  if (!u || typeof u !== "string") return null;
  let s = u.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { return new URL(s).href; } catch { return null; }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { service } = await requireLead(req);
    const body = await req.json().catch(() => ({}));
    const orgId = (body?.organization_id || "").toString();
    const section = (body?.section || "").toString();
    const d = body?.data || {};
    if (!orgId) return errorResponse("organization_id requerido", 400);

    // Helper: container(s) del org
    const containerIds = async (): Promise<string[]> => {
      const { data } = await service.from("brand_containers").select("id").eq("organization_id", orgId);
      return (data || []).map((r: { id: string }) => r.id);
    };
    // Helper: merge jsonb de un container
    const mergeContainerJson = async (col: "verbal_dna" | "visual_dna", patch: Record<string, unknown>) => {
      const { data: rows } = await service.from("brand_containers").select(`id, ${col}`).eq("organization_id", orgId);
      for (const row of rows || []) {
        const cur = (row as Record<string, unknown>)[col] || {};
        await service.from("brand_containers").update({ [col]: { ...(cur as object), ...patch } }).eq("id", (row as { id: string }).id);
      }
    };

    if (section === "identity") {
      const { error } = await service.from("organizations")
        .update({ name: str(d.name) || "Marca", brand_slogan: str(d.slogan) }).eq("id", orgId);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ ok: true });
    }

    if (section === "market") {
      const { error: e1 } = await service.from("brand_containers").update({
        nicho_core: str(d.nicho_core),
        mercado_objetivo: arr(d.mercado_objetivo),
        idiomas_contenido: arr(d.idiomas_contenido),
        updated_at: new Date().toISOString(),
      }).eq("organization_id", orgId);
      if (e1) return errorResponse(e1.message, 500);
      const { error: e2 } = await service.from("organizations")
        .update({ locale: str(d.locale) || "es", timezone: str(d.timezone) || "America/Bogota" }).eq("id", orgId);
      if (e2) return errorResponse(e2.message, 500);
      return jsonResponse({ ok: true });
    }

    if (section === "voice") {
      const { error } = await service.from("brand_containers").update({
        propuesta_valor: str(d.propuesta_valor),
        mision_vision: str(d.mision_vision),
        palabras_clave: arr(d.palabras_clave),
        palabras_prohibidas: arr(d.palabras_prohibidas),
        updated_at: new Date().toISOString(),
      }).eq("organization_id", orgId);
      if (error) return errorResponse(error.message, 500);
      await mergeContainerJson("verbal_dna", {
        tono_de_voz: str(d.tono_de_voz),
        tagline: str(d.tagline),
        pilares: arr(d.pilares),
      });
      return jsonResponse({ ok: true });
    }

    if (section === "colors") {
      await service.from("brand_colors").delete().eq("organization_id", orgId);
      const rows = (Array.isArray(d.colors) ? d.colors : [])
        .filter((c: { hex_value?: string }) => c && typeof c.hex_value === "string" && /^#?[0-9a-fA-F]{3,8}$/.test(c.hex_value))
        .map((c: { color_role?: string; hex_value: string }) => ({
          organization_id: orgId,
          color_role: str(c.color_role) || "accent",
          hex_value: c.hex_value.startsWith("#") ? c.hex_value : `#${c.hex_value}`,
        }));
      if (rows.length) {
        const { error } = await service.from("brand_colors").insert(rows);
        if (error) return errorResponse(error.message, 500);
      }
      return jsonResponse({ ok: true, count: rows.length });
    }

    if (section === "fonts") {
      await service.from("brand_fonts").delete().eq("organization_id", orgId);
      const rows = (Array.isArray(d.fonts) ? d.fonts : [])
        .filter((f: { font_family?: string }) => f && str(f.font_family))
        .map((f: { font_usage?: string; font_family: string }) => ({
          organization_id: orgId,
          font_usage: str(f.font_usage) || "primary",
          font_family: str(f.font_family) as string,
        }));
      if (rows.length) {
        const { error } = await service.from("brand_fonts").insert(rows);
        if (error) return errorResponse(error.message, 500);
      }
      await mergeContainerJson("visual_dna", { estetica: str(d.estetica) });
      return jsonResponse({ ok: true, count: rows.length });
    }

    // ── LISTAR competidores (para la pagina de aprobacion) ──────────────
    if (section === "competitors-list") {
      const { data } = await service.from("intelligence_entities")
        .select("id, name, domain, target_identifier, metadata, relevance")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });
      const competitors = (data || [])
        .filter((e: { metadata?: { kind?: string } }) => e.metadata?.kind === "competitor")
        .map((e: { id: string; name: string; domain: string; target_identifier: string; relevance?: string; metadata?: { website?: string; instagram?: string; tipo?: string } }) => ({
          id: e.id,
          name: e.name,
          website: e.metadata?.website || "",
          instagram: e.metadata?.instagram || (e.domain === "social" ? e.target_identifier : "") || "",
          role: e.metadata?.tipo || "competidor_directo",  // rol dentro del monitoreo
          relevance: e.relevance || "",                     // por qué es competencia
        }));
      return jsonResponse({ competitors });
    }

    // ── GUARDAR competidores (estrategia replace) ───────────────────────
    if (section === "competitors") {
      const incoming = Array.isArray(d.competitors) ? d.competitors : [];
      const cids = await containerIds();
      const containerId = cids[0] || null;
      // Borrar competidores actuales + sus watchers (los del sitio propio quedan).
      const { data: olds } = await service.from("intelligence_entities")
        .select("id, metadata").eq("organization_id", orgId);
      const compIds = (olds || []).filter((e: { metadata?: { kind?: string } }) => e.metadata?.kind === "competitor").map((e: { id: string }) => e.id);
      if (compIds.length) {
        await service.from("url_watchers").delete().in("entity_id", compIds);
        await service.from("intelligence_entities").delete().in("id", compIds);
      }
      let count = 0;
      for (const c of incoming) {
        const name = str(c.name);
        if (!name) continue;
        const ig = (typeof c.instagram === "string" ? c.instagram : "").replace(/^@/, "").trim() || null;
        const site = normalizeUrl(c.website);
        const targetId = ig || (site ? hostnameOf(site) : null) || name;
        // Rol dentro del monitoreo (Vera los identifica como competencia directa) +
        // relevancia: el porqué de estar aquí. Passthrough si el builder mandó una
        // razón; si no, un default honesto y editable.
        const role = str(c.role || c.tipo) || "competidor_directo";
        const relevance = str(c.relevance || c.reason || c.why) ||
          `Identificado por Vera al construir tu marca, como competencia en tu categoría. Ajusta el porqué con lo que específicamente lo hace tu competencia (comunicación, propuesta, precio, audiencia).`;
        const { data: ent } = await service.from("intelligence_entities").insert({
          brand_container_id: containerId, organization_id: orgId, name,
          domain: ig ? "social" : "web", target_identifier: targetId, is_active: true, scope: "brand",
          relevance,
          metadata: { website: site, instagram: ig, kind: "competitor", tipo: role, discovered_by: "auto-builder" },
        }).select("id").single();
        count++;
        if (site && ent) {
          await service.from("url_watchers").insert({
            url: site, label: name, entity_id: ent.id,
            brand_container_id: containerId, organization_id: orgId, is_active: true, last_hash: "",
          });
        }
      }
      return jsonResponse({ ok: true, count });
    }

    // ── GUARDAR productos detectados (replace de auto_builder) + sus imagenes ─
    if (section === "products") {
      const incoming = Array.isArray(d.products) ? d.products : [];
      const cids = await containerIds();
      const containerId = cids[0] || null;
      // El detalle de producto requiere entity_id → asegurar una brand_entity.
      let entityId: string | null = null;
      {
        const { data: ent } = await service.from("brand_entities").select("id")
          .eq("organization_id", orgId).order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (ent) entityId = (ent as { id: string }).id;
        else {
          const { data: created } = await service.from("brand_entities")
            .insert({ organization_id: orgId, name: "Identity principal", entity_type: "other", description: null })
            .select("id").single();
          entityId = (created as { id: string } | null)?.id || null;
        }
      }
      await service.from("products").delete().eq("organization_id", orgId).eq("created_via", "auto_builder");
      let count = 0, images = 0;
      const productIds: string[] = [];
      for (const p of incoming) {
        const name = str(p?.name);
        if (!name) continue;
        const { data: prod, error } = await service.from("products").insert({
          organization_id: orgId,
          brand_container_id: containerId,
          entity_id: entityId,
          tipo_producto: "otro",
          nombre_producto: name,
          descripcion_producto: str(p?.description) || name,
          moneda: str(p?.currency) || "COP",
          created_via: "auto_builder",
          metadata: { price: p?.price || null, source: "url-scrape", source_url: str(p?.url) },
        }).select("id").single();
        if (error || !prod) continue;
        count++;
        productIds.push((prod as { id: string }).id);
        // Imagen del producto → product_images (de donde lee el catalogo). La URL
        // externa se muestra ya; download_status='pending' para bajarla a storage luego.
        const img = (typeof p?.image === "string" && /^https?:\/\//i.test(p.image.trim())) ? p.image.trim() : null;
        if (img) {
          const { error: iErr } = await service.from("product_images").insert({
            product_id: prod.id, image_url: img, image_type: "principal",
            image_order: 0, external_platform: "url-scrape", download_status: "pending",
          });
          if (!iErr) images++;
        }
      }
      // Enriquecer cada producto con IA (Claude, EnrichmentPopulator) en background:
      // beneficios, diferenciadores, casos de uso, caracteristicas visuales, materiales.
      // Idempotente (skipea si ya estan llenos). Spacing 2s para suavizar al provider.
      if (productIds.length) {
        const jobs = productIds.map((pid, i) => ({
          organization_id: orgId,
          job_type: "mission",
          priority: 6,
          payload: { mission_type: "vera_enrich_product", product_id: pid, source_platform: "url-scrape" },
          status: "queued",
          run_after: new Date(Date.now() + i * 2000).toISOString(),
        }));
        const { error: enqErr } = await service.from("agent_queue_jobs").insert(jobs);
        if (enqErr) console.warn("[products] enrichment enqueue:", enqErr.message);
      }
      return jsonResponse({ ok: true, count, images, enrichment_enqueued: productIds.length });
    }

    // ── SERVICIOS (espejo de products) ──────────────────────────────────
    if (section === "services") {
      const incoming = Array.isArray(d.services) ? d.services : [];
      // El servicio requiere entity_id → reusar/crear la misma brand_entity.
      let entityId: string | null = null;
      {
        const { data: ent } = await service.from("brand_entities").select("id")
          .eq("organization_id", orgId).order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (ent) entityId = (ent as { id: string }).id;
        else {
          const { data: created } = await service.from("brand_entities")
            .insert({ organization_id: orgId, name: "Identity principal", entity_type: "other", description: null })
            .select("id").single();
          entityId = (created as { id: string } | null)?.id || null;
        }
      }
      // En creacion el org es nuevo → limpiar servicios previos del org (re-aprobacion).
      await service.from("services").delete().eq("organization_id", orgId);
      let count = 0;
      const serviceIds: string[] = [];
      for (const s of incoming) {
        const name = str(s?.name);
        if (!name) continue;
        const priceNum = Number(s?.price);
        const { data: svc, error } = await service.from("services").insert({
          organization_id: orgId,
          entity_id: entityId,
          nombre_servicio: name,
          descripcion_servicio: str(s?.description) || name,
          moneda: str(s?.currency) || "COP",
          precio_base: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
          url_servicio: str(s?.url) || null,
        }).select("id").single();
        if (error || !svc) continue;
        count++;
        serviceIds.push((svc as { id: string }).id);
      }
      // Enriquecer cada servicio con IA (Claude) en background: beneficios,
      // diferenciadores, casos de uso, entregables, metodologia. Idempotente.
      if (serviceIds.length) {
        const jobs = serviceIds.map((sid, i) => ({
          organization_id: orgId,
          job_type: "mission",
          priority: 6,
          payload: { mission_type: "vera_enrich_service", service_id: sid, source_platform: "url-scrape" },
          status: "queued",
          run_after: new Date(Date.now() + i * 2000).toISOString(),
        }));
        const { error: enqErr } = await service.from("agent_queue_jobs").insert(jobs);
        if (enqErr) console.warn("[services] enrichment enqueue:", enqErr.message);
      }
      return jsonResponse({ ok: true, count, enrichment_enqueued: serviceIds.length });
    }

    // ── ASIGNAR owner + miembros (opcional) ─────────────────────────────
    if (section === "owner") {
      const VALID_MEMBER_ROLES = new Set(["admin", "editor", "creator", "vera_user", "viewer"]);
      const ownerId = str(d.owner_user_id);
      const members = Array.isArray(d.members) ? d.members : [];
      if (ownerId) {
        await service.from("organizations").update({ owner_user_id: ownerId }).eq("id", orgId);
        await service.from("organization_members")
          .upsert({ organization_id: orgId, user_id: ownerId, role: "owner" }, { onConflict: "organization_id,user_id" });
      }
      let count = 0;
      for (const m of members) {
        const uid = str(m?.user_id);
        const role = (str(m?.role) || "viewer").toString();
        if (!uid || !VALID_MEMBER_ROLES.has(role)) continue;
        const { error } = await service.from("organization_members")
          .upsert({ organization_id: orgId, user_id: uid, role }, { onConflict: "organization_id,user_id" });
        if (!error) count++;
      }
      return jsonResponse({ ok: true, members: count });
    }

    // ── PLAN de la org (ultimo paso) — crea subscription + creditos ─────
    if (section === "plan") {
      const planId = str(d.plan_id);
      if (!planId) return jsonResponse({ ok: true, skipped: true }); // trial / sin plan
      const { data: plan } = await service.from("plans")
        .select("id, credits_monthly").eq("id", planId).eq("is_active", true).maybeSingle();
      if (!plan) return errorResponse("Plan invalido", 400);
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      // Org nueva: limpiar cualquier subscription previa y crear la activa.
      await service.from("subscriptions").delete().eq("organization_id", orgId);
      const { error: subErr } = await service.from("subscriptions").insert({
        organization_id: orgId, plan_id: planId, status: "active",
        current_period_start: now.toISOString(), current_period_end: end.toISOString(),
        provider: "wompi", cancel_at_period_end: false,
        metadata: { assigned_by: "auto-builder", admin_grant: true },
      });
      if (subErr) return errorResponse(subErr.message, 500);
      // Creditos del plan
      await service.from("organization_credits").upsert({
        organization_id: orgId,
        credits_available: plan.credits_monthly || 0,
        credits_total: plan.credits_monthly || 0,
      }, { onConflict: "organization_id" });
      return jsonResponse({ ok: true, plan: planId });
    }

    return errorResponse(`Seccion desconocida: ${section}`, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse((err as Error)?.message || "Error interno", 500);
  }
});
