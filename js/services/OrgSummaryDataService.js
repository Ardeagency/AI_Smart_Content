/**
 * OrgSummaryDataService — el resumen de TODO lo que tiene una organizacion.
 *
 * Alimenta la pestana General de /organization, que dejo de ser un formulario
 * para pasar a responder "que hay aqui": el plan y los creditos, a quien le
 * habla la marca, que audiencias esta recibiendo, a quien vigila, cuantas
 * estrategias tiene sin usar, y como esta la pauta.
 *
 * Las lecturas viven en un service y NO en la vista por dos razones. La primera
 * es el ratchet de eslint (`--max-warnings 628`): cada `supabase.from()` dentro
 * de una vista suma warning y una vista nueva puede tumbar el CI sin dar un solo
 * error. La segunda es que este resumen se va a querer en mas de un sitio.
 *
 * DOS TRAMPAS DE DATOS medidas contra la base viva el 2026-09-09, que este
 * archivo esquiva a proposito:
 *
 * 1. `campaigns.status` viene en MINUSCULA (active/paused/draft) y
 *    `brand_ads.status` en MAYUSCULA (ACTIVE/PAUSED/ADSET_PAUSED/...). Comparar
 *    con la misma constante en las dos da cero en una de ellas, en silencio.
 *
 * 2. El gasto de pauta NO tiene moneda propia: `ad_insights_daily` no lleva
 *    columna de divisa y las campanas de una misma org conviven en COP y USD.
 *    Sumar `spend` a secas da un numero sin unidad — en WAKEUP daban 18.634.222,
 *    que rotulado con "$" se lee como dieciocho millones de dolares cuando son
 *    pesos (~US$4.600). Por eso el gasto se lee de `campaigns.cached_spend`,
 *    que trae el importe y `budget_currency` EN LA MISMA FILA, y se agrupa por
 *    moneda. Un total sin moneda no se muestra.
 */
class OrgSummaryDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
    this.brandContainerId = null;
  }

  async init(supabase, orgId, brandContainerId = null) {
    this.sb = supabase;
    this.orgId = orgId;
    this.brandContainerId = brandContainerId;
    return this;
  }

  /**
   * Todo el resumen en paralelo. Cada bloque falla solo: si una tabla revienta,
   * el resto del resumen sigue en pie con ese bloque en null, en vez de dejar la
   * pestana entera vacia por un error de una consulta.
   */
  async cargar() {
    if (!this.sb || !this.orgId) return null;
    const [plan, creditos, mercado, audiencias, vigilancia, estrategias, pauta] =
      await Promise.all([
        this._plan(), this._creditos(), this._mercado(), this._audiencias(),
        this._vigilancia(), this._estrategias(), this._pauta(),
      ]);
    return { plan, creditos, mercado, audiencias, vigilancia, estrategias, pauta };
  }

  /**
   * Bitacora de quien hizo que. NO hay tabla de actividad: se arma juntando el
   * `created_by`/`user_id` de las tablas que SI lo guardan, y se ordena por
   * fecha.
   *
   * COBERTURA REAL, medida en la base viva el 2026-09-09 (org WAKEUP). Esto no
   * es un detalle: define lo que la vista puede y no puede afirmar.
   *   flow_runs 2/2 con autor · runs_outputs 4/4 · ai_conversations 2/2
   *   audience_personas 2 de 8 · campaigns 1 de 107 (!)
   *   monitoring_triggers 0 de 23 · url_watchers 0 de 4 · predictor_runs 0 de 3
   *
   * Es decir: crear un perfil a monitorear —una de las acciones que se querian
   * ver— HOY NO GUARDA QUIEN LO HIZO. Por eso esas tablas no se consultan aqui:
   * traerlas sin autor obligaria a inventar una atribucion o a mostrar filas
   * "por alguien", y las dos cosas son peores que decir que no se sabe. La vista
   * declara la laguna en vez de disimularla; el arreglo de fondo es empezar a
   * escribir created_by en esas tablas, no maquillarlo aqui.
   */
  async actividad(limite = 40) {
    if (!this.sb || !this.orgId) return null;
    const desde = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const pedir = async (tabla, campoAutor, campos, tipo, etiqueta) => {
      try {
        const { data } = await this.sb
          .from(tabla)
          .select(`${campoAutor}, created_at, ${campos}`)
          .eq('organization_id', this.orgId)
          .not(campoAutor, 'is', null)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(limite);
        return (data || []).map((f) => ({
          tipo,
          etiqueta,
          userId: f[campoAutor],
          fecha: f.created_at,
          detalle: f.nombre_campana || f.name || f.titulo || f.title || null,
        }));
      } catch (_) { return []; }
    };

    const grupos = await Promise.all([
      pedir('runs_outputs', 'user_id', 'id', 'contenido', 'Generó contenido'),
      pedir('flow_runs', 'user_id', 'id', 'produccion', 'Ejecutó una producción'),
      pedir('audience_personas', 'created_by', 'name', 'audiencia', 'Creó una audiencia'),
      pedir('campaigns', 'created_by', 'nombre_campana', 'campana', 'Creó una campaña'),
      pedir('canvas_strategies', 'created_by', 'name', 'estrategia', 'Trabajó en estrategia'),
      pedir('ai_conversations', 'user_id', 'title', 'vera', 'Conversó con Vera'),
    ]);

    const eventos = grupos.flat()
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, limite);

    return { eventos, sinAutoria: ['monitoring_triggers', 'url_watchers', 'predictor_runs'] };
  }

  async _plan() {
    try {
      const { data: sub } = await this.sb
        .from('subscriptions')
        .select('plan_id, status, current_period_end')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub?.plan_id) return { nombre: null, estado: null };
      const { data: plan } = await this.sb
        .from('plans')
        .select('name, price_usd_month, credits_monthly')
        .eq('id', sub.plan_id)
        .maybeSingle();
      return {
        nombre: plan?.name || sub.plan_id,
        estado: sub.status || null,
        precioMes: plan?.price_usd_month ?? null,
        creditosMes: plan?.credits_monthly ?? null,
      };
    } catch (_) { return null; }
  }

  async _creditos() {
    try {
      const { data } = await this.sb
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', this.orgId)
        .maybeSingle();
      if (!data) return null;
      const total = Number(data.credits_total) || 0;
      const disponibles = Number(data.credits_available) || 0;
      return {
        total,
        disponibles,
        usados: Math.max(0, total - disponibles),
        // Sin total no hay porcentaje: dividir por cero pintaria una barra llena
        // o vacia al azar, y ninguna de las dos seria cierta.
        pctUsado: total > 0 ? Math.min(100, Math.round(((total - disponibles) / total) * 100)) : null,
      };
    } catch (_) { return null; }
  }

  /** A quien le habla la marca: mercado, idiomas, nicho y arquetipo. */
  async _mercado() {
    try {
      const { data } = await this.sb
        .from('brand_containers')
        .select('id, nombre_marca, mercado_objetivo, idiomas_contenido, nicho_core, sub_nichos, arquetipo, propuesta_valor')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: true });
      return Array.isArray(data) ? data : [];
    } catch (_) { return null; }
  }

  /**
   * Audiencias declaradas y si alguien midio que tan alineadas estan.
   * `alignment_score` es la unica senal de "esta funcionando esa direccion" que
   * existe en el esquema; hoy esta en cero filas, y el resumen lo dice en vez de
   * inventar un porcentaje.
   */
  async _audiencias() {
    try {
      const { data } = await this.sb
        .from('audience_personas')
        .select('id, name, alignment_score, is_active')
        .eq('organization_id', this.orgId);
      const filas = Array.isArray(data) ? data : [];
      const conScore = filas.filter((a) => a.alignment_score != null);
      return {
        total: filas.length,
        nombres: filas.map((a) => a.name).filter(Boolean),
        medidas: conScore.length,
        alineacionMedia: conScore.length
          ? Math.round(conScore.reduce((s, a) => s + Number(a.alignment_score || 0), 0) / conScore.length)
          : null,
      };
    } catch (_) { return null; }
  }

  /** A quienes se esta raspando: entidades vigiladas activas, por rol. */
  async _vigilancia() {
    try {
      const { data } = await this.sb
        .from('intelligence_entities')
        .select('id, name, is_active, metadata')
        .eq('organization_id', this.orgId)
        .eq('is_active', true);
      const filas = Array.isArray(data) ? data : [];
      const porRol = {};
      filas.forEach((e) => {
        const rol = e?.metadata?.tipo || 'sin_rol';
        porRol[rol] = (porRol[rol] || 0) + 1;
      });
      return { total: filas.length, porRol, nombres: filas.map((e) => e.name).filter(Boolean) };
    } catch (_) { return null; }
  }

  /** Estrategias propuestas por Vera y cuantas se movieron de "propuesta". */
  async _estrategias() {
    try {
      const { data } = await this.sb
        .from('strategic_recommendations')
        .select('id, status')
        .eq('organization_id', this.orgId);
      const filas = Array.isArray(data) ? data : [];
      const porEstado = {};
      filas.forEach((r) => {
        const e = r.status || 'sin_estado';
        porEstado[e] = (porEstado[e] || 0) + 1;
      });
      return { total: filas.length, porEstado };
    } catch (_) { return null; }
  }

  /**
   * Pauta: campanas, anuncios y plata. Ojo con el casing de `status`, que difiere
   * entre las dos tablas (ver cabecera), y con la moneda del gasto.
   */
  async _pauta() {
    try {
      const [{ data: camp }, { data: ads }] = await Promise.all([
        this.sb.from('campaigns')
          .select('id, status, budget_currency, cached_spend, cached_conversions, metrics_cached_at')
          .eq('organization_id', this.orgId),
        this.sb.from('brand_ads')
          .select('id, status')
          .eq('organization_id', this.orgId),
      ]);

      const campanas = Array.isArray(camp) ? camp : [];
      const anuncios = Array.isArray(ads) ? ads : [];

      // campaigns.status en minuscula.
      const cEstado = (s) => String(s || '').toLowerCase();
      // brand_ads.status en mayuscula, y pausado tiene tres sabores
      // (PAUSED, ADSET_PAUSED, CAMPAIGN_PAUSED): se agrupan por substring.
      const aEstado = (s) => String(s || '').toUpperCase();

      const gastoPorMoneda = {};
      let conversiones = 0;
      let ultimoSync = null;
      campanas.forEach((c) => {
        const monto = Number(c.cached_spend);
        if (Number.isFinite(monto) && monto > 0) {
          const moneda = c.budget_currency || null;
          // Un importe sin moneda no se suma a nada: preferimos no mostrarlo
          // antes que mezclarlo con otra divisa.
          if (moneda) gastoPorMoneda[moneda] = (gastoPorMoneda[moneda] || 0) + monto;
        }
        conversiones += Number(c.cached_conversions) || 0;
        if (c.metrics_cached_at && (!ultimoSync || c.metrics_cached_at > ultimoSync)) {
          ultimoSync = c.metrics_cached_at;
        }
      });

      return {
        campanas: {
          total: campanas.length,
          activas: campanas.filter((c) => cEstado(c.status) === 'active').length,
          pausadas: campanas.filter((c) => cEstado(c.status) === 'paused').length,
          borradores: campanas.filter((c) => cEstado(c.status) === 'draft').length,
        },
        anuncios: {
          total: anuncios.length,
          activos: anuncios.filter((a) => aEstado(a.status) === 'ACTIVE').length,
          pausados: anuncios.filter((a) => aEstado(a.status).includes('PAUSED')).length,
          conProblema: anuncios.filter((a) => ['DISAPPROVED', 'WITH_ISSUES'].includes(aEstado(a.status))).length,
        },
        gastoPorMoneda,
        conversiones,
        ultimoSync,
      };
    } catch (_) { return null; }
  }
}

window.OrgSummaryDataService = OrgSummaryDataService;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrgSummaryDataService;
}
