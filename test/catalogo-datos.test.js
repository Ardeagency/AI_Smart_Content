/**
 * CatalogoDataService: elements_full por kind con la forma de v1 (products,
 * services, brand_places, brand_characters) y la traducción de vuelta para
 * escribir en elements + element_<kind>. Contrato studio.md (8303f5e).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/CatalogoDataService.js'), 'utf8');
let C;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); C = globalThis.window.CatalogoDatos.mapeo; });

describe('Catálogo · elements_full → v1', () => {
  test('un producto sale con nombre_producto, precio y sus fotos (file_id manda sobre la url vieja)', () => {
    const urls = { f1: 'https://media-v2/in/o/1.png' };
    const p = C.elementoAV1({ id: 'p1', organization_id: 'o', kind: 'product', name: 'Crema', description: 'd', attributes: { imagenes: [{ orden: 1, url: 'https://viejo/2.png' }, { orden: 0, file_id: 'f1', url: 'https://viejo/1.png', tipo: 'principal' }] }, detail: { product_type: 'alimento', price: 25000, currency: 'COP', benefits: ['a'] }, created_at: 't' }, urls);
    expect(p).toMatchObject({ nombre_producto: 'Crema', descripcion_producto: 'd', tipo_producto: 'alimento', precio_producto: 25000, moneda: 'COP', entity_id: 'p1', imagen: urls.f1, beneficios: ['a'] });
    expect(p.image_urls).toEqual([urls.f1, 'https://viejo/2.png']);
  });
  test('servicio, escenario (place) y personaje llevan los nombres de v1', () => {
    expect(C.elementoAV1({ id: 's', kind: 'service', name: 'Asesoría', detail: { service_type: 'consultoria', price: 100, currency: 'USD', duration_minutes: 60, benefits: ['x'] } })).toMatchObject({ nombre_servicio: 'Asesoría', tipo_servicio: 'consultoria', precio_base: 100, duracion_estimada: '60 min', beneficios_principales: ['x'] });
    expect(C.elementoAV1({ id: 'l', kind: 'scenario', name: 'Tienda', detail: { scenario_type: 'tienda', city: 'Medellín', country: 'CO' } })).toMatchObject({ nombre_lugar: 'Tienda', place_type: 'tienda', city: 'Medellín' });
    expect(C.elementoAV1({ id: 'c', kind: 'character', name: 'Ana', detail: { role: 'vocera', personality: 'cálida' } })).toMatchObject({ nombre_personaje: 'Ana', tipo_personaje: 'vocera', personalidad: 'cálida' });
    expect(C.elementoAV1({ id: 'i', kind: 'identity', name: 'Marca' })).toMatchObject({ entity_type: 'identity', nombre: 'Marca' });
  });
  test('sin fotos, imagen es null y las listas quedan vacías', () => {
    const p = C.elementoAV1({ id: 'p', kind: 'product', name: 'X', attributes: {}, detail: null });
    expect(p.imagen).toBeNull(); expect(p.image_urls).toEqual([]); expect(p.beneficios).toEqual([]);
  });
});

describe('Catálogo · v1 → elements + element_<kind>', () => {
  test('los campos de v1 se reparten entre elements y el detalle del kind, con el kind de la base', () => {
    const r = C.aBase('product', { nombre_producto: ' Crema ', descripcion_producto: 'd', tipo_producto: 'alimento', precio_producto: 1, moneda: 'COP', url_producto: 'https://x' });
    expect(r.kind).toBe('product');
    expect(r.elemento).toEqual({ name: 'Crema', description: 'd' });
    expect(r.detalle).toEqual({ product_type: 'alimento', price: 1, currency: 'COP', url: 'https://x' });
  });
  test('place es scenario; los vacíos van a null; lo que no se manda no aparece', () => {
    const r = C.aBase('place', { nombre_lugar: 'Tienda', place_type: '', city: 'Cali' });
    expect(r.kind).toBe('scenario');
    expect(r.detalle).toEqual({ scenario_type: null, city: 'Cali' });
    expect(C.aBase('character', { nombre_personaje: 'Ana' }).detalle).toEqual({});
  });
});

/* Fotos del catálogo · contrato BD 3547413 / 20260924130000 (SIN aplicar al escribir esto):
   con la columna elements_full.imagenes se usa la url que resuelve la base; sin ella, el camino
   de hoy (attributes + urlsDeArchivos). La consola funciona igual antes y después de aplicar. */
describe('Catálogo · fotos: las dos formas de elements_full', () => {
  test('con `imagenes`: la url de la base manda, se ignora la url vieja de attributes y la pendiente queda como placeholder', () => {
    const p = C.elementoAV1({
      id: 'p', kind: 'product', name: 'X',
      attributes: { imagenes: [{ orden: 0, url: 'https://viejo/1.png' }] },
      imagenes: [{ file_id: 'f1', url: 'https://media-v2/in/1.png', tipo: 'principal', orden: 0 }, { file_id: null, url: null, tipo: 'galeria', orden: 1, pendiente: true }],
    }, { f1: 'https://NO-USAR/urlsDeArchivos' });
    expect(p.imagen).toBe('https://media-v2/in/1.png');
    expect(p.image_urls).toEqual(['https://media-v2/in/1.png']);
    expect(p.imagenes).toHaveLength(2);
    expect(p.imagenes[1]).toMatchObject({ pendiente: true, url: null });
  });
  test('sin `imagenes` (base de hoy): attributes + urlsDeArchivos, como siempre', () => {
    const p = C.elementoAV1({ id: 'p', kind: 'product', name: 'X', attributes: { imagenes: [{ orden: 0, file_id: 'f1', url: 'https://viejo/1.png' }] } }, { f1: 'https://media-v2/in/1.png' });
    expect(p.imagen).toBe('https://media-v2/in/1.png');
  });

  /** Cliente mínimo: registra cada select y responde según `tieneColumna`. */
  function clienteFalso(tieneColumna) {
    const selects = [];
    const q = (sel) => {
      selects.push(sel);
      const res = (!tieneColumna && sel.includes('imagenes'))
        ? { data: null, error: { code: '42703', message: 'column imagenes does not exist' } }
        : { data: [{ id: 'p', kind: 'product', name: 'X', attributes: {}, ...(sel.includes('imagenes') ? { imagenes: [] } : {}) }], error: null };
      const b = { eq: () => b, is: () => b, order: () => b, limit: () => Promise.resolve(res) };
      return b;
    };
    return { selects, sb: { from: () => ({ select: q }) } };
  }

  test('la base SIN la columna: repite sin ella y resuelve con urlsDeArchivos', async () => {
    const F = globalThis.window.CatalogoDatos;
    const { selects, sb } = clienteFalso(false);
    let llamadas = 0;
    globalThis.window.StudioDatos = { urlsDeArchivos: async () => { llamadas += 1; return {}; } };
    F._inyectarCliente(sb);
    const lista = await F.elementos('o', 'product');
    expect(lista).toHaveLength(1);
    expect(selects[0]).toContain('imagenes');
    expect(selects[1]).not.toContain('imagenes');
    expect(llamadas).toBe(1);
  });
});

describe('Catálogo · fotos: base CON la columna', () => {
  test('lee `imagenes` y NO pide urlsDeArchivos (tope de 50 del borde)', async () => {
    // Fuente fresca: el aprendizaje «sin columna» del bloque anterior no debe contar aquí.
    const w = { };
    new Function('window', FUENTE)(w);
    const selects = [];
    const res = { data: [{ id: 'p', kind: 'product', name: 'X', attributes: {}, imagenes: [{ file_id: 'f', url: 'https://media-v2/in/f.png', orden: 0 }] }], error: null };
    const b = { eq: () => b, is: () => b, order: () => b, limit: () => Promise.resolve(res) };
    w.CatalogoDatos._inyectarCliente({ from: () => ({ select: (s) => { selects.push(s); return b; } }) });
    let llamadas = 0;
    w.StudioDatos = { urlsDeArchivos: async () => { llamadas += 1; return {}; } };
    const [p] = await w.CatalogoDatos.elementos('o', 'product');
    expect(selects).toHaveLength(1);
    expect(p.imagen).toBe('https://media-v2/in/f.png');
    expect(llamadas).toBe(0);
  });
});
