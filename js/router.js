/**
 * Router - Sistema de navegación para SPA
 * 
 * Maneja rutas sin recargar la página usando History API.
 * Por defecto crea una instancia nueva por ruta; las vistas pueden implementar
 * `handleSameViewClassNavigation(path, routeParams)` para reutilizar la instancia
 * y el DOM cuando la URL cambia pero el shell es el mismo (menos parpadeo).
 * 
 * @class Router
 * @example
 * // Registrar una ruta
 * window.router.register('/mi-ruta', MiVista, {
 *   requiresAuth: true,
 *   redirectIfAuth: false
 * });
 * 
 * // Navegar a una ruta
 * window.router.navigate('/mi-ruta');
 */
class Router {
  constructor() {
    this.routes = {};
    this.currentView = null;
    this.currentRoute = null;
    this._handlingRoute = false;
    this._pendingRoute = null;
    // Back/forward cache: por path guardamos scrollY (siempre) y opcionalmente
    // el HTML del contenedor si la vista lo declaró `cacheable = true`. LRU
    // simple de 6 entradas para acotar memoria.
    this._bfCache = new Map();
    this._BF_CACHE_LIMIT = 6;
    this._BF_HTML_TTL = 60 * 1000;
    this.init();
  }

  _bfNormalizePath(p) {
    if (!p || typeof p !== 'string') return '/';
    let path = p.startsWith('/') ? p : '/' + p;
    if (path === '' || path === '/index.html') path = '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  }

  _bfSnapshot(view, fromPath) {
    if (!fromPath) return;
    const key = this._bfNormalizePath(fromPath);
    const container = document.getElementById('app-container');
    if (!container) return;
    const cacheable = view && view.constructor && view.constructor.cacheable === true;
    const entry = {
      scrollY: window.scrollY || window.pageYOffset || 0,
      html: cacheable ? container.innerHTML : null,
      t: Date.now()
    };
    // LRU: borrar y reinsertar para mover al final.
    if (this._bfCache.has(key)) this._bfCache.delete(key);
    this._bfCache.set(key, entry);
    while (this._bfCache.size > this._BF_CACHE_LIMIT) {
      const oldest = this._bfCache.keys().next().value;
      this._bfCache.delete(oldest);
    }
  }

  _bfGet(path) {
    const key = this._bfNormalizePath(path);
    const entry = this._bfCache.get(key);
    if (!entry) return null;
    // Refresh LRU.
    this._bfCache.delete(key);
    this._bfCache.set(key, entry);
    return entry;
  }

  /** Restaura el scroll de una entrada en el próximo frame (cuando ya pintó la vista). */
  _bfRestoreScroll(entry) {
    if (!entry || typeof entry.scrollY !== 'number') return;
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: entry.scrollY, behavior: 'instant' in window ? 'instant' : 'auto' }); }
      catch (_) { window.scrollTo(0, entry.scrollY); }
    });
  }

  /**
   * Inicializar el router
   */
  init() {
    // Usar History API en lugar de hash-based routing
    // Escuchar cambios en el historial (botones atrás/adelante)
    window.addEventListener('popstate', () => this.handleRoute());
    // Ruta inicial la dispara app.init() una sola vez para evitar doble render y parpadeo
  }

  /**
   * Registrar una ruta
   * @param {string} path - Ruta (ej: '/', '/login', '/production')
   * @param {Function|Promise} viewLoader - Clase de vista o función que retorna la clase
   * @param {Object} options - Opciones de la ruta
   * @param {boolean} options.requiresAuth - Si requiere autenticación
   * @param {boolean} options.redirectIfAuth - Si redirige si ya está autenticado
   */
  register(path, viewLoader, options = {}) {
    if (!viewLoader) return;
    
    this.routes[path] = {
      viewLoader,
      requiresAuth: options.requiresAuth || false,
      redirectIfAuth: options.redirectIfAuth || false
    };
  }

  /**
   * Resuelve la clase de vista desde la config de ruta (clase directa o lazy loader).
   * @param {{ viewLoader: Function }} route
   * @returns {Promise<Function|null>}
   */
  async _resolveViewClassFromRoute(route) {
    if (!route || !route.viewLoader) return null;
    const loader = route.viewLoader;
    if (typeof loader === 'function') {
      const isClass = loader.prototype && loader.prototype.constructor === loader;
      if (isClass) return loader;
      const result = await loader();
      return result.default || result;
    }
    return null;
  }

  /**
   * Navegar a una ruta usando History API
   * @param {string} path - Ruta destino
   * @param {boolean} replace - Si true, reemplaza en historial (no agrega entrada)
   */
  navigate(path, replace = false) {
    // Normalizar path
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Usar History API - siempre navegar (sin verificación de ruta duplicada)
    if (replace) {
      window.history.replaceState({ path: normalizedPath }, '', normalizedPath);
    } else {
      window.history.pushState({ path: normalizedPath }, '', normalizedPath);
    }
    
    // Manejar ruta inmediatamente
    this.handleRoute();
  }

  /**
   * Manejar cambio de ruta
   */
  async handleRoute() {
    if (this._handlingRoute) {
      this._pendingRoute = window.location.pathname;
      return;
    }
    this._handlingRoute = true;

    try {
      let path = window.location.pathname || '/';
      if (!path.startsWith('/')) path = '/' + path;
      if (path === '' || path === '/index.html') path = '/';
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      if (path.includes('//')) {
        path = path.replace(/\/\/+/g, (m) => (m.length === 2 ? '/org/' : '/'));
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', path + (window.location.search || ''));
        }
      }

      const orgSettingsMatch = path.match(/^\/org\/[^/]+\/[^/]+\/settings$/);
      if (orgSettingsMatch) {
        const query = window.location.search || '';
        this._handlingRoute = false;
        this.navigate('/home' + query, true);
        return;
      }

      let route = this.routes[path];
      let routeParams = {};

      // Reconocer explícitamente /org/.../tasks y /tasks para evitar que otra ruta genérica coincida antes
      const tasksOrgMatch = path.match(/^\/org\/([^/]+)\/([^/]+)\/tasks(?:\/([^/]+))?$/);
      const tasksRootMatch = path.match(/^\/tasks(?:\/([^/]+))?$/);
      if (!route && (tasksOrgMatch || tasksRootMatch)) {
        if (tasksOrgMatch) {
          routeParams.orgIdShort = tasksOrgMatch[1];
          routeParams.orgNameSlug = tasksOrgMatch[2];
          if (tasksOrgMatch[3]) routeParams.taskId = tasksOrgMatch[3];
          route = this.routes[routeParams.taskId ? '/org/:orgIdShort/:orgNameSlug/tasks/:taskId' : '/org/:orgIdShort/:orgNameSlug/tasks'];
        } else if (tasksRootMatch) {
          if (tasksRootMatch[1]) routeParams.taskId = tasksRootMatch[1];
          route = this.routes[routeParams.taskId ? '/tasks/:taskId' : '/tasks'];
        }
      }

      if (!route) {
        for (const [routePattern, routeConfig] of Object.entries(this.routes)) {
          if (routePattern.includes(':')) {
            const patternRegex = new RegExp('^' + routePattern.replace(/:[^/]+/g, '([^/]+)') + '$');
            const match = path.match(patternRegex);
            if (match) {
              const paramNames = routePattern.match(/:[^/]+/g) || [];
              const paramValues = match.slice(1);
              paramNames.forEach((paramName, index) => {
                routeParams[paramName.replace(':', '')] = paramValues[index];
              });
              route = routeConfig;
              break;
            }
          }
        }
      }

      // Resolver org: /org/:orgIdShort/:orgNameSlug/... → routeParams.orgId (UUID)
      // Asegurar sesión cargada antes de resolver (en refresh getCurrentUser puede ser null aún)
      if (routeParams.orgIdShort && routeParams.orgNameSlug) {
        if (window.authService && typeof window.authService.checkSession === 'function') {
          await window.authService.checkSession();
        }
        if (typeof window.resolveOrgIdFromShortAndSlug === 'function') {
          const resolved = await window.resolveOrgIdFromShortAndSlug(routeParams.orgIdShort, routeParams.orgNameSlug);
          if (resolved) {
            routeParams.orgId = resolved.id;
            window.currentOrgId = resolved.id;
            window.currentOrgSlug = routeParams.orgNameSlug;
            window.currentOrgName = resolved.name || '';
          } else {
            this._handlingRoute = false;
            const isAuth = await this.checkAuthentication();
            if (!isAuth) {
              this.navigate('/login', true);
              return;
            }
            let defaultUrl = '/home';
            if (window.authService && window.authService.getCurrentUser()?.id) {
              defaultUrl = typeof window.authService.getDefaultUserRoute === 'function'
                ? await window.authService.getDefaultUserRoute(window.authService.getCurrentUser().id)
                : await this._getDefaultUserRouteFallback(window.authService.getCurrentUser().id);
            } else if (window.supabase) {
              const { data: { user } } = await window.supabase.auth.getUser();
              if (user?.id) defaultUrl = await this._getDefaultUserRouteFallback(user.id);
            }
            this.navigate(defaultUrl, true);
            return;
          }
        }
      } else if (routeParams.orgId) {
        window.currentOrgId = routeParams.orgId;
        window.currentOrgSlug = window.currentOrgSlug || '';
        window.currentOrgName = window.currentOrgName || '';
      } else {
        window.currentOrgId = null;
        window.currentOrgSlug = null;
        window.currentOrgName = null;
      }

      // Tema de marca: solo 1 vez al entrar a la org (evita flasheo al navegar entre production, products, etc.)
      if (window.OrgBrandTheme) {
        const appliedId = window._orgBrandThemeAppliedId;
        if (window.currentOrgId) {
          if (appliedId !== window.currentOrgId) {
            window._orgBrandThemeAppliedId = window.currentOrgId;
            window.OrgBrandTheme.applyOrgBrandTheme(window.currentOrgId);
          }
        } else {
          if (appliedId != null) {
            window._orgBrandThemeAppliedId = null;
            window.OrgBrandTheme.clearOrgBrandTheme();
          }
        }
      }

      if (!route) {
        const route404 = this.routes['/404'];
        if (route404) {
          route = route404;
        } else if (this.routes['/']) {
          this._handlingRoute = false;
          this.navigate('/', true);
          return;
        } else {
          return;
        }
      }

      // Single auth check (cached) instead of calling twice
      let isAuth = null;
      if (route.requiresAuth || route.redirectIfAuth) {
        isAuth = await this.checkAuthentication();
      }
      if (route.requiresAuth && !isAuth) {
        this._handlingRoute = false;
        this.navigate('/login', true);
        return;
      }
      if (route.redirectIfAuth && isAuth) {
        const redirectRoute = await this.getAuthenticatedRedirect();
        this._handlingRoute = false;
        this.navigate(redirectRoute, true);
        return;
      }

      const container = document.getElementById('app-container');
      if (!container) return;

      const ViewClass = await this._resolveViewClassFromRoute(route);
      if (!ViewClass || typeof ViewClass !== 'function') return;

      const prevView = this.currentView;
      const canSoftNavigate =
        prevView &&
        prevView.constructor === ViewClass &&
        typeof prevView.handleSameViewClassNavigation === 'function';

      if (canSoftNavigate) {
        try {
          const handled = await prevView.handleSameViewClassNavigation(path, routeParams);
          if (handled) {
            this.currentView = prevView;
            this.currentRoute = path;
            prevView.routeParams = routeParams;
            document.body.classList.toggle('route-landing', path === '/');
            document.body.classList.toggle('route-dev', path.startsWith('/dev/'));

            if (window.appNavigation && typeof window.appNavigation.render === 'function') {
              window.appNavigation.render();
            }

            this._playRouteFade(container);
            window.dispatchEvent(new CustomEvent('routechange', { detail: { path, params: routeParams } }));
            return;
          }
        } catch (e) {
          console.warn('Router: soft navigation falló, se hace montaje completo.', e);
        }
      }

      // Montaje completo: destruir vista anterior. No vaciar innerHTML aquí:
      // la nueva vista reemplaza el DOM en BaseView.render() y así evitamos un
      // frame en blanco entre ambas vistas.
      if (prevView) {
        // Guardar snapshot (scroll siempre; HTML solo si la vista opta in con
        // `static cacheable = true`) antes de destruir.
        this._bfSnapshot(prevView, this.currentRoute);
        this.currentView = null;
        if (typeof prevView.onLeave === 'function') {
          try { prevView.onLeave(); } catch (_) {}
        }
        if (typeof prevView.destroy === 'function') {
          try { prevView.destroy(); } catch (_) {}
        }
      }

      document.body.classList.toggle('route-landing', path === '/');
      document.body.classList.toggle('route-dev', path.startsWith('/dev/'));

      // Si hay HTML en bfCache fresco para esta ruta, pintarlo de inmediato
      // (instant restore). La vista hará su render normal encima — la vista
      // que opte in al cache debería detectar `this._restoredFromCache` y
      // refrescar incrementalmente en lugar de re-pintar el árbol.
      const cached = this._bfGet(path);
      const hasFreshHtml = cached && cached.html && (Date.now() - cached.t) < this._BF_HTML_TTL;
      if (hasFreshHtml) {
        container.innerHTML = cached.html;
      }

      this.currentView = new ViewClass();
      this.currentRoute = path;
      if (Object.keys(routeParams).length > 0) {
        this.currentView.routeParams = routeParams;
      }
      // Marcar la vista para que sepa si está siendo restaurada desde cache;
      // útil para que decida si re-renderizar todo o solo refrescar datos.
      this.currentView._restoredFromCache = !!hasFreshHtml;

      // Navigation render en paralelo con el render de la vista: no bloquea el
      // pintado de la vista nueva y evita que el sidebar se quede mostrando el
      // estado anterior durante la transición.
      const navRenderPromise = (window.appNavigation && typeof window.appNavigation.render === 'function')
        ? Promise.resolve().then(() => window.appNavigation.render()).catch(() => {})
        : Promise.resolve();

      const doRender = async () => {
        await this.currentView.render();
        await navRenderPromise;
      };

      // View Transitions API (Chrome 111+, Safari 18+, Edge 111+):
      // crossfade nativo a 60fps a nivel de pintura. Fallback al .route-fade-in
      // de 140ms si no hay soporte (Firefox aún no lo implementa).
      if (typeof document.startViewTransition === 'function' && !this._reduceMotion()) {
        try {
          const transition = document.startViewTransition(doRender);
          await transition.updateCallbackDone;
          // Path success de View Transitions: no se llama _playRouteFade, pero
          // sí necesitamos enhance de a11y labels en el nuevo DOM.
          this._enhanceA11yLabels(container);
        } catch (e) {
          console.warn('Router: View Transition falló, fallback a fade.', e);
          await doRender();
          this._playRouteFade(container);
        }
      } else {
        await doRender();
        this._playRouteFade(container);
      }

      // Restaurar scroll de back/forward al final (cuando el DOM ya está). Si
      // no hay entrada cacheada, volver al top (comportamiento previo).
      if (cached) this._bfRestoreScroll(cached);
      else window.scrollTo(0, 0);

      window.dispatchEvent(new CustomEvent('routechange', { detail: { path, params: routeParams } }));
    } catch (error) {
      console.error('Error manejando ruta:', error);
      if (window.errorLogger) {
        window.errorLogger.capture(error, { source: 'router.handleRoute', path: window.location.pathname });
      }
      if (window.errorHandler) {
        window.errorHandler.showError(error, 'Error cargando la página. Por favor, recarga.');
      } else {
        this.showError('Error cargando la página. Por favor, recarga.');
      }
    } finally {
      if (window.appLoader && typeof window.appLoader.hideSpinner === 'function') {
        window.appLoader.hideSpinner();
      }
      this._handlingRoute = false;
      if (this._pendingRoute) {
        const pending = this._pendingRoute;
        this._pendingRoute = null;
        // Evitar doble render/parpadeo: no volver a manejar la misma ruta que acabamos de renderizar
        if (pending !== this.currentRoute) {
          this.handleRoute();
        }
      }
    }
  }

  /**
   * Reinicia la animación de fade del contenedor de la vista actual.
   * Forzar un reflow (offsetHeight) garantiza que el navegador relance la
   * animación incluso cuando la clase ya estaba aplicada en la navegación anterior.
   */
  _playRouteFade(container) {
    if (!container || typeof container.classList === 'undefined') return;
    container.classList.remove('route-fade-in');
    void container.offsetHeight;
    container.classList.add('route-fade-in');
    // Post-render a11y enhance: copia `title` a `aria-label` en interactivos
    // sin aria. Baseline para screen readers cuando los autores olvidaron el
    // aria explícito; no pisa los que ya lo tienen.
    this._enhanceA11yLabels(container);
  }

  /** Copia title → aria-label en botones/links/[role] que no lo tienen. */
  _enhanceA11yLabels(scope) {
    if (!scope || !scope.querySelectorAll) return;
    const selectors = 'button[title]:not([aria-label]):not([aria-labelledby]),' +
                      'a[title]:not([aria-label]):not([aria-labelledby]),' +
                      '[role="button"][title]:not([aria-label]):not([aria-labelledby]),' +
                      '[role="tab"][title]:not([aria-label]):not([aria-labelledby])';
    try {
      scope.querySelectorAll(selectors).forEach((el) => {
        const t = (el.getAttribute('title') || '').trim();
        if (t) el.setAttribute('aria-label', t);
      });
    } catch (_) {}
  }

  /** Respeta prefers-reduced-motion: si el usuario lo pide, saltamos animaciones. */
  _reduceMotion() {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Prefetch: ejecuta el viewLoader de una ruta (carga sus scripts en el DOM)
   * sin instanciar la vista. Pensado para mouseenter en links del sidebar:
   * cuando el usuario hace click, los scripts ya están en caché del navegador.
   *
   * Es idempotente: si la clase ya está en window (porque la ruta ya se visitó)
   * resuelve inmediato. Si ya hay un prefetch en curso para esa ruta, no encola
   * uno nuevo.
   */
  prefetch(path) {
    if (!path || typeof path !== 'string') return Promise.resolve();
    if (!this._prefetched) this._prefetched = new Map();

    // Normalizar igual que handleRoute para que '/dashboard' y '/dashboard/' caigan en el mismo bucket.
    let key = path.startsWith('/') ? path : '/' + path;
    if (key.length > 1 && key.endsWith('/')) key = key.slice(0, -1);

    if (this._prefetched.has(key)) return this._prefetched.get(key);

    const route = this._findRouteForPath(key);
    if (!route) return Promise.resolve();

    const p = Promise.resolve()
      .then(() => this._resolveViewClassFromRoute(route))
      .catch((err) => {
        // No envenenamos el cache: si falla el prefetch, permitir reintento al
        // navegar de verdad. El click haría el load igual que sin prefetch.
        this._prefetched.delete(key);
        console.warn('Router.prefetch:', key, err && err.message);
      });
    this._prefetched.set(key, p);
    return p;
  }

  /** Busca la config de ruta para un path (exacta o con :params), sin ejecutarla. */
  _findRouteForPath(path) {
    if (this.routes[path]) return this.routes[path];
    for (const [pattern, config] of Object.entries(this.routes)) {
      if (!pattern.includes(':')) continue;
      const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
      if (re.test(path)) return config;
    }
    return null;
  }

  /**
   * Verificar autenticación
   * @returns {Promise<boolean>}
   */
  async checkAuthentication() {
    // Prioridad 1: Usar AuthService
    if (window.authService && typeof window.authService.isAuthenticated === 'function') {
      return await window.authService.isAuthenticated();
    }
    
    // Prioridad 2: Usar SupabaseService
    if (window.supabaseService) {
      try {
        const client = await window.supabaseService.getClient();
        if (client) {
          const { data: { user }, error } = await client.auth.getUser();
          return !error && user !== null;
        }
      } catch (error) {
        return false;
      }
    }
    
    // Fallback: verificar Supabase directamente
    if (window.supabase) {
      try {
        const { data: { user }, error } = await window.supabase.auth.getUser();
        return !error && user !== null;
      } catch (error) {
        return false;
      }
    }
    
    return false;
  }

  async _getDefaultUserRouteFallback(userId) {
    const supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
    if (!supabase || !userId) return '/create';
    try {
      const [membersRes, ownedRes] = await Promise.all([
        supabase.from('organization_members').select('organization_id, organizations(id, name)').eq('user_id', userId),
        supabase.from('organizations').select('id, name').eq('owner_user_id', userId)
      ]);
      const list = [];
      (membersRes.data || []).forEach((m) => {
        const o = m.organizations;
        const id = o?.id ?? m.organization_id;
        if (id) list.push({ id, name: (o && o.name) || '' });
      });
      (ownedRes.data || []).forEach((o) => {
        if (o?.id && !list.some((x) => x.id === o.id)) list.push({ id: o.id, name: o.name || '' });
      });
      if (list.length === 0) return '/create';
      const selectedId = localStorage.getItem('selectedOrganizationId');
      const org = selectedId ? list.find((x) => x.id === selectedId) || list[0] : list[0];
      if (typeof window.getOrgPathPrefix === 'function') {
        const prefix = window.getOrgPathPrefix(org.id, org.name);
        return prefix ? `${prefix}/dashboard` : '/create';
      }
      return `/org/${org.id}/dashboard`;
    } catch (e) {
      return '/create';
    }
  }

  async getAuthenticatedRedirect() {
    if (window.authService && typeof window.authService.determineRedirectRoute === 'function') {
      const user = window.authService.getCurrentUser();
      if (user?.id) return await window.authService.determineRedirectRoute(user.id);
    }
    const supabase = window.supabase || (window.supabaseService && (await window.supabaseService.getClient()));
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) return await this._getDefaultUserRouteFallback(user.id);
    }
    if (localStorage.getItem('userViewMode') === 'developer') return '/dev/dashboard';
    return '/create';
  }

  /**
   * Verificar si la ruta actual es una ruta de desarrollador
   * @returns {boolean}
   */
  isDevRoute() {
    const currentPath = window.location.pathname || '/';
    return currentPath.startsWith('/dev');
  }

  /**
   * Verificar si la ruta actual requiere modo desarrollador
   * @param {string} path - Ruta a verificar
   * @returns {boolean}
   */
  requiresDevMode(path) {
    return path.startsWith('/dev');
  }

  getCurrentRoute() {
    return this.currentRoute || window.location.pathname || '/';
  }

  /**
   * Mostrar error al usuario
   * @param {string} message - Mensaje de error
   */
  showError(message) {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = `
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
          <p style="color: var(--text-secondary, #a0a0a0);">${message}</p>
          <button onclick="window.location.reload()" style="
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: var(--primary-color, #ecebda);
            color: var(--bg-dark, #1a1a1a);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">Recargar Página</button>
        </div>
      `;
    }
  }
}

// Crear instancia global del router
window.router = new Router();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Router;
}

