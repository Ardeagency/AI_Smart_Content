/**
 * Transiciones de página (js/ui/transiciones.js): gana la última navegación, los
 * datos no congelan la pintura, sin API o con reduced-motion se cambia directo, y
 * la clase/tipo del <html> solo viven mientras dura la transición.
 * Hermético: document/window falsos con la semántica de la View Transitions API.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

const FUENTE = fs.readFileSync('js/ui/transiciones.js', 'utf8');
const CSS = fs.readFileSync('css/modules/transiciones.css', 'utf8');

let crear;
beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  new Function(FUENTE)();
  crear = globalThis.window.crearTransiciones;
});

function listaDeClases() {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
}

function elemento() {
  const attrs = new Map();
  return {
    classList: listaDeClases(),
    offsetHeight: 0,
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  };
}

/** Entorno falso. `api: false` = navegador sin View Transitions. */
function entorno({ api = true, reducido = false } = {}) {
  const html = elemento();
  const contenedor = elemento();
  const transiciones = [];
  const document = {
    documentElement: html,
    getElementById: (id) => (id === 'app-container' ? contenedor : null),
  };
  if (api) {
    // Semántica de la spec: el callback corre en un microtask, updateCallbackDone
    // refleja su promesa, y skipTransition termina la animación sin cancelarlo.
    document.startViewTransition = (update) => {
      let terminar;
      const finished = new Promise((r) => { terminar = r; });
      const updateCallbackDone = Promise.resolve().then(() => update());
      const vt = {
        update,
        saltada: false,
        updateCallbackDone,
        ready: updateCallbackDone.then(() => {}),
        finished,
        skipTransition() { vt.saltada = true; terminar(); },
        terminar: () => terminar(),
      };
      updateCallbackDone.catch(() => {});
      transiciones.push(vt);
      return vt;
    };
  }
  const window = {
    matchMedia: (q) => ({ matches: reducido && q.includes('reduce') }),
  };
  return { html, contenedor, transiciones, t: crear({ document, window }) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Contrato', () => {
  test('exige cambiar()', async () => {
    const { t } = entorno();
    await expect(t({})).rejects.toThrow(/cambiar/);
  });

  test('expone esqueleto() con aria-busy', () => {
    const { t } = entorno();
    expect(t.esqueleto()).toMatch(/aria-busy="true"/);
  });
});

describe('Con View Transitions', () => {
  test('anima, marca el tipo y limpia al terminar', async () => {
    const { t, html, transiciones } = entorno();
    let cambio = 0;
    const nav = await t({ tipo: 'atras', cambiar: () => { cambio++; } });
    expect(cambio).toBe(1);
    expect(nav.animada).toBe(true);
    expect(nav.vigente()).toBe(true);
    expect(html.classList.contains('vt-contenido')).toBe(true);
    expect(html.getAttribute('data-vt-tipo')).toBe('atras');
    transiciones[0].terminar();
    await tick();
    expect(html.classList.contains('vt-contenido')).toBe(false);
    expect(html.getAttribute('data-vt-tipo')).toBe(null);
  });

  test('un tipo desconocido cae a adelante', async () => {
    const { t, html } = entorno();
    await t({ tipo: 'lateral', cambiar: () => {} });
    expect(html.getAttribute('data-vt-tipo')).toBe('adelante');
  });

  test('gana la última: salta la anterior y la deja no vigente', async () => {
    const { t, html, transiciones } = entorno();
    let soltar;
    const lenta = new Promise((r) => { soltar = r; });
    const primera = t({ tipo: 'adelante', cambiar: () => lenta });
    await tick();
    const segunda = await t({ tipo: 'atras', cambiar: () => {} });
    expect(transiciones[0].saltada).toBe(true);
    soltar();
    const nav1 = await primera;
    expect(nav1.vigente()).toBe(false);
    expect(segunda.vigente()).toBe(true);
    // La primera terminó (skip) pero la clase y el tipo son de la segunda.
    await tick();
    expect(html.classList.contains('vt-contenido')).toBe(true);
    expect(html.getAttribute('data-vt-tipo')).toBe('atras');
  });

  test('el error del cambio llega al router', async () => {
    const { t } = entorno();
    await expect(t({ cambiar: () => { throw new Error('vista rota'); } })).rejects.toThrow('vista rota');
  });

  test('un TimeoutError de la transición no pierde el cambio', async () => {
    // Navegador que corre el callback pero rechaza todo por timeout (callback > ~4 s).
    const t = crear({
      document: {
        documentElement: elemento(),
        getElementById: () => null,
        startViewTransition(update) {
          update();
          const timeout = Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' }));
          timeout.catch(() => {});
          return { updateCallbackDone: timeout, ready: timeout, finished: timeout, skipTransition() {} };
        },
      },
      window: { matchMedia: () => ({ matches: false }) },
    });
    let listo = false;
    const nav = await t({ cambiar: async () => { await tick(); listo = true; } });
    expect(listo).toBe(true);
    expect(nav.vigente()).toBe(true);
  });

  test('los datos NO van dentro: la transición termina aunque la vista cargue después', async () => {
    const { t } = entorno();
    const orden = [];
    const nav = await t({ cambiar: () => { orden.push('esqueleto'); } });
    if (nav.vigente()) orden.push('render con datos');
    expect(orden).toEqual(['esqueleto', 'render con datos']);
  });
});

describe('Sin animación', () => {
  test('sin API: cambia directo y relanza el fade de respaldo', async () => {
    const { t, contenedor, html } = entorno({ api: false });
    let cambio = 0;
    const nav = await t({ cambiar: () => { cambio++; } });
    expect(cambio).toBe(1);
    expect(nav.animada).toBe(false);
    expect(contenedor.classList.contains('route-fade-in')).toBe(true);
    expect(html.classList.contains('vt-contenido')).toBe(false);
  });

  test('reduced-motion: no usa la API ni el fade', async () => {
    const { t, contenedor, transiciones } = entorno({ reducido: true });
    const nav = await t({ cambiar: () => {} });
    expect(nav.animada).toBe(false);
    expect(transiciones.length).toBe(0);
    expect(contenedor.classList.contains('route-fade-in')).toBe(false);
  });
});

describe('CSS', () => {
  test('el cascarón no se anima y solo el contenido lleva nombre', () => {
    expect(CSS).toMatch(/:root::view-transition-old\(root\)\s*\{\s*display:\s*none/);
    expect(CSS).toMatch(/:root::view-transition-new\(root\)\s*\{\s*animation:\s*none/);
    expect(CSS).toMatch(/html\.vt-contenido #app-container\s*\{\s*view-transition-name:\s*contenido/);
  });

  test('usa los tokens de movimiento y respeta reduced-motion', () => {
    expect(CSS).toMatch(/var\(--duracion-media\)/);
    expect(CSS).toMatch(/var\(--curva-estandar\)/);
    expect(CSS).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  test('sin !important ni hex', () => {
    expect(CSS).not.toMatch(/!important/);
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
