/**
 * Configuración + Cuenta (L5, 24/09): una URL por pestaña, las viejas redirigen, y
 * las vistas nuevas respetan las reglas del corte (datos por servicio, preferencias
 * solo por guardar_preferencias, nada de diálogos del navegador).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

const APP = fs.readFileSync('js/app.js', 'utf8');
const leer = (f) => fs.readFileSync(f, 'utf8');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let PESTANAS;
beforeAll(() => {
  const w = { location: { pathname: '/org/abc/wakeup/configuracion/general' }, __: (s) => s };
  new Function('window', leer('js/views/ajustes-pestanas.js'))(w);
  PESTANAS = w.PestanasDeAjustes;
});

describe('Rutas de Configuración y Cuenta', () => {
  test('integraciones se registra ANTES que configuracion/:tab (gana el primer patrón)', () => {
    const i = APP.indexOf("'/org/:orgIdShort/:orgNameSlug/configuracion/integraciones'");
    const j = APP.indexOf("'/org/:orgIdShort/:orgNameSlug/configuracion/:tab'");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(j);
  });

  test('/organization y /organization/:tab ya no montan OrganizationView: redirigen', () => {
    expect(APP).not.toMatch(/register\('\/org\/:orgIdShort\/:orgNameSlug\/organization[^']*',\s*this\._lazy/);
    expect(APP).toMatch(/register\('\/org\/:orgIdShort\/:orgNameSlug\/organization\/:tab', redirigir\(/);
  });

  test('cada pestaña vieja de /organization cae en una pestaña nueva que existe', () => {
    const mapa = APP.match(/const DE_ORGANIZATION = (\{[^}]+\})/)[1];
    const destinos = Object.values(new Function(`return ${mapa}`)());
    const slugs = PESTANAS.PESTANAS.configuracion.map((p) => p.slug);
    for (const d of destinos) expect(slugs).toContain(d);
  });

  test('ConfiguracionView traduce todas sus pestañas (menos integraciones, que es vista propia)', () => {
    const cfg = leer('js/views/ConfiguracionView.js');
    const mapa = Object.keys(new Function(`return ${cfg.match(/const SLUG_A_PESTANA = (\{[^}]+\})/)[1]}`)());
    const esperadas = PESTANAS.PESTANAS.configuracion.map((p) => p.slug).filter((s) => s !== 'integraciones');
    expect(mapa.sort()).toEqual(esperadas.sort());
  });

  test('la ruta de una pestaña cuelga de la marca actual', () => {
    expect(PESTANAS.ruta('cuenta', 'preferencias')).toBe('/org/abc/wakeup/cuenta/preferencias');
  });
});

describe('Reglas de las vistas nuevas', () => {
  for (const f of ['js/views/IntegracionesView.js', 'js/views/CuentaView.js', 'js/views/ConfiguracionView.js', 'js/views/ajustes-pestanas.js']) {
    test(`${f}: sin supabase directo ni diálogos del navegador`, () => {
      const c = sinComentarios(leer(f));
      expect(c).not.toMatch(/\.from\(|\.rpc\(|\.schema\(|supabase\./);
      expect(c).not.toMatch(/(?<![\w.])(alert|confirm|prompt)\(|window\.(alert|confirm|prompt)\(/);
    });
  }

  test('idioma y zona solo por guardar_preferencias (ADR-0040)', () => {
    expect(leer('js/services/ShellDataService.js')).toMatch(/rpc\('guardar_preferencias'/);
    const auth = leer('js/services/AuthService.js');
    expect(auth).toMatch(/rpc\('guardar_preferencias'/);
    expect(auth).not.toMatch(/from\('profiles'\)\s*\.update\(\{\s*locale/);
  });
});
