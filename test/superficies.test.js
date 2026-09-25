/**
 * Superficies (25/09, Figma › Componentes › Tarjeta · Chip · Imagen · Avatar).
 * 5 niveles de elevación + chip + media + avatar, y los controles a 32/40/48.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('css/bundle.css', 'utf8');
const regla = (sel) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? null : css.slice(i, css.indexOf('}', i));
};

describe('superficies: 5 niveles y piezas únicas', () => {
  test('los 5 niveles existen con su receta', () => {
    expect(regla('.superficie--1')).toMatch(/--white-2/);
    expect(regla('.superficie--2')).toMatch(/--border-hairline-strong/);
    expect(regla('.superficie--3')).toMatch(/--glass-blur/);
    expect(regla('.superficie--4')).toMatch(/--sombra-flotante/);
    expect(regla('.superficie--5')).toMatch(/--sombra-modal/);
    expect(regla('.superficie--5')).toMatch(/--bg-modal/);
  });
  test('el modal es más claro que el flotante (en oscuro se eleva aclarando)', () => {
    const hex = (t) => parseInt(css.match(new RegExp(`--${t}:\\s*#([0-9a-f]{6})`, 'i'))[1].slice(0, 2), 16);
    expect(hex('bg-modal')).toBeGreaterThan(hex('bg-card'));
  });
  test('solo dos sombras de elevación; las viejas no vuelven', () => {
    expect(css).toMatch(/--sombra-flotante:/);
    expect(css).toMatch(/--sombra-modal:/);
    for (const v of ['shadow-card', 'shadow-hover', 'shadow-floating']) expect(css).not.toMatch(new RegExp(`--${v}\\b`));
  });
  test('controles a 32 · 40 · 48', () => {
    expect(css).toMatch(/--control-sm:\s*32px/);
    expect(css).toMatch(/--control-md:\s*40px/);
    expect(css).toMatch(/--control-lg:\s*48px/);
    expect(regla('.btn')).toMatch(/min-height:\s*var\(--control-md\)/);
  });
  test('chip, media (4 proporciones) y avatar (persona y marca)', () => {
    for (const s of ['.chip', '.chip--activo', '.media', '.media--1x1', '.media--4x5', '.media--16x9', '.media--9x16', '.avatar', '.avatar--marca'])
      expect(regla(s), `falta ${s}`).not.toBeNull();
  });
});
