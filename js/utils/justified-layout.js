/**
 * justified-layout — Galería estilo Flickr / Google Photos / Higgsfield.
 *
 * Distribuye items en filas de altura uniforme: cada item mantiene su aspect
 * ratio natural, su ancho se ajusta proporcional al ratio para que cada fila
 * llene exactamente el ancho del container.
 *
 * Uso:
 *   window.applyJustifiedLayout(container, { targetHeight: 280 });
 *
 * El container debe tener `display: flex; flex-wrap: wrap` y los items deben
 * ser hijos directos (o descendientes seleccionables por `itemSelector`) con
 * un <img> o <video> adentro.
 *
 * Re-layout automáticamente:
 *   - en cada call (para items nuevos)
 *   - al cargar cada imagen/video (porque hasta entonces se usa ratio default = 1)
 *   - en resize de ventana (debounce 150ms, bound una sola vez por container)
 */
(function () {
  const DEFAULTS = {
    targetHeight: 280,
    gap: 8,
    maxRatio: 3,      // recorta panorámicas ultra-anchas
    minRatio: 0.4,    // recorta verticales ultra-altas
    itemSelector: '.living-masonry-item',
    /** Si la última fila está menos llena que este %, no se estira (queda alineada izquierda). */
    lastRowFillThreshold: 0.5,
  };

  function applyJustifiedLayout(container, options) {
    if (!container) return;
    const opts = Object.assign({}, DEFAULTS, options || {});

    const layout = () => {
      const items = Array.from(container.querySelectorAll(opts.itemSelector));
      if (!items.length) return;

      const containerW = container.getBoundingClientRect().width;
      if (containerW <= 0) return;

      // Recolecta ratios; default = 1 (cuadrado) si la imagen aún no cargó.
      const entries = items.map((item) => {
        const media = item.querySelector('img, video');
        let ratio = 1;
        if (media) {
          const w = media.tagName === 'IMG' ? media.naturalWidth  : media.videoWidth;
          const h = media.tagName === 'IMG' ? media.naturalHeight : media.videoHeight;
          if (w && h) ratio = w / h;
        }
        ratio = Math.max(opts.minRatio, Math.min(opts.maxRatio, ratio));
        return { item, ratio };
      });

      let row = [];
      let rowRatioSum = 0;

      const flushRow = (isLast) => {
        if (!row.length) return;
        const totalGap = (row.length - 1) * opts.gap;
        const targetRowW = containerW - totalGap;
        const naturalRowW = rowRatioSum * opts.targetHeight;
        let height;
        if (isLast) {
          const fillRatio = (naturalRowW + totalGap) / containerW;
          height = fillRatio > opts.lastRowFillThreshold
            ? targetRowW / rowRatioSum
            : opts.targetHeight;
        } else {
          height = targetRowW / rowRatioSum;
        }
        for (const r of row) {
          const w = r.ratio * height;
          r.item.style.width = `${w}px`;
          r.item.style.height = `${height}px`;
        }
        row = [];
        rowRatioSum = 0;
      };

      for (const e of entries) {
        const projectedItemW = e.ratio * opts.targetHeight;
        const projectedRowW = rowRatioSum * opts.targetHeight + row.length * opts.gap + projectedItemW;
        if (row.length > 0 && projectedRowW > containerW) {
          flushRow(false);
        }
        row.push(e);
        rowRatioSum += e.ratio;
      }
      flushRow(true);
    };

    // Run now (algunas imágenes pueden estar ya cargadas si vienen de cache).
    layout();

    // Re-layout cuando cada imagen/video entregue su dimensión real.
    container.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth > 0) return;
      img.addEventListener('load', layout, { once: true });
    });
    container.querySelectorAll('video').forEach((v) => {
      if (v.videoWidth > 0) return;
      v.addEventListener('loadedmetadata', layout, { once: true });
    });

    // Re-layout debounceado en resize (cambia el ancho del container).
    // Bind una vez por container para no acumular listeners en re-renders.
    if (!container.__justifiedResizeBound) {
      container.__justifiedResizeBound = true;
      let t = null;
      const onResize = () => {
        if (t) clearTimeout(t);
        t = setTimeout(layout, 150);
      };
      window.addEventListener('resize', onResize, { passive: true });
      // Guardamos referencia por si se necesita cleanup posterior.
      container.__justifiedResizeHandler = onResize;
    }
  }

  window.applyJustifiedLayout = applyJustifiedLayout;
})();
