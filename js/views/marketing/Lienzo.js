/**
 * Lienzo — la MECÁNICA del lienzo de Marketing (MarketingView) sobre el DOM del Command
 * Center v1: #ccCanvas (viewport), #ccCanvasWorld (nodos .cc-node) y #ccCanvasEdges (SVG
 * de aristas .cc-edge). Portado de Canvas.mixin v6 + CanvasStore (borrados en L8): el mundo
 * y el SVG comparten el MISMO transform (patrón n8n/Vue Flow), las aristas viven en coords
 * de mundo y se anclan a los PUERTOS reales del nodo (salida → entrada en el flujo; el
 * puerto más cercano en los adjuntos), el zoom se ancla al cursor, el soltar ajusta a una
 * rejilla de 16 px, el grupo se lleva lo que tiene dentro, y seleccionar un nodo resalta su
 * flujo conectado y atenúa el resto. Minimapa en la esquina.
 *
 * No conoce la base: la vista le pasa los nodos ya mapeados (MarketingDatos) y cómo
 * pintarlos, y él avisa de cada gesto con un callback. Todo el puntero pasa por UN
 * pointerdown en el lienzo con setPointerCapture: nada cuelga de window/document.
 *
 *   const l = new LienzoMarketing({ canvas, mundo, svg, minimapa }, { pintarNodo, claseNodo, … });
 *   l.cargar(nodos, aristas, viewport);  l.ponerNodo(n);  l.quitarNodo(id);  l.destruir();
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const UMBRAL = 3;            // px de pantalla antes de que un clic sea arrastre
  const REJILLA = 16;          // ajuste al soltar (v1)
  const IMAN = 60;             // px de pantalla: un puerto cercano atrae el cable (v1)
  const ANCHO_NODO = 268;
  const ALTO_NODO = 120;
  const MIN_GRUPO = { ancho: 100, alto: 80 };
  const IGNORAR = 'input, textarea, select, button, a, [contenteditable="true"]';

  class LienzoMarketing {
    constructor(dom, o) {
      this.canvas = dom.canvas;
      this.mundo = dom.mundo;
      this.svg = dom.svg;
      this.minimapa = dom.minimapa || null;
      this.o = o || {};
      this.editable = this.o.editable !== false;
      this.escalaMin = this.o.escalaMin || 0.4;
      this.escalaMax = this.o.escalaMax || 2;
      this.nodos = new Map();       // id → nodo (datos)
      this.els = new Map();         // id → .cc-node
      this.aristas = [];
      this.vp = { x: 0, y: 0, escala: 1 };
      this.seleccion = null;        // id de nodo
      this.foco = null;             // Set de ids del flujo resaltado
      this.gesto = null;
      this._raf = null;

      this.capaAristas = document.createElementNS(NS, 'g');
      this.capaAristas.setAttribute('class', 'cc-edges-layer');
      this.previa = document.createElementNS(NS, 'path');
      this.previa.setAttribute('class', 'cc-edge-path cc-edge-path--preview');
      this.previa.setAttribute('fill', 'none');
      this.svg.replaceChildren(this._defs(), this.capaAristas, this.previa);

      this._on = [];
      const on = (el, ev, fn, op) => { if (!el) return; el.addEventListener(ev, fn, op); this._on.push([el, ev, fn, op]); };
      on(this.canvas, 'pointerdown', (e) => this._abajo(e));
      on(this.canvas, 'pointermove', (e) => this._mueve(e));
      on(this.canvas, 'pointerup', (e) => this._arriba(e));
      on(this.canvas, 'pointercancel', (e) => this._arriba(e, true));
      on(this.canvas, 'wheel', (e) => this._rueda(e), { passive: false });
      on(this.canvas, 'dragover', (e) => this._sobreArrastre(e));
      on(this.canvas, 'dragleave', () => this._limpiarDestinoSoltar());
      on(this.canvas, 'drop', (e) => this._soltar(e));
      on(this.minimapa, 'click', (e) => this._clicMinimapa(e));
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => { this._programar(); this._minimapa(); });
        this._ro.observe(this.canvas);
      }
    }

    /* ── Datos ─────────────────────────────────────────────────────────── */

    cargar(nodos, aristas, viewport) {
      for (const el of this.els.values()) el.remove();
      this.nodos.clear(); this.els.clear();
      this.seleccion = null; this.foco = null;
      (nodos || []).forEach((n) => this.ponerNodo(n, { sinAristas: true }));
      this.vp = { x: 0, y: 0, escala: 1, ...(viewport || {}) };
      this._transform();
      this.ponerAristas(aristas || []);
    }

    ponerNodo(n, { sinAristas } = {}) {
      let el = this.els.get(n.id);
      if (!el) {
        el = document.createElement('div');
        this.els.set(n.id, el);
        // Los grupos van detrás de todo (primeros en el mundo); el resto en orden de llegada.
        if (n.kind === 'group') this.mundo.prepend(el); else this.mundo.append(el);
      }
      this.nodos.set(n.id, n);
      const datos = this.o.datosNodo ? this.o.datosNodo(n) : {};
      el.className = ['cc-node', this.o.claseNodo ? this.o.claseNodo(n) : '', this.seleccion === n.id ? 'cc-node--selected' : '',
        this.foco && this.foco.has(n.id) ? 'cc-node--in-focus' : ''].filter(Boolean).join(' ');
      el.setAttribute('data-node-key', n.id);
      for (const [k, v] of Object.entries(datos)) { if (v == null) el.removeAttribute(`data-${k}`); else el.setAttribute(`data-${k}`, v); }
      window.Estado.pintar(el, this.o.pintarNodo ? this.o.pintarNodo(n) : '');
      this._posicionar(n.id);
      if (!sinAristas) { this._programar(); this._minimapa(); }
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
      const hijos = this.aristas.map((a) => this._grupoArista(a));
      this.capaAristas.replaceChildren(...hijos);
      // Tras pintar, el foco se recalcula (las aristas definen el flujo).
      if (this.seleccion) this.foco = this._flujo(this.seleccion);
      this._aplicarFoco();
      this._geometria();
      this._minimapa();
    }

    /** Selecciona (o limpia) un nodo y resalta su flujo conectado (v1: _focusFlow). */
    seleccionar(id) {
      this.seleccion = id && this.nodos.has(id) ? id : null;
      for (const [k, el] of this.els) el.classList.toggle('cc-node--selected', k === this.seleccion);
      this.foco = this.seleccion ? this._flujo(this.seleccion) : null;
      this._aplicarFoco();
      this._minimapa();
    }

    /** Marca en el DOM un nodo como "recién llegado" un momento (v1: cc-node--flash). */
    destellar(id) {
      const el = this.els.get(id);
      if (!el) return;
      el.classList.add('cc-node--flash');
      setTimeout(() => el.classList.remove('cc-node--flash'), 1200);
    }

    /* ── Viewport ──────────────────────────────────────────────────────── */

    get viewport() { return { ...this.vp }; }

    zoom(factor, ancla) {
      const r = this.canvas.getBoundingClientRect();
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

    /** Encuadra todos los nodos (v1: _zoomToFit, padding 80, hasta 2x). */
    encajar() {
      const r = this.canvas.getBoundingClientRect();
      const ns = [...this.nodos.values()];
      if (!ns.length || !r.width) { this.vp = { x: 0, y: 0, escala: 1 }; this._transform(); this._avisarViewport(); return; }
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const n of ns) {
        const { w, h } = this._medida(n.id);
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
      }
      const pad = 80;
      const s = Math.min(this.escalaMax, Math.max(0.3, Math.min((r.width - pad * 2) / Math.max(1, x1 - x0), (r.height - pad * 2) / Math.max(1, y1 - y0))));
      this.vp = { x: (r.width - (x1 - x0) * s) / 2 - x0 * s, y: (r.height - (y1 - y0) * s) / 2 - y0 * s, escala: Math.max(this.escalaMin, s) };
      this._transform();
      this._avisarViewport();
    }

    centrarEn(id) {
      const n = this.nodos.get(id);
      if (!n) return;
      const r = this.canvas.getBoundingClientRect();
      const { w, h } = this._medida(id);
      this.vp = { ...this.vp, x: r.width / 2 - (n.x + w / 2) * this.vp.escala, y: r.height / 2 - (n.y + h / 2) * this.vp.escala };
      this._transform();
      this._avisarViewport();
    }

    /** Punto de cliente → mundo. */
    aMundo(cx, cy) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (cx - r.left - this.vp.x) / this.vp.escala, y: (cy - r.top - this.vp.y) / this.vp.escala };
    }

    centroMundo() {
      const r = this.canvas.getBoundingClientRect();
      return this.aMundo(r.left + r.width / 2, r.top + r.height / 2);
    }

    destruir() {
      for (const [el, ev, fn, op] of this._on) el.removeEventListener(ev, fn, op);
      this._on = [];
      this._ro?.disconnect();
      if (this._raf) cancelAnimationFrame(this._raf);
      clearTimeout(this._tvp);
      for (const el of this.els.values()) el.remove();
      this.capaAristas.replaceChildren();
      this.previa.removeAttribute('d');
      this.nodos.clear(); this.els.clear();
    }

    /* ── Interno: pintar ──────────────────────────────────────────────── */

    _defs() {
      const defs = document.createElementNS(NS, 'defs');
      const m = document.createElementNS(NS, 'marker');
      for (const [k, v] of Object.entries({ id: 'ccEdgeArrow', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '6.5', markerHeight: '6.5', orient: 'auto-start-reverse' })) m.setAttribute(k, v);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M 0 1 L 9 5 L 0 9 z');
      p.setAttribute('class', 'cc-edge-arrow-head');
      m.append(p); defs.append(m);
      return defs;
    }

    /** <g class="cc-edge"> con su franja de golpe, la línea y la fila «+ / ×» (v1). */
    _grupoArista(a) {
      const tipo = this.o.tipoArista ? this.o.tipoArista(a) : 'ingredient';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `cc-edge cc-edge--${tipo} ${a.tipo === 'vinculo' ? 'cc-edge--persona' : 'cc-edge--free'}`);
      g.setAttribute('data-arista', a.id);
      g.setAttribute('data-edge-from', a.desde);
      g.setAttribute('data-edge-to', a.hasta);
      const golpe = document.createElementNS(NS, 'path');
      golpe.setAttribute('class', 'cc-edge-hit'); golpe.setAttribute('fill', 'none');
      const linea = document.createElementNS(NS, 'path');
      linea.setAttribute('class', 'cc-edge-path'); linea.setAttribute('fill', 'none');
      if (tipo === 'production') linea.setAttribute('marker-end', 'url(#ccEdgeArrow)');
      g.append(golpe, linea);
      if (this.editable) {
        const fo = document.createElementNS(NS, 'foreignObject');
        fo.setAttribute('class', 'cc-edge-action');
        fo.setAttribute('width', '72'); fo.setAttribute('height', '36');
        const fila = document.createElementNS(XHTML, 'div');
        fila.setAttribute('class', 'cc-edge-actions-row');
        const boton = (clase, icono, titulo, fn) => {
          const b = document.createElementNS(XHTML, 'button');
          b.setAttribute('type', 'button');
          b.setAttribute('class', `btn btn--oscuro btn--sm btn--icono ${clase}`);
          b.setAttribute('title', titulo); b.setAttribute('aria-label', titulo);
          const i = document.createElementNS(XHTML, 'i');
          i.setAttribute('class', `aisc-ico aisc-ico--${icono}`); i.setAttribute('aria-hidden', 'true');
          b.append(i);
          b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
          return b;
        };
        fila.append(
          boton('cc-edge-add', 'add', this.o.textoAgregar || 'Agregar nodo', () => this.o.alMasArista && this.o.alMasArista(a)),
          boton('cc-edge-disconnect', 'close', this.o.textoQuitarArista || 'Quitar conexión', () => this.o.alQuitarArista && this.o.alQuitarArista(a)),
        );
        fo.append(fila);
        g.append(fo);
      }
      return g;
    }

    _transform() {
      const t = `translate(${this.vp.x}px, ${this.vp.y}px) scale(${this.vp.escala})`;
      this.mundo.style.transform = t;
      this.svg.style.transform = t;
      // Grosor de línea ~constante en pantalla (patrón n8n).
      this.canvas.style.setProperty('--cc-zoom-comp', String(Math.min(2.4, Math.max(0.5, 1 / this.vp.escala))));
      // Nivel de detalle: al alejar se apagan cuerpo y sombra (v1: cc-canvas--far).
      this.canvas.classList.toggle('cc-canvas--far', this.vp.escala < 0.42);
      this._minimapa();
    }

    _posicionar(id) {
      const n = this.nodos.get(id); const el = this.els.get(id);
      if (!n || !el) return;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      if (n.kind === 'group' || n.kind === 'note') {
        el.style.width = n.ancho ? `${n.ancho}px` : '';
        el.style.height = n.alto ? `${n.alto}px` : '';
      }
    }

    _medida(id) {
      const n = this.nodos.get(id); const el = this.els.get(id);
      return { w: n?.ancho || el?.offsetWidth || ANCHO_NODO, h: n?.alto || el?.offsetHeight || ALTO_NODO };
    }

    _avisarViewport() {
      clearTimeout(this._tvp);
      this._tvp = setTimeout(() => this.o.alViewport && this.o.alViewport(this.viewport), 600);
    }

    _programar() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this._geometria(); });
    }

    /** Centro de un elemento en coords de mundo. */
    _centro(el, cr) {
      const r = el.getBoundingClientRect();
      const s = this.vp.escala;
      return { x: (r.left + r.width / 2 - cr.left - this.vp.x) / s, y: (r.top + r.height / 2 - cr.top - this.vp.y) / s };
    }

    /**
     * Ancla de una arista (v1 _portAnchor): en el FLUJO, sale por el puerto de salida y entra
     * por el de entrada; un ADJUNTO cuelga del puerto visible más cercano al otro nodo.
     */
    _ancla(id, hacia, cr, rol) {
      const el = this.els.get(id);
      const n = this.nodos.get(id);
      if (!el || !n) return null;
      if (el.offsetParent === null) return { x: n.x + ANCHO_NODO / 2, y: n.y + 48 };
      if (rol) {
        const pref = el.querySelector(rol === 'desde' ? '[data-port="out"]' : '[data-port="in"]');
        if (pref && pref.offsetParent !== null) return this._centro(pref, cr);
      }
      const otro = this.els.get(hacia);
      const t = otro && otro.offsetParent !== null ? this._centro(otro, cr) : null;
      let mejor = null; let dMin = Infinity;
      el.querySelectorAll('.cc-node-port').forEach((p) => {
        if (p.offsetParent === null) return;
        const c = this._centro(p, cr);
        if (!t) { if (!mejor) mejor = c; return; }
        const d = (c.x - t.x) ** 2 + (c.y - t.y) ** 2;
        if (d < dMin) { dMin = d; mejor = c; }
      });
      if (mejor) return mejor;
      // Sin puertos (una nota): el borde del nodo más cercano al otro.
      const c = this._centro(el, cr);
      if (!t) return c;
      const { w, h } = this._medida(id);
      const dx = t.x - c.x; const dy = t.y - c.y;
      return Math.abs(dx) * h > Math.abs(dy) * w ? { x: c.x + Math.sign(dx) * w / 2, y: c.y } : { x: c.x, y: c.y + Math.sign(dy) * h / 2 };
    }

    static curva(a, b) {
      const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
      return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
    }

    /** Trazo v1 (_edgePath): flujo hacia atrás pasa por debajo; adjuntos verticales con tangente vertical. */
    static trazo(a, b, flujo) {
      if (flujo && b.x < a.x - 30) {
        const my = Math.max(a.y, b.y) + 130; const mx = (a.x + b.x) / 2;
        return `M ${a.x} ${a.y} C ${a.x + 80} ${a.y}, ${a.x + 80} ${my}, ${mx} ${my} C ${b.x - 80} ${my}, ${b.x - 80} ${b.y}, ${b.x} ${b.y}`;
      }
      if (!flujo && Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) {
        const dy = Math.max(40, Math.abs(b.y - a.y) * 0.45) * (b.y > a.y ? 1 : -1);
        return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
      }
      return LienzoMarketing.curva(a, b);
    }

    _geometria() {
      const cr = this.canvas.getBoundingClientRect();
      // Lectura primero, escritura después (sin reflow por arista).
      const cambios = [];
      this.capaAristas.querySelectorAll('.cc-edge').forEach((g) => {
        const flujo = g.classList.contains('cc-edge--production');
        const de = g.getAttribute('data-edge-from'); const a = g.getAttribute('data-edge-to');
        const p = this._ancla(de, a, cr, flujo ? 'desde' : null);
        const q = this._ancla(a, de, cr, flujo ? 'hacia' : null);
        if (p && q) cambios.push([g, LienzoMarketing.trazo(p, q, flujo), p, q]);
      });
      for (const [g, d, p, q] of cambios) {
        g.querySelectorAll('path').forEach((path) => path.setAttribute('d', d));
        const fo = g.querySelector('.cc-edge-action');
        if (fo) { fo.setAttribute('x', String((p.x + q.x) / 2 - 36)); fo.setAttribute('y', String((p.y + q.y) / 2 - 18)); }
      }
    }

    /* ── Foco de flujo ────────────────────────────────────────────────── */

    _flujo(raiz) {
      const ady = new Map();
      const unir = (a, b) => { if (!ady.has(a)) ady.set(a, new Set()); ady.get(a).add(b); };
      for (const e of this.aristas) { unir(e.desde, e.hasta); unir(e.hasta, e.desde); }
      const set = new Set([raiz]); const cola = [raiz];
      while (cola.length) { const k = cola.shift(); for (const m of ady.get(k) || []) if (!set.has(m)) { set.add(m); cola.push(m); } }
      return set;
    }

    _aplicarFoco() {
      const on = !!(this.foco && this.foco.size);
      this.canvas.classList.toggle('cc-canvas--focusing', on);
      for (const [k, el] of this.els) el.classList.toggle('cc-node--in-focus', on && this.foco.has(k));
      this.capaAristas.querySelectorAll('.cc-edge').forEach((g) => {
        g.classList.toggle('cc-edge--in-focus', on && this.foco.has(g.getAttribute('data-edge-from')) && this.foco.has(g.getAttribute('data-edge-to')));
      });
    }

    /* ── Minimapa (v1: esquina inferior izquierda, color de resalte de la marca) ── */

    _minimapa() {
      const cv = this.minimapa;
      if (!cv) return;
      const caja = cv.parentElement;
      const ns = [...this.nodos.values()];
      if (!ns.length) { this._mini = null; if (caja) caja.hidden = true; return; }
      if (caja) caja.hidden = false;
      const ctx = cv.getContext && cv.getContext('2d');
      if (!ctx) return;
      const W = cv.width; const H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const NW = ANCHO_NODO; const NH = 200;
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + NW); y1 = Math.max(y1, n.y + NH); }
      const pad = 10;
      const sc = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
      const ox = pad - x0 * sc; const oy = pad - y0 * sc;
      this._mini = { sc, ox, oy };
      let color;
      try { color = getComputedStyle(this.canvas).getPropertyValue('--cc-highlight').trim(); } catch (_) { color = ''; }
      ctx.fillStyle = color || 'white';
      ctx.strokeStyle = color || 'white';
      const alfa = { audience: 0.8, campaign: 1, element: 0.68 };
      for (const n of ns) {
        const base = alfa[n.kind] ?? 0.6;
        ctx.globalAlpha = this.foco && !this.foco.has(n.id) ? base * 0.28 : base * 0.9;
        ctx.fillRect(n.x * sc + ox, n.y * sc + oy, Math.max(3, NW * sc), Math.max(3, 60 * sc));
      }
      const r = this.canvas.getBoundingClientRect();
      const s = this.vp.escala;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.5;
      ctx.strokeRect((-this.vp.x / s) * sc + ox, (-this.vp.y / s) * sc + oy, (r.width / s) * sc, (r.height / s) * sc);
      ctx.globalAlpha = 1;
    }

    _clicMinimapa(e) {
      if (!this._mini) return;
      e.stopPropagation();
      const r = this.minimapa.getBoundingClientRect();
      const { sc, ox, oy } = this._mini;
      const wx = ((e.clientX - r.left) * (this.minimapa.width / r.width) - ox) / sc;
      const wy = ((e.clientY - r.top) * (this.minimapa.height / r.height) - oy) / sc;
      const cr = this.canvas.getBoundingClientRect();
      this.vp = { ...this.vp, x: cr.width / 2 - wx * this.vp.escala, y: cr.height / 2 - wy * this.vp.escala };
      this._transform();
      this._avisarViewport();
    }

    /* ── Interno: puntero ─────────────────────────────────────────────── */

    _nodoBajo(cx, cy, excepto) {
      for (const [id, el] of this.els) {
        if (id === excepto || this.nodos.get(id)?.kind === 'group' || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return this.nodos.get(id);
      }
      return null;
    }

    _abajo(e) {
      if (e.button !== 0) return;
      const t = e.target;
      if (t.closest('.cc-floating-panel, .cc-strat-panel, .cc-minimap-float, .cc-edge-action')) return;
      const elNodo = t.closest('.cc-node');
      const id = elNodo ? elNodo.getAttribute('data-node-key') : null;
      const n = id ? this.nodos.get(id) : null;
      const base = { x0: e.clientX, y0: e.clientY, movido: false, puntero: e.pointerId };
      const puerto = t.closest('[data-port]');
      if (n && this.editable && puerto) {
        this.gesto = { ...base, tipo: 'unir', desde: n, inicio: this._centro(puerto, this.canvas.getBoundingClientRect()), imanes: this._imanes(n.id) };
        this.canvas.classList.add('cc-canvas--connecting');
      } else if (n && this.editable && t.closest('[data-redimensionar]')) {
        const { w, h } = this._medida(n.id);
        this.gesto = { ...base, tipo: 'tamano', nodo: n, ancho0: w, alto0: h };
      } else if (n && !t.closest(IGNORAR)) {
        // Un grupo se arrastra por su cabecera y se lleva lo que tiene dentro (centro dentro, v1).
        const porCabecera = !!t.closest('[data-drag-handle]');
        if (n.kind === 'group' && !porCabecera) { this.gesto = { ...base, tipo: 'clic', nodo: n }; }
        else {
          const dentro = n.kind === 'group' ? this._dentroDe(n) : [];
          this.gesto = { ...base, tipo: 'mover', nodo: n, grupo: [n, ...dentro].map((m) => ({ id: m.id, x: m.x, y: m.y })) };
        }
      } else if (!n && !t.closest(IGNORAR) && !t.closest('.cc-edge')) {
        this.gesto = { ...base, tipo: 'pan', vx: this.vp.x, vy: this.vp.y };
      } else return;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya liberado */ }
    }

    _dentroDe(g) {
      const { w, h } = this._medida(g.id);
      return [...this.nodos.values()].filter((m) => {
        if (m.id === g.id || m.kind === 'group') return false;
        const d = this._medida(m.id);
        const cx = m.x + d.w / 2; const cy = m.y + d.h / 2;
        return cx >= g.x && cx <= g.x + w && cy >= g.y && cy <= g.y + h;
      });
    }

    /** Puertos visibles de los demás nodos, en pantalla (el lienzo no se mueve mientras se une). */
    _imanes(desde) {
      const out = [];
      for (const [id, el] of this.els) {
        if (id === desde || el.offsetParent === null) continue;
        el.querySelectorAll('.cc-node-port').forEach((p) => {
          if (p.offsetParent === null) return;
          const r = p.getBoundingClientRect();
          out.push({ id, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
        });
      }
      return out;
    }

    _iman(g, x, y) {
      let mejor = null; let d = IMAN * IMAN;
      for (const p of g.imanes) { const dd = (p.cx - x) ** 2 + (p.cy - y) ** 2; if (dd < d) { d = dd; mejor = p; } }
      return mejor;
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
        this.canvas.classList.add('cc-canvas--panning');
      } else if (g.tipo === 'mover') {
        if (!this.editable) return;
        for (const p of g.grupo) this.moverNodo(p.id, p.x + dx / s, p.y + dy / s);
        this.els.get(g.nodo.id)?.classList.add('cc-node--dragging');
        const bajo = g.nodo.kind === 'audience' || g.nodo.kind === 'campaign' ? this._nodoBajo(e.clientX, e.clientY, g.nodo.id) : null;
        this._marcarDestino(bajo && this.o.puedeUnir && this.o.puedeUnir(g.nodo, bajo) === 'vinculo' ? bajo.id : null);
      } else if (g.tipo === 'tamano') {
        const n = g.nodo;
        this.moverNodo(n.id, n.x, n.y, Math.max(MIN_GRUPO.ancho, Math.round(g.ancho0 + dx / s)), Math.max(MIN_GRUPO.alto, Math.round(g.alto0 + dy / s)));
      } else if (g.tipo === 'unir') {
        const directo = this._nodoBajo(e.clientX, e.clientY, g.desde.id);
        const cerca = directo ? null : this._iman(g, e.clientX, e.clientY);
        const destino = directo || (cerca ? this.nodos.get(cerca.id) : null);
        const ok = destino && (!this.o.puedeUnir || this.o.puedeUnir(g.desde, destino));
        this._marcarDestino(ok ? destino.id : null);
        const cr = this.canvas.getBoundingClientRect();
        let fin = this.aMundo(e.clientX, e.clientY);
        if (cerca) fin = this.aMundo(cerca.cx, cerca.cy);
        else if (directo) fin = this._ancla(directo.id, g.desde.id, cr, 'hacia') || fin;
        this.previa.setAttribute('d', LienzoMarketing.curva(g.inicio, fin));
        this.previa.classList.add('is-on');
      }
    }

    _marcarDestino(id) {
      if (this._destino === id) return;
      if (this._destino) this.els.get(this._destino)?.classList.remove('cc-node--drop-target');
      this._destino = id;
      if (id) this.els.get(id)?.classList.add('cc-node--drop-target');
    }

    _arriba(e, cancelado) {
      const g = this.gesto;
      if (!g || e.pointerId !== g.puntero) return;
      this.gesto = null;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ya liberado */ }
      this.canvas.classList.remove('cc-canvas--panning', 'cc-canvas--connecting');
      this.previa.removeAttribute('d');
      this.previa.classList.remove('is-on');
      const destino = this._destino ? this.nodos.get(this._destino) : null;
      this._marcarDestino(null);
      if (g.tipo === 'pan') {
        if (g.movido) this._avisarViewport();
        else if (!cancelado) this._elegir(null);
        return;
      }
      if (g.tipo === 'clic') { if (!g.movido && !cancelado) this._elegir(g.nodo.id); return; }
      if (g.tipo === 'mover') {
        this.els.get(g.nodo.id)?.classList.remove('cc-node--dragging');
        if (!g.movido) { if (!cancelado) this._elegir(g.nodo.id); return; }
        if (cancelado) { for (const p of g.grupo) this.moverNodo(p.id, p.x, p.y); return; }
        // Audiencia soltada sobre una campaña (o al revés): se unen y el nodo vuelve a su sitio.
        if (destino && this.o.alConectar) {
          for (const p of g.grupo) this.moverNodo(p.id, p.x, p.y);
          this.o.alConectar(g.nodo, destino);
          return;
        }
        // Ajuste a la rejilla de 16 px al soltar (v1): se mueve el grupo entero con el mismo delta.
        const n0 = this.nodos.get(g.nodo.id);
        const ax = Math.round(n0.x / REJILLA) * REJILLA - n0.x; const ay = Math.round(n0.y / REJILLA) * REJILLA - n0.y;
        for (const p of g.grupo) { const n = this.nodos.get(p.id); this.moverNodo(p.id, Math.round(n.x + ax), Math.round(n.y + ay)); }
        const antes = g.grupo.map((p) => ({ id: p.id, x: p.x, y: p.y }));
        const despues = g.grupo.map((p) => { const n = this.nodos.get(p.id); return { id: p.id, x: n.x, y: n.y }; });
        this._minimapa();
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

    /** Clic en un nodo: lo selecciona; otro clic sobre el mismo lo suelta (v1). */
    _elegir(id) {
      const nuevo = id && id === this.seleccion ? null : id;
      this.seleccionar(nuevo);
      this.o.alSeleccionar && this.o.alSeleccionar(nuevo);
    }

    _rueda(e) {
      if (e.target.closest('.cc-floating-panel, .cc-strat-panel, .cc-node-body, textarea')) return;
      e.preventDefault();
      // Pellizco / ctrl+rueda = zoom anclado al cursor; rueda sola = mover el lienzo (n8n, Figma).
      if (e.ctrlKey || e.metaKey) this.zoom(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.0045 * 2), { x: e.clientX, y: e.clientY });
      else { this.vp = { ...this.vp, x: this.vp.x - e.deltaX, y: this.vp.y - e.deltaY }; this._transform(); this._avisarViewport(); }
    }

    _esDeBiblioteca(e) { return [...(e.dataTransfer?.types || [])].includes('application/x-aisc-marketing'); }

    _sobreArrastre(e) {
      if (!this.editable || !this._esDeBiblioteca(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.canvas.classList.add('cc-canvas--droptarget');
      const bajo = this._nodoBajo(e.clientX, e.clientY, null);
      this._marcarDestino(bajo ? bajo.id : null);
    }

    _limpiarDestinoSoltar() {
      this.canvas.classList.remove('cc-canvas--droptarget');
      this._marcarDestino(null);
    }

    _soltar(e) {
      this._limpiarDestinoSoltar();
      if (!this.editable || !this._esDeBiblioteca(e)) return;
      e.preventDefault();
      let datos;
      try { datos = JSON.parse(e.dataTransfer.getData('application/x-aisc-marketing')); } catch (_) { return; }
      if (!datos) return;
      const sobre = this._nodoBajo(e.clientX, e.clientY, null);
      const p = this.aMundo(e.clientX, e.clientY);
      // v1: el nodo cae con su cabecera bajo el cursor.
      this.o.alSoltar && this.o.alSoltar(datos, { x: Math.max(0, p.x - 110), y: Math.max(0, p.y - 20) }, sobre);
    }
  }

  window.LienzoMarketing = LienzoMarketing;
})();
