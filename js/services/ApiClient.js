/**
 * ApiClient — capa de fetch con caché en memoria, dedupe y stale-while-revalidate.
 *
 * Propósito: las vistas paran de re-fetchar los mismos datos al navegar. Es el
 * patrón que usan TanStack Query / SWR (server state cache) pero implementado
 * en vanilla porque no tenemos React.
 *
 * Uso típico:
 *
 *   const orgs = await apiClient.query(
 *     `user-orgs:${userId}`,
 *     async () => {
 *       const supabase = await apiClient.getSupabase();
 *       const { data, error } = await supabase
 *         .from('organization_members')
 *         .select('organization_id, organizations(id, name)')
 *         .eq('user_id', userId);
 *       if (error) throw error;
 *       return data;
 *     },
 *     { ttl: 5 * 60 * 1000, staleWhileRevalidate: true }
 *   );
 *
 * Invalidación:
 *   apiClient.invalidate('user-orgs:abc');               // key exacta
 *   apiClient.invalidate((k) => k.startsWith('orgs:'));  // por prefijo
 *   apiClient.clear();                                   // todo
 *
 * Mutaciones (helper opcional):
 *   await apiClient.mutate(
 *     async () => supabase.from('products').update({ ... }).eq('id', id),
 *     { invalidate: (k) => k.startsWith('products:') }
 *   );
 */
(function () {
  'use strict';

  const DEFAULT_TTL = 30 * 1000;          // 30 s
  const DEFAULT_GC  = 10 * 60 * 1000;     // 10 min: las entradas más viejas se purgan
  const MAX_ENTRIES = 200;                // límite duro para no crecer sin freno

  class ApiClient {
    constructor() {
      this._cache    = new Map();   // key → { data, t, expiresAt }
      this._inflight = new Map();   // key → Promise<data> en vuelo
      this._listeners = new Map();  // key → Set<(data, error)>>  (suscripciones de UI)
      // GC ligero: corre cada 60 s y borra entradas más viejas que DEFAULT_GC.
      setInterval(() => this._gc(), 60 * 1000);
    }

    /**
     * @param {string} key       — identificador estable de la query
     * @param {() => Promise<any>} fetcher
     * @param {object} [opts]
     * @param {number} [opts.ttl]                       — ms de frescura (default 30s)
     * @param {boolean} [opts.staleWhileRevalidate]     — default true
     * @param {boolean} [opts.force]                    — ignora cache y refetcha
     * @returns {Promise<any>}
     */
    async query(key, fetcher, opts = {}) {
      if (!key || typeof fetcher !== 'function') {
        throw new Error('apiClient.query: key y fetcher son obligatorios');
      }
      const ttl  = typeof opts.ttl === 'number' ? opts.ttl : DEFAULT_TTL;
      const swr  = opts.staleWhileRevalidate !== false;
      const now  = Date.now();
      const hit  = this._cache.get(key);
      const fresh = hit && (now - hit.t) < ttl;

      if (fresh && !opts.force) return hit.data;

      // Dedupe: si ya hay un fetch en vuelo para esta key, todos esperan al mismo.
      if (this._inflight.has(key) && !opts.force) {
        if (hit && swr) return hit.data;       // stale ya — devolver mientras llega lo nuevo
        return this._inflight.get(key);
      }

      const promise = (async () => {
        try {
          const data = await fetcher();
          this._cache.set(key, { data, t: Date.now() });
          this._emit(key, data, null);
          this._trim();
          return data;
        } catch (err) {
          this._emit(key, null, err);
          throw err;
        } finally {
          this._inflight.delete(key);
        }
      })();
      this._inflight.set(key, promise);

      // Stale-while-revalidate: tenemos data vieja, devolver YA y refrescar en bg.
      if (hit && swr && !opts.force) {
        promise.catch(() => {}); // evita unhandled rejection silenciosa
        return hit.data;
      }
      return promise;
    }

    /**
     * Ejecuta una mutación e invalida keys relacionadas.
     * @param {() => Promise<any>} fn
     * @param {object} [opts]
     * @param {string|RegExp|((k: string) => boolean)} [opts.invalidate]
     */
    async mutate(fn, opts = {}) {
      const result = await fn();
      if (opts.invalidate) this.invalidate(opts.invalidate);
      return result;
    }

    invalidate(matcher) {
      if (!matcher) return this.clear();
      if (typeof matcher === 'string') {
        this._cache.delete(matcher);
        return;
      }
      const predicate = matcher instanceof RegExp
        ? (k) => matcher.test(k)
        : (typeof matcher === 'function' ? matcher : null);
      if (!predicate) return;
      for (const k of Array.from(this._cache.keys())) {
        if (predicate(k)) this._cache.delete(k);
      }
    }

    /** Vacía toda la caché. Llamar en logout. */
    clear() {
      this._cache.clear();
      this._inflight.clear();
    }

    /**
     * Suscribirse a cambios de una key (re-render reactivo).
     * @returns {() => void} unsubscribe
     */
    subscribe(key, cb) {
      if (!this._listeners.has(key)) this._listeners.set(key, new Set());
      this._listeners.get(key).add(cb);
      return () => {
        const set = this._listeners.get(key);
        if (set) {
          set.delete(cb);
          if (set.size === 0) this._listeners.delete(key);
        }
      };
    }

    /** Lectura síncrona del cache (sin gatillar fetch). */
    peek(key) {
      const hit = this._cache.get(key);
      return hit ? hit.data : undefined;
    }

    /** Inserta o reemplaza una entrada (útil para mutaciones optimistas). */
    set(key, data) {
      this._cache.set(key, { data, t: Date.now() });
      this._emit(key, data, null);
    }

    /** Acceso lazy al cliente de Supabase (usa supabaseService si existe). */
    async getSupabase() {
      if (window.supabaseService && typeof window.supabaseService.getClient === 'function') {
        return await window.supabaseService.getClient();
      }
      if (window.supabase) return window.supabase;
      if (typeof window.waitForSupabase === 'function') return await window.waitForSupabase();
      return null;
    }

    /** Métricas — útiles para debug en consola. */
    stats() {
      return {
        cacheSize: this._cache.size,
        inflight: this._inflight.size,
        keys: Array.from(this._cache.keys())
      };
    }

    // ─────────────────────────────────────── internos

    _emit(key, data, error) {
      const set = this._listeners.get(key);
      if (!set) return;
      set.forEach((cb) => {
        try { cb(data, error); } catch (e) { console.warn('apiClient subscriber threw', e); }
      });
    }

    _gc() {
      const now = Date.now();
      for (const [k, v] of this._cache) {
        if ((now - v.t) > DEFAULT_GC) this._cache.delete(k);
      }
    }

    _trim() {
      if (this._cache.size <= MAX_ENTRIES) return;
      // LRU naive: borrar las más viejas hasta volver al límite.
      const sorted = Array.from(this._cache.entries()).sort((a, b) => a[1].t - b[1].t);
      const excess = this._cache.size - MAX_ENTRIES;
      for (let i = 0; i < excess; i++) this._cache.delete(sorted[i][0]);
    }
  }

  window.apiClient = new ApiClient();

  // Invalidación automática en logout (AuthService lo escucha).
  window.addEventListener('auth:signed_out', () => window.apiClient.clear());
})();
