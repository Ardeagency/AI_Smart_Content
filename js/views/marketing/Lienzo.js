/**
 * Lienzo — la MECÁNICA del lienzo de Marketing (MarketingView): pan, zoom, arrastrar nodos,
 * redimensionar grupos, unir nodos arrastrando su puerto, soltar lo que viene de la
 * biblioteca y dibujar las aristas en SVG. No conoce la base ni los datos: la vista le pasa
 * los nodos ya mapeados (MarketingDatos) y cómo pintarlos, y él avisa de cada gesto con un
 * callback. Portado del Command Center (Canvas.mixin v6, borrado en L8): el mundo y el SVG
 * comparten el MISMO transform (patrón n8n/Vue Flow), las aristas viven en coords de mundo
 * y son bezier horizontales; el zoom se ancla al punto bajo el cursor.
 *
 * Todo el puntero pasa por UN pointerdown en la raíz con setPointerCapture: el arrastre no
 * cuelga listeners de window/document (regla de oro de eslint.config.mjs).
 *
 *   const l = new LienzoMarketing(raiz, { pintarNodo, editable, alMover, alConectar, … });
 *   l.cargar(nodos, aristas, viewport);  l.ponerNodo(n);  l.quitarNodo(id);  l.destruir();
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const UMBRAL = 4;            // px de pantalla antes de que un clic sea arrastre
  const ANCHO_NODO = 260;
  const ALTO_NODO = 150;
  const MIN_GRUPO = { ancho: 240, alto: 160 };
  const IGNORAR = 'input, textarea, select, button, a, [contenteditable="true"]';

  class LienzoMarketing {
    constructor(raiz, o) {
      this.raiz = raiz;
      this.o = o || {};
      this.editable = this.o.editable !== false;
      this.escalaMin = this.o.escalaMin || 0.3;
      this.escalaMax = this.o.escalaMax || 2;
      this.nodos = new Map();       // id → nodo (datos)
      this.els = new Map();         // id → elemento
      this.aristas = [];
      this.vp = { x: 0, y: 0, escala: 1 };
      this.seleccion = null;        // id de nodo
      this.aristaSel = null;        // id de arista
      this.gesto = null;
      this._raf = null;

      this.svg = document.createElementNS(NS, 'svg');
      this.svg.setAttribute('class', 'mk-aristas');
      this.svg.setAttribute('aria-hidden', 'true');
      this.capaAristas = document.createElementNS(NS, 'g');
      this.temporal = document.createElementNS(NS, 'path');
      this.temporal.setAttribute('class', 'mk-arista mk-arista--temporal');
      this.svg.append(this.capaAristas, this.temporal);
      this.mundo = document.createElement('div');
      this.mundo.className = 'mk-mundo';
      this.quitarBtn = document.createElement('button');
      this.quitarBtn.type = 'button';
      this.quitarBtn.className = 'btn btn--oscuro btn--sm mk-arista-quitar';
      this.quitarBtn.textContent = this.o.textoQuitarArista || 'Quitar conexión';
      this.quitarBtn.hidden = true;
      this.mundo.append(this.quitarBtn);
      raiz.prepend(this.svg, this.mundo);

      this._on = [];
      const on = (el, ev, fn, op) => { el.addEventListener(ev, fn, op); this._on.push([el, ev, fn, op]); };
      on(raiz, 'pointerdown', (e) => this._abajo(e));
      on(raiz, 'pointermove', (e) => this._mueve(e));
      on(raiz, 'pointerup', (e) => this._arriba(e));
      on(raiz, 'pointercancel', (e) => this._arriba(e, true));
      on(raiz, 'wheel', (e) => this._rueda(e), { passive: false });
      on(raiz, 'dragover', (e) => { if (this.editable && this._esDeBiblioteca(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
      on(raiz, 'drop', (e) => this._soltar(e));
      on(this.capaAristas, 'click', (e) => this._clicArista(e));
      on(this.quitarBtn, 'click', (e) => { e.stopPropagation(); const a = this.aristas.find((x) => x.id === this.aristaSel); if (a && this.o.alQuitarArista) this.o.alQuitarArista(a); });
    }

    /* ── Datos ─────────────────────────────────────────────────────────── */

    cargar(nodos, aristas, viewport) {
      for (const el of this.els.values()) el.remove();
      this.nodos.clear(); this.els.clear();
      (nodos || []).forEach((n) => this.ponerNodo(n, { sinAristas: true }));
      this.vp = { x: 0, y: 0, escala: 1, ...(viewport || {}) };
      this._transform();
      this.ponerAristas(aristas || []);
    }

    ponerNodo(n, { sinAristas } = {}) {
      let el = this.els.get(n.id);
      if (!el) {
        el = document.createElement('div');
        el.setAttribute('data-nodo', n.id);
        el.tabIndex = 0;
        this.els.set(n.id, el);
        // Los grupos van detrás de los nodos (orden en el DOM + z-index de la hoja).
        if (n.kind === 'group') this.mundo.prepend(el); else this.mundo.insertBefore(el, this.quitarBtn);
      }
      this.nodos.set(n.id, n);
      el.className = `mk-nodo mk-nodo--${n.kind}${this.seleccion === n.id ? ' mk-nodo--sel' : ''}`;
      window.Estado.pintar(el, this.o.pintarNodo ? this.o.pintarNodo(n) : '');
      this._posicionar(n.id);
      if (!sinAristas) this._programar();
      return el;
    }

    quitarNodo(id) {
      this.els.get(id)?.remove();
      this.els.delete(id); this.nodos.delete(id);
      if (this.seleccion === id) this.seleccionar(null);
      this.aristas = this.aristas.filter((a) => a.desde !== id && a.hasta !== id);
      this.ponerAristas(this.aristas);
    }

    moverNodo(id, x, y, ancho, alto) {
      const n = this.nodos.get(id);
      if (!n) return;
      n.x = x; n.y = y;
      if (ancho != null) n.ancho = ancho;
      if (alto != null) n.alto = alto;
      this._posicionar(id);
      this._programar();
    }

    ponerAristas(aristas) {
      this.aristas = (aristas || []).filter((a) => this.nodos.has(a.desde) && this.nodos.has(a.hasta));
      const hijos = [];
      for (const a of this.aristas) {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', `mk-arista-g mk-arista-g--${a.tipo}${a.id === this.aristaSel ? ' mk-arista-g--sel' : ''}`);
        g.setAttribute('data-arista', a.id);
        const golpe = document.createElementNS(NS, 'path');
        golpe.setAttribute('class', 'mk-arista-golpe');
        const linea = document.createElementNS(NS, 'path');
        linea.setAttribute('class', `mk-arista mk-arista--${a.tipo}`);
        g.append(golpe, linea);
        hijos.push(g);
      }
      this.capaAristas.replaceChildren(...hijos);
      if (this.aristaSel && !this.aristas.some((a) => a.id === this.aristaSel)) this.seleccionarArista(null);
      this._geometria();
    }

    seleccionar(id) {
      if (this.seleccion) this.els.get(this.seleccion)?.classList.remove('mk-nodo--sel');
      this.seleccion = id && this.nodos.has(id) ? id : null;
      if (this.seleccion) { this.els.get(this.seleccion)?.classList.add('mk-nodo--sel'); this.seleccionarArista(null); }
    }

    seleccionarArista(id) {
      this.aristaSel = id;
      this.capaAristas.querySelectorAll('.mk-arista-g').forEach((g) => g.classList.toggle('mk-arista-g--sel', g.getAttribute('data-arista') === id));
      this.quitarBtn.hidden = !id || !this.editable;
      this._geometria();
    }

    /* ── Viewport ──────────────────────────────────────────────────────── */

    get viewport() { return { ...this.vp }; }

    zoom(factor, ancla) {
      const r = this.raiz.getBoundingClientRect();
      const a = ancla || { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const s0 = this.vp.escala;
      const s1 = Math.min(this.escalaMax, Math.max(this.escalaMin, s0 * factor));
      const ax = a.x - r.left; const ay = a.y - r.top;
      // Mantener el punto del mundo bajo el cursor.
      const wx = (ax - this.vp.x) / s0; const wy = (ay - this.vp.y) / s0;
      this.vp = { x: ax - wx * s1, y: ay - wy * s1, escala: s1 };
      this._transform();
      this._avisarViewport();
    }

    /** Encuadra todos los nodos (o centra a escala 1 si no hay). */
    encajar() {
      const r = this.raiz.getBoundingClientRect();
      const ns = [...this.nodos.values()];
      if (!ns.length || !r.width) { this.vp = { x: r.width / 2 - 200, y: 60, escala: 1 }; this._transform(); this._avisarViewport(); return; }
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const n of ns) {
        const el = this.els.get(n.id);
        const w = n.ancho || el?.offsetWidth || ANCHO_NODO; const h = n.alto || el?.offsetHeight || ALTO_NODO;
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
      }
      const pad = 64;
      const s = Math.min(1.2, Math.max(this.escalaMin, Math.min((r.width - pad * 2) / Math.max(1, x1 - x0), (r.height - pad * 2) / Math.max(1, y1 - y0))));
      this.vp = { x: (r.width - (x1 - x0) * s) / 2 - x0 * s, y: (r.height - (y1 - y0) * s) / 2 - y0 * s, escala: s };
      this._transform();
      this._avisarViewport();
    }

    centrarEn(id) {
      const n = this.nodos.get(id); const el = this.els.get(id);
      if (!n) return;
      const r = this.raiz.getBoundingClientRect();
      const w = el?.offsetWidth || ANCHO_NODO; const h = el?.offsetHeight || ALTO_NODO;
      this.vp = { ...this.vp, x: r.width / 2 - (n.x + w / 2) * this.vp.escala, y: r.height / 2 - (n.y + h / 2) * this.vp.escala };
      this._transform();
      this._avisarViewport();
    }

    /** Punto de cliente → mundo. */
    aMundo(cx, cy) {
      const r = this.raiz.getBoundingClientRect();
      return { x: (cx - r.left - this.vp.x) / this.vp.escala, y: (cy - r.top - this.vp.y) / this.vp.escala };
    }

    centroMundo() {
      const r = this.raiz.getBoundingClientRect();
      return this.aMundo(r.left + r.width / 2, r.top + r.height / 2);
    }

    destruir() {
      for (const [el, ev, fn, op] of this._on) el.removeEventListener(ev, fn, op);
      this._on = [];
      if (this._raf) cancelAnimationFrame(this._raf);
      clearTimeout(this._tvp);
      this.svg.remove(); this.mundo.remove();
      this.nodos.clear(); this.els.clear();
    }

    /* ── Interno: pintar ──────────────────────────────────────────────── */

    _transform() {
      const t = `translate(${this.vp.x}px, ${this.vp.y}px) scale(${this.vp.escala})`;
      this.mundo.style.transform = t;
      this.svg.style.transform = t;
      this.raiz.classList.toggle('mk-lienzo--lejos', this.vp.escala < 0.5);
    }

    _posicionar(id) {
      const n = this.nodos.get(id); const el = this.els.get(id);
      if (!n || !el) return;
      el.style.transform = `translate(${n.x}px, ${n.y}px)`;
      if (n.kind === 'group' || n.kind === 'note') {
        el.style.width = n.ancho ? `${n.ancho}px` : '';
        el.style.height = n.alto ? `${n.alto}px` : '';
      }
    }

    _avisarViewport() {
      clearTimeout(this._tvp);
      this._tvp = setTimeout(() => this.o.alViewport && this.o.alViewport(this.viewport), 600);
    }

    _programar() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this._geometria(); });
    }

    /** Anclas en coords de mundo: salida a la derecha del nodo, entrada a la izquierda (n8n). */
    _ancla(id, lado) {
      const n = this.nodos.get(id); const el = this.els.get(id);
      if (!n) return null;
      const w = el?.offsetWidth || n.ancho || ANCHO_NODO;
      const h = Math.min(el?.offsetHeight || n.alto || ALTO_NODO, 72);
      return { x: n.x + (lado === 'salida' ? w : 0), y: n.y + h / 2 };
    }

    static curva(a, b) {
      const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
      return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
    }

    _extremos(a) {
      // La salida es el nodo de la izquierda: la curva nunca atraviesa los nodos.
      const na = this.nodos.get(a.desde); const nb = this.nodos.get(a.hasta);
      const [i, d] = na && nb && na.x > nb.x ? [a.hasta, a.desde] : [a.desde, a.hasta];
      return { p: this._ancla(i, 'salida'), q: this._ancla(d, 'entrada') };
    }

    _geometria() {
      // Lectura primero, escritura después (sin reflow por arista).
      const cambios = [];
      this.capaAristas.querySelectorAll('.mk-arista-g').forEach((g) => {
        const a = this.aristas.find((x) => x.id === g.getAttribute('data-arista'));
        if (!a) return;
        const { p, q } = this._extremos(a);
        if (p && q) cambios.push([g, LienzoMarketing.curva(p, q), p, q, a.id]);
      });
      for (const [g, d, p, q, id] of cambios) {
        g.querySelectorAll('path').forEach((path) => path.setAttribute('d', d));
        if (id === this.aristaSel) this.quitarBtn.style.transform = `translate(${(p.x + q.x) / 2}px, ${(p.y + q.y) / 2}px) translate(-50%, -50%)`;
      }
    }

    /* ── Interno: puntero ─────────────────────────────────────────────── */

    _nodoBajo(cx, cy, excepto) {
      const els = document.elementsFromPoint(cx, cy);
      for (const el of els) {
        const n = el.closest && el.closest('.mk-nodo');
        if (n && this.raiz.contains(n)) {
          const id = n.getAttribute('data-nodo');
          if (id !== excepto && this.nodos.get(id)?.kind !== 'group') return this.nodos.get(id) || null;
        }
      }
      return null;
    }

    _abajo(e) {
      if (e.button !== 0) return;
      const t = e.target;
      if (t.closest('.mk-arista-quitar')) return;
      const elNodo = t.closest('.mk-nodo');
      const id = elNodo ? elNodo.getAttribute('data-nodo') : null;
      const n = id ? this.nodos.get(id) : null;
      const base = { x0: e.clientX, y0: e.clientY, movido: false, puntero: e.pointerId };
      if (n && this.editable && t.closest('[data-puerto]')) {
        this.gesto = { ...base, tipo: 'unir', desde: n };
      } else if (n && this.editable && t.closest('[data-redimensionar]')) {
        this.gesto = { ...base, tipo: 'tamano', nodo: n, ancho0: n.ancho || this.els.get(id).offsetWidth, alto0: n.alto || this.els.get(id).offsetHeight };
      } else if (n && !t.closest(IGNORAR)) {
        // Un grupo arrastra lo que tiene dentro.
        const dentro = n.kind === 'group' ? this._dentroDe(n) : [];
        this.gesto = { ...base, tipo: 'mover', nodo: n, grupo: [n, ...dentro].map((m) => ({ id: m.id, x: m.x, y: m.y })) };
      } else if (!n && !t.closest(IGNORAR) && !t.closest('.mk-arista-g')) {
        this.gesto = { ...base, tipo: 'pan', vx: this.vp.x, vy: this.vp.y };
      } else return;
      try { this.raiz.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya liberado */ }
    }

    _dentroDe(g) {
      const el = this.els.get(g.id);
      const w = g.ancho || el?.offsetWidth || 0; const h = g.alto || el?.offsetHeight || 0;
      return [...this.nodos.values()].filter((m) => m.id !== g.id && m.kind !== 'group' && m.x >= g.x && m.y >= g.y && m.x < g.x + w && m.y < g.y + h);
    }

    _mueve(e) {
      const g = this.gesto;
      if (!g || e.pointerId !== g.puntero) return;
      const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
      if (!g.movido && Math.hypot(dx, dy) < UMBRAL) return;
      g.movido = true;
      const s = this.vp.escala;
      if (g.tipo === 'pan') {
        this.vp = { ...this.vp, x: g.vx + dx, y: g.vy + dy };
        this._transform();
        this.raiz.classList.add('mk-lienzo--paneando');
      } else if (g.tipo === 'mover') {
        if (!this.editable) return;
        for (const p of g.grupo) this.moverNodo(p.id, Math.round(p.x + dx / s), Math.round(p.y + dy / s));
        this.els.get(g.nodo.id)?.classList.add('mk-nodo--arrastrando');
        const bajo = g.nodo.kind === 'audience' || g.nodo.kind === 'campaign' ? this._nodoBajo(e.clientX, e.clientY, g.nodo.id) : null;
        this._marcarDestino(bajo && this.o.puedeUnir && this.o.puedeUnir(g.nodo, bajo) === 'vinculo' ? bajo.id : null);
      } else if (g.tipo === 'tamano') {
        const n = g.nodo;
        this.moverNodo(n.id, n.x, n.y, Math.max(MIN_GRUPO.ancho, Math.round(g.ancho0 + dx / s)), Math.max(MIN_GRUPO.alto, Math.round(g.alto0 + dy / s)));
      } else if (g.tipo === 'unir') {
        const p = this._ancla(g.desde.id, 'salida');
        const q = this.aMundo(e.clientX, e.clientY);
        if (p) this.temporal.setAttribute('d', LienzoMarketing.curva(p, q));
        const bajo = this._nodoBajo(e.clientX, e.clientY, g.desde.id);
        this._marcarDestino(bajo && (!this.o.puedeUnir || this.o.puedeUnir(g.desde, bajo)) ? bajo.id : null);
      }
    }

    _marcarDestino(id) {
      if (this._destino === id) return;
      if (this._destino) this.els.get(this._destino)?.classList.remove('mk-nodo--destino');
      this._destino = id;
      if (id) this.els.get(id)?.classList.add('mk-nodo--destino');
    }

    _arriba(e, cancelado) {
      const g = this.gesto;
      if (!g || e.pointerId !== g.puntero) return;
      this.gesto = null;
      try { this.raiz.releasePointerCapture(e.pointerId); } catch (_) { /* ya liberado */ }
      this.raiz.classList.remove('mk-lienzo--paneando');
      this.temporal.removeAttribute('d');
      const destino = this._destino ? this.nodos.get(this._destino) : null;
      this._marcarDestino(null);
      if (g.tipo === 'pan') {
        if (g.movido) this._avisarViewport();
        else if (!cancelado) { this.seleccionar(null); this.seleccionarArista(null); this.o.alSeleccionar && this.o.alSeleccionar(null); }
        return;
      }
      if (g.tipo === 'mover') {
        this.els.get(g.nodo.id)?.classList.remove('mk-nodo--arrastrando');
        if (!g.movido) { this.seleccionar(g.nodo.id); this.o.alSeleccionar && this.o.alSeleccionar(g.nodo.id); return; }
        if (cancelado) { for (const p of g.grupo) this.moverNodo(p.id, p.x, p.y); return; }
        // Audiencia soltada sobre una campaña (o al revés): se unen y el nodo vuelve a su sitio.
        if (destino && this.o.alConectar) {
          for (const p of g.grupo) this.moverNodo(p.id, p.x, p.y);
          this.o.alConectar(g.nodo, destino);
          return;
        }
        const antes = g.grupo.map((p) => ({ id: p.id, x: p.x, y: p.y }));
        const despues = g.grupo.map((p) => { const n = this.nodos.get(p.id); return { id: p.id, x: n.x, y: n.y }; });
        this.o.alMover && this.o.alMover(despues, antes);
        return;
      }
      if (g.tipo === 'tamano') {
        const n = g.nodo;
        if (g.movido && !cancelado) this.o.alMover && this.o.alMover([{ id: n.id, x: n.x, y: n.y, ancho: n.ancho, alto: n.alto }], [{ id: n.id, x: n.x, y: n.y, ancho: g.ancho0, alto: g.alto0 }]);
        return;
      }
      if (g.tipo === 'unir' && !cancelado && destino && this.o.alConectar) this.o.alConectar(g.desde, destino);
    }

    _rueda(e) {
      e.preventDefault();
      // Pellizco / ctrl+rueda = zoom anclado; rueda sola = mover el lienzo (como n8n y Figma).
      if (e.ctrlKey || e.metaKey) this.zoom(Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.01), { x: e.clientX, y: e.clientY });
      else { this.vp = { ...this.vp, x: this.vp.x - e.deltaX, y: this.vp.y - e.deltaY }; this._transform(); this._avisarViewport(); }
    }

    _clicArista(e) {
      const g = e.target.closest('.mk-arista-g');
      if (!g) return;
      e.stopPropagation();
      this.seleccionar(null);
      this.o.alSeleccionar && this.o.alSeleccionar(null);
      this.seleccionarArista(g.getAttribute('data-arista'));
    }

    _esDeBiblioteca(e) { return [...(e.dataTransfer?.types || [])].includes('application/x-aisc-marketing'); }

    _soltar(e) {
      if (!this.editable || !this._esDeBiblioteca(e)) return;
      e.preventDefault();
      let datos;
      try { datos = JSON.parse(e.dataTransfer.getData('application/x-aisc-marketing')); } catch (_) { return; }
      if (!datos) return;
      const sobre = this._nodoBajo(e.clientX, e.clientY, null);
      this.o.alSoltar && this.o.alSoltar(datos, this.aMundo(e.clientX, e.clientY), sobre);
    }
  }

  window.LienzoMarketing = LienzoMarketing;
})();
