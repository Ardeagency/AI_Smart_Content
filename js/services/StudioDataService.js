/**
 * StudioDataService — el STUDIO (/image, /video) y las PRODUCCIONES sobre la
 * base nueva (aqblperqrcwumiztmjnw) y el borde /v1 (corte ADR-0052).
 *
 * Contrato: Git-AISC-DB docs/contratos/studio.md (8303f5e, medido 16/09 14:00 UTC)
 * y backend/borde-http.md:
 *   · Una producción ES una corrida de flujo: no hay /v1/producir. Dos flujos de
 *     PLATAFORMA (organization_id NULL en flows.catalog_view): `imagen-directa`
 *     (prompt, aspecto, resolucion, referencia_1..3) y `video-directo` (prompt,
 *     aspecto, resolucion, duracion, con_audio, referencia_1..2). El uuid se
 *     resuelve por slug leyendo catalog_view (se cachea por sesión).
 *   · Lanzar SIEMPRE por el borde: POST /v1/flujos/:id/lanzar → {corrida, reintento,
 *     primer_paso}; seguir con GET /v1/corridas/:id?org= (ApiV2.esperarCorrida).
 *     La base reserva, cobra lo medido y libera sola: la consola NO toca créditos.
 *   · Referencias: `referencia_N` = file_id de POST /v1/archivos?proposito=subida
 *     (backend 71fc288: el paso lo firma dentro de la transacción de quien pide).
 *   · Salidas: `salidas[].archivo` = file_id; para VER manda file_id → url_galeria
 *     (GET /v1/archivos, Worker media-v2 + cookie de POST /v1/sesion/galeria, que
 *     ApiV2.mantenerSesionGaleria renueva); `url` solo si file_id es nulo.
 *   · Producciones: V public.salidas (organization_id, tipo, file_id, url, …).
 *   · Contexto de marca para el prompt: markets (brief verbal/visual) +
 *     public.elements_full por kind (product/service/character/scenario); fotos en
 *     attributes.imagenes[] con file_id (tras 20260916120000) o url de respaldo.
 *   · system_ai_outputs (prompts sugeridos / historial standalone de v1): NO existe.
 *
 * Regla del corte: ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  const SLUGS = Object.freeze({ imagen: 'imagen-directa', video: 'video-directo' });

  /* ── Mapeos puros (test/studio-datos.test.js) ─────────────────────────── */

  /** attributes.imagenes[] → URLs para pintar (file_id → galería; si no, url). */
  function urlsDeImagenes(imagenes, urlPorArchivo = {}) {
    return (Array.isArray(imagenes) ? imagenes : [])
      .slice().sort((a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0))
      .map((im) => (im?.file_id && urlPorArchivo[im.file_id]) || im?.url || null)
      .filter(Boolean);
  }

  /** elements_full → el contexto de marca con los nombres que ImageView/VideoView ya leen. */
  function contextoAV1(mercado, elementos, urlPorArchivo = {}) {
    const por = (kind) => (elementos || []).filter((e) => e.kind === kind && !e.archived_at);
    const brand = mercado ? {
      id: mercado.id, nombre_marca: mercado.name,
      nicho_core: mercado.core_niche || '', sub_nichos: mercado.sub_niches || [], arquetipo: mercado.archetype || null,
      propuesta_valor: mercado.value_proposition || null, mision_vision: mercado.mission_vision || null,
      verbal_dna: mercado.verbal_dna || {}, visual_dna: mercado.visual_dna || {},
      palabras_clave: mercado.keywords || [], palabras_prohibidas: mercado.banned_words || [],
      objetivos_estrategicos: mercado.strategic_goals || [], creative_brief: mercado.creative_brief || null,
      idiomas_contenido: mercado.languages || [], mercado_objetivo: mercado.countries || [],
    } : null;
    return {
      brand,
      brandProfiles: brand?.creative_brief ? [{ section: 'creative_brief', content: brand.creative_brief }] : [],
      products: por('product').map((e) => ({ id: e.id, entity_id: e.id, nombre_producto: e.name, descripcion: e.description || e.summary || null, detail: e.detail || null, image_urls: urlsDeImagenes(e.attributes?.imagenes, urlPorArchivo).slice(0, 4) })),
      services: por('service').map((e) => ({ id: e.id, entity_id: e.id, nombre_servicio: e.name, descripcion: e.description || e.summary || null, detail: e.detail || null })),
      entities: [...por('identity'), ...por('character'), ...por('scenario')].map((e) => ({ id: e.id, name: e.name, entity_type: e.kind === 'scenario' ? 'place' : e.kind, description: e.description || e.summary || null, image_urls: urlsDeImagenes(e.attributes?.imagenes, urlPorArchivo).slice(0, 4) })),
      // Audiencias y campañas del Studio de v1 eran conceptos; las reales viven en marketing.* (D3).
      audiences: [],
      campaigns: [],
    };
  }

  /** public.salidas → la producción como la pintan los carruseles de v1 (media_url, isImage, isVideo). */
  function salidaAV1(fila, urlPorArchivo = {}) {
    const media_url = (fila.file_id && urlPorArchivo[fila.file_id]) || (fila.file_id ? null : fila.url) || fila.url || null;
    const tipo = String(fila.tipo || '').toLowerCase();
    return {
      id: fila.output_id,
      run_id: fila.run_id,
      flow_id: fila.flow_id,
      flujo: fila.flujo || null,
      output_type: tipo,
      storage_path: fila.storage_path || null,
      file_id: fila.file_id || null,
      media_url,
      mime_type: fila.mime_type || null,
      width: fila.width ?? null, height: fila.height ?? null, duration_ms: fila.duration_ms ?? null,
      isVideo: tipo === 'video',
      isImage: tipo === 'image',
      estado: fila.estado_corrida || null,
      creditos: fila.creditos_aprox ?? null,
      created_at: fila.created_at,
      metadata: { image_url: tipo === 'image' ? media_url : null, video_url: tipo === 'video' ? media_url : null },
    };
  }

  /** Lo que ImageView arma → las entradas de `imagen-directa` (referencias = file_id). */
  function entradasImagen(p) {
    const refs = (p.referencias || []).filter(Boolean).slice(0, 3);
    const e = { prompt: String(p.prompt || '').trim(), aspecto: p.aspect_ratio || p.aspecto || '1:1', resolucion: p.resolution || p.resolucion || '2K' };
    refs.forEach((r, i) => { e[`referencia_${i + 1}`] = r; });
    return e;
  }

  /** Lo que VideoView arma → las entradas de `video-directo`. */
  function entradasVideo(p) {
    const refs = (p.referencias || []).filter(Boolean).slice(0, 2);
    const e = {
      prompt: String(p.prompt || '').trim(), aspecto: p.aspect_ratio || p.aspecto || '16:9', resolucion: p.resolution || p.resolucion || '1080p',
      duracion: Number(p.duration || p.duracion) || 5, con_audio: p.con_audio === true || p.with_audio === true,
    };
    refs.forEach((r, i) => { e[`referencia_${i + 1}`] = r; });
    return e;
  }

  /** La salida principal de una corrida terminada → {url, file_id, mime}. */
  function salidaPrincipal(corrida) {
    const s = Array.isArray(corrida?.salidas) ? corrida.salidas : [];
    const p = s.find((x) => x.principal === true) || s.find((x) => x.url || x.archivo || x.metadata?.file_id) || null;
    if (!p) return null;
    return { url: p.url || null, file_id: p.archivo || p.metadata?.file_id || null, mime: p.mime || null, clave: p.clave || p.key || null };
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function api() { return (typeof window !== 'undefined' && window.apiV2?.api) || null; }
  const conCode = (e) => { if (e && e.codigo && !e.code) e.code = e.codigo; return e; };
  function aviso(nombre, r) { if (r?.error) console.warn(`[studio] ${nombre}:`, r.error.code, r.error.message); }

  const flujosPorSlug = new Map();
  /** uuid de un flujo del catálogo por slug (los del Studio son comunes: organization_id NULL). */
  async function flujo(slug) {
    if (flujosPorSlug.has(slug)) return flujosPorSlug.get(slug);
    const sb = await cliente();
    if (!sb) return null;
    const r = await sb.schema('flows').from('catalog_view').select('id, slug, name, kind, pricing_mode, fixed_credits, organization_id').eq('slug', slug).eq('status', 'published').limit(1).maybeSingle();
    aviso(`catalog_view ${slug}`, r);
    if (r.data) flujosPorSlug.set(slug, r.data);
    return r.data || null;
  }

  /** file_id → url para pintar (url_publica si es público, si no url_galeria). Sin borde = {}. */
  async function urlsDeArchivos(orgId) {
    const a = api();
    if (!a || !orgId) return {};
    try {
      const r = await a.archivos(orgId);
      return Object.fromEntries((r?.archivos || []).filter((f) => f?.id && (f.url_publica || f.url_galeria)).map((f) => [f.id, f.url_publica || f.url_galeria]));
    } catch (e) {
      if (e?.codigo !== 'sin_api') console.warn('[studio] archivos del borde:', e?.codigo || e?.message || e);
      return {};
    }
  }

  /** Contexto de marca para armar el prompt: mercado (o el principal) + elementos. */
  async function contexto(orgId, marketId = null) {
    const sb = await cliente();
    if (!sb || !orgId) return contextoAV1(null, []);
    let q = sb.from('markets').select('id, name, countries, languages, core_niche, sub_niches, archetype, value_proposition, mission_vision, keywords, banned_words, strategic_goals, creative_brief, verbal_dna, visual_dna, is_primary').eq('organization_id', orgId).is('archived_at', null);
    q = marketId ? q.eq('id', marketId) : q.order('is_primary', { ascending: false }).order('created_at', { ascending: true });
    const [m, el, urls] = await Promise.all([
      q.limit(1).maybeSingle(),
      sb.from('elements_full').select('id, kind, name, summary, description, is_featured, attributes, detail, archived_at').eq('organization_id', orgId).is('archived_at', null).order('is_featured', { ascending: false }).order('created_at', { ascending: false }).limit(200),
      urlsDeArchivos(orgId),
    ]);
    aviso('markets', m); aviso('elements_full', el);
    return contextoAV1(m.data, el.data || [], urls);
  }

  /** Producciones de la marca por tipo (image | video | null = todas), con URL para pintar. */
  async function producciones(orgId, tipo = null, limite = 100) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    let q = sb.from('salidas').select('output_id, run_id, flow_id, flujo, clave, tipo, es_principal, url, storage_path, file_id, mime_type, bytes, width, height, duration_ms, creditos_aprox, estado_corrida, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(limite);
    if (tipo) q = q.eq('tipo', tipo);
    const [r, urls] = await Promise.all([q, urlsDeArchivos(orgId)]);
    aviso('salidas', r);
    return (r.data || []).map((f) => salidaAV1(f, urls)).filter((s) => s.media_url);
  }

  /** Sube una referencia por el borde. Devuelve {file_id, url} (url = galería/pública si el borde la da). */
  async function subirReferencia(orgId, archivo) {
    const a = api();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL): no se pueden subir referencias.'), { code: 'sin_api' });
    let r;
    try { r = await a.subirArchivo(orgId, archivo, 'subida'); } catch (e) { throw conCode(e); }
    const f = r?.archivo;
    if (!f?.id) throw Object.assign(new Error('El borde no devolvió el archivo subido.'), { code: 'sin_archivo' });
    let url = f.url_publica || f.url_galeria || null;
    if (!url) { const urls = await urlsDeArchivos(orgId); url = urls[f.id] || null; }
    return { file_id: f.id, url, bytes: f.bytes ?? archivo.size ?? null, object_key: f.object_key || null };
  }

  /**
   * Produce: lanza el flujo del Studio y espera la corrida. `alCambiar(corrida)`
   * recibe cada sondeo (estado, pasos). Devuelve {corrida, salida:{url,file_id,mime}}.
   * Errores con palabras: sin_api, flujo_no_encontrado, sin_saldo (402), 409 no_se_pudo_lanzar
   * con el motivo de la base, entrada_invalida (422), fallo (paso failed con su error).
   */
  async function producir(orgId, tipo, entradas, { alCambiar = null, idCliente = null, marketId = null, topeMs = 6 * 60 * 1000 } = {}) {
    const a = api();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL): el Studio aún no produce aquí.'), { code: 'sin_api' });
    const slug = SLUGS[tipo] || tipo;
    const f = await flujo(slug);
    if (!f?.id) throw Object.assign(new Error(`El flujo «${slug}» no está en el catálogo.`), { code: 'flujo_no_encontrado' });
    let lanzada;
    try { lanzada = await a.lanzarFlujo(f.id, orgId, entradas, idCliente || undefined, marketId || undefined); } catch (e) { throw conCode(e); }
    const runId = lanzada?.run_id || lanzada?.corrida;
    if (!runId) throw Object.assign(new Error('El borde no devolvió la corrida.'), { code: 'sin_corrida' });
    let corrida;
    try { corrida = await a.esperarCorrida(runId, orgId, { topeMs, alCambiar }); } catch (e) { throw conCode(e); }
    if (corrida.status === 'failed' || corrida.status === 'cancelled' || corrida.status === 'canceled') {
      throw Object.assign(new Error(corrida.error || 'La producción falló.'), { code: 'fallo', corrida });
    }
    let salida = salidaPrincipal(corrida);
    if (salida && !salida.url && salida.file_id) {
      const urls = await urlsDeArchivos(orgId);
      salida.url = urls[salida.file_id] || null;
      if (!salida.url) { try { const d = await a.urlDescarga(salida.file_id, orgId); salida.url = d?.url || null; } catch (_) { /* se pinta sin url */ } }
    }
    return { corrida, salida, run_id: runId, flujo: f };
  }

  /** Cookie de galería viva mientras el Studio está abierto (devuelve la función para pararla). */
  function mantenerGaleria(orgId) {
    const a = api();
    if (!a || !orgId || typeof a.mantenerSesionGaleria !== 'function') return () => {};
    const m = a.mantenerSesionGaleria(orgId, { alFallar: (e) => { if (e?.codigo !== 'sin_api') console.warn('[studio] sesión de galería:', e?.codigo || e?.message); } });
    return () => m.parar();
  }

  window.StudioDatos = Object.freeze({
    SLUGS, flujo, contexto, producciones, subirReferencia, producir, mantenerGaleria, urlsDeArchivos,
    mapeo: Object.freeze({ urlsDeImagenes, contextoAV1, salidaAV1, entradasImagen, entradasVideo, salidaPrincipal }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
