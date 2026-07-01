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

  static get ENTITY_TIPOS() {
    return [
      { value: 'competidor_directo',   label: __('Competidor directo') },
      { value: 'competidor_indirecto', label: __('Competidor indirecto') },
      { value: 'referencia_cultural',  label: __('Referencia / inspiración') },
      { value: 'owned_media',          label: __('Algo mío') },
    ];
  }

  static get PLATFORMS() {
    return [
    { value: '',                  label: __('— Sin plataforma —') },
    { value: 'instagram',         label: 'Instagram' },
    { value: 'facebook',          label: 'Facebook' },
    { value: 'tiktok',            label: 'TikTok' },
    { value: 'youtube',           label: 'YouTube' },
    { value: 'twitter',           label: 'Twitter / X' },
    { value: 'linkedin',          label: 'LinkedIn' },
    { value: 'google_analytics',  label: 'Google Analytics' },
    { value: 'web',               label: __('Sitio web') },
    ];
  }

  // Paleta para personalizar el color de una burbuja (opcional; el default es
  // el degradado de la marca). '' = volver al color de marca.
  static PALETTE = [
    '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#eab308',
    '#14b8a6', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16',
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
    this._tab      = 'follows'; // follows | urls | suggestions (nav del header)
    this._supabase = null;
    this._orgId    = null;
    this._service  = null;
    this._data     = null;
    this._model    = null;
    this._bound    = false;
    this._bubblePos = {}; // id → {x,y} — persiste posiciones entre re-renders
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
    this.updateHeaderContext(__('Vigilancia'), null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();

    await this._ensureService();
    await this._loadInitial();
    this._setupLive();
  }

  /* Datos en vivo: realtime sobre las tablas de Vigilancia + polling de
     respaldo, todo pasando por liveRefresh (re-pinta solo el body y solo si
     los datos cambiaron). Teardown automatico en BaseView.destroy(). */
  _setupLive() {
    if (!this._service || !this._orgId || this._liveReady) return;
    this._liveReady = true;

    // Sembrar la firma con lo ya pintado para que el 1er tick no re-pinte de mas.
    if (!this._liveSig) this._liveSig = {};
    this._liveSig['monitoring'] = this._dataSignature(this._data);

    this._liveTick = () => this.liveRefresh('monitoring',
      () => this._service.loadAll(),
      (data) => { this._data = data; this._renderBody(); });

    const orgFilter = `organization_id=eq.${this._orgId}`;
    this.liveSubscribe([
      { name: 'ent', table: 'intelligence_entities', filter: orgFilter, onChange: () => this._liveTick() },
      { name: 'wat', table: 'url_watchers',           filter: orgFilter, onChange: () => this._liveTick() },
      // intelligence_signals no tiene organization_id: filtramos por entity_id
      // contra las entities ya cargadas (mismo criterio que el servicio).
      { name: 'sig', table: 'intelligence_signals', event: 'INSERT', onChange: (p) => {
          const eid = p?.new?.entity_id;
          const known = (this._data?.entities?.data || []).map(e => e.id);
          if (eid && known.length && !known.includes(eid)) return;
          this._liveTick();
        } },
    ]);
    this.startLivePoll(60000, () => this._liveTick());
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
    this._stopBubbles();
    if (this._bubbleResizeBound) { window.removeEventListener('resize', this._bubbleResizeBound); this._bubbleResizeBound = null; }
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
    const impactByEntity = this._data.impactByEntity || {};

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
        // Impacto social (engagement de audiencia acumulado) → tamaño de burbuja.
        impact: Number(impactByEntity[e.id]) || 0,
        // Señales captadas: fallback de tamaño cuando aún no hay impacto medido.
        dataCount: sigs.length,
        // Color personalizado (text[]; usamos el 1er color). null = degradado de marca.
        color: (Array.isArray(e.color) && e.color[0]) ? e.color[0] : null,
      });
    });
    pages.forEach(w => {
      let hostname = w.url;
      try { hostname = new URL(w.url).hostname.replace(/^www\./, ''); } catch (_) {}
      const allWsigs = sigByUrl.get(w.url) || [];
      const wsigs = allWsigs.slice(0, 3);
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
        impact: 0, // las páginas se dimensionan por sus cambios (dataCount)
        dataCount: allWsigs.length,
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
    if (e.is_active === false) return { tone: 'paused', icon: 'fa-circle-pause', text: __('En pausa') };
    if ((e.metadata?.consecutive_empty_runs || 0) >= 3)
      return { tone: 'stale', icon: 'fa-moon', text: __('Callado hace rato') };
    if (lastAt && (Date.now() - new Date(lastAt).getTime()) < 7 * 24 * 60 * 60 * 1000)
      return { tone: 'fresh', icon: 'fa-circle-check', text: __('Al día · novedad {rel}', { rel: this._relativeTime(lastAt) }) };
    return { tone: 'quiet', icon: 'fa-circle-check', text: __('Tranquilo · sin novedades por ahora') };
  }

  _estadoPagina(w, lastAt) {
    if (w.is_active === false) return { tone: 'paused', icon: 'fa-circle-pause', text: __('En pausa') };
    if (lastAt && (Date.now() - new Date(lastAt).getTime()) < 24 * 60 * 60 * 1000)
      return { tone: 'changed', icon: 'fa-bolt', text: __('Cambio detectado · {rel}', { rel: this._relativeTime(lastAt) }) };
    if (w.last_checked_at)
      return { tone: 'quiet', icon: 'fa-circle-check', text: __('Sin cambios · revisado {rel}', { rel: this._relativeTime(w.last_checked_at) }) };
    return { tone: 'new', icon: 'fa-hourglass-start', text: __('Empezando a vigilar…') };
  }

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  _renderBody() {
    const body = document.getElementById('monitoringBody');
    if (!body) return;
    if (!this._data) { body.innerHTML = this._skeleton(); return; }

    this._model = this._computeModel();
    body.innerHTML = `
      <div class="mn-page">
        ${this._buildHeader(this._model)}
        <div class="mn-content" id="mnContent"></div>
      </div>`;
    this._renderContent();
    // Bind una sola vez: el listener vive en #monitoringBody (persiste entre re-renders).
    if (!this._bound) { this._bind(body, this._model); this._bound = true; }
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
      ? { label: __('Todo en marcha'), sub: __('Vigilancia activa'), color: 'green', icon: 'fa-circle-check' }
      : { label: __('En reposo'),      sub: __('Nada activo aún'),   color: 'teal',  icon: 'fa-pause' };

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
        <h2 class="mn-hero-title">${__('Esto es lo que vigilamos por ti')}</h2>
        <p class="mn-hero-sub">${__('Lo revisamos solos cada cierto tiempo. Tú solo prende, apaga, y mira qué encontramos.')}</p>
      </div>
      <div class="mb-kpi-strip mn-pulse">
        ${tile('blue',   'fa-binoculars',   counts.siguiendo,  __('Siguiendo'),        __('Marcas y páginas activas'))}
        ${tile('orange', 'fa-bolt',         counts.novedades,  __('Con novedades'),    __('En los últimos 7 días'))}
        ${tile('pink',   'fa-wand-magic-sparkles', counts.propuestas, __('Propuestas nuevas'), __('Por revisar'), counts.propuestas > 0)}
        ${tile(estado.color, estado.icon,   estado.label,      __('Estado'),           estado.sub)}
      </div>`;
  }

  /* ── Banner "Propuestas nuevas" ── */
  _buildPropuestas(model) {
    const props = model.propuestas;
    if (!props.length) return '';
    const tipoLabel = (t) =>
      MonitoringView.ENTITY_TIPOS.find(x => x.value === t)?.label || __('Perfil');
    const cards = props.map(e => {
      const platform = e.metadata?.platform || '';
      const icon = MonitoringView.PLATFORM_ICON[platform] || 'fas fa-hashtag';
      const why = `${tipoLabel(e.metadata?.tipo)}${platform ? __(' en {p}', { p: this._platformName(platform) }) : ''}. ${__('Lo encontramos cerca de tu competencia.')}`;
      return `
        <div class="mn-prop" data-id="${this._esc(e.id)}">
          <div class="mn-prop-avatar"><i class="${icon}"></i></div>
          <div class="mn-prop-main">
            <div class="mn-prop-name">${this._esc(e.name || '—')}</div>
            <div class="mn-prop-why">${this._esc(why)}</div>
          </div>
          <div class="mn-prop-actions">
            <button class="mn-prop-btn mn-prop-btn--yes" data-action="prop-follow" data-id="${this._esc(e.id)}">
              <i class="fas fa-plus"></i> ${__('Seguir')}
            </button>
            <button class="mn-prop-btn mn-prop-btn--no" data-action="prop-dismiss" data-id="${this._esc(e.id)}">
              ${__('Descartar')}
            </button>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="mn-prop-banner">
        <header class="mn-prop-head">
          <div class="mn-prop-head-icon"><i class="fas fa-wand-magic-sparkles"></i></div>
          <div>
            <h3 class="mn-prop-title">${props.length === 1 ? __('Encontramos {n} perfil que quizá quieras seguir', { n: props.length }) : __('Encontramos {n} perfiles que quizá quieras seguir', { n: props.length })}</h3>
            <p class="mn-prop-subtitle">${__('Tú decides: súmalos a tu vigilancia o descártalos.')}</p>
          </div>
        </header>
        <div class="mn-prop-list">${cards}</div>
      </section>`;
  }

  /* ── Columnas "Lo que sigo" — kanban limpio por estado ── */
  static get COLUMNS() {
    return [
      { id: 'news',   label: __('Con novedad'), hint: __('Cambios recientes'),  emptyIcon: 'fa-bell',         emptyText: __('Sin novedades por ahora') },
      { id: 'calm',   label: __('Al día'),      hint: __('Activo y tranquilo'), emptyIcon: 'fa-circle-check', emptyText: __('Nada por aquí todavía') },
      { id: 'silent', label: __('Sin señales'), hint: __('Callados hace rato'), emptyIcon: 'fa-moon',         emptyText: __('Nada callado por ahora') },
      { id: 'paused', label: __('En pausa'),    hint: __('Desactivados'),       emptyIcon: 'fa-circle-pause', emptyText: __('Nada en pausa') },
    ];
  }

  _columnOf(item) {
    const t = item.status.tone;
    if (t === 'paused') return 'paused';
    if (t === 'fresh' || t === 'changed') return 'news';
    if (t === 'stale') return 'silent';
    return 'calm'; // quiet, new (empezando a vigilar)
  }

  /* ── Header con navegacion (tabs) + accion ── */
  _buildHeader(model) {
    const profiles = model.items.filter(i => i.kind === 'profile').length;
    const pages    = model.items.filter(i => i.kind === 'page').length;
    const sugs     = model.propuestas.length;
    const tabs = [
      { id: 'follows',     label: __('Seguidos'),               count: profiles },
      { id: 'urls',        label: __('URLs monitoreadas'),      count: pages },
      { id: 'suggestions', label: __('Sugerencias del sistema'), count: sugs, accent: sugs > 0 },
    ];
    const nav = tabs.map(t => `
      <button type="button" class="mn-tab${this._tab === t.id ? ' is-active' : ''}${t.accent ? ' mn-tab--accent' : ''}"
              data-action="tab" data-tab="${t.id}" role="tab" aria-selected="${this._tab === t.id}">
        ${this._esc(t.label)}${t.count ? `<span class="mn-tab-count">${t.count}</span>` : ''}
      </button>`).join('');
    return `
      <div class="mn-toolbar">
        <nav class="mn-tabs" role="tablist">${nav}</nav>
        <button type="button" class="mn-btn-primary" data-action="new-item">
          <i class="fas fa-plus"></i> ${__('Seguir algo nuevo')}
        </button>
      </div>`;
  }

  /* ── Renderiza el contenido del tab activo en #mnContent ── */
  _renderContent() {
    const el = document.getElementById('mnContent');
    if (!el || !this._model) return;
    this._stopBubbles();
    if (this._tab === 'suggestions') {
      el.innerHTML = this._buildSuggestionsTab(this._model);
    } else {
      const kind = this._tab === 'urls' ? 'page' : 'profile';
      el.innerHTML = this._buildBoard(this._model, kind);
      this._initBubbles(kind);
    }
  }

  _switchTab(tab) {
    if (!tab || tab === this._tab) return;
    this._tab = tab;
    document.querySelectorAll('#monitoringBody .mn-tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    this._renderContent();
  }

  /* ── Board de burbujas por estado, filtrado por kind (profile|page).
        Cada columna es un "frasco" con gravedad: las burbujas caen y se apilan.
        Tamaño ∝ dato generado · color (borde) = identidad personalizable. ── */
  _buildBoard(model, kind) {
    const items = model.items.filter(i => i.kind === kind);

    if (!items.length) {
      const isPage = kind === 'page';
      return this.emptyState({
        fill: true,
        icon: isPage ? 'fa-globe' : 'fa-binoculars',
        title: isPage ? __('Aún no monitoreas ninguna URL.') : __('Aún no sigues a ninguna marca o perfil.'),
        subtitle: __('Agrega el primero y nosotros nos encargamos del resto.'),
        primaryLabel: __('Seguir algo nuevo'),
        primaryAction: 'new-item',
      });
    }

    const buckets = { news: [], calm: [], silent: [], paused: [] };
    items.forEach(i => buckets[this._columnOf(i)].push(i));
    // Sembrar las de mayor impacto primero (caen antes → quedan abajo/estables).
    const seedMetric = (i) => (i.impact || 0) || (i.dataCount || 0);
    Object.values(buckets).forEach(b => b.sort((a, z) => seedMetric(z) - seedMetric(a)));
    this._bubbleBuckets = buckets;

    const column = (c) => {
      const list = buckets[c.id];
      return `
        <section class="mn-col mn-col--${c.id}">
          <header class="mn-col-head">
            <span class="mn-col-dot"></span>
            <h3 class="mn-col-title">${c.label}</h3>
            <span class="mn-col-count">${list.length}</span>
          </header>
          <p class="mn-col-hint">${c.hint}</p>
          <div class="mn-bubbles" data-col="${c.id}">
            <canvas></canvas>
            <div class="mn-bub-labels"></div>
            ${list.length ? '' : `<div class="mn-bub-empty"><i class="fas ${c.emptyIcon}"></i><span>${c.emptyText}</span></div>`}
          </div>
        </section>`;
    };
    return `<div class="mn-cols mn-cols--bubbles">${MonitoringView.COLUMNS.map(column).join('')}</div>`;
  }

  /* ══════════════════════════════════════════════════════════
     MOTOR DE BURBUJAS — física por columna (gravedad + colisión)
  ══════════════════════════════════════════════════════════ */
  _hash(str) {
    let h = 5381;
    for (let i = 0; i < String(str).length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /** Degradado de la marca (mismos colores que el resto de la app). Lee las CSS
      vars que setea OrgBrandTheme; cae al primario, y si no, a un cálido. */
  _brandGradientStops() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const grad = (cs.getPropertyValue('--brand-gradient-dynamic') ||
                    cs.getPropertyValue('--brand-gradient') || '').trim();
      const hexes = (grad.match(/#[0-9a-fA-F]{6,8}/g) || []).map(h => h.slice(0, 7));
      if (hexes.length >= 2) return hexes.slice(0, 2);
      const primary = (cs.getPropertyValue('--brand-primary') || '').trim();
      if (/^#[0-9a-fA-F]{6}/.test(primary)) return [primary.slice(0, 7), this._lighten(primary.slice(0, 7), 0.28)];
      if (hexes.length === 1) return [hexes[0], this._lighten(hexes[0], 0.28)];
    } catch (_) {}
    return ['#e09145', '#f6b26b'];
  }

  /** Stops de la burbuja: color personalizado si existe (→ gradiente derivado),
      si no el degradado de la marca. */
  _bubbleStops(item) {
    if (item && item.color) return [item.color, this._lighten(item.color, 0.28)];
    return this._brandStops || ['#e09145', '#f6b26b'];
  }

  /** Aclara un hex mezclándolo hacia blanco (para el 2º stop si falta). */
  _lighten(hex, amt) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const mix = (c) => Math.round(c + (255 - c) * amt);
    return `#${[mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  }

  _initBubbles(kind) {
    const cont = document.getElementById('mnContent');
    if (!cont || !this._bubbleBuckets) return;

    // Degradado de la marca (una sola lectura por render) para pintar las burbujas.
    this._brandStops = this._brandGradientStops();

    // Escala de tamaño compartida por todo el board (comparables entre columnas).
    // Métrica principal = impacto social (engagement de audiencia). Si el board
    // aún no tiene impacto medido, cae a señales captadas; si tampoco, uniforme.
    const all = Object.values(this._bubbleBuckets).flat();
    let metric = (i) => (i.impact || 0);
    let maxData = Math.max(0, ...all.map(metric));
    if (maxData <= 0) { metric = (i) => (i.dataCount || 0); maxData = Math.max(0, ...all.map(metric)); }
    const uniform = maxData <= 0;
    const MINR = 30, MAXR = 66;
    const radiusFor = (it) => uniform ? 40 : MINR + (MAXR - MINR) * Math.sqrt(metric(it)) / Math.sqrt(maxData);

    this._bubbleWorlds = [];
    cont.querySelectorAll('.mn-bubbles').forEach((stage) => {
      const canvas = stage.querySelector('canvas');
      const colId  = stage.dataset.col;
      const items  = this._bubbleBuckets[colId] || [];
      if (!canvas || !items.length) return;
      const bodies = items.map((it, idx) => {
        const r = radiusFor(it);
        // Si ya teníamos posición para esta burbuja (re-render por polling/live),
        // la restauramos ya asentada → NO vuelve a caer desde arriba.
        const saved = this._bubblePos[it.id];
        return {
          it, r, rDraw: r,
          x: saved ? saved.x : 0,
          y: saved ? saved.y : (-80 - idx * 24),
          vx: 0, vy: 0, seeded: !!saved, idx,
        };
      });
      // Overlay DOM: icono de plataforma (dentro) + nombre completo (debajo).
      const labels = stage.querySelector('.mn-bub-labels');
      if (labels) {
        labels.innerHTML = '';
        bodies.forEach((b) => {
          const iconCls = MonitoringView.PLATFORM_ICON[b.it.platform] || 'fas fa-hashtag';
          const icon = document.createElement('span');
          icon.className = 'mn-bub-icon' + (colId === 'paused' ? ' is-dim' : '');
          icon.innerHTML = `<i class="${iconCls}"></i>`;
          const name = document.createElement('span');
          name.className = 'mn-bub-name' + (colId === 'paused' ? ' is-dim' : '');
          name.textContent = b.it.title || '';
          labels.appendChild(icon); labels.appendChild(name);
          b.iconEl = icon; b.nameEl = name;
        });
      }
      const world = { stage, canvas, ctx: canvas.getContext('2d'), bodies, W: 0, H: 0, DPR: 1, hover: null, colId };
      this._wireBubbleCanvas(world);
      this._bubbleWorlds.push(world);
    });

    this._layoutBubbles();
    this._bubbleSleep = 0;
    this._wakeBubbles();

    if (!this._bubbleResizeBound) {
      this._bubbleResizeBound = () => { this._layoutBubbles(); this._wakeBubbles(); };
      window.addEventListener('resize', this._bubbleResizeBound);
    }
  }

  _layoutBubbles() {
    (this._bubbleWorlds || []).forEach((w) => {
      const rect = w.canvas.getBoundingClientRect();
      w.DPR = Math.min(window.devicePixelRatio || 1, 2);
      w.W = Math.max(1, rect.width); w.H = Math.max(1, rect.height);
      w.canvas.width = w.W * w.DPR; w.canvas.height = w.H * w.DPR;
      w.ctx.setTransform(w.DPR, 0, 0, w.DPR, 0, 0);
      w.bodies.forEach((b) => {
        if (!b.seeded) {
          b.x = Math.max(b.r, Math.min(w.W - b.r, w.W * 0.15 + this._hash(b.it.id) % Math.max(1, Math.floor(w.W * 0.7))));
          b.y = -b.r - b.idx * 22;
          b.seeded = true;
        } else {
          // Restaurada: clamp por si la columna cambió de tamaño.
          b.x = Math.max(b.r, Math.min(w.W - b.r, b.x));
          b.y = Math.max(b.r, Math.min(w.H - b.r - 6, b.y));
        }
        this._positionLabel(b, b.r); // posición inicial (evita parpadeo en 0,0)
      });
    });
  }

  /** Coloca el icono (arriba) y el nombre (abajo) DENTRO de la burbuja. */
  _positionLabel(b, r) {
    if (b.iconEl) {
      b.iconEl.style.left = b.x + 'px';
      b.iconEl.style.top = (b.y - r * 0.26) + 'px';
      b.iconEl.style.fontSize = Math.max(11, r * 0.46) + 'px';
    }
    if (b.nameEl) {
      b.nameEl.style.left = b.x + 'px';
      b.nameEl.style.top = (b.y + r * 0.34) + 'px';
      b.nameEl.style.fontSize = Math.max(7.5, Math.min(12, r * 0.26)) + 'px';
      b.nameEl.style.maxWidth = (r * 1.7) + 'px';
    }
  }

  _stepBubbles(w) {
    // Mundo congelado (ya asentado) y sin hover → no tocar nada. Esto evita el
    // micro-rebote perpetuo de la gravedad contra el piso (el "baile").
    if (w.frozen && !w.hover) { w._overlap = false; return 0; }

    const G = 0.32, FR = 0.985, REST = 0.16;
    for (const b of w.bodies) { b.vy += G; b.vx *= FR; b.vy *= FR; b.x += b.vx; b.y += b.vy; }
    // Radio efectivo = el que se está dibujando (incluye el hover), para que una
    // burbuja agrandada empuje a las vecinas y NUNCA se solapen ni se tapen.
    const rad = (b) => b.rDraw || b.r;
    // Iteraciones del solver escaladas al nº de cuerpos + sobre-relajación → los
    // packs densos (muchas/grandes burbujas) convergen sin solape.
    const SOR = 1.5; // factor de sobre-relajación
    const iters = Math.min(44, 16 + w.bodies.length * 2);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < w.bodies.length; i++) {
        for (let j = i + 1; j < w.bodies.length; j++) {
          const a = w.bodies[i], b = w.bodies[j];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < 0.01) { dx = (j - i) || 1; dy = -0.6; d = Math.hypot(dx, dy); } // centros coincidentes → separar
          const min = rad(a) + rad(b) + 1; // +1px de aire para que no se toquen
          if (d < min) {
            let nx = dx / d, ny = dy / d;
            // Contacto casi horizontal: cuando no caben a lo ancho, sesgar la
            // normal hacia lo vertical para que APILEN (pirámide) en vez de
            // encimarse contra las paredes. Amplifica la asimetría de altura ya
            // existente; si están perfectamente niveladas, decide por índice.
            if (Math.abs(ny) < 0.26) {
              const dir = ny !== 0 ? Math.sign(ny) : (((j - i) % 2) ? 1 : -1);
              ny = dir * 0.26;
              nx = Math.sign(dx || 1) * Math.sqrt(1 - ny * ny);
            }
            const ov = (min - d) / 2 * SOR;
            a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
            const rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rv < 0) { a.vx -= rv * nx * REST; a.vy -= rv * ny * REST; b.vx += rv * nx * REST; b.vy += rv * ny * REST; }
          }
        }
      }
      const floorPad = 6; // el nombre ahora va DENTRO → solo un respiro mínimo
      for (const b of w.bodies) {
        const r = rad(b);
        if (b.x < r) { b.x = r; b.vx *= -REST; }
        if (b.x > w.W - r) { b.x = w.W - r; b.vx *= -REST; }
        if (b.y > w.H - r - floorPad) { b.y = w.H - r - floorPad; b.vy *= -REST; }
        if (b.y < r) { b.y = r; } // techo (por si una grande empuja hacia arriba)
      }
    }
    // ¿Queda algún solape? La corrección por posición no genera velocidad, así
    // que el loop NO debe dormirse mientras haya solape (si no, congela burbujas
    // encimadas). Se marca en el mundo para que _bubbleLoop lo mantenga vivo.
    let overlap = false;
    for (let i = 0; i < w.bodies.length && !overlap; i++) {
      for (let j = i + 1; j < w.bodies.length; j++) {
        const a = w.bodies[i], b = w.bodies[j];
        const min = rad(a) + rad(b);
        if (Math.hypot(b.x - a.x, b.y - a.y) < min - 0.6) { overlap = true; break; }
      }
    }
    w._overlap = overlap;

    // ¿Se sigue moviendo? Medimos el desplazamiento real de posición (no la
    // velocidad, que por el rebote nunca llega a 0). Si el mundo quedó quieto y
    // sin solape por varios frames → lo CONGELAMOS (no más "baile").
    let moved = 0;
    for (const b of w.bodies) {
      moved = Math.max(moved, Math.abs(b.x - (b._px != null ? b._px : b.x)) + Math.abs(b.y - (b._py != null ? b._py : b.y)));
      b._px = b.x; b._py = b.y;
    }
    if (!overlap && moved < 0.4) {
      if ((w._still = (w._still || 0) + 1) > 12) w.frozen = true;
    } else {
      w._still = 0;
    }

    // Energía cinética (para dormir el loop cuando todo asienta).
    let ke = 0;
    for (const b of w.bodies) ke += b.vx * b.vx + b.vy * b.vy;
    return ke;
  }

  _drawBubbles(w) {
    const { ctx } = w;
    ctx.clearRect(0, 0, w.W, w.H);
    const pulse = w.colId === 'news';
    const dimmed = w.colId === 'paused';
    // Dibuja la hovered al final (encima).
    const order = w.bodies.slice().sort((a, b) => (a === w.hover ? 1 : 0) - (b === w.hover ? 1 : 0));
    for (const b of order) {
      const isHover = b === w.hover;
      const target = b.r * (isHover ? 1.16 : 1);
      b.rDraw += (target - b.rDraw) * 0.25;
      const r = b.rDraw;

      // Color: personalizado si el usuario lo definió, si no el degradado de marca.
      const stops = this._bubbleStops(b.it);
      const c0 = stops[0], c1 = stops[1] || stops[0];

      // Gradiente diagonal.
      const grad = ctx.createLinearGradient(b.x - r, b.y - r, b.x + r, b.y + r);
      grad.addColorStop(0, dimmed ? this._hexA(c0, 0.5) : c0);
      grad.addColorStop(1, dimmed ? this._hexA(c1, 0.5) : c1);

      // Halo del color de marca.
      const g = ctx.createRadialGradient(b.x, b.y, r * 0.6, b.x, b.y, r * 1.55);
      g.addColorStop(0, this._hexA(c0, dimmed ? 0.05 : (isHover ? 0.24 : 0.14)));
      g.addColorStop(1, this._hexA(c0, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.55, 0, 7); ctx.fill();

      // Relleno sólido oscuro (color de las cards) + tenue tinte de marca.
      ctx.fillStyle = dimmed ? '#141416' : '#17171a';
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
      ctx.save();
      ctx.globalAlpha = dimmed ? 0.05 : 0.10;
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
      ctx.restore();

      // Borde con el degradado de marca — pulso suave en "Con novedad".
      let lw = isHover ? 3.2 : 2.6;
      if (pulse && !isHover) lw = 2.6 + Math.sin(this._bubbleT * 0.05 + b.x) * 0.9;
      ctx.lineWidth = lw; ctx.strokeStyle = grad;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.stroke();

      // Icono de plataforma (arriba) + nombre completo (abajo) — DOM overlay,
      // ambos DENTRO de la burbuja.
      this._positionLabel(b, r);
      // Persistir la posición para que un re-render no las haga caer de nuevo.
      this._bubblePos[b.it.id] = { x: b.x, y: b.y };
    }
  }

  _bubbleLoop() {
    this._bubbleT = (this._bubbleT || 0) + 1;
    this._bubbleAwakeFrames = (this._bubbleAwakeFrames || 0) + 1;
    let maxKE = 0, animating = false;
    for (const w of (this._bubbleWorlds || [])) {
      const ke = this._stepBubbles(w);
      this._drawBubbles(w);
      maxKE = Math.max(maxKE, ke);
      // ¿alguna burbuja aún animando su tamaño (hover)?
      for (const b of w.bodies) if (Math.abs(b.rDraw - b.r * (b === w.hover ? 1.16 : 1)) > 0.3) animating = true;
      if (w.hover) animating = true;
      // No dormir mientras se estén separando — pero con tope de seguridad para
      // que un pack imposible (demasiadas burbujas gigantes) no corra infinito.
      if (w._overlap && this._bubbleAwakeFrames < 900) animating = true;
    }
    const hasPulse = (this._bubbleWorlds || []).some(w => w.colId === 'news' && w.bodies.length);
    if (maxKE < 0.05 && !animating && !hasPulse) {
      if (++this._bubbleSleep > 20) { this._bubbleRAF = null; return; } // dormir
    } else {
      this._bubbleSleep = 0;
    }
    this._bubbleRAF = requestAnimationFrame(() => this._bubbleLoop());
  }

  _wakeBubbles() {
    this._bubbleSleep = 0;
    // Descongelar: al interactuar (hover/resize/color) la física vuelve a correr.
    (this._bubbleWorlds || []).forEach((w) => { w.frozen = false; w._still = 0; });
    if (!this._bubbleRAF) { this._bubbleAwakeFrames = 0; this._bubbleRAF = requestAnimationFrame(() => this._bubbleLoop()); }
  }

  _stopBubbles() {
    if (this._bubbleRAF) { cancelAnimationFrame(this._bubbleRAF); this._bubbleRAF = null; }
    this._bubbleWorlds = [];
    this._closeBubblePop();
  }

  _wireBubbleCanvas(w) {
    const canvas = w.canvas;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hit = (p) => { for (const b of w.bodies) if (Math.hypot(b.x - p.x, b.y - p.y) < b.rDraw) return b; return null; };
    canvas.addEventListener('mousemove', (e) => {
      const b = hit(pos(e));
      canvas.style.cursor = b ? 'pointer' : 'default';
      if (w.hover !== b) { w.hover = b; this._wakeBubbles(); }
    });
    canvas.addEventListener('mouseleave', () => { if (w.hover) { w.hover = null; this._wakeBubbles(); } });
    canvas.addEventListener('click', (e) => {
      const b = hit(pos(e));
      if (b) { this._openBubblePop(b.it, e.clientX, e.clientY); e.stopPropagation(); }
      else this._closeBubblePop();
    });
  }

  _hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r || 0},${g || 0},${b || 0},${a})`;
  }

  /* ── Popover al hacer clic en una burbuja: identidad + impacto + acciones ── */
  _openBubblePop(item, cx, cy) {
    this._closeBubblePop();
    const model = this._model;
    const containerName = (id) => (model?.containers || []).find(c => c.id === id)?.nombre_marca || null;
    const isProfile = item.kind === 'profile';
    const stops = this._bubbleStops(item);
    const brand = isProfile ? containerName(item.containerId) : null;
    const typeLabel = isProfile ? __('Marca / perfil') : __('Página web');
    const meta = `${typeLabel}${brand ? ' · ' + this._esc(brand) : ''}`;
    // Línea de impacto social (lo que dimensiona la burbuja).
    const impactLine = isProfile
      ? `<div class="mn-bubpop-meta"><i class="fas fa-fire" style="opacity:.6"></i> ${item.impact > 0
            ? __('Impacto social: {n} interacciones (90 d)', { n: this._compact(item.impact) })
            : __('Sin impacto medido aún')}</div>`
      : `<div class="mn-bubpop-meta"><i class="fas fa-arrows-rotate" style="opacity:.6"></i> ${item.dataCount} ${__('cambios detectados')}</div>`;

    const veraActs = isProfile ? `
      <button class="mn-bubpop-act" data-bact="vera-analizar"><i class="fas fa-wand-magic-sparkles"></i> ${__('Analizar')}</button>
      <button class="mn-bubpop-act" data-bact="vera-comparar"><i class="fas fa-code-compare"></i> ${__('Comparar')}</button>
      <button class="mn-bubpop-act" data-bact="vera-inspirar"><i class="fas fa-lightbulb"></i> ${__('Ideas')}</button>` : `
      <a class="mn-bubpop-act" href="${this._esc(item.url)}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ${__('Abrir página')}</a>`;

    const starBtn = isProfile ? `
      <button class="mn-bubpop-star${item.highlighted ? ' is-on' : ''}" data-bact="toggle-highlight" title="${__('Destacar')}"><i class="fas fa-star"></i></button>` : '';

    // Personalización de color (opcional). Default = degradado de marca (chip "Marca").
    const brandStops = this._brandStops || ['#e09145', '#f6b26b'];
    const colorSection = isProfile ? `
      <div class="mn-bubpop-label">${__('Color de la burbuja')}</div>
      <div class="mn-bubpop-colors">
        <button class="mn-swatch mn-swatch--brand${!item.color ? ' is-on' : ''}" data-color=""
                title="${__('Usar color de la marca')}"
                style="background:linear-gradient(135deg, ${brandStops[0]}, ${brandStops[1] || brandStops[0]})"></button>
        ${MonitoringView.PALETTE.map(c => `
          <button class="mn-swatch${(item.color === c) ? ' is-on' : ''}" style="background:${c}"
                  data-color="${c}" title="${c}"></button>`).join('')}
      </div>` : '';

    const pop = document.createElement('div');
    pop.className = 'mn-bubpop';
    pop.innerHTML = `
      <div class="mn-bubpop-head">
        <div class="mn-bubpop-avatar" style="border-image:linear-gradient(135deg, ${stops[0]}, ${stops[1] || stops[0]}) 1; box-shadow:0 0 0 3px ${this._hexA(stops[0], 0.14)}">
          ${this._esc((item.title || '—').charAt(0).toUpperCase())}
        </div>
        <div class="mn-bubpop-id">
          <div class="mn-bubpop-name">${this._esc(item.title)}</div>
          <div class="mn-bubpop-sub">${item.subtitle ? this._esc(item.subtitle) : ''}</div>
        </div>
        ${starBtn}
      </div>
      <div class="mn-bubpop-meta">${meta}</div>
      ${impactLine}
      ${colorSection}
      <div class="mn-bubpop-acts">${veraActs}</div>
      <div class="mn-bubpop-foot">
        <label class="mn-onoff mn-onoff--sm" title="${item.isActive ? __('Pausar') : __('Activar')}">
          <input type="checkbox" ${item.isActive ? 'checked' : ''} data-bact="toggle-active">
          <span class="mn-onoff-track"></span>
        </label>
        <span class="mn-bubpop-foot-spacer"></span>
        <button class="mn-btn-icon" data-bact="edit" title="${__('Editar')}"><i class="fas fa-pen"></i></button>
        <button class="mn-btn-icon mn-btn-icon--danger" data-bact="delete" title="${__('Dejar de seguir')}"><i class="fas fa-trash"></i></button>
      </div>`;
    document.body.appendChild(pop);
    this._bubPop = pop;

    // Posicionar cerca del cursor, sin salirse de la ventana.
    const pw = 244, ph = pop.offsetHeight || 220;
    let x = cx + 14, y = cy - 10;
    if (x + pw > window.innerWidth) x = cx - pw - 14;
    if (y + ph > window.innerHeight) y = window.innerHeight - ph - 10;
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = Math.max(8, y) + 'px';

    // Wiring.
    pop.addEventListener('click', (e) => e.stopPropagation());
    pop.querySelectorAll('.mn-swatch').forEach(sw =>
      sw.addEventListener('click', () => this._setBubbleColor(item, sw.dataset.color)));
    pop.querySelectorAll('[data-bact]').forEach(el =>
      el.addEventListener('click', (e) => this._onBubbleAction(el.dataset.bact, item, e)));

    if (!this._bubPopOutside) {
      this._bubPopOutside = () => this._closeBubblePop();
      setTimeout(() => document.addEventListener('click', this._bubPopOutside), 0);
      this._bubPopEsc = (e) => { if (e.key === 'Escape') this._closeBubblePop(); };
      document.addEventListener('keydown', this._bubPopEsc);
    }
  }

  _closeBubblePop() {
    if (this._bubPop) { this._bubPop.remove(); this._bubPop = null; }
    if (this._bubPopOutside) { document.removeEventListener('click', this._bubPopOutside); this._bubPopOutside = null; }
    if (this._bubPopEsc) { document.removeEventListener('keydown', this._bubPopEsc); this._bubPopEsc = null; }
  }

  async _onBubbleAction(action, item, e) {
    if (action === 'toggle-active') {
      const checked = e.target.checked;
      const svc = item.kind === 'page'
        ? this._service.updateWatcher(item.id, { is_active: checked })
        : this._service.updateEntity(item.id, { is_active: checked });
      const { error } = await svc;
      if (error) { alert(__('No se pudo cambiar:') + ' ' + error.message); e.target.checked = !checked; return; }
      this._closeBubblePop(); await this._refresh();
      return;
    }
    this._closeBubblePop();
    switch (action) {
      case 'edit':            return item.kind === 'page' ? this._openWatcherModal(item.id) : this._openEntityModal(item.id);
      case 'delete':          return item.kind === 'page' ? this._confirmDeleteWatcher(item.id) : this._confirmDeleteEntity(item.id);
      case 'toggle-highlight':return this._toggleHighlight(item.id);
      case 'vera-analizar':
      case 'vera-comparar':
      case 'vera-inspirar':   return this._goToVera(action, item.id);
    }
  }

  /** Personaliza el color de una burbuja (o la devuelve al degradado de marca
      con color vacío). Optimista en el canvas + persiste; sincroniza la firma
      live para no re-asentar las burbujas (el color no cambia posición). */
  async _setBubbleColor(item, color) {
    const next = color || null; // '' (chip Marca) → null = degradado de marca
    const prev = item.color;
    if (next === prev) return;
    item.color = next; // el modelo vivo → el canvas lo toma al instante
    if (this._bubPop) this._bubPop.querySelectorAll('.mn-swatch').forEach(sw =>
      sw.classList.toggle('is-on', (sw.dataset.color || null) === next));
    this._wakeBubbles();
    const { error } = await this._service.updateEntity(item.id, { color: next });
    if (error) { item.color = prev; this._wakeBubbles(); alert(__('No se pudo guardar el color:') + ' ' + error.message); return; }
    const row = (this._data?.entities?.data || []).find(r => r.id === item.id);
    if (row) row.color = next ? [next] : null;
    if (this._liveSig) this._liveSig['monitoring'] = this._dataSignature(this._data);
  }

  /** Formatea un número grande de forma compacta (1.2K, 3.4M) para el impacto. */
  _compact(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }

  /* ── Tab de sugerencias del sistema (propuestas, sin el banner rosa) ── */
  _buildSuggestionsTab(model) {
    const props = model.propuestas;
    if (!props.length) {
      return this.emptyState({
        fill: true,
        icon: 'fa-wand-magic-sparkles',
        title: __('No hay sugerencias nuevas por ahora.'),
        subtitle: __('Cuando detectemos perfiles o páginas cerca de tu competencia, aparecerán aquí.'),
      });
    }
    const tipoLabel = (t) => MonitoringView.ENTITY_TIPOS.find(x => x.value === t)?.label || __('Perfil');
    const cards = props.map((e) => {
      const platform = e.metadata?.platform || '';
      const icon = MonitoringView.PLATFORM_ICON[platform] || 'fas fa-hashtag';
      const why = `${tipoLabel(e.metadata?.tipo)}${platform ? __(' en {p}', { p: this._platformName(platform) }) : ''}. ${__('Lo encontramos cerca de tu competencia.')}`;
      return `
        <article class="mn-sug-card" data-id="${this._esc(e.id)}">
          <div class="mn-sug-avatar"><i class="${icon}"></i></div>
          <div class="mn-sug-main">
            <div class="mn-sug-name">${this._esc(e.name || '—')}</div>
            <div class="mn-sug-why">${this._esc(why)}</div>
          </div>
          <div class="mn-sug-actions">
            <button type="button" class="mn-btn-primary" data-action="prop-follow" data-id="${this._esc(e.id)}">
              <i class="fas fa-plus"></i> ${__('Seguir')}
            </button>
            <button type="button" class="mn-btn-secondary" data-action="prop-dismiss" data-id="${this._esc(e.id)}">
              ${__('Descartar')}
            </button>
          </div>
        </article>`;
    }).join('');
    return `
      <div class="mn-suggestions">
        <p class="mn-sug-intro">${__('Tú decides: súmalos a tu vigilancia o descártalos.')}</p>
        <div class="mn-sug-grid">${cards}</div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     EVENTOS
  ══════════════════════════════════════════════════════════ */
  _bind(body, model) {
    body.addEventListener('click',  (e) => this._onClick(e));
    body.addEventListener('change', (e) => this._onChange(e));
  }

  async _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;

    switch (action) {
      case 'tab':             return this._switchTab(btn.dataset.tab);
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
      if (error) { alert(__('No se pudo cambiar:') + ' ' + error.message); ent.checked = !ent.checked; }
      else await this._refresh();
      return;
    }
    const w = e.target.closest('[data-action="toggle-watcher"]');
    if (w) {
      const { error } = await this._service.updateWatcher(w.dataset.id, { is_active: w.checked });
      if (error) { alert(__('No se pudo cambiar:') + ' ' + error.message); w.checked = !w.checked; }
      else await this._refresh();
    }
  }

  async _propFollow(id) {
    const { error } = await this._service.updateEntity(id, { is_active: true });
    if (error) { alert(__('No se pudo seguir:') + ' ' + error.message); return; }
    await this._refresh();
  }

  async _propDismiss(id) {
    const { error } = await this._service.updateEntity(id, { metadata: { dismissed: true } });
    if (error) { alert(__('No se pudo descartar:') + ' ' + error.message); return; }
    await this._refresh();
  }

  async _toggleHighlight(id) {
    const entity = (this._data.entities.data || []).find(x => x.id === id);
    if (!entity) return;
    const next = !(entity.metadata?.highlighted === true);
    const { error } = await this._service.updateEntity(id, { metadata: { highlighted: next } });
    if (error) { alert(__('Error:') + ' ' + error.message); return; }
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
      `<option value="">${__('— Sin marca —')}</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}">${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    const body = `
      <div class="mn-form" id="mnCreateForm">
        <div class="mn-kindpick">
          <button type="button" class="mn-kind is-active" data-kind="profile">
            <i class="fas fa-user-group"></i> ${__('Una marca o perfil')}
          </button>
          <button type="button" class="mn-kind" data-kind="page">
            <i class="fas fa-globe"></i> ${__('Una página web')}
          </button>
        </div>

        <div data-pane="profile">
          <label>${__('¿A quién quieres seguir?')}
            <input name="name" value="" placeholder="${__('Ej. Red Bull')}">
          </label>
          <div class="mn-form-grid">
            <label>${__('¿Qué es?')}<select name="tipo">${tipoOpts}</select></label>
            <label>${__('Plataforma')}<select name="platform">${platOpts}</select></label>
          </div>
          <label>${__('Usuario o enlace')}
            <input name="target_identifier" value="" placeholder="@usuario">
          </label>
          <details class="mn-advanced">
            <summary>${__('Opciones avanzadas')}</summary>
            <div class="mn-advanced-body">
              <label>${__('Marca asociada')}<select name="brand_container_id">${containerOpts}</select></label>
              <label>${__('Tipo de dato')}
                <select name="domain">
                  <option value="social" selected>${__('Redes sociales')}</option>
                  <option value="analytics">${__('Analítica')}</option>
                  <option value="web">${__('Sitio web')}</option>
                </select>
              </label>
              <small>${__('Para fuentes técnicas puedes usar identificadores como {meta} o {ga4} en el campo "Usuario o enlace".', { meta: '<code>meta:1234</code>', ga4: '<code>ga4:5678</code>' })}</small>
            </div>
          </details>
        </div>

        <div data-pane="page" hidden>
          <label>${__('Dirección de la página')}
            <input name="url" type="url" value="" placeholder="https://ejemplo.com/pagina-a-vigilar">
            <small>${__('Te avisamos cuando esa página cambie.')}</small>
          </label>
          <label>${__('Nombre (opcional)')}
            <input name="label" value="" placeholder="${__('Ej. Precios de Competidor X')}">
          </label>
        </div>

        <footer class="mn-modal-foot">
          <button type="button" class="mn-btn-secondary" data-action="close-modal">${__('Cancelar')}</button>
          <button type="button" class="mn-btn-primary" data-action="create-submit">${__('Empezar a seguir')}</button>
        </footer>
      </div>`;

    const { modal, close } = window.Modal.show({ title: __('Seguir algo nuevo'), body, className: 'mn-modal-content' });
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
        if (!name) { alert(__('Escribe un nombre.')); return; }
        const { error } = await this._service.createEntity({
          name,
          target_identifier: val('target_identifier') || null,
          domain: val('domain') || 'social',
          brand_container_id: val('brand_container_id') || null,
          tipo: val('tipo'),
          platform: val('platform') || null,
          is_active: true,
        });
        if (error) { alert(__('Error:') + ' ' + error.message); return; }
      } else {
        const url = val('url');
        if (!url) { alert(__('Escribe la dirección de la página.')); return; }
        const { error } = await this._service.createWatcher({
          url, label: val('label') || null, is_active: true,
        });
        if (error) { alert(__('Error:') + ' ' + error.message); return; }
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
        <label>${__('Nombre')}
          <input name="name" required value="${this._esc(e.name || '')}" placeholder="${__('Ej. Red Bull')}">
        </label>
        <div class="mn-form-grid">
          <label>${__('¿Qué es?')}<select name="tipo">${tipoOpts}</select></label>
          <label>${__('Plataforma')}<select name="platform">${platOpts}</select></label>
        </div>
        <label>${__('Usuario o enlace')}
          <input name="target_identifier" value="${this._esc(e.target_identifier || '')}" placeholder="@usuario">
        </label>
        <details class="mn-advanced">
          <summary>${__('Opciones avanzadas')}</summary>
          <div class="mn-advanced-body">
            <label>${__('Marca asociada')}<select name="brand_container_id">${containerOpts}</select></label>
            <label>${__('Tipo de dato')}
              <select name="domain">
                <option value="social"    ${e.domain === 'social'    ? 'selected' : ''}>${__('Redes sociales')}</option>
                <option value="analytics" ${e.domain === 'analytics' ? 'selected' : ''}>${__('Analítica')}</option>
                <option value="web"       ${e.domain === 'web'       ? 'selected' : ''}>${__('Sitio web')}</option>
              </select>
            </label>
            <small>${__('Para fuentes técnicas usa identificadores como {meta} o {ga4} en "Usuario o enlace".', { meta: '<code>meta:1234</code>', ga4: '<code>ga4:5678</code>' })}</small>
          </div>
        </details>
        <label class="mn-checkbox">
          <input type="checkbox" name="is_active" ${e.is_active === false ? '' : 'checked'}>
          ${__('Vigilando activamente')}
        </label>
        <footer class="mn-modal-foot">
          <button type="button" class="mn-btn-secondary" data-action="close-modal">${__('Cancelar')}</button>
          <button type="submit" class="mn-btn-primary">${__('Guardar cambios')}</button>
        </footer>
      </form>`;

    const { modal, close } = window.Modal.show({ title: __('Editar'), body, className: 'mn-modal-content' });
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
      if (error) { alert(__('Error:') + ' ' + error.message); return; }
      close();
      await this._refresh();
    });
  }

  async _confirmDeleteEntity(id) {
    const e = (this._data.entities.data || []).find(x => x.id === id);
    if (!e) return;
    if (!confirm(__('¿Dejar de seguir a "{name}"?', { name: e.name }) + '\n' + __('Esta acción no se puede deshacer.'))) return;
    const { error } = await this._service.deleteEntity(id);
    if (error) { alert(__('Error:') + ' ' + error.message); return; }
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
    if (diff < 60 * 1000) return __('hace segundos');
    const min = Math.floor(diff / 60000);
    if (min < 60) return __('hace {n} min', { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return __('hace {n} h', { n: h });
    const d = Math.floor(h / 24);
    if (d < 7) return __('hace {n} d', { n: d });
    const dl = (window.i18n && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO';
    return new Date(iso).toLocaleDateString(dl, { day: '2-digit', month: 'short' });
  }

  _openWatcherModal(id) {
    const w = (this._data.watchers.data || []).find(x => x.id === id) || {};

    const body = `
      <form class="mn-form" id="mnWatcherForm">
        <label>${__('Dirección de la página')}
          <input name="url" type="url" required value="${this._esc(w.url || '')}" placeholder="https://ejemplo.com/pagina-a-vigilar">
          <small>${__('Te avisamos cuando esa página cambie.')}</small>
        </label>
        <label>${__('Nombre (opcional)')}
          <input name="label" value="${this._esc(w.label || '')}" placeholder="${__('Ej. Precios de Competidor X')}">
        </label>
        <label class="mn-checkbox">
          <input type="checkbox" name="is_active" ${w.is_active === false ? '' : 'checked'}>
          ${__('Vigilando activamente')}
        </label>
        <footer class="mn-modal-foot">
          <button type="button" class="mn-btn-secondary" data-action="close-modal">${__('Cancelar')}</button>
          <button type="submit" class="mn-btn-primary">${__('Guardar cambios')}</button>
        </footer>
      </form>`;

    const { modal, close } = window.Modal.show({ title: __('Editar página vigilada'), body, className: 'mn-modal-content' });
    modal.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => close());
    modal.querySelector('#mnWatcherForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        url:       fd.get('url')?.trim(),
        label:     fd.get('label')?.trim() || null,
        is_active: fd.get('is_active') === 'on',
      };
      if (!payload.url) { alert(__('La dirección es obligatoria.')); return; }
      const { error } = await this._service.updateWatcher(id, payload);
      if (error) { alert(__('Error:') + ' ' + error.message); return; }
      close();
      await this._refresh();
    });
  }

  async _confirmDeleteWatcher(id) {
    const w = (this._data.watchers.data || []).find(x => x.id === id);
    if (!w) return;
    if (!confirm(__('¿Dejar de vigilar "{name}"?', { name: w.label || w.url }) + '\n' + __('Esta acción no se puede deshacer.'))) return;
    const { error } = await this._service.deleteWatcher(id);
    if (error) { alert(__('Error:') + ' ' + error.message); return; }
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
