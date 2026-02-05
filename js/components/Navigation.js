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
    if (['/living', '/brands', '/products', '/studio', '/audiences', '/marketing', '/campaigns', '/content', '/settings'].some(r => path.startsWith(r))) {
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
              <div class="user-avatar" id="userAvatar">
                <span id="userInitials">AA</span>
              </div>
              <button class="user-menu-btn" id="userMenuBtn">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        </div>
        ${this.getUserDropdownHTML(settingsHref)}
      </header>`;
  }

  /**
   * HTML para navegación de usuario SaaS (con sidebar)
   */
  getUserNavigationHTML() {
    const basePath = this.currentOrgId ? `/org/${this.currentOrgId}` : '';
    
    return `
      <!-- Overlay de navegación -->
      <div class="nav-overlay" id="navOverlay"></div>

      <!-- Header con hamburguesa -->
      <header class="app-header with-sidebar" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <button class="header-hamburger" id="headerHamburger" aria-label="Menú">
              <i class="fas fa-bars"></i>
            </button>
            <h1 class="header-title" id="headerTitle">Living</h1>
          </div>
          <div class="header-right">
            <div class="header-user" id="headerUser">
              <div class="user-avatar" id="userAvatar">
                <span id="userInitials">AA</span>
              </div>
              <button class="user-menu-btn" id="userMenuBtn">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        </div>
        ${this.getUserDropdownHTML(this.currentOrgId ? `/org/${this.currentOrgId}/settings` : '/settings')}
      </header>

      <!-- Navegación lateral - Modo Usuario SaaS -->
      <nav class="side-navigation nav-mode-user" id="sideNavigation">
        <!-- Capa superior: Identidad + Organización -->
        <div class="nav-identity-section">
          <div class="nav-identity-card" id="navIdentityCard">
            <div class="nav-identity-content">
              <div class="nav-identity-info">
                <div class="nav-org-name" id="navOrgName">Mi Organización</div>
                <div class="nav-org-type" id="navOrgType">Enterprise</div>
              </div>
              <button class="nav-org-chevron" id="navOrgChevron" aria-label="Cambiar organización">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
          
          <!-- Dropdown de organización -->
          <div class="nav-org-dropdown" id="navOrgDropdown">
            <div class="nav-org-dropdown-header">Workspaces</div>
            <div class="nav-org-dropdown-list" id="navOrgDropdownList">
              <!-- Las organizaciones se cargarán dinámicamente aquí -->
            </div>
          </div>
        </div>

        <!-- Menú Principal - Usuario SaaS -->
        <div class="nav-menu">
          <!-- Living (Dashboard principal) -->
          <div class="nav-item">
            <a href="${basePath}/living" class="nav-link" data-route="${basePath}/living" data-tooltip="Living">
              <i class="fas fa-home nav-icon"></i>
              <span class="nav-text">Living</span>
            </a>
          </div>

          <!-- Marca -->
          <div class="nav-item">
            <a href="${basePath}/brand" class="nav-link" data-route="${basePath}/brand" data-tooltip="Marca">
              <i class="fas fa-gem nav-icon"></i>
              <span class="nav-text">Marca</span>
            </a>
          </div>

          <!-- Entidades (submenu) -->
          <div class="nav-item has-submenu">
            <button class="nav-link nav-submenu-toggle" data-tooltip="Entidades">
              <i class="fas fa-boxes nav-icon"></i>
              <span class="nav-text">Entidades</span>
              <i class="fas fa-chevron-right nav-chevron"></i>
            </button>
            <div class="nav-submenu">
              <a href="${basePath}/products" class="nav-submenu-link" data-route="${basePath}/products">
                <i class="fas fa-box"></i>
                <span>Productos</span>
              </a>
              <a href="${basePath}/services" class="nav-submenu-link" data-route="${basePath}/services">
                <i class="fas fa-concierge-bell"></i>
                <span>Servicios</span>
              </a>
            </div>
          </div>

          <!-- Studio -->
          <div class="nav-item">
            <a href="${basePath}/studio" class="nav-link" data-route="${basePath}/studio" data-tooltip="Studio">
              <i class="fas fa-wand-magic-sparkles nav-icon"></i>
              <span class="nav-text">Studio</span>
            </a>
          </div>

          <!-- Audiencias -->
          <div class="nav-item">
            <a href="${basePath}/audiences" class="nav-link" data-route="${basePath}/audiences" data-tooltip="Audiencias">
              <i class="fas fa-users nav-icon"></i>
              <span class="nav-text">Audiencias</span>
            </a>
          </div>

          <!-- Marketing -->
          <div class="nav-item">
            <a href="${basePath}/marketing" class="nav-link" data-route="${basePath}/marketing" data-tooltip="Marketing">
              <i class="fas fa-bullhorn nav-icon"></i>
              <span class="nav-text">Marketing</span>
            </a>
          </div>
        </div>

        <!-- Footer del sidebar -->
        <div class="nav-footer">
          <!-- Tokens/Créditos -->
          <div class="nav-tokens" id="navTokens">
            <i class="fas fa-coins"></i>
            <span id="navTokensValue">0</span>
            <span class="nav-tokens-label">tokens</span>
          </div>
        </div>
      </nav>
    `;
  }

  /**
   * HTML para navegación de desarrollador PaaS (con sidebar)
   */
  getDeveloperNavigationHTML() {
    return `
      <!-- Overlay de navegación -->
      <div class="nav-overlay" id="navOverlay"></div>

      <!-- Header con hamburguesa -->
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
              <div class="user-avatar" id="userAvatar">
                <span id="userInitials">AA</span>
              </div>
              <button class="user-menu-btn" id="userMenuBtn">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        </div>
        ${this.getUserDropdownHTML('/settings')}
      </header>

      <!-- Navegación lateral - Modo Desarrollador PaaS -->
      <nav class="side-navigation nav-mode-developer" id="sideNavigation">
        <!-- Capa superior: Identidad de desarrollador -->
        <div class="nav-identity-section">
          <div class="nav-identity-card dev-identity" id="navIdentityCard">
            <div class="nav-identity-content">
              <div class="nav-dev-icon">
                <i class="fas fa-code"></i>
              </div>
              <div class="nav-identity-info">
                <div class="nav-org-name" id="navDevName">Developer Portal</div>
                <div class="nav-org-type" id="navDevTier">Novato</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Menú Principal - Desarrollador PaaS -->
        <div class="nav-menu">
          <!-- Dashboard -->
          <div class="nav-item">
            <a href="/dev/dashboard" class="nav-link" data-route="/dev/dashboard" data-tooltip="Dashboard">
              <i class="fas fa-chart-line nav-icon"></i>
              <span class="nav-text">Dashboard</span>
            </a>
          </div>

          <!-- Mis Flujos -->
          <div class="nav-item">
            <a href="/dev/flows" class="nav-link" data-route="/dev/flows" data-tooltip="Mis Flujos">
              <i class="fas fa-project-diagram nav-icon"></i>
              <span class="nav-text">Mis Flujos</span>
            </a>
          </div>

          <!-- Builder -->
          <div class="nav-item">
            <a href="/dev/builder" class="nav-link" data-route="/dev/builder" data-tooltip="Builder">
              <i class="fas fa-wrench nav-icon"></i>
              <span class="nav-text">Builder</span>
            </a>
          </div>

          <!-- Debug (submenu) -->
          <div class="nav-item has-submenu">
            <button class="nav-link nav-submenu-toggle" data-tooltip="Debug">
              <i class="fas fa-bug nav-icon"></i>
              <span class="nav-text">Debug</span>
              <i class="fas fa-chevron-right nav-chevron"></i>
            </button>
            <div class="nav-submenu">
              <a href="/dev/test" class="nav-submenu-link" data-route="/dev/test">
                <i class="fas fa-flask"></i>
                <span>Test de Flujos</span>
              </a>
              <a href="/dev/logs" class="nav-submenu-link" data-route="/dev/logs">
                <i class="fas fa-terminal"></i>
                <span>Logs</span>
              </a>
              <a href="/dev/webhooks" class="nav-submenu-link" data-route="/dev/webhooks">
                <i class="fas fa-link"></i>
                <span>Webhooks</span>
              </a>
            </div>
          </div>

          <!-- Colaboradores -->
          <div class="nav-item">
            <a href="/dev/collaborators" class="nav-link" data-route="/dev/collaborators" data-tooltip="Colaboradores">
              <i class="fas fa-user-friends nav-icon"></i>
              <span class="nav-text">Colaboradores</span>
            </a>
          </div>

          <!-- Marketplace -->
          <div class="nav-item">
            <a href="/dev/marketplace" class="nav-link" data-route="/dev/marketplace" data-tooltip="Marketplace">
              <i class="fas fa-store nav-icon"></i>
              <span class="nav-text">Marketplace</span>
            </a>
          </div>

          <!-- Documentación -->
          <div class="nav-item">
            <a href="/dev/docs" class="nav-link" data-route="/dev/docs" data-tooltip="Documentación">
              <i class="fas fa-book nav-icon"></i>
              <span class="nav-text">Documentación</span>
            </a>
          </div>
        </div>

        <!-- Footer del sidebar -->
        <div class="nav-footer">
          <!-- Stats de desarrollador -->
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
      
      document.addEventListener('click', () => {
        userDropdown.classList.remove('active');
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Org dropdown
    const orgChevron = document.getElementById('navOrgChevron');
    const orgDropdown = document.getElementById('navOrgDropdown');
    if (orgChevron && orgDropdown) {
      orgChevron.addEventListener('click', (e) => {
        e.stopPropagation();
        orgDropdown.classList.toggle('active');
      });
      
      document.addEventListener('click', () => {
        orgDropdown.classList.remove('active');
      });
    }

    // Navegación con History API
    document.querySelectorAll('.nav-link[data-route], .nav-submenu-link[data-route]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.dataset.route;
        if (route && window.router) {
          window.router.navigate(route);
        }
      });
    });

    // Escuchar cambios de ruta
    window.addEventListener('popstate', () => this.render());
    window.addEventListener('routechange', () => {
      this.updateActiveLink();
      this.updateHeaderTitle();
    });
  }

  /**
   * Configurar submenús
   */
  setupSubmenus() {
    document.querySelectorAll('.nav-submenu-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const parent = toggle.closest('.nav-item');
        const isOpen = parent.classList.contains('submenu-open');
        
        // Cerrar otros submenús
        document.querySelectorAll('.nav-item.submenu-open').forEach(item => {
          if (item !== parent) {
            item.classList.remove('submenu-open');
          }
        });
        
        parent.classList.toggle('submenu-open', !isOpen);
      });
    });
  }

  /**
   * Actualizar enlace activo
   */
  updateActiveLink() {
    const currentPath = window.location.pathname;
    
    document.querySelectorAll('.nav-link, .nav-submenu-link').forEach(link => {
      link.classList.remove('active');
      const route = link.dataset.route;
      if (route && currentPath.startsWith(route)) {
        link.classList.add('active');
        
        // Abrir submenú padre si existe
        const parent = link.closest('.has-submenu');
        if (parent) {
          parent.classList.add('submenu-open');
        }
      }
    });
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
      '/living': 'Living',
      '/brand': 'Marca',
      '/brands': 'Marca',
      '/products': 'Productos',
      '/studio': 'Studio',
      '/audiences': 'Audiencias',
      '/marketing': 'Marketing',
      '/campaigns': 'Campañas',
      '/content': 'Contenido',
      '/settings': 'Configuración',
      '/dev/dashboard': 'Dashboard',
      '/dev/flows': 'Mis Flujos',
      '/dev/builder': 'Builder',
      '/dev/test': 'Test de Flujos',
      '/dev/logs': 'Logs',
      '/dev/webhooks': 'Webhooks',
      '/dev/collaborators': 'Colaboradores',
      '/dev/marketplace': 'Marketplace',
      '/dev/docs': 'Documentación'
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
   * Cargar información del usuario
   */
  async loadUserInfo() {
    try {
      const user = window.authService?.getCurrentUser();
      if (!user) return;

      // Actualizar avatar e iniciales (full_name puede venir de user_profiles vía currentUser)
      const initialsEl = document.getElementById('userInitials');
      const nameEl = document.getElementById('userDropdownName');
      const emailEl = document.getElementById('userDropdownEmail');

      const displayName = user.full_name || user.user_metadata?.full_name || user.email || '';
      if (initialsEl) {
        const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
        initialsEl.textContent = initials;
      }

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
   * Cargar información de la organización actual
   */
  async loadOrganizationInfo() {
    const supabase = await this.getSupabase();
    if (!supabase || !this.currentOrgId) return;

    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('name, plan_type')
        .eq('id', this.currentOrgId)
        .single();

      if (org) {
        const nameEl = document.getElementById('navOrgName');
        const typeEl = document.getElementById('navOrgType');
        
        if (nameEl) nameEl.textContent = org.name;
        if (typeEl) typeEl.textContent = org.plan_type || 'Personal';
      }

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

      // Cargar lista de organizaciones para dropdown
      await this.loadOrganizationsList();
    } catch (err) {
      console.error('Error loading organization info:', err);
    }
  }

  /**
   * Cargar lista de organizaciones del usuario
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
            name,
            plan_type
          )
        `)
        .eq('user_id', user.id);

      const listEl = document.getElementById('navOrgDropdownList');
      if (!listEl || !memberships) return;

      listEl.innerHTML = memberships.map(m => `
        <div class="nav-org-option ${m.organization_id === this.currentOrgId ? 'active' : ''}" 
             data-org-id="${m.organization_id}">
          <div class="nav-org-option-avatar">
            <span>${m.organizations.name.charAt(0).toUpperCase()}</span>
          </div>
          <div class="nav-org-option-info">
            <span class="nav-org-option-name">${m.organizations.name}</span>
            <span class="nav-org-option-role">${m.role}</span>
          </div>
          ${m.organization_id === this.currentOrgId ? '<i class="fas fa-check"></i>' : ''}
        </div>
      `).join('');

      // Event listeners para cambiar organización
      listEl.querySelectorAll('.nav-org-option').forEach(option => {
        option.addEventListener('click', () => {
          const orgId = option.dataset.orgId;
          if (orgId !== this.currentOrgId) {
            window.router?.navigate(`/org/${orgId}/living`);
          }
        });
      });

      // Agregar opción de ir a Hogar
      listEl.insertAdjacentHTML('beforeend', `
        <div class="nav-org-divider"></div>
        <div class="nav-org-option nav-org-home" data-action="home">
          <i class="fas fa-home"></i>
          <span>Volver a Hogar</span>
        </div>
      `);

      listEl.querySelector('.nav-org-home')?.addEventListener('click', () => {
        window.router?.navigate('/hogar');
      });
    } catch (err) {
      console.error('Error loading organizations list:', err);
    }
  }

  /**
   * Cargar información del desarrollador
   */
  async loadDeveloperInfo() {
    if (!window.supabase) return;

    try {
      const user = window.authService?.getCurrentUser();
      if (!user) return;

      // user_profiles (schema: dev_rank, dev_role; no developer_tier)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('dev_rank, dev_role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        const tierEl = document.getElementById('navDevTier');
        if (tierEl) {
          const label = profile.dev_rank || profile.dev_role || 'Novato';
          tierEl.textContent = typeof label === 'string' ? label : 'Novato';
        }
      }

      const { count: runsCount } = await supabase
        .from('flow_runs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const runsEl = document.getElementById('navRunsCount');
      if (runsEl) runsEl.textContent = runsCount ?? 0;

      // content_flows no tiene columna rating; el rating está en user_flow_favorites
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
window.navigation = new Navigation();

// Exportar clase
window.Navigation = Navigation;
