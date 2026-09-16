/**
 * MonitoringDataService — COMPETENCIA (/monitoring) sobre la base nueva (corte
 * ADR-0052). Conserva la interfaz que MonitoringView ya usa (loadAll,
 * loadEntityPosts, loadEntityAnalysis, create/update/deleteEntity, *Trigger,
 * *Watcher) y traduce a las tablas nuevas.
 *
 * Contrato: Git-AISC-DB docs/contratos/competencia.md (dcc7d8c, medido 16/09 15:30 UTC):
 *   · Rivales: T social.profiles(id, organization_id, market_id, network, source, handle,
 *     display_name, competitor_name, avatar_url, profile_url, followers, following,
 *     posts_count, is_active, last_seen_at, bio) — `source` competitor|monitored|reference
 *     (own = la propia marca, no se lista aquí). V social.perfiles_resumen (190000) suma
 *     posts_30d, likes_30d, comments_30d, views_30d, engagement_30d, ultimo_post.
 *   · Posts de un rival: V social.posts_view por organization_id + profile_handle + network.
 *   · Señales: T intel.signals(kind competitor_move|trend|demand|mention|vulnerability|gap|
 *     threat|opportunity, severity, title, body, source_url, observed_at, competitor_profile_id).
 *   · Cosechas: T ingest.schedules(actor_code, target, interval_minutes, status active|paused|
 *     exhausted|broken, market_id) — las 24 de WAKEUP están EN PAUSA (decisión de JC):
 *     se muestran, no se prometen. `actor_code` de T ingest.actors (apify.ig_posts…).
 *   · Las URLs vigiladas de v1 (url_watchers) no existen: las vigilancias nuevas son
 *     términos (intel.watched_terms) y temas (intel.defensive_watches).
 *   · PostgREST corta en 1.000 filas: se filtra por perfil y se limita.
 *
 * Devuelve las filas con la FORMA de v1 (intelligence_entities, intelligence_signals,
 * brand_posts) para que la vista pinte igual. Ningún `.from()` fuera de js/services.
 */
class MonitoringDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
    this._perfiles = new Map();
  }

  init(supabase, orgId) {
    this.sb = supabase || null;
    this.orgId = orgId || null;
    return this;
  }

  _invalidateCache() {
    if (window.apiClient && this.orgId) window.apiClient.invalidate(`monitoring:${this.orgId}`);
  }

  /* ── Mapeos puros (test/monitoring-datos.test.js) ─────────────────────── */

  /** social.profiles → la «entidad» de v1 que MonitoringView pinta. */
  static perfilAV1(p) {
    const handle = String(p.handle || '').replace(/^@/, '');
    return {
      id: p.id,
      organization_id: p.organization_id,
      brand_container_id: p.market_id || null,
      name: p.competitor_name || p.display_name || (handle ? `@${handle}` : '—'),
      target_identifier: handle ? `@${handle}` : (p.profile_url || ''),
      domain: 'social',
      scope: 'brand',
      is_active: p.is_active !== false,
      color: null,
      relevance: p.bio || null,
      created_at: p.created_at,
      metadata: { tipo: p.source === 'competitor' ? 'competidor_directo' : (p.source || 'monitoreado'), platform: p.network || null, highlighted: false, followers: p.followers ?? null, avatar_url: p.avatar_url || null, profile_url: p.profile_url || null },
      handle, network: p.network || null, source: p.source || null, followers: p.followers ?? null, avatar_url: p.avatar_url || null, profile_url: p.profile_url || null, last_seen_at: p.last_seen_at || null,
    };
  }

  /** intel.signals → intelligence_signals de v1. */
  static senalAV1(s) {
    return {
      id: s.id,
      entity_id: s.competitor_profile_id || null,
      signal_type: s.kind,
      severity: s.severity || null,
      content_text: [s.title, s.body].filter(Boolean).join(' — '),
      title: s.title || null,
      source_url: s.source_url || null,
      captured_at: s.observed_at || s.created_at,
    };
  }

  /** social.posts_view → brand_posts de v1. */
  static postAV1(p) {
    const n = (v) => Number(v) || 0;
    return {
      id: p.id,
      network: p.network,
      profile_handle: p.profile_handle,
      content: p.content || '',
      engagement_total: n(p.likes) + n(p.comments_count) + n(p.shares) + n(p.saves),
      reach_total: n(p.reach) || n(p.views) || n(p.impressions),
      likes: n(p.likes), comments: n(p.comments_count), shares: n(p.shares), views: n(p.views),
      captured_at: p.published_at || p.captured_at,
      published_at: p.published_at || null,
      permalink: p.permalink || null,
      post_id: p.external_id || null,
      media_assets: [],
      tone: p.tone || null,
      topics: Array.isArray(p.topics) ? p.topics : [],
      hook_type: p.hook_type || null,
    };
  }

  /** El análisis del rival a partir de sus posts (lo que hacía dashboard_competencia_actor_details). */
  static analisisDesdePosts(posts, resumen = null) {
    const horas = {}; const tonos = {}; const temas = {};
    (posts || []).forEach((p) => {
      const d = p.published_at || p.captured_at;
      if (d) { const h = new Date(d).getHours(); if (Number.isFinite(h)) horas[h] = (horas[h] || 0) + 1; }
      if (p.tone) tonos[p.tone] = (tonos[p.tone] || 0) + 1;
      (p.topics || []).forEach((t) => { temas[t] = (temas[t] || 0) + 1; });
    });
    const pico = Object.entries(horas).sort((a, b) => b[1] - a[1])[0];
    return {
      total_posts: resumen?.posts_total ?? (posts || []).length,
      posts_30d: resumen?.posts_30d ?? null,
      engagement_30d: resumen?.engagement_30d ?? null,
      likes_30d: resumen?.likes_30d ?? null,
      comments_30d: resumen?.comments_30d ?? null,
      views_30d: resumen?.views_30d ?? null,
      ultimo_post: resumen?.ultimo_post ?? ((posts || [])[0]?.published_at || null),
      peak_posting_hour: pico ? Number(pico[0]) : null,
      sentiment_distribution: tonos,
      topic_distribution: temas,
    };
  }

  /** ingest.schedules → monitoring_triggers de v1 (sensores). */
  static agendaAV1(a) {
    return {
      id: a.id, organization_id: a.organization_id, brand_container_id: a.market_id || null, entity_id: null,
      sensor_type: a.actor_code, target: a.target, cadence: 'minutes', cadence_value: String(a.interval_minutes ?? ''),
      priority: a.priority ?? 5, status: a.status, is_active: a.status === 'active', paused_reason: a.paused_reason || null,
      last_run_at: a.last_run_at || null, next_run_at: a.next_run_at || null, last_status: a.last_status || null,
      consecutive_failures: a.consecutive_failures ?? 0, config: a.config || {}, created_at: a.created_at,
    };
  }

  /* ── Lectura ─────────────────────────────────────────────────────────────── */

  async loadAll() {
    if (!this.sb || !this.orgId) return null;
    const cacheKey = `monitoring:${this.orgId}`;
    if (window.apiClient) {
      return window.apiClient.query(cacheKey, () => this._fetchAll(), { ttl: 30 * 1000, staleWhileRevalidate: true });
    }
    return this._fetchAll();
  }

  async _fetchAll() {
    const u = (s) => s.status === 'fulfilled' ? { data: s.value.data || [], error: s.value.error || null } : { data: [], error: s.reason };
    const [mercados, perfiles, agendas, senales] = await Promise.allSettled([
      this.sb.from('markets').select('id, name, is_primary').eq('organization_id', this.orgId).is('archived_at', null).order('is_primary', { ascending: false }),
      this.sb.schema('social').from('profiles').select('id, organization_id, market_id, network, source, handle, display_name, competitor_name, avatar_url, profile_url, followers, following, posts_count, is_active, last_seen_at, bio, created_at').eq('organization_id', this.orgId).in('source', ['competitor', 'monitored', 'reference']).order('created_at', { ascending: false }).limit(500),
      this.sb.schema('ingest').from('schedules').select('id, organization_id, market_id, actor_code, target, interval_minutes, status, priority, paused_reason, last_run_at, next_run_at, last_status, consecutive_failures, config, created_at').eq('organization_id', this.orgId).order('created_at', { ascending: false }).limit(500),
      this.sb.schema('intel').from('signals').select('id, kind, severity, title, body, source_url, observed_at, competitor_profile_id, created_at').eq('organization_id', this.orgId).order('observed_at', { ascending: false }).limit(300),
    ]);
    const containers = { data: (u(mercados).data || []).map((m) => ({ id: m.id, nombre_marca: m.name })), error: u(mercados).error };
    const entities = { data: (u(perfiles).data || []).map(MonitoringDataService.perfilAV1), error: u(perfiles).error };
    this._perfiles = new Map(entities.data.map((e) => [e.id, e]));
    const triggers = { data: (u(agendas).data || []).map(MonitoringDataService.agendaAV1), error: u(agendas).error };
    const signals = { data: (u(senales).data || []).map(MonitoringDataService.senalAV1), error: u(senales).error };
    // Impacto = cuántas señales apuntan al rival (el RPC de v1 no existe; las burbujas caen aquí).
    const impactByEntity = {};
    signals.data.forEach((s) => { if (s.entity_id) impactByEntity[s.entity_id] = (impactByEntity[s.entity_id] || 0) + 1; });
    [['markets', containers], ['social.profiles', entities], ['ingest.schedules', triggers], ['intel.signals', signals]].forEach(([n, r]) => { if (r.error) console.warn(`[monitoreo] ${n}:`, r.error.code || '', r.error.message || r.error); });
    return { containers, entities, triggers, watchers: { data: [], error: null }, signals, impactByEntity };
  }

  async _perfil(entityId) {
    if (this._perfiles.has(entityId)) return this._perfiles.get(entityId);
    const { data } = await this.sb.schema('social').from('profiles').select('id, organization_id, market_id, network, source, handle, display_name, competitor_name, avatar_url, profile_url, followers, is_active, last_seen_at, bio, created_at').eq('id', entityId).maybeSingle();
    if (!data) return null;
    const e = MonitoringDataService.perfilAV1(data);
    this._perfiles.set(e.id, e);
    return e;
  }

  /** Posts de un rival (social.posts_view por handle + red), forma brand_posts. */
  async loadEntityPosts(entityId, limit = 30) {
    if (!this.sb || !entityId) return { data: [], error: null };
    try {
      const e = await this._perfil(entityId);
      if (!e?.handle) return { data: [], error: null };
      let q = this.sb.schema('social').from('posts_view').select('id, network, profile_handle, content, likes, comments_count, shares, saves, views, reach, impressions, published_at, captured_at, permalink, external_id, tone, topics, hook_type').eq('organization_id', this.orgId).eq('profile_handle', e.handle).order('published_at', { ascending: false }).limit(limit);
      if (e.network) q = q.eq('network', e.network);
      const { data, error } = await q;
      return { data: (data || []).map(MonitoringDataService.postAV1), error: error || null };
    } catch (e) { return { data: [], error: e }; }
  }

  /** Ficha del rival: perfiles_resumen (190000) si existe; si no, se calcula de sus posts. */
  async loadEntityAnalysis(entityId) {
    if (!this.sb || !this.orgId || !entityId) return { data: null, error: null };
    try {
      let resumen = null;
      const r = await this.sb.schema('social').from('perfiles_resumen').select('id, posts_total, posts_30d, likes_30d, comments_30d, views_30d, engagement_30d, ultimo_post, agendas_activas').eq('id', entityId).maybeSingle();
      if (!r.error) resumen = r.data; else if (r.error.code !== '42P01' && r.error.code !== 'PGRST205') console.warn('[monitoreo] perfiles_resumen:', r.error.code, r.error.message);
      const posts = await this.loadEntityPosts(entityId, 200);
      return { data: MonitoringDataService.analisisDesdePosts(posts.data, resumen), error: null };
    } catch (e) { return { data: null, error: e }; }
  }

  /* ── Rivales (social.profiles) ───────────────────────────────────────────── */

  async createEntity(payload) {
    if (!this.sb || !this.orgId) return { error: new Error('not_ready') };
    const handle = String(payload.target_identifier || payload.handle || '').trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/.*$/, '');
    const row = {
      organization_id: this.orgId,
      market_id: payload.brand_container_id || null,
      network: payload.platform || payload.metadata?.platform || 'instagram',
      handle: handle || (payload.name || '').trim().toLowerCase().replace(/\s+/g, ''),
      source: (payload.tipo === 'monitoreado' || payload.tipo === 'referencia') ? (payload.tipo === 'referencia' ? 'reference' : 'monitored') : 'competitor',
      competitor_name: payload.name || null,
      display_name: payload.name || null,
      is_active: payload.is_active !== false,
      bio: payload.relevance != null ? (String(payload.relevance).trim() || null) : null,
    };
    const { data, error } = await this.sb.schema('social').from('profiles').insert(row).select().single();
    if (!error) { this._invalidateCache(); this._perfiles.clear(); }
    return { data: data ? MonitoringDataService.perfilAV1(data) : null, error };
  }

  async updateEntity(id, patch) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const updates = {};
    if (patch.name !== undefined) { updates.competitor_name = patch.name; updates.display_name = patch.name; }
    if (patch.target_identifier !== undefined) updates.handle = String(patch.target_identifier || '').replace(/^@/, '');
    if (patch.is_active !== undefined) updates.is_active = !!patch.is_active;
    if (patch.brand_container_id !== undefined) updates.market_id = patch.brand_container_id || null;
    if (patch.platform !== undefined) updates.network = patch.platform;
    if (patch.relevance !== undefined) updates.bio = patch.relevance ? String(patch.relevance).trim() || null : null;
    if (patch.tipo !== undefined) updates.source = patch.tipo === 'referencia' ? 'reference' : patch.tipo === 'monitoreado' ? 'monitored' : 'competitor';
    if (!Object.keys(updates).length) return { data: this._perfiles.get(id) || null, error: null };
    const { data, error } = await this.sb.schema('social').from('profiles').update(updates).eq('id', id).select().maybeSingle();
    if (!error) { this._invalidateCache(); this._perfiles.clear(); }
    if (!error && !data) return { data: null, error: Object.assign(new Error('El perfil no se guardó (¿sin permiso?).'), { code: 'sin_fila' }) };
    return { data: data ? MonitoringDataService.perfilAV1(data) : null, error };
  }

  async deleteEntity(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { data, error } = await this.sb.schema('social').from('profiles').delete().eq('id', id).select('id');
    if (!error) { this._invalidateCache(); this._perfiles.clear(); }
    if (!error && (!Array.isArray(data) || !data.length)) return { error: Object.assign(new Error('El perfil no se borró (¿sin permiso?).'), { code: 'sin_fila' }) };
    return { error };
  }

  /* ── Cosechas (ingest.schedules) — en pausa por JC: se muestran, no se prometen ── */

  static actorPara(platform) {
    return { instagram: 'apify.ig_posts', tiktok: 'apify.tt_posts', facebook: 'apify.fb_posts', youtube: 'apify.yt_videos', x: 'apify.x_posts', linkedin: 'apify.li_posts' }[String(platform || '').toLowerCase()] || null;
  }

  async createTrigger(payload) {
    if (!this.sb || !this.orgId) return { error: new Error('not_ready') };
    const actor = payload.sensor_type && String(payload.sensor_type).includes('.') ? payload.sensor_type : MonitoringDataService.actorPara(payload.platform || payload.config?.platform);
    if (!actor) return { error: Object.assign(new Error('No hay un cosechador para esa red todavía.'), { code: 'sin_actor' }) };
    const minutos = { hourly: 60, daily: 1440, weekly: 10080 }[payload.cadence] || Number(payload.cadence_value) * ({ hours: 60, days: 1440 }[payload.cadence_unit] || 1440) || 1440;
    const row = { organization_id: this.orgId, market_id: payload.brand_container_id || null, actor_code: actor, target: payload.target || payload.config?.handle || payload.config?.url || '', interval_minutes: minutos, priority: Number.isFinite(payload.priority) ? payload.priority : 5, status: 'paused', config: payload.config || {} };
    const { data, error } = await this.sb.schema('ingest').from('schedules').insert(row).select().single();
    if (!error) this._invalidateCache();
    return { data: data ? MonitoringDataService.agendaAV1(data) : null, error };
  }

  async updateTrigger(id, patch) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const updates = {};
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.paused_reason !== undefined) updates.paused_reason = patch.paused_reason;
    if (patch.priority !== undefined) updates.priority = patch.priority;
    if (patch.next_run_at !== undefined) updates.next_run_at = patch.next_run_at;
    if (patch.cadence_value !== undefined) updates.interval_minutes = Number(patch.cadence_value) || undefined;
    if (patch.config !== undefined) updates.config = patch.config;
    const { data, error } = await this.sb.schema('ingest').from('schedules').update(updates).eq('id', id).select().maybeSingle();
    if (!error) this._invalidateCache();
    return { data: data ? MonitoringDataService.agendaAV1(data) : null, error };
  }

  async deleteTrigger(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb.schema('ingest').from('schedules').delete().eq('id', id);
    if (!error) this._invalidateCache();
    return { error };
  }

  /* ── URLs vigiladas: sin equivalente (las vigilancias nuevas son términos y temas) ── */

  async createWatcher(_payload) { return { error: Object.assign(new Error('Vigilar una URL llega con la próxima versión; hoy se vigilan términos y temas.'), { code: 'en_obras' }) }; }
  async updateWatcher(_id, _patch) { return { error: Object.assign(new Error('Vigilar una URL llega con la próxima versión.'), { code: 'en_obras' }) }; }
  async deleteWatcher(_id) { return { error: Object.assign(new Error('Vigilar una URL llega con la próxima versión.'), { code: 'en_obras' }) }; }
}

window.MonitoringDataService = MonitoringDataService;
