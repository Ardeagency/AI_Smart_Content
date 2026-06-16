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
  assertOrgMember,
  logUserAudit
} = require('./lib/ai-shared');
const { decryptIntegrationRow } = require('./lib/integration-token-vault');
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
  return { user, organizationId: bc.organization_id };
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
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}

  const brandContainerId = String(body.brand_container_id || '').trim();
  const platform = String(body.platform || '').toLowerCase().trim();

  if (!brandContainerId || !platform) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id or platform' }) };
  }
  if (!['google', 'facebook', 'shopify', 'tiktok'].includes(platform)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unsupported platform' }) };
  }

  // Verify user access to this brand
  let auth;
  try {
    auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId });
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
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
  if (integ) decryptIntegrationRow(integ);

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
    if (platform === 'tiktok') {
      // Best-effort: revocar el access_token en TikTok antes del hard-delete.
      try {
        await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key:    process.env.TIKTOK_CLIENT_KEY || '',
            client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
            token:         integ.access_token || ''
          }).toString()
        });
      } catch (e) { console.warn('[disconnect] tiktok revoke (non-blocking):', e?.message || e); }
    }

    if (platform === 'shopify') {
      // D7: SOFT DELETE — preservar row + external_resource_map + history.
      // metadata.disconnected_at marca el inicio del periodo de retención (90 días).
      // Job cron separado purga tras 90d. La cancelación de webhooks Shopify se
      // hace desde ai-engine (TODO fase 2 — endpoint /integrations/shopify/disconnect
      // que llame a DELETE /admin/api/.../webhooks/{id}.json por cada one).
      const updatedMetadata = {
        ...(integ.metadata || {}),
        disconnected_at: new Date().toISOString(),
      };
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'PATCH',
        searchParams: { id: `eq.${integ.id}` },
        body: [{
          is_active: false,
          metadata:  updatedMetadata,
          updated_at: new Date().toISOString(),
        }]
      });
    } else {
      // Meta / Google: HARD DELETE (comportamiento actual)
      // TODO: unificar a soft delete cuando se cierre OPS-007 (cifrado vault)
      await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'brand_integrations', method: 'DELETE',
        searchParams: { id: `eq.${integ.id}` }
      });
    }
  }

  // Audit log: registrar la desconexión (visible al admin de la org)
  await logUserAudit({
    env,
    event,
    user: auth.user,
    organizationId: auth.organizationId,
    action: 'integration.disconnect',
    resourceType: 'brand_integrations',
    resourceId: integ?.id,
    metadata: {
      platform,
      brand_container_id: brandContainerId,
      hard_delete: platform !== 'shopify',
      external_account_id: integ?.external_account_id || null,
    }
  });

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({ ok: true, platform })
  };
};
