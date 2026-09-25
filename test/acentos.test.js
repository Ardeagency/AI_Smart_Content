/**
 * Sistema de color (25/09, Figma › Tokens): SOLO 3 acentos y 4 sub-acentos.
 *   Acentos:     --accent (blanco) · --espectro (plataforma) · --org-* (mode-org, OrgBrandTheme)
 *   Sub-acentos: --color-success · --color-warning · --color-error · --color-info (color plano)
 * Esta guardia impide que vuelvan los acentos retirados y los nombres duplicados que se fusionaron:
 * un color nuevo para destacar algo es --accent; para un estado, su sub-acento.
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
const FUENTES = [...archivos('css', '.css'), ...archivos('js', '.js'), 'index.html'];
const CSS = fs.readFileSync('css/bundle.css', 'utf8');

// Retirados el 25/09. Si uno hace falta, el rol ya tiene nombre: ver el comentario de cada grupo.
const RETIRADOS = [
  // acentos que no son los 3 → --accent / sub-acento
  'accent-brand', 'accent-cta', 'accent-warm', 'accent-yellow', 'accent-secondary', 'primary-color',
  'builder-accent', 'warm', 'warm-1', 'warm-2', 'warm-3', 'warm-10', 'warm-20', 'warm-30', 'warm-50', 'warm-strong',
  'pf-1', 'pf-7', 'platform-gradient', 'gradiente-principal', 'gradiente-profundo', 'gradiente-vivo',
  'brand-gradient', 'brand-gradient-1', 'brand-warm-1', 'living-warm-1', 'color-critical', 'dev-primary',
  // duplicados v1 de mode-org → --org-*
  'brand-primary', 'brand-primary-rgb', 'brand-primary-brillo', 'brand-gradient-dynamic', 'brand-color-light', 'brand-color-mid', 'brand-color-dark',
  // mismo rol, otro nombre → el canónico
  'bg-primary', 'bg-tertiary', 'bg-ui', 'bg-black', 'bg-interactive', 'bg-secondary', 'bg-hover', 'fondo-base', 'view-bg-base',
  'border-light', 'border-divider', 'glass-border', 'spacing-xs', 'spacing-sm', 'spacing-md', 'spacing-lg', 'spacing-xl',
  'border-radius', 'border-radius-sm', 'radius-card', 'font-family', 'ease-out-expo',
  // tipografía de la landing: títulos --font-display (Apfel Grotezk), texto --font-mono (Spline Sans Mono)
  'font-sans', 'font-heading',
  'living-bg-card', 'living-text-muted', 'living-text-light', 'media-container-shadow', 'sidebar-hover', 'nav-border',
];

describe('acentos: solo 3 + 4 sub-acentos', () => {
  test.each(RETIRADOS)('--%s no vuelve (ni definido ni leído)', (nombre) => {
    const re = new RegExp(`--${nombre}(?![\\w-])`);
    const donde = FUENTES.filter((f) => re.test(fs.readFileSync(f, 'utf8')));
    expect(donde, `--${nombre} aparece en: ${donde.join(', ')}`).toEqual([]);
  });

  test('los 10 sub-degradados estáticos del anillo del prisma existen, en 3 orientaciones', () => {
    const pares = ['rojo-naranja', 'naranja-amarillo', 'amarillo-limon', 'limon-verde', 'verde-celeste', 'celeste-azul', 'azul-purpura', 'purpura-violeta', 'violeta-fucsia', 'fucsia-rojo'];
    for (const p of pares) for (const suf of ['', '-h', '-d']) expect(CSS, `falta --grad-${p}${suf}`).toMatch(new RegExp(`--grad-${p}${suf}:`));
  });

  test('tipografía: solo Apfel Grotezk + Spline Sans Mono, sin Inter en la interfaz', () => {
    expect(CSS).toMatch(/--font-display:\s*'Apfel Grotezk'/);
    expect(CSS).toMatch(/--font-mono:\s*'Spline Sans Mono'/);
    expect(CSS).not.toMatch(/font-family:\s*'Inter'/);
    expect(fs.existsSync('recursos/fonts/adn/InterVariable.woff2')).toBe(false);
    for (const w of ['Regular', 'Mittel', 'Fett']) expect(fs.existsSync(`recursos/fonts/adn/ApfelGrotezk-${w}.woff2`)).toBe(true);
  });

  test('el acento principal es blanco', () => {
    expect(CSS).toMatch(/--accent:\s*#ffffff;/);
  });

  test('cada sub-acento tiene base, -bg, -light y -border', () => {
    for (const s of ['success', 'warning', 'error', 'info'])
      for (const suf of ['', '-bg', '-light', '-border'])
        expect(CSS, `falta --color-${s}${suf}`).toMatch(new RegExp(`--color-${s}${suf}:`));
  });

  test('mode-org tiene valor por defecto en :root (nadie necesita fallback)', () => {
    for (const v of ['org-primary', 'org-gradient', 'org-color-light', 'org-brillo'])
      expect(CSS).toMatch(new RegExp(`--${v}:`));
  });

  test('cada token de :root se define UNA sola vez', () => {
    const vistos = new Map();
    for (const b of CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\n):root\s*\{([\s\S]*?)\n\}/g))
      for (const m of b[1].matchAll(/(--[\w-]+)\s*:/g)) vistos.set(m[1], (vistos.get(m[1]) || 0) + 1);
    const repetidos = [...vistos].filter(([, n]) => n > 1).map(([k]) => k);
    expect(repetidos).toEqual([]);
  });
});
