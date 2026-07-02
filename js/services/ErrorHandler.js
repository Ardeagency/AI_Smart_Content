/**
 * window.errorHandler — manejador global de errores de UI.
 *
 * Hasta 2026-07 BaseView.render() y router.js lo invocaban tras un guard
 * `if (window.errorHandler)` pero el objeto nunca se definió: los errores
 * de vista morían en console.error sin feedback al usuario. Este servicio
 * lo define de verdad.
 *
 * API:
 *   errorHandler.handle(error, { view })   — log + toast (lo usa BaseView.render)
 *   errorHandler.showError(error, mensaje) — toast de error con mensaje amigable (router)
 *   errorHandler.sectionError(container, { title, message, onRetry })
 *       — pinta un estado de error visible DENTRO de la sección afectada con
 *         botón "Reintentar". Para reemplazar catch-mudos en vistas: en vez de
 *         dejar la sección vacía tras un fetch fallido, se ve qué pasó y se
 *         puede reintentar sin recargar.
 *   errorHandler.sectionErrorHTML({ title, message, retry }) — solo el markup
 *       (para vistas que renderizan por template); el retry se cablea con
 *       data-retry + wireRetry(container, onRetry).
 *
 * Los toasts van por window.showToast (region aria-live assertive para error).
 * Mensajes idénticos en ráfaga se deduplican 4s para no apilar toasts.
 */
(function () {
  'use strict';

  var lastToast = { msg: '', at: 0 };

  function t(es) {
    try { return typeof window.__ === 'function' ? window.__(es) : es; } catch (e) { return es; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(message) {
    var now = Date.now();
    if (message === lastToast.msg && now - lastToast.at < 4000) return;
    lastToast = { msg: message, at: now };
    if (typeof window.showToast === 'function') {
      window.showToast(message, { type: 'error' });
    }
  }

  function log(error, ctx) {
    console.error('[errorHandler]', ctx && ctx.view ? ctx.view + ':' : '', error);
    try {
      if (window.errorLogger && typeof window.errorLogger.capture === 'function') {
        window.errorLogger.capture(error, Object.assign({ source: 'errorHandler' }, ctx || {}));
      }
    } catch (e) { /* el logger nunca debe tumbar el manejo */ }
  }

  function friendly(error, fallback) {
    // Mensajes técnicos no se le muestran crudos al usuario; el detalle va al log.
    var msg = fallback || t('Algo salió mal. Reintenta en un momento.');
    if (error && /failed to fetch|networkerror|load failed/i.test(String(error.message || error))) {
      msg = t('Sin conexión con el servidor. Revisa tu red y reintenta.');
    }
    return msg;
  }

  function sectionErrorHTML(opts) {
    var o = opts || {};
    return '' +
      '<div class="section-error" role="alert">' +
        '<div class="section-error-icon" aria-hidden="true"><i class="fas fa-rotate-right"></i></div>' +
        '<div class="section-error-title">' + esc(o.title || t('No se pudo cargar')) + '</div>' +
        '<p class="section-error-msg">' + esc(o.message || t('Algo salió mal al traer los datos.')) + '</p>' +
        (o.retry === false ? '' :
          '<button type="button" class="mn-btn-secondary section-error-retry" data-retry>' +
            esc(t('Reintentar')) +
          '</button>') +
      '</div>';
  }

  function wireRetry(container, onRetry) {
    if (!container || typeof onRetry !== 'function') return;
    var btn = container.querySelector('[data-retry]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      Promise.resolve(onRetry()).catch(function (err) {
        btn.disabled = false;
        log(err, { source: 'sectionError.retry' });
      });
    }, { once: true });
  }

  window.errorHandler = {
    handle: function (error, ctx) {
      log(error, ctx);
      toast(friendly(error));
    },

    showError: function (error, userMessage) {
      log(error, { source: 'router' });
      toast(friendly(error, userMessage));
    },

    sectionError: function (container, opts) {
      var o = opts || {};
      // Solo loguea si le pasan el error y nadie lo capturó ya (evita doble telemetría).
      if (o.error && !o.logged) log(o.error, { source: o.source || 'sectionError' });
      if (!container) return;
      container.innerHTML = sectionErrorHTML(o);
      wireRetry(container, o.onRetry);
    },

    sectionErrorHTML: sectionErrorHTML,
    wireRetry: wireRetry,
  };
})();
