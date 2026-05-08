/**
 * api-integrations-link
 *
 * Link/unlink manual de campaigns o segments a personas conceptuales.
 * Esto es la "Capa 4" de la simbiosis: el user toma la decisión, sin AI.
 *
 * POST /api/integrations/link
 * Body: { entity_type: 'campaign'|'segment', entity_id: <uuid>, persona_id: <uuid>|null }
 *   - persona_id null → unlink
 *
 * Auth: usuario debe ser miembro de la org dueña del brand_container del entity.
 * Validación: persona y entity deben pertenecer al MISMO brand_container.
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  supabaseRest,
  assertOrgMember,
  logUserAudit,
} = require('./lib/ai-shared');

const ENTITY_TABLE = {
  campaign: 'campaigns',
  segment:  'audience_segments',
};

async function loadEntity(env, entityType, entityId) {
  const table = ENTITY_TABLE[entityType];
  if (!table) throw Object.assign(new Error(`entity_type inválido: ${entityType}`), { statusCode: 400 });
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: table, method: 'GET',
    searchParams: { select: 'id,brand_container_id,organization_id,persona_id', id: `eq.${entityId}`, limit: '1' }
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw Object.assign(new Error(`${entityType} not found`), { statusCode: 404 });
  return { row, table };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };

  let env;
  try { env = getSupabaseEnv(); } catch (e) { return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }; }

  const accessToken = getBearerToken(event);
  if (!accessToken) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unauthorized' }) };

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid session' }) };

  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); } catch (_) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Body JSON inválido' }) };
  }

  const { entity_type, entity_id, persona_id } = body;
  if (!entity_type || !entity_id) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing entity_type or entity_id' }) };
  }
  if (persona_id !== null && typeof persona_id !== 'string') {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'persona_id must be uuid string or null' }) };
  }

  try {
    const { row, table } = await loadEntity(env, entity_type, entity_id);
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: row.organization_id, userId: user.id });

    // Si persona_id no es null, validar que pertenezca al mismo brand_container
    if (persona_id) {
      const personas = await supabaseRest({
        url: env.url, serviceKey: env.serviceKey,
        path: 'audience_personas', method: 'GET',
        searchParams: { select: 'id,brand_container_id', id: `eq.${persona_id}`, limit: '1' }
      });
      const persona = Array.isArray(personas) ? personas[0] : null;
      if (!persona) return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'persona no encontrada' }) };
      if (persona.brand_container_id !== row.brand_container_id) {
        return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'persona y entity en distintos brand_containers' }) };
      }
    }

    const previousPersonaId = row.persona_id || null;
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: table, method: 'PATCH',
      searchParams: { id: `eq.${entity_id}` },
      body: [{ persona_id: persona_id || null, updated_at: new Date().toISOString() }]
    });

    await logUserAudit({
      env, event, user,
      organizationId: row.organization_id,
      action: persona_id ? `${entity_type}.link_persona` : `${entity_type}.unlink_persona`,
      resourceType: table,
      resourceId: entity_id,
      metadata: { persona_id: persona_id || null, previous_persona_id: previousPersonaId, brand_container_id: row.brand_container_id }
    });

    return { statusCode: 200, headers: { ...corsHeaders(event), 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, entity_type, entity_id, persona_id: persona_id || null }) };
  } catch (e) {
    return { statusCode: e.statusCode || 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) };
  }
};
