#!/usr/bin/env node
/**
 * i18n-extract — recolecta las claves __('...') del frontend de cara al usuario
 * y mantiene en sincronia el catalogo EN.
 *
 * Modelo "espanol como clave": la clave es el texto espanol literal dentro de
 * t('...') / t("..."). Este script:
 *   1. Escanea js/ (excluyendo vistas Dev/Lead y los propios archivos i18n).
 *   2. Escribe la lista canonica ordenada en js/i18n/keys.json.
 *   3. Hace merge NO destructivo en js/i18n/en.js entre los marcadores (no se
 *      I18N:BEGIN / I18N:END: agrega claves nuevas con valor "", conserva las
 *      traducidas, y reporta claves huerfanas (en el catalogo pero ya sin uso).
 *
 * Uso:  node scripts/i18n-extract.mjs            (merge + reporte)
 *       node scripts/i18n-extract.mjs --prune    (ademas elimina huerfanas)
 *
 * NUNCA borra traducciones salvo --prune. Seguro de correr tras cada fase.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');
const EN_PATH = join(ROOT, 'js', 'i18n', 'en.js');
const KEYS_PATH = join(ROOT, 'js', 'i18n', 'keys.json');
const PRUNE = process.argv.includes('--prune');

// Archivos/carpetas excluidos del escaneo (no son UI de cara al usuario).
const EXCLUDE_NAME = /^Dev/; // vistas Dev* / DevLead* (internas)
const EXCLUDE_PATH = [/\/js\/i18n\//, /\/js\/services\/I18n\.js$/, /\/node_modules\//];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (EXCLUDE_PATH.some((re) => re.test(full.replace(/\\/g, '/')))) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full, acc); continue; }
    if (!entry.endsWith('.js')) continue;
    if (EXCLUDE_NAME.test(basename(entry))) continue;
    acc.push(full);
  }
  return acc;
}

// Captura __('...') / __("...") incluyendo escapes. El nombre `__` se eligio
// por no colisionar con variables locales (a diferencia de `t`).
const CALL_RE = /(?<![\w$])__\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;

function unescape(str, quote) {
  // Convierte la secuencia tal como la veria JS en runtime.
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(new RegExp('\\\\' + quote, 'g'), quote)
    .replace(/\\\\/g, '\\');
}

const keys = new Set();
const files = walk(JS_DIR);
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let m;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(src)) !== null) {
    const quote = m[1];
    const raw = m[2];
    if (!raw) continue;
    keys.add(unescape(raw, quote));
  }
}

const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b, 'es'));
writeFileSync(KEYS_PATH, JSON.stringify(sortedKeys, null, 2) + '\n', 'utf8');

// --- merge en en.js ---
const enSrc = readFileSync(EN_PATH, 'utf8');
const beginMark = '/* I18N:BEGIN */';
const endMark = '/* I18N:END */';
const begin = enSrc.indexOf(beginMark);
const end = enSrc.indexOf(endMark);
if (begin === -1 || end === -1 || end < begin) {
  console.error('en.js: no se encontraron los marcadores I18N:BEGIN / I18N:END');
  process.exit(1);
}
const jsonText = enSrc.slice(begin + beginMark.length, end).trim();
let current;
try {
  current = JSON.parse(jsonText || '{}');
} catch (e) {
  console.error('en.js: el bloque entre marcadores no es JSON valido:', e.message);
  process.exit(1);
}

let added = 0;
let orphan = 0;
const merged = {};
// Mantener orden alfabetico estable por clave.
for (const k of sortedKeys) {
  if (Object.prototype.hasOwnProperty.call(current, k)) {
    merged[k] = current[k];
  } else {
    merged[k] = '';
    added++;
  }
}
// Huerfanas: estaban en el catalogo pero ya no se usan.
const orphans = Object.keys(current).filter((k) => !keys.has(k));
orphan = orphans.length;
if (!PRUNE) {
  for (const k of orphans) merged[k] = current[k]; // conservar salvo --prune
}

const sortedMerged = {};
for (const k of Object.keys(merged).sort((a, b) => a.localeCompare(b, 'es'))) {
  sortedMerged[k] = merged[k];
}
const body = JSON.stringify(sortedMerged, null, 2);
const newEn = enSrc.slice(0, begin + beginMark.length) + body + enSrc.slice(end);
writeFileSync(EN_PATH, newEn, 'utf8');

const untranslated = Object.values(sortedMerged).filter((v) => !v).length;
console.log(`[i18n] archivos escaneados: ${files.length}`);
console.log(`[i18n] claves en uso:       ${sortedKeys.length}`);
console.log(`[i18n] nuevas agregadas:    ${added}`);
console.log(`[i18n] sin traducir (EN):   ${untranslated}`);
console.log(`[i18n] huerfanas:           ${orphan}${PRUNE ? ' (eliminadas)' : orphan ? ' (usa --prune para limpiar)' : ''}`);
