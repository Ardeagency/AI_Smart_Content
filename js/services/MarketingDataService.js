/**
 * MarketingDataService — el LIENZO de Marketing (/command-center, antes «Command Center»)
 * sobre la base nueva (corte ADR-0052). Única puerta a la base para MarketingView y su
 * lienzo (js/views/marketing/Lienzo.js): ninguno de los dos llama `.from()`.
 *
 * Equivalencias con v1 (medidas en la base viva aqblperqrcwumiztmjnw el 25/09):
 *   · canvas_strategies            → T marketing.boards(id, organization_id, market_id, campaign_id,
 *                                    name, description, viewport jsonb, created_by…). Una «estrategia»
 *                                    de v1 = un tablero; `viewport` = {x, y, escala}.
 *   · canvas_node_placements,
 *     canvas_stickies, canvas_groups → T marketing.board_nodes(kind, <kind>_id, label, body, x, y,
 *                                    width, height, style, parent_id). CHECK un_solo_sujeto: note y
 *                                    group sin sujeto; el resto con EXACTAMENTE su columna. Leer = V
 *                                    marketing.board_view (title/subtitle ya resueltos por la base).
 *                                    El nodo cae solo (ON DELETE CASCADE) si se borra su sujeto.
 *   · canvas_edges                 → T marketing.board_edges(from_node_id, to_node_id, label, style).
 *                                    Única (from,to); no reflexiva; el trigger valida mismo tablero.
 *   · audience_personas            → T marketing.audiences (pains/desires/objections/buying_triggers
 *                                    text[]; target_age_min/max 13–100; awareness_level enum).
 *   · campaigns (+ persona_id)     → T marketing.campaigns / V campaigns_view. NO hay persona_id: el
 *                                    vínculo audiencia↔campaña es T marketing.campaign_audiences
 *                                    (PK campaign_id+audience_id, una sola is_primary por campaña).
 *                                    En el lienzo ese vínculo se DIBUJA como arista (derivada), no
 *                                    se guarda dos veces en board_edges.
 *   · campaign_adsets / campaign_ads → T marketing.ad_sets / ads, colgados de marketing.deliveries
 *                                    (external_id NOT NULL: son el espejo de la plataforma, no
 *                                    plantillas). Aquí solo se LEEN.
 *   · ad_insights_daily            → V marketing.performance (solo lectura). El GASTO de la campaña
 *                                    viene ya sumado en campaigns_view.gastado + gastado_moneda
 *                                    (migración 20260925160000): gastado NULL = mezcla monedas.
 *   · Realtime: marketing.boards, board_nodes y board_edges están en la publicación (con RLS);
 *                                    escuchar() suscribe el lienzo abierto y avisa de cada cambio.
 *   · products/services/brand_*    → public.elements_full por kind, vía window.CatalogoDatos.
 * Permisos (RLS): leer = `ver_campanas`; escribir tablero/nodos/aristas/audiencias/campañas/vínculos
 * = `editar_campanas`; ad_sets/ads/deliveries escribir = `gestionar_pauta` (aquí no se escriben).
 * FALTAN en la base: audience_segments, store_optimizations, campaign_brief_entities, presupuesto de
 * marketing por mercado, y rutas del borde para publicar en redes o pedir un informe con Claude.
 */
(function () {
  'use strict';

  /* ── Enums de la base (pg_enum, 25/09) ─────────────────────────────────── */
  const OBJETIVOS = Object.freeze(['awareness', 'traffic', 'engagement', 'leads', 'sales', 'retention', 'launch']);
  const ESTADOS_CAMPANA = Object.freeze(['draft', 'planned', 'active', 'paused', 'finished', 'cancelled']);
  const NARRATIVAS = Object.freeze(['brand_awareness', 'product_launch', 'lifestyle_storytelling', 'testimonial', 'reactivation', 'sale_promo', 'educational', 'seasonal_moment', 'behind_the_scenes']);
  const CONCIENCIA = Object.freeze(['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware']);
  const TIPOS_NODO = Object.freeze(['plan', 'campaign', 'brief', 'audience', 'key_message', 'conversion', 'creative', 'script', 'element', 'flow', 'delivery', 'note', 'group', 'publication', 'reading']);
  /** kind del nodo → columna del sujeto (CHECK board_nodes_sujeto_del_tipo_correcto). */
  const COLUMNA_SUJETO = Object.freeze({ plan: 'plan_id', campaign: 'campaign_id', brief: 'brief_id', audience: 'audience_id', key_message: 'key_message_id', conversion: 'conversion_id', creative: 'creative_id', script: 'script_id', element: 'element_id', flow: 'flow_id', delivery: 'delivery_id' });
  const SIN_SUJETO = Object.freeze(['note', 'group']);
  const ESCALA_MIN = 0.3;
  const ESCALA_MAX = 2;
  /** Columnas del lienzo (v1: audiencias a la izquierda, campañas a la derecha). */
  const COLUMNAS = Object.freeze({ element: -380, audience: 40, campaign: 460, otro: 880 });
  const ALTO_FILA = 170;
  const ARRIBA = 40;

  /* ── Mapeos puros (test/marketing-datos.test.js) ────────────────────────── */

  const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const texto = (v) => (v == null ? '' : String(v));
  const lista = (v) => (Array.isArray(v) ? v.map((x) => String(x == null ? '' : x).trim()).filter(Boolean) : []);

  /** boards.viewport → {x, y, escala} con la escala dentro del rango del lienzo. */
  function viewportDesde(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const escala = num(o.escala ?? o.scale ?? o.zoom);
    return {
      x: num(o.x) ?? 0,
      y: num(o.y) ?? 0,
      escala: escala == null ? 1 : Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala)),
    };
  }

  function tableroAV1(fila) {
    return {
      id: fila.id,
      nombre: texto(fila.name).trim() || '—',
      descripcion: fila.description || '',
      market_id: fila.market_id || null,
      campaign_id: fila.campaign_id || null,
      viewport: viewportDesde(fila.viewport),
      updated_at: fila.updated_at || fila.created_at || null,
    };
  }

  /** Fila de board_view (o de board_nodes) → nodo del lienzo. */
  function nodoAV1(fila) {
    const kind = fila.kind;
    const sujeto = fila.subject_id || (COLUMNA_SUJETO[kind] ? fila[COLUMNA_SUJETO[kind]] : null) || null;
    const estilo = fila.style && typeof fila.style === 'object' && !Array.isArray(fila.style) ? fila.style : {};
    return {
      id: fila.id,
      board_id: fila.board_id,
      kind,
      sujeto_id: sujeto,
      parent_id: fila.parent_id || null,
      x: num(fila.x) ?? 0,
      y: num(fila.y) ?? 0,
      ancho: num(fila.width),
      alto: num(fila.height),
      estilo,
      cuerpo: fila.body || '',
      titulo: fila.title ?? fila.label ?? '',
      subtitulo: fila.subtitle || null,
    };
  }

  /** Datos de un nodo nuevo → fila de board_nodes (valida el CHECK un_solo_sujeto antes de ir a la base). */
  function filaDeNodo(orgId, boardId, datos) {
    const kind = datos.kind;
    if (!TIPOS_NODO.includes(kind)) throw Object.assign(new Error(`Tipo de nodo desconocido: ${kind}`), { code: 'entrada_invalida' });
    const fila = { organization_id: orgId, board_id: boardId, kind, x: Math.round(num(datos.x) ?? 0), y: Math.round(num(datos.y) ?? 0) };
    if (SIN_SUJETO.includes(kind)) {
      if (datos.sujeto_id) throw Object.assign(new Error('Una nota o un grupo no llevan sujeto.'), { code: 'entrada_invalida' });
    } else {
      if (!datos.sujeto_id) throw Object.assign(new Error('Este nodo necesita su sujeto.'), { code: 'entrada_invalida' });
      fila[COLUMNA_SUJETO[kind]] = datos.sujeto_id;
    }
    if (datos.cuerpo != null) fila.body = String(datos.cuerpo);
    if (datos.titulo != null && SIN_SUJETO.includes(kind)) fila.label = String(datos.titulo);
    if (num(datos.ancho) != null) fila.width = Math.round(num(datos.ancho));
    if (num(datos.alto) != null) fila.height = Math.round(num(datos.alto));
    if (datos.estilo && typeof datos.estilo === 'object') fila.style = datos.estilo;
    if (datos.parent_id) fila.parent_id = datos.parent_id;
    return fila;
  }

  function aristaAV1(fila) {
    return { id: fila.id, desde: fila.from_node_id, hasta: fila.to_node_id, etiqueta: fila.label || '', tipo: 'arista' };
  }

  /**
   * Qué escribe unir dos nodos: 'vinculo' (audiencia↔campaña = campaign_audiences),
   * 'arista' (board_edges) o null si no se pueden unir (el mismo nodo, o un grupo).
   */
  function tipoDeConexion(a, b) {
    if (!a || !b || a.id === b.id) return null;
    if (a.kind === 'group' || b.kind === 'group') return null;
    const par = [a.kind, b.kind].sort().join('+');
    if (par === 'audience+campaign') return 'vinculo';
    return 'arista';
  }

  /** En un vínculo, quién es la campaña y quién la audiencia (el orden del gesto da igual). */
  function parVinculo(a, b) {
    const campana = a.kind === 'campaign' ? a : b;
    const audiencia = a.kind === 'audience' ? a : b;
    return { campaign_id: campana.sujeto_id, audience_id: audiencia.sujeto_id, desde: audiencia.id, hasta: campana.id };
  }

  /**
   * Las aristas que se dibujan: las de board_edges + los vínculos de campaign_audiences
   * cuyos dos extremos están en ESTE tablero (una audiencia puede estar en el lienzo dos
   * veces: se une cada copia). Si ya hay una board_edge entre los mismos nodos, no se duplica.
   */
  function aristasVisibles(nodos, aristas, vinculos) {
    const porSujeto = (kind) => {
      const m = new Map();
      for (const n of nodos) if (n.kind === kind && n.sujeto_id) { const l = m.get(n.sujeto_id) || []; l.push(n); m.set(n.sujeto_id, l); }
      return m;
    };
    const auds = porSujeto('audience');
    const camps = porSujeto('campaign');
    const ids = new Set(nodos.map((n) => n.id));
    const salida = aristas.filter((e) => ids.has(e.desde) && ids.has(e.hasta));
    const ya = new Set(salida.map((e) => [e.desde, e.hasta].sort().join('|')));
    for (const v of vinculos) {
      for (const a of auds.get(v.audience_id) || []) {
        for (const c of camps.get(v.campaign_id) || []) {
          const k = [a.id, c.id].sort().join('|');
          if (ya.has(k)) continue;
          ya.add(k);
          salida.push({ id: `v:${v.campaign_id}:${v.audience_id}:${a.id}:${c.id}`, desde: a.id, hasta: c.id, tipo: 'vinculo', campaign_id: v.campaign_id, audience_id: v.audience_id, principal: v.is_primary === true });
        }
      }
    }
    return salida;
  }

  /** «Nueva audiencia (N)»: el siguiente N libre entre los nombres que ya existen. */
  function siguienteNombre(prefijo, nombres) {
    const re = new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\((\\d+)\\)$`);
    let max = 0;
    for (const n of nombres || []) { const m = re.exec(String(n || '').trim()); if (m) max = Math.max(max, Number(m[1]) || 0); }
    return `${prefijo} (${max + 1})`;
  }

  const columnaDe = (kind) => (COLUMNAS[kind] != null ? COLUMNAS[kind] : COLUMNAS.otro);

  /** Dónde cae un nodo nuevo de este kind: debajo del último de su columna. */
  function posicionLibre(kind, nodos) {
    const x = columnaDe(kind);
    const enColumna = (nodos || []).filter((n) => n.kind !== 'group' && Math.abs(n.x - x) < 160);
    const y = enColumna.length ? Math.max(...enColumna.map((n) => n.y + (n.alto || ALTO_FILA - 20))) + 30 : ARRIBA;
    return { x, y: Math.round(y) };
  }

  /** «Reorganizar»: columnas por kind (elementos · audiencias · campañas · resto), por título. Notas y grupos no se tocan. */
  function reorganizar(nodos) {
    const grupos = new Map();
    for (const n of nodos || []) {
      if (SIN_SUJETO.includes(n.kind)) continue;
      const x = columnaDe(n.kind);
      const l = grupos.get(x) || [];
      l.push(n);
      grupos.set(x, l);
    }
    const salida = [];
    for (const [x, l] of grupos) {
      l.slice().sort((a, b) => texto(a.titulo).localeCompare(texto(b.titulo), 'es'))
        .forEach((n, i) => salida.push({ id: n.id, x, y: ARRIBA + i * ALTO_FILA }));
    }
    return salida;
  }

  function audienciaAV1(fila) {
    return {
      id: fila.id,
      nombre: texto(fila.name),
      descripcion: fila.description || '',
      market_id: fila.market_id || null,
      conciencia: fila.awareness_level || null,
      dolores: lista(fila.pains),
      deseos: lista(fila.desires),
      objeciones: lista(fila.objections),
      gatillos: lista(fila.buying_triggers),
      edad_min: num(fila.target_age_min),
      edad_max: num(fila.target_age_max),
      generos: lista(fila.target_genders),
      lugares: lista(fila.target_locations),
      alineacion: num(fila.alignment_score),
      activa: fila.is_active !== false,
      updated_at: fila.updated_at || null,
    };
  }

  /** Texto de un área (una idea por línea) → text[] sin vacíos. */
  const lineas = (v) => (Array.isArray(v) ? lista(v) : String(v == null ? '' : v).split(/\n+/).map((s) => s.trim()).filter(Boolean));
  const falla = (msg) => Object.assign(new Error(msg), { code: 'entrada_invalida' });

  /** Cambios del inspector → patch de marketing.audiences (valida los CHECK antes de ir a la base). */
  function audienciaABase(c) {
    const p = {};
    if (c.nombre !== undefined) { const n = String(c.nombre || '').trim(); if (!n) throw falla('La audiencia necesita un nombre.'); p.name = n; }
    if (c.descripcion !== undefined) p.description = String(c.descripcion || '').trim() || null;
    if (c.conciencia !== undefined) { if (c.conciencia && !CONCIENCIA.includes(c.conciencia)) throw falla('Nivel de conciencia desconocido.'); p.awareness_level = c.conciencia || null; }
    for (const [de, a] of [['dolores', 'pains'], ['deseos', 'desires'], ['objeciones', 'objections'], ['gatillos', 'buying_triggers'], ['generos', 'target_genders'], ['lugares', 'target_locations']]) {
      if (c[de] !== undefined) p[a] = lineas(c[de]);
    }
    const edad = (v) => { const n = num(v); if (n == null) return null; if (!Number.isInteger(n) || n < 13 || n > 100) throw falla('La edad va de 13 a 100.'); return n; };
    if (c.edad_min !== undefined) p.target_age_min = edad(c.edad_min);
    if (c.edad_max !== undefined) p.target_age_max = edad(c.edad_max);
    if (p.target_age_min != null && p.target_age_max != null && p.target_age_min > p.target_age_max) throw falla('La edad mínima no puede pasar a la máxima.');
    if (c.activa !== undefined) p.is_active = c.activa !== false;
    return p;
  }

  /** campaigns_view (o marketing.campaigns) → campaña del lienzo. */
  function campanaAV1(fila) {
    return {
      id: fila.id,
      nombre: texto(fila.name),
      market_id: fila.market_id || null,
      objetivo: fila.objective || null,
      narrativa: fila.narrative || null,
      estado: fila.status || 'draft',
      presupuesto: num(fila.planned_budget),
      moneda: fila.planned_currency ? String(fila.planned_currency).trim() : null,
      inicio: fila.starts_on || null,
      fin: fila.ends_on || null,
      cta: fila.call_to_action || '',
      url: fila.landing_url || '',
      notas: fila.internal_notes ?? null,
      plan: fila.plan_name || null,
      conversion: fila.conversion_name || null,
      brief: fila.brief_title || null,
      audiencia_principal: fila.audiencia_principal || null,
      mensaje_principal: fila.mensaje_principal || null,
      piezas: Number(fila.piezas) || 0,
      piezas_al_aire: Number(fila.piezas_al_aire) || 0,
      entregas: Number(fila.entregas) || 0,
      // campaigns_view.gastado: suma en UNA moneda (gastado_moneda). NULL = la campaña gastó en
      // varias monedas y no se suman: se dice «varias monedas», nunca 0.
      gastado: num(fila.gastado),
      gastado_moneda: fila.gastado_moneda ? String(fila.gastado_moneda).trim() : null,
      varias_monedas: Object.prototype.hasOwnProperty.call(fila, 'gastado') && fila.gastado == null,
      created_at: fila.created_at || null,
    };
  }

  /** Cambios del inspector → patch de marketing.campaigns (CHECKs: nombre, moneda ISO, presupuesto con moneda, fechas). */
  function campanaABase(c) {
    const p = {};
    if (c.nombre !== undefined) { const n = String(c.nombre || '').trim(); if (!n) throw falla('La campaña necesita un nombre.'); p.name = n; }
    if (c.objetivo !== undefined) { if (!OBJETIVOS.includes(c.objetivo)) throw falla('Elige un objetivo.'); p.objective = c.objetivo; }
    if (c.estado !== undefined) { if (!ESTADOS_CAMPANA.includes(c.estado)) throw falla('Estado desconocido.'); p.status = c.estado; }
    if (c.narrativa !== undefined) { if (c.narrativa && !NARRATIVAS.includes(c.narrativa)) throw falla('Narrativa desconocida.'); p.narrative = c.narrativa || null; }
    if (c.presupuesto !== undefined || c.moneda !== undefined) {
      const monto = num(c.presupuesto);
      const moneda = String(c.moneda || '').trim().toUpperCase();
      if (monto == null) { p.planned_budget = null; p.planned_currency = null; } else {
        if (monto < 0) throw falla('El presupuesto no puede ser negativo.');
        if (!/^[A-Z]{3}$/.test(moneda)) throw falla('El presupuesto necesita su moneda (3 letras, como COP o USD).');
        p.planned_budget = monto; p.planned_currency = moneda;
      }
    }
    if (c.inicio !== undefined) p.starts_on = c.inicio || null;
    if (c.fin !== undefined) p.ends_on = c.fin || null;
    if (p.starts_on && p.ends_on && p.ends_on < p.starts_on) throw falla('La campaña no puede terminar antes de empezar.');
    if (c.cta !== undefined) p.call_to_action = String(c.cta || '').trim() || null;
    if (c.url !== undefined) p.landing_url = String(c.url || '').trim() || null;
    if (c.notas !== undefined) p.internal_notes = String(c.notas || '').trim() || null;
    return p;
  }

  /** Lo que se muestra como gasto de una campaña: monto + moneda, «varias monedas» o nada. */
  function gastoDe(c) {
    if (!c) return { tipo: 'nada' };
    if (c.varias_monedas) return { tipo: 'varias' };
    if (c.gastado == null) return { tipo: 'nada' };
    return { tipo: 'monto', monto: c.gastado, moneda: c.gastado_moneda || null };
  }

  /**
   * Un evento de Realtime (postgres_changes) de marketing.boards/board_nodes/board_edges → cambio
   * del lienzo: { tabla, tipo: 'alta'|'cambio'|'baja', id, fila (ya mapeada) }. Una baja solo trae
   * la llave (RLS): se aplica por id. null si el evento no sirve.
   */
  function cambioDeRealtime(tabla, payload) {
    if (!payload || !['boards', 'board_nodes', 'board_edges'].includes(tabla)) return null;
    const ev = payload.eventType || payload.type;
    const tipo = { INSERT: 'alta', UPDATE: 'cambio', DELETE: 'baja' }[ev];
    if (!tipo) return null;
    const cruda = tipo === 'baja' ? (payload.old || {}) : (payload.new || {});
    if (!cruda.id) return null;
    if (tipo === 'baja') return { tabla, tipo, id: cruda.id, fila: null };
    const fila = tabla === 'boards' ? tableroAV1(cruda) : tabla === 'board_nodes' ? nodoAV1(cruda) : aristaAV1(cruda);
    return { tabla, tipo, id: cruda.id, fila, board_id: cruda.board_id || null };
  }

  /** Filas de marketing.performance → totales de una campaña (por moneda; se reporta la dominante). */
  function rendimientoDe(filas) {
    const t = { impresiones: 0, alcance: 0, clics: 0, conversiones: 0, gasto: 0, valor: 0, moneda: null, dias: 0 };
    const porMoneda = new Map();
    const dias = new Set();
    for (const f of filas || []) {
      t.impresiones += Number(f.impressions) || 0;
      t.alcance += Number(f.reach) || 0;
      t.clics += Number(f.clicks) || 0;
      t.conversiones += Number(f.conversions) || 0;
      t.gasto += Number(f.spend) || 0;
      t.valor += Number(f.conversion_value) || 0;
      if (f.currency) porMoneda.set(f.currency, (porMoneda.get(f.currency) || 0) + (Number(f.spend) || 0) + 1e-9);
      if (f.date) dias.add(f.date);
    }
    t.dias = dias.size;
    t.moneda = [...porMoneda.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    t.ctr = t.impresiones ? t.clics / t.impresiones : null;
    t.cpc = t.clics ? t.gasto / t.clics : null;
    t.cpa = t.conversiones ? t.gasto / t.conversiones : null;
    t.roas = t.gasto ? t.valor / t.gasto : null;
    return t;
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  const mk = (sb) => sb.schema('marketing');
  function aviso(nombre, r) { if (r?.error) console.warn(`[marketing] ${nombre}:`, r.error.code, r.error.message); }
  function sinBase() { return Object.assign(new Error('No hay conexión con la base.'), { code: 'sin_base' }); }
  /** Error de la base → error con palabras (42501 = sin permiso por RLS). */
  function enPalabras(error, que) {
    if (!error) return null;
    const e = new Error(error.code === '42501' ? `No tienes permiso para ${que} en esta marca.` : (error.message || `No se pudo ${que}.`));
    e.code = error.code; e.base = error;
    return e;
  }
  async function hacer(q, que) {
    const r = await q;
    if (r.error) throw enPalabras(r.error, que);
    return r.data;
  }

  const SEL_TABLERO = 'id, organization_id, market_id, campaign_id, name, description, viewport, created_at, updated_at';
  const SEL_NODO_VISTA = 'id, board_id, organization_id, parent_id, kind, subject_id, x, y, width, height, style, body, title, subtitle';
  const SEL_ARISTA = 'id, board_id, from_node_id, to_node_id, label, style';
  const SEL_AUDIENCIA = 'id, organization_id, market_id, name, description, awareness_level, pains, desires, objections, buying_triggers, target_age_min, target_age_max, target_genders, target_locations, alignment_score, is_active, updated_at';
  const SEL_CAMPANA_VISTA = 'id, organization_id, market_id, name, objective, narrative, status, planned_budget, planned_currency, starts_on, ends_on, call_to_action, landing_url, created_at, plan_name, conversion_name, brief_title, audiencia_principal, mensaje_principal, piezas, piezas_al_aire, entregas, gastado, gastado_moneda';

  /* Tableros («estrategias» de v1) */

  async function tableros(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await mk(sb).from('boards').select(SEL_TABLERO).eq('organization_id', orgId).order('created_at', { ascending: true });
    if (r.error) throw enPalabras(r.error, 'leer los lienzos');
    return (r.data || []).map(tableroAV1);
  }

  async function crearTablero(orgId, { nombre, market_id = null } = {}) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const n = String(nombre || '').trim();
    if (!n) throw falla('El lienzo necesita un nombre.');
    const data = await hacer(mk(sb).from('boards').insert({ organization_id: orgId, name: n, market_id: market_id || null }).select(SEL_TABLERO).single(), 'crear un lienzo');
    return tableroAV1(data);
  }

  async function renombrarTablero(id, nombre) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const n = String(nombre || '').trim();
    if (!n) throw falla('El lienzo necesita un nombre.');
    const data = await hacer(mk(sb).from('boards').update({ name: n }).eq('id', id).select(SEL_TABLERO).maybeSingle(), 'renombrar el lienzo');
    if (!data) throw enPalabras({ code: '42501' }, 'renombrar el lienzo');
    return tableroAV1(data);
  }

  async function borrarTablero(id) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const data = await hacer(mk(sb).from('boards').delete().eq('id', id).select('id'), 'borrar el lienzo');
    if (!data?.length) throw enPalabras({ code: '42501' }, 'borrar el lienzo');
    return true;
  }

  /** El encuadre (pan/zoom) se recuerda en el tablero; sin permiso de edición falla en silencio (es comodidad, no dato). */
  async function guardarViewport(id, vp) {
    const sb = await cliente();
    if (!sb || !id) return false;
    const v = viewportDesde(vp);
    const r = await mk(sb).from('boards').update({ viewport: { x: Math.round(v.x), y: Math.round(v.y), escala: Math.round(v.escala * 1000) / 1000 } }).eq('id', id);
    aviso('boards.viewport', r);
    return !r.error;
  }

  /* Nodos y aristas */

  async function lienzo(boardId) {
    const sb = await cliente();
    if (!sb || !boardId) return { nodos: [], aristas: [] };
    const [n, e] = await Promise.all([
      mk(sb).from('board_view').select(SEL_NODO_VISTA).eq('board_id', boardId).limit(2000),
      mk(sb).from('board_edges').select(SEL_ARISTA).eq('board_id', boardId).limit(4000),
    ]);
    if (n.error) throw enPalabras(n.error, 'leer el lienzo');
    if (e.error) throw enPalabras(e.error, 'leer las conexiones del lienzo');
    return { nodos: (n.data || []).map(nodoAV1), aristas: (e.data || []).map(aristaAV1) };
  }

  async function nodo(id) {
    const sb = await cliente();
    if (!sb || !id) return null;
    const r = await mk(sb).from('board_view').select(SEL_NODO_VISTA).eq('id', id).maybeSingle();
    aviso('board_view id', r);
    return r.data ? nodoAV1(r.data) : null;
  }

  /** Pone algo en el lienzo. Devuelve el nodo como lo ve board_view (con su título resuelto). */
  async function crearNodo(orgId, boardId, datos) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const fila = filaDeNodo(orgId, boardId, datos);
    const data = await hacer(mk(sb).from('board_nodes').insert(fila).select('id').single(), 'poner algo en el lienzo');
    return (await nodo(data.id)) || nodoAV1({ ...fila, id: data.id, title: datos.titulo || '' });
  }

  /** Mueve/redimensiona varios nodos a la vez (un PATCH por nodo, en paralelo). */
  async function moverNodos(cambios) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const rs = await Promise.all((cambios || []).map((c) => {
      const p = { x: Math.round(c.x), y: Math.round(c.y) };
      if (c.ancho != null) p.width = Math.round(c.ancho);
      if (c.alto != null) p.height = Math.round(c.alto);
      return mk(sb).from('board_nodes').update(p).eq('id', c.id);
    }));
    const mal = rs.find((r) => r.error);
    if (mal) throw enPalabras(mal.error, 'mover los nodos');
    return true;
  }

  /** Texto de una nota, título de un grupo o estilo. */
  async function editarNodo(id, { cuerpo, titulo, estilo, ancho, alto } = {}) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const p = {};
    if (cuerpo !== undefined) p.body = cuerpo == null ? null : String(cuerpo);
    if (titulo !== undefined) p.label = String(titulo || '').trim() || null;
    if (estilo !== undefined) p.style = estilo || {};
    if (ancho !== undefined) p.width = ancho == null ? null : Math.round(ancho);
    if (alto !== undefined) p.height = alto == null ? null : Math.round(alto);
    const data = await hacer(mk(sb).from('board_nodes').update(p).eq('id', id).select('id').maybeSingle(), 'editar el nodo');
    if (!data) throw enPalabras({ code: '42501' }, 'editar el nodo');
    return true;
  }

  /** Quita del lienzo (NO borra la audiencia/campaña/elemento). Sus aristas caen en cascada. */
  async function quitarNodo(id) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const data = await hacer(mk(sb).from('board_nodes').delete().eq('id', id).select('id'), 'quitar del lienzo');
    if (!data?.length) throw enPalabras({ code: '42501' }, 'quitar del lienzo');
    return true;
  }

  async function crearArista(orgId, boardId, desde, hasta, etiqueta = null) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const data = await hacer(mk(sb).from('board_edges').insert({ organization_id: orgId, board_id: boardId, from_node_id: desde, to_node_id: hasta, label: etiqueta || null }).select(SEL_ARISTA).single(), 'conectar los nodos');
    return aristaAV1(data);
  }

  async function quitarArista(id) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const data = await hacer(mk(sb).from('board_edges').delete().eq('id', id).select('id'), 'quitar la conexión');
    if (!data?.length) throw enPalabras({ code: '42501' }, 'quitar la conexión');
    return true;
  }

  /* Audiencias */

  async function audiencias(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await mk(sb).from('audiences').select(SEL_AUDIENCIA).eq('organization_id', orgId).order('updated_at', { ascending: false }).limit(500);
    if (r.error) throw enPalabras(r.error, 'leer las audiencias');
    return (r.data || []).map(audienciaAV1);
  }

  async function crearAudiencia(orgId, { nombre, market_id = null } = {}) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const p = audienciaABase({ nombre });
    const data = await hacer(mk(sb).from('audiences').insert({ organization_id: orgId, market_id: market_id || null, ...p }).select(SEL_AUDIENCIA).single(), 'crear la audiencia');
    return audienciaAV1(data);
  }

  async function editarAudiencia(id, cambios) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const p = audienciaABase(cambios);
    if (!Object.keys(p).length) return null;
    const data = await hacer(mk(sb).from('audiences').update(p).eq('id', id).select(SEL_AUDIENCIA).maybeSingle(), 'editar la audiencia');
    if (!data) throw enPalabras({ code: '42501' }, 'editar la audiencia');
    return audienciaAV1(data);
  }

  /** Borra la audiencia de la MARCA (sus vínculos y sus nodos caen en cascada). */
  async function borrarAudiencia(id) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const data = await hacer(mk(sb).from('audiences').delete().eq('id', id).select('id'), 'borrar la audiencia');
    if (!data?.length) throw enPalabras({ code: '42501' }, 'borrar la audiencia');
    return true;
  }

  /* Campañas */

  async function campanas(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await mk(sb).from('campaigns_view').select(SEL_CAMPANA_VISTA).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1000);
    if (r.error) throw enPalabras(r.error, 'leer las campañas');
    return (r.data || []).map(campanaAV1);
  }

  /** Una campaña completa: la vista + lo que solo tiene la tabla (notas internas). */
  async function campana(id) {
    const sb = await cliente();
    if (!sb || !id) return null;
    const [v, t] = await Promise.all([
      mk(sb).from('campaigns_view').select(SEL_CAMPANA_VISTA).eq('id', id).maybeSingle(),
      mk(sb).from('campaigns').select('id, internal_notes, updated_at').eq('id', id).maybeSingle(),
    ]);
    if (v.error) throw enPalabras(v.error, 'leer la campaña');
    aviso('campaigns notas', t);
    return v.data ? campanaAV1({ ...v.data, internal_notes: t.data?.internal_notes ?? null }) : null;
  }

  async function crearCampana(orgId, { nombre, objetivo = 'awareness', market_id = null } = {}) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const p = campanaABase({ nombre, objetivo });
    const data = await hacer(mk(sb).from('campaigns').insert({ organization_id: orgId, market_id: market_id || null, ...p }).select('id').single(), 'crear la campaña');
    return (await campana(data.id)) || campanaAV1({ id: data.id, name: p.name, objective: p.objective });
  }

  async function editarCampana(id, cambios) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const p = campanaABase(cambios);
    if (!Object.keys(p).length) return null;
    const data = await hacer(mk(sb).from('campaigns').update(p).eq('id', id).select('id').maybeSingle(), 'editar la campaña');
    if (!data) throw enPalabras({ code: '42501' }, 'editar la campaña');
    return campana(id);
  }

  /**
   * Borra la campaña de la marca. Una campaña con entregas es el espejo de lo que corre en
   * Meta/Google: no se borra desde aquí (se diría que ya no existe y seguiría gastando).
   */
  async function borrarCampana(id) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const c = await campana(id);
    if (c && c.entregas > 0) throw Object.assign(new Error('Esta campaña tiene entregas en una plataforma: se gestiona allí, no se borra desde el lienzo.'), { code: 'con_entregas' });
    const data = await hacer(mk(sb).from('campaigns').delete().eq('id', id).select('id'), 'borrar la campaña');
    if (!data?.length) throw enPalabras({ code: '42501' }, 'borrar la campaña');
    return true;
  }

  /* Vínculos audiencia ↔ campaña (marketing.campaign_audiences) */

  async function vinculos(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return [];
    const r = await mk(sb).from('campaign_audiences').select('campaign_id, audience_id, is_primary').eq('organization_id', orgId).limit(5000);
    if (r.error) throw enPalabras(r.error, 'leer qué audiencia alimenta cada campaña');
    return r.data || [];
  }

  /** Une audiencia y campaña. La primera audiencia de una campaña queda como principal. */
  async function vincular(orgId, campaignId, audienceId) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const ya = await hacer(mk(sb).from('campaign_audiences').select('audience_id, is_primary').eq('campaign_id', campaignId), 'leer las audiencias de la campaña');
    if ((ya || []).some((f) => f.audience_id === audienceId)) return (ya || []).find((f) => f.audience_id === audienceId);
    const fila = { organization_id: orgId, campaign_id: campaignId, audience_id: audienceId, is_primary: !(ya || []).some((f) => f.is_primary) };
    const data = await hacer(mk(sb).from('campaign_audiences').insert(fila).select('campaign_id, audience_id, is_primary').single(), 'unir la audiencia con la campaña');
    return data;
  }

  async function desvincular(campaignId, audienceId) {
    const sb = await cliente();
    if (!sb) throw sinBase();
    const data = await hacer(mk(sb).from('campaign_audiences').delete().eq('campaign_id', campaignId).eq('audience_id', audienceId).select('campaign_id'), 'separar la audiencia de la campaña');
    if (!data?.length) throw enPalabras({ code: '42501' }, 'separar la audiencia de la campaña');
    return true;
  }

  /* Entregas en plataforma (solo lectura) */

  /** Lo que corre en la plataforma para una campaña: entregas, conjuntos, anuncios y rendimiento. */
  async function entregas(campaignId) {
    const sb = await cliente();
    if (!sb || !campaignId) return { entregas: [], rendimiento: rendimientoDe([]) };
    const d = await mk(sb).from('deliveries').select('id, platform, external_name, platform_objective, status, daily_budget, total_budget, currency, starts_at, ends_at, synced_at').eq('campaign_id', campaignId).order('starts_at', { ascending: false, nullsFirst: false }).limit(50);
    if (d.error) throw enPalabras(d.error, 'leer las entregas');
    const lista = d.data || [];
    const ids = lista.map((x) => x.id);
    if (!ids.length) return { entregas: [], rendimiento: rendimientoDe([]) };
    const [s, p] = await Promise.all([
      mk(sb).from('ad_sets').select('id, delivery_id, name, status, daily_budget, currency, audience_id').in('delivery_id', ids).limit(500),
      mk(sb).from('performance').select('delivery_id, ad_set_id, ad_id, date, currency, impressions, reach, clicks, conversions, spend, conversion_value').in('delivery_id', ids).is('ad_set_id', null).is('ad_id', null).limit(5000),
    ]);
    aviso('ad_sets', s); aviso('performance', p);
    const sets = s.data || [];
    const a = sets.length ? await mk(sb).from('ads').select('id, ad_set_id, name, status, headline, body, call_to_action, destination_url, creative_url').in('ad_set_id', sets.map((x) => x.id)).limit(1000) : { data: [] };
    aviso('ads', a);
    const anuncios = a.data || [];
    // Si la plataforma no dejó filas a nivel de entrega, se suma lo que haya (anuncios o conjuntos).
    let perf = p.data || [];
    if (!perf.length) {
      const q = await mk(sb).from('performance').select('delivery_id, ad_set_id, ad_id, date, currency, impressions, reach, clicks, conversions, spend, conversion_value').in('delivery_id', ids).not('ad_id', 'is', null).limit(5000);
      aviso('performance anuncios', q);
      perf = q.data || [];
    }
    return {
      entregas: lista.map((x) => ({
        ...x,
        conjuntos: sets.filter((c) => c.delivery_id === x.id).map((c) => ({ ...c, anuncios: anuncios.filter((ad) => ad.ad_set_id === c.id) })),
      })),
      rendimiento: rendimientoDe(perf),
    };
  }

  /* Elementos de la marca (productos, servicios, personajes, escenarios): por CatalogoDatos */

  async function elementos(orgId, kind) {
    if (!window.CatalogoDatos || !orgId) return [];
    const filas = await window.CatalogoDatos.elementos(orgId, kind);
    return (filas || []).map((e) => ({ id: e.id, kind: e.kind, nombre: e.name || '', resumen: e.summary || e.description || '', imagen: e.imagen || null }));
  }

  /* Realtime: el lienzo abierto escucha sus tres tablas */

  /**
   * Suscribe el tablero abierto a postgres_changes (schema marketing). alCambio recibe cada
   * cambio ya mapeado (cambioDeRealtime); alEstado('vivo' | 'fallo') dice si la suscripción
   * quedó en pie (con 'fallo' la vista sondea). Las bajas no se pueden filtrar por columna en
   * Realtime: llegan sin filtro y la vista ignora los ids que no conoce. Devuelve apagar().
   */
  async function escuchar(orgId, boardId, alCambio, alEstado) {
    const sb = await cliente();
    if (!sb?.channel || !orgId || !boardId) { if (alEstado) alEstado('fallo'); return () => {}; }
    const canal = sb.channel(`marketing-lienzo-${boardId}-${Math.random().toString(36).slice(2, 8)}`);
    const escucha = (tabla, event, filter) => {
      const cfg = { event, schema: 'marketing', table: tabla };
      if (filter) cfg.filter = filter;
      canal.on('postgres_changes', cfg, (payload) => {
        const c = cambioDeRealtime(tabla, payload);
        if (c) { try { alCambio(c); } catch (e) { console.warn('[marketing] realtime:', e?.message || e); } }
      });
    };
    for (const ev of ['INSERT', 'UPDATE']) {
      escucha('boards', ev, `organization_id=eq.${orgId}`);
      escucha('board_nodes', ev, `board_id=eq.${boardId}`);
      escucha('board_edges', ev, `board_id=eq.${boardId}`);
    }
    for (const t of ['boards', 'board_nodes', 'board_edges']) escucha(t, 'DELETE', null);
    let avisado = false;
    let apagado = false;
    canal.subscribe((estado) => {
      if (!alEstado || apagado) return;
      if (estado === 'SUBSCRIBED') { avisado = false; alEstado('vivo'); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(estado) && !avisado) { avisado = true; alEstado('fallo'); }
    });
    return () => { apagado = true; try { sb.removeChannel ? sb.removeChannel(canal) : canal.unsubscribe(); } catch (_) { /* ya cerrado */ } };
  }

  /** Todo lo que el lienzo necesita para abrir: tableros, audiencias, campañas y vínculos. */
  async function base(orgId) {
    const [t, a, c, v] = await Promise.all([tableros(orgId), audiencias(orgId), campanas(orgId), vinculos(orgId)]);
    return { tableros: t, audiencias: a, campanas: c, vinculos: v };
  }

  window.MarketingDatos = Object.freeze({
    base, tableros, crearTablero, renombrarTablero, borrarTablero, guardarViewport,
    lienzo, nodo, crearNodo, moverNodos, editarNodo, quitarNodo, crearArista, quitarArista,
    audiencias, crearAudiencia, editarAudiencia, borrarAudiencia,
    campanas, campana, crearCampana, editarCampana, borrarCampana,
    vinculos, vincular, desvincular, entregas, elementos, escuchar,
    OBJETIVOS, ESTADOS_CAMPANA, NARRATIVAS, CONCIENCIA, TIPOS_NODO, COLUMNA_SUJETO, ESCALA_MIN, ESCALA_MAX,
    mapeo: Object.freeze({ viewportDesde, tableroAV1, nodoAV1, filaDeNodo, aristaAV1, tipoDeConexion, parVinculo, aristasVisibles, siguienteNombre, posicionLibre, reorganizar, audienciaAV1, audienciaABase, campanaAV1, campanaABase, rendimientoDe, gastoDe, cambioDeRealtime }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
