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
    if (oldValue === value) return;
    this.state[key] = value;

    if (persist) {
      this._debouncedPersist();
    }

    this.notifyListeners(key, value, oldValue);
  }

  _debouncedPersist() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      try { localStorage.setItem('app_state', JSON.stringify(this.state)); }
      catch (_) {}
    }, 100);
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
    if (!(key in this.state)) return;
    const oldValue = this.state[key];
    delete this.state[key];
    this._debouncedPersist();
    this.notifyListeners(key, undefined, oldValue);
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
}

// Crear instancia global
window.appState = new AppState();

window.appState._cleanupInterval = setInterval(() => {
  window.appState.cacheCleanup();
}, 60000);

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppState;
}

