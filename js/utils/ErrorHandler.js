/**
 * ErrorHandler - Manejo centralizado de errores
 * Proporciona manejo consistente de errores en toda la aplicación
 */
class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 50;
  }

  /**
   * Manejar error
   * @param {Error|string} error - Error a manejar
   * @param {Object} context - Contexto adicional (opcional)
   */
  handle(error, context = {}) {
    const errorInfo = {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
      context,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };

    // Agregar al log
    this.errorLog.push(errorInfo);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Log en consola
    console.error('❌ Error:', errorInfo);

    // Notificar a listeners si existen
    if (window.appState) {
      window.appState.set('lastError', errorInfo);
    }

    return errorInfo;
  }

  /**
   * Mostrar error al usuario
   * @param {Error|string} error - Error a mostrar
   * @param {string} userMessage - Mensaje amigable para el usuario
   */
  showError(error, userMessage = null) {
    const errorInfo = this.handle(error);
    const message = userMessage || this.getUserFriendlyMessage(error);

    // Mostrar notificación
    this.showNotification(message, 'error');

    return errorInfo;
  }

  /**
   * Obtener mensaje amigable para el usuario
   * @param {Error|string} error - Error
   * @returns {string} Mensaje amigable
   */
  getUserFriendlyMessage(error) {
    const message = error instanceof Error ? error.message : error;

    // Mensajes comunes
    const friendlyMessages = {
      'NetworkError': 'Error de conexión. Por favor, verifica tu internet.',
      'Failed to fetch': 'Error de conexión. Por favor, verifica tu internet.',
      'timeout': 'La operación tardó demasiado. Por favor, intenta nuevamente.',
      'unauthorized': 'No tienes permisos para realizar esta acción.',
      'not found': 'El recurso solicitado no fue encontrado.',
      'supabase': 'Error de conexión con el servidor. Por favor, intenta más tarde.'
    };

    for (const [key, friendlyMessage] of Object.entries(friendlyMessages)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        return friendlyMessage;
      }
    }

    return 'Ocurrió un error. Por favor, intenta nuevamente.';
  }

  /**
   * Mostrar notificación
   * @param {string} message - Mensaje
   * @param {string} type - Tipo (error, success, warning, info)
   */
  showNotification(message, type = 'error') {
    // Crear notificación
    const notification = document.createElement('div');
    notification.className = `app-notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas fa-${this.getIconForType(type)}"></i>
        <span>${message}</span>
      </div>
      <button class="notification-close">
        <i class="fas fa-times"></i>
      </button>
    `;

    // Agregar al DOM
    document.body.appendChild(notification);

    // Mostrar con animación
    setTimeout(() => notification.classList.add('show'), 100);

    // Cerrar automáticamente después de 5 segundos
    const autoClose = setTimeout(() => {
      this.closeNotification(notification);
    }, 5000);

    // Cerrar manualmente
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        clearTimeout(autoClose);
        this.closeNotification(notification);
      });
    }
  }

  /**
   * Obtener icono según tipo
   */
  getIconForType(type) {
    const icons = {
      error: 'exclamation-circle',
      success: 'check-circle',
      warning: 'exclamation-triangle',
      info: 'info-circle'
    };
    return icons[type] || icons.error;
  }

  /**
   * Cerrar notificación
   */
  closeNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }

  /**
   * Obtener log de errores
   * @returns {Array}
   */
  getErrorLog() {
    return [...this.errorLog];
  }

  /**
   * Limpiar log de errores
   */
  clearErrorLog() {
    this.errorLog = [];
  }
}

// Crear instancia global
window.errorHandler = new ErrorHandler();

// Manejar errores no capturados
window.addEventListener('error', (event) => {
  window.errorHandler.handle(event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Manejar promesas rechazadas
window.addEventListener('unhandledrejection', (event) => {
  window.errorHandler.handle(event.reason, {
    type: 'unhandledRejection'
  });
});

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
}

