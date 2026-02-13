/**
 * Sidebar usuario consumidor — Schema final (Zona 1: navegación workspace, Zona 2: footer organizacional).
 * Estructura: main[] (Actividad, Estudio, Catálogo, Identidad) + footer[] (Configuración, Planes, Créditos, Salir).
 */
const SIDEBAR_USER_CONFIG = {
  main: [
    { type: 'page', id: 'activity', label: 'Actividad', icon: 'fa-chart-line', route: 'living' },
    { type: 'page', id: 'studio', label: 'Estudio', icon: 'fa-wand-magic-sparkles', route: 'studio' },
    {
      type: 'container',
      id: 'catalog',
      label: 'Catálogo',
      icon: 'fa-th-large',
      children: [
        { label: 'Posts', route: 'studio/catalog' },
        { label: 'Reels', route: 'studio/catalog' },
        { label: 'Stories', route: 'studio/catalog' },
        { label: 'Ads', route: 'studio/catalog' },
        { label: 'Templates', route: 'studio/catalog' },
        { label: 'Videos', route: 'studio/catalog' }
      ]
    },
    {
      type: 'container',
      id: 'identity',
      label: 'Identidad',
      icon: 'fa-layer-group',
      children: [
        { label: 'Marca', route: 'brand' },
        { label: 'Productos', route: 'products' },
        { label: 'Servicios', route: 'products' },
        { label: 'Audiencias', route: 'audiences' },
        { label: 'Campañas', route: 'campaigns' },
        { label: 'Assets', route: 'content' },
        { label: 'Reglas IA', route: 'brand' }
      ]
    }
  ],
  footer: [
    { label: 'Configuración', icon: 'fa-cog', route: 'settings' },
    { label: 'Esta organización', icon: 'fa-building', route: 'organization' },
    { label: 'Planes', icon: 'fa-credit-card', route: 'planes' },
    { label: 'Créditos', icon: 'fa-coins', route: 'credits' },
    { label: 'Salir de la organización', icon: 'fa-sign-out-alt', action: 'leaveWorkspace' }
  ]
};

const SIDEBAR_USER_EXPANDED_KEY = 'sidebarUserExpanded';

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
 * - /home, /hogar: Solo header (sin sidebar)
 * - /org/:org_id/...: Sidebar de organización (SaaS)
 * - /dev/...: Sidebar de desarrollador (PaaS)
 * - Rutas públicas (/, /login, /planes): Sin navegación
 */
class Navigation {
  constructor() {
    this.container = document.getElementById('navigation-container');
    this.isNavOpen = false;
    this.isCollapsed = false;
    this.initialized = false;
    this.currentMode = null; // 'user' | 'developer' | 'home' | null
    this.currentOrgId = null;
    this.currentBrandId = null;
  }

  /**
   * Determinar el tipo de layout según la ruta
   * @returns {Object} { mode, showSidebar, showHeader, orgId, brandId }
   */
  getLayoutConfig() {
    const path = window.location.pathname || '/';
    
    // Rutas públicas - sin navegación
    if (path === '/' || path === '/login' || path === '/planes' || path === '/index.html') {
      return { mode: null, showSidebar: false, showHeader: false, orgId: null, brandId: null };
    }
    
    // Home/Hogar - solo header sin sidebar
    if (path === '/home' || path === '/hogar') {
      return { mode: 'home', showSidebar: false, showHeader: true, orgId: null, brandId: null };
    }
    
    // Rutas de desarrollador /dev/*
    if (path.startsWith('/dev')) {
      return { mode: 'developer', showSidebar: true, showHeader: true, orgId: null, brandId: null };
    }
    
    // Rutas de organización /org/:org_id/*
    const orgMatch = path.match(/^\/org\/([^\/]+)/);
    if (orgMatch) {
      const orgId = orgMatch[1];
      const brandMatch = path.match(/^\/org\/[^\/]+\/(?:brand|products|product-detail)\/([^\/]+)/);
      const brandId = brandMatch ? brandMatch[1] : null;
      return { mode: 'user', showSidebar: true, showHeader: true, orgId, brandId };
    }
    
    // Rutas legacy sin /org/ - tratar como usuario pero sin org_id
    // Esto mantiene compatibilidad temporal
    if (['/living', '/brands', '/products', '/studio', '/audiences', '/marketing', '/campaigns', '/content', '/settings', '/organization'].some(r => path.startsWith(r))) {
      return { mode: 'user', showSidebar: true, showHeader: true, orgId: null, brandId: null };
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

    // Si el modo no ha cambiado y ya está inicializado, solo actualizar enlaces activos
    if (this.initialized && this.currentMode === config.mode && this.currentOrgId === config.orgId) {
      this.updateActiveLink();
      return;
    }

    this.currentMode = config.mode;
    this.currentOrgId = config.orgId;
    this.currentBrandId = config.brandId;

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
   * @param {string} settingsHref - URL de configuración (/settings o /org/:id/settings)
   */
  getUserDropdownHTML(settingsHref = '/settings') {
    return `
      <div class="user-dropdown" id="userDropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name" id="userDropdownName">Usuario</div>
          <div class="user-dropdown-email" id="userDropdownEmail">usuario@email.com</div>
        </div>
        <div class="user-dropdown-divider"></div>
        <a href="${settingsHref}" class="user-dropdown-item">
          <i class="fas fa-cog"></i>
          <span>Configuración</span>
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
    const settingsHref = this.currentOrgId ? `/org/${this.currentOrgId}/settings` : '/settings';
    return `
      <header class="app-header header-only" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <div class="header-logo">
              <span class="logo-text">AI SMART CONTENT</span>
            </div>
          </div>
          <div class="header-right">
            <div class="header-user" id="headerUser">
              <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
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
    const basePath = this.currentOrgId ? `/org/${this.currentOrgId}` : '';
    const globalRoutes = { planes: '/planes', credits: '/credits' };
    if (globalRoutes[routeSuffix]) return globalRoutes[routeSuffix];
    if (basePath) return `${basePath}/${routeSuffix}`;
    const legacy = { brand: '/brands', settings: '/settings' };
    return legacy[routeSuffix] || `/${routeSuffix}`;
  }

  /**
   * HTML para navegación de usuario SaaS.
   * Zona 1: WorkspaceHeader + NavigationMain (Actividad, Estudio, Catálogo, Identidad).
   * Zona 2: NavigationFooter anclado (Configuración, Planes, Créditos, Salir).
   */
  getUserNavigationHTML() {
    const basePath = this.currentOrgId ? `/org/${this.currentOrgId}` : '';
    const full = (suffix) => this.getUserSidebarRoute(suffix);
    const expandedId = localStorage.getItem(SIDEBAR_USER_EXPANDED_KEY) || '';

    const mainHTML = SIDEBAR_USER_CONFIG.main.map((item) => {
      if (item.type === 'page') {
        const href = full(item.route);
        return `
          <div class="nav-item">
            <a href="${href}" class="nav-link nav-main-link" data-route="${href}" data-tooltip="${item.label}">
              <i class="fas ${item.icon} nav-icon"></i>
              <span class="nav-text">${item.label}</span>
            </a>
          </div>`;
      }
      const isOpen = expandedId === item.id;
      const children = (item.children || [])
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
            <i class="fas ${item.icon} nav-icon"></i>
            <span class="nav-text">${item.label}</span>
            <i class="fas fa-chevron-right nav-chevron" aria-hidden="true"></i>
          </button>
          <div class="nav-submenu" id="nav-sub-${item.id}" role="group" aria-label="${item.label}">
            ${children}
          </div>
        </div>`;
    }).join('');

    const footerHTML = SIDEBAR_USER_CONFIG.footer.map((f) => {
      if (f.action === 'leaveWorkspace') {
        return `
          <button type="button" class="nav-footer-link nav-footer-action" data-action="leaveWorkspace" data-tooltip="${f.label}">
            <i class="fas ${f.icon} nav-icon"></i>
            <span class="nav-text">${f.label}</span>
          </button>`;
      }
      const href = full(f.route);
      return `
        <a href="${href}" class="nav-footer-link" data-route="${href}" data-tooltip="${f.label}">
          <i class="fas ${f.icon} nav-icon"></i>
          <span class="nav-text">${f.label}</span>
        </a>`;
    }).join('');

    return `
      <div class="nav-overlay" id="navOverlay"></div>

      <header class="app-header with-sidebar" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <button class="header-hamburger" id="headerHamburger" aria-label="Menú">
              <i class="fas fa-bars"></i>
            </button>
            <h1 class="header-title" id="headerTitle">Actividad</h1>
          </div>
          <div class="header-right">
            <div class="header-user" id="headerUser">
              <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        </div>
        ${this.getUserDropdownHTML(this.currentOrgId ? `${basePath}/settings` : '/settings')}
      </header>

      <nav class="side-navigation nav-mode-user" id="sideNavigation" aria-label="Navegación principal">
        <div class="nav-workspace-header nav-identity-section" id="navWorkspaceHeader">
          <div class="nav-identity-card" id="navIdentityCard">
            <div class="nav-identity-content">
              <i class="fas fa-building nav-collapsed-only-icon" aria-hidden="true"></i>
              <div class="nav-identity-info">
                <div class="nav-org-name" id="navOrgName">Mi Organización</div>
                <div class="nav-org-type" id="navOrgType">Enterprise</div>
              </div>
              <button class="nav-org-chevron" id="navOrgChevron" aria-label="Cambiar organización">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
          <div class="nav-org-dropdown" id="navOrgDropdown">
            <div class="nav-org-dropdown-header">Workspaces</div>
            <div class="nav-org-dropdown-list" id="navOrgDropdownList"></div>
          </div>
        </div>

        <div class="nav-menu" role="navigation" aria-label="Navegación del workspace">
          ${mainHTML}
        </div>

        <div class="nav-spacer" aria-hidden="true"></div>

        <div class="nav-footer" role="navigation" aria-label="Administración organizacional">
          ${footerHTML}
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
            <button class="header-hamburger" id="headerHamburger" aria-label="Menú">
              <i class="fas fa-bars"></i>
            </button>
            <h1 class="header-title" id="headerTitle">Developer Portal</h1>
          </div>
          <div class="header-right">
            <div class="header-user" id="headerUser">
              <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        </div>
        ${this.getUserDropdownHTML('/settings')}
      </header>

      <nav class="side-navigation nav-mode-developer" id="sideNavigation" aria-label="Navegación desarrollador">
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
      window.router?.navigate('/hogar');
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
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    // Hamburger: en móvil abre/cierra overlay; en desktop colapsa/expande sidebar
    const hamburger = document.getElementById('headerHamburger');
    if (hamburger) {
      hamburger.addEventListener('click', () => {
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

    // Org dropdown: clic en toda la casilla (incl. chevron) abre/cierra la lista
    const orgIdentityCard = document.getElementById('navIdentityCard');
    const orgDropdown = document.getElementById('navOrgDropdown');
    if (orgIdentityCard && orgDropdown) {
      orgIdentityCard.addEventListener('click', (e) => {
        e.stopPropagation();
        orgDropdown.classList.toggle('active');
      });
      orgIdentityCard.style.cursor = 'pointer';
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

    // Navegación con History API (main, submenu y footer)
    document.querySelectorAll('.nav-link[data-route], .nav-main-link[data-route], .nav-submenu-link[data-route], .nav-footer-link[data-route]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.dataset.route;
        if (route && window.router) window.router.navigate(route);
      });
    });

    // Salir de la organización: modal de confirmación
    document.querySelectorAll('.nav-footer-action[data-action="leaveWorkspace"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showLeaveWorkspaceConfirm();
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

    document.querySelectorAll('.nav-mode-user .nav-submenu-toggle').forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        const parent = toggle.closest('.nav-item.has-submenu');
        if (!parent) return;
        handleContainerClick(e, toggle, parent, true);
      });
    });

    document.querySelectorAll('.nav-mode-developer .nav-submenu-toggle').forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        const parent = toggle.closest('.nav-item.has-submenu');
        if (!parent) return;
        handleContainerClick(e, toggle, parent, false);
      });
    });

    /* Collapsed: hover 120ms abre flyout; leave 200ms cierra (cancelado si entra al flyout) */
    document.querySelectorAll('.nav-mode-user .nav-submenu-toggle, .nav-mode-developer .nav-submenu-toggle').forEach((toggle) => {
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
      flyout.classList.remove('open');
      flyout.setAttribute('aria-hidden', 'true');
    }
    this._flyoutOpen = false;
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

    sidebar.querySelectorAll('[data-tooltip]').forEach((el) => {
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
    if (!this._routeChangeCloseFlyout) {
      this._routeChangeCloseFlyout = true;
      window.addEventListener('routechange', () => this.closeFlyout());
      window.addEventListener('popstate', () => this.closeFlyout());
    }
  }

  /**
   * Actualizar enlace activo.
   * Solo se marca activo el enlace con la ruta más específica (más larga) que coincida,
   * para evitar que /studio y /studio/catalog queden ambos activos.
   */
  updateActiveLink() {
    const currentPath = window.location.pathname;
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
    // Normalizar: quitar prefijo /org/:id para comparar segmento de vista
    const pathWithoutOrg = path.replace(/^\/org\/[^/]+/, '') || '/';

    const titles = {
      '/hogar': 'Hogar',
      '/home': 'Hogar',
      '/living': 'Actividad',
      '/brand': 'Identidad',
      '/brands': 'Identidad',
      '/products': 'Identidad',
      '/product-detail': 'Identidad',
      '/studio/catalog': 'Catálogo',
      '/studio': 'Estudio',
      '/audiences': 'Identidad',
      '/marketing': 'Identidad',
      '/campaigns': 'Identidad',
      '/content': 'Identidad',
      '/settings': 'Configuración',
      '/organization': 'Esta organización',
      '/planes': 'Planes',
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
   * Modal de confirmación para Salir de la organización. Navega a /hogar (selector de workspace).
   */
  showLeaveWorkspaceConfirm() {
    const msg = '¿Salir de la organización? Volverás al inicio para elegir otro workspace.';
    if (!window.confirm(msg)) return;
    this.closeMobileNav();
    if (window.router) window.router.navigate('/hogar');
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
      if (window.router) {
        if (mode === 'user') {
          window.router.navigate('/hogar');
        } else {
          window.router.navigate('/dev/dashboard');
        }
      } else {
        window.location.href = mode === 'user' ? '/hogar' : '/dev/dashboard';
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
   * Cargar información de la organización actual (nombre real y plan del owner)
   */
  async loadOrganizationInfo() {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    try {
      const nameEl = document.getElementById('navOrgName');
      const typeEl = document.getElementById('navOrgType');

      if (this.currentOrgId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, owner_user_id')
          .eq('id', this.currentOrgId)
          .single();

        if (org) {
          if (nameEl) nameEl.textContent = org.name;
          let planLabel = 'Personal';
          if (org.owner_user_id) {
            const { data: owner } = await supabase
              .from('users')
              .select('plan_type')
              .eq('id', org.owner_user_id)
              .maybeSingle();
            if (owner && owner.plan_type) {
              const raw = String(owner.plan_type).replace(/_/g, ' ');
              planLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
            }
          }
          if (typeEl) typeEl.textContent = planLabel;
        }
      } else {
        if (nameEl) nameEl.textContent = 'Seleccionar organización';
        if (typeEl) typeEl.textContent = '';
      }

      if (this.currentOrgId) {
        const { data: credits } = await supabase
          .from('organization_credits')
          .select('credits_available')
          .eq('organization_id', this.currentOrgId)
          .single();

        if (credits) {
          const tokensEl = document.getElementById('navTokensValue');
          if (tokensEl) {
            const formatted = credits.credits_available >= 1000
              ? `${(credits.credits_available / 1000).toFixed(1)}K`
              : credits.credits_available;
            tokensEl.textContent = formatted;
          }
        }
      }

      await this.loadOrganizationsList();
    } catch (err) {
      console.error('Error loading organization info:', err);
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

      const { data: memberships } = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name
          )
        `)
        .eq('user_id', user.id);

      const { data: ownedOrgs } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('owner_user_id', user.id);

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
          if (orgId && orgId !== this.currentOrgId) {
            document.getElementById('navOrgDropdown')?.classList.remove('active');
            window.router?.navigate(`/org/${orgId}/living`);
          }
        });
      });

      listEl.insertAdjacentHTML('beforeend', `
        <div class="nav-org-divider"></div>
        <div class="nav-org-option nav-org-home" data-action="home">
          <i class="fas fa-home"></i>
          <span>Volver a Hogar</span>
        </div>
        <div class="nav-org-option nav-org-create" data-action="create-org">
          <i class="fas fa-plus"></i>
          <span>Crear nueva organización</span>
        </div>
      `);

      listEl.querySelector('.nav-org-home')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('navOrgDropdown')?.classList.remove('active');
        window.router?.navigate('/hogar');
      });

      listEl.querySelector('.nav-org-create')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('navOrgDropdown')?.classList.remove('active');
        window.router?.navigate('/hogar');
      });
    } catch (err) {
      console.error('Error loading organizations list:', err);
    }
  }

  /**
   * Cargar información del desarrollador: perfil (nombre), rol y rank
   */
  async loadDeveloperInfo() {
    const supabase = await this.getSupabase();
    if (!supabase) return;

    try {
      const user = window.authService?.getCurrentUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, email, dev_rank, dev_role, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      const iconWrap = document.getElementById('navDevIcon');
      if (iconWrap && profile?.avatar_url) {
        iconWrap.innerHTML = `<img class="nav-dev-avatar" src="${profile.avatar_url}" alt="" />`;
      }

      const nameEl = document.getElementById('navDevName');
      const tierEl = document.getElementById('navDevTier');
      if (nameEl) {
        const name = profile?.full_name?.trim() || profile?.email?.trim() || user.email || 'Developer Portal';
        nameEl.textContent = name;
      }
      if (tierEl && profile) {
        const role = profile.dev_role ? String(profile.dev_role).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
        const rank = profile.dev_rank ? String(profile.dev_rank).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
        const parts = [role, rank].filter(Boolean);
        tierEl.textContent = parts.length ? parts.join(' · ') : '—';
      }

      const leadSection = document.getElementById('navLeadSection');
      if (leadSection && profile?.dev_role === 'lead') {
        leadSection.style.display = '';
      }

      const { count: runsCount } = await supabase
        .from('flow_runs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const runsEl = document.getElementById('navRunsCount');
      if (runsEl) runsEl.textContent = runsCount ?? 0;

      const { data: favs } = await supabase
        .from('user_flow_favorites')
        .select('rating')
        .eq('user_id', user.id)
        .not('rating', 'is', null);

      if (favs && favs.length > 0) {
        const avgRating = favs.reduce((sum, f) => sum + (f.rating || 0), 0) / favs.length;
        const ratingEl = document.getElementById('navRatingValue');
        if (ratingEl) ratingEl.textContent = avgRating.toFixed(1);
      }
    } catch (err) {
      console.error('Error loading developer info:', err);
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
