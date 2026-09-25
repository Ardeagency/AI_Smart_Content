/**
 * Escalas (25/09, Figma › Tokens y estilos de texto). Nada se escribe a mano:
 *   tamaño  → --font-size-xs…4xl (11·12·14·16·18·20·24·32·40) o --fs-* (títulos adaptables); em relativo permitido
 *   peso    → --font-weight-light/regular/medium/bold (300·400·500·700)
 *   interlineado → --leading-none/tight/normal (1 · 1.25 · 1.5)
 *   tracking → --tracking-mono (0.04em) / --tracking-tight (-0.01em) / 0
 *   radio   → --radius-xs/sm/md/lg/pill (4·8·12·16·píldora), 0 o 50 % (círculo)
 *   familias → --font-texto (Spline Sans) · --font-mono (Spline Sans Mono) · --font-display (Apfel Grotezk)
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
const DECL = [];
for (const f of archivos('css', '.css')) {
  const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const b of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (b[1].includes('@font-face')) continue;
    for (const d of b[2].matchAll(/(?<![\w-])(font-size|font-weight|line-height|letter-spacing|border-radius|font-family)\s*:\s*([^;{}]+)/g))
      DECL.push([f, d[1], d[2].replace(/\s*!important\s*$/, '').trim()]);
  }
}
const libre = (v) => /^(inherit|initial|unset|0|normal)$/.test(v);
const malos = (prop, ok) => DECL.filter(([, p, v]) => p === prop && !libre(v) && !ok(v)).map(([f, , v]) => `${f}: ${v}`);

describe('escalas: tipografía y radios solo por token', () => {
  test('font-size: token, --fs-*, em relativo o clamp()', () => {
    expect(malos('font-size', (v) => /^var\(--(font-size-|fs-)/.test(v) || /^[\d.]+em$/.test(v) || v.startsWith('clamp('))).toEqual([]);
  });
  test('font-weight: solo los 4 tokens', () => {
    expect(malos('font-weight', (v) => /^var\(--font-weight-(light|regular|medium|bold)\)$/.test(v))).toEqual([]);
  });
  test('line-height: solo los 3 tokens', () => {
    expect(malos('line-height', (v) => /^var\(--leading-(none|tight|normal)\)$/.test(v) || /^[\d.]+em$/.test(v))).toEqual([]);
  });
  test('letter-spacing: solo tokens', () => {
    expect(malos('letter-spacing', (v) => /^var\(--tracking-(mono|tight)\)$/.test(v))).toEqual([]);
  });
  test('border-radius: tokens de la escala, 50 % o combinaciones de ellos', () => {
    const parte = (x) => x === '0' || x === '50%' || /^var\(--radius-(xs|sm|md|lg|pill)(,[^)]*)?\)$/.test(x);
    expect(malos('border-radius', (v) => v.startsWith('calc(') || v.split(/\s+/).every(parte))).toEqual([]);
  });
  test('font-family: solo las 3 familias (e iconos)', () => {
    expect(malos('font-family', (v) => /^var\(--font-(texto|mono|display)\)$/.test(v) || /Font Awesome|Phosphor|FontAwesome|monospace$/.test(v))).toEqual([]);
  });
  test('tokens de la escala definidos con sus valores', () => {
    const css = fs.readFileSync('css/bundle.css', 'utf8');
    for (const [t, v] of [['radius-xs', '4px'], ['radius-sm', '8px'], ['radius-md', '12px'], ['radius-lg', '16px'], ['leading-tight', '1.25'], ['leading-normal', '1.5'], ['font-weight-light', '300'], ['font-weight-bold', '700']])
      expect(css).toMatch(new RegExp(`--${t}:\\s*${v.replace('.', '\\.')}`));
    expect(css).toMatch(/--font-texto:\s*'Spline Sans'/);
    for (const r of ['glass-radius', 'radius-media', 'modal-radio', 'modal-panel-radius', 'font-weight-semibold']) expect(css).not.toMatch(new RegExp(`--${r}\\b`));
  });
});
