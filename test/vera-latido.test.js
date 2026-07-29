/**
 * El latido de Mi Marca: que lo que Vera acaba de actualizar se pueda MARCAR.
 *
 * La identidad de cada pieza (_nid*) la usan dos caminos que no se ven entre sí:
 * las plantillas, que la escriben en el DOM como `data-nuevo-id`, y el cálculo
 * de huellas, que la compara contra la visita anterior. Si divergen, el
 * selector no encuentra nada y NADA late — un fallo mudo, sin error en consola.
 *
 * Esta prueba los cruza: calcula las huellas de un tablero completo y exige que
 * cada id tenga su elemento en el HTML que de verdad se pinta. Ya cazó tres
 * caminos que no marcaban: Fortalezas, Debilidades y la card de Audiencias.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'js/views/dashboard/BrandGrid.mixin.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

/* El mixin es un IIFE de navegador: se cuelga de DashboardView.prototype y usa
   __() como global. Se le montan los dos y se evalúa; no toca el DOM hasta que
   se llama a un método, así que las plantillas se pueden ejercitar sin jsdom. */
function cargarVista() {
  globalThis.DashboardView = function DashboardView() {};
  globalThis.__ = (s, vars) =>
    String(s).replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  new Function(FUENTE)();

  const vista = Object.create(globalThis.DashboardView.prototype);
  // Lo único que el mixin toma de BaseView.
  vista._esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return vista;
}

// Un tablero con los seis tipos que Vera escribe, cada uno con su item suelto.
const CARDS = [
  { type: 'algoritmo',   title: 'Tu algoritmo',  markdown: 'Publica martes y jueves.' },
  { type: 'audiencia',   title: 'Audiencias',    blocks: [{ type: 'markdown', markdown: 'Mujeres 25-44.' }] },
  { type: 'intuicion',   title: 'Intuición',     markdown: 'Algo se mueve en Reels.' },
  { type: 'virtudes',    title: 'Fortalezas',    markdown: 'Constancia.' },
  { type: 'desventajas', title: 'Debilidades',   markdown: 'Poco video.' },
  {
    type: 'observacion',
    items: [
      { titulo: 'Caída en TikTok', observacion: 'Bajó el alcance.', severidad: 'warning', prioridad: 'alta' },
      { titulo: 'Reels sostiene',  observacion: 'Sube el guardado.', severidad: 'opportunity', prioridad: 'media' },
    ],
  },
  {
    type: 'audiencias_recomendadas',
    items: [
      { id: 'aud-1', name: 'Padres primerizos', priority: 'alta',  intereses: ['crianza'] },
      { id: 'aud-2', name: 'Runners urbanos',   priority: 'media', intereses: ['deporte'] },
    ],
  },
];

/* El HTML que de verdad ve el usuario, por los MISMOS caminos que usa
   _renderVeraCards: cada tipo tiene su plantilla y no todas pasan por
   _veraCardHtml (ahí estaba el fallo mudo). */
function pintarTablero(vista) {
  const de = (t) => CARDS.find((c) => c.type === t);
  const obsId = vista._nid('card', 'observacion');
  return [
    vista._veraCardHtml(de('algoritmo'), 'v0'),
    vista._veraCardHtml(de('audiencia'), 'aud0'),
    vista._veraCardHtml(de('intuicion'), 'intu0'),
    vista._veraDuoHtml([{ card: de('virtudes'), key: 'pos0' }], [{ card: de('desventajas'), key: 'neg0' }]),
    vista._veraAudRecHtml(de('audiencias_recomendadas')),
    // El contenedor de Observaciones vive en el shell y se marca con
    // setAttribute (ver la aserción de abajo, que vigila esa línea).
    `<section id="bgridObsCard" data-nuevo-id="${obsId}">${vista._veraObservacionesHtml([de('observacion')])}</section>`,
  ].join('');
}

describe('latido de Mi Marca — plantilla y huellas hablan el mismo idioma', () => {
  test('cada huella tiene su elemento en el DOM que se pinta', () => {
    const vista = cargarVista();
    const huellas = vista._veraHuellasDe(CARDS);
    const html = pintarTablero(vista);

    const ids = Object.keys(huellas);
    expect(ids.length).toBeGreaterThan(0);

    const huerfanos = ids.filter((id) => !html.includes(`data-nuevo-id="${id}"`));
    expect(huerfanos, `sin elemento que los lleve: ${huerfanos.join(', ')}`).toEqual([]);
  });

  test('las seis cards y sus items sueltos entran en el cálculo', () => {
    const vista = cargarVista();
    const ids = Object.keys(vista._veraHuellasDe(CARDS));
    [
      'card:algoritmo', 'card:audiencia', 'card:intuicion',
      'card:virtudes', 'card:desventajas', 'card:observacion',
      'card:audiencias-recomendadas',
      'obs:caida-en-tiktok', 'audrec:aud-1',
    ].forEach((id) => expect(ids).toContain(id));
  });

  test('el contenedor de Observaciones se marca en el render', () => {
    // Esa card no tiene plantilla propia de sección: su id lo escribe
    // _renderVeraCards con setAttribute. Sin DOM en el runner, se vigila la
    // línea — si desaparece, Observaciones deja de latir en silencio.
    expect(FUENTE).toMatch(/setAttribute\('data-nuevo-id',\s*this\._nid\('card',\s*'observacion'\)\)/);
  });

  test('una card que no cambió no late; una que cambió, sí', () => {
    const vista = cargarVista();
    const antes = vista._veraHuellasDe(CARDS);
    const despues = vista._veraHuellasDe(
      CARDS.map((c) => (c.type === 'algoritmo' ? { ...c, markdown: 'Publica lunes y viernes.' } : c)),
    );
    const cambiados = Object.keys(despues).filter((id) => antes[id] !== despues[id]);
    expect(cambiados).toEqual(['card:algoritmo']);
  });
});
