/**
 * MonitoringView — "Vigilancia".
 *
 * Vitrina humana de lo que la marca está siguiendo. No es un centro de control:
 * el usuario ve a quién sigue, qué tal va la vigilancia, prende/apaga, y revisa
 * si llegaron propuestas nuevas. Pensada para que cualquier persona la entienda
 * de un vistazo, sin tecnicismos.
 *
 * Una sola vista unificada sobre dos tablas (RLS por organization_id):
 *   - intelligence_entities → marcas / perfiles que seguimos
 *   - url_watchers          → páginas web que vigilamos
 * Las novedades vienen de intelligence_signals (vía MonitoringDataService).
 *
 * Estructura: tira "Pulso" (resumen) → banner de "Propuestas nuevas" → grid
 * unificado "Lo que sigo" con filtros. El lenguaje técnico (identificadores,
 * dominio, hash) queda plegado en "Opciones avanzadas" del formulario.
 *
 * Permisos: cualquier miembro de la organización puede crear / editar / borrar.
 */
class MonitoringView extends BaseView {

  static cacheable = true;

  static ENTITY_TIPOS = [
    { value: 'competidor_directo',   label: 'Competidor directo' },
    { value: 'competidor_indirecto', label: 'Competidor indirecto' },
    { value: 'referencia_cultural',  label: 'Referencia / inspiración' },
    { value: 'owned_media',          label: 'Algo mío' },
  ];

  static PLATFORMS = [
    { value: '',                  label: '— Sin plataforma —' },
    { value: 'instagram',         label: 'Instagram' },
    { value: 'facebook',          label: 'Facebook' },
    { value: 'tiktok',            label: 'TikTok' },
    { value: 'youtube',           label: 'YouTube' },
    { value: 'twitter',           label: 'Twitter / X' },
    { value: 'linkedin',          label: 'LinkedIn' },
    { value: 'google_analytics',  label: 'Google Analytics' },
    { value: 'web',               label: 'Sitio web' },
  ];

  // Plataforma → icono (Font Awesome, ya cargado globalmente en la app).
  static PLATFORM_ICON = {
    instagram:        'fab fa-instagram',
    facebook:         'fab fa-facebook',
    tiktok:           'fab fa-tiktok',
    youtube:          'fab fa-youtube',
    twitter:          'fab fa-x-twitter',
    x:                'fab fa-x-twitter',
    linkedin:         'fab fa-linkedin-in',
    google_analytics: 'fas fa-chart-line',
    web:              'fas fa-globe',
  };

  constructor() {
    super();
    this._filter   = 'all';   // all | brands | pages | paused
    this._supabase = null;
    this._orgId    = null;
    this._service  = null;
    this._data     = null;
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

  /** Carga inicial / revisita: usa cache SWR para pintar al instante al volver
      a Vigilancia. El skeleton cubre la primera carga; en revisitas devuelve lo
      cacheado al toque y revalida en background. */
  async _loadInitial() {
    if (!this._service) return;
    const key = `monitoring:${this._orgId}`;
    this._data = window.apiClient
      ? await window.apiClient.query(key, () => this._service.loadAll(), { ttl: 60000, staleWhileRevalidate: true })
      : await this._service.loadAll();
    this._renderBody();
  }

  /** Post-mutación (CRUD): SIEMPRE fresco. force:true ignora el cache y lo
      repuebla, así la próxima visita ve los cambios sin quedar stale. */
  async _refresh() {
    if (!this._service) return;
    const key = `monitoring:${this._orgId}`;
    this._data = window.apiClient
      ? await window.apiClient.query(key, () => this._service.loadAll(), { force: true })
      : await this._service.loadAll();
    this._renderBody();
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Vigilancia', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();

    await this._ensureService();
    await this._loadInitial();
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    return `
      <div class="insight-page page-content monitoring-page" id="monitoringPage">
        <div class="mn-body" id="monitoringBody"></div>
      </div>`;
  }

  onLeave() {
    this.clearSubnavFromHeader();
  }

  /* ══════════════════════════════════════════════════════════
     MODELO — fusiona perfiles + páginas en una lista de "seguidos"
     y calcula el resumen (Pulso) y las propuestas nuevas.
  ══════════════════════════════════════════════════════════ */
  _computeModel() {
    const entities = (this._data.entities.data || [])
      .filter(e => e.metadata?.tipo !== 'owned_media');
    const pages    = this._data.watchers.data || [];
    const signals  = this._data.signals?.data || [];
    const containers = this._data.containers.data || [];

    // Señales indexadas por entity_id (la más reciente primero, ya vienen desc).
    const sigByEntity = new Map();
    signals.forEach(s => {
      if (!sigByEntity.has(s.entity_id)) sigByEntity.set(s.entity_id, []);
      sigByEntity.get(s.entity_id).push(s);
    });
    // Cambios de URL indexados por url (para el feed de páginas).
    const sigByUrl = new Map();
    signals.filter(s => s.signal_type === 'url_change').forEach(s => {
      const c = this._parseSignalContent(s.content_text);
      const key = c.url || `entity:${s.entity_id}`;
      if (!sigByUrl.has(key)) sigByUrl.set(key, []);
      sigByUrl.get(key).push({ ...s, _parsed: c });
    });

    const isPendingProp = (e) =>
      e.metadata?.auto_provisioned === true && e.is_active === false;

    // Propuestas nuevas: sugeridas por el sistema, sin activar y sin descartar.
    const propuestas = entities.filter(e => isPendingProp(e) && e.metadata?.dismissed !== true);

    // Perfiles en la lista: todo lo que el usuario realmente sigue
    // (excluye propuestas pendientes y descartadas — ambas viven fuera del grid).
    const listProfiles = entities.filter(e => !isPendingProp(e));

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const recent = (iso) => iso && (Date.now() - new Date(iso).getTime()) < SEVEN_DAYS;

    // Items unificados.
    const items = [];
    listProfiles.forEach(e => {
      const sigs = sigByEntity.get(e.id) || [];
      const lastAt = sigs[0]?.captured_at || null;
      items.push({
        kind: 'profile', raw: e, id: e.id,
        title: e.name || '—',
        subtitle: e.target_identifier || '',
        platform: e.metadata?.platform || '',
        isActive: e.is_active !== false,
        highlighted: e.metadata?.highlighted === true,
        lastAt,
        hasNews: recent(lastAt),
        containerId: e.brand_container_id || null,
        status: this._estadoPerfil(e, lastAt),
      });
    });
    pages.forEach(w => {
      let hostname = w.url;
      try { hostname = new URL(w.url).hostname.replace(/^www\./, ''); } catch (_) {}
      const wsigs = (sigByUrl.get(w.url) || []).slice(0, 3);
      const lastAt = wsigs[0]?.captured_at || null;
      items.push({
        kind: 'page', raw: w, id: w.id,
        title: w.label || hostname,
        subtitle: hostname,
        url: w.url,
        platform: 'web',
        isActive: w.is_active !== false,
        highlighted: false,
        lastAt,
        hasNews: recent(lastAt) && (Date.now() - new Date(lastAt).getTime()) < 24 * 60 * 60 * 1000,
        feed: wsigs,
        status: this._estadoPagina(w, lastAt),
      });
    });

    // Orden: destacados primero, luego activos, luego por novedad reciente.
    items.sort((a, b) =>
      (b.highlighted - a.highlighted) ||
      (b.isActive - a.isActive) ||
      (new Date(b.lastAt || 0) - new Date(a.lastAt || 0)));

    const counts = {
      siguiendo: items.filter(i => i.isActive).length,
      novedades: items.filter(i => i.isActive && i.hasNews).length,
      propuestas: propuestas.length,
    };

    return { items, propuestas, counts, containers };
  }

  /* ── Estado en lenguaje humano ── */
  _estadoPerfil(e, lastAt) {
    if (e.is_active === false) return { tone: 'paused', icon: 'fa-circle-pause', text: 'En pausa' };
    if ((e.metadata?.consecutive_empty_runs || 0) >= 3)
      return { tone: 'stale', icon: 'fa-moon', text: 'Callado hace rato' };
    if (lastAt && (Date.now() - new Date(lastAt).getTime()) < 7 * 24 * 60 * 60 * 1000)
      return { tone: 'fresh', icon: 'fa-circle-check', text: `Al día · novedad ${this._relativeTime(lastAt)}` };
    return { tone: 'quiet', icon: 'fa-circle-check', text: 'Tranquilo · sin novedades por ahora' };
  }

  _estadoPagina(w, lastAt) {
    if (w.is_active === false) return { tone: 'paused', icon: 'fa-circle-pause', text: 'En pausa' };
    if (lastAt && (Date.now() - new Date(lastAt).getTime()) < 24 * 60 * 60 * 1000)
      return { tone: 'changed', icon: 'fa-bolt', text: `Cambio detectado · ${this._relativeTime(lastAt)}` };
    if (w.last_checked_at)
      return { tone: 'quiet', icon: 'fa-circle-check', text: `Sin cambios · revisado ${this._relativeTime(w.last_checked_at)}` };
    return { tone: 'new', icon: 'fa-hourglass-start', text: 'Empezando a vigilar…' };
  }

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  _renderBody() {
    const body = document.getElementById('monitoringBody');
    if (!body) return;
    if (!this._data) { body.innerHTML = this._skeleton(); return; }

    const model = this._computeModel();
    body.innerHTML = `
      <div class="mn-page">
        ${this._buildPulse(model)}
        ${this._buildPropuestas(model)}
        ${this._buildSeguidos(model)}
      </div>`;
    this._bind(body, model);
  }

  _skeleton() {
    return `
      <div class="mn-page">
        <div class="mn-kpi-skel">
          ${Array(4).fill('<div class="mb-skel-block" style="height:74px;border-radius:12px"></div>').join('')}
        </div>
        <div class="mn-grid">
          ${Array(6).fill('<div class="mb-skel-block" style="height:150px;border-radius:12px"></div>').join('')}
        </div>
      </div>`;
  }

  /* ── Tira "Pulso" — cómo va la vigilancia de un vistazo ── */
  _buildPulse(model) {
    const { counts } = model;
    const algoVigilado = counts.siguiendo > 0;
    const estado = algoVigilado
      ? { label: 'Todo en marcha', sub: 'Vigilancia activa', color: 'green', icon: 'fa-circle-check' }
      : { label: 'En reposo',      sub: 'Nada activo aún',   color: 'teal',  icon: 'fa-pause' };

    const tile = (color, icon, value, label, sub, pulse) => `
      <div class="mb-kpi-card mb-kpi--${color}${pulse ? ' mn-kpi--pulse' : ''}">
        <div class="mb-kpi-icon"><i class="fas ${icon}"></i></div>
        <div class="mb-kpi-body">
          <div class="mb-kpi-value">${value}</div>
          <div class="mb-kpi-label">${label}</div>
          ${sub ? `<div class="mb-kpi-sub">${sub}</div>` : ''}
        </div>
      </div>`;

    return `
      <div class="mn-hero">
        <h2 class="mn-hero-title">Esto es lo que vigilamos por ti</h2>
        <p class="mn-hero-sub">Lo revisamos solos cada cierto tiempo. Tú solo prende, apaga, y mira qué encontramos.</p>
      </div>
      <div class="mb-kpi-strip mn-pulse">
        ${tile('blue',   'fa-binoculars',   counts.siguiendo,  'Siguiendo',        'Marcas y páginas activas')}
        ${tile('orange', 'fa-bolt',         counts.novedades,  'Con novedades',    'En los últimos 7 días')}
        ${tile('pink',   'fa-wand-magic-sparkles', counts.propuestas, 'Propuestas nuevas', 'Por revisar', counts.propuestas > 0)}
        ${tile(estado.color, estado.icon,   estado.label,      'Estado',           estado.sub)}
      </div>`;
  }

  /* ── Banner "Propuestas nuevas" ── */
  _buildPropuestas(model) {
    const props = model.propuestas;
    if (!props.length) return '';
    const tipoLabel = (t) =>
      MonitoringView.ENTITY_TIPOS.find(x => x.value === t)?.label || 'Perfil';
    const cards = props.map(e => {
      const platform = e.metadata?.platform || '';
      const icon = MonitoringView.PLATFORM_ICON[platform] || 'fas fa-hashtag';
      const why = `${tipoLabel(e.metadata?.tipo)}${platform ? ' en ' + this._platformName(platform) : ''}. Lo encontramos cerca de tu competencia.`;
      return `
        <div class="mn-prop" data-id="${this._esc(e.id)}">
          <div class="mn-prop-avatar"><i class="${icon}"></i></div>
          <div class="mn-prop-main">
            <div class="mn-prop-name">${this._esc(e.name || '—')}</div>
            <div class="mn-prop-why">${this._esc(why)}</div>
          </div>
          <div class="mn-prop-actions">
            <button class="mn-prop-btn mn-prop-btn--yes" data-action="prop-follow" data-id="${this._esc(e.id)}">
              <i class="fas fa-plus"></i> Seguir
            </button>
            <button class="mn-prop-btn mn-prop-btn--no" data-action="prop-dismiss" data-id="${this._esc(e.id)}">
              Descartar
            </button>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="mn-prop-banner">
        <header class="mn-prop-head">
          <div class="mn-prop-head-icon"><i class="fas fa-wand-magic-sparkles"></i></div>
          <div>
            <h3 class="mn-prop-title">Encontramos ${props.length} ${props.length === 1 ? 'perfil que quizá quieras seguir' : 'perfiles que quizá quieras seguir'}</h3>
            <p class="mn-prop-subtitle">Tú decides: súmalos a tu vigilancia o descártalos.</p>
          </div>
        </header>
        <div class="mn-prop-list">${cards}</div>
      </section>`;
  }

  /* ── Grid unificado "Lo que sigo" ── */
  _buildSeguidos(model) {
    const { items, containers } = model;
    const containerName = (id) => containers.find(c => c.id === id)?.nombre_marca || null;

    const filtered = items.filter(i => {
      if (this._filter === 'brands') return i.kind === 'profile';
      if (this._filter === 'pages')  return i.kind === 'page';
      if (this._filter === 'paused') return !i.isActive;
      return true;
    });

    const chip = (id, label, n) => `
      <button class="mn-chip${this._filter === id ? ' is-active' : ''}" data-filter="${id}">
        ${label}<span class="mn-chip-n">${n}</span>
      </button>`;

    const counts = {
      all:    items.length,
      brands: items.filter(i => i.kind === 'profile').length,
      pages:  items.filter(i => i.kind === 'page').length,
      paused: items.filter(i => !i.isActive).length,
    };

    const grid = filtered.length
      ? `<div class="mn-grid">${filtered.map(i => this._buildCard(i, containerName)).join('')}</div>`
      : `<div class="mn-empty"><p>${this._emptyMsg()}</p></div>`;

    return `
      <div class="mn-toolbar">
        <div class="mn-filter">
          ${chip('all',    'Todo',     counts.all)}
          ${chip('brands', 'Marcas',   counts.brands)}
          ${chip('pages',  'Páginas',  counts.pages)}
          ${chip('paused', 'En pausa', counts.paused)}
        </div>
        <button class="mn-btn-primary" data-action="new-item">
          <i class="fas fa-plus"></i> Seguir algo nuevo
        </button>
      </div>
      ${items.length ? grid : `
        <div class="mn-empty mn-empty--first">
          <div class="mn-empty-icon"><i class="fas fa-binoculars"></i></div>
          <p>Aún no sigues a nadie.<br>Agrega tu primera marca o página y nosotros nos encargamos del resto.</p>
          <button class="mn-btn-primary" data-action="new-item"><i class="fas fa-plus"></i> Seguir algo nuevo</button>
        </div>`}`;
  }

  _emptyMsg() {
    return ({
      brands: 'No sigues ninguna marca o perfil todavía.',
      pages:  'No vigilas ninguna página web todavía.',
      paused: 'Nada en pausa. Todo lo que sigues está activo. ✨',
      all:    'Nada por aquí todavía.',
    })[this._filter] || 'Nada por aquí todavía.';
  }

  _buildCard(item, containerName) {
    const icon = MonitoringView.PLATFORM_ICON[item.platform] || 'fas fa-hashtag';
    const typeLabel = item.kind === 'page' ? 'Página web' : 'Marca / perfil';
    const brand = item.kind === 'profile' ? containerName(item.containerId) : null;
    const st = item.status;

    const star = item.kind === 'profile' ? `
      <button class="mn-star${item.highlighted ? ' is-on' : ''}" data-action="toggle-highlight" data-id="${this._esc(item.id)}"
              title="${item.highlighted ? 'Quitar destacado' : 'Destacar'}" aria-pressed="${item.highlighted}">
        <i class="fas fa-star"></i>
      </button>` : '';

    const vera = item.kind === 'profile' ? `
      <div class="mn-card-vera">
        <button class="mn-vera-btn" data-action="vera-analizar" data-id="${this._esc(item.id)}" title="Que Vera analice este perfil">
          <i class="fas fa-wand-magic-sparkles"></i> Analizar
        </button>
        <button class="mn-vera-btn" data-action="vera-comparar" data-id="${this._esc(item.id)}" title="Comparar con mi marca">
          <i class="fas fa-code-compare"></i> Comparar
        </button>
        <button class="mn-vera-btn" data-action="vera-inspirar" data-id="${this._esc(item.id)}" title="Pedir ideas inspiradas en este perfil">
          <i class="fas fa-lightbulb"></i> Ideas
        </button>
      </div>` : '';

    // Páginas: pequeño feed de cambios recientes.
    let feed = '';
    if (item.kind === 'page' && item.feed && item.feed.length) {
      feed = `<div class="mn-card-feed">${item.feed.map(s => {
        const excerpt = (s._parsed?.excerpt || '').slice(0, 140);
        return `
          <div class="mn-feed-row">
            <span class="mn-feed-when">${this._esc(this._relativeTime(s.captured_at))}</span>
            ${excerpt ? `<span class="mn-feed-text">${this._esc(excerpt)}${excerpt.length === 140 ? '…' : ''}</span>` : ''}
          </div>`;
      }).join('')}</div>`;
    }

    const editAction = item.kind === 'page' ? 'edit-watcher' : 'edit-entity';
    const delAction  = item.kind === 'page' ? 'delete-watcher' : 'delete-entity';
    const toggleAction = item.kind === 'page' ? 'toggle-watcher' : 'toggle-entity';
    const link = item.kind === 'page'
      ? `<a class="mn-card-sub mn-card-sub--link" href="${this._esc(item.url)}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ${this._esc(item.subtitle)}</a>`
      : (item.subtitle ? `<div class="mn-card-sub">${this._esc(item.subtitle)}</div>` : '');

    return `
      <article class="mn-card${item.highlighted ? ' mn-card--star' : ''}${!item.isActive ? ' mn-card--off' : ''}" data-id="${this._esc(item.id)}">
        <div class="mn-card-head">
          <div class="mn-card-avatar mn-card-avatar--${item.kind}"><i class="${icon}"></i></div>
          <div class="mn-card-id">
            <div class="mn-card-title">${this._esc(item.title)}</div>
            ${link}
          </div>
          ${star}
        </div>
        <div class="mn-card-meta">
          <span class="mn-status mn-status--${st.tone}"><i class="fas ${st.icon}"></i> ${this._esc(st.text)}</span>
          <span class="mn-type">${typeLabel}${brand ? ' · ' + this._esc(brand) : ''}</span>
        </div>
        ${vera}
        ${feed}
        <div class="mn-card-foot">
          <label class="mn-onoff" title="${item.isActive ? 'Pausar' : 'Activar'}">
            <input type="checkbox" ${item.isActive ? 'checked' : ''} data-action="${toggleAction}" data-id="${this._esc(item.id)}">
            <span class="mn-onoff-track"></span>
            <span class="mn-onoff-label">${item.isActive ? 'Vigilando' : 'En pausa'}</span>
          </label>
          <div class="mn-card-foot-actions">
            <button class="mn-btn-icon" data-action="${editAction}" data-id="${this._esc(item.id)}" title="Editar"><i class="fas fa-pen"></i></button>
            <button class="mn-btn-icon mn-btn-icon--danger" data-action="${delAction}" data-id="${this._esc(item.id)}" title="Dejar de seguir"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </article>`;
  }

  /* ══════════════════════════════════════════════════════════
     EVENTOS
  ══════════════════════════════════════════════════════════ */
  _bind(body, model) {
    body.addEventListener('click',  (e) => this._onClick(e));
    body.addEventListener('change', (e) => this._onChange(e));
  }

  async _onClick(e) {
    const chip = e.target.closest('[data-filter]');
    if (chip) { this._filter = chip.dataset.filter; this._renderBody(); return; }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;

    switch (action) {
      case 'new-item':        return this._openCreateModal();
      case 'edit-entity':     return this._openEntityModal(id);
      case 'edit-watcher':    return this._openWatcherModal(id);
      case 'delete-entity':   return this._confirmDeleteEntity(id);
      case 'delete-watcher':  return this._confirmDeleteWatcher(id);
      case 'toggle-highlight':return this._toggleHighlight(id);
      case 'prop-follow':     return this._propFollow(id);
      case 'prop-dismiss':    return this._propDismiss(id);
      case 'vera-analizar':
      case 'vera-comparar':
      case 'vera-inspirar':   return this._goToVera(action, id);
    }
  }

  async _onChange(e) {
    const ent = e.target.closest('[data-action="toggle-entity"]');
    if (ent) {
      const { error } = await this._service.updateEntity(ent.dataset.id, { is_active: ent.checked });
      if (error) { alert('No se pudo cambiar: ' + error.message); ent.checked = !ent.checked; }
      else await this._refresh();
      return;
    }
    const w = e.target.closest('[data-action="toggle-watcher"]');
    if (w) {
      const { error } = await this._service.updateWatcher(w.dataset.id, { is_active: w.checked });
      if (error) { alert('No se pudo cambiar: ' + error.message); w.checked = !w.checked; }
      else await this._refresh();
    }
  }

  async _propFollow(id) {
    const { error } = await this._service.updateEntity(id, { is_active: true });
    if (error) { alert('No se pudo seguir: ' + error.message); return; }
    await this._refresh();
  }

  async _propDismiss(id) {
    const { error } = await this._service.updateEntity(id, { metadata: { dismissed: true } });
    if (error) { alert('No se pudo descartar: ' + error.message); return; }
    await this._refresh();
  }

  async _toggleHighlight(id) {
    const entity = (this._data.entities.data || []).find(x => x.id === id);
    if (!entity) return;
    const next = !(entity.metadata?.highlighted === true);
    const { error } = await this._service.updateEntity(id, { metadata: { highlighted: next } });
    if (error) { alert('Error: ' + error.message); return; }
    await this._refresh();
  }

  /* ── Vera ── */
  _platformName(p) {
    return MonitoringView.PLATFORMS.find(x => x.value === p)?.label || p;
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

  _goToVera(action, id) {
    const entity = (this._data.entities.data || []).find(x => x.id === id);
    if (!entity || !window.router) return;
    let prompt = '';
    if (action === 'vera-analizar')  prompt = this._promptAnalizar(entity);
    if (action === 'vera-comparar')  prompt = this._promptComparar(entity);
    if (action === 'vera-inspirar')  prompt = this._promptInspirarme(entity);
    window.router.navigate(this._veraUrl(prompt));
  }

  /* ══════════════════════════════════════════════════════════
     MODALES
  ══════════════════════════════════════════════════════════ */
  /** Crear: el usuario elige primero qué quiere seguir (marca/perfil o página). */
  _openCreateModal() {
    const containers = this._data.containers.data || [];
    const tipoOpts = MonitoringView.ENTITY_TIPOS
      .map(o => `<option value="${o.value}"${o.value === 'competidor_directo' ? ' selected' : ''}>${o.label}</option>`).join('');
    const platOpts = MonitoringView.PLATFORMS
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const containerOpts = [
      `<option value="">— Sin marca —</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}">${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    const body = `
      <div class="mn-form" id="mnCreateForm">
        <div class="mn-kindpick">
          <button type="button" class="mn-kind is-active" data-kind="profile">
            <i class="fas fa-user-group"></i> Una marca o perfil
          </button>
          <button type="button" class="mn-kind" data-kind="page">
            <i class="fas fa-globe"></i> Una página web
          </button>
        </div>

        <div data-pane="profile">
          <label>¿A quién quieres seguir?
            <input name="name" value="" placeholder="Ej. Red Bull">
          </label>
          <div class="mn-form-grid">
            <label>¿Qué es?<select name="tipo">${tipoOpts}</select></label>
            <label>Plataforma<select name="platform">${platOpts}</select></label>
          </div>
          <label>Usuario o enlace
            <input name="target_identifier" value="" placeholder="@usuario">
          </label>
          <details class="mn-advanced">
            <summary>Opciones avanzadas</summary>
            <div class="mn-advanced-body">
              <label>Marca asociada<select name="brand_container_id">${containerOpts}</select></label>
              <label>Tipo de dato
                <select name="domain">
                  <option value="social" selected>Redes sociales</option>
                  <option value="analytics">Analítica</option>
                  <option value="web">Sitio web</option>
                </select>
              </label>
              <small>Para fuentes técnicas puedes usar identificadores como <code>meta:1234</code> o <code>ga4:5678</code> en el campo "Usuario o enlace".</small>
            </div>
          </details>
        </div>

        <div data-pane="page" hidden>
          <label>Dirección de la página
            <input name="url" type="url" value="" placeholder="https://ejemplo.com/pagina-a-vigilar">
            <small>Te avisamos cuando esa página cambie.</small>
          </label>
          <label>Nombre (opcional)
            <input name="label" value="" placeholder="Ej. Precios de Competidor X">
          </label>
        </div>

        <footer class="mn-modal-foot">
          <button type="button" class="mn-btn-secondary" data-action="close-modal">Cancelar</button>
          <button type="button" class="mn-btn-primary" data-action="create-submit">Empezar a seguir</button>
        </footer>
      </div>`;

    const { modal, close } = window.Modal.show({ title: 'Seguir algo nuevo', body, className: 'mn-modal-content' });
    let kind = 'profile';
    modal.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.kind;
      modal.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('is-active', x === b));
      modal.querySelector('[data-pane="profile"]').hidden = kind !== 'profile';
      modal.querySelector('[data-pane="page"]').hidden    = kind !== 'page';
    }));
    modal.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => close());
    modal.querySelector('[data-action="create-submit"]')?.addEventListener('click', async () => {
      const root = modal.querySelector('#mnCreateForm');
      const val = (n) => root.querySelector(`[name="${n}"]`)?.value?.trim() || '';
      if (kind === 'profile') {
        const name = val('name');
        if (!name) { alert('Escribe un nombre.'); return; }
        const { error } = await this._service.createEntity({
          name,
          target_identifier: val('target_identifier') || null,
          domain: val('domain') || 'social',
          brand_container_id: val('brand_container_id') || null,
          tipo: val('tipo'),
          platform: val('platform') || null,
          is_active: true,
        });
        if (error) { alert('Error: ' + error.message); return; }
      } else {
        const url = val('url');
        if (!url) { alert('Escribe la dirección de la página.'); return; }
        const { error } = await this._service.createWatcher({
          url, label: val('label') || null, is_active: true,
        });
        if (error) { alert('Error: ' + error.message); return; }
      }
      close();
      await this._refresh();
    });
  }

  _openEntityModal(id) {
    const e = (this._data.entities.data || []).find(x => x.id === id) || {};
    const containers = this._data.containers.data || [];
    const tipo     = e.metadata?.tipo     || 'competidor_directo';
    const platform = e.metadata?.platform || '';

    const tipoOpts = MonitoringView.ENTITY_TIPOS
      .map(o => `<option value="${o.value}"${o.value === tipo ? ' selected' : ''}>${o.label}</option>`).join('');
    const platOpts = MonitoringView.PLATFORMS
      .map(o => `<option value="${o.value}"${o.value === platform ? ' selected' : ''}>${o.label}</option>`).join('');
    const containerOpts = [
      `<option value="">— Sin marca —</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}"${c.id === e.brand_container_id ? ' selected' : ''}>${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    const body = `
      <form class="mn-form" id="mnEntityForm">
        <label>Nombre
          <input name="name" required value="${this._esc(e.name || '')}" placeholder="Ej. Red Bull">
        </label>
        <div class="mn-form-grid">
          <label>¿Qué es?<select name="tipo">${tipoOpts}</select></label>
          <label>Plataforma<select name="platform">${platOpts}</select></label>
        </div>
        <label>Usuario o enlace
          <input name="target_identifier" value="${this._esc(e.target_identifier || '')}" placeholder="@usuario">
        </label>
        <details class="mn-advanced">
          <summary>Opciones avanzadas</summary>
          <div class="mn-advanced-body">
            <label>Marca asociada<select name="brand_container_id">${containerOpts}</select></label>
            <label>Tipo de dato
              <select name="domain">
                <option value="social"    ${e.domain === 'social'    ? 'selected' : ''}>Redes sociales</option>
                <option value="analytics" ${e.domain === 'analytics' ? 'selected' : ''}>Analítica</option>
                <option value="web"       ${e.domain === 'web'       ? 'selected' : ''}>Sitio web</option>
              </select>
            </label>
            <small>Para fuentes técnicas usa identificadores como <code>meta:1234</code> o <code>ga4:5678</code> en "Usuario o enlace".</small>
          </div>
        </details>
        <label class="mn-checkbox">
          <input type="checkbox" name="is_active" ${e.is_active === false ? '' : 'checked'}>
          Vigilando activamente
        </label>
        <footer class="mn-modal-foot">
          <button type="button" class="mn-btn-secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="mn-btn-primary">Guardar cambios</button>
        </footer>
      </form>`;

    const { modal, close } = window.Modal.show({ title: 'Editar', body, className: 'mn-modal-content' });
    modal.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => close());
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
      const { error } = await this._service.updateEntity(id, payload);
      if (error) { alert('Error: ' + error.message); return; }
      close();
      await this._refresh();
    });
  }

  async _confirmDeleteEntity(id) {
    const e = (this._data.entities.data || []).find(x => x.id === id);
    if (!e) return;
    if (!confirm(`¿Dejar de seguir a "${e.name}"?\nEsta acción no se puede deshacer.`)) return;
    const { error } = await this._service.deleteEntity(id);
    if (error) { alert('Error: ' + error.message); return; }
    await this._refresh();
  }

  /* ── Páginas web (watchers) ── */
  _parseSignalContent(text) {
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return {}; }
  }

  _relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60 * 1000) return 'hace segundos';
    const min = Math.floor(diff / 60000);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }

  _openWatcherModal(id) {
    const w = (this._data.watchers.data || []).find(x => x.id === id) || {};

    const body = `
      <form class="mn-form" id="mnWatcherForm">
        <label>Dirección de la página
          <input name="url" type="url" required value="${this._esc(w.url || '')}" placeholder="https://ejemplo.com/pagina-a-vigilar">
          <small>Te avisamos cuando esa página cambie.</small>
        </label>
        <label>Nombre (opcional)
          <input name="label" value="${this._esc(w.label || '')}" placeholder="Ej. Precios de Competidor X">
        </label>
        <label class="mn-checkbox">
          <input type="checkbox" name="is_active" ${w.is_active === false ? '' : 'checked'}>
          Vigilando activamente
        </label>
        <footer class="mn-modal-foot">
          <button type="button" class="mn-btn-secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="mn-btn-primary">Guardar cambios</button>
        </footer>
      </form>`;

    const { modal, close } = window.Modal.show({ title: 'Editar página vigilada', body, className: 'mn-modal-content' });
    modal.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => close());
    modal.querySelector('#mnWatcherForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        url:       fd.get('url')?.trim(),
        label:     fd.get('label')?.trim() || null,
        is_active: fd.get('is_active') === 'on',
      };
      if (!payload.url) { alert('La dirección es obligatoria.'); return; }
      const { error } = await this._service.updateWatcher(id, payload);
      if (error) { alert('Error: ' + error.message); return; }
      close();
      await this._refresh();
    });
  }

  async _confirmDeleteWatcher(id) {
    const w = (this._data.watchers.data || []).find(x => x.id === id);
    if (!w) return;
    if (!confirm(`¿Dejar de vigilar "${w.label || w.url}"?\nEsta acción no se puede deshacer.`)) return;
    const { error } = await this._service.deleteWatcher(id);
    if (error) { alert('Error: ' + error.message); return; }
    await this._refresh();
  }

  /* ── helpers ── */
  _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

window.MonitoringView = MonitoringView;
