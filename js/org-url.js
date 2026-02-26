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
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'org';
}

/**
 * Construir prefijo de ruta para una org: /org/{shortId}/{slug}
 * @param {string} orgId - UUID de la organización
 * @param {string} orgName - Nombre de la organización (para el slug)
 * @returns {string}
 */
function getOrgPathPrefix(orgId, orgName) {
  const shortId = getOrgShortId(orgId);
  const slug = getOrgSlug(orgName);
  if (!shortId) return '';
  return `/org/${shortId}/${slug}`;
}

/**
 * Resolver shortId + nameSlug a UUID y nombre de organización (solo entre las orgs del usuario).
 * @param {string} shortId - Últimos 12 caracteres del UUID
 * @param {string} nameSlug - Slug del nombre
 * @returns {Promise<{id: string, name: string}|null>} { id, name } o null
 */
async function resolveOrgIdFromShortAndSlug(shortId, nameSlug) {
  if (!shortId || !nameSlug) return null;
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
    const match = list.find(
      (o) => getOrgShortId(o.id) === shortId && getOrgSlug(o.name) === nameSlug
    );
    return match ? { id: match.id, name: match.name } : null;
  } catch (e) {
    console.warn('resolveOrgIdFromShortAndSlug:', e);
    return null;
  }
}

window.getOrgShortId = getOrgShortId;
window.getOrgSlug = getOrgSlug;
window.getOrgPathPrefix = getOrgPathPrefix;
window.resolveOrgIdFromShortAndSlug = resolveOrgIdFromShortAndSlug;
