/**
 * scripts/verificar-rutas.mjs: qué rutas recorre. Las de sesión NUNCA: un signOut revoca la
 * sesión de prueba en el servidor y /mfa enrola un factor TOTP real.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { rutasDeApp } from '../scripts/verificar-rutas.mjs';

const APP = fs.readFileSync(path.join(process.cwd(), 'js/app.js'), 'utf8');
const ORG = '/org/abc123/marca';
const rutas = rutasDeApp(APP, ORG);

describe('verificar-rutas: la lista sale de app.js', () => {
  test('nunca visita las rutas de sesión', () => {
    for (const r of ['/login', '/signin', '/mfa', '/verification', '/cambiar-contrasena']) expect(rutas).not.toContain(r);
  });

  test('las de marca van con la marca de la sesión y sin parámetros sueltos', () => {
    expect(rutas).toContain(`${ORG}/vera`);
    expect(rutas.every((r) => !r.includes(':'))).toBe(true);
  });

  test('las pestañas de Configuración se recorren una a una', () => {
    for (const t of ['general', 'facturacion', 'miembros', 'actividad']) expect(rutas).toContain(`${ORG}/configuracion/${t}`);
  });

  test('la versión sin marca de una ruta con marca no se repite', () => {
    expect(rutas).not.toContain('/vera');
  });

  test('cubre cada ruta sin parámetros de app.js salvo las excluidas', () => {
    const registradas = [...new Set([...APP.matchAll(/register\('([^']+)'/g)].map((m) => m[1]))];
    expect(registradas.length).toBeGreaterThan(20);
    const libres = registradas.filter((r) => r.startsWith('/org/') && !/:/.test(r.replace('/org/:orgIdShort/:orgNameSlug', '')));
    for (const r of libres) expect(rutas).toContain(r.replace('/org/:orgIdShort/:orgNameSlug', ORG));
  });
});
