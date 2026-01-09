/**
 * Navigation Component - Componente de navegación lateral persistente
 * Maneja el sidebar y la navegación de la aplicación
 */
class Navigation {
  constructor() {
    this.container = document.getElementById('navigation-container');
    this.isNavOpen = false;
    this.isCollapsed = false;
    this.initialized = false;
  }

  /**
   * Renderizar el componente de navegación
   */
  async render() {
    if (this.initialized) {
      return;
    }

    if (!this.container) {
      console.error('❌ Navigation container no encontrado');
      return;
    }

    // Renderizar HTML del sidebar
    this.container.innerHTML = this.getNavigationHTML();

    // Inicializar
    this.initializeSidebar();
    this.setupEventListeners();
    this.updateActiveLink();

    // Cargar información del usuario si está autenticado
    await this.loadUserInfo();

    this.initialized = true;
    console.log('✅ Navigation component renderizado');
  }

  /**
   * Obtener HTML del sidebar
   */
  getNavigationHTML() {
    return `
      <!-- Overlay de navegación -->
      <div class="nav-overlay" id="navOverlay"></div>

      <!-- Navegación lateral -->
      <nav class="side-navigation" id="sideNavigation">
        <!-- Header del panel -->
        <div class="nav-header">
          <button class="nav-toggle-btn" id="navToggleBtn" aria-label="Toggle sidebar">
            <i class="fas fa-bars"></i>
          </button>
          <div class="nav-brand-title">
            <h4>AI SMART CONTENT</h4>
          </div>
        </div>

        <!-- Menú Principal -->
        <div class="nav-menu">
          <div class="nav-section">
            <div class="nav-section-title">Principal</div>
            <div class="nav-item">
              <a href="/dashboard" class="nav-link" data-route="/dashboard">
                <i class="fas fa-home nav-icon"></i>
                <span class="nav-text">Dashboard</span>
              </a>
            </div>
            <div class="nav-item">
              <a href="/organization" class="nav-link" data-route="/organization">
                <i class="fas fa-building nav-icon"></i>
                <span class="nav-text">Organización</span>
              </a>
            </div>
          </div>

          <div class="nav-section">
            <div class="nav-section-title">Contenido</div>
            <div class="nav-item">
              <a href="/brands" class="nav-link" data-route="/brands">
                <i class="fas fa-tags nav-icon"></i>
                <span class="nav-text">Marcas</span>
              </a>
            </div>
            <div class="nav-item">
              <a href="/products" class="nav-link" data-route="/products">
                <i class="fas fa-box nav-icon"></i>
                <span class="nav-text">Productos</span>
              </a>
            </div>
            <div class="nav-item">
              <a href="/campaigns" class="nav-link" data-route="/campaigns">
                <i class="fas fa-bullhorn nav-icon"></i>
                <span class="nav-text">Campañas</span>
              </a>
            </div>
            <div class="nav-item">
              <a href="/audiences" class="nav-link" data-route="/audiences">
                <i class="fas fa-users nav-icon"></i>
                <span class="nav-text">Audiencias</span>
              </a>
            </div>
          </div>

          <div class="nav-section">
            <div class="nav-section-title">Generación</div>
            <div class="nav-item">
              <a href="/create" class="nav-link" data-route="/create">
                <i class="fas fa-magic nav-icon"></i>
                <span class="nav-text">Crear Contenido</span>
              </a>
            </div>
            <div class="nav-item">
              <a href="/content" class="nav-link" data-route="/content">
                <i class="fas fa-folder nav-icon"></i>
                <span class="nav-text">Biblioteca</span>
              </a>
            </div>
          </div>

          <div class="nav-section">
            <div class="nav-section-title">Análisis</div>
            <div class="nav-item">
              <a href="/insights" class="nav-link" data-route="/insights">
                <i class="fas fa-chart-line nav-icon"></i>
                <span class="nav-text">Insights</span>
              </a>
            </div>
          </div>

          <div class="nav-section">
            <div class="nav-section-title">Configuración</div>
            <div class="nav-item">
              <a href="/settings" class="nav-link" data-route="/settings">
                <i class="fas fa-cog nav-icon"></i>
                <span class="nav-text">Ajustes</span>
              </a>
            </div>
          </div>
        </div>

        <!-- Footer del panel -->
        <div class="nav-footer">
          <div class="nav-footer-profile" id="navFooterProfile">
            <i class="fas fa-user"></i>
            <span id="navProfileName">Usuario</span>
          </div>
          <a href="#" class="nav-footer-link" id="navAdminBtn">
            <i class="fas fa-cog"></i>
            <span>Administrar</span>
          </a>
          <a href="#" class="nav-footer-link nav-logout" id="navLogoutBtn">
            <i class="fas fa-sign-out-alt"></i>
            <span>Salir</span>
          </a>
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
      const navToggleBtn = document.getElementById('navToggleBtn');
      if (sideNavigation) {
        sideNavigation.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
        // Actualizar icono si está colapsado
        if (navToggleBtn) {
          const icon = navToggleBtn.querySelector('i');
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
    const navLogoutBtn = document.getElementById('navLogoutBtn');
    const navAdminBtn = document.getElementById('navAdminBtn');

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
      });
    }

    // Toggle button - colapsar/expandir en desktop
    if (navToggleBtn) {
      navToggleBtn.addEventListener('click', () => {
        if (window.innerWidth > 768) {
          this.toggleSidebarCollapse();
        }
      });
    }

    // Navigation links - usar router
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.dataset.route;
        if (route && window.router) {
          window.router.navigate(route);
        }
        // Cerrar navegación en móvil después de click
        if (window.innerWidth <= 768) {
          this.closeNavigation();
        }
      });
    });

    // Logout
    if (navLogoutBtn) {
      navLogoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.handleLogout();
      });
    }

    // Admin button (placeholder)
    if (navAdminBtn) {
      navAdminBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // TODO: Implementar funcionalidad de admin
        console.log('Admin button clicked');
      });
    }

    // Close nav on escape key - solo en móvil
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isNavOpen && window.innerWidth <= 768) {
        this.closeNavigation();
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
    const navToggleBtn = document.getElementById('navToggleBtn');
    if (!sideNavigation) return;
    
    this.isCollapsed = !this.isCollapsed;
    
    if (this.isCollapsed) {
      sideNavigation.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      // Cambiar icono a chevron-right cuando está colapsado
      if (navToggleBtn) {
        const icon = navToggleBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-bars');
          icon.classList.add('fa-chevron-right');
        }
      }
    } else {
      sideNavigation.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      // Cambiar icono a bars cuando está expandido
      if (navToggleBtn) {
        const icon = navToggleBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-right');
          icon.classList.add('fa-bars');
        }
      }
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
    if (navProfileName && user) {
      navProfileName.textContent = user.full_name || user.email || 'Usuario';
    }
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

