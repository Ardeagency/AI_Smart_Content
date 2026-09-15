/**
 * ApiV2: el contrato con el borde /v1 del backend v2 (ADR-0043/0052).
 *
 * Es el mismo test que tenía api.ts en Git-AISC-Frontend (congelado en
 * d43e948): las peticiones son constructores PUROS con la forma exacta que
 * espera el backend (su test de contrato las corre contra app.inject), y la
 * ejecución refresca la sesión UNA vez ante un 401 y corta los cuerpos que
 * superan los topes ANTES de salir a la red.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/ApiV2.js'), 'utf8');
let apiV2;

beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  globalThis.FormData = globalThis.FormData || class FormData { constructor() { this._d = new Map(); } set(k, v) { this._d.set(k, v); } get(k) { return this._d.get(k); } };
  new Function(FUENTE)();
  apiV2 = globalThis.window.apiV2;
});

const respuesta = (status, cuerpo, headers = {}) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('ApiV2 · peticiones puras', () => {
  test('tienen la forma exacta del contrato (borde-http.md)', () => {
    const { peticiones } = apiV2;
    expect(peticiones.salud()).toEqual({ method: 'GET', path: '/salud', publica: true });
    expect(peticiones.lanzarFlujo('f1', 'o1', { a: 1 }, 'c1', 'm1')).toEqual({ method: 'POST', path: '/v1/flujos/f1/lanzar', body: { org: 'o1', entradas: { a: 1 }, market_id: 'm1', id_cliente: 'c1' } });
    expect(peticiones.lanzarFlujo('f1', 'o1', {}, 'c1').body).toEqual({ org: 'o1', entradas: {}, id_cliente: 'c1' });
    expect(peticiones.enviarMensaje('cv', 'hola', 'c9')).toEqual({ method: 'POST', path: '/v1/conversaciones/cv/mensajes', body: { texto: 'hola', id_cliente: 'c9' } });
    expect(peticiones.decidirAprobacion('a1', 'o1', 'aprobar')).toEqual({ method: 'POST', path: '/v1/aprobaciones/a1', body: { org: 'o1', aprobar: true } });
    expect(peticiones.decidirAprobacion('a1', 'o1', 'rechazar', 'No va con la marca').body).toEqual({ org: 'o1', aprobar: false, nota: 'No va con la marca' });
    expect(() => peticiones.decidirAprobacion('a1', 'o1', 'rechazar')).toThrow(/motivo/);
    expect(peticiones.iniciarPago('o1', 'pack_mini')).toEqual({ method: 'POST', path: '/v1/pagos/iniciar', body: { org: 'o1', paquete: 'pack_mini' } });
    expect(peticiones.urlDescarga('a1', 'o1')).toEqual({ method: 'GET', path: '/v1/archivos/a1/descarga', query: { org: 'o1' } });
    expect(peticiones.conectar('meta', 'o1')).toEqual({ method: 'POST', path: '/v1/integraciones/meta/conectar', body: { org: 'o1' } });
    const m = peticiones.mcp('o1', 'tools/list');
    expect(m.path).toBe('/mcp'); expect(m.query).toEqual({ org: 'o1' }); expect(m.body.jsonrpc).toBe('2.0');
  });

  test('solo /salud y /mcp van sin /v1', () => {
    const sinVersion = new Set(['/salud', '/mcp']);
    for (const [nombre, fn] of Object.entries(apiV2.peticiones)) {
      if (nombre === 'subirArchivo') continue;
      const p = fn('x', 'y', 'aprobar', 'zzzzz');
      expect(p.path.startsWith('/v1/') || sinVersion.has(p.path), `${nombre}: ${p.path}`).toBe(true);
    }
  });

  test('los pagos están en rojo hasta reprecificar (ADR-0042)', async () => {
    expect(apiV2.PAGOS_HABILITADOS).toBe(false);
    await expect(apiV2.api.iniciarPago('o1', 'pack_mini')).rejects.toMatchObject({ codigo: 'pagos_no_habilitados' });
  });
});

describe('ApiV2 · ejecución', () => {
  test('sin AISC_API_URL el error es sin_api, no un fallo mudo', async () => {
    globalThis.window.AISC_API_URL = '';
    apiV2.configurar({ fetch: null, sesion: null });
    await expect(apiV2.api.aprobaciones('o1')).rejects.toMatchObject({ codigo: 'sin_api' });
  });

  test('401: refresca la sesión y reintenta UNA vez; si repite, no_autenticado', async () => {
    const jwts = []; let refrescos = 0;
    apiV2.configurar({
      sesion: { actual: async () => ({ access_token: 'viejo' }), refrescar: async () => { refrescos++; return { access_token: 'nuevo' }; } },
      fetch: async (_u, init) => {
        const jwt = (init.headers.authorization || '').replace('Bearer ', ''); jwts.push(jwt);
        return jwt === 'nuevo' ? respuesta(200, [{ id: 'a1' }]) : respuesta(401, { error: 'no_autenticado', mensaje: 'Sesion invalida o ausente.', request_id: 'r1' });
      },
    });
    expect(await apiV2.api.aprobaciones('o1')).toEqual([{ id: 'a1' }]);
    expect(jwts).toEqual(['viejo', 'nuevo']); expect(refrescos).toBe(1);

    apiV2.configurar({ fetch: async () => respuesta(401, { error: 'no_autenticado', mensaje: 'x', request_id: 'r2' }) });
    await expect(apiV2.api.aprobaciones('o1')).rejects.toMatchObject({ codigo: 'no_autenticado', http: 401, requestId: 'r2' });
    apiV2.configurar({ fetch: null, sesion: null });
  });

  test('los topes se comprueban antes de salir a la red (413 cuerpo_demasiado_grande)', async () => {
    let llamadas = 0;
    apiV2.configurar({ sesion: { actual: async () => ({ access_token: 'j' }), refrescar: async () => null }, fetch: async () => { llamadas++; return respuesta(200, {}); } });
    await expect(apiV2.api.enviarMensaje('cv', 'x'.repeat(apiV2.TOPE_JSON_BYTES + 1), 'c1')).rejects.toMatchObject({ codigo: 'cuerpo_demasiado_grande', http: 413 });
    expect(() => apiV2.peticiones.subirArchivo('o1', { size: apiV2.TOPE_ARCHIVO_BYTES + 1 })).toThrow(/200 MB/);
    expect(llamadas).toBe(0);
    apiV2.configurar({ fetch: null, sesion: null });
  });

  test('la galería pinta inline solo imagen/video/audio; lo demás es descargar (ADR-0045)', () => {
    const { modoDeMuestra } = apiV2;
    expect(modoDeMuestra('image/png')).toBe('imagen');
    expect(modoDeMuestra('VIDEO/mp4')).toBe('video');
    expect(modoDeMuestra('audio/wav')).toBe('audio');
    expect(modoDeMuestra('application/pdf')).toBe('descarga');
    expect(modoDeMuestra('application/octet-stream')).toBe('descarga');
    expect(modoDeMuestra(null)).toBe('descarga');
  });
});

describe('ApiV2 · Studio = corrida de flujo (backend 260f742)', () => {
  test('esperarCorrida sondea hasta succeeded/failed y avisa cada vuelta', async () => {
    const estados = ['queued', 'running', 'succeeded'];
    let n = 0; const vistos = [];
    apiV2.configurar({ sesion: { actual: async () => ({ access_token: 'j' }), refrescar: async () => null }, fetch: async () => respuesta(200, { id: 'r1', status: estados[n++], salidas: n === 3 ? [{ key: 'imagen', kind: 'image', url: 'https://media/out/x' }] : [] }) });
    const fin = await apiV2.api.esperarCorrida('r1', 'o1', { intervaloMs: 1, alCambiar: (c) => vistos.push(c.status), dormir: async () => {} });
    expect(fin.status).toBe('succeeded'); expect(fin.salidas[0].kind).toBe('image');
    expect(vistos).toEqual(['queued', 'running', 'succeeded']);
    apiV2.configurar({ fetch: null, sesion: null });
  });

  test('esperarCorrida corta con tiempo_agotado si nunca termina', async () => {
    apiV2.configurar({ sesion: { actual: async () => ({ access_token: 'j' }), refrescar: async () => null }, fetch: async () => respuesta(200, { id: 'r1', status: 'running' }) });
    await expect(apiV2.api.esperarCorrida('r1', 'o1', { intervaloMs: 1, topeMs: 0, dormir: async () => {} })).rejects.toMatchObject({ codigo: 'tiempo_agotado' });
    apiV2.configurar({ fetch: null, sesion: null });
  });
});
