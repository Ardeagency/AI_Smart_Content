/**
 * CampanasDataService — capa de datos del Dashboard "Mis Campañas" (FEAT-023).
 *
 * Llama a las 5 RPCs `dashboard_campaign_*` desplegadas en Supabase, en paralelo,
 * con auth + RLS. Cada método devuelve { data, isEmpty, error } para manejo
 * graceful en el mixin. Sigue el mismo patrón que MiBrandaDataService.
 *
 * Cache vía apiClient: 60s TTL + stale-while-revalidate. La invalidación
 * realtime la hace DashboardView._onRealtimeChange cuando llegan cambios
 * a campaigns / ad_insights_daily / campaign_briefs.
 */
class CampanasDataService {
  constructor() {
    this.sb        = null;
    this.orgId     = null;
    this.containers   = [];
    this.containerIds = [];
    this._cache    = {};
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    this._cache = {};

    const { data, error } = await this.sb
      .from('brand_containers')
      .select('id, nombre_marca, organization_id, arquetipo, propuesta_valor, nicho_core')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      this.containers   = data;
      this.containerIds = data.map(c => c.id);
    }
    return this;
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  _resolveWindow(opts = {}) {
    // RPCs aceptan `date` (no timestamptz como Mi Marca). Convertimos a YYYY-MM-DD.
    const toDate = (iso) => (iso instanceof Date ? iso : new Date(iso)).toISOString().slice(0, 10);
    if (opts.dateFromIso && opts.dateToIso) {
      return { date_from: toDate(opts.dateFromIso), date_to: toDate(opts.dateToIso) };
    }
    const windowDays = Math.max(1, Number(opts.windowDays || 30));
    const now  = new Date();
    const from = new Date(now.getTime() - windowDays * 86400_000);
    return { date_from: toDate(from), date_to: toDate(now) };
  }

  _resolveBrands(opts = {}) {
    const ids = Array.isArray(opts.brandIds) && opts.brandIds.length ? opts.brandIds : null;
    return ids;
  }

  _ok(data)  { return { data, isEmpty: !data || (Array.isArray(data) && data.length === 0), error: null }; }
  _err(error){ return { data: null, isEmpty: true, error }; }
  _unwrap(settled) {
    if (settled.status === 'rejected') return this._err(settled.reason);
    if (settled.value?.error) return this._err(settled.value.error);
    return this._ok(settled.value?.data);
  }

  /* ══════════════════════════════════════════════════════════
     Carga total — 5 RPCs en paralelo con allSettled
  ══════════════════════════════════════════════════════════ */
  async loadAll(opts = {}) {
    if (!this.sb || !this.orgId) return null;
    const { date_from, date_to } = this._resolveWindow(opts);
    const bcids = this._resolveBrands(opts);
    const platforms = Array.isArray(opts.platforms) && opts.platforms.length ? opts.platforms : null;

    const cacheKey = `dash:campanas:${this.orgId}:${date_from}:${date_to}:${(bcids || []).join(',')}:${(platforms || []).join(',')}`;
    if (window.apiClient) {
      return window.apiClient.query(
        cacheKey,
        () => this._fetchAll(date_from, date_to, bcids, platforms),
        { ttl: 60 * 1000, staleWhileRevalidate: true }
      );
    }
    return this._fetchAll(date_from, date_to, bcids, platforms);
  }

  async _fetchAll(date_from, date_to, bcids, platforms = null) {
    const baseArgs = {
      p_org_id:              this.orgId,
      p_date_from:           date_from,
      p_date_to:             date_to,
      p_brand_container_ids: bcids,
    };

    // Ventana de días para health_score: derivada del rango date_from/date_to.
    const healthWindowDays = Math.max(1, Math.round(
      (new Date(date_to).getTime() - new Date(date_from).getTime()) / 86400_000
    ));

    // Args para las RPCs featured de Mi Marca (post_source='own').
    const featuredArgs = {
      p_org_id:              this.orgId,
      p_date_from:           date_from,
      p_date_to:             date_to,
      p_brand_container_ids: bcids,
      p_post_source:         'own',
    };

    // brand_vulnerabilities abiertas: query directa al table (no hay RPC pública).
    const vulnsPromise = this.sb
      .from('brand_vulnerabilities')
      .select('id, title, description, severity, status, created_at, brand_container_id, metadata')
      .eq('organization_id', this.orgId)
      .in('status', ['open', 'in_progress'])
      .order('severity', { ascending: true })  // critical primero (alfabético works: critical<high<low<medium → ordenamos JS después si hace falta)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(r => ({ data: r.data, error: r.error }));

    const [
      health,
      kpis, list, dailySeries, winnersVsBurners, briefVsOutcome,
      featuredTopic, featuredHashtag, featuredHour, estrategiaTones,
      featuredSentiment, featuredProfile, featuredGrowth,
      whatWorks, audiencePatterns, activity, pillars, audienceEffective, evolution,
      vulnerabilities,
      optimizationInsights, alertScore,
      activityHistory, engagementTrend, sentimentActivity, postingHours,
      estrategiaTopics, topHighlightedPosts, comments,
    ] = await Promise.allSettled([
      this.sb.rpc('dashboard_mimarca_health', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_platforms: platforms,
      }),

      this.sb.rpc('dashboard_campaign_kpis_strip',         baseArgs),
      this.sb.rpc('dashboard_campaign_list',               { ...baseArgs, p_status: null }),
      this.sb.rpc('dashboard_campaign_daily_series',       { ...baseArgs, p_campaign_ids: null }),
      this.sb.rpc('dashboard_campaign_winners_vs_burners', { ...baseArgs, p_limit: 3 }),
      this.sb.rpc('dashboard_campaign_brief_vs_outcome',   { p_org_id: this.orgId, p_brief_id: null, p_date_from: date_from, p_date_to: date_to }),

      // Featured: 4 cards después de Salud
      this.sb.rpc('dashboard_brand_featured_topic',        featuredArgs),
      this.sb.rpc('dashboard_brand_featured_hashtag',      featuredArgs),
      this.sb.rpc('dashboard_brand_featured_hour',         featuredArgs),
      this.sb.rpc('dashboard_estrategia_tones',            { ...featuredArgs, p_limit: 5 }),

      // Featured backup: rellenan una card primaria que venga vacia (0 data)
      this.sb.rpc('dashboard_brand_featured_sentiment',    featuredArgs),
      this.sb.rpc('dashboard_brand_featured_profile',      featuredArgs),
      this.sb.rpc('dashboard_brand_featured_growth',       featuredArgs),

      // Mi Marca CAUSAL: lo que te impulsa / te resta por dimension (vs tu propio promedio)
      this.sb.rpc('dashboard_mimarca_what_works', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to,
        p_brand_container_ids: bcids, p_min_posts: 2, p_platforms: platforms,
      }),
      // Patrones de tu publico: resonancia emocional del contenido propio
      this.sb.rpc('dashboard_mimarca_audience_patterns', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to,
        p_brand_container_ids: bcids, p_min_posts: 2, p_platforms: platforms,
      }),
      // Actividad (ritmo propio) + Pilares narrativos
      this.sb.rpc('dashboard_mimarca_activity', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_platforms: platforms,
      }),
      this.sb.rpc('dashboard_mimarca_pillars', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_platforms: platforms,
      }),
      // Tu publico efectivo: geo + captacion (conversiones reales) — sin filtro de plataforma (es geo/leads)
      this.sb.rpc('dashboard_mimarca_audience_effective', {
        p_org_id: this.orgId, p_brand_container_ids: bcids,
      }),
      // Impacto social en el tiempo (la pelicula): serie + veredicto
      this.sb.rpc('dashboard_mimarca_evolution', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_platforms: platforms,
      }),

      vulnsPromise,

      // Plan de accion CMO-grade: recomendaciones priorizadas + momentum +
      // consistencia (server-side). p_brand_container_id es un solo uuid (no
      // array): si hay 1 marca filtrada la pasamos, si no NULL = toda la org.
      // window = el periodo seleccionado (sin cap): asi "posts analizados"
      // refleja todo el contenido real, no solo el ultimo ano. Con "Todo el
      // periodo" no hay periodo previo → trend null (la UI muestra "—").
      // La consistencia la calcula la RPC sobre el span real de los posts.
      this.sb.rpc('dashboard_brand_optimization_insights', {
        p_org_id: this.orgId,
        p_brand_container_id: (Array.isArray(bcids) && bcids.length === 1) ? bcids[0] : null,
        p_window_d: healthWindowDays,
      }),
      // Riesgo de marca (4ta card "Vigila"): risk_score, posts de riesgo, sentimiento.
      this.sb.rpc('dashboard_brand_alert_score', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to,
        p_brand_container_ids: bcids, p_limit: 5,
      }),

      // Analisis longitudinal (series temporales propias de la marca).
      this.sb.rpc('dashboard_brand_activity_history',  { ...featuredArgs }),
      this.sb.rpc('dashboard_brand_engagement_trend',  { ...featuredArgs }),
      this.sb.rpc('dashboard_brand_sentiment_activity', { ...featuredArgs }),
      this.sb.rpc('dashboard_brand_posting_hours', {
        p_org_id: this.orgId, p_brand_container_ids: bcids,
        p_date_from: date_from, p_date_to: date_to, p_post_source: 'own', p_timezone: 'America/Bogota',
      }),

      // Widgets nuevos: temas (mirror de tonos), top posts, comportamiento de
      // publico (personas) y analisis de comentarios.
      this.sb.rpc('dashboard_estrategia_topics',          { ...featuredArgs, p_limit: 5 }),
      // Top publicaciones destacadas: SIEMPRE las de mayor impacto social de todo
      // el historial (no se recorta por el filtro de fecha del dashboard) — es una
      // vitrina del mejor contenido, no un listado del periodo.
      this.sb.rpc('dashboard_brand_top_highlighted_posts', {
        ...featuredArgs, p_date_from: '2000-01-01T00:00:00Z', p_date_to: new Date().toISOString(), p_limit: 3,
      }),
      this.sb.rpc('dashboard_mimarca_comments', {
        p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to,
        p_brand_container_ids: bcids, p_platforms: platforms, p_limit: 5,
      }),
    ]);

    const u = (s) => this._unwrap(s);
    return {
      window:           { date_from, date_to },
      brandIds:         bcids,
      containers:       this.containers,

      health:           u(health),
      kpis:             u(kpis),
      list:             u(list),
      dailySeries:      u(dailySeries),
      winnersVsBurners: u(winnersVsBurners),
      briefVsOutcome:   u(briefVsOutcome),

      featured: {
        topic:    u(featuredTopic),
        hashtag:  u(featuredHashtag),
        hour:     u(featuredHour),
        tones:    u(estrategiaTones),
        topics:   u(estrategiaTopics),
        sentiment: u(featuredSentiment),
        profile:   u(featuredProfile),
        growth:    u(featuredGrowth),
      },

      topPosts:         u(topHighlightedPosts),
      comments:         u(comments),

      whatWorks: u(whatWorks),
      audiencePatterns: u(audiencePatterns),
      activity: u(activity),
      pillars: u(pillars),
      audienceEffective: u(audienceEffective),
      evolution: u(evolution),

      vulnerabilities: u(vulnerabilities),
      optimizationInsights: u(optimizationInsights),
      alertScore: u(alertScore),

      longitudinal: {
        activity:  u(activityHistory),
        engagement: u(engagementTrend),
        sentiment: u(sentimentActivity),
        hours:     u(postingHours),
      },
    };
  }

  /** Drill-down: time-series de UNA campaña específica. */
  async getCampaignDailySeries(campaignId, opts = {}) {
    if (!this.sb || !this.orgId || !campaignId) return null;
    const { date_from, date_to } = this._resolveWindow(opts);
    const { data, error } = await this.sb.rpc('dashboard_campaign_daily_series', {
      p_org_id:              this.orgId,
      p_date_from:           date_from,
      p_date_to:             date_to,
      p_brand_container_ids: null,
      p_campaign_ids:        [campaignId],
    });
    return error ? null : data;
  }

  /** Drill-down: brief vs outcome de UN brief específico. */
  async getBriefVsOutcome(briefId, opts = {}) {
    if (!this.sb || !this.orgId || !briefId) return null;
    const { date_from, date_to } = this._resolveWindow(opts);
    const { data, error } = await this.sb.rpc('dashboard_campaign_brief_vs_outcome', {
      p_org_id:    this.orgId,
      p_brief_id:  briefId,
      p_date_from: date_from,
      p_date_to:   date_to,
    });
    return error ? null : data;
  }
}

window.CampanasDataService = CampanasDataService;
