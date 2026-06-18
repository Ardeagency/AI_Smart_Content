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

    return errorResponse(`Seccion desconocida: ${section}`, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse((err as Error)?.message || "Error interno", 500);
  }
});
