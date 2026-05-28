/**
 * lazy-nav — carga diferida del bundle de Navigation.
 *
 * Por qué: Navigation.js es 114 KB raw / 29 KB gz, y rutas públicas
 * (/, /login, /signin, legales) NUNCA renderizan sidebar. Cargarlo
 * sólo cuando el usuario llega a una ruta autenticada ahorra ~35 KB
 * gz (Navigation + 3 mixins + MatchBars + AudienceMap) en first paint
 * de la página de login.
 *
 * Uso:
 *   await window.__ensureNavigationLoaded();
 *   // ahora window.appNavigation está disponible
 *
 * Idempotente: llamadas concurrentes retornan la misma Promise.
 */
(function () {
  const SCRIPTS = [
    '/js/components/Navigation.js',
    // Mixins: deben cargar DESPUÉS de Navigation.js. Object.assign sobre
    // Navigation.prototype: las instancias ya creadas heredan los métodos.
    '/js/components/navigation/Flyouts.mixin.js',
    '/js/components/navigation/Credits.mixin.js',
    '/js/components/navigation/Settings.mixin.js',
    // Componentes que las vistas usan dentro del shell auth.
    '/js/components/MatchBars.js',
    '/js/components/AudienceMap.js',
    // Mejoras del sidebar dev (Cmd+K palette + status bar). Carga global tras
    // auth: el palette se autogatea a /dev/* y el statusbar al modo developer.
    '/js/components/DevSidebarEnhancements.js',
  ];

  // Build ID: el comando `[build]` de netlify.toml reemplaza __BUILD_ID__ por
  // $COMMIT_REF (SHA del commit). En dev local cae a timestamp por sesión.
  const BUILD_ID = (() => {
    const v = '__BUILD_ID__';
    return v.startsWith('__') ? String(Date.now()) : v;
  })();

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const url = `${src}?v=${BUILD_ID}`;
      const el = document.createElement('script');
      el.src = url;
      el.async = false; // mantener orden de ejecución
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });
  }

  window.__ensureNavigationLoaded = function () {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      for (const src of SCRIPTS) {
        try {
          await loadScript(src);
        } catch (err) {
          console.error('[lazy-nav]', err);
          // Continuar: si falla un mixin, al menos el resto carga.
        }
      }
    })();
    return loadPromise;
  };
})();
