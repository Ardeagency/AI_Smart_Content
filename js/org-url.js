/**
 * Org URL - Formato de URL para organizaciones: /org/{shortId}/{nameSlug}/...
 * shortId = últimos 12 caracteres del UUID (sin guiones).
 * nameSlug = slug del nombre de la organización.
 */

function getOrgShortId(orgId) {
  if (!orgId || typeof orgId !== 'string') return '';
  return orgId.replace(/-/g, '').slice(-12);
}

function getOrgSlug(name) {
  if (!name || typeof name !== 'string') return 'org';
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'org';
}

/**
 * Construir prefijo de ruta para una org: /org/{shortId}/{slug}
 * Solo genera URL cuando hay nombre real (nunca /org/xxx/org).
 * @param {string} orgId - UUID de la organización
 * @param {string} orgName - Nombre de la organización (para el slug)
 * @returns {string}
 */
function getOrgPathPrefix(orgId, orgName) {
  const shortId = getOrgShortId(orgId);
  if (!shortId) return '';
  const name = (orgName && typeof orgName === 'string') ? orgName.trim() : '';
  if (!name) return '';
  const slug = getOrgSlug(name);
  return `/org/${shortId}/${slug}`;
}

/**
 * Resolver shortId + nameSlug a UUID y nombre de organización (solo entre las orgs del usuario).
 *
 * Cachea la lista de orgs del usuario por 5 min: sin esto el router le pega 2 queries
 * a Supabase en cada navegación dentro de una org (sensación de lag entre páginas).
 * El cache se invalida en login/logout vía `clearOrgResolverCache()`.
 *
 * @param {string} shortId - Últimos 12 caracteres del UUID
 * @param {string} nameSlug - Slug del nombre
 * @returns {Promise<{id: string, name: string}|null>} { id, name } o null
 */
const _ORG_RESOLVER_TTL = 5 * 60 * 1000;
let _orgResolverCache = null;
let _orgResolverInflight = null;

async function _fetchUserOrgs() {
  const supabase = window.supabaseService ? await window.supabaseService.getClient() : window.supabase;
  const user = window.authService?.getCurrentUser();
  if (!supabase || !user?.id) return null;

  const now = Date.now();
  if (_orgResolverCache && _orgResolverCache.userId === user.id && (now - _orgResolverCache.ts) < _ORG_RESOLVER_TTL) {
    return _orgResolverCache.list;
  }
  if (_orgResolverInflight) return _orgResolverInflight;

  _orgResolverInflight = (async () => {
    try {
      const [membersRes, ownedRes] = await Promise.all([
        supabase.from('organization_members').select('organization_id, organizations(id, name)').eq('user_id', user.id),
        supabase.from('organizations').select('id, name').eq('owner_user_id', user.id)
      ]);
      const list = [];
      (membersRes.data || []).forEach((m) => {
        const o = m.organizations;
        const id = o?.id ?? m.organization_id;
        if (id) list.push({ id, name: (o && o.name) || '' });
      });
      (ownedRes.data || []).forEach((o) => {
        if (o?.id && !list.some((x) => x.id === o.id)) list.push({ id: o.id, name: o.name || '' });
      });
      _orgResolverCache = { userId: user.id, list, ts: Date.now() };
      return list;
    } finally {
      _orgResolverInflight = null;
    }
  })();
  return _orgResolverInflight;
}

async function resolveOrgIdFromShortAndSlug(shortId, nameSlug) {
  if (!shortId) return null;
  const pick = (arr) => {
    const byShortId = arr.filter((o) => getOrgShortId(o.id) === shortId);
    if (byShortId.length === 0) return null;
    if (nameSlug && nameSlug !== 'org') {
      const match = byShortId.find((o) => getOrgSlug(o.name) === nameSlug);
      if (match) return { id: match.id, name: match.name };
    }
    return { id: byShortId[0].id, name: byShortId[0].name };
  };
  try {
    const list = await _fetchUserOrgs();
    const own = list ? pick(list) : null;
    if (own) return own;
    // Fallback Lead: un desarrollador Lead puede entrar a CUALQUIER org del
    // sistema (no solo las suyas), no solo a las que es owner/miembro.
    if (window.authService?.isLead?.()) {
      const sb = window.supabaseService ? await window.supabaseService.getClient() : window.supabase;
      if (sb) {
        const { data } = await sb.from('organizations').select('id, name').is('deleted_at', null).limit(1000);
        const hit = pick(data || []);
        if (hit) return hit;
      }
    }
    return null;
  } catch (e) {
    console.warn('resolveOrgIdFromShortAndSlug:', e);
    return null;
  }
}

function clearOrgResolverCache() {
  _orgResolverCache = null;
  _orgResolverInflight = null;
}

/**
 * shortId12 para brand_container.id — mismo formato que orgs (últimos 12 chars
 * sin guiones). Se usa en /command-center/{shortId}/{slug} para garantizar
 * unicidad cuando dos sub-marcas comparten nombre (mismo slug).
 */
function getBrandContainerShortId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/-/g, '').slice(-12);
}

/**
 * Construye la ruta del Command Center para una sub-marca.
 * @param {string} orgPathPrefix - prefijo /org/... o '' si sin org
 * @param {{id:string, nombre_marca:string}} container
 * @returns {string}
 */
function getCommandCenterPath(orgPathPrefix, container) {
  if (!container || !container.id) return '';
  const shortId = getBrandContainerShortId(container.id);
  const slug = getOrgSlug(container.nombre_marca || 'sub-marca');
  const tail = `command-center/${shortId}/${slug}`;
  const prefix = (orgPathPrefix && typeof orgPathPrefix === 'string') ? orgPathPrefix : '';
  return prefix ? `${prefix}/${tail}` : `/${tail}`;
}

window.getOrgShortId = getOrgShortId;
window.getOrgSlug = getOrgSlug;
window.getOrgPathPrefix = getOrgPathPrefix;
window.resolveOrgIdFromShortAndSlug = resolveOrgIdFromShortAndSlug;
window.clearOrgResolverCache = clearOrgResolverCache;
window.getBrandContainerShortId = getBrandContainerShortId;
window.getCommandCenterPath = getCommandCenterPath;
