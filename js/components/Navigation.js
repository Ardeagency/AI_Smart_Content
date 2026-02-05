/**
 * Navigation Component - Componente de navegación lateral persistente
 * Maneja el sidebar y la navegación de la aplicación
 * 
 * Soporta dos modos de navegación (MPA + SPA):
 * - 'user': Navegación para usuarios SaaS (consumidores de contenido)
 * - 'developer': Navegación para desarrolladores PaaS (constructores de flujos)
 */
class Navigation {
  constructor() {
    this.container = document.getElementById('navigation-container');
    this.isNavOpen = false;
    this.isCollapsed = false;
    this.initialized = false;
    this.currentMode = 'user'; // 'user' | 'developer'
  }

  /**
   * Renderizar el componente de navegación
   * Detecta automáticamente el modo según la ruta o preferencia del usuario
   */
  async render() {
    if (this.initialized) {
      return;
    }

    if (!this.container) {
      console.error('❌ Navigation container no encontrado');
      return;
    }

    // Detectar modo basado en la ruta actual o preferencia del usuario
    this.currentMode = this.detectNavigationMode();

    // Renderizar HTML del sidebar según el modo
    this.container.innerHTML = this.getNavigationHTML();

    // Inicializar
    this.initializeSidebar();
    this.setupEventListeners();
    this.setupSubmenus();
    this.updateActiveLink();

    // Cargar información del usuario si está autenticado
    await this.loadUserInfo();

    // Cargar información según el modo
    if (this.currentMode === 'developer') {
      await this.loadDeveloperInfo();
    } else {
      await this.loadOrganizationInfo();
    }

    this.initialized = true;
    console.log(`✅ Navigation component renderizado en modo: ${this.currentMode}`);
  }

  /**
   * Detectar el modo de navegación
   * @returns {'user' | 'developer'}
   */
  detectNavigationMode() {
    // Prioridad 1: Verificar si estamos en ruta de desarrollador
    const currentPath = window.location.pathname || '/';
    if (currentPath.startsWith('/dev')) {
      return 'developer';
    }

    // Prioridad 2: Usar AuthService para obtener el modo del usuario
    if (window.authService && typeof window.authService.getUserMode === 'function') {
      return window.authService.getUserMode();
    }

    // Prioridad 3: Verificar localStorage
    const savedMode = localStorage.getItem('userViewMode');
    if (savedMode === 'developer') {
      return 'developer';
    }

    return 'user';
  }

  /**
   * Cambiar el modo de navegación y re-renderizar
   * @param {'user' | 'developer'} mode
   */
  async switchMode(mode) {
    if (mode !== this.currentMode) {
      this.currentMode = mode;
      this.initialized = false;
      await this.render();
    }
  }

  /**
   * Obtener HTML del sidebar según el modo actual
   */
  getNavigationHTML() {
    if (this.currentMode === 'developer') {
      return this.getDeveloperNavigationHTML();
    }
    return this.getUserNavigationHTML();
  }

  /**
   * Obtener HTML del sidebar para usuarios SaaS (consumidores)
   */
  getUserNavigationHTML() {
    return `
      <!-- Overlay de navegación -->
      <div class="nav-overlay" id="navOverlay"></div>

      <!-- Navegación lateral - Modo Usuario SaaS -->
      <nav class="side-navigation nav-mode-user" id="sideNavigation">
        <!-- Capa superior: Identidad + Organización -->
        <div class="nav-identity-section">
          <div class="nav-identity-card" id="navIdentityCard">
            <div class="nav-identity-content">
              <div class="nav-identity-info">
                <div class="nav-org-name" id="navOrgName">Mi Organización</div>
                <div class="nav-org-type" id="navOrgType">Personal</div>
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
            <a href="/living" class="nav-link" data-route="/living" data-tooltip="Living">
              <i class="fas fa-home nav-icon"></i>
              <span class="nav-text">Living</span>
            </a>
          </div>

          <!-- Marca -->
          <div class="nav-item">
            <a href="/brands" class="nav-link" data-route="/brands" data-tooltip="Marca">
              <i class="fas fa-palette nav-icon"></i>
              <span class="nav-text">Marca</span>
            </a>
          </div>

          <!-- Entidades (con submenú) -->
          <div class="nav-item nav-item-has-submenu" data-submenu="entidades">
            <div class="nav-link nav-link-parent" data-tooltip="Entidades">
              <i class="fas fa-cube nav-icon"></i>
              <span class="nav-text">Entidades</span>
              <i class="fas fa-chevron-right nav-chevron"></i>
            </div>
            <div class="nav-submenu" id="navSubmenuEntidades">
              <div class="nav-submenu-item">
                <a href="/products" class="nav-link nav-link-sub" data-route="/products" data-tooltip="Productos">
                  <span class="nav-text">Productos</span>
                </a>
              </div>
              <div class="nav-submenu-item">
                <a href="/services" class="nav-link nav-link-sub" data-route="/services" data-tooltip="Servicios">
                  <span class="nav-text">Servicios</span>
                </a>
              </div>
              <div class="nav-submenu-item">
                <a href="/sedes" class="nav-link nav-link-sub" data-route="/sedes" data-tooltip="Sedes">
                  <span class="nav-text">Sedes</span>
                </a>
              </div>
            </div>
          </div>

          <!-- Studio (Generación de contenido) -->
          <div class="nav-item">
            <a href="/studio" class="nav-link" data-route="/studio" data-tooltip="Studio">
              <i class="fas fa-wand-magic-sparkles nav-icon"></i>
              <span class="nav-text">Studio</span>
            </a>
          </div>

          <!-- Audiencias -->
          <div class="nav-item">
            <a href="/audiences" class="nav-link" data-route="/audiences" data-tooltip="Audiencias">
              <i class="fas fa-users nav-icon"></i>
              <span class="nav-text">Audiencias</span>
            </a>
          </div>

          <!-- Marketing -->
          <div class="nav-item">
            <a href="/campaigns" class="nav-link" data-route="/campaigns" data-tooltip="Marketing">
              <i class="fas fa-bullhorn nav-icon"></i>
              <span class="nav-text">Marketing</span>
            </a>
          </div>
        </div>

        <!-- Separador -->
        <div class="nav-separator"></div>

        <!-- Sección inferior: Créditos y Modo -->
        <div class="nav-footer">
          <!-- Indicador de créditos -->
          <div class="nav-credits-indicator" id="navCreditsIndicator">
            <i class="fas fa-coins"></i>
            <span id="navCreditsCount">0</span>
            <span class="nav-credits-label">tokens</span>
          </div>
          
          <!-- Cambiar a modo desarrollador (si está disponible) -->
          <button class="nav-mode-switch" id="navModeSwitchBtn" title="Cambiar a modo Desarrollador">
            <i class="fas fa-code"></i>
            <span class="nav-text">Modo Dev</span>
          </button>
        </div>
      </nav>
    `;
  }

  /**
   * Obtener HTML del sidebar para desarrolladores PaaS
   */
  getDeveloperNavigationHTML() {
    return `
      <!-- Overlay de navegación -->
      <div class="nav-overlay" id="navOverlay"></div>

      <!-- Navegación lateral - Modo Desarrollador PaaS -->
      <nav class="side-navigation nav-mode-developer" id="sideNavigation">
        <!-- Capa superior: Identidad de desarrollador -->
        <div class="nav-identity-section nav-dev-identity">
          <div class="nav-identity-card" id="navIdentityCard">
            <div class="nav-identity-content">
              <div class="nav-identity-info">
                <div class="nav-org-name" id="navDevName">Developer Portal</div>
                <div class="nav-org-type nav-dev-rank" id="navDevRank">Novice</div>
              </div>
              <div class="nav-dev-badge">
                <i class="fas fa-code"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- Menú Principal - Desarrollador PaaS -->
        <div class="nav-menu">
          <!-- Dashboard de desarrollador -->
          <div class="nav-item">
            <a href="/dev/dashboard" class="nav-link" data-route="/dev/dashboard" data-tooltip="Dashboard">
              <i class="fas fa-chart-line nav-icon"></i>
              <span class="nav-text">Dashboard</span>
            </a>
          </div>

          <!-- Mis Flujos de IA -->
          <div class="nav-item">
            <a href="/dev/flows" class="nav-link" data-route="/dev/flows" data-tooltip="Mis Flujos">
              <i class="fas fa-diagram-project nav-icon"></i>
              <span class="nav-text">Mis Flujos</span>
            </a>
          </div>

          <!-- Flow Builder -->
          <div class="nav-item">
            <a href="/dev/builder" class="nav-link" data-route="/dev/builder" data-tooltip="Builder">
              <i class="fas fa-hammer nav-icon"></i>
              <span class="nav-text">Builder</span>
            </a>
          </div>

          <!-- Logs y Debug -->
          <div class="nav-item nav-item-has-submenu" data-submenu="dev-debug">
            <div class="nav-link nav-link-parent" data-tooltip="Debug">
              <i class="fas fa-bug nav-icon"></i>
              <span class="nav-text">Debug</span>
              <i class="fas fa-chevron-right nav-chevron"></i>
            </div>
            <div class="nav-submenu" id="navSubmenuDevDebug">
              <div class="nav-submenu-item">
                <a href="/dev/logs" class="nav-link nav-link-sub" data-route="/dev/logs" data-tooltip="Logs">
                  <span class="nav-text">Logs</span>
                </a>
              </div>
              <div class="nav-submenu-item">
                <a href="/dev/runs" class="nav-link nav-link-sub" data-route="/dev/runs" data-tooltip="Ejecuciones">
                  <span class="nav-text">Ejecuciones</span>
                </a>
              </div>
              <div class="nav-submenu-item">
                <a href="/dev/webhooks" class="nav-link nav-link-sub" data-route="/dev/webhooks" data-tooltip="Webhooks">
                  <span class="nav-text">Webhooks</span>
                </a>
              </div>
            </div>
          </div>

          <!-- Colaboradores -->
          <div class="nav-item">
            <a href="/dev/collaborators" class="nav-link" data-route="/dev/collaborators" data-tooltip="Colaboradores">
              <i class="fas fa-users-gear nav-icon"></i>
              <span class="nav-text">Colaboradores</span>
            </a>
          </div>

          <!-- Marketplace (flujos publicados) -->
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

        <!-- Separador -->
        <div class="nav-separator"></div>

        <!-- Sección inferior: Stats y Modo -->
        <div class="nav-footer">
          <!-- Estadísticas del desarrollador -->
          <div class="nav-dev-stats" id="navDevStats">
            <div class="nav-dev-stat">
              <i class="fas fa-play"></i>
              <span id="navDevRunCount">0</span>
            </div>
            <div class="nav-dev-stat">
              <i class="fas fa-star"></i>
              <span id="navDevRating">0.0</span>
            </div>
          </div>
          
          <!-- Cambiar a modo usuario -->
          <button class="nav-mode-switch" id="navModeSwitchBtn" title="Cambiar a modo Usuario">
            <i class="fas fa-user"></i>
            <span class="nav-text">Modo User</span>
          </button>
        </div>
      </nav>
    `;
  }

  /**
   * Inicializar sidebar
   */
  initializeSidebar() {
    // En desktop, el sidebar está siempre abierto
    if (window.innerWidth > 768) {
      const sideNavigation = document.getElementById('sideNavigation');
      if (sideNavigation) {
        sideNavigation.classList.add('active');
        this.isNavOpen = true;
      }
    }
    
    // Cargar estado colapsado desde localStorage
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
      this.isCollapsed = true;
      const sideNavigation = document.getElementById('sideNavigation');
      if (sideNavigation) {
        sideNavigation.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
        // Actualizar icono del header si está colapsado
        const headerSidebarToggle = document.getElementById('headerSidebarToggle');
        if (headerSidebarToggle) {
          const icon = headerSidebarToggle.querySelector('i');
          if (icon) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-chevron-right');
          }
        }
      }
    }
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const navOverlay = document.getElementById('navOverlay');
    const navToggleBtn = document.getElementById('navToggleBtn');
    const navLinks = document.querySelectorAll('.nav-link');
    const navOrgChevron = document.getElementById('navOrgChevron');

    // Hamburger menu toggle - solo funciona en móvil
    if (hamburgerMenu) {
      hamburgerMenu.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          this.toggleNavigation();
        }
      });
    }

    // Overlay click - cerrar en móvil
    if (navOverlay) {
      navOverlay.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          this.closeNavigation();
        }
        // Cerrar dropdowns al hacer click en overlay
        this.closeAllDropdowns();
      });
    }

    // Toggle button del header - colapsar/expandir en desktop
    const headerSidebarToggle = document.getElementById('headerSidebarToggle');
    if (headerSidebarToggle) {
      headerSidebarToggle.addEventListener('click', () => {
        if (window.innerWidth > 768) {
          this.toggleSidebarCollapse();
        } else {
          // En móvil, toggle normal
          this.toggleNavigation();
        }
      });
    }
    
    // Mantener compatibilidad con navToggleBtn si existe (para transición)
    if (navToggleBtn) {
      navToggleBtn.addEventListener('click', () => {
        if (window.innerWidth > 768) {
          this.toggleSidebarCollapse();
        }
      });
    }

    // Organization dropdown toggle
    if (navOrgChevron) {
      navOrgChevron.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleOrgDropdown();
      });
    }

    // Mode switch button (cambiar entre usuario y desarrollador)
    const modeSwitchBtn = document.getElementById('navModeSwitchBtn');
    if (modeSwitchBtn) {
      modeSwitchBtn.addEventListener('click', () => this.handleModeSwitch());
    }

    // Cargar créditos si estamos en modo usuario
    if (this.currentMode === 'user') {
      this.loadCreditsInfo();
    }

    // Navigation links - usar router
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        // Si es un link padre con submenú, toggle el submenú
        if (link.classList.contains('nav-link-parent')) {
          e.preventDefault();
          const parentItem = link.closest('.nav-item-has-submenu');
          if (parentItem) {
            this.toggleSubmenu(parentItem);
          }
          return;
        }
        
        // Para links normales y subitems
        e.preventDefault();
        const route = link.dataset.route;
        if (route && window.router) {
          window.router.navigate(route);
        }
        // Cerrar navegación en móvil después de click
        if (window.innerWidth <= 768) {
          this.closeNavigation();
        }
        // Cerrar dropdowns
        this.closeAllDropdowns();
      });
    });
    
    // Setup submenus
    this.setupSubmenus();

    // Setup tooltips para estado colapsado
    this.setupTooltips();

    // Cerrar dropdowns al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-identity-section')) {
        this.closeAllDropdowns();
      }
    });

    // Close nav on escape key - solo en móvil
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isNavOpen && window.innerWidth <= 768) {
        this.closeNavigation();
      }
      if (e.key === 'Escape') {
        this.closeAllDropdowns();
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        // En desktop, siempre abierto
        const sideNavigation = document.getElementById('sideNavigation');
        if (sideNavigation) {
          sideNavigation.classList.add('active');
          this.isNavOpen = true;
        }
        // Ocultar overlay en desktop
        const navOverlay = document.getElementById('navOverlay');
        if (navOverlay) {
          navOverlay.classList.remove('active');
        }
      } else {
        // En móvil, cerrar por defecto
        this.closeNavigation();
      }
      // Cerrar dropdowns al redimensionar
      this.closeAllDropdowns();
    });

    // Escuchar cambios de ruta para actualizar link activo (con debounce)
    const updateLinkDebounced = window.Performance 
      ? window.Performance.debounce(() => this.updateActiveLink(), 100)
      : () => this.updateActiveLink();
    
    // Usar popstate para History API
    window.addEventListener('popstate', updateLinkDebounced);
    // También escuchar cuando el router navega programáticamente
    window.addEventListener('routechange', updateLinkDebounced);
  }

  /**
   * Manejar cambio de modo (usuario ↔ desarrollador)
   */
  async handleModeSwitch() {
    const newMode = this.currentMode === 'user' ? 'developer' : 'user';
    
    // Actualizar modo en AuthService
    if (window.authService && typeof window.authService.setUserMode === 'function') {
      await window.authService.setUserMode(newMode, true); // Persistir en BD
    } else {
      localStorage.setItem('userViewMode', newMode);
    }

    // Navegar a la ruta apropiada
    const targetRoute = newMode === 'developer' ? '/dev/dashboard' : '/hogar';
    
    // Re-renderizar navegación y navegar
    this.initialized = false;
    this.currentMode = newMode;
    
    if (window.router) {
      window.router.navigate(targetRoute);
    }
    
    // Re-renderizar con el nuevo modo
    await this.render();
  }

  /**
   * Cargar información de créditos (modo usuario)
   */
  async loadCreditsInfo() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      // Obtener organización activa
      const activeOrgId = localStorage.getItem('activeOrganizationId');
      if (!activeOrgId) return;

      // Cargar créditos de la organización
      const { data: credits, error } = await supabase
        .from('organization_credits')
        .select('credits_available')
        .eq('organization_id', activeOrgId)
        .maybeSingle();

      const creditsCount = document.getElementById('navCreditsCount');
      if (creditsCount) {
        creditsCount.textContent = credits ? this.formatNumber(credits.credits_available) : '0';
      }
    } catch (error) {
      console.error('Error cargando créditos:', error);
    }
  }

  /**
   * Toggle dropdown de organización
   */
  toggleOrgDropdown() {
    const dropdown = document.getElementById('navOrgDropdown');
    const chevron = document.getElementById('navOrgChevron');
    if (!dropdown) return;

    const isOpen = dropdown.classList.contains('open');
    
    // Cerrar todos los dropdowns primero
    this.closeAllDropdowns();
    
    if (!isOpen) {
      dropdown.classList.add('open');
      if (chevron) {
        const icon = chevron.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-down');
          icon.classList.add('fa-chevron-up');
        }
      }
    }
  }

  /**
   * Cerrar todos los dropdowns
   */
  closeAllDropdowns() {
    const orgDropdown = document.getElementById('navOrgDropdown');
    const orgChevron = document.getElementById('navOrgChevron');

    if (orgDropdown) {
      orgDropdown.classList.remove('open');
    }
    if (orgChevron) {
      const icon = orgChevron.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
      }
    }
  }

  /**
   * Configurar submenús
   */
  setupSubmenus() {
    const submenuItems = document.querySelectorAll('.nav-item-has-submenu');
    
    submenuItems.forEach(item => {
      const submenu = item.querySelector('.nav-submenu');
      if (!submenu) return;
      
      // Inicialmente cerrado
      submenu.classList.remove('open');
      
      // Verificar si algún subitem está activo
      const activeSubitem = submenu.querySelector('.nav-link-sub.active');
      if (activeSubitem) {
        submenu.classList.add('open');
        item.classList.add('active');
      }
    });
  }

  /**
   * Toggle submenú
   */
  toggleSubmenu(parentItem) {
    const submenu = parentItem.querySelector('.nav-submenu');
    const chevron = parentItem.querySelector('.nav-chevron');
    if (!submenu) return;
    
    const isOpen = submenu.classList.contains('open');
    
    // Cerrar otros submenús
    document.querySelectorAll('.nav-submenu').forEach(sm => {
      if (sm !== submenu) {
        sm.classList.remove('open');
        const otherItem = sm.closest('.nav-item-has-submenu');
        if (otherItem) {
          otherItem.classList.remove('active');
          const otherChevron = otherItem.querySelector('.nav-chevron');
          if (otherChevron) {
            otherChevron.style.transform = 'rotate(0deg)';
          }
        }
      }
    });
    
    // Toggle este submenú
    if (isOpen) {
      submenu.classList.remove('open');
      parentItem.classList.remove('active');
      if (chevron) {
        chevron.style.transform = 'rotate(0deg)';
      }
    } else {
      submenu.classList.add('open');
      parentItem.classList.add('active');
      if (chevron) {
        chevron.style.transform = 'rotate(90deg)';
      }
    }
  }

  /**
   * Configurar tooltips para estado colapsado
   */
  setupTooltips() {
    const navLinks = document.querySelectorAll('.nav-link[data-tooltip]');
    
    navLinks.forEach(link => {
      const tooltip = link.dataset.tooltip;
      
      // Crear elemento tooltip
      const tooltipEl = document.createElement('div');
      tooltipEl.className = 'nav-tooltip';
      tooltipEl.textContent = tooltip;
      link.appendChild(tooltipEl);
      
      // Mostrar tooltip en hover cuando está colapsado
      link.addEventListener('mouseenter', () => {
        const sideNavigation = document.getElementById('sideNavigation');
        if (sideNavigation && sideNavigation.classList.contains('collapsed')) {
          tooltipEl.classList.add('show');
        }
      });
      
      link.addEventListener('mouseleave', () => {
        tooltipEl.classList.remove('show');
      });
    });
  }

  /**
   * Toggle navegación (móvil)
   */
  toggleNavigation() {
    if (this.isNavOpen) {
      this.closeNavigation();
    } else {
      this.openNavigation();
    }
  }

  /**
   * Abrir navegación
   */
  openNavigation() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const navOverlay = document.getElementById('navOverlay');
    const sideNavigation = document.getElementById('sideNavigation');

    this.isNavOpen = true;
    
    if (hamburgerMenu) hamburgerMenu.classList.add('active');
    if (navOverlay) navOverlay.classList.add('active');
    if (sideNavigation) sideNavigation.classList.add('active');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  /**
   * Cerrar navegación
   */
  closeNavigation() {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const navOverlay = document.getElementById('navOverlay');
    const sideNavigation = document.getElementById('sideNavigation');

    this.isNavOpen = false;
    
    if (hamburgerMenu) hamburgerMenu.classList.remove('active');
    if (navOverlay) navOverlay.classList.remove('active');
    if (sideNavigation) sideNavigation.classList.remove('active');

    // Restore body scroll
    document.body.style.overflow = '';
  }

  /**
   * Toggle sidebar collapse (desktop)
   */
  toggleSidebarCollapse() {
    const sideNavigation = document.getElementById('sideNavigation');
    if (!sideNavigation) return;
    
    this.isCollapsed = !this.isCollapsed;
    
    // Actualizar icono del header
    const headerSidebarToggle = document.getElementById('headerSidebarToggle');
    if (headerSidebarToggle) {
      const icon = headerSidebarToggle.querySelector('i');
      if (icon) {
        if (this.isCollapsed) {
          icon.classList.remove('fa-bars');
          icon.classList.add('fa-chevron-right');
        } else {
          icon.classList.remove('fa-chevron-right');
          icon.classList.add('fa-bars');
        }
      }
    }
    
    if (this.isCollapsed) {
      sideNavigation.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      // Cerrar dropdowns cuando se colapsa
      this.closeAllDropdowns();
    } else {
      sideNavigation.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
    }
    
    // Guardar estado en localStorage
    localStorage.setItem('sidebarCollapsed', this.isCollapsed.toString());
  }

  /**
   * Actualizar link activo según la ruta actual
   */
  updateActiveLink() {
    // Usar pathname para History API
    const currentPath = window.location.pathname || '/';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      const route = link.dataset.route || link.getAttribute('href');
      if (route) {
        // Normalizar route
        let normalizedRoute = route;
        if (normalizedRoute.startsWith('#')) {
          normalizedRoute = normalizedRoute.replace('#', '');
        }
        if (!normalizedRoute.startsWith('/')) {
          normalizedRoute = '/' + normalizedRoute;
        }
        
        // Comparar con pathname actual
        if (normalizedRoute === currentPath || 
            (normalizedRoute === '/' && currentPath === '/')) {
          link.classList.add('active');
        }
      }
    });
  }

  /**
   * Cargar información del usuario
   */
  async loadUserInfo() {
    // Verificar si hay usuario autenticado
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (user && !error) {
        // Obtener perfil del usuario
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();

        if (profile) {
          this.updateUserInfo(profile);
        }
      }
    } catch (error) {
      console.error('Error cargando info de usuario:', error);
    }
  }

  /**
   * Actualizar información del usuario en el sidebar
   */
  updateUserInfo(user) {
    const navProfileName = document.getElementById('navProfileName');
    const navProfileEmail = document.getElementById('navProfileEmail');
    const navProfileInitials = document.getElementById('navProfileInitials');
    const navProfileAvatar = document.getElementById('navProfileAvatar');
    
    if (user) {
      const name = user.full_name || user.name || 'Usuario';
      const email = user.email || 'usuario@email.com';
      
      // Actualizar nombre
      if (navProfileName) {
        navProfileName.textContent = name;
      }
      
      // Actualizar email
      if (navProfileEmail) {
        navProfileEmail.textContent = email;
      }
      
      // Generar iniciales
      if (navProfileInitials) {
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        navProfileInitials.textContent = initials || 'U';
      }
      
      // Si hay avatar URL, usarlo
      if (user.avatar_url && navProfileAvatar) {
        navProfileAvatar.style.backgroundImage = `url(${user.avatar_url})`;
        navProfileAvatar.style.backgroundSize = 'cover';
        navProfileAvatar.style.backgroundPosition = 'center';
        if (navProfileInitials) {
          navProfileInitials.style.display = 'none';
        }
      }
    }
  }

  /**
   * Cargar información del desarrollador (modo PaaS)
   */
  async loadDeveloperInfo() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      // Cargar estadísticas del desarrollador
      const { data: devStats, error: statsError } = await supabase
        .from('developer_stats')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Actualizar UI con estadísticas
      const navDevName = document.getElementById('navDevName');
      const navDevRank = document.getElementById('navDevRank');
      const navDevRunCount = document.getElementById('navDevRunCount');
      const navDevRating = document.getElementById('navDevRating');

      // Cargar nombre del usuario
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (navDevName && profile) {
        navDevName.textContent = profile.full_name || 'Developer Portal';
      }

      if (devStats) {
        if (navDevRank) {
          // Formatear rank (novice, intermediate, expert, etc.)
          const rankLabels = {
            'novice': 'Novato',
            'intermediate': 'Intermedio',
            'expert': 'Experto',
            'master': 'Maestro'
          };
          navDevRank.textContent = rankLabels[devStats.current_rank] || 'Novato';
        }
        if (navDevRunCount) {
          navDevRunCount.textContent = this.formatNumber(devStats.total_successful_runs || 0);
        }
        if (navDevRating) {
          navDevRating.textContent = (devStats.avg_flow_rating || 0).toFixed(1);
        }
      } else {
        // Sin estadísticas aún
        if (navDevRank) navDevRank.textContent = 'Novato';
        if (navDevRunCount) navDevRunCount.textContent = '0';
        if (navDevRating) navDevRating.textContent = '0.0';
      }

      // Cargar conteo de flujos del desarrollador
      const { count: flowCount } = await supabase
        .from('content_flows')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id);

      // Se podría mostrar el conteo de flujos en algún lugar si se desea

    } catch (error) {
      console.error('Error cargando información de desarrollador:', error);
    }
  }

  /**
   * Formatear número grande (1000 → 1K, etc.)
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Cargar información de organización
   */
  async loadOrganizationInfo() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      // Cargar todas las organizaciones del usuario
      const organizations = await this.loadUserOrganizations(supabase, user.id);
      
      // Obtener la organización activa (la primera o la guardada en localStorage)
      const activeOrgId = localStorage.getItem('activeOrganizationId');
      let activeOrg = organizations.find(org => org.id === activeOrgId) || organizations[0];

      if (!activeOrg && organizations.length > 0) {
        activeOrg = organizations[0];
      }

      // Si hay organización activa, guardarla
      if (activeOrg) {
        localStorage.setItem('activeOrganizationId', activeOrg.id);
      }

      // Obtener el plan de la suscripción para la organización activa
      let planName = 'Personal';
      if (activeOrg && user.id) {
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .select('plan_type, status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subscription && subscription.plan_type) {
          // Convertir plan_type a formato legible
          planName = subscription.plan_type.charAt(0).toUpperCase() + subscription.plan_type.slice(1);
        }
      }

      // Obtener el logo de la marca desde brand_containers
      let brandLogoUrl = null;
      if (activeOrg && activeOrg.id) {
        const { data: brandContainer, error: brandError } = await supabase
          .from('brand_containers')
          .select('logo_url')
          .eq('organization_id', activeOrg.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (brandContainer && brandContainer.logo_url) {
          brandLogoUrl = brandContainer.logo_url;
        }
      }

      // Actualizar UI de la organización activa
      const navOrgName = document.getElementById('navOrgName');
      const navOrgType = document.getElementById('navOrgType');

      if (navOrgName) {
        navOrgName.textContent = activeOrg ? activeOrg.name : 'Mi Organización';
      }

      if (navOrgType) {
        navOrgType.textContent = planName;
      }

      // Renderizar lista de organizaciones en el dropdown
      this.renderOrganizationsDropdown(organizations, activeOrg ? activeOrg.id : null);
    } catch (error) {
      console.error('Error cargando información de organización:', error);
      // Usar valores por defecto en caso de error
      const navOrgName = document.getElementById('navOrgName');
      const navOrgType = document.getElementById('navOrgType');
      
      if (navOrgName) {
        navOrgName.textContent = 'Mi Organización';
      }
      if (navOrgType) {
        navOrgType.textContent = 'Personal';
      }
    }
  }

  /**
   * Cargar todas las organizaciones del usuario
   */
  async loadUserOrganizations(supabase, userId) {
    const orgsMap = new Map();

    try {
      // Cargar organizaciones donde el usuario es miembro
      const { data: orgMembers, error: membersError } = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name,
            owner_user_id,
            created_at
          )
        `)
        .eq('user_id', userId);

      if (orgMembers) {
        orgMembers.forEach(member => {
          if (member.organizations) {
            const org = member.organizations;
            orgsMap.set(org.id, {
              id: org.id,
              name: org.name,
              role: member.role,
              created_at: org.created_at
            });
          }
        });
      }

      // Cargar organizaciones donde el usuario es owner
      const { data: ownedOrgs, error: ownedError } = await supabase
        .from('organizations')
        .select('id, name, owner_user_id, created_at')
        .eq('owner_user_id', userId);

      if (ownedOrgs) {
        ownedOrgs.forEach(org => {
          if (!orgsMap.has(org.id)) {
            orgsMap.set(org.id, {
              id: org.id,
              name: org.name,
              role: 'owner',
              created_at: org.created_at
            });
          }
        });
      }

      // Obtener planes para cada organización
      const organizations = Array.from(orgsMap.values());
      
      // Para cada organización, obtener su plan
      for (const org of organizations) {
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .select('plan_type, status')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subscription && subscription.plan_type) {
          org.plan = subscription.plan_type.charAt(0).toUpperCase() + subscription.plan_type.slice(1);
        } else {
          org.plan = 'Personal';
        }
      }

      return organizations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error('Error cargando organizaciones:', error);
      return [];
    }
  }

  /**
   * Renderizar lista de organizaciones en el dropdown
   */
  renderOrganizationsDropdown(organizations, activeOrgId) {
    const dropdownList = document.getElementById('navOrgDropdownList');
    if (!dropdownList) return;

    if (organizations.length === 0) {
      dropdownList.innerHTML = `
        <div class="nav-org-option create-org" data-action="create">
          <i class="fas fa-plus"></i>
          <span>Create new organization</span>
        </div>
      `;
      return;
    }

    let html = '';

    // Renderizar cada organización
    organizations.forEach(org => {
      const isActive = org.id === activeOrgId;
      html += `
        <div class="nav-org-option ${isActive ? 'active' : ''}" data-org-id="${org.id}">
          <div class="nav-org-option-content">
            <div class="nav-org-option-name">${this.escapeHtml(org.name)}</div>
            <div class="nav-org-option-type">${this.escapeHtml(org.plan || 'Personal')}</div>
          </div>
          ${isActive ? '<i class="fas fa-check nav-org-check"></i>' : ''}
        </div>
      `;
    });

    // Agregar opciones adicionales
    html += `
      <div class="nav-org-divider"></div>
      <div class="nav-org-option create-org" data-action="create">
        <i class="fas fa-plus"></i>
        <span>Create new organization</span>
      </div>
      <div class="nav-org-divider"></div>
      <div class="nav-org-option manage-org" data-action="manage">
        <i class="fas fa-sliders-h"></i>
        <span>Administrar organización</span>
      </div>
    `;

    dropdownList.innerHTML = html;

    // Agregar event listeners para cambiar de organización
    dropdownList.querySelectorAll('.nav-org-option[data-org-id]').forEach(option => {
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const orgId = option.dataset.orgId;
        await this.switchOrganization(orgId);
        this.closeAllDropdowns();
      });
    });

    // Event listener para crear nueva organización
    const createOption = dropdownList.querySelector('.nav-org-option.create-org');
    if (createOption) {
      createOption.addEventListener('click', (e) => {
        e.stopPropagation();
        // TODO: Implementar navegación a crear organización
        if (window.router) {
          window.router.navigate('/organization?action=create');
        }
        this.closeAllDropdowns();
      });
    }

    // Event listener para administrar organización
    const manageOption = dropdownList.querySelector('.nav-org-option.manage-org');
    if (manageOption) {
      manageOption.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.router) {
          window.router.navigate('/organization');
        }
        this.closeAllDropdowns();
      });
    }
  }

  /**
   * Cambiar de organización activa
   */
  async switchOrganization(organizationId) {
    localStorage.setItem('activeOrganizationId', organizationId);
    // Recargar información de organización
    await this.loadOrganizationInfo();
    // Recargar información del usuario para actualizar contexto
    await this.loadUserInfo();
  }

  /**
   * Escapar HTML para prevenir XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    // Usar SupabaseService si está disponible
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    
    // Fallback a app-loader
    if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
      try {
        return await window.appLoader.waitFor();
      } catch (error) {
        return null;
      }
    }
    return window.supabase || null;
  }

  /**
   * Manejar logout
   */
  async handleLogout() {
    // Usar AuthService si está disponible
    if (window.authService) {
      await window.authService.logout();
      return;
    }

    // Fallback: lógica antigua
    const supabase = await this.getSupabaseClient();
    
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error en logout:', error);
      }
    }

    // Limpiar sesión local
    if (window.sessionManager) {
      window.sessionManager.clearSession();
    } else {
      localStorage.removeItem('user_session');
      sessionStorage.removeItem('user_session');
    }

    // Redirigir al login usando router
    if (window.router) {
      window.router.navigate('/login', true);
    } else {
      window.location.href = '/login.html';
    }
  }

  /**
   * Mostrar/ocultar según autenticación
   */
  async updateVisibility() {
    const supabase = await this.getSupabaseClient();
    if (!supabase) {
      // Si no hay Supabase, ocultar navegación
      if (this.container) {
        this.container.style.display = 'none';
      }
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sideNavigation = document.getElementById('sideNavigation');
      
      if (sideNavigation) {
        if (user) {
          sideNavigation.style.display = 'block';
        } else {
          sideNavigation.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Error verificando autenticación:', error);
    }
  }
}

// Crear instancia global
window.navigation = new Navigation();

// Función para verificar si la ruta actual requiere navegación
function shouldShowNavigation() {
  // Usar History API (pathname) en lugar de hash
  const currentPath = window.location.pathname || '/';
  const publicRoutes = ['/', '/login', '/planes'];
  const isPublicRoute = publicRoutes.some(route => currentPath === route || currentPath === route + '/');
  return !isPublicRoute;
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  // Esperar un poco para que el router maneje la ruta inicial
  setTimeout(async () => {
    if (shouldShowNavigation()) {
      await window.navigation.render();
    }
  }, 200);
});

// También renderizar si el DOM ya está listo
if (document.readyState !== 'loading') {
  setTimeout(async () => {
    if (shouldShowNavigation()) {
      await window.navigation.render();
    }
  }, 200);
}

// Escuchar cambios de ruta para mostrar/ocultar navegación (History API)
window.addEventListener('popstate', async () => {
  if (shouldShowNavigation() && !window.navigation.initialized) {
    await window.navigation.render();
  } else if (!shouldShowNavigation() && window.navigation.initialized) {
    // Ocultar navegación si estamos en ruta pública
    const container = document.getElementById('navigation-container');
    if (container) {
      container.innerHTML = '';
      window.navigation.initialized = false;
    }
  }
});

// También escuchar el evento personalizado routechange del router
window.addEventListener('routechange', async () => {
  if (shouldShowNavigation() && !window.navigation.initialized) {
    await window.navigation.render();
  } else if (!shouldShowNavigation() && window.navigation.initialized) {
    // Ocultar navegación si estamos en ruta pública
    const container = document.getElementById('navigation-container');
    if (container) {
      container.innerHTML = '';
      window.navigation.initialized = false;
    }
  }
});

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Navigation;
}

