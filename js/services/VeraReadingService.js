/**
 * VeraReadingService — capa de datos de las LECTURAS DE VERA del dashboard.
 *
 * Rediseño 2026-07 ("centro de inteligencia de marca"): las lecturas de las 4
 * pestañas dejan de ser el brief one-shot de brand_cmo_brief y pasan a ser el
 * JSON de bloques tipados que VERA produce en su Sesión Dashboard agéntica
 * (ai-engine → vera_dashboard_readings). El frontend SOLO renderiza — sin
 * analizador intermedio.
 *
 * RPCs (SECURITY DEFINER, scoped por is_org_member):
 *   - get_vera_reading(p_brand_container_id, p_scope)      → lectura vigente
 *   - get_vera_reading_history(p_brand_container_id, ...)  → historial
 *   - get_vera_evidence(p_reading_id, p_evidence_key)      → "ver la prueba"
 *
 * ROLLOUT: si una org aún no tiene lecturas (la sesión no ha corrido), todas
 * las funciones devuelven null y cada tab conserva su hero actual (cmo_brief /
 * rule-based). El switch es automático por existencia — sin flag aparte.
 */
class VeraReadingService {
  constructor() {
    this.sb = null;
    this.orgId = null;
    this.containerId = null;
    this.containers = [];
    this._cache = new Map();   // scope → { at, res } (TTL corto: el tab se re-visita mucho)
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

  /** Cambia la marca activa (filtro de marca del dashboard). Invalida el cache. */
  setContainer(brandContainerId) {
    const next = brandContainerId || this.containers[0]?.id || null;
    if (next !== this.containerId) this._cache.clear();
    this.containerId = next;
  }

  /**
   * Lectura vigente de una sección. Devuelve el jsonb de la RPC:
   * { reading_id, reading:{headline,narrative[],evidence{},meta}, status,
   *   schema_version, created_at, window_start, window_end, model } — o null.
   * NUNCA lanza: un fallo aquí jamás debe tumbar el tab (shadow-safe).
   */
  async getReading(scope, { ttlMs = 60_000 } = {}) {
    if (!this.sb || !this.containerId || !scope) return null;
    const key = `${this.containerId}:${scope}`;
    const hit = this._cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.res;
    try {
      const { data, error } = await this.sb.rpc('get_vera_reading', {
        p_brand_container_id: this.containerId,
        p_scope: scope,
      });
      if (error) { console.warn('[VeraReading] rpc error:', error.message); return null; }
      // Válida si trae headline (lectura estructurada) O es formato libre
      // (diagnóstico que Vera diseñó a su manera — HTML/JSON, sin headline).
      const r = data && data.reading;
      const res = r && (r.headline || r.free) ? data : null;
      this._cache.set(key, { at: Date.now(), res });
      return res;
    } catch (e) {
      console.warn('[VeraReading] getReading failed:', e?.message || e);
      return null;
    }
  }

  /** Resuelve una referencia de evidencia ("ver la prueba"). Null si no resuelve. */
  async getEvidence(readingId, evidenceKey) {
    if (!this.sb || !readingId || !evidenceKey) return null;
    try {
      const { data, error } = await this.sb.rpc('get_vera_evidence', {
        p_reading_id: readingId,
        p_evidence_key: evidenceKey,
      });
      if (error) { console.warn('[VeraReading] evidence rpc error:', error.message); return null; }
      return data || null;
    } catch (e) {
      console.warn('[VeraReading] getEvidence failed:', e?.message || e);
      return null;
    }
  }

  /** Historial de lecturas de una sección (para deltas / "qué dijo antes"). */
  async getHistory(scope, limit = 8) {
    if (!this.sb || !this.containerId) return [];
    try {
      const { data, error } = await this.sb.rpc('get_vera_reading_history', {
        p_brand_container_id: this.containerId,
        p_scope: scope,
        p_limit: limit,
      });
      if (error) return [];
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  invalidate() { this._cache.clear(); }
}

window.VeraReadingService = VeraReadingService;
