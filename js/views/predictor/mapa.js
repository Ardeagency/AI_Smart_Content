/**
 * EL MAPA — la cara principal del lienzo del Predictor.
 *
 * El informe dice QUÉ contestó el público; el mapa dice DE DÓNDE SALIÓ ESE
 * PÚBLICO, y por eso es el que abre: se mira el reparto antes de leer
 * conclusiones. Antes de simular, el motor lee la semilla y extrae los actores
 * que en ese mundo pueden hablar; los agentes que después publican son esos
 * nodos. Mirar el mapa es la única forma de ver si el reparto tiene que ver con
 * el negocio o si el motor se inventó un mundo de marcas y reguladores — que es
 * exactamente el defecto medido: 19 de 19 entidades eran nombres propios de
 * marca, retail y reguladores, y ninguna era una persona del público.
 *
 * Y llega ANTES: el grafo se copia a la fila en cuanto el motor cierra su etapa,
 * a los pocos minutos; el veredicto tarda hasta media hora. Durante casi toda la
 * espera esto es lo único que hay para mirar, y es lo que permite matar una
 * corrida mal sembrada sin esperarla entera.
 *
 * EL MAPA FLOTA. La física no para nunca: una corriente lenta por burbuja que se
 * renueva sola. Un mapa quieto se lee como una ilustración y uno pasa de largo;
 * uno que respira pide que lo toquen, y tocarlo es como se descubre que media
 * nube son cosas y no personas.
 *
 * LAS POSICIONES NO PASAN POR NINGÚN RENDER. Se escriben a mano en los atributos
 * del SVG, 60 veces por segundo. El marcado se construye UNA vez y después solo
 * se mutan `cx`/`cy`/`x1`… — volver a generar el HTML en cada fotograma sería
 * rehacer el árbol entero sesenta veces por segundo.
 *
 * MASA Y UN SOLO ACENTO. Las burbujas son masa, no contorno: relleno lleno y
 * cero bordes. El color de marca no es decoración de una burbuja: al tocar una
 * se enciende SU RAMA entera —ella, con quien está unida y los hechos que los
 * unen— y el resto del mundo se apaga. Eso es lo que se viene a ver: no un actor
 * suelto, sino de qué está colgando.
 */
(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';

  // El lienzo mide 1000 y la nube respira un poco por fuera de esa caja: la
  // vista arranca con margen para no recortar a los de la orilla.
  const VISTA = { x: -70, y: -70, w: 1140, h: 1140 };

  const MASA = 'rgba(255,255,255,0.92)';
  const HILO = 'rgba(255,255,255,0.12)';
  const acento = () => 'rgb(var(--brand-primary-rgb, 255,255,255))';

  const crear = (t, attrs) => {
    const el = document.createElementNS(SVGNS, t);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  class PredMapa {
    /**
     * @param {HTMLElement} host  caja donde vive el mapa (position: relative)
     * @param {object} grafo      {nodes[], edges[]} tal como lo guardó el corredor
     */
    constructor(host, grafo) {
      this.host = host;
      this.grafo = grafo;
      // Tender el grafo es un cálculo de cientos de vueltas: se hace una vez por
      // grafo y no en cada pintado. De ahí arranca el motor, ya asentado.
      this.t = window.PredGrafo.tender(grafo);
      this.vista = Object.assign({}, VISTA);
      this.sel = null;        // uuid del actor encendido
      this.etiqueta = null;   // tipo de actor encendido
      this.agarre = null;
      this._raf = 0;
      this._vuelta = 0;
      this._anterior = 0;
      this.montar();
    }

    montar() {
      const t = this.t;
      this.host.innerHTML = '';
      this.host.classList.add('pmapa');

      const svg = crear('svg', {
        viewBox: `${this.vista.x} ${this.vista.y} ${this.vista.w} ${this.vista.h}`,
        preserveAspectRatio: 'xMidYMid meet',
        class: 'pmapa-svg',
      });
      this.svg = svg;

      // Los hechos primero, debajo de todo: son el tejido, no el sujeto.
      const gHilos = crear('g', {});
      this.hilos = t.aristas.map(() => {
        const l = crear('line', { stroke: HILO, 'stroke-width': '0.9' });
        gHilos.appendChild(l);
        return l;
      });
      svg.appendChild(gHilos);

      const gNodos = crear('g', {});
      this.grupos = [];
      this.circulos = [];
      this.rotulos = [];
      // En un mundo de más de 60 actores los nombres se apagan por defecto: con
      // todos encendidos el mapa es un muro de texto.
      this.nombresVisibles = t.nodos.length <= 60;

      t.nodos.forEach((n, i) => {
        const g = crear('g', { class: 'pmapa-nodo' });
        const c = crear('circle', { r: String(n.r), fill: MASA });
        const nombre = n.name.length > 26 ? n.name.slice(0, 25) + '…' : n.name;
        const tx = crear('text', {
          'text-anchor': 'middle',
          'font-size': '10',
          fill: 'rgba(245,244,242,0.55)',
          class: 'pmapa-rotulo',
          opacity: this.nombresVisibles ? '1' : '0',
        });
        tx.textContent = nombre;
        g.appendChild(c);
        g.appendChild(tx);
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          this.elegir(n.uuid === this.sel ? null : n.uuid);
        });
        gNodos.appendChild(g);
        this.grupos.push(g);
        this.circulos.push(c);
        this.rotulos.push(tx);
      });
      svg.appendChild(gNodos);

      svg.addEventListener('click', (e) => { if (e.target === svg) this.elegir(null); });
      this.host.appendChild(svg);

      this.montarLeyenda();
      this.ficha = document.createElement('div');
      this.host.appendChild(this.ficha);

      this.cablearGestos();
      this.pintarEstado();

      // ---- EL LATIDO ----
      const quieto = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.m = window.PredGrafo.crearMotor(t);
      this.escribirPosiciones();
      if (!quieto) this._raf = requestAnimationFrame((ms) => this.latir(ms));
    }

    /** Un solo `requestAnimationFrame` por mapa. */
    latir(ahora) {
      this._raf = requestAnimationFrame((ms) => this.latir(ms));
      // `dt` se limita: una pestaña que vuelve de segundo plano entrega un salto
      // de varios segundos y con él el mundo sale disparado.
      const dt = this._anterior ? Math.min(0.05, (ahora - this._anterior) / 1000) : 1 / 60;
      this._anterior = ahora;
      this._vuelta++;
      // El coste de la física crece con el cuadrado del número de nodos. Los
      // mundos reales van de 12 a 50 y cuestan menos de 1 ms; de 150 para arriba
      // se calcula en fotogramas alternos —el doble de `dt`, el mismo
      // movimiento— antes que dejar la pestaña a tirones.
      if (this.m.n <= 150) window.PredGrafo.paso(this.m, dt);
      else if (this._vuelta % 2 === 0) window.PredGrafo.paso(this.m, dt * 2);
      this.escribirPosiciones();
    }

    escribirPosiciones() {
      const { m, t } = this;
      for (let i = 0; i < t.nodos.length; i++) {
        const c = this.circulos[i];
        c.setAttribute('cx', m.x[i]);
        c.setAttribute('cy', m.y[i]);
        const r = this.rotulos[i];
        r.setAttribute('x', m.x[i]);
        r.setAttribute('y', m.y[i] + t.nodos[i].r + 12);
      }
      for (let e = 0; e < t.aristas.length; e++) {
        const l = this.hilos[e];
        l.setAttribute('x1', m.x[m.ea[e]]);
        l.setAttribute('y1', m.y[m.ea[e]]);
        l.setAttribute('x2', m.x[m.eb[e]]);
        l.setAttribute('y2', m.y[m.eb[e]]);
      }
    }

    // ---- LA RAMA ----
    // Encender un actor enciende con él a todo lo que cuelga de él. Se para en
    // los vecinos directos a propósito: en estos mundos casi todo está conectado
    // con todo a dos saltos, así que ir más lejos volvería a encender el mapa
    // entero y "resaltar" dejaría de significar nada.
    ramaDe(uuid) {
      if (!uuid) return null;
      const s = new Set([uuid]);
      for (const a of this.t.aristas) {
        if (a.source === uuid) s.add(a.target);
        if (a.target === uuid) s.add(a.source);
      }
      return s;
    }

    elegir(uuid) {
      this.sel = uuid;
      // Encender un actor apaga el filtro por tipo: son dos formas de mirar lo
      // mismo y encendidas a la vez no se sabe cuál manda.
      if (uuid) this.etiqueta = null;
      this.pintarEstado();
    }

    /** Repinta SOLO lo que depende de la selección: colores, opacidades y ficha. */
    pintarEstado() {
      const t = this.t;
      const rama = this.ramaDe(this.sel);
      const hayFoco = !!rama || !!this.etiqueta;
      const ACENTO = acento();

      t.nodos.forEach((n, i) => {
        const on = rama ? rama.has(n.uuid) : this.etiqueta ? n.etiqueta === this.etiqueta : true;
        this.grupos[i].setAttribute('opacity', hayFoco && !on ? '0.16' : '1');
        this.circulos[i].setAttribute('fill', hayFoco && on ? ACENTO : MASA);
        // El nombre se APAGA, no se desmonta: el elemento tiene que seguir ahí
        // para que el latido le siga escribiendo la posición. Montarlo al
        // encender lo dejaría un fotograma en la esquina 0,0.
        this.rotulos[i].setAttribute('fill', hayFoco && on ? '#fff' : 'rgba(245,244,242,0.55)');
        this.rotulos[i].setAttribute('opacity', (this.nombresVisibles || on) ? '1' : '0');
      });

      t.aristas.forEach((a, i) => {
        const dentro = rama ? (rama.has(a.source) && rama.has(a.target)) : !this.etiqueta;
        const l = this.hilos[i];
        l.setAttribute('stroke', dentro && rama ? ACENTO : HILO);
        l.setAttribute('stroke-width', dentro && rama ? '2' : '0.9');
        l.setAttribute('opacity', hayFoco && !dentro ? '0.12' : '1');
      });

      this.pintarChips();
      this.pintarFicha();
    }

    // ---- LA LEYENDA ----
    // Los tipos de actor que el motor inventó para ESTE mundo. No es un catálogo
    // fijo: la ontología los deriva de la semilla, así que leer esta lista es
    // leer qué entendió el motor que estaba en juego.
    montarLeyenda() {
      const t = this.t;
      const caja = document.createElement('div');
      caja.className = 'pmapa-leyenda';
      const tit = document.createElement('p');
      tit.className = 'pmapa-leyenda-titulo';
      tit.textContent = `${t.nodos.length} ${t.nodos.length === 1 ? 'actor' : 'actores'} · ${t.aristas.length} ${t.aristas.length === 1 ? 'hecho' : 'hechos'}`;
      caja.appendChild(tit);
      const fila = document.createElement('div');
      fila.className = 'pmapa-chips';
      this.chips = t.etiquetas.map((e) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pmapa-chip';
        b.innerHTML = `${this.esc(e.nombre)} <span>${e.cuantos}</span>`;
        b.addEventListener('click', () => {
          this.sel = null;
          this.etiqueta = this.etiqueta === e.nombre ? null : e.nombre;
          this.pintarEstado();
        });
        fila.appendChild(b);
        return { boton: b, nombre: e.nombre };
      });
      caja.appendChild(fila);
      this.host.appendChild(caja);
    }

    pintarChips() {
      for (const c of this.chips) {
        c.boton.classList.toggle('is-activo', this.etiqueta === c.nombre);
      }
    }

    // ---- LA FICHA DEL ACTOR ----
    pintarFicha() {
      const elegido = this.sel ? this.t.nodos.find((n) => n.uuid === this.sel) : null;
      if (!elegido) {
        // El motor construye el grafo en inglés (su ontología trabaja así),
        // aunque los agentes después hablen en español porque el escenario se lo
        // ordena. Se dice aquí para que nadie lo lea como un error.
        this.ficha.className = 'pmapa-pista';
        this.ficha.textContent = 'Toca un actor para encender su rama · el mundo se construye en inglés';
        return;
      }
      const hechos = window.PredGrafo.hechosDe(this.grafo, elegido.uuid);
      this.ficha.className = 'pmapa-ficha';
      this.ficha.innerHTML = `
<div class="pmapa-ficha-alto">
  <div class="pmapa-ficha-quien">
    <b>${this.esc(elegido.name)}</b>
    <p>${this.esc(elegido.labels.filter((l) => l !== 'Entity' && l !== 'Node').join(' · ') || elegido.etiqueta)} · ${elegido.grado} ${elegido.grado === 1 ? 'hecho' : 'hechos'}</p>
  </div>
  <button type="button" class="pmapa-cerrar" aria-label="Cerrar">✕</button>
</div>
${elegido.summary ? `<p class="pmapa-ficha-resumen">${this.esc(elegido.summary)}</p>` : ''}
${hechos.length ? `<ul class="pmapa-hechos">${hechos.map((h) => `
  <li><span class="pmapa-flecha">${h.sale ? '→' : '←'}</span> ${this.esc(h.fact || `${h.tipo} ${h.otro}`)}</li>`).join('')}</ul>` : ''}`;
      this.ficha.querySelector('.pmapa-cerrar').addEventListener('click', () => this.elegir(null));
    }

    // ---- ZOOM Y ARRASTRE ----
    cablearGestos() {
      const svg = this.svg;

      // La rueda hace zoom sobre el puntero, y para eso hay que poder cancelar
      // el scroll de la página: el listener se registra NO pasivo a mano, porque
      // por defecto `wheel` es pasivo y ahí `preventDefault()` no hace nada.
      this._alRodar = (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const v = this.vista;
        const factor = Math.exp(e.deltaY * 0.0015);
        const w = Math.min(3000, Math.max(140, v.w * factor));
        const h = w * (v.h / v.w);
        // El punto bajo el cursor se queda donde está.
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        this.vista = { x: v.x + (v.w - w) * px, y: v.y + (v.h - h) * py, w, h };
        this.aplicarVista();
      };
      svg.addEventListener('wheel', this._alRodar, { passive: false });

      svg.addEventListener('pointerdown', (e) => {
        if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (_) {} }
        this.agarre = { x: e.clientX, y: e.clientY, vx: this.vista.x, vy: this.vista.y };
      });
      svg.addEventListener('pointermove', (e) => {
        const g = this.agarre;
        if (!g) return;
        const r = svg.getBoundingClientRect();
        this.vista.x = g.vx - ((e.clientX - g.x) / r.width) * this.vista.w;
        this.vista.y = g.vy - ((e.clientY - g.y) / r.height) * this.vista.h;
        this.aplicarVista();
      });
      const soltar = () => { this.agarre = null; };
      svg.addEventListener('pointerup', soltar);
      svg.addEventListener('pointercancel', soltar);
    }

    aplicarVista() {
      const v = this.vista;
      this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    }

    esc(t) {
      return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * SIN ESTO EL MAPA SE QUEDA LATIENDO. Al cambiar de corrida el lienzo se
     * repinta con `innerHTML`, lo que deja el SVG huérfano pero NO cancela el
     * `requestAnimationFrame`: seguiría calculando física sobre nodos que ya no
     * están en pantalla, uno por cada corrida abierta en la sesión.
     */
    destruir() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      if (this.svg && this._alRodar) this.svg.removeEventListener('wheel', this._alRodar);
    }
  }

  window.PredMapa = PredMapa;
})();
