/** FlujosDataService: flows.catalog_view y flows.categories con la forma de v1. */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/FlujosDataService.js'), 'utf8');
let F;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); F = globalThis.window.FlujosDatos.mapeo; });
describe('Catálogo de flujos · formas de v1', () => {
  test('categorías raíz y subcategorías (parent_id) ordenadas por posición', () => {
    const r = F.categoriasAV1([{ id: 'b', name: 'B', position: 2 }, { id: 'a', name: 'A', position: 1, cover_url: 'c' }, { id: 's', name: 'S', parent_id: 'a', position: 1 }, { id: 'x', name: 'X', is_active: false }]);
    expect(r.categories.map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.categories[0]).toMatchObject({ cover_url: 'c', cover_type: 'image', is_visible: true });
    expect(r.subcategories[0]).toMatchObject({ id: 's', category_ids: ['a'] });
  });
  test('un flujo de catalog_view sale con su categoría raíz, sub, costo por pricing_mode y contadores', () => {
    const cats = { s: { id: 's', parent_id: 'a', name: 'S' }, a: { id: 'a', name: 'A' } };
    expect(F.flujoAV1({ id: 'f', slug: 'x', name: 'X', kind: 'image', pricing_mode: 'fixed', fixed_credits: 50, categoria: 's', es_del_catalogo_comun: false, me_gusta: 2, guardados: 1, corridas: 7, cover_url: 'u' }, cats))
      .toMatchObject({ category_id: 'a', subcategory_id: 's', token_cost: 50, output_type: 'image', flow_image_url: 'u', likes_count: 2, saves_count: 1, run_count: 7, flow_category_type: 'organization' });
    expect(F.flujoAV1({ id: 'g', name: 'Imagen', kind: 'image', pricing_mode: 'observed', creditos_promedio: 0.09, categoria: null, es_del_catalogo_comun: true }, cats)).toMatchObject({ category_id: null, subcategory_id: null, token_cost: 0.09, flow_category_type: 'platform' });
    expect(F.flujoAV1({ id: 'h', name: 'Libre', kind: 'research', pricing_mode: 'free' }, {}).token_cost).toBe(0);
  });
  test('flows.inputs → campos de InputRegistry: kind tipado, requerido de verdad, archivos por el borde, refs con opciones', () => {
    expect(F.entradaACampo({ key: 'prompt', label: 'Prompt', help_text: 'Describe', kind: 'long_text', is_required: true, position: 1, options: [] }))
      .toMatchObject({ key: 'prompt', name: 'prompt', input_type: 'textarea', required: true, description: 'Describe', rows: 4, kind: 'long_text' });
    expect(F.entradaACampo({ key: 'aspecto', kind: 'select', is_required: false, default_value: '1:1', options: [{ label: '1:1', value: '1:1' }] }))
      .toMatchObject({ input_type: 'select', required: false, defaultValue: '1:1', options: [{ label: '1:1', value: '1:1' }] });
    expect(F.entradaACampo({ key: 'ref', kind: 'image' })).toMatchObject({ input_type: 'file', accept: 'image/*', multiUpload: false });
    expect(F.entradaACampo({ key: 'entity_id', kind: 'element_ref' }, { elementos: [{ value: 'e1', label: 'Producto · X' }] }).options).toEqual([{ value: 'e1', label: 'Producto · X' }]);
    expect(F.entradaACampo({ key: 'm', kind: 'market_ref' }, { mercados: [{ value: 'm1', label: 'CO' }] })).toMatchObject({ input_type: 'select', options: [{ value: 'm1', label: 'CO' }] });
    expect(F.entradaACampo({ key: 'on', kind: 'boolean' })).toMatchObject({ input_type: 'toggle' });
    expect(F.entradaACampo({ key: 'n', kind: 'number' })).toMatchObject({ input_type: 'number' });
    expect(F.entradaACampo({ key: 'raro', kind: 'lo_que_sea' })).toMatchObject({ input_type: 'text' });
  });
});
