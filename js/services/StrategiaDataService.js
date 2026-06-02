/**
 * StrategiaDataService — capa de datos del tab "Estrategia".
 *
 * Estrategia = el cerebro que unifica. Las strategic_recommendations YA cruzan
 * Mi Marca + Competencia (su rationale referencia lift interno + white space del
 * nicho). Aqui se presentan como plan de accion con aprobar/rechazar/iterar.
 *
 * RPCs (brand_container-scoped):
 *   - dashboard_strategy_master            → in_production + learning_stats + brand
 *   - dashboard_strategic_recommendations  → pendientes (proposed)
 *   - approve/reject/iterate_strategic_recommendation → acciones
 */
class StrategiaDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
    this.containerId = null;
    this.containers = [];
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    const { data } = await this.sb
      .from('brand_containers')
      .select('id, nombre_marca')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });
    this.containers = Array.isArray(data) ? data : [];
    this.containerId = this.containers[0]?.id || null;
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
    if (!this.sb || !this.containerId) return null;
    const bc = this.containerId;
    const [master, proposed] = await Promise.allSettled([
      this.sb.rpc('dashboard_strategy_master', { p_brand_container_id: bc }),
      this.sb.rpc('dashboard_strategic_recommendations', { p_brand_container_id: bc, p_status: 'proposed' }),
    ]);
    const u = (s) => this._unwrap(s);
    return { containerId: bc, master: u(master), proposed: u(proposed) };
  }

  async approve(recId) {
    const { data, error } = await this.sb.rpc('approve_strategic_recommendation', { p_rec_id: recId });
    if (error) throw error; return data;
  }
  async reject(recId, reason = '') {
    const { data, error } = await this.sb.rpc('reject_strategic_recommendation', { p_rec_id: recId, p_reason: reason });
    if (error) throw error; return data;
  }
  async iterate(recId, feedback = '') {
    const { data, error } = await this.sb.rpc('iterate_strategic_recommendation', { p_rec_id: recId, p_feedback: feedback });
    if (error) throw error; return data;
  }
}

window.StrategiaDataService = StrategiaDataService;
