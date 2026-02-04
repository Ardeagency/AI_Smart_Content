/**
 * WorkspaceLayout - Layout persistente para rutas /org/:orgId/*
 * Principio: Header + Sidebar no se recrean; solo cambia el contenido del módulo.
 *
 * - Se monta una vez al entrar al workspace
 * - Proporciona #workspace-content como contenedor para las vistas de módulo
 * - Incluye header global y contenedor del sidebar (Navigation se renderiza ahí)
 */
class WorkspaceLayout {
  constructor() {
    this.appContainer = null;
    this.mounted = false;
    this.contentContainerId = 'workspace-content';
    this.navigationContainerId = 'navigation-container';
  }

  /**
   * Montar el layout en #app-container
   * Crea: workspace-layout > header + body (sidebar wrap + content)
   */
  mount(container) {
    if (!container) container = document.getElementById('app-container');
    if (!container) return null;

    this.appContainer = container;

    const orgName = window.appState && window.appState.getCurrentOrganization()
      ? window.appState.getCurrentOrganization().name
      : 'Workspace';

    container.innerHTML = `
      <div id="workspace-layout" class="workspace-layout">
        <header class="main-header workspace-header" id="workspace-header">
          <div class="header-content">
            <button class="header-sidebar-toggle" id="headerSidebarToggle" aria-label="Toggle sidebar">
              <i class="fas fa-bars"></i>
            </button>
            <div class="header-left">
              <div class="header-context">
                <div class="header-context-primary">
                  <h1 class="header-section" id="workspaceHeaderSection">${this.escapeHtml(orgName)}</h1>
                  <span class="header-separator" id="workspaceHeaderSeparator" style="display:none;">/</span>
                  <span class="header-active-object" id="workspaceHeaderActive"></span>
                </div>
                <div class="header-context-secondary" id="workspaceHeaderSecondary"></div>
              </div>
            </div>
            <div class="header-right">
              <div class="header-user" id="headerUser">
                <div class="header-user-avatar" id="headerUserAvatar">
                  <span class="header-user-initials" id="headerUserInitials">U</span>
                </div>
                <button class="header-user-chevron" id="headerUserChevron" aria-label="Menú de usuario">
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <div class="header-user-dropdown" id="headerUserDropdown">
                <div class="header-user-dropdown-item" data-action="home">
                  <i class="fas fa-home"></i>
                  <span>Ir a Home</span>
                </div>
                <div class="header-user-dropdown-item" data-action="profile">
                  <i class="fas fa-user"></i>
                  <span>Perfil</span>
                </div>
                <div class="header-user-dropdown-item header-user-logout" id="headerUserLogout" data-action="logout">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>Cerrar sesión</span>
                </div>
              </div>
              <button class="hamburger-menu" id="hamburgerMenu" aria-label="Toggle navigation">
                <div class="hamburger-line"></div>
                <div class="hamburger-line"></div>
                <div class="hamburger-line"></div>
              </button>
            </div>
          </div>
        </header>
        <div class="workspace-body">
          <div id="${this.navigationContainerId}" class="workspace-sidebar-wrap"></div>
          <main id="${this.contentContainerId}" class="workspace-content"></main>
        </div>
      </div>
    `;

    this.mounted = true;
    this.setupHeaderListeners();
    return document.getElementById(this.contentContainerId);
  }

  /**
   * Desmontar el layout y limpiar
   */
  unmount() {
    if (this.appContainer) {
      this.appContainer.innerHTML = '';
      this.appContainer = null;
    }
    this.mounted = false;
    if (window.navigation && window.navigation.initialized) {
      window.navigation.initialized = false;
    }
  }

  /**
   * Obtener el contenedor donde se renderizan las vistas de módulo
   */
  getContentContainer() {
    return document.getElementById(this.contentContainerId);
  }

  /**
   * Actualizar contexto del header (section / activeObject) sin recrear el header
   */
  setHeaderContext(section, activeObject = null, secondary = null) {
    const sectionEl = document.getElementById('workspaceHeaderSection');
    const separatorEl = document.getElementById('workspaceHeaderSeparator');
    const activeEl = document.getElementById('workspaceHeaderActive');
    const secondaryEl = document.getElementById('workspaceHeaderSecondary');
    if (sectionEl) sectionEl.textContent = section || '';
    if (separatorEl) separatorEl.style.display = activeObject ? '' : 'none';
    if (activeEl) {
      activeEl.textContent = activeObject || '';
    }
    if (secondaryEl) secondaryEl.textContent = secondary || '';
  }

  setupHeaderListeners() {
    const headerUser = document.getElementById('headerUser');
    const headerUserChevron = document.getElementById('headerUserChevron');
    const headerUserDropdown = document.getElementById('headerUserDropdown');
    const headerUserLogout = document.getElementById('headerUserLogout');
    const headerSidebarToggle = document.getElementById('headerSidebarToggle');
    const hamburgerMenu = document.getElementById('hamburgerMenu');

    if (headerUser && headerUserDropdown) {
      headerUser.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = headerUserDropdown.classList.contains('open');
        document.querySelectorAll('.header-user-dropdown.open').forEach(d => {
          if (d !== headerUserDropdown) d.classList.remove('open');
        });
        if (isOpen) {
          headerUserDropdown.classList.remove('open');
          if (headerUserChevron) {
            const icon = headerUserChevron.querySelector('i');
            if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
          }
        } else {
          headerUserDropdown.classList.add('open');
          if (headerUserChevron) {
            const icon = headerUserChevron.querySelector('i');
            if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
          }
        }
      });
    }

    if (headerUserLogout) {
      headerUserLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.authService) await window.authService.logout();
        else if (window.supabase) await window.supabase.auth.signOut();
        if (window.appState) window.appState.clearSession();
        if (window.router) window.router.navigate('/login', true);
        else window.location.href = '/login';
      });
    }

    const homeItem = headerUserDropdown && headerUserDropdown.querySelector('[data-action="home"]');
    if (homeItem) {
      homeItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.router) window.router.navigate('/home');
        headerUserDropdown.classList.remove('open');
      });
    }
    const profileItem = headerUserDropdown && headerUserDropdown.querySelector('[data-action="profile"]');
    if (profileItem) {
      profileItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.router) window.router.navigate('/account/profile');
        headerUserDropdown.classList.remove('open');
      });
    }

    document.addEventListener('click', (e) => {
      if (headerUserDropdown && !e.target.closest('.header-user')) {
        headerUserDropdown.classList.remove('open');
        if (headerUserChevron) {
          const icon = headerUserChevron.querySelector('i');
          if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        }
      }
    });

    if (headerSidebarToggle) {
      headerSidebarToggle.addEventListener('click', () => {
        if (window.navigation) window.navigation.toggleSidebarCollapse?.() || window.navigation.toggleNavigation?.();
      });
    }
    if (hamburgerMenu) {
      hamburgerMenu.addEventListener('click', () => {
        if (window.navigation) window.navigation.toggleNavigation?.();
      });
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  isMounted() {
    return this.mounted && !!document.getElementById('workspace-layout');
  }
}

window.WorkspaceLayout = WorkspaceLayout;
window.workspaceLayout = new WorkspaceLayout();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkspaceLayout;
}
