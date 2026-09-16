#!/usr/bin/env node
/**
 * Servidor local de la consola para el CORTE (ADR-0052): estáticos + fallback SPA
 * (como netlify.toml) e inyección de la base/borde en runtime, SIN tocar código:
 *
 *   AISC_SUPABASE_URL=… AISC_SUPABASE_ANON_KEY=… AISC_API_URL=… node scripts/servir-local.mjs
 *
 * Inyecta un <script> antes de runtime-config.js con esos valores (la anon key es
 * pública por diseño; nunca service_role). Sin variables sirve v1 tal cual (la
 * function supabase-config no existe aquí: la consola no arranca sin la base).
 * Puerto 5182 en 127.0.0.1 (la extensión de Chrome no abre localhost).
 *
 * Sesión de prueba SIN teclear la clave en el navegador: con
 *   AISC_PRUEBA_USUARIO=… AISC_PRUEBA_CLAVE=…
 * el servidor hace el login una vez (supabase-js en Node) y sirve /__sesion.js,
 * que siembra la sesión en localStorage con la clave que usa supabase-js
 * (`sb-<ref>-auth-token`). La clave nunca sale del entorno; el JWT solo viaja
 * servidor → navegador en 127.0.0.1. Solo para local: en Netlify no existe.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUERTO = Number(process.env.PUERTO || 5182);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

const inyectables = ['AISC_SUPABASE_URL', 'AISC_SUPABASE_ANON_KEY', 'AISC_API_URL', 'AISC_LOGIN_VIDEO_URL', 'AISC_MANTENIMIENTO', 'AISC_META_APP_ID'];
const conSesion = !!(process.env.AISC_PRUEBA_USUARIO && process.env.AISC_PRUEBA_CLAVE && process.env.AISC_SUPABASE_URL && process.env.AISC_SUPABASE_ANON_KEY);
const snippet = '<script>' + inyectables.filter((k) => process.env[k]).map((k) => `window.${k}=${JSON.stringify(process.env[k])};`).join('') + '</script>\n'
  + (conSesion ? '<script src="/__sesion.js"></script>\n' : '');
let sesionPromesa = null;
async function sesionDePrueba() {
  if (!sesionPromesa) {
    sesionPromesa = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.AISC_SUPABASE_URL, process.env.AISC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await sb.auth.signInWithPassword({ email: process.env.AISC_PRUEBA_USUARIO, password: process.env.AISC_PRUEBA_CLAVE });
      if (error) throw error;
      return data.session;
    })();
    sesionPromesa.catch(() => { sesionPromesa = null; });
  }
  return sesionPromesa;
}
async function sesionJs() {
  const s = await sesionDePrueba();
  const ref = new URL(process.env.AISC_SUPABASE_URL).host.split('.')[0];
  // Misma forma que guarda supabase-js v2 (GoTrue): el objeto de sesión entero.
  return `try{var k='sb-${ref}-auth-token';if(!localStorage.getItem(k)){localStorage.setItem(k,${JSON.stringify(JSON.stringify(s))});}}catch(e){}`;
}

async function indexHtml() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  return html.replace('<script src="js/runtime-config.js', snippet + '    <script src="js/runtime-config.js');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (ruta === '/__sesion.js' && conSesion) {
    try { const js = await sesionJs(); res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); res.end(js); }
    catch (e) { res.writeHead(500, { 'content-type': 'text/javascript' }); res.end(`console.error('sesión de prueba: ${String(e.message || e).replace(/'/g, '')}');`); }
    return;
  }
  if (ruta.startsWith('/.netlify/functions/')) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"sin_functions_en_local"}'); return; }
  const archivo = join(ROOT, ruta);
  try {
    const s = await stat(archivo);
    if (s.isFile() && !ruta.endsWith('/index.html') && ruta !== '/') {
      res.writeHead(200, { 'content-type': MIME[extname(archivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(archivo));
      return;
    }
  } catch (_) { /* cae al SPA */ }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(await indexHtml());
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`consola local en http://127.0.0.1:${PUERTO} · inyectado: ${inyectables.filter((k) => process.env[k]).join(', ') || '(nada)'}${conSesion ? ' · sesión de prueba sembrada' : ''}`);
});
