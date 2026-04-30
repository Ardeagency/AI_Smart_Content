/**
 * CompetenciaDataService — capa de datos del Dashboard de Competencia.
 *
 * Llama 11 RPCs en paralelo a Supabase (todas con auth check + RLS).
 * Cada método devuelve { data, isEmpty, error } para manejo graceful.
 *
 * Spec: dashboard_competencia_spec.docx + adaptación de Partner_LLM (beta).
 */
class CompetenciaDataService {
  constructor() {
    this.sb         = null;
    this.orgId      = null;
    this.entities   = [];   // intelligence_entities competidoras de la org
    this.entityIds  = [];
    this._cache     = {};
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    this._cache = {};

    // Cargar lista de competidores (entities con tipo competidor / referencia_cultural)
    const { data, error } = await this.sb
      .from('intelligence_entities')
      .select('id, name, target_identifier, domain, metadata, is_active')
      .eq('organization_id', orgId)
      .order('name');

    if (!error && data) {
      this.entities = data.filter(e => {
        const tipo = e?.metadata?.tipo;
        return tipo === 'competidor_directo' || tipo === 'competidor_indirecto' || tipo === 'referencia_cultural';
      });
      this.entityIds = this.entities.map(e => e.id);
    }
    return this;
  }

  _windowToDates(windowDays = 30) {
    const now = new Date();
    const from = new Date(now.getTime() - Math.max(1, Number(windowDays)) * 86400_000);
    return { date_from: from.toISOString(), date_to: now.toISOString() };
  }

  _ok(data) {
    return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null };
  }
  _err(error) { return { data: null, isEmpty: true, error }; }

  /* ── Carga total en paralelo ─────────────────────────────── */
  async loadAll(windowDays = 30, entityIds = null) {
    if (!this.sb || !this.orgId) return null;
    const { date_from, date_to } = this._windowToDates(windowDays);
    const eids = entityIds && entityIds.length ? entityIds : null;

    const [
      kpis, top, featured, distributions, postingHours,
      topPosts, risk, activityHistory, brandVsComp,
      topTopics, topHashtags, topTones,
    ] = await Promise.allSettled([
      this.sb.rpc('dashboard_competencia_kpis',     { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids }),
      this.sb.rpc('dashboard_competencia_top',      { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids, p_limit: 10 }),
      this.sb.rpc('dashboard_competencia_featured', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids }),
      this.sb.rpc('dashboard_competencia_distributions', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids }),
      this.sb.rpc('dashboard_competencia_posting_hours', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids }),
      this.sb.rpc('dashboard_competencia_top_posts',     { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids, p_limit: 12 }),
      this.sb.rpc('dashboard_competencia_risk',          { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids, p_limit: 5 }),
      this.sb.rpc('dashboard_competencia_activity_history', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_entity_ids: eids }),
      this.sb.rpc('dashboard_brand_vs_competencia',      { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: null, p_entity_ids: eids }),
      this.sb.rpc('dashboard_estrategia_topics',         { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: null, p_post_source: 'competitor', p_limit: 12 }),
      this.sb.rpc('dashboard_estrategia_hashtags',       { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: null, p_post_source: 'competitor', p_limit: 12 }),
      this.sb.rpc('dashboard_estrategia_tones',          { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: null, p_post_source: 'competitor', p_limit: 12 }),
    ]);

    const unwrap = (s) => {
      if (s.status === 'rejected') return this._err(s.reason);
      if (s.value?.error) return this._err(s.value.error);
      return this._ok(s.value?.data);
    };

    return {
      entities:        this.entities,
      kpis:            unwrap(kpis),
      top:             unwrap(top),
      featured:        unwrap(featured),
      distributions:   unwrap(distributions),
      postingHours:    unwrap(postingHours),
      topPosts:        unwrap(topPosts),
      risk:            unwrap(risk),
      activityHistory: unwrap(activityHistory),
      brandVsComp:     unwrap(brandVsComp),
      topTopics:       unwrap(topTopics),
      topHashtags:     unwrap(topHashtags),
      topTones:        unwrap(topTones),
    };
  }

  /** Búsqueda de competidores por nombre (autocomplete). */
  async search(query, limit = 10) {
    if (!this.sb || !this.orgId) return [];
    const { data, error } = await this.sb.rpc('dashboard_competencia_search', {
      p_org_id: this.orgId, p_search_query: query || '', p_limit: limit,
    });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  }

  /** Detalle profundo de un competidor específico. */
  async getActorDetails(entityId, windowDays = null) {
    if (!this.sb || !this.orgId) return null;
    const win = windowDays != null ? this._windowToDates(windowDays) : { date_from: null, date_to: null };
    const { data, error } = await this.sb.rpc('dashboard_competencia_actor_details', {
      p_org_id: this.orgId, p_entity_id: entityId, p_date_from: win.date_from, p_date_to: win.date_to,
    });
    return error ? null : data;
  }
}

window.CompetenciaDataService = CompetenciaDataService;
