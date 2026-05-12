/**
 * Web Vitals — recolecta LCP, CLS, FCP, TTFB y los expone vía
 * `window.__webVitals` (array de samples) + `window.getWebVitals()`.
 *
 * Por qué este module:
 *  - Validar empíricamente las optimizaciones que hicimos
 *    (prefetch idle, critical CSS, content-visibility, lazy-load).
 *  - Sin dependencias externas (sin web-vitals npm; 30 líneas vanilla).
 *  - Reporta a window.errorLogger si existe (mismo sink que crashes
 *    via RPC log_frontend_error) — solo en producción.
 *  - En dev (localhost) usa console.info para inspección rápida.
 *
 * Métricas:
 *  - LCP: largest contentful paint (cuando termina el "main" content).
 *  - CLS: cumulative layout shift acumulado (saltos durante navegación).
 *  - FCP: first contentful paint (primer pixel pintado).
 *  - TTFB: time to first byte (network + server).
 *
 * Reporta al `visibilitychange → hidden` (cuando el user cierra/cambia
 * tab) — único momento confiable porque LCP puede cambiar hasta el
 * último frame.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  const samples = [];
  window.__webVitals = samples;

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  function record(name, value, extra) {
    const sample = { name, value: Math.round(value * 100) / 100, t: Date.now(), ...(extra || {}) };
    samples.push(sample);
    if (isLocal) console.info(`[WebVital] ${name}=${sample.value}`, extra || '');
  }

  // ── LCP ──────────────────────────────────────────────────────────
  let lcpValue = 0;
  try {
    const lcpObs = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) lcpValue = entry.startTime;
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  // ── CLS ──────────────────────────────────────────────────────────
  let clsValue = 0;
  try {
    const clsObs = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        // Solo shifts no causados por interacción reciente (CWV spec).
        if (!entry.hadRecentInput) clsValue += entry.value;
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}

  // ── FCP + paint timings ──────────────────────────────────────────
  try {
    const paintObs = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          record('FCP', entry.startTime);
          paintObs.disconnect();
        }
      }
    });
    paintObs.observe({ type: 'paint', buffered: true });
  } catch (_) {}

  // ── TTFB ─────────────────────────────────────────────────────────
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) record('TTFB', nav.responseStart);
  } catch (_) {}

  // ── INP (Interaction to Next Paint) ──────────────────────────────
  // Aproximación pragmática: trackear duration de eventos de interacción
  // (click, keydown, pointerdown) sobre 40ms. El "INP" reportado al flush
  // es el máximo observado (peor caso). El spec real usa p98 pero
  // requiere mucho estado; este aproximado captura los outliers que
  // importan (>200ms = mala UX, >500ms = crítico).
  let maxInp = 0;
  let inpCount = 0;
  try {
    const inpObs = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (entry.duration > maxInp) maxInp = entry.duration;
        inpCount++;
      }
    });
    // durationThreshold 40 = ignorar interacciones rápidas (señal limpia).
    inpObs.observe({ type: 'event', buffered: true, durationThreshold: 40 });
  } catch (_) {}

  // ── Flush al cerrar/ocultar la pestaña ───────────────────────────
  function flush() {
    if (lcpValue > 0) record('LCP', lcpValue);
    record('CLS', clsValue);
    if (maxInp > 0) record('INP', maxInp, { interactions: inpCount });
    if (!isLocal && window.errorLogger && typeof window.errorLogger.capture === 'function') {
      try {
        window.errorLogger.capture(new Error('webvitals'), {
          source: 'webvital',
          samples: samples.slice(),
        });
      } catch (_) {}
    }
  }

  let flushed = false;
  function onceFlush() { if (flushed) return; flushed = true; flush(); }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onceFlush();
  });
  window.addEventListener('pagehide', onceFlush, { once: true });

  window.getWebVitals = () => samples.slice();
})();
