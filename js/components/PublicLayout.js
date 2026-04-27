/**
 * PublicLayout - Shell persistente de páginas públicas (marketing).
 *
 * El header y el footer se montan UNA SOLA VEZ fuera de #app-container
 * (en #public-shell). Cuando el router navega entre rutas públicas, solo cambia
 * el contenido interno (#public-view-content) — el header no se re-renderiza
 * y por tanto no parpadea ni "brinca".
 *
 * Cuando el router va a una ruta no pública, se dispara `routechange`
 * y este módulo llama automáticamente `unmount()` para ocultar el shell
 * y devolver el control a #app-container.
 */
(function () {
  // Items dentro del dropdown de "Nosotros".
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

  const PUBLIC_ROUTES = new Set([
    '/',
    '/plataforma', '/soluciones', '/casos', '/seguridad',
    '/como-funciona', '/nosotros', '/status', '/contacto', '/changelog',
    '/privacidad', '/terminos',
    '/politica-de-privacidad', '/terminos-de-servicio', '/eliminacion-de-datos'
  ]);

  // Estado interno
  let shellMounted = false;
  let scrollCleanup = null;
  let ioCleanup = null;
  let mobileCleanup = null;
  let dropdownCleanup = null;
  let routeListenerBound = false;

  function buildHeaderHTML() {
    const dropdownItems = NAV_LINKS.map(item =>
      `<a href="${item.href}" class="public-dropdown-item public-nav-link" data-href="${item.href}" role="menuitem">${item.label}</a>`
    ).join('');

    return `
      <header class="landing-header public-header" data-public-header>
        <a href="/" class="landing-header-brand" aria-label="AI Smart Content Home" data-href="/">
          <img src="/recursos/logos/logo-03.svg" alt="AI Smart Content" class="landing-header-logo" width="180" height="36" decoding="async">
        </a>
        <button class="public-header-toggle" id="publicHeaderToggle" aria-label="Abrir menú" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
        <nav class="landing-header-nav public-header-nav" aria-label="Navegación principal">
          <div class="public-nav-dropdown" id="publicNavDropdown">
            <button type="button" class="landing-header-link public-nav-dropdown-trigger" aria-expanded="false" aria-haspopup="true">
              Saber más
              <svg class="public-nav-dropdown-caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="public-nav-dropdown-menu" role="menu">
              ${dropdownItems}
            </div>
          </div>
          <a href="/contacto" class="public-nav-cta public-nav-request" data-href="/contacto">Solicitar Acceso</a>
          <a href="/login" class="public-nav-access public-nav-access--glow" data-href="/login">Acceder</a>
        </nav>
      </header>
    `;
  }

  function buildFooterHTML() {
    const cols = FOOTER_COLS.map(col => `
      <div class="landing-footer-col public-footer-col">
        <h3 class="landing-footer-col-title">${col.title}</h3>
        <ul class="landing-footer-links">
          ${col.links.map(l => `<li><a href="${l.href}" class="landing-footer-link" data-href="${l.href}">${l.label}</a></li>`).join('')}
        </ul>
      </div>
    `).join('');

    return `
      <footer class="landing-footer public-footer" role="contentinfo">
        <div class="landing-footer-main public-footer-main">
          <div class="landing-footer-brand">
            <a href="/" class="landing-footer-brand-link" aria-label="AI Smart Content Home" data-href="/">
              <img src="/recursos/assets/assets-16.svg" alt="AI Smart Content" class="landing-footer-bar-logo" loading="lazy" decoding="async" width="200" height="48">
            </a>
            <p class="landing-footer-tagline">Inteligencia operativa de marca: menos latencia entre el mercado y tu contenido.</p>
          </div>
          ${cols}
        </div>
        <div class="landing-footer-bottom">
          <div class="landing-footer-bottom-inner">
            <span class="landing-footer-copy">© 2026 AI S-MART CONTENT by Arde Agency S.A.S. Todos los derechos reservados.</span>
            <p class="landing-footer-credit">
              <a href="/privacidad" class="landing-footer-credit-link" data-href="/privacidad">Privacidad</a>
              &nbsp;·&nbsp;
              <a href="/terminos" class="landing-footer-credit-link" data-href="/terminos">Términos</a>
            </p>
          </div>
        </div>
      </footer>
    `;
  }

  function bindRouterLinks(root) {
    if (!root) return;
    const links = root.querySelectorAll('a[data-href]');
    links.forEach(link => {
      if (link._publicBound) return;
      link._publicBound = true;
      const href = link.getAttribute('data-href');
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.router) window.router.navigate(href);
      });
    });
  }

  function attachHeaderScrollBehavior() {
    if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
    const header = document.querySelector('#public-header-root .public-header');
    if (!header) return;

    const shell = document.getElementById('public-shell');
    const THRESHOLD = 32;
    const useShell = !!(shell && shell.scrollHeight > shell.clientHeight + 2);
    const target = useShell ? shell : window;
    const readScrollY = useShell
      ? () => shell.scrollTop
      : () => window.scrollY || document.documentElement.scrollTop || 0;

    let isFloating = readScrollY() > THRESHOLD;
    let ticking = false;
    header.classList.toggle('landing-header--floating', isFloating);

    const apply = () => {
      ticking = false;
      const next = readScrollY() > THRESHOLD;
      if (next === isFloating) return;
      isFloating = next;
      header.classList.toggle('landing-header--floating', next);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };

    target.addEventListener('scroll', onScroll, { passive: true });
    scrollCleanup = () => target.removeEventListener('scroll', onScroll);
  }

  function attachMobileToggleBehavior() {
    if (mobileCleanup) { mobileCleanup(); mobileCleanup = null; }
    const toggle = document.getElementById('publicHeaderToggle');
    const nav = document.querySelector('#public-header-root .public-header-nav');
    if (!toggle || !nav) return;

    const onToggle = () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.classList.toggle('is-open', open);
    };
    const onNavClick = (e) => {
      if (!e.target.closest('a')) return;
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.classList.remove('is-open');
    };

    toggle.addEventListener('click', onToggle);
    nav.addEventListener('click', onNavClick);
    mobileCleanup = () => {
      toggle.removeEventListener('click', onToggle);
      nav.removeEventListener('click', onNavClick);
    };
  }

  function attachDropdownBehavior() {
    if (dropdownCleanup) { dropdownCleanup(); dropdownCleanup = null; }
    const dropdown = document.getElementById('publicNavDropdown');
    if (!dropdown) return;
    const trigger = dropdown.querySelector('.public-nav-dropdown-trigger');
    const menu = dropdown.querySelector('.public-nav-dropdown-menu');
    if (!trigger || !menu) return;

    const close = () => {
      dropdown.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      dropdown.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    };
    const toggle = (e) => {
      e.stopPropagation();
      dropdown.classList.contains('is-open') ? close() : open();
    };
    const onDocClick = (e) => {
      if (!dropdown.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const onMenuClick = (e) => {
      if (e.target.closest('a')) close();
    };

    trigger.addEventListener('click', toggle);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    menu.addEventListener('click', onMenuClick);

    dropdownCleanup = () => {
      trigger.removeEventListener('click', toggle);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      menu.removeEventListener('click', onMenuClick);
    };
  }

  function mountShellOnce() {
    if (shellMounted) return;
    const headerRoot = document.getElementById('public-header-root');
    const footerRoot = document.getElementById('public-footer-root');
    if (!headerRoot || !footerRoot) return;

    headerRoot.innerHTML = buildHeaderHTML();
    footerRoot.innerHTML = buildFooterHTML();

    bindRouterLinks(headerRoot);
    bindRouterLinks(footerRoot);

    attachHeaderScrollBehavior();
    attachMobileToggleBehavior();
    attachDropdownBehavior();

    shellMounted = true;
  }

  function setActiveLink(activePath) {
    document.querySelectorAll('#public-header-root .public-nav-link').forEach(link => {
      const href = link.getAttribute('data-href');
      link.classList.toggle('is-active', href === activePath);
    });
  }

  function attachScrollReveal(scopeEl) {
    if (ioCleanup) { ioCleanup(); ioCleanup = null; }
    const els = (scopeEl || document).querySelectorAll('.sr-reveal');
    if (!els.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });

    els.forEach(el => io.observe(el));
    ioCleanup = () => io.disconnect();
  }

  /**
   * Renderiza el contenido de una página pública dentro del shell persistente.
   * Llamado por PublicBaseView.render().
   */
  function renderView({ activePath, content, pageClass, scrollToTop = true, hideFooter = false, hideHeader = false }) {
    document.body.classList.add('route-public');
    // Solo tocar entrance si el overlay ya terminó (evita flash gris durante la carga inicial).
    // app-loader.js maneja finishEntrance() y es el único que debe remover entrance-active.
    var entranceOverlay = document.getElementById('entranceOverlay');
    var entranceDone = !entranceOverlay || entranceOverlay.classList.contains('entrance-overlay--hidden');
    if (entranceDone) {
      document.body.classList.remove('entrance-active');
      document.body.classList.add('entrance-done');
    }

    const shell = document.getElementById('public-shell');
    if (shell) shell.setAttribute('aria-hidden', 'false');

    mountShellOnce();
    setActiveLink(activePath);

    const headerRoot = document.getElementById('public-header-root');
    const footerRoot = document.getElementById('public-footer-root');
    if (headerRoot) headerRoot.style.display = hideHeader ? 'none' : '';
    if (footerRoot) footerRoot.style.display = hideFooter ? 'none' : '';

    const contentRoot = document.getElementById('public-view-content');
    if (!contentRoot) return null;

    contentRoot.className = 'public-page ' + (pageClass || '');
    contentRoot.innerHTML = content;
    bindRouterLinks(contentRoot);

    if (scrollToTop) {
      if (shell && shell.scrollHeight > shell.clientHeight + 2) {
        shell.scrollTop = 0;
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    }

    attachScrollReveal(contentRoot);

    const header = document.querySelector('#public-header-root .public-header');
    if (header) {
      const y = (shell && shell.scrollHeight > shell.clientHeight + 2)
        ? shell.scrollTop : (window.scrollY || 0);
      header.classList.toggle('landing-header--floating', y > 32);
    }

    return contentRoot;
  }

  function unmount() {
    if (!shellMounted) {
      document.body.classList.remove('route-public');
      return;
    }
    document.body.classList.remove('route-public');
    if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
    if (ioCleanup) { ioCleanup(); ioCleanup = null; }
    if (mobileCleanup) { mobileCleanup(); mobileCleanup = null; }
    if (dropdownCleanup) { dropdownCleanup(); dropdownCleanup = null; }

    const headerRoot = document.getElementById('public-header-root');
    const footerRoot = document.getElementById('public-footer-root');
    const contentRoot = document.getElementById('public-view-content');
    const shell = document.getElementById('public-shell');
    if (headerRoot) headerRoot.innerHTML = '';
    if (footerRoot) footerRoot.innerHTML = '';
    if (contentRoot) {
      contentRoot.innerHTML = '';
      contentRoot.className = '';
    }
    if (shell) shell.setAttribute('aria-hidden', 'true');

    shellMounted = false;
  }

  function bindRouteListener() {
    if (routeListenerBound) return;
    routeListenerBound = true;
    window.addEventListener('routechange', (e) => {
      const path = e && e.detail && e.detail.path;
      if (!PUBLIC_ROUTES.has(path)) {
        unmount();
      }
    });
  }

  bindRouteListener();

  window.PublicLayout = {
    PUBLIC_ROUTES,
    renderView,
    unmount,
    setActiveLink
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.PublicLayout;
  }
})();
