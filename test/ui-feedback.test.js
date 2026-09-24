/**
 * Sistema de feedback (L4): capas (js/ui/capas.js), estado (js/ui/estado.js) y la
 * guardia — nada de modales ni toasts ni diálogos del navegador fuera de js/ui.
 * Hermético: un DOM mínimo falso con lo que usan las capas (<dialog> incluido).
 */
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── DOM mínimo ────────────────────────────────────────────────────────────
class Nodo {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.oyentes = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.open = false;
    const self = this;
    this.classList = {
      add: (...c) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); self.className = [...s].join(' '); },
      remove: (...c) => { self.className = self.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  get childElementCount() { return this.children.length; }
  append(...ns) {
    for (const n of ns) { n.parentNode = this; this.children.push(n); }
    for (const o of Nodo.observadores) if (o.nodo === this) o.fn();
  }
  remove() {
    if (!this.parentNode) return;
    const p = this.parentNode;
    p.children = p.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(tipo, fn) { (this.oyentes[tipo] ||= []).push(fn); }
  removeEventListener(tipo, fn) { this.oyentes[tipo] = (this.oyentes[tipo] || []).filter((f) => f !== fn); }
  disparar(tipo, extra = {}) {
    const e = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    for (const fn of this.oyentes[tipo] || []) fn(e);
    return e;
  }
  todos() { return this.children.flatMap((c) => [c, ...c.todos()]); }
  querySelector(sel) {
    if (sel.startsWith(':scope > .')) {
      const c = sel.slice(10);
      return this.children.find((n) => n.classList.contains(c)) || null;
    }
    const tags = sel.split(',').map((s) => s.trim()).filter((s) => /^[a-z]+$/.test(s));
    return this.todos().find((n) => tags.includes(n.tagName.toLowerCase())) || null;
  }
  querySelectorAll(sel) {
    if (sel === '[role=tab]') return this.todos().filter((n) => n.attrs.role === 'tab');
    return [];
  }
  contains(n) { return n === this || this.todos().includes(n); }
  focus() { documento.activeElement = this; }
  showModal() { this.open = true; }
  close(r) { this.open = false; this.returnValue = r; }
  getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 400 }; }
}
Nodo.observadores = [];

let documento;
function nuevoDocumento() {
  documento = {
    body: new Nodo('body'),
    activeElement: null,
    createElement: (tag) => new Nodo(tag),
    contains: (n) => documento.body.contains(n),
  };
  return documento;
}

const buscar = (raiz, clase) => raiz.todos().find((n) => n.classList.contains(clase));
const buscarTodos = (raiz, clase) => raiz.todos().filter((n) => n.classList.contains(clase));
const esperar = () => new Promise((r) => setTimeout(r, 0));

let Capas;
let Estado;
beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.matchMedia = () => ({ matches: true }); // reduced-motion: cierre inmediato
  globalThis.MutationObserver = class {
    constructor(fn) { this.fn = fn; }
    observe(nodo) { Nodo.observadores.push({ nodo, fn: this.fn }); }
  };
  globalThis.document = nuevoDocumento();
  new Function(fs.readFileSync('js/ui/capas.js', 'utf8'))();
  new Function(fs.readFileSync('js/ui/estado.js', 'utf8'))();
  Capas = globalThis.window.Capas;
  Estado = globalThis.window.Estado;
});
beforeEach(() => { globalThis.document = nuevoDocumento(); Nodo.observadores = []; });

// ── Capas ────────────────────────────────────────────────────────────────
describe('Capas.abrir', () => {
  test('principal: dialog modal con título, cuerpo, pie oculto hasta tener hijos', () => {
    const c = Capas.abrir({ forma: 'principal', titulo: 'Adjuntar producto' });
    expect(c.dialog.tagName).toBe('DIALOG');
    expect(c.dialog.open).toBe(true);
    expect(c.dialog.classList.contains('capa--principal')).toBe(true);
    expect(buscar(c.dialog, 'capa__titulo').textContent).toBe('Adjuntar producto');
    expect(c.dialog.getAttribute('aria-labelledby')).toBe(buscar(c.dialog, 'capa__titulo').attrs.id ?? buscar(c.dialog, 'capa__titulo').id);
    expect(c.pie.hidden).toBe(true);
    c.pie.append(document.createElement('button'));
    expect(c.pie.hidden).toBe(false);
  });

  test('Esc (cancel) cierra y resuelve «cancelar»; no cerrable lo ignora', async () => {
    const c = Capas.abrir({ forma: 'principal', titulo: 'x' });
    const e = c.dialog.disparar('cancel');
    expect(e.defaultPrevented).toBe(true);
    expect(await c.cerrada).toBe('cancelar');
    expect(c.dialog.parentNode).toBe(null);

    const fija = Capas.abrir({ forma: 'principal', titulo: 'y', cerrable: false });
    fija.dialog.disparar('cancel');
    await esperar();
    expect(fija.dialog.open).toBe(true);
    expect(buscar(fija.dialog, 'capa__cerrar')).toBeUndefined();
  });

  test('clic en el velo cierra; clic dentro de la caja no', async () => {
    const c = Capas.abrir({ forma: 'principal', titulo: 'x' });
    c.dialog.disparar('click', { clientX: 300, clientY: 200 });
    await esperar();
    expect(c.dialog.open).toBe(true);
    c.dialog.disparar('click', { clientX: 10, clientY: 10 });
    expect(await c.cerrada).toBe('cancelar');
  });

  test('cerrar(resultado) llega a cerrada y a alCerrar, una sola vez', async () => {
    let visto = 0;
    const c = Capas.abrir({ forma: 'principal', titulo: 'x', alCerrar: () => { visto++; } });
    c.cerrar('guardado');
    c.cerrar('otra');
    expect(await c.cerrada).toBe('guardado');
    expect(visto).toBe(1);
  });

  test('editorial y edición traen sus huecos', () => {
    const e = Capas.abrir({ forma: 'editorial', fondo: 'a.jpg' });
    expect(e.izquierda && e.info).toBeTruthy();
    expect(buscar(e.dialog, 'capa__cerrar--flotante')).toBeTruthy();
    const d = Capas.abrir({ forma: 'edicion', pestanas: ['Resultado', 'Briefing'] });
    expect(d.lienzo && d.barra && d.acciones).toBeTruthy();
    expect(d.paneles).toHaveLength(2);
    d.pestana(1);
    expect(d.paneles[0].hidden).toBe(true);
    expect(d.paneles[1].hidden).toBe(false);
  });

  test('una forma desconocida cae a principal', () => {
    const c = Capas.abrir({ forma: 'lateral', titulo: 'x' });
    expect(c.dialog.classList.contains('capa--principal')).toBe(true);
  });
});

describe('Capas.confirmar (reemplaza a confirm())', () => {
  test('aceptar → true; cancelar → false', async () => {
    const p = Capas.confirmar({ titulo: '¿Descartar?', aceptar: 'Descartar' });
    const dlg = document.body.children.at(-1);
    buscarTodos(dlg, 'btn').find((b) => b.textContent === 'Descartar').disparar('click');
    expect(await p).toBe(true);

    const q = Capas.confirmar('¿Salir?');
    const dlg2 = document.body.children.at(-1);
    buscar(dlg2, 'btn-secondary').disparar('click');
    expect(await q).toBe(false);
  });

  test('peligro: botón rojo y el foco arranca en Cancelar', () => {
    Capas.confirmar({ titulo: '¿Borrar?', peligro: true });
    const dlg = document.body.children.at(-1);
    expect(buscar(dlg, 'btn-danger')).toBeTruthy();
    expect(document.activeElement).toBe(buscar(dlg, 'btn-secondary'));
  });
});

describe('Capas.preguntar', () => {
  test('cuenta antes de preguntar y resuelve según el botón', async () => {
    const tarjeta = document.createElement('div');
    document.body.append(tarjeta);
    const p = Capas.preguntar(tarjeta, { texto: '¿Borrar Maitamac?', seVa: { piezas: 18, proyectos: 6 }, queda: { cotizaciones: 2 } });
    expect(tarjeta.classList.contains('tiene-pregunta')).toBe(true);
    const cuentas = buscarTodos(tarjeta, 'pregunta__cuenta').map((n) => n.textContent);
    expect(cuentas[0]).toBe('18 piezas · 6 proyectos · se van');
    expect(cuentas[1]).toBe('2 cotizaciones · quedan sueltos');
    buscar(tarjeta, 'btn-danger').disparar('click');
    expect(await p).toBe(true);
    expect(buscar(tarjeta, 'pregunta')).toBeUndefined();
    expect(tarjeta.classList.contains('tiene-pregunta')).toBe(false);
  });

  test('Escape = no; una segunda pregunta sobre la misma tarjeta no se apila', async () => {
    const tarjeta = document.createElement('div');
    const p = Capas.preguntar(tarjeta, { texto: '¿Borrar?' });
    expect(await Capas.preguntar(tarjeta, { texto: 'otra' })).toBe(false);
    buscar(tarjeta, 'pregunta').disparar('keydown', { key: 'Escape' });
    expect(await p).toBe(false);
  });

  test('frase: de mayor a menor, sin ceros, lo que no cabe se cuenta', () => {
    expect(Capas.frase({ a: 1, b: 5, c: 0, d: 3, e: 2 })).toBe('5 b · 3 d · 2 e +1');
    expect(Capas.frase({})).toBe('');
  });
});

// ── Estado ───────────────────────────────────────────────────────────────
describe('Estado', () => {
  test('escapa todo lo que recibe', () => {
    const malo = '<img src=x onerror=alert(1)>';
    for (const html of [
      Estado.vacio({ titulo: malo, texto: malo, accion: malo, accionId: '"><x' }),
      Estado.error({ titulo: malo, texto: malo }),
      Estado.todaviaNo({ titulo: malo, texto: malo }),
      Estado.enObras({ nombre: malo }),
    ]) {
      expect(html).not.toContain('<img');
      expect(html).not.toContain('"><x');
    }
  });

  test('cargando tiene la forma pedida y aria-busy', () => {
    expect(Estado.cargando('tarjetas', 4)).toMatch(/skeleton-grid--4/);
    expect((Estado.cargando('filas', 3).match(/skeleton-row/g) || []).length).toBe(3);
    expect(Estado.cargando('lo-que-sea')).toMatch(/aria-busy="true"/);
  });

  test('error ofrece reintentar salvo que se apague; vacío usa la plantilla canónica', () => {
    expect(Estado.error('Sin red')).toMatch(/data-estado="reintentar"/);
    expect(Estado.error({ texto: 'x', reintentar: false })).not.toMatch(/reintentar"/);
    expect(Estado.vacio({ titulo: 'Nada' })).toMatch(/class="empty-state /);
  });

  test('alReintentar engancha una sola vez por zona', () => {
    const zona = document.createElement('div');
    const boton = document.createElement('button');
    boton.closest = (sel) => (sel.includes('reintentar') ? boton : null);
    zona.append(boton);
    let n = 0;
    Estado.alReintentar(zona, () => { n++; });
    Estado.alReintentar(zona, () => { n++; });
    zona.disparar('click', { target: boton });
    expect(n).toBe(1);
    expect(boton.disabled).toBe(true);
  });
});

// ── Capa superior: todo lo que se abre encima vive en el top layer ────────
describe('Top layer', () => {
  const MODAL = fs.readFileSync('js/utils/modal.js', 'utf8');
  const TOAST = fs.readFileSync('js/utils/toast.js', 'utf8');
  const CSS = fs.readFileSync('css/modules/capas.css', 'utf8');
  test('window.Modal se aloja en <dialog> con showModal() y Esc por `cancel`', () => {
    expect(MODAL).toMatch(/createElement\('dialog'\)/);
    expect(MODAL).toMatch(/\.showModal\(\)/);
    expect(MODAL).toMatch(/addEventListener\('cancel'/);
    expect(MODAL).not.toMatch(/document\.addEventListener\('keydown'/);
  });
  test('el toast es popover manual y se trae al frente en cada aviso', () => {
    expect(TOAST).toMatch(/setAttribute\('popover', 'manual'\)/);
    expect(TOAST).toMatch(/alFrente\(container\)/);
    expect(CSS).toMatch(/:where\(\.toast-container\[popover\]\)/);
    expect(CSS).toMatch(/dialog\.modal \{/);
  });
});

// ── Guardia: el feedback vive en js/ui ───────────────────────────────────
function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

function medir() {
  let dialogosNavegador = 0;
  let modalesPropios = 0;
  let toastsPropios = 0;
  for (const f of archivos('js')) {
    if (f.startsWith('js/ui/')) continue;
    const s = sinComentarios(fs.readFileSync(f, 'utf8'));
    dialogosNavegador += (s.match(/(^|[^.\w$])(?:window\.)?(alert|confirm|prompt)\s*\(/g) || []).length;
    if (f !== 'js/utils/modal.js') {
      modalesPropios += (s.match(/(class=["'`]|className\s*=\s*["'`]|classList\.add\(["'`])[\w\s-]*\b[\w-]*(modal-overlay|-overlay|-modal|-drawer|-sheet)\b/g) || []).length;
    }
    if (f !== 'js/utils/toast.js') {
      toastsPropios += (s.match(/(class=["'`]|className\s*=\s*["'`])[\w\s-]*\btoast\b/g) || []).length;
    }
  }
  return { dialogosNavegador, modalesPropios, toastsPropios };
}

// Medido el 24/09/2026 (79 tras el piloto del catálogo). Solo BAJAN; la meta de L4 es 0 en los tres.
const TOPES = { dialogosNavegador: 79, modalesPropios: 149, toastsPropios: 0 };

describe('Guardia: modales, toasts y diálogos solo en js/ui', () => {
  const hoy = medir();
  for (const [clave, tope] of Object.entries(TOPES)) {
    test(`${clave} ≤ ${tope}`, () => {
      expect(hoy[clave], `${clave} subió a ${hoy[clave]} (tope ${tope}): usa window.Capas / Estado / showToast`).toBeLessThanOrEqual(tope);
    });
  }
});
