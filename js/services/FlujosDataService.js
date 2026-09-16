/**
 * FlujosDataService — el CATÁLOGO DE FLUJOS (/studio/flows, /studio/catalog) sobre
 * la base nueva (corte ADR-0052). Única puerta a la base para FlowCatalogView.
 *
 * Contrato: Git-AISC-DB docs/contratos/studio.md (8303f5e) §Studio:
 *   · V flows.catalog_view(id, organization_id, slug, name, description, cover_url, kind,
 *     status, show_in_catalog, pricing_mode fixed|observed|free, fixed_credits, published_at,
 *     es_del_catalogo_comun, categoria, categoria_nombre, nichos[], pasos, entradas,
 *     me_gusta, guardados, corridas, creditos_promedio) — organization_id NULL = común.
 *   · T flows.categories(id, parent_id, slug, name, description, icon, position, is_active,
 *     cover_url) — las subcategorías de v1 son categorías con parent_id.
 *   · Guardar/like: T flows.saves(flow_id, organization_id, user_id) · T flows.likes(flow_id,
 *     user_id): INSERT/DELETE, sin RPC; contadores en catalog_view.
 *   · Entradas del formulario: T flows.inputs(flow_id, step_id, key, label, help_text, kind,
 *     is_required, position, default_value, options[{label,value}], validation) → campos
 *     de InputRegistry (entradaACampo). Lanzar: StudioDatos.lanzar (borde /v1/flujos/:id/lanzar).
 *   · Corridas y salidas: ProduccionesDatos (flows.runs + public.salidas).
 *
 * Devuelve las filas con la forma de v1 (content_flows, content_categories,
 * content_subcategories) para que la vista pinte igual. Ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  /* ── Mapeos puros (test/flujos-datos.test.js) ───────────────────────────── */

  const KIND_A_OUTPUT = Object.freeze({ image: 'image', video: 'video', audio: 'audio', text: 'text', research: 'text', analysis: 'text', publishing: 'text', automation: 'text' });

  /** catalog_view → content_flows de v1. `categorias` = mapa id → fila para resolver raíz/sub. */
  function flujoAV1(f, categorias = {}) {
    const cat = f.categoria ? categorias[f.categoria] : null;
    const raiz = cat?.parent_id ? categorias[cat.parent_id] : cat;
    return {
      id: f.id,
      slug: f.slug || null,
      name: f.name,
      description: f.description || '',
      token_cost: f.pricing_mode === 'fixed' ? Number(f.fixed_credits) || 0 : (f.pricing_mode === 'free' ? 0 : (Number(f.creditos_promedio) || null)),
      pricing_mode: f.pricing_mode || null,
      output_type: KIND_A_OUTPUT[f.kind] || f.kind || 'text',
      kind: f.kind || null,
      flow_image_url: f.cover_url || null,
      category_id: raiz?.id || f.categoria || null,
      subcategory_id: cat?.parent_id ? cat.id : null,
      category_name: f.categoria_nombre || raiz?.name || null,
      flow_category_type: f.es_del_catalogo_comun ? 'platform' : 'organization',
      likes_count: Number(f.me_gusta) || 0,
      saves_count: Number(f.guardados) || 0,
      run_count: Number(f.corridas) || 0,
      created_at: f.published_at || null,
      status: f.status || 'published',
      version: null,
      execution_mode: 'flow',
      nichos: Array.isArray(f.nichos) ? f.nichos : [],
      pasos: f.pasos ?? null,
      entradas: f.entradas ?? null,
    };
  }

  /** flows.categories → {categories (raíz), subcategories (con parent_id)} en la forma de v1. */
  function categoriasAV1(filas) {
    const activas = (filas || []).filter((c) => c.is_active !== false);
    const categories = activas.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name, description: c.description || '', order_index: c.position ?? null, cover_url: c.cover_url || null, cover_type: c.cover_url ? 'image' : null, cover_storage_path: null, is_visible: true, icon: c.icon || null, slug: c.slug || null }));
    const subcategories = activas.filter((c) => c.parent_id).map((c) => ({ id: c.id, name: c.name, description: c.description || '', order_index: c.position ?? null, category_ids: [c.parent_id], parent_id: c.parent_id, slug: c.slug || null }));
    const orden = (a, b) => ((a.order_index ?? 9999) - (b.order_index ?? 9999)) || String(a.name).localeCompare(String(b.name));
    return { categories: categories.sort(orden), subcategories: subcategories.sort(orden), porId: Object.fromEntries(activas.map((c) => [c.id, c])) };
  }

  /**
   * flows.inputs → campo que InputRegistry.renderFormFromSchema sabe pintar. `kind` de la
   * base: text, long_text, number, boolean, select, multi_select, image, video, audio, file,
   * url, date, color, gradient, element_ref, market_ref. Los archivos se suben por el borde
   * antes de lanzar (file_id); las referencias a elementos/mercados se pintan como select
   * con las opciones que le pase la vista (`opciones`).
   */
  const KIND_A_TIPO = Object.freeze({ text: 'text', long_text: 'textarea', number: 'number', boolean: 'toggle', select: 'select', multi_select: 'multi_select', image: 'file', video: 'file', audio: 'file', file: 'file', url: 'text', date: 'text', color: 'text', gradient: 'text', element_ref: 'select', market_ref: 'select' });
  const ACEPTA = Object.freeze({ image: 'image/*', video: 'video/*', audio: 'audio/*', file: '*' });
  /** `aspect_ratio` → «Aspect ratio»: respaldo cuando el label viene vacío o igual a la clave (herencia de v1). */
  function humanizar(clave) {
    const t = String(clave || '').replace(/[_-]+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  function entradaACampo(fila, opciones = {}) {
    const kind = String(fila.kind || 'text');
    const tipo = KIND_A_TIPO[kind] || 'text';
    const label = (!fila.label || fila.label === fila.key) ? humanizar(fila.key) : fila.label;
    const campo = {
      key: fila.key, name: fila.key, label, description: fila.help_text || '',
      input_type: tipo, type: tipo, required: fila.is_required === true, kind, position: fila.position ?? 0,
      options: Array.isArray(fila.options) ? fila.options : [],
      defaultValue: fila.default_value ?? undefined, validation: fila.validation || {},
    };
    if (tipo === 'file') { campo.accept = ACEPTA[kind] || '*'; campo.multiUpload = false; }
    if (kind === 'element_ref') campo.options = opciones.elementos || [];
    if (kind === 'market_ref') campo.options = opciones.mercados || [];
    if (kind === 'url') campo.placeholder = 'https://…';
    if (kind === 'date') campo.placeholder = 'AAAA-MM-DD';
    if (kind === 'color') campo.placeholder = '#RRGGBB';
    if (kind === 'long_text') campo.rows = 4;
    return campo;
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function aviso(nombre, r) { if (r?.error) console.warn(`[flujos] ${nombre}:`, r.error.code, r.error.message); }

  let catCache = null; let catTs = 0;
  async function categorias({ fresco = false } = {}) {
    if (!fresco && catCache && Date.now() - catTs < 10 * 60 * 1000) return catCache;
    const sb = await cliente();
    if (!sb) return catCache || categoriasAV1([]);
    const r = await sb.schema('flows').from('categories').select('id, parent_id, slug, name, description, icon, position, is_active, cover_url').order('position', { ascending: true, nullsFirst: false });
    aviso('flows.categories', r);
    if (r.error) return catCache || categoriasAV1([]);
    catCache = categoriasAV1(r.data || []); catTs = Date.now();
    return catCache;
  }

  /** Flujos publicados y visibles: los comunes (organization_id NULL) + los de la marca. */
  async function flujos(orgId, { categoriaId = null, subcategoriaId = null } = {}) {
    const sb = await cliente();
    if (!sb) return [];
    const cats = await categorias();
    let q = sb.schema('flows').from('catalog_view').select('id, organization_id, slug, name, description, cover_url, kind, status, show_in_catalog, pricing_mode, fixed_credits, published_at, es_del_catalogo_comun, categoria, categoria_nombre, nichos, pasos, entradas, me_gusta, guardados, corridas, creditos_promedio').eq('status', 'published').eq('show_in_catalog', true).order('published_at', { ascending: false, nullsFirst: false });
    q = orgId ? q.or(`organization_id.is.null,organization_id.eq.${orgId}`) : q.is('organization_id', null);
    const r = await q;
    aviso('flows.catalog_view', r);
    let lista = (r.data || []).map((f) => flujoAV1(f, cats.porId));
    if (subcategoriaId) lista = lista.filter((f) => f.subcategory_id === subcategoriaId);
    else if (categoriaId) lista = lista.filter((f) => f.category_id === categoriaId);
    return lista;
  }

  /** Entradas de un flujo (flows.inputs) como campos del formulario del Studio, en orden. */
  async function entradas(flowId, opciones = {}) {
    const sb = await cliente();
    if (!sb || !flowId) return [];
    const r = await sb.schema('flows').from('inputs').select('id, flow_id, step_id, key, label, help_text, kind, is_required, position, default_value, options, validation').eq('flow_id', flowId).order('position', { ascending: true });
    aviso('flows.inputs', r);
    return (r.data || []).map((f) => entradaACampo(f, opciones));
  }

  async function likesYGuardados(orgId, userId) {
    const sb = await cliente();
    const likes = new Set(); const saves = new Set();
    if (!sb) return { likes, saves };
    const [l, s] = await Promise.all([
      userId ? sb.schema('flows').from('likes').select('flow_id').eq('user_id', userId) : Promise.resolve({ data: [] }),
      orgId ? sb.schema('flows').from('saves').select('flow_id').eq('organization_id', orgId) : Promise.resolve({ data: [] }),
    ]);
    aviso('flows.likes', l); aviso('flows.saves', s);
    (l.data || []).forEach((r) => likes.add(r.flow_id)); (s.data || []).forEach((r) => saves.add(r.flow_id));
    return { likes, saves };
  }

  /** Alterna el «me gusta» de la persona. Devuelve true si quedó marcado. */
  async function alternarLike(flowId, userId) {
    const sb = await cliente();
    if (!sb || !flowId || !userId) throw Object.assign(new Error('Falta la sesión.'), { code: 'sin_sesion' });
    const hay = await sb.schema('flows').from('likes').select('flow_id').eq('flow_id', flowId).eq('user_id', userId).maybeSingle();
    if (hay.error) throw hay.error;
    if (hay.data) { const { error } = await sb.schema('flows').from('likes').delete().eq('flow_id', flowId).eq('user_id', userId); if (error) throw error; return false; }
    const { error } = await sb.schema('flows').from('likes').insert({ flow_id: flowId, user_id: userId }); if (error) throw error; return true;
  }

  /** Alterna el «guardado» de la marca. Devuelve true si quedó guardado. */
  async function alternarGuardado(flowId, orgId, userId) {
    const sb = await cliente();
    if (!sb || !flowId || !orgId) throw Object.assign(new Error('Falta la marca.'), { code: 'sin_marca' });
    const hay = await sb.schema('flows').from('saves').select('flow_id').eq('flow_id', flowId).eq('organization_id', orgId).maybeSingle();
    if (hay.error) throw hay.error;
    if (hay.data) { const { error } = await sb.schema('flows').from('saves').delete().eq('flow_id', flowId).eq('organization_id', orgId); if (error) throw error; return false; }
    const fila = { flow_id: flowId, organization_id: orgId }; if (userId) fila.user_id = userId;
    const { error } = await sb.schema('flows').from('saves').insert(fila); if (error) throw error; return true;
  }

  window.FlujosDatos = Object.freeze({
    categorias, flujos, entradas, likesYGuardados, alternarLike, alternarGuardado,
    mapeo: Object.freeze({ flujoAV1, categoriasAV1, entradaACampo }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
