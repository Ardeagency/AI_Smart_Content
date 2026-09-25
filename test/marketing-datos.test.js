/** MarketingDataService: el lienzo de Marketing sobre marketing.boards/board_nodes/board_edges + audiencias, campañas y sus vínculos. */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/MarketingDataService.js'), 'utf8');
let M; let D;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); D = globalThis.window.MarketingDatos; M = D.mapeo; });

describe('Marketing · tablero y nodos', () => {
  test('el viewport vacío de la base abre centrado a escala 1; la escala se acota', () => {
    expect(M.viewportDesde({})).toEqual({ x: 0, y: 0, escala: 1 });
    expect(M.viewportDesde({ x: '12', y: -4, escala: 9 })).toEqual({ x: 12, y: -4, escala: 2 });
    expect(M.viewportDesde({ scale: 0.01 }).escala).toBe(0.3);
    expect(M.tableroAV1({ id: 'b', name: '  ', viewport: null })).toMatchObject({ nombre: '—', viewport: { x: 0, y: 0, escala: 1 } });
  });
  test('board_view → nodo con su sujeto y su título resuelto por la base', () => {
    expect(M.nodoAV1({ id: 'n', board_id: 'b', kind: 'campaign', subject_id: 'c1', x: '10.5', y: 3, width: null, style: null, title: 'Lanzamiento', subtitle: 'active' }))
      .toMatchObject({ id: 'n', kind: 'campaign', sujeto_id: 'c1', x: 10.5, y: 3, ancho: null, estilo: {}, titulo: 'Lanzamiento', subtitulo: 'active' });
    expect(M.nodoAV1({ id: 'n2', kind: 'audience', audience_id: 'a1', x: 0, y: 0 }).sujeto_id).toBe('a1');
  });
  test('fila de board_nodes: cada kind con SU columna; nota y grupo sin sujeto (CHECK un_solo_sujeto)', () => {
    expect(M.filaDeNodo('o', 'b', { kind: 'audience', sujeto_id: 'a1', x: 10.4, y: 20.6 })).toEqual({ organization_id: 'o', board_id: 'b', kind: 'audience', x: 10, y: 21, audience_id: 'a1' });
    expect(M.filaDeNodo('o', 'b', { kind: 'element', sujeto_id: 'e1', x: 0, y: 0 }).element_id).toBe('e1');
    expect(M.filaDeNodo('o', 'b', { kind: 'note', x: 0, y: 0, cuerpo: 'Idea' })).toMatchObject({ kind: 'note', body: 'Idea' });
    expect(M.filaDeNodo('o', 'b', { kind: 'group', x: 0, y: 0, titulo: 'Q4', ancho: 400, alto: 300 })).toMatchObject({ label: 'Q4', width: 400, height: 300 });
    expect(() => M.filaDeNodo('o', 'b', { kind: 'note', sujeto_id: 'x' })).toThrow(/no llevan sujeto/);
    expect(() => M.filaDeNodo('o', 'b', { kind: 'campaign' })).toThrow(/sujeto/);
    expect(() => M.filaDeNodo('o', 'b', { kind: 'lo_que_sea', sujeto_id: 'x' })).toThrow(/desconocido/);
  });
});

describe('Marketing · conexiones', () => {
  const aud = { id: 'na', kind: 'audience', sujeto_id: 'a1' };
  const camp = { id: 'nc', kind: 'campaign', sujeto_id: 'c1' };
  const nota = { id: 'nn', kind: 'note', sujeto_id: null };
  test('audiencia↔campaña es un VÍNCULO (campaign_audiences), en cualquier sentido; lo demás, arista', () => {
    expect(M.tipoDeConexion(aud, camp)).toBe('vinculo');
    expect(M.tipoDeConexion(camp, aud)).toBe('vinculo');
    expect(M.tipoDeConexion(nota, camp)).toBe('arista');
    expect(M.tipoDeConexion(aud, aud)).toBe(null);
    expect(M.tipoDeConexion(aud, { id: 'g', kind: 'group' })).toBe(null);
    expect(M.parVinculo(camp, aud)).toEqual({ campaign_id: 'c1', audience_id: 'a1', desde: 'na', hasta: 'nc' });
  });
  test('las aristas visibles suman board_edges y vínculos con los dos extremos en el tablero, sin duplicar', () => {
    const nodos = [aud, camp, nota, { id: 'na2', kind: 'audience', sujeto_id: 'a1' }];
    const aristas = [{ id: 'e1', desde: 'nn', hasta: 'nc', tipo: 'arista' }, { id: 'e2', desde: 'na', hasta: 'nc', tipo: 'arista' }, { id: 'e3', desde: 'fuera', hasta: 'nc', tipo: 'arista' }];
    const vinc = [{ campaign_id: 'c1', audience_id: 'a1', is_primary: true }, { campaign_id: 'c9', audience_id: 'a1' }];
    const v = M.aristasVisibles(nodos, aristas, vinc);
    expect(v.map((e) => e.id)).toEqual(['e1', 'e2', 'v:c1:a1:na2:nc']);
    expect(v[2]).toMatchObject({ tipo: 'vinculo', desde: 'na2', hasta: 'nc', principal: true });
  });
});

describe('Marketing · nombres y posiciones', () => {
  test('siguiente nombre libre', () => {
    expect(M.siguienteNombre('Nueva campaña', ['Nueva campaña (1)', 'Nueva campaña (4)', 'Otra (9)'])).toBe('Nueva campaña (5)');
    expect(M.siguienteNombre('Nueva audiencia', [])).toBe('Nueva audiencia (1)');
  });
  test('un nodo nuevo cae en la columna de su kind, debajo del último', () => {
    expect(M.posicionLibre('audience', [])).toEqual({ x: 40, y: 40 });
    expect(M.posicionLibre('campaign', [{ kind: 'campaign', x: 460, y: 40, alto: null }, { kind: 'audience', x: 40, y: 900 }])).toEqual({ x: 460, y: 220 });
  });
  test('reorganizar: columnas por kind y orden por título; notas y grupos quietos', () => {
    const r = M.reorganizar([{ id: '1', kind: 'campaign', titulo: 'Zeta' }, { id: '2', kind: 'campaign', titulo: 'Alfa' }, { id: '3', kind: 'note' }, { id: '4', kind: 'element', titulo: 'Maní' }]);
    expect(r).toEqual([{ id: '2', x: 460, y: 40 }, { id: '1', x: 460, y: 210 }, { id: '4', x: -380, y: 40 }]);
  });
});

describe('Marketing · audiencias y campañas', () => {
  test('audiencia de la base → forma del inspector', () => {
    expect(M.audienciaAV1({ id: 'a', name: 'Reposteros', pains: ['x', '', null], target_age_min: 25, alignment_score: '83.80', target_genders: ['F'] }))
      .toMatchObject({ nombre: 'Reposteros', dolores: ['x'], edad_min: 25, edad_max: null, alineacion: 83.8, generos: ['F'], activa: true });
  });
  test('audiencia → patch: una idea por línea y los CHECK de edad', () => {
    expect(M.audienciaABase({ nombre: ' Veganas ', dolores: 'no hay\n\n leer etiquetas ', edad_min: '25', edad_max: '' }))
      .toEqual({ name: 'Veganas', pains: ['no hay', 'leer etiquetas'], target_age_min: 25, target_age_max: null });
    expect(() => M.audienciaABase({ nombre: '' })).toThrow(/nombre/);
    expect(() => M.audienciaABase({ edad_min: 10 })).toThrow(/13 a 100/);
    expect(() => M.audienciaABase({ edad_min: 40, edad_max: 30 })).toThrow(/mínima/);
    expect(() => M.audienciaABase({ conciencia: 'despierta' })).toThrow(/conciencia/);
  });
  test('campaña de campaigns_view → forma del lienzo', () => {
    expect(M.campanaAV1({ id: 'c', name: 'Lanzamiento', objective: 'sales', status: 'paused', planned_budget: '100', planned_currency: 'COP', entregas: '2', gastado: '0' }))
      .toMatchObject({ nombre: 'Lanzamiento', objetivo: 'sales', estado: 'paused', presupuesto: 100, moneda: 'COP', entregas: 2, gastado: 0 });
  });
  test('gasto de campaigns_view: monto en su moneda; NULL = varias monedas (nunca 0)', () => {
    const una = M.campanaAV1({ id: 'c', name: 'X', entregas: 1, gastado: '16180999.00', gastado_moneda: 'COP ' });
    expect(una).toMatchObject({ gastado: 16180999, gastado_moneda: 'COP', varias_monedas: false });
    expect(M.gastoDe(una)).toEqual({ tipo: 'monto', monto: 16180999, moneda: 'COP' });
    const mezcla = M.campanaAV1({ id: 'c', name: 'X', entregas: 2, gastado: null, gastado_moneda: null });
    expect(mezcla.varias_monedas).toBe(true);
    expect(M.gastoDe(mezcla)).toEqual({ tipo: 'varias' });
    expect(M.gastoDe(M.campanaAV1({ id: 'c', name: 'X' }))).toEqual({ tipo: 'nada' });
  });
  test('Realtime → cambio del lienzo: alta/cambio con la fila mapeada; baja solo con la llave', () => {
    expect(M.cambioDeRealtime('board_nodes', { eventType: 'UPDATE', new: { id: 'n', board_id: 'b', kind: 'note', x: 5, y: 6, body: 'hola' } }))
      .toMatchObject({ tabla: 'board_nodes', tipo: 'cambio', id: 'n', board_id: 'b', fila: { kind: 'note', x: 5, y: 6, cuerpo: 'hola' } });
    expect(M.cambioDeRealtime('board_edges', { eventType: 'INSERT', new: { id: 'e', board_id: 'b', from_node_id: 'a', to_node_id: 'z' } }).fila)
      .toMatchObject({ desde: 'a', hasta: 'z', tipo: 'arista' });
    expect(M.cambioDeRealtime('boards', { eventType: 'DELETE', old: { id: 't' } })).toEqual({ tabla: 'boards', tipo: 'baja', id: 't', fila: null });
    expect(M.cambioDeRealtime('boards', { eventType: 'UPDATE', new: { id: 't', name: 'Q4', viewport: {} } }).fila).toMatchObject({ nombre: 'Q4' });
    expect(M.cambioDeRealtime('otra', { eventType: 'INSERT', new: { id: 'x' } })).toBe(null);
    expect(M.cambioDeRealtime('board_nodes', { eventType: 'DELETE', old: {} })).toBe(null);
  });
  test('campaña → patch con los CHECK de la base: presupuesto con moneda ISO, fechas en orden, enums', () => {
    expect(M.campanaABase({ presupuesto: '500', moneda: 'cop' })).toEqual({ planned_budget: 500, planned_currency: 'COP' });
    expect(M.campanaABase({ presupuesto: '', moneda: 'COP' })).toEqual({ planned_budget: null, planned_currency: null });
    expect(() => M.campanaABase({ presupuesto: 10, moneda: '' })).toThrow(/moneda/);
    expect(() => M.campanaABase({ inicio: '2026-10-02', fin: '2026-10-01' })).toThrow(/terminar antes/);
    expect(() => M.campanaABase({ objetivo: 'vender' })).toThrow(/objetivo/);
    expect(M.campanaABase({ narrativa: '', cta: ' Compra ', url: '' })).toEqual({ narrative: null, call_to_action: 'Compra', landing_url: null });
  });
  test('rendimiento: totales y ratios; la moneda es la del gasto dominante', () => {
    const r = M.rendimientoDe([
      { date: '2026-09-01', currency: 'COP', impressions: 1000, clicks: 50, conversions: 5, spend: 10000, conversion_value: 30000 },
      { date: '2026-09-02', currency: 'COP', impressions: 1000, clicks: 50, conversions: 0, spend: 10000, conversion_value: 0 },
      { date: '2026-09-02', currency: 'USD', impressions: 10, clicks: 1, spend: 1 },
    ]);
    expect(r).toMatchObject({ impresiones: 2010, clics: 101, conversiones: 5, moneda: 'COP', dias: 2 });
    expect(r.cpa).toBeCloseTo(20001 / 5);
    expect(M.rendimientoDe([])).toMatchObject({ ctr: null, cpa: null, roas: null, moneda: null });
  });
  test('los enums del servicio son los de la base', () => {
    expect(D.OBJETIVOS).toEqual(['awareness', 'traffic', 'engagement', 'leads', 'sales', 'retention', 'launch']);
    expect(D.COLUMNA_SUJETO.audience).toBe('audience_id');
  });
});
