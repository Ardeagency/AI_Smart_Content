/**
 * Build de minificación para Netlify (corre ANTES del sed de __BUILD_ID__).
 *
 * 1. Aplana css/bundle.css: inserta el contenido de cada @import de
 *    css/modules/*.css en su lugar (mismo orden). Elimina la cascada de ~24
 *    requests secuenciales render-blocking que generaban los @import.
 *    Seguro porque los módulos no tienen @import anidados ni url() relativos
 *    (verificado 2026-07-02; los assets van por data:/https:/rutas absolutas).
 * 2. Minifica todo el CSS (bundle aplanado + módulos route-split que se cargan
 *    aparte via _loadCss: developer, insight, command-center, monitoring...).
 * 3. Minifica el JS de frontend (js/ recursivo + sw.js) SOLO con
 *    minifyWhitespace + minifySyntax — sin renombrar identificadores, porque
 *    los archivos son scripts clásicos cuyos nombres top-level son la interfaz
 *    global entre módulos (window.X, clases compartidas).
 *
 * Modifica los archivos EN SITIO: pensado para el working dir desechable del
 * build de Netlify. No correr sobre un checkout de trabajo (usar una copia).
 * Los errores por archivo no rompen el build: se conserva el original.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import esbuild from 'esbuild';

const ROOT = new URL('..', import.meta.url).pathname;
const stats = { css: [0, 0], js: [0, 0], errores: [] };

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(name))) out.push(p);
  }
  return out;
}

async function minifyFile(path, loader, opts) {
  const src = readFileSync(path, 'utf8');
  try {
    const r = await esbuild.transform(src, { loader, ...opts });
    writeFileSync(path, r.code);
    const key = loader === 'css' ? 'css' : 'js';
    stats[key][0] += src.length;
    stats[key][1] += r.code.length;
  } catch (e) {
    stats.errores.push(`${path}: ${e.message.split('\n')[0]}`);
  }
}

// ── 1. Aplanar bundle.css ──────────────────────────────────────────────
const bundlePath = join(ROOT, 'css/bundle.css');
let bundle = readFileSync(bundlePath, 'utf8');
let inlined = 0;
bundle = bundle.replace(
  /@import\s+url\(\s*['"]?modules\/([^'")?]+)(?:\?[^'")]*)?['"]?\s*\)\s*;/g,
  (_, file) => {
    inlined++;
    const css = readFileSync(join(ROOT, 'css/modules', file), 'utf8');
    return `/* ── inlined: modules/${file} ── */\n${css}`;
  }
);
writeFileSync(bundlePath, bundle);
console.log(`bundle.css: ${inlined} @imports aplanados`);

// ── 2. Minificar CSS (bundle + módulos route-split + subsets) ──────────
for (const f of walk(join(ROOT, 'css'), ['.css'])) {
  await minifyFile(f, 'css', { minify: true });
}

// ── 3. Minificar JS de frontend ────────────────────────────────────────
const jsFiles = [...walk(join(ROOT, 'js'), ['.js']), join(ROOT, 'sw.js')];
for (const f of jsFiles) {
  await minifyFile(f, 'js', {
    minifyWhitespace: true,
    minifySyntax: true,
    target: 'es2019',
  });
}

const mb = (n) => (n / 1024 / 1024).toFixed(2) + 'MB';
console.log(`CSS: ${mb(stats.css[0])} → ${mb(stats.css[1])}`);
console.log(`JS:  ${mb(stats.js[0])} → ${mb(stats.js[1])}`);
if (stats.errores.length) {
  console.warn(`AVISO ${stats.errores.length} archivo(s) sin minificar (se conserva el original):`);
  for (const e of stats.errores) console.warn('  -', e);
}
