/**
 * lazy-nav — carga diferida del cascarón (js/shell/, L3 24/09).
 *
 * Por qué: las rutas de acceso (/login, /recuperar…) NUNCA pintan shell. Cargarlo
 * solo cuando la persona llega a una ruta con sesión ahorra ese peso en la primera
 * pintura del login.
 *
 * Uso:
 *   await window.__ensureNavigationLoaded();
 *   // ahora window.appNavigation (el Shell) está disponible
 *
 * Idempotente: llamadas concurrentes retornan la misma Promise.
 */
(function () {
  const SCRIPTS = [
    // Datos del shell: el cascarón no toca supabase.from().
    '/js/services/ShellDataService.js',
    // Avisos (ADR-0054): markdown, datos y campana; el shell solo los monta.
    '/js/utils/markdown.js',
    '/js/services/AvisosDataService.js',
    '/js/components/Avisos.js',
    '/js/shell/Shell.js',
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
          // Continuar: si falla uno, al menos el resto carga.
        }
      }
    })();
    return loadPromise;
  };
})();
