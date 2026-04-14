/**
 * PublicLayout - Helpers para páginas públicas (header + footer unificados).
 * Reutiliza las clases .landing-header / .landing-footer ya definidas en bundle.css.
 *
 * Uso:
 *   PublicLayout.wrap({ active: '/plataforma', hideFooter: false, content: '<section>…</section>' })
 */
(function () {
  const NAV_LINKS = [
    { href: '/plataforma', label: 'Plataforma' },
    { href: '/soluciones', label: 'Soluciones' },
    { href: '/casos', label: 'Casos' },
    { href: '/seguridad', label: 'Seguridad' },
    { href: '/nosotros', label: 'Nosotros' }
  ];

  const FOOTER_COLS = [
    {
      title: 'Plataforma',
      links: [
        { href: '/plataforma', label: 'Capacidades' },
        { href: '/soluciones', label: 'Soluciones' },
        { href: '/casos', label: 'Casos' },
        { href: '/seguridad', label: 'Seguridad' },
        { href: '/como-funciona', label: 'Cómo funciona' }
      ]
    },
    {
      title: 'Empresa',
      links: [
        { href: '/nosotros', label: 'Nosotros' },
        { href: '/contacto', label: 'Contacto' },
        { href: '/changelog', label: 'Changelog' },
        { href: '/status', label: 'Status' }
      ]
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacidad', label: 'Privacidad' },
        { href: '/terminos', label: 'Términos' }
      ]
    }
  ];

  function isActive(active, href) {
    if (!active) return false;
    return active === href || active.startsWith(href + '/');
  }

  function getHeaderHTML(active = '') {
    const links = NAV_LINKS.map(item => {
      const activeClass = isActive(active, item.href) ? ' is-active' : '';
      return `<a href="${item.href}" class="landing-header-link public-nav-link${activeClass}">${item.label}</a>`;
    }).join('');

    return `
    <header class="landing-header public-header" data-public-header>
      <a href="/" class="landing-header-brand" aria-label="AI Smart Content Home">
        <img src="/recursos/logos/logo-03.svg" alt="AI Smart Content" class="landing-header-logo">
      </a>
      <button class="public-header-toggle" id="publicHeaderToggle" aria-label="Abrir menú" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="landing-header-nav public-header-nav" aria-label="Navegación principal">
        ${links}
        <a href="/login" class="public-nav-access">Acceder</a>
        <a href="/contacto" class="landing-header-login-btn public-nav-cta">Solicitar acceso</a>
      </nav>
    </header>
    `;
  }

  function getFooterHTML() {
    const cols = FOOTER_COLS.map(col => `
      <div class="landing-footer-col public-footer-col">
        <h3 class="landing-footer-col-title">${col.title}</h3>
        <ul class="landing-footer-links">
          ${col.links.map(l => `<li><a href="${l.href}" class="landing-footer-link">${l.label}</a></li>`).join('')}
        </ul>
      </div>
    `).join('');

    return `
    <footer class="landing-footer public-footer" role="contentinfo">
      <div class="landing-footer-main public-footer-main">
        <div class="landing-footer-brand">
          <a href="/" class="landing-footer-brand-link" aria-label="AI Smart Content Home">
            <img src="/recursos/assets/assets-16.svg" alt="AI Smart Content" class="landing-footer-bar-logo" loading="lazy">
          </a>
          <p class="landing-footer-tagline">[COPY: tagline corto — autoridad + precisión para marcas enterprise]</p>
        </div>
        ${cols}
      </div>
      <div class="landing-footer-bottom">
        <div class="landing-footer-bottom-inner">
          <span class="landing-footer-copy">© 2025 AI S-MART CONTENT by Arde Agency S.A.S. Todos los derechos reservados.</span>
          <p class="landing-footer-credit">
            <a href="/privacidad" class="landing-footer-credit-link">Privacidad</a>
            &nbsp;·&nbsp;
            <a href="/terminos" class="landing-footer-credit-link">Términos</a>
          </p>
        </div>
      </div>
    </footer>
    `;
  }

  function wrap({ active = '', content = '', hideFooter = false, extraClass = '' } = {}) {
    const footer = hideFooter ? '' : getFooterHTML();
    return `
      ${getHeaderHTML(active)}
      <main class="public-page ${extraClass}" data-public-page>
        ${content}
      </main>
      ${footer}
    `;
  }

  /**
   * Lógica compartida para todas las páginas públicas:
   *  - Header flotante al hacer scroll.
   *  - Toggle mobile del menú.
   *  - Scroll-reveal para elementos .sr-reveal.
   */
  function initBehaviors(container) {
    const scope = container || document;

    // Marcar ruta pública (habilita estilos específicos en bundle.css: sin padding-top, etc.)
    document.body.classList.add('route-public');

    // Header floating-on-scroll
    const header = scope.querySelector('.public-header');
    if (header) {
      const appContainer = document.getElementById('app-container');
      const THRESHOLD = 32;
      const update = () => {
        const y = (appContainer && appContainer.scrollHeight > appContainer.clientHeight + 2)
          ? appContainer.scrollTop
          : (window.scrollY || document.documentElement.scrollTop || 0);
        header.classList.toggle('landing-header--floating', y > THRESHOLD);
      };
      update();
      const target = (appContainer && appContainer.scrollHeight > appContainer.clientHeight + 2) ? appContainer : window;
      target.addEventListener('scroll', update, { passive: true });
      PublicLayout._scrollCleanup = () => target.removeEventListener('scroll', update);

      // Asegurar que el header se muestre aunque no venga del entrance de la landing
      document.body.classList.remove('entrance-active');
      document.body.classList.add('entrance-done');
    }

    // Mobile toggle
    const toggle = scope.querySelector('#publicHeaderToggle');
    const nav = scope.querySelector('.public-header-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.classList.toggle('is-open', open);
      });
      nav.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          nav.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.classList.remove('is-open');
        });
      });
    }

    // Scroll reveal
    const els = scope.querySelectorAll('.sr-reveal');
    if (els.length && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
      els.forEach(el => io.observe(el));
      PublicLayout._ioCleanup = () => io.disconnect();
    } else if (els.length) {
      els.forEach(el => el.classList.add('is-visible'));
    }
  }

  function cleanup() {
    if (typeof PublicLayout._scrollCleanup === 'function') {
      PublicLayout._scrollCleanup();
      PublicLayout._scrollCleanup = null;
    }
    if (typeof PublicLayout._ioCleanup === 'function') {
      PublicLayout._ioCleanup();
      PublicLayout._ioCleanup = null;
    }
    document.body.classList.remove('route-public');
  }

  const PublicLayout = {
    getHeaderHTML,
    getFooterHTML,
    wrap,
    initBehaviors,
    cleanup,
    NAV_LINKS,
    FOOTER_COLS
  };

  window.PublicLayout = PublicLayout;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PublicLayout;
  }
})();
