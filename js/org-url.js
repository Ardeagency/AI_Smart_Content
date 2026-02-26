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
 * @param {string} shortId - Últimos 12 caracteres del UUID
 * @param {string} nameSlug - Slug del nombre
 * @returns {Promise<{id: string, name: string}|null>} { id, name } o null
 */
async function resolveOrgIdFromShortAndSlug(shortId, nameSlug) {
  if (!shortId) return null;
  const supabase = window.supabaseService ? await window.supabaseService.getClient() : window.supabase;
  const user = window.authService?.getCurrentUser();
  if (!supabase || !user?.id) return null;
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
    const byShortId = list.filter((o) => getOrgShortId(o.id) === shortId);
    if (byShortId.length === 0) return null;
    if (nameSlug && nameSlug !== 'org') {
      const match = byShortId.find((o) => getOrgSlug(o.name) === nameSlug);
      if (match) return { id: match.id, name: match.name };
    }
    return { id: byShortId[0].id, name: byShortId[0].name };
  } catch (e) {
    console.warn('resolveOrgIdFromShortAndSlug:', e);
    return null;
  }
}

window.getOrgShortId = getOrgShortId;
window.getOrgSlug = getOrgSlug;
window.getOrgPathPrefix = getOrgPathPrefix;
window.resolveOrgIdFromShortAndSlug = resolveOrgIdFromShortAndSlug;
