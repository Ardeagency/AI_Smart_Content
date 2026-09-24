/**
 * CatalogoDataService — el CATÁLOGO de la marca (productos, servicios, escenarios,
 * personajes, identidades) sobre la base nueva (corte ADR-0052). Única puerta a la
 * base para ProductsListView, ServicesView, PlacesView, CharactersView, ProductsView.
 *
 * Contrato: Git-AISC-DB docs/contratos/studio.md (8303f5e) §Catálogo:
 *   · V public.elements_full(id, organization_id, kind, name, summary, description,
 *     is_featured, attributes, archived_at, created_at, updated_at, detail, has_detail)
 *     — kind ∈ identity, product, service, character, scenario (v1 places = scenario).
 *     `detail` = la fila de element_<kind> (product: sku, product_type, price, currency,
 *     url, benefits[], differentiators[], use_cases[], visual_traits[], ingredients[] ·
 *     service: service_type, price, currency, price_model, duration_minutes, modality,
 *     url, benefits[], … · character: role, personality, backstory, voice_tone, age_range,
 *     physical_description, traits[], visual_traits[], reference_urls[] · scenario:
 *     scenario_type, address, city, country, latitude, longitude, opening_hours, url,
 *     visual_traits[], mood, amenities[], use_cases[]).
 *   · Imágenes: elements.attributes.imagenes[] = {url, file_id?, tipo, orden, mime, bytes…};
 *     con file_id → galería/pública (StudioDatos.urlsDeArchivos); si no → url.
 *   · Escribir (policies *_ver = ver_marca, *_editar = editar_marca): 1) POST elements
 *     {organization_id, kind, name, description, summary, is_featured, attributes};
 *     2) POST element_<kind> {element_id, kind, …} — el MISMO kind (FK compuesta).
 *     Foto: POST /v1/archivos?proposito=subida → PATCH elements.attributes.imagenes.
 *     Archivar = PATCH archived_at. `search`/`nucleo` los llena la base.
 *   · v1 `brand_entities` (la «identidad» contenedora) → elements kind identity; los
 *     productos ya no cuelgan de una entidad: `entity_id` = el propio id (compatibilidad).
 *
 * Devuelve las filas con la FORMA de v1 por kind para que las vistas pinten igual.
 * Regla del corte: ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  const KINDS = Object.freeze({ product: 'product', service: 'service', place: 'scenario', scenario: 'scenario', character: 'character', identity: 'identity' });
  const TABLA_DETALLE = Object.freeze({ product: 'element_products', service: 'element_services', character: 'element_characters', scenario: 'element_scenarios' });

  /* ── Mapeos puros (test/catalogo-datos.test.js) ─────────────────────────── */

  function urlsDeImagenes(imagenes, urlPorArchivo = {}) {
    return (Array.isArray(imagenes) ? imagenes : [])
      .slice().sort((a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0))
      .map((im) => ({ url: (im?.file_id && urlPorArchivo[im.file_id]) || im?.url || null, file_id: im?.file_id || null, tipo: im?.tipo || null, orden: im?.orden ?? 0 }))
      .filter((im) => im.url);
  }

  /**
   * elements_full.imagenes (BD 20260924130000, contrato studio.md): [{file_id, url, tipo, orden,
   * mime, ancho, alto, bytes, pendiente}], ya ordenada y con la url RESUELTA por la base
   * (url_de_archivo). `pendiente: true` + url null = foto sin archivo: se conserva para que la
   * vista pinte el placeholder (nunca la URL vieja). Con esta columna NO se lee
   * attributes.imagenes[].url ni se resuelve con urlsDeArchivos (tope de 50 del borde).
   */
  function imagenesDeLaBase(imagenes) {
    return (Array.isArray(imagenes) ? imagenes : []).map((im, i) => ({
      url: im?.pendiente ? null : (im?.url || null), file_id: im?.file_id || null, tipo: im?.tipo || null,
      orden: im?.orden ?? i, pendiente: !!im?.pendiente || !im?.url,
    }));
  }

  /** elements_full → la fila de v1 de cada kind (products / services / brand_places / brand_characters / brand_entities). */
  function elementoAV1(e, urlPorArchivo = {}) {
    const d = (e.detail && typeof e.detail === 'object') ? e.detail : {};
    // Base con la migración: la columna `imagenes` manda. Base de hoy: attributes + urlsDeArchivos.
    const imgs = Array.isArray(e.imagenes) ? imagenesDeLaBase(e.imagenes) : urlsDeImagenes(e.attributes?.imagenes, urlPorArchivo);
    const conUrl = imgs.filter((i) => i.url);
    const base = { id: e.id, entity_id: e.id, organization_id: e.organization_id, kind: e.kind, name: e.name, description: e.description || null, summary: e.summary || null, is_featured: e.is_featured === true, attributes: e.attributes || {}, detail: d, created_at: e.created_at, updated_at: e.updated_at, image_urls: conUrl.map((i) => i.url), imagenes: imgs, imagen: conUrl[0]?.url || null };
    switch (e.kind) {
      case 'product': return { ...base, nombre_producto: e.name, descripcion_producto: e.description || e.summary || null, tipo_producto: d.product_type || null, precio_producto: d.price ?? null, moneda: d.currency || null, sku: d.sku || null, url_producto: d.url || null, beneficios: d.benefits || [], beneficios_principales: d.benefits || [], diferenciadores: d.differentiators || [], casos_de_uso: d.use_cases || [], rasgos_visuales: d.visual_traits || [], caracteristicas_visuales: d.visual_traits || [], ingredientes: d.ingredients || [], materiales_composicion: d.ingredients || [] };
      case 'service': return { ...base, nombre_servicio: e.name, descripcion_servicio: e.description || e.summary || null, tipo_servicio: d.service_type || null, precio_base: d.price ?? null, moneda: d.currency || null, modelo_precio: d.price_model || null, duracion_estimada: d.duration_minutes != null ? `${d.duration_minutes} min` : null, modalidad: d.modality || null, beneficios_principales: d.benefits || [], entregables: d.deliverables || [] };
      case 'scenario': return { ...base, nombre_lugar: e.name, descripcion_lugar: e.description || e.summary || null, place_type: d.scenario_type || null, city: d.city || null, country: d.country || null, address: d.address || null, mood: d.mood || null, amenities: d.amenities || [] };
      case 'character': return { ...base, nombre_personaje: e.name, descripcion_personaje: e.description || e.summary || null, tipo_personaje: d.role || null, personalidad: d.personality || null, historia: d.backstory || null, tono: d.voice_tone || null, rango_edad: d.age_range || null, descripcion_fisica: d.physical_description || null, rasgos: d.traits || [] };
      default: return { ...base, entity_type: e.kind, nombre: e.name };
    }
  }

  /** Campos de v1 (por kind) → {elemento, detalle} para escribir en elements y element_<kind>. */
  function aBase(kind, v1) {
    const k = KINDS[kind] || kind;
    const elemento = {};
    const nombre = v1.name ?? v1.nombre_producto ?? v1.nombre_servicio ?? v1.nombre_lugar ?? v1.nombre_personaje ?? v1.nombre;
    if (nombre != null) elemento.name = String(nombre).trim();
    const desc = v1.description ?? v1.descripcion_producto ?? v1.descripcion_servicio ?? v1.descripcion_lugar ?? v1.descripcion_personaje;
    if (desc !== undefined) elemento.description = desc || null;
    if (v1.summary !== undefined) elemento.summary = v1.summary || null;
    if (v1.is_featured !== undefined) elemento.is_featured = !!v1.is_featured;
    if (v1.attributes !== undefined) elemento.attributes = v1.attributes;
    const detalle = {};
    const pon = (col, val) => { if (val !== undefined) detalle[col] = val === '' ? null : val; };
    if (k === 'product') { pon('product_type', v1.tipo_producto ?? v1.product_type); pon('price', v1.precio_producto ?? v1.price); pon('currency', v1.moneda ?? v1.currency); pon('sku', v1.sku); pon('url', v1.url_producto ?? v1.url); pon('benefits', v1.beneficios ?? v1.beneficios_principales ?? v1.benefits); pon('differentiators', v1.diferenciadores ?? v1.differentiators); pon('use_cases', v1.casos_de_uso ?? v1.use_cases); pon('visual_traits', v1.rasgos_visuales ?? v1.caracteristicas_visuales ?? v1.visual_traits); pon('ingredients', v1.ingredientes ?? v1.materiales_composicion ?? v1.ingredients); }
    if (k === 'service') { pon('service_type', v1.tipo_servicio ?? v1.service_type); pon('price', v1.precio_base ?? v1.price); pon('currency', v1.moneda ?? v1.currency); pon('price_model', v1.modelo_precio ?? v1.price_model); pon('duration_minutes', v1.duration_minutes); pon('modality', v1.modalidad ?? v1.modality); pon('url', v1.url); pon('benefits', v1.beneficios_principales ?? v1.benefits); pon('deliverables', v1.entregables ?? v1.deliverables); }
    if (k === 'scenario') { pon('scenario_type', v1.place_type ?? v1.scenario_type); pon('city', v1.city); pon('country', v1.country); pon('address', v1.address); pon('mood', v1.mood); pon('amenities', v1.amenities); pon('url', v1.url); pon('opening_hours', v1.opening_hours); }
    if (k === 'character') { pon('role', v1.tipo_personaje ?? v1.role); pon('personality', v1.personalidad ?? v1.personality); pon('backstory', v1.historia ?? v1.backstory); pon('voice_tone', v1.tono ?? v1.voice_tone); pon('age_range', v1.rango_edad ?? v1.age_range); pon('physical_description', v1.descripcion_fisica ?? v1.physical_description); pon('traits', v1.rasgos ?? v1.traits); pon('visual_traits', v1.visual_traits); }
    return { kind: k, elemento, detalle };
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function api() { return (typeof window !== 'undefined' && window.apiV2?.api) || null; }
  function aviso(nombre, r) { if (r?.error) console.warn(`[catalogo] ${nombre}:`, r.error.code, r.error.message); }
  const SEL = 'id, organization_id, kind, name, summary, description, is_featured, attributes, archived_at, created_at, updated_at, detail, has_detail';
  const SEL_CON_IMAGENES = `${SEL}, imagenes`;
  /** ¿La base viva ya expone elements_full.imagenes? null = sin probar. */
  let conImagenes = null;
  const faltaColumna = (err) => ['PGRST204', '42703'].includes(String(err?.code || ''));

  /**
   * Lee elements_full con la columna `imagenes` si existe; si la base aún no la tiene
   * (PGRST204/42703) repite sin ella y resuelve fotos como hoy (urlsDeArchivos). Aprende la
   * respuesta para no repetir el intento fallido en cada lectura.
   */
  async function leerElements(sb, orgId, construir) {
    if (conImagenes !== false) {
      const r = await construir(SEL_CON_IMAGENES);
      if (!r.error) { conImagenes = true; return { r, urls: {} }; }
      if (!faltaColumna(r.error)) return { r, urls: {} };
      conImagenes = false;
    }
    const [r, urls] = await Promise.all([
      construir(SEL),
      window.StudioDatos && orgId ? window.StudioDatos.urlsDeArchivos(orgId) : Promise.resolve({}),
    ]);
    return { r, urls };
  }

  /** Elementos vivos de la marca por kind (v1: products/services/places/characters). */
  async function elementos(orgId, kind, { limite = 500 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const k = KINDS[kind] || kind;
    const { r, urls } = await leerElements(sb, orgId, (sel) => sb.from('elements_full').select(sel).eq('organization_id', orgId).eq('kind', k).is('archived_at', null).order('is_featured', { ascending: false }).order('created_at', { ascending: false }).limit(limite));
    aviso(`elements_full ${k}`, r);
    return (r.data || []).map((e) => elementoAV1(e, urls));
  }

  async function elemento(id) {
    const sb = await cliente();
    if (!sb || !id) return null;
    let { r, urls } = await leerElements(sb, null, (sel) => sb.from('elements_full').select(sel).eq('id', id).maybeSingle());
    aviso('elements_full id', r);
    if (!r.data) return null;
    if (conImagenes === false && window.StudioDatos) urls = await window.StudioDatos.urlsDeArchivos(r.data.organization_id);
    return elementoAV1(r.data, urls);
  }

  /** Crea el elemento y su detalle (dos inserts, mismo kind). Devuelve la fila v1. */
  async function crear(orgId, kind, v1) {
    const sb = await cliente();
    if (!sb || !orgId) return null;
    const { kind: k, elemento: el, detalle } = aBase(kind, v1);
    if (!el.name) throw Object.assign(new Error('El elemento necesita un nombre.'), { code: 'entrada_invalida' });
    const fila = { organization_id: orgId, kind: k, name: el.name, description: el.description ?? null, summary: el.summary ?? null, is_featured: el.is_featured ?? false, attributes: el.attributes ?? {} };
    const { data, error } = await sb.from('elements').insert(fila).select('id').single();
    if (error) throw error;
    if (TABLA_DETALLE[k]) {
      const { error: e2 } = await sb.from(TABLA_DETALLE[k]).insert({ element_id: data.id, kind: k, ...detalle });
      if (e2) { console.warn('[catalogo] detalle no se creó:', e2.code, e2.message); }
    }
    return elemento(data.id);
  }

  /** Actualiza elements y/o element_<kind>. Devuelve la fila v1 guardada. */
  async function actualizar(id, kind, v1) {
    const sb = await cliente();
    if (!sb || !id) return null;
    const { kind: k, elemento: el, detalle } = aBase(kind, v1);
    if (Object.keys(el).length) {
      const { data, error } = await sb.from('elements').update(el).eq('id', id).select('id');
      if (error) throw error;
      if (!Array.isArray(data) || !data.length) throw Object.assign(new Error('El elemento no se guardó (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    }
    if (Object.keys(detalle).length && TABLA_DETALLE[k]) {
      const { data, error } = await sb.from(TABLA_DETALLE[k]).upsert({ element_id: id, kind: k, ...detalle }, { onConflict: 'element_id' }).select('element_id');
      if (error) throw error;
      if (!Array.isArray(data) || !data.length) throw Object.assign(new Error('El detalle no se guardó (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    }
    return elemento(id);
  }

  /** Archivar = PATCH archived_at (no se borra: las producciones lo referencian). */
  async function archivar(id) {
    const sb = await cliente();
    if (!sb || !id) return false;
    const { data, error } = await sb.from('elements').update({ archived_at: new Date().toISOString() }).eq('id', id).select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  /** Duplicar = crear con los mismos campos y «(copia)» en el nombre; las fotos se comparten por referencia. */
  async function duplicar(id) {
    const original = await elemento(id);
    if (!original) return null;
    const sb = await cliente();
    const d = original.detail || {};
    const fila = { organization_id: original.organization_id, kind: original.kind, name: `${original.name} (copia)`, description: original.description, summary: original.summary, is_featured: false, attributes: original.attributes || {} };
    const { data, error } = await sb.from('elements').insert(fila).select('id').single();
    if (error) throw error;
    if (TABLA_DETALLE[original.kind] && Object.keys(d).length) {
      const { element_id: _e, kind: _k, created_at: _c, updated_at: _u, ...resto } = d;
      const { error: e2 } = await sb.from(TABLA_DETALLE[original.kind]).insert({ element_id: data.id, kind: original.kind, ...resto });
      if (e2) console.warn('[catalogo] detalle de la copia:', e2.code, e2.message);
    }
    return elemento(data.id);
  }

  /** Sube una foto por el borde y la añade a attributes.imagenes (primera = principal). */
  async function subirFoto(orgId, id, archivo, { tipo = null } = {}) {
    const a = api();
    const sb = await cliente();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL): no se pueden subir fotos.'), { code: 'sin_api' });
    if (!sb || !orgId || !id || !archivo) throw Object.assign(new Error('Falta el elemento o el archivo.'), { code: 'entrada_invalida' });
    let r;
    try { r = await a.subirArchivo(orgId, archivo, 'subida'); } catch (e) { if (e?.codigo) e.code = e.codigo; throw e; }
    const f = r?.archivo;
    if (!f?.id) throw Object.assign(new Error('El borde no devolvió el archivo.'), { code: 'sin_archivo' });
    const actual = await sb.from('elements').select('attributes').eq('id', id).maybeSingle();
    if (actual.error) throw actual.error;
    const attrs = (actual.data?.attributes && typeof actual.data.attributes === 'object') ? { ...actual.data.attributes } : {};
    const lista = Array.isArray(attrs.imagenes) ? attrs.imagenes.slice() : [];
    // Sin `url` (contrato studio.md): la url se DERIVA del file_id en la base.
    lista.push({ file_id: f.id, storage_path: f.object_key || null, mime: archivo.type || null, bytes: f.bytes ?? archivo.size ?? null, tipo: tipo || (lista.length ? 'galeria' : 'principal'), orden: lista.length });
    attrs.imagenes = lista;
    const { data, error } = await sb.from('elements').update({ attributes: attrs }).eq('id', id).select('id');
    if (error) throw error;
    if (!Array.isArray(data) || !data.length) throw Object.assign(new Error('La foto no se registró (¿sin permiso editar_marca?).'), { code: 'sin_fila' });
    return elemento(id);
  }

  /** Quita una foto de attributes.imagenes (por file_id o url) y da de baja el archivo si es propio. */
  async function quitarFoto(orgId, id, { file_id = null, url = null } = {}) {
    const sb = await cliente();
    if (!sb || !id) return null;
    const actual = await sb.from('elements').select('attributes').eq('id', id).maybeSingle();
    if (actual.error) throw actual.error;
    const attrs = (actual.data?.attributes && typeof actual.data.attributes === 'object') ? { ...actual.data.attributes } : {};
    attrs.imagenes = (Array.isArray(attrs.imagenes) ? attrs.imagenes : []).filter((im) => !((file_id && im.file_id === file_id) || (url && im.url === url))).map((im, i) => ({ ...im, orden: i }));
    const { error } = await sb.from('elements').update({ attributes: attrs }).eq('id', id);
    if (error) throw error;
    const a = api();
    if (a && file_id && orgId) { try { await a.borrarArchivo(file_id, orgId); } catch (e) { console.warn('[catalogo] baja del archivo:', e?.codigo || e?.message); } }
    return elemento(id);
  }

  /** La foto principal: va primera (orden 0, tipo principal); las demás conservan su orden relativo. */
  async function hacerPrincipal(id, { file_id = null, url = null } = {}) {
    const sb = await cliente();
    if (!sb || !id) return null;
    const actual = await sb.from('elements').select('attributes').eq('id', id).maybeSingle();
    if (actual.error) throw actual.error;
    const attrs = (actual.data?.attributes && typeof actual.data.attributes === 'object') ? { ...actual.data.attributes } : {};
    const lista = Array.isArray(attrs.imagenes) ? attrs.imagenes.slice() : [];
    const es = (im) => (file_id && im.file_id === file_id) || (url && im.url === url);
    const principal = lista.find(es);
    if (!principal) return elemento(id);
    attrs.imagenes = [{ ...principal, tipo: 'principal', orden: 0 }, ...lista.filter((im) => !es(im)).map((im, i) => ({ ...im, tipo: im.tipo === 'principal' ? 'galeria' : (im.tipo || 'galeria'), orden: i + 1 }))];
    const { error } = await sb.from('elements').update({ attributes: attrs }).eq('id', id);
    if (error) throw error;
    return elemento(id);
  }

  /** Variantes de un producto (V public.elements_variants_view), forma product_variants de v1. Solo lectura hoy. */
  async function variantes(elementId) {
    const sb = await cliente();
    if (!sb || !elementId) return [];
    const r = await sb.from('elements_variants_view').select('element_id, organization_id, producto, variant_id, sku, variante, price, currency, compare_price, stock, track_stock, is_default, is_active, opciones, imagen').eq('element_id', elementId);
    aviso('elements_variants_view', r);
    return (r.data || []).map((v) => ({ id: v.variant_id, product_id: v.element_id, organization_id: v.organization_id, variant_name: v.variante, sku: v.sku || null, precio: v.price ?? null, precio_comparacion: v.compare_price ?? null, moneda: v.currency || null, stock_quantity: v.stock ?? null, stock_status: v.track_stock ? (Number(v.stock) > 0 ? 'in_stock' : 'out_of_stock') : 'not_tracked', is_default: v.is_default === true, is_active: v.is_active !== false, opciones: v.opciones || null, imagen_url: v.imagen || null, peso: null, peso_unidad: null }));
  }

  window.CatalogoDatos = Object.freeze({
    KINDS, elementos, elemento, crear, actualizar, archivar, duplicar, subirFoto, quitarFoto, hacerPrincipal, variantes,
    mapeo: Object.freeze({ elementoAV1, aBase, urlsDeImagenes, imagenesDeLaBase }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
