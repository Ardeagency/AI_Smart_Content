/**
 * window.showToast(message, options?) — toast accesible con aria-live.
 *
 * Reemplaza el `if (typeof window.showToast === 'function')` defensivo
 * que existía en living.js / TasksView / etc. donde la función nunca
 * estaba definida (toasts silenciados sin que nadie lo notara).
 *
 * Contenedor único `#toast-container` con `aria-live="polite"` para que
 * screen readers anuncien automáticamente cada toast nuevo. Para errores
 * (`type: 'error'`) usa `aria-live="assertive"` en una región aparte.
 *
 * API:
 *   window.showToast('Producción regenerada');
 *   window.showToast('Error al guardar', { type: 'error' });
 *   window.showToast('Subiendo…', { duration: 0 }); // persistente; close() manual
 *
 * Retorna: { close } — handle para cerrar antes de que expire.
 */
(function () {
  'use strict';

  const CONTAINER_ID = 'toast-container';
  const ASSERTIVE_ID = 'toast-container-assertive';

  function ensureContainer(id, politeness) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = 'toast-container';
    el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    return el;
  }

  function showToast(message, opts) {
    const o = opts || {};
    const type = o.type === 'error' || o.type === 'success' || o.type === 'warning'
      ? o.type
      : 'info';
    const duration = typeof o.duration === 'number' ? o.duration : 3500;
    const container = ensureContainer(
      type === 'error' ? ASSERTIVE_ID : CONTAINER_ID,
      type === 'error' ? 'assertive' : 'polite'
    );

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = String(message == null ? '' : message);

    container.appendChild(toast);
    // Force reflow para que la transition de entrada dispare.
    void toast.offsetHeight;
    toast.classList.add('toast--enter');

    let closeTimer = null;
    const close = () => {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      toast.classList.remove('toast--enter');
      toast.classList.add('toast--leave');
      // Esperar la animación de salida antes de remover.
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 240);
    };

    if (duration > 0) closeTimer = setTimeout(close, duration);
    // Click cierra antes (gesto del usuario).
    toast.addEventListener('click', close);

    return { close };
  }

  window.showToast = showToast;

  // ── Detección global online/offline ─────────────────────────────
  // Toast persistente cuando pierde red; toast corto al recuperarla.
  // Da feedback inmediato si una request falla por offline en vez de
  // que el user vea solo errores genéricos.
  let offlineToast = null;
  function onOffline() {
    if (offlineToast) return;
    offlineToast = showToast('Sin conexión a internet', {
      duration: 0,
      type: 'warning',
    });
  }
  function onOnline() {
    if (offlineToast) {
      offlineToast.close();
      offlineToast = null;
      // Solo mostrar "restablecida" si veníamos de offline (no en first load).
      showToast('Conexión restablecida', { duration: 2500, type: 'success' });
    }
  }
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  // Disparar de entrada si ya estamos offline al boot.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Esperar al primer microtick para que el container ya esté en DOM.
    setTimeout(onOffline, 0);
  }
})();
