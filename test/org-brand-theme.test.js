// @vitest-environment jsdom
/**
 * OrgBrandTheme toma los colores de mi_contexto().organizations[].colores y NO consulta
 * brand_colors (en la base nueva la columna es `hex`: `select=hex_value` daba 400 en cada
 * carga de producción, 25/09).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

const leer = (f) => fs.readFileSync(f, 'utf8');
const FUENTE = leer('js/services/OrgBrandTheme.js');
let pedidos = [];

beforeAll(() => {
  new Function(leer('js/utils/brand-colors.js'))();
  window.contextoService = {
    cargar: async (op) => { pedidos.push(op); return { organizations: [{ id: 'org-1', colores: [{ hex: '#ff6450', rol: 'primario' }, { hex: 'ff6450' }, { hex: '#1a2b3c' }, { hex: 'no-es-hex' }] }] }; },
  };
  window.supabase = { from: () => { throw new Error('OrgBrandTheme no debe consultar tablas'); } };
  new Function(FUENTE)();
});

describe('OrgBrandTheme con la base nueva', () => {
  test('no consulta brand_colors ni hex_value', () => {
    const codigo = FUENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/brand_colors|hex_value|\.from\(/);
  });

  test('aplica el color principal desde mi_contexto (normaliza y deduplica)', async () => {
    await window.OrgBrandTheme.applyOrgBrandTheme('org-1');
    // --org-primary es la versión ajustada para UI (BrandColors.getBrandUIPalette): no el hex crudo.
    expect(document.documentElement.style.getPropertyValue('--org-primary').trim()).toMatch(/^#[0-9a-f]{6}$/i);
    expect(window.OrgBrandTheme.getLastBrandHexes()).toEqual(['#ff6450', '#1a2b3c']);
  });

  test('pide el contexto FRESCO (lo recién guardado se ve al momento)', () => {
    expect(pedidos.some((p) => p && p.fresco === true)).toBe(true);
  });

  test('una marca sin colores limpia el tema', async () => {
    window.OrgBrandTheme.clearOrgBrandTheme();
    await window.OrgBrandTheme.applyOrgBrandTheme('otra-org');
    expect(document.documentElement.style.getPropertyValue('--org-primary')).toBe('');
  });
});
