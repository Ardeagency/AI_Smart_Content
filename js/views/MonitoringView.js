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

  // Rol del perfil dentro del monitoreo.
  static get ENTITY_TIPOS() {
    return [
      { value: 'competidor_directo',   label: __('Competencia directa') },
      { value: 'competidor_indirecto', label: __('Competencia indirecta') },
      { value: 'referencia_cultural',  label: __('Referente / inspiración') },
      { value: 'aliado',               label: __('Aliado') },
      { value: 'owned_media',          label: __('Algo mío') },
    ];
  }

  // Guía de relevancia según el rol: qué "por qué" pedirle al usuario.
  static RELEVANCE_HINT = {
    competidor_directo:   'Qué lo hace tu competencia directa: mismo público, mismo producto, te disputa las mismas ventas…',
    competidor_indirecto: 'Por qué compite indirectamente: resuelve la misma necesidad de otra forma, roza tu público…',
    referencia_cultural:  'Qué te llama la atención para usarlo de referente: su comunicación, engagement, estrategia, propuestas de marketing…',
    aliado:               'Por qué es un aliado: colaboración, audiencia complementaria, co-marketing, valores compartidos…',
    owned_media:          'Qué es y qué buscas medir de este perfil propio.',
  };

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
  // Sincronizada con TasksView.PALETTE: 10 tonos en orden espectral, todos
  // distinguibles entre sí a tamaño swatch (sin pares casi-idénticos).
  static PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
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
    google_analytics: 'aisc-ico aisc-ico--growth',
    web:              'aisc-ico aisc-ico--globe',
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
        tipo: e.metadata?.tipo || null,          // rol dentro del monitoreo
        relevance: e.relevance || null,          // el porqué de estar aquí
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
    if (e.is_active === false) return { tone: 'paused', icon: 'aisc-ico aisc-ico--pause', text: __('En pausa') };
    if ((e.metadata?.consecutive_empty_runs || 0) >= 3)
      return { tone: 'stale', icon: 'aisc-ico aisc-ico--moon', text: __('Callado hace rato') };
    if (lastAt && (Date.now() - new Date(lastAt).getTime()) < 7 * 24 * 60 * 60 * 1000)
      return { tone: 'fresh', icon: 'aisc-ico aisc-ico--check', text: __('Al día · novedad {rel}', { rel: this._relativeTime(lastAt) }) };
    return { tone: 'quiet', icon: 'aisc-ico aisc-ico--check', text: __('Tranquilo · sin novedades por ahora') };
  }

  _estadoPagina(w, lastAt) {
    if (w.is_active === false) return { tone: 'paused', icon: 'aisc-ico aisc-ico--pause', text: __('En pausa') };
    if (lastAt && (Date.now() - new Date(lastAt).getTime()) < 24 * 60 * 60 * 1000)
      return { tone: 'changed', icon: 'aisc-ico aisc-ico--zap', text: __('Cambio detectado · {rel}', { rel: this._relativeTime(lastAt) }) };
    if (w.last_checked_at)
      return { tone: 'quiet', icon: 'aisc-ico aisc-ico--check', text: __('Sin cambios · revisado {rel}', { rel: this._relativeTime(w.last_checked_at) }) };
    return { tone: 'new', icon: 'aisc-ico aisc-ico--hourglass', text: __('Empezando a vigilar…') };
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
      ? { label: __('Todo en marcha'), sub: __('Vigilancia activa'), color: 'green', icon: 'aisc-ico aisc-ico--check' }
      : { label: __('En reposo'),      sub: __('Nada activo aún'),   color: 'teal',  icon: 'aisc-ico aisc-ico--pause' };

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
        ${tile('blue',   'aisc-ico aisc-ico--monitoring',   counts.siguiendo,  __('Siguiendo'),        __('Marcas y páginas activas'))}
        ${tile('orange', 'aisc-ico aisc-ico--zap',         counts.novedades,  __('Con novedades'),    __('En los últimos 7 días'))}
        ${tile('pink',   'aisc-ico aisc-ico--sparkle', counts.propuestas, __('Propuestas nuevas'), __('Por revisar'), counts.propuestas > 0)}
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
      const icon = MonitoringView.PLATFORM_ICON[platform] || 'aisc-ico aisc-ico--tag';
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
              <i class="aisc-ico aisc-ico--add"></i> ${__('Seguir')}
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
          <div class="mn-prop-head-icon"><i class="aisc-ico aisc-ico--sparkle"></i></div>
          <div>
            <h3 class="mn-prop-title">${props.length === 1 ? __('Encontramos {n} perfil que quizá quieras seguir', { n: props.length }) : __('Encontramos {n} perfiles que quizá quieras seguir', { n: props.length })}</h3>
            <p class="mn-prop-subtitle">${__('Tú decides: súmalos a tu vigilancia o descártalos.')}</p>
          </div>
        </header>
        <div class="mn-prop-list">${cards}</div>
      </section>`;
  }

  /* ── Columnas "Lo que sigo" — jerarquía lógica: de menos a más actividad
        (En pausa → Activados → Al día → Con novedad). ── */
  static get COLUMNS() {
    return [
      { id: 'paused', label: __('En pausa'),    hint: __('Desactivados'),       emptyIcon: 'aisc-ico aisc-ico--pause', emptyText: __('Nada en pausa') },
      { id: 'silent', label: __('Activados'),   hint: __('Activos, sin señal reciente'), emptyIcon: 'aisc-ico aisc-ico--moon', emptyText: __('Nada activo sin señal') },
      { id: 'calm',   label: __('Al día'),      hint: __('Activo y tranquilo'), emptyIcon: 'aisc-ico aisc-ico--check', emptyText: __('Nada por aquí todavía') },
      { id: 'news',   label: __('Con novedad'), hint: __('Cambios recientes'),  emptyIcon: 'aisc-ico aisc-ico--notification',         emptyText: __('Sin novedades por ahora') },
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
          <i class="aisc-ico aisc-ico--add"></i> ${__('Seguir algo nuevo')}
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
      this._initFloatBubbles(this._model);
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
        icon: isPage ? 'aisc-ico aisc-ico--globe' : 'aisc-ico aisc-ico--monitoring',
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

  // Rol en UNA palabra para la etiqueta de la burbuja.
  static ROLE_SHORT = {
    competidor_directo:   'Competencia',
    competidor_indirecto: 'Competencia',
    referencia_cultural:  'Referente',
    aliado:               'Socio',
    owned_media:          'Propio',
  };

  /** Etiqueta corta del rol para mostrar dentro de la burbuja. */
  _roleLabel(tipo) {
    if (!tipo) return '';
    return MonitoringView.ROLE_SHORT[tipo] || MonitoringView.ENTITY_TIPOS.find(t => t.value === tipo)?.label || '';
  }

  /** Degradado de la marca (mismos colores que el resto de la app). Lee las CSS
      vars que setea OrgBrandTheme; cae al primario, y si no, a un cálido. */
  _brandGradientStops() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const grad = (cs.getPropertyValue('--brand-gradient-dynamic') ||
                    cs.getPropertyValue('--brand-gradient') || '').trim();
      // El degradado dinámico usa rgba()/rgb() (no hex). Extraer TODOS los stops
      // de color en orden para replicar EXACTO el degradado de la plataforma.
      const cols = grad ? (grad.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g) || []) : [];
      if (cols.length >= 2) return cols;
      if (cols.length === 1) return [cols[0], this._lighten(this._toHex(cols[0]), 0.28)];
      const primary = (cs.getPropertyValue('--brand-primary') || '').trim();
      if (/^#[0-9a-fA-F]{6}/.test(primary)) return [primary.slice(0, 7), this._lighten(primary.slice(0, 7), 0.28)];
    } catch (_) {}
    return ['#e09145', '#f6b26b'];
  }

  /** Convierte rgb()/rgba() o #hex a #rrggbb (para _lighten). */
  _toHex(col) {
    if (!col) return '#888888';
    if (col[0] === '#') return col.slice(0, 7);
    const m = col.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return '#888888';
    return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
  }

  /** CSS linear-gradient con todos los stops (para avatar/chip del popover). */
  _gradientCss(stops, angle = 135) {
    const s = (stops && stops.length ? stops : ['#e09145', '#f6b26b']);
    return `linear-gradient(${angle}deg, ${s.join(', ')})`;
  }

  /** Stops de la burbuja: color personalizado si existe (→ gradiente derivado),
      si no el degradado dinámico de la marca (array de colores). */
  _bubbleStops(item) {
    if (item && item.color) return [item.color, this._lighten(item.color, 0.28)];
    return this._brandStops || ['#e09145', '#f6b26b'];
  }

  /** Color sólido de las cards (--bg-card) para el relleno de las burbujas. */
  _readCardColor() {
    try {
      const v = (getComputedStyle(document.documentElement).getPropertyValue('--bg-card') || '').trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
    } catch (_) {}
    return '#141517';
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
    this._cardColor = this._readCardColor();

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
          const iconCls = MonitoringView.PLATFORM_ICON[b.it.platform] || 'aisc-ico aisc-ico--tag';
          const icon = document.createElement('span');
          icon.className = 'mn-bub-icon' + (colId === 'paused' ? ' is-dim' : '');
          icon.innerHTML = `<i class="${iconCls}"></i>`;
          const name = document.createElement('span');
          name.className = 'mn-bub-name' + (colId === 'paused' ? ' is-dim' : '');
          name.textContent = b.it.title || '';
          labels.appendChild(icon); labels.appendChild(name);
          b.iconEl = icon; b.nameEl = name;
          // Rol como etiqueta debajo del nombre (solo perfiles con rol).
          const roleTxt = this._roleLabel(b.it.tipo);
          if (roleTxt) {
            const roleEl = document.createElement('span');
            roleEl.className = 'mn-bub-role' + (colId === 'paused' ? ' is-dim' : '');
            roleEl.textContent = roleTxt;
            labels.appendChild(roleEl);
            b.roleEl = roleEl;
          }
        });
      }
      const world = { stage, canvas, ctx: canvas.getContext('2d'), bodies, W: 0, H: 0, DPR: 1, hover: null, colId };
      this._wireBubbleCanvas(world);
      this._bubbleWorlds.push(world);
    });

    this._layoutBubbles();
    this._presettleBubbles();   // asienta la física en silencio → sin caída visible
    this._bubbleSleep = 0;
    // Arranca el loop SIN descongelar (worlds quedan frozen tras presettle) → el
    // 1er frame ya pinta asentado, sin re-correr física ni caída.
    if (!this._bubbleRAF) { this._bubbleAwakeFrames = 0; this._bubbleRAF = requestAnimationFrame(() => this._bubbleLoop()); }

    if (!this._bubbleResizeBound) {
      this._bubbleResizeBound = () => {
        this._layoutBubbles(); this._presettleBubbles();
        if (!this._bubbleRAF) { this._bubbleRAF = requestAnimationFrame(() => this._bubbleLoop()); }
      };
      window.addEventListener('resize', this._bubbleResizeBound);
    }
  }

  /** Corre la física a convergencia EN SILENCIO (sin pintar) y congela, para que
      el 1er frame del loop ya muestre las burbujas apiladas — sin animar la caída.
      NO pinta aquí (eso lo hace el loop) para no duplicar el render. */
  _presettleBubbles() {
    for (const w of (this._bubbleWorlds || [])) {
      if (w.mode === 'float') continue; // las flotantes no caen
      w.frozen = false; w._still = 0;
      for (let i = 0; i < 600; i++) {
        this._stepBubbles(w);
        if (w.frozen || (!w._overlap && (w._still || 0) > 4)) break; // ya asentó
      }
      w.frozen = true; w._still = 99;
      for (const b of w.bodies) { b.rDraw = b.r; b._px = b.x; b._py = b.y; }
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

  /** Coloca icono (arriba), nombre (medio) y rol (debajo del nombre) DENTRO de la
      burbuja. y = centro vertical (permite el bob); alpha = opacidad (profundidad). */
  _positionLabel(b, r, y, alpha) {
    const cy = (y == null) ? b.y : y;
    const hasRole = !!b.roleEl;
    if (b.iconEl && b.iconEl.style.display === 'none') { b.iconEl.style.display = ''; if (b.nameEl) b.nameEl.style.display = ''; if (b.roleEl) b.roleEl.style.display = ''; }
    if (b.iconEl) {
      b.iconEl.style.left = b.x + 'px';
      b.iconEl.style.top = (cy - r * (hasRole ? 0.40 : 0.26)) + 'px';
      b.iconEl.style.fontSize = Math.max(11, r * (hasRole ? 0.40 : 0.46)) + 'px';
      if (alpha != null) b.iconEl.style.opacity = alpha;
    }
    if (b.nameEl) {
      b.nameEl.style.left = b.x + 'px';
      b.nameEl.style.top = (cy + r * (hasRole ? 0.10 : 0.34)) + 'px';
      b.nameEl.style.fontSize = Math.max(7.5, Math.min(12, r * 0.26)) + 'px';
      b.nameEl.style.maxWidth = (r * 1.7) + 'px';
      if (alpha != null) b.nameEl.style.opacity = alpha;
    }
    if (b.roleEl) {
      b.roleEl.style.left = b.x + 'px';
      b.roleEl.style.top = (cy + r * 0.48) + 'px';
      b.roleEl.style.fontSize = Math.max(6.5, Math.min(9, r * 0.17)) + 'px';
      b.roleEl.style.maxWidth = (r * 1.8) + 'px';
      if (alpha != null) b.roleEl.style.opacity = alpha;
    }
  }

  _stepBubbles(w) {
    // Sugerencias: burbujas flotantes (sin gravedad).
    if (w.mode === 'float') return this._stepFloat(w);
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
    const isFloat = w.mode === 'float';
    const pulse = w.colId === 'news';
    const dimmed = w.colId === 'paused';
    const hoverKey = isFloat ? w.hoverFloat : w.hover;
    // La burbuja activa se dibuja al final (encima).
    const order = w.bodies.slice().sort((a, b) => (a === hoverKey ? 1 : 0) - (b === hoverKey ? 1 : 0));
    // Rango de radios para el efecto de profundidad (solo flotantes).
    let rMin = Infinity, rMax = 0;
    if (isFloat) for (const b of w.bodies) { rMin = Math.min(rMin, b.r); rMax = Math.max(rMax, b.r); }

    for (const b of order) {
      // Si se está arrastrando, no la dibujamos aquí (la muestra el "fantasma").
      if (b._dragging) {
        if (b.iconEl) b.iconEl.style.display = 'none';
        if (b.nameEl) b.nameEl.style.display = 'none';
        if (b.roleEl) b.roleEl.style.display = 'none';
        continue;
      }
      const isHover = b === hoverKey;
      const target = b.r * (isHover ? (isFloat ? 1.06 : 1.16) : 1);
      b.rDraw += (target - b.rDraw) * 0.22;
      const r = b.rDraw;
      const bx = b.x;
      // Bob orgánico, salvo la burbuja activa (para que los botones queden fijos).
      const by = b.y + ((isFloat && !isHover) ? Math.sin(this._bubbleT * 0.018 + (b._phase || 0)) * 3 : 0);

      // Degradado dinámico de la marca (todos sus stops, mismo que la plataforma).
      const stops = this._bubbleStops(b.it);
      const grad = ctx.createLinearGradient(bx - r, by - r, bx + r, by + r);
      const nS = stops.length;
      stops.forEach((col, i) => grad.addColorStop(nS === 1 ? 0 : i / (nS - 1), col));

      // Profundidad: las burbujas chicas, un poco más tenues (parallax sutil).
      const tDepth = (isFloat && rMax > rMin) ? (b.r - rMin) / (rMax - rMin) : 1;
      const depthA = isHover ? 1 : (isFloat ? (0.74 + 0.26 * tDepth) : 1);

      const card = this._cardColor || '#141517';

      // Sombra suave que ATERRIZA la burbuja + relleno SÓLIDO (color de las cards).
      ctx.save();
      ctx.globalAlpha = depthA;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = isFloat ? 24 : 13;
      ctx.shadowOffsetY = isFloat ? 10 : 5;
      ctx.fillStyle = dimmed ? '#101012' : card;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
      ctx.restore();

      // Borde con el degradado de la marca (único color de la burbuja).
      let lw = isHover ? 3 : 2.6;
      if (pulse && !isHover) lw = 2.4 + Math.sin(this._bubbleT * 0.05 + bx) * 0.8;
      ctx.save();
      ctx.globalAlpha = depthA * (isHover ? 1 : 0.92) * (dimmed ? 0.5 : 1);
      ctx.lineWidth = lw; ctx.strokeStyle = grad;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.stroke();
      ctx.restore();

      // Icono + nombre DENTRO (DOM overlay); siguen el bob y la profundidad.
      this._positionLabel(b, r, by, isFloat ? depthA : null);
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
      if (this._drag) return; // durante arrastre, el hover no aplica
      const b = hit(pos(e));
      canvas.style.cursor = b ? 'grab' : 'default';
      if (w.hover !== b) { w.hover = b; this._wakeBubbles(); }
    });
    canvas.addEventListener('mouseleave', () => { if (!this._drag && w.hover) { w.hover = null; this._wakeBubbles(); } });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const b = hit(pos(e));
      if (!b) return;
      e.preventDefault();
      this._beginBubbleInteraction(w, b, e);
    });
  }

  /** Arranca el loop para UN redibujo sin descongelar (worlds siguen frozen). */
  _requestBubbleDraw() {
    if (!this._bubbleRAF) { this._bubbleSleep = 0; this._bubbleRAF = requestAnimationFrame(() => this._bubbleLoop()); }
  }

  /** mousedown sobre una burbuja: distingue clic (abre detalle) de arrastre
      (mueve un "fantasma" entre columnas para cambiar su estado). */
  _beginBubbleInteraction(w, b, e) {
    const startX = e.clientX, startY = e.clientY;
    // Offset de agarre: mantiene la burbuja bajo el punto EXACTO donde se agarró
    // (nada de saltos al cursor).
    const rect = w.canvas.getBoundingClientRect();
    const grabDX = e.clientX - (rect.left + b.x);
    const grabDY = e.clientY - (rect.top + b.y);
    let dragging = false;
    const onMove = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        dragging = true;
        this._drag = { w, b, grabDX, grabDY };
        b._dragging = true;
        w.hover = null;
        document.body.classList.add('mn-dragging');
        this._dragGhost = this._makeDragGhost(b);
        this._requestBubbleDraw(); // oculta la burbuja en su canvas
      }
      this._moveDragGhost(ev.clientX, ev.clientY);
      this._highlightDropTarget(ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragging) { this._openBubbleDetail(b.it); return; } // fue un clic
      document.body.classList.remove('mn-dragging');
      const targetCol = this._dropTargetCol(ev.clientX, ev.clientY);
      this._clearDropTargets();
      this._resolveBubbleDrop(w, b, targetCol); // planea al destino real y aplica
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _makeDragGhost(b) {
    const g = document.createElement('div');
    g.className = 'mn-drag-ghost';
    const d = Math.round(b.rDraw * 2);
    const iconCls = MonitoringView.PLATFORM_ICON[b.it.platform] || 'aisc-ico aisc-ico--tag';
    g.style.width = g.style.height = d + 'px';
    // Borde con degradado que RESPETA el border-radius (padding-box + border-box).
    g.style.setProperty('--g', this._gradientCss(this._bubbleStops(b.it)));
    g.innerHTML = `<i class="${iconCls}"></i><span>${this._esc(b.it.title || '')}</span>`;
    document.body.appendChild(g);
    return g;
  }
  /** Mueve el fantasma con transform (solo compositor, sin reflow → sin latencia). */
  _moveDragGhost(x, y) {
    if (!this._dragGhost || !this._drag) return;
    const gx = x - this._drag.grabDX, gy = y - this._drag.grabDY;
    this._dragGhost.style.transform = `translate3d(${gx}px, ${gy}px, 0) translate(-50%, -50%)`;
  }

  _dropTargetCol(x, y) {
    const el = document.elementFromPoint(x, y);
    const col = el && el.closest && el.closest('.mn-col');
    if (!col) return null;
    return (col.className.match(/mn-col--(news|calm|silent|paused)/) || [])[1] || null;
  }
  _highlightDropTarget(x, y) {
    this._clearDropTargets();
    const el = document.elementFromPoint(x, y);
    const col = el && el.closest && el.closest('.mn-col');
    if (col) col.classList.add('mn-col--drop');
  }
  _clearDropTargets() {
    document.querySelectorAll('.mn-col--drop').forEach((c) => c.classList.remove('mn-col--drop'));
  }

  /** Predice en qué columna caerá el item tras (des)activarlo, para que el
      fantasma vuele hacia allí (continuidad visual). */
  _predictColumn(item, willBeActive) {
    if (!willBeActive) return 'paused';
    const raw = { ...(item.raw || {}), is_active: true };
    const st = item.kind === 'page'
      ? this._estadoPagina(raw, item.lastAt)
      : this._estadoPerfil(raw, item.lastAt);
    return this._columnOf({ status: st });
  }

  /** Resuelve el soltado: SIEMPRE hace planear el fantasma hasta la columna
      final real (aunque no sea donde lo soltó), luego aplica el cambio. Así el
      usuario ENTIENDE a dónde fue la burbuja en vez de verla "teletransportarse". */
  async _resolveBubbleDrop(w, b, targetCol) {
    const item = b.it;
    const ghost = this._dragGhost;
    const toPaused = targetCol === 'paused';
    const isPaused = !item.isActive;
    const change = !!targetCol && (toPaused !== isPaused);
    // Columna final: si cambia estado, la que le corresponde; si no, vuelve a la suya.
    const destCol = change ? this._predictColumn(item, !toPaused) : this._columnOf(item);

    await this._glideGhostTo(ghost, destCol);     // vuela visiblemente al destino
    if (ghost) ghost.remove();
    this._dragGhost = null;
    this._drag = null;

    if (!change) {
      b._dragging = false;                        // volvió a su lugar → redibujar
      this._requestBubbleDraw();
      return;
    }

    // CAMBIO de estado: la burbuja se queda OCULTA hasta el refresh. Si la
    // desocultáramos ahora, el loop (que no duerme si hay pulso) la redibujaría
    // un instante en su columna vieja antes de saltar a la nueva.
    const nextActive = !toPaused;
    const svc = item.kind === 'page'
      ? this._service.updateWatcher(item.id, { is_active: nextActive })
      : this._service.updateEntity(item.id, { is_active: nextActive });
    const { error } = await svc;
    if (error) { this._showNotification(__('No se pudo cambiar:') + ' ' + error.message, 'error'); b._dragging = false; this._requestBubbleDraw(); return; }
    delete this._bubblePos[item.id];              // que re-asiente en su nueva columna
    this._pulseColumn(destCol);                   // destello en la columna destino
    await this._refresh();
  }

  /** Anima el fantasma hasta el área de apilado de la columna destino. */
  _glideGhostTo(ghost, destCol) {
    return new Promise((resolve) => {
      const colEl = destCol && document.querySelector(`.mn-cols .mn-col--${destCol}`);
      if (!ghost || !colEl) { resolve(); return; }
      const r = colEl.getBoundingClientRect();
      const tx = r.left + r.width / 2;
      const ty = r.bottom - 70; // donde se apilan (abajo)
      ghost.style.transition = 'transform 0.36s cubic-bezier(.2,.75,.3,1), opacity 0.36s ease';
      void ghost.offsetWidth;   // fuerza reflow para que la transición aplique
      ghost.style.transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%) scale(0.86)`;
      ghost.style.opacity = '0.85';
      setTimeout(resolve, 360);
    });
  }

  _pulseColumn(col) {
    const el = col && document.querySelector(`.mn-cols .mn-col--${col}`);
    if (!el) return;
    el.classList.add('mn-col--flash');
    setTimeout(() => el.classList.remove('mn-col--flash'), 750);
  }

  _hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r || 0},${g || 0},${b || 0},${a})`;
  }

  _signalLabel(s) {
    const t = s.signal_type || '';
    if (t === 'url_change') return __('Cambio en la página');
    if (t === 'post') return __('Nueva publicación');
    if (/threat|crisis/i.test(t)) return __('Señal de riesgo');
    if (/mention/i.test(t)) return __('Mención');
    return t ? t.replace(/_/g, ' ') : __('Novedad');
  }
  _signalIcon(s) {
    const t = s.signal_type || '';
    if (t === 'url_change') return 'aisc-ico aisc-ico--refresh';
    if (t === 'post') return 'aisc-ico aisc-ico--image';
    if (/threat|crisis/i.test(t)) return 'aisc-ico aisc-ico--alert-warning';
    if (/mention/i.test(t)) return 'aisc-ico aisc-ico--mail';
    return 'aisc-ico aisc-ico--circle';
  }

  /** Media id de Instagram → shortcode (para linkear al post original). */
  _igShortcode(id) {
    try {
      const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let n = BigInt(String(id).split('_')[0]); let s = '';
      if (n <= 0n) return '';
      while (n > 0n) { s = abc[Number(n % 64n)] + s; n = n / 64n; }
      return s;
    } catch (_) { return ''; }
  }

  /** URL al post ORIGINAL. Usa permalink si existe; si no, lo reconstruye por
      red + post_id + handle (X/TikTok/YouTube directo; Instagram vía shortcode). */
  _postUrl(post) {
    if (post.permalink) return post.permalink;
    const net = (post.network || '').toLowerCase();
    const handle = (post.profile_handle || '').replace(/^@/, '');
    const pid = post.post_id;
    if (net === 'instagram' && pid) { const sc = this._igShortcode(pid); return sc ? `https://www.instagram.com/p/${sc}/` : (handle ? `https://www.instagram.com/${handle}/` : null); }
    if ((net === 'twitter' || net === 'x') && handle && pid) return `https://x.com/${handle}/status/${pid}`;
    if (net === 'tiktok' && handle && pid) return `https://www.tiktok.com/@${handle}/video/${pid}`;
    if (net === 'youtube' && pid) return `https://www.youtube.com/watch?v=${pid}`;
    if (net === 'facebook' && handle && pid) return `https://www.facebook.com/${handle}/posts/${pid}`;
    if (handle) {
      if (net === 'twitter' || net === 'x') return `https://x.com/${handle}`;
      if (net === 'tiktok') return `https://www.tiktok.com/@${handle}`;
      if (net === 'instagram') return `https://www.instagram.com/${handle}/`;
      if (net === 'youtube') return `https://www.youtube.com/@${handle}`;
    }
    return null;
  }

  /** Thumbnail del post desde media_assets (varias formas posibles). */
  _postThumb(post) {
    const m = post.media_assets;
    if (!m || typeof m !== 'object') return null;
    return m.display_url || m.cover_image || m.thumbnail_url || m.main_image_url ||
      (Array.isArray(m.thumbnails) && m.thumbnails[0]) || (Array.isArray(m.images) && m.images[0]) ||
      (Array.isArray(m.media_urls) && m.media_urls[0]) || null;
  }

  /** Card de un post capturado, enlazado al original (abre en nueva pestaña). */
  _renderPostCard(post) {
    const url = this._postUrl(post);
    const thumb = this._postThumb(post);
    const netIcon = MonitoringView.PLATFORM_ICON[post.network] || 'aisc-ico aisc-ico--tag';
    const snippet = this._esc((post.content || '').replace(/\s+/g, ' ').trim().slice(0, 100)) || __('(sin texto)');
    const eng = this._compact(post.engagement_total || 0);
    const when = this._relativeTime(post.captured_at);
    const media = thumb
      ? `<span class="mn-post-thumb"><img src="${this._esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('mn-post-thumb--err');this.remove();"><i class="${netIcon}"></i></span>`
      : `<span class="mn-post-thumb mn-post-thumb--err"><i class="${netIcon}"></i></span>`;
    const inner = `${media}
      <div class="mn-post-b">
        <div class="mn-post-snippet">${snippet}</div>
        <div class="mn-post-meta"><span><i class="aisc-ico aisc-ico--fire"></i>${eng}</span><span>${when}</span></div>
      </div>
      ${url ? '<i class="aisc-ico mn-post-ext aisc-ico--external-link"></i>' : ''}`;
    return url
      ? `<a class="mn-post" href="${this._esc(url)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="mn-post mn-post--nolink">${inner}</div>`;
  }

  /** Guarda un campo editado inline y refleja el cambio en la burbuja sin re-render. */
  async _saveDetailField(item, field, value) {
    let error;
    if (item.kind === 'page') {
      if (field !== 'name') return true;                 // las páginas solo editan el nombre
      ({ error } = await this._service.updateWatcher(item.id, { label: value }));
    } else {
      const patch = {}; patch[field] = value;
      ({ error } = await this._service.updateEntity(item.id, patch));
    }
    if (error) { this._showNotification(__('No se pudo guardar:') + ' ' + error.message, 'error'); return false; }
    if (field === 'name') item.title = value;
    if (field === 'tipo') item.tipo = value;
    if (field === 'relevance') item.relevance = value || null;
    const row = item.kind === 'page'
      ? (this._data?.watchers?.data || []).find((r) => r.id === item.id)
      : (this._data?.entities?.data || []).find((r) => r.id === item.id);
    if (row) {
      if (field === 'name') { if (item.kind === 'page') row.label = value; else row.name = value; }
      if (field === 'relevance') row.relevance = value || null;
      if (field === 'tipo') row.metadata = { ...(row.metadata || {}), tipo: value };
    }
    if (this._liveSig) this._liveSig['monitoring'] = this._dataSignature(this._data);
    this._updateBubbleLabels(item);
    return true;
  }

  /** Actualiza la etiqueta de una burbuja (nombre/rol) tras un edit inline. */
  _updateBubbleLabels(item) {
    for (const w of (this._bubbleWorlds || [])) {
      const b = (w.bodies || []).find((x) => x.it.id === item.id);
      if (!b) continue;
      if (b.nameEl) b.nameEl.textContent = item.title || '';
      const roleTxt = this._roleLabel(item.tipo);
      if (b.roleEl) b.roleEl.textContent = roleTxt;
      this._requestBubbleDraw();
      break;
    }
  }

  /** Recurrencia de posteo (posts/semana) estimada de los posts cargados. */
  _recurrenceFromPosts(posts) {
    if (!posts || posts.length < 2) return null;
    const t = posts.map((p) => new Date(p.captured_at).getTime()).filter((x) => x).sort((a, b) => a - b);
    if (t.length < 2) return null;
    const spanDays = (t[t.length - 1] - t[0]) / 86400000;
    if (spanDays < 0.5) return null;
    return (t.length - 1) / spanDays * 7; // por semana
  }

  /** Buckets de sentimiento (pos/neu/neg) desde la distribución cruda. */
  _sentimentBuckets(dist) {
    let pos = 0, neu = 0, neg = 0;
    for (const [k, n] of Object.entries(dist || {})) {
      const key = String(k || '').toLowerCase(); const c = Number(n) || 0;
      if (/pos|positiv/.test(key)) pos += c;
      else if (/neg|negativ/.test(key)) neg += c;
      else neu += c;
    }
    return { pos, neu, neg, total: pos + neu + neg };
  }

  /** Lectura ESTRATÉGICA del perfil (interpretación, no solo números). */
  _strategicRead(a, perWeek) {
    const avg = a.avg_engagement_per_post || 0;
    const total = a.total_posts || 0;
    const freq = perWeek || 0;
    if (avg >= 150000 && freq && freq < 5) return __('Alto impacto por post: publica poco pero cada pieza genera muchísima interacción. Estúdialo por CALIDAD, no por volumen.');
    if (avg >= 150000) return __('Máquina de engagement: publica seguido y con altísimo impacto. Referente fuerte a vigilar de cerca.');
    if (freq >= 7) return __('Estrategia de volumen: publica muy seguido para no perder presencia. Mira su consistencia, no cada post.');
    if (avg >= 20000 && total >= 40) return __('Presencia sólida y constante, con buen retorno por publicación.');
    if (total >= 40) return __('Historial amplio disponible: hay material suficiente para leer sus patrones.');
    return __('Actividad moderada; el análisis se afina a medida que capturamos más contenido.');
  }

  /** Mini-dashboard PREMIUM: lectura estratégica + héroe + KPIs + señal de voz/temas. */
  _renderEntityDashboard(a, perWeek) {
    const total = (a && a.total_posts) || 0;
    if (!a || total === 0) {
      return `<div class="mn-det-act-empty"><i class="aisc-ico aisc-ico--chart-bar"></i><span>${__('Aún sin contenido capturado para analizar. En cuanto entren posts, verás aquí sus patrones.')}</span></div>`;
    }
    const level = total >= 60 ? { t: __('Señal rica'), c: 'high' } : total >= 20 ? { t: __('Señal moderada'), c: 'mid' } : { t: __('Señal limitada'), c: 'low' };
    const hour = (a.peak_posting_hour != null) ? `${String(a.peak_posting_hour).padStart(2, '0')}:00` : '—';
    const rec = perWeek ? (perWeek >= 1 ? `${perWeek.toFixed(perWeek < 3 ? 1 : 0)}` : `${(perWeek * 4.33).toFixed(1)}`) : '—';
    const recUnit = perWeek && perWeek < 1 ? __('/mes') : __('/sem');

    const kpi = (val, label, unit) => `<div class="mn-kpi"><div class="mn-kpi-v">${val}${unit ? `<span class="mn-kpi-u">${unit}</span>` : ''}</div><div class="mn-kpi-l">${label}</div></div>`;

    // Voz: barra de sentimiento (si hay data).
    const sb = this._sentimentBuckets(a.sentiment_distribution);
    const seg = (n, cls) => sb.total ? `<span class="mn-voz-seg mn-voz-seg--${cls}" style="width:${(n / sb.total * 100).toFixed(1)}%"></span>` : '';
    const vozHtml = sb.total ? `
      <div class="mn-dash-block">
        <div class="mn-dash-h"><i class="aisc-ico aisc-ico--monitoring"></i>${__('Sentimiento de su audiencia')}</div>
        <div class="mn-voz-bar">${seg(sb.pos, 'pos')}${seg(sb.neu, 'neu')}${seg(sb.neg, 'neg')}</div>
        <div class="mn-voz-legend">
          <span><i class="mn-dot mn-dot--pos"></i>${Math.round(sb.pos / sb.total * 100)}% ${__('positivo')}</span>
          <span><i class="mn-dot mn-dot--neu"></i>${Math.round(sb.neu / sb.total * 100)}%</span>
          <span><i class="mn-dot mn-dot--neg"></i>${Math.round(sb.neg / sb.total * 100)}% ${__('negativo')}</span>
        </div>
      </div>` : '';

    // Temas: ranking con barras (si hay data).
    const topics = Object.entries(a.topic_distribution || {}).sort((x, y) => y[1] - x[1]).slice(0, 5);
    const maxT = topics[0] ? topics[0][1] : 1;
    const topicsHtml = topics.length ? `
      <div class="mn-dash-block">
        <div class="mn-dash-h"><i class="aisc-ico aisc-ico--tag"></i>${__('Sobre qué habla')}</div>
        <div class="mn-temas">
          ${topics.map(([t, c]) => `<div class="mn-tema"><span class="mn-tema-n">${this._esc(t)}</span><span class="mn-tema-bar"><i style="width:${Math.max(8, c / maxT * 100)}%"></i></span></div>`).join('')}
        </div>
      </div>` : (a.dominant_tone ? '' : `
      <div class="mn-dash-block mn-dash-block--pending">
        <div class="mn-dash-h"><i class="aisc-ico aisc-ico--tag"></i>${__('Temas y tono')}</div>
        <p class="mn-dash-pending">${__('Se activan cuando el análisis de contenido procese sus publicaciones.')}</p>
      </div>`);

    const toneHtml = a.dominant_tone ? `<div class="mn-dash-tone"><span class="mn-det-section-title">${__('Tono dominante')}</span><span class="mn-dash-tone-v">${this._esc(a.dominant_tone)}</span></div>` : '';

    return `
      <div class="mn-dash-read mn-dash-read--${level.c}">
        <div class="mn-dash-read-top"><span class="mn-dash-level mn-dash-level--${level.c}"><i class="aisc-ico aisc-ico--monitoring"></i>${level.t}</span></div>
        <p class="mn-dash-read-txt">${this._strategicRead(a, perWeek)}</p>
      </div>

      <div class="mn-dash-hero">
        <div class="mn-dash-hero-v">${this._compact(a.total_engagement || 0)}</div>
        <div class="mn-dash-hero-l"><i class="aisc-ico aisc-ico--fire"></i>${__('interacciones que ha generado su contenido')}</div>
      </div>

      <div class="mn-dash-kpis">
        ${kpi(total, __('Publicaciones'))}
        ${kpi(this._compact(a.avg_engagement_per_post || 0), __('Prom. / post'))}
        ${kpi(rec, __('Ritmo'), recUnit)}
        ${kpi(hour, __('Hora pico'))}
      </div>

      ${vozHtml}
      ${topicsHtml}
      ${toneHtml}`;
  }

  /* ── Panel de detalle (landscape estilo Flows) al seleccionar una burbuja ── */
  _openBubbleDetail(item) {
    if (!window.Modal || typeof window.Modal.show !== 'function') { return this._openBubblePop(item, 0, 0); }
    const isProfile = item.kind === 'profile';
    const stops = this._bubbleStops(item);
    const gradCss = this._gradientCss(stops);
    const borderCss = `linear-gradient(#17171a,#17171a) padding-box, ${gradCss} border-box`;
    const brand = isProfile ? ((this._model?.containers || []).find(c => c.id === item.containerId)?.nombre_marca || null) : null;
    const roleLabel = isProfile ? this._roleLabel(item.tipo) : __('Página web');
    const platIcon = MonitoringView.PLATFORM_ICON[item.platform] || 'aisc-ico aisc-ico--tag';

    const meta = [];
    if (isProfile) meta.push(`<span class="mn-det-meta-item"><i class="aisc-ico aisc-ico--fire"></i>${item.impact > 0 ? __('{n} interacciones (90 d)', { n: this._compact(item.impact) }) : __('Sin impacto medido')}</span>`);
    else meta.push(`<span class="mn-det-meta-item"><i class="aisc-ico aisc-ico--refresh"></i>${item.dataCount} ${__('cambios')}</span>`);
    if (item.platform) meta.push(`<span class="mn-det-meta-item"><i class="${platIcon}"></i>${this._esc(this._platformName(item.platform))}</span>`);
    if (item.lastAt) meta.push(`<span class="mn-det-meta-item"><i class="aisc-ico aisc-ico--clock"></i>${this._relativeTime(item.lastAt)}</span>`);
    if (brand) meta.push(`<span class="mn-det-meta-item"><i class="aisc-ico aisc-ico--tag"></i>${this._esc(brand)}</span>`);

    // ── COLUMNA IZQUIERDA: TODO el contenido capturado del perfil (posts) con
    //    link al original. Se carga async (perfiles); las páginas muestran cambios.
    const leftTitle = isProfile ? __('Contenido capturado') : __('Cambios detectados');
    const leftInner = isProfile
      ? `<div class="mn-post mn-post--skel"></div><div class="mn-post mn-post--skel"></div><div class="mn-post mn-post--skel"></div>`
      : ((item.feed || []).length
          ? (item.feed || []).slice(0, 12).map((f) => `<div class="mn-det-act"><span class="mn-det-act-icon"><i class="aisc-ico aisc-ico--refresh"></i></span><div class="mn-det-act-b"><div class="mn-det-act-t">${__('Cambio detectado')}</div><div class="mn-det-act-w">${this._relativeTime(f.captured_at)}</div></div></div>`).join('')
          : `<div class="mn-det-act-empty"><i class="aisc-ico aisc-ico--moon"></i><span>${__('Sin cambios detectados aún')}</span></div>`);

    // ── COLUMNA DERECHA (arriba): editable inline. (abajo): atajos de Vera.
    const roleOpts = MonitoringView.ENTITY_TIPOS.map((o) => `<option value="${o.value}"${o.value === item.tipo ? ' selected' : ''}>${this._esc(o.label)}</option>`).join('');
    const editable = isProfile ? `
      <div class="mn-detail-editrow">
        <label class="mn-detail-field">
          <span class="mn-det-section-title">${__('Rol')}</span>
          <select class="mn-detail-select" data-edit="tipo">${roleOpts}</select>
        </label>
      </div>
      <div class="mn-detail-section">
        <div class="mn-det-section-title">${__('Relevancia — ¿por qué lo monitoreamos?')}</div>
        <textarea class="mn-detail-input mn-detail-rel" data-edit="relevance" rows="3" placeholder="${this._esc(MonitoringView.RELEVANCE_HINT[item.tipo] || '')}">${this._esc(item.relevance || '')}</textarea>
      </div>
      <div class="mn-detail-section">
        <div class="mn-det-section-title">${__('Color de la burbuja')}</div>
        <div class="mn-bubpop-colors">
          <button class="mn-swatch mn-swatch--brand${!item.color ? ' is-on' : ''}" data-color="" title="${__('Usar color de la marca')}" style="background:${gradCss}"></button>
          ${MonitoringView.PALETTE.map(c => `<button class="mn-swatch${item.color === c ? ' is-on' : ''}" style="background:${c}" data-color="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="mn-detail-section mn-detail-vera">
        <div class="mn-det-section-title">${__('Consultar con Vera')}</div>
        <div class="mn-vera-shortcuts">
          <button type="button" data-bact="vera-analizar"><i class="aisc-ico aisc-ico--sparkle"></i><span>${__('Analizar')}</span></button>
          <button type="button" data-bact="vera-comparar"><i class="aisc-ico aisc-ico--code-compare"></i><span>${__('Comparar')}</span></button>
          <button type="button" data-bact="vera-inspirar"><i class="aisc-ico aisc-ico--idea"></i><span>${__('Pedir ideas')}</span></button>
        </div>
      </div>` : `
      <div class="mn-detail-actions">
        <a class="mn-det-cta" href="${this._esc(item.url)}" target="_blank" rel="noopener"><i class="aisc-ico aisc-ico--external-link"></i><span>${__('Abrir página')}</span></a>
      </div>`;

    const body = document.createElement('div');
    body.className = 'mn-detail';
    body.innerHTML = `
      <div class="mn-detail-bg" aria-hidden="true" style="background:${gradCss}"></div>
      <div class="mn-detail-scrim" aria-hidden="true"></div>
      <div class="mn-detail-grid${isProfile ? ' mn-detail-grid--3' : ''}">
        <aside class="mn-detail-col mn-detail-col--activity">
          <h3 class="mn-det-section-title">${leftTitle}</h3>
          <div class="mn-detail-posts" data-posts>${leftInner}</div>
        </aside>
        <div class="mn-detail-col mn-detail-col--info">
          <div class="mn-detail-headrow">
            <div class="mn-detail-avatar" style="background:${borderCss}"><i class="${platIcon}"></i></div>
            <div class="mn-detail-idcol">
              <span class="mn-detail-eyebrow" data-role-eyebrow>${this._esc(roleLabel)}</span>
              <div class="mn-detail-name-wrap">
                <input class="mn-detail-name" data-edit="name" value="${this._esc(item.title)}" aria-label="${__('Nombre')}">
                <i class="aisc-ico mn-detail-name-pen aisc-ico--edit" aria-hidden="true"></i>
              </div>
              ${item.subtitle ? `<div class="mn-detail-sub">${this._esc(item.subtitle)}</div>` : ''}
            </div>
            <label class="mn-detail-switch" title="${item.isActive ? __('Pausar') : __('Activar')}">
              <input type="checkbox" ${item.isActive ? 'checked' : ''} data-bact="toggle-active">
              <span class="mn-onoff-track"></span>
            </label>
          </div>
          <div class="mn-detail-meta">${meta.join('')}</div>
          ${editable}
          <div class="mn-detail-foot">
            ${isProfile ? `<button type="button" class="mn-btn-secondary" data-bact="toggle-highlight"><i class="aisc-ico aisc-ico--star"></i> ${item.highlighted ? __('Quitar destacado') : __('Destacar')}</button>` : ''}
            <span style="flex:1"></span>
            <button type="button" class="mn-btn-secondary mn-btn-danger" data-bact="delete"><i class="aisc-ico aisc-ico--delete"></i> ${__('Dejar de seguir')}</button>
          </div>
        </div>
        ${isProfile ? `<aside class="mn-detail-col mn-detail-col--dash">
          <h3 class="mn-det-section-title">${__('Lo que hay que saber')}</h3>
          <div class="mn-detail-dash" data-dashboard>
            <div class="mn-post mn-post--skel" style="height:44px"></div>
            <div class="mn-post mn-post--skel" style="height:44px"></div>
            <div class="mn-post mn-post--skel" style="height:44px"></div>
          </div>
        </aside>` : ''}
      </div>`;

    const { modal, close } = window.Modal.show({ title: '', body, className: isProfile ? 'mn-detail-modal mn-detail-modal--wide' : 'mn-detail-modal' });

    // Carga async: contenido capturado (izquierda) + mini-análisis (derecha).
    if (isProfile) {
      Promise.all([
        this._service.loadEntityPosts(item.id, 30),
        this._service.loadEntityAnalysis(item.id),
      ]).then(([postsRes, analysisRes]) => {
        const posts = (postsRes && postsRes.data) || [];
        const host = modal.querySelector('[data-posts]');
        if (host) host.innerHTML = posts.length
          ? posts.map((p) => this._renderPostCard(p)).join('')
          : `<div class="mn-det-act-empty"><i class="aisc-ico aisc-ico--inbox"></i><span>${__('Aún no hemos capturado contenido de este perfil.')}</span></div>`;
        const dash = modal.querySelector('[data-dashboard]');
        if (dash) dash.innerHTML = this._renderEntityDashboard((analysisRes && analysisRes.data) || null, this._recurrenceFromPosts(posts));
      }).catch(() => {});
    }

    // Edición inline: nombre, rol, relevancia.
    const nameEl = modal.querySelector('[data-edit="name"]');
    nameEl?.addEventListener('change', () => { const val = nameEl.value.trim(); if (val) this._saveDetailField(item, 'name', val); else nameEl.value = item.title || ''; });
    const roleEl = modal.querySelector('[data-edit="tipo"]');
    roleEl?.addEventListener('change', async () => {
      await this._saveDetailField(item, 'tipo', roleEl.value);
      const eb = modal.querySelector('[data-role-eyebrow]'); if (eb) eb.textContent = this._roleLabel(roleEl.value);
      const rel = modal.querySelector('[data-edit="relevance"]'); if (rel && !rel.value.trim()) rel.placeholder = MonitoringView.RELEVANCE_HINT[roleEl.value] || '';
    });
    const relEl = modal.querySelector('[data-edit="relevance"]');
    relEl?.addEventListener('change', () => this._saveDetailField(item, 'relevance', relEl.value.trim()));

    // Color + acciones (Vera, borrar, destacar, toggle activo).
    modal.querySelectorAll('.mn-swatch').forEach((sw) => sw.addEventListener('click', () => {
      this._setBubbleColor(item, sw.dataset.color);
      modal.querySelectorAll('.mn-swatch').forEach((s) => s.classList.toggle('is-on', (s.dataset.color || '') === (sw.dataset.color || '')));
    }));
    modal.querySelectorAll('[data-bact]').forEach((el) => el.addEventListener('click', (e) => this._onBubbleAction(el.dataset.bact, item, e, close)));
  }

  /* ── Popover al hacer clic en una burbuja: identidad + impacto + acciones ── */
  _openBubblePop(item, cx, cy) {
    this._closeBubblePop();
    const model = this._model;
    const containerName = (id) => (model?.containers || []).find(c => c.id === id)?.nombre_marca || null;
    const isProfile = item.kind === 'profile';
    const stops = this._bubbleStops(item);
    const brand = isProfile ? containerName(item.containerId) : null;
    // Rol dentro del monitoreo (competencia, referente, aliado…).
    const roleLabel = isProfile
      ? (MonitoringView.ENTITY_TIPOS.find(t => t.value === item.tipo)?.label || __('Perfil'))
      : __('Página web');
    const meta = `${roleLabel}${brand ? ' · ' + this._esc(brand) : ''}`;
    // Relevancia: el porqué de estar en el monitoreo (o un llamado a definirlo).
    const relLine = isProfile
      ? (item.relevance
          ? `<div class="mn-bubpop-rel">${this._esc(item.relevance)}</div>`
          : `<div class="mn-bubpop-rel mn-bubpop-rel--empty" data-bact="edit">${__('+ Añade por qué lo monitoreas')}</div>`)
      : '';
    // Línea de impacto social (lo que dimensiona la burbuja).
    const impactLine = isProfile
      ? `<div class="mn-bubpop-meta"><i class="aisc-ico aisc-ico--fire" style="opacity:.6"></i> ${item.impact > 0
            ? __('Impacto social: {n} interacciones (90 d)', { n: this._compact(item.impact) })
            : __('Sin impacto medido aún')}</div>`
      : `<div class="mn-bubpop-meta"><i class="aisc-ico aisc-ico--refresh" style="opacity:.6"></i> ${item.dataCount} ${__('cambios detectados')}</div>`;

    const veraActs = isProfile ? `
      <button class="mn-bubpop-act" data-bact="vera-analizar"><i class="aisc-ico aisc-ico--sparkle"></i> ${__('Analizar')}</button>
      <button class="mn-bubpop-act" data-bact="vera-comparar"><i class="aisc-ico aisc-ico--code-compare"></i> ${__('Comparar')}</button>
      <button class="mn-bubpop-act" data-bact="vera-inspirar"><i class="aisc-ico aisc-ico--idea"></i> ${__('Ideas')}</button>` : `
      <a class="mn-bubpop-act" href="${this._esc(item.url)}" target="_blank" rel="noopener"><i class="aisc-ico aisc-ico--external-link"></i> ${__('Abrir página')}</a>`;

    const starBtn = isProfile ? `
      <button class="mn-bubpop-star${item.highlighted ? ' is-on' : ''}" data-bact="toggle-highlight" title="${__('Destacar')}"><i class="aisc-ico aisc-ico--star"></i></button>` : '';

    // Personalización de color (opcional). Default = degradado de marca (chip "Marca").
    const colorSection = isProfile ? `
      <div class="mn-bubpop-label">${__('Color de la burbuja')}</div>
      <div class="mn-bubpop-colors">
        <button class="mn-swatch mn-swatch--brand${!item.color ? ' is-on' : ''}" data-color=""
                title="${__('Usar color de la marca')}"
                style="background:${this._gradientCss(this._brandStops)}"></button>
        ${MonitoringView.PALETTE.map(c => `
          <button class="mn-swatch${(item.color === c) ? ' is-on' : ''}" style="background:${c}"
                  data-color="${c}" title="${c}"></button>`).join('')}
      </div>` : '';

    const pop = document.createElement('div');
    pop.className = 'mn-bubpop';
    pop.innerHTML = `
      <div class="mn-bubpop-head">
        <div class="mn-bubpop-avatar" style="border-image:${this._gradientCss(stops)} 1; box-shadow:0 0 0 3px rgba(255,255,255,0.08)">
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
      ${relLine}
      ${colorSection}
      <div class="mn-bubpop-acts">${veraActs}</div>
      <div class="mn-bubpop-foot">
        <label class="mn-onoff mn-onoff--sm" title="${item.isActive ? __('Pausar') : __('Activar')}">
          <input type="checkbox" ${item.isActive ? 'checked' : ''} data-bact="toggle-active">
          <span class="mn-onoff-track"></span>
        </label>
        <span class="mn-bubpop-foot-spacer"></span>
        <button class="mn-btn-icon" data-bact="edit" title="${__('Editar')}"><i class="aisc-ico aisc-ico--edit"></i></button>
        <button class="mn-btn-icon mn-btn-icon--danger" data-bact="delete" title="${__('Dejar de seguir')}"><i class="aisc-ico aisc-ico--delete"></i></button>
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

  async _onBubbleAction(action, item, e, closeFn) {
    const close = closeFn || (() => this._closeBubblePop());
    if (action === 'toggle-active') {
      const checked = e.target.checked;
      const svc = item.kind === 'page'
        ? this._service.updateWatcher(item.id, { is_active: checked })
        : this._service.updateEntity(item.id, { is_active: checked });
      const { error } = await svc;
      if (error) { this._showNotification(__('No se pudo cambiar:') + ' ' + error.message, 'error'); e.target.checked = !checked; return; }
      close(); await this._refresh();
      return;
    }
    close();
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
    if (error) { item.color = prev; this._wakeBubbles(); this._showNotification(__('No se pudo guardar el color:') + ' ' + error.message, 'error'); return; }
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

  /* ── Tab de sugerencias: burbujas que FLOTAN por la página; al hacer hover
        la burbuja se detiene y muestra "Seguir" / "Descartar". ── */
  _buildSuggestionsTab(model) {
    const props = model.propuestas;
    if (!props.length) {
      return this.emptyState({
        fill: true,
        icon: 'aisc-ico aisc-ico--sparkle',
        title: __('No hay sugerencias nuevas por ahora.'),
        subtitle: __('Cuando detectemos perfiles o páginas cerca de tu competencia, aparecerán aquí.'),
      });
    }
    return `
      <div class="mn-suggestions-float">
        <p class="mn-sug-intro">${__('Flotan las sugerencias que encontramos. Pasa el mouse sobre una para decidir.')}</p>
        <div class="mn-float" data-float="1">
          <canvas></canvas>
          <div class="mn-bub-labels"></div>
        </div>
      </div>`;
  }

  /** Mundo de burbujas FLOTANTES (sin gravedad) para las sugerencias. */
  _initFloatBubbles(model) {
    const cont = document.getElementById('mnContent');
    const stage = cont && cont.querySelector('.mn-float');
    const props = (model && model.propuestas) || [];
    if (!stage || !props.length) return;
    const canvas = stage.querySelector('canvas');
    const labels = stage.querySelector('.mn-bub-labels');
    if (!canvas) return;

    this._brandStops = this._brandGradientStops(); // degradado de marca para el dibujo
    this._cardColor = this._readCardColor();
    const tipoLabel = (t) => MonitoringView.ENTITY_TIPOS.find(x => x.value === t)?.label || __('Perfil');
    const SPEED = 0.22; // deriva calmada (premium)
    const bodies = props.map((e) => {
      const platform = e.metadata?.platform || '';
      const r = 58 + (this._hash(e.id) % 34); // 58–91: más grandes, con profundidad
      const ang = (this._hash(e.id) % 360) * Math.PI / 180;
      const why = `${tipoLabel(e.metadata?.tipo)}${platform ? __(' en {p}', { p: this._platformName(platform) }) : ''}. ${__('Lo encontramos cerca de tu competencia.')}`;
      return {
        it: { id: e.id, title: e.name || '—', platform, why, color: null, tipo: e.metadata?.tipo || null },
        r, rDraw: r, x: 0, y: 0, vx: Math.cos(ang) * SPEED, vy: Math.sin(ang) * SPEED, idx: 0, seeded: false,
        _phase: (this._hash(e.id) % 628) / 100, // fase del bob orgánico
      };
    });

    // Etiquetas (icono + nombre + rol dentro), igual que las otras burbujas.
    if (labels) {
      labels.innerHTML = '';
      bodies.forEach((b) => {
        const iconCls = MonitoringView.PLATFORM_ICON[b.it.platform] || 'aisc-ico aisc-ico--tag';
        const icon = document.createElement('span');
        icon.className = 'mn-bub-icon';
        icon.innerHTML = `<i class="${iconCls}"></i>`;
        const name = document.createElement('span');
        name.className = 'mn-bub-name';
        name.textContent = b.it.title;
        labels.appendChild(icon); labels.appendChild(name);
        b.iconEl = icon; b.nameEl = name;
        const roleTxt = this._roleLabel(b.it.tipo);
        if (roleTxt) {
          const roleEl = document.createElement('span');
          roleEl.className = 'mn-bub-role';
          roleEl.textContent = roleTxt;
          labels.appendChild(roleEl);
          b.roleEl = roleEl;
        }
      });
    }

    const world = { stage, canvas, ctx: canvas.getContext('2d'), bodies, W: 0, H: 0, DPR: 1, mode: 'float', hoverFloat: null, colId: null };
    this._wireFloatCanvas(world);
    this._bubbleWorlds = [world];

    // Sembrar posiciones dispersas por todo el lienzo.
    this._layoutFloat(world);
    this._wakeBubbles();
    if (!this._bubbleResizeBound) {
      this._bubbleResizeBound = () => { this._layoutFloat(world); this._wakeBubbles(); };
      window.addEventListener('resize', this._bubbleResizeBound);
    }
  }

  _layoutFloat(w) {
    const rect = w.canvas.getBoundingClientRect();
    w.DPR = Math.min(window.devicePixelRatio || 1, 2);
    w.W = Math.max(1, rect.width); w.H = Math.max(1, rect.height);
    w.canvas.width = w.W * w.DPR; w.canvas.height = w.H * w.DPR;
    w.ctx.setTransform(w.DPR, 0, 0, w.DPR, 0, 0);
    // Rejilla que llena TODO el lienzo (ancho y alto) con jitter determinista,
    // para que no se amontonen en una esquina.
    const n = w.bodies.length;
    const cols = Math.max(1, Math.round(Math.sqrt(n * w.W / Math.max(1, w.H))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = w.W / cols, cellH = w.H / rows;
    w.bodies.forEach((b, i) => {
      if (!b.seeded) {
        const col = i % cols, row = Math.floor(i / cols);
        const jx = (this._hash(b.it.id) % 100 / 100 - 0.5) * cellW * 0.5;
        const jy = (this._hash(b.it.id + 'y') % 100 / 100 - 0.5) * cellH * 0.5;
        b.x = Math.min(w.W - b.r, Math.max(b.r, (col + 0.5) * cellW + jx));
        b.y = Math.min(w.H - b.r, Math.max(b.r, (row + 0.5) * cellH + jy));
        b.seeded = true;
      } else {
        b.x = Math.max(b.r, Math.min(w.W - b.r, b.x));
        b.y = Math.max(b.r, Math.min(w.H - b.r, b.y));
      }
      this._positionLabel(b, b.r);
    });
  }

  _stepFloat(w) {
    const SPEED = 0.22;
    const H = w.hoverFloat;
    const BTN_PAD = 48; // banda inferior reservada para los botones bajo la burbuja
    for (const b of w.bodies) {
      if (b === H) continue;
      b.x += b.vx; b.y += b.vy;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      else if (b.x > w.W - b.r) { b.x = w.W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      else if (b.y > w.H - b.r - BTN_PAD) { b.y = w.H - b.r - BTN_PAD; b.vy = -Math.abs(b.vy); }
    }
    // Colisión sin solape + rebote entre burbujas (la hovered no se mueve).
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < w.bodies.length; i++) {
        for (let j = i + 1; j < w.bodies.length; j++) {
          const a = w.bodies[i], b = w.bodies[j];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < 0.01) { dx = (j - i) || 1; dy = 0.3; d = Math.hypot(dx, dy); }
          const min = a.r + b.r + 1;
          if (d < min) {
            const nx = dx / d, ny = dy / d, ov = (min - d);
            if (a === H) { b.x += nx * ov; b.y += ny * ov; }
            else if (b === H) { a.x -= nx * ov; a.y -= ny * ov; }
            else { a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2; }
            // intercambio de la componente normal de la velocidad (rebote elástico)
            const p = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (p < 0) { a.vx += p * nx; a.vy += p * ny; b.vx -= p * nx; b.vy -= p * ny; }
          }
        }
      }
    }
    // Mantener rapidez ~constante para que la deriva no se apague.
    for (const b of w.bodies) {
      if (b === H) continue;
      const s = Math.hypot(b.vx, b.vy) || 1;
      b.vx = b.vx / s * SPEED; b.vy = b.vy / s * SPEED;
    }
    let ke = 0; for (const b of w.bodies) ke += b.vx * b.vx + b.vy * b.vy;
    return ke;
  }

  _wireFloatCanvas(w) {
    const canvas = w.canvas;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hit = (p) => { for (const b of w.bodies) if (Math.hypot(b.x - p.x, b.y - p.y) < b.r) return b; return null; };
    canvas.addEventListener('mousemove', (e) => {
      const b = hit(pos(e));
      canvas.style.cursor = b ? 'pointer' : 'default';
      if (b) { this._cancelHideFloat(w); if (w.hoverFloat !== b) this._showFloatActions(w, b); }
      else if (w.hoverFloat) this._scheduleHideFloat(w); // zona vacía → soltar (con margen)
    });
    canvas.addEventListener('mouseleave', () => { if (w.hoverFloat) this._scheduleHideFloat(w); });
  }

  /** Muestra los dos botones (Seguir / Descartar) DEBAJO de la burbuja y la
      congela mientras se decide. Sin panel. */
  _showFloatActions(w, b) {
    this._cancelHideFloat(w);
    w.hoverFloat = b;
    let overlay = w.overlay;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mn-float-actions';
      w.stage.appendChild(overlay);
      // Puente de hover: mantener vivo mientras el cursor esté sobre los botones.
      overlay.addEventListener('mouseenter', () => this._cancelHideFloat(w));
      overlay.addEventListener('mouseleave', () => this._scheduleHideFloat(w));
      overlay.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-fact]');
        if (!btn) return;
        ev.stopPropagation();
        const id = w._hoverId;
        this._hideFloatActions(w);
        if (btn.dataset.fact === 'follow') await this._propFollow(id);
        else await this._propDismiss(id);
      });
      w.overlay = overlay;
    }
    w._hoverId = b.it.id;
    overlay.innerHTML = `
      <button type="button" class="mn-btn-primary" data-fact="follow"><i class="aisc-ico aisc-ico--add"></i> ${__('Seguir')}</button>
      <button type="button" class="mn-btn-secondary" data-fact="dismiss">${__('Descartar')}</button>`;
    overlay.style.left = Math.max(96, Math.min(w.W - 96, b.x)) + 'px';
    overlay.style.top = (b.y + b.r + 12) + 'px';
    overlay.classList.add('show');
    this._wakeBubbles();
  }

  _hideFloatActions(w) {
    this._cancelHideFloat(w);
    w.hoverFloat = null; w._hoverId = null;
    if (w.overlay) w.overlay.classList.remove('show');
    this._wakeBubbles();
  }

  _scheduleHideFloat(w) { this._cancelHideFloat(w); w._hideT = setTimeout(() => this._hideFloatActions(w), 130); }
  _cancelHideFloat(w) { if (w._hideT) { clearTimeout(w._hideT); w._hideT = null; } }

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
      if (error) { this._showNotification(__('No se pudo cambiar:') + ' ' + error.message, 'error'); ent.checked = !ent.checked; }
      else await this._refresh();
      return;
    }
    const w = e.target.closest('[data-action="toggle-watcher"]');
    if (w) {
      const { error } = await this._service.updateWatcher(w.dataset.id, { is_active: w.checked });
      if (error) { this._showNotification(__('No se pudo cambiar:') + ' ' + error.message, 'error'); w.checked = !w.checked; }
      else await this._refresh();
    }
  }

  async _propFollow(id) {
    const { error } = await this._service.updateEntity(id, { is_active: true });
    if (error) { this._showNotification(__('No se pudo seguir:') + ' ' + error.message, 'error'); return; }
    await this._refresh();
  }

  async _propDismiss(id) {
    const { error } = await this._service.updateEntity(id, { metadata: { dismissed: true } });
    if (error) { this._showNotification(__('No se pudo descartar:') + ' ' + error.message, 'error'); return; }
    await this._refresh();
  }

  async _toggleHighlight(id) {
    const entity = (this._data.entities.data || []).find(x => x.id === id);
    if (!entity) return;
    const next = !(entity.metadata?.highlighted === true);
    const { error } = await this._service.updateEntity(id, { metadata: { highlighted: next } });
    if (error) { this._showNotification(__('Error:') + ' ' + error.message, 'error'); return; }
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

  /** Contexto de relevancia que anteponemos a los prompts de Vera. */
  _relevanceContext(e) {
    return e.relevance ? `Contexto de por qué lo monitoreamos: ${e.relevance}\n\n` : '';
  }

  _promptAnalizar(e) {
    const platform = e.metadata?.platform || 'su plataforma';
    const handle = e.target_identifier ? ' (' + e.target_identifier + ')' : '';
    const tipo = (e.metadata?.tipo || 'perfil monitoreado').replace(/_/g, ' ');
    return `${this._relevanceContext(e)}Analiza el perfil "${e.name}"${handle} en ${platform}. Es un ${tipo} que estamos monitoreando. Quiero un análisis estructurado: posicionamiento, audiencia objetivo, patrones de contenido recientes, tono de voz y oportunidades concretas que ves desde mi marca${e.relevance ? ', tomando en cuenta el contexto de arriba' : ''}.`;
  }

  _promptComparar(e) {
    const orgName = window.currentOrgName || 'mi marca';
    const platform = e.metadata?.platform ? ' en ' + e.metadata.platform : '';
    return `${this._relevanceContext(e)}Compara "${e.name}"${platform} con ${orgName}. Devuélveme cuatro bloques: 1) qué hace mejor que yo, 2) qué hago mejor yo, 3) en qué somos similares, 4) oportunidades concretas para diferenciarme en los próximos 90 días.`;
  }

  _promptInspirarme(e) {
    const orgName = window.currentOrgName || 'mi marca';
    return `${this._relevanceContext(e)}Mostrame 5 ideas de contenido accionables que puedo aprender del perfil "${e.name}", adaptadas a la voz y audiencia de ${orgName}. Para cada idea: formato sugerido, gancho de copy (1 línea) y la métrica esperada que debería mover.`;
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
  /**
   * Analiza una URL y deduce qué es: un perfil social (plataforma + handle +
   * nombre legible) o una página web genérica (→ url_watcher).
   * Devuelve null si el texto no es una URL válida.
   */
  _detectFromUrl(raw) {
    let url = String(raw || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let u;
    try {
      u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return null;
    } catch (_) { return null; }

    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.includes('.')) return null;
    const segs = u.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (_) { return s; } });
    const clean = (s) => (s || '').replace(/^@/, '').trim() || null;
    // "@red.bull_co" → "Red Bull Co"
    const prettify = (h) => {
      const base = (h || '').replace(/^@/, '').replace(/[._\-+]+/g, ' ').replace(/\s+/g, ' ').trim();
      return base ? base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : null;
    };

    let platform = null, handle = null;
    if (host === 'instagram.com' || host === 'instagr.am') {
      platform = 'instagram';
      if (segs[0] && !['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts'].includes(segs[0])) handle = clean(segs[0]);
    } else if (host === 'facebook.com' || host === 'fb.com' || host === 'm.facebook.com') {
      platform = 'facebook';
      if (segs[0] === 'profile.php')    handle = clean(u.searchParams.get('id'));
      else if (segs[0] === 'pages')     handle = clean(segs[1]);
      else if (segs[0] && !['watch', 'groups', 'events', 'marketplace', 'share', 'reel'].includes(segs[0])) handle = clean(segs[0]);
    } else if (host === 'tiktok.com' || host === 'vm.tiktok.com') {
      platform = 'tiktok';
      if ((segs[0] || '').startsWith('@')) handle = clean(segs[0]);
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      platform = 'youtube';
      if ((segs[0] || '').startsWith('@'))                     handle = clean(segs[0]);
      else if (['channel', 'c', 'user'].includes(segs[0]))     handle = clean(segs[1]);
    } else if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
      platform = 'twitter';
      if (segs[0] && !['i', 'home', 'search', 'hashtag', 'intent', 'explore'].includes(segs[0])) handle = clean(segs[0]);
    } else if (host === 'linkedin.com') {
      platform = 'linkedin';
      if (['company', 'in', 'school', 'showcase'].includes(segs[0])) handle = clean(segs[1]);
    }

    if (platform) {
      const name = prettify(handle) || prettify(host.split('.')[0]) || host;
      return { kind: 'profile', platform, handle, name, hostname: host, url };
    }
    return { kind: 'page', platform: 'web', handle: null, name: prettify(host.split('.')[0]) || host, hostname: host, url };
  }

  /**
   * Pide a la function de OpenAI que clasifique el perfil contra el contexto
   * de la org (rol + relevancia). Best-effort: null ante cualquier fallo y el
   * usuario clasifica a mano.
   */
  async _classifyProfile(det) {
    try {
      const { data: sessionData } = await this._supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return null;
      const resp = await fetch('/.netlify/functions/api-monitoring-classify-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          organization_id: this._orgId,
          url: det.url,
          platform: det.platform,
          handle: det.handle,
          name: det.name,
        }),
      });
      const result = await resp.json().catch(() => null);
      if (!resp.ok || !result?.ok) return null;
      return result;
    } catch (_) { return null; }
  }

  _showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 2rem;
      padding: 0.75rem 1.1rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 10000;
      font-size: 0.85rem;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2800);
  }

  /**
   * Crear: el usuario pega una URL, detectamos plataforma + nombre con un
   * checklist de carga, y luego confirma rol + relevancia (wizard 3 pasos).
   */
  _openCreateModal() {
    const containers = this._data.containers.data || [];
    const tipoOpts = MonitoringView.ENTITY_TIPOS
      .map(o => `<option value="${o.value}"${o.value === 'competidor_directo' ? ' selected' : ''}>${o.label}</option>`).join('');
    const containerOpts = [
      `<option value="">${__('— Sin mercado —')}</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}">${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    const body = `
      <div class="mn-follow-wizard" data-step="url">
        <!-- Paso 1: URL -->
        <section class="mn-follow-step" data-panel="url">
          <p class="mn-follow-intro">${__('Pega el enlace del perfil o la página que quieres vigilar. Detectamos la plataforma y el nombre automáticamente.')}</p>
          <label class="mn-follow-field">
            <span class="mn-follow-field-label">${__('Enlace')}</span>
            <input type="url" class="mn-follow-url" placeholder="https://instagram.com/marca" autocomplete="off" spellcheck="false">
          </label>
          <button type="button" class="mn-follow-submit" data-action="analyze">
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
            <span>${__('Detectar automáticamente')}</span>
          </button>
        </section>

        <!-- Paso 2: checklist de detección -->
        <section class="mn-follow-step" data-panel="loading" hidden>
          <ul class="mn-follow-checklist" data-checklist></ul>
        </section>

        <!-- Paso 3a: perfil detectado → rol + relevancia -->
        <section class="mn-follow-step mn-form mn-follow-form" data-panel="confirm" hidden>
          <div class="mn-follow-detected">
            <span class="mn-follow-detected-icon" data-detected-icon><i class="aisc-ico aisc-ico--globe"></i></span>
            <div class="mn-follow-detected-info">
              <input class="mn-follow-name" name="name" value="" aria-label="${__('Nombre')}">
              <span class="mn-follow-detected-meta">
                <span data-detected-platform></span><span data-detected-handle></span>
              </span>
            </div>
            <span class="mn-follow-detected-badge"><i class="aisc-ico aisc-ico--check" aria-hidden="true"></i> ${__('Detectado')}</span>
          </div>
          <p class="mn-follow-ai-note" data-ai-note hidden>
            <i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>
            ${__('Rol y relevancia sugeridos por Vera según tu marca — edítalos si no encajan.')}
          </p>
          <label>${__('Rol — ¿qué es para tu marca?')}
            <select name="tipo">${tipoOpts}</select>
          </label>
          <label>${__('Relevancia — ¿por qué lo monitoreas?')}
            <textarea name="relevance" rows="3" data-relevance placeholder="${this._esc(MonitoringView.RELEVANCE_HINT.competidor_directo)}"></textarea>
            <small>${__('El contexto clave del perfil. Alimenta el análisis de Vera y el tuyo.')}</small>
          </label>
          <details class="mn-advanced">
            <summary>${__('Opciones avanzadas')}</summary>
            <div class="mn-advanced-body">
              <label>${__('Mercado asociado')}<select name="brand_container_id">${containerOpts}</select></label>
              <label>${__('Usuario o enlace')}<input name="target_identifier" value="" placeholder="@usuario"></label>
            </div>
          </details>
          <footer class="mn-modal-foot">
            <button type="button" class="mn-btn-secondary" data-action="close-modal">${__('Cancelar')}</button>
            <button type="button" class="mn-btn-primary" data-action="create-entity">${__('Empezar a seguir')}</button>
          </footer>
        </section>

        <!-- Paso 3b: página web genérica → watcher -->
        <section class="mn-follow-step mn-form mn-follow-form" data-panel="page" hidden>
          <div class="mn-follow-detected">
            <span class="mn-follow-detected-icon" data-detected-icon-page><i class="aisc-ico aisc-ico--globe"></i></span>
            <div class="mn-follow-detected-info">
              <input class="mn-follow-name" name="label" value="" aria-label="${__('Nombre (opcional)')}">
              <span class="mn-follow-detected-meta"><span data-detected-page-url></span></span>
            </div>
            <span class="mn-follow-detected-badge"><i class="aisc-ico aisc-ico--check" aria-hidden="true"></i> ${__('Detectado')}</span>
          </div>
          <small class="mn-follow-page-hint">${__('Te avisamos cuando esa página cambie.')}</small>
          <footer class="mn-modal-foot">
            <button type="button" class="mn-btn-secondary" data-action="close-modal">${__('Cancelar')}</button>
            <button type="button" class="mn-btn-primary" data-action="create-watcher">${__('Empezar a vigilar')}</button>
          </footer>
        </section>
      </div>`;

    const handle = window.Modal.show({ title: __('Seguir algo nuevo'), body, className: 'mn-follow-modal' });
    if (!handle) return;
    const { modal, close } = handle;
    const root = modal.querySelector('.mn-follow-wizard');
    let detected = null;

    // Botón "Volver" inyectado en el header, junto al título (patrón del modal de productos).
    const header = modal.querySelector('.modal-header');
    const titleEl = header?.querySelector('h3');
    let backBtn = null;
    if (header && titleEl) {
      const headerLeft = document.createElement('div');
      headerLeft.className = 'mn-follow-header-left';
      backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'mn-follow-back';
      backBtn.hidden = true;
      backBtn.setAttribute('aria-label', __('Volver'));
      backBtn.innerHTML = `<i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i><span>${this._esc(__('Volver'))}</span>`;
      backBtn.addEventListener('click', () => {
        const cur = root?.getAttribute('data-step');
        goToStep(stepConfig[cur]?.backTo || 'url');
      });
      header.insertBefore(headerLeft, header.firstChild);
      headerLeft.appendChild(backBtn);
      headerLeft.appendChild(titleEl);
    }

    const stepConfig = {
      url:     { title: __('Seguir algo nuevo'),   back: false, backTo: null  },
      loading: { title: __('Analizando el enlace'), back: false, backTo: null  },
      confirm: { title: __('Confirma el perfil'),  back: true,  backTo: 'url' },
      page:    { title: __('Vigilar página web'),  back: true,  backTo: 'url' },
    };

    const goToStep = (step) => {
      if (!root) return;
      root.setAttribute('data-step', step);
      root.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.getAttribute('data-panel') !== step; });
      const cfg = stepConfig[step];
      if (cfg && titleEl) titleEl.textContent = cfg.title;
      if (backBtn) backBtn.hidden = !(cfg && cfg.back);
      const focusable = root.querySelector(`[data-panel="${step}"] input, [data-panel="${step}"] select`);
      try { focusable?.focus(); } catch (_) {}
    };

    // Checklist de carga: los 3 primeros pasos son detección local (la
    // secuencia es percepción); el 4º espera la clasificación real de la IA.
    const playChecklist = async (det, classifyPromise = null) => {
      const list = root.querySelector('[data-checklist]');
      if (!list) return null;
      const platLabel = MonitoringView.PLATFORMS.find(p => p.value === det.platform)?.label || det.platform;
      const steps = [
        { label: __('Leyendo la URL'),               result: det.hostname },
        { label: __('Identificando la plataforma'),  result: platLabel },
        det.kind === 'profile'
          ? { label: __('Detectando el nombre del perfil'),      result: det.name }
          : { label: __('Preparando la vigilancia de la página'), result: det.name },
      ];
      if (classifyPromise) steps.push({ label: __('Analizando relevancia para tu marca'), promise: classifyPromise });
      list.innerHTML = steps.map((s, i) => `
        <li class="mn-follow-check" data-check-idx="${i}">
          <span class="mn-follow-check-dot"><span class="mn-follow-check-spinner"></span><i class="aisc-ico aisc-ico--check" aria-hidden="true"></i></span>
          <span class="mn-follow-check-label">${this._esc(s.label)}</span>
          <span class="mn-follow-check-result"></span>
        </li>`).join('');
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let classification = null;
      for (let i = 0; i < steps.length; i++) {
        const li = list.querySelector(`[data-check-idx="${i}"]`);
        li?.classList.add('is-active');
        if (steps[i].promise) {
          // Paso real: espera la IA (cap 20s para no colgar el wizard).
          classification = await Promise.race([
            steps[i].promise,
            wait(20000).then(() => null),
          ]);
          steps[i].result = classification
            ? (MonitoringView.ENTITY_TIPOS.find(t => t.value === classification.tipo)?.label || '')
            : __('Clasifícalo tú');
        } else {
          await wait(480 + Math.random() * 280);
        }
        li?.classList.remove('is-active');
        li?.classList.add('is-done');
        const res = li?.querySelector('.mn-follow-check-result');
        if (res && steps[i].result) res.textContent = steps[i].result;
      }
      await wait(360);
      return classification;
    };

    const urlInput = root.querySelector('.mn-follow-url');
    const analyze = async () => {
      const det = this._detectFromUrl(urlInput?.value);
      if (!det) {
        urlInput?.focus();
        this._showNotification?.(__('La URL no es válida'), 'error');
        urlInput?.classList.add('is-invalid');
        setTimeout(() => urlInput?.classList.remove('is-invalid'), 1200);
        return;
      }
      detected = det;
      goToStep('loading');
      // La clasificación IA (rol + relevancia) corre en paralelo al checklist;
      // el 4º ítem del checklist la espera.
      const classifyPromise = det.kind === 'profile' ? this._classifyProfile(det) : null;
      const classification = await playChecklist(det, classifyPromise);

      if (det.kind === 'profile') {
        const iconEl = root.querySelector('[data-detected-icon]');
        if (iconEl) iconEl.innerHTML = `<i class="${MonitoringView.PLATFORM_ICON[det.platform] || 'aisc-ico aisc-ico--globe'}" aria-hidden="true"></i>`;
        const platEl = root.querySelector('[data-detected-platform]');
        if (platEl) platEl.textContent = MonitoringView.PLATFORMS.find(p => p.value === det.platform)?.label || det.platform;
        const handleEl = root.querySelector('[data-detected-handle]');
        if (handleEl) handleEl.textContent = det.handle ? `@${det.handle}` : det.hostname;
        const nameEl = root.querySelector('[data-panel="confirm"] [name="name"]');
        if (nameEl) nameEl.value = det.name;
        const tidEl = root.querySelector('[name="target_identifier"]');
        if (tidEl) tidEl.value = det.handle ? `@${det.handle}` : det.url;
        if (classification) {
          const tipoEl = root.querySelector('[name="tipo"]');
          if (tipoEl && MonitoringView.ENTITY_TIPOS.some(t => t.value === classification.tipo)) {
            tipoEl.value = classification.tipo;
            tipoEl.dispatchEvent(new Event('change'));
          }
          const relEl = root.querySelector('[data-relevance]');
          if (relEl && classification.relevance) relEl.value = classification.relevance;
          const noteEl = root.querySelector('[data-ai-note]');
          if (noteEl) noteEl.hidden = false;
        }
        goToStep('confirm');
      } else {
        const urlEl = root.querySelector('[data-detected-page-url]');
        if (urlEl) urlEl.textContent = det.url.replace(/^https?:\/\//, '');
        const labelEl = root.querySelector('[data-panel="page"] [name="label"]');
        if (labelEl) labelEl.value = det.name;
        goToStep('page');
      }
    };
    root.querySelector('[data-action="analyze"]')?.addEventListener('click', analyze);
    urlInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); analyze(); } });

    root.querySelectorAll('[data-action="close-modal"]').forEach(b => b.addEventListener('click', () => close()));

    // El placeholder de relevancia se adapta al rol elegido.
    const tipoSel = root.querySelector('[name="tipo"]');
    const relArea = root.querySelector('[data-relevance]');
    tipoSel?.addEventListener('change', () => {
      if (relArea) relArea.placeholder = MonitoringView.RELEVANCE_HINT[tipoSel.value] || '';
    });

    root.querySelector('[data-action="create-entity"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const val = (n) => root.querySelector(`[data-panel="confirm"] [name="${n}"], [name="${n}"]`)?.value?.trim() || '';
      const name = val('name');
      if (!name) { this._showNotification?.(__('Escribe un nombre.'), 'error'); return; }
      btn.disabled = true;
      const { error } = await this._service.createEntity({
        name,
        target_identifier: val('target_identifier') || null,
        domain: 'social',
        brand_container_id: val('brand_container_id') || null,
        tipo: val('tipo'),
        platform: detected?.platform || null,
        relevance: val('relevance') || null,
        is_active: true,
        metadata: detected?.url ? { source_url: detected.url } : {},
      });
      if (error) { btn.disabled = false; this._showNotification?.(__('Error:') + ' ' + error.message, 'error'); return; }
      close();
      await this._refresh();
    });

    root.querySelector('[data-action="create-watcher"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!detected?.url) { goToStep('url'); return; }
      btn.disabled = true;
      const label = root.querySelector('[data-panel="page"] [name="label"]')?.value?.trim() || null;
      const { error } = await this._service.createWatcher({ url: detected.url, label, is_active: true });
      if (error) { btn.disabled = false; this._showNotification?.(__('Error:') + ' ' + error.message, 'error'); return; }
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
      `<option value="">${__('— Sin mercado —')}</option>`,
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
        <label>${__('Relevancia — ¿por qué lo monitoreas?')}
          <textarea name="relevance" rows="3" data-relevance placeholder="${this._esc(MonitoringView.RELEVANCE_HINT[tipo] || '')}">${this._esc(e.relevance || '')}</textarea>
          <small>${__('El contexto clave del perfil. Alimenta el análisis de Vera y el tuyo.')}</small>
        </label>
        <details class="mn-advanced">
          <summary>${__('Opciones avanzadas')}</summary>
          <div class="mn-advanced-body">
            <label>${__('Mercado asociado')}<select name="brand_container_id">${containerOpts}</select></label>
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
    const tipoSel = modal.querySelector('[name="tipo"]');
    const relArea = modal.querySelector('[data-relevance]');
    tipoSel?.addEventListener('change', () => {
      if (relArea && !relArea.value.trim()) relArea.placeholder = MonitoringView.RELEVANCE_HINT[tipoSel.value] || '';
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
        relevance:         fd.get('relevance')?.trim() || null,
        is_active:         fd.get('is_active') === 'on',
      };
      const { error } = await this._service.updateEntity(id, payload);
      if (error) { this._showNotification(__('Error:') + ' ' + error.message, 'error'); return; }
      close();
      await this._refresh();
    });
  }

  /** Confirmación destructiva con el modal propio (nada de confirm() nativo). */
  _confirmDialog({ title, message, confirmLabel }) {
    return new Promise((resolve) => {
      const body = `
        <div class="mn-follow-confirm">
          <p class="mn-follow-confirm-msg">${this._esc(message)}</p>
          <footer class="mn-modal-foot">
            <button type="button" class="mn-btn-secondary" data-action="cancel">${__('Cancelar')}</button>
            <button type="button" class="mn-btn-primary mn-btn-danger" data-action="confirm">${this._esc(confirmLabel || __('Eliminar'))}</button>
          </footer>
        </div>`;
      const handle = window.Modal.show({ title, body, className: 'mn-follow-modal mn-follow-modal--confirm' });
      if (!handle) { resolve(window.confirm(message)); return; }
      const { modal, close } = handle;
      let settled = false;
      const settle = (val) => { if (settled) return; settled = true; resolve(val); };
      modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { settle(false); close(); });
      modal.querySelector('[data-action="confirm"]')?.addEventListener('click', () => { settle(true); close(); });
      // Cierre por X u overlay = cancelar.
      const closeBtn = modal.querySelector('.modal-close');
      closeBtn?.addEventListener('click', () => settle(false));
      modal.querySelector('.modal-overlay')?.addEventListener('click', () => settle(false));
    });
  }

  async _confirmDeleteEntity(id) {
    const e = (this._data.entities.data || []).find(x => x.id === id);
    if (!e) return;
    const okDelete = await this._confirmDialog({
      title: __('¿Dejar de seguir a "{name}"?', { name: e.name }),
      message: __('Se elimina el perfil y toda su huella de vigilancia (sensores, señales y publicaciones capturadas). Esta acción no se puede deshacer.'),
      confirmLabel: __('Dejar de seguir'),
    });
    if (!okDelete) return;
    const { error } = await this._service.deleteEntity(id);
    if (error) { this._showNotification(__('Error:') + ' ' + error.message, 'error'); return; }
    this._showNotification(__('Dejaste de seguir a "{name}"', { name: e.name }), 'success');
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
      if (!payload.url) { this._showNotification(__('La dirección es obligatoria.'), 'error'); return; }
      const { error } = await this._service.updateWatcher(id, payload);
      if (error) { this._showNotification(__('Error:') + ' ' + error.message, 'error'); return; }
      close();
      await this._refresh();
    });
  }

  async _confirmDeleteWatcher(id) {
    const w = (this._data.watchers.data || []).find(x => x.id === id);
    if (!w) return;
    const okDelete = await this._confirmDialog({
      title: __('¿Dejar de vigilar "{name}"?', { name: w.label || w.url }),
      message: __('Esta acción no se puede deshacer.'),
      confirmLabel: __('Dejar de vigilar'),
    });
    if (!okDelete) return;
    const { error } = await this._service.deleteWatcher(id);
    if (error) { this._showNotification(__('Error:') + ' ' + error.message, 'error'); return; }
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
