/**
 * SaaS CERRADO (FASE 2 · L1, 24/09): no hay puerta de alta ni sesión anónima, toda
 * ruta que no sea de acceso exige sesión, y sin sesión se va a /login recordando el
 * destino (`?next=`) — que solo puede ser una ruta interna (nada de open redirect).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

const APP = fs.readFileSync('js/app.js', 'utf8');
const INDEX = fs.readFileSync('index.html', 'utf8');

/** Las rutas de acceso: las ÚNICAS que se sirven sin sesión. */
const PUBLICAS = ['/', '/login', '/signin', '/recuperar', '/cambiar-contrasena', '/verification', '/invitacion/:token'];

describe('Sin puertas públicas', () => {
  test('no existen /demo ni /registro', () => {
    expect(APP).not.toMatch(/register\(\s*'\/demo'/);
    expect(APP).not.toMatch(/SECRET_SIGNUP|\/registro\//);
    expect(fs.existsSync('js/views/DemoEntryView.js')).toBe(false);
    expect(fs.existsSync('js/views/SecretSignupView.js')).toBe(false);
    expect(INDEX).not.toMatch(/DemoEntryView/);
  });

  test('solo las rutas de acceso se registran sin sesión', () => {
    const sinSesion = [...APP.matchAll(/r\.register\(\s*'([^']+)'[^;]*?,\s*pub\s*\)/g)].map((m) => m[1]);
    expect(sinSesion.sort()).toEqual([...PUBLICAS].sort());
  });

  test('toda ruta registrada declara pub o auth', () => {
    const sinOpciones = [...APP.matchAll(/r\.register\(([^;]*?)\);/g)]
      .map((m) => m[1].replace(/\/\/[^\n]*/g, '')).filter((args) => !/,\s*(pub|auth)\s*$/.test(args.trim()));
    expect(sinOpciones).toEqual([]);
  });

  test('el viewport deja hacer zoom (WCAG 1.4.4)', () => {
    expect(INDEX).not.toMatch(/user-scalable=no|maximum-scale=1/);
  });
});

describe('?next= solo acepta rutas internas', () => {
  let router;
  let navegado;
  beforeAll(() => {
    const w = {
      location: { origin: 'https://console.aismartcontent.io', pathname: '/org/abc/wakeup/production', search: '?run=9' },
      addEventListener() {}, scrollY: 0,
      history: { pushState() {}, replaceState() {} },
    };
    globalThis.window = w;
    globalThis.document = { getElementById: () => null };
    new Function('window', 'document', fs.readFileSync('js/router.js', 'utf8'))(w, globalThis.document);
    router = w.router;
    router.navigate = (p) => { navegado = p; };
  });

  test.each([
    ['/org/abc/wakeup/production?run=9', true],
    ['/vera', true],
    ['//evil.com/x', false],
    ['/\\evil.com', false],
    ['https://evil.com', false],
    ['javascript:alert(1)', false],
    ['', false],
  ])('rutaInterna(%j) = %s', (ruta, esperado) => {
    expect(window.rutaInterna(ruta)).toBe(esperado);
  });

  test('sin sesión va a /login con el destino y el motivo', () => {
    router.irALogin('sesion');
    const u = new URL(navegado, 'https://x');
    expect(u.pathname).toBe('/login');
    expect(u.searchParams.get('next')).toBe('/org/abc/wakeup/production?run=9');
    expect(u.searchParams.get('motivo')).toBe('sesion');
  });

  test('desde el propio login no se anida ?next=', () => {
    window.location.pathname = '/login'; window.location.search = '?next=%2Fvera';
    router.irALogin();
    expect(navegado).toBe('/login');
  });
});
