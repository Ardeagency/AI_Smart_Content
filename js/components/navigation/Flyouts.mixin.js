/**
 * Navigation — Flyouts mixin.
 *
 * Flyout lateral que se abre sobre el sidebar al pasar el mouse por encima de
 * un container con submenu (ej. "Brand Storage") o al pulsar el botón de
 * notificaciones en el footer. Incluye los tooltips mostrados en modo
 * collapsed y el wiring global de cierre (click fuera, ESC, routechange).
 *
 * Mixin vanilla: aplica sobre Navigation.prototype al cargarse. Debe cargarse
 * DESPUÉS de Navigation.js. Usa los helpers module-level `_escapeHtml` y
 * `_formatNotificationDate` que Navigation.js define al inicio del archivo.
 */
(function () {
  'use strict';
  if (typeof Navigation === 'undefined') {
    console.warn('[Flyouts.mixin] Navigation no disponible; se aborta el mixin.');
    return;
  }

  const FlyoutsMixin = {
  openFlyout(containerEl) {
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
    const label =
      containerEl.querySelector('.nav-brand-storage-page')?.dataset?.tooltip ||
      toggle?.dataset?.tooltip ||
      'Módulo';
    const iconEl =
      containerEl.querySelector('.nav-brand-storage-head .nav-icon-img') ||
      containerEl.querySelector('.nav-brand-storage-head .nav-icon') ||
      toggle?.querySelector('.nav-icon');
    const iconClass = iconEl ? (iconEl.className.baseVal || iconEl.className).replace(/\s*nav-icon\s*/, '').trim() : 'fas fa-folder';
    const links = submenu ? submenu.querySelectorAll('.nav-submenu-link') : [];
    const currentPath = window.location.pathname;

    const isImgIcon = iconEl && String(iconEl.tagName).toUpperCase() === 'IMG';
    const iconHeaderInner = isImgIcon
      ? `<img src="${_escapeHtml(iconEl.getAttribute('src') || '')}" class="nav-flyout-header-img" alt="" width="16" height="16">`
      : `<i class="${iconClass}"></i>`;

    const headerHtml = `
      <div class="nav-flyout-header">
        <span class="nav-flyout-header-icon">${iconHeaderInner}</span>
        <span class="nav-flyout-header-label">${_escapeHtml(String(label))}</span>
      </div>`;
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
        ${headerHtml}
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
      const triggerRect = toggle?.getBoundingClientRect();
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
   * Abre el flyout de notificaciones (user_notifications). Carga desde Supabase y muestra en #navFlyout.
   * @param {HTMLElement} [triggerEl] - Botón que abrió el flyout (para posicionar).
   */
  async openNotificationsFlyout(triggerEl) {
    const flyout = document.getElementById('navFlyout');
    if (!flyout) return;

    const user = window.authService?.getCurrentUser?.();
    let supabase = window.authService?.supabase;
    if (!supabase?.from && window.supabaseService?.getClient) {
      try {
        supabase = await window.supabaseService.getClient();
      } catch (_) {
        supabase = null;
      }
    }
    if (!user?.id || !supabase?.from) {
      this._renderNotificationsFlyoutContent(flyout, [], null, true);
      this._showNotificationsFlyout(flyout, triggerEl);
      return;
    }

    this._renderNotificationsFlyoutContent(flyout, null, 'Cargando…', false);
    this._showNotificationsFlyout(flyout, triggerEl);

    const { data: notifications, error } = await supabase
      .from('user_notifications')
      .select('id, title, message, type, is_read, created_at, link_to')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this._renderNotificationsFlyoutContent(flyout, [], null, true, error.message);
      requestAnimationFrame(() => this.repositionOpenHeaderNotificationsFlyout());
      return;
    }
    this._renderNotificationsFlyoutContent(flyout, notifications || [], null, true);
    requestAnimationFrame(() => this.repositionOpenHeaderNotificationsFlyout());
  },

  _renderNotificationsFlyoutContent(flyout, notifications, loadingLabel, ready, errorMessage) {
    const isLoading = notifications === null && !errorMessage;
    const list = Array.isArray(notifications) ? notifications : [];
    const configHref = this.getUserSidebarRoute('organization');

    let bodyHtml;
    if (errorMessage) {
      bodyHtml = `<div class="nav-flyout-notifications-error">${_escapeHtml(errorMessage)}</div>`;
    } else if (loadingLabel) {
      bodyHtml = `<div class="nav-flyout-notifications-loading">${_escapeHtml(loadingLabel)}</div>`;
    } else if (list.length === 0) {
      bodyHtml = '<div class="nav-flyout-notifications-empty">No hay notificaciones</div>';
    } else {
      bodyHtml = '<div class="nav-flyout-list nav-flyout-notifications-list">' + list.map((n) => {
        const type = (n.type || 'info');
        const dateStr = n.created_at ? _formatNotificationDate(n.created_at) : '';
        const unread = !n.is_read;
        const link = n.link_to ? ` data-link="${_escapeHtml(n.link_to)}"` : '';
        return `<button type="button" class="nav-flyout-notification-item ${unread ? 'unread' : ''} ${type}" data-id="${n.id}"${link}>
          <span class="nav-flyout-notification-type">${_escapeHtml(type)}</span>
          <span class="nav-flyout-notification-title">${_escapeHtml(n.title)}</span>
          <span class="nav-flyout-notification-message">${_escapeHtml((n.message || '').slice(0, 80))}${(n.message || '').length > 80 ? '…' : ''}</span>
          <span class="nav-flyout-notification-date">${_escapeHtml(dateStr)}</span>
        </button>`;
      }).join('') + '</div>';
    }

    const footerHtml = configHref
      ? `<div class="nav-flyout-footer">
          <a href="${configHref}" class="nav-flyout-cta nav-flyout-cta-link" data-route="${configHref}">Configuración <i class="fas fa-chevron-right"></i></a>
        </div>`
      : '';

    flyout.innerHTML = `
      <div class="nav-flyout-bridge" aria-hidden="true"></div>
      <div class="nav-flyout-inner">
        <div class="nav-flyout-header">
          <span class="nav-flyout-header-icon"><i class="fas fa-bell"></i></span>
          <span class="nav-flyout-header-label">Notifications</span>
        </div>
        <div class="nav-flyout-body nav-flyout-notifications-body">${bodyHtml}</div>
        ${footerHtml}
      </div>`;

    if (ready && list.length) {
      flyout.querySelectorAll('.nav-flyout-notification-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const link = btn.dataset.link;
          if (id) {
            const client = window.authService?.supabase;
            if (client?.from) {
              client.from('user_notifications').update({ is_read: true }).eq('id', id).then(() => {});
            } else if (window.supabaseService?.getClient) {
              window.supabaseService.getClient().then((c) => {
                if (c?.from) c.from('user_notifications').update({ is_read: true }).eq('id', id).then(() => {});
              });
            }
          }
          if (link && window.router) {
            this.closeFlyout();
            window.router.navigate(link.startsWith('/') ? link : `/${link}`);
          }
        });
      });
    }
    flyout.querySelector('.nav-flyout-cta-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      const route = flyout.querySelector('.nav-flyout-cta-link')?.dataset?.route;
      if (route && window.router) window.router.navigate(route);
      this.closeFlyout();
    });
  },

  /**
   * Mantiene el panel bajo #headerNotificationsBtn al redimensionar (scroll/resize).
   */
  repositionOpenHeaderNotificationsFlyout() {
    const flyout = document.getElementById('navFlyout');
    const btn = document.getElementById('headerNotificationsBtn');
    if (!flyout?.classList.contains('open') || !flyout.classList.contains('nav-flyout--header-anchor') || !btn) return;
    const rect = btn.getBoundingClientRect();
    const GAP = 8;
    const MARGIN = 12;
    const top = Math.max(MARGIN, rect.bottom + GAP);
    const right = Math.max(MARGIN, window.innerWidth - rect.right);
    flyout.style.top = `${top}px`;
    flyout.style.right = `${right}px`;
    const maxH = Math.max(160, window.innerHeight - top - MARGIN);
    flyout.style.maxHeight = `${maxH}px`;
  },

  _showNotificationsFlyout(flyout, triggerEl) {
    const header = document.getElementById('appHeader');
    const fromHeader = !!(triggerEl && header && header.contains(triggerEl));

    flyout.classList.remove('nav-flyout--header-anchor');
    flyout.style.top = '';
    flyout.style.right = '';
    flyout.style.left = '';
    flyout.style.transform = '';
    flyout.style.maxHeight = '';

    if (fromHeader) {
      if (!this._navFlyoutRestoreParent && flyout.parentNode) {
        this._navFlyoutRestoreParent = flyout.parentNode;
      }
      if (flyout.parentNode !== document.body) {
        document.body.appendChild(flyout);
      }
      flyout.classList.add('nav-flyout--header-anchor');
    }

    flyout.classList.add('open');
    flyout.setAttribute('aria-hidden', 'false');
    this._flyoutContainer = null;
    this._flyoutOpen = true;
    this._bindFlyoutHoverClose();

    requestAnimationFrame(() => {
      if (fromHeader && triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const GAP = 8;
        const MARGIN = 12;
        const top = Math.max(MARGIN, rect.bottom + GAP);
        const right = Math.max(MARGIN, window.innerWidth - rect.right);
        flyout.style.top = `${top}px`;
        flyout.style.right = `${right}px`;
        flyout.style.left = 'auto';
        flyout.style.transform = 'none';
        const maxH = Math.max(160, window.innerHeight - top - MARGIN);
        flyout.style.maxHeight = `${maxH}px`;
      } else if (triggerEl) {
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
        showTimeout = setTimeout(() => {
          if (!sidebar.classList.contains('collapsed')) return;
          if (el.classList.contains('nav-submenu-toggle')) return;
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
