/**
 * ProduccionesDataService — PRODUCCIONES (/production, motor js/living.js) sobre
 * la base nueva (corte ADR-0052). Única puerta a la base para LivingManager.
 *
 * Contrato: Git-AISC-DB docs/contratos/studio.md (8303f5e):
 *   · Corridas: T flows.runs(id, organization_id, flow_id, market_id, version_id,
 *     user_id, agent_id, status, error, credits_charged, started_at, finished_at,
 *     created_at) — estados queued, running, awaiting_approval, succeeded, failed,
 *     cancelled. El nombre del flujo sale de flows.vista_org (nombre por flow_id).
 *   · Salidas: V public.salidas(output_id, run_id, flow_id, flujo, clave, tipo,
 *     es_principal, url, storage_path, file_id, mime_type, bytes, width, height,
 *     duration_ms, creditos_aprox, estado_corrida, created_at) — manda file_id →
 *     url_galeria/url_publica (StudioDatos.urlsDeArchivos); `url` solo sin archivo.
 *   · Entradas: T flows.run_inputs(id, run_id, key, value) — lo que se pidió.
 *   · Likes/guardados de v1 (production_output_likes) NO existen para salidas:
 *     flows.likes/saves son por FLUJO. Borrar una salida no tiene puerta; se da
 *     de baja el ARCHIVO por DELETE /v1/archivos/:id (editar_marca).
 *
 * Devuelve las filas con la FORMA de v1 (flow_runs / runs_outputs / runs_inputs)
 * para que living.js pinte igual. Regla del corte: ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  /* ── Mapeos puros (test/producciones-datos.test.js) ─────────────────────── */

  function corridaAV1(fila, nombresPorFlujo = {}) {
    return {
      id: fila.id,
      organization_id: fila.organization_id,
      brand_id: fila.market_id || null,
      flow_id: fila.flow_id,
      user_id: fila.user_id || null,
      agent_id: fila.agent_id || null,
      status: fila.status,
      error: fila.error || null,
      credits_charged: fila.credits_charged ?? null,
      started_at: fila.started_at || null,
      finished_at: fila.finished_at || null,
      created_at: fila.created_at,
      content_flows: { name: nombresPorFlujo[fila.flow_id] || null },
      campaigns: null,
      audience_personas: null,
    };
  }

  /** public.salidas → runs_outputs de v1 (storage_path = URL para pintar; file_id para el borde). */
  function salidaAV1(fila, urlPorArchivo = {}, entradasPorCorrida = {}) {
    const url = (fila.file_id && urlPorArchivo[fila.file_id]) || fila.url || null;
    const tipo = String(fila.tipo || 'file').toLowerCase();
    const entradas = entradasPorCorrida[fila.run_id] || {};
    return {
      id: fila.output_id,
      run_id: fila.run_id,
      flow_id: fila.flow_id,
      output_type: tipo,
      storage_path: url,
      storage_object_id: null,
      file_id: fila.file_id || null,
      file_url: url,
      prompt_used: entradas.prompt || null,
      generated_copy: null,
      text_content: null,
      metadata: { clave: fila.clave, mime: fila.mime_type, bytes: fila.bytes, width: fila.width, height: fila.height, duration_ms: fila.duration_ms, creditos: fila.creditos_aprox, estado_corrida: fila.estado_corrida, flujo: fila.flujo, es_principal: fila.es_principal === true, image_url: tipo === 'image' ? url : null, video_url: tipo === 'video' ? url : null },
      technical_params: { aspecto: entradas.aspecto || null, resolucion: entradas.resolucion || null, duracion: entradas.duracion || null },
      created_at: fila.created_at,
      generated_hashtags: null,
      creative_rationale: null,
      models: null,
      reference_image_url: entradas.referencia_1 || null,
      entity_id: null,
    };
  }

  function entradaAV1(fila) {
    return { id: fila.id, run_id: fila.run_id, input_key: fila.key, key: fila.key, value: fila.value, created_at: fila.created_at };
  }

  /** run_inputs → {run_id: {key: valor}} (valor jsonb: string o {…}). */
  function entradasPorCorrida(filas) {
    const por = {};
    (filas || []).forEach((f) => { (por[f.run_id] ||= {})[f.key] = (f.value && typeof f.value === 'object' && 'value' in f.value) ? f.value.value : f.value; });
    return por;
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function api() { return (typeof window !== 'undefined' && window.apiV2?.api) || null; }
  function aviso(nombre, r) { if (r?.error) console.warn(`[producciones] ${nombre}:`, r.error.code, r.error.message); }

  let nombresCache = {};
  async function nombresDeFlujos(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return nombresCache;
    const r = await sb.schema('flows').from('vista_org').select('flow_id, nombre, slug, tipo').eq('organization_id', orgId);
    aviso('flows.vista_org', r);
    (r.data || []).forEach((f) => { nombresCache[f.flow_id] = f.nombre || f.slug; });
    // Los flujos comunes (imagen-directa, video-directo) no salen en vista_org hasta la primera corrida.
    const c = await sb.schema('flows').from('catalog_view').select('id, name, slug').is('organization_id', null);
    (c.data || []).forEach((f) => { if (!nombresCache[f.id]) nombresCache[f.id] = f.name || f.slug; });
    return nombresCache;
  }

  /** Corridas de la marca, paginadas (desde = offset). Forma flow_runs de v1. */
  async function corridas(orgId, { desde = 0, limite = 20 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const [r, nombres] = await Promise.all([
      sb.schema('flows').from('runs').select('id, organization_id, flow_id, market_id, version_id, user_id, agent_id, status, error, credits_charged, started_at, finished_at, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).range(desde, desde + limite - 1),
      nombresDeFlujos(orgId),
    ]);
    aviso('flows.runs', r);
    return (r.data || []).map((f) => corridaAV1(f, nombres));
  }

  /** Salidas de unas corridas (o de toda la marca si runIds está vacío). Forma runs_outputs de v1. */
  async function salidas(orgId, runIds = [], { limite = 200 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    let q = sb.from('salidas').select('output_id, run_id, flow_id, flujo, clave, tipo, es_principal, url, storage_path, file_id, mime_type, bytes, width, height, duration_ms, creditos_aprox, estado_corrida, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(limite);
    if (Array.isArray(runIds) && runIds.length) q = q.in('run_id', runIds);
    const ids = Array.isArray(runIds) && runIds.length ? runIds : null;
    const [r, urls, ent] = await Promise.all([
      q,
      window.StudioDatos ? window.StudioDatos.urlsDeArchivos(orgId) : Promise.resolve({}),
      ids ? sb.schema('flows').from('run_inputs').select('id, run_id, key, value, created_at').in('run_id', ids) : Promise.resolve({ data: [] }),
    ]);
    aviso('salidas', r); aviso('flows.run_inputs', ent);
    const porCorrida = entradasPorCorrida(ent.data || []);
    return (r.data || []).map((f) => salidaAV1(f, urls, porCorrida));
  }

  /** Entradas (lo que se pidió) de unas corridas. Forma runs_inputs de v1. */
  async function entradas(orgId, runIds = []) {
    const sb = await cliente();
    if (!sb || !orgId || !runIds.length) return [];
    const r = await sb.schema('flows').from('run_inputs').select('id, run_id, key, value, created_at').in('run_id', runIds);
    aviso('flows.run_inputs', r);
    return (r.data || []).map(entradaAV1);
  }

  /** Dar de baja el archivo de una salida por el borde. Sin file_id no hay qué borrar. */
  async function borrarArchivoDeSalida(orgId, salidaV1) {
    const a = api();
    if (!a) throw Object.assign(new Error('El borde no está configurado (AISC_API_URL).'), { code: 'sin_api' });
    if (!salidaV1?.file_id) throw Object.assign(new Error('Esta producción no tiene archivo propio que borrar.'), { code: 'sin_archivo' });
    try { await a.borrarArchivo(salidaV1.file_id, orgId); } catch (e) { if (e?.codigo) e.code = e.codigo; throw e; }
    return true;
  }

  window.ProduccionesDatos = Object.freeze({
    corridas, salidas, entradas, borrarArchivoDeSalida, nombresDeFlujos,
    mapeo: Object.freeze({ corridaAV1, salidaAV1, entradaAV1, entradasPorCorrida }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
