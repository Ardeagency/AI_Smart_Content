/**
 * api-integrations-google-select
 *
 * POST /api/integrations/google/select
 *   body: { brand_container_id, selected_customer_ids: ["123...", ...] }
 *   Headers: Authorization: Bearer {supabase_access_token}
 *
 * Guarda QUE cuenta(s) de Google Ads eligio el usuario para esta marca
 * (selector), limpia awaiting_account_selection, y encola el bootstrap real
 * (google_initial_bootstrap) que ahora sincroniza SOLO las cuentas elegidas.
 *
 * Esto evita el problema de agencia: nunca se jala todo el portafolio del MCC.
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
const { checkRateLimit } = require('./lib/rate-limiter');

function nowIso() { return new Date().toISOString(); }

async function assertBrandContainerAccess({ env, accessToken, brandContainerId }) {
  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) { const e = new Error('Invalid session'); e.statusCode = 401; throw e; }
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers', method: 'GET',
    searchParams: { select: 'id,user_id,organization_id', id: `eq.${brandContainerId}`, limit: '1' }
  });
  const bc = Array.isArray(rows) ? rows[0] : null;
  if (!bc) { const e = new Error('Brand not found'); e.statusCode = 404; throw e; }
  if (bc.user_id !== user.id) {
    if (!bc.organization_id) { const e = new Error('No autorizado'); e.statusCode = 403; throw e; }
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: bc.organization_id, userId: user.id });
  }
  return { user, bc };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  const rl = checkRateLimit(event, { maxRequests: 10, windowMs: 60000, keyPrefix: 'gads-select' });
  if (rl.blocked) return { statusCode: 429, headers: { ...corsHeaders(event), 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) }, body: JSON.stringify({ error: 'Too many requests' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server config error' }) }; }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {}
  const brandContainerId = String(body.brand_container_id || '').trim();
  const selectedRaw = Array.isArray(body.selected_customer_ids) ? body.selected_customer_ids : [];
  const selected = [...new Set(selectedRaw.map((s) => String(s).replace(/\D/g, '')).filter(Boolean))];

  if (!brandContainerId) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing brand_container_id' }) };
  if (!selected.length)  return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Selecciona al menos una cuenta' }) };

  let auth;
  try { auth = await assertBrandContainerAccess({ env, accessToken, brandContainerId }); }
  catch (e) { return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  // Cargar la integracion google + sus cuentas disponibles
  const integRows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: { select: 'id,metadata', brand_container_id: `eq.${brandContainerId}`, platform: 'eq.google', is_active: 'eq.true', limit: '1' }
  });
  const integ = Array.isArray(integRows) ? integRows[0] : null;
  if (!integ?.id) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Integracion de Google no encontrada' }) };

  // Validar que lo elegido este entre las cuentas disponibles
  const available = Array.isArray(integ.metadata?.available_accounts) ? integ.metadata.available_accounts : [];
  const availableIds = new Set(available.map((a) => String(a.customer_id)));
  const invalid = selected.filter((id) => !availableIds.has(id));
  if (availableIds.size && invalid.length) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: `Cuenta(s) no disponibles: ${invalid.join(', ')}` }) };
  }

  // Guardar seleccion + limpiar flag
  await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'PATCH',
    searchParams: { id: `eq.${integ.id}` },
    body: [{
      metadata: { ...(integ.metadata || {}), selected_customer_ids: selected, awaiting_account_selection: false, accounts_selected_at: nowIso() },
      bootstrap_status: 'pending',
      updated_at: nowIso()
    }]
  });

  // Encolar el bootstrap real (ahora sincroniza solo las cuentas elegidas)
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'agent_queue_jobs', method: 'POST',
      body: [{
        organization_id: auth.bc.organization_id,
        job_type: 'mission', priority: 5,
        payload: { mission_type: 'google_initial_bootstrap', brand_integration_id: integ.id, brand_container_id: brandContainerId, platform: 'google' },
        status: 'queued'
      }]
    });
  } catch (e) { console.warn('[google-select] enqueue bootstrap (non-blocking):', e?.message || e); }

  if (auth.bc.organization_id) {
    await logUserAudit({
      env, event, user: auth.user, organizationId: auth.bc.organization_id,
      action: 'integration.google.select_accounts', resourceType: 'brand_integrations', resourceId: integ.id,
      metadata: { brand_container_id: brandContainerId, selected_customer_ids: selected }
    }).catch(() => {});
  }

  return { statusCode: 200, headers: { ...corsHeaders(event), 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, selected_count: selected.length }) };
};
