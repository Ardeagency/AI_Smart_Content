/**
 * I18n - servicio de internacionalizacion (ES/EN + futuros idiomas).
 *
 * Modelo "espanol como clave": el texto espanol en el codigo ES la clave.
 *   - locale 'es'  -> t(key) devuelve la propia key (identidad, costo cero).
 *   - otro locale  -> busca en el catalogo; si falta, cae a la key (ES).
 *
 * Catalogos: window.__I18N_CATALOGS[locale] = { "texto ES": "translation" }.
 * Exposicion global: window.i18n y window.t para usar ${t('...')} en templates
 * (las vistas corren en el navegador con `window` global, sin imports).
 *
 * Resolucion inicial de idioma (precedencia):
 *   localStorage.userLocale > profiles.locale (al login) > navigator.language > 'es'
 *
 * Para sumar un idioma: agrega su codigo a SUPPORTED y crea js/i18n/<code>.js.
 */
(function () {
  'use strict';

  const SOURCE_LOCALE = 'es';
  const SUPPORTED = ['es', 'en']; // <- anadir aqui futuros idiomas (ej. 'pt')
  const STORAGE_KEY = 'userLocale';

  function detectInitialLocale() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (_) { /* localStorage bloqueado */ }
    try {
      const nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
      if (SUPPORTED.includes(nav)) return nav;
    } catch (_) { /* sin navigator */ }
    return SOURCE_LOCALE;
  }

  class I18n {
    constructor() {
      // Compartir el mismo objeto aunque los catalogos carguen antes o despues.
      this.catalogs = window.__I18N_CATALOGS || (window.__I18N_CATALOGS = {});
      this.locale = detectInitialLocale();
      this._applyHtmlLang();
    }

    available() { return SUPPORTED.slice(); }
    getLocale() { return this.locale; }
    isSource() { return this.locale === SOURCE_LOCALE; }

    /**
     * Traduce `key` (texto en espanol). `params` interpola {nombre} -> params.nombre.
     * @param {string} key
     * @param {Object} [params]
     * @returns {string}
     */
    t(key, params) {
      if (key == null) return '';
      let out = String(key);
      if (this.locale !== SOURCE_LOCALE) {
        const cat = this.catalogs[this.locale];
        const has = cat && Object.prototype.hasOwnProperty.call(cat, out);
        const hit = has ? cat[out] : null;
        if (hit != null && hit !== '') {
          out = hit;
        } else if (window.__I18N_DEBUG) {
          console.warn('[i18n] missing', this.locale, JSON.stringify(out));
        }
      }
      if (params) {
        out = out.replace(/\{(\w+)\}/g, (m, k) =>
          Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m);
      }
      return out;
    }

    _applyHtmlLang() {
      try { document.documentElement.setAttribute('lang', this.locale); } catch (_) {}
    }

    /**
     * Cambia el idioma activo: persiste, repinta la vista actual y la navegacion.
     * @param {string} locale
     * @param {{persist?: boolean}} [opts] persist!==false guarda en el perfil Supabase
     */
    async setLocale(locale, opts = {}) {
      if (!SUPPORTED.includes(locale)) return;
      if (locale === this.locale) { this._persistLocal(locale); return; }

      this.locale = locale;
      this._persistLocal(locale);
      this._applyHtmlLang();

      // Persistir en el perfil (cross-device); no bloquea el repintado.
      if (opts.persist !== false &&
          window.authService && typeof window.authService.setUserLocale === 'function') {
        Promise.resolve(window.authService.setUserLocale(locale)).catch(() => {});
      }

      this._rerender();

      try {
        window.dispatchEvent(new CustomEvent('localechange', { detail: { locale } }));
      } catch (_) {}
    }

    _persistLocal(locale) {
      try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
    }

    _rerender() {
      try {
        if (window.router && typeof window.router.reloadCurrentRoute === 'function') {
          window.router.reloadCurrentRoute();
        } else if (window.appNavigation && typeof window.appNavigation.render === 'function') {
          window.appNavigation.render();
        }
      } catch (e) {
        console.warn('[i18n] rerender failed', e);
      }
    }

    /**
     * Aplica el locale guardado en el perfil del usuario (lo llama AuthService al
     * cargar la sesion). La eleccion LOCAL (localStorage) manda: si existe, se
     * respeta el toggle manual del dispositivo y se ignora el perfil.
     * @param {string} locale
     */
    applyUserLocale(locale) {
      if (!locale || !SUPPORTED.includes(locale)) return;
      let hasLocal = false;
      try { hasLocal = !!localStorage.getItem(STORAGE_KEY); } catch (_) {}
      if (hasLocal || locale === this.locale) return;
      this.locale = locale;
      this._applyHtmlLang();
      this._rerender();
    }
  }

  window.i18n = new I18n();
  window.t = function (key, params) { return window.i18n.t(key, params); };
})();
