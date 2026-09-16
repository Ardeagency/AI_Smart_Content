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
      icon: 'aisc-ico aisc-ico--memory',
      iconSrc: '/recursos/vera/Logoverablanco.svg',
      iconSrcCollapsed: '/recursos/vera/Vera.svg',
      route: 'vera',
      primary: true,
      hideLabel: true,
      navId: 'navVeraLink',
      navIconClass: 'nav-icon-img--vera-logo',
      requireCap: 'vera.chat'
    },
    { type: 'section', label: 'Espacio de trabajo' },
    { type: 'page', id: 'dashboard', label: 'Tablero', icon: 'aisc-ico aisc-ico--growth', iconSrc: '/recursos/icons/dashboard.svg', route: 'dashboard', requireCap: 'insights.view' },
    {
      type: 'container',
      id: 'brand-storage',
      label: 'Almacenamiento',
      icon: 'aisc-ico aisc-ico--layers',
      iconSrc: '/recursos/icons/file-storage.svg',
      children: [],
      requireCap: 'brand.storage.manage'
    },
    {
      // Identidad = contenedor: el head abre la página de Identidad (ADN de marca)
      // y agrupa los bloques que la componen (Productos/Servicios/Escenarios/Personajes).
      type: 'container',
      id: 'brand-organization',
      label: 'Identidad',
      icon: 'aisc-ico aisc-ico--layers',
      iconSrc: '/recursos/icons/Brands.svg',
      route: 'brand',
      requireCap: 'brand.identity.edit',
      children: [
        { label: 'Productos', route: 'products' },
        { label: 'Servicios', route: 'services' },
        { label: 'Escenarios', route: 'places' },
        { label: 'Personajes', route: 'characters' }
      ]
    },
    {
      type: 'page',
      id: 'monitoring',
      label: 'Monitoreo',
      icon: 'aisc-ico aisc-ico--monitoring',
      iconSrc: '/recursos/icons/monitoring.svg',
      route: 'monitoring',
      requireCap: 'monitoring.view'
    },
    {
      type: 'page',
      id: 'predictor',
      label: 'Simulador',
      icon: 'aisc-ico aisc-ico--predictor',
      iconSrc: '/recursos/icons/predictor.svg',
      route: 'predictor',
      // Se reusa insights.view a proposito: el Simulador es una lectura mas
      // (mirar hacia adelante en vez de hacia atras). Inventar un permiso nuevo
      // que no exista en el enum lo dejaria invisible o roto.
      requireCap: 'insights.view'
    },
    { type: 'section', label: 'Crear' },
    { type: 'page', id: 'production', label: 'Producción', icon: 'aisc-ico aisc-ico--growth', iconSrc: '/recursos/icons/Production.svg', route: 'production', requireCap: 'production.create' },
    {
      type: 'page',
      id: 'tasks',
      label: 'Tareas',
      icon: 'aisc-ico aisc-ico--task',
      iconSrc: '/recursos/icons/task.svg',
      route: 'tasks',
      requireCap: 'production.create'
    },
    { type: 'page', id: 'image', label: 'Imagen', icon: 'aisc-ico aisc-ico--image', iconSrc: '/recursos/icons/image.svg', route: 'image', requireCap: 'studio.create' },
    { type: 'page', id: 'video', label: 'Video', icon: 'aisc-ico aisc-ico--play', iconSrc: '/recursos/icons/video.svg', route: 'video', requireCap: 'video.create' },
    {
      type: 'container',
      id: 'catalog',
      label: 'Flujos',
      icon: 'aisc-ico aisc-ico--grid',
      iconSrc: '/recursos/icons/flows.svg',
      children: [], // Se rellenan con content_categories (schema 218-224) en render
      requireCap: 'studio.create'
    }
  ],
  footer: [
    // Estos ítems se muestran ahora en el dropdown #userDropdown (header).
  ]
};

/* i18n-keep — los labels de navegación se renderizan vía __(item.label) (clave
   dinámica), por lo que scripts/i18n-extract.mjs no puede verlos. Se listan aquí
   como literales para que el extractor los capture y NO los marque huérfanos en
   --prune. Mantener sincronizado con SIDEBAR_USER_CONFIG.main[].label:
   __('Espacio de trabajo') __('Tablero') __('Identidad') __('Almacenamiento')
   __('Productos') __('Servicios') __('Escenarios') __('Personajes')
   __('Monitoreo') __('Crear') __('Producción') __('Tareas') __('Imagen')
   __('Video') __('Flujos') */
const SIDEBAR_USER_EXPANDED_KEY = 'sidebarUserExpanded';

/** Versión en query de iconos del sidebar (SVG/PNG); subir si el navegador/CDN sirve assets viejos sin tocar el JS. */
const NAV_SIDEBAR_ASSET_VER = '20260514a';
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


/** SVG inline para el botón toggle del sidebar (hereda color del botón). Desplegado = colapsado.svg, colapsado = desplegado.svg */
const SIDEBAR_TOGGLE_ICON_DESPLEGADO = `<svg class="nav-sidebar-toggle-icon" width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.79167 0.624996L0.624999 4.79166L4.79167 8.95833M10.625 0.624996L6.45833 4.79166L10.625 8.95833" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SIDEBAR_TOGGLE_ICON_COLAPSADO = `<svg class="nav-sidebar-toggle-icon" width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.45833 0.624996L10.625 4.79166L6.45833 8.95833M0.624999 0.624996L4.79167 4.79166L0.625 8.95833" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Navigation Component - Sistema de navegación inteligente
 * 
 * Maneja el sidebar y header según el contexto de la ruta:
 * - (Home/Hogar eliminado: tras login el usuario entra directo a su organización)
 * - /org/:org_id/...: Sidebar de organización (SaaS)
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
    this._catalogCategories = [];
    this._hasSavedFlows = false; // ¿la org tiene flujos guardados? (muestra/oculta "My Flows")
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
    // Categorías cambian rarísimo (config de la plataforma). Cache 10 min + SWR
    // → la sidebar deja de pegarle a content_categories en cada login/nav.
    try {
      const fetcher = async () => {
        const supabase = window.supabaseService
          ? await window.supabaseService.getClient()
          : window.supabase;
        if (!supabase) return [];
        // Categorias + category_ids con al menos un flow publicado en catalogo
        // (mismos filtros que FlowCatalogView). Una categoria vacia no entra al sidebar.
        // Base nueva (ADR-0052): flows.categories + flows.catalog_view (BD, 15/09).
        // Una categoría sin flujo publicado en el catálogo no entra al sidebar.
        const [catsRes, flowsRes] = await Promise.all([
          supabase.schema('flows')
            .from('categories')
            .select('id, name, is_active, position')
            .eq('is_active', true)
            .order('position', { ascending: true, nullsFirst: false })
            .order('name'),
          supabase.schema('flows')
            .from('catalog_view')
            .select('categoria')
            .eq('status', 'published')
            .eq('show_in_catalog', true)
        ]);
        if (catsRes.error) return [];
        const cats = (Array.isArray(catsRes.data) ? catsRes.data : []).map((c) => ({ id: c.id, name: c.name, is_visible: c.is_active !== false }));
        // Si la consulta de flows falla, no escondemos nada (fallback seguro).
        if (flowsRes.error || !Array.isArray(flowsRes.data)) return cats;
        const withFlows = new Set(flowsRes.data.map((f) => f.categoria).filter(Boolean));
        return cats.filter((c) => withFlows.has(c.id));
      };
      const list = window.apiClient
        ? await window.apiClient.query('nav:content_categories:v2', fetcher, { ttl: 10 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this._catalogCategories = (list || []).filter((c) => c.is_visible !== false);
      return this._catalogCategories;
    } catch (e) {
      console.warn('Navigation: no se pudieron cargar content_categories', e);
      return [];
    }
  }

  /**
   * ¿La org activa tiene flujos guardados? Decide si "My Flows" entra al sidebar
   * (mismo patron que las categorias: si esta vacio, no se muestra).
   */
  async loadHasSavedFlows() {
    try {
      if (!this.currentOrgId) { this._hasSavedFlows = false; return false; }
      const fetcher = async () => {
        const supabase = window.supabaseService ? await window.supabaseService.getClient() : window.supabase;
        if (!supabase) return 0;
        // Base nueva (ADR-0052): org_flow_saves → flows.saves.
        const { count, error } = await supabase.schema('flows')
          .from('saves')
          .select('flow_id', { count: 'exact', head: true })
          .eq('organization_id', this.currentOrgId);
        return error ? 0 : (count || 0);
      };
      const n = window.apiClient
        ? await window.apiClient.query(`nav:org_flow_saves_count:${this.currentOrgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this._hasSavedFlows = n > 0;
      return this._hasSavedFlows;
    } catch (e) {
      this._hasSavedFlows = false;
      return false;
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
    
    // Home / onboarding: solo header sin sidebar
    if (path === '/home' || path === '/hogar' || path === '/create' || path.startsWith('/create?')) {
      return { mode: 'home', showSidebar: false, showHeader: true, orgId: null, brandId: null };
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
    if (['/dashboard', '/production', '/vera', '/brands', '/product-detail', '/identities', '/products', '/services', '/places', '/characters', '/studio', '/image', '/video', '/tasks', '/organization', '/credits', '/plans', '/brand-organization', '/brand-storage', '/brandstorage', '/command-center', '/monitoring', '/predictor'].some(r => path.startsWith(r))) {
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

    // Si el modo no ha cambiado y ya está inicializado, solo actualizar enlace activo.
    // Créditos / storage / notificaciones ya se refrescan en su propio intervalo
    // (loadCreditsFromDb cada 25s + visibilitychange); no hace falta volver a pegarle
    // a la DB en cada navegación interna.
    if (this.initialized && this.currentMode === config.mode && this.currentOrgId === config.orgId) {
      this.updateActiveLink();
      this.updateHeaderTitle();
      return;
    }

    this.currentMode = config.mode;
    this.currentOrgId = config.orgId;
    this.currentBrandId = config.brandId;
    if (config.mode !== 'user') {
      this._stopCreditsRefreshInterval();
    }

    if (config.mode === 'user') {
      await Promise.all([
        this.loadCatalogCategories(),
        this.loadHasSavedFlows()
      ]);
    }

    // Renderizar según el modo
    if (config.mode === 'home') {
      this.container.innerHTML = this.getHomeHeaderHTML();
    } else if (config.mode === 'user') {
      this.container.innerHTML = this.getUserNavigationHTML();
    }

    this.initializeSidebar();
    this.setupEventListeners();
    this.setupSubmenus();
    this.updateActiveLink();
    this.updateHeaderTitle();
    this.updateBodyLayout(config);
    this.renderDemoBanner();

    // Carga de datos en paralelo: usuario + org. Cada uno actualiza el DOM
    // cuando llega; no hace falta serializarlos ni bloquear a quien llama (el
    // sidebar ya pintó con su layout en innerHTML).
    const dataTasks = [this.loadUserInfo().catch((e) => console.warn('Nav.loadUserInfo', e))];
    if (config.mode === 'user') {
      dataTasks.push(this.loadOrganizationInfo().catch((e) => console.warn('Nav.loadOrganizationInfo', e)));
    }
    if (config.showHeader) {
      this.refreshNotificationsBadge();
      this.refreshActivityBadge();
    }
    if (config.showSidebar) {
      this.refreshVeraPulse();
    }
    this.initialized = true;
    await Promise.allSettled(dataTasks);
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
   * Inyecta (o remueve) el banner "estás en modo demo" como primer hijo del
   * <body> — queda fixed arriba de TODO (sidebar, header, app-container) y
   * empuja esos elementos hacia abajo vía la clase body.has-demo-banner que
   * habilita los offsets `top: var(--demo-banner-height)` en demo.css.
   * Solo presente cuando la sesión Supabase es anónima (DemoGuard.isDemo()).
   */
  renderDemoBanner() {
    const guard = window.DemoGuard;
    const isDemo = guard && typeof guard.isDemo === 'function' && guard.isDemo();
    const existing = document.getElementById('demoBanner');

    // Mantenimiento (corte ADR-0052, pasos 1.2 y 1.9): un VALOR en runtime-config
    // (`window.AISC_MANTENIMIENTO = 'hasta las 17:30'`), no un build. Reusa la
    // franja del demo (misma altura y empuje del shell); manda sobre el demo.
    const mantenimiento = String(window.AISC_MANTENIMIENTO || '').trim();
    if (mantenimiento) {
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.id = 'demoBanner';
      banner.className = 'demo-banner demo-banner--mantenimiento';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `<span class="demo-banner__text">${__('Mantenimiento en curso ({cuando}): lo que guardes ahora puede no quedar. Volvemos enseguida.', { cuando: _escapeHtml(mantenimiento) })}</span>`;
      document.body.insertBefore(banner, document.body.firstChild);
      document.body.classList.add('has-demo-banner');
      return;
    }

    if (!isDemo) {
      if (existing) existing.remove();
      document.body.classList.remove('has-demo-banner');
      return;
    }
    if (existing) {
      document.body.classList.add('has-demo-banner');
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'demoBanner';
    banner.className = 'demo-banner';
    banner.innerHTML = `
      <span class="demo-banner__text">${__('Estás viendo {brand}, una marca de demostración — modo solo lectura', { brand: '<strong>IGNIS</strong>' })}</span>
      <a class="demo-banner__cta" href="https://aismartcontent.io/contact" target="_blank" rel="noopener">${__('Solicitar acceso →')}</a>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('has-demo-banner');
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
                data-tooltip="${__('Notificaciones')}"
                aria-label="${__('Notificaciones')}"
                id="headerNotificationsBtn"
              >
                <img src="/recursos/icons/notification.svg" class="nav-icon nav-icon-img" alt="" width="16" height="16">
              </button>
              <span class="header-notifications-badge" id="headerNotificationsBadge" hidden aria-hidden="true"></span>
            </span>`;
  }

  /* ════════════════════════════════════════════════════════════════════════
     ACTIVIDAD — panel del header (junto a notificaciones) con 2 pestañas:
       · Tareas    → vera_pending_actions (status=pending): lo que el HUMANO
                     debe hacer para optimizar su marketing.
       · Misiones  → body_missions: lo que VERA esta ejecutando autonomamente.
     Org-scoped (this.currentOrgId). Panel en portal de body para no quedar
     atrapado bajo el glass del header.
     ════════════════════════════════════════════════════════════════════════ */
  getHeaderActivityButtonGroupHTML() {
    return `
            <span class="header-activity-wrap">
              <button
                type="button"
                class="user-menu-btn nav-footer-btn"
                data-activity-btn
                data-tooltip="${__('Actividad de Vera')}"
                aria-label="${__('Actividad de Vera')}"
                id="headerActivityBtn"
              >
                <img src="/recursos/icons/Actividad.svg" class="nav-icon nav-icon-img" alt="" width="20" height="20">
              </button>
              <span class="header-activity-badge" id="headerActivityBadge" hidden aria-hidden="true"></span>
            </span>`;
  }

  ensureActivityDropdown() {
    let panel = document.getElementById('activityDropdown');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'activityDropdown';
      panel.className = 'activity-dropdown glass-black';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', __('Actividad de Vera'));
      panel.setAttribute('aria-hidden', 'true');
      panel.innerHTML = `
        <div class="activity-head">
          <span class="activity-title">${__('Actividad')}</span>
          <div class="activity-tabs" role="tablist">
            <button type="button" class="activity-tab is-active" data-activity-tab="tareas" role="tab">${__('Tareas')}</button>
            <button type="button" class="activity-tab" data-activity-tab="misiones" role="tab">${__('Misiones')}</button>
          </div>
        </div>
        <div class="activity-body" id="activityBody"></div>`;
      document.body.appendChild(panel);

      panel.querySelector('.activity-tabs')?.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-activity-tab]');
        if (!tab) return;
        panel.querySelectorAll('.activity-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
        this._activityTab = tab.dataset.activityTab;
        this._loadActivity(this._activityTab);
      });

      panel.querySelector('#activityBody')?.addEventListener('click', (e) => {
        const ap = e.target.closest('[data-act-approve]');
        if (ap) { this._resolveActivityTask(ap.closest('[data-task-id]')?.dataset.taskId, 'approve'); return; }
        const rj = e.target.closest('[data-act-dismiss]');
        if (rj) { this._resolveActivityTask(rj.closest('[data-task-id]')?.dataset.taskId, 'reject'); return; }
      });
    } else if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    return panel;
  }

  toggleActivityDropdown(btn) {
    const panel = this.ensureActivityDropdown();
    if (panel.classList.contains('active')) { this.closeActivityDropdown(); return; }
    this.closeNotificationsFlyout();
    const r = btn.getBoundingClientRect();
    const width = 384;
    let left = Math.round(r.right - width);
    if (left < 12) left = 12;
    panel.style.position = 'fixed';
    panel.style.top = `${Math.round(r.bottom + 8)}px`;
    panel.style.left = `${left}px`;
    panel.style.width = `${width}px`;
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    this._activityTab = this._activityTab || 'tareas';
    this._loadActivity(this._activityTab);
  }

  closeActivityDropdown() {
    const panel = document.getElementById('activityDropdown');
    if (panel) { panel.classList.remove('active'); panel.setAttribute('aria-hidden', 'true'); }
  }

  async _loadActivity(tab) {
    const body = document.getElementById('activityBody');
    if (!body) return;
    body.innerHTML = `<div class="activity-loading"><i class="aisc-ico fa-spin aisc-ico--loader"></i></div>`;
    const sb = await this._supabase();
    const orgId = this.currentOrgId;
    if (!sb || !orgId) { this._activityEmpty(body, 'aisc-ico aisc-ico--alert-info', 'Selecciona una marca para ver la actividad de Vera.'); return; }
    try {
      if (tab === 'misiones') {
        // Corte (D2, Vera): las misiones de v1 (body_missions) se portan con el chat de Vera.
        // Hasta entonces: en obras, sin llamadas a una tabla que no existe.
        this._activityEmpty(body, 'aisc-ico aisc-ico--clock', __('Las misiones de Vera se están trayendo a la nueva base. Vuelven con el chat.'));
      } else {
        // Base nueva (ADR-0052): ai.pending_actions (id, agent_id, action, permission, summary,
        // payload, decided_by, decided_at, approved, decision_note, created_at).
        const { data, error } = await sb.schema('ai')
          .from('pending_actions')
          .select('id,action,permission,summary,payload,decided_at,approved,decision_note,created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(40);
        if (error) throw error;
        const list = (Array.isArray(data) ? data : []).map((a) => ({
          id: a.id,
          action_type: a.action,
          vera_reasoning: a.summary || '',
          vera_confidence: null,
          priority: null,
          proposed_payload: a.payload || {},
          status: a.decided_at ? (a.approved ? 'approved' : 'rejected') : 'pending',
          created_at: a.created_at,
          expires_at: null,
          executed_at: null,
          decision_note: a.decision_note || null,
        }));
        this._renderActivityTasks(body, list);
      }
    } catch (e) {
      console.warn('[activity] load failed:', e?.message || e);
      this._activityEmpty(body, 'aisc-ico aisc-ico--alert-warning', 'No se pudo cargar la actividad.');
    }
  }

  _renderActivityTasks(body, list) {
    if (!list.length) { this._activityEmpty(body, 'aisc-ico aisc-ico--check', 'Sin actividad reciente de Vera para esta marca.'); return; }
    const byNewest = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
    // Lo que necesita decision humana (pending) va primero, ordenado por prioridad; lo demas debajo.
    const pending = list.filter((t) => t.status === 'pending')
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || byNewest(a, b));
    const rest = list.filter((t) => t.status !== 'pending').sort(byNewest);
    const section = (label, items) => items.length
      ? `<li class="activity-section"><span>${__(label)}</span><span class="activity-section-count">${items.length}</span></li>${items.map((t) => this._activityTaskItemHtml(t)).join('')}`
      : '';
    body.innerHTML = `<ol class="activity-list">${section('Acciones requeridas', pending)}${section('Actividad reciente', rest)}</ol>`;
  }

  _activityTaskItemHtml(t) {
    const meta   = this._activityActionMeta(t.action_type);
    const st     = this._activityActionStatus(t.status);
    // Completada/fallida = estado terminal → se atenua (opaco), ya no requiere atencion.
    const done   = st.kind === 'ok' || st.kind === 'fail';
    const detail = String(t.vera_reasoning || t.proposed_payload?.summary || '').trim();
    const det    = detail ? `<p class="activity-item-detail">${_escapeHtml(detail.length > 160 ? detail.slice(0, 160) + '…' : detail)}</p>` : '';
    const conf   = Number.isFinite(Number(t.vera_confidence)) ? Math.round(Number(t.vera_confidence) * 100) + '%' : '';
    // Estado primero (feed unificado: pendiente/ejecutando/completada/fallida)
    const badge  = `<span class="activity-chip activity-chip--${st.kind}">${st.label}</span>`;
    const prio   = (t.status === 'pending' && Number(t.priority) >= 8) ? `<span class="activity-chip activity-chip--prio">${__('Alta')}</span>` : '';
    // Aprobar/Descartar SOLO cuando necesita decision humana (pending)
    const actions = t.status === 'pending'
      ? `<button type="button" class="activity-mini-btn activity-mini-btn--ok" data-act-approve>${__('Aprobar')}</button>
            <button type="button" class="activity-mini-btn" data-act-dismiss>${__('Descartar')}</button>`
      : '';
    return `
      <li class="activity-item activity-item--${st.kind}${done ? ' activity-item--done' : ''}" data-task-id="${_escapeHtml(t.id)}">
        <div class="activity-card">
          <div class="activity-item-head">
            <span class="activity-item-title">${_escapeHtml(meta.title)}</span>
            <span class="activity-item-time">${_escapeHtml(this._activityTime(t.created_at))}</span>
          </div>
          ${det}
          <div class="activity-item-foot">
            ${badge}${prio}${conf ? `<span class="activity-chip">${conf}</span>` : ''}
            <span class="activity-spacer"></span>
            ${actions}
          </div>
        </div>
      </li>`;
  }

  _activityActionStatus(s) {
    const M = {
      pending:   { label: __('Pendiente'),  kind: 'wait' },
      approved:  { label: __('Aprobada'),   kind: 'run'  },
      executing: { label: __('Ejecutando'), kind: 'run'  },
      executed:  { label: __('Completada'), kind: 'ok'   },
      completed: { label: __('Completada'), kind: 'ok'   },
      failed:    { label: __('Fallida'),    kind: 'fail' },
    };
    return M[s] || { label: s || '—', kind: 'wait' };
  }

  _renderActivityMissions(body, list) {
    if (!list.length) { this._activityEmpty(body, 'aisc-ico aisc-ico--bot', 'Vera aún no ha ejecutado misiones.'); return; }
    body.innerHTML = `<ol class="activity-list">${list.map((m) => this._activityMissionItemHtml(m)).join('')}</ol>`;
  }

  _activityMissionItemHtml(m) {
    const st      = this._activityMissionStatus(m.status);
    const summary = this._missionSummary(m);
    const det     = summary ? `<p class="activity-item-detail">${_escapeHtml(summary)}</p>` : '';
    const done = st.kind === 'ok' || st.kind === 'fail';
    return `
      <li class="activity-item${done ? ' activity-item--done' : ''}">
        <div class="activity-card">
          <div class="activity-item-head">
            <span class="activity-item-title">${_escapeHtml(this._humanizeMission(m.mission_type))}</span>
            <span class="activity-item-time">${_escapeHtml(this._activityTime(m.created_at))}</span>
          </div>
          ${det}
          <div class="activity-item-foot">
            <span class="activity-chip activity-chip--${st.kind}">${st.label}</span>
          </div>
        </div>
      </li>`;
  }

  _activityEmpty(body, icon, msg) {
    body.innerHTML = `<div class="activity-empty"><i class="fas ${icon}"></i><p>${_escapeHtml(msg)}</p></div>`;
  }

  _activityActionMeta(type) {
    const M = {
      pause_campaign:             { title: 'Pausar campaña',             icon: 'aisc-ico aisc-ico--alert-warning', color: '#e06464' },
      resume_campaign:            { title: 'Reactivar campaña',          icon: 'aisc-ico aisc-ico--growth',               color: '#4cb37a' },
      launch_campaign:            { title: 'Lanzar campaña',             icon: 'aisc-ico aisc-ico--growth',               color: '#a07bd0' },
      create_brief:               { title: 'Crear brief de campaña',     icon: 'aisc-ico aisc-ico--task',           color: '#5b9bd5' },
      update_brief:               { title: 'Actualizar brief',           icon: 'aisc-ico aisc-ico--task',           color: '#5b9bd5' },
      update_persona:             { title: 'Actualizar persona',         icon: 'aisc-ico aisc-ico--audience',                color: '#a07bd0' },
      create_audience:            { title: 'Crear audiencia',            icon: 'aisc-ico aisc-ico--audience',                color: '#3fb6a8' },
      update_audience:            { title: 'Actualizar audiencia',       icon: 'aisc-ico aisc-ico--audience',                color: '#3fb6a8' },
      link_brief_to_campaign:     { title: 'Vincular brief a campaña',   icon: 'aisc-ico aisc-ico--link',                 color: '#4cb37a' },
      link_campaign_to_persona:   { title: 'Vincular campaña a persona', icon: 'aisc-ico aisc-ico--link',                 color: '#4cb37a' },
      link_segment_to_persona:    { title: 'Vincular audiencia a persona', icon: 'aisc-ico aisc-ico--link',               color: '#4cb37a' },
      update_brand_container:     { title: 'Actualizar marca',           icon: 'aisc-ico aisc-ico--sparkle',  color: '#e09145' },
      update_shopify_product_seo: { title: 'Optimizar SEO de producto',  icon: 'aisc-ico aisc-ico--search',     color: '#4cb37a' },
      adjust_price:               { title: 'Ajustar precio',             icon: 'aisc-ico aisc-ico--tag',                  color: '#e06464' },
      adjust_tone:                { title: 'Ajustar tono del contenido', icon: 'aisc-ico aisc-ico--sparkle',  color: '#00c7d6' },
    };
    return M[type] || { title: this._humanizeMission(type), icon: 'aisc-ico aisc-ico--zap', color: '#87868b' };
  }

  _activityMissionStatus(s) {
    const M = {
      completed: { label: __('Completada'), kind: 'ok',   icon: 'aisc-ico aisc-ico--check',           color: '#6bcf7f' },
      running:   { label: __('En curso'),   kind: 'run',  icon: 'fas fa-circle-notch fa-spin',   color: '#5b9bd5' },
      pending:   { label: __('En cola'),    kind: 'wait', icon: 'aisc-ico aisc-ico--history',      color: '#87868b' },
      failed:    { label: __('Fallida'),    kind: 'fail', icon: 'aisc-ico aisc-ico--alert-warning',   color: '#e06464' },
    };
    return M[s] || { label: s || '—', kind: 'wait', icon: 'aisc-ico aisc-ico--bot', color: '#87868b' };
  }

  _humanizeMission(t) {
    const map = {
      daily_briefing:             __('Briefing diario'),
      competitor_signal_analysis: __('Análisis de competencia'),
      execute_update_persona:     __('Actualización de persona'),
      opportunity_scan:           __('Escaneo de oportunidades'),
      cross_signal_synthesis:     __('Síntesis de señales'),
    };
    if (map[t]) return map[t];
    const s = String(t || __('Misión')).replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _missionSummary(m) {
    const r = m.result_reference || {};
    const txt = r.briefing_text || r.summary || r.execution_summary || '';
    return String(txt).trim().slice(0, 160);
  }

  _activityTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const mins = Math.floor((new Date() - d) / 60000);
    if (mins < 1)  return __('ahora');
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 24)    return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 7)  return `${days}d`;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }

  async _resolveActivityTask(id, op) {
    if (!id) return;
    const sb = await this._supabase();
    if (!sb) return;
    const li = document.querySelector(`#activityDropdown .activity-item[data-task-id="${id}"]`);
    if (li) { li.style.opacity = '0.45'; li.style.pointerEvents = 'none'; }
    try {
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sin sesión');
      const res = await fetch(`/api/vera/pending-actions/${id}/${op}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: op === 'reject' ? JSON.stringify({ reason: '' }) : '{}',
      });
      if (!res.ok) throw new Error((await res.text().catch(() => '')).slice(0, 200));
      li?.remove();
      this.refreshActivityBadge();
      if (!document.querySelector('#activityDropdown .activity-item[data-task-id]')) this._loadActivity('tareas');
    } catch (e) {
      console.error('[activity] resolve failed:', e?.message || e);
      if (li) { li.style.opacity = ''; li.style.pointerEvents = ''; }
    }
  }

  async refreshActivityBadge() {
    const badge = document.getElementById('headerActivityBadge');
    if (!badge) return;
    const sb = await this._supabase();
    const orgId = this.currentOrgId;
    if (!sb || !orgId) { badge.hidden = true; return; }
    try {
      // Base nueva (ADR-0052): vera_pending_actions → ai.pending_actions; pendiente = sin decidir.
      const { count, error } = await sb.schema('ai')
        .from('pending_actions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('decided_at', null);
      if (error) throw error;
      const n = Number(count) || 0;
      // Punto rojo (sin número), igual que la campana: solo señala "hay actividad pendiente".
      badge.textContent = '';
      if (n > 0) { badge.hidden = false; badge.removeAttribute('aria-hidden'); }
      else { badge.hidden = true; badge.setAttribute('aria-hidden', 'true'); }
    } catch (_) { badge.hidden = true; }
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
      panel.setAttribute('aria-label', __('Notificaciones'));
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

  /** El modal de notificaciones se retiró (ADR-0054): un solo panel, el de la campana. */
  ensureNotificationsModal() { /* sin modal */ }
  closeNotificationsModal() { /* sin modal */ }
  async openNotificationsModal() {
    const btn = document.getElementById('headerNotificationsBtn');
    if (btn && typeof this.openNotificationsFlyout === 'function') return this.openNotificationsFlyout(btn);
    return this.toggleNotificationsFlyout(document.querySelector('.nav-footer-btn[data-flyout="notifications"]'));
  }

  /* ── Notificaciones como flyout (mismo chrome que el panel de Actividad) ──
     Reemplaza el modal emergente por un dropdown anclado al boton, para
     consistencia visual con "Actividad". El contenido lo pinta Avisos.js (ADR-0054). */
  ensureNotificationsFlyout() {
    let panel = document.getElementById('notificationsFlyout');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notificationsFlyout';
      panel.className = 'activity-dropdown notifications-flyout glass-black';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', __('Notificaciones'));
      panel.setAttribute('aria-hidden', 'true');
      panel.innerHTML = `
        <div class="activity-head">
          <span class="activity-title">${__('Notificaciones')}</span>
        </div>
        <div class="activity-body" id="notificationsFlyoutBody"></div>`;
      document.body.appendChild(panel);
    } else if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    return panel;
  }

  toggleNotificationsFlyout(btn) {
    const panel = this.ensureNotificationsFlyout();
    if (panel.classList.contains('active')) { this.closeNotificationsFlyout(); return; }
    this.closeActivityDropdown();
    const r = btn.getBoundingClientRect();
    const width = 384;
    let left = Math.round(r.right - width);
    if (left < 12) left = 12;
    panel.style.position = 'fixed';
    panel.style.top = `${Math.round(r.bottom + 8)}px`;
    panel.style.left = `${left}px`;
    panel.style.width = `${width}px`;
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    this._loadNotificationsFlyout();
  }

  closeNotificationsFlyout() {
    const panel = document.getElementById('notificationsFlyout');
    if (panel) { panel.classList.remove('active'); panel.setAttribute('aria-hidden', 'true'); }
  }

  async _loadNotificationsFlyout() {
    const body = document.getElementById('notificationsFlyoutBody');
    if (!body || !window.Avisos) return;
    await window.Avisos.pintar(body, { alCerrar: () => this.closeNotificationsFlyout() });
    this.refreshNotificationsBadge();
  }

  async _supabase() {
    let sb = window.authService?.supabase;
    if (!sb?.rpc && window.supabaseService?.getClient) {
      try { sb = await window.supabaseService.getClient(); } catch (_) { sb = null; }
    }
    return sb?.rpc ? sb : null;
  }

  _currentUserId() {
    return window.authService?.getCurrentUser?.()?.id || null;
  }

  /*
   * Los avisos (lectura, marcado, render por tipo, markdown) viven desde el
   * ADR-0054 en js/services/AvisosDataService.js, js/components/Avisos.js y
   * js/utils/markdown.js. Navigation solo monta la campana y refresca el punto.
   */
  _resolveActionUrl(rawUrl) {
    const u = (rawUrl || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/org/')) return u;

    const path = u.startsWith('/') ? u : `/${u}`;
    const orgId = this.currentOrgId || window.currentOrgId || null;
    const orgName = window.currentOrgName || this.currentOrgName || '';
    if (!orgId) return path;

    if (typeof window.getOrgPathPrefix === 'function') {
      const prefix = window.getOrgPathPrefix(orgId, orgName);
      if (prefix) return `${prefix}${path}`;
    }

    // Fallback manual: shortId = últimos 12 chars sin guiones; slug = name slugificado.
    const shortId = String(orgId).replace(/-/g, '').slice(-12);
    const slug = orgName
      ? String(orgName).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : 'org';
    return `/org/${shortId}/${slug}${path}`;
  }

  /**
   * Latido del boton Vera del sidebar: si Vera INICIO una conversacion que el
   * usuario aun no ha leido (notificacion type=vera_message sin leer), el boton
   * pulsa con un brillo de marca para que el usuario entienda que ella le
   * escribio. Se apaga cuando ya no quedan mensajes de Vera sin leer.
   */
  async refreshVeraPulse() {
    const link = document.getElementById('navVeraLink');
    if (!link) return;
    try {
      const orgId = this.currentOrgId || window.currentOrgId;
      const c = orgId && window.AvisosDatos ? await window.AvisosDatos.contador(orgId) : null;
      // Vera te escribió = hay avisos vivos de su familia sin leer.
      link.classList.toggle('nav-link--vera-pulse', !!(c && c.porFamilia && c.porFamilia.agent > 0));
    } catch (_) {
      link.classList.remove('nav-link--vera-pulse');
    }
  }
  async refreshNotificationsBadge() {
    const badge = document.getElementById('headerNotificationsBadge');
    if (!badge || !window.Avisos) return;
    await window.Avisos.refrescarPunto(badge);
  }
  /** Reposiciona el dropdown de notificaciones si está abierto (resize/scroll). */
  repositionOpenNotificationsDropdown() {
    const panel = document.getElementById('notificationsDropdown');
    const btn = document.getElementById('headerNotificationsBtn');
    if (!panel?.classList.contains('active') || !btn) return;
    this.positionUserDropdown(btn, panel);
  }

  getUserDropdownHTML(settingsHref = '/home') {
    return `
      <div class="user-dropdown glass-black" id="userDropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name" id="userDropdownName">${__('Usuario')}</div>
          <div class="user-dropdown-email" id="userDropdownEmail">usuario@email.com</div>
        </div>
        <div class="user-dropdown-divider"></div>
        <a href="${settingsHref}" class="user-dropdown-item" data-route="${settingsHref}" id="userDropdownSettingsLink">
          <img src="/recursos/icons/settings.svg" class="user-dropdown-item-icon" alt="" width="16" height="16">
          <span>${__('Ajustes')}</span>
        </a>
        <button class="user-dropdown-item" id="logoutBtn">
          <i class="aisc-ico aisc-ico--logout"></i>
          <span>${__('Cerrar sesión')}</span>
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
              ${this.getHeaderActivityButtonGroupHTML()}
              ${this.getHeaderNotificationsButtonGroupHTML()}
              <button class="user-menu-btn" id="userMenuBtn" aria-label="${__('Menú de usuario')}">
                <i class="aisc-ico aisc-ico--chevron-down"></i>
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
    // Créditos: con org → /org/.../credits; sin org → /credits (ambos: CreditsShopView)
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
        // Vera usa wordmark expandido + brain mark colapsado: ambas imgs en
        // el DOM, CSS muestra una según el estado del sidebar (sin reflow JS).
        if (item.iconSrcCollapsed) {
          const srcCol = _navSidebarIconUrl(item.iconSrcCollapsed);
          return `
            <img src="${src}" class="nav-icon nav-icon-img${extra} nav-icon-img--expanded" alt="" width="${w}" height="${h}">
            <img src="${srcCol}" class="nav-icon nav-icon-img nav-icon-img--vera-mark nav-icon-img--collapsed" alt="" width="16" height="16">
          `;
        }
        return `<img src="${src}" class="nav-icon nav-icon-img${extra}" alt="" width="${w}" height="${h}">`;
      }
      return `<i class="fas ${item.icon} nav-icon"></i>`;
    };

    const visibleItems = (() => {
      const items = SIDEBAR_USER_CONFIG.main.filter((item) => {
        if (!item.requireCap) return true;
        if (!window.authService?.hasPermission) return true; // fail-open mientras carga
        return window.authService.hasPermission(item.requireCap);
      });
      // Limpia secciones huérfanas (sin items visibles abajo antes del próximo section).
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type === 'section') {
          let hasFollowing = false;
          for (let j = i + 1; j < items.length; j++) {
            if (items[j].type === 'section') break;
            hasFollowing = true;
            break;
          }
          if (!hasFollowing) continue;
        }
        out.push(it);
      }
      return out;
    })();

    const mainHTML = visibleItems.map((item) => {
      if (item.type === 'section') {
        return `<div class="nav-section-label" aria-hidden="true">${_escapeHtml(item.label)}</div>`;
      }
      if (item.type === 'page') {
        const href = full(item.route);
        const isPrimary = !!item.primary;
        const hideLabel = !!item.hideLabel;
        const ariaLabel = hideLabel ? ` aria-label="${_escapeHtml(__(item.label))}"` : '';
        const idAttr = item.navId ? ` id="${_escapeHtml(item.navId)}"` : '';
        const hiddenStyle = item.hidden ? ' style="display:none"' : '';
        // Corte (ADR-0052): lo no portado se lista, pero avisa (chip) y va a «en obras».
        const enObras = !!window.EnObras?.es(`/${item.route}`);
        return `
          <div class="nav-item${isPrimary ? ' nav-item--primary' : ''}${enObras ? ' nav-item--en-obras' : ''}">
            <a href="${href}" class="nav-link nav-main-link${isPrimary ? ' nav-link--primary' : ''}${hideLabel ? ' nav-link--no-label' : ''}"${idAttr}${hiddenStyle}${ariaLabel} data-route="${href}" data-tooltip="${__(item.label)}${enObras ? ' · ' + __('en obras') : ''}">
              ${iconHTML(item)}
              ${hideLabel ? '' : `<span class="nav-text">${__(item.label)}</span>`}
              ${enObras && !hideLabel ? `<span class="nav-chip-obras" aria-label="${_escapeHtml(__('en obras'))}">${_escapeHtml(__('obras'))}</span>` : ''}
            </a>
          </div>`;
      }
      const isOpen = expandedId === item.id;
      if (item.id === 'brand-storage') {
        const storageHref = full('brand-storage');
        const subHtml = this._buildBrandStorageSubmenuChildrenHtml();
        const commandCenterIconSrc = _navSidebarIconUrl('/recursos/icons/commandcenter.svg');
        return `
        <div class="nav-item has-submenu nav-brand-storage-wrap ${isOpen ? 'submenu-open' : ''}" id="navBrandStorageContainer" style="display:none" data-container-id="brand-storage">
          <div class="nav-brand-storage-head">
            <a href="${storageHref}" class="nav-link nav-main-link nav-brand-storage-page" data-route="${storageHref}" data-tooltip="${_escapeHtml(item.label)}">
              ${iconHTML(item)}
              <span class="nav-text">${_escapeHtml(item.label)}</span>
            </a>
            <button type="button" class="nav-submenu-toggle nav-brand-storage-expand-btn" data-tooltip="Sub-marcas" aria-expanded="${isOpen}" aria-controls="nav-sub-brand-storage">
              <i class="aisc-ico nav-chevron aisc-ico--chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          <div class="nav-submenu" id="nav-sub-brand-storage" role="group" aria-label="${_escapeHtml(__(item.label))}">
            ${subHtml}
          </div>
        </div>
        <div class="nav-item${window.EnObras?.es('/command-center') ? ' nav-item--en-obras' : ''}" id="navCommandCenterSingle" style="display:none">
          <a href="#" class="nav-link nav-main-link" id="navCommandCenterSingleLink" data-route="" data-tooltip="${__('Marketing')}${window.EnObras?.es('/command-center') ? ' · ' + __('en obras') : ''}">
            <img src="${commandCenterIconSrc}" class="nav-icon nav-icon-img" alt="" width="16" height="16">
            <span class="nav-text">${__('Marketing')}</span>
            ${window.EnObras?.es('/command-center') ? `<span class="nav-chip-obras" aria-label="${_escapeHtml(__('en obras'))}">${_escapeHtml(__('obras'))}</span>` : ''}
          </a>
        </div>`;
      }
      if (item.id === 'catalog') {
        // Flows sigue el contrato unificado de Brand Storage: el item padre es a la
        // vez el link a "All" (studio/flows) y el toggle de la sección. Clic en el
        // label → navega a All y, vía updateActiveLink, despliega las categorías.
        const catalogHref = full('studio/flows');
        const savedHref = full('studio/flows/saved');
        const cats = Array.isArray(this._catalogCategories) ? this._catalogCategories : [];
        // "My Flows" = flujos guardados (org_flow_saves). Solo entra al sidebar si
        // la org tiene guardados (mismo patron que una categoria vacia: se oculta).
        const myFlowsChild = this._hasSavedFlows ? `
            <a href="${savedHref}" class="nav-submenu-link nav-submenu-link--myflows" data-route="${savedHref}" data-tooltip="My Flows">
              <span>${__('My Flows')}</span>
            </a>` : '';
        const catChildren = myFlowsChild + cats
          .map((c) => {
            const route = full(`studio/flows/${c.id}`);
            return `
            <a href="${route}" class="nav-submenu-link" data-route="${route}" data-tooltip="${_escapeHtml(c.name)}">
              <span>${_escapeHtml(c.name)}</span>
            </a>`;
          })
          .join('');
        return `
        <div class="nav-item has-submenu nav-flows-wrap ${isOpen ? 'submenu-open' : ''}" data-container-id="catalog">
          <div class="nav-flows-head">
            <a href="${catalogHref}" class="nav-link nav-main-link nav-flows-page" data-route="${catalogHref}" data-tooltip="${__(item.label)}">
              ${iconHTML(item)}
              <span class="nav-text">${__(item.label)}</span>
            </a>
            <button type="button" class="nav-submenu-toggle nav-flows-expand-btn" data-tooltip="${__(item.label)}" aria-expanded="${isOpen}" aria-controls="nav-sub-catalog">
              <i class="aisc-ico nav-chevron aisc-ico--chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          <div class="nav-submenu" id="nav-sub-catalog" role="group" aria-label="${__(item.label)}">
            ${catChildren}
          </div>
        </div>`;
      }
      let childItems = item.children || [];
      const children = childItems
        .map(
          (c) => {
            const idAttr = c.navId ? ` id="${_escapeHtml(c.navId)}"` : '';
            const hiddenStyle = c.hidden ? ' style="display:none"' : '';
            return `
            <a href="${full(c.route)}" class="nav-submenu-link"${idAttr}${hiddenStyle} data-route="${full(c.route)}" data-tooltip="${__(c.label)}">
              <span>${__(c.label)}</span>
            </a>`;
          }
        )
        .join('');
      // Contenedor con `route` → dual-head (link a la página + chevron que
      // despliega los hijos), reutilizando el patrón/clases de Flujos. Sin
      // `route` → toggle simple.
      const headHtml = item.route
        ? `
          <div class="nav-flows-head">
            <a href="${full(item.route)}" class="nav-link nav-main-link nav-flows-page" data-route="${full(item.route)}" data-tooltip="${__(item.label)}">
              ${iconHTML(item)}
              <span class="nav-text">${__(item.label)}</span>
            </a>
            <button type="button" class="nav-submenu-toggle nav-flows-expand-btn" data-tooltip="${__(item.label)}" aria-expanded="${isOpen}" aria-controls="nav-sub-${item.id}">
              <i class="aisc-ico nav-chevron aisc-ico--chevron-right" aria-hidden="true"></i>
            </button>
          </div>`
        : `
          <button type="button" class="nav-link nav-submenu-toggle" data-tooltip="${__(item.label)}" aria-expanded="${isOpen}" aria-controls="nav-sub-${item.id}">
            ${iconHTML(item)}
            <span class="nav-text">${__(item.label)}</span>
            <i class="aisc-ico nav-chevron aisc-ico--chevron-right" aria-hidden="true"></i>
          </button>`;
      return `
        <div class="nav-item has-submenu ${item.route ? 'nav-flows-wrap ' : ''}${isOpen ? 'submenu-open' : ''}" data-container-id="${item.id}">
          ${headHtml}
          <div class="nav-submenu" id="nav-sub-${item.id}" role="group" aria-label="${__(item.label)}">
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
          <button type="button" class="nav-footer-link nav-footer-btn" data-flyout="notifications" data-tooltip="${__(f.label)}" aria-label="${__(f.label)}">
            ${footerIconHTML(f)}
            <span class="nav-text">${__(f.label)}</span>
          </button>`;
      }
      const href = full(f.route);
      return `
        <a href="${href}" class="nav-footer-link" data-route="${href}" data-tooltip="${__(f.label)}">
          ${footerIconHTML(f)}
          <span class="nav-text">${__(f.label)}</span>
        </a>`;
    }).join('');

    return `
      <div class="nav-overlay" id="navOverlay"></div>

      <header class="app-header with-sidebar" id="appHeader">
        <div class="header-content">
          <div class="header-left">
            <button type="button" class="header-hamburger" id="headerHamburger" aria-label="${__('Abrir menú')}" aria-controls="sideNavigation" aria-expanded="false">
              <i class="aisc-ico aisc-ico--menu"></i>
            </button>
            <h1 class="header-title" id="headerTitle">PRODUCTION</h1>
          </div>
          <div class="header-right">
            <div class="header-user-menu-wrap">
              ${this.getHeaderActivityButtonGroupHTML()}
              ${this.getHeaderNotificationsButtonGroupHTML()}
              <button class="user-menu-btn" id="userMenuBtn" aria-label="${__('Menú de usuario')}">
                <i class="aisc-ico aisc-ico--chevron-down"></i>
              </button>
              ${this.getUserDropdownHTML('/home')}
            </div>
          </div>
        </div>
        <div class="header-production-slot" id="headerProductionSlot" aria-hidden="true"></div>
      </header>

      <nav class="side-navigation nav-mode-user" id="sideNavigation" aria-label="${__('Navegación principal')}">
        <div class="nav-workspace-header nav-identity-section" id="navWorkspaceHeader">
          <h2 class="nav-org-title" id="navOrgName">${__('Mi Organización')}</h2>
          <span class="nav-org-plan" id="navOrgPlan" aria-label="${__('Plan de la organización')}"></span>
          <a href="${this.getUserSidebarRoute('credits')}" class="nav-org-credits" id="navOrgCreditsBlock" data-route="${this.getUserSidebarRoute('credits')}" aria-label="${__('Ir a créditos')}">
            <div class="nav-org-credits-row">
              <span class="nav-org-credits-label">${__('créditos')}</span>
              <span class="nav-org-credits-value" id="navTokensValue">—</span>
            </div>
            <div class="nav-org-credits-bar" aria-hidden="true"><div class="nav-org-credits-bar-fill" style="width:0%"></div></div>
          </a>
          <div class="nav-credits-vertical" aria-hidden="true">
            <div class="nav-credits-vertical-fill" style="height:0%"></div>
          </div>
        </div>

        <div class="nav-menu" role="navigation" aria-label="${__('Navegación del workspace')}">
          ${mainHTML}
        </div>

        <div class="nav-spacer" aria-hidden="true"></div>

        ${footerHTML ? `<div class="nav-footer" role="navigation" aria-label="${__('Administración organizacional')}">${footerHTML}</div>` : ''}

        <div class="nav-plan-card" id="navPlanCard">
          <span class="nav-system-stats-value" id="navStorageValue" hidden>—</span>
          <div class="nav-plan-card-heading">
            <span class="nav-plan-card-title">${__('Actualiza tu plan')}</span>
            <span class="nav-plan-card-name" id="navPlanName">—</span>
          </div>
          <a href="${this.getUserSidebarRoute('plans')}"
             class="nav-plan-card-cta"
             id="navUpgradeBtn"
             data-route="${this.getUserSidebarRoute('plans')}"
             aria-label="${__('Mejorar plan')}"
             title="${__('Mejorar plan')}">
            <i class="aisc-ico aisc-ico--flecha-landing-1-seccion-2 nav-plan-card-arrow" aria-hidden="true"></i>
          </a>
        </div>

        <div class="nav-footer-links" role="navigation" aria-label="${__('Atajos')}">
          <a href="${this.getUserSidebarRoute('organization')}" class="nav-footer-link" data-route="${this.getUserSidebarRoute('organization')}">
            <img src="${_navSidebarIconUrl('/recursos/icons/organization.svg')}" class="nav-icon nav-icon-img" width="16" height="16" alt="">
            <span class="nav-text">${__('Organización')}</span>
          </a>
          <a href="${this.getUserSidebarRoute('plans')}" class="nav-footer-link" data-route="${this.getUserSidebarRoute('plans')}">
            <img src="${_navSidebarIconUrl('/recursos/icons/Planes.svg')}" class="nav-icon nav-icon-img" width="16" height="16" alt="">
            <span class="nav-text">${__('Planes')}</span>
          </a>
          <a href="${this.getUserSidebarRoute('credits')}" class="nav-footer-link" data-route="${this.getUserSidebarRoute('credits')}">
            <img src="${_navSidebarIconUrl('/recursos/icons/credits.svg')}" class="nav-icon nav-icon-img" width="16" height="16" alt="">
            <span class="nav-text">${__('Créditos')}</span>
          </a>
        </div>

        <div class="nav-brand-footer" role="contentinfo">
          <span class="nav-brand-footer-logo-link" aria-hidden="true">
            <img src="${_navSidebarIconUrl('/recursos/logos/logo-03.svg')}" class="nav-brand-footer-logo" alt="">
          </span>
          <button type="button" class="nav-sidebar-toggle" id="sidebarToggleBtn" aria-label="${__('Abrir o cerrar menú')}">
            ${SIDEBAR_TOGGLE_ICON_DESPLEGADO}
          </button>
        </div>
      </nav>
      <div class="nav-flyout" id="navFlyout" aria-hidden="true"></div>
    `;
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

    const MAX_SIZE = 24;
    const MIN_SIZE = 14;

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

      // Si no cabe ni en MIN_SIZE: dejar al texto en MIN_SIZE y que el CSS
      // (white-space:nowrap + text-overflow:ellipsis) lo trunque con "…".
      // Antes hacíamos fallback a two-lines, lo cual rompía el layout
      // del header de altura fija 100px y hacía que el nombre se viera
      // partido aunque cupiera en una línea.
      nameEl.style.setProperty('--nav-org-title-size', `${MIN_SIZE}px`);
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

  _applyTwoLineOrgName(nameEl, raw, maxSize = 24) {
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
    for (let size = maxSize; size >= 14; size -= 1) {
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

    // Hamburger del header (móvil): abre/cierra el drawer sobre el contenido.
    const headerHamburger = document.getElementById('headerHamburger');
    if (headerHamburger) {
      headerHamburger.addEventListener('click', () => this.toggleMobileNav());
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

      // Cierre instantáneo del dropdown al activar cualquier acción interna
      // (links, botones, radios del switcher Consumidor/Desarrollador). Antes
      // cada handler individual era responsable de cerrarlo y algunos no lo
      // hacían (ej. logout). Usamos `click` (NO pointerdown — pointerdown
      // ponía el dropdown en display:none antes de que el browser disparara
      // la default action del radio/label, así que el change event nunca
      // corría y la navegación Consumidor/Desarrollador quedaba bloqueada).
      // requestAnimationFrame defiere el cierre 1 frame para que la default
      // action del browser (toggle del radio + dispatch del change event) se
      // ejecute antes de que el dropdown salga del layout.
      if (!userDropdown._closeOnActionBound) {
        userDropdown._closeOnActionBound = true;
        const closeOnAction = (e) => {
          const actionable = e.target.closest('a, button, input[type="radio"], label');
          if (actionable && userDropdown.contains(actionable)) {
            requestAnimationFrame(() => userDropdown.classList.remove('active'));
          }
        };
        userDropdown.addEventListener('click', closeOnAction);
      }
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
          if (btn) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleNotificationsFlyout(btn);
            return;
          }
          const panel = document.getElementById('notificationsFlyout');
          if (panel && panel.classList.contains('active') && !panel.contains(e.target)) {
            this.closeNotificationsFlyout();
          }
        },
        false
      );
    }

    /* Delegación en document: boton de Actividad abre/cierra su panel propio.
       Click fuera del panel lo cierra. */
    if (!this._activityClickDelegation) {
      this._activityClickDelegation = true;
      document.addEventListener(
        'click',
        (e) => {
          const btn = e.target.closest('[data-activity-btn]');
          if (btn) { e.preventDefault(); e.stopPropagation(); this.toggleActivityDropdown(btn); return; }
          const panel = document.getElementById('activityDropdown');
          if (panel && panel.classList.contains('active') && !panel.contains(e.target)) {
            this.closeActivityDropdown();
          }
        },
        false
      );
    }

    document.querySelectorAll('.nav-link[data-route]:not([data-nav-bound]), .nav-main-link[data-route]:not([data-nav-bound]), .nav-submenu-link[data-route]:not([data-nav-bound]), .nav-footer-link[data-route]:not([data-nav-bound]), #userDropdown a[data-route]:not(#userDropdownSettingsLink):not([data-nav-bound])').forEach((link) => {
      link.setAttribute('data-nav-bound', '1');

      // Resolver el path una sola vez por enlace (lo usamos tanto para prefetch
      // como para navigate). El prefetch carga los scripts de la vista en cuanto
      // el cursor pasa por encima — cuando el usuario hace click, ya están en caché.
      const resolvePath = () => {
        const route = link.dataset.route || (link.getAttribute && link.getAttribute('href'));
        if (!route) return null;
        return route.indexOf('/') === 0 ? route : new URL(route, window.location.origin).pathname;
      };

      const triggerPrefetch = () => {
        if (link._prefetchTriggered) return;
        link._prefetchTriggered = true;
        const path = resolvePath();
        if (path && window.router && typeof window.router.prefetch === 'function') {
          // requestIdleCallback evita competir con interacciones inmediatas; fallback a setTimeout 0.
          const fire = () => window.router.prefetch(path);
          if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(fire, { timeout: 250 });
          } else {
            setTimeout(fire, 0);
          }
        }
      };
      link.addEventListener('pointerenter', triggerPrefetch);
      link.addEventListener('focus', triggerPrefetch);
      link.addEventListener('touchstart', triggerPrefetch, { passive: true });

      link.addEventListener('click', (e) => {
        e.preventDefault();
        const path = resolvePath();
        if (path && window.router) window.router.navigate(path);
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
        // Cerrar paneles de header (Actividad/Notificaciones/flyouts) al navegar:
        // viven en portal fixed; sin esto quedaban flotando sobre la vista nueva
        // si la navegacion no fue por click (teclado, back, navegacion programatica).
        try { this.closeActivityDropdown?.(); } catch (_) {}
        try { this.closeNotificationsFlyout?.(); } catch (_) {}
        try { this.closeNotificationsDropdown?.(); } catch (_) {}
        try { this.closeFlyout?.(); } catch (_) {}
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
      });
    }

    this.setupCollapsedTooltips();
    this.setupFlyoutCloseListeners();
    this.ensureSettingsModal();

    if (!this._notificationsUpdatedAttached) {
      this._notificationsUpdatedAttached = true;
      document.addEventListener('notifications-updated', () => {
        this.refreshNotificationsBadge();
        this.refreshVeraPulse();
      });
    }

    // Sondeo ligero para que una notificacion recien creada por Vera (nuevo
    // hilo iniciado por ella) se refleje pronto — badge de la campana + latido
    // del boton Vera — aunque el usuario este quieto en una pagina. Solo con la
    // pestaña visible, para no consultar en background. Navigation es singleton
    // (vive toda la sesion), asi que el intervalo no fuga.
    if (!this._notificationsPollAttached) {
      this._notificationsPollAttached = true;
      setInterval(() => {
        if (document.hidden) return;
        this.refreshNotificationsBadge();
        this.refreshVeraPulse();
      }, 60000);
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
      document.querySelectorAll('.nav-mode-user .nav-item.has-submenu.submenu-open').forEach((item) => {
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

    /* Brand Storage en colapsado: el chevron está oculto, así que el page link
       (icono de carpeta) también dispara el flyout para que se comporte como Flows. */
    const hoverTriggers = document.querySelectorAll(
      '.nav-submenu-toggle:not([data-hover-bound]), .nav-brand-storage-page:not([data-hover-bound]), .nav-flows-page:not([data-hover-bound])'
    );
    hoverTriggers.forEach((trigger) => {
      trigger.setAttribute('data-hover-bound', '1');
      const parent = trigger.closest('.nav-item.has-submenu');
      if (!parent) return;
      trigger.addEventListener('mouseenter', () => {
        if (!sidebar?.classList.contains('collapsed')) return;
        clearTimeout(this._flyoutCloseTimer);
        this._flyoutCloseTimer = null;
        this._flyoutHoverTimer = setTimeout(() => this.openFlyout(parent), 120);
      });
      trigger.addEventListener('mouseleave', () => {
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

    links.forEach(link => {
      link.classList.remove('active');
      // Limpiar aria-current de runs anteriores; lo seteamos solo en el bestMatch abajo.
      link.removeAttribute('aria-current');
    });
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
      // aria-current="page" → screen readers anuncian "current page" en este link.
      bestMatch.setAttribute('aria-current', 'page');
      const parent = bestMatch.closest('.has-submenu');
      if (parent) {
        parent.classList.add('submenu-open');
        const toggle = parent.querySelector('.nav-submenu-toggle');
        if (toggle) toggle.classList.add('active');
      }
    }
  }

  /** Forzar re-evaluacion del item activo (invalida cache). Usado cuando data-route
    *  de los links cambia despues del primer render. */
  resyncActiveLink() {
    this._lastActivePath = null;
    this.updateActiveLink();
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

    // Rutas cliente: clave en español envuelta en __() (modelo "español como clave").
    const titles = {
      '/dashboard': __('TABLERO'),
      '/production': __('PRODUCCIÓN'),
      '/vera': 'VERA',
      '/tasks': __('TAREAS'),
      '/predictor': __('PREDICTOR'),
      '/brand': __('MARCA'),
      '/brand-organization': __('MARCA'),
      '/brand-storage': __('ALMACENAMIENTO'),
      '/brandstorage': __('ALMACENAMIENTO'),
      '/command-center': __('MARKETING'),
      '/brands': __('IDENTIDAD'),
      '/product-detail': __('PRODUCTO'),
      '/products': __('PRODUCTOS'),
      '/services': __('SERVICIOS'),
      '/places': __('ESCENARIOS'),
      '/characters': __('PERSONAJES'),
      '/studio/flows': __('FLUJOS'),
      '/studio/catalog': __('FLUJOS'),
      '/studio': 'STUDIO',
      '/image': __('IMAGEN'),
      '/video': 'VIDEO',
      '/organization': __('AJUSTES'),
      '/credits': __('CRÉDITOS'),
      '/plans': __('PLANES'),
      '/monitoring': __('VIGILANCIA'),
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
  }

  /**
   * Colapsa el sidebar de forma temporal para vistas inmersivas (ej. Vera),
   * recordando el estado previo SIN tocar la preferencia global (localStorage).
   * Restaurar con restoreFromImmersive() al salir de la vista.
   */
  collapseForImmersive() {
    if (this._immersiveActive) return;
    const sidebar = document.getElementById('sideNavigation');
    if (!sidebar) return;
    this._immersiveActive = true;
    this._immersivePrevCollapsed = this.isCollapsed;
    if (!this.isCollapsed) {
      this.isCollapsed = true;
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      this.updateSidebarToggleIcon();
    }
  }

  /**
   * Restaura el estado del sidebar previo a collapseForImmersive().
   */
  restoreFromImmersive() {
    if (!this._immersiveActive) return;
    this._immersiveActive = false;
    const sidebar = document.getElementById('sideNavigation');
    if (!sidebar) return;
    if (this._immersivePrevCollapsed === false) {
      this.isCollapsed = false;
      sidebar.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      this.updateSidebarToggleIcon();
    }
    this._immersivePrevCollapsed = undefined;
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
    document.getElementById('headerHamburger')?.setAttribute('aria-expanded', String(this.isNavOpen));
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
    document.getElementById('headerHamburger')?.setAttribute('aria-expanded', 'false');
  }

  /**
   * Modal de confirmación para Salir de la organización. Navega a otra org o a configuración.
   */
  async showLeaveWorkspaceConfirm() {
    const msg = __('¿Salir de la organización? Serás redirigido a otra organización o a configuración.');
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

    } catch (err) {
      console.error('Error loading user info:', err);
    }
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

    // ANTES del guard de currentOrgId: en las rutas cortas ese guard hace
    // return temprano, y el paywall no puede depender de por dónde entró el
    // usuario. El propio método resuelve la org por su cuenta.
    this.revisarMensualidad();

    try {
      if (!this.currentOrgId) {
        const typeEl = document.getElementById('navOrgType');
        const tokensEl = document.getElementById('navTokensValue');
        this._renderAdaptiveOrgName(__('Seleccionar organización'));
        if (typeEl) typeEl.textContent = '';
        if (tokensEl) tokensEl.textContent = '—';
        const barFill = document.querySelector('.nav-org-credits-bar-fill');
        if (barFill) barFill.style.width = '0%';
        this._stopCreditsRefreshInterval();
        await this.loadOrganizationsList();
        return;
      }

      // Cache vía apiClient (5 min TTL + SWR). Antes había un cache ad-hoc por
      // instancia (_orgCache); con apiClient sobrevive entre renders/vistas y
      // dedupea entre callsites concurrentes. La key es por orgId.
      const orgId = this.currentOrgId;
      // Base nueva (ADR-0052): nombre y plan de la marca vienen de mi_contexto().
      await window.contextoService.cargar();
      const o = window.contextoService.org(orgId);
      const plan = String(o?.plan || 'free');
      const cached = { name: o?.name || '', plan: plan.charAt(0).toUpperCase() + plan.slice(1) };
      this._orgCache = { ...cached, credits: 0, credits_total: 0 };
      this._orgCacheId = orgId;
      this._orgCacheTime = Date.now();
      const typeEl = document.getElementById('navOrgType');
      if (this._orgCache) this._renderAdaptiveOrgName(this._orgCache.name || '');
      if (typeEl && this._orgCache) typeEl.textContent = this._orgCache.plan || '';

      // Siempre leer créditos desde la BD (tabla organization_credits) para mostrar el valor real
      await this.loadCreditsFromDb();
      // Storage usage (storage_usage). Trigger en brand_assets mantiene used_mb fresco;
      // basta con leer al cargar el sidebar (no necesita polling).
      this.loadStorageFromDb();
      this._startCreditsRefreshInterval();
      await this.loadOrganizationsList();
      // Cargar conteo de sub-marcas para mostrar/ocultar link Brand Storage
      this.loadBrandContainersCount();
      // Calcular y renderear el botón "Upgrade to X" del footer del sidebar
      this.loadUpgradeTarget();
    } catch (err) {
      console.error('Error loading organization info:', err);
    }
  }

  /** Paywall de mensualidad. Falla ABIERTA: sin veredicto, no se bloquea. */
  async revisarMensualidad() {
    try {
      if (typeof window.SubscriptionGate !== 'function') return;
      // En las rutas cortas (/dashboard, /production…) currentOrgId viene null:
      // el router solo lo puebla en /org/:short/:slug/*. Sin esta cadena —la
      // misma que usan las vistas— el muro no aparecía justo en las pantallas
      // más usadas.
      const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const orgId = [
        this.currentOrgId,
        window.currentOrgId,
        window.appState?.get?.('selectedOrganizationId'),
        (() => { try { return localStorage.getItem('selectedOrganizationId'); } catch (_) { return null; } })(),
      ].find(isUuid) || null;
      if (!orgId) { this._subGate?.destroy?.(); this._subGate = null; return; }
      const supabase = await this.getSupabase();
      if (!supabase) return;
      if (!this._subGate || this._subGate.orgId !== orgId) {
        this._subGate?.destroy?.();
        this._subGate = new window.SubscriptionGate({ supabase, orgId });
      }
      await this._subGate.revisar();
    } catch (e) {
      console.warn('[Navigation] mensualidad:', e?.message || e);
    }
  }

  /**
   * Calcula el siguiente plan de upgrade del org actual y renderea el botón del
   * footer del sidebar. Si el org está en top tier (o no hay plan siguiente),
   * el botón queda oculto.
   *
   * Lógica:
   * - Lee subscriptions.plan_id de la org → plan actual (puede ser legacy con
   *   is_active=false; se carga aparte si no está en la lista de activos).
   * - Lista plans activos ordenados por display_order; el "next" es el primer
   *   plan con display_order > current.display_order.
   * - Sin subscription activa → muestra el plan de entrada (el primero activo).
   */
  async loadUpgradeTarget() {
    const btn = document.getElementById('navUpgradeBtn');
    if (!btn) return;
    const hide = () => { btn.hidden = true; };

    const orgId = this.currentOrgId;
    if (!orgId) { hide(); return; }

    try {
      const supabase = await this.getSupabase();
      if (!supabase) { hide(); return; }

      const fetcher = async () => {
        // Base nueva (ADR-0052): el plan de la marca viene de mi_contexto() (tier) y el
        // catálogo de billing.plans (tier, name, monthly_credits): el orden es el de créditos.
        await window.contextoService.cargar();
        const tier = window.contextoService.org(orgId)?.plan || null;
        const { data: planes } = await supabase.schema('billing')
          .from('plans')
          .select('tier, name, monthly_credits')
          .order('monthly_credits', { ascending: true });
        const plansList = Array.isArray(planes) ? planes : [];
        const currentPlan = plansList.find((p) => p.tier === tier) || null;
        const curOrder = currentPlan ? (Number(currentPlan.monthly_credits) || 0) : -Infinity;
        const next = plansList.find((p) => (Number(p.monthly_credits) || 0) > curOrder) || null;
        return { next, currentName: currentPlan?.name || null, entryName: plansList[0]?.name || null };
      };

      const { next, currentName, entryName } = window.apiClient
        ? await window.apiClient.query(`nav:upgrade-target:${orgId}`, fetcher, { ttl: 5 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();

      // Plan actual (dinámico, real de la suscripción). Siempre visible como
      // chip en el header de la org.
      const planName = currentName || 'Trial';
      const planBadge = document.getElementById('navOrgPlan');
      if (planBadge) planBadge.textContent = planName;

      const card = document.getElementById('navPlanCard');
      const nameEl = document.getElementById('navPlanName');

      if (!next) {
        // Plan más alto: nada que mejorar → ocultar la tarjeta entera
        // (el plan se ve en el header).
        if (card) card.hidden = true;
        hide();
        return;
      }
      if (card) card.hidden = false;
      // El titulo es estatico ("Actualiza tu plan"); el nombre = plan SIGUIENTE.
      if (nameEl) nameEl.textContent = next.name;
      btn.setAttribute('aria-label', `Mejorar a ${next.name}`);
      btn.setAttribute('title', `Mejorar a ${next.name}`);
      btn.hidden = false;
    } catch (e) {
      console.warn('Navigation: loadUpgradeTarget', e);
      hide();
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
      // Base nueva (ADR-0052): brand_containers → markets (de mi_contexto()).
      await window.contextoService.cargar();
      const list = (window.contextoService.org(orgId)?.markets || []).map((m) => ({ id: m.id, nombre_marca: m.name }));
      this._brandStorageSubbrands = list || [];
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
   * HTML de los ítems del submenú Brand Storage (sub-marcas) → Command Center.
   * URL: /command-center/{shortId12}/{slug} — shortId garantiza unicidad cuando
   * dos sub-marcas comparten nombre (mismo slug).
   */
  _buildBrandStorageSubmenuChildrenHtml() {
    const rows = Array.isArray(this._brandStorageSubbrands) ? this._brandStorageSubbrands : [];
    if (!rows.length) {
      return `<span class="nav-submenu-link nav-submenu-link--placeholder nav-submenu-link--empty" tabindex="-1"><span class="nav-submenu-muted">…</span></span>`;
    }
    const slugFn = typeof window.getOrgSlug === 'function' ? window.getOrgSlug : () => 'sub-marca';
    const shortFn = typeof window.getBrandContainerShortId === 'function' ? window.getBrandContainerShortId : () => '';
    return rows
      .map((r) => {
        const rawName = String((r.nombre_marca || 'Sub-marca').trim() || 'Sub-marca');
        const name = _escapeHtml(rawName);
        const slug = slugFn(rawName);
        const shortId = shortFn(r.id);
        const tail = shortId ? `command-center/${shortId}/${slug}` : `command-center/${slug}`;
        const href = _escapeHtml(this.getUserSidebarRoute(tail));
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
   * - 0 sub-marcas: ambos ocultos
   * - 1 sub-marca: ítem único Command Center directo (icono commandcenter.svg)
   * - 2+ sub-marcas: desplegable Brand Storage con todas
   * @param {number} count - Número de brand_containers de la organización
   */
  updateBrandStorageLink(count) {
    const wrap = document.getElementById('navBrandStorageContainer');
    const single = document.getElementById('navCommandCenterSingle');

    if (count >= 2) {
      if (wrap) wrap.style.display = '';
      if (single) single.style.display = 'none';
      return;
    }
    if (count === 1) {
      if (wrap) wrap.style.display = 'none';
      if (single) {
        const sub = (this._brandStorageSubbrands && this._brandStorageSubbrands[0]) || null;
        const rawName = String(((sub && sub.nombre_marca) || 'Sub-marca').trim() || 'Sub-marca');
        const slug = typeof window.getOrgSlug === 'function' ? window.getOrgSlug(rawName) : 'sub-marca';
        const shortId = (sub && typeof window.getBrandContainerShortId === 'function')
          ? window.getBrandContainerShortId(sub.id) : '';
        const tail = shortId ? `command-center/${shortId}/${slug}` : `command-center/${slug}`;
        const href = this.getUserSidebarRoute(tail);
        const link = single.querySelector('#navCommandCenterSingleLink');
        if (link) {
          link.setAttribute('href', href);
          link.setAttribute('data-route', href);
          // El tooltip/colapsado debe decir "Marketing", no el nombre del sub-brand.
          link.setAttribute('data-tooltip', __('Marketing'));
        }
        single.style.display = '';
      }
      return;
    }
    if (wrap) wrap.style.display = 'none';
    if (single) single.style.display = 'none';
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

      // Base nueva (ADR-0052): mis marcas con rol salen de mi_contexto().
      const orgsMap = new Map();
      (await window.contextoService.orgs()).forEach((o) => orgsMap.set(o.id, { id: o.id, name: o.name, role: o.role }));

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
          ${isActive ? '<i class="aisc-ico aisc-ico--check"></i>' : ''}
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
            window.router?.navigate(prefix ? `${prefix}/production` : '/create');
          }
        });
      });

      listEl.insertAdjacentHTML('beforeend', `
        <div class="nav-org-divider"></div>
        <div class="nav-org-option nav-org-create" data-action="create-org">
          <i class="aisc-ico aisc-ico--add"></i>
          <span>${__('Crear nueva organización')}</span>
        </div>
      `);

      listEl.querySelector('.nav-org-create')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('navOrgDropdown')?.classList.remove('active');
        window.router?.navigate('/create');
      });
    } catch (err) {
      console.error('Error loading organizations list:', err);
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
