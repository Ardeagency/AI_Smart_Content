/**
 * TendenciasDataService — capa de datos del tab "Tendencias".
 *
 * Tendencias = el pulso del MUNDO y del NICHO (la lente externa de Vera).
 * No es lo que tu marca hace (Mi Marca) ni lo que hace tu competencia
 * (Competencia): es lo que se mueve afuera y aun nadie capitaliza.
 *
 * RPCs (org-scoped, gate: is_org_member OR is_owner — funcionan en browser):
 * Doctrina: Tendencias aprende del NICHO/COMPETIDORES, NUNCA de referentes
 * (intelligence_entities.metadata.tipo=referencia_cultural). niche_signals y kpis solo
 * cuentan competidor_*; content_gaps excluye referentes de su señal de mercado.
 *
 *   - dashboard_tendencias_audience_demand → demanda de busqueda del nicho  [VIVO: audience_demand_signals via SerpApi/Google Trends]
 *   - dashboard_tendencias_niche_signals  → señales de competidores (velocidad real)  [VIVO: trend_topics competidor_*]
 *   - dashboard_tendencias_content_gaps   → oceanos azules (mercado habla / competencia no cubre)  [VIVO: trend_topics + post_patterns + audience_demand]
 *   - dashboard_tendencias_real_world     → sincronizacion con el mundo (festivos)  [VIVO: real_world_signals via world_calendar task]
 *
 * RETIRADOS (2026-07-14): NO se llaman (cero datos falsos). Reactivar = revivir su
 * pipeline en ai-engine y volver a llamarla aqui.
 *   - dashboard_tendencias_kpis           → tira de KPIs retirada por decision de producto
 *   - dashboard_tendencias_market_pulse   → lee MVs casi vacias (sus tablas-fuente murieron)
 *   - dashboard_tendencias_lexicon_emergence → ELIMINADO 2026-07-23 junto con dimension_lexicon
 *   - dashboard_tendencias_emerging_brands   → emerging_brand_candidates congelado desde 2026-05-06
 */
class TendenciasDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
    this.windowDays = 90;
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    return this;
  }

  setWindow(days) {
    const n = Number(days);
    if (Number.isFinite(n) && n > 0) this.windowDays = n;
    return this;
  }

  _ok(data)  { return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null }; }
  _err(error){ return { data: null, isEmpty: true, error }; }
  _unwrap(s) {
    if (s.status === 'rejected') return this._err(s.reason);
    if (s.value?.error) return this._err(s.value.error);
    return this._ok(s.value?.data);
  }

  async loadAll() {
    if (!this.sb || !this.orgId) return null;
    const org = this.orgId;
    const w = this.windowDays;
    const [signals, gaps, demand, world, cmoBrief] = await Promise.allSettled([
      this.sb.rpc('dashboard_tendencias_niche_signals',   { p_org_id: org, p_window_d: w, p_limit: 40 }),
      this.sb.rpc('dashboard_tendencias_content_gaps',    { p_org_id: org, p_window_d: w, p_limit: 16 }),
      this.sb.rpc('dashboard_tendencias_audience_demand', { p_org_id: org, p_window_d: w, p_limit: 50 }),
      this.sb.rpc('dashboard_tendencias_real_world',      { p_org_id: org, p_lookahead_days: 90, p_limit_holidays: 16, p_limit_history: 6 }),
      this.sb.from('brand_cmo_brief').select('headline, body').eq('organization_id', org).eq('scope', 'tendencias').limit(1)
        .then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })),
    ]);
    const u = (s) => this._unwrap(s);
    // Secciones aun sin fuente viva (brands) quedan undefined a proposito:
    // sus _buildTend*() se auto-ocultan cuando la data viene vacia.
    return {
      windowDays: w,
      cmoBrief: u(cmoBrief),
      signals:  u(signals),
      gaps:     u(gaps),
      demand:   u(demand),
      world:    u(world),
    };
  }
}

window.TendenciasDataService = TendenciasDataService;
