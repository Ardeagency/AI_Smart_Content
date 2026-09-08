(function () {
  'use strict';

/**
 * Starfield — cielo de particulas que caen hacia el centro de la pantalla.
 *
 * Vive aqui y no dentro de una vista porque lo usan las DOS paginas de
 * facturacion (/plans y /creditos), que son la misma pagina con distinta
 * mercancia: una vende el plan del mes, la otra creditos sueltos.
 *
 * Por que canvas y no CSS: el campo anterior eran mosaicos de radial-gradient a
 * la deriva. Un mosaico no puede tener particulas que NAZCAN en el borde, se
 * aceleren hacia un punto y MUERAN ahi — cada punto necesita su propia posicion,
 * su propia edad y su propia velocidad. Con DOM serian ~140 nodos animandose a
 * 60fps; en canvas es un solo elemento y ~140 arcos por cuadro, que no le pesa
 * a nadie.
 *
 * El movimiento no es un zoom: cada particula conserva algo de giro, asi que
 * entra en espiral y se acelera al acercarse (el mismo rasgo que hace leer la
 * caida como gravedad y no como un acercamiento de camara). Al llegar al pozo
 * se apaga y renace en el borde con angulo nuevo: el bucle no tiene costura
 * porque en ningun momento se reinicia el campo entero, solo mueren y nacen
 * particulas sueltas.
 */
class Starfield {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.raf = null;
    this.last = 0;
    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.canvas) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'aisc-starfield';
    canvas.setAttribute('aria-hidden', 'true');
    // Va al <body> y no al contenedor de la vista: el router reescribe el
    // innerHTML del contenedor y se llevaria el canvas por delante.
    document.body.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();

    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);

    // Con reduced-motion se dibuja el cielo UNA vez y se deja quieto: quien pide
    // menos movimiento sigue mereciendo el fondo, no un rectangulo vacio.
    if (this._reducedMotion()) {
      this.particles.forEach((p) => { p.r = p.spawnR * (0.15 + Math.random() * 0.85); });
      this._draw();
      return;
    }

    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
  }

  _reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  }

  _onResize() {
    if (!this.canvas) return;
    this._resize();
    if (this._reducedMotion()) this._draw();
  }

  /** Pausa con la pestana oculta: un rAF de fondo gasta bateria sin que nadie mire. */
  _onVisibility() {
    if (!this.canvas || this._reducedMotion()) return;
    if (document.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    } else if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this._frame);
    }
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Tope de 2 en el DPR: en pantallas 3x el canvas cuadruplica pixeles para una
    // ganancia que en puntos de 1px nadie ve.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.cx = w / 2;
    this.cy = h / 2;
    // Nacen mas alla de la esquina: si nacieran justo en el borde se veria
    // aparecer la particula de la nada en pantalla.
    this.spawnR = Math.hypot(w, h) / 2 * 1.08;

    const objetivo = Math.round((w * h) / 14000);
    const total = Math.max(90, Math.min(260, objetivo));
    this._fitParticles(total);
  }

  _fitParticles(total) {
    while (this.particles.length > total) this.particles.pop();
    while (this.particles.length < total) {
      // Al crear el campo se reparten por todo el radio; despues cada una
      // renace en el borde. Sin esto, el primer cuadro seria un anillo.
      this.particles.push(this._spawn(Math.random()));
    }
    this.particles.forEach((p) => { p.spawnR = this.spawnR; });
  }

  _spawn(fraccionInicial) {
    const r = this.spawnR * (fraccionInicial != null ? fraccionInicial : 1 + Math.random() * 0.15);
    return {
      r,
      spawnR: this.spawnR,
      ang: Math.random() * Math.PI * 2,
      // Cada una cae a su ritmo: un campo con velocidad unica se lee como una
      // sola pieza moviendose, no como muchas cosas cayendo.
      vel: 26 + Math.random() * 34,
      giro: (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.05),
      size: 0.5 + Math.random() * 1.0,
      brillo: 0.4 + Math.random() * 0.55
    };
  }

  _frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05); // capado: volver de otra pestana no teletransporta el campo
    this.last = now;
    this._step(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  }

  _step(dt) {
    const nucleo = 70;   // dentro de esto ya no acelera mas ni gira mas rapido
    const muerte = 26;   // aqui se apaga y renace

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const rEfectivo = Math.max(p.r, nucleo);
      // El tiron crece al acercarse. Exponente 0.6 en vez del 2 de Newton: la
      // ley real dispara la velocidad tan cerca del centro que la particula
      // desaparece de golpe; 0.6 conserva la sensacion de caida acelerada y
      // deja verla llegar.
      const factor = Math.pow(p.spawnR / rEfectivo, 0.6);

      p.r -= p.vel * factor * dt;
      p.ang += p.giro * factor * dt;

      if (p.r <= muerte) this.particles[i] = this._spawn();
    }
  }

  _draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cx * 2, this.cy * 2);

    const entrada = this.spawnR * 0.88;  // por encima de esto todavia esta apareciendo
    const salida = 150;                  // por debajo de esto ya se esta apagando

    for (const p of this.particles) {
      let alfa = p.brillo;
      // Nace y muere en fundido; una particula que aparece o se corta de golpe
      // delata el truco.
      if (p.r > entrada) alfa *= Math.max(0, (p.spawnR - p.r) / (p.spawnR - entrada));
      if (p.r < salida)  alfa *= Math.max(0, (p.r - 26) / (salida - 26));
      if (alfa <= 0.01) continue;

      ctx.beginPath();
      ctx.arc(this.cx + Math.cos(p.ang) * p.r, this.cy + Math.sin(p.ang) * p.r, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alfa.toFixed(3)})`;
      ctx.fill();
    }
  }
}

  window.Starfield = Starfield;
})();
