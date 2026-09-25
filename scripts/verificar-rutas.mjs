#!/usr/bin/env node
/**
 * verificar-rutas — recorre TODAS las rutas de js/app.js en un Chrome sin ventana y falla
 * (código ≠ 0) si alguna rompe. Para comprobar que un cambio no rompió nada fuera de lo que tocaste.
 *
 * Por cada ruta:
 *   - 0 excepciones sin capturar y 0 console.error;
 *   - no acaba en /login ni /signin (eso es que la sesión murió);
 *   - espía de pintado: cada Estado.pintar se compara con lo que daría innerHTML en el mismo
 *     contexto. El gemelo se parsea en un documento inerte (no carga imágenes ni ejecuta scripts).
 *     Cualquier diferencia es un fallo.
 *   - opcional: captura PNG de cada ruta.
 *
 * REQUISITOS
 *   1. servir-local en marcha con la sesión de prueba sembrada (ver su cabecera):
 *        AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_API_URL=… \
 *        AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=… node scripts/servir-local.mjs
 *   2. Google Chrome instalado. El script lo lanza él mismo en modo headless, con un perfil
 *      temporal nuevo en cada corrida para que /__sesion.js siembre la sesión:
 *        "<chrome>" --headless=new --disable-gpu --remote-debugging-port=<puerto> \
 *                   --user-data-dir=<tmp> --window-size=1440,900 about:blank
 *      Ruta por defecto: la de macOS. En otro sistema: CHROME=/ruta/a/chrome.
 *      No hace falta ninguna dependencia: el WebSocket y fetch vienen con Node ≥ 22.
 *
 * USO
 *   npm run verificar:rutas                     # todas
 *   npm run verificar:rutas -- --solo vera      # solo las rutas que contienen «vera»
 *   npm run verificar:rutas -- --captura /tmp/rutas --espera 12000
 *   BASE=http://127.0.0.1:5182 PUERTO_CDP=9335 npm run verificar:rutas
 *
 * NO se visitan: las rutas de sesión (/login, /signin, /mfa, /verification, /cambiar-contrasena).
 * Pueden cerrar la sesión de prueba (un signOut la REVOCA en el servidor) o enrolar un factor
 * TOTP real. Tampoco las que piden ids reales (:brandId, :taskId…). Solo lectura: no hace clics.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BASE = (process.env.BASE || 'http://127.0.0.1:5182').replace(/\/$/, '');
const ESPERA = Number(opcion('espera', 9000));
const SOLO = opcion('solo', '');
const CAPTURA = opcion('captura', '');
const PUERTO = Number(process.env.PUERTO_CDP || 9335);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const EXCLUIDAS = new Set(['/login', '/signin', '/mfa', '/verification', '/cambiar-contrasena']);
// Parámetros que se pueden recorrer sin ids reales: cada valor es una ruta.
const VALORES = {
  '/org/:orgIdShort/:orgNameSlug/configuracion/:tab': ['general', 'facturacion', 'miembros', 'actividad'],
  '/org/:orgIdShort/:orgNameSlug/cuenta/:tab': ['perfil'],
};
// Rutas con parámetro que igual conviene ver (valor inválido a propósito: pinta su error, no escribe).
const EXTRA = ['/invitacion/enlace-invalido'];

/** Las rutas de app.js: `register('<ruta>'…`. Las de /org/ usan la marca de la sesión. */
export function rutasDeApp(fuente, org) {
  const todas = [...new Set([...fuente.matchAll(/register\('([^']+)'/g)].map((m) => m[1]))];
  const conOrg = new Set(todas.filter((r) => r.startsWith('/org/')).map((r) => r.replace('/org/:orgIdShort/:orgNameSlug', '')));
  const salida = [];
  for (const r of todas) {
    if (EXCLUIDAS.has(r)) continue;
    if (VALORES[r]) { for (const v of VALORES[r]) salida.push(r.replace(/:tab$/, v)); continue; }
    const resto = r.replace('/org/:orgIdShort/:orgNameSlug', '');
    if (/:/.test(resto)) continue; // pide un id real
    if (!r.startsWith('/org/') && conOrg.has(r)) continue; // la versión sin marca solo redirige
    salida.push(r);
  }
  return [...salida, ...EXTRA]
    .map((r) => r.replace('/org/:orgIdShort/:orgNameSlug', org))
    .filter((r) => !SOLO || r.includes(SOLO));
}

// Espía: se instala antes de que cargue la app y envuelve Estado.pintar en cuanto se define.
const ESPIA = `(() => {
  window.__pintarMal = []; window.__pintarN = 0;
  const inerte = document.implementation.createHTMLDocument('');
  const gemelo = (z) => z.namespaceURI === 'http://www.w3.org/1999/xhtml' ? inerte.createElement(z.localName) : inerte.createElementNS(z.namespaceURI, z.localName);
  let E;
  Object.defineProperty(window, 'Estado', { configurable: true, get: () => E, set(v) {
    E = v; if (!v || v.__espiado) return; const orig = v.pintar;
    v.pintar = function (zona, html) {
      window.__pintarN++;
      if (!zona) return orig.apply(this, arguments);
      const a = gemelo(zona); a.innerHTML = String(html == null ? '' : html);
      const r = orig.apply(this, arguments);
      const norm = (x) => x.replace(/^\\s+/, '');
      if (norm(a.innerHTML) !== norm(zona.innerHTML)) {
        window.__pintarMal.push((zona.localName + (zona.id ? '#' + zona.id : '')) + ' ← ' + String(html).trim().slice(0, 60));
      }
      return r;
    };
    v.__espiado = true;
  } });
})();`;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  try { await fetch(BASE + '/'); } catch {
    console.error(`No responde ${BASE}. Arranca antes scripts/servir-local.mjs (ver cabecera).`);
    process.exit(2);
  }
  const perfil = mkdtempSync(join(tmpdir(), 'verificar-rutas-'));
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let ws; let fallos = 0;
  try {
    let lista;
    for (let i = 0; i < 60 && !lista; i++) { try { lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json`)).json(); } catch { await dormir(250); } }
    if (!lista) throw new Error(`Chrome no abrió el puerto ${PUERTO} (CHROME=${CHROME})`);
    ws = new globalThis.WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, e) => { ws.addEventListener('open', r); ws.addEventListener('error', e); });
    let id = 0; const pend = new Map(); let eventos = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') eventos.push('excepción: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') eventos.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' ').split('\n')[0].slice(0, 200));
    });
    const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await cmd('Runtime.enable'); await cmd('Page.enable');
    await cmd('Page.addScriptToEvaluateOnNewDocument', { source: ESPIA });

    // La marca de la sesión: /home lleva a /org/<short>/<slug>/…
    await cmd('Page.navigate', { url: BASE + '/home' });
    await dormir(ESPERA);
    const donde = (await cmd('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true })).result?.result?.value || '';
    const m = donde.match(/^\/org\/[^/]+\/[^/]+/);
    if (!m) throw new Error(`Sin sesión de prueba: /home terminó en «${donde}». ¿servir-local con AISC_PRUEBA_*?`);
    const rutas = rutasDeApp(readFileSync(join(ROOT, 'js/app.js'), 'utf8'), m[0]);
    if (CAPTURA) mkdirSync(CAPTURA, { recursive: true });
    console.log(`verificar-rutas: ${rutas.length} rutas en ${BASE} (marca ${m[0]}), ${ESPERA} ms cada una\n`);

    for (const ruta of rutas) {
      eventos = [];
      await cmd('Page.navigate', { url: BASE + ruta });
      await dormir(ESPERA);
      const v = (await cmd('Runtime.evaluate', { returnByValue: true, expression: `({ final: location.pathname, pintar: window.__pintarN || 0, mal: window.__pintarMal || [] })` })).result?.result?.value || {};
      const problemas = [...eventos];
      if (/^\/(login|signin)\b/.test(v.final || '')) problemas.push(`terminó en ${v.final}: la sesión murió`);
      for (const x of v.mal || []) problemas.push('pintar ≠ innerHTML: ' + x);
      if (CAPTURA) {
        const png = await cmd('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(CAPTURA, ruta.replace(/^\//, '').replace(/[/:]/g, '_') + '.png'), Buffer.from(png.result.data, 'base64'));
      }
      const corta = ruta.replace(m[0], '');
      const destino = v.final && v.final !== ruta ? ` → ${v.final.replace(m[0], '')}` : '';
      if (problemas.length) { fallos++; console.log(`✗ ${corta}${destino}`); problemas.forEach((p) => console.log('    ' + p)); } else console.log(`✓ ${corta}${destino}  (pintar ${v.pintar})`);
    }
    console.log(`\n${rutas.length - fallos}/${rutas.length} rutas sin problemas`);
  } finally {
    try { ws?.close(); } catch { /* ya cerrado */ }
    ch.kill();
    await dormir(300);
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome aún suelta archivos */ }
  }
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('verificar-rutas:', e.message); process.exit(2); });
}
