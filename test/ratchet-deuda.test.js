/**
 * Ratchet de deuda del frontend (FASE 2 · L0, 24/09): cada cifra es el TOPE medido en
 * `corte`. Solo puede BAJAR. Al cerrar deuda, baja el tope en el mismo commit (el test
 * avisa cuando sobra margen); subirlo exige decir por qué en el mensaje del commit.
 *
 * Se cuenta con las mismas expresiones que la auditoría (frontend/auditoria-2026-09-14.md).
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function archivos(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const leer = (lista) => lista.map((f) => fs.readFileSync(f, 'utf8'));
const contar = (textos, re) => textos.reduce((n, t) => n + (t.match(re) || []).length, 0);

const CSS = leer(archivos('css', '.css'));
const JS = leer(archivos('js', '.js'));
const VISTAS = leer([...archivos('js/views', '.js'), ...archivos('js/components', '.js')]);

function medir() {
  const zIndex = new Set();
  for (const t of CSS) for (const m of t.matchAll(/z-index:\s*(-?\d+)/g)) zIndex.add(m[1]);
  return {
    hexEnCss: contar(CSS, /#[0-9a-fA-F]{3,8}\b/g),
    importantEnCss: contar(CSS, /!important/g),
    zIndexDistintos: zIndex.size,
    hexEnJs: contar(JS, /['"`]#[0-9a-fA-F]{3,8}['"`]/g),
    styleEnLineaEnJs: contar(JS, /style="/g),
    innerHtml: contar(JS, /innerHTML/g),
    catchVacios: contar(JS, /catch\s*(\([^)]*\))?\s*\{\s*\}/g),
    fromEnVistas: contar(VISTAS, /\.from\(/g),
  };
}

// Medido el 24/09/2026 sobre a064abec; bajado en L1 y en L3 (shell nuevo: fuera Navigation.js + navigation.css).
const TOPES = {
  hexEnCss: 2182,
  importantEnCss: 318,
  zIndexDistintos: 19,
  hexEnJs: 223,
  styleEnLineaEnJs: 283,
  innerHtml: 542,
  catchVacios: 134,
  fromEnVistas: 262,
};

describe('Ratchet de deuda del frontend', () => {
  const hoy = medir();
  for (const [clave, tope] of Object.entries(TOPES)) {
    test(`${clave} ≤ ${tope}`, () => {
      expect(hoy[clave], `${clave} subió a ${hoy[clave]} (tope ${tope})`).toBeLessThanOrEqual(tope);
    });
  }
});
