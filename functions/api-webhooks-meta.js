/**
 * api-webhooks-meta
 * Maneja eventos de webhook de Meta (Facebook Pages + Instagram Business).
 *
 * ── FLUJO EVENT-DRIVEN ──────────────────────────────────────────────────────
 *
 *  Meta API → POST /api/webhooks/meta
 *    → verifica firma HMAC-SHA256
 *    → identifica brand afectado por page_id / ig_account_id
 *    → marca snapshot como stale en Supabase
 *    → Supabase Realtime notifica al frontend
 *    → frontend llama a /api/brand/sync-meta (sync Meta + refresh UI)
 *
 *  NO se hacen llamadas a Graph API dentro del webhook
 *  (responde en <200ms, bien dentro del límite de 20s de Meta).
 *
 * ── EVENTOS MANEJADOS ───────────────────────────────────────────────────────
 *
 *  object: "page"
 *    feed          → post nuevo / edited / engagement → stale
 *    page          → cambio en datos de página       → stale
 *    mention       → mención de la página            → stale
 *    deauthorize   → usuario revocó permisos         → desactiva integración
 *
 *  object: "instagram"
 *    mentions      → mención de la cuenta IG         → stale
 *    comments      → comentario en post IG           → stale
 *    story_insights → datos de story disponibles     → stale
 *    media         → nuevo post publicado            → stale
 *
 *  standalone: signed_request → data deletion (Meta Platform Policy)
 *
 * ── ENDPOINTS ───────────────────────────────────────────────────────────────
 *  GET  /api/webhooks/meta       → handshake de suscripción (hub.challenge)
 *  POST /api/webhooks/meta       → eventos Facebook
 *  POST /api/webhooks/instagram  → eventos Instagram (misma función)
 */

const crypto = require('crypto');
const { corsHeaders, getSupabaseEnv, supabaseRest } = require('./lib/ai-shared');

// ── Helpers de entorno ────────────────────────────────────────────────────────

function getVerifyToken() { return String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(); }
function getAppSecret()   { return process.env.META_APP_SECRET || ''; }

// ── Verificación de firma HMAC-SHA256 ─────────────────────────────────────────
// Meta envía X-Hub-Signature-256: sha256=<hex>
// Netlify normaliza los headers a minúsculas.
function verifySignature(event) {
  const appSecret = getAppSecret();
  if (!appSecret) {
    console.warn('[webhook] META_APP_SECRET no configurado — firma no verificada');
    return false;
  }
  const sigHeader = (
    event.headers?.['x-hub-signature-256'] ||
    event.headers?.['X-Hub-Signature-256'] || ''
  );
  if (!sigHeader.startsWith('sha256=')) return false;
  const rawBody = typeof event.body === 'string'
    ? event.body
    : JSON.stringify(event.body || {});
  const computed = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  // Comparación en tiempo constante. Si el largo de la firma recibida no
  // coincide con el esperado (64 hex para SHA-256), rechazamos de inmediato.
  // Antes se sustituía `expected` por `computed` para igualar longitud,
  // lo que hacía que timingSafeEqual retornara true siempre → bypass total.
  const expected = sigHeader.slice('sha256='.length);
  if (expected.length !== computed.length) return false;
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(expected, 'hex');
  return crypto.timingSafeEqual(a, b);
}

// ── Lookup: brand_container_id por page_id de Facebook ───────────────────────
async function findBrandsByPageId(env, pageId) {
  if (!pageId) return [];

  // 1. Buscar por selected_page_id en metadata (caso más común)
  const bySelected = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,brand_container_id',
      platform: 'eq.facebook',
      is_active: 'eq.true',
      'metadata->>selected_page_id': `eq.${pageId}`,
      limit: '10'
    }
  }).catch(() => []);

  if (Array.isArray(bySelected) && bySelected.length > 0) {
    return bySelected.map(r => r.brand_container_id).filter(Boolean);
  }

  // 2. Fallback: external_account_id puede ser el page_id en algunas integraciones
  const byExternal = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,brand_container_id',
      platform: 'eq.facebook',
      is_active: 'eq.true',
      external_account_id: `eq.${pageId}`,
      limit: '10'
    }
  }).catch(() => []);

  return (Array.isArray(byExternal) ? byExternal : [])
    .map(r => r.brand_container_id)
    .filter(Boolean);
}

// ── Lookup: brand_container_id por IG account ID ─────────────────────────────
// Los IG accounts viven en metadata.pages[].instagram_business_account.id
// PostgREST no soporta bien búsqueda en arrays JSONB anidados,
// por eso cargamos hasta 100 integraciones activas y filtramos en Node.
async function findBrandsByIgAccountId(env, igAccountId) {
  if (!igAccountId) return [];

  const rows = await supabaseRest({
    url: env.url, serviceKey: env.serviceKey,
    path: 'brand_integrations', method: 'GET',
    searchParams: {
      select: 'id,brand_container_id,metadata',
      platform: 'eq.facebook',
      is_active: 'eq.true',
      limit: '100'
    }
  }).catch(() => []);

  const found = [];
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const pages = row.metadata?.pages || [];
    const match = pages.some(p =>
      p.instagram_business_account?.id === igAccountId ||
      p.instagram_business_account?.id === String(igAccountId)
    );
    if (match && row.brand_container_id) found.push(row.brand_container_id);
  });
  return found;
}

// ── Marcar snapshots como stale ───────────────────────────────────────────────
// Escribe computed_at = epoch pasado → isStale() devuelve true
// Supabase Realtime notifica al frontend, que dispara el sync.
async function markBrandsStale(env, brandContainerIds, reason) {
  if (!brandContainerIds?.length) return;
  const unique = [...new Set(brandContainerIds)];

  const promises = unique.map(bcId =>
    supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_analytics_snapshots', method: 'PATCH',
      searchParams: {
        brand_container_id: `eq.${bcId}`,
        platform: 'eq.facebook'
      },
      body: [{ computed_at: '2000-01-01T00:00:00.000Z' }]
    }).catch(e => console.warn(`[webhook] markStale failed for ${bcId}:`, e?.message))
  );

  await Promise.allSettled(promises);
  console.info(`[webhook] marked stale: ${unique.length} brand(s) — reason: ${reason}`);
}

// ── Handler: eventos de página (object: "page") ───────────────────────────────
async function handlePageEvents(env, entry, changes) {
  const pageId = String(entry.id || '');
  const brandIds = await findBrandsByPageId(env, pageId);

  if (!brandIds.length) {
    console.info(`[webhook] page ${pageId}: no brand integration found, skipping`);
    return;
  }

  for (const change of changes) {
    const field = String(change?.field || '');
    const value = change?.value || {};

    if (field === 'feed') {
      const item = value?.item || '';
      const verb = value?.verb || '';
      // Solo procesar posts nuevos o editados (no eliminados)
      if (['post', 'status', 'link', 'photo', 'video'].includes(item) && verb !== 'remove') {
        console.info(`[webhook] page ${pageId}: feed ${verb} ${item} → stale`);
        await markBrandsStale(env, brandIds, `feed.${verb}.${item}`);
      }
      // Engagement en posts existentes (comments, reactions, shares)
      if (['comment', 'reaction', 'like', 'share'].includes(item) && verb === 'add') {
        console.info(`[webhook] page ${pageId}: engagement ${item} → stale`);
        await markBrandsStale(env, brandIds, `feed.engagement.${item}`);
      }
    }

    if (field === 'page') {
      // Cambio en datos de la página (fan_count, etc.)
      console.info(`[webhook] page ${pageId}: page data changed → stale`);
      await markBrandsStale(env, brandIds, 'page.update');
    }

    if (field === 'mention') {
      console.info(`[webhook] page ${pageId}: mention → stale`);
      await markBrandsStale(env, brandIds, 'mention');
    }

    if (field === 'deauthorize') {
      const userId = value?.user_id || value?.uid || entry.id;
      await handleDeauthorize(env, userId);
    }
  }
}

// ── Handler: eventos de Instagram (object: "instagram") ──────────────────────
async function handleInstagramEvents(env, entry, changes) {
  const igAccountId = String(entry.id || '');
  const brandIds = await findBrandsByIgAccountId(env, igAccountId);

  if (!brandIds.length) {
    console.info(`[webhook] ig ${igAccountId}: no brand integration found, skipping`);
    return;
  }

  const relevantFields = new Set(['mentions', 'comments', 'story_insights', 'media', 'live_comments']);

  for (const change of changes) {
    const field = String(change?.field || '');
    if (relevantFields.has(field)) {
      console.info(`[webhook] ig ${igAccountId}: ${field} → stale`);
      await markBrandsStale(env, brandIds, `instagram.${field}`);
      break; // un solo markStale por entry es suficiente
    }
  }
}

// ── Handler: deauthorize ──────────────────────────────────────────────────────
async function handleDeauthorize(env, userId) {
  if (!userId) return;
  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'PATCH',
      searchParams: {
        external_account_id: `eq.${userId}`,
        platform: 'eq.facebook',
        is_active: 'eq.true'
      },
      body: [{ is_active: false, updated_at: new Date().toISOString() }]
    });
    console.info(`[webhook] deauthorize: integration disabled for user ${userId}`);
  } catch (e) {
    console.error('[webhook] deauthorize failed:', e?.message);
  }
}

// ── Handler: data deletion (Meta Platform Policy) ─────────────────────────────
async function handleDataDeletion(env, signedRequest) {
  let userId = null;
  try {
    const [, payload] = String(signedRequest || '').split('.');
    if (payload) {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      userId = data?.user_id || data?.uid;
    }
  } catch (_) {}
  if (!userId) return null;

  try {
    await supabaseRest({
      url: env.url, serviceKey: env.serviceKey,
      path: 'brand_integrations', method: 'DELETE',
      searchParams: { external_account_id: `eq.${userId}`, platform: 'eq.facebook' }
    });
    console.info(`[webhook] data_deletion: removed integrations for user ${userId}`);
  } catch (e) {
    console.error('[webhook] data_deletion failed:', e?.message);
  }
  return userId;
}

// ── Handler principal ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event), body: '' };

  // ── GET: handshake de suscripción ──────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const qs          = event.queryStringParameters || {};
    const mode        = qs['hub.mode'];
    const token       = String(qs['hub.verify_token'] || '').trim();
    const challenge   = qs['hub.challenge'];
    const verifyToken = getVerifyToken();

    if (!verifyToken) {
      console.error('[webhook] META_WEBHOOK_VERIFY_TOKEN no configurado');
      return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Webhook verify token not configured' }) };
    }

    if (mode === 'subscribe' && challenge) {
      const a = Buffer.from(token, 'utf8');
      const b = Buffer.from(verifyToken, 'utf8');
      const match = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (match) {
        console.info('[webhook] handshake OK');
        return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: String(challenge) };
      }
    }

    console.warn('[webhook] handshake failed — token mismatch or missing fields');
    return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Webhook verification failed' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── POST: verificar firma antes de procesar ────────────────────────────────
  if (!verifySignature(event)) {
    console.warn('[webhook] firma inválida — posible request no legítima');
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  // ── Parsear payload ────────────────────────────────────────────────────────
  let payload = {};
  try {
    payload = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (_) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const object  = String(payload?.object || '');
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  // Inicializar Supabase
  let env = null;
  try { env = getSupabaseEnv(); } catch (e) {
    console.error('[webhook] Supabase env error:', e.message);
  }

  if (env) {
    // ── Data deletion (Meta Platform Policy) ──────────────────────────────
    if (payload?.signed_request) {
      const deletedId = await handleDataDeletion(env, payload.signed_request).catch(e => {
        console.error('[webhook] data_deletion error:', e?.message);
        return null;
      });
      if (deletedId) {
        const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
        return {
          statusCode: 200,
          headers: corsHeaders(event),
          body: JSON.stringify({
            url: `${siteUrl}/data-deletion-status`,
            confirmation_code: crypto.createHash('sha256').update(deletedId).digest('hex').slice(0, 16)
          })
        };
      }
    }

    // ── Procesar entries ───────────────────────────────────────────────────
    const processingPromises = entries.map(entry => {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      if (object === 'page') {
        return handlePageEvents(env, entry, changes).catch(e =>
          console.error('[webhook] handlePageEvents error:', e?.message)
        );
      }

      if (object === 'instagram') {
        return handleInstagramEvents(env, entry, changes).catch(e =>
          console.error('[webhook] handleInstagramEvents error:', e?.message)
        );
      }

      return Promise.resolve();
    });

    // Procesar todos los entries en paralelo (dentro del límite de 20s de Meta)
    await Promise.allSettled(processingPromises);
  }

  // ACK a Meta — siempre 200
  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({ received: true, object, entries: entries.length })
  };
};
