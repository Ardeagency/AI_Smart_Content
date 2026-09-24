/**
 * L6 (24/09): invitación por correo (ADR-0048) y verificación en dos pasos (ADR-0049),
 * construidos contra el contrato de BD 6d1c421 / backend 5953f12 SIN aplicar todavía.
 * Lo que se prueba: que la consola funciona IGUAL con la base de hoy (sin los campos
 * nuevos) y con la de mañana, y que el token de invitación no se filtra.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

const leer = (f) => fs.readFileSync(f, 'utf8');
let ctx; let inv; let api;

beforeAll(() => {
  const w = { getOrgShortId: (id) => String(id).replace(/-/g, '').slice(-12), getOrgPathPrefix: (id, n) => `/org/${String(id).replace(/-/g, '').slice(-12)}/${n.toLowerCase()}` };
  new Function('window', leer('js/services/ContextoDataService.js'))(w);
  new Function('window', leer('js/services/InvitacionesDataService.js'))(w);
  globalThis.window = globalThis.window || globalThis;
  new Function(leer('js/services/ApiV2.js'))();
  ctx = w.contextoService; inv = w.InvitacionesDatos; api = globalThis.window.apiV2;
});

describe('mi_contexto: las dos formas del contrato', () => {
  const id = '3a1b2c3d-0000-4000-8000-3473d6536060';
  test('base de HOY (sin los campos nuevos): acceso, sin MFA, short/ruta calculados', () => {
    const o = ctx.mapeo.normalizar({ organizations: [{ id, name: 'WAKEUP' }] }).organizations[0];
    expect(o).toMatchObject({ acceso: true, mfa_required: false, mfa_cumplida: true, short: '3473d6536060', ruta: '/org/3473d6536060/wakeup' });
    expect(ctx.pideMfa(o)).toBe(false);
  });
  test('base de MAÑANA: exige MFA y no lo cumple → /mfa', () => {
    const o = ctx.mapeo.normalizar({ organizations: [{ id, name: 'WAKEUP', short: 'abc', ruta: '/org/abc/wakeup', acceso: false, mfa_required: true, mfa_cumplida: false }] }).organizations[0];
    expect(o).toMatchObject({ short: 'abc', ruta: '/org/abc/wakeup', acceso: false });
    expect(ctx.pideMfa(o)).toBe(true);
  });
  test('exige MFA y ya lo cumple → entra', () => {
    const o = ctx.mapeo.normalizar({ organizations: [{ id, name: 'X', acceso: true, mfa_required: true, mfa_cumplida: true }] }).organizations[0];
    expect(ctx.pideMfa(o)).toBe(false);
  });
});

describe('Invitaciones', () => {
  test('token: 64 hex en minúsculas', () => {
    expect(inv.tokenValido('a'.repeat(64))).toBe(true);
    expect(inv.tokenValido('A'.repeat(64))).toBe(false);
    expect(inv.tokenValido('a'.repeat(63))).toBe(false);
  });
  test('contraseña del alta: 12–72, letra y dígito (se valida antes de enviar)', () => {
    expect(inv.motivoContrasena('corta1')).toBe('corta');
    expect(inv.motivoContrasena('a'.repeat(73) + '1')).toBe('larga');
    expect(inv.motivoContrasena('solamenteletras')).toBe('mezcla');
    expect(inv.motivoContrasena('123456789012')).toBe('mezcla');
    expect(inv.motivoContrasena('buenaclave2026')).toBe('');
  });
  test('«todavía no» = la base o el borde aún no tienen la puerta; lo demás es un error de verdad', () => {
    for (const code of ['PGRST202', 'PGRST205', '42883', '42P01']) expect(inv.todaviaNo({ code })).toBe(true);
    expect(inv.todaviaNo({ codigo: 'alta_no_configurada', http: 503 })).toBe(true);
    expect(inv.todaviaNo({ codigo: 'http_404', http: 404 })).toBe(true);
    expect(inv.todaviaNo({ codigo: 'invitacion_no_valida', http: 404 })).toBe(false);
    expect(inv.todaviaNo({ code: '23505' })).toBe(false);
  });
  test('el alta es una petición PÚBLICA al borde con la forma del contrato', () => {
    expect(api.peticiones.altaPorInvitacion('t', 'p', 'n')).toEqual({ method: 'POST', path: '/v1/invitaciones/alta', body: { token: 't', password: 'p', nombre: 'n' }, publica: true });
  });
  test('la vista limpia el token de la URL, no lo registra y no hace signUp', () => {
    const v = leer('js/views/InvitacionView.js');
    expect(v).toMatch(/replaceState\(null, '', '\/invitacion'\)/);
    expect(v).not.toMatch(/console\.[a-z]+\([^)]*_token/);
    expect(v.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/auth\.signUp|signUp\(/);
  });
});

describe('MFA', () => {
  test('el router manda a /mfa cuando la marca lo exige (y no salta con la base de hoy)', () => {
    const r = leer('js/router.js');
    expect(r).toMatch(/pideMfa\(window\.contextoService\.org\(window\.currentOrgId\)\)/);
    expect(r).toMatch(/navigate\(`\/mfa\?next=/);
  });
  test('/mfa no está en el shell ni es pública', () => {
    expect(leer('js/app.js')).toMatch(/register\('\/mfa', this\._lazy\('MfaView'[^;]*\), auth\)/);
    expect(leer('js/shell/Shell.js')).toMatch(/'\/mfa'/);
  });
});
