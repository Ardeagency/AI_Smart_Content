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
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUERTO = Number(process.env.PUERTO || 5182);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

const inyectables = ['AISC_SUPABASE_URL', 'AISC_SUPABASE_ANON_KEY', 'AISC_API_URL', 'AISC_LOGIN_VIDEO_URL', 'AISC_MANTENIMIENTO', 'AISC_META_APP_ID'];
const snippet = '<script>' + inyectables.filter((k) => process.env[k]).map((k) => `window.${k}=${JSON.stringify(process.env[k])};`).join('') + '</script>\n';

async function indexHtml() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  return html.replace('<script src="js/runtime-config.js', snippet + '    <script src="js/runtime-config.js');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
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
  console.log(`consola local en http://127.0.0.1:${PUERTO} · inyectado: ${inyectables.filter((k) => process.env[k]).join(', ') || '(nada)'}`);
});
