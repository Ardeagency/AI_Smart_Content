/**
 * Performance - Utilidades de optimización de performance
 * Proporciona funciones para debounce, throttle, y otras optimizaciones
 */
class Performance {
  /**
   * Debounce - Ejecutar función después de que pase un tiempo sin llamadas
   * @param {Function} func - Función a ejecutar
   * @param {number} wait - Tiempo de espera en ms
   * @returns {Function} Función debounced
   */
  static debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle - Ejecutar función como máximo una vez por período
   * @param {Function} func - Función a ejecutar
   * @param {number} limit - Tiempo límite en ms
   * @returns {Function} Función throttled
   */
  static throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Lazy load imagen
   * @param {HTMLImageElement} img - Elemento imagen
   * @param {string} src - URL de la imagen
   */
  static lazyLoadImage(img, src) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            img.src = src;
            img.classList.add('loaded');
            observer.unobserve(img);
          }
        });
      });
      observer.observe(img);
    } else {
      // Fallback para navegadores sin IntersectionObserver
      img.src = src;
    }
  }

  /**
   * Preload recurso
   * @param {string} url - URL del recurso
   * @param {string} type - Tipo (script, style, image, etc.)
   */
  static preload(url, type = 'script') {
    return new Promise((resolve, reject) => {
      if (type === 'script') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject();
        document.head.appendChild(link);
      } else if (type === 'style') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'style';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject();
        document.head.appendChild(link);
      } else if (type === 'image') {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = url;
      }
    });
  }

  /**
   * Medir tiempo de ejecución
   * @param {Function} func - Función a medir
   * @param {string} label - Etiqueta para el log
   * @returns {*} Resultado de la función
   */
  static measureTime(func, label = 'Execution') {
    const start = performance.now();
    const result = func();
    const end = performance.now();
    console.log(`⏱️ ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  }

  /**
   * Medir tiempo de ejecución async
   * @param {Function} func - Función async a medir
   * @param {string} label - Etiqueta para el log
   * @returns {Promise<*>} Resultado de la función
   */
  static async measureTimeAsync(func, label = 'Execution') {
    const start = performance.now();
    const result = await func();
    const end = performance.now();
    console.log(`⏱️ ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  }

  /**
   * Request Animation Frame wrapper
   * @param {Function} callback - Callback a ejecutar
   * @returns {number} ID del frame
   */
  static raf(callback) {
    return requestAnimationFrame(callback);
  }

  /**
   * Cancel Animation Frame wrapper
   * @param {number} id - ID del frame
   */
  static cancelRaf(id) {
    cancelAnimationFrame(id);
  }
}

// Hacer disponible globalmente
window.Performance = Performance;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Performance;
}

