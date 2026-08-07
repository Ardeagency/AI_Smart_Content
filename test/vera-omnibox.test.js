/**
 * El omnibox `@` del chat de Vera: que encuentre lo que uno busca.
 *
 * La parte visual se ve mirando; lo que no se ve es el criterio — qué cuenta
 * como `@` en curso (y qué no, para no capturar un correo), y en qué orden
 * salen las coincidencias. Con "wake" el producto WAKEUP tiene que ir antes que
 * "Campaña de wake": si el primer resultado no es el obvio, el atajo no sirve.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/views/VeraView.js'), 'utf8');

function cargar() {
  const win = { BaseView: class {}, location: { protocol: 'https:', origin: 'https://x' } };
  globalThis.window = win;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  new Function(FUENTE)();
  return win.VeraView;
}

const VeraView = cargar();
const v = {
  _normalizar: VeraView.prototype._normalizar,
  _puntuarCoincidencia: VeraView.prototype._puntuarCoincidencia,
  _filtrarCandidatos: VeraView.prototype._filtrarCandidatos,
  _tokenArroba: VeraView.prototype._tokenArroba,
};

const items = (...nombres) => nombres.map((name, i) => ({ id: `id${i}`, name, kind: 'product' }));

describe('qué cuenta como un `@` en curso', () => {
  test('la arroba al principio del mensaje abre el buscador', () => {
    expect(v._tokenArroba('@wake', 5)).toEqual({ desde: 0, hasta: 5, query: 'wake' });
  });

  test('la arroba después de un espacio también', () => {
    const t = v._tokenArroba('mira esto @wake', 15);
    expect(t.query).toBe('wake');
    expect(t.desde).toBe(10);
  });

  test('un correo NO abre el buscador', () => {
    // "info@ardeagency.com": la arroba va pegada a una letra, no abre palabra.
    expect(v._tokenArroba('escribe a info@ardeagency', 25)).toBeNull();
  });

  test('al poner un espacio, el `@` deja de estar en curso', () => {
    expect(v._tokenArroba('@wake up', 8)).toBeNull();
  });

  test('sin arroba, nada', () => {
    expect(v._tokenArroba('hola', 4)).toBeNull();
    expect(v._tokenArroba('', 0)).toBeNull();
  });

  test('solo cuenta lo que hay ANTES del cursor', () => {
    // Cursor en medio: lo tecleado es "wa", no "wake".
    expect(v._tokenArroba('@wake', 3).query).toBe('wa');
  });
});

describe('el orden de las coincidencias', () => {
  test('primero lo que empieza por lo escrito', () => {
    const r = v._filtrarCandidatos(items('Campaña de wake', 'WAKEUP Refresh'), 'wake');
    expect(r[0].name).toBe('WAKEUP Refresh');
  });

  test('después lo que empieza una palabra, y al final lo que solo lo contiene', () => {
    const r = v._filtrarCandidatos(items('Rewake total', 'Plan wake anual', 'Wake Refresh'), 'wake');
    expect(r.map((x) => x.name)).toEqual(['Wake Refresh', 'Plan wake anual', 'Rewake total']);
  });

  test('encuentra sin tildes y sin mayúsculas', () => {
    const r = v._filtrarCandidatos(items('Café de origen'), 'cafe');
    expect(r).toHaveLength(1);
  });

  test('lo que no coincide no aparece', () => {
    expect(v._filtrarCandidatos(items('Producto A', 'Producto B'), 'zzz')).toHaveLength(0);
  });

  test('sin nada escrito, muestra los primeros sin filtrar', () => {
    expect(v._filtrarCandidatos(items('A', 'B', 'C'), '')).toHaveLength(3);
  });

  test('la lista se corta: un desplegable de 300 filas no es un atajo', () => {
    const muchos = items(...Array.from({ length: 50 }, (_, i) => `Producto ${i}`));
    expect(v._filtrarCandidatos(muchos, 'producto')).toHaveLength(8);
  });
});

describe('los tipos adjuntables no se escriben dos veces', () => {
  test('el parseo de chips deriva los tipos en vez de listarlos a mano', () => {
    // El bug latente: una segunda lista escrita a mano se queda vieja al añadir
    // un tipo, y el chip vuelve del historial como "Dato" genérico.
    const fn = FUENTE.slice(FUENTE.indexOf('_parseLibraryContext(content) {'));
    expect(fn.slice(0, fn.indexOf('\n  }'))).toContain('this._libKinds()');
  });

  test('estrategia, producción y flujo están en la lista de tipos', () => {
    const fn = FUENTE.slice(FUENTE.indexOf('_libKinds() {'));
    const cuerpo = fn.slice(0, fn.indexOf('\n  }'));
    for (const k of ['strategy', 'production', 'flow']) expect(cuerpo).toContain(`'${k}'`);
  });
});
