/**
 * MonitoringView — Centro de Monitoreo de la organización.
 *
 * Dos tabs CRUD:
 *   - Perfiles      → intelligence_entities (competidores / referencias / owned)
 *   - URL Watchers  → url_watchers          (URLs vigiladas por hash)
 *
 * (Sensores quedó fuera del front por ahora: la tabla monitoring_triggers
 *  sigue activa en Supabase, pero su UI se reescribirá cuando tengamos un
 *  flujo entendible para el usuario final.)
 *
 * Permisos: cualquier miembro de la organización puede crear / editar / borrar
 * (RLS = is_developer() OR is_org_member(organization_id) en las tablas).
 */
class MonitoringView extends BaseView {

  static cacheable = true;

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
     TAB: PERFILES (intelligence_entities) — Kanban
     Columnas: Nuevos / Activos / Sin actividad / Pausados
     - owned_media (analytics propios) se excluye del kanban
     - "Nuevos" = sugeridos por auto-provisioner y NO activados aún
     Cross-cut: chip "Destacado" cuando metadata.highlighted = true
  ══════════════════════════════════════════════════════════ */
  _classifyEntity(e) {
    // Excluir analytics propios — el usuario ya sabe que monitorea su contenido
    if (e.metadata?.tipo === 'owned_media') return null;

    const isAutoSuggested = e.metadata?.auto_provisioned === true;
    // Sugerencia pendiente: auto-detectada y aún sin activar por el user
    if (isAutoSuggested && e.is_active === false) return 'new';

    if (e.is_active === false) return 'paused';
    if ((e.metadata?.consecutive_empty_runs || 0) >= 3) return 'stale';
    return 'active';
  }

  _veraUrl(prompt) {
    const orgId = this._orgId || window.currentOrgId;
    const orgName = window.currentOrgName || '';
    const base = (orgId && typeof window.getOrgPathPrefix === 'function')
      ? window.getOrgPathPrefix(orgId, orgName) + '/vera'
      : '/vera';
    return base + '?q=' + encodeURIComponent(prompt);
  }

  _promptAnalizar(e) {
    const platform = e.metadata?.platform || 'su plataforma';
    const handle = e.target_identifier ? ' (' + e.target_identifier + ')' : '';
    const tipo = (e.metadata?.tipo || 'perfil monitoreado').replace(/_/g, ' ');
    return `Analiza el perfil "${e.name}"${handle} en ${platform}. Es un ${tipo} que estamos monitoreando. Quiero un análisis estructurado: posicionamiento, audiencia objetivo, patrones de contenido recientes, tono de voz y oportunidades concretas que ves desde mi marca.`;
  }

  _promptComparar(e) {
    const orgName = window.currentOrgName || 'mi marca';
    const platform = e.metadata?.platform ? ' en ' + e.metadata.platform : '';
    return `Compara "${e.name}"${platform} con ${orgName}. Devuélveme cuatro bloques: 1) qué hace mejor que yo, 2) qué hago mejor yo, 3) en qué somos similares, 4) oportunidades concretas para diferenciarme en los próximos 90 días.`;
  }

  _promptInspirarme(e) {
    const orgName = window.currentOrgName || 'mi marca';
    return `Mostrame 5 ideas de contenido accionables que puedo aprender del perfil "${e.name}", adaptadas a la voz y audiencia de ${orgName}. Para cada idea: formato sugerido, gancho de copy (1 línea) y la métrica esperada que debería mover.`;
  }

  _renderProfiles(body) {
    // Excluir owned_media también del conteo total — no es contenido a monitorear
    const entities   = (this._data.entities.data || [])
      .filter(e => e.metadata?.tipo !== 'owned_media');
    const containers = this._data.containers.data || [];
    const tipoLabel = (t) =>
      MonitoringView.ENTITY_TIPOS.find(x => x.value === t)?.label || (t || '—');
    const containerName = (id) =>
      containers.find(c => c.id === id)?.nombre_marca || null;

    const columns = [
      { id: 'new',    label: 'Nuevos encontrados', hint: 'Sugeridos por el sistema · pendientes de activar', tone: 'new'    },
      { id: 'active', label: 'Activos',            hint: 'En marcha y con actividad',                         tone: 'active' },
      { id: 'stale',  label: 'Sin actividad',      hint: 'Activos pero sin señales recientes',                tone: 'stale'  },
      { id: 'paused', label: 'Pausados',           hint: 'Desactivados manualmente o por el sistema',         tone: 'paused' },
    ];

    const buckets = { new: [], active: [], stale: [], paused: [] };
    entities.forEach(e => {
      const col = this._classifyEntity(e);
      if (!col) return; // owned_media: excluido del kanban
      buckets[col].push(e);
    });

    const renderCard = (e) => {
      const tipo     = e.metadata?.tipo || '';
      const platform = e.metadata?.platform || '';
      const highlighted = e.metadata?.highlighted === true;
      const containerLabel = containerName(e.brand_container_id);
      const handle = e.target_identifier ? this._esc(e.target_identifier) : '';
      const tipoBadge = tipo ? `<span class="mn-card-chip mn-card-chip--${tipo.split('_')[0]}">${this._esc(tipoLabel(tipo))}</span>` : '';
      const platBadge = platform ? `<span class="mn-card-chip">${this._esc(platform)}</span>` : '';
      const brandBadge = containerLabel ? `<span class="mn-card-chip mn-card-chip--muted">${this._esc(containerLabel)}</span>` : '';
      const starTitle = highlighted ? 'Quitar destacado' : 'Destacar como alto impacto';

      return `
        <article class="mn-card${highlighted ? ' mn-card--highlighted' : ''}" data-row-id="${this._esc(e.id)}">
          <div class="mn-card-head">
            <div class="mn-card-head-main">
              <div class="mn-card-title">${this._esc(e.name || '—')}</div>
              ${handle ? `<div class="mn-card-handle">${handle}</div>` : ''}
            </div>
            <button class="mn-card-star${highlighted ? ' is-on' : ''}" data-action="toggle-highlight" data-id="${this._esc(e.id)}" title="${starTitle}" aria-pressed="${highlighted}">
              <i class="fas fa-star"></i>
            </button>
          </div>
          <div class="mn-card-chips">
            ${tipoBadge}${platBadge}${brandBadge}
            ${highlighted ? `<span class="mn-card-chip mn-card-chip--highlight"><i class="fas fa-star"></i> Destacado</span>` : ''}
          </div>
          <div class="mn-card-vera">
            <button class="mn-vera-btn" data-action="vera-analizar" data-id="${this._esc(e.id)}" title="Analiza este perfil con Vera">
              <i class="fas fa-wand-magic-sparkles"></i> Analizar
            </button>
            <button class="mn-vera-btn" data-action="vera-comparar" data-id="${this._esc(e.id)}" title="Compara este perfil con mi marca">
              <i class="fas fa-code-compare"></i> Comparar
            </button>
            <button class="mn-vera-btn" data-action="vera-inspirar" data-id="${this._esc(e.id)}" title="Pide ideas inspiradas en este perfil">
              <i class="fas fa-lightbulb"></i> Inspirarme
            </button>
          </div>
          <div class="mn-card-foot">
            <label class="mn-toggle" title="${e.is_active ? 'Pausar' : 'Activar'}">
              <input type="checkbox" ${e.is_active ? 'checked' : ''} data-action="toggle-entity" data-id="${this._esc(e.id)}">
              <span class="mn-toggle-track"></span>
            </label>
            <div class="mn-card-foot-actions">
              <button class="mn-btn-icon" data-action="edit-entity" data-id="${this._esc(e.id)}" title="Editar"><i class="fas fa-pen"></i></button>
              <button class="mn-btn-icon mn-btn-icon--danger" data-action="delete-entity" data-id="${this._esc(e.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </article>`;
    };

    const renderColumn = (col) => {
      const items = buckets[col.id];
      const emptyMsg = ({
        new:    'No hay perfiles recién encontrados.',
        active: 'Todavía no hay perfiles activos.',
        stale:  'Ningún perfil sin actividad. ✨',
        paused: 'No hay perfiles pausados.',
      })[col.id];
      return `
        <section class="mn-kanban-col mn-kanban-col--${col.tone}">
          <header class="mn-kanban-col-head">
            <div class="mn-kanban-col-title">
              <span class="mn-kanban-col-dot"></span>
              <h3>${col.label}</h3>
              <span class="mn-kanban-col-count">${items.length}</span>
            </div>
            <p class="mn-kanban-col-hint">${col.hint}</p>
          </header>
          <div class="mn-kanban-col-body">
            ${items.length ? items.map(renderCard).join('') : `<div class="mn-kanban-empty">${emptyMsg}</div>`}
          </div>
        </section>`;
    };

    body.innerHTML = `
      <div class="mn-page">
        <div class="mn-toolbar">
          <div class="mn-toolbar-main">
            <h2 class="mn-section-title">Perfiles monitoreados <span class="mn-count">${entities.length}</span></h2>
            <p class="mn-toolbar-sub">Organizados por estado. Cada card te conecta con Vera para analizar, comparar o inspirarte.</p>
          </div>
          <button class="mn-btn-primary" data-action="new-entity">
            <i class="fas fa-plus"></i> Nuevo perfil
          </button>
        </div>
        ${entities.length ? `
          <div class="mn-kanban">
            ${columns.map(renderColumn).join('')}
          </div>` : `
          <div class="mn-empty">
            <p>Aún no hay perfiles monitoreados. Crea el primero para empezar a vigilar.</p>
          </div>`}
      </div>`;

    body.addEventListener('click',  this._onProfilesClick.bind(this));
    body.addEventListener('change', this._onProfilesChange.bind(this));
  }

  async _onProfilesClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'new-entity')      return this._openEntityModal(null);
    if (action === 'edit-entity')     return this._openEntityModal(id);
    if (action === 'delete-entity')   return this._confirmDeleteEntity(id);
    if (action === 'toggle-highlight')return this._toggleHighlight(id);
    if (action === 'vera-analizar' || action === 'vera-comparar' || action === 'vera-inspirar') {
      return this._goToVera(action, id);
    }
  }

  async _onProfilesChange(e) {
    const input = e.target.closest('[data-action="toggle-entity"]');
    if (!input) return;
    const id = input.dataset.id;
    const { error } = await this._service.updateEntity(id, { is_active: input.checked });
    if (error) { alert('Error: ' + error.message); input.checked = !input.checked; }
    else await this._refresh();
  }

  async _toggleHighlight(id) {
    const entity = (this._data.entities.data || []).find(x => x.id === id);
    if (!entity) return;
    const next = !(entity.metadata?.highlighted === true);
    const { error } = await this._service.updateEntity(id, { metadata: { highlighted: next } });
    if (error) { alert('Error: ' + error.message); return; }
    await this._refresh();
  }

  _goToVera(action, id) {
    const entity = (this._data.entities.data || []).find(x => x.id === id);
    if (!entity || !window.router) return;
    let prompt = '';
    if (action === 'vera-analizar')  prompt = this._promptAnalizar(entity);
    if (action === 'vera-comparar')  prompt = this._promptComparar(entity);
    if (action === 'vera-inspirar')  prompt = this._promptInspirarme(entity);
    window.router.navigate(this._veraUrl(prompt));
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
     TAB: URL WATCHERS (CRUD)
  ══════════════════════════════════════════════════════════ */
  _renderWatchers(body) {
    const watchers = this._data.watchers.data || [];
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('es-CO',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    const rows = watchers.map(w => `
      <tr data-row-id="${this._esc(w.id)}">
        <td>
          <div class="mn-cell-strong">${this._esc(w.label || w.url)}</div>
          <div class="mn-cell-sub"><a href="${this._esc(w.url)}" target="_blank" rel="noopener">${this._esc(w.url)}</a></div>
        </td>
        <td>${this._esc(fmtDate(w.last_checked_at))}</td>
        <td>
          <label class="mn-toggle">
            <input type="checkbox" ${w.is_active ? 'checked' : ''} data-action="toggle-watcher" data-id="${this._esc(w.id)}">
            <span class="mn-toggle-track"></span>
          </label>
        </td>
        <td class="mn-actions">
          <button class="mn-btn-icon" data-action="edit-watcher" data-id="${this._esc(w.id)}" title="Editar"><i class="fas fa-pen"></i></button>
          <button class="mn-btn-icon mn-btn-icon--danger" data-action="delete-watcher" data-id="${this._esc(w.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');

    body.innerHTML = `
      <div class="mn-page">
        <div class="mn-toolbar">
          <h2 class="mn-section-title">URLs vigiladas <span class="mn-count">${watchers.length}</span></h2>
          <button class="mn-btn-primary" data-action="new-watcher">
            <i class="fas fa-plus"></i> Nueva URL
          </button>
        </div>
        ${watchers.length ? `
          <table class="mn-table">
            <thead><tr><th>URL</th><th>Última revisión</th><th>Activa</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : `
          <div class="mn-empty">
            <p>Aún no hay URLs vigiladas. Agrega la primera para detectar cambios automáticamente.</p>
          </div>`}
      </div>`;

    body.addEventListener('click',  this._onWatchersClick.bind(this));
    body.addEventListener('change', this._onWatchersChange.bind(this));
  }

  async _onWatchersClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'new-watcher')    return this._openWatcherModal(null);
    if (action === 'edit-watcher')   return this._openWatcherModal(id);
    if (action === 'delete-watcher') return this._confirmDeleteWatcher(id);
  }

  async _onWatchersChange(e) {
    const input = e.target.closest('[data-action="toggle-watcher"]');
    if (!input) return;
    const id = input.dataset.id;
    const { error } = await this._service.updateWatcher(id, { is_active: input.checked });
    if (error) { alert('Error: ' + error.message); input.checked = !input.checked; }
    else await this._refresh();
  }

  _openWatcherModal(id) {
    const isEdit = !!id;
    const w = isEdit ? (this._data.watchers.data || []).find(x => x.id === id) : {};

    const html = `
      <div class="mn-modal-overlay" id="mnModal">
        <div class="mn-modal">
          <header class="mn-modal-head">
            <h3>${isEdit ? 'Editar URL vigilada' : 'Nueva URL vigilada'}</h3>
            <button class="mn-modal-close" data-action="close-modal"><i class="fas fa-times"></i></button>
          </header>
          <form class="mn-form" id="mnWatcherForm">
            <label>URL
              <input name="url" type="url" required value="${this._esc(w.url || '')}" placeholder="https://ejemplo.com/pagina-a-vigilar">
              <small>Detectamos cambios comparando el hash del contenido en cada revisión.</small>
            </label>
            <label>Etiqueta (opcional)
              <input name="label" value="${this._esc(w.label || '')}" placeholder="Ej. Página de pricing de Competidor X">
            </label>
            <label class="mn-checkbox">
              <input type="checkbox" name="is_active" ${w.is_active === false ? '' : 'checked'}>
              Activa
            </label>
            <footer class="mn-modal-foot">
              <button type="button" class="mn-btn-secondary" data-action="close-modal">Cancelar</button>
              <button type="submit" class="mn-btn-primary">${isEdit ? 'Guardar cambios' : 'Crear watcher'}</button>
            </footer>
          </form>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('mnModal');
    modal.addEventListener('click', ev => {
      if (ev.target === modal || ev.target.closest('[data-action="close-modal"]')) modal.remove();
    });
    modal.querySelector('#mnWatcherForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        url:       fd.get('url')?.trim(),
        label:     fd.get('label')?.trim() || null,
        is_active: fd.get('is_active') === 'on',
      };
      if (!payload.url) { alert('La URL es obligatoria.'); return; }
      const { error } = isEdit
        ? await this._service.updateWatcher(id, payload)
        : await this._service.createWatcher(payload);
      if (error) { alert('Error: ' + error.message); return; }
      modal.remove();
      await this._refresh();
    });
  }

  async _confirmDeleteWatcher(id) {
    const w = (this._data.watchers.data || []).find(x => x.id === id);
    if (!w) return;
    if (!confirm(`¿Eliminar "${w.label || w.url}"?\nEsta acción no se puede deshacer.`)) return;
    const { error } = await this._service.deleteWatcher(id);
    if (error) { alert('Error: ' + error.message); return; }
    await this._refresh();
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
