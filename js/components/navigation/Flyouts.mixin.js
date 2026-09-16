/**
 * Navigation — Flyouts mixin.
 *
 * Flyout lateral que se abre sobre el sidebar al pasar el mouse por encima de
 * un container con submenu (ej. "Brand Storage") o al pulsar el botón de
 * notificaciones en el footer. Incluye los tooltips mostrados en modo
 * collapsed y el wiring global de cierre (click fuera, ESC, routechange).
 *
 * Mixin vanilla: aplica sobre Navigation.prototype al cargarse. Debe cargarse
 * DESPUÉS de Navigation.js. Usa el helper module-level `_escapeHtml` que
 * Navigation.js define al inicio del archivo. Los avisos los pinta Avisos.js (ADR-0054).
 */
(function () {
  'use strict';
  if (typeof Navigation === 'undefined') {
    console.warn('[Flyouts.mixin] Navigation no disponible; se aborta el mixin.');
    return;
  }

  const FlyoutsMixin = {
  openFlyout(containerEl) {
    if (typeof this.closeNotificationsDropdown === 'function') {
      this.closeNotificationsDropdown();
    }
    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;
    if (flyout.parentNode === document.body && this._navFlyoutRestoreParent) {
      try {
        this._navFlyoutRestoreParent.appendChild(flyout);
      } catch (_) {}
    }
    flyout.classList.remove('nav-flyout--header-anchor');
    flyout.style.top = '';
    flyout.style.right = '';
    flyout.style.left = '';
    flyout.style.transform = '';
    flyout.style.maxHeight = '';
    const submenu = containerEl.querySelector('.nav-submenu');
    const toggle = containerEl.querySelector('.nav-submenu-toggle');
    const links = submenu ? submenu.querySelectorAll('.nav-submenu-link') : [];
    const currentPath = window.location.pathname;
    // Ocultar cualquier tooltip de colapsado que haya quedado al abrir el flyout.
    document.getElementById('navTooltip')?.classList.remove('show');

    let bodyHtml = '<div class="nav-flyout-body"><div class="nav-flyout-list">';
    links.forEach((a) => {
      const route = a.dataset.route || '';
      const itemLabel = (a.querySelector('span') || a).textContent.trim();
      if (!route || a.classList.contains('nav-submenu-link--placeholder')) {
        bodyHtml += `<span class="nav-flyout-static">${_escapeHtml(itemLabel)}</span>`;
        return;
      }
      const active = currentPath === route || (route && currentPath.startsWith(route + '/'));
      bodyHtml += `<a href="${route}" class="nav-flyout-link${active ? ' active' : ''}" data-route="${route}" ${active ? ' aria-current="page"' : ''}>${itemLabel}</a>`;
    });
    bodyHtml += '</div></div>';

    flyout.innerHTML = `
      <div class="nav-flyout-bridge" aria-hidden="true"></div>
      <div class="nav-flyout-inner">
        ${bodyHtml}
      </div>`;
    flyout.classList.add('open');
    flyout.setAttribute('aria-hidden', 'false');
    this._flyoutContainer = containerEl;

    flyout.querySelectorAll('.nav-flyout-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.dataset.route;
        if (route && window.router) window.router.navigate(route);
        this.closeFlyout();
      });
    });
    // CTA removido: evitaba duplicar el nombre del módulo en el footer del flyout.

    this._bindFlyoutHoverClose();

    requestAnimationFrame(() => {
      /* Brand Storage en colapsado oculta el chevron (.nav-submenu-toggle), asi que su rect
         tiene height 0 y posiciona el flyout arriba. Fallback al page link visible. */
      const toggleVisible = toggle && toggle.offsetHeight > 0;
      const anchor = toggleVisible
        ? toggle
        : (containerEl.querySelector('.nav-brand-storage-page') || containerEl);
      const triggerRect = anchor?.getBoundingClientRect();
      if (triggerRect) {
        const flyoutHeight = flyout.offsetHeight;
        const top = Math.max(8, Math.min(triggerRect.top + triggerRect.height / 2 - flyoutHeight / 2, window.innerHeight - flyoutHeight - 8));
        flyout.style.top = `${top}px`;
      }
    });

    this._flyoutOpen = true;
  },

  _bindFlyoutHoverClose() {
    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;
    /* Notificaciones desde el header: panel tipo popover (clic + click fuera). El hover-close del sidebar cerraba al instante o confundía. */
    if (flyout.classList.contains('nav-flyout--header-anchor')) {
      if (flyout._flyoutEnter) {
        flyout.removeEventListener('mouseenter', flyout._flyoutEnter);
        flyout.removeEventListener('mouseleave', flyout._flyoutLeave);
        flyout._flyoutEnter = null;
        flyout._flyoutLeave = null;
      }
      return;
    }
    if (flyout._flyoutEnter) {
      flyout.removeEventListener('mouseenter', flyout._flyoutEnter);
      flyout.removeEventListener('mouseleave', flyout._flyoutLeave);
    }
    const onEnter = () => {
      clearTimeout(this._flyoutCloseTimer);
      this._flyoutCloseTimer = null;
    };
    const onLeave = () => {
      this._flyoutCloseTimer = setTimeout(() => this.closeFlyout(), 200);
    };
    flyout.addEventListener('mouseenter', onEnter);
    flyout.addEventListener('mouseleave', onLeave);
    flyout._flyoutEnter = onEnter;
    flyout._flyoutLeave = onLeave;
  },

  closeFlyout() {
    if (typeof this.closeNotificationsDropdown === 'function') {
      this.closeNotificationsDropdown();
    }
    const flyout = document.getElementById('navFlyout');
    if (flyout) {
      flyout.classList.remove('nav-flyout--header-anchor');
      flyout.style.top = '';
      flyout.style.right = '';
      flyout.style.left = '';
      flyout.style.transform = '';
      flyout.style.maxHeight = '';
      if (document.activeElement && flyout.contains(document.activeElement)) {
        try {
          const trigger = this._flyoutContainer?.querySelector('.nav-submenu-toggle');
          const notifTrigger = document.querySelector('.nav-footer-btn[data-flyout="notifications"]');
          if (trigger && typeof trigger.focus === 'function') {
            trigger.focus();
          } else if (notifTrigger && typeof notifTrigger.focus === 'function') {
            notifTrigger.focus();
          } else {
            const header = document.getElementById('appHeader');
            const firstFocusable = header?.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
            if (firstFocusable && typeof firstFocusable.focus === 'function') firstFocusable.focus();
          }
        } catch (_) {}
      }
      flyout.classList.remove('open');
      flyout.setAttribute('aria-hidden', 'true');
      if (flyout.parentNode === document.body && this._navFlyoutRestoreParent) {
        try {
          this._navFlyoutRestoreParent.appendChild(flyout);
        } catch (_) {}
      }
    }
    this._flyoutOpen = false;
  },

  /**
   * Abre el flyout de notificaciones (org_notifications via RPC). Muestra en panel header (dropdown) o #navFlyout (sidebar).
   * @param {HTMLElement} [triggerEl] - Botón que abrió el flyout (para posicionar).
   */
  async openNotificationsFlyout(triggerEl) {
    const header = document.getElementById('appHeader');
    const fromHeader = !!(triggerEl && header && header.contains(triggerEl));

    if (fromHeader) {
      if (typeof this.ensureNotificationsDropdown === 'function') {
        this.ensureNotificationsDropdown();
      }
      const panel = document.getElementById('notificationsDropdown');
      if (!panel) return;

      this.closeFlyout();

      const openPanel = () => {
        if (typeof this._showNotificationsDropdownPanel === 'function') {
          this._showNotificationsDropdownPanel(panel);
        } else {
          panel.classList.add('active');
          panel.setAttribute('aria-hidden', 'false');
        }
        requestAnimationFrame(() => {
          if (typeof this.positionUserDropdown === 'function') {
            this.positionUserDropdown(triggerEl, panel);
          }
        });
      };

      openPanel();
      // ADR-0054: el contenido lo pinta Avisos (lista por tipo, marcar, preferencias).
      if (window.Avisos) await window.Avisos.pintar(panel, { alCerrar: () => this.closeNotificationsDropdown?.() });
      requestAnimationFrame(() => {
        if (typeof this.positionUserDropdown === 'function') {
          this.positionUserDropdown(triggerEl, panel);
        }
      });
      return;
    }

    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;

    flyout.innerHTML = '<div class="nav-flyout-body nav-flyout-notifications-body"></div>';
    this._showNotificationsFlyout(flyout, triggerEl);
    const cuerpo = flyout.querySelector('.nav-flyout-notifications-body') || flyout;
    if (window.Avisos) await window.Avisos.pintar(cuerpo, { alCerrar: () => this.closeFlyout?.() });
  },

  _showNotificationsFlyout(flyout, triggerEl) {
    flyout.classList.remove('nav-flyout--header-anchor');
    flyout.style.top = '';
    flyout.style.right = '';
    flyout.style.left = '';
    flyout.style.transform = '';
    flyout.style.maxHeight = '';

    flyout.classList.add('open');
    flyout.setAttribute('aria-hidden', 'false');
    this._flyoutContainer = null;
    this._flyoutOpen = true;
    this._bindFlyoutHoverClose();

    requestAnimationFrame(() => {
      if (triggerEl) {
        flyout.style.maxHeight = '';
        const rect = triggerEl.getBoundingClientRect();
        const flyoutHeight = flyout.offsetHeight;
        const top = Math.max(8, Math.min(rect.top + rect.height / 2 - flyoutHeight / 2, window.innerHeight - flyoutHeight - 8));
        flyout.style.top = `${top}px`;
      } else {
        flyout.style.top = '';
        flyout.style.maxHeight = '';
      }
    });
  },

  /**
   * Tooltips en collapsed solo para páginas y footer. No mostrar en containers:
   * el flyout ya muestra el nombre del módulo y no debe aparecer tooltip que se atraviese.
   */
  setupCollapsedTooltips() {
    let tooltipEl = document.getElementById('navTooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'navTooltip';
      tooltipEl.className = 'nav-tooltip';
      document.body.appendChild(tooltipEl);
    }
    const sidebar = document.getElementById('sideNavigation');
    if (!sidebar) return;

    let hideTimeout;
    let showTimeout;
    const delay = 150;

    sidebar.querySelectorAll('[data-tooltip]:not([data-tip-bound])').forEach((el) => {
      el.setAttribute('data-tip-bound', '1');
      el.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
        clearTimeout(showTimeout);
        // Al cambiar de item, ocultar al instante el tooltip anterior (evita que
        // quede pegado encima del flyout del item con submenu).
        tooltipEl.classList.remove('show');
        // Items con flyout/submenu no muestran tooltip.
        if (el.classList.contains('nav-submenu-toggle')) return;
        if (el.classList.contains('nav-brand-storage-page')) return;
        if (el.classList.contains('nav-flows-page')) return;
        showTimeout = setTimeout(() => {
          if (!sidebar.classList.contains('collapsed')) return;
          const text = el.dataset.tooltip || '';
          tooltipEl.textContent = text;
          const rect = el.getBoundingClientRect();
          tooltipEl.style.top = `${rect.top + rect.height / 2}px`;
          tooltipEl.style.left = '67px';
          tooltipEl.style.transform = 'translateY(-50%)';
          tooltipEl.classList.add('show');
        }, delay);
      });
      el.addEventListener('mouseleave', () => {
        clearTimeout(showTimeout);
        hideTimeout = setTimeout(() => tooltipEl.classList.remove('show'), 50);
      });
    });
  },

  /**
   * Cerrar flyout: click outside, ESC, cambio de ruta.
   */
  setupFlyoutCloseListeners() {
    if (this._flyoutCloseAttached) return;
    this._flyoutCloseAttached = true;

    document.addEventListener('click', (e) => {
      const flyout = document.getElementById('navFlyout');
      if (!flyout?.classList.contains('open')) return;
      if (e.target.closest?.('.nav-footer-btn[data-flyout="notifications"]')) return;
      if (e.target.closest?.('#headerNotificationsBtn')) return;
      const sidebar = document.getElementById('sideNavigation');
      if (sidebar?.contains(e.target) || flyout.contains(e.target)) return;
      this.closeFlyout();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFlyout();
    });
    window.addEventListener('routechange', () => this.closeFlyout());
    window.addEventListener('popstate', () => this.closeFlyout());
  },
  };

  Object.assign(Navigation.prototype, FlyoutsMixin);
})();
