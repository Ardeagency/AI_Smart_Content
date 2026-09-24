/**
 * Pestañas de Configuración y Cuenta (L5, 24/09): las secciones estándar del SaaS
 * con URL propia por pestaña, pintadas en la segunda fila de la topbar
 * (BaseView.moveSubnavToHeader, el mismo slot que usan Tablero y Producción).
 *
 *   /org/:s/:slug/configuracion/:tab   general · miembros · integraciones · facturacion · uso · seguridad · avisos
 *   /org/:s/:slug/cuenta/:tab          perfil · preferencias · seguridad
 *
 * Archivo aparte de ConfiguracionView.js a propósito: Integraciones y Cuenta lo
 * cargan sin OrganizationView, y la clase de Configuración solo puede definirse
 * cuando OrganizationView ya existe.
 */
(function () {
  'use strict';

  const t = (s, p) => (typeof window.__ === 'function' ? window.__(s, p) : s);

  /* i18n-keep: __('General') __('Miembros') __('Integraciones') __('Facturación') __('Uso y créditos')
     __('Seguridad') __('Avisos') __('Perfil') __('Preferencias') */
  const PESTANAS = {
    configuracion: [
      { slug: 'general', etiqueta: 'General' },
      { slug: 'miembros', etiqueta: 'Miembros' },
      { slug: 'integraciones', etiqueta: 'Integraciones' },
      { slug: 'facturacion', etiqueta: 'Facturación' },
      { slug: 'uso', etiqueta: 'Uso y créditos' },
      { slug: 'seguridad', etiqueta: 'Seguridad' },
      { slug: 'avisos', etiqueta: 'Avisos' },
    ],
    cuenta: [
      { slug: 'perfil', etiqueta: 'Perfil' },
      { slug: 'preferencias', etiqueta: 'Preferencias' },
      { slug: 'seguridad', etiqueta: 'Seguridad' },
    ],
  };

  /** Ruta de una pestaña bajo la marca actual. */
  function ruta(seccion, slug) {
    const m = window.location.pathname.match(/^\/org\/[^/]+\/[^/]+/);
    return `${m ? m[0] : ''}/${seccion}/${slug}`;
  }

  /**
   * Monta las pestañas de `seccion` en la topbar (segunda fila). `vista` es la
   * BaseView que las pide: al salir las quita con clearSubnavFromHeader().
   */
  function montar(vista, seccion, actual) {
    const esc = (s) => vista.escapeHtml(s);
    const html = `
      <nav class="shell-subnav" aria-label="${esc(t(seccion === 'cuenta' ? 'Tu cuenta' : 'Configuración de la marca'))}">
        ${PESTANAS[seccion].map((p) => {
          const href = ruta(seccion, p.slug);
          const es = p.slug === actual;
          return `<a href="${esc(href)}" class="shell-subnav-pestana${es ? ' is-actual' : ''}" data-tab="${esc(p.slug)}"${es ? ' aria-current="page"' : ''}>${esc(t(p.etiqueta))}</a>`;
        }).join('')}
      </nav>`;
    const slot = vista.moveSubnavToHeader(html, () => {});
    if (slot) {
      // Enlaces reales (se pueden abrir en otra pestaña); la navegación normal va por el router.
      slot.onclick = (e) => {
        const a = e.target.closest('a.shell-subnav-pestana');
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        window.router?.navigate(a.getAttribute('href'));
      };
    }
    document.body.classList.add('en-ajustes');
  }

  function desmontar(vista) {
    vista.clearSubnavFromHeader();
    document.body.classList.remove('en-ajustes');
  }

  window.PestanasDeAjustes = Object.freeze({ PESTANAS, ruta, montar, desmontar });
})();
