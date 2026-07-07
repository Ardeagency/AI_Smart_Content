/**
 * CompetenciaDataService — capa de datos del tab "Competencia".
 *
 * Lente = rivales. Llama a las RPCs dashboard_competencia_* (org-scoped, RLS):
 *   - kpis            → panorámica del campo de batalla
 *   - top             → ranking de rivales por engagement
 *   - risk            → vulnerabilidades / crisis del rival
 *   - audience_voice  → la voz de su audiencia (pain points de comentarios)
 *
 * Las RPCs filtran por entity (competidores), no por brand_container, y reciben
 * timestamptz. Devuelve { data, isEmpty, error } por bloque para manejo graceful.
 */
class CompetenciaDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    return this;
  }

  _ok(data)  { return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null }; }
  _err(error){ return { data: null, isEmpty: true, error }; }
  _unwrap(s) {
    if (s.status === 'rejected') return this._err(s.reason);
    if (s.value?.error) return this._err(s.value.error);
    return this._ok(s.value?.data);
  }

  _resolveWindow(opts = {}) {
    if (opts.dateFromIso && opts.dateToIso) {
      return { from: new Date(opts.dateFromIso).toISOString(), to: new Date(opts.dateToIso).toISOString() };
    }
    const windowDays = Math.max(1, Number(opts.windowDays || 99999));
    const now = new Date();
    const from = new Date(now.getTime() - windowDays * 86400_000);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  async loadAll(opts = {}) {
    if (!this.sb || !this.orgId) return null;
    const { from, to } = this._resolveWindow(opts);
    // Perfil: si se elige un rival, todo el tab se enfoca en el (p_entity_ids).
    const entityIds = opts.entityId ? [opts.entityId] : null;
    const platforms = Array.isArray(opts.platforms) && opts.platforms.length ? opts.platforms : null;

    const cacheKey = `dash:competencia:${this.orgId}:${from}:${to}:${opts.entityId || 'all'}:${(platforms || []).join(',')}`;
    const run = () => this._fetchAll(from, to, entityIds, platforms);
    if (window.apiClient) {
      return window.apiClient.query(cacheKey, run, { ttl: 60 * 1000, staleWhileRevalidate: true });
    }
    return run();
  }

  async _fetchAll(from, to, entityIds = null, platforms = null) {
    const org = this.orgId;
    const windowD = Math.max(1, Math.round((Date.now() - new Date(from).getTime()) / 86400_000));
    // Ventana previa (misma longitud, inmediatamente anterior) para deltas
    // periodo-vs-periodo. Con ventana "todo el periodo" (99999d) la previa cae
    // en fechas vacias y los deltas no se muestran (guard prev===0): correcto.
    const span = new Date(to).getTime() - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - span).toISOString();
    const prevTo = from;
    const [kpis, top, risk, voice, intel, bench, sov, kpisPrev, entColors] = await Promise.allSettled([
      this.sb.rpc('dashboard_competencia_kpis', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_top',  { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 8, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_risk', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 6, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_audience_voice', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 6, p_platforms: platforms }),
      this.sb.rpc('dashboard_competencia_intelligence', { p_org_id: org, p_window_d: windowD, p_platforms: platforms }),
      // Benchmark Mi Marca vs Competencia (head-to-head). p_brand_container_ids
      // null = todas las marcas propias de la org. Devuelve jsonb {brand, competencia}.
      this.sb.rpc('dashboard_brand_vs_competencia', { p_org_id: org, p_date_from: from, p_date_to: to, p_brand_container_ids: null, p_entity_ids: entityIds }),
      // Share-of-voice por rival (ranking por % de engagement del set competitivo).
      this.sb.rpc('dashboard_competencia_comparison', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: entityIds, p_limit: 8 }),
      this.sb.rpc('dashboard_competencia_kpis', { p_org_id: org, p_date_from: prevFrom, p_date_to: prevTo, p_entity_ids: entityIds, p_platforms: platforms }),
      // Color + relevancia + rango por perfil (intelligence_entities). El RPC top no
      // los expone; los traemos aparte (RLS org-scoped): color -> barras de "Influencia
      // digital" (o color de marca si no tiene); relevance -> contexto curado y rango
      // (metadata.rango = nacional|internacional) -> priorizacion del panel lateral
      // "Observaciones". El rango se edita en otra pagina; aqui solo se consume.
      this.sb.from('intelligence_entities').select('id,color,relevance,metadata').eq('organization_id', org),
    ]);

    const u = (s) => this._unwrap(s);
    // Merge de color + relevancia + rango sobre las filas del ranking (por entity_id).
    const topBlock = u(top);
    if (Array.isArray(topBlock.data)) {
      const rows = (entColors.status === 'fulfilled' && !entColors.value?.error) ? (entColors.value.data || []) : [];
      const metaById = new Map(rows.map((e) => [e.id, {
        color: (Array.isArray(e.color) && e.color[0]) ? e.color[0] : null,
        relevance: (typeof e.relevance === 'string' && e.relevance.trim()) ? e.relevance.trim() : null,
        rango: (e.metadata && typeof e.metadata.rango === 'string' && e.metadata.rango.trim()) ? e.metadata.rango.trim().toLowerCase() : null,
      }]));
      topBlock.data = topBlock.data.map((r) => {
        const m = metaById.get(r.entity_id) || {};
        return { ...r, color: m.color || null, relevance: m.relevance || null, rango: m.rango || null };
      });
    }

    // ── "De qué habla" cada perfil: términos recurrentes extraídos del TEXTO de
    // sus posts (rules+math, sin LLM — topics/tone no están poblados para
    // competidores). Fetch acotado a los perfiles del ranking + la ventana.
    if (Array.isArray(topBlock.data) && topBlock.data.length) {
      const ids = topBlock.data.map((r) => r.entity_id).filter(Boolean);
      let posts = [];
      try {
        const { data } = await this.sb.from('brand_posts')
          .select('entity_id,content,engagement_total,hashtags')
          .in('entity_id', ids)
          .eq('is_competitor', true)
          .not('content', 'is', null)
          .gte('captured_at', from).lte('captured_at', to)
          .order('engagement_total', { ascending: false, nullsFirst: false })
          .limit(600);
        posts = Array.isArray(data) ? data : [];
      } catch (_) { /* señales de contenido son opcionales: si falla, no rompe el panel */ }
      const nameById = {};
      for (const r of topBlock.data) nameById[r.entity_id] = r.entity_name || '';
      const insightById = this._contentInsightsByEntity(posts, nameById);
      topBlock.data = topBlock.data.map((r) => ({ ...r, insights: (insightById[r.entity_id] || {}).insights || [] }));
    }
    return {
      window: { from, to },
      kpis:  u(kpis),
      top:   topBlock,
      risk:  u(risk),
      voice: u(voice),
      intelligence: u(intel),
      benchmark:    u(bench),
      shareOfVoice: u(sov),
      kpisPrev:     u(kpisPrev),
    };
  }

  /** Inteligencia de contenido por entidad desde el TEXTO de sus posts (rules+math,
      sin LLM). Corre una LIBRERIA de detectores estrategicos y devuelve por entidad
      `insights` = lista RANKEADA de señales estructuradas {kind, score, ...params}
      (la vista las traduce). Distintos perfiles disparan distintos detectores -> el
      panel varia en vez de repetir siempre lo mismo. Detectores:
        - winner:  el tema que DISPARA su engagement (lift = avg con-tema / avg gral).
        - focus:   concentracion tematica (un tema en >=50% de sus posts).
        - viral:   1 post concentra >=45% de su engagement (depende de virales).
        - even:    engagement repartido parejo (alcance consistente).
        - hashtag: hashtag firma (en >=45% de sus posts).
        - terms:   temas recurrentes (contexto / fallback, score bajo).
      Filtra stopwords ES/EN, urls, mentions, palabras <4 letras y el nombre propio. */
  _contentInsightsByEntity(posts, nameById = {}) {
    const STOP = this._stopwords();
    const ownTokens = this._ownNameTokens(nameById);
    const byEntity = {};
    for (const p of posts || []) {
      const eid = p.entity_id; if (!eid) continue;
      const own = ownTokens[eid] || new Set();
      const text = String(p.content || '').toLowerCase();
      const terms = new Set(), tags = new Set();
      for (const m of text.match(/#([\p{L}\p{N}_]{3,})/gu) || []) { const t = m.slice(1).replace(/_/g, ''); if (!own.has(t)) { terms.add(t); tags.add(t); } }
      for (const h of Array.isArray(p.hashtags) ? p.hashtags : []) { const t = String(h).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (t.length >= 3 && !own.has(t)) { terms.add(t); tags.add(t); } }
      const cleaned = text.replace(/https?:\/\/\S+/g, ' ').replace(/[@#][\p{L}\p{N}_]+/gu, ' ');
      for (const w of cleaned.match(/[\p{L}]{4,}/gu) || []) { const t = w.toLowerCase(); if (!STOP.has(t) && !own.has(t)) terms.add(t); }
      const e = (byEntity[eid] = byEntity[eid] || { df: {}, eng: {}, tagDf: {}, n: 0, engTotal: 0, engList: [] });
      const eng = Number(p.engagement_total) || 0;
      e.n += 1; e.engTotal += eng; e.engList.push(eng);
      for (const t of terms) { e.df[t] = (e.df[t] || 0) + 1; e.eng[t] = (e.eng[t] || 0) + eng; }
      for (const t of tags) e.tagDf[t] = (e.tagDf[t] || 0) + 1;
    }
    const out = {};
    for (const [eid, e] of Object.entries(byEntity)) {
      const n = e.n; if (!n) { out[eid] = { insights: [] }; continue; }
      const baseAvg = e.engTotal / n;
      const ins = [];
      // winner — tema que dispara engagement (soporte >=3 posts, lift>=1.5).
      if (baseAvg > 0) {
        let best = null;
        for (const [t, df] of Object.entries(e.df)) { if (df < 3) continue; const lift = (e.eng[t] / df) / baseAvg; if (lift >= 1.5 && (!best || lift > best.lift)) best = { term: t, lift: Math.round(lift * 10) / 10 }; }
        if (best) ins.push({ kind: 'winner', term: best.term, lift: best.lift, score: Math.min(96, 34 + (best.lift - 1.5) * 12) });
      }
      // focus — concentracion tematica.
      if (n >= 5) {
        const topT = Object.entries(e.df).sort((a, b) => b[1] - a[1])[0];
        if (topT) { const pct = Math.round(topT[1] / n * 100); if (pct >= 50) ins.push({ kind: 'focus', term: topT[0], pct, score: pct }); }
      }
      // viral vs even — distribucion del engagement.
      if (n >= 5 && e.engTotal > 0) {
        const share = Math.round(Math.max(...e.engList) / e.engTotal * 100);
        if (share >= 45) ins.push({ kind: 'viral', pct: share, score: share });
        else if (share <= Math.ceil(100 / n) + 6) ins.push({ kind: 'even', score: 44 });
      }
      // hashtag firma.
      const topTag = Object.entries(e.tagDf).sort((a, b) => b[1] - a[1])[0];
      if (topTag && n >= 4) { const pct = Math.round(topTag[1] / n * 100); if (pct >= 45) ins.push({ kind: 'hashtag', tag: topTag[0], pct, score: pct - 3 }); }
      // terms — contexto / fallback (score bajo, solo gana si nada mas dispara).
      const terms = Object.entries(e.df).filter(([, x]) => x >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
      if (terms.length) ins.push({ kind: 'terms', terms, score: 12 });
      ins.sort((a, b) => b.score - a.score);
      out[eid] = { insights: ins };
    }
    return out;
  }

  _ownNameTokens(nameById) {
    const ownTokens = {};
    for (const [eid, name] of Object.entries(nameById)) {
      const set = new Set();
      const clean = String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ');
      for (const w of clean.match(/[\p{L}]{3,}/gu) || []) set.add(w);
      set.add(clean.replace(/[^\p{L}\p{N}]/gu, ''));
      ownTokens[eid] = set;
    }
    return ownTokens;
  }

  _stopwords() {
    return new Set(('para como este esta esto pero porque tambien cuando donde desde sobre todo toda todos todas mucho mucha muchos muchas hasta entre antes cada solo segun estos estas esos esas otros otras otro otra mientras nuestro nuestra nuestros nuestras tiene tienen hacer hacen sido estan estar sera seran mas menos aqui alla ellos ellas quien quienes cual cuales nada algo muy sin con los las del una uno unos unas ' +
      'this that with from have your they what when will would about which there their because just like more been were them then does youre dont into over only your ' +
      'http https www com net link bio post posts reel reels story stories nan null undefined video foto photo').split(/\s+/).filter(Boolean));
  }

  /** Drill-down: posts de UN rival (on-demand, no cacheado). */
  async loadActorPosts(entityId, from, to, limit = 30) {
    if (!this.sb || !this.orgId || !entityId) return [];
    const { data, error } = await this.sb.rpc('dashboard_competencia_actor_posts', {
      p_org_id: this.orgId, p_entity_id: entityId,
      p_date_from: from, p_date_to: to, p_limit: limit, p_offset: 0, p_order_by: 'engagement',
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  /**
   * Drill-down de perfil de UN rival (FEAT-037 Fase 2 #4): actividad por periodo,
   * distribuciones de su contenido y sus mejores horas. On-demand, no cacheado.
   * Cada RPC falla de forma aislada (Promise.allSettled) → el drawer degrada por
   * seccion en vez de romperse entero.
   */
  async loadActorProfile(entityId, from, to) {
    if (!this.sb || !this.orgId || !entityId) return null;
    const org = this.orgId, ids = [entityId];
    const [act, dist, hours] = await Promise.allSettled([
      this.sb.rpc('dashboard_competencia_activity_history', { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: ids }),
      this.sb.rpc('dashboard_competencia_distributions',    { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: ids }),
      this.sb.rpc('dashboard_competencia_posting_hours',    { p_org_id: org, p_date_from: from, p_date_to: to, p_entity_ids: ids }),
    ]);
    const val = (s) => (s.status === 'fulfilled' && !s.value?.error) ? s.value.data : null;
    return {
      activity:      Array.isArray(val(act))   ? val(act)   : [],
      distributions: val(dist) || null,
      postingHours:  Array.isArray(val(hours)) ? val(hours) : [],
    };
  }
}

window.CompetenciaDataService = CompetenciaDataService;
