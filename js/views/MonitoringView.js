/**
 * MonitoringView — Centro de Monitoreo de la organización.
 *
 * Tres tabs CRUD:
 *   - Perfiles      → intelligence_entities (competidores / referencias / owned)
 *   - Sensores      → monitoring_triggers   (cadencia, prioridad, estado)
 *   - URL Watchers  → url_watchers          (URLs vigiladas por hash)
 *
 * Permisos: cualquier miembro de la organización puede crear / editar / borrar
 * (RLS = is_developer() OR is_org_member(organization_id) en las 3 tablas).
 */
class MonitoringView extends BaseView {

  static SENSOR_TYPES = [
    { value: 'meta_posts',                    label: 'Meta · Posts (feed)' },
    { value: 'meta_page_insights',            label: 'Meta · Page Insights' },
    { value: 'meta_ad_library_sync',          label: 'Meta · Ad Library' },
    { value: 'meta_ads_audiences_sync',       label: 'Meta · Audiences' },
    { value: 'meta_audience_demographics',    label: 'Meta · Demographics' },
    { value: 'ga4_analytics',                 label: 'GA4 · Analytics' },
    { value: 'ga4_audience_demographics',     label: 'GA4 · Demographics' },
    { value: 'social',                        label: 'Social · Genérico' },
    { value: 'brand_indexer',                 label: 'Brand · Indexer' },
    { value: 'brand_audience_heatmap_compute', label: 'Brand · Heatmap compute' },
    { value: 'audience_alignment_analysis',   label: 'Audience · Alignment' },
    { value: 'threat_detection',              label: 'Threat · Detection' },
    { value: 'mission_generation',            label: 'OpenClaw · Missions' },
  ];

  static ENTITY_TIPOS = [
    { value: 'competidor_directo',   label: 'Competidor directo' },
    { value: 'competidor_indirecto', label: 'Competidor indirecto' },
    { value: 'referencia_cultural',  label: 'Referencia cultural' },
    { value: 'owned_media',          label: 'Owned media (mío)' },
  ];

  static PLATFORMS = [
    { value: '',                  label: '— sin plataforma —' },
    { value: 'instagram',         label: 'Instagram' },
    { value: 'facebook',          label: 'Facebook' },
    { value: 'tiktok',            label: 'TikTok' },
    { value: 'youtube',           label: 'YouTube' },
    { value: 'twitter',           label: 'Twitter / X' },
    { value: 'linkedin',          label: 'LinkedIn' },
    { value: 'google_analytics',  label: 'Google Analytics' },
    { value: 'web',               label: 'Sitio web' },
  ];

  constructor() {
    super();
    this._activeTab = 'profiles';
    this._supabase  = null;
    this._orgId     = null;
    this._service   = null;
    this._data      = null;
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    await this._initDataLayer();
  }

  async _initDataLayer() {
    try {
      if (window.supabaseService) this._supabase = await window.supabaseService.getClient();
      else if (window.supabase)   this._supabase = window.supabase;
    } catch (_) {}

    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    let candidate = this.routeParams?.orgId || window.currentOrgId
      || window.appState?.get('selectedOrganizationId')
      || localStorage.getItem('selectedOrganizationId') || null;

    if (!isUuid(candidate)
        && this.routeParams?.orgIdShort && this.routeParams?.orgNameSlug
        && typeof window.resolveOrgIdFromShortAndSlug === 'function') {
      try {
        const r = await window.resolveOrgIdFromShortAndSlug(
          this.routeParams.orgIdShort, this.routeParams.orgNameSlug);
        if (isUuid(r?.id)) candidate = r.id;
      } catch (_) {}
    }

    this._orgId = isUuid(candidate) ? candidate : null;
    if (!this._orgId) console.warn('[MonitoringView] organization_id no resuelto.');
  }

  async _ensureService() {
    if (this._service) return;
    if (!window.MonitoringDataService) {
      try { await this.loadScript('/js/services/MonitoringDataService.js', 'MonitoringDataService', 6000); }
      catch (_) { return; }
    }
    if (!this._supabase || !this._orgId) return;
    this._service = new window.MonitoringDataService().init(this._supabase, this._orgId);
  }

  async _refresh() {
    if (!this._service) return;
    this._data = await this._service.loadAll();
    this._renderTab(this._activeTab);
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Monitoreo', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();

    await this._ensureService();
    await this._refresh();
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    const tabs = [
      { id: 'profiles', label: 'Perfiles' },
      { id: 'sensors',  label: 'Sensores' },
      { id: 'watchers', label: 'URL Watchers' },
    ];
    const pill = (t) => `
      <button class="mb-firebar-tab${this._activeTab === t.id ? ' is-active' : ''}" data-tab="${t.id}">
        <span>${t.label}</span>
      </button>`;
    return `
      <div class="insight-page page-content monitoring-page" id="monitoringPage">
        <div class="mb-firebar" id="monitoringSubnav">
          <div class="mb-firebar-bg" aria-hidden="true">
            <div class="mb-firebar-gradient"></div>
          </div>
          <div class="mb-firebar-tabs mb-firebar-tabs--left">
            ${tabs.map(pill).join('')}
          </div>
        </div>
        <div class="insight-tab-body" id="monitoringTabBody"></div>
      </div>`;
  }

  _setupTabs() {
    const nav = document.getElementById('monitoringSubnav');
    if (!nav) return;
    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._activeTab = btn.dataset.tab;
      nav.querySelectorAll('.mb-firebar-tab')
        .forEach(b => b.classList.toggle('is-active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('monitoringTabBody');
    if (!body) return;
    if (!this._data) {
      body.innerHTML = this._skeleton();
      return;
    }
    if (tabId === 'profiles') return this._renderProfiles(body);
    if (tabId === 'sensors')  return this._renderSensors(body);
    if (tabId === 'watchers') return this._renderWatchers(body);
  }

  _skeleton() {
    return `
      <div class="mn-page">
        <div class="mn-toolbar">
          <div class="mb-skel-block" style="height:36px;width:160px"></div>
        </div>
        ${Array(4).fill('<div class="mn-row-skel"><div class="mb-skel-block"></div></div>').join('')}
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     TAB: PERFILES (intelligence_entities)
  ══════════════════════════════════════════════════════════ */
  _renderProfiles(body) {
    const entities   = this._data.entities.data || [];
    const containers = this._data.containers.data || [];
    const tipoLabel = (t) =>
      MonitoringView.ENTITY_TIPOS.find(x => x.value === t)?.label || (t || '—');
    const containerName = (id) =>
      containers.find(c => c.id === id)?.nombre_marca || '—';

    const rows = entities.map(e => {
      const tipo     = e.metadata?.tipo || '';
      const platform = e.metadata?.platform || '';
      return `
        <tr data-row-id="${this._esc(e.id)}">
          <td>
            <div class="mn-cell-strong">${this._esc(e.name || '—')}</div>
            <div class="mn-cell-sub">${this._esc(e.target_identifier || '—')}</div>
          </td>
          <td><span class="mn-pill mn-pill--${tipo.split('_')[0]}">${this._esc(tipoLabel(tipo))}</span></td>
          <td>${this._esc(platform || '—')}</td>
          <td>${this._esc(e.domain || '—')}</td>
          <td>${this._esc(containerName(e.brand_container_id))}</td>
          <td>
            <label class="mn-toggle">
              <input type="checkbox" ${e.is_active ? 'checked' : ''} data-action="toggle-entity" data-id="${this._esc(e.id)}">
              <span class="mn-toggle-track"></span>
            </label>
          </td>
          <td class="mn-actions">
            <button class="mn-btn-icon" data-action="edit-entity" data-id="${this._esc(e.id)}" title="Editar"><i class="fas fa-pen"></i></button>
            <button class="mn-btn-icon mn-btn-icon--danger" data-action="delete-entity" data-id="${this._esc(e.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="mn-page">
        <div class="mn-toolbar">
          <h2 class="mn-section-title">Perfiles monitoreados <span class="mn-count">${entities.length}</span></h2>
          <button class="mn-btn-primary" data-action="new-entity">
            <i class="fas fa-plus"></i> Nuevo perfil
          </button>
        </div>
        ${entities.length ? `
          <table class="mn-table">
            <thead>
              <tr>
                <th>Perfil</th><th>Tipo</th><th>Plataforma</th><th>Dominio</th><th>Marca</th><th>Activo</th><th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>` : `
          <div class="mn-empty">
            <p>Aún no hay perfiles monitoreados. Crea el primero para empezar a vigilar.</p>
          </div>`}
      </div>`;

    body.addEventListener('click', this._onProfilesClick.bind(this));
    body.addEventListener('change', this._onProfilesChange.bind(this));
  }

  async _onProfilesClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'new-entity')    return this._openEntityModal(null);
    if (action === 'edit-entity')   return this._openEntityModal(id);
    if (action === 'delete-entity') return this._confirmDeleteEntity(id);
  }

  async _onProfilesChange(e) {
    const input = e.target.closest('[data-action="toggle-entity"]');
    if (!input) return;
    const id = input.dataset.id;
    const { error } = await this._service.updateEntity(id, { is_active: input.checked });
    if (error) { alert('Error: ' + error.message); input.checked = !input.checked; }
    else await this._refresh();
  }

  _openEntityModal(id) {
    const isEdit = !!id;
    const e = isEdit ? (this._data.entities.data || []).find(x => x.id === id) : {};
    const containers = this._data.containers.data || [];
    const tipo     = e.metadata?.tipo     || 'competidor_directo';
    const platform = e.metadata?.platform || '';

    const tipoOpts = MonitoringView.ENTITY_TIPOS
      .map(o => `<option value="${o.value}"${o.value === tipo ? ' selected' : ''}>${o.label}</option>`).join('');
    const platOpts = MonitoringView.PLATFORMS
      .map(o => `<option value="${o.value}"${o.value === platform ? ' selected' : ''}>${o.label}</option>`).join('');
    const containerOpts = [
      `<option value="">— sin marca —</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}"${c.id === e.brand_container_id ? ' selected' : ''}>${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    const html = `
      <div class="mn-modal-overlay" id="mnModal">
        <div class="mn-modal">
          <header class="mn-modal-head">
            <h3>${isEdit ? 'Editar perfil' : 'Nuevo perfil'}</h3>
            <button class="mn-modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
          </header>
          <form class="mn-form" id="mnEntityForm">
            <label>Nombre
              <input name="name" required value="${this._esc(e.name || '')}" placeholder="Ej. Red Bull">
            </label>
            <label>Identificador
              <input name="target_identifier" value="${this._esc(e.target_identifier || '')}" placeholder="@redbull, meta:1234, ga4:5678…">
              <small>Handle social, meta page id, ga4 property, etc.</small>
            </label>
            <div class="mn-form-grid">
              <label>Tipo<select name="tipo">${tipoOpts}</select></label>
              <label>Plataforma<select name="platform">${platOpts}</select></label>
            </div>
            <div class="mn-form-grid">
              <label>Marca asociada<select name="brand_container_id">${containerOpts}</select></label>
              <label>Dominio
                <select name="domain">
                  <option value="social"    ${e.domain === 'social'    ? 'selected' : ''}>social</option>
                  <option value="analytics" ${e.domain === 'analytics' ? 'selected' : ''}>analytics</option>
                  <option value="web"       ${e.domain === 'web'       ? 'selected' : ''}>web</option>
                </select>
              </label>
            </div>
            <label class="mn-checkbox">
              <input type="checkbox" name="is_active" ${e.is_active === false ? '' : 'checked'}>
              Activo
            </label>
            <footer class="mn-modal-foot">
              <button type="button" class="mn-btn-secondary" data-action="close-modal">Cancelar</button>
              <button type="submit" class="mn-btn-primary">${isEdit ? 'Guardar cambios' : 'Crear perfil'}</button>
            </footer>
          </form>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('mnModal');
    modal.addEventListener('click', ev => {
      if (ev.target === modal || ev.target.closest('[data-action="close-modal"]')) modal.remove();
    });
    modal.querySelector('#mnEntityForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        name:              fd.get('name')?.trim(),
        target_identifier: fd.get('target_identifier')?.trim() || null,
        domain:            fd.get('domain'),
        brand_container_id: fd.get('brand_container_id') || null,
        tipo:              fd.get('tipo'),
        platform:          fd.get('platform') || null,
        is_active:         fd.get('is_active') === 'on',
      };
      const { error } = isEdit
        ? await this._service.updateEntity(id, payload)
        : await this._service.createEntity(payload);
      if (error) { alert('Error: ' + error.message); return; }
      modal.remove();
      await this._refresh();
    });
  }

  async _confirmDeleteEntity(id) {
    const e = (this._data.entities.data || []).find(x => x.id === id);
    if (!e) return;
    if (!confirm(`¿Eliminar perfil "${e.name}"?\nEsta acción no se puede deshacer.`)) return;
    const { error } = await this._service.deleteEntity(id);
    if (error) { alert('Error: ' + error.message); return; }
    await this._refresh();
  }

  /* ══════════════════════════════════════════════════════════
     TAB: SENSORES (placeholder — CRUD viene en próximo commit)
  ══════════════════════════════════════════════════════════ */
  _renderSensors(body) {
    const triggers   = this._data.triggers.data || [];
    const entities   = this._data.entities.data || [];
    const containers = this._data.containers.data || [];
    const sensorLabel = (s) =>
      MonitoringView.SENSOR_TYPES.find(x => x.value === s)?.label || s;
    const entityName    = (id) => entities.find(e => e.id === id)?.name || '—';
    const containerName = (id) => containers.find(c => c.id === id)?.nombre_marca || '—';
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('es-CO',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    const rows = triggers.map(t => {
      const stTone = t.status === 'active'
        ? (t.last_run_status === 'failed' ? 'warn' : 'ok')
        : 'muted';
      return `
        <tr>
          <td>
            <div class="mn-cell-strong">${this._esc(sensorLabel(t.sensor_type))}</div>
            <div class="mn-cell-sub">${this._esc(t.sensor_type)}</div>
          </td>
          <td>${this._esc(entityName(t.entity_id))}</td>
          <td>${this._esc(containerName(t.brand_container_id))}</td>
          <td>${this._esc(t.cadence)}${t.cadence_value ? ` · ${this._esc(t.cadence_value)}` : ''}</td>
          <td>${t.priority ?? '—'}</td>
          <td>
            <span class="mn-pill mn-pill--${stTone}">${this._esc(t.status)}</span>
            ${t.last_run_status ? `<span class="mn-cell-sub">last: ${this._esc(t.last_run_status)}</span>` : ''}
          </td>
          <td>${this._esc(fmtDate(t.next_run_at))}</td>
        </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="mn-page">
        <div class="mn-toolbar">
          <h2 class="mn-section-title">Sensores activos <span class="mn-count">${triggers.length}</span></h2>
          <span class="mn-toolbar-note">CRUD entrará en próxima iteración</span>
        </div>
        ${triggers.length ? `
          <table class="mn-table">
            <thead>
              <tr>
                <th>Sensor</th><th>Entidad</th><th>Marca</th><th>Cadencia</th><th>Prio</th><th>Estado</th><th>Próx. ejecución</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>` : `
          <div class="mn-empty"><p>No hay sensores configurados.</p></div>`}
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     TAB: URL WATCHERS (placeholder — CRUD viene en próximo commit)
  ══════════════════════════════════════════════════════════ */
  _renderWatchers(body) {
    const watchers = this._data.watchers.data || [];
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('es-CO',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    const rows = watchers.map(w => `
      <tr>
        <td>
          <div class="mn-cell-strong">${this._esc(w.label || w.url)}</div>
          <div class="mn-cell-sub"><a href="${this._esc(w.url)}" target="_blank" rel="noopener">${this._esc(w.url)}</a></div>
        </td>
        <td>${w.is_active ? 'sí' : 'no'}</td>
        <td>${this._esc(fmtDate(w.last_checked_at))}</td>
      </tr>`).join('');

    body.innerHTML = `
      <div class="mn-page">
        <div class="mn-toolbar">
          <h2 class="mn-section-title">URLs vigiladas <span class="mn-count">${watchers.length}</span></h2>
          <span class="mn-toolbar-note">CRUD entrará en próxima iteración</span>
        </div>
        ${watchers.length ? `
          <table class="mn-table">
            <thead><tr><th>URL</th><th>Activa</th><th>Última revisión</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `
          <div class="mn-empty"><p>No hay URLs vigiladas. Agrega una para detectar cambios automáticamente.</p></div>`}
      </div>`;
  }

  /* ── helpers ───────────────────────────────────────────── */
  _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

window.MonitoringView = MonitoringView;
