/**
 * Botones (25/09, Figma › Componentes › Button/1 · 2 · 3): SOLO 3 tipos.
 *   .btn--blanco (principal) · .btn--oscuro (secundario) · .btn--gris (terciario)
 *   Modificadores: .btn--peligro (texto error, solo sobre gris) · --sm · --lg · --bloque · --icono
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function archivos(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}
const FUENTES = [...archivos('css', '.css'), ...archivos('js', '.js'), 'index.html'].map((f) => [f, fs.readFileSync(f, 'utf8')]);

const RETIRADAS = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-danger-ghost', 'btn-sm', 'btn-lg', 'btn-block', 'btn-icon', 'btn-icon-sm', 'btn-icon-xs'];

describe('botones: solo 3 tipos', () => {
  test.each(RETIRADAS)('la clase %s no vuelve', (clase) => {
    const re = new RegExp(`(?<![\\w-])\\.?${clase}(?![\\w-])`);
    expect(FUENTES.filter(([, t]) => re.test(t)).map(([f]) => f)).toEqual([]);
  });

  test('btn--peligro va siempre con btn--gris o btn--icono en el marcado', () => {
    const malos = [];
    for (const [f, t] of FUENTES) {
      if (f.endsWith('.css')) continue;
      for (const m of t.matchAll(/(["'`])([^"'`]*\bbtn--peligro\b[^"'`]*)\1/g))
        if (!/\bbtn--(gris|icono)\b/.test(m[2]) && !/\$\{/.test(m[2])) malos.push(`${f}: ${m[2]}`);
    }
    expect(malos).toEqual([]);
  });

  test('bundle.css define los 3 tipos y ningún otro .btn--<tipo> de color', () => {
    const css = fs.readFileSync('css/bundle.css', 'utf8');
    for (const t of ['blanco', 'oscuro', 'gris']) expect(css).toMatch(new RegExp(`\\.btn--${t}\\s*\\{`));
    const tipos = new Set([...css.matchAll(/\.btn--([a-z]+)\b/g)].map((m) => m[1]));
    expect([...tipos].sort()).toEqual(['blanco', 'bloque', 'gris', 'icono', 'lg', 'oscuro', 'peligro', 'sm']);
  });

  test('un solo badge: .badge + 4 estados + --sm; los viejos no vuelven', () => {
    const css = fs.readFileSync('css/bundle.css', 'utf8');
    for (const e of ['exito', 'advertencia', 'error', 'info', 'sm']) expect(css).toMatch(new RegExp(`\\.badge--${e}\\s*\\{`));
    for (const v of ['badge-success', 'badge-warning', 'badge-error'])
      expect(FUENTES.filter(([, t]) => new RegExp(`(?<![\\w-])${v}(?![\\w-])`).test(t)).map(([f]) => f)).toEqual([]);
  });
});
