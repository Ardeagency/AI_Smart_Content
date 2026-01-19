/**
 * BaseView - Clase base para todas las vistas de la SPA
 * 
 * Proporciona funcionalidad común: carga de templates, renderizado, cleanup.
 * Todas las vistas deben extender esta clase.
 * 
 * @class BaseView
 * @abstract
 * @example
 * class MiVista extends BaseView {
 *   constructor() {
 *     super();
 *     this.templatePath = 'mi-vista.html';
 *   }
 * 
 *   async init() {
 *     // Setup de la vista
 *   }
 * }
 */
class BaseView {
  constructor() {
    this.container = document.getElementById('app-container');
    this.templatePath = null;
    this.initialized = false;
    this.eventListeners = [];
  }

  /**
   * Cargar template HTML desde la carpeta templates/ (DEPRECATED - usar renderHTML)
   * @returns {Promise<string>} HTML del template
   * @deprecated Usar renderHTML() en su lugar para SPA real
   */
  async loadTemplate() {
    if (!this.templatePath) {
      throw new Error('templatePath no definido. Debes definir templatePath o implementar renderHTML() en la subclase.');
    }

    // Verificar cache del router
    if (window.router && window.router.templateCache) {
      const cached = window.router.templateCache.get(this.templatePath);
      if (cached) {
        return cached;
      }
    }

    try {
      // Verificar si se debe forzar recarga (cuando el caché fue limpiado)
      const forceReload = window.router && window.router.templateCache && 
                         !window.router.templateCache.has(this.templatePath);
      
      // Agregar timestamp para evitar caché del navegador/CDN si se fuerza recarga
      const url = forceReload 
        ? `templates/${this.templatePath}?t=${Date.now()}`
        : `templates/${this.templatePath}`;
      
      const response = await fetch(url, {
        cache: forceReload ? 'no-cache' : 'default'
      });
      
      if (!response.ok) {
        throw new Error(`Error cargando template: ${response.status} ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // Guardar en cache
      if (window.router && window.router.templateCache) {
        window.router.templateCache.set(this.templatePath, html);
      }
      
      return html;
    } catch (error) {
      console.error('❌ Error cargando template:', error);
      
      // Retornar HTML de error amigable
      return `
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 2rem;
          text-align: center;
        ">
          <div class="error-icon" style="font-size: 3rem; color: var(--accent-warm, #e09145); margin-bottom: 1rem;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h2 style="color: var(--text-primary, #ecebda); margin-bottom: 1rem;">Error cargando contenido</h2>
          <p style="color: var(--text-secondary, #a0a0a0);">No se pudo cargar el template: ${this.templatePath}</p>
        </div>
      `;
    }
  }

  /**
   * Generar HTML de la vista (método a sobrescribir en subclases)
   * @returns {string} HTML generado
   */
  renderHTML() {
    // Si tiene templatePath, usar loadTemplate (compatibilidad hacia atrás)
    if (this.templatePath) {
      return this.loadTemplate();
    }
    throw new Error('renderHTML() no implementado. Debes implementar este método o definir templatePath.');
  }

  /**
   * Renderizar la vista
   * Este método carga el template y lo inyecta en el container
   */
  async render() {
    if (!this.container) {
      console.error('❌ Container no encontrado. Asegúrate de que existe #app-container en el DOM.');
      return;
    }

    // Si ya está renderizado, no volver a renderizar
    if (this.initialized && this.container.innerHTML.trim() !== '') {
      console.log(`ℹ️ Vista ${this.constructor.name} ya renderizada, omitiendo re-renderizado`);
      // Solo asegurar que esté visible
      this.show();
      return;
    }

    // Mostrar loading
    this.showLoading();

    try {
      // Generar HTML (puede ser desde template o desde renderHTML)
      let html;
      if (typeof this.renderHTML === 'function' && this.renderHTML !== BaseView.prototype.renderHTML) {
        // Si renderHTML está sobrescrito, usarlo
        html = await this.renderHTML();
      } else if (this.templatePath) {
        // Si tiene templatePath, usar loadTemplate (compatibilidad)
        html = await this.loadTemplate();
      } else {
        throw new Error('No se puede renderizar: falta renderHTML() o templatePath');
      }
      
      // Si html es una Promise, esperarla
      if (html instanceof Promise) {
        html = await html;
      }
      
      // Inyectar HTML en el container (siempre reemplazar para asegurar que se muestre)
      this.container.innerHTML = html;
      
      // Actualizar links para usar router
      this.updateLinksForRouter();

      // Llamar a onEnter antes de inicializar (para preparar datos, etc.)
      await this.onEnter();

      // Inicializar vista (setup event listeners, componentes, etc.)
      await this.init();

      // Actualizar header con datos del usuario y contexto
      await this.updateHeader();

      this.initialized = true;

      // Ocultar loading
      this.hideLoading();
      
      console.log(`✅ Vista renderizada: ${this.constructor.name}`);
    } catch (error) {
      console.error('❌ Error renderizando vista:', error);
      
      // Usar ErrorHandler si está disponible
      if (window.errorHandler) {
        window.errorHandler.handle(error, { view: this.constructor.name });
      }
      
      this.container.innerHTML = `
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 2rem;
          text-align: center;
        ">
          <div class="error-icon" style="font-size: 3rem; color: var(--accent-warm, #e09145); margin-bottom: 1rem;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h2 style="color: var(--text-primary, #ecebda); margin-bottom: 1rem;">Error</h2>
          <p style="color: var(--text-secondary, #a0a0a0);">Error al cargar la vista: ${error.message}</p>
        </div>
      `;
    }
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
   * Override este método para guardar estado, limpiar recursos, etc.
   */
  async onLeave() {
    // Override en subclases
  }

  /**
   * Destruir la vista
   * NOTA: Las vistas ya NO se destruyen al navegar - se mantienen en cache
   * Este método solo se usa para limpieza completa cuando sea necesario
   */
  async destroy() {
    if (!this.initialized) {
      return;
    }

    try {
      // Llamar a onLeave para que la vista pueda hacer cleanup
      await this.onLeave();

      // Limpiar event listeners registrados
      this.cleanup();

      // Limpiar container solo si se solicita destrucción completa
      if (this.container) {
        this.container.innerHTML = '';
      }

      this.initialized = false;
      console.log(`🧹 Vista destruida: ${this.constructor.name}`);
    } catch (error) {
      console.error('❌ Error destruyendo vista:', error);
    }
  }
  
  /**
   * Ocultar la vista (sin destruir)
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }
  
  /**
   * Mostrar la vista
   */
  show() {
    if (this.container) {
      this.container.style.display = '';
    }
  }

  /**
   * Limpiar recursos
   * Override este método en subclases para remover event listeners específicos, timers, etc.
   */
  cleanup() {
    // Remover todos los event listeners registrados
    this.eventListeners.forEach(({ element, event, handler }) => {
      if (element && handler) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners = [];
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
   * Mostrar loading state
   */
  showLoading() {
    if (this.container) {
      this.container.innerHTML = `
        <div class="view-loading" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 2rem;
        ">
          <div class="loading-spinner" style="
            width: 40px;
            height: 40px;
            border: 3px solid rgba(236, 235, 218, 0.2);
            border-top-color: var(--accent-warm, #e09145);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></div>
          <p style="
            margin-top: 1rem;
            color: var(--text-secondary, #a0a0a0);
            font-size: 0.875rem;
          ">Cargando...</p>
        </div>
      `;
    }
  }

  /**
   * Ocultar loading state
   */
  hideLoading() {
    // El contenido ya está renderizado, no hay que hacer nada
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
    const links = this.container.querySelectorAll('a[href^="#"], a[href^="/"]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('#') || href.startsWith('/'))) {
        // Normalizar href
        let path = href.replace('#', '');
        if (!path.startsWith('/')) {
          path = '/' + path;
        }
        
        // Agregar event listener para usar router
        this.addEventListener(link, 'click', (e) => {
          e.preventDefault();
          if (window.router) {
            window.router.navigate(path);
          }
        });
        
        // Actualizar href para que sea clickeable sin JS
        link.setAttribute('href', path);
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
                <i class="fas fa-bars"></i>
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
            
            <!-- ZONA DERECHA: USUARIO -->
            <div class="header-right">
                <div class="header-user" id="headerUser">
                    <div class="header-user-avatar" id="headerUserAvatar">
                        <span class="header-user-initials" id="headerUserInitials">U</span>
                    </div>
                    <button class="header-user-chevron" id="headerUserChevron" aria-label="Menú de usuario">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                
                <!-- Dropdown de usuario -->
                <div class="header-user-dropdown" id="headerUserDropdown">
                    <div class="header-user-dropdown-item" data-action="profile">
                        <i class="fas fa-user"></i>
                        <span>Perfil</span>
                    </div>
                    <div class="header-user-dropdown-item header-user-logout" id="headerUserLogout" data-action="logout">
                        <i class="fas fa-sign-out-alt"></i>
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
   * Escapar HTML para prevenir XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Actualizar header existente con nuevo contexto
   * Útil cuando el header ya está en el DOM (templates)
   */
  updateHeaderContext(section, activeObject = null, organizationName = null) {
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return;

    // Verificar si el toggle button ya existe
    let toggleButton = document.getElementById('headerSidebarToggle');
    if (!toggleButton) {
      // Crear toggle button si no existe
      const headerContent = document.querySelector('.header-content');
      if (headerContent) {
        toggleButton = document.createElement('button');
        toggleButton.className = 'header-sidebar-toggle';
        toggleButton.id = 'headerSidebarToggle';
        toggleButton.setAttribute('aria-label', 'Toggle sidebar');
        toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
        headerContent.insertBefore(toggleButton, headerContent.firstChild);
      }
    }

    let html = `
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

    // Actualizar avatar del usuario
    const supabase = await this.getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      // Obtener perfil del usuario
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, email, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      const headerUserInitials = document.getElementById('headerUserInitials');
      const headerUserAvatar = document.getElementById('headerUserAvatar');

      if (profile) {
        // Generar iniciales
        if (headerUserInitials) {
          const name = profile.full_name || profile.email || 'Usuario';
          const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          headerUserInitials.textContent = initials || 'U';
        }

        // Si hay avatar URL, usarlo
        if (headerUserAvatar && profile.avatar_url) {
          headerUserAvatar.style.backgroundImage = `url(${profile.avatar_url})`;
          headerUserAvatar.style.backgroundSize = 'cover';
          headerUserAvatar.style.backgroundPosition = 'center';
          if (headerUserInitials) {
            headerUserInitials.style.display = 'none';
          }
        }
      }

      // Setup event listeners para dropdown de usuario
      this.setupHeaderUserDropdown();
    } catch (error) {
      console.error('Error actualizando header:', error);
    }
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
      toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
      const headerContent = existingHeader.querySelector('.header-content');
      if (headerContent) {
        headerContent.insertBefore(toggleButton, headerContent.firstChild);
      }
    }

    // Actualizar zona izquierda con nuevo formato
    this.updateHeaderContext(section, null, null);

    // Actualizar zona derecha con nuevo formato de usuario
    headerRight.innerHTML = `
      <div class="header-user" id="headerUser">
        <div class="header-user-avatar" id="headerUserAvatar">
          <span class="header-user-initials" id="headerUserInitials">U</span>
        </div>
        <button class="header-user-chevron" id="headerUserChevron" aria-label="Menú de usuario">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
      
      <!-- Dropdown de usuario -->
      <div class="header-user-dropdown" id="headerUserDropdown">
        <div class="header-user-dropdown-item" data-action="profile">
          <i class="fas fa-user"></i>
          <span>Perfil</span>
        </div>
        <div class="header-user-dropdown-item header-user-logout" id="headerUserLogout" data-action="logout">
          <i class="fas fa-sign-out-alt"></i>
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

    // Toggle dropdown
    headerUser.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = headerUserDropdown.classList.contains('open');
      
      // Cerrar otros dropdowns
      document.querySelectorAll('.header-user-dropdown.open').forEach(dropdown => {
        if (dropdown !== headerUserDropdown) {
          dropdown.classList.remove('open');
        }
      });

      if (isOpen) {
        headerUserDropdown.classList.remove('open');
        const icon = headerUserChevron.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-up');
          icon.classList.add('fa-chevron-down');
        }
      } else {
        headerUserDropdown.classList.add('open');
        const icon = headerUserChevron.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-down');
          icon.classList.add('fa-chevron-up');
        }
      }
    });

    // Logout
    if (headerUserLogout) {
      headerUserLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.handleLogout();
      });
    }

    // Perfil
    const profileItem = headerUserDropdown.querySelector('[data-action="profile"]');
    if (profileItem) {
      profileItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // TODO: Navegar a perfil de usuario
        if (window.router) {
          window.router.navigate('/settings?tab=profile');
        }
        headerUserDropdown.classList.remove('open');
      });
    }

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header-user')) {
        headerUserDropdown.classList.remove('open');
        const icon = headerUserChevron.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-up');
          icon.classList.add('fa-chevron-down');
        }
      }
    });
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
    } else {
      // Para elementos protegidos, preservar los valores del CSS
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
}

// Hacer disponible globalmente
window.BaseView = BaseView;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaseView;
}

