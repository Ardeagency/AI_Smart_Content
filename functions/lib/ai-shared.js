/**
 * Whitelist de orígenes permitidos para llamar a las funciones con auth.
 * En producción solo el dominio propio; en local, los puertos típicos de Netlify/Vite.
 * SITE_URL se añade en runtime para que deploys custom también queden cubiertos.
 */
const ALLOWED_ORIGINS = new Set([
  'https://aismartcontent.io',
  'https://www.aismartcontent.io',
  'http://localhost:8888',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:8888'
]);
if (process.env.SITE_URL) ALLOWED_ORIGINS.add(process.env.SITE_URL.replace(/\/$/, ''));

function resolveAllowedOrigin(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  // Fallback conservador: el dominio canónico. Así nunca devolvemos `*` sobre
  // endpoints con auth — evita que un sitio tercero use el token del usuario.
  return process.env.SITE_URL
    ? process.env.SITE_URL.replace(/\/$/, '')
    : 'https://aismartcontent.io';
}

/**
 * Headers CORS para funciones con auth (reflejan el origin si está en la allow-list,
 * si no, el dominio canónico). Llamar siempre con el `event` completo.
 * Sin argumento devuelve el default estricto (solo dominio canónico).
 */
function corsHeaders(event) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(event),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function getSupabaseEnv() {
  const url = process.env.SUPABASE_DATABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase env missing (SUPABASE_DATABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return { url, anonKey, serviceKey };
}

function getBearerToken(event) {
  const raw = event.headers?.authorization || event.headers?.Authorization || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

async function fetchSupabaseUser({ url, anonKey, accessToken }) {
  const res = await fetch(`${url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) return null;
  return await res.json();
}

async function supabaseRest({ url, serviceKey, path, method = 'GET', body, searchParams }) {
  const full = new URL(`${url}/rest/v1/${path.replace(/^\/+/, '')}`);
  if (searchParams && typeof searchParams === 'object') {
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v == null) return;
      full.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(full.toString(), {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const msg = json?.message || json?.error || text || `Supabase REST error ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.details = json || text;
    throw err;
  }
  return json;
}

async function assertOrgMember({ url, serviceKey, organizationId, userId }) {
  // owner_user_id OR organization_members
  const owners = await supabaseRest({
    url,
    serviceKey,
    path: 'organizations',
    method: 'GET',
    searchParams: {
      select: 'id',
      id: `eq.${organizationId}`,
      owner_user_id: `eq.${userId}`
    }
  });
  if (Array.isArray(owners) && owners.length > 0) return true;

  const members = await supabaseRest({
    url,
    serviceKey,
    path: 'organization_members',
    method: 'GET',
    searchParams: {
      select: 'id',
      organization_id: `eq.${organizationId}`,
      user_id: `eq.${userId}`
    }
  });
  if (Array.isArray(members) && members.length > 0) return true;

  const err = new Error('No autorizado para esta organización');
  err.statusCode = 403;
  throw err;
}

/**
 * Valida que el Bearer token sea de un usuario activo en Supabase.
 * Retorna el objeto de usuario si es válido, o null si el token es inválido/ausente.
 */
async function requireAuth(event) {
  const accessToken = getBearerToken(event);
  if (!accessToken) return null;
  try {
    const { url, anonKey } = getSupabaseEnv();
    return await fetchSupabaseUser({ url, anonKey, accessToken });
  } catch (_) {
    return null;
  }
}

/**
 * Rechaza requests con body mayor a `maxBytes`. Devuelve null si está OK,
 * o un objeto de respuesta HTTP 413 si excede. Usar al inicio del handler:
 *   const tooBig = checkBodySize(event, 1024 * 1024);
 *   if (tooBig) return tooBig;
 */
function checkBodySize(event, maxBytes = 5 * 1024 * 1024) {
  const cl = parseInt(event.headers?.['content-length'] || '0', 10);
  const bodyLen = typeof event.body === 'string' ? Buffer.byteLength(event.body) : 0;
  const size = Math.max(cl, bodyLen);
  if (size > maxBytes) {
    return {
      statusCode: 413,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: `Payload too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` })
    };
  }
  return null;
}

/**
 * logUserAudit — registra una acción de usuario en `user_audit_log`.
 * Best-effort: si la inserción falla, no aborta la request principal.
 *
 * @param {object} args
 *   - env: { url, serviceKey } de getSupabaseEnv()
 *   - event: el event Netlify (para extraer ip + user-agent + request-id)
 *   - user: objeto user con id + email
 *   - organizationId: uuid de la org
 *   - action: ej. 'integration.connect', 'integration.disconnect'
 *   - resourceType: ej. 'brand_integrations'
 *   - resourceId: uuid o key del recurso
 *   - metadata: jsonb con info adicional (platform, page_id, etc.)
 */
async function logUserAudit({ env, event, user, organizationId, action, resourceType, resourceId, metadata }) {
  if (!env || !organizationId || !action) return;
  try {
    const h = event?.headers || {};
    const ip =
      h['x-nf-client-connection-ip'] ||
      h['x-forwarded-for']?.split(',')[0]?.trim() ||
      h['client-ip'] || null;
    const userAgent = h['user-agent'] || null;
    const requestId = h['x-nf-request-id'] || null;

    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'user_audit_log', method: 'POST',
      body: [{
        organization_id: organizationId,
        user_id:         user?.id || null,
        user_email:      user?.email || null,
        action,
        resource_type:   resourceType || null,
        resource_id:     resourceId ? String(resourceId) : null,
        metadata:        metadata || {},
        ip_address:      ip,
        user_agent:      userAgent,
        request_id:      requestId,
      }]
    });
  } catch (e) {
    // Audit log es best-effort: no romper la request por un fallo aquí.
    console.warn('[audit-log]', action, '→', e?.message || e);
  }
}

module.exports = {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  requireAuth,
  supabaseRest,
  assertOrgMember,
  checkBodySize,
  logUserAudit
};

