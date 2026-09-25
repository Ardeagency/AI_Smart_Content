/**
 * Lo que la app carga de otros orígenes tiene que estar permitido por la CSP de producción
 * (netlify.toml, regla /*). Si no, el navegador lo bloquea y la consola lo muestra en rojo
 * (producción, 25/09: el SDK de connect.facebook.net y ipapi.co de arde-sentinel).
 * La regla: se quita lo que no se usa; la CSP no se amplía para que quepa.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { leerReglas, cabecerasPara } from '../scripts/cabeceras-netlify.mjs';

const CSP = cabecerasPara(leerReglas(fs.readFileSync('netlify.toml', 'utf8')), '/')['Content-Security-Policy'];
const directiva = (n) => (CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith(n + ' ')) || '').split(/\s+/).slice(1);
const origen = (u) => new URL(u).origin;

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir)) {
    const f = path.join(dir, e);
    if (fs.statSync(f).isDirectory()) archivos(f, acc); else if (e.endsWith('.js')) acc.push(f);
  }
  return acc;
}
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const JS = archivos('js').map((f) => [f, sinComentarios(fs.readFileSync(f, 'utf8'))]);
const INDEX = fs.readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('CSP: lo que se carga de fuera está permitido', () => {
  test('cada <script src> externo de index.html está en script-src', () => {
    const permitidos = directiva('script-src');
    for (const m of INDEX.matchAll(/<script[^>]+src="(https:\/\/[^"]+)"/g)) expect(permitidos, m[1]).toContain(origen(m[1]));
  });

  test('ningún script de js/ inyecta un <script> de un origen fuera de script-src', () => {
    const permitidos = directiva('script-src');
    for (const [f, src] of JS) {
      for (const m of src.matchAll(/\.src\s*=\s*['"`](https:\/\/[^'"`/]+)/g)) {
        if (!/createElement\(/.test(src)) continue; // createElement('script') o con variable, como el SDK de FB
        expect(permitidos, `${f}: ${m[1]}`).toContain(origen(m[1]));
      }
    }
  });

  test('el login no usa Cloudinary ni el storage del proyecto viejo (poster 401, 25/09)', () => {
    const signin = sinComentarios(fs.readFileSync('js/views/SignInView.js', 'utf8'));
    expect(signin).not.toMatch(/cloudinary|tsdpbqcwjckbfsdqacam|poster=/);
  });

  test('cada <link rel="preconnect"> de index.html apunta a un origen que la CSP deja usar', () => {
    const usables = new Set([...directiva('connect-src'), ...directiva('script-src'), ...directiva('font-src'), ...directiva('style-src')]);
    for (const m of INDEX.matchAll(/<link rel="preconnect" href="(https:\/\/[^"]+)"/g)) expect([...usables], m[1]).toContain(origen(m[1]));
  });

  test('no queda el SDK de Facebook', () => {
    for (const [f, src] of JS) expect(src, f).not.toMatch(/connect\.facebook\.net|FB\.init\(/);
  });
});
