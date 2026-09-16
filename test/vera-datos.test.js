/** VeraDataService: conversaciones y mensajes de ai.* con la forma de v1; el título local. */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/VeraDataService.js'), 'utf8');
let V;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); V = globalThis.window.VeraDatos.mapeo; });
describe('Vera · formas de v1', () => {
  test('la conversación usa last_message_at como updated_at y solo cuenta como «con mensajes» si lo tiene', () => {
    expect(V.conversacionAV1({ id: 'c', title: 'T', last_message_at: 'L', created_at: 'C' })).toMatchObject({ updated_at: 'L', ai_messages: [{ count: 1 }] });
    expect(V.conversacionAV1({ id: 'c', title: null, last_message_at: null, created_at: 'C' })).toMatchObject({ updated_at: 'C', ai_messages: [{ count: 0 }] });
  });
  test('el mensaje conserva role y content y guarda tokens/costo en metadata', () => {
    expect(V.mensajeAV1({ id: 1, conversation_id: 'c', role: 'assistant', content: 'hola', tokens_in: 10, cost_usd: 0.01, created_at: 't' })).toMatchObject({ role: 'assistant', content: 'hola', metadata: { tokens_in: 10, cost_usd: 0.01 } });
  });
  test('el título sale de las primeras palabras, sin chips ni saltos', () => {
    expect(V.tituloDesde('Hola  Vera,\n¿qué sabes de esta marca? [Producto: X]')).toBe('Hola Vera, ¿qué sabes de esta marca?');
    expect(V.tituloDesde('a'.repeat(100))).toMatch(/…$/);
    expect(V.tituloDesde('   ')).toBeNull();
  });
});
