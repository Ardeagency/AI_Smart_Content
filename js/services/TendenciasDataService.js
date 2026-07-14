/**
 * TendenciasDataService — capa de datos del tab "Tendencias".
 *
 * Tendencias = el pulso del MUNDO y del NICHO (la lente externa de Vera).
 * No es lo que tu marca hace (Mi Marca) ni lo que hace tu competencia
 * (Competencia): es lo que se mueve afuera y aun nadie capitaliza.
 *
 * RPCs (org-scoped, gate: is_org_member OR is_owner — funcionan en browser):
 *   - dashboard_tendencias_niche_signals  → señales emergentes (keywords con velocidad)  [VIVO: trend_topics]
 *   - dashboard_tendencias_content_gaps   → oceanos azules (mercado habla / competencia no cubre)  [VIVO: trend_topics + post_patterns]
 *
 * DESACTIVADOS (2026-07-14): el motor de tendencias externo (Apify/OpenAI/NewsAPI) dejo de
 * escribir a mediados de mayo-2026 (quotas agotadas). Las RPCs que dependian de sus tablas
 * sirven datos congelados o vacios, asi que NO se llaman para no mostrar informacion muerta
 * como si fuera actual (cero datos falsos). La unica fuente viva es `trend_topics` (fresco a
 * diario via monitoreo social de Meta), que alimenta las 2 RPCs de arriba.
 *   - dashboard_tendencias_kpis           → NUNCA se renderizaba en este tab (lo usa Competencia)
 *   - dashboard_tendencias_market_pulse   → NUNCA se renderizaba; ademas lee MVs casi vacias
 *   - dashboard_tendencias_lexicon_emergence → dimension_lexicon congelado desde 2026-05-04
 *   - dashboard_tendencias_emerging_brands   → emerging_brand_candidates congelado desde 2026-05-06
 *   - dashboard_tendencias_real_world        → real_world_signals nunca se poblo en prod (0 filas)
 * Reactivar cualquiera = revivir su pipeline en ai-engine y volver a llamarla aqui.
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
    const [signals, gaps, cmoBrief] = await Promise.allSettled([
      this.sb.rpc('dashboard_tendencias_niche_signals', { p_org_id: org, p_window_d: w, p_limit: 40 }),
      this.sb.rpc('dashboard_tendencias_content_gaps',  { p_org_id: org, p_window_d: w, p_limit: 16 }),
      this.sb.from('brand_cmo_brief').select('headline, body').eq('organization_id', org).eq('scope', 'tendencias').limit(1)
        .then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })),
    ]);
    const u = (s) => this._unwrap(s);
    // Secciones sin fuente viva (lexicon/brands/world) quedan undefined a proposito:
    // sus _buildTend*() se auto-ocultan cuando la data viene vacia.
    return {
      windowDays: w,
      cmoBrief: u(cmoBrief),
      signals:  u(signals),
      gaps:     u(gaps),
    };
  }
}

window.TendenciasDataService = TendenciasDataService;
