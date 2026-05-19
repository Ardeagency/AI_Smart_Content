/**
 * BuilderGraph — Mixin for DevBuilderView (Fase 2C)
 *
 * Convierte el node-map (que era una lista horizontal lineal) en un grafo
 * interactivo con drag-to-connect entre handles. La estrategia:
 *   - El render de los nodos sigue siendo el mismo (módulos en flexbox horizontal por step_order).
 *   - Añadimos un overlay SVG <svg.module-graph-overlay> con bezier paths para cada
 *     conexión explícita (next_module_id que no sea el siguiente por orden).
 *   - Los handles --right del cada nodo soportan mousedown → drag → mouseup en otro nodo:
 *       set this.flowModules[srcIdx].next_module_id = otherMod.id
 *   - Las paths del overlay son clickeables → muestra botón "Eliminar conexión".
 *   - ResizeObserver re-pinta el overlay cuando el layout cambia.
 *
 * Conexión "lineal por orden" (next_module_id === null) NO se dibuja en el overlay:
 * la línea visual sigue siendo la `.module-edge` SVG dentro del flex container.
 */
(function () {
  'use strict';
  if (typeof DevBuilderView === 'undefined') return;
  const P = DevBuilderView.prototype;

  // ------------------------------------------------------------------
  // Hook: extender setupTechnicalModulesListeners para enganchar el grafo
  // ------------------------------------------------------------------
  const _origSetupTechModulesListeners = P.setupTechnicalModulesListeners;
  P.setupTechnicalModulesListeners = function () {
    if (typeof _origSetupTechModulesListeners === 'function') _origSetupTechModulesListeners.call(this);
    this.setupGraphInteractions();
  };

  P.setupGraphInteractions = function () {
    const mapEl = this.querySelector('#modulesNodeMap');
    if (!mapEl) return;
    this._graphMapEl = mapEl;

    // Asegurar SVG overlay
    let overlay = mapEl.querySelector('.module-graph-overlay');
    if (!overlay) {
      overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.setAttribute('class', 'module-graph-overlay');
      overlay.setAttribute('aria-hidden', 'true');
      mapEl.appendChild(overlay);
    }
    this._graphOverlay = overlay;

    // Drag handles en cada nodo (right output)
    mapEl.querySelectorAll('.module-node-handle--right').forEach((handle) => {
      const nodeEl = handle.closest('.module-node');
      if (!nodeEl) return;
      const idx = parseInt(nodeEl.dataset.moduleIndex, 10);
      if (isNaN(idx)) return;
      // Marcar handle como interactivo
      handle.classList.add('module-node-handle--interactive');
      handle.setAttribute('role', 'button');
      handle.setAttribute('title', 'Arrastra a otro módulo para crear un salto');
      handle.setAttribute('aria-label', 'Conectar a otro módulo');
      handle.removeAttribute('aria-hidden');
      handle.style.pointerEvents = 'auto';
      handle.onmousedown = (e) => this.startGraphDrag(e, idx, nodeEl, handle);
    });

    // ResizeObserver para re-pintar cuando el layout cambie (responsive, scroll, etc.)
    if (!this._graphResizeObserver && typeof ResizeObserver !== 'undefined') {
      this._graphResizeObserver = new ResizeObserver(() => this.renderGraphOverlay());
      this._graphResizeObserver.observe(mapEl);
    }
    // También en scroll horizontal (el contenedor puede tener overflow-x)
    if (!this._graphScrollListener) {
      this._graphScrollListener = () => this.renderGraphOverlay();
      mapEl.addEventListener('scroll', this._graphScrollListener);
      const wrap = this.querySelector('#technicalModulesList');
      if (wrap) wrap.addEventListener('scroll', this._graphScrollListener);
    }

    // Pintar el overlay con las conexiones existentes
    this.renderGraphOverlay();
  };

  // ------------------------------------------------------------------
  // Drag-to-connect
  // ------------------------------------------------------------------
  P.startGraphDrag = function (e, srcIdx, srcNodeEl, srcHandle) {
    e.preventDefault();
    e.stopPropagation();
    const mapEl = this._graphMapEl;
    const overlay = this._graphOverlay;
    if (!mapEl || !overlay) return;

    const mapRect = mapEl.getBoundingClientRect();
    const handleRect = srcHandle.getBoundingClientRect();
    const startX = (handleRect.left + handleRect.width / 2) - mapRect.left + mapEl.scrollLeft;
    const startY = (handleRect.top + handleRect.height / 2) - mapRect.top + mapEl.scrollTop;

    // Preview path
    const ns = 'http://www.w3.org/2000/svg';
    const preview = document.createElementNS(ns, 'path');
    preview.setAttribute('class', 'module-graph-path module-graph-path--preview');
    preview.setAttribute('fill', 'none');
    overlay.appendChild(preview);

    mapEl.classList.add('module-graph-dragging');

    const onMove = (ev) => {
      const x = ev.clientX - mapRect.left + mapEl.scrollLeft;
      const y = ev.clientY - mapRect.top + mapEl.scrollTop;
      preview.setAttribute('d', this.bezierPath(startX, startY, x, y));

      // Highlight target node bajo el cursor
      mapEl.querySelectorAll('.module-node').forEach(n => n.classList.remove('module-node--drop-target'));
      const target = this.findNodeAt(ev.clientX, ev.clientY, srcIdx);
      if (target) target.classList.add('module-node--drop-target');
    };

    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      mapEl.classList.remove('module-graph-dragging');
      mapEl.querySelectorAll('.module-node').forEach(n => n.classList.remove('module-node--drop-target'));
      preview.remove();

      const target = this.findNodeAt(ev.clientX, ev.clientY, srcIdx);
      if (target) {
        const dstIdx = parseInt(target.dataset.moduleIndex, 10);
        if (!isNaN(dstIdx) && dstIdx !== srcIdx) {
          this.connectModules(srcIdx, dstIdx);
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Busca un .module-node bajo coords cliente, excluyendo el sourceIdx. */
  P.findNodeAt = function (clientX, clientY, excludeIdx) {
    const nodes = this._graphMapEl.querySelectorAll('.module-node');
    for (const n of nodes) {
      const i = parseInt(n.dataset.moduleIndex, 10);
      if (i === excludeIdx) continue;
      const r = n.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return n;
      }
    }
    return null;
  };

  /** Setea next_module_id del módulo src al id del módulo dst (forzando un guardado si dst aún no tiene id real). */
  P.connectModules = function (srcIdx, dstIdx) {
    const src = this.flowModules[srcIdx];
    const dst = this.flowModules[dstIdx];
    if (!src || !dst) return;
    if (!dst.id) {
      this.showNotification('Guarda el flujo primero para crear conexiones explícitas (el módulo destino no tiene ID).', 'warning');
      return;
    }
    // Si el destino es el siguiente por orden, esto equivale a "auto" → next_module_id = null
    if (dstIdx === srcIdx + 1) {
      src.next_module_id = null;
    } else {
      src.next_module_id = dst.id;
    }
    this.onFieldChange();
    this.renderTechnicalModulesList();
    this.setupTechnicalModulesListeners();
  };

  // ------------------------------------------------------------------
  // SVG overlay: bezier paths para conexiones explícitas
  // ------------------------------------------------------------------
  P.bezierPath = function (x1, y1, x2, y2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
    const c1x = x1 + dx;
    const c2x = x2 - dx;
    return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  };

  P.renderGraphOverlay = function () {
    const mapEl = this._graphMapEl;
    const overlay = this._graphOverlay;
    if (!mapEl || !overlay) return;

    const rect = mapEl.getBoundingClientRect();
    const w = mapEl.scrollWidth;
    const h = mapEl.scrollHeight;
    overlay.setAttribute('width', String(w));
    overlay.setAttribute('height', String(h));
    overlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';

    // Limpiar paths previos (mantener defs si las hubo)
    Array.from(overlay.querySelectorAll('.module-graph-connection')).forEach(n => n.remove());

    // Asegurar marker arrow una sola vez
    if (!overlay.querySelector('defs')) {
      const ns = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(ns, 'defs');
      const marker = document.createElementNS(ns, 'marker');
      marker.setAttribute('id', 'module-graph-arrow');
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
      path.setAttribute('class', 'module-graph-arrow-head');
      marker.appendChild(path);
      defs.appendChild(marker);
      overlay.appendChild(defs);
    }

    const mods = this.flowModules || [];
    const idToIndex = new Map();
    mods.forEach((m, i) => { if (m.id) idToIndex.set(m.id, i); });

    mods.forEach((m, srcIdx) => {
      if (!m.next_module_id) return;
      if (!idToIndex.has(m.next_module_id)) return;
      const dstIdx = idToIndex.get(m.next_module_id);
      // No dibujar si es el siguiente por orden (ya hay edge nativa)
      if (dstIdx === srcIdx + 1) return;

      const srcNode = mapEl.querySelector(`.module-node[data-module-index="${srcIdx}"]`);
      const dstNode = mapEl.querySelector(`.module-node[data-module-index="${dstIdx}"]`);
      if (!srcNode || !dstNode) return;
      const srcHandle = srcNode.querySelector('.module-node-handle--right') || srcNode;
      const dstHandle = dstNode.querySelector('.module-node-handle--left') || dstNode;
      const sr = srcHandle.getBoundingClientRect();
      const dr = dstHandle.getBoundingClientRect();
      const x1 = (sr.left + sr.width / 2) - rect.left + mapEl.scrollLeft;
      const y1 = (sr.top + sr.height / 2) - rect.top + mapEl.scrollTop;
      const x2 = (dr.left + dr.width / 2) - rect.left + mapEl.scrollLeft;
      const y2 = (dr.top + dr.height / 2) - rect.top + mapEl.scrollTop;

      const ns = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'module-graph-connection');
      g.setAttribute('data-src-index', String(srcIdx));
      g.setAttribute('data-dst-index', String(dstIdx));

      // Path "hit" (más ancho, transparente, captura clicks)
      const hit = document.createElementNS(ns, 'path');
      hit.setAttribute('d', this.bezierPath(x1, y1, x2, y2));
      hit.setAttribute('class', 'module-graph-path-hit');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      g.appendChild(hit);

      // Path visible
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', this.bezierPath(x1, y1, x2, y2));
      path.setAttribute('class', 'module-graph-path');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#module-graph-arrow)');
      g.appendChild(path);

      // Botón eliminar (foreignObject) cerca del midpoint
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const fo = document.createElementNS(ns, 'foreignObject');
      fo.setAttribute('x', String(midX - 12));
      fo.setAttribute('y', String(midY - 12));
      fo.setAttribute('width', '24');
      fo.setAttribute('height', '24');
      fo.setAttribute('class', 'module-graph-path-action');
      fo.innerHTML = `<button type="button" class="module-graph-disconnect" title="Eliminar conexión" aria-label="Eliminar conexión"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      g.appendChild(fo);

      const btn = fo.querySelector('.module-graph-disconnect');
      if (btn) btn.onclick = (e) => {
        e.stopPropagation();
        this.disconnectModule(srcIdx);
      };

      overlay.appendChild(g);
    });
  };

  P.disconnectModule = function (srcIdx) {
    const src = this.flowModules[srcIdx];
    if (!src) return;
    src.next_module_id = null;
    this.onFieldChange();
    this.renderTechnicalModulesList();
    this.setupTechnicalModulesListeners();
  };

  // ------------------------------------------------------------------
  // Cleanup en destroy
  // ------------------------------------------------------------------
  const _origDestroy = P.destroy;
  P.destroy = function () {
    if (this._graphResizeObserver) {
      try { this._graphResizeObserver.disconnect(); } catch (_) {}
      this._graphResizeObserver = null;
    }
    if (this._graphMapEl && this._graphScrollListener) {
      this._graphMapEl.removeEventListener('scroll', this._graphScrollListener);
      this._graphScrollListener = null;
    }
    if (typeof _origDestroy === 'function') _origDestroy.call(this);
  };
})();
