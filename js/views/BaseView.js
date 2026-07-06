/**
 * BaseView - Clase base para todas las vistas de la SPA.
 *
 * Patrón: cada subclase implementa renderHTML() retornando un template literal
 * con el HTML de la vista. No se usan templates externos.
 *
 * @class BaseView
 * @abstract
 * @example
 * class MiVista extends BaseView {
 *   renderHTML() {
 *     return `<div class="mi-vista">...</div>`;
 *   }
 *   async init() {
 *     // setup de listeners, data fetching, etc.
 *   }
 * }
 */
class BaseView {
  static _userProfileCache = null;
  static _userProfileCacheTime = 0;
  static _USER_CACHE_TTL = 60000;

  /**
   * Back/forward cache: el router siempre restaura scrollY al volver a una ruta.
   * Si una subclase declara `static cacheable = true`, además se guarda el HTML
   * del contenedor y se re-pinta al volver, dando "instant back" — la vista
   * recibe `this._restoredFromCache = true` y puede decidir si solo refresca
   * datos en lugar de re-renderizar el árbol completo (evita salto visual).
   */
  static cacheable = false;

  constructor() {
    this.container = document.getElementById('app-container');
    this.templatePath = null;
    this.initialized = false;
    this.eventListeners = [];
    this._restoredFromCache = false;
  }

  /**
   * Generar HTML de la vista. Método abstracto — cada subclase lo sobrescribe
   * retornando un template literal con el HTML de la vista (patrón SPA, sin templates externos).
   * @returns {string} HTML de la vista
   */
  renderHTML() {
    throw new Error('renderHTML() no implementado. Cada subclase de BaseView debe implementarlo retornando el HTML de la vista.');
  }

  /**
   * Renderizar la vista
   * Este método carga el template y lo inyecta en el container
   */
  async render() {
    if (!this.container) {
      console.error('Container no encontrado');
      return;
    }

    // Eliminada verificación de inicialización - siempre renderizar desde cero

    try {
      await this.onEnter();
      let html = this.renderHTML();
      if (html instanceof Promise) html = await html;
      
      this.container.innerHTML = html;
      this.moveModalsToPortal();
      this.updateLinksForRouter();
      await this.init();
      this.initialized = true;
      // updateHeader hace un fetch a Supabase para los datos del avatar; no hace
      // falta bloquear el render por eso (el header ya pintó con su layout).
      this.updateHeader().catch(err => console.warn('updateHeader:', err));
    } catch (error) {
      console.error('Error renderizando vista:', error);
      if (window.errorLogger) {
        window.errorLogger.capture(error, { source: 'BaseView.render', view: this.constructor.name });
      }
      if (window.errorHandler) {
        // Sin toast: el estado de error ocupa la vista completa y ya es visible.
        // errorLogger ya capturó arriba; logged:true evita doble telemetría.
        window.errorHandler.sectionError(this.container, {
          error,
          logged: true,
          source: this.constructor.name,
          title: window.__ ? window.__('No se pudo cargar esta vista') : 'No se pudo cargar esta vista',
          message: window.__ ? window.__('Algo salió mal al preparar la página.') : 'Algo salió mal al preparar la página.',
          onRetry: () => this.render(),
        });
      } else {
        this.container.innerHTML = `
          <div class="section-error" role="alert">
            <div class="section-error-title">Error</div>
            <p class="section-error-msg">${this.escapeHtml(error.message)}</p>
          </div>
        `;
      }
    }
  }

  /**
   * Antes movía los modales al #modals-portal; desactivado para que los modales
   * permanezcan en la vista y no se separen del overlay (evita bugs de cierre/click).
   * Se vacía el portal al cambiar de vista para no dejar modales de la vista anterior.
   */
  moveModalsToPortal() {
    const portal = document.getElementById('modals-portal');
    if (portal) portal.innerHTML = '';
  }

  /**
   * Inicializar la vista
   * Override este método en subclases para setup de event listeners, componentes, etc.
   */
  async init() {
    // Override en subclases
  }

  /**
   * Hook llamado al entrar a la vista
   * Override este método para preparar datos, verificar permisos, etc.
   */
  async onEnter() {
    // Override en subclases
  }

  /**
   * Hook llamado al salir de la vista
   * Método vacío - sin limpieza
   */
  async onLeave() {
    // Override en subclases si es necesario
  }
  
  /**
   * Limpiar listeners registrados con addEventListener (evita fugas al salir de la vista)
   */
  cleanup() {
    if (this.eventListeners && this.eventListeners.length) {
      this.eventListeners.forEach(function (item) {
        if (item.element && typeof item.element.removeEventListener === 'function') {
          item.element.removeEventListener(item.event, item.handler);
        }
      });
      this.eventListeners = [];
    }
  }

  /**
   * Destruir vista: limpiar listeners. Llamado por el router antes de cambiar de ruta.
   */
  destroy() {
    this.liveTeardown();
    this.cleanup();
  }

  /**
   * Mueve una sub-navegacion de tabs al header principal (segunda fila), igual
   * que Production mueve sus filtros. Reusa el slot #headerProductionSlot. Solo
   * una vista lo ocupa a la vez (cada una limpia en onLeave).
   *
   * Race: Navigation.render() corre en paralelo con view.render(); si el slot
   * aun no existe, reintenta brevemente.
   *
   * @param {string} html      markup de los tabs (contenedor + .mb-firebar-tab)
   * @param {(tab:string)=>void} onTabClick  callback con el data-tab clickeado
   */
  moveSubnavToHeader(html, onTabClick, attempts = 0) {
    const slot = document.getElementById('headerProductionSlot');
    if (!slot) {
      if (attempts < 20) {
        this._subnavMoveTimer = setTimeout(
          () => this.moveSubnavToHeader(html, onTabClick, attempts + 1), 50);
      }
      return null;
    }
    slot.innerHTML = html;
    slot.setAttribute('aria-hidden', 'false');
    // onclick (handler unico) evita listeners duplicados si se re-inyecta.
    slot.onclick = (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn && typeof onTabClick === 'function') onTabClick(btn.dataset.tab);
    };
    document.body.classList.add('subnav-in-header');
    return slot;
  }

  /** Restaura el slot del header al salir de la vista. */
  clearSubnavFromHeader() {
    if (this._subnavMoveTimer) {
      clearTimeout(this._subnavMoveTimer);
      this._subnavMoveTimer = null;
    }
    const slot = document.getElementById('headerProductionSlot');
    if (slot) {
      slot.innerHTML = '';
      slot.onclick = null;
      slot.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('subnav-in-header');
  }

  /**
   * Sistema centralizado de carga de scripts dinámicos
   * Evita duplicaciones y maneja correctamente scripts ya cargados
   * 
   * @param {string} scriptSrc - Ruta del script (ej: 'js/living.js' para el módulo de Production)
   * @param {string} globalVar - Variable global que debe estar disponible después de cargar (ej: 'LivingManager')
   * @param {number} timeout - Timeout en ms para esperar la variable global (default: 5000)
   * @returns {Promise<void>}
   * @example
   * await this.loadScript('js/living.js', 'LivingManager');
   */
  async loadScript(scriptSrc, globalVar = null, timeout = 5000) {
    // Si se especifica una variable global y ya está disponible, resolver inmediatamente
    if (globalVar && window[globalVar]) {
      return Promise.resolve();
    }

    // Usar ruta absoluta para que funcione en rutas profundas (ej: /org/:id/production)
    // Si no, js/living.js se resuelve bajo el segmento de org y el servidor devuelve HTML → SyntaxError
    let resolvedSrc = scriptSrc.startsWith('http') ? scriptSrc : (scriptSrc.startsWith('/') ? scriptSrc : '/' + scriptSrc);

    // Cache-bust con el mismo BUILD_ID que app.js — evita que Cloudflare sirva un service stale.
    // Solo aplica a JS local sin query string previo.
    if (!/^https?:\/\//i.test(resolvedSrc) && !resolvedSrc.includes('?')) {
      const ver = (typeof APP_LAZY_SCRIPT_VER !== 'undefined' && APP_LAZY_SCRIPT_VER)
        ? APP_LAZY_SCRIPT_VER
        : String(Date.now());
      resolvedSrc = `${resolvedSrc}?v=${ver}`;
    }

    // Verificar si el script ya está cargado en el DOM
    const existingScript = document.querySelector(`script[src="${resolvedSrc}"]`) || document.querySelector(`script[src="${scriptSrc}"]`);
    if (existingScript) {
      // El script ya está en el DOM, esperar a que la variable global esté disponible
      if (globalVar) {
        return new Promise((resolve, reject) => {
          // Si ya está disponible, resolver inmediatamente
          if (window[globalVar]) {
            resolve();
            return;
          }

          // Esperar a que se cargue con polling
          const checkInterval = setInterval(() => {
            if (window[globalVar]) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);

          // Timeout de seguridad
          setTimeout(() => {
            clearInterval(checkInterval);
            if (window[globalVar]) {
              resolve();
            } else {
              reject(new Error(`${globalVar} no se cargó después de esperar (script: ${scriptSrc})`));
            }
          }, timeout);
        });
      }
      // Si no hay variable global, asumir que el script ya está listo
      return Promise.resolve();
    }

    // El script no está cargado, cargarlo con URL absoluta
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = resolvedSrc;
      
      script.onload = () => {
        if (globalVar) {
          // Esperar a que la variable global esté disponible
          // Dar un pequeño delay inicial para que el script se ejecute completamente
          setTimeout(() => {
            const checkInterval = setInterval(() => {
              if (window[globalVar]) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 50); // Verificar cada 50ms para ser más rápido

            setTimeout(() => {
              clearInterval(checkInterval);
              if (window[globalVar]) {
                resolve();
              } else {
                reject(new Error(`${globalVar} no se registró después de cargar ${scriptSrc}`));
              }
            }, timeout);
          }, 100); // Esperar 100ms después de onload para que el script se ejecute
        } else {
          // Sin variable global, resolver inmediatamente después de onload
          resolve();
        }
      };

      script.onerror = () => {
        reject(new Error(`Error cargando script: ${scriptSrc}`));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Helper para agregar event listeners que se limpian automáticamente
   * @param {HTMLElement} element - Elemento
   * @param {string} event - Tipo de evento
   * @param {Function} handler - Handler del evento
   */
  addEventListener(element, event, handler) {
    if (element && handler) {
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    }
  }

  /**
   * Helper para obtener elemento del DOM dentro del container
   * @param {string} selector - Selector CSS
   * @returns {HTMLElement|null}
   */
  querySelector(selector) {
    if (!this.container) return null;
    return this.container.querySelector(selector);
  }

  /**
   * Helper para obtener múltiples elementos del DOM
   * @param {string} selector - Selector CSS
   * @returns {NodeList}
   */
  querySelectorAll(selector) {
    if (!this.container) return [];
    return this.container.querySelectorAll(selector);
  }

  /**
   * Actualizar links para usar router (History API)
   */
  updateLinksForRouter() {
    const links = this.container.querySelectorAll('a[href^="#"]:not([data-router]), a[href^="/"]:not([data-router])');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('#') || href.startsWith('/'))) {
        let path = href.replace('#', '');
        if (!path.startsWith('/')) path = '/' + path;

        this.addEventListener(link, 'click', (e) => {
          e.preventDefault();
          if (window.router) window.router.navigate(path);
        });

        link.setAttribute('href', path);
        link.setAttribute('data-router', '1');
      }
    });
  }

  /**
   * Generar HTML del header principal común
   * @param {string} section - Nombre de la sección (ej: "Marcas", "Campañas")
   * @param {string} activeObject - Objeto activo opcional (ej: "Oster", "Q1 Launch")
   * @param {string} organizationName - Nombre de la organización activa (opcional, sutil)
   * @returns {string} HTML del header
   */
  getHeaderHTML(section, activeObject = null, organizationName = null) {
    // Línea 1: Sección / Objeto activo
    const line1 = activeObject ? `${section} / ${activeObject}` : section;
    
    return `
    <header class="main-header">
        <div class="header-content">
            <!-- ICONO TOGGLE SIDEBAR -->
            <button class="header-sidebar-toggle" id="headerSidebarToggle" aria-label="Toggle sidebar">
                <i class="aisc-ico aisc-ico--menu"></i>
            </button>
            
            <!-- ZONA IZQUIERDA: CONTEXTO -->
            <div class="header-left">
                <div class="header-context">
                    <div class="header-context-primary">
                        <h1 class="header-section">${this.escapeHtml(section)}</h1>
                        ${activeObject ? `<span class="header-separator">/</span><span class="header-active-object">${this.escapeHtml(activeObject)}</span>` : ''}
                    </div>
                    ${organizationName ? `<div class="header-context-secondary">${this.escapeHtml(organizationName)}</div>` : ''}
                </div>
            </div>
            
            <!-- ZONA DERECHA: USUARIO (solo botón menú, sin avatar) -->
            <div class="header-right">
                <div class="header-user" id="headerUser">
                    <button class="header-user-chevron" id="headerUserChevron" aria-label="Menú de usuario">
                        <i class="aisc-ico aisc-ico--chevron-down"></i>
                    </button>
                </div>
                
                <!-- Dropdown de usuario -->
                <div class="header-user-dropdown" id="headerUserDropdown">
                    <div class="header-user-dropdown-item" data-action="profile">
                        <i class="aisc-ico aisc-ico--audience"></i>
                        <span>Perfil</span>
                    </div>
                    <div class="header-user-dropdown-item header-user-logout" id="headerUserLogout" data-action="logout">
                        <i class="aisc-ico aisc-ico--logout"></i>
                        <span>Cerrar sesión</span>
                    </div>
                </div>
                
                <!-- Hamburger menu (solo móvil) -->
                <button class="hamburger-menu" id="hamburgerMenu" aria-label="Toggle navigation">
                    <div class="hamburger-line"></div>
                    <div class="hamburger-line"></div>
                    <div class="hamburger-line"></div>
                </button>
            </div>
        </div>
    </header>
    `;
  }

  /**
   * Escapar HTML para prevenir XSS. Fuente única de verdad — todas las demás
   * implementaciones (Navigation._escapeHtml, BIC._esc, input-registry.escapeHtml)
   * delegan aquí. Usa regex (no DOM) para que sirva también en helpers module-level
   * que corren antes del primer render y para evitar un reflow por cada escape.
   */
  static escapeHtml(text) {
    if (text == null) return '';
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[ch]));
  }

  /** Alias de instancia para mantener compat con `this.escapeHtml(...)` en subclases. */
  escapeHtml(text) {
    return BaseView.escapeHtml(text);
  }

  /**
   * Helpers de skeleton screens. Patrón premium (Linear/Vercel): mientras una
   * sección espera datos, pintar un placeholder con la misma forma del contenido
   * final. Mucho mejor que un spinner global porque el layout no salta.
   *
   * Uso típico en renderHTML():
   *   <div id="kpis">${this.skeletonGrid(4, 'lg')}</div>
   * Y después de fetchear, this.container.querySelector('#kpis').innerHTML = realHtml.
   */
  static skeletonText(width = '100%', size = '') {
    const sizeCls = size === 'lg' ? ' skeleton-text--lg' : (size === 'sm' ? ' skeleton-text--sm' : '');
    const widthAttr = (typeof width === 'string' && width !== '100%') ? ` style="width:${width};"` : '';
    return `<span class="skeleton skeleton-text${sizeCls}"${widthAttr}></span>`;
  }
  static skeletonCard(modifier = '') {
    const mod = modifier === 'lg' ? ' skeleton-card--lg' : '';
    return `<div class="skeleton skeleton-card${mod}"></div>`;
  }
  static skeletonCircle(size = '') {
    const mod = size === 'sm' ? ' skeleton-circle--sm' : (size === 'lg' ? ' skeleton-circle--lg' : '');
    return `<span class="skeleton skeleton-circle${mod}"></span>`;
  }
  static skeletonGrid(count = 3, cardSize = '') {
    const cols = count >= 4 ? 4 : 3;
    const items = Array.from({ length: count }, () => BaseView.skeletonCard(cardSize)).join('');
    return `<div class="skeleton-grid skeleton-grid--${cols}">${items}</div>`;
  }
  /**
   * Skeleton para galerias masonry/justified (.living-masonry-grid + applyJustifiedLayout).
   * IMPORTANTE: usar este, NO skeletonGrid(), en contenedores masonry. skeletonGrid
   * produce un grid uniforme de columnas; el contenido real es flex-wrap justified ->
   * el mismatch causa que el skeleton "salte" al cargar. Esto replica el markup real
   * (.living-masonry-item > .living-history-skeleton) para una transicion sin salto.
   * @param {number} count    — items a mostrar
   * @param {string} gridClass — clase extra del grid (ej. 'products-list-masonry-grid', 'living-history-masonry')
   */
  static masonrySkeleton(count = 12, gridClass = '') {
    const item = '<div class="living-masonry-item"><div class="living-history-skeleton"></div></div>';
    return `<div class="living-masonry-grid ${gridClass}">${item.repeat(count)}</div>`;
  }
  /**
   * EMPTY STATE — plantilla canonica de la plataforma. Devuelve el componente
   * COMPLETO (contenedor .empty-state + spotlight + medallon + titular +
   * subtitulo + CTAs). Estilos en css/modules/empty-state.css (global).
   *
   * Opciones:
   *   icon | iconSrc   medallion (FA class o ruta a SVG propio)
   *   title, subtitle
   *   primaryLabel, secondaryLabel   textos de los CTA (omitir = sin boton)
   *   primaryAction, secondaryAction data-action de cada CTA (si se omite, el
   *                                  boton lleva data-empty-add / data-empty-attach)
   *   id        id del contenedor (para toggle show/hide desde la vista)
   *   hidden    arranca oculto (display:none)
   *   fill      ocupa el alto del contenedor flex (.empty-state--fill)
   *   compact   variante chica para areas pequeñas (columnas, paneles)
   *   noDots    sin spotlight propio (para contenedores que ya ponen los puntos,
   *             ej. el canvas de Studio) — evita duplicar el patron
   * Diseño en Figma node 133:14.
   */
  static emptyState({
    icon = 'fa-inbox', iconSrc = '', title = '', subtitle = '',
    primaryLabel = '', secondaryLabel = '', primaryAction = '', secondaryAction = '',
    id = '', hidden = false, fill = false, compact = false, noDots = false,
  } = {}) {
    const esc = BaseView.escapeHtml;
    const medallionInner = iconSrc
      ? `<img class="ple-medallion-img" src="${esc(iconSrc)}" alt="" width="30" height="30">`
      : `<i class="fas ${esc(icon)}"></i>`;
    const pAttr = primaryAction ? `data-action="${esc(primaryAction)}"` : 'data-empty-add';
    const sAttr = secondaryAction ? `data-action="${esc(secondaryAction)}"` : 'data-empty-attach';
    const primary = primaryLabel
      ? `<button type="button" class="ple-btn ple-btn--primary" ${pAttr}>${esc(primaryLabel)}</button>` : '';
    const secondary = secondaryLabel
      ? `<button type="button" class="ple-btn ple-btn--secondary" ${sAttr}>${esc(secondaryLabel)}</button>` : '';
    const actions = (primary || secondary) ? `<div class="ple-actions">${primary}${secondary}</div>` : '';
    const sub = subtitle ? `<p class="ple-subtitle">${esc(subtitle)}</p>` : '';
    const cls = ['empty-state', fill && 'empty-state--fill', compact && 'empty-state--compact', noDots && 'empty-state--flat'].filter(Boolean).join(' ');
    const attrs = `${id ? ` id="${esc(id)}"` : ''}${hidden ? ' style="display:none;"' : ''}`;
    return `
      <div class="${cls}"${attrs}>
        <div class="ple-content">
          <div class="ple-medallion" aria-hidden="true">${medallionInner}</div>
          <h3 class="ple-title">${esc(title)}</h3>
          ${sub}
          ${actions}
        </div>
      </div>`;
  }

  static skeletonRows(count = 3) {
    const row = `<div class="skeleton-row">${BaseView.skeletonCircle('sm')}<div style="flex:1 1 auto;">
      <span class="skeleton skeleton-text skeleton-text--w75"></span>
      <span class="skeleton skeleton-text skeleton-text--sm skeleton-text--w35"></span>
    </div></div>`;
    return Array.from({ length: count }, () => row).join('');
  }

  // Aliases de instancia para uso fluido desde subclases.
  skeletonText(w, s)    { return BaseView.skeletonText(w, s); }
  skeletonCard(m)       { return BaseView.skeletonCard(m); }
  skeletonCircle(s)     { return BaseView.skeletonCircle(s); }
  skeletonGrid(c, s)    { return BaseView.skeletonGrid(c, s); }
  masonrySkeleton(c, g) { return BaseView.masonrySkeleton(c, g); }
  skeletonRows(c)       { return BaseView.skeletonRows(c); }
  emptyState(o)         { return BaseView.emptyState(o); }

  /**
   * Actualizar header existente con nuevo contexto.
   * Si el header es el de Navigation (#appHeader), solo actualiza #headerTitle sin tocar el hamburger.
   */
  updateHeaderContext(section, activeObject = null, organizationName = null) {
    const appHeader = document.getElementById('appHeader');
    const headerTitle = document.getElementById('headerTitle');
    if (appHeader && headerTitle) {
      const line = activeObject ? `${this.escapeHtml(section)} / ${this.escapeHtml(activeObject)}` : this.escapeHtml(section);
      headerTitle.textContent = line;
      return;
    }

    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return;

    let toggleButton = document.getElementById('headerSidebarToggle');
    if (!toggleButton) {
      const headerContent = document.querySelector('.header-content');
      if (headerContent) {
        toggleButton = document.createElement('button');
        toggleButton.className = 'header-sidebar-toggle';
        toggleButton.id = 'headerSidebarToggle';
        toggleButton.setAttribute('aria-label', 'Toggle sidebar');
        toggleButton.innerHTML = '<i class="aisc-ico aisc-ico--menu"></i>';
        headerContent.insertBefore(toggleButton, headerContent.firstChild);
      }
    }

    const html = `
      <div class="header-context">
        <div class="header-context-primary">
          <h1 class="header-section">${this.escapeHtml(section)}</h1>
          ${activeObject ? `<span class="header-separator">/</span><span class="header-active-object">${this.escapeHtml(activeObject)}</span>` : ''}
        </div>
        ${organizationName ? `<div class="header-context-secondary">${this.escapeHtml(organizationName)}</div>` : ''}
      </div>
    `;
    headerLeft.innerHTML = html;
  }

  /**
   * Actualizar header con datos del usuario y contexto
   * Debe llamarse después de renderizar la vista
   */
  async updateHeader() {
    // Si el header ya existe en el DOM (desde template), actualizarlo
    const existingHeader = document.querySelector('.main-header');
    
    if (existingHeader) {
      // Actualizar zona derecha (usuario) si no existe
      const headerRight = existingHeader.querySelector('.header-right');
      if (headerRight && !headerRight.querySelector('.header-user')) {
        // Reemplazar header antiguo con nuevo formato
        this.updateExistingHeader();
      }
    }

    // Cache vía apiClient (1 min TTL + SWR). Reemplaza el cache ad-hoc previo
    // (_userProfileCache) — el apiClient hace dedupe entre vistas que rendericen
    // al mismo tiempo (router transitions) y se invalida en logout.
    let profile = null;
    try {
      const supabase = await this.getSupabaseClient();
      if (!supabase) return;
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const fetcher = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('id', user.id)
          .maybeSingle();
        return data;
      };
      profile = window.apiClient
        ? await window.apiClient.query(`profile:${user.id}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (error) {
      console.error('Error actualizando header:', error);
      if (window.errorLogger) window.errorLogger.capture(error, { source: 'BaseView.updateHeader' });
      return;
    }

    if (profile) {
      const headerUserInitials = document.getElementById('headerUserInitials');
      if (headerUserInitials) {
        const name = profile.full_name || profile.email || 'Usuario';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        headerUserInitials.textContent = initials || 'U';
      }
    }

    this.setupHeaderUserDropdown();
  }

  /**
   * Actualizar header existente (desde templates) al nuevo formato
   */
  updateExistingHeader() {
    const existingHeader = document.querySelector('.main-header');
    if (!existingHeader) return;

    const headerLeft = existingHeader.querySelector('.header-left');
    const headerRight = existingHeader.querySelector('.header-right');
    
    if (!headerLeft || !headerRight) return;

    // Obtener sección actual del header antiguo
    const oldTitle = headerLeft.querySelector('h1');
    const section = oldTitle ? oldTitle.textContent.trim() : '';

    // Agregar toggle button si no existe
    let toggleButton = existingHeader.querySelector('#headerSidebarToggle');
    if (!toggleButton) {
      toggleButton = document.createElement('button');
      toggleButton.className = 'header-sidebar-toggle';
      toggleButton.id = 'headerSidebarToggle';
      toggleButton.setAttribute('aria-label', 'Toggle sidebar');
      toggleButton.innerHTML = '<i class="aisc-ico aisc-ico--menu"></i>';
      const headerContent = existingHeader.querySelector('.header-content');
      if (headerContent) {
        headerContent.insertBefore(toggleButton, headerContent.firstChild);
      }
    }

    // Actualizar zona izquierda con nuevo formato
    this.updateHeaderContext(section, null, null);

    // Actualizar zona derecha con nuevo formato de usuario (solo botón, sin avatar)
    headerRight.innerHTML = `
      <div class="header-user" id="headerUser">
        <button class="header-user-chevron" id="headerUserChevron" aria-label="Menú de usuario">
          <i class="aisc-ico aisc-ico--chevron-down"></i>
        </button>
      </div>
      
      <!-- Dropdown de usuario -->
      <div class="header-user-dropdown" id="headerUserDropdown">
        <div class="header-user-dropdown-item" data-action="profile">
          <i class="aisc-ico aisc-ico--audience"></i>
          <span>Perfil</span>
        </div>
        <div class="header-user-dropdown-item header-user-logout" id="headerUserLogout" data-action="logout">
          <i class="aisc-ico aisc-ico--logout"></i>
          <span>Cerrar sesión</span>
        </div>
      </div>
      
      <!-- Hamburger menu (solo móvil) -->
      <button class="hamburger-menu" id="hamburgerMenu" aria-label="Toggle navigation">
        <div class="hamburger-line"></div>
        <div class="hamburger-line"></div>
        <div class="hamburger-line"></div>
      </button>
    `;
  }

  /**
   * Configurar dropdown de usuario en el header
   */
  setupHeaderUserDropdown() {
    const headerUser = document.getElementById('headerUser');
    const headerUserChevron = document.getElementById('headerUserChevron');
    const headerUserDropdown = document.getElementById('headerUserDropdown');
    const headerUserLogout = document.getElementById('headerUserLogout');

    if (!headerUser || !headerUserChevron || !headerUserDropdown) return;
    if (headerUser.hasAttribute('data-dropdown-bound')) return;
    headerUser.setAttribute('data-dropdown-bound', '1');

    headerUser.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = headerUserDropdown.classList.contains('open');
      document.querySelectorAll('.header-user-dropdown.open').forEach(dropdown => {
        if (dropdown !== headerUserDropdown) dropdown.classList.remove('open');
      });

      headerUserDropdown.classList.toggle('open', !isOpen);
      const icon = headerUserChevron.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-chevron-up', !isOpen);
        icon.classList.toggle('fa-chevron-down', isOpen);
      }
    });

    if (headerUserLogout) {
      headerUserLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.handleLogout();
      });
    }

    const profileItem = headerUserDropdown.querySelector('[data-action="profile"]');
    if (profileItem) {
      profileItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.router) window.router.navigate('/home');
        headerUserDropdown.classList.remove('open');
      });
    }

    if (!BaseView._headerDocClickBound) {
      BaseView._headerDocClickBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.header-user')) {
          const dd = document.getElementById('headerUserDropdown');
          if (dd) dd.classList.remove('open');
          const chevron = document.getElementById('headerUserChevron');
          const icon = chevron?.querySelector('i');
          if (icon) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
          }
        }
      });
    }
  }

  /**
   * Manejar logout
   */
  async handleLogout() {
    if (window.authService) {
      await window.authService.logout();
      return;
    }

    const supabase = await this.getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error en logout:', error);
      }
    }

    // Limpiar sesión
    if (window.sessionManager) {
      window.sessionManager.clearSession();
    } else {
      localStorage.removeItem('user_session');
      sessionStorage.removeItem('user_session');
    }

    // Redirigir al login
    if (window.router) {
      window.router.navigate('/login', true);
    } else {
      window.location.href = '/login.html';
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getSupabaseClient() {
    if (window.supabaseService) {
      return await window.supabaseService.getClient();
    }
    if (window.supabase) {
      return window.supabase;
    }
    if (typeof waitForSupabase === 'function') {
      return await waitForSupabase();
    }
    return null;
  }

  /**
   * Aplicar estilos inline para eliminar transiciones y efectos hover
   * Función común para todos los inputs editables
   * @param {HTMLElement} element - Elemento a estilizar
   */
  applyNoTransitionStyles(element) {
    if (!element) return;
    
    element.style.transition = 'none';
    element.style.webkitTransition = 'none';
    element.style.mozTransition = 'none';
    element.style.oTransition = 'none';
    element.style.animation = 'none';
    element.style.webkitAnimation = 'none';
    element.style.mozAnimation = 'none';
    element.style.oAnimation = 'none';
    element.style.willChange = 'auto';
    element.style.transform = 'none';
    element.style.webkitTransform = 'none';
    element.style.mozTransform = 'none';
    element.style.oTransform = 'none';
    element.style.scale = '1';
    element.style.zoom = '1';
  }

  /**
   * Función para forzar tamaños fijos en eventos del cursor
   * @param {HTMLElement} target - Elemento objetivo
   */
  forceFixedSize(target) {
    if (!target) return;
    
    const computedStyle = window.getComputedStyle(target);
    const fontSize = computedStyle.fontSize;
    const lineHeight = computedStyle.lineHeight;
    const letterSpacing = computedStyle.letterSpacing;
    const border = computedStyle.border;
    const borderColor = computedStyle.borderColor;
    const padding = computedStyle.padding;
    const width = computedStyle.width;
    const height = computedStyle.height;
    const minHeight = computedStyle.minHeight;
    
    // Detectar elementos protegidos que NO deben tener sus estilos reseteados
    const isBrandName = target.classList && target.classList.contains('brand-name-large');
    const isInfoEditable = target.classList && target.classList.contains('info-editable');
    const isInfoPanel = target.closest && target.closest('.card-content-expanded');
    const isProductEditable = target.classList && (
      target.classList.contains('product-editable') ||
      target.classList.contains('editable-field') ||
      target.classList.contains('editable-textarea') ||
      target.classList.contains('editable-select')
    );
    const isProductSection = target.closest && target.closest('.product-data-section');
    
    // Para elementos protegidos, preservar TODOS los estilos CSS importantes
    const isProtected = isBrandName || isInfoEditable || isInfoPanel || isProductEditable || isProductSection;
    
    // Solo aplicar background transparent si no está protegido o si el CSS no lo define
    if (!isProtected || computedStyle.background === 'rgba(0, 0, 0, 0)' || computedStyle.background === 'transparent') {
      target.style.background = 'transparent';
    }
    
    // PRESERVAR BORDE ORIGINAL - SIEMPRE usar el borde del CSS
    if (border && border !== 'none' && border !== '0px') {
      target.style.border = border;
      target.style.borderColor = borderColor;
    } else if (!isProtected) {
      target.style.borderColor = 'transparent';
    }
    
    // NO resetear padding/width/height para elementos protegidos
    if (!isProtected) {
      target.style.padding = '0';
      target.style.margin = '0';
      target.style.width = 'auto';
      target.style.height = 'auto';
      target.style.minWidth = 'auto';
      target.style.maxWidth = 'none';
      target.style.minHeight = 'auto';
      target.style.maxHeight = 'none';
    } else if (isBrandName) {
      // Nombre de marca: no fijar ancho en píxeles para que el texto pueda hacer wrap y no se desborde
      target.style.width = '100%';
      target.style.maxWidth = '100%';
      target.style.minWidth = '0';
      target.style.height = 'auto';
      target.style.minHeight = 'auto';
      target.style.maxHeight = 'none';
    } else {
      // Para el resto de elementos protegidos, preservar los valores del CSS
      if (padding && padding !== '0px') {
        target.style.padding = padding;
      }
      if (width && width !== 'auto') {
        target.style.width = width;
      }
      if (height && height !== 'auto') {
        target.style.height = height;
      }
      if (minHeight && minHeight !== 'auto' && minHeight !== '0px') {
        target.style.minHeight = minHeight;
      }
    }
    
    // Siempre prevenir transformaciones y animaciones
    target.style.transform = 'none';
    target.style.webkitTransform = 'none';
    target.style.mozTransform = 'none';
    target.style.oTransform = 'none';
    target.style.boxShadow = 'none';
    target.style.scale = '1';
    target.style.zoom = '1';
    
    // Preservar tipografía
    target.style.fontSize = fontSize;
    target.style.lineHeight = lineHeight;
    target.style.letterSpacing = letterSpacing;
    
    // Aplicar estilos sin transición
    this.applyNoTransitionStyles(target);
  }

  /**
   * Agregar event listeners para prevenir efectos hover
   * @param {HTMLElement} element - Elemento al que agregar listeners
   */
  addNoHoverListeners(element) {
    if (!element) return;
    
    const events = ['mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'focus', 'blur', 'click'];
    events.forEach(eventType => {
      element.addEventListener(eventType, (e) => {
        this.forceFixedSize(e.target);
      }, { passive: true });
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     Datos en vivo (realtime + polling de respaldo, sin parpadeo)
     ─────────────────────────────────────────────────────────────────────
     Primitiva compartida por todas las vistas. Generaliza el patron probado
     en DashboardView: suscripcion a Supabase realtime por tabla + un polling
     silencioso de respaldo, ambos pasando por liveRefresh(), que solo re-pinta
     cuando los datos REALMENTE cambiaron (gate por firma). El teardown es
     automatico en destroy() (el router lo invoca al cambiar de ruta).

     Uso tipico en una subclase (en init(), tras el primer render):
       this._liveTick = () => this.liveRefresh('main',
         () => this._loadX(),              // fetch
         (data) => this._applyX(data));    // re-pinta SOLO la region viva
       await this.liveSubscribe([
         { name: 'runs', table: 'flow_runs', filter: `organization_id=eq.${orgId}`,
           onChange: () => this._liveTick() },
       ]);
       this.startLivePoll(60000, () => this._liveTick());
     ════════════════════════════════════════════════════════════════════ */

  /** Cliente Supabase (cacheado). Mismo patron que el resto de la app. */
  async _supabaseClient() {
    if (this._sb) return this._sb;
    try {
      if (window.supabaseService?.getClient) this._sb = await window.supabaseService.getClient();
      else if (window.supabase)              this._sb = window.supabase;
    } catch (_) { this._sb = null; }
    return this._sb;
  }

  /** Firma estable y barata (djb2 sobre JSON) para detectar si los datos
      cambiaron entre refreshes. Devuelve null si no se puede serializar
      (p.ej. referencia circular) → el llamador re-pinta por las dudas. */
  _dataSignature(data) {
    let json;
    try { json = JSON.stringify(data); } catch (_) { return null; }
    if (json == null) return null;
    let h = 5381;
    for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
    return `${json.length}:${h}`;
  }

  /** Suscribe canales de Supabase realtime de forma declarativa.
      specs: [{ name, table, filter?, event='*', onChange(payload) }] */
  async liveSubscribe(specs) {
    if (!Array.isArray(specs) || !specs.length) return;
    const sb = await this._supabaseClient();
    if (!sb?.channel) return;
    if (!this._liveChannels) this._liveChannels = [];
    for (const s of specs) {
      if (!s?.table) continue;
      const cfg = { event: s.event || '*', schema: 'public', table: s.table };
      if (s.filter) cfg.filter = s.filter;
      try {
        const ch = sb
          .channel(`live-${this.constructor.name}-${s.name || s.table}`)
          .on('postgres_changes', cfg, (payload) => {
            try { s.onChange?.(payload); } catch (e) { console.warn('[live] onChange:', e?.message || e); }
          })
          .subscribe();
        this._liveChannels.push(ch);
      } catch (e) {
        console.warn('[live] subscribe failed:', s.table, e?.message || e);
      }
    }
  }

  /** Des-suscribe todos los canales realtime de esta vista. */
  liveUnsubscribe() {
    if (!this._liveChannels) return;
    for (const ch of this._liveChannels) {
      try { ch.unsubscribe?.(); } catch (_) {}
    }
    this._liveChannels = [];
  }

  /** Corazon sin parpadeo: fetchea, compara firma contra el ultimo render de
      `key`; si no cambio, NO toca el DOM; si cambio, llama applyFn(data).
      Guarda de re-entrancia por key y respeta document.hidden. */
  async liveRefresh(key, fetchFn, applyFn) {
    if (!this._liveBusy) this._liveBusy = {};
    if (!this._liveSig)  this._liveSig = {};
    if (this._liveBusy[key]) return;          // ya hay un refresh de esta key en vuelo
    if (document.hidden) return;
    this._liveBusy[key] = true;
    try {
      const data = await fetchFn();
      const sig = this._dataSignature(data);
      if (sig != null && this._liveSig[key] === sig) return;   // sin cambios reales → cero parpadeo
      this._liveSig[key] = sig;
      await applyFn(data);
    } catch (e) {
      console.warn(`[live:${key}] refresh failed:`, e?.message || e);
    } finally {
      this._liveBusy[key] = false;
    }
  }

  /** Reinicia la firma de una key (o todas) para forzar el proximo repaint.
      Util tras un cambio de filtro hecho por el usuario. */
  liveResetSignature(key) {
    if (!this._liveSig) return;
    if (key == null) this._liveSig = {};
    else delete this._liveSig[key];
  }

  /** Polling de respaldo: corre tickFn cada `ms`, pausado mientras la pestana
      esta oculta, y dispara un tick inmediato al volver a estar visible. */
  startLivePoll(ms, tickFn) {
    this.stopLivePoll();
    if (!(ms > 0) || typeof tickFn !== 'function') return;
    this._livePollTimer = setInterval(() => { if (!document.hidden) tickFn(); }, ms);
    this._livePollVis = () => { if (!document.hidden) tickFn(); };
    document.addEventListener('visibilitychange', this._livePollVis);
  }

  stopLivePoll() {
    if (this._livePollTimer) { clearInterval(this._livePollTimer); this._livePollTimer = null; }
    if (this._livePollVis) { document.removeEventListener('visibilitychange', this._livePollVis); this._livePollVis = null; }
  }

  /** Teardown de toda la maquinaria live. Lo llama destroy(). */
  liveTeardown() {
    this.liveUnsubscribe();
    this.stopLivePoll();
  }

  /* ── Logo dinamico sobre degradado (compartido) ─────────────────────
     Tinta un <img> (logo / marca de agua) en BLANCO sobre fondo oscuro o en
     GRIS oscuro sobre fondo palido, leyendo la luminancia del degradado de
     `gradEl` justo bajo el logo. Asi el logo nunca desaparece contra su fondo.
     Lo usan el hero del Dashboard y el de BrandOrganization.
     opts: { relX, relY, threshold=0.5, whiteOpacity=0.16, paleOpacity=0.30 }.
     Si relX/relY no se pasan, se infieren de la posicion real del <img>. */
  tintLogoByGradient(imgEl, gradEl, opts = {}) {
    if (!imgEl || !gradEl) return;
    const { threshold = 0.5, whiteOpacity = 0.16, paleOpacity = 0.30 } = opts;
    let relX = opts.relX, relY = opts.relY;
    if (relX == null || relY == null) {
      relX = 0.9; relY = 0.18; // fallback: esquina sup. derecha
      try {
        const hr = gradEl.getBoundingClientRect();
        const lr = imgEl.getBoundingClientRect();
        if (hr.width > 0 && hr.height > 0 && lr.width > 0) {
          relX = Math.min(1, Math.max(0, (lr.left + lr.width / 2 - hr.left) / hr.width));
          relY = Math.min(1, Math.max(0, (lr.top + lr.height / 2 - hr.top) / hr.height));
        }
      } catch (_) {}
    }
    const lum = this._sampleGradientLuminance(gradEl, relX, relY);
    // lum en [0,1]; null si no se pudo medir → asumimos oscuro (default blanco).
    const isPale = lum != null && lum > threshold;
    if (isPale) {
      // Gris oscuro visible (no negro): brightness(0)=negro, invert(0.42)≈#6b6b6b.
      imgEl.style.filter = 'brightness(0) invert(0.42) drop-shadow(0 1px 4px rgba(255,255,255,0.45))';
      imgEl.style.opacity = String(paleOpacity);
    } else {
      imgEl.style.filter = 'brightness(0) invert(1) drop-shadow(0 2px 6px rgba(0,0,0,0.35))';
      imgEl.style.opacity = String(whiteOpacity);
    }
  }

  /* Parsea el background-image (primer degradado resuelto) de `el`, interpola
     el color del stop en (relX, relY) y devuelve su luminancia relativa (WCAG,
     0..1). Devuelve null si no hay degradado parseable. Maneja fondos con
     varias capas de gradiente: usa SOLO la primera (capa superior visible). */
  _sampleGradientLuminance(el, relX, relY) {
    try {
      const bg = getComputedStyle(el).backgroundImage || '';
      // Extrae el primer linear-gradient(...) con parentesis balanceados
      // (rgb()/rgba() anidan parentesis → no se puede con un regex simple).
      const start = bg.toLowerCase().indexOf('linear-gradient(');
      if (start === -1) return null;
      let i = start + 'linear-gradient('.length;
      let depth = 1, inner = '';
      for (; i < bg.length && depth > 0; i++) {
        const ch = bg[i];
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) break; }
        inner += ch;
      }
      // Angulo (default 180deg = to bottom si no se especifica).
      let angle = 180;
      const angM = inner.match(/^\s*(-?[\d.]+)deg/);
      if (angM) angle = parseFloat(angM[1]);
      // Stops: rgb()/rgba()/#hex con porcentaje opcional.
      const stopRe = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s*([\d.]+%)?/gi;
      const stops = [];
      let s;
      while ((s = stopRe.exec(inner)) !== null) {
        const rgb = this._parseColor(s[1]);
        if (rgb) stops.push({ rgb, pos: s[2] ? parseFloat(s[2]) / 100 : null });
      }
      if (stops.length === 0) return null;
      if (stops.length === 1) return this._relLuminance(stops[0].rgb);
      // Normaliza posiciones faltantes (reparto uniforme).
      if (stops[0].pos == null) stops[0].pos = 0;
      if (stops[stops.length - 1].pos == null) stops[stops.length - 1].pos = 1;
      for (let k = 1; k < stops.length - 1; k++) {
        if (stops[k].pos == null) stops[k].pos = k / (stops.length - 1);
      }

      // Proyeccion del punto (relX,relY) sobre el eje del gradiente CSS.
      // CSS: 0deg = hacia arriba, 90deg = derecha.
      const a = (angle * Math.PI) / 180;
      const dx = Math.sin(a);
      const dy = -Math.cos(a);
      const px = relX - 0.5;
      const py = relY - 0.5;
      const halfLen = (Math.abs(dx) + Math.abs(dy)) / 2;
      let t = halfLen > 0 ? (px * dx + py * dy) / (2 * halfLen) + 0.5 : 0.5;
      t = Math.min(1, Math.max(0, t));

      // Interpola entre los dos stops que rodean t.
      let lo = stops[0], hi = stops[stops.length - 1];
      for (let k = 0; k < stops.length - 1; k++) {
        if (t >= stops[k].pos && t <= stops[k + 1].pos) { lo = stops[k]; hi = stops[k + 1]; break; }
      }
      const span = hi.pos - lo.pos || 1;
      const f = Math.min(1, Math.max(0, (t - lo.pos) / span));
      const rgb = [0, 1, 2].map((c) => lo.rgb[c] + (hi.rgb[c] - lo.rgb[c]) * f);
      return this._relLuminance(rgb);
    } catch (_) { return null; }
  }

  _parseColor(str) {
    const rgbM = str.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
    if (rgbM) return [parseFloat(rgbM[1]), parseFloat(rgbM[2]), parseFloat(rgbM[3])];
    let h = str.replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length >= 6) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    return null;
  }

  _relLuminance(rgb) {
    const lin = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  /**
   * Chime de dos tonos (Do5 → Mi5) con Web Audio API — el sonido canonico de
   * "tarea larga terminada" de la plataforma (nacio en el chat de Vera; Studio
   * lo usa al llegar la produccion). Sintetizado: no requiere archivos.
   */
  _playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      const playTone = (freq, startAt, duration, gainValue) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type      = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);

        gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
        gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);

        osc.start(ctx.currentTime + startAt);
        osc.stop(ctx.currentTime + startAt + duration);
      };

      // Chime de dos tonos — ascendente: Do5 → Mi5
      playTone(523.25, 0,    0.35, 0.25);  // Do5
      playTone(659.25, 0.18, 0.45, 0.20);  // Mi5

      // Cerrar el contexto después de que termine
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch (_) {
      // Web Audio no disponible — ignorar silenciosamente
    }
  }
}

// Hacer disponible globalmente
window.BaseView = BaseView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaseView;
}

