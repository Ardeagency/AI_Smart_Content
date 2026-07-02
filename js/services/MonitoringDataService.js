/**
 * MonitoringDataService — capa de datos del Centro de Monitoreo.
 *
 * CRUD sobre tres tablas con RLS por organization_id:
 *   - intelligence_entities  (perfiles a monitorear: competidores / referencias / owned)
 *   - monitoring_triggers    (sensores activos: cadencia, prioridad, estado)
 *   - url_watchers           (URLs vigiladas por hash de contenido)
 *
 * Cada método devuelve {data, error}; las listas vienen ordenadas por created_at desc.
 */
class MonitoringDataService {
  constructor() {
    this.sb     = null;
    this.orgId  = null;
  }

  init(supabase, orgId) {
    this.sb    = supabase;
    this.orgId = orgId;
    return this;
  }

  /** Invalida el cache cuando se hace un CRUD (create/update/delete). */
  _invalidateCache() {
    if (window.apiClient) window.apiClient.invalidate(`monitoring:${this.orgId}`);
  }

  /* ── Carga inicial: las 3 listas + brand_containers para selects.
        Cacheada 30s + SWR para que el back/forward sea instant. ── */
  async loadAll() {
    if (!this.sb || !this.orgId) return null;
    const cacheKey = `monitoring:${this.orgId}`;
    if (window.apiClient) {
      return window.apiClient.query(
        cacheKey,
        () => this._fetchAll(),
        { ttl: 30 * 1000, staleWhileRevalidate: true }
      );
    }
    return this._fetchAll();
  }

  async _fetchAll() {
    const [containers, entities, triggers, watchers] = await Promise.allSettled([
      this.sb.from('brand_containers')
        .select('id, nombre_marca')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: true }),
      this.sb.from('intelligence_entities')
        .select('*')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false }),
      this.sb.from('monitoring_triggers')
        .select('*')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false }),
      this.sb.from('url_watchers')
        .select('*')
        .eq('organization_id', this.orgId)
        .order('created_at', { ascending: false }),
    ]);

    const u = (s) => s.status === 'fulfilled'
      ? { data: s.value.data || [], error: s.value.error || null }
      : { data: [], error: s.reason };

    // Novedades recientes: traemos las señales detectadas por el scraper para
    // poder mostrarlas en lenguaje humano. Antes filtrábamos solo 'url_change'
    // (para el feed de páginas web); ahora traemos cualquier tipo para poder
    // decir también "novedad hace X" en las tarjetas de perfiles. Las signals
    // no tienen organization_id propio, así que filtramos por las entities ya
    // cargadas. La vista las re-indexa por entity_id y por url según convenga.
    let signals = { data: [], error: null };
    const entityIds = (u(entities).data || []).map(e => e.id);
    if (entityIds.length) {
      try {
        const { data, error } = await this.sb
          .from('intelligence_signals')
          .select('id, entity_id, signal_type, content_text, captured_at')
          .in('entity_id', entityIds)
          .order('captured_at', { ascending: false })
          .limit(300);
        signals = { data: data || [], error: error || null };
      } catch (e) {
        signals = { data: [], error: e };
      }
    }

    // Impacto social por entidad: agrega el engagement de los posts de
    // competidor (brand_posts) por entity_id vía RPC. Dimensiona las burbujas
    // (más interacción de audiencia = burbuja más grande). Ventana amplia
    // (90d) para captar señal aunque la publicación sea esporádica.
    const impactByEntity = {};
    try {
      const { data } = await this.sb.rpc('monitoring_entity_impact', {
        p_org_id: this.orgId, p_window_d: 90,
      });
      (data || []).forEach(r => { if (r.entity_id) impactByEntity[r.entity_id] = Number(r.impact) || 0; });
    } catch (_) { /* si el RPC falla, las burbujas caen al fallback por señales */ }

    return {
      containers:  u(containers),
      entities:    u(entities),
      triggers:    u(triggers),
      watchers:    u(watchers),
      signals,
      impactByEntity,
    };
  }

  /** Todo el contenido capturado de un perfil (brand_posts), para el panel de
      detalle. Trae lo necesario para reconstruir el link al post original. */
  async loadEntityPosts(entityId, limit = 30) {
    if (!this.sb || !entityId) return { data: [], error: null };
    try {
      const { data, error } = await this.sb
        .from('brand_posts')
        .select('id, network, profile_handle, content, engagement_total, reach_total, captured_at, permalink, post_id, media_assets')
        .eq('entity_id', entityId)
        .order('captured_at', { ascending: false })
        .limit(limit);
      return { data: data || [], error: error || null };
    } catch (e) {
      return { data: [], error: e };
    }
  }

  /* ══════════════════════════════════════════════════════════
     intelligence_entities — Perfiles
  ══════════════════════════════════════════════════════════ */
  async createEntity(payload) {
    if (!this.sb || !this.orgId) return { error: new Error('not_ready') };
    const row = {
      organization_id:   this.orgId,
      brand_container_id: payload.brand_container_id || null,
      name:              payload.name,
      target_identifier: payload.target_identifier || null,
      domain:            payload.domain || 'social',
      scope:             payload.scope || 'brand',
      is_active:         payload.is_active !== false,
      color:             Array.isArray(payload.color) ? payload.color : (payload.color ? [payload.color] : null),
      relevance:         payload.relevance != null ? (String(payload.relevance).trim() || null) : null,
      metadata: {
        tipo:     payload.tipo     || 'competidor_directo',
        platform: payload.platform || null,
        ...(payload.metadata || {}),
      },
    };
    const { data, error } = await this.sb
      .from('intelligence_entities')
      .insert(row)
      .select()
      .single();
    if (!error) this._invalidateCache();
    return { data, error };
  }

  async updateEntity(id, patch) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const updates = {};
    ['name', 'target_identifier', 'domain', 'scope', 'is_active', 'brand_container_id'].forEach(k => {
      if (patch[k] !== undefined) updates[k] = patch[k];
    });
    // color: normalizamos a text[] (array) para soportar degradado a futuro.
    if (patch.color !== undefined) {
      updates.color = Array.isArray(patch.color) ? patch.color : (patch.color ? [patch.color] : null);
    }
    // relevance: el porqué de estar en el monitoreo (texto libre).
    if (patch.relevance !== undefined) {
      updates.relevance = patch.relevance ? String(patch.relevance).trim() || null : null;
    }
    if (patch.tipo !== undefined || patch.platform !== undefined || patch.metadata !== undefined) {
      // Merge metadata: leer actual y combinar
      const { data: cur } = await this.sb
        .from('intelligence_entities')
        .select('metadata')
        .eq('id', id)
        .single();
      updates.metadata = {
        ...(cur?.metadata || {}),
        ...(patch.metadata || {}),
      };
      if (patch.tipo !== undefined)     updates.metadata.tipo     = patch.tipo;
      if (patch.platform !== undefined) updates.metadata.platform = patch.platform;
    }
    const { data, error } = await this.sb
      .from('intelligence_entities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error) this._invalidateCache();
    return { data, error };
  }

  async deleteEntity(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb
      .from('intelligence_entities')
      .delete()
      .eq('id', id);
    if (!error) this._invalidateCache();
    return { error };
  }

  /* ══════════════════════════════════════════════════════════
     monitoring_triggers — Sensores
  ══════════════════════════════════════════════════════════ */
  async createTrigger(payload) {
    if (!this.sb || !this.orgId) return { error: new Error('not_ready') };
    const row = {
      organization_id:    this.orgId,
      brand_container_id: payload.brand_container_id || null,
      entity_id:          payload.entity_id || null,
      sensor_type:        payload.sensor_type,
      cadence:            payload.cadence || 'daily',
      cadence_value:      payload.cadence_value != null ? String(payload.cadence_value) : '1',
      priority:           Number.isFinite(payload.priority) ? payload.priority : 5,
      status:             payload.status || 'active',
      config:             payload.config || {},
    };
    const { data, error } = await this.sb
      .from('monitoring_triggers')
      .insert(row)
      .select()
      .single();
    if (!error) this._invalidateCache();
    return { data, error };
  }

  async updateTrigger(id, patch) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const updates = {};
    ['brand_container_id', 'entity_id', 'sensor_type', 'cadence', 'cadence_value',
     'priority', 'status', 'config', 'paused_reason', 'next_run_at'].forEach(k => {
      if (patch[k] !== undefined) updates[k] = patch[k];
    });
    if (updates.cadence_value != null) updates.cadence_value = String(updates.cadence_value);
    const { data, error } = await this.sb
      .from('monitoring_triggers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error) this._invalidateCache();
    return { data, error };
  }

  async deleteTrigger(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb
      .from('monitoring_triggers')
      .delete()
      .eq('id', id);
    if (!error) this._invalidateCache();
    return { error };
  }

  /* ══════════════════════════════════════════════════════════
     url_watchers — URLs vigiladas
  ══════════════════════════════════════════════════════════ */
  async createWatcher(payload) {
    if (!this.sb || !this.orgId) return { error: new Error('not_ready') };
    const row = {
      organization_id:    this.orgId,
      brand_container_id: payload.brand_container_id || null,
      entity_id:          payload.entity_id || null,
      url:                payload.url,
      label:              payload.label || null,
      is_active:          payload.is_active !== false,
    };
    const { data, error } = await this.sb
      .from('url_watchers')
      .insert(row)
      .select()
      .single();
    if (!error) this._invalidateCache();
    return { data, error };
  }

  async updateWatcher(id, patch) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const updates = {};
    ['url', 'label', 'is_active', 'entity_id', 'brand_container_id'].forEach(k => {
      if (patch[k] !== undefined) updates[k] = patch[k];
    });
    const { data, error } = await this.sb
      .from('url_watchers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error) this._invalidateCache();
    return { data, error };
  }

  async deleteWatcher(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb
      .from('url_watchers')
      .delete()
      .eq('id', id);
    if (!error) this._invalidateCache();
    return { error };
  }
}

window.MonitoringDataService = MonitoringDataService;
