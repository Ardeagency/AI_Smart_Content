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
      // Color personalizado por perfil (intelligence_entities.color[]). El RPC top
      // no lo expone; lo traemos aparte (RLS org-scoped) para que el chart de
      // "Influencia digital" pinte cada barra con el color del perfil, o el de la
      // marca si no tiene. Mismo criterio que MonitoringView (color[0]).
      this.sb.from('intelligence_entities').select('id,color').eq('organization_id', org),
    ]);

    const u = (s) => this._unwrap(s);
    // Merge del color de cada entidad sobre las filas del ranking (por entity_id).
    const topBlock = u(top);
    if (Array.isArray(topBlock.data)) {
      const rows = (entColors.status === 'fulfilled' && !entColors.value?.error) ? (entColors.value.data || []) : [];
      const colorById = new Map(rows.map((e) => [e.id, (Array.isArray(e.color) && e.color[0]) ? e.color[0] : null]));
      topBlock.data = topBlock.data.map((r) => ({ ...r, color: colorById.get(r.entity_id) || null }));
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
