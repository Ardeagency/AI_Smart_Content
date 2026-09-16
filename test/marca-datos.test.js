/**
 * MarcaDataService: la traducción v1 ⇄ base nueva de la página Mi Marca.
 *
 * Contrato de BD del 16/09 (docs/contratos/marca.md): brand_colors.hex en
 * minúsculas con '#', UN primary; brand_fonts único por (org, role) y la
 * tipografía «para imágenes» de v1 es el rol display; brand_assets con kind
 * (document = lo que v1 llamaba identity); markets = brand_containers con
 * columnas en inglés; integrations.connections con status en vez de is_active.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/MarcaDataService.js'), 'utf8');
let M;

beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  new Function(FUENTE)();
  M = globalThis.window.MarcaDatos.mapeo;
});

describe('Mi Marca · organización', () => {
  test('el nombre grande es organizations.name y el slogan es tagline', () => {
    const v1 = M.organizacionAV1({ id: 'o1', name: 'WAKEUP', legal_name: 'Wakeup SAS', tagline: 'Despierta', logo_url: null, mfa_required: false });
    expect(v1.brand_name_oficial).toBe('WAKEUP');
    expect(v1.brand_slogan).toBe('Despierta');
    expect(v1.legal_name).toBe('Wakeup SAS');
    // La URL del logo se deriva del archivo embebido cuando no hay URL externa.
    expect(M.organizacionAV1({ id: 'o', name: 'W', logo_url: null, logo_file_id: 'f1', logo: { public_url: 'https://media-v2/pub/o/l.png' } }).logo_url).toBe('https://media-v2/pub/o/l.png');
  });
  test('el parche traduce nombres de v1 y nunca manda plan ni columnas inventadas', () => {
    expect(M.organizacionABase({ brand_name_oficial: ' Nueva ', brand_slogan: 'x', level_of_autonomy: 3, plan: 'pro' })).toEqual({ name: 'Nueva', tagline: 'x' });
    expect(M.organizacionABase({ logo_url: '' })).toEqual({ logo_url: null, logo_file_id: null });
    // Una sola fuente de logo (CHECK org_logo_una_sola_fuente): archivo manda y vacía la URL externa.
    expect(M.organizacionABase({ logo_file_id: 'f1', logo_url: 'https://x/l.png' })).toEqual({ logo_file_id: 'f1', logo_url: null });
    expect(M.organizacionABase({ logo_url: 'https://x/l.png' })).toEqual({ logo_url: 'https://x/l.png', logo_file_id: null });
    expect(M.organizacionABase({ brand_name_oficial: '   ' })).toEqual({});
  });
});

describe('Mi Marca · colores', () => {
  test('hex siempre en minúsculas con #, o null', () => {
    expect(M.hexNormal('#FF6450')).toBe('#ff6450');
    expect(M.hexNormal('ff6450')).toBe('#ff6450');
    expect(M.hexNormal('#fff')).toBeNull();
    expect(M.hexNormal('')).toBeNull();
  });
  test('la fila de la base sale con hex_value/color_role para la vista', () => {
    expect(M.colorAV1({ id: 'c1', organization_id: 'o1', role: 'primary', hex: '#000000', name: null, position: 0 })).toMatchObject({ hex_value: '#000000', color_role: 'primary' });
  });
  test('primary solo se reparte una vez; después sigue el anillo de roles', () => {
    expect(M.siguienteRolColor([])).toBe('primary');
    expect(M.siguienteRolColor([{ role: 'primary' }])).toBe('secondary');
    expect(M.siguienteRolColor([{ color_role: 'primary' }, { role: 'secondary' }, { role: 'accent' }])).toBe('highlight');
  });
});

describe('Mi Marca · tipografía y archivos', () => {
  test('el rol display es la tipografía «para imágenes» de v1', () => {
    expect(M.fuenteAV1({ id: 'f1', organization_id: 'o1', role: 'display', family: 'Poppins', weights: ['600'], fallback_stack: null })).toMatchObject({ font_usage: 'images', font_family: 'Poppins', font_weight: '600', fallback_font: 'sans-serif' });
    expect(M.fuenteAV1({ role: 'body', family: 'Inter', weights: [] }).font_usage).toBe('body');
  });
  test('document es identidad; la URL viene de la fila o de la galería por file_id', () => {
    const urls = { 'ar1': 'https://media-v2.aismartcontent.io/in/o1/x.pdf' };
    const a = M.assetAV1({ id: 'a1', organization_id: 'o1', kind: 'document', name: 'manual.pdf', mime_type: 'application/pdf', bytes: 10, file_id: 'ar1', url: null, is_primary: false, created_at: 't' }, urls);
    expect(a).toMatchObject({ asset_type: 'identity', file_name: 'manual.pdf', file_type: 'application/pdf', file_url: urls.ar1, file_size: 10 });
    expect(M.assetAV1({ id: 'a2', kind: 'photo', name: 'p.png', url: 'https://x/p.png', file_id: null }).file_url).toBe('https://x/p.png');
    expect(M.assetAV1({ id: 'a3', kind: 'photo', name: 'p.png', file_id: 'nadie' }, urls).file_url).toBeNull();
  });
  test('el kind se decide por el propósito y, si no, por el tipo del archivo', () => {
    expect(M.kindDeArchivo({ name: 'l.png', type: 'image/png' }, { logo: true })).toBe('logo');
    expect(M.kindDeArchivo({ name: 'm.pdf', type: 'application/pdf' }, { identidad: true })).toBe('document');
    expect(M.kindDeArchivo({ name: 'v.mp4', type: 'video/mp4' })).toBe('video');
    expect(M.kindDeArchivo({ name: 'a.psd', type: '' })).toBe('photo');
    expect(M.kindDeArchivo({ name: 'x.txt', type: 'text/plain' })).toBe('document');
  });
});

describe('Mi Marca · mercado (brand_containers de v1) e integraciones', () => {
  test('las 14 columnas del panel INFO tienen columna en markets y vuelven con su nombre de v1', () => {
    expect(Object.keys(M.MERCADO_V1_A_BASE)).toHaveLength(14);
    const v1 = M.mercadoAV1({ id: 'm1', organization_id: 'o1', slug: 'co', name: 'Colombia', countries: ['CO'], languages: ['es'], core_niche: 'cafe', sub_niches: [], archetype: null, value_proposition: 'v', mission_vision: null, keywords: ['k'], banned_words: [], strategic_goals: [], creative_brief: 'b', verbal_dna: { tono: 'x' }, visual_dna: null, is_primary: true });
    expect(v1).toMatchObject({ nombre_marca: 'Colombia', mercado_objetivo: ['CO'], idiomas_contenido: ['es'], nicho_core: 'cafe', palabras_clave: ['k'], creative_brief: 'b', verbal_dna: { tono: 'x' }, is_primary: true });
  });
  test('guardar un campo traduce la columna y rechaza lo que ya no existe', () => {
    expect(M.campoMercadoABase('palabras_prohibidas', ['x'])).toEqual({ columna: 'banned_words', valor: ['x'] });
    expect(M.campoMercadoABase('marketing_budget', 100)).toBeNull();
  });
  test('una conexión se lee como la integración de v1: meta se llama facebook en la vista, is_active = status active', () => {
    const c = M.conexionAV1({ id: 'i1', organization_id: 'o1', platform: 'meta', status: 'active', account_name: 'Wakeup Page', expires_at: null, last_used_at: 't1', last_refreshed_at: 't0' });
    expect(c).toMatchObject({ platform: 'facebook', plataforma: 'meta', is_active: true, external_account_name: 'Wakeup Page', last_sync_at: 't1' });
    expect(M.conexionAV1({ platform: 'google', status: 'expired' }).is_active).toBe(false);
  });
});
