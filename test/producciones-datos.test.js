/**
 * ProduccionesDataService: flows.runs + public.salidas + flows.run_inputs con la
 * forma de v1 (flow_runs / runs_outputs / runs_inputs) para que living.js pinte igual.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/ProduccionesDataService.js'), 'utf8');
let P;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); P = globalThis.window.ProduccionesDatos.mapeo; });

describe('Producciones · formas de v1', () => {
  test('la corrida lleva el nombre del flujo en content_flows.name y el mercado como brand_id', () => {
    expect(P.corridaAV1({ id: 'r1', organization_id: 'o', flow_id: 'f1', market_id: 'm', status: 'succeeded', created_at: 't' }, { f1: 'Imagen directa' }))
      .toMatchObject({ id: 'r1', brand_id: 'm', status: 'succeeded', content_flows: { name: 'Imagen directa' } });
  });
  test('la salida se pinta por file_id (galería) y guarda el prompt de la corrida', () => {
    const urls = { a1: 'https://media-v2/out/o/x.png' };
    const s = P.salidaAV1({ output_id: 9, run_id: 'r1', flow_id: 'f1', flujo: 'Imagen', clave: 'imagen', tipo: 'image', es_principal: true, url: 'https://media.aismartcontent.io/viejo.png', file_id: 'a1', mime_type: 'image/png', created_at: 't' }, urls, { r1: { prompt: 'un café', aspecto: '1:1' } });
    expect(s).toMatchObject({ id: 9, run_id: 'r1', output_type: 'image', storage_path: urls.a1, file_url: urls.a1, prompt_used: 'un café', file_id: 'a1' });
    expect(s.metadata).toMatchObject({ es_principal: true, image_url: urls.a1, flujo: 'Imagen' });
    expect(s.technical_params.aspecto).toBe('1:1');
    expect(P.salidaAV1({ output_id: 2, tipo: 'video', url: 'https://x/v.mp4', file_id: null }).storage_path).toBe('https://x/v.mp4');
  });
  test('las entradas se agrupan por corrida y desenvuelven {value}', () => {
    expect(P.entradasPorCorrida([{ run_id: 'r1', key: 'prompt', value: 'hola' }, { run_id: 'r1', key: 'aspecto', value: { value: '4:5' } }, { run_id: 'r2', key: 'prompt', value: 'x' }]))
      .toEqual({ r1: { prompt: 'hola', aspecto: '4:5' }, r2: { prompt: 'x' } });
    expect(P.entradaAV1({ id: 1, run_id: 'r1', key: 'prompt', value: 'v', created_at: 't' })).toMatchObject({ input_key: 'prompt', key: 'prompt', value: 'v' });
  });
});
