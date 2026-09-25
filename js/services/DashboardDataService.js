/**
 * DashboardDataService — el DASHBOARD de 4 pestañas (Mi Marca · Competencia · Tendencias ·
 * Estrategia) sobre la base nueva. Única puerta a la base para DashboardView y sus mixins
 * (regla del corte: ningún `.from()` fuera de js/services).
 *
 * Contrato: Git-AISC-DB docs/contratos/dashboard.md. Cada lectura vive en SU función, con el
 * nombre de la vista que la alimenta, y devuelve la FORMA DE v1 (la que pintaban los mixins
 * viejos) para que el diseño de siempre se porte sin reinterpretar datos:
 *
 *   P1 (20260925170000)  social.actividad_diaria · social.posts_view (con interacciones/media)
 *                        · marketing.lecturas_tablero (respaldo: marketing.readings.evidence)
 *   P2 (20260925171000)  marketing.anuncios_rendimiento · marketing.campanas_rendimiento
 *                        · intel.anuncios_competencia
 *   P3 (20260925172000)  ingest.frescura · ai.pulso · ai.bitacora · intel.fechas_proximas
 *   Existe hoy           public.organizations · public.brand_colors · integrations.connections
 *                        · intel.content_gaps · social.comments · marketing.audiences
 *   P4 (sin fórmula)     salud de marca, producto destacado → «todavía no» en la vista.
 *
 * Toda lectura devuelve { datos, falta }: `falta` = null si llegó, 'vista' si la vista o una
 * columna aún no existe (42P01 · 42703 · PGRST205 · PGRST204: la migración no está aplicada),
 * 'permiso' si la RLS la corta (42501), 'error' si falló otra cosa. La vista pinta «todavía
 * no» en palabras con eso; cuando JC aplica la migración, la sección se enciende sola.
 */
(function () {
  'use strict';

  /* ── Utilidades puras ────────────────────────────────────────────────────── */

  const DIA = 86400000;
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const n0 = (v) => Number(v) || 0;
  const MESES = {
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  };
  const NET_LABEL = Object.freeze({ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', twitter: 'X', youtube: 'YouTube', linkedin: 'LinkedIn', threads: 'Threads', pinterest: 'Pinterest' });

  /** 'YYYY-MM-DD' de una fecha (Date o ISO), en UTC: las fechas de actividad_diaria ya vienen en la zona de la marca. */
  function isoDia(d) {
    if (!d) return null;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const t = d instanceof Date ? d : new Date(d);
    return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
  }
  const deIso = (s) => new Date(`${s}T00:00:00Z`);
  const sumarDias = (s, n) => isoDia(new Date(deIso(s).getTime() + n * DIA));

  /** ¿El error es «la migración no está aplicada» (vista o columna que no existe)? */
  function faltaDe(error) {
    if (!error) return null;
    const c = String(error.code || '');
    if (['42P01', '42703', 'PGRST205', 'PGRST204', 'PGRST200', 'PGRST100'].includes(c)) return 'vista';
    if (c === '42501') return 'permiso';
    return 'error';
  }

  /**
   * La ventana de un filtro (Semana/Mes/Año/Todo/Personalizado), anclada a la última fecha con
   * datos como en v1: si la marca lleva días sin publicar, «Semana» no sale vacía.
   * → { desde, hasta } en 'YYYY-MM-DD' (desde null = sin límite).
   */
  const DIAS_VENTANA = Object.freeze({ week: 7, month: 30, year: 365, all: null });
  function rangoDeVentana(ventana, { ultima = null, hoy = new Date(), desde = null, hasta = null } = {}) {
    if (ventana === 'custom' && (desde || hasta)) return { desde: isoDia(desde), hasta: isoDia(hasta) || isoDia(hoy) };
    const h = isoDia(hoy);
    const ancla = ultima && isoDia(ultima) < h ? isoDia(ultima) : h;
    const dias = Object.prototype.hasOwnProperty.call(DIAS_VENTANA, ventana) ? DIAS_VENTANA[ventana] : 30;
    return { desde: dias == null ? null : sumarDias(ancla, -(dias - 1)), hasta: ancla };
  }

  /** Granularidad de las barras: día hasta ~2 meses, mes hasta 3 años, año más allá. */
  function granoDe(desde, hasta) {
    if (!desde) return 'mes';
    const dias = (deIso(hasta).getTime() - deIso(desde).getTime()) / DIA + 1;
    if (dias <= 62) return 'dia';
    if (dias <= 1100) return 'mes';
    return 'anio';
  }

  function etiquetaDe(clave, grano, locale = 'es', conAnio = false) {
    const M = MESES[locale] || MESES.es;
    if (grano === 'anio') return clave.slice(0, 4);
    const [a, m, d] = clave.split('-');
    if (grano === 'mes') return conAnio ? `${M[Number(m) - 1]} ${a.slice(2)}` : M[Number(m) - 1];
    return locale === 'en' ? `${M[Number(m) - 1]} ${Number(d)}` : `${Number(d)} ${M[Number(m) - 1]}`;
  }

  /** Cubetas consecutivas (sin huecos) entre desde y hasta. */
  function cubetas(desde, hasta, grano) {
    const out = [];
    if (!desde || !hasta || desde > hasta) return out;
    if (grano === 'dia') {
      for (let s = desde; s <= hasta; s = sumarDias(s, 1)) out.push({ clave: s, inicio: s, fin: sumarDias(s, 1) });
      return out;
    }
    if (grano === 'mes') {
      let [a, m] = desde.split('-').map(Number);
      const [ah, mh] = hasta.split('-').map(Number);
      while (a < ah || (a === ah && m <= mh)) {
        const clave = `${a}-${String(m).padStart(2, '0')}-01`;
        const sig = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
        out.push({ clave, inicio: clave, fin: sig });
        if (m === 12) { a += 1; m = 1; } else m += 1;
      }
      return out;
    }
    for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a++) out.push({ clave: `${a}-01-01`, inicio: `${a}-01-01`, fin: `${a + 1}-01-01` });
    return out;
  }
  const claveDe = (fecha, grano) => (grano === 'dia' ? fecha : grano === 'mes' ? `${fecha.slice(0, 7)}-01` : `${fecha.slice(0, 4)}-01-01`);

  /* ── Mapeos puros a la forma de v1 (test/dashboard-datos.test.js) ────────── */

  /** social.actividad_diaria → forma de `dashboard_mimarca_activity` (Tráfico). */
  function traficoAV1(filas, { desde, hasta, hoy = new Date(), locale = 'es' } = {}) {
    const lista = (filas || []).filter((f) => f && f.fecha);
    const primero = lista.reduce((m, f) => (!m || f.fecha < m ? f.fecha : m), null);
    const ultimo = lista.reduce((m, f) => (!m || f.fecha > m ? f.fecha : m), null);
    const d0 = desde || primero;
    const d1 = hasta || ultimo;
    const grano = granoDe(d0, d1 || d0);
    const conAnio = grano === 'mes' && d0 && d1 && d0.slice(0, 4) !== d1.slice(0, 4);
    const cs = cubetas(d0, d1, grano);
    const series = cs.map((c) => ({ label: etiquetaDe(c.clave, grano, locale, conAnio), start: c.inicio, end: c.fin, networks: {} }));
    const porClave = new Map(series.map((s, i) => [cs[i].clave, s]));
    let total = 0;
    for (const f of lista) {
      if ((d0 && f.fecha < d0) || (d1 && f.fecha > d1)) continue;
      const s = porClave.get(claveDe(f.fecha, grano));
      if (!s) continue;
      const red = String(f.network || 'otra').toLowerCase();
      s.networks[red] = (s.networks[red] || 0) + n0(f.publicaciones);
      total += n0(f.publicaciones);
    }
    const dias = ultimo ? Math.max(0, Math.floor((deIso(isoDia(hoy)).getTime() - deIso(ultimo).getTime()) / DIA)) : null;
    return { total, days_since: dias, grano, series: total ? series : [] };
  }

  /** social.actividad_diaria → forma de `dashboard_brand_engagement_trend` (Interacciones, una fila por cubeta). */
  function interaccionesAV1(filas, { desde, hasta, locale = 'es' } = {}) {
    const lista = (filas || []).filter((f) => f && f.fecha);
    if (!lista.length) return [];
    const d0 = desde || lista.reduce((m, f) => (!m || f.fecha < m ? f.fecha : m), null);
    const d1 = hasta || lista.reduce((m, f) => (!m || f.fecha > m ? f.fecha : m), null);
    const grano = granoDe(d0, d1);
    const conAnio = grano === 'mes' && d0.slice(0, 4) !== d1.slice(0, 4);
    const suma = new Map();
    for (const f of lista) {
      if (f.fecha < d0 || f.fecha > d1) continue;
      const k = claveDe(f.fecha, grano);
      suma.set(k, (suma.get(k) || 0) + n0(f.interacciones));
    }
    return cubetas(d0, d1, grano)
      .filter((c) => suma.has(c.clave))
      .map((c) => ({ period_start: c.inicio, period_end: c.fin, period_label: etiquetaDe(c.clave, grano, locale, conAnio), total_engagement: suma.get(c.clave) }));
  }

  /** social.posts_view → la fila `brand_posts` que pintaban Publicación destacada y el panel del rival. */
  function postAV1(f) {
    if (!f) return null;
    const metrics = { likes: n0(f.likes), comments: n0(f.comments_count), shares: n0(f.shares), saves: n0(f.saves) };
    if (f.views != null) metrics.views = n0(f.views);
    const inter = f.interacciones != null ? n0(f.interacciones) : metrics.likes + metrics.comments + metrics.shares + metrics.saves;
    return {
      id: f.id,
      post_id: f.external_id || null,
      network: f.network || null,
      content: f.content || '',
      media_assets: f.media && typeof f.media === 'object' ? f.media : {},
      permalink: f.permalink || null,
      profile_handle: f.profile_handle || f.author_handle || null,
      author_display_name: f.profile_name || null,
      competitor_name: f.competitor_name || null,
      profile_id: f.profile_id || null,
      captured_at: f.published_at || f.captured_at || null,
      published_at: f.published_at || null,
      metrics,
      engagement_total: inter,
      alcance: f.alcance != null ? n0(f.alcance) : (f.views != null ? n0(f.views) : null),
      followers_snapshot: num(f.followers_at_post),
      vera_por_que: null, // «¿Por qué funcionó?»: no hay columna en la base nueva (contrato §4.6)
    };
  }

  /** social.comments → comentario de v1 (sentimiento solo si ya fue analizado: 0 de 38.304 hoy). */
  function comentarioAV1(c) {
    const S = { positive: 'POS', negative: 'NEG', neutral: 'NEU', mixed: 'NEU' };
    return {
      author_handle: c.author_handle || c.author_name || '',
      content: c.content || '',
      metrics: { likes: n0(c.likes) },
      sentiment: c.sentiment ? (S[String(c.sentiment).toLowerCase()] || String(c.sentiment).toUpperCase()) : null,
    };
  }

  /** Clave de marca de un perfil rival: la misma regla que la vista (handle sin @ ni «_» finales, minúsculas). */
  function marcaClaveDe(nombre) {
    const s = String(nombre || '').replace(/^@+/, '').replace(/_+$/, '').toLowerCase().trim();
    return s || null;
  }

  /** Nombre legible de una marca rival: su competitor_name sin @; si hay varias variantes, la más usada. */
  function nombreDeMarca(variantes) {
    const cuenta = new Map();
    for (const v of variantes) { if (!v) continue; const s = String(v).replace(/^@+/, ''); cuenta.set(s, (cuenta.get(s) || 0) + 1); }
    let mejor = null; let n = -1;
    for (const [s, c] of cuenta) if (c > n) { mejor = s; n = c; }
    return mejor || '—';
  }

  /** social.actividad_diaria (source=competitor) → filas de `dashboard_competencia_marcas` (Influencia digital). */
  function marcasCompetenciaAV1(filas, { desde = null, hasta = null } = {}) {
    const marcas = new Map();
    for (const f of filas || []) {
      if (!f || (desde && f.fecha < desde) || (hasta && f.fecha > hasta)) continue;
      const clave = f.marca_clave || marcaClaveDe(f.competitor_name || f.handle);
      if (!clave) continue;
      const m = marcas.get(clave) || { brand_key: clave, entity_ids: new Set(), nombres: [], redes: new Map(), seguidores: new Map(), total_posts: 0, total_engagement: 0 };
      if (f.profile_id) m.entity_ids.add(f.profile_id);
      m.nombres.push(f.competitor_name || f.handle);
      const red = String(f.network || 'otra').toLowerCase();
      m.redes.set(red, (m.redes.get(red) || 0) + n0(f.interacciones));
      if (f.seguidores != null && f.profile_id) m.seguidores.set(f.profile_id, Math.max(m.seguidores.get(f.profile_id) || 0, n0(f.seguidores)));
      m.total_posts += n0(f.publicaciones);
      m.total_engagement += n0(f.interacciones);
      marcas.set(clave, m);
    }
    return [...marcas.values()].map((m) => {
      const profiles = [...m.redes.entries()].map(([platform, engagement]) => ({ platform, engagement })).sort((a, b) => b.engagement - a.engagement);
      const followers = [...m.seguidores.values()].reduce((a, b) => a + b, 0);
      return {
        brand_key: m.brand_key,
        entity_ids: [...m.entity_ids],
        brand_name: nombreDeMarca(m.nombres),
        tipo: null, // directo/indirecto: FALTA columna en social.profiles (contrato §4.5)
        platforms: profiles.map((p) => p.platform),
        profiles,
        followers_total: followers || null,
        total_posts: m.total_posts,
        total_engagement: m.total_engagement,
        avg_engagement_per_post: m.total_posts ? Math.round(m.total_engagement / m.total_posts) : 0,
        eng_per_1k_followers: followers ? Math.round((m.total_engagement * 1000) / followers) : null,
        top_platform: profiles[0] ? profiles[0].platform : null,
      };
    }).filter((m) => m.total_posts > 0).sort((a, b) => b.total_engagement - a.total_engagement);
  }

  /** Panel de una marca rival: actividad_diaria + sus publicaciones → forma de `dashboard_competencia_marca_detalle`. */
  function detalleMarcaAV1(filas, posts) {
    const totals = { posts: 0, interacciones: 0, likes: 0, comments: 0, saves: 0, shares: 0, plays: 0, views: 0, comentarios_recolectados: null };
    const porRed = new Map();
    const daily = [];
    for (const f of filas || []) {
      totals.posts += n0(f.publicaciones);
      totals.interacciones += n0(f.interacciones);
      totals.likes += n0(f.likes);
      totals.comments += n0(f.comentarios);
      totals.saves += n0(f.guardados);
      totals.shares += n0(f.compartidos);
      totals.views += n0(f.vistas);
      const red = String(f.network || 'otra').toLowerCase();
      const r = porRed.get(red) || { platform: red, handle: f.handle || null, posts: 0, interacciones: 0, plays: 0 };
      r.posts += n0(f.publicaciones); r.interacciones += n0(f.interacciones); r.plays += n0(f.vistas);
      porRed.set(red, r);
      daily.push({ date: f.fecha, platform: red, posts: n0(f.publicaciones) });
    }
    totals.plays = totals.views;
    const by_platform = [...porRed.values()]
      .map((r) => ({ ...r, share_pct: totals.interacciones ? Math.round((r.interacciones * 1000) / totals.interacciones) / 10 : 0 }))
      .sort((a, b) => b.interacciones - a.interacciones);
    daily.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { totals, by_platform, daily, posts: (posts || []).map(postAV1).filter(Boolean) };
  }

  /** marketing.campanas_rendimiento → fila `campaigns` de v1 (Campañas activas). */
  function campanaAV1(f) {
    return {
      id: f.id,
      nombre_campana: f.nombre || null,
      external_campaign_name: null,
      platform_objective: f.platform_objective || null,
      cached_ctr: num(f.ctr),
      cached_roas: num(f.roas),
      cached_conversions: num(f.conversiones),
      cached_clicks: num(f.clics),
      cached_spend: num(f.gasto),
      moneda: f.moneda || null,
      cvr: num(f.cvr),
    };
  }

  /** marketing.anuncios_rendimiento → anuncio de `brand_ads` + su rendimiento (Lo que estás pautando). */
  const ESTADO_ANUNCIO = Object.freeze({ active: 'ACTIVE', paused: 'PAUSED', archived: 'ARCHIVED', rejected: 'DISAPPROVED', pending_review: 'PENDING_REVIEW', completed: 'ARCHIVED', draft: 'PAUSED' });
  function anuncioAV1(f) {
    const status = f.estado_meta ? String(f.estado_meta).toUpperCase() : (ESTADO_ANUNCIO[f.estado] || String(f.estado || '').toUpperCase());
    const gasto = num(f.gasto);
    return {
      id: f.id,
      external_ad_id: f.id,
      nombre: f.nombre || null,
      status,
      creative_url: f.creative_url || null,
      copy_text: f.copy || null,
      titulo: f.titulo || null,
      cta: f.cta || null,
      link_url: f.destino || null,
      formato: f.formato || null,
      created_time: f.creado || null,
      perf: (gasto != null || f.impresiones != null) ? {
        gasto: gasto || 0,
        impresiones: n0(f.impresiones),
        clics: n0(f.clics),
        ctr: num(f.ctr),
        cpm: num(f.cpm),
        moneda: f.moneda || null,
      } : null,
    };
  }

  /** intel.anuncios_competencia → fila `competitor_ads` de v1 (Lo que están pautando). */
  function anuncioRivalAV1(f) {
    return {
      id: f.id,
      creative_url: f.creative_url || null,
      copy_text: f.copy || f.titulo || '',
      first_seen_at: f.first_seen_at || null,
      last_seen_at: f.last_seen_at || null,
      targeting: {
        cta_text: f.cta || null,
        display_format: f.formato || null,
        publisher_platforms: Array.isArray(f.plataformas) ? f.plataformas : [],
        ad_library_url: f.url_biblioteca || null,
      },
      intelligence_entities: { name: String(f.marca || f.handle || '—').replace(/^@+/, '') },
      marca_clave: f.marca_clave || null,
      sigue_corriendo: f.sigue_corriendo === true,
    };
  }

  /** intel.content_gaps → océano azul de v1 (intent por demand_score, contrato §Tendencias). */
  function oceanoAV1(f) {
    const d = num(f.demand_score);
    const intent = d == null ? 'media' : d >= 0.8 ? 'alta' : d >= 0.5 ? 'media' : 'baja';
    return { id: f.id, gap_phrase: f.phrase || '', angle: f.angle || null, intent, demand_terms: Array.isArray(f.demand_terms) ? f.demand_terms : [] };
  }

  /** intel.fechas_proximas → `upcoming_holidays` de v1 (el veredicto solo si Vera lo puso: nunca uno inventado). */
  function fechaAV1(f) {
    const alcance = String(f.alcance || '').toLowerCase();
    return {
      event_date: f.fecha,
      event_name: f.nombre || '',
      event_description: f.motivo || '',
      raw_data: { verdict: f.veredicto ? String(f.veredicto).toLowerCase() : '', scope: /intern|global|world|mund/.test(alcance) ? 'international' : (alcance || '') },
    };
  }

  /** ingest.frescura → la frescura de v1 ({own_posts, competitor_posts, latest}) + si la cosecha está encendida. */
  function frescuraAV1(f) {
    if (!f) return null;
    const fechas = [f.posts_propios_ult, f.posts_rivales_ult, f.ultima_cosecha_ok].filter(Boolean).sort();
    return {
      own_posts: f.posts_propios_ult || null,
      competitor_posts: f.posts_rivales_ult || null,
      latest: f.ultima_cosecha_ok || fechas[fechas.length - 1] || null,
      agendas_activas: n0(f.agendas_activas),
      agendas_pausadas: n0(f.agendas_pausadas),
    };
  }

  /** ai.pulso → el pulso de v1 que lee VeraPulse ({activa, tipo, entidad, desde, ultimo}). */
  function pulsoAV1(f) {
    if (!f) return { activa: false, tipo: null, entidad: null, desde: null, paso: null, ultimo: null };
    return {
      activa: f.activa === true,
      tipo: f.paso || f.tipo || null,        // VeraPulse elige la frase por el código del sensor/herramienta
      clase: f.tipo || null,                 // cosecha · herramienta · ayudante
      // tipo de entidad desconocido (sin columna de competidor directo): nunca se trata como rival.
      entidad: f.entidad ? { nombre: String(f.entidad).replace(/^@+/, ''), tipo: null } : null,
      desde: f.desde || null,
      paso: f.paso || null,
      ultimo: f.ultimo_cuando ? { cuando: f.ultimo_cuando } : null,
    };
  }

  /** ai.bitacora → filas de `get_vera_bitacora` de v1 (la más reciente primero), las que agrupa VeraPulse. */
  function bitacoraAV1(filas) {
    return (filas || []).map((b) => {
      const stats = {};
      if (num(b.items_in)) stats.posts_found = num(b.items_in);
      if (num(b.items_new)) stats.new_signals = num(b.items_new);
      return {
        fuente: b.tipo || null, // cosecha · herramienta · ayudante
        tipo: b.que || b.tipo || null,
        entidad: b.objetivo ? String(b.objetivo).replace(/^@+/, '') : null,
        entidad_tipo: null,
        estado: b.estado || null,
        inicio: b.cuando || b.hasta || b.desde || null,
        duracion_ms: num(b.ms),
        stats,
        error: null,
      };
    }).sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')));
  }

  /** marketing.lecturas_tablero (o marketing.readings) → la fila de `vera_dashboard_readings` de v1. */
  function lecturaAV1(f) {
    if (!f) return null;
    const ev = f.evidence && typeof f.evidence === 'object' ? f.evidence : null;
    const reading = f.lectura || (ev && ev.reading) || null;
    if (!reading || typeof reading !== 'object') return null;
    return {
      id: f.id,
      reading,
      created_at: f.updated_at || f.created_at || null,
      periodo: f.periodo !== undefined ? f.periodo : (ev ? ev.periodo || null : null),
      scope: f.scope || (ev ? ev.scope : null) || null,
      schema_version: num(f.schema_version != null ? f.schema_version : (ev ? ev.schema_version : null)),
      heredada_v1: f.heredada_v1 === true || (ev ? ev.lectura_v1 === true : false),
    };
  }

  /** Plataformas conectadas (integrations.connections activas) → las burbujas de v1 (meta ⇒ Instagram + Facebook). */
  function plataformasAV1(filas) {
    const set = new Set();
    for (const r of filas || []) {
      if (!r || String(r.status || 'active') !== 'active') continue;
      const p = String(r.platform || '').toLowerCase();
      if (!p) continue;
      if (p === 'meta') { set.add('instagram'); set.add('facebook'); } else set.add(p);
    }
    const ORDEN = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'linkedin', 'mercadolibre', 'shopify', 'google'];
    const puesto = (p) => { const i = ORDEN.indexOf(p); return i < 0 ? ORDEN.length : i; };
    return [...set].sort((a, b) => (puesto(a) - puesto(b)) || a.localeCompare(b));
  }

  /* ── Acceso ──────────────────────────────────────────────────────────────── */

  let clienteInyectado = null;
  async function cliente() {
    if (clienteInyectado) return clienteInyectado;
    return window.supabase || (window.supabaseService && await window.supabaseService.getClient()) || null;
  }
  const esq = (sb, s) => (s === 'public' ? sb : sb.schema(s));

  /** Corre una consulta y la envuelve en { datos, falta }; nunca lanza. */
  async function leer(nombre, consulta, vacio) {
    try {
      const r = await consulta;
      if (r && r.error) {
        const falta = faltaDe(r.error);
        if (falta !== 'vista') console.warn(`[dashboard] ${nombre}:`, r.error.code, r.error.message);
        return { datos: vacio, falta, vista: nombre };
      }
      return { datos: r ? r.data : vacio, falta: null, vista: nombre };
    } catch (e) {
      console.warn(`[dashboard] ${nombre}:`, e && e.message);
      return { datos: vacio, falta: 'error', vista: nombre };
    }
  }
  const sinCliente = (nombre, vacio) => ({ datos: vacio, falta: 'error', vista: nombre });
  const mapear = (r, fn) => ({ ...r, datos: r.falta ? r.datos : fn(r.datos) });

  /* Hero ─────────────────────────────────────────────────────────────────── */

  async function marca(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('public.organizations', { logo_url: null, colores: [] });
    const [o, c] = await Promise.all([
      leer('public.organizations', sb.from('organizations').select('logo_url, name').eq('id', orgId).maybeSingle(), null),
      leer('public.brand_colors', sb.from('brand_colors').select('hex, role, position').eq('organization_id', orgId).order('position', { ascending: true }), []),
    ]);
    return { datos: { logo_url: (o.datos && String(o.datos.logo_url || '').trim()) || null, nombre: o.datos ? o.datos.name : null, colores: c.datos || [] }, falta: o.falta, vista: 'public.organizations' };
  }

  async function integraciones(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('integrations.connections', []);
    return mapear(await leer('integrations.connections', esq(sb, 'integrations').from('connections').select('platform, status').eq('organization_id', orgId), []), plataformasAV1);
  }

  async function frescura(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('ingest.frescura', null);
    return mapear(await leer('ingest.frescura', esq(sb, 'ingest').from('frescura').select('posts_propios_ult, posts_rivales_ult, ultima_cosecha_ok, ultima_falla, agendas_activas, agendas_pausadas').eq('organization_id', orgId).maybeSingle(), null), frescuraAV1);
  }

  async function pulso(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('ai.pulso', pulsoAV1(null));
    return mapear(await leer('ai.pulso', esq(sb, 'ai').from('pulso').select('activa, tipo, paso, entidad, desde, ultimo_cuando').eq('organization_id', orgId).maybeSingle(), null), pulsoAV1);
  }

  async function bitacora(orgId, { limite = 40 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('ai.bitacora', []);
    return mapear(await leer('ai.bitacora', esq(sb, 'ai').from('bitacora').select('tipo, que, objetivo, estado, items_in, items_new, ms, desde, hasta, cuando').eq('organization_id', orgId).order('cuando', { ascending: false }).limit(limite), []), bitacoraAV1);
  }

  /* Lecturas de Vera ──────────────────────────────────────────────────────── */

  const SEL_LECTURA_VISTA = 'id, created_at, updated_at, scope, schema_version, periodo, schema, lectura, heredada_v1';

  /**
   * La última lectura de un scope y esquema (y periodo, si se pide; sin lectura de ese periodo cae
   * a la más reciente de cualquiera, como v1). Primero la vista P1; sin ella, marketing.readings
   * filtrando el sobre `evidence` (la misma regla de la vista, hecha por PostgREST).
   */
  async function lectura(orgId, { scope, versiones = [2], periodo = null } = {}) {
    const sb = await cliente();
    if (!sb || !orgId || !scope) return sinCliente('marketing.lecturas_tablero', null);
    const vs = versiones.map(Number);
    const deVista = async (conPeriodo) => {
      let q = esq(sb, 'marketing').from('lecturas_tablero').select(SEL_LECTURA_VISTA).eq('organization_id', orgId).eq('scope', scope).in('schema_version', vs);
      if (conPeriodo) q = q.eq('periodo', conPeriodo);
      return leer('marketing.lecturas_tablero', q.order('created_at', { ascending: false }).limit(1), []);
    };
    let r = await deVista(periodo);
    if (!r.falta && periodo && !(r.datos || []).length) r = await deVista(null);
    if (!r.falta) return { ...r, datos: lecturaAV1((r.datos || [])[0]) };
    if (r.falta !== 'vista') return { ...r, datos: null };
    // Respaldo: la vista P1 aún no existe → el sobre de marketing.readings.
    const deTabla = async (conPeriodo) => {
      let q = esq(sb, 'marketing').from('readings').select('id, created_at, updated_at, evidence').eq('organization_id', orgId).eq('evidence->>scope', scope).in('evidence->>schema_version', vs.map(String));
      if (conPeriodo) q = q.eq('evidence->>periodo', conPeriodo);
      return leer('marketing.readings', q.order('created_at', { ascending: false }).limit(1), []);
    };
    let t = await deTabla(periodo);
    if (!t.falta && periodo && !(t.datos || []).length) t = await deTabla(null);
    return { ...t, datos: t.falta ? null : lecturaAV1((t.datos || [])[0]) };
  }

  /* Actividad (Tráfico, Interacciones, Influencia digital) ───────────────── */

  const SEL_ACTIVIDAD = 'fecha, network, source, profile_id, handle, competitor_name, marca_clave, publicaciones, likes, comentarios, compartidos, guardados, vistas, interacciones, seguidores';

  /** Última fecha con actividad de un origen (own / competitor): ancla las ventanas. */
  async function ultimaFecha(orgId, source = 'own') {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('social.actividad_diaria', null);
    const r = await leer('social.actividad_diaria', esq(sb, 'social').from('actividad_diaria').select('fecha').eq('organization_id', orgId).eq('source', source).order('fecha', { ascending: false }).limit(1), []);
    return { ...r, datos: r.falta ? null : ((r.datos || [])[0] || {}).fecha || null };
  }

  /** Filas diarias de actividad de un origen en [desde, hasta] (fechas 'YYYY-MM-DD'; desde null = todo). */
  async function actividad(orgId, { source = 'own', desde = null, hasta = null, perfiles = null } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('social.actividad_diaria', []);
    let q = esq(sb, 'social').from('actividad_diaria').select(SEL_ACTIVIDAD).eq('organization_id', orgId).eq('source', source);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (Array.isArray(perfiles) && perfiles.length) q = q.in('profile_id', perfiles);
    return leer('social.actividad_diaria', q.order('fecha', { ascending: true }).limit(5000), []);
  }

  async function trafico(orgId, rango, opciones = {}) {
    const r = await actividad(orgId, { source: 'own', ...rango });
    return mapear(r, (filas) => ({ activity: traficoAV1(filas, { ...rango, ...opciones }), impact: interaccionesAV1(filas, { ...rango, ...opciones }) }));
  }

  async function marcasCompetencia(orgId, rango) {
    const r = await actividad(orgId, { source: 'competitor', ...rango });
    return mapear(r, (filas) => marcasCompetenciaAV1(filas, rango));
  }

  /* Publicaciones (Publicación destacada, drill de Interacciones, panel del rival) ── */

  const SEL_POST = 'id, network, source, external_id, permalink, content, published_at, captured_at, profile_handle, profile_name, competitor_name, likes, comments_count, shares, views, saves, profile_id, author_handle, media, followers_at_post, interacciones, alcance';
  // Rango sobre published_at (el día de publicación en la zona de la marca, como actividad_diaria).
  // Las marcas de hoy están en America/Bogota (UTC-5, sin horario de verano): el día empieza a las 05:00 UTC.
  const finDe = (dia) => `${sumarDias(dia, 1)}T05:00:00Z`;
  const inicioDe = (dia) => `${dia}T05:00:00Z`;

  /** Publicaciones de un origen en la ventana, por interacciones (la regla de v1: el alcance NO rankea). */
  async function publicaciones(orgId, { source = 'own', desde = null, hasta = null, perfiles = null, limite = 24 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('social.posts_view', []);
    let q = esq(sb, 'social').from('posts_view').select(SEL_POST).eq('organization_id', orgId).eq('source', source).is('unpublished_at', null);
    if (desde) q = q.gte('published_at', inicioDe(desde));
    if (hasta) q = q.lt('published_at', finDe(hasta));
    if (Array.isArray(perfiles) && perfiles.length) q = q.in('profile_id', perfiles);
    return mapear(await leer('social.posts_view', q.order('interacciones', { ascending: false, nullsFirst: false }).limit(limite), []), (filas) => (filas || []).map(postAV1));
  }

  /** Comentarios cosechados de una publicación (los que más gustaron primero). */
  async function comentarios(postId, { limite = 80 } = {}) {
    const sb = await cliente();
    if (!sb || !postId) return sinCliente('social.comments', []);
    return mapear(await leer('social.comments', esq(sb, 'social').from('comments').select('author_handle, author_name, content, likes, sentiment').eq('post_id', postId).order('likes', { ascending: false, nullsFirst: false }).limit(limite), []), (filas) => (filas || []).map(comentarioAV1));
  }

  /** La publicación con más interacciones de la ventana + sus comentarios. */
  async function publicacionDestacada(orgId, opciones = {}) {
    const r = await publicaciones(orgId, { ...opciones, limite: 5 });
    if (r.falta) return { ...r, datos: null };
    const post = (r.datos || []).find((p) => p.engagement_total > 0) || null;
    if (!post) return { ...r, datos: null };
    const c = await comentarios(post.id);
    return { ...r, datos: { post, comentarios: c.falta ? [] : c.datos } };
  }

  async function detalleMarcaCompetencia(orgId, { perfiles, desde = null, hasta = null } = {}) {
    const [a, p] = await Promise.all([
      actividad(orgId, { source: 'competitor', desde, hasta, perfiles }),
      publicaciones(orgId, { source: 'competitor', desde, hasta, perfiles, limite: 24 }),
    ]);
    if (a.falta) return { ...a, datos: null };
    return { ...a, datos: detalleMarcaAV1(a.datos, p.falta ? [] : p.datos) };
  }

  /* Pauta ─────────────────────────────────────────────────────────────────── */

  async function campanasActivas(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('marketing.campanas_rendimiento', []);
    return mapear(await leer('marketing.campanas_rendimiento', esq(sb, 'marketing').from('campanas_rendimiento').select('id, nombre, status, objective, platform_objective, impresiones, clics, conversiones, gasto, valor_conversion, moneda, ctr, cvr, roas').eq('organization_id', orgId).eq('status', 'active').order('gasto', { ascending: false, nullsFirst: false }), []), (f) => (f || []).map(campanaAV1));
  }

  async function anuncios(orgId, { limite = 60 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('marketing.anuncios_rendimiento', []);
    return mapear(await leer('marketing.anuncios_rendimiento', esq(sb, 'marketing').from('anuncios_rendimiento').select('id, nombre, estado, estado_meta, formato, titulo, copy, cta, destino, creative_url, creado, gasto, impresiones, clics, conversiones, moneda, ctr, cpm').eq('organization_id', orgId).order('creado', { ascending: false, nullsFirst: false }).limit(limite), []), (f) => (f || []).map(anuncioAV1));
  }

  async function anunciosCompetencia(orgId, { limite = 120 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('intel.anuncios_competencia', []);
    return mapear(await leer('intel.anuncios_competencia', esq(sb, 'intel').from('anuncios_competencia').select('id, marca, marca_clave, handle, creative_url, copy, titulo, cta, formato, plataformas, url_biblioteca, first_seen_at, last_seen_at, sigue_corriendo').eq('organization_id', orgId).order('first_seen_at', { ascending: false, nullsFirst: false }).limit(limite), []), (f) => (f || []).map(anuncioRivalAV1));
  }

  /* Tendencias ────────────────────────────────────────────────────────────── */

  async function oceanos(orgId, { limite = 12 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('intel.content_gaps', []);
    return mapear(await leer('intel.content_gaps', esq(sb, 'intel').from('content_gaps').select('id, phrase, angle, demand_terms, demand_score, gap_score').eq('organization_id', orgId).is('addressed_at', null).order('gap_score', { ascending: false, nullsFirst: false }).limit(limite), []), (f) => (f || []).map(oceanoAV1));
  }

  async function fechasProximas(orgId, { limite = 40 } = {}) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('intel.fechas_proximas', []);
    return mapear(await leer('intel.fechas_proximas', esq(sb, 'intel').from('fechas_proximas').select('id, fecha, nombre, motivo, tipo, veredicto, alcance, fuente').eq('organization_id', orgId).order('fecha', { ascending: true }).limit(limite), []), (f) => (f || []).map(fechaAV1));
  }

  /* Audiencias (Competencia: «agrégala a tu biblioteca») ───────────────────── */

  async function audienciasBiblioteca(orgId) {
    const sb = await cliente();
    if (!sb || !orgId) return sinCliente('marketing.audiences', []);
    return mapear(await leer('marketing.audiences', esq(sb, 'marketing').from('audiences').select('id, name').eq('organization_id', orgId).limit(500), []), (f) => (f || []).map((a) => ({ id: a.id, nombre: a.name || '' })));
  }

  /** Guarda en la biblioteca (marketing.audiences) la audiencia que pesca un rival. Lanza si la base la rechaza. */
  async function adoptarAudiencia(orgId, aud) {
    const sb = await cliente();
    if (!sb || !orgId || !aud || !String(aud.nombre || '').trim()) throw new Error('Falta el nombre de la audiencia.');
    const lineas = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n|;/)).map((x) => String(x).trim()).filter(Boolean);
    const fila = {
      organization_id: orgId,
      name: String(aud.nombre).trim(),
      description: [aud.descripcion, aud.perfil].filter(Boolean).join('\n\n') || null,
      pains: lineas(aud.dolores),
      desires: lineas(aud.deseos),
      buying_triggers: lineas(aud.gancho),
    };
    const { data, error } = await esq(sb, 'marketing').from('audiences').insert(fila).select('id, name').single();
    if (error) throw error;
    return { id: data.id, nombre: data.name };
  }

  window.DashboardDatos = Object.freeze({
    marca, integraciones, frescura, pulso, bitacora, lectura,
    ultimaFecha, actividad, trafico, marcasCompetencia, publicaciones, comentarios, publicacionDestacada, detalleMarcaCompetencia,
    campanasActivas, anuncios, anunciosCompetencia, oceanos, fechasProximas, audienciasBiblioteca, adoptarAudiencia,
    rangoDeVentana, NET_LABEL,
    mapeo: Object.freeze({
      isoDia, faltaDe, rangoDeVentana, granoDe, cubetas, etiquetaDe, traficoAV1, interaccionesAV1, postAV1, comentarioAV1,
      marcaClaveDe, nombreDeMarca, marcasCompetenciaAV1, detalleMarcaAV1, campanaAV1, anuncioAV1, anuncioRivalAV1,
      oceanoAV1, fechaAV1, frescuraAV1, pulsoAV1, bitacoraAV1, lecturaAV1, plataformasAV1,
    }),
    _inyectarCliente(sb) { clienteInyectado = sb; },
  });
})();
