/**
 * AppState - Estado global de la aplicación
 * Maneja estado compartido entre vistas y persistencia
 */
class AppState {
  constructor() {
    this.state = {};
    this.listeners = [];
    this.cache = new Map();
    this.init();
  }

  /**
   * Inicializar estado desde localStorage
   */
  init() {
    try {
      const savedState = localStorage.getItem('app_state');
      if (savedState) {
        this.state = JSON.parse(savedState);
      }
    } catch (error) {
      console.error('Error cargando estado guardado:', error);
      this.state = {};
    }
  }

  /**
   * Establecer un valor en el estado
   * @param {string} key - Clave del estado
   * @param {*} value - Valor a guardar
   * @param {boolean} persist - Si true, guarda en localStorage
   */
  set(key, value, persist = false) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Guardar en localStorage si es persistente
    if (persist) {
      try {
        localStorage.setItem('app_state', JSON.stringify(this.state));
      } catch (error) {
        console.error('Error guardando estado:', error);
      }
    }

    // Notificar listeners
    this.notifyListeners(key, value, oldValue);
  }

  /**
   * Obtener un valor del estado
   * @param {string} key - Clave del estado
   * @param {*} defaultValue - Valor por defecto si no existe
   * @returns {*}
   */
  get(key, defaultValue = null) {
    return this.state[key] !== undefined ? this.state[key] : defaultValue;
  }

  /**
   * Eliminar un valor del estado
   * @param {string} key - Clave a eliminar
   */
  remove(key) {
    delete this.state[key];
    try {
      localStorage.setItem('app_state', JSON.stringify(this.state));
    } catch (error) {
      console.error('Error guardando estado:', error);
    }
    this.notifyListeners(key, undefined, this.state[key]);
  }

  /**
   * Limpiar todo el estado
   */
  clear() {
    this.state = {};
    this.cache.clear();
    try {
      localStorage.removeItem('app_state');
    } catch (error) {
      console.error('Error limpiando estado:', error);
    }
    this.notifyListeners('*', null, null);
  }

  /**
   * Suscribirse a cambios de estado
   * @param {string|Function} keyOrCallback - Clave específica o callback para todos los cambios
   * @param {Function} callback - Callback (si se especificó key)
   * @returns {Function} Función para desuscribirse
   */
  subscribe(keyOrCallback, callback = null) {
    let key, cb;

    if (typeof keyOrCallback === 'function') {
      // Solo callback, escuchar todos los cambios
      key = '*';
      cb = keyOrCallback;
    } else {
      // Key y callback
      key = keyOrCallback;
      cb = callback;
    }

    const listener = { key, callback: cb };
    this.listeners.push(listener);

    // Retornar función para desuscribirse
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notificar a los listeners
   */
  notifyListeners(key, newValue, oldValue) {
    this.listeners.forEach(listener => {
      if (listener.key === '*' || listener.key === key) {
        try {
          listener.callback(key, newValue, oldValue);
        } catch (error) {
          console.error('Error en listener de estado:', error);
        }
      }
    });
  }

  /**
   * Cachear un valor
   * @param {string} key - Clave del cache
   * @param {*} value - Valor a cachear
   * @param {number} ttl - Tiempo de vida en ms (opcional)
   */
  cacheSet(key, value, ttl = null) {
    const cacheEntry = {
      value,
      timestamp: Date.now(),
      ttl: ttl || null
    };
    this.cache.set(key, cacheEntry);
  }

  /**
   * Obtener valor del cache
   * @param {string} key - Clave del cache
   * @returns {*} Valor cacheado o null si expiró/no existe
   */
  cacheGet(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Verificar si expiró
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Limpiar cache
   */
  cacheClear() {
    this.cache.clear();
  }

  /**
   * Limpiar cache expirado
   */
  cacheCleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl && now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Obtener todo el estado
   * @returns {Object}
   */
  getAll() {
    return { ...this.state };
  }

  // --- Workspace First: estado de usuario y organización activa ---

  /**
   * Establecer usuario actual (persistente para sesión)
   * @param {Object|null} user - Objeto usuario de Supabase auth o null para limpiar
   */
  setCurrentUser(user) {
    this.set('currentUser', user, true);
  }

  /**
   * Obtener usuario actual
   * @returns {Object|null}
   */
  getCurrentUser() {
    return this.get('currentUser');
  }

  /**
   * Establecer organización activa (workspace)
   * @param {Object|null} org - { id, name, ... } o null para salir del workspace
   */
  setCurrentOrganization(org) {
    this.set('currentOrganization', org, true);
  }

  /**
   * Obtener organización activa
   * @returns {Object|null}
   */
  getCurrentOrganization() {
    return this.get('currentOrganization');
  }

  /**
   * Obtener ID de la organización activa (para navegación)
   * @returns {string|null}
   */
  getCurrentOrgId() {
    const org = this.get('currentOrganization');
    return org ? (org.id || org.organization_id || null) : null;
  }

  /**
   * Limpiar contexto de workspace (al cerrar sesión o salir a root)
   */
  clearWorkspaceContext() {
    this.set('currentOrganization', null, true);
    this.cacheClear();
  }

  /**
   * Limpiar todo el estado de sesión (logout)
   */
  clearSession() {
    this.set('currentUser', null, true);
    this.clearWorkspaceContext();
  }
}

// Crear instancia global
window.appState = new AppState();

// Limpiar cache expirado periódicamente
setInterval(() => {
  window.appState.cacheCleanup();
}, 60000); // Cada minuto

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppState;
}

