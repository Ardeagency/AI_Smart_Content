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
        .select("id, name, domain, target_identifier, metadata")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });
      const competitors = (data || [])
        .filter((e: { metadata?: { kind?: string } }) => e.metadata?.kind === "competitor")
        .map((e: { id: string; name: string; domain: string; target_identifier: string; metadata?: { website?: string; instagram?: string } }) => ({
          id: e.id,
          name: e.name,
          website: e.metadata?.website || "",
          instagram: e.metadata?.instagram || (e.domain === "social" ? e.target_identifier : "") || "",
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
        const { data: ent } = await service.from("intelligence_entities").insert({
          brand_container_id: containerId, organization_id: orgId, name,
          domain: ig ? "social" : "web", target_identifier: targetId, is_active: true, scope: "brand",
          metadata: { website: site, instagram: ig, kind: "competitor", discovered_by: "auto-builder" },
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

    // ── GUARDAR productos detectados (estrategia replace de auto_builder) ─
    if (section === "products") {
      const incoming = Array.isArray(d.products) ? d.products : [];
      const cids = await containerIds();
      const containerId = cids[0] || null;
      await service.from("products").delete().eq("organization_id", orgId).eq("created_via", "auto_builder");
      const rows = incoming
        .map((p: { name?: string; description?: string; image?: string; price?: string; currency?: string }) => ({
          organization_id: orgId,
          brand_container_id: containerId,
          tipo_producto: "otro",
          nombre_producto: str(p.name) || "",
          descripcion_producto: str(p.description) || str(p.name) || "—",
          moneda: str(p.currency) || "COP",
          created_via: "auto_builder",
          metadata: { image: p.image || null, price: p.price || null, source: "url-scrape" },
        }))
        .filter((r: { nombre_producto: string }) => r.nombre_producto);
      if (rows.length) {
        const { error } = await service.from("products").insert(rows);
        if (error) return errorResponse(error.message, 500);
      }
      return jsonResponse({ ok: true, count: rows.length });
    }

    return errorResponse(`Seccion desconocida: ${section}`, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse((err as Error)?.message || "Error interno", 500);
  }
});
