/**
 * TableroDataService — el TABLERO (/dashboard) sobre la base nueva (corte ADR-0052).
 * Única puerta a la base para TableroView.
 *
 * Contrato: Git-AISC-DB docs/contratos/competencia.md (dcc7d8c) — los 60 `dashboard_*`
 * de v1 NO existen: «el Tablero agregado se compone en la consola con estas vistas»:
 *   · Lo que Vera opina: T marketing.readings(kind observation|diagnosis|recommendation|
 *     retrospective, title, body, evidence, confidence, period_start, period_end, acted_on,
 *     acted_note, acted_by, acted_at, created_at). Actuar = PATCH acted_on/acted_note
 *     (el trigger encola `estrategia.producir` solo con persona). La forma VIVA (BD 16/09
 *     16:20): `body` = PROSA (estrategia.proponer exige texto 20–6.000) y `evidence` = datos
 *     (jsonb). Las 72 lecturas heredadas de v1 traían los bloques tipados como JSON en el
 *     body; la 210000 (BD 0c327f6) las normaliza: `evidence.lectura_v1=true`, `evidence.cards[]`
 *     (68) o `evidence.bloques[]` (4), body = headline o «título — lectura de v1 (periodo)».
 *     Hasta entonces se tolera el JSON-como-texto (con o sin « · » delante).
 *   · Tendencias: V intel.tendencias_vivas (190000, SIN aplicar → PGRST205) con respaldo
 *     T intel.trends (is_active); serie por T intel.trend_readings.
 *   · Huecos: T intel.content_gaps(phrase, kind, demand_score, coverage_score, gap_score,
 *     angle, demand_terms, addressed_at).
 *   · Competencia: T social.profiles source=competitor · T intel.signals (kind, severity).
 *   · Leer intel.* y social.* = permiso `ver_contenido`; PostgREST corta en 1.000 filas.
 *
 * Regla del corte: ningún `.from()` fuera de js/services.
 */
(function () {
  'use strict';

  /* ── Mapeos puros (test/tablero-datos.test.js) ──────────────────────────── */

  /** El body de una lectura → bloques tipados (v1: insight, stat_tile, recommended_move…). */
  function bloquesDesde(body) {
    if (Array.isArray(body)) return body.filter((b) => b && typeof b === 'object');
    if (body && typeof body === 'object') return bloquesDesde(body.reading?.narrative || body.narrative || body.reading?.cards || body.cards || []);
    const texto = String(body || '').replace(/^[\s·•\-–—]+/, '').trim();
    if (!texto) return [];
    if (texto[0] === '[' || texto[0] === '{') {
      try { return bloquesDesde(JSON.parse(texto)); } catch (_) { /* texto plano con corchete */ }
    }
    return [{ type: 'texto', body: texto }];
  }

  function evidenciaDesde(evidence) {
    if (!evidence) return {};
    if (typeof evidence === 'object') return Array.isArray(evidence) ? {} : evidence;
    try { const e = JSON.parse(evidence); return e && typeof e === 'object' && !Array.isArray(e) ? e : {}; } catch (_) { return {}; }
  }

  /** ¿El body es JSON heredado (bloques v1) o prosa? */
  function esJsonHeredado(body) {
    const t = String(body || '').replace(/^[\s·•\-–—]+/, '').trim();
    if (!t || (t[0] !== '[' && t[0] !== '{')) return false;
    try { const j = JSON.parse(t); return typeof j === 'object' && j !== null; } catch (_) { return false; }
  }

  /** marketing.readings → la lectura que pinta el Tablero: prosa + bloques v1 (de evidence o del body heredado). */
  function lecturaAV1(fila) {
    const evidence = evidenciaDesde(fila.evidence);
    const heredado = esJsonHeredado(fila.body);
    const bloques = Array.isArray(evidence.bloques) ? bloquesDesde(evidence.bloques)
      : Array.isArray(evidence.cards) ? bloquesDesde(evidence.cards)
      : heredado ? bloquesDesde(fila.body) : [];
    const prosa = heredado ? '' : String(fila.body || '').trim();
    return {
      id: fila.id,
      kind: fila.kind,
      headline: fila.title || '',
      prosa,
      de_v1: heredado || evidence.lectura_v1 === true || Array.isArray(evidence.bloques) || Array.isArray(evidence.cards),
      bloques,
      tiles: bloques.filter((b) => b.type === 'stat_tile'),
      movidas: bloques.filter((b) => b.type === 'recommended_move'),
      vigilancias: bloques.filter((b) => b.type === 'watchlist_item'),
      porque: bloques.filter((b) => !['stat_tile', 'recommended_move', 'watchlist_item'].includes(b.type)),
      evidence,
      // La 210000 deja el original v1 (reading/card) en evidence: no es dato de apoyo, es archivo.
      datos: Object.fromEntries(Object.entries(evidence).filter(([k]) => !['bloques', 'cards', 'card', 'reading', 'lectura_v1'].includes(k))),
      confidence: fila.confidence ?? null,
      period_start: fila.period_start || null,
      period_end: fila.period_end || null,
      acted_on: fila.acted_on === true,
      acted_note: fila.acted_note || null,
      acted_at: fila.acted_at || null,
      campaign_id: fila.campaign_id || null,
      created_at: fila.created_at,
    };
  }

  const FUENTE = Object.freeze({ instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', google_trends: 'Google Trends', llm_research: 'Investigación', url_watch: 'Web vigilada', serpapi: 'Búsquedas', x: 'X', youtube: 'YouTube' });

  /** intel.tendencias_vivas (o intel.trends) → tendencia para pintar. */
  function tendenciaAV1(fila) {
    const velocidad = fila.velocidad_ultima ?? fila.velocity ?? null;
    const volumen = fila.volumen_ultimo ?? fila.volume ?? null;
    return {
      id: fila.id,
      keyword: fila.keyword,
      source: fila.source || null,
      fuente: FUENTE[fila.source] || fila.source || '',
      category: fila.category || null,
      horizon: fila.horizon || null,
      velocity: velocidad != null ? Number(velocidad) : null,
      volume: volumen != null ? Number(volumen) : null,
      relevance: fila.relevance != null ? Number(fila.relevance) : null,
      rank: fila.puesto_ultimo ?? null,
      lecturas: Number(fila.lecturas) || 0,
      first_seen_at: fila.first_seen_at || null,
      last_seen_at: fila.ultima_lectura || fila.last_seen_at || null,
      peaked_at: fila.peaked_at || null,
      es_candidata: fila.metadata?.candidato === true,
    };
  }

  function huecoAV1(fila) {
    return {
      id: fila.id, phrase: fila.phrase, kind: fila.kind || null,
      demand_score: Number(fila.demand_score) || 0, coverage_score: Number(fila.coverage_score) || 0, gap_score: Number(fila.gap_score) || 0,
      angle: fila.angle || null, demand_terms: Array.isArray(fila.demand_terms) ? fila.demand_terms : [], addressed_at: fila.addressed_at || null, detected_at: fila.detected_at || null,
    };
  }

  /** intel.signals → señal; el body heredado de v1 puede ser JSON-como-texto {url, label, excerpt}: se saca el texto. */
  function senalAV1(fila) {
    let body = fila.body || ''; let url = fila.source_url || null;
    const t = String(body).trim();
    if (t[0] === '{') { try { const j = JSON.parse(t); body = j.excerpt || j.text || j.body || j.label || ''; url = url || j.url || null; } catch (_) { /* texto plano */ } }
    return { id: fila.id, kind: fila.kind, severity: fila.severity || 'info', title: fila.title || '', body, source: fila.source || null, source_url: url, observed_at: fila.observed_at || null, competitor_profile_id: fila.competitor_profile_id || null };
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  function aviso(nombre, r) { if (r?.error) console.warn(`[tablero] ${nombre}:`, r.error.code, r.error.message); }
  const SEL_LECTURA = 'id, kind, title, body, evidence, confidence, period_start, period_end, acted_on, acted_note, acted_by, acted_at, campaign_id, created_at';

  /** Lecturas de Vera, las más recientes primero (kinds: diagnosis, recommendation, observation, retrospective). */
  async function lecturas(orgId, { kinds = ['diagnosis', 'recommendation'], limite = 12 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await sb.schema('marketing').from('readings').select(SEL_LECTURA).eq('organization_id', orgId).in('kind', kinds).order('created_at', { ascending: false }).limit(limite);
    aviso('marketing.readings', r);
    return (r.data || []).map(lecturaAV1);
  }

  /** «Lo hice»: marca la lectura como atendida (solo acted_on/acted_note/acted_at: el grant es por columna). */
  async function actuar(id, nota = null) {
    const sb = await cliente();
    if (!sb || !id) return null;
    const { data, error } = await sb.schema('marketing').from('readings').update({ acted_on: true, acted_note: nota || null, acted_at: new Date().toISOString() }).eq('id', id).select(SEL_LECTURA).maybeSingle();
    if (error) throw error;
    return data ? lecturaAV1(data) : null;
  }

  /** Tendencias vivas: la vista de la 190000 si existe; si no, intel.trends activas. */
  async function tendencias(orgId, { limite = 40 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return { lista: [], fuente: 'ninguna' };
    const v = await sb.schema('intel').from('tendencias_vivas').select('id, market_id, keyword, source, category, horizon, velocity, volume, relevance, first_seen_at, last_seen_at, peaked_at, metadata, ultima_lectura, velocidad_ultima, volumen_ultimo, puesto_ultimo, lecturas').eq('organization_id', orgId).order('relevance', { ascending: false, nullsFirst: false }).limit(limite);
    if (!v.error) return { lista: (v.data || []).map(tendenciaAV1), fuente: 'tendencias_vivas' };
    if (v.error.code !== 'PGRST205' && v.error.code !== '42P01') aviso('intel.tendencias_vivas', v);
    const t = await sb.schema('intel').from('trends').select('id, market_id, keyword, source, category, horizon, velocity, volume, relevance, first_seen_at, last_seen_at, peaked_at, metadata').eq('organization_id', orgId).eq('is_active', true).order('relevance', { ascending: false, nullsFirst: false }).limit(limite);
    aviso('intel.trends', t);
    return { lista: (t.data || []).map(tendenciaAV1), fuente: 'trends' };
  }

  /** Serie de una tendencia (date, velocity, volume, rank). */
  async function serie(trendId) {
    const sb = await cliente();
    if (!sb || !trendId) return [];
    const r = await sb.schema('intel').from('trend_readings').select('date, velocity, volume, rank, captured_at').eq('trend_id', trendId).order('date', { ascending: true }).limit(400);
    aviso('intel.trend_readings', r);
    return r.data || [];
  }

  /** Huecos de contenido sin atender, por gap_score. */
  async function huecos(orgId, { limite = 12 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await sb.schema('intel').from('content_gaps').select('id, phrase, kind, demand_score, coverage_score, gap_score, angle, demand_terms, addressed_at, detected_at').eq('organization_id', orgId).is('addressed_at', null).order('gap_score', { ascending: false, nullsFirst: false }).limit(limite);
    aviso('intel.content_gaps', r);
    return (r.data || []).map(huecoAV1);
  }

  /** Competencia de un vistazo: rivales vigilados y últimas señales. */
  async function competencia(orgId, { limite = 8 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return { rivales: 0, propios: 0, senales: [] };
    const [p, s] = await Promise.all([
      sb.schema('social').from('profiles').select('id, source').eq('organization_id', orgId).eq('is_active', true),
      sb.schema('intel').from('signals').select('id, kind, severity, title, body, source, source_url, observed_at, competitor_profile_id').eq('organization_id', orgId).order('observed_at', { ascending: false }).limit(limite),
    ]);
    aviso('social.profiles', p); aviso('intel.signals', s);
    const perfiles = p.data || [];
    return { rivales: perfiles.filter((x) => x.source === 'competitor').length, propios: perfiles.filter((x) => x.source === 'own').length, senales: (s.data || []).map(senalAV1) };
  }

  /** Todo el Tablero de una: cada bloque falla solo (el error no tumba el resto). */
  async function resumen(orgId) {
    const seguro = (p, vacio) => p.catch((e) => { console.warn('[tablero] bloque:', e?.code || e?.message); return vacio; });
    const [lec, obs, ten, hue, comp] = await Promise.all([
      seguro(lecturas(orgId), []),
      seguro(lecturas(orgId, { kinds: ['observation', 'retrospective'], limite: 3 }), []),
      seguro(tendencias(orgId), { lista: [], fuente: 'ninguna' }),
      seguro(huecos(orgId), []),
      seguro(competencia(orgId), { rivales: 0, propios: 0, senales: [] }),
    ]);
    return { lecturas: lec, observaciones: obs, tendencias: ten.lista, tendenciasFuente: ten.fuente, huecos: hue, competencia: comp };
  }

  window.TableroDatos = Object.freeze({
    lecturas, actuar, tendencias, serie, huecos, competencia, resumen,
    mapeo: Object.freeze({ bloquesDesde, evidenciaDesde, esJsonHeredado, lecturaAV1, tendenciaAV1, huecoAV1, senalAV1, FUENTE }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
