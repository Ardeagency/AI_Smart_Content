// @vitest-environment jsdom
/**
 * Estado.pintar (js/ui/estado.js) con un parser HTML REAL (jsdom): es la única vía por la que
 * las vistas asignan HTML (L7, 24/09). Documenta lo que hace igual que innerHTML y lo que NO soporta.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/ui/estado.js'), 'utf8');
let pintar;

beforeAll(() => {
  new Function(FUENTE)();
  pintar = window.Estado.pintar;
});

const zona = (tag = 'div') => document.body.appendChild(document.createElement(tag));

describe('Estado.pintar con un parser real', () => {
  test('reemplaza el contenido, no lo añade', () => {
    const z = zona();
    pintar(z, '<p>uno</p>');
    pintar(z, '<p>dos</p>');
    expect(z.innerHTML).toBe('<p>dos</p>');
  });

  test('null/undefined vacían la zona; sin zona no hace nada', () => {
    const z = zona();
    pintar(z, '<p>x</p>');
    pintar(z, null);
    expect(z.childNodes.length).toBe(0);
    expect(() => pintar(null, '<p>x</p>')).not.toThrow();
  });

  test('<option> dentro de un <select> sobrevive (igual que innerHTML)', () => {
    const s = zona('select');
    pintar(s, '<option value="a">A</option><option value="b" selected>B</option>');
    expect(s.options.length).toBe(2);
    expect(s.value).toBe('b');
  });

  test('un comentario inicial se queda en la zona (antes se iba al documento)', () => {
    const z = zona();
    pintar(z, '<!-- vista --><section>hola</section>');
    expect(z.firstChild.nodeType).toBe(window.Node.COMMENT_NODE);
    expect(z.querySelector('section').textContent).toBe('hola');
  });

  test('<style> inicial se queda en la zona, no se va al <head>', () => {
    const z = zona();
    const antes = document.head.childNodes.length;
    pintar(z, '<style>.x{color:red}</style><p class="x">x</p>');
    expect(z.querySelector('style')).not.toBeNull();
    expect(document.head.childNodes.length).toBe(antes);
  });

  test('<script> queda INERTE: se inserta pero no corre', () => {
    const z = zona();
    window.__corrio = false;
    pintar(z, '<p>a</p><script>window.__corrio = true;</script>');
    expect(z.querySelector('script')).not.toBeNull();
    expect(window.__corrio).toBe(false);
  });

  test('lo escapado se queda como texto', () => {
    const z = zona();
    pintar(z, '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(z.querySelector('img')).toBeNull();
    expect(z.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  // NO SOPORTADO, a propósito: el contexto de parseo es un <body>, no la zona. Las filas sueltas
  // se pierden (innerHTML en un <tbody> sí las crearía). Para filas: pintar la <table> entera.
  test('NO sirve para filas sueltas: <tr>/<td> en un <tbody> se pierden', () => {
    const tb = zona('table').appendChild(document.createElement('tbody'));
    pintar(tb, '<tr><td>1</td></tr>');
    expect(tb.querySelector('tr')).toBeNull();
    expect(tb.textContent).toBe('1');
  });

  test('la tabla ENTERA sí funciona', () => {
    const z = zona();
    pintar(z, '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>');
    expect(z.querySelectorAll('tr').length).toBe(2);
  });
});
