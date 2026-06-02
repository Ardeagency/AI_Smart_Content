/**
 * TendenciasDataService — capa de datos del tab "Tendencias".
 *
 * Tendencias = el pulso del MUNDO y del NICHO (la lente externa de Vera).
 * No es lo que tu marca hace (Mi Marca) ni lo que hace tu competencia
 * (Competencia): es lo que se mueve afuera y aun nadie capitaliza.
 *
 * RPCs (org-scoped, gate: is_org_member OR is_owner — funcionan en browser):
 *   - dashboard_tendencias_kpis              → pulso resumido (topics, velocity, lexicon, marcas)
 *   - dashboard_tendencias_market_pulse      → sentimiento + formatos + velocidad por tipo
 *   - dashboard_tendencias_niche_signals     → señales emergentes (keywords con velocidad)
 *   - dashboard_tendencias_content_gaps      → oceanos azules (mercado habla / competencia no cubre)
 *   - dashboard_tendencias_lexicon_emergence → lexico emergente del nicho que Vera aprende
 *   - dashboard_tendencias_emerging_brands   → marcas nuevas detectadas entrando al nicho
 *   - dashboard_tendencias_real_world        → sincronizacion con el mundo (festivos, efemerides, clima)
 *
 * Nota de calidad: top_velocity trae ruido pre-recalibracion del motor (relevance < 0.45).
 * El filtro de calidad vive en el mixin (no en la RPC) para no tocar la firma.
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
    const [kpis, pulse, signals, gaps, lexicon, brands, world] = await Promise.allSettled([
      this.sb.rpc('dashboard_tendencias_kpis',              { p_org_id: org, p_window_d: w }),
      this.sb.rpc('dashboard_tendencias_market_pulse',      { p_org_id: org }),
      this.sb.rpc('dashboard_tendencias_niche_signals',     { p_org_id: org, p_window_d: w, p_limit: 40 }),
      this.sb.rpc('dashboard_tendencias_content_gaps',      { p_org_id: org, p_window_d: w, p_limit: 16 }),
      this.sb.rpc('dashboard_tendencias_lexicon_emergence', { p_org_id: org, p_limit: 30 }),
      this.sb.rpc('dashboard_tendencias_emerging_brands',   { p_org_id: org }),
      this.sb.rpc('dashboard_tendencias_real_world',        { p_org_id: org, p_lookahead_days: 60, p_limit_holidays: 10, p_limit_history: 6 }),
    ]);
    const u = (s) => this._unwrap(s);
    return {
      windowDays: w,
      kpis:    u(kpis),
      pulse:   u(pulse),
      signals: u(signals),
      gaps:    u(gaps),
      lexicon: u(lexicon),
      brands:  u(brands),
      world:   u(world),
    };
  }
}

window.TendenciasDataService = TendenciasDataService;
