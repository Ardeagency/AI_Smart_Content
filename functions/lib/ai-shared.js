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

/**
 * Valida que una URL sea segura para reenviar a un servicio tercero (KIE,
 * OpenAI Vision, etc). Bloquea SSRF a infra interna o IPs privadas.
 *
 * Reglas:
 *   - Solo HTTPS (HTTP permite http://localhost que pasa /^https?:/).
 *   - Bloquea hostnames sospechosos: localhost, *.local, *.internal, IPs
 *     literales privadas/loopback/link-local (IPv4 + IPv6).
 *   - Bloquea metadata endpoints conocidos (AWS 169.254.169.254, GCP).
 *
 * Devuelve { ok: true } o { ok: false, reason: '...' }.
 */
function validateExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { ok: false, reason: 'url vacia' };
  let u;
  try { u = new URL(rawUrl); }
  catch (_) { return { ok: false, reason: 'url malformada' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'solo https permitido' };
  const host = (u.hostname || '').toLowerCase();
  if (!host) return { ok: false, reason: 'host vacio' };

  // Hostnames bloqueados (DNS rebinding + nombres reservados).
  const BLOCKED_HOST_RE = /^(localhost|.*\.local|.*\.internal|.*\.localdomain)$/;
  if (BLOCKED_HOST_RE.test(host)) return { ok: false, reason: 'host interno' };

  // IPv4 literal: bloquear privadas/loopback/link-local/cloud metadata.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return { ok: false, reason: 'ip privada 10/8' };
    if (a === 127) return { ok: false, reason: 'ip loopback' };
    if (a === 169 && b === 254) return { ok: false, reason: 'ip link-local / metadata' };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: 'ip privada 172.16/12' };
    if (a === 192 && b === 168) return { ok: false, reason: 'ip privada 192.168/16' };
    if (a === 0 || a >= 224) return { ok: false, reason: 'ip reservada' };
  }

  // IPv6 literal: bloquear loopback (::1), link-local (fe80::/10), ULA (fc00::/7),
  // y la IPv4-mapped 0:0:...:ffff:a.b.c.d hacia rangos privados.
  if (host.includes(':')) {
    const v6 = host.replace(/^\[|\]$/g, '');
    if (v6 === '::1' || v6 === '0:0:0:0:0:0:0:1') return { ok: false, reason: 'ipv6 loopback' };
    if (/^fe[89ab][0-9a-f]:/i.test(v6)) return { ok: false, reason: 'ipv6 link-local' };
    if (/^f[cd][0-9a-f][0-9a-f]:/i.test(v6)) return { ok: false, reason: 'ipv6 ula' };
  }

  return { ok: true };
}

/**
 * Pre-check de balance ANTES de disparar una operacion cara (KIE create).
 * Lee organization_credits.credits_available via REST (sin consumir). Si el
 * balance es menor al estimado, retorna { ok:false } para que el endpoint
 * devuelva 402 sin disparar el create.
 *
 * Premium SaaS: protege contra abuso (spam createTask sin saldo) sin pre-cobrar.
 */
async function ensureBalanceAtLeast({ env, organizationId, minCredits }) {
  if (!organizationId) return { ok: false, reason: 'organization_id requerido' };
  const minCr = Number(minCredits) || 0;
  if (minCr <= 0) return { ok: true, balance: null };
  const url = `${env.url}/rest/v1/organization_credits?organization_id=eq.${encodeURIComponent(organizationId)}&select=credits_available`;
  const res = await fetch(url, {
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    return { ok: false, reason: `no se pudo leer balance (HTTP ${res.status})` };
  }
  const rows = await res.json().catch(() => null);
  const balance = Number(rows?.[0]?.credits_available ?? 0);
  if (!Number.isFinite(balance)) {
    return { ok: false, reason: 'balance no numerico' };
  }
  if (balance < minCr) {
    return { ok: false, reason: 'saldo insuficiente', balance, required: minCr };
  }
  return { ok: true, balance };
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
  logUserAudit,
  validateExternalUrl,
  ensureBalanceAtLeast
};

