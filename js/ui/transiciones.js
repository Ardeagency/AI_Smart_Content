/**
 * Transiciones de página — el único gancho que el router usa para cambiar de vista.
 *
 *   const nav = await window.transicion({
 *     tipo: 'adelante',                      // 'adelante' | 'atras' | 'suave'
 *     cambiar: () => {                       // SOLO DOM, sincrónico o casi:
 *       prevView.destroy();                  //   destruir la vista vieja,
 *       pintarEsqueleto(container);          //   pintar transicion.esqueleto(),
 *       window.scrollTo(0, 0);               //   y subir el scroll.
 *     },
 *   });
 *   if (!nav.vigente()) return;              // llegó otra navegación: no seguir
 *   await nuevaVista.render();               // los DATOS van FUERA de la transición
 *
 * Por qué así (24/09, diagnóstico sobre b06fc898):
 * - Mientras corre el callback de startViewTransition el navegador CONGELA la
 *   pintura. Si ahí adentro se espera `init()` (fetch), la página se queda quieta
 *   hasta que llegan los datos y a los ~4 s salta TimeoutError con corte en seco.
 *   Por eso `cambiar` solo toca el DOM; la carga sigue después.
 * - Gana la última navegación: cada llamada toma un turno, salta (skipTransition)
 *   la animación anterior y deja `vigente() === false` al flujo viejo para que no
 *   pinte encima de la vista nueva.
 * - Solo se anima #app-container (nombre `contenido`, puesto SOLO mientras dura:
 *   view-transition-name crea un backdrop root que rompería el backdrop-filter del
 *   cascarón). El cascarón (sidebar + topbar) no se mueve. Estilos en
 *   css/modules/transiciones.css.
 * - Sin API, o con prefers-reduced-motion: cambio directo (+ .route-fade-in si
 *   hay movimiento permitido).
 */
(function () {
  'use strict';

  const CLASE = 'vt-contenido';
  const ATRIBUTO_TIPO = 'data-vt-tipo';
  const TIPOS = ['adelante', 'atras', 'suave'];
  const FADE = 'route-fade-in';

  function crearTransiciones(entorno) {
    const doc = entorno.document;
    const win = entorno.window;
    let turno = 0;
    let enCurso = null;

    function sinMovimiento() {
      try {
        return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (_) {
        return false;
      }
    }

    function reproducirFade(contenedor) {
      if (!contenedor || !contenedor.classList) return;
      contenedor.classList.remove(FADE);
      void contenedor.offsetHeight; // reflow: relanza la animación aunque la clase ya estuviera
      contenedor.classList.add(FADE);
    }

    async function transicion(opciones) {
      const { cambiar, tipo = 'adelante', contenedor, sinAnimacion = false } = opciones || {};
      if (typeof cambiar !== 'function') throw new TypeError('transicion: falta cambiar()');

      const mio = ++turno;
      const vigente = () => mio === turno;
      const tipoFinal = TIPOS.includes(tipo) ? tipo : 'adelante';

      // Gana la última: la animación anterior salta a su final (su DOM ya cambió o
      // cambiará igual: skipTransition no cancela el callback, solo la animación).
      if (enCurso) {
        const previa = enCurso;
        enCurso = null;
        try { previa.skipTransition(); } catch (_) { /* ya había terminado */ }
      }

      // sinAnimacion: el cambio va directo (p. ej. al entrar o salir de una vista
      // inmersiva, donde el shell cambia de forma: una foto vieja con el sidebar ya
      // contraído es justo el «desorden» de iconos que se veía).
      if (sinAnimacion) {
        await cambiar({ vigente });
        return { vigente, animada: false };
      }

      const reducido = sinMovimiento();
      // View Transitions queda APAGADA por defecto (25/09): medido cuadro a cuadro, el
      // mismo cambio se ve a los 55–370 ms con cambio directo + fundido CSS y a ~740 ms
      // con la API (la captura es un cuadro largo que congela la página). Se prueba
      // encendiendo window.AISC_VIEW_TRANSITIONS = true.
      const conApi = typeof doc.startViewTransition === 'function' && !reducido && !!(win && win.AISC_VIEW_TRANSITIONS === true);

      if (!conApi) {
        await cambiar({ vigente });
        if (vigente() && !reducido) {
          reproducirFade(contenedor || doc.getElementById('app-container'));
        }
        return { vigente, animada: false };
      }

      const raiz = doc.documentElement;
      raiz.classList.add(CLASE);
      raiz.setAttribute(ATRIBUTO_TIPO, tipoFinal);

      // Nuestra propia promesa del cambio: la verdad sobre si el DOM ya cambió y si
      // falló, independiente de lo que haga la transición (timeout, skip).
      let hecho = null;
      const update = () => {
        hecho = Promise.resolve().then(() => cambiar({ vigente }));
        return hecho;
      };

      let vt;
      try {
        vt = doc.startViewTransition(update);
      } catch (e) {
        raiz.classList.remove(CLASE);
        raiz.removeAttribute(ATRIBUTO_TIPO);
        await cambiar({ vigente });
        return { vigente, animada: false };
      }
      enCurso = vt;

      // Sin estos, un timeout o un skip dejan "Uncaught (in promise)" en consola.
      vt.ready.catch(() => {});
      const limpiar = () => {
        if (enCurso === vt) enCurso = null;
        // Si ya arrancó otra, la clase y el tipo son de ELLA: no quitarlos.
        if (vigente()) {
          raiz.classList.remove(CLASE);
          raiz.removeAttribute(ATRIBUTO_TIPO);
        }
      };
      vt.finished.then(limpiar, limpiar);

      try {
        await vt.updateCallbackDone;
      } catch (e) {
        // TimeoutError (o skip): la animación se perdió, pero el cambio sigue su
        // curso. Si el cambio mismo falló, ese es el error que importa.
        if (!hecho) throw e;
      }
      if (hecho) await hecho;
      // Esperar la CAPTURA del estado nuevo (vt.ready) antes de devolver: lo que el
      // router hace después (el render de la vista, que es pesado y sincrónico en
      // parte) retrasaba la captura y la página vieja quedaba congelada 0,5–1,9 s
      // (diagnóstico de navegación, 25/09). Tope de 300 ms por si ready nunca llega.
      const espera = (win && typeof win.setTimeout === 'function') ? win.setTimeout.bind(win) : setTimeout;
      const capturada = await Promise.race([
        vt.ready.then(() => true, () => true),
        new Promise((r) => espera(() => r(false), 300)),
      ]);
      // Si la captura no llegó a tiempo, se suelta la transición: mejor el estado
      // nuevo sin animar que la página congelada (y así nunca queda atascada una
      // transición detrás de la siguiente navegación: re-medición 25/09, N1).
      if (!capturada) { try { vt.skipTransition(); } catch (_) { /* ya terminó */ } }
      return { vigente, animada: true };
    }

    transicion.esqueleto = esqueleto;
    return transicion;
  }

  /** Esqueleto genérico del contenido (clases .skeleton* de bundle.css). */
  function esqueleto() {
    return (
      '<div class="vt-esqueleto" aria-busy="true" aria-label="Cargando">' +
        '<div class="skeleton skeleton-text skeleton-text--lg skeleton-text--w35"></div>' +
        '<div class="skeleton-grid skeleton-grid--3">' +
          '<div class="skeleton skeleton-card"></div>' +
          '<div class="skeleton skeleton-card"></div>' +
          '<div class="skeleton skeleton-card"></div>' +
        '</div>' +
        '<div class="skeleton skeleton-block"></div>' +
        '<div class="skeleton skeleton-block"></div>' +
      '</div>'
    );
  }

  const raiz = typeof window !== 'undefined' ? window : globalThis;
  raiz.crearTransiciones = crearTransiciones;
  if (raiz.document) raiz.transicion = crearTransiciones({ document: raiz.document, window: raiz });
})();
