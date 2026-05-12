/**
 * Service Worker — cache agresivo de assets versionados, bypass de APIs.
 *
 * Estrategias por tipo de request:
 *  - HTML (index, /*): NETWORK-ONLY. Nunca cacheamos HTML porque Netlify
 *    swap __BUILD_ID__ y queremos siempre el build vigente.
 *  - JS/CSS con ?v=BUILD: CACHE-FIRST (immutable). La URL cambia con
 *    cada deploy, así que cache infinito por URL es seguro.
 *  - JS/CSS sin ?v= (utils/, config/): STALE-WHILE-REVALIDATE.
 *  - Fonts/CDN libs (jsdelivr): CACHE-FIRST.
 *  - Imágenes locales (/recursos/): CACHE-FIRST.
 *  - Imágenes de usuario (Cloudinary, Supabase Storage): NETWORK-FIRST
 *    con fallback a caché si offline.
 *  - Supabase REST/RPC, Netlify functions, Edge Functions: NETWORK-ONLY.
 *
 * Versionado del cache: el nombre incluye BUILD_ID. Cada deploy crea un
 * nuevo cache y borra los anteriores en `activate`. Kill switch: en
 * cualquier momento se puede desregistrar desde DevTools si quedara
 * algo podrido.
 */
// BUILD_ID lo reemplaza Netlify en build (sed). En local sin build el
// placeholder queda como fallback de string para que el SW no rompa.
const BUILD_ID = '__BUILD_ID__';
const CACHE_VERSIONED = `versioned-${BUILD_ID}`;
const CACHE_LIBS = `libs-${BUILD_ID}`;
const CACHE_IMAGES = `images-${BUILD_ID}`;
const CACHE_OFFLINE = `offline-${BUILD_ID}`;
const OFFLINE_URL = '/offline.html';
const ALLOWED_CACHES = new Set([CACHE_VERSIONED, CACHE_LIBS, CACHE_IMAGES, CACHE_OFFLINE]);

self.addEventListener('install', (event) => {
  // Skip waiting → activar la nueva SW al instante. El cliente recibe
  // el control en `clients.claim()` abajo. Para deploys: cada navegación
  // tras el deploy bootstrapea con la SW nueva sin esperar a que el user
  // cierre todas las pestañas.
  event.waitUntil((async () => {
    // Precargar el offline fallback. Si esta fetch falla en el install,
    // la SW se instala igual (waitUntil no rejecta el install) pero el
    // offline fallback no estará disponible hasta el próximo fetch.
    try {
      const cache = await caches.open(CACHE_OFFLINE);
      await cache.add(OFFLINE_URL);
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borrar caches viejos (de builds previos).
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => !ALLOWED_CACHES.has(n)).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

function isAppOrigin(url) { return url.origin === self.location.origin; }

function isVersionedAsset(url) {
  if (!isAppOrigin(url)) return false;
  const isAsset = /\.(js|css|svg|woff2?|ttf|otf)(\?|$)/i.test(url.pathname + url.search);
  return isAsset && url.searchParams.has('v');
}

function isUnversionedAsset(url) {
  if (!isAppOrigin(url)) return false;
  const isAsset = /\.(js|css|svg|woff2?|ttf|otf)(\?|$)/i.test(url.pathname);
  return isAsset && !url.searchParams.has('v');
}

function isLocalImage(url) {
  return isAppOrigin(url) && /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(url.pathname);
}

function isRemoteLib(url) {
  return /^https:\/\/cdn\.jsdelivr\.net\//i.test(url.href);
}

function isRemoteImage(url) {
  return /^https:\/\/res\.cloudinary\.com\//i.test(url.href)
      || /supabase\.co\/.*\/storage\/.*\/(public|sign)\//i.test(url.href);
}

function isApiCall(url) {
  return /supabase\.co\/(rest|auth|realtime|functions)\b/i.test(url.href)
      || /\/\.netlify\/functions\//i.test(url.pathname);
}

function isHtmlNavigation(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    try { cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) { try { cache.put(request, response.clone()); } catch (_) {} }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) { try { cache.put(request, response.clone()); } catch (_) {} }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function navigationWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch (_) {
    // Offline o servidor caído → servir offline.html como fallback.
    const cache = await caches.open(CACHE_OFFLINE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    // Si el offline tampoco está cacheado (install falló), devolver un
    // 503 mínimo para que el browser muestre su propio error de red.
    return new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Solo GET. POST/PUT/DELETE siempre van a red sin tocar cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bypass total para APIs.
  if (isApiCall(url)) return;

  // Navegaciones (HTML): intentar red, fallback a offline.html si falla.
  if (isHtmlNavigation(request)) {
    return event.respondWith(navigationWithOfflineFallback(request));
  }

  if (isVersionedAsset(url))   return event.respondWith(cacheFirst(request, CACHE_VERSIONED));
  if (isUnversionedAsset(url)) return event.respondWith(staleWhileRevalidate(request, CACHE_VERSIONED));
  if (isLocalImage(url))       return event.respondWith(cacheFirst(request, CACHE_IMAGES));
  if (isRemoteLib(url))        return event.respondWith(cacheFirst(request, CACHE_LIBS));
  if (isRemoteImage(url))      return event.respondWith(networkFirst(request, CACHE_IMAGES));

  // Default: passthrough (red directo).
});
