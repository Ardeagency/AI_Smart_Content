/**
 * MiBrandaDataService — capa de datos del Dashboard Mi Marca.
 *
 * Llama a las RPCs `dashboard_brand_*` desplegadas en Supabase, en paralelo
 * y con auth + RLS. Cada método devuelve { data, isEmpty, error } para manejo
 * graceful en la vista. Sigue el mismo patrón que CompetenciaDataService.
 */
class MiBrandaDataService {
  constructor() {
    this.sb           = null;   // cliente Supabase
    this.orgId        = null;   // organization_id activa
    this.containers   = [];     // brand_containers de la org
    this.containerIds = [];
    this._cache       = {};
  }

  /* ── Inicialización ──────────────────────────────────────── */
  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    this._cache = {};

    const { data, error } = await this.sb
      .from('brand_containers')
      .select('id, nombre_marca, organization_id')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      this.containers   = data;
      this.containerIds = data.map(c => c.id);
    }
    return this;
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  _windowToDates(windowDays = 30) {
    const now = new Date();
    const from = new Date(now.getTime() - Math.max(1, Number(windowDays)) * 86400_000);
    return { date_from: from.toISOString(), date_to: now.toISOString() };
  }

  _resolveWindow(opts = {}) {
    if (opts.dateFromIso && opts.dateToIso) {
      return { date_from: opts.dateFromIso, date_to: opts.dateToIso };
    }
    return this._windowToDates(opts.windowDays || 30);
  }

  _resolveBrands(opts = {}) {
    const ids = Array.isArray(opts.brandIds) && opts.brandIds.length
      ? opts.brandIds
      : null;
    return ids;
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

  /* ══════════════════════════════════════════════════════════
     Carga total — Promise.allSettled para resiliencia
     Cacheado vía apiClient: 60s TTL + stale-while-revalidate. Cambios en
     brand_vulnerabilities / vera_pending_actions / etc invalidan vía router
     (DashboardView._onRealtimeChange → cache key prefix `dash:mi-brand:`).
  ══════════════════════════════════════════════════════════ */
  async loadAll(opts = {}) {
    if (!this.sb || !this.orgId) return null;
    const { date_from, date_to } = this._resolveWindow(opts);
    const bcids = this._resolveBrands(opts);

    // Cache key estable: org + ventana + brands. Si window cambia (filtro UI),
    // se fetchea de nuevo. Si nada cambia, devolvemos resultado fresco en RAM.
    const cacheKey = `dash:mi-brand:${this.orgId}:${date_from}:${date_to}:${(bcids || []).join(',')}`;
    if (window.apiClient) {
      return window.apiClient.query(
        cacheKey,
        () => this._fetchAll(date_from, date_to, bcids),
        { ttl: 60 * 1000, staleWhileRevalidate: true }
      );
    }
    return this._fetchAll(date_from, date_to, bcids);
  }

  /** Implementación real del fetch (separada para que apiClient pueda envolverla). */
  async _fetchAll(date_from, date_to, bcids) {
    const POST_SOURCE = 'own';
    const args = (extra = {}) => ({
      p_org_id: this.orgId,
      p_date_from: date_from,
      p_date_to: date_to,
      p_brand_container_ids: bcids,
      p_post_source: POST_SOURCE,
      ...extra,
    });

    const [
      kpis, alerts, activity, engagement, postingHours,
      sentiment, topPosts, vsCompetencia,
      featProfile, featTopic, featHashtag, featHour, featPlatform, featGrowth,
      stratTopics, stratHashtags, stratTones, stratPlatforms, stratSentByBrand,
    ] = await Promise.allSettled([
      this.sb.rpc('dashboard_brand_kpis_strip', args()),
      this.sb.rpc('dashboard_brand_alert_score', args({ p_limit: 5 })),
      this.sb.rpc('dashboard_brand_activity_history', args()),
      this.sb.rpc('dashboard_brand_engagement_trend', args()),
      this.sb.rpc('dashboard_brand_posting_hours', {
        p_org_id: this.orgId,
        p_brand_container_ids: bcids,
        p_date_from: date_from,
        p_date_to: date_to,
        p_post_source: POST_SOURCE,
      }),
      this.sb.rpc('dashboard_brand_sentiment_activity', args()),
      this.sb.rpc('dashboard_brand_top_highlighted_posts', args({ p_limit: 10 })),
      this.sb.rpc('dashboard_brand_vs_competencia', {
        p_org_id: this.orgId,
        p_date_from: date_from,
        p_date_to: date_to,
        p_brand_container_ids: bcids,
        p_entity_ids: null,
      }),

      // 6 highlights
      this.sb.rpc('dashboard_brand_featured_profile',  args()),
      this.sb.rpc('dashboard_brand_featured_topic',    args()),
      this.sb.rpc('dashboard_brand_featured_hashtag',  args()),
      this.sb.rpc('dashboard_brand_featured_hour',     args()),
      this.sb.rpc('dashboard_brand_featured_platform', args()),
      this.sb.rpc('dashboard_brand_featured_growth',   args()),

      // Arquitectura de estrategia (post_source='own')
      this.sb.rpc('dashboard_estrategia_topics',   { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_post_source: POST_SOURCE, p_limit: 12 }),
      this.sb.rpc('dashboard_estrategia_hashtags', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_post_source: POST_SOURCE, p_limit: 12 }),
      this.sb.rpc('dashboard_estrategia_tones',    { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_post_source: POST_SOURCE, p_limit: 12 }),
      this.sb.rpc('dashboard_estrategia_platform_comparison', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_post_source: POST_SOURCE }),
      this.sb.rpc('dashboard_estrategia_sentiments_by_brand', { p_org_id: this.orgId, p_date_from: date_from, p_date_to: date_to, p_brand_container_ids: bcids, p_post_source: POST_SOURCE }),
    ]);

    const u = (s) => this._unwrap(s);
    return {
      window:       { date_from, date_to },
      brandIds:     bcids,
      containers:   this.containers,

      kpis:         u(kpis),
      alerts:       u(alerts),
      activity:     u(activity),
      engagement:   u(engagement),
      postingHours: u(postingHours),
      sentiment:    u(sentiment),
      topPosts:     u(topPosts),
      vsCompetencia: u(vsCompetencia),

      featured: {
        profile:  u(featProfile),
        topic:    u(featTopic),
        hashtag:  u(featHashtag),
        hour:     u(featHour),
        platform: u(featPlatform),
        growth:   u(featGrowth),
      },

      strategy: {
        topics:           u(stratTopics),
        hashtags:         u(stratHashtags),
        tones:            u(stratTones),
        platforms:        u(stratPlatforms),
        sentimentsByBrand: u(stratSentByBrand),
      },
    };
  }

  /** Drill-down de una marca específica. */
  async getBrandDetails(brandContainerId, opts = {}) {
    if (!this.sb || !this.orgId || !brandContainerId) return null;
    const { date_from, date_to } = this._resolveWindow(opts);
    const { data, error } = await this.sb.rpc('dashboard_brand_featured_profile_details', {
      p_org_id: this.orgId,
      p_brand_container_id: brandContainerId,
      p_date_from: date_from,
      p_date_to: date_to,
      p_post_source: 'own',
    });
    return error ? null : data;
  }
}

window.MiBrandaDataService = MiBrandaDataService;
