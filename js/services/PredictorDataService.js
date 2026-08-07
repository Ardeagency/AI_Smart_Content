/**
 * PredictorDataService — capa de datos del Predictor.
 *
 * Lectura: va directo a `predictor_runs` (no hay RPC de por medio). La RLS de la
 * tabla ya limita a la organizacion del usuario, asi que el filtro por org aqui
 * es de intencion, no de seguridad.
 *
 * Escritura: NO existe por Supabase. Lanzar una prediccion levanta un proceso en
 * el server, que el navegador no puede hacer — va por /api/predictor/run.
 */
class PredictorDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    return this;
  }

  /** Corridas de la organizacion, mas recientes primero. */
  async listar(limite = 40) {
    if (!this.sb || !this.orgId) return { data: [], error: null };

    // `.from()` devuelve un builder: sin await no hay promesa que rechace y el
    // .catch() no atrapa nada. Por eso se await-ea y se lee `error` del objeto.
    const { data, error } = await this.sb
      .from('predictor_runs')
      .select('id, titulo, pregunta, estado, etapa, origen, rondas, agentes, nodos, ' +
              'veredicto, costo_usd, error, created_at, started_at, finished_at')
      .eq('organization_id', this.orgId)
      .order('created_at', { ascending: false })
      .limit(limite);

    return { data: data || [], error: error || null };
  }

  /** Una corrida con su reporte completo (solo cuando se pide, pesa). */
  async detalle(runId) {
    if (!this.sb || !runId) return { data: null, error: null };

    const { data, error } = await this.sb
      .from('predictor_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', this.orgId)
      .maybeSingle();

    return { data: data || null, error: error || null };
  }

  /**
   * Lanza una prediccion. Devuelve rapido con el id: la corrida dura minutos u
   * horas y su avance se lee despues de la tabla.
   */
  async lanzar({ pregunta, titulo, contextoExtra, rondas, plataforma }) {
    const { data: { session } } = await this.sb.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      return { data: null, error: new Error('Tu sesión expiró. Vuelve a iniciar sesión.') };
    }

    const r = await fetch('/api/predictor/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: this.orgId,
        pregunta,
        titulo: titulo || null,
        contextoExtra: contextoExtra || null,
        rondas: rondas || 5,
        plataforma: plataforma || 'parallel',
      }),
    });

    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { data: null, error: new Error(json.error || `Error ${r.status}`) };
    return { data: json, error: null };
  }
}

window.PredictorDataService = PredictorDataService;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PredictorDataService;
}
