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
    if (window.navigation && (!window.navigation.initialized || window.navigation.currentMode !== 'developer')) {
      window.navigation.currentMode = 'developer';
      window.navigation.initialized = false;
      await window.navigation.render();
    }
  }

  /**
   * Escapar HTML para evitar XSS
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }

  /** Alias para compatibilidad (ej. DevLeadVectorsView usaba esc) */
  esc(text) {
    return this.escapeHtml(text);
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
