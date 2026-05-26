// Helpers genericos de scraping de URLs compartidos por los endpoints de fichas
// (productos / lugares / servicios). Solo viven aqui los que son identicos entre
// los tres: parseo de HTML puro y sin estado.
//
// NO se comparten `detectPlatform` ni `isUsefulScrape`: divergen a proposito por
// dominio (lugares detecta Google Maps/TripAdvisor; productos/servicios detectan
// marketplaces de ecommerce; las senales de "scrape util" tambien difieren).

// Decodifica entidades HTML basicas que aparecen en atributos.
function decodeHtmlEntities(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Lee un atributo content de un <meta>. Acepta property|name antes O despues
// de content (algunas paginas invierten el orden). Devuelve null si no hay match.
function readMeta(html, keyValues) {
  for (const [attrName, attrValue] of keyValues) {
    const escVal = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Order 1: <meta property="og:image" content="...">
    let m = html.match(new RegExp(`<meta[^>]+\\b${attrName}=["']${escVal}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'));
    if (m && m[1]) return decodeHtmlEntities(m[1]);
    // Order 2: <meta content="..." property="og:image">
    m = html.match(new RegExp(`<meta[^>]+\\bcontent=["']([^"']*)["'][^>]+\\b${attrName}=["']${escVal}["']`, 'i'));
    if (m && m[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

module.exports = { decodeHtmlEntities, readMeta };
