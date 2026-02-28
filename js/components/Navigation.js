/**
 * Sidebar usuario consumidor — Schema final (Zona 1: navegación workspace, Zona 2: footer organizacional).
 * Estructura: main[] (Production, flows, Identity) + footer[] (Configuración, Créditos).
 * Estudio no tiene entrada en el sidebar: solo se accede seleccionando un flujo desde flows.
 */
const SIDEBAR_USER_CONFIG = {
  main: [
    { type: 'page', id: 'activity', label: 'Production', icon: 'fa-chart-line', iconSrc: '/recursos/icons/Production.svg', route: 'production' },
    { type: 'page', id: 'tasks', label: 'Task', icon: 'fa-clock', route: 'tasks' },
    {
      type: 'container',
      id: 'catalog',
      label: 'Flows',
      icon: 'fa-th-large',
      iconSrc: '/recursos/icons/flows.svg',
      children: [] // Se rellenan con content_categories (schema 218-224) en render
    },
    {
      type: 'container',
      id: 'identity',
      label: 'Identity',
      icon: 'fa-layer-group',
      iconSrc: '/recursos/icons/Identity-Brands.svg',
      children: [
        { label: 'Brand', route: 'brand' },
        { label: 'Products', route: 'products' },
        { label: 'Services', route: 'servicios' },
        { label: 'Audiences', route: 'audiences' },
        { label: 'Campaigns', route: 'campaigns' }
      ]
    }
  ],
  footer: [
    { label: 'Configuración', icon: 'fa-cog', iconSrc: '/recursos/icons/settings.svg', route: 'organization' },
    { label: 'Notificaciones', icon: 'fa-bell', iconSrc: null, flyout: 'notifications' },
    { label: 'Créditos', icon: 'fa-coins', iconSrc: '/recursos/icons/credits.svg', route: 'credits' }
  ]
};

const SIDEBAR_USER_EXPANDED_KEY = 'sidebarUserExpanded';

function _escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

function _formatNotificationDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return 'Hace ' + Math.floor(diff / 60000) + ' min';
  if (d.toDateString() === now.toDateString()) return 'Hoy ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 86400000 * 2) return 'Ayer';
  return d.toLocaleDateString();
}

/** SVG inline para el botón toggle del sidebar (hereda color del botón). */
const SIDEBAR_TOGGLE_ICON_DESPLEGADO = `<svg class="nav-sidebar-toggle-icon" width="21" height="18" viewBox="0 0 20 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.29167 0.999999L1 8.29166L8.29167 15.5833M18.5 1L11.2083 8.29167L18.5 15.5833" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SIDEBAR_TOGGLE_ICON_COLAPSADO = `<svg class="nav-sidebar-toggle-icon" width="21" height="18" viewBox="0 0 20 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.2083 15.5833L18.5 8.29167L11.2083 1M1 15.5833L8.29167 8.29167L1 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Sidebar desarrollador — Build, Operations, Observability, Resources, Lead (solo lead).
 */
const SIDEBAR_DEVELOPER_CONFIG = [
  { type: 'page', id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', route: '/dev/dashboard' },
  {
    type: 'container',
    id: 'build',
    label: 'Build',
    icon: 'fa-wrench',
    children: [
      { label: 'Mis Flujos', route: '/dev/flows' },
      { label: 'Builder', route: '/dev/builder' }
    ]
  },
  {
    type: 'container',
    id: 'operations',
    label: 'Operations',
    icon: 'fa-cogs',
    children: [
      { label: 'Test de Flujos', route: '/dev/test' },
      { label: 'Webhooks', route: '/dev/webhooks' }
    ]
  },
  {
    type: 'container',
    id: 'observability',
    label: 'Observability',
    icon: 'fa-chart-area',
    children: [
      { label: 'Debug', route: '/dev/test' },
      { label: 'Logs', route: '/dev/logs' }
    ]
  },
  {
    type: 'container',
    id: 'resources',
    label: 'Resources',
    icon: 'fa-book',
    children: [
      { label: 'Referencias visuales', route: '/dev/lead/references' }
    ]
  },
  {
    type: 'container',
    id: 'lead',
    label: 'Lead',
    icon: 'fa-shield-alt',
    role_required: 'lead',
    children: [
      { label: 'Equipo', route: '/dev/lead/team' },
      { label: 'Categorías', route: '/dev/lead/categories' },
      { label: 'Input Schemas', route: '/dev/lead/input-schemas' },
      { label: 'Base conocimiento IA', route: '/dev/lead/ai-vectors' },
      { label: 'Todos los flujos', route: '/dev/lead/flows' }
    ]
  }
];

/**
 * Navigation Component - Sistema de navegación inteligente
 * 
 * Maneja el sidebar y header según el contexto de la ruta:
 * - (Home/Hogar eliminado: tras login el usuario entra directo a su organización)
 * - /org/:org_id/...: Sidebar de organización (SaaS)
 * - /dev/...: Sidebar de desarrollador (PaaS)
 * - Rutas públicas (/, /login, /signin, /cambiar-contrasena): Sin navegación
 */
class Navigation {
  constructor() {
    this.container = document.getElementById('navigation-container');
    this.isNavOpen = false;
    this.isCollapsed = false;
    this.initialized = false;
    this.currentMode = null;
    this.currentOrgId = null;
    this.currentBrandId = null;
    this._orgCache = null;
    this._orgCacheId = null;
    this._orgCacheTime = 0;
    this._devCache = null;
    this._devCacheTime = 0;
    this._catalogCategories = [];
    this._CACHE_TTL = 60000;
    this._creditsUpdatedAttached = false;
    this._creditsRefreshInterval = null;
  }

  /**
   * Refrescar créditos del sidebar (invalida caché y recarga desde BD).
   * Útil tras comprar créditos o gastarlos en Studio. También se llama al escuchar 'credits-updated'.
   */
  refreshCredits() {
    this._orgCacheTime = 0;
    if (this.currentMode === 'user' && this.currentOrgId) {
      this.loadOrganizationInfo();
    }
  }

  /**
   * Formatea créditos para mostrar: cantidad exacta sin redondear hacia arriba (ej. 1999 → "1.9K", no "2.0K").
   */
  _formatCreditsDisplay(n) {
    const credits = Number(n) || 0;
    if (credits >= 1000) {
      return (Math.floor(credits / 100) / 10).toFixed(1) + 'K';
    }
    return String(credits);
  }

  /**
   * Lee créditos desde la tabla organization_credits (BD) y actualiza el DOM del sidebar.
   * Siempre hace una petición a la BD; no usa valor en memoria.
   * @param {string|null} [organizationId] - Si se pasa (ej. desde Studio), se usa esta org para la consulta.
   */
  async loadCreditsFromDb(organizationId) {
    const orgId = organizationId || this.currentOrgId;
    if (!orgId) return;
    const supabase = await this.getSupabase();
    if (!supabase) return;
    const tokensEl = document.getElementById('navTokensValue');
    const barFill = document.querySelector('.nav-org-credits-bar-fill');
    if (tokensEl) tokensEl.textContent = '…';
    if (barFill) barFill.style.width = '0%';
    try {
      const { data, error } = await supabase
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) {
        if (tokensEl) tokensEl.textContent = '—';
        console.warn('Navigation: error leyendo créditos', error);
        return;
      }
      const available = data != null ? (data.credits_available ?? 0) : 0;
      const total = data != null ? (data.credits_total ?? 0) : 0;
      if (tokensEl) {
        tokensEl.textContent = this._formatCreditsDisplay(available);
      }
      if (barFill) {
        const pct = total > 0 ? Math.min(100, Math.round((available / total) * 100)) : 0;
        barFill.style.width = `${pct}%`;
      }
      if (this._orgCache && this._orgCacheId === orgId) {
        this._orgCache.credits = available;
        this._orgCache.credits_total = total;
      }
    } catch (e) {
      if (tokensEl) tokensEl.textContent = '—';
      console.warn('Navigation: loadCreditsFromDb', e);
    }
  }

  /**
   * Carga categorías de intención desde content_categories (schema 218-224) para el sidebar flows.
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async loadCatalogCategories() {
    try {
      const supabase = window.supabaseService
        ? await window.supabaseService.getClient()
        : window.supabase;
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('content_categories')
        .select('id, name')
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('name');
      if (error) return [];
      this._catalogCategories = Array.isArray(data) ? data : [];
      return this._catalogCategories;
    } catch (e) {
      console.warn('Navigation: no se pudieron cargar content_categories', e);
      return [];
    }
  }

  /**
   * Determinar el tipo de layout según la ruta
   * @returns {Object} { mode, showSidebar, showHeader, orgId, brandId }
   */
  getLayoutConfig() {
    const path = window.location.pathname || '/';
    
    // Rutas públicas - sin navegación
    if (path === '/' || path === '/login' || path === '/signin' || path === '/cambiar-contrasena' || path === '/index.html') {
      return { mode: null, showSidebar: false, showHeader: false, orgId: null, brandId: null };
    }
    
    // Configuración de usuario (Mi cuenta): fuera de org, solo header sin sidebar
    if (path === '/settings' || path.startsWith('/settings?')) {
      return { mode: 'home', showSidebar: false, showHeader: true, orgId: null, brandId: null };
    }
    
    // Rutas de desarrollador /dev/*
    if (path.startsWith('/dev')) {
      return { mode: 'developer', showSidebar: true, showHeader: true, orgId: null, brandId: null };
    }
    
    // Rutas de organización /org/:orgIdShort/:orgNameSlug/*
    const orgMatch = path.match(/^\/org\/([^\/]+)\/([^\/]+)/);
    if (orgMatch) {
      const orgId = window.currentOrgId || null;
      const orgSlug = orgMatch[2];
      const brandMatch = path.match(/^\/org\/[^/]+\/[^/]+\/(?:brand|products|product-detail)\/([^/]+)/);
      const brandId = brandMatch ? brandMatch[1] : null;
      return { mode: 'user', showSidebar: true, showHeader: true, orgId, brandId, orgSlug };
    }
    
    // Rutas legacy sin /org/ - usar org actual si existe (para mostrar créditos reales en sidebar)
    if (['/production', '/historial', '/living', '/brands', '/products', '/studio', '/audiences', '/marketing', '/campaigns', '/content', '/tasks', '/organization', '/servicios', '/credits'].some(r => path.startsWith(r))) {
      return { mode: 'user', showSidebar: true, showHeader: true, orgId: window.currentOrgId || null, brandId: null };
    }
    
    // Default - sin navegación
    return { mode: null, showSidebar: false, showHeader: false, orgId: null, brandId: null };
  }

  /**
   * Renderizar la navegación según la ruta actual
   */
  async render() {
    if (!this.container) {
      console.error('Navigation container no encontrado');
      return;
    }

    const config = this.getLayoutConfig();
    
    // Si no hay navegación, limpiar y salir
    if (!config.showSidebar && !config.showHeader) {
      this.container.innerHTML = '';
      this.container.className = '';
      this.updateBodyLayout(config);
      this.initialized = false;
      this.currentMode = null;
      return;
    }

    // Si el modo no ha cambiado y ya está inicializado, actualizar enlaces y refrescar créditos desde BD
    if (this.initialized && this.currentMode === config.mode && this.currentOrgId === config.orgId) {
      this.updateActiveLink();
      if (config.mode === 'user' && config.orgId) {
        this.loadCreditsFromDb();
      }
      return;
    }

    this.currentMode = config.mode;
    this.currentOrgId = config.orgId;
    this.currentBrandId = config.brandId;
    if (config.mode !== 'user') {
      this._stopCreditsRefreshInterval();
    }

    if (config.mode === 'user') {
      await this.loadCatalogCategories();
    }

    // Renderizar según el modo
    if (config.mode === 'home') {
      this.container.innerHTML = this.getHomeHeaderHTML();
    } else if (config.mode === 'developer') {
      this.container.innerHTML = this.getDeveloperNavigationHTML();
    } else if (config.mode === 'user') {
      this.container.innerHTML = this.getUserNavigationHTML();
    }

    this.initializeSidebar();
    this.setupEventListeners();
    this.setupSubmenus();
    this.updateActiveLink();
    this.updateHeaderTitle();
    this.updateBodyLayout(config);

    // Cargar información del usuario
    await this.loadUserInfo();

    // Cargar información según el modo
    if (config.mode === 'developer') {
      await this.loadDeveloperInfo();
    } else if (config.mode === 'user') {
      await this.loadOrganizationInfo();
    }

    this.initialized = true;
  }

  /**
   * Actualizar clases del body según el layout
   */
  updateBodyLayout(config) {
    document.body.classList.remove('has-sidebar', 'has-header-only', 'no-nav');
    
    if (config.showSidebar) {
      document.body.classList.add('has-sidebar');
    } else if (config.showHeader) {
      document.body.classList.add('has-header-only');
    } else {
      document.body.classList.add('no-nav');
    }
  }

  /**
   * Dropdown de usuario (único fragmento reutilizable)
   * @param {string} settingsHref - URL de configuración de usuario (siempre /settings)
   */
  getUserDropdownHTML(settingsHref = '/settings') {
    return `
      <div class="user-dropdown" id="userDropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name" id="userDropdownName">Usuario</div>
          <div class="user-dropdown-email" id="userDropdownEmail">usuario@email.com</div>
        </div>
        <div class="user-dropdown-divider"></div>
        <a href="${settingsHref}" class="user-dropdown-item" data-route="${settingsHref}" id="userDropdownSettingsLink">
          <i class="fas fa-cog"></i>
          <span>Mi cuenta</span>
        </a>
        <button class="user-dropdown-item" id="logoutBtn">
          <i class="fas fa-sign-out-alt"></i>
          <span>Cerrar sesión</span>
        </button>
      </div>`;
  }

  /**
   * HTML para Home - Solo header sin sidebar
   */
  getHomeHeaderHTML() {
    const settingsHref = '/settings'; // Mi cuenta: siempre fuera de org
    return `
      <header class="app-header header-only" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <div class="header-logo">
              <img src="/recursos/Recursos%20de%20Marca/Recursos/logo-03.svg" alt="AI Smart Content" class="header-logo-img">
            </div>
          </div>
          <div class="header-right">
            <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
        </div>
        ${this.getUserDropdownHTML(settingsHref)}
      </header>`;
  }

  /**
   * Resuelve la ruta completa para el sidebar usuario (con o sin org).
   * Sin org: rutas legacy (ej. brand → /brands). Con org: /org/:id/route.
   */
  getUserSidebarRoute(routeSuffix) {
    const basePath = this.getOrgBasePath();
    // Con org: Créditos → tienda org/.../credits; sin org: /credits (CreditsView redirige)
    const globalRoutes = {};
    if (globalRoutes[routeSuffix]) return globalRoutes[routeSuffix];
    if (basePath) return `${basePath}/${routeSuffix}`;
    const legacy = { brand: '/brands', settings: '/settings' };
    return legacy[routeSuffix] || `/${routeSuffix}`;
  }

  /** Prefijo de ruta para la org actual: /org/{shortId}/{slug} con el nombre real de la org. */
  getOrgBasePath() {
    if (!this.currentOrgId) return '';
    const name = (this._orgCache?.name || window.currentOrgName || '').trim();
    if (name && typeof window.getOrgPathPrefix === 'function') {
      const prefix = window.getOrgPathPrefix(this.currentOrgId, name);
      if (prefix) return prefix;
    }
    if (window.currentOrgSlug && typeof window.getOrgShortId === 'function') {
      const shortId = window.getOrgShortId(this.currentOrgId);
      if (shortId) return `/org/${shortId}/${window.currentOrgSlug}`;
    }
    return '';
  }

  /**
   * HTML para navegación de usuario SaaS.
   * Zona 1: WorkspaceHeader + NavigationMain (Production, flows, Identity).
   * Zona 2: NavigationFooter anclado (Configuración, Créditos, Salir).
   */
  getUserNavigationHTML() {
    const basePath = this.getOrgBasePath();
    const full = (suffix) => this.getUserSidebarRoute(suffix);
    const expandedId = localStorage.getItem(SIDEBAR_USER_EXPANDED_KEY) || '';

    const iconHTML = (item) => item.iconSrc
      ? `<img src="${item.iconSrc}" class="nav-icon nav-icon-img" alt="" width="20" height="20">`
      : `<i class="fas ${item.icon} nav-icon"></i>`;

    const mainHTML = SIDEBAR_USER_CONFIG.main.map((item) => {
      if (item.type === 'page') {
        const href = full(item.route);
        return `
          <div class="nav-item">
            <a href="${href}" class="nav-link nav-main-link" data-route="${href}" data-tooltip="${item.label}">
              ${iconHTML(item)}
              <span class="nav-text">${item.label}</span>
            </a>
          </div>`;
      }
      const isOpen = expandedId === item.id;
      let childItems = item.children || [];
      if (item.id === 'catalog') {
        const cats = Array.isArray(this._catalogCategories) ? this._catalogCategories : [];
        childItems = [
          { label: 'All', route: 'studio/flows' },
          ...cats.map((c) => ({ label: c.name, route: `studio/flows/${c.id}` }))
        ];
      }
      const children = childItems
        .map(
          (c) => `
            <a href="${full(c.route)}" class="nav-submenu-link" data-route="${full(c.route)}" data-tooltip="${c.label}">
              <span>${c.label}</span>
            </a>`
        )
        .join('');
      return `
        <div class="nav-item has-submenu ${isOpen ? 'submenu-open' : ''}" data-container-id="${item.id}">
          <button type="button" class="nav-link nav-submenu-toggle" data-tooltip="${item.label}" aria-expanded="${isOpen}" aria-controls="nav-sub-${item.id}">
            ${iconHTML(item)}
            <span class="nav-text">${item.label}</span>
            <i class="fas fa-chevron-right nav-chevron" aria-hidden="true"></i>
          </button>
          <div class="nav-submenu" id="nav-sub-${item.id}" role="group" aria-label="${item.label}">
            ${children}
          </div>
        </div>`;
    }).join('');

    const footerIconHTML = (f) => f.iconSrc
      ? `<img src="${f.iconSrc}" class="nav-icon nav-icon-img" alt="" width="20" height="20">`
      : `<i class="fas ${f.icon} nav-icon"></i>`;

    const footerHTML = SIDEBAR_USER_CONFIG.footer.map((f) => {
      if (f.flyout === 'notifications') {
        return `
          <button type="button" class="nav-footer-link nav-footer-btn" data-flyout="notifications" data-tooltip="${f.label}" aria-label="${f.label}">
            ${footerIconHTML(f)}
            <span class="nav-text">${f.label}</span>
          </button>`;
      }
      const href = full(f.route);
      return `
        <a href="${href}" class="nav-footer-link" data-route="${href}" data-tooltip="${f.label}">
          ${footerIconHTML(f)}
          <span class="nav-text">${f.label}</span>
        </a>`;
    }).join('');

    return `
      <div class="nav-overlay" id="navOverlay"></div>

      <header class="app-header with-sidebar" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <h1 class="header-title" id="headerTitle">Production</h1>
          </div>
          <div class="header-right">
            <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
        </div>
        <div class="header-production-slot" id="headerProductionSlot" aria-hidden="true"></div>
        ${this.getUserDropdownHTML('/settings')}
      </header>

      <nav class="side-navigation nav-mode-user" id="sideNavigation" aria-label="Navegación principal">
        <div class="nav-workspace-header nav-identity-section" id="navWorkspaceHeader">
          <button type="button" class="nav-sidebar-toggle" id="sidebarToggleBtn" aria-label="Abrir o cerrar menú">
            ${SIDEBAR_TOGGLE_ICON_DESPLEGADO}
          </button>
          <h2 class="nav-org-title" id="navOrgName">Mi Organización</h2>
        </div>

        <div class="nav-menu" role="navigation" aria-label="Navegación del workspace">
          ${mainHTML}
        </div>

        <div class="nav-spacer" aria-hidden="true"></div>

        <div class="nav-footer" role="navigation" aria-label="Administración organizacional">
          ${footerHTML}
          <div class="nav-org-credits" id="navOrgCreditsBlock">
            <span class="nav-org-credits-label">Créditos</span>
            <span class="nav-org-credits-value" id="navTokensValue">—</span>
            <div class="nav-org-credits-bar" aria-hidden="true"><div class="nav-org-credits-bar-fill" style="width:0%"></div></div>
          </div>
        </div>
      </nav>
      <div class="nav-flyout" id="navFlyout" aria-hidden="true"></div>
    `;
  }

  /**
   * HTML para navegación de desarrollador PaaS (config-driven: Dashboard, Build, Operations, Observability, Resources, Lead).
   */
  getDeveloperNavigationHTML() {
    const mainHTML = SIDEBAR_DEVELOPER_CONFIG.map((item) => {
      const isLead = item.role_required === 'lead';
      const wrapClass = isLead ? 'nav-item has-submenu nav-lead-only nav-dev-lead-section' : 'nav-item has-submenu';
      const attrs = isLead ? ` id="navLeadSection" style="display: none;"` : '';

      if (item.type === 'page') {
        return `
          <div class="nav-item">
            <a href="${item.route}" class="nav-link" data-route="${item.route}" data-tooltip="${item.label}">
              <i class="fas ${item.icon} nav-icon"></i>
              <span class="nav-text">${item.label}</span>
            </a>
          </div>`;
      }

      const children = (item.children || [])
        .map(
          (c) => `
            <a href="${c.route}" class="nav-submenu-link" data-route="${c.route}" data-tooltip="${c.label}">
              <span>${c.label}</span>
            </a>`
        )
        .join('');

      return `
        <div class="${wrapClass}" data-container-id="${item.id}"${attrs}>
          <button type="button" class="nav-link nav-submenu-toggle" data-tooltip="${item.label}" aria-expanded="false" aria-controls="nav-dev-sub-${item.id}">
            <i class="fas ${item.icon} nav-icon"></i>
            <span class="nav-text">${item.label}</span>
            <i class="fas fa-chevron-right nav-chevron" aria-hidden="true"></i>
          </button>
          <div class="nav-submenu" id="nav-dev-sub-${item.id}" role="group" aria-label="${item.label}">
            ${children}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="nav-overlay" id="navOverlay"></div>

      <header class="app-header with-sidebar" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <h1 class="header-title" id="headerTitle">Developer Portal</h1>
          </div>
          <div class="header-right">
            <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
        </div>
        ${this.getUserDropdownHTML('/settings')}
      </header>

      <nav class="side-navigation nav-mode-developer" id="sideNavigation" aria-label="Navegación desarrollador">
        <div class="nav-identity-section nav-workspace-header nav-dev-toggle-header">
          <button type="button" class="nav-sidebar-toggle" id="sidebarToggleBtn" aria-label="Abrir o cerrar menú">
            ${SIDEBAR_TOGGLE_ICON_DESPLEGADO}
          </button>
        </div>
        <div class="nav-identity-section">
          <div class="nav-identity-card dev-identity" id="navIdentityCard">
            <div class="nav-identity-content">
              <div class="nav-dev-icon" id="navDevIcon">
                <i class="fas fa-code"></i>
              </div>
              <div class="nav-identity-info">
                <div class="nav-org-name" id="navDevName">Developer Portal</div>
                <div class="nav-org-type" id="navDevTier">—</div>
              </div>
            </div>
          </div>
        </div>

        <div class="nav-menu" role="navigation" aria-label="Menú desarrollador">
          ${mainHTML}
        </div>

        <div class="nav-footer">
          <div class="nav-dev-stats" id="navDevStats">
            <div class="nav-dev-stat">
              <i class="fas fa-play"></i>
              <span id="navRunsCount">0</span>
            </div>
            <div class="nav-dev-stat">
              <i class="fas fa-star"></i>
              <span id="navRatingValue">0.0</span>
            </div>
          </div>
        </div>
      </nav>
      <div class="nav-flyout" id="navFlyout" aria-hidden="true"></div>
    `;
  }

  /**
   * Cambiar el modo de navegación (legacy; ya no se muestra el botón en el sidebar)
   */
  async switchMode(mode) {
    if (mode === 'developer') {
      localStorage.setItem('userViewMode', 'developer');
      window.router?.navigate('/dev/dashboard');
    } else {
      localStorage.setItem('userViewMode', 'user');
      const url = window.authService && typeof window.authService.getDefaultUserRoute === 'function'
        ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser()?.id)
        : '/settings';
      window.router?.navigate(url, true);
    }
  }

  /**
   * Inicializar estado del sidebar
   */
  initializeSidebar() {
    const sidebar = document.getElementById('sideNavigation');
    if (!sidebar) return;

    // Recuperar estado colapsado
    const savedCollapsed = localStorage.getItem('sidebarCollapsed');
    if (savedCollapsed === 'true') {
      this.isCollapsed = true;
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    }
    this.updateSidebarToggleIcon();
  }

  /**
   * Actualiza el icono del botón toggle según estado del sidebar (abierto → desplegado, cerrado → colapsado).
   */
  updateSidebarToggleIcon() {
    const btn = document.getElementById('sidebarToggleBtn');
    if (!btn) return;
    btn.innerHTML = this.isCollapsed ? SIDEBAR_TOGGLE_ICON_COLAPSADO : SIDEBAR_TOGGLE_ICON_DESPLEGADO;
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Botón del sidebar (icono colapsado): en móvil abre/cierra overlay; en desktop colapsa/expande sidebar
    const sidebarToggle = document.getElementById('sidebarToggleBtn');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 768px)').matches) {
          this.toggleMobileNav();
        } else {
          this.toggleSidebarCollapse();
        }
      });
    }

    // Overlay
    const overlay = document.getElementById('navOverlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.closeMobileNav());
    }

    // User menu
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Un solo listener en document para cerrar todos los dropdowns (evita duplicados al re-render)
    if (!this._documentClickAttached) {
      this._documentClickAttached = true;
      document.addEventListener('click', () => {
        const ud = document.getElementById('userDropdown');
        const od = document.getElementById('navOrgDropdown');
        if (ud) ud.classList.remove('active');
        if (od) od.classList.remove('active');
      });
    }

    // Actualizar créditos del sidebar cuando otra vista los modifica (compra, uso en Studio)
    if (!this._creditsUpdatedAttached) {
      this._creditsUpdatedAttached = true;
      document.addEventListener('credits-updated', () => this.refreshCredits());
    }

    document.querySelectorAll('.nav-footer-btn[data-flyout="notifications"]:not([data-nav-bound])').forEach((btn) => {
      btn.setAttribute('data-nav-bound', '1');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openNotificationsFlyout(btn);
        const ud = document.getElementById('userDropdown');
        if (ud) ud.classList.remove('active');
      });
    });

    document.querySelectorAll('.nav-link[data-route]:not([data-nav-bound]), .nav-main-link[data-route]:not([data-nav-bound]), .nav-submenu-link[data-route]:not([data-nav-bound]), .nav-footer-link[data-route]:not([data-nav-bound]), #userDropdownSettingsLink:not([data-nav-bound]), #userDropdown a[data-route]:not([data-nav-bound])').forEach((link) => {
      link.setAttribute('data-nav-bound', '1');
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.dataset.route || (link.getAttribute && link.getAttribute('href'));
        if (route && window.router) {
          const path = route.indexOf('/') === 0 ? route : new URL(route, window.location.origin).pathname;
          window.router.navigate(path);
        }
        const ud = document.getElementById('userDropdown');
        if (ud) ud.classList.remove('active');
      });
    });

    // Escuchar cambios de ruta (solo una vez para no acumular)
    if (!this._routeListenersAttached) {
      this._routeListenersAttached = true;
      window.addEventListener('popstate', () => this.render());
      window.addEventListener('routechange', () => {
        this.updateActiveLink();
        this.updateHeaderTitle();
      });
    }

    this.setupCollapsedTooltips();
    this.setupFlyoutCloseListeners();
  }

  /**
   * Configurar submenús: usuario (1 expandido + persist) y desarrollador (1 expandido).
   * Con sidebar colapsado: click en container abre flyout, no expande inline.
   */
  setupSubmenus() {
    const sidebar = document.getElementById('sideNavigation');
    const isCollapsed = () => sidebar && sidebar.classList.contains('collapsed');

    const handleContainerClick = (e, toggle, parent, isUser) => {
      e.preventDefault();
      if (isCollapsed()) {
        this.openFlyout(parent);
        return;
      }
      const containerId = parent.dataset.containerId;
      const isOpen = parent.classList.contains('submenu-open');
      const scope = isUser ? '.nav-mode-user' : '.nav-mode-developer';
      document.querySelectorAll(`${scope} .nav-item.has-submenu.submenu-open`).forEach((item) => {
        if (item !== parent) item.classList.remove('submenu-open');
      });
      parent.classList.toggle('submenu-open', !isOpen);
      toggle.setAttribute('aria-expanded', !isOpen);
      if (isUser) localStorage.setItem(SIDEBAR_USER_EXPANDED_KEY, !isOpen ? containerId : '');
    };

    document.querySelectorAll('.nav-mode-user .nav-submenu-toggle:not([data-sub-bound])').forEach((toggle) => {
      toggle.setAttribute('data-sub-bound', '1');
      toggle.addEventListener('click', (e) => {
        const parent = toggle.closest('.nav-item.has-submenu');
        if (!parent) return;
        handleContainerClick(e, toggle, parent, true);
      });
    });

    document.querySelectorAll('.nav-mode-developer .nav-submenu-toggle:not([data-sub-bound])').forEach((toggle) => {
      toggle.setAttribute('data-sub-bound', '1');
      toggle.addEventListener('click', (e) => {
        const parent = toggle.closest('.nav-item.has-submenu');
        if (!parent) return;
        handleContainerClick(e, toggle, parent, false);
      });
    });

    document.querySelectorAll('.nav-submenu-toggle:not([data-hover-bound])').forEach((toggle) => {
      toggle.setAttribute('data-hover-bound', '1');
      const parent = toggle.closest('.nav-item.has-submenu');
      if (!parent) return;
      toggle.addEventListener('mouseenter', () => {
        if (!sidebar?.classList.contains('collapsed')) return;
        clearTimeout(this._flyoutCloseTimer);
        this._flyoutCloseTimer = null;
        this._flyoutHoverTimer = setTimeout(() => this.openFlyout(parent), 120);
      });
      toggle.addEventListener('mouseleave', () => {
        clearTimeout(this._flyoutHoverTimer);
        if (this._flyoutOpen) {
          this._flyoutCloseTimer = setTimeout(() => this.closeFlyout(), 200);
        }
      });
    });
  }

  /**
   * Abrir panel flyout (sidebar colapsado): Header (icono + nombre) | Body (tree) | Footer (CTA).
   * Posiciona el flyout centrado verticalmente con el icono del container.
   */
  openFlyout(containerEl) {
    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;
    const submenu = containerEl.querySelector('.nav-submenu');
    const toggle = containerEl.querySelector('.nav-submenu-toggle');
    const label = toggle?.dataset?.tooltip || 'Módulo';
    const iconEl = toggle?.querySelector('.nav-icon');
    const iconClass = iconEl ? (iconEl.className.baseVal || iconEl.className).replace(/\s*nav-icon\s*/, '').trim() : 'fas fa-folder';
    const links = submenu ? submenu.querySelectorAll('.nav-submenu-link') : [];
    const currentPath = window.location.pathname;

    const headerHtml = `
      <div class="nav-flyout-header">
        <span class="nav-flyout-header-icon"><i class="${iconClass}"></i></span>
        <span class="nav-flyout-header-label">${label}</span>
      </div>`;
    let bodyHtml = '<div class="nav-flyout-body"><div class="nav-flyout-list">';
    links.forEach((a) => {
      const route = a.dataset.route || '';
      const itemLabel = (a.querySelector('span') || a).textContent.trim();
      const active = currentPath === route || (route && currentPath.startsWith(route + '/'));
      bodyHtml += `<a href="${route}" class="nav-flyout-link${active ? ' active' : ''}" data-route="${route}" ${active ? ' aria-current="page"' : ''}>${itemLabel}</a>`;
    });
    bodyHtml += '</div></div>';
    const footerHtml = `
      <div class="nav-flyout-footer">
        <button type="button" class="nav-flyout-cta" data-action="open-module">
          ${label} <i class="fas fa-chevron-right"></i>
        </button>
      </div>`;

    flyout.innerHTML = `
      <div class="nav-flyout-bridge" aria-hidden="true"></div>
      <div class="nav-flyout-inner">
        ${headerHtml}
        ${bodyHtml}
        ${footerHtml}
      </div>`;
    flyout.classList.add('open');
    flyout.setAttribute('aria-hidden', 'false');
    this._flyoutContainer = containerEl;

    flyout.querySelectorAll('.nav-flyout-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.dataset.route;
        if (route && window.router) window.router.navigate(route);
        this.closeFlyout();
      });
    });
    flyout.querySelector('.nav-flyout-cta')?.addEventListener('click', () => this.closeFlyout());

    this._bindFlyoutHoverClose();

    requestAnimationFrame(() => {
      const triggerRect = toggle?.getBoundingClientRect();
      if (triggerRect) {
        const flyoutHeight = flyout.offsetHeight;
        const top = Math.max(8, Math.min(triggerRect.top + triggerRect.height / 2 - flyoutHeight / 2, window.innerHeight - flyoutHeight - 8));
        flyout.style.top = `${top}px`;
      }
    });

    this._flyoutOpen = true;
  }

  _bindFlyoutHoverClose() {
    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;
    if (flyout._flyoutEnter) {
      flyout.removeEventListener('mouseenter', flyout._flyoutEnter);
      flyout.removeEventListener('mouseleave', flyout._flyoutLeave);
    }
    const onEnter = () => {
      clearTimeout(this._flyoutCloseTimer);
      this._flyoutCloseTimer = null;
    };
    const onLeave = () => {
      this._flyoutCloseTimer = setTimeout(() => this.closeFlyout(), 200);
    };
    flyout.addEventListener('mouseenter', onEnter);
    flyout.addEventListener('mouseleave', onLeave);
    flyout._flyoutEnter = onEnter;
    flyout._flyoutLeave = onLeave;
  }

  closeFlyout() {
    const flyout = document.getElementById('navFlyout');
    if (flyout) {
      if (document.activeElement && flyout.contains(document.activeElement)) {
        try {
          const trigger = this._flyoutContainer?.querySelector('.nav-submenu-toggle');
          const notifTrigger = document.querySelector('.nav-footer-btn[data-flyout="notifications"]');
          if (trigger && typeof trigger.focus === 'function') {
            trigger.focus();
          } else if (notifTrigger && typeof notifTrigger.focus === 'function') {
            notifTrigger.focus();
          } else {
            const header = document.getElementById('appHeader');
            const firstFocusable = header?.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
            if (firstFocusable && typeof firstFocusable.focus === 'function') firstFocusable.focus();
          }
        } catch (_) {}
      }
      flyout.classList.remove('open');
      flyout.setAttribute('aria-hidden', 'true');
    }
    this._flyoutOpen = false;
  }

  /**
   * Abre el flyout de notificaciones (user_notifications). Carga desde Supabase y muestra en #navFlyout.
   * @param {HTMLElement} [triggerEl] - Botón que abrió el flyout (para posicionar).
   */
  async openNotificationsFlyout(triggerEl) {
    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;

    const user = window.authService?.getCurrentUser();
    const supabase = window.authService?.supabase;
    if (!user?.id || !supabase?.from) {
      this._renderNotificationsFlyoutContent(flyout, [], null, true);
      this._showNotificationsFlyout(flyout, triggerEl);
      return;
    }

    this._renderNotificationsFlyoutContent(flyout, null, 'Cargando…', false);
    this._showNotificationsFlyout(flyout, triggerEl);

    const { data: notifications, error } = await supabase
      .from('user_notifications')
      .select('id, title, message, type, is_read, created_at, link_to')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this._renderNotificationsFlyoutContent(flyout, [], null, true, error.message);
      return;
    }
    this._renderNotificationsFlyoutContent(flyout, notifications || [], null, true);
  }

  _renderNotificationsFlyoutContent(flyout, notifications, loadingLabel, ready, errorMessage) {
    const isLoading = notifications === null && !errorMessage;
    const list = Array.isArray(notifications) ? notifications : [];
    const configHref = this.getUserSidebarRoute('organization');

    let bodyHtml;
    if (errorMessage) {
      bodyHtml = `<div class="nav-flyout-notifications-error">${_escapeHtml(errorMessage)}</div>`;
    } else if (loadingLabel) {
      bodyHtml = `<div class="nav-flyout-notifications-loading">${_escapeHtml(loadingLabel)}</div>`;
    } else if (list.length === 0) {
      bodyHtml = '<div class="nav-flyout-notifications-empty">No hay notificaciones</div>';
    } else {
      bodyHtml = '<div class="nav-flyout-list nav-flyout-notifications-list">' + list.map((n) => {
        const type = (n.type || 'info');
        const dateStr = n.created_at ? _formatNotificationDate(n.created_at) : '';
        const unread = !n.is_read;
        const link = n.link_to ? ` data-link="${_escapeHtml(n.link_to)}"` : '';
        return `<button type="button" class="nav-flyout-notification-item ${unread ? 'unread' : ''} ${type}" data-id="${n.id}"${link}>
          <span class="nav-flyout-notification-type">${_escapeHtml(type)}</span>
          <span class="nav-flyout-notification-title">${_escapeHtml(n.title)}</span>
          <span class="nav-flyout-notification-message">${_escapeHtml((n.message || '').slice(0, 80))}${(n.message || '').length > 80 ? '…' : ''}</span>
          <span class="nav-flyout-notification-date">${_escapeHtml(dateStr)}</span>
        </button>`;
      }).join('') + '</div>';
    }

    const footerHtml = configHref
      ? `<div class="nav-flyout-footer">
          <a href="${configHref}" class="nav-flyout-cta nav-flyout-cta-link" data-route="${configHref}">Configuración <i class="fas fa-chevron-right"></i></a>
        </div>`
      : '';

    flyout.innerHTML = `
      <div class="nav-flyout-bridge" aria-hidden="true"></div>
      <div class="nav-flyout-inner">
        <div class="nav-flyout-header">
          <span class="nav-flyout-header-icon"><i class="fas fa-bell"></i></span>
          <span class="nav-flyout-header-label">Notificaciones</span>
        </div>
        <div class="nav-flyout-body nav-flyout-notifications-body">${bodyHtml}</div>
        ${footerHtml}
      </div>`;

    if (ready && list.length) {
      flyout.querySelectorAll('.nav-flyout-notification-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const link = btn.dataset.link;
          if (id && window.authService?.supabase?.from) {
            window.authService.supabase.from('user_notifications').update({ is_read: true }).eq('id', id).then(() => {});
          }
          if (link && window.router) {
            this.closeFlyout();
            window.router.navigate(link.startsWith('/') ? link : `/${link}`);
          }
        });
      });
    }
    flyout.querySelector('.nav-flyout-cta-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      const route = flyout.querySelector('.nav-flyout-cta-link')?.dataset?.route;
      if (route && window.router) window.router.navigate(route);
      this.closeFlyout();
    });
  }

  _showNotificationsFlyout(flyout, triggerEl) {
    flyout.classList.add('open');
    flyout.setAttribute('aria-hidden', 'false');
    this._flyoutContainer = null;
    this._flyoutOpen = true;
    this._bindFlyoutHoverClose();

    requestAnimationFrame(() => {
      if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const flyoutHeight = flyout.offsetHeight;
        const top = Math.max(8, Math.min(rect.top + rect.height / 2 - flyoutHeight / 2, window.innerHeight - flyoutHeight - 8));
        flyout.style.top = `${top}px`;
      } else {
        flyout.style.top = '';
      }
    });
  }

  /**
   * Tooltips en collapsed solo para páginas y footer. No mostrar en containers:
   * el flyout ya muestra el nombre del módulo y no debe aparecer tooltip que se atraviese.
   */
  setupCollapsedTooltips() {
    let tooltipEl = document.getElementById('navTooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'navTooltip';
      tooltipEl.className = 'nav-tooltip';
      document.body.appendChild(tooltipEl);
    }
    const sidebar = document.getElementById('sideNavigation');
    if (!sidebar) return;

    let hideTimeout;
    let showTimeout;
    const delay = 150;

    sidebar.querySelectorAll('[data-tooltip]:not([data-tip-bound])').forEach((el) => {
      el.setAttribute('data-tip-bound', '1');
      el.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
        showTimeout = setTimeout(() => {
          if (!sidebar.classList.contains('collapsed')) return;
          if (el.classList.contains('nav-submenu-toggle')) return;
          const text = el.dataset.tooltip || '';
          tooltipEl.textContent = text;
          const rect = el.getBoundingClientRect();
          tooltipEl.style.top = `${rect.top + rect.height / 2}px`;
          tooltipEl.style.left = '67px';
          tooltipEl.style.transform = 'translateY(-50%)';
          tooltipEl.classList.add('show');
        }, delay);
      });
      el.addEventListener('mouseleave', () => {
        clearTimeout(showTimeout);
        hideTimeout = setTimeout(() => tooltipEl.classList.remove('show'), 50);
      });
    });
  }

  /**
   * Cerrar flyout: click outside, ESC, cambio de ruta.
   */
  setupFlyoutCloseListeners() {
    if (this._flyoutCloseAttached) return;
    this._flyoutCloseAttached = true;

    document.addEventListener('click', (e) => {
      const flyout = document.getElementById('navFlyout');
      if (!flyout?.classList.contains('open')) return;
      const sidebar = document.getElementById('sideNavigation');
      if (sidebar?.contains(e.target) || flyout.contains(e.target)) return;
      this.closeFlyout();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFlyout();
    });
    window.addEventListener('routechange', () => this.closeFlyout());
    window.addEventListener('popstate', () => this.closeFlyout());
  }

  /**
   * Actualizar enlace activo.
   * Solo se marca activo el enlace con la ruta más específica (más larga) que coincida,
   * para evitar que /studio y /studio/flows queden ambos activos.
   */
  updateActiveLink() {
    const currentPath = window.location.pathname;
    if (this._lastActivePath === currentPath) return;
    this._lastActivePath = currentPath;

    const links = document.querySelectorAll('.nav-link[data-route], .nav-main-link[data-route], .nav-submenu-link[data-route], .nav-footer-link[data-route]');
    const toggles = document.querySelectorAll('.nav-submenu-toggle');

    links.forEach(link => link.classList.remove('active'));
    toggles.forEach(t => t.classList.remove('active'));

    let bestMatch = null;
    let bestLength = 0;
    links.forEach(link => {
      const route = link.dataset.route;
      if (!route || !currentPath.startsWith(route)) return;
      const after = currentPath.slice(route.length);
      if (after !== '' && after !== '/' && !after.startsWith('/')) return;
      if (route.length > bestLength) {
        bestLength = route.length;
        bestMatch = link;
      }
    });

    if (bestMatch) {
      bestMatch.classList.add('active');
      const parent = bestMatch.closest('.has-submenu');
      if (parent) {
        parent.classList.add('submenu-open');
        const toggle = parent.querySelector('.nav-submenu-toggle');
        if (toggle) toggle.classList.add('active');
      }
    }
  }

  /**
   * Actualizar título del header según la ruta actual
   */
  updateHeaderTitle() {
    const titleEl = document.getElementById('headerTitle');
    if (!titleEl) return;

    const path = window.location.pathname;
    // Normalizar: quitar prefijo /org/:short/:slug para comparar segmento de vista
    const pathWithoutOrg = path.replace(/^\/org\/[^/]+\/[^/]+/, '') || '/';

    const titles = {
      '/production': 'Production',
      '/historial': 'Production',
      '/living': 'Production',
      '/brand': 'Identity',
      '/brands': 'Identity',
      '/products': 'Identity',
      '/product-detail': 'Identity',
      '/studio/flows': 'flows',
      '/studio/catalog': 'flows',
      '/studio': 'Studio',
      '/audiences': 'Identity',
      '/marketing': 'Identity',
      '/campaigns': 'Identity',
      '/content': 'Identity',
      '/servicios': 'Identity',
      '/settings': 'Configuración',
      '/organization': 'Configuración',
      '/credits': 'Créditos',
      '/dev/dashboard': 'Dashboard',
      '/dev/flows': 'Mis Flujos',
      '/dev/builder': 'Builder',
      '/dev/test': 'Test de Flujos',
      '/dev/logs': 'Logs',
      '/dev/webhooks': 'Webhooks',
      '/dev/lead/flows': 'Todos los flujos',
      '/dev/lead/team': 'Equipo',
      '/dev/lead/categories': 'Categorías',
      '/dev/lead/input-schemas': 'Input Schemas',
      '/dev/lead/ai-vectors': 'Base de conocimientos IA',
      '/dev/lead/references': 'Referencias visuales'
    };

    for (const [route, title] of Object.entries(titles)) {
      if (pathWithoutOrg === route || pathWithoutOrg.startsWith(route + '/')) {
        titleEl.textContent = title;
        return;
      }
    }
  }

  /**
   * Toggle colapsar/expandir sidebar (desktop)
   */
  toggleSidebarCollapse() {
    const sidebar = document.getElementById('sideNavigation');
    if (!sidebar) return;

    this.isCollapsed = !this.isCollapsed;
    sidebar.classList.toggle('collapsed', this.isCollapsed);
    document.body.classList.toggle('sidebar-collapsed', this.isCollapsed);
    localStorage.setItem('sidebarCollapsed', this.isCollapsed ? 'true' : 'false');
    this.updateSidebarToggleIcon();
  }

  /**
   * Toggle navegación móvil
   */
  toggleMobileNav() {
    const sidebar = document.getElementById('sideNavigation');
    const overlay = document.getElementById('navOverlay');
    
    this.isNavOpen = !this.isNavOpen;
    
    sidebar?.classList.toggle('mobile-open', this.isNavOpen);
    overlay?.classList.toggle('active', this.isNavOpen);
    document.body.classList.toggle('nav-open', this.isNavOpen);
  }

  /**
   * Cerrar navegación móvil
   */
  closeMobileNav() {
    const sidebar = document.getElementById('sideNavigation');
    const overlay = document.getElementById('navOverlay');
    
    this.isNavOpen = false;
    
    sidebar?.classList.remove('mobile-open');
    overlay?.classList.remove('active');
    document.body.classList.remove('nav-open');
  }

  /**
   * Modal de confirmación para Salir de la organización. Navega a otra org o a configuración.
   */
  async showLeaveWorkspaceConfirm() {
    const msg = '¿Salir de la organización? Serás redirigido a otra organización o a configuración.';
    if (!window.confirm(msg)) return;
    this.closeMobileNav();
    const url = window.authService && typeof window.authService.getDefaultUserRoute === 'function'
      ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser()?.id)
      : '/settings';
    if (window.router) window.router.navigate(url, true);
  }

  /**
   * Cargar información del usuario
   */
  async loadUserInfo() {
    try {
      const user = window.authService?.getCurrentUser();
      if (!user) return;

      // Actualizar nombre y email en el dropdown (avatar ya no se muestra en header)
      const nameEl = document.getElementById('userDropdownName');
      const emailEl = document.getElementById('userDropdownEmail');

      const displayName = user.full_name || user.user_metadata?.full_name || user.email || '';
      if (nameEl) {
        nameEl.textContent = displayName || 'Usuario';
      }

      if (emailEl) {
        emailEl.textContent = user.email || '';
      }

      // Si el usuario es desarrollador o tiene vista por defecto desarrollador, mostrar switcher en el dropdown
      if (window.authService?.shouldShowDeveloperSwitcher()) {
        this.injectDeveloperModeSwitcher();
        this.setupDeveloperModeSwitcherListeners();
      }
    } catch (err) {
      console.error('Error loading user info:', err);
    }
  }

  /**
   * Inyectar en #userDropdown los checkboxes Consumidor / Desarrollador (solo para usuarios con is_developer)
   */
  injectDeveloperModeSwitcher() {
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown || document.getElementById('userDropdownModeSwitcher')) return;

    const currentMode = window.authService?.getUserMode() || 'user';
    const html = `
      <div class="user-dropdown-mode-switcher" id="userDropdownModeSwitcher">
        <div class="user-dropdown-mode-label">Ver como</div>
        <label class="user-dropdown-mode-option">
          <input type="radio" name="viewMode" value="user" ${currentMode === 'user' ? 'checked' : ''} id="viewModeUser">
          <span>Consumidor</span>
        </label>
        <label class="user-dropdown-mode-option">
          <input type="radio" name="viewMode" value="developer" ${currentMode === 'developer' ? 'checked' : ''} id="viewModeDeveloper">
          <span>Desarrollador</span>
        </label>
      </div>
      <div class="user-dropdown-divider"></div>`;
    const firstDivider = dropdown.querySelector('.user-dropdown-divider');
    if (firstDivider) {
      firstDivider.insertAdjacentHTML('afterend', html);
    } else {
      dropdown.insertAdjacentHTML('beforeend', html);
    }
  }

  /**
   * Configurar listeners del switcher Consumidor / Desarrollador
   */
  setupDeveloperModeSwitcherListeners() {
    const userRadio = document.getElementById('viewModeUser');
    const devRadio = document.getElementById('viewModeDeveloper');
    if (!userRadio || !devRadio) return;

    const switchMode = async (mode) => {
      if (window.authService) {
        await window.authService.setUserMode(mode, true);
      } else {
        localStorage.setItem('userViewMode', mode);
      }
      if (mode === 'user') {
        const url = window.authService && typeof window.authService.getDefaultUserRoute === 'function'
          ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser()?.id)
          : '/settings';
        if (window.router) window.router.navigate(url, true);
        else window.location.href = url;
      } else {
        if (window.router) window.router.navigate('/dev/dashboard', true);
        else window.location.href = '/dev/dashboard';
      }
    };

    userRadio.addEventListener('change', () => { if (userRadio.checked) switchMode('user'); });
    devRadio.addEventListener('change', () => { if (devRadio.checked) switchMode('developer'); });
  }

  /**
   * Obtener cliente Supabase (supabaseService o fallback global)
   */
  async getSupabase() {
    if (window.supabaseService && typeof window.supabaseService.getClient === 'function') {
      return await window.supabaseService.getClient();
    }
    return window.supabase || null;
  }

  /**
   * Cargar información de la organización actual (nombre real y plan del owner).
   * Los créditos se leen SIEMPRE desde organization_credits en la BD (loadCreditsFromDb).
   */
  async loadOrganizationInfo() {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    try {
      if (!this.currentOrgId) {
        const nameEl = document.getElementById('navOrgName');
        const typeEl = document.getElementById('navOrgType');
        const tokensEl = document.getElementById('navTokensValue');
        if (nameEl) nameEl.textContent = 'Seleccionar organización';
        if (typeEl) typeEl.textContent = '';
        if (tokensEl) tokensEl.textContent = '—';
        const barFill = document.querySelector('.nav-org-credits-bar-fill');
        if (barFill) barFill.style.width = '0%';
        this._stopCreditsRefreshInterval();
        await this.loadOrganizationsList();
        return;
      }

      const now = Date.now();
      const cacheValid = this._orgCache && this._orgCacheId === this.currentOrgId && (now - this._orgCacheTime) < this._CACHE_TTL;

      if (!cacheValid) {
        const orgRes = await supabase.from('organizations').select('name, owner_user_id').eq('id', this.currentOrgId).single();
        let planLabel = 'Personal';
        if (orgRes.data?.owner_user_id) {
          const { data: owner } = await supabase.from('profiles').select('plan_type').eq('id', orgRes.data.owner_user_id).maybeSingle();
          if (owner?.plan_type) {
            const raw = String(owner.plan_type).replace(/_/g, ' ');
            planLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
          }
        }
        this._orgCache = { name: orgRes.data?.name, plan: planLabel, credits: 0, credits_total: 0 };
        this._orgCacheId = this.currentOrgId;
        this._orgCacheTime = Date.now();
      }
      const nameEl = document.getElementById('navOrgName');
      const typeEl = document.getElementById('navOrgType');
      if (nameEl && this._orgCache) nameEl.textContent = this._orgCache.name || '';
      if (typeEl && this._orgCache) typeEl.textContent = this._orgCache.plan || '';

      // Siempre leer créditos desde la BD (tabla organization_credits) para mostrar el valor real
      await this.loadCreditsFromDb();
      this._startCreditsRefreshInterval();
      await this.loadOrganizationsList();
    } catch (err) {
      console.error('Error loading organization info:', err);
    }
  }

  _startCreditsRefreshInterval() {
    this._stopCreditsRefreshInterval();
    if (this.currentMode !== 'user' || !this.currentOrgId) return;
    this._creditsRefreshInterval = setInterval(() => {
      if (this.currentMode === 'user' && this.currentOrgId) {
        this.loadCreditsFromDb();
      }
    }, 25000);
  }

  _stopCreditsRefreshInterval() {
    if (this._creditsRefreshInterval) {
      clearInterval(this._creditsRefreshInterval);
      this._creditsRefreshInterval = null;
    }
  }

  _applyOrgCache() {
    if (!this._orgCache) return;
    const nameEl = document.getElementById('navOrgName');
    const typeEl = document.getElementById('navOrgType');
    const tokensEl = document.getElementById('navTokensValue');
    const barFill = document.querySelector('.nav-org-credits-bar-fill');
    if (nameEl) nameEl.textContent = this._orgCache.name || '';
    if (typeEl) typeEl.textContent = this._orgCache.plan || '';
    const credits = this._orgCache.credits != null ? this._orgCache.credits : 0;
    if (tokensEl) {
      tokensEl.textContent = this._formatCreditsDisplay(credits);
    }
    if (barFill) {
      const total = this._orgCache.credits_total != null && this._orgCache.credits_total > 0 ? this._orgCache.credits_total : 1;
      const pct = Math.min(100, Math.round((credits / total) * 100));
      barFill.style.width = `${pct}%`;
    }
  }

  /**
   * Cargar lista de organizaciones del usuario (miembros + owner) y opciones Hogar / Crear nueva
   */
  async loadOrganizationsList() {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    try {
      const user = window.authService?.getCurrentUser();
      if (!user) return;

      const [membershipsRes, ownedOrgsRes] = await Promise.all([
        supabase.from('organization_members').select('organization_id, role, organizations (id, name)').eq('user_id', user.id),
        supabase.from('organizations').select('id, name').eq('owner_user_id', user.id)
      ]);
      const memberships = membershipsRes.data;
      const ownedOrgs = ownedOrgsRes.data;

      const orgsMap = new Map();
      (memberships || []).forEach(m => {
        if (m.organizations && m.organization_id) {
          orgsMap.set(m.organization_id, {
            id: m.organization_id,
            name: m.organizations.name,
            role: m.role
          });
        }
      });
      (ownedOrgs || []).forEach(o => {
        if (!orgsMap.has(o.id)) orgsMap.set(o.id, { id: o.id, name: o.name, role: 'owner' });
      });

      const listEl = document.getElementById('navOrgDropdownList');
      if (!listEl) return;

      const escape = (t) => {
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
      };

      const optionsHtml = Array.from(orgsMap.values()).map(org => {
        const name = escape(org.name || '');
        const initial = (org.name || 'O').charAt(0).toUpperCase();
        const isActive = org.id === this.currentOrgId;
        return `
        <div class="nav-org-option ${isActive ? 'active' : ''}" data-org-id="${escape(org.id)}">
          <div class="nav-org-option-avatar"><span>${initial}</span></div>
          <div class="nav-org-option-info">
            <span class="nav-org-option-name">${name}</span>
            <span class="nav-org-option-role">${org.role}</span>
          </div>
          ${isActive ? '<i class="fas fa-check"></i>' : ''}
        </div>`;
      }).join('');

      listEl.innerHTML = optionsHtml;

      listEl.querySelectorAll('.nav-org-option[data-org-id]').forEach(option => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const orgId = option.dataset.orgId;
          const orgName = option.querySelector('.nav-org-option-name')?.textContent || '';
          if (orgId && orgId !== this.currentOrgId && typeof window.getOrgPathPrefix === 'function') {
            document.getElementById('navOrgDropdown')?.classList.remove('active');
            const prefix = window.getOrgPathPrefix(orgId, orgName);
            window.router?.navigate(prefix ? `${prefix}/production` : '/settings');
          }
        });
      });

      listEl.insertAdjacentHTML('beforeend', `
        <div class="nav-org-divider"></div>
        <div class="nav-org-option nav-org-create" data-action="create-org">
          <i class="fas fa-plus"></i>
          <span>Crear nueva organización</span>
        </div>
      `);

      listEl.querySelector('.nav-org-create')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('navOrgDropdown')?.classList.remove('active');
        window.router?.navigate('/settings');
      });
    } catch (err) {
      console.error('Error loading organizations list:', err);
    }
  }

  /**
   * Cargar información del desarrollador: perfil (nombre), rol y rank
   */
  async loadDeveloperInfo() {
    const now = Date.now();
    if (this._devCache && (now - this._devCacheTime) < this._CACHE_TTL) {
      this._applyDevCache();
      return;
    }

    const supabase = await this.getSupabase();
    if (!supabase) return;

    try {
      const user = window.authService?.getCurrentUser();
      if (!user) return;

      const [profileRes, runsRes, favsRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email, dev_rank, dev_role').eq('id', user.id).maybeSingle(),
        supabase.from('flow_runs').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('user_flow_favorites').select('rating').eq('user_id', user.id).not('rating', 'is', null)
      ]);

      const profile = profileRes.data;
      const runsCount = runsRes.count ?? 0;
      const favs = favsRes.data;
      const avgRating = favs && favs.length > 0
        ? (favs.reduce((s, f) => s + (f.rating || 0), 0) / favs.length).toFixed(1)
        : null;

      this._devCache = { profile, runsCount, avgRating, userId: user.id, email: user.email };
      this._devCacheTime = Date.now();
      this._applyDevCache();
    } catch (err) {
      console.error('Error loading developer info:', err);
    }
  }

  _applyDevCache() {
    if (!this._devCache) return;
    const { profile, runsCount, avgRating, email } = this._devCache;

    const iconWrap = document.getElementById('navDevIcon');
    if (iconWrap && profile?.full_name) {
      const initials = (profile.full_name || profile.email || 'D').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      iconWrap.innerHTML = `<span class="nav-dev-initials">${initials}</span>`;
    }
    const nameEl = document.getElementById('navDevName');
    if (nameEl) nameEl.textContent = profile?.full_name?.trim() || profile?.email?.trim() || email || 'Developer Portal';

    const tierEl = document.getElementById('navDevTier');
    if (tierEl && profile) {
      const role = profile.dev_role ? String(profile.dev_role).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
      const rank = profile.dev_rank ? String(profile.dev_rank).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
      const parts = [role, rank].filter(Boolean);
      tierEl.textContent = parts.length ? parts.join(' · ') : '—';
    }

    const leadSection = document.getElementById('navLeadSection');
    if (leadSection && profile?.dev_role === 'lead') leadSection.style.display = '';

    const runsEl = document.getElementById('navRunsCount');
    if (runsEl) runsEl.textContent = runsCount;

    if (avgRating) {
      const ratingEl = document.getElementById('navRatingValue');
      if (ratingEl) ratingEl.textContent = avgRating;
    }
  }

  /**
   * Manejar logout
   */
  async handleLogout() {
    try {
      if (window.authService) {
        await window.authService.logout();
      } else {
        const supabase = await this.getSupabase();
        if (supabase) await supabase.auth.signOut();
      }
      
      localStorage.removeItem('userViewMode');
      window.router?.navigate('/', true);
    } catch (err) {
      console.error('Error en logout:', err);
    }
  }
}

// Crear instancia global
window.appNavigation = new Navigation();

// Exportar clase
window.Navigation = Navigation;
