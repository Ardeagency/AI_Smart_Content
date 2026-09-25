/**
 * i18n (modelo «español como clave»): toda clave que la UI pide con __('…') o con un alias
 * `const t = (…) => … window.__` (Estado, Capas, Avisos, LecturaVera) tiene que existir en
 * js/i18n/en.js. Un valor "" cae al español, así que para el inglés cuenta como sin traducir.
 *
 * - Los archivos PULIDOS (shell, ajustes, acceso, Estado/Capas, Vera, avisos) van a cero:
 *   texto nuevo sin clave traducida no entra.
 * - El resto va por ratchet: faltantes y vacías solo bajan.
 * - Una traducción no puede perder ni inventar placeholders {x}.
 * Para añadir claves: scripts/i18n-extract.mjs (o insertar a mano entre I18N:BEGIN y I18N:END).
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TOPE = { faltantes: 124, vacias: 923 };
const PULIDOS = [
  'js/shell/Shell.js', 'js/ui/estado.js', 'js/ui/capas.js', 'js/components/Avisos.js', 'js/components/LecturaVera.js',
  'js/views/ConfiguracionView.js', 'js/views/ajustes-pestanas.js', 'js/views/OrganizationView.js', 'js/views/IntegracionesView.js',
  'js/views/CuentaView.js', 'js/views/InvitacionView.js', 'js/views/MfaView.js', 'js/views/PaginaEstadoView.js',
  'js/views/EnObrasView.js', 'js/views/PlanesView.js', 'js/views/CreditsShopView.js', 'js/views/BrandOrganizationView.js',
  'js/views/vera/graficos.js', 'js/views/vera/historial.mixin.js', 'js/views/vera/biblioteca.mixin.js',
  'js/views/vera/artefactos.mixin.js', 'js/views/vera/render.mixin.js', 'js/views/vera/adjuntos.mixin.js',
];

const LLAMADA = /(?<![\w$])__\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const ALIAS = /(?<![\w$.])t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const DEFINE_ALIAS = /const t = \([^)]*\) => \(?typeof window\.__ === 'function'/;
const sinEscapes = (s, q) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  .replace(new RegExp('\\\\' + q, 'g'), q).replace(/\\\\/g, '\\');

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir)) {
    const f = path.join(dir, e);
    if (fs.statSync(f).isDirectory()) { if (e !== 'i18n') archivos(f, acc); continue; }
    if (e.endsWith('.js') && !/^Dev/.test(e) && f !== path.join('js', 'services', 'I18n.js')) acc.push(f);
  }
  return acc;
}

const EN = fs.readFileSync('js/i18n/en.js', 'utf8');
const CATALOGO = JSON.parse(EN.slice(EN.indexOf('/* I18N:BEGIN */') + 16, EN.indexOf('/* I18N:END */')));

const porArchivo = new Map();
for (const f of archivos('js')) {
  const src = fs.readFileSync(f, 'utf8');
  const claves = new Set();
  for (const re of DEFINE_ALIAS.test(src) ? [LLAMADA, ALIAS] : [LLAMADA]) {
    for (const m of src.matchAll(re)) if (m[2]) claves.add(sinEscapes(m[2], m[1]));
  }
  porArchivo.set(f.split(path.sep).join('/'), claves);
}
const faltantes = (claves) => [...claves].filter((k) => !(k in CATALOGO));
const vacias = (claves) => [...claves].filter((k) => k in CATALOGO && !CATALOGO[k]);
const todas = new Set([...porArchivo.values()].flatMap((s) => [...s]));

describe('i18n: las claves de la UI existen en en.js', () => {
  test('los alias de traducción se reconocen (Estado, Capas, Avisos, LecturaVera)', () => {
    for (const f of ['js/ui/estado.js', 'js/ui/capas.js', 'js/components/Avisos.js', 'js/components/LecturaVera.js']) {
      expect(porArchivo.get(f)?.size, f).toBeGreaterThan(0);
    }
  });

  test.each(PULIDOS)('%s: ninguna clave sin traducir', (f) => {
    expect(porArchivo.has(f), `no existe ${f}`).toBe(true);
    expect(faltantes(porArchivo.get(f)), 'faltan en en.js').toEqual([]);
    expect(vacias(porArchivo.get(f)), 'con valor "" en en.js').toEqual([]);
  });

  test(`ratchet: faltantes ≤ ${TOPE.faltantes}, vacías ≤ ${TOPE.vacias}`, () => {
    expect(faltantes(todas).length).toBeLessThanOrEqual(TOPE.faltantes);
    expect(vacias(todas).length).toBeLessThanOrEqual(TOPE.vacias);
  });

  test('ninguna traducción pierde ni inventa placeholders {x}', () => {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    const malas = Object.entries(CATALOGO).filter(([k, v]) => v && ph(k) !== ph(v)).map(([k]) => k);
    expect(malas).toEqual([]);
  });
});
