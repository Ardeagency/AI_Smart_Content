/**
 * Netlify Function: /api/widget-action
 *
 * Bridge para que widgets HTML embebidos en el chat de VERA (iframes sandbox
 * null-origin) puedan invocar acciones reales en la plataforma a traves de
 * `window.__veraAction(actionType, payload, reasoning)`.
 *
 * Flujo:
 *  Widget JS -> postMessage al parent (VeraView)
 *           -> VeraView valida origin + allowlist
 *           -> fetch a este endpoint con JWT del user
 *           -> dispatch por actionType
 *           -> respuesta vuelve al widget via postMessage
 *
 * Allowlist v1:
 *  Read:  get_metric, list_campaigns, list_products, list_brands,
 *         list_audiences, list_pending_actions
 *  Write: propose_brief, flag_competitor -> INSERT en vera_pending_actions
 *         (autonomia parcial: requiere aprobacion humana antes de escribir).
 *
 * Body: {
 *   organization_id, conversation_id, brand_container_id,
 *   actionType, payload, reasoning
 * }
 *
 * Respuesta: { ok: true, data } | { ok: false, error }
 */

const {
  corsHeaders,
  getSupabaseEnv,
  getBearerToken,
  fetchSupabaseUser,
  assertOrgMember,
  supabaseRest,
} = require('./lib/ai-shared');

const ALLOWLIST = new Set([
  'get_metric',
  'list_campaigns',
  'list_products',
  'list_brands',
  'list_audiences',
  'list_pending_actions',
  'propose_brief',
  'flag_competitor',
]);

const MAX_PAYLOAD_BYTES = 16 * 1024; // 16KB de payload del widget — suficiente para form data

function bad(event, status, error) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify({ ok: false, error }) };
}
function ok(event, data) {
  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify({ ok: true, data }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return bad(event, 405, 'method_not_allowed');
  }

  // Parse body
  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return bad(event, 400, 'invalid_json');
  }

  const {
    organization_id,
    conversation_id,
    brand_container_id,
    actionType,
    payload,
    reasoning,
  } = body || {};

  if (!organization_id || !actionType) return bad(event, 400, 'missing_required_fields');
  if (!ALLOWLIST.has(actionType))      return bad(event, 403, `action_not_allowed:${actionType}`);

  // Sanity en tamano payload (widget puede mandar form data, pero no debe ser un dump)
  if (payload && JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    return bad(event, 413, 'payload_too_large');
  }

  // Env + auth
  let env;
  try { env = getSupabaseEnv(); }
  catch (e) { return bad(event, 500, e.message); }

  const accessToken = getBearerToken(event);
  if (!accessToken) return bad(event, 401, 'missing_bearer_token');

  const user = await fetchSupabaseUser({ url: env.url, anonKey: env.anonKey, accessToken });
  if (!user?.id) return bad(event, 401, 'invalid_session');

  try {
    await assertOrgMember({ url: env.url, serviceKey: env.serviceKey, organizationId: organization_id, userId: user.id });
  } catch (e) {
    return bad(event, e.statusCode || 403, e.message || 'org_member_check_failed');
  }

  // Dispatch
  try {
    const ctx = {
      env,
      orgId: organization_id,
      userId: user.id,
      brandContainerId: brand_container_id || null,
      conversationId: conversation_id || null,
      payload: payload || {},
      reasoning: reasoning || '',
    };
    let data;
    switch (actionType) {
      case 'get_metric':              data = await handleGetMetric(ctx); break;
      case 'list_campaigns':          data = await handleListCampaigns(ctx); break;
      case 'list_products':           data = await handleListProducts(ctx); break;
      case 'list_brands':             data = await handleListBrands(ctx); break;
      case 'list_audiences':          data = await handleListAudiences(ctx); break;
      case 'list_pending_actions':    data = await handleListPendingActions(ctx); break;
      case 'propose_brief':           data = await handleProposeBrief(ctx); break;
      case 'flag_competitor':         data = await handleFlagCompetitor(ctx); break;
      default: return bad(event, 403, `dispatcher_missing:${actionType}`);
    }
    return ok(event, data);
  } catch (e) {
    console.error('widget-action error:', e);
    return bad(event, e.statusCode || 500, e.message || 'internal_error');
  }
};

// ── Read handlers ──────────────────────────────────────────────────────────

async function handleGetMetric({ env, orgId, brandContainerId, payload }) {
  // payload.metric = "engagement_avg" | "sentiment" | "fatigue" | "posting_rhythm"
  // payload.window_days = 7 (default)
  const days = Math.max(1, Math.min(Number(payload.window_days) || 7, 90));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_metrics_daily',
    searchParams: {
      organization_id: `eq.${orgId}`,
      ...(brandContainerId ? { brand_container_id: `eq.${brandContainerId}` } : {}),
      snapshot_date: `gte.${since}`,
      select: 'snapshot_date,posts_count,posts_engagement_total,sentiment_score,health_score,threat_level',
      order: 'snapshot_date.desc',
      limit: '90',
    },
  });
  return { metric: payload.metric || 'overview', window_days: days, snapshots: rows };
}

async function handleListCampaigns({ env, orgId, payload }) {
  const status = payload.status ? `eq.${String(payload.status).slice(0, 32)}` : null;
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'campaigns',
    searchParams: {
      organization_id: `eq.${orgId}`,
      ...(status ? { status } : {}),
      select: 'id,nombre_campana,status,starts_at,ends_at,platform_objective,brand_container_id',
      order: 'created_at.desc',
      limit: '50',
    },
  });
  return { campaigns: rows };
}

async function handleListProducts({ env, orgId }) {
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'products',
    searchParams: {
      organization_id: `eq.${orgId}`,
      select: 'id,nombre_producto,descripcion_producto,beneficios_principales,diferenciadores,brand_container_id',
      order: 'updated_at.desc',
      limit: '50',
    },
  });
  return { products: rows };
}

async function handleListBrands({ env, orgId }) {
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_containers',
    searchParams: {
      organization_id: `eq.${orgId}`,
      select: 'id,nombre_marca,arquetipo,propuesta_valor,nicho_core,mercado_objetivo',
      order: 'created_at.asc',
    },
  });
  return { brands: rows };
}

async function handleListAudiences({ env, orgId, brandContainerId }) {
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'audience_personas',
    searchParams: {
      organization_id: `eq.${orgId}`,
      ...(brandContainerId ? { brand_container_id: `eq.${brandContainerId}` } : {}),
      select: 'id,name,description,awareness_level,dolores,deseos,brand_container_id',
      order: 'created_at.desc',
      limit: '50',
    },
  });
  return { audiences: rows };
}

async function handleListPendingActions({ env, orgId }) {
  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions',
    searchParams: {
      organization_id: `eq.${orgId}`,
      status: 'eq.pending',
      select: 'id,action_type,target_table,status,vera_reasoning,vera_confidence,created_at,brand_container_id',
      order: 'created_at.desc',
      limit: '50',
    },
  });
  return { pending_actions: rows };
}

// ── Write handlers (van a vera_pending_actions con autonomia parcial) ──────

async function handleProposeBrief({ env, orgId, userId, brandContainerId, payload, reasoning }) {
  // payload.title, payload.description, payload.topic, payload.confidence
  if (!payload.title || !payload.description) {
    throw Object.assign(new Error('missing_title_or_description'), { statusCode: 400 });
  }
  const inserted = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions',
    method: 'POST',
    body: [{
      organization_id: orgId,
      brand_container_id: brandContainerId || null,
      action_type: 'propose_brief',
      target_table: 'strategic_recommendations',
      status: 'pending',
      vera_reasoning: reasoning || payload.rationale || 'widget propuso brief',
      vera_confidence: Number(payload.confidence) || 0.6,
      proposed_payload: {
        title: String(payload.title).slice(0, 200),
        description: String(payload.description).slice(0, 4000),
        topic: payload.topic || null,
        tone: payload.tone || null,
        mood: payload.mood || null,
        source: 'widget',
        widget_user_id: userId,
      },
    }],
  });
  return { proposed: true, pending_action_id: Array.isArray(inserted) ? inserted[0]?.id : inserted?.id };
}

async function handleFlagCompetitor({ env, orgId, userId, brandContainerId, payload, reasoning }) {
  // payload.handle, payload.network
  if (!payload.handle) {
    throw Object.assign(new Error('missing_handle'), { statusCode: 400 });
  }
  const inserted = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'vera_pending_actions',
    method: 'POST',
    body: [{
      organization_id: orgId,
      brand_container_id: brandContainerId || null,
      action_type: 'flag_competitor',
      target_table: 'intelligence_entities',
      status: 'pending',
      vera_reasoning: reasoning || 'widget propuso competidor a monitorear',
      vera_confidence: 0.7,
      proposed_payload: {
        handle: String(payload.handle).slice(0, 200),
        network: payload.network || 'unknown',
        source: 'widget',
        widget_user_id: userId,
      },
    }],
  });
  return { proposed: true, pending_action_id: Array.isArray(inserted) ? inserted[0]?.id : inserted?.id };
}
