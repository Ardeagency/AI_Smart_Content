/**
 * Capas — los TRES modales oficiales y la pregunta encima de la tarjeta.
 * Portado de la cantera (Git-AISC-Frontend d43e948, src/adn/plataforma/capas.ts;
 * inventario en su docs/modales-v1-inventario.md). Todo sobre <dialog>.showModal():
 * foco atrapado, Esc cierra, el resto queda inert, y la capa superior del navegador
 * resuelve el apilado sin z-index. Piel en css/modules/capas.css.
 *
 *   const c = Capas.abrir({ forma: 'principal', titulo: 'Adjuntar producto', volver: () => … });
 *   c.cuerpo.append(...); c.pie.append(...);   // el pie aparece al tener hijos
 *   const r = await c.cerrada;                 // 'cancelar' o lo que se pase a c.cerrar()
 *
 *   const e = Capas.abrir({ forma: 'editorial', fondo: urlImagen });
 *   e.izquierda.append(...); e.info.append(...);
 *
 *   const d = Capas.abrir({ forma: 'edicion', pestanas: ['Resultado', 'Briefing'] });
 *   d.lienzo.append(img); d.barra.append(...); d.lado.append(...); d.acciones.append(...);
 *
 *   if (await Capas.confirmar({ titulo: '¿Descartar los cambios?', aceptar: 'Descartar', peligro: true })) …
 *   if (await Capas.preguntar(tarjeta, { texto: '¿Borrar Maitamac?', seVa: { proyectos: 6 } })) …
 *
 * Reglas: nada abre encima de la plataforma si no es por aquí. Nunca alert()/
 * confirm()/prompt() del navegador (test/ui-feedback.test.js lo cuenta).
 * Borrar algo que se VE en una tarjeta → preguntar() sobre esa tarjeta; confirmar()
 * es para lo que no tiene tarjeta (descartar, salir, acciones de la página).
 */
(function () {
  'use strict';

  const MS = 220;
  const FORMAS = ['principal', 'editorial', 'edicion'];
  const t = (s) => (typeof window.__ === 'function' ? window.__(s) : s);

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    n.className = clase;
    if (texto) n.textContent = texto;
    return n;
  }
  function boton(texto, clase) {
    const b = el('button', clase, texto);
    b.type = 'button';
    return b;
  }
  function uid() { return 'capa-' + Math.random().toString(36).slice(2, 8); }
  function reducirMovimiento() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }

  function montar(dialog) {
    document.body.append(dialog);
    dialog.showModal();
    const primero = dialog.querySelector('input, textarea, select, [autofocus]');
    if (primero) primero.focus();
    else { dialog.tabIndex = -1; dialog.focus(); }
  }

  /** Abre una capa. Devuelve sus huecos según la forma, más { dialog, cerrada, cerrar }. */
  function abrir(o) {
    const opciones = o || {};
    const forma = FORMAS.includes(opciones.forma) ? opciones.forma : 'principal';
    const cerrable = opciones.cerrable !== false;
    const dialog = document.createElement('dialog');
    dialog.className = 'capa capa--' + forma + (opciones.clase ? ' ' + opciones.clase : '');
    if (opciones.aria) dialog.setAttribute('aria-label', opciones.aria);

    let resolver = null;
    const cerrada = new Promise((res) => { resolver = res; });
    let cerrando = false;
    const cerrar = (resultado) => {
      const r = resultado === undefined ? 'cancelar' : resultado;
      if (cerrando || !dialog.open) return;
      cerrando = true;
      dialog.classList.add('is-cerrando');
      window.setTimeout(() => {
        dialog.close(r);
        dialog.remove();
        if (typeof opciones.alCerrar === 'function') {
          try { opciones.alCerrar(r); } catch (e) { console.warn('Capas: alCerrar falló', e); }
        }
        resolver(r);
      }, reducirMovimiento() ? 0 : MS);
    };
    // Esc: el navegador dispara `cancel`; lo tomamos para animar la salida.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (cerrable) cerrar('cancelar'); });
    // Clic en el velo = clic en el propio <dialog> fuera de su caja.
    dialog.addEventListener('click', (e) => {
      if (!cerrable || e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrar('cancelar');
    });
    const botonCerrar = (flotante) => {
      const x = boton('×', 'capa__cerrar' + (flotante ? ' capa__cerrar--flotante' : ''));
      x.setAttribute('aria-label', t('Cerrar'));
      x.addEventListener('click', () => cerrar('cancelar'));
      return x;
    };
    const base = { dialog, cerrada, cerrar };

    if (forma === 'principal') {
      const cab = el('header', 'capa__cabecera');
      if (typeof opciones.volver === 'function') {
        const v = boton(t('Volver'), 'capa__volver');
        v.addEventListener('click', opciones.volver);
        cab.append(v);
      }
      const h = el('h2', 'capa__titulo', opciones.titulo || '');
      h.id = uid();
      dialog.setAttribute('aria-labelledby', h.id);
      cab.append(h);
      if (cerrable) cab.append(botonCerrar(false));
      const cuerpo = el('div', 'capa__cuerpo');
      if (opciones.intro) cuerpo.append(el('p', 'capa__intro', opciones.intro));
      const pie = el('footer', 'capa__pie');
      pie.hidden = true;
      new MutationObserver(() => { pie.hidden = pie.childElementCount === 0; }).observe(pie, { childList: true });
      dialog.append(cab, cuerpo, pie);
      if (opciones.tamano === 'sm' || opciones.tamano === 'md') dialog.classList.add('capa--' + opciones.tamano);
      montar(dialog);
      return Object.assign(base, { cuerpo, pie, titulo: h });
    }

    if (forma === 'editorial') {
      const ed = el('div', 'editorial');
      const fondo = el('div', 'editorial__fondo');
      if (opciones.fondo) {
        const img = document.createElement('img');
        img.src = opciones.fondo;
        img.alt = '';
        fondo.append(img);
      }
      const grid = el('div', 'editorial__grid');
      const izquierda = el('div', 'editorial__col');
      const info = el('div', 'editorial__col editorial__col--info');
      grid.append(izquierda, info);
      ed.append(fondo, el('div', 'editorial__velo'), grid);
      dialog.append(ed);
      if (cerrable) dialog.append(botonCerrar(true));
      montar(dialog);
      return Object.assign(base, { izquierda, info });
    }

    // edición
    const ed = el('div', 'edicion');
    const visual = el('div', 'edicion__visual');
    const halo = el('div', 'edicion__halo');
    if (opciones.halo) {
      const img = document.createElement('img');
      img.src = opciones.halo;
      img.alt = '';
      halo.append(img);
    }
    const lienzo = el('div', 'edicion__lienzo');
    const barra = el('div', 'edicion__barra');
    barra.setAttribute('role', 'toolbar');
    visual.append(halo, el('div', 'edicion__scrim'), lienzo, barra);
    const ladoWrap = el('aside', 'edicion__lado');
    const ladoCab = el('div', 'edicion__lado-cab');
    if (cerrable) ladoCab.append(botonCerrar(false));
    const pestanasEl = el('div', 'edicion__pestanas');
    pestanasEl.setAttribute('role', 'tablist');
    const paneles = [];
    const lado = el('div', 'edicion__lado-cuerpo');
    const nombres = Array.isArray(opciones.pestanas) ? opciones.pestanas : [];
    const pestana = (i) => {
      pestanasEl.querySelectorAll('[role=tab]').forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
      paneles.forEach((p, j) => { p.hidden = i !== j; });
    };
    nombres.forEach((n, i) => {
      const b = boton(n, 'edicion__pestana');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === 0));
      b.addEventListener('click', () => pestana(i));
      pestanasEl.append(b);
      const p = el('div', 'edicion__panel');
      p.setAttribute('role', 'tabpanel');
      p.hidden = i !== 0;
      paneles.push(p);
      lado.append(p);
    });
    const acciones = el('div', 'edicion__acciones');
    ladoWrap.append(ladoCab);
    if (nombres.length) ladoWrap.append(pestanasEl);
    ladoWrap.append(lado, acciones);
    ed.append(visual, ladoWrap);
    dialog.append(ed);
    montar(dialog);
    // Con pestañas, `lado` es el primer panel; los demás, `paneles[i]`.
    return Object.assign(base, { lienzo, barra, lado: nombres.length ? paneles[0] : lado, paneles, acciones, pestana });
  }

  /**
   * Confirmación sin tarjeta (reemplaza a confirm()). Resuelve true si acepta.
   *   await Capas.confirmar({ titulo, texto?, aceptar?, cancelar?, peligro? })
   */
  function confirmar(o) {
    const opciones = typeof o === 'string' ? { titulo: o } : (o || {});
    const c = abrir({ forma: 'principal', titulo: opciones.titulo || t('¿Continuar?'), tamano: 'sm', clase: 'capa--confirmar' });
    if (opciones.texto) c.cuerpo.append(el('p', 'capa__texto', opciones.texto));
    else c.cuerpo.hidden = true;
    const no = boton(opciones.cancelar || t('Cancelar'), 'btn btn-secondary');
    const si = boton(opciones.aceptar || t('Aceptar'), opciones.peligro ? 'btn btn-danger' : 'btn btn-primary');
    no.addEventListener('click', () => c.cerrar('cancelar'));
    si.addEventListener('click', () => c.cerrar('aceptar'));
    c.pie.append(no, si);
    // Lo destructivo arranca con el foco en «Cancelar»: un Enter distraído no borra.
    (opciones.peligro ? no : si).focus();
    return c.cerrada.then((r) => r === 'aceptar');
  }

  /**
   * La pregunta: vive ENCIMA de la tarjeta (o del pie) de la que habla y cuenta
   * antes de preguntar. Resuelve true si la persona acepta.
   *   await Capas.preguntar(tarjeta, { texto: '¿Borrar Maitamac?', seVa: { proyectos: 6, piezas: 18 }, queda: { cotizaciones: 2 } })
   */
  function preguntar(anfitrion, o) {
    const opciones = o || {};
    // Una sola pregunta por anfitrión: si ya hay una, esa manda.
    const previa = anfitrion.querySelector(':scope > .pregunta');
    if (previa) return Promise.resolve(false);
    anfitrion.classList.add('tiene-pregunta');
    const caja = el('div', 'pregunta');
    caja.setAttribute('role', 'alertdialog');
    caja.setAttribute('aria-modal', 'false');
    const texto = el('p', 'pregunta__texto', opciones.texto || t('¿Seguro?'));
    texto.id = uid();
    caja.setAttribute('aria-labelledby', texto.id);
    caja.append(texto);
    const seVa = frase(opciones.seVa || {});
    const queda = frase(opciones.queda || {});
    if (seVa) caja.append(el('p', 'pregunta__cuenta', seVa + ' · ' + t('se van')));
    if (queda) caja.append(el('p', 'pregunta__cuenta pregunta__cuenta--sobrevive', queda + ' · ' + t('quedan sueltos')));
    const acciones = el('div', 'pregunta__acciones');
    const no = boton(opciones.cancelar || t('Cancelar'), 'btn btn-secondary btn-sm');
    const si = boton(opciones.aceptar || t('Borrar'), 'btn btn-danger btn-sm');
    acciones.append(no, si);
    caja.append(acciones);
    anfitrion.append(caja);
    const antes = document.activeElement;
    no.focus();
    return new Promise((res) => {
      const fin = (v) => {
        caja.remove();
        anfitrion.classList.remove('tiene-pregunta');
        if (antes && typeof antes.focus === 'function' && document.contains(antes)) antes.focus();
        res(v);
      };
      no.addEventListener('click', () => fin(false));
      si.addEventListener('click', () => fin(true));
      caja.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fin(false); } });
    });
  }

  /** «6 proyectos · 18 piezas», de mayor a menor; lo que no cabe se cuenta. */
  function frase(cuenta, tope) {
    const max = typeof tope === 'number' ? tope : 3;
    const vivos = Object.entries(cuenta || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const dichos = vivos.slice(0, max).map(([k, n]) => n + ' ' + k);
    const resto = vivos.length - dichos.length;
    return dichos.join(' · ') + (resto > 0 ? ' +' + resto : '');
  }

  /** Aviso efímero (reemplaza a alert()): el toast ÚNICO de la plataforma. */
  function avisar(mensaje, o) {
    if (typeof window.showToast === 'function') return window.showToast(mensaje, o);
    console.warn('Capas.avisar sin toast cargado:', mensaje);
    return { close() { /* sin toast no hay nada que cerrar */ } };
  }

  window.Capas = { abrir, confirmar, preguntar, frase, avisar };
})();
