#!/usr/bin/env node
/**
 * verificar-rutas — recorre TODAS las rutas de js/app.js en un Chrome sin ventana y falla
 * (código ≠ 0) si alguna rompe. Para comprobar que un cambio no rompió nada fuera de lo que tocaste.
 *
 * Por cada ruta:
 *   - 0 excepciones sin capturar, 0 console.error, 0 errores de consola del navegador (recursos
 *     que fallan: 400/401/404…) y 0 violaciones de CSP (evento securitypolicyviolation);
 *   - no acaba en /login ni /signin (eso es que la sesión murió);
 *   - espía de pintado: cada Estado.pintar se compara con lo que daría innerHTML en el mismo
 *     contexto. El gemelo se parsea en un documento inerte (no carga imágenes ni ejecuta scripts).
 *     Cualquier diferencia es un fallo.
 *   - EXCEPCIONES (arriba, comentadas): errores de infraestructura sin desplegar que se toleran
 *     e informan con recuento; --estricto los vuelve fallo;
 *   - el splash de arranque se va en menos de --splash-max ms (8000 por defecto);
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
 *   npm run verificar:rutas -- --a11y           # + accesibilidad en las vistas pulidas (ver a11y-cdp.mjs)
 *
 * --a11y: en las rutas de A11Y_RUTAS mide nombres accesibles, botones solo-icono, foco visible
 * con Tab real, la matriz de contraste AA de los tokens (una vez) y el drawer móvil (una vez:
 * es el único paso que hace un clic, en la hamburguesa, sin efectos fuera de la página).
 *
 * DOS VISITAS: la 1.ª (/home) instala el Service Worker y las rutas cargan después con él, como un
 * usuario que vuelve (el 25/09 la consola moría solo en la 2.ª visita). --sin-sw lo ignora.
 * Producción: BASE=https://console.aismartcontent.io … --sesion-node (login de prueba en Node).
 *
 * NO se visitan: las rutas de sesión (/login, /signin, /mfa, /verification, /cambiar-contrasena).
 * Pueden cerrar la sesión de prueba (un signOut la REVOCA en el servidor) o enrolar un factor
 * TOTP real. Tampoco las que piden ids reales (:brandId, :taskId…). Solo lectura: no hace clics.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as a11y from './a11y-cdp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BASE = (process.env.BASE || 'http://127.0.0.1:5182').replace(/\/$/, '');
const ESPERA = Number(opcion('espera', 9000));
const SOLO = opcion('solo', '');
const CAPTURA = opcion('captura', '');
const A11Y = args.includes('--a11y');
// Errores de consola CONOCIDOS que dependen de infraestructura aún sin desplegar, no de la consola.
// Se toleran pero se informan con su recuento; `--estricto` los vuelve fallo. Cada entrada dice
// por qué y cuándo se quita: una excepción sin motivo no entra.
export const EXCEPCIONES = [
  { patron: /media-v2\.aismartcontent\.io\/(in|pub)\/.*|status of 40[134] \(\) ← https:\/\/media-v2\.aismartcontent\.io\//,
    motivo: 'media-v2: el Worker (ADR-0045) no está desplegado; 401/404 hasta el paso del Worker. Quitar cuando /in/ sirva.' },
  { patron: /ERR_NAME_NOT_RESOLVED ← https:\/\/api-v2\.aismartcontent\.io\//,
    motivo: 'api-v2: el borde no tiene DNS todavía (NXDOMAIN, 25/09); las vistas lo dicen con «todavía no». Quitar cuando resuelva.' },
];
const ESTRICTO = args.includes('--estricto');
const tolerados = new Map();
// El splash de arranque (#app-splash) se va con el primer `routechange`; el failsafe de index.html
// lo quita a los 10 s. Si una ruta lo deja más de SPLASH_MAX ms, es que algo tapa la señal de «app
// lista». Tope fijado con lo medido antes del hotfix del SW (bcdc2d0b, 25/09): peor caso 6.2 s
// (/configuracion/general, que espera sus datos); 8 s deja margen para una máquina cargada.
const SPLASH_MAX = Number(opcion('splash-max', 8000));
// --sesion-node: para un BASE sin /__sesion.js (producción). Login de la cuenta de prueba en Node
// (AISC_SUPABASE_URL, AISC_SUPABASE_ANON_KEY, AISC_PRUEBA_USUARIO, AISC_PRUEBA_CLAVE) y la sesión se
// siembra en el perfil temporal antes de que cargue la app. La clave no sale del entorno.
const SESION_NODE = args.includes('--sesion-node');
async function sembrado() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.AISC_SUPABASE_URL;
  const sb = createClient(url, process.env.AISC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: process.env.AISC_PRUEBA_USUARIO, password: process.env.AISC_PRUEBA_CLAVE });
  if (error) throw new Error('login de prueba: ' + error.message);
  const clave = `sb-${new URL(url).host.split('.')[0]}-auth-token`;
  return `try{if(!localStorage.getItem(${JSON.stringify(clave)}))localStorage.setItem(${JSON.stringify(clave)},${JSON.stringify(JSON.stringify(data.session))});}catch(e){}`;
}
// Vistas pulidas (shell incluido): las que la auditoría --a11y exige en verde.
export const A11Y_RUTAS = ['/configuracion/general', '/configuracion/miembros', '/configuracion/facturacion', '/configuracion/actividad',
  '/configuracion/integraciones', '/cuenta/perfil', '/plans', '/vera', '/404', '/403', '/invitacion'];
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
  // Comillas simples o dobles: el app.js minificado del build usa dobles (release:check lo recorre).
  const todas = [...new Set([...fuente.matchAll(/register\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]))];
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
  new MutationObserver(() => { const s = document.getElementById('app-splash'); if (s && s.classList.contains('app-splash--hide') && !window.__splashFuera) window.__splashFuera = Math.round(performance.now()); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.__pintarMal = []; window.__pintarN = 0; window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.effectiveDirective + ' bloqueó ' + (e.blockedURI || '(inline)') + (e.sourceFile ? ' desde ' + e.sourceFile.split('/').pop() + ':' + e.lineNumber : '')));
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

// UN solo verificar-rutas a la vez en toda la máquina (25/09: varios Chrome headless en paralelo
// subieron la carga a ~555 y falsearon splash y tiempos). El candado guarda el PID; si ese proceso
// ya no existe, el candado está muerto y se toma.
// /tmp fijo y no os.tmpdir(): TMPDIR cambia entre sesiones y el candado tiene que ser de la máquina.
const CANDADO = '/tmp/verificar-rutas.lock';
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
async function tomarCandado() {
  const limite = Date.now() + (args.includes('--sin-esperar') ? 0 : 20 * 60 * 1000);
  let avisado = false;
  for (;;) {
    try { const fd = openSync(CANDADO, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const otro = Number(readFileSync(CANDADO, 'utf8')) || 0;
    if (!otro || !vivo(otro)) { try { unlinkSync(CANDADO); } catch { /* otro lo quitó */ } continue; }
    if (Date.now() >= limite) { console.error(`verificar-rutas: ya corre otro (PID ${otro}); un solo verificador a la vez (${CANDADO}).`); process.exit(2); }
    if (!avisado) { console.log(`Esperando a que termine el otro verificar-rutas (PID ${otro})…`); avisado = true; }
    await dormir(5000);
  }
}
function soltarCandado() { try { if (Number(readFileSync(CANDADO, 'utf8')) === process.pid) unlinkSync(CANDADO); } catch { /* ya no está */ } }

async function main() {
  try { await fetch(BASE + '/'); } catch {
    console.error(`No responde ${BASE}. Arranca antes scripts/servir-local.mjs (ver cabecera).`);
    process.exit(2);
  }
  await tomarCandado();
  const perfil = mkdtempSync(join(tmpdir(), 'verificar-rutas-'));
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  // Chrome muere SIEMPRE con el verificador (salida normal, error, Ctrl-C o kill): nada de huérfanos.
  const cerrar = () => { try { ch.kill('SIGKILL'); } catch { /* ya murió */ } soltarCandado(); };
  process.on('exit', cerrar);
  for (const sen of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sen, () => { cerrar(); process.exit(130); });
  let ws; let fallos = 0; let a11yGlobal = false; let fallosGlobales = 0;
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
      // Lo que la consola de DevTools muestra en rojo sin pasar por console.error: recursos que
      // fallan (400/401/404…) y violaciones de CSP. Con la URL, que el texto de Chrome no trae.
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') eventos.push('consola (' + d.params.entry.source + '): ' + d.params.entry.text.split('\n')[0].slice(0, 160) + (d.params.entry.url ? ' ← ' + d.params.entry.url.slice(0, 140) : ''));
    });
    const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Log.enable');
    await cmd('Page.addScriptToEvaluateOnNewDocument', { source: ESPIA });
    if (SESION_NODE) await cmd('Page.addScriptToEvaluateOnNewDocument', { source: await sembrado() });
    // Dos visitas por perfil: la 1.ª (/home) instala el Service Worker y TODAS las rutas siguientes
    // cargan con él controlando la página, como un usuario que vuelve. En local se activa con
    // AISC_SW_LOCAL (solo en este perfil temporal). --sin-sw lo ignora, para aislar otros fallos.
    const SIN_SW = args.includes('--sin-sw');
    if (SIN_SW) { await cmd('Network.enable'); await cmd('Network.setBypassServiceWorker', { bypass: true }); }
    else await cmd('Page.addScriptToEvaluateOnNewDocument', { source: 'window.AISC_SW_LOCAL = true;' });

    // La marca de la sesión: /home lleva a /org/<short>/<slug>/…
    await cmd('Page.navigate', { url: BASE + '/home' });
    await dormir(ESPERA);
    const donde = (await cmd('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true })).result?.result?.value || '';
    const m = donde.match(/^\/org\/[^/]+\/[^/]+/);
    if (!m) throw new Error(`Sin sesión de prueba: /home terminó en «${donde}». ¿servir-local con AISC_PRUEBA_*?`);
    if (!SIN_SW) {
      const sw = (await cmd('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `navigator.serviceWorker ? Promise.race([navigator.serviceWorker.ready.then((r) => !!r.active), new Promise((ok) => setTimeout(() => ok(false), 8000))]) : false` })).result?.result?.value;
      if (!sw) throw new Error('el Service Worker no se instaló en la 1.ª visita: la 2.ª visita no se estaría probando');
      console.log('Service Worker activo tras la 1.ª visita: las rutas cargan con él (2.ª visita en adelante)');
    }
    const rutas = rutasDeApp(readFileSync(join(ROOT, 'js/app.js'), 'utf8'), m[0]);
    // Una lista corta es un verde falso (pasó con el app.js minificado, que usa otras comillas).
    if (!SOLO && rutas.length < 20) throw new Error(`solo ${rutas.length} rutas leídas de js/app.js: el lector no entiende ese archivo`);
    if (CAPTURA) mkdirSync(CAPTURA, { recursive: true });
    console.log(`verificar-rutas: ${rutas.length} rutas en ${BASE} (marca ${m[0]}), ${ESPERA} ms cada una\n`);

    for (const ruta of rutas) {
      eventos = [];
      await cmd('Page.navigate', { url: BASE + ruta });
      await dormir(ESPERA);
      const v = (await cmd('Runtime.evaluate', { returnByValue: true, expression: `({ final: location.pathname, splash: window.__splashFuera || null, hayplash: !!document.getElementById('app-splash'), pintar: window.__pintarN || 0, mal: window.__pintarMal || [], csp: window.__csp || [] })` })).result?.result?.value || {};
      const problemas = [];
      for (const e of eventos) {
        const x = ESTRICTO ? null : EXCEPCIONES.find((ex) => ex.patron.test(e));
        if (x) tolerados.set(x.motivo, (tolerados.get(x.motivo) || 0) + 1); else problemas.push(e);
      }
      if (/^\/(login|signin)\b/.test(v.final || '')) problemas.push(`terminó en ${v.final}: la sesión murió`);
      for (const x of v.mal || []) problemas.push('pintar ≠ innerHTML: ' + x);
      if (v.hayplash && !v.splash) problemas.push(`el splash sigue encima a los ${ESPERA} ms`);
      else if (v.splash > SPLASH_MAX) problemas.push(`el splash tardó ${v.splash} ms en irse (tope ${SPLASH_MAX})`);
      for (const x of v.csp || []) problemas.push('violación de CSP: ' + x);
      if (A11Y && A11Y_RUTAS.some((r) => ruta.replace(m[0], '') === r || ruta.startsWith(r + '/'))) {
        const ev = async (expression) => (await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
        problemas.push(...await a11y.nombres(cmd, ev), ...await a11y.foco(cmd, ev));
        const conShell = await ev(`!!document.getElementById('headerHamburger')`);
        if (!a11yGlobal && conShell) {
          a11yGlobal = true;
          const globales = [...(await a11y.contraste(ev)) || [], ...await a11y.drawer(cmd, ev)];
          if (globales.length) { fallosGlobales++; console.log('✗ a11y global (tokens y drawer)'); globales.forEach((g) => console.log('    ' + g)); } else console.log('✓ a11y global: contraste AA de los tokens y drawer móvil');
        }
      }
      if (CAPTURA) {
        const png = await cmd('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(CAPTURA, ruta.replace(/^\//, '').replace(/[/:]/g, '_') + '.png'), Buffer.from(png.result.data, 'base64'));
      }
      const corta = ruta.replace(m[0], '');
      const destino = v.final && v.final !== ruta ? ` → ${v.final.replace(m[0], '')}` : '';
      if (problemas.length) { fallos++; console.log(`✗ ${corta}${destino}`); problemas.forEach((p) => console.log('    ' + p)); } else console.log(`✓ ${corta}${destino}  (pintar ${v.pintar})`);
    }
    for (const [motivo, n] of tolerados) console.log(`  tolerado ×${n}: ${motivo}`);
    if (A11Y && !a11yGlobal) { fallosGlobales++; console.log('✗ a11y global: ninguna vista pulida con shell en esta corrida; tokens y drawer sin medir'); }
    console.log(`\n${rutas.length - fallos}/${rutas.length} rutas sin problemas${A11Y ? (fallosGlobales ? ' · a11y global con problemas' : ' · a11y global en verde') : ''}`);
  } finally {
    try { ws?.close(); } catch { /* ya cerrado */ }
    ch.kill();
    await dormir(300);
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome aún suelta archivos */ }
  }
  process.exit(fallos || fallosGlobales ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('verificar-rutas:', e.message); process.exit(2); });
}
