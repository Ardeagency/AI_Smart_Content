/**
 * TendenciasDataService — capa de datos del Dashboard Tendencias.
 *
 * Llama a las 7 RPCs `dashboard_tendencias_*` en paralelo y devuelve
 * `{ data, isEmpty, error }` por sección. Mirror del patrón
 * `MiBrandaDataService` y `CompetenciaDataService`.
 *
 * RPCs consumidas (creadas en migration_FEAT-016):
 *   dashboard_tendencias_kpis              — strip de KPIs
 *   dashboard_tendencias_audience_demand   — Google/YT Suggest agrupado
 *   dashboard_tendencias_targeted_trends   — Google News smart query
 *   dashboard_tendencias_emerging_brands   — candidatas pending/approved/rejected
 *   dashboard_tendencias_niche_signals     — trend_topics top velocity
 *   dashboard_tendencias_lexicon_emergence — vocabulario por dimension (catálogo global)
 *   dashboard_tendencias_market_pulse      — velocity/sentiment/formats desde mat-views
 */
class TendenciasDataService {
  constructor() {
    this.sb    = null;
    this.orgId = null;
    this._cache = {};
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    this._cache = {};
    return this;
  }

  _ok(data) {
    return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null };
  }
  _err(error) { return { data: null, isEmpty: true, error }; }
  _unwrap(settled) {
    if (settled.status === 'rejected') return this._err(settled.reason);
    if (settled.value?.error) return this._err(settled.value.error);
    return this._ok(settled.value?.data);
  }

  /**
   * Carga todas las secciones del dashboard en paralelo.
   * @param {object} opts
   * @param {number} [opts.windowDays=30]
   * @param {number} [opts.limitDemand=20]
   * @param {number} [opts.limitTrends=50]
   * @param {number} [opts.limitNiche=20]
   * @param {number} [opts.limitLexicon=30]
   */
  async loadAll(opts = {}) {
    if (!this.sb || !this.orgId) return null;
    const w = Number(opts.windowDays || 30);

    const [
      kpis, audience, targeted, emerging, niche, lexicon, pulse,
    ] = await Promise.allSettled([
      this.sb.rpc('dashboard_tendencias_kpis', {
        p_org_id: this.orgId,
        p_window_d: w,
      }),
      this.sb.rpc('dashboard_tendencias_audience_demand', {
        p_org_id: this.orgId,
        p_window_d: w,
        p_limit: Number(opts.limitDemand || 20),
      }),
      this.sb.rpc('dashboard_tendencias_targeted_trends', {
        p_org_id: this.orgId,
        p_window_d: w,
        p_limit: Number(opts.limitTrends || 50),
      }),
      this.sb.rpc('dashboard_tendencias_emerging_brands', {
        p_org_id: this.orgId,
      }),
      this.sb.rpc('dashboard_tendencias_niche_signals', {
        p_org_id: this.orgId,
        p_window_d: w,
        p_limit: Number(opts.limitNiche || 20),
      }),
      this.sb.rpc('dashboard_tendencias_lexicon_emergence', {
        p_org_id: this.orgId,
        p_limit: Number(opts.limitLexicon || 30),
      }),
      this.sb.rpc('dashboard_tendencias_market_pulse', {
        p_org_id: this.orgId,
      }),
    ]);

    const u = (s) => this._unwrap(s);
    return {
      windowDays: w,
      kpis:     u(kpis),
      audience: u(audience),
      targeted: u(targeted),
      emerging: u(emerging),
      niche:    u(niche),
      lexicon:  u(lexicon),
      pulse:    u(pulse),
    };
  }
}

window.TendenciasDataService = TendenciasDataService;
