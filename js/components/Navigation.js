/**
 * Sidebar usuario consumidor — Schema final (Zona 1: navegación workspace, Zona 2: footer organizacional).
 * Estructura: main[] (Vera primario, Workspace, Create, Studio) + footer[] (Configuración, Créditos).
 * Orden: Vera (primario) → [Workspace] Dashboard, Production, Brand Identity, Brand Storage (1+ sub-marcas), Identities → [Create] Video, Flows.
 * Estudio no tiene entrada en el sidebar: solo se accede seleccionando un flujo desde flows.
 */
const SIDEBAR_USER_CONFIG = {
  main: [
    {
      type: 'page',
      id: 'vera',
      label: 'Vera',
      icon: 'fa-brain',
      iconSrc: '/recursos/vera/Vera-2.svg',
      route: 'vera',
      primary: true,
      hideLabel: true,
      navIconClass: 'nav-icon-img--vera-logo'
    },
    { type: 'section', label: 'Workspace' },
    { type: 'page', id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', iconSrc: '/recursos/icons/dashboard.svg', route: 'dashboard' },
    { type: 'page', id: 'activity', label: 'Production', icon: 'fa-chart-line', iconSrc: '/recursos/icons/Production.svg', route: 'production' },
    {
      type: 'page',
      id: 'brand-organization',
      label: 'Brand Identity',
      icon: 'fa-layer-group',
      iconSrc: '/recursos/icons/Brands.svg',
      route: 'brand'
    },
    {
      type: 'container',
      id: 'brand-storage',
      label: 'Brand Storage',
      icon: 'fa-layer-group',
      iconSrc: '/recursos/icons/file-storage.svg',
      children: []
    },
    {
      type: 'page',
      id: 'identities',
      label: 'Identities',
      icon: 'fa-id-card',
      iconSrc: '/recursos/icons/Identities.svg',
      route: 'identities'
    },
    { type: 'section', label: 'Create' },
    { type: 'page', id: 'video', label: 'Video', icon: 'fa-play', iconSrc: '/recursos/icons/video.svg', route: 'video' },
    {
      type: 'container',
      id: 'catalog',
      label: 'Flows',
      icon: 'fa-th-large',
      iconSrc: '/recursos/icons/flows.svg',
      children: [] // Se rellenan con content_categories (schema 218-224) en render
    }
  ],
  footer: [
    // Estos ítems se muestran ahora en el dropdown #userDropdown (header).
  ]
};

const SIDEBAR_USER_EXPANDED_KEY = 'sidebarUserExpanded';

/** Versión en query de iconos del sidebar (SVG/PNG); subir si el navegador/CDN sirve assets viejos sin tocar el JS. */
const NAV_SIDEBAR_ASSET_VER = '20260427b';
function _navSidebarIconUrl(src) {
  if (!src) return src;
  const sep = src.indexOf('?') === -1 ? '?' : '&';
  return `${src}${sep}nav=${NAV_SIDEBAR_ASSET_VER}`;
}

// Delegamos en BaseView.escapeHtml (carga antes que Navigation en index.html).
// Fallback defensivo por si el orden de scripts cambiara en algún deploy futuro.
function _escapeHtml(s) {
  if (typeof BaseView !== 'undefined' && typeof BaseView.escapeHtml === 'function') {
    return BaseView.escapeHtml(s);
  }
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function _formatOrgNameTwoLines(name) {
  const raw = (name || '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return _escapeHtml(raw);
  return `${_escapeHtml(parts[0])}<br>${_escapeHtml(parts.slice(1).join(' '))}`;
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

/** SVG inline para el botón toggle del sidebar (hereda color del botón). Desplegado = colapsado.svg, colapsado = desplegado.svg */
const SIDEBAR_TOGGLE_ICON_DESPLEGADO = `<svg class="nav-sidebar-toggle-icon" width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.79167 0.624996L0.624999 4.79166L4.79167 8.95833M10.625 0.624996L6.45833 4.79166L10.625 8.95833" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SIDEBAR_TOGGLE_ICON_COLAPSADO = `<svg class="nav-sidebar-toggle-icon" width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.45833 0.624996L10.625 4.79166L6.45833 8.95833M0.624999 0.624996L4.79167 4.79166L0.625 8.95833" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Sidebar desarrollador — Build, Operations, Observability, Resources, Lead (solo lead).
 */
const SIDEBAR_DEVELOPER_CONFIG = [
  { type: 'section', label: 'Principal' },
  { type: 'page', id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', iconSrc: '/recursos/icons/dashboard.svg', route: '/dev/dashboard' },
  {
    type: 'page',
    id: 'user-registration',
    label: 'User Registration',
    icon: 'fa-user-shield',
    iconSrc: '/recursos/icons/user registration.svg',
    route: '/dev/lead/crm'
  },
  { type: 'section', label: 'Code' },
  { type: 'page', id: 'flows', label: 'My Flows', icon: 'fa-th-large', iconSrc: '/recursos/icons/flows.svg', route: '/dev/flows' },
  {
    type: 'container',
    id: 'operations',
    label: 'Operations',
    icon: 'fa-cogs',
    iconSrc: '/recursos/icons/video.svg',
    children: [
      { label: 'Test De Flujos', route: '/dev/test' },
      { label: 'Logs', route: '/dev/logs' },
      { label: 'Webhooks', route: '/dev/webhooks' }
    ]
  },
  {
    type: 'container',
    id: 'resources',
    label: 'Library',
    icon: 'fa-book',
    iconSrc: '/recursos/icons/memory.svg',
    children: [
      { label: 'Referencias Visuales', route: '/dev/lead/references' },
      { label: 'Vector Memory', route: '/dev/lead/ai-vectors' }
    ]
  },
  { type: 'section', label: 'Admin', role_required: 'lead' },
  {
    type: 'page',
    id: 'admin-team',
    label: 'Equipo',
    icon: 'fa-users',
    iconSrc: '/recursos/icons/organization.svg',
    role_required: 'lead',
    route: '/dev/lead/team'
  },
  {
    type: 'page',
    id: 'admin-inputs',
    label: 'Inputs',
    icon: 'fa-sliders-h',
    iconSrc: '/recursos/icons/coding.svg',
    role_required: 'lead',
    route: '/dev/lead/input-schemas'
  },
  {
    type: 'page',
    id: 'admin-categorias',
    label: 'Categorias',
    icon: 'fa-tags',
    iconSrc: '/recursos/icons/file-storage.svg',
    role_required: 'lead',
    route: '/dev/lead/categories'
  },
  {
    type: 'page',
    id: 'admin-flows',
    label: 'Todos los flujos',
    icon: 'fa-stream',
    iconSrc: '/recursos/icons/flows.svg',
    role_required: 'lead',
    route: '/dev/lead/flows'
  },
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
    /** @type {Array<{id:string,nombre_marca?:string}>} Sub-marcas para el submenú de Brand Storage */
    this._brandStorageSubbrands = [];
    this._CACHE_TTL = 60000;
    this._creditsUpdatedAttached = false;
    this._creditsRefreshInterval = null;
  }

  /**
   * Refrescar créditos del sidebar (invalida caché y recarga desde BD).
   * Útil tras comprar créditos o gastarlos en Studio. También se llama al escuchar 'credits-updated'.
   */

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
        .select('id, name, is_visible')
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('name');
      if (error) return [];
      const list = Array.isArray(data) ? data : [];
      this._catalogCategories = list.filter((c) => c.is_visible !== false);
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
    if (path === '/' || path === '/login' || path === '/signin' || path === '/cambiar-contrasena' || path === '/politica-de-privacidad' || path === '/terminos-de-servicio' || path === '/eliminacion-de-datos' || path === '/index.html') {
      return { mode: null, showSidebar: false, showHeader: false, orgId: null, brandId: null };
    }
    
    // Home / onboarding: solo header sin sidebar
    if (path === '/home' || path === '/hogar' || path === '/form_org' || path.startsWith('/form_org?')) {
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
    if (['/dashboard', '/production', '/vera', '/brands', '/product-detail', '/identities', '/studio', '/content', '/video', '/tasks', '/organization', '/credits', '/brand-organization', '/brand-storage', '/brandstorage', '/command-center'].some(r => path.startsWith(r))) {
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
      if (config.showHeader) {
        this.ensureNotificationsDropdown();
      }
      this.updateActiveLink();
      if (config.mode === 'user' && config.orgId) {
        this.loadCreditsFromDb();
      }
      if (config.showHeader) {
        this.refreshNotificationsBadge();
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

    if (config.showHeader) {
      this.refreshNotificationsBadge();
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
   * @param {string} settingsHref - URL destino del botón "Mi cuenta"
   */
  /**
   * Campana + punto rojo de no leídas (mismo patrón visual que badges estándar).
   */
  getHeaderNotificationsButtonGroupHTML() {
    return `
            <span class="header-notifications-wrap">
              <button
                type="button"
                class="user-menu-btn nav-footer-btn"
                data-flyout="notifications"
                data-tooltip="Notificaciones"
                aria-label="Notificaciones"
                id="headerNotificationsBtn"
              >
                <img src="/recursos/icons/notification.svg" class="nav-icon nav-icon-img" alt="" width="16" height="16">
              </button>
              <span class="header-notifications-badge" id="headerNotificationsBadge" hidden aria-hidden="true"></span>
            </span>`;
  }

  /**
   * Panel de notificaciones en body (mismo enfoque que #userDropdown: evita que el glass del header anule el panel).
   */
  ensureNotificationsDropdown() {
    const all = document.querySelectorAll('#notificationsDropdown');
    all.forEach((el, i) => {
      if (i > 0) el.remove();
    });
    let panel = document.getElementById('notificationsDropdown');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notificationsDropdown';
      panel.className = 'user-dropdown glass-black notifications-dropdown';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Notificaciones');
      panel.setAttribute('aria-hidden', 'true');
      document.body.appendChild(panel);
    } else if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  closeNotificationsDropdown() {
    const panel = document.getElementById('notificationsDropdown');
    if (panel) {
      panel.classList.remove('active');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.display = '';
      panel.style.visibility = '';
      panel.style.opacity = '';
      panel.style.pointerEvents = '';
      panel.style.zIndex = '';
      panel.style.maxHeight = '';
    }
  }

  /**
   * Refuerzo visual: mismo criterio que #userDropdown.active pero por si alguna regla CSS
   * del layout anula el display del panel en body.
   */
  _showNotificationsDropdownPanel(panel) {
    if (!panel) return;
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    panel.style.setProperty('display', 'flex', 'important');
    panel.style.visibility = 'visible';
    panel.style.opacity = '1';
    panel.style.pointerEvents = 'auto';
    panel.style.zIndex = '100500';
  }

  /**
   * Modal global de notificaciones (patrón idéntico a Settings: portal + overlay).
   */
  ensureNotificationsModal() {
    const portal = document.getElementById('modals-portal');
    if (!portal) return;
    if (document.getElementById('notificationsModal')) return;

    const html = `
      <div class="modal user-settings-modal notifications-modal" id="notificationsModal" aria-hidden="true" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="notificationsModalTitle">
        <div class="modal-overlay" id="notificationsModalOverlay"></div>
        <div class="modal-content glass-white">
          <div class="modal-header">
            <h3 id="notificationsModalTitle">Notificaciones</h3>
            <button type="button" class="modal-close" id="notificationsModalClose" data-action="close-notifications-modal" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body notifications-modal-body" id="notificationsModalBody">
            <div class="nav-flyout-notifications-loading">Cargando…</div>
          </div>
        </div>
      </div>`;

    portal.insertAdjacentHTML('beforeend', html);

    const close = () => this.closeNotificationsModal();
    document.getElementById('notificationsModalOverlay')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    document.getElementById('notificationsModalClose')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    const modal = document.getElementById('notificationsModal');
    if (modal) {
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeNotificationsModal();
      });
    }
    if (!this._notificationsModalDelegatedCloseBound) {
      this._notificationsModalDelegatedCloseBound = true;
      document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-action="close-notifications-modal"]');
        const overlay = e.target.closest('#notificationsModalOverlay');
        if (closeBtn || overlay) {
          e.preventDefault();
          e.stopPropagation();
          this.closeNotificationsModal();
        }
      });
    }
  }

  closeNotificationsModal() {
    const modal = document.getElementById('notificationsModal');
    if (!modal) return;
    modal.classList.remove('active', 'modal-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
  }

  async openNotificationsModal() {
    this.ensureNotificationsModal();
    const modal = document.getElementById('notificationsModal');
    const body = document.getElementById('notificationsModalBody');
    if (!modal || !body) return;

    this.closeNotificationsDropdown();
    if (typeof this.closeFlyout === 'function') this.closeFlyout();
    const ud = document.getElementById('userDropdown');
    if (ud) ud.classList.remove('active');

    modal.classList.add('active', 'modal-open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';

    body.innerHTML = '<div class="nav-flyout-notifications-loading">Cargando…</div>';

    const user = window.authService?.getCurrentUser?.();
    let supabase = window.authService?.supabase;
    if (!supabase?.from && window.supabaseService?.getClient) {
      try {
        supabase = await window.supabaseService.getClient();
      } catch (_) {
        supabase = null;
      }
    }

    if (!user?.id || !supabase?.from) {
      body.innerHTML = '<div class="nav-flyout-notifications-empty">No hay notificaciones</div>';
      return;
    }

    const { data, error } = await supabase
      .from('user_notifications')
      .select('id, title, message, type, is_read, created_at, link_to')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      body.innerHTML = `<div class="nav-flyout-notifications-error">${_escapeHtml(error.message || 'No se pudieron cargar notificaciones')}</div>`;
      return;
    }

    const list = Array.isArray(data) ? data : [];
    if (!list.length) {
      body.innerHTML = '<div class="nav-flyout-notifications-empty">No hay notificaciones</div>';
      return;
    }

    body.innerHTML =
      '<div class="nav-flyout-list nav-flyout-notifications-list notifications-modal-list">' +
      list
        .map((n) => {
          const type = n.type || 'info';
          const dateStr = n.created_at ? _formatNotificationDate(n.created_at) : '';
          const unread = !n.is_read;
          const link = n.link_to ? ` data-link="${_escapeHtml(n.link_to)}"` : '';
          return `<button type="button" class="nav-flyout-notification-item ${unread ? 'unread' : ''} ${type}" data-id="${n.id}"${link}>
            <span class="nav-flyout-notification-type">${_escapeHtml(type)}</span>
            <span class="nav-flyout-notification-title">${_escapeHtml(n.title || '')}</span>
            <span class="nav-flyout-notification-message">${_escapeHtml((n.message || '').slice(0, 180))}${(n.message || '').length > 180 ? '…' : ''}</span>
            <span class="nav-flyout-notification-date">${_escapeHtml(dateStr)}</span>
          </button>`;
        })
        .join('') +
      '</div>';

    body.querySelectorAll('.nav-flyout-notification-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const link = btn.dataset.link;
        if (id) {
          try {
            let client = window.authService?.supabase;
            if (!client?.from && window.supabaseService?.getClient) {
              client = await window.supabaseService.getClient();
            }
            if (client?.from) {
              await client.from('user_notifications').update({ is_read: true }).eq('id', id);
            }
          } catch (_) {}
          this.refreshNotificationsBadge();
          btn.classList.remove('unread');
        }
        if (link && window.router) {
          this.closeNotificationsModal();
          window.router.navigate(link.startsWith('/') ? link : `/${link}`);
        }
      });
    });
  }

  /**
   * Actualiza el punto rojo si hay filas con is_read = false en user_notifications.
   */
  async refreshNotificationsBadge() {
    const badge = document.getElementById('headerNotificationsBadge');
    if (!badge) return;
    try {
      const user = window.authService?.getCurrentUser?.();
      let supabase = window.authService?.supabase;
      if (!supabase?.from && window.supabaseService?.getClient) {
        try {
          supabase = await window.supabaseService.getClient();
        } catch (_) {
          supabase = null;
        }
      }
      if (!user?.id || !supabase?.from) {
        badge.hidden = true;
        badge.setAttribute('aria-hidden', 'true');
        return;
      }
      const { count, error } = await supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) {
        badge.hidden = true;
        badge.setAttribute('aria-hidden', 'true');
        return;
      }
      if ((count ?? 0) > 0) {
        badge.hidden = false;
        badge.removeAttribute('aria-hidden');
      } else {
        badge.hidden = true;
        badge.setAttribute('aria-hidden', 'true');
      }
    } catch (_) {
      badge.hidden = true;
      badge.setAttribute('aria-hidden', 'true');
    }
  }

  /** Reposiciona el dropdown de notificaciones si está abierto (resize/scroll). */
  repositionOpenNotificationsDropdown() {
    const panel = document.getElementById('notificationsDropdown');
    const btn = document.getElementById('headerNotificationsBtn');
    if (!panel?.classList.contains('active') || !btn) return;
    this.positionUserDropdown(btn, panel);
  }

  getUserDropdownHTML(settingsHref = '/home') {
    // Si hay org activa, navegar a su configuración; si no, ir al onboarding de organización.
    const orgHref = this.currentOrgId ? this.getUserSidebarRoute('organization') : '/form_org';
    // Si hay org activa, mostrar la tienda de créditos de esa org.
    const creditsHref = this.currentOrgId ? this.getUserSidebarRoute('credits') : '/credits';
    return `
      <div class="user-dropdown glass-black" id="userDropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name" id="userDropdownName">Usuario</div>
          <div class="user-dropdown-email" id="userDropdownEmail">usuario@email.com</div>
        </div>
        <div class="user-dropdown-divider"></div>
        <a href="${settingsHref}" class="user-dropdown-item" data-route="${settingsHref}" id="userDropdownSettingsLink">
          <img src="/recursos/icons/settings.svg" class="user-dropdown-item-icon" alt="" width="16" height="16">
          <span>Settings</span>
        </a>
        <a href="${orgHref}" class="user-dropdown-item" data-route="${orgHref}" id="userDropdownOrgLink">
          <i class="fas fa-building"></i>
          <span>Organization</span>
        </a>
        <a href="${creditsHref}" class="user-dropdown-item" data-route="${creditsHref}" id="userDropdownCreditsLink">
          <img src="/recursos/icons/Credits.svg" class="user-dropdown-item-icon" alt="" width="16" height="16">
          <span>Créditos</span>
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
    const settingsHref = '/home'; // "Mi cuenta": fuera de org
    return `
      <header class="app-header header-only" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <div class="header-logo">
              <img src="/recursos/logos/logo-03.svg" alt="AI Smart Content" class="header-logo-img">
            </div>
          </div>
          <div class="header-right">
            <div class="header-user-menu-wrap">
              ${this.getHeaderNotificationsButtonGroupHTML()}
              <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
                <i class="fas fa-chevron-down"></i>
              </button>
              ${this.getUserDropdownHTML(settingsHref)}
            </div>
          </div>
        </div>
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
    const legacy = { brand: '/brands', settings: '/home' };
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

    const iconHTML = (item) => {
      if (item.iconSrc) {
        const extra = item.navIconClass ? ` ${item.navIconClass}` : '';
        const w = item.iconImgWidth != null ? item.iconImgWidth : 16;
        const h = item.iconImgHeight != null ? item.iconImgHeight : 16;
        const src = _navSidebarIconUrl(item.iconSrc);
        return `<img src="${src}" class="nav-icon nav-icon-img${extra}" alt="" width="${w}" height="${h}">`;
      }
      return `<i class="fas ${item.icon} nav-icon"></i>`;
    };

    const mainHTML = SIDEBAR_USER_CONFIG.main.map((item) => {
      if (item.type === 'section') {
        return `<div class="nav-section-label" aria-hidden="true">${_escapeHtml(item.label)}</div>`;
      }
      if (item.type === 'page') {
        const href = full(item.route);
        const isPrimary = !!item.primary;
        const hideLabel = !!item.hideLabel;
        const ariaLabel = hideLabel ? ` aria-label="${_escapeHtml(item.label)}"` : '';
        const idAttr = item.navId ? ` id="${_escapeHtml(item.navId)}"` : '';
        const hiddenStyle = item.hidden ? ' style="display:none"' : '';
        return `
          <div class="nav-item${isPrimary ? ' nav-item--primary' : ''}">
            <a href="${href}" class="nav-link nav-main-link${isPrimary ? ' nav-link--primary' : ''}${hideLabel ? ' nav-link--no-label' : ''}"${idAttr}${hiddenStyle}${ariaLabel} data-route="${href}" data-tooltip="${item.label}">
              ${iconHTML(item)}
              ${hideLabel ? '' : `<span class="nav-text">${item.label}</span>`}
            </a>
          </div>`;
      }
      const isOpen = expandedId === item.id;
      if (item.id === 'brand-storage') {
        const storageHref = full('brand-storage');
        const subHtml = this._buildBrandStorageSubmenuChildrenHtml();
        return `
        <div class="nav-item has-submenu nav-brand-storage-wrap ${isOpen ? 'submenu-open' : ''}" id="navBrandStorageContainer" style="display:none" data-container-id="brand-storage">
          <div class="nav-brand-storage-head">
            <a href="${storageHref}" class="nav-link nav-main-link nav-brand-storage-page" data-route="${storageHref}" data-tooltip="${_escapeHtml(item.label)}">
              ${iconHTML(item)}
              <span class="nav-text">${_escapeHtml(item.label)}</span>
            </a>
            <button type="button" class="nav-submenu-toggle nav-brand-storage-expand-btn" data-tooltip="Sub-marcas" aria-expanded="${isOpen}" aria-controls="nav-sub-brand-storage">
              <i class="fas fa-chevron-right nav-chevron" aria-hidden="true"></i>
            </button>
          </div>
          <div class="nav-submenu" id="nav-sub-brand-storage" role="group" aria-label="${_escapeHtml(item.label)}">
            ${subHtml}
          </div>
        </div>`;
      }
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
          (c) => {
            const idAttr = c.navId ? ` id="${_escapeHtml(c.navId)}"` : '';
            const hiddenStyle = c.hidden ? ' style="display:none"' : '';
            return `
            <a href="${full(c.route)}" class="nav-submenu-link"${idAttr}${hiddenStyle} data-route="${full(c.route)}" data-tooltip="${c.label}">
              <span>${c.label}</span>
            </a>`;
          }
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
      ? `<img src="${_navSidebarIconUrl(f.iconSrc)}" class="nav-icon nav-icon-img" alt="" width="16" height="16">`
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
            <h1 class="header-title" id="headerTitle">PRODUCTION</h1>
          </div>
          <div class="header-right">
            <div class="header-user-menu-wrap">
              ${this.getHeaderNotificationsButtonGroupHTML()}
              <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
                <i class="fas fa-chevron-down"></i>
              </button>
              ${this.getUserDropdownHTML('/home')}
            </div>
          </div>
        </div>
        <div class="header-production-slot" id="headerProductionSlot" aria-hidden="true"></div>
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
            <div class="nav-org-credits-row">
              <span class="nav-org-credits-label">credits</span>
              <span class="nav-org-credits-value" id="navTokensValue">—</span>
            </div>
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
    const iconHTML = (item) => {
      if (item.iconSrc) {
        const src = _navSidebarIconUrl(item.iconSrc);
        return `<img src="${src}" class="nav-icon nav-icon-img" alt="" width="16" height="16">`;
      }
      return `<i class="fas ${item.icon} nav-icon"></i>`;
    };

    const mainHTML = SIDEBAR_DEVELOPER_CONFIG.map((item) => {
      const isLead = item.role_required === 'lead';
      if (item.type === 'section') {
        const sectionClass = isLead ? 'nav-section-label nav-lead-only' : 'nav-section-label';
        const sectionAttrs = isLead ? ' style="display:none"' : '';
        return `<div class="${sectionClass}"${sectionAttrs} aria-hidden="true">${_escapeHtml(item.label)}</div>`;
      }
      const wrapClass = isLead ? 'nav-item has-submenu nav-lead-only nav-dev-lead-section' : 'nav-item has-submenu';
      const attrs = isLead ? ` style="display: none;"` : '';

      if (item.type === 'page') {
        const pageClass = isLead ? 'nav-item nav-lead-only' : 'nav-item';
        const pageAttrs = isLead ? ' style="display: none;"' : '';
        return `
          <div class="${pageClass}"${pageAttrs}>
            <a href="${item.route}" class="nav-link" data-route="${item.route}" data-tooltip="${item.label}">
              ${iconHTML(item)}
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
            ${iconHTML(item)}
            <span class="nav-text">${item.label}</span>
            <i class="fas fa-chevron-right nav-chevron" aria-hidden="true"></i>
          </button>
          <div class="nav-submenu" id="nav-dev-sub-${item.id}" role="group" aria-label="${item.label}">
            ${children}
          </div>
        </div>`;
    }).join('');

    const devPrimaryActionsHTML = `
      <div class="nav-dev-primary-actions" role="group" aria-label="Acciones rápidas desarrollador">
        <div class="nav-item nav-item--primary nav-lead-only" style="display:none">
          <a href="/dev/provisioning/users" class="nav-link nav-main-link nav-link--primary" data-route="/dev/provisioning/users" data-tooltip="User">
            <span class="nav-text"><i class="fas fa-plus" aria-hidden="true"></i> User</span>
          </a>
        </div>
        <div class="nav-item nav-item--primary">
          <a href="/dev/builder" class="nav-link nav-main-link nav-link--primary" data-route="/dev/builder" data-tooltip="Flow">
            <span class="nav-text"><i class="fas fa-plus" aria-hidden="true"></i> Flow</span>
          </a>
        </div>
      </div>
    `;

    return `
      <div class="nav-overlay" id="navOverlay"></div>

      <header class="app-header with-sidebar" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <h1 class="header-title" id="headerTitle">DEVELOPER PORTAL</h1>
          </div>
          <div class="header-center header-builder-slot" id="headerBuilderSlot" aria-hidden="true"></div>
          <div class="header-right">
            <div class="header-user-menu-wrap">
              ${this.getHeaderNotificationsButtonGroupHTML()}
              <button class="user-menu-btn" id="userMenuBtn" aria-label="Menú de usuario">
                <i class="fas fa-chevron-down"></i>
              </button>
              ${this.getUserDropdownHTML('/home')}
            </div>
          </div>
        </div>
      </header>

      <nav class="side-navigation nav-mode-developer" id="sideNavigation" aria-label="Navegación desarrollador">
        <div class="nav-identity-section nav-workspace-header nav-dev-toggle-header">
          <button type="button" class="nav-sidebar-toggle" id="sidebarToggleBtn" aria-label="Abrir o cerrar menú">
            ${SIDEBAR_TOGGLE_ICON_DESPLEGADO}
          </button>
          <div class="nav-dev-header-copy">
            <h2 class="nav-org-title" id="navDevHeaderName">Developer</h2>
          </div>
        </div>

        <div class="nav-menu" role="navigation" aria-label="Menú desarrollador">
          ${devPrimaryActionsHTML}
          ${mainHTML}
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
        : '/home';
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
   * Ajusta nombre de organización:
   * 1) una línea con reducción controlada
   * 2) si no cabe, fallback a 2 líneas (primera palabra + resto)
   *
   * Importante: con text-overflow:ellipsis, scrollWidth suele igualar clientWidth aunque
   * el texto esté truncado; la comprobación debe usar ancho de texto medido, no scrollWidth.
   */
  _renderAdaptiveOrgName(name, targetId = 'navOrgName') {
    const nameEl = document.getElementById(targetId);
    if (!nameEl) return;

    const raw = String(name || '').trim();
    if (!raw) return;

    const MAX_SIZE = 32;
    const MIN_SIZE = 16;

    const layoutOnce = () => {
      nameEl.classList.remove('nav-org-title--two-lines');
      nameEl.style.removeProperty('--nav-org-title-size');
      nameEl.textContent = raw;

      const avail = nameEl.clientWidth;
      if (avail < 8) return false;

      let chosenSize = null;
      for (let size = MAX_SIZE; size >= MIN_SIZE; size -= 1) {
        const w = this._measureOrgTitleLineWidth(raw, size, nameEl);
        if (w <= avail + 1) {
          chosenSize = size;
          break;
        }
      }

      if (chosenSize != null) {
        nameEl.style.setProperty('--nav-org-title-size', `${chosenSize}px`);
        return true;
      }

      this._applyTwoLineOrgName(nameEl, raw, MAX_SIZE);
      return true;
    };

    const run = () => {
      if (!layoutOnce()) {
        requestAnimationFrame(() => {
          layoutOnce();
          requestAnimationFrame(() => layoutOnce());
        });
      }
    };

    run();
    requestAnimationFrame(run);
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(run).catch(() => {});
    }
  }

  _applyTwoLineOrgName(nameEl, raw, maxSize = 32) {
    if (!nameEl) return;
    nameEl.classList.add('nav-org-title--two-lines');
    const maxWidth = Math.max(1, nameEl.clientWidth);
    const words = raw.split(/\s+/).filter(Boolean);

    if (words.length < 2) {
      nameEl.style.setProperty('--nav-org-title-size', `${Math.min(maxSize, 22)}px`);
      nameEl.innerHTML = _escapeHtml(raw);
      return;
    }

    let chosen = _formatOrgNameTwoLines(raw);
    for (let size = maxSize; size >= 16; size -= 1) {
      nameEl.style.setProperty('--nav-org-title-size', `${size}px`);
      const lines = this._getBestTwoLineSplit(words, maxWidth, size, nameEl);
      if (lines && lines[0] && lines[1]) {
        const line1W = this._measureOrgTitleLineWidth(lines[0], size, nameEl);
        const line2W = this._measureOrgTitleLineWidth(lines[1], size, nameEl);
        chosen = `${_escapeHtml(lines[0])}<br>${_escapeHtml(lines[1])}`;
        if (line1W <= maxWidth + 1 && line2W <= maxWidth + 1) break;
      }
    }
    nameEl.innerHTML = chosen;
  }

  _isOrgNameTruncated(el) {
    if (!el || el.classList.contains('nav-org-title--two-lines')) return false;
    const raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return false;
    const sizeStr = el.style.getPropertyValue('--nav-org-title-size');
    const cs = window.getComputedStyle(el);
    const size = sizeStr ? parseFloat(sizeStr) : (parseFloat(cs.fontSize) || 22);
    return this._measureOrgTitleLineWidth(raw, size, el) > el.clientWidth + 1;
  }

  _getBestTwoLineSplit(words, maxWidth, fontSizePx, nameEl) {
    if (!Array.isArray(words) || words.length < 2) return null;
    let best = null;
    for (let i = 1; i < words.length; i += 1) {
      const line1 = words.slice(0, i).join(' ');
      const line2 = words.slice(i).join(' ');
      const w1 = this._measureOrgTitleLineWidth(line1, fontSizePx, nameEl);
      const w2 = this._measureOrgTitleLineWidth(line2, fontSizePx, nameEl);
      const maxLine = Math.max(w1, w2);
      const balance = Math.abs(w1 - w2);
      const overflowPenalty = (w1 > maxWidth ? (w1 - maxWidth) : 0) + (w2 > maxWidth ? (w2 - maxWidth) : 0);
      const score = (overflowPenalty * 10) + maxLine + (balance * 0.2);
      if (!best || score < best.score) {
        best = { line1, line2, score };
      }
    }
    return best ? [best.line1, best.line2] : null;
  }

  _measureOrgTitleLineWidth(text, fontSizePx, sourceEl) {
    if (!text) return 0;
    const measurer = document.createElement('span');
    const cs = window.getComputedStyle(sourceEl);
    measurer.style.position = 'fixed';
    measurer.style.visibility = 'hidden';
    measurer.style.pointerEvents = 'none';
    measurer.style.whiteSpace = 'nowrap';
    measurer.style.fontFamily = cs.fontFamily || 'Inter, system-ui, sans-serif';
    measurer.style.fontWeight = cs.fontWeight || '700';
    measurer.style.fontSize = `${fontSizePx}px`;
    measurer.style.letterSpacing = cs.letterSpacing || 'normal';
    measurer.textContent = text;
    document.body.appendChild(measurer);
    const width = measurer.getBoundingClientRect().width;
    measurer.remove();
    return width;
  }

  /**
   * Configurar event listeners
   */
  setupEventListeners() {
    this.ensureNotificationsDropdown();
    this.ensureNotificationsModal();

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

    // User menu: abrir/cerrar #userDropdown (retraso mínimo para evitar que un listener global cierre de inmediato)
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    if (userMenuBtn && userDropdown) {
      // Portal del dropdown al body para evitar que el contexto glass del header "aplane" el backdrop-filter.
      document.querySelectorAll('#userDropdown').forEach((el) => {
        if (el !== userDropdown) el.remove();
      });
      if (userDropdown.parentElement !== document.body) {
        document.body.appendChild(userDropdown);
      }

      userMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof this.closeFlyout === 'function') this.closeFlyout();
        this.closeNotificationsDropdown();
        const willOpen = !userDropdown.classList.contains('active');
        userDropdown.classList.toggle('active');
        if (willOpen) {
          requestAnimationFrame(() => {
            const dd = document.getElementById('userDropdown');
            if (!dd || !dd.classList.contains('active')) return;
            this.positionUserDropdown(userMenuBtn, dd);
          });
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Settings en modal (no navegación de ruta)
    const settingsBtn = document.getElementById('userDropdownSettingsLink');
    if (settingsBtn && !settingsBtn.hasAttribute('data-settings-bound')) {
      settingsBtn.setAttribute('data-settings-bound', '1');
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ud = document.getElementById('userDropdown');
        if (ud) ud.classList.remove('active');
        this.openSettingsModal('account');
      });
    }

    // Un solo listener en document para cerrar todos los dropdowns (evita duplicados al re-render)
    if (!this._documentClickAttached) {
      this._documentClickAttached = true;
      document.addEventListener('click', (e) => {
        const ud = document.getElementById('userDropdown');
        const od = document.getElementById('navOrgDropdown');
        const userBtn = document.getElementById('userMenuBtn');
        const clickedInsideUserDropdown = ud && (ud.contains(e.target) || (userBtn && userBtn.contains(e.target)));
        const clickedInsideOrgDropdown = od && od.contains(e.target);
        const nd = document.getElementById('notificationsDropdown');
        const notifBtn = document.getElementById('headerNotificationsBtn');
        const notifWrap = document.querySelector('.header-notifications-wrap');
        const clickedInsideNotifications =
          nd &&
          (nd.contains(e.target) ||
            (notifBtn && notifBtn.contains(e.target)) ||
            (notifWrap && notifWrap.contains(e.target)));
        if (ud && !clickedInsideUserDropdown) ud.classList.remove('active');
        if (od && !clickedInsideOrgDropdown) od.classList.remove('active');
        if (nd && !clickedInsideNotifications) {
          this.closeNotificationsDropdown();
        }
      });
    }

    // Actualizar créditos del sidebar cuando otra vista los modifica (compra, uso en Studio)
    if (!this._creditsUpdatedAttached) {
      this._creditsUpdatedAttached = true;
      document.addEventListener('credits-updated', () => this.refreshCredits());
    }

    /* Delegación en document: notificaciones abren modal global (UX unificada). */
    if (!this._notificationsClickDelegation) {
      this._notificationsClickDelegation = true;
      document.addEventListener(
        'click',
        (e) => {
          const btn = e.target.closest('.nav-footer-btn[data-flyout="notifications"]');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          this.openNotificationsModal();
        },
        false
      );
    }

    document.querySelectorAll('.nav-link[data-route]:not([data-nav-bound]), .nav-main-link[data-route]:not([data-nav-bound]), .nav-submenu-link[data-route]:not([data-nav-bound]), .nav-footer-link[data-route]:not([data-nav-bound]), #userDropdown a[data-route]:not(#userDropdownSettingsLink):not([data-nav-bound])').forEach((link) => {
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

    // Escuchar cambios de ruta (solo una vez para no acumular).
    // No usar popstate → this.render(): el router ya llama a appNavigation.render() dentro de handleRoute;
    // un segundo render aquí causaba parpadeo/doble carga.
    if (!this._routeListenersAttached) {
      this._routeListenersAttached = true;
      window.addEventListener('routechange', () => {
        this.updateActiveLink();
        this.updateHeaderTitle();
      });
    }
    if (!this._userDropdownPositionAttached) {
      this._userDropdownPositionAttached = true;
      const reposition = () => {
        const btn = document.getElementById('userMenuBtn');
        const dd = document.getElementById('userDropdown');
        if (!btn || !dd || !dd.classList.contains('active')) return;
        this.positionUserDropdown(btn, dd);
      };
      const repositionHeaderPopovers = () => {
        reposition();
        this.repositionOpenNotificationsDropdown();
      };
      window.addEventListener('resize', repositionHeaderPopovers);
      window.addEventListener('scroll', repositionHeaderPopovers, true);
    }
    if (!this._orgNameResizeAttached) {
      this._orgNameResizeAttached = true;
      window.addEventListener('resize', () => {
        if (this.currentMode === 'user') {
          const name = this._orgCache?.name || document.getElementById('navOrgName')?.textContent || '';
          this._renderAdaptiveOrgName(name, 'navOrgName');
          return;
        }
        if (this.currentMode === 'developer') {
          const name = document.getElementById('navDevHeaderName')?.textContent || '';
          this._renderAdaptiveOrgName(name, 'navDevHeaderName');
        }
      });
    }

    this.setupCollapsedTooltips();
    this.setupFlyoutCloseListeners();
    this.ensureSettingsModal();

    if (!this._notificationsUpdatedAttached) {
      this._notificationsUpdatedAttached = true;
      document.addEventListener('notifications-updated', () => this.refreshNotificationsBadge());
    }
  }

  /**
   * Posiciona #userDropdown en fixed, desacoplado del header para preservar blur real.
   */
  positionUserDropdown(triggerBtn, dropdownEl) {
    if (!triggerBtn || !dropdownEl) return;
    const rect = triggerBtn.getBoundingClientRect();
    const GAP = 8;
    const MARGIN = 12;
    const top = Math.max(MARGIN, rect.bottom + GAP);
    const right = Math.max(MARGIN, window.innerWidth - rect.right);
    dropdownEl.style.top = `${top}px`;
    dropdownEl.style.right = `${right}px`;
    dropdownEl.style.left = 'auto';
    if (dropdownEl.id === 'notificationsDropdown') {
      dropdownEl.style.maxHeight = `${Math.max(200, window.innerHeight - top - MARGIN)}px`;
    }
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

  // ─────────────────────────────────────────────────────────────────────────
  // Flyout lateral + notificaciones + tooltips del sidebar colapsado:
  //   extraído a /js/components/navigation/Flyouts.mixin.js
  //
  // Métodos movidos (se aplican sobre el prototype al cargar el mixin):
  //   openFlyout, _bindFlyoutHoverClose, closeFlyout,
  //   openNotificationsFlyout, _renderNotificationsFlyoutContent,
  //   _showNotificationsFlyout, setupCollapsedTooltips,
  //   setupFlyoutCloseListeners.
  // ─────────────────────────────────────────────────────────────────────────

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

    // Solo en Builder: las pestañas se inyectan en #headerBuilderSlot por DevBuilderView.
    // Al salir de Builder, vaciar el slot para que no queden tabs en el header.
    const isBuilder = pathWithoutOrg === '/dev/builder' || pathWithoutOrg.startsWith('/dev/builder/');
    const builderSlot = document.getElementById('headerBuilderSlot');
    if (builderSlot && !isBuilder) {
      builderSlot.innerHTML = '';
      builderSlot.setAttribute('aria-hidden', 'true');
      document.getElementById('appHeader')?.classList.remove('app-header--builder');
    } else if (builderSlot && isBuilder) {
      builderSlot.setAttribute('aria-hidden', 'false');
    }

    const titles = {
      '/dashboard': 'DASHBOARD',
      '/production': 'PRODUCTION',
      '/vera': 'VERA',
      '/tasks': 'TASKS',
      '/brand': 'MARCA',
      '/brand-organization': 'MARCA',
      '/brand-storage': 'BRAND STORAGE',
      '/brandstorage': 'BRAND STORAGE',
      '/command-center': 'COMMAND CENTER',
      '/brands': 'IDENTITY',
      '/product-detail': 'IDENTITY',
      '/identities': 'IDENTITY',
      '/studio/flows': 'FLOWS',
      '/studio/catalog': 'FLOWS',
      '/studio': 'STUDIO',
      '/content': 'IDENTITY',
      '/video': 'VIDEO',
      '/organization': 'SETTINGS',
      '/credits': 'CREDITS',
      '/dev/dashboard': 'DASHBOARD',
      '/dev/flows': 'MIS FLUJOS',
      '/dev/builder': 'BUILDER',
      '/dev/test': 'TEST DE FLUJOS',
      '/dev/logs': 'LOGS',
      '/dev/webhooks': 'WEBHOOKS',
      '/dev/provisioning/users': 'REGISTRAR USUARIO',
      '/dev/lead/flows': 'TODOS LOS FLUJOS',
      '/dev/lead/team': 'EQUIPO',
      '/dev/lead/crm': 'CRM LEADS',
      '/dev/lead/categories': 'CATEGORÍAS',
      '/dev/lead/input-schemas': 'INPUT SCHEMAS',
      '/dev/lead/ai-vectors': 'BASE DE CONOCIMIENTOS IA',
      '/dev/lead/references': 'REFERENCIAS VISUALES'
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
    if (!this.isCollapsed && this.currentMode === 'user') {
      const name = this._orgCache?.name || document.getElementById('navOrgName')?.textContent || '';
      requestAnimationFrame(() => this._renderAdaptiveOrgName(name, 'navOrgName'));
    }
    if (!this.isCollapsed && this.currentMode === 'developer') {
      const name = document.getElementById('navDevHeaderName')?.textContent || '';
      requestAnimationFrame(() => this._renderAdaptiveOrgName(name, 'navDevHeaderName'));
    }
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
      : '/home';
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
          : '/home';
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
        const typeEl = document.getElementById('navOrgType');
        const tokensEl = document.getElementById('navTokensValue');
        this._renderAdaptiveOrgName('Seleccionar organización');
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
      const typeEl = document.getElementById('navOrgType');
      if (this._orgCache) this._renderAdaptiveOrgName(this._orgCache.name || '');
      if (typeEl && this._orgCache) typeEl.textContent = this._orgCache.plan || '';

      // Siempre leer créditos desde la BD (tabla organization_credits) para mostrar el valor real
      await this.loadCreditsFromDb();
      this._startCreditsRefreshInterval();
      await this.loadOrganizationsList();
      // Cargar conteo de sub-marcas para mostrar/ocultar link Brand Storage
      this.loadBrandContainersCount();
    } catch (err) {
      console.error('Error loading organization info:', err);
    }
  }

  /**
   * Carga sub-marcas (brand_containers) de la org actual, rellena el submenú de Brand Storage
   * y muestra u oculta el bloque completo (visible con 1+ sub-marcas).
   */
  async loadBrandContainersCount() {
    const orgId = this.currentOrgId;
    if (!orgId) {
      this._brandStorageSubbrands = [];
      this.updateBrandStorageLink(0);
      this.renderBrandStorageSubmenu();
      return;
    }
    try {
      const supabase = window.supabaseService
        ? await window.supabaseService.getClient()
        : window.supabase;
      if (!supabase) return;
      const { data, error } = await supabase
        .from('brand_containers')
        .select('id, nombre_marca')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      this._brandStorageSubbrands = !error && Array.isArray(data) ? data : [];
      this.updateBrandStorageLink(this._brandStorageSubbrands.length);
      this.renderBrandStorageSubmenu();
    } catch (e) {
      console.warn('Navigation: loadBrandContainersCount', e);
      this._brandStorageSubbrands = [];
      this.updateBrandStorageLink(0);
      this.renderBrandStorageSubmenu();
    }
  }

  /**
   * HTML de los ítems del submenú Brand Storage (sub-marcas) → Command Center por slug de nombre.
   */
  _buildBrandStorageSubmenuChildrenHtml() {
    const rows = Array.isArray(this._brandStorageSubbrands) ? this._brandStorageSubbrands : [];
    if (!rows.length) {
      return `<span class="nav-submenu-link nav-submenu-link--placeholder nav-submenu-link--empty" tabindex="-1"><span class="nav-submenu-muted">…</span></span>`;
    }
    return rows
      .map((r) => {
        const rawName = String((r.nombre_marca || 'Sub-marca').trim() || 'Sub-marca');
        const name = _escapeHtml(rawName);
        const slug =
          typeof window.getOrgSlug === 'function' ? window.getOrgSlug(rawName) : 'sub-marca';
        const href = _escapeHtml(this.getUserSidebarRoute(`command-center/${slug}`));
        return `<a href="${href}" class="nav-submenu-link nav-submenu-link--command-center" data-route="${href}" data-tooltip="${name}"><span>${name}</span></a>`;
      })
      .join('');
  }

  _bindBrandStorageSubmenuRouteLinks(submenuRoot) {
    if (!submenuRoot) return;
    submenuRoot.querySelectorAll('a.nav-submenu-link[data-route]:not([data-nav-bound])').forEach((link) => {
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
  }

  /** Actualiza solo el DOM del submenú (tras fetch o re-render parcial). */
  renderBrandStorageSubmenu() {
    const el = document.getElementById('nav-sub-brand-storage');
    if (!el) return;
    el.innerHTML = this._buildBrandStorageSubmenuChildrenHtml();
    this._bindBrandStorageSubmenuRouteLinks(el);
    this._lastActivePath = null;
    this.updateActiveLink();
  }

  /**
   * Muestra u oculta el bloque Brand Storage (enlace + desplegable) según el número de sub-marcas.
   * @param {number} count - Número de brand_containers de la organización
   */
  updateBrandStorageLink(count) {
    const wrap = document.getElementById('navBrandStorageContainer');
    if (wrap) wrap.style.display = count >= 1 ? '' : 'none';
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
            window.router?.navigate(prefix ? `${prefix}/production` : '/form_org');
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
        window.router?.navigate('/form_org');
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

      const profileRes = await supabase.from('profiles').select('full_name, email, dev_rank, dev_role').eq('id', user.id).maybeSingle();
      const profile = profileRes.data;

      this._devCache = { profile, userId: user.id, email: user.email };
      this._devCacheTime = Date.now();
      this._applyDevCache();
    } catch (err) {
      console.error('Error loading developer info:', err);
    }
  }

  _applyDevCache() {
    if (!this._devCache) return;
    const { profile, email } = this._devCache;

    const headerNameEl = document.getElementById('navDevHeaderName');
    if (headerNameEl) {
      const displayName = profile?.full_name?.trim() || profile?.email?.trim() || email || 'Developer';
      headerNameEl.textContent = displayName;
      this._renderAdaptiveOrgName(displayName, 'navDevHeaderName');
    }

    const leadSections = document.querySelectorAll('.nav-lead-only');
    const isLead = profile?.dev_role === 'lead';
    leadSections.forEach((section) => {
      section.style.display = isLead ? '' : 'none';
    });
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
