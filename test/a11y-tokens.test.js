/**
 * Contraste AA de los tokens de texto sobre los fondos, calculado desde css/bundle.css
 * (la misma matriz que mide `npm run verificar:rutas -- --a11y` en el navegador). Así el gate
 * lo exige sin servidor. La transparencia se compone sobre --bg-base, que es la página.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import { AA, TEXTOS, FONDOS } from '../scripts/a11y-cdp.mjs';

const CSS = fs.readFileSync('css/bundle.css', 'utf8');
// Tokens de los bloques :root, en orden: el último gana (como en la cascada).
const TOKENS = {};
for (const bloque of CSS.matchAll(/:root\s*\{([^}]*)\}/g)) {
  for (const m of bloque[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) TOKENS[m[1]] = m[2].trim();
}
function color(nombre, profundidad = 0) {
  const v = TOKENS[nombre];
  if (!v || profundidad > 5) throw new Error(`token sin valor: ${nombre}`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return color(ref[1], profundidad + 1);
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) { const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] == null ? 1 : +rgba[4] };
  throw new Error(`formato no soportado en ${nombre}: ${v}`);
}
const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
const L = (c) => { const t = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]; };
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('a11y: contraste AA de los tokens', () => {
  const pagina = color('--bg-base');
  test.each(FONDOS.flatMap((f) => TEXTOS.map((t) => [t, f])))('%s sobre %s ≥ 4.5', (t, f) => {
    const bg = sobre(color(f), pagina);
    expect(ratio(sobre(color(t), bg), bg)).toBeGreaterThanOrEqual(AA);
  });

  test('el cálculo coincide con el de referencia (blanco/negro = 21)', () => {
    expect(ratio({ r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(21, 5);
  });
});
