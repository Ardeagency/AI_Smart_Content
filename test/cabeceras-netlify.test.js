/**
 * Guardia de cabeceras (lista de cierre H4): la CSP tiene que ir en la regla `/*`.
 * En `main` solo estaba en `/*.html` e `/index.html`, y las rutas de la SPA (`/`,
 * `/login`, `/org/...`, reescritas a index.html) salían SIN CSP — medido con curl
 * el 24/09 contra console.aismartcontent.io.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';

const toml = fs.readFileSync('netlify.toml', 'utf8');

/** Bloques [[headers]] → { for, cuerpo }. */
const bloques = toml.split(/^\[\[headers\]\]\s*$/m).slice(1).map((b) => ({
  for: (b.match(/^\s*for\s*=\s*"([^"]+)"/m) || [])[1],
  cuerpo: b.split(/^\[\[/m)[0],
}));

describe('Cabeceras de seguridad en netlify.toml', () => {
  const todo = bloques.find((b) => b.for === '/*');

  test('existe la regla /*', () => { expect(todo).toBeTruthy(); });

  for (const cab of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy']) {
    test(`${cab} va en /*`, () => { expect(todo.cuerpo).toMatch(new RegExp(`^\\s*${cab}\\s*=`, 'm')); });
  }

  test('la CSP no conecta con la base vieja', () => {
    expect(todo.cuerpo).not.toMatch(/tsdpbqcwjckbfsdqacam/);
  });

  test('ninguna otra regla redefine la CSP', () => {
    const otras = bloques.filter((b) => b.for !== '/*' && /Content-Security-Policy/.test(b.cuerpo)).map((b) => b.for);
    expect(otras).toEqual([]);
  });
});
