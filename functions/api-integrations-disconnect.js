/**
 * api-integrations-disconnect
 * Desconecta una integración de forma segura:
 *   1. Verifica que el usuario autenticado tiene acceso a la marca
 *   2. Revoca el token directamente en el proveedor (Google / Meta)
 *   3. Elimina la integración de brand_integrations en Supabase
 *
 * POST /api/integrations/disconnect
 * Headers: Authorization: Bearer {supabase_access_token}
 * Body: { brand_container_id, platform }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember
} = require('./lib/ai-shared');
const { buildMetaGraphUrl } = require('./lib/meta-graph');

// ── Brand container auth ──────────────────────────────────────────────────────
async function assertBrandContainerAccess({ env, accessToken, brandContainerId }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) { throw Object.assign(new Error('Invalid session'), { statusCode: 401 }); }

  const containers = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brandContainerId}`, limit: '1' }
  });
  const bc = Array.isArray(containers) ? containers[0] : null;
  if (!bc) { throw Object.assign(new Error('Brand not found'), { statusCode: 404 }); }

  if (bc.user_id !== user.id) {
    if (!bc.organization_id) { throw Object.assign(new Error('No autorizado'), { statusCode: 403 }); }
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: bc.organization_id, userId: user.id });
  }
  return { user };
}

// ── Revoke Google token ───────────────────────────────────────────────────────
async function revokeGoogleToken(token) {
  if (!token) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  } catch (e) {
    console.warn('[disconnect] Google revoke failed (token may already be expired):', e?.message);
  }
}

// ── Revoke Meta token ─────────────────────────────────────────────────────────
async function revokeMetaToken(userId, token, appSecret) {
  if (!userId || !token) return;
  try {
    const url = buildMetaGraphUrl(
      `/${encodeURIComponent(userId)}/permissions`,
      token,
      appSecret || '',
      {}
    );
    await fetch(url, { method: 'DELETE' });
  } catch (e) {
    console.warn('[disconnect] Meta revoke failed (token may already be expired):', e?.message);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const brandContainerId = String(body.brand_container_id || '').trim();
  const platform = String(body.platform || '').toLowerCase().trim();

  if (!brandContainerId || !platform) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing brand_container_id or platform' }) };
  }
  if (!['google', 'facebook'].includes(platform)) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Unsupported platform' }) };
  }

  // Verify user access to this brand
  try {
    await assertBrandContainerAccess({ env, accessToken, brandContainerId });
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }

  // Load integration row (need tokens to revoke)
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,access_token,refresh_token,external_account_id,metadata',
      brand_container_id: `eq.${brandContainerId}`,
      platform: `eq.${platform}`,
      is_active: 'eq.true',
      limit: '1'
    }
  });
  const integ = Array.isArray(rows) ? rows[0] : null;

  if (integ?.id) {
    // Revoke token at provider before removing from DB
    if (platform === 'google') {
      const tokenToRevoke = integ.access_token || integ.refresh_token;
      await revokeGoogleToken(tokenToRevoke);
    }
    if (platform === 'facebook') {
      const userId = integ.external_account_id || integ.metadata?.provider_user_id;
      await revokeMetaToken(userId, integ.access_token, process.env.META_APP_SECRET);
    }

    // Delete integration from DB (hard delete for clean state)
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'DELETE',
      searchParams: { id: `eq.${integ.id}` }
    });
  }

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({ ok: true, platform })
  };
};
