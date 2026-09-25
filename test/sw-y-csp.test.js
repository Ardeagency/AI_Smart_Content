/**
 * El Service Worker y la CSP (25/09): el SW interceptaba cdn.jsdelivr.net, y /sw.js se servía
 * con una CSP cuyo connect-src no lo incluía. Su fetch() moría, supabase-js no cargaba en la
 * 2.ª visita y la consola no arrancaba en producción. Esta clase de bug no vuelve:
 *   - el SW solo toca el MISMO origen;
 *   - todo origen del que la página carga scripts está también en connect-src;
 *   - servir-local sirve las cabeceras reales de netlify.toml (así el fallo se ve en local);
 *   - app-loader se rescata una vez si la librería no llega bajo un SW.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import { leerReglas, cabecerasPara } from '../scripts/cabeceras-netlify.mjs';

const SW = fs.readFileSync('sw.js', 'utf8');
const REGLAS = leerReglas(fs.readFileSync('netlify.toml', 'utf8'));
const csp = (ruta) => cabecerasPara(REGLAS, ruta)['Content-Security-Policy'] || '';
const directiva = (c, nombre) => (c.split(';').map((d) => d.trim()).find((d) => d.startsWith(nombre + ' ')) || '').split(/\s+/).slice(1);

describe('Service Worker: solo el mismo origen', () => {
  const manejador = SW.slice(SW.indexOf("self.addEventListener('fetch'"));

  test('el manejador de fetch sale antes de tocar cualquier otro origen', () => {
    const corte = manejador.indexOf('if (!isAppOrigin(url)) return;');
    expect(corte).toBeGreaterThan(-1);
    expect(corte).toBeLessThan(manejador.indexOf('respondWith'));
  });

  test('no quedan ramas para CDN, imágenes remotas ni Supabase', () => {
    const codigo = SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/jsdelivr|cloudinary|supabase\.co/);
  });
});

describe('CSP servida con /sw.js y con la SPA', () => {
  test('/sw.js recibe la CSP (es la que obedece el SW)', () => {
    expect(csp('/sw.js')).toMatch(/connect-src/);
  });

  test('todo origen de script-src está también en connect-src', () => {
    for (const ruta of ['/', '/sw.js', '/org/x/y/dashboard']) {
      const c = csp(ruta);
      const conectar = directiva(c, 'connect-src');
      const externos = directiva(c, 'script-src').filter((o) => /^https:\/\//.test(o));
      expect(externos.length).toBeGreaterThan(0);
      for (const o of externos.filter((x) => x !== 'https://challenges.cloudflare.com')) expect(conectar, `${ruta}: ${o}`).toContain(o);
    }
  });
});

describe('cabeceras-netlify: lectura de netlify.toml', () => {
  test('lee las reglas y aplica las que encajan, con * como comodín', () => {
    expect(REGLAS.length).toBeGreaterThan(3);
    expect(cabecerasPara(REGLAS, '/org/a/b/vera')['X-Frame-Options']).toBe('DENY');
    expect(cabecerasPara(REGLAS, '/.netlify/functions/x')['Cache-Control']).toBe('no-store');
  });

  test('servir-local las usa por defecto', () => {
    const local = fs.readFileSync('scripts/servir-local.mjs', 'utf8');
    expect(local).toMatch(/leerReglas\(readFileSync\(join\(ROOT, 'netlify\.toml'\)/);
    expect(local).toMatch(/--sin-cabeceras/);
  });
});

describe('app-loader: rescate de un SW viejo', () => {
  const loader = fs.readFileSync('js/app-loader.js', 'utf8');
  test('si la librería no llega bajo un SW, lo retira y recarga UNA vez', () => {
    expect(loader).toMatch(/navigator\.serviceWorker\?\.controller/);
    expect(loader).toMatch(/sessionStorage\.getItem\('aisc-rescate-sw'\)/);
    expect(loader).toMatch(/r\.unregister\(\)/);
  });
});
