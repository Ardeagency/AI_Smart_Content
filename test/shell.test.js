/**
 * Guardia del cascarón (L3, 24/09): un solo shell (js/shell/Shell.js) en lugar de
 * Navigation.js + 3 mixins. Lo que tiene que seguir siendo cierto:
 * - el shell no lee la base directo (todo por ShellDatos) ni abre diálogos del navegador;
 * - su CSS es solo tokens (cero hex);
 * - ninguna ruta del menú está «en obras» (el menú de un SaaS no enseña obras);
 * - se carga en diferido por lazy-nav y bundle.css importa shell.css, no navigation.css;
 * - el contrato con las vistas sigue en pie (ids y API de window.appNavigation).
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';

const SHELL = fs.readFileSync('js/shell/Shell.js', 'utf8');
const CSS = fs.readFileSync('css/modules/shell.css', 'utf8');

describe('Shell', () => {
  test('Navigation.js y sus mixins ya no existen', () => {
    expect(fs.existsSync('js/components/Navigation.js')).toBe(false);
    expect(fs.existsSync('js/components/navigation')).toBe(false);
    expect(fs.existsSync('css/modules/navigation.css')).toBe(false);
  });

  test('lazy-nav carga el shell y bundle.css importa shell.css', () => {
    const lazy = fs.readFileSync('js/utils/lazy-nav.js', 'utf8');
    expect(lazy).toMatch(/'\/js\/shell\/Shell\.js'/);
    expect(lazy).toMatch(/'\/js\/services\/ShellDataService\.js'/);
    expect(lazy).not.toMatch(/Navigation\.js|\.mixin\.js/);
    const bundle = fs.readFileSync('css/bundle.css', 'utf8');
    expect(bundle).toMatch(/@import url\('modules\/shell\.css/);
    expect(bundle).not.toMatch(/@import url\('modules\/navigation\.css/);
  });

  test('sin lecturas directas a la base ni diálogos del navegador', () => {
    const codigo = SHELL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/\.from\(|\.rpc\(|\.schema\(/);
    expect(codigo).not.toMatch(/(?<![\w.])(alert|confirm|prompt)\(|window\.(alert|confirm|prompt)\(/);
  });

  test('CSS solo con tokens: cero hex', () => {
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('toda ruta del menú existe en el router', () => {
    // Antes: «ninguna ruta del menú está en obras» (js/en-obras.js). Las pantallas en
    // obras se BORRARON (L8, 24/09): la regla útil ahora es que el menú no lleve a un 404.
    const app = fs.readFileSync('js/app.js', 'utf8');
    const registradas = new Set([...app.matchAll(/r\.register\('([^']+)'/g)].map((m) => m[1]));
    const menu = SHELL.slice(SHELL.indexOf('const MENU = ['), SHELL.indexOf('const TITULOS'));
    // Las marcadas `pronto: true` se listan sin enlace (no navegan): no cuentan.
    const rutas = menu.split('\n').filter((l) => !/pronto: true/.test(l))
      .flatMap((l) => [...l.matchAll(/ruta: '([^']+)'/g)].map((m) => m[1]));
    expect(rutas.length).toBeGreaterThan(8);
    const sinRuta = rutas.filter((r) => !registradas.has('/org/:orgIdShort/:orgNameSlug/' + r) && !registradas.has('/' + r));
    expect(sinRuta).toEqual([]);
  });

  test('contrato con las vistas', () => {
    for (const id of ['appHeader', 'headerTitle', 'headerProductionSlot', 'sideNavigation', 'navTokensValue', 'navPlanCard', 'headerNotificationsBadge']) {
      expect(SHELL).toContain(`id="${id}"`);
    }
    for (const api of ['render()', 'loadCreditsFromDb(', 'collapseForImmersive()', 'restoreFromImmersive()', 'getUserSidebarRoute(', 'getOrgBasePath()', '_resolveActionUrl(']) {
      expect(SHELL).toContain(api);
    }
    expect(SHELL).toMatch(/window\.appNavigation = new Shell\(\)/);
  });
});
