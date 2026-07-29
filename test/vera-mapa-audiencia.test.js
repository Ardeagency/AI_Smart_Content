/**
 * El mapa de audiencia: que resalte los países que tienen audiencia, y solo esos.
 *
 * El fallo real (2026-07-29): el contrato admite ISO-2 o ISO-3, pero el pintor
 * solo traducía el de tres letras. Con "CO" ningún país casaba, los 195 quedaban
 * en 0, y una escala de color donde todos los valores son iguales devuelve el
 * tope para todos: el planeta entero encendido del color de la marca, diciendo
 * lo contrario del dato (83% en Colombia).
 *
 * Se prueba la TRADUCCIÓN, que es donde estaba el fallo — no el dibujo.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/views/dashboard/BrandGrid.mixin.js'), 'utf8');

function cargarVista() {
  globalThis.DashboardView = function DashboardView() {};
  globalThis.__ = (s, vars) =>
    String(s).replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  globalThis.window = globalThis.window || {};
  new Function(FUENTE)();
  const vista = Object.create(globalThis.DashboardView.prototype);
  vista._esc = (s) => String(s == null ? '' : s);
  vista._gridBrandHexes = () => ['#F79E1B'];
  return vista;
}

// El bloque tal como lo escribió Vera: ISO-2 y fracciones.
const BLOQUE_REAL = {
  type: 'choropleth',
  data: [
    { code: 'CO', name: 'Colombia', value: 0.834 },
    { code: 'US', name: 'Estados Unidos', value: 0.048 },
    { code: 'ES', name: 'España', value: 0.028 },
    { code: 'VE', name: 'Venezuela', value: 0.02 },
  ],
};

describe('traducción de códigos de país', () => {
  const vista = cargarVista();

  test('ISO-2 e ISO-3 llevan al mismo país', () => {
    expect(vista._geoNumPorCodigo('CO')).toBe('170');
    expect(vista._geoNumPorCodigo('COL')).toBe('170');
    expect(vista._geoNumPorCodigo('US')).toBe(vista._geoNumPorCodigo('USA'));
    expect(vista._geoNumPorCodigo('es')).toBe('724');   // minúsculas y espacios
    expect(vista._geoNumPorCodigo(' MX ')).toBe('484');
  });

  test('un código desconocido no se inventa', () => {
    expect(vista._geoNumPorCodigo('XX')).toBeNull();
    expect(vista._geoNumPorCodigo('')).toBeNull();
    expect(vista._geoNumPorCodigo(null)).toBeNull();
  });

  test('un id numérico pasa tal cual, con sus tres cifras', () => {
    expect(vista._geoNumPorCodigo('170')).toBe('170');
    expect(vista._geoNumPorCodigo('32')).toBe('032');
  });
});

describe('los datos del mapa', () => {
  test('el bloque real de Vera mapea sus cuatro países', () => {
    const vista = cargarVista();
    const d = vista._geoDatos(BLOQUE_REAL);
    expect(d.mapeados).toBe(4);
    expect(d.sinMapear).toEqual([]);
    expect(Object.keys(d.valPorNum).sort()).toEqual(['170', '724', '840', '862']);
  });

  test('las fracciones se leen como porcentajes', () => {
    const vista = cargarVista();
    const d = vista._geoDatos(BLOQUE_REAL);
    expect(d.valPorNum['170']).toBeCloseTo(83.4, 5);
    expect(d.maxPct).toBeCloseTo(83.4, 5);
  });

  test('los porcentajes ya escritos como tales no se multiplican otra vez', () => {
    const vista = cargarVista();
    const d = vista._geoDatos({ data: [{ code: 'CO', value: 83.4 }, { code: 'US', value: 4.8 }] });
    expect(d.valPorNum['170']).toBeCloseTo(83.4, 5);
  });

  test('un país fuera de la tabla se reporta y no contamina la escala', () => {
    const vista = cargarVista();
    const d = vista._geoDatos({ data: [{ code: 'CO', value: 0.9 }, { code: 'ZZ', value: 0.1 }] });
    expect(d.sinMapear).toEqual(['ZZ']);
    expect(d.mapeados).toBe(1);
  });

  test('si NINGÚN país casa, mapeados es 0 — el pintor cae a las barras', () => {
    const vista = cargarVista();
    const d = vista._geoDatos({ data: [{ code: 'ZZ', value: 0.9 }, { code: 'QQ', value: 0.1 }] });
    expect(d.mapeados).toBe(0);
    // Es la condición que evita pintar el mundo entero encendido.
    expect(d.maxPct).toBe(0);
  });

  test('sin datos no revienta', () => {
    const vista = cargarVista();
    expect(vista._geoDatos({}).mapeados).toBe(0);
    expect(vista._geoDatos({ data: [] }).mapeados).toBe(0);
  });
});

describe('las barras de respaldo', () => {
  test('muestran 83.4%, no 0.834%', () => {
    const vista = cargarVista();
    const html = vista._geoBarsHtml(BLOQUE_REAL);
    expect(html).toContain('83.4%');
    expect(html).not.toContain('0.834%');
  });

  test('ordenan de mayor a menor', () => {
    const vista = cargarVista();
    const html = vista._geoBarsHtml(BLOQUE_REAL);
    expect(html.indexOf('Colombia')).toBeLessThan(html.indexOf('Venezuela'));
  });
});
