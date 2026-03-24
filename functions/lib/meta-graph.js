/**
 * Meta Graph API — helpers alineados con la documentación oficial:
 * https://developers.facebook.com/docs/graph-api/guides/secure-requests/
 *
 * - Versión de API configurable (META_GRAPH_API_VERSION, por defecto v22.0)
 * - appsecret_proof: HMAC-SHA256 con clave = app secret, mensaje = access_token (hex)
 */

const crypto = require('crypto');

function getMetaGraphVersion() {
  const raw = (process.env.META_GRAPH_API_VERSION || 'v22.0').trim();
  if (raw.startsWith('v')) return raw;
  return `v${raw}`;
}

function getGraphBase() {
  return `https://graph.facebook.com/${getMetaGraphVersion()}`;
}

/**
 * appsecret_proof obligatorio en muchos entornos cuando la llamada sale del servidor
 * con el app secret disponible.
 */
function appSecretProof(accessToken, appSecret) {
  if (!appSecret || !accessToken) return null;
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

function buildMetaGraphUrl(path, accessToken, appSecret, params = {}) {
  const base = getGraphBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${p}`);
  url.searchParams.set('access_token', accessToken);
  const proof = appSecretProof(accessToken, appSecret);
  if (proof) url.searchParams.set('appsecret_proof', proof);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

async function metaGraphGet(path, accessToken, appSecret, params = {}) {
  const url = buildMetaGraphUrl(path, accessToken, appSecret, params);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const msg = json.error.message || json.error.type || JSON.stringify(json.error);
    const err = new Error(msg);
    err.metaError = json.error;
    throw err;
  }
  return json;
}

/**
 * Sigue cursores `paging.cursors.after` hasta reunir hasta maxItems filas en el edge.
 * Ver: https://developers.facebook.com/docs/graph-api/results
 */
async function metaGraphGetPaged(path, accessToken, appSecret, params = {}, maxItems = 100) {
  const out = [];
  let after = null;
  const pageLimit = 50;

  while (out.length < maxItems) {
    const batchLimit = Math.min(pageLimit, maxItems - out.length);
    const q = {
      ...params,
      limit: String(batchLimit)
    };
    if (after) q.after = after;

    const json = await metaGraphGet(path, accessToken, appSecret, q);
    const data = json.data || [];
    out.push(...data);
    const nextAfter = json.paging?.cursors?.after;
    if (!nextAfter || data.length === 0) break;
    after = nextAfter;
  }
  return out;
}

module.exports = {
  getMetaGraphVersion,
  getGraphBase,
  appSecretProof,
  buildMetaGraphUrl,
  metaGraphGet,
  metaGraphGetPaged
};
