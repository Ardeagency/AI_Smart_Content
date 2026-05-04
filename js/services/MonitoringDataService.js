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

  /* ── Carga inicial: las 3 listas + brand_containers para selects ── */
  async loadAll() {
    if (!this.sb || !this.orgId) return null;
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
    return {
      containers: u(containers),
      entities:   u(entities),
      triggers:   u(triggers),
      watchers:   u(watchers),
    };
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
    return { data, error };
  }

  async updateEntity(id, patch) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const updates = {};
    ['name', 'target_identifier', 'domain', 'scope', 'is_active', 'brand_container_id'].forEach(k => {
      if (patch[k] !== undefined) updates[k] = patch[k];
    });
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
    return { data, error };
  }

  async deleteEntity(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb
      .from('intelligence_entities')
      .delete()
      .eq('id', id);
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
    return { data, error };
  }

  async deleteTrigger(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb
      .from('monitoring_triggers')
      .delete()
      .eq('id', id);
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
    return { data, error };
  }

  async deleteWatcher(id) {
    if (!this.sb || !id) return { error: new Error('bad_args') };
    const { error } = await this.sb
      .from('url_watchers')
      .delete()
      .eq('id', id);
    return { error };
  }
}

window.MonitoringDataService = MonitoringDataService;
