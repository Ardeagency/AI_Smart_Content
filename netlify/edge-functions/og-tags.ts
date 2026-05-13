/**
 * og-tags — Edge Function que reescribe meta tags por ruta antes de servir el SPA.
 *
 * Por qué: index.html sirve TODAS las rutas (SPA fallback). Los scrapers de
 * WhatsApp/Slack/LinkedIn no ejecutan JS, así que ven los meta tags estáticos
 * y muestran el mismo preview para `/`, `/login`, `/org/.../brand`, etc.
 *
 * Esta función intercepta rutas específicas, deja que Netlify devuelva el
 * index.html del SPA fallback, y reemplaza los meta tags (og:title,
 * og:description, twitter:*, description, og:url) según la ruta.
 *
 * Los browsers también reciben este HTML; PageMeta.js sigue actualizando
 * document.title client-side para las pestañas (no interfiere).
 */

import type { Context } from 'https://edge.netlify.com';

type RouteMeta = {
  title: string;
  description: string;
};

const DEFAULT_META: RouteMeta = {
  title: 'AI Smart Content',
  description:
    'Plataforma de inteligencia comercial y generación autónoma de contenido, diseñada para sincronizar a las empresas con el presente absoluto.',
};

const LOGIN_META: RouteMeta = {
  title: 'Iniciar sesión · AI Smart Content',
  description:
    'Inicia sesión en AI Smart Content — plataforma de inteligencia comercial y generación autónoma de contenido que sincroniza a tu empresa con el presente absoluto.',
};

const ROUTE_META: Record<string, RouteMeta> = {
  '/login': LOGIN_META,
  '/signin': LOGIN_META,
};

function metaForPath(pathname: string): RouteMeta {
  return ROUTE_META[pathname] || DEFAULT_META;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function rewrite(html: string, meta: RouteMeta, canonicalUrl: string): string {
  const t = escapeAttr(meta.title);
  const d = escapeAttr(meta.description);
  const u = escapeAttr(canonicalUrl);

  return html
    .replace(
      /<meta name="description" content="[^"]*">/i,
      `<meta name="description" content="${d}">`
    )
    .replace(
      /<link rel="canonical" href="[^"]*">/i,
      `<link rel="canonical" href="${u}">`
    )
    .replace(
      /<meta property="og:url" content="[^"]*">/i,
      `<meta property="og:url" content="${u}">`
    )
    .replace(
      /<meta property="og:title" content="[^"]*">/i,
      `<meta property="og:title" content="${t}">`
    )
    .replace(
      /<meta property="og:description" content="[^"]*">/i,
      `<meta property="og:description" content="${d}">`
    )
    .replace(
      /<meta name="twitter:title" content="[^"]*">/i,
      `<meta name="twitter:title" content="${t}">`
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*">/i,
      `<meta name="twitter:description" content="${d}">`
    );
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const meta = metaForPath(url.pathname);
  const canonical = `https://console.aismartcontent.io${url.pathname}`;

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return response;

  const html = await response.text();
  const rewritten = rewrite(html, meta, canonical);

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(rewritten, { status: response.status, headers });
};

export const config = {
  path: ['/', '/login', '/signin'],
};
