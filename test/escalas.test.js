/**
 * Escalas cerradas de ESPACIO y MOVIMIENTO (sistema visual, 25/09).
 *
 * Espacio: padding/margin/gap solo con --space-0 · -half · -1 · -2 · -3 · -4 · -5 · -6 ·
 * -8 · -10 · -12 · -16 · -20 (0 a 80px). Un literal en px/rem/em es un fallo. Fuera de la
 * regla, a proposito: `0`, `auto`, porcentajes, vw/vh, var() y funciones (calc/min/max/
 * clamp: reservas de cabecera, safe-area, tamaños fluidos) y los valores > 96px, que son
 * reservas de layout y no espacio de componente (lista cerrada abajo).
 *
 * Movimiento: la DURACION de toda transition/animation es uno de los 4 tokens
 * --duracion-*. Fuera: bucles (`infinite`) y > 700ms (spinners, shimmer, pulsos),
 * < 20ms (reduced-motion propios) y los RETRASOS escalonados. Las curvas son las 3
 * --curva-* o `linear`/`steps()`; ningun ease/ease-*, ni cubic-bezier suelto.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const VENDOR = new Set(['fa-subset.css', 'phosphor-subset.css', 'aisc-icons.css']);

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (e.name.endsWith('.css') && !VENDOR.has(e.name)) out.push(p);
  }
  return out;
}

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Parte por espacios (o por comas) sin cortar dentro de parentesis. */
function partir(valor, sep = null) {
  const out = [];
  let d = 0;
  let cur = '';
  for (const ch of valor) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    const corta = d === 0 && (sep === null ? /\s/.test(ch) : ch === sep);
    if (corta) { if (cur.trim() || sep !== null) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const PROP_ESPACIO = String.raw`(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap`;
const PROP_MOV = String.raw`transition(?:-duration|-timing-function)?|animation(?:-duration|-timing-function)?`;
const DECL = new RegExp(String.raw`(?<![-\w])(${PROP_ESPACIO}|${PROP_MOV})\s*:\s*([^;{}]*?)\s*(?:!important)?\s*(?=[;}])`, 'gi');
const LONGITUD = /^-?(\d*\.?\d+)(px|rem|em)$/i;
const TIEMPO = /^-?(\d*\.?\d+)(ms|s)$/i;
const CURVA_SUELTA = /^(ease(-in-out|-in|-out)?|cubic-bezier\(.*\))$/i;
const aMs = (n, u) => Number(n) * (u.toLowerCase() === 's' ? 1000 : 1);
const aPx = (n, u) => Number(n) * (u.toLowerCase() === 'px' ? 1 : 16);

// Las unicas longitudes > 96px que quedan, con su motivo (reserva de layout).
const GRANDES_PERMITIDOS = ['110px'];

function medir() {
  const espacio = [];
  const duracion = [];
  const curva = [];
  for (const f of archivos('css')) {
    const texto = sinComentarios(fs.readFileSync(f, 'utf8'));
    for (const m of texto.matchAll(DECL)) {
      const prop = m[1].toLowerCase();
      const valor = m[2].trim();
      const donde = `${f}: ${prop}: ${valor}`;
      if (/^(padding|margin)|gap$/.test(prop)) {
        for (const t of partir(valor)) {
          const l = t.match(LONGITUD);
          if (l && !(aPx(l[1], l[2]) > 96 && GRANDES_PERMITIDOS.includes(t.replace(/^-/, '')))) espacio.push(donde);
        }
        continue;
      }
      for (const item of partir(valor, ',')) {
        const toks = partir(item);
        const bucle = toks.some((t) => t.toLowerCase() === 'infinite');
        let tiempos = 0;
        for (const t of toks) {
          if (CURVA_SUELTA.test(t)) curva.push(donde);
          if (/^var\(--duracion-/.test(t)) { tiempos++; continue; }
          const tm = t.match(TIEMPO);
          if (!tm) continue;
          tiempos++;
          const esDuracion = prop.endsWith('-duration') || tiempos === 1;
          const ms = aMs(tm[1], tm[2]);
          if (esDuracion && !bucle && ms >= 20 && ms <= 700) duracion.push(donde);
        }
      }
    }
  }
  return { espacio, duracion, curva };
}

describe('Escalas cerradas de espacio y movimiento', () => {
  const hoy = medir();

  test('padding/margin/gap sin literales px/rem/em (solo --space-*)', () => {
    expect(hoy.espacio, hoy.espacio.slice(0, 10).join('\n')).toEqual([]);
  });

  test('transition/animation: la duracion es uno de los 4 tokens --duracion-*', () => {
    expect(hoy.duracion, hoy.duracion.slice(0, 10).join('\n')).toEqual([]);
  });

  test('curvas: solo --curva-*, linear o steps()', () => {
    expect(hoy.curva, hoy.curva.slice(0, 10).join('\n')).toEqual([]);
  });

  test('los tokens existen en bundle.css con sus valores', () => {
    const b = fs.readFileSync('css/bundle.css', 'utf8');
    for (const t of ['--space-0: 0;', '--space-half: 0.125rem;', '--space-10: 2.5rem;', '--space-20: 5rem;',
      '--duracion-rapida: 100ms;', '--duracion-base: 150ms;', '--duracion-media: 250ms;', '--duracion-lenta: 400ms;',
      '--curva-estandar: cubic-bezier(0.2, 0, 0.38, 0.9);', '--curva-entrada: cubic-bezier(0, 0, 0.38, 0.9);',
      '--curva-salida: cubic-bezier(0.2, 0, 1, 0.9);']) expect(b).toContain(t);
  });

  test('los tokens viejos de movimiento no vuelven (CSS ni JS)', () => {
    const viejos = /--(duration|ease|transition)-?[a-z]*\b|--modal-ease/;
    const fuentes = [...archivos('css'), 'js'].flatMap((p) => (p === 'js' ? todosJs('js') : [p]));
    const con = fuentes.filter((f) => viejos.test(sinComentarios(fs.readFileSync(f, 'utf8'))));
    expect(con).toEqual([]);
  });

  test('reduced-motion global baja las 4 duraciones', () => {
    const b = fs.readFileSync('css/bundle.css', 'utf8');
    expect(b).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{\s*--duracion-rapida:\s*0\.01ms;\s*--duracion-base:\s*0\.01ms;\s*--duracion-media:\s*0\.01ms;\s*--duracion-lenta:\s*0\.01ms;/);
  });
});

function todosJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...todosJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
