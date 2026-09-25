/**
 * BaseView ya no pinta la cabecera de v1 ni pide el perfil: el shell es dueño de la cabecera y
 * el perfil sale de mi_contexto(). Antes, cada vista pedía profiles?select=id,full_name,email,role
 * y la base nueva devolvía 400: no tiene email ni role en profiles (producción, 25/09).
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';

const BASE = fs.readFileSync('js/views/BaseView.js', 'utf8');
const codigo = BASE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('BaseView: sin cabecera de v1', () => {
  test('no consulta profiles', () => {
    expect(codigo).not.toMatch(/from\(\s*['"]profiles['"]\s*\)/);
  });

  test('updateHeader es un gancho vacío (las vistas lo sobreescriben con super)', () => {
    expect(codigo).toMatch(/async updateHeader\(\)\s*\{\s*\}/);
  });

  test('fuera los métodos que solo servían a la cabecera de v1', () => {
    expect(codigo).not.toMatch(/updateExistingHeader\s*\(|setupHeaderUserDropdown\s*\(/);
  });
});
