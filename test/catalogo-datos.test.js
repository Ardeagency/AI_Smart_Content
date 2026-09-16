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
