/**
 * Las cabeceras REALES de producción, leídas de netlify.toml ([[headers]]), para servirlas
 * en local (scripts/servir-local.mjs). Así un fallo que solo aparece con la CSP de verdad
 * se ve en local: el del 25/09, un Service Worker que pedía al CDN sin permiso en connect-src.
 *
 *   leerReglas(toml)          → [{ for, valores: { Cabecera: 'valor' } }] en el orden del archivo
 *   cabecerasPara(reglas, r)  → las cabeceras que Netlify aplicaría a la ruta r
 *                               (todas las reglas cuyo `for` encaja; con `*` = cualquier cosa)
 */
export function leerReglas(toml) {
  return toml.split(/^\[\[headers\]\]\s*$/m).slice(1).map((bloque) => {
    const propio = bloque.split(/^\[\[/m)[0];
    const para = (propio.match(/^\s*for\s*=\s*"([^"]+)"/m) || [])[1];
    const valores = {};
    const tabla = propio.split(/^\s*\[headers\.values\]\s*$/m)[1] || '';
    for (const m of tabla.matchAll(/^\s*([A-Za-z0-9-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/gm)) valores[m[1]] = m[2];
    return { for: para, valores };
  }).filter((r) => r.for);
}

const aRegex = (patron) => new RegExp('^' + patron.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

export function cabecerasPara(reglas, ruta) {
  const out = {};
  for (const r of reglas) if (aRegex(r.for).test(ruta)) Object.assign(out, r.valores);
  return out;
}
