/**
 * "Última actualización" en la esquina de cada card de Vera.
 *
 * Dos cosas que se rompen en silencio y por eso se prueban:
 *  1. Que el pie salga en TODAS las cards. Cada tipo se pinta por una plantilla
 *     distinta —el par tiene la suya, Audiencias se desvía a _veraAudienciaHtml,
 *     Observaciones vive en el shell— así que "lo puse en _veraCardHtml" no
 *     significa que esté en las seis. Es el mismo reparto que ya dejó tres
 *     cards sin latido.
 *  2. Que la hora sea la de CADA card y no la de la lectura. El tablero cambia
 *     por partes: si el pie cayera al respaldo, las seis dirían lo mismo y
 *     sería falso en cinco.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'js/views/dashboard/BrandGrid.mixin.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

function cargarVista() {
  globalThis.DashboardView = function DashboardView() {};
  globalThis.__ = (s, vars) =>
    String(s).replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  globalThis.window = globalThis.window || {};
  new Function(FUENTE)();
  const vista = Object.create(globalThis.DashboardView.prototype);
  vista._esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return vista;
}

const hace = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60 * 1000, HORA = 60 * MIN, DIA = 24 * HORA;

describe('_veraHace — en palabras, no en abreviaturas', () => {
  const vista = cargarVista();
  test.each([
    [30 * 1000,     'hace un momento'],
    [3 * MIN,       'hace 3 min'],
    [59 * MIN,      'hace 59 min'],
    [HORA,          'hace 1 hora'],
    [3 * HORA,      'hace 3 horas'],
    [DIA,           'hace 1 día'],
    [2 * DIA,       'hace 2 días'],
    [45 * DIA,      'hace 1 mes'],
    [90 * DIA,      'hace 3 meses'],
  ])('%i ms → %s', (ms, esperado) => {
    expect(vista._veraHace(hace(ms))).toBe(esperado);
  });

  test('sin fecha no inventa nada', () => {
    expect(vista._veraHace(null)).toBe('');
    expect(vista._veraHace('no es una fecha')).toBe('');
  });

  test('un reloj adelantado no dice "hace -3 min"', () => {
    expect(vista._veraHace(new Date(Date.now() + 5 * MIN).toISOString())).toBe('hace un momento');
  });
});

describe('el pie sale en todas las cards, con la hora de cada una', () => {
  const CARDS = {
    algoritmo:   { type: 'algoritmo',   title: 'Tu algoritmo', markdown: 'Publica martes.', updated_at: hace(3 * MIN) },
    intuicion:   { type: 'intuicion',   title: 'Intuición',    markdown: 'Algo se mueve.',  updated_at: hace(HORA) },
    audiencia:   { type: 'audiencia',   title: 'Audiencias',   blocks: [{ type: 'markdown', markdown: 'Mujeres 25-44.' }], updated_at: hace(2 * DIA) },
    virtudes:    { type: 'virtudes',    title: 'Fortalezas',   markdown: 'Constancia.',     updated_at: hace(5 * HORA) },
    desventajas: { type: 'desventajas', title: 'Debilidades',  markdown: 'Poco video.',     updated_at: hace(DIA) },
    audrec:      { type: 'audiencias_recomendadas', items: [{ id: 'a1', name: 'Padres', priority: 'alta' }], updated_at: hace(20 * MIN) },
  };

  test('cada plantilla escribe su propio pie', () => {
    const vista = cargarVista();
    const pares = [
      ['algoritmo', vista._veraCardHtml(CARDS.algoritmo, 'v0'),  'hace 3 min'],
      ['intuicion', vista._veraCardHtml(CARDS.intuicion, 'i0'),  'hace 1 hora'],
      ['audiencia', vista._veraCardHtml(CARDS.audiencia, 'a0'),  'hace 2 días'],
      ['audrec',    vista._veraAudRecHtml(CARDS.audrec),         'hace 20 min'],
    ];
    pares.forEach(([nombre, html, esperado]) => {
      expect(html, `${nombre} sin pie`).toContain('vera-card-fecha');
      expect(html, `${nombre} con la hora equivocada`).toContain(`Última actualización ${esperado}`);
    });
  });

  test('el par Fortalezas/Debilidades lleva un pie por panel', () => {
    const vista = cargarVista();
    const html = vista._veraDuoHtml(
      [{ card: CARDS.virtudes, key: 'pos0' }],
      [{ card: CARDS.desventajas, key: 'neg0' }],
    );
    expect(html.match(/vera-card-fecha/g) || []).toHaveLength(2);
    expect(html).toContain('Última actualización hace 5 horas');
    expect(html).toContain('Última actualización hace 1 día');
  });

  test('Observaciones se marca desde el render, no desde la plantilla', () => {
    // Su contenedor vive en el shell: sin DOM en el runner se vigila la línea.
    expect(FUENTE).toMatch(/bgridObsFecha/);
    expect(FUENTE).toMatch(/obsFecha\.textContent\s*=/);
  });

  test('sin sello propio cae a la fecha de la lectura, no al vacío', () => {
    const vista = cargarVista();
    vista._veraLecturaAt = hace(4 * HORA);
    const sinSello = { type: 'algoritmo', title: 'X', markdown: 'y' };
    expect(vista._veraCardHtml(sinSello, 'v0')).toContain('Última actualización hace 4 horas');
  });

  test('sin sello y sin lectura no se pinta pie', () => {
    const vista = cargarVista();
    vista._veraLecturaAt = null;
    expect(vista._veraCardHtml({ type: 'algoritmo', title: 'X', markdown: 'y' }, 'v0'))
      .not.toContain('vera-card-fecha');
  });

  test('el sello de la card manda sobre el de la lectura', () => {
    const vista = cargarVista();
    vista._veraLecturaAt = hace(9 * DIA);
    expect(vista._veraCardHtml(CARDS.algoritmo, 'v0')).toContain('Última actualización hace 3 min');
  });
});
