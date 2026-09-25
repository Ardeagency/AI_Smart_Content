#!/usr/bin/env node
/**
 * release:check — UN comando que dice si un commit se puede publicar. Falla (código ≠ 0) si falla
 * cualquiera de estos pasos, todos sobre una copia LIMPIA del commit (git archive), nunca sobre el
 * árbol de trabajo (que puede tener cambios de otra sesión):
 *
 *   1. gate      npm run test:gate                      (vitest sin los tests contra la base viva)
 *   2. eslint    npx eslint .                           (0 errores; los avisos no cortan)
 *   3. build     scripts/build-minify.mjs + sed del BUILD_ID, como el comando de netlify.toml.
 *                Falla si algún archivo queda «sin minificar»: esbuild no lo pudo leer.
 *   4. rutas     scripts/verificar-rutas.mjs --a11y sobre lo CONSTRUIDO (lo que se publica):
 *                cabeceras reales de netlify.toml (CSP incluida), 2 visitas con Service Worker,
 *                0 excepciones, 0 console.error, 0 errores rojos del navegador (4xx/5xx de supabase
 *                o del borde), 0 violaciones de CSP, splash < 8 s, pintado ≡ innerHTML y a11y.
 *                Las únicas tolerancias son las EXCEPCIONES comentadas de verificar-rutas.mjs.
 *
 * USO
 *   npm run release:check                         # HEAD, servido en local desde la copia construida
 *   npm run release:check -- --ref corte~2        # otro commit
 *   npm run release:check -- --base https://corte--<sitio>.netlify.app   # paso 4 contra un deploy
 *   npm run release:check -- --estricto           # las EXCEPCIONES también fallan
 *
 * Con --base, el paso 4 va contra ese deploy (branch deploy de staging o producción) con
 * --sesion-node, y los pasos 1–3 siguen corriendo sobre el commit.
 *
 * ENTORNO (las mismas variables que servir-local; ver su cabecera; nunca se imprimen):
 *   AISC_SUPABASE_URL, AISC_SUPABASE_ANON_KEY, AISC_API_URL, AISC_PRUEBA_USUARIO, AISC_PRUEBA_CLAVE
 *   y Google Chrome (CHROME=/ruta si no es la de macOS).
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const REF = opcion('ref', 'HEAD');
const BASE = opcion('base', '');
const ESTRICTO = args.includes('--estricto');
const PUERTO = Number(process.env.PUERTO_RELEASE || 5190);
const FALTAN = ['AISC_SUPABASE_URL', 'AISC_SUPABASE_ANON_KEY', 'AISC_API_URL', 'AISC_PRUEBA_USUARIO', 'AISC_PRUEBA_CLAVE'].filter((k) => !process.env[k]);

/** Corre un comando y devuelve { codigo, salida } (la salida se guarda para el resumen). */
function correr(cmd, argv, cwd, env = process.env) {
  return new Promise((ok) => {
    const p = spawn(cmd, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    p.stdout.on('data', (d) => { salida += d; });
    p.stderr.on('data', (d) => { salida += d; });
    p.on('close', (codigo) => ok({ codigo, salida }));
  });
}

function exportar(ref, destino) {
  const tar = execFileSync('git', ['archive', ref], { cwd: ROOT, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', destino], { input: tar });
  symlinkSync(join(ROOT, 'node_modules'), join(destino, 'node_modules'));
}

const pasos = [];
let servidorGlobal = null;
async function paso(nombre, fn) {
  const t0 = Date.now();
  process.stdout.write(`… ${nombre}\n`);
  const r = await fn();
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  pasos.push({ nombre, ok: r.ok, detalle: r.detalle, s });
  console.log(`${r.ok ? '✓' : '✗'} ${nombre} (${s} s)${r.detalle ? ' — ' + r.detalle : ''}`);
  if (!r.ok && r.salida) console.log(r.salida.split('\n').filter(Boolean).slice(-25).map((l) => '    ' + l).join('\n'));
}

async function main() {
  // El servidor local y el verificador mueren con release:check (Ctrl-C o kill incluidos).
  for (const sen of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sen, () => { try { servidorGlobal?.kill('SIGKILL'); } catch { /* ya murió */ } process.exit(130); });
  if (FALTAN.length) { console.error(`release:check: faltan variables de entorno: ${FALTAN.join(', ')} (ver cabecera)`); process.exit(2); }
  const sha = execFileSync('git', ['rev-parse', '--short', REF], { cwd: ROOT }).toString().trim();
  console.log(`release:check de ${REF} (${sha})${BASE ? ` · rutas contra ${BASE}` : ''}\n`);
  const limpio = mkdtempSync(join(tmpdir(), 'release-limpio-'));
  const construido = mkdtempSync(join(tmpdir(), 'release-build-'));
  let servidor = null;
  try {
    exportar(REF, limpio);
    exportar(REF, construido);

    await paso('gate', async () => {
      const r = await correr('npm', ['run', '-s', 'test:gate'], limpio);
      const m = r.salida.match(/Tests\s+(?:\S+\s+)*?(\d+) passed/);
      return { ok: r.codigo === 0, detalle: m ? `${m[1]} tests` : '', salida: r.salida };
    });

    await paso('eslint', async () => {
      const r = await correr('npx', ['eslint', '.', '-f', 'json'], limpio);
      let errores = -1; let avisos = 0;
      try { const j = JSON.parse(r.salida.slice(r.salida.indexOf('['))); errores = j.reduce((a, x) => a + x.errorCount, 0); avisos = j.reduce((a, x) => a + x.warningCount, 0); } catch { /* salida no JSON: error de eslint */ }
      return { ok: errores === 0, detalle: `${errores} errores, ${avisos} avisos`, salida: errores === 0 ? '' : r.salida.slice(0, 4000) };
    });

    await paso('build (como netlify.toml)', async () => {
      const r = await correr('node', ['scripts/build-minify.mjs'], construido);
      const sinMinificar = r.salida.match(/AVISO (\d+) archivo\(s\) sin minificar/);
      for (const f of ['index.html', 'css/bundle.css', 'js/app.js', 'js/utils/lazy-nav.js', 'sw.js']) {
        try { const p = join(construido, f); writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__BUILD_ID__', sha)); } catch { /* el archivo no existe en este commit */ }
      }
      return { ok: r.codigo === 0 && !sinMinificar, detalle: sinMinificar ? `${sinMinificar[1]} archivo(s) que esbuild no pudo leer` : (r.salida.match(/JS: .*/) || [''])[0], salida: r.salida };
    });

    await paso(BASE ? `rutas contra ${BASE}` : 'rutas sobre lo construido (cabeceras reales + SW)', async () => {
      let base = BASE;
      if (!base) {
        servidor = spawn('node', ['scripts/servir-local.mjs'], { cwd: construido, env: { ...process.env, PUERTO: String(PUERTO) }, stdio: 'ignore' });
        servidorGlobal = servidor;
        base = `http://127.0.0.1:${PUERTO}`;
        for (let i = 0; i < 40; i++) { try { await fetch(base + '/'); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
      }
      const argv = ['scripts/verificar-rutas.mjs', '--a11y', ...(BASE ? ['--sesion-node'] : []), ...(ESTRICTO ? ['--estricto'] : [])];
      const r = await correr('node', argv, construido, { ...process.env, BASE: base });
      const resumen = (r.salida.match(/\d+\/\d+ rutas sin problemas.*/) || [''])[0];
      const tolerados = [...r.salida.matchAll(/tolerado ×(\d+): ([^:]+):/g)].map((m) => `${m[2]} ×${m[1]}`).join(', ');
      return { ok: r.codigo === 0, detalle: resumen + (tolerados ? ` · tolerado: ${tolerados}` : ''), salida: r.salida };
    });
  } finally {
    if (servidor) servidor.kill();
    for (const d of [limpio, construido]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* restos de Chrome */ } }
  }
  const malos = pasos.filter((p) => !p.ok);
  console.log(`\n${malos.length ? '✗ NO se puede publicar' : '✓ se puede publicar'} ${sha}: ${pasos.length - malos.length}/${pasos.length} pasos en verde`);
  process.exit(malos.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('release:check:', e.message); process.exit(2); });
}
