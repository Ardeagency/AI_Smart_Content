/**
 * StudioDataService: el Studio sobre flujos (imagen-directa / video-directo) y
 * las producciones de public.salidas. Contrato de BD studio.md (8303f5e) y
 * backend 71fc288 (referencias = file_id).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/StudioDataService.js'), 'utf8');
let S;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); S = globalThis.window.StudioDatos.mapeo; });

describe('Studio · entradas de los flujos', () => {
  test('imagen-directa: prompt, aspecto, resolucion y hasta 3 referencias por file_id', () => {
    expect(S.entradasImagen({ prompt: ' un café ', aspect_ratio: '4:5', resolution: '2K', referencias: ['f1', null, 'f2', 'f3', 'f4'] }))
      .toEqual({ prompt: 'un café', aspecto: '4:5', resolucion: '2K', referencia_1: 'f1', referencia_2: 'f2', referencia_3: 'f3' });
    expect(S.entradasImagen({ prompt: 'x' })).toEqual({ prompt: 'x', aspecto: '1:1', resolucion: '2K' });
  });
  test('video-directo: duración numérica, con_audio booleano, 2 referencias', () => {
    expect(S.entradasVideo({ prompt: 'v', aspecto: '9:16', resolucion: '1080p', duration: '10', with_audio: true, referencias: ['a', 'b', 'c'] }))
      .toEqual({ prompt: 'v', aspecto: '9:16', resolucion: '1080p', duracion: 10, con_audio: true, referencia_1: 'a', referencia_2: 'b' });
  });
  test('la salida principal es la marcada principal, o la primera con archivo', () => {
    expect(S.salidaPrincipal({ salidas: [{ clave: 'a', url: null, archivo: null }, { clave: 'b', principal: true, archivo: 'f9', mime: 'image/png' }] })).toEqual({ url: null, file_id: 'f9', mime: 'image/png', clave: 'b' });
    expect(S.salidaPrincipal({ salidas: [{ key: 'x', metadata: { file_id: 'f1' } }] })).toMatchObject({ file_id: 'f1', clave: 'x' });
    expect(S.salidaPrincipal({ salidas: [] })).toBeNull();
  });
});

describe('Studio · contexto y producciones', () => {
  test('el contexto de marca sale del mercado y de elements_full con los nombres de v1; las fotos por file_id', () => {
    const urls = { f1: 'https://media-v2/in/o/p.png' };
    const c = S.contextoAV1({ id: 'm', name: 'CO', core_niche: 'café', keywords: ['k'], verbal_dna: { tono: 'x' }, creative_brief: 'brief' }, [
      { id: 'p1', kind: 'product', name: 'Crema', attributes: { imagenes: [{ orden: 2, url: 'https://viejo/2.png' }, { orden: 1, file_id: 'f1', url: 'https://viejo/1.png' }] } },
      { id: 'c1', kind: 'character', name: 'Ana', description: 'd' },
      { id: 's1', kind: 'scenario', name: 'Tienda' },
      { id: 'x', kind: 'service', name: 'Asesoría', archived_at: 't' },
    ], urls);
    expect(c.brand).toMatchObject({ nicho_core: 'café', palabras_clave: ['k'], verbal_dna: { tono: 'x' } });
    expect(c.brandProfiles).toEqual([{ section: 'creative_brief', content: 'brief' }]);
    expect(c.products[0]).toMatchObject({ nombre_producto: 'Crema', image_urls: ['https://media-v2/in/o/p.png', 'https://viejo/2.png'] });
    expect(c.services).toEqual([]);
    expect(c.entities.map((e) => e.entity_type)).toEqual(['character', 'place']);
  });
  test('una salida se pinta por file_id (galería) y solo por url cuando no hay archivo', () => {
    const urls = { f1: 'https://media-v2/out/o/a.png' };
    expect(S.salidaAV1({ output_id: 1, tipo: 'image', file_id: 'f1', url: 'https://media.aismartcontent.io/viejo.png', created_at: 't' }, urls)).toMatchObject({ media_url: urls.f1, isImage: true, isVideo: false });
    expect(S.salidaAV1({ output_id: 2, tipo: 'video', file_id: null, url: 'https://x/v.mp4' })).toMatchObject({ media_url: 'https://x/v.mp4', isVideo: true });
    expect(S.salidaAV1({ output_id: 3, tipo: 'image', file_id: 'nadie', url: 'https://media.aismartcontent.io/viejo.png' }, urls).media_url).toBe('https://media.aismartcontent.io/viejo.png');
  });
});
