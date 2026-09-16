/** TableroDataService: marketing.readings (prosa viva + bloques heredados de v1), tendencias, huecos, señales. */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/TableroDataService.js'), 'utf8');
const LECTURA = fs.readFileSync(path.join(process.cwd(), 'js/components/LecturaVera.js'), 'utf8');
let M; let L;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); new Function(LECTURA)(); M = globalThis.window.TableroDatos.mapeo; L = globalThis.window.LecturaVera; });

describe('Tablero · lecturas de Vera', () => {
  test('la forma viva: body = prosa, evidence = datos de apoyo', () => {
    const l = M.lecturaAV1({ id: 'r1', kind: 'recommendation', title: 'Publica el combo', body: 'El territorio está libre.\n\nHazlo esta semana.', evidence: { posts: 3, mejor: 'x' }, confidence: 0.7, acted_on: false, created_at: '2026-09-16' });
    expect(l).toMatchObject({ prosa: 'El territorio está libre.\n\nHazlo esta semana.', de_v1: false, bloques: [], datos: { posts: 3, mejor: 'x' }, acted_on: false });
  });
  test('herencia de v1: body con la lista de bloques como texto → tiles, movidas y el porqué; marcada de v1', () => {
    const body = JSON.stringify([{ type: 'stat_tile', label: 'Mejor', value: '349' }, { type: 'insight', title: 'T', body: 'B', severity: 'opportunity' }, { type: 'recommended_move', action: 'HOY: publica', urgency: 'hoy' }, { type: 'watchlist_item', what: 'W' }]);
    const l = M.lecturaAV1({ id: 'r2', kind: 'diagnosis', title: 'Tres movidas', body, evidence: '{"ev1":{"a":1}}' });
    expect(l.de_v1).toBe(true); expect(l.prosa).toBe('');
    expect(l.tiles).toHaveLength(1); expect(l.movidas).toHaveLength(1); expect(l.vigilancias).toHaveLength(1); expect(l.porque).toHaveLength(1);
    expect(l.evidence).toEqual({ ev1: { a: 1 } });
  });
  test('herencia de v1: « · {"reading":{"cards":[…]}}» (observation de mi_marca) → cards como bloques', () => {
    const l = M.lecturaAV1({ id: 'r3', kind: 'observation', title: 'Lectura de mi_marca (week)', body: ' · {"reading": {"cards": [{"type": "observacion", "items": [{"q": "x", "a": "y"}]}]}}' });
    expect(l.de_v1).toBe(true); expect(l.bloques).toEqual([{ type: 'observacion', items: [{ q: 'x', a: 'y' }] }]);
  });
  test('tras la normalización del lote: evidence.bloques manda y el body es prosa', () => {
    const l = M.lecturaAV1({ id: 'r4', kind: 'diagnosis', title: 'T', body: 'Prosa breve.', evidence: { bloques: [{ type: 'stat_tile', label: 'a', value: '1' }], fuente: 'ig' } });
    expect(l).toMatchObject({ prosa: 'Prosa breve.', de_v1: true, datos: { fuente: 'ig' } }); expect(l.tiles).toHaveLength(1);
  });
  test('la 210000: evidence.lectura_v1 + cards v4 (observacion/audiencia/silencio) se pintan; reading/card no son datos de apoyo', () => {
    const l = M.lecturaAV1({ id: 'r6', kind: 'observation', title: 'Lectura de mi_marca (week)', body: 'Lectura de mi_marca (week) — lectura de v1 (2026-07-29)', evidence: { lectura_v1: true, card: { type: 'x' }, cards: [{ type: 'observacion', items: [{ titulo: 'Rayo', observacion: 'se repite' }] }, { type: 'audiencia', blocks: [{ type: 'stat', label: 'alcance', value: '12K' }] }, { type: 'silencio', items: [{ que: 'no publicó' }] }, { type: 'virtudes', markdown: 'Bien.' }] } });
    expect(l.de_v1).toBe(true); expect(l.datos).toEqual({}); expect(l.porque).toHaveLength(4);
    const html = l.porque.map(L.bloque).join('');
    expect(html).toContain('<strong>Rayo</strong> — se repite'); expect(html).toContain('vera-tile-value">12K'); expect(html).toContain('<strong>no publicó</strong>'); expect(html).toContain('Virtudes'); expect(html).toContain('Bien.');
  });
  test('texto plano que empieza con corchete NO se rompe', () => {
    expect(M.bloquesDesde('[sic] esto es prosa')).toEqual([{ type: 'texto', body: '[sic] esto es prosa' }]);
    expect(M.esJsonHeredado('[sic] esto es prosa')).toBe(false);
  });
  test('LecturaVera escapa todo y pinta «Ponerla en marcha» solo si aún no se actuó', () => {
    const l = M.lecturaAV1({ id: 'r5', kind: 'recommendation', title: '<img src=x onerror=alert(1)>', body: 'Hola <b>mundo</b>', evidence: {} });
    const html = L.lectura(l, { accion: true });
    expect(html).not.toContain('<img'); expect(html).toContain('&lt;img'); expect(html).toContain('&lt;b&gt;mundo');
    expect(html).toContain('data-lectura-actuar="r5"');
    expect(L.lectura({ ...l, acted_on: true, acted_at: '2026-09-16' }, { accion: true })).not.toContain('data-lectura-actuar');
    expect(L.bloque({ type: 'lo_que_sea' })).toBe('');
  });
});

describe('Tablero · tendencias, huecos, señales', () => {
  test('tendencias_vivas y trends salen con la misma forma', () => {
    expect(M.tendenciaAV1({ id: 't', keyword: 'maní', source: 'instagram', category: 'general', velocidad_ultima: '3.5', volumen_ultimo: 1200, relevance: '0.8', ultima_lectura: '2026-09-01', lecturas: '4' })).toMatchObject({ fuente: 'Instagram', velocity: 3.5, volume: 1200, relevance: 0.8, last_seen_at: '2026-09-01', lecturas: 4 });
    expect(M.tendenciaAV1({ id: 't2', keyword: 'x', source: 'llm_research', velocity: null, last_seen_at: '2026-07-07', metadata: { candidato: true } })).toMatchObject({ fuente: 'Investigación', velocity: null, last_seen_at: '2026-07-07', es_candidata: true });
  });
  test('huecos con scores numéricos y términos', () => {
    expect(M.huecoAV1({ id: 'g', phrase: 'Snacks', demand_score: '0.95', coverage_score: null, gap_score: 0.95, demand_terms: ['a'] })).toMatchObject({ demand_score: 0.95, coverage_score: 0, gap_score: 0.95, demand_terms: ['a'] });
  });
  test('señal con severidad por defecto', () => {
    expect(M.senalAV1({ id: 's', kind: 'competitor_move', title: 'T' })).toMatchObject({ severity: 'info', body: '' });
    expect(M.senalAV1({ id: 's2', kind: 'competitor_move', title: 'T', body: '{"url":"https://x","label":"L","excerpt":"Cambió el sitio"}' })).toMatchObject({ body: 'Cambió el sitio', source_url: 'https://x' });
  });
});
