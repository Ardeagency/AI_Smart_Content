/**
 * DevBaseView - Clase base para todas las vistas del portal de desarrollador (/dev)
 *
 * Proporciona:
 * - onEnter común (auth + navegación en modo developer, opcional requireLead)
 * - escapeHtml / truncateText
 * - showNotification y showError unificados
 */
class DevBaseView extends BaseView {
  constructor() {
    super();
  }

  /**
   * Hook al entrar: verifica auth, opcionalmente rol lead, y asegura nav en modo developer.
   * @param {Object} [options]
   * @param {boolean} [options.requireLead] - Si true, redirige a /dev/dashboard si no es lead
   */
  async onEnter(options = {}) {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
      if (options.requireLead && !window.authService.isLead()) {
        if (window.router) window.router.navigate('/dev/dashboard', true);
        return;
      }
    }
    if (window.appNavigation && (!window.appNavigation.initialized || window.appNavigation.currentMode !== 'developer')) {
      window.appNavigation.currentMode = 'developer';
      window.appNavigation.initialized = false;
      await window.appNavigation.render();
    }
  }

  /** Alias para compatibilidad (ej. DevLeadVectorsView usaba esc) */
  esc(text) {
    return this.escapeHtml(text);
  }

  /**
   * Etiqueta de estado de flujo (draft/testing/published/archived). Una sola fuente de verdad.
   * @param {string} status
   * @returns {string}
   */
  getFlowStatusLabel(status) {
    const labels = { draft: 'Borrador', testing: 'En Pruebas', published: 'Publicado', archived: 'Archivado' };
    return labels[(status || '').toLowerCase()] || status || '-';
  }

  /**
   * Truncar texto con sufijo ...
   * @param {string} text
   * @param {number} maxLength
   * @returns {string}
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /** Alias para compatibilidad (ej. DevLeadAllFlowsView usaba truncate) */
  truncate(text, max) {
    return this.truncateText(text, max);
  }

  /**
   * Mostrar notificación toast
   * @param {string} message
   * @param {string} [type] - 'info' | 'success' | 'error' | 'warning'
   */
  showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.className = 'dev-lead-notification dev-lead-notification-' + type;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  /**
   * Mostrar pantalla de error en el container
   * @param {string} message
   */
  showError(message) {
    const container = this.container;
    if (container) {
      container.innerHTML = `
        <div class="error-container">
          <i class="fas fa-exclamation-triangle"></i>
          <h2>Error</h2>
          <p>${this.escapeHtml(message)}</p>
          <button class="btn btn-primary" onclick="window.location.reload()">Recargar</button>
        </div>
      `;
    }
  }
}

window.DevBaseView = DevBaseView;
