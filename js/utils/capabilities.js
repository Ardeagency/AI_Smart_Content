/**
 * capabilities.js — Modelo de permisos de organización.
 *
 * Source of truth único para:
 *   - Lista de roles (owner/admin/editor/creator/vera_user/viewer)
 *   - 15 capabilities granulares
 *   - Preset por rol (defaults autofill)
 *   - Mapeo capability → ruta protegida (para enforcement)
 *
 * Usado por:
 *   - DevLeadUserProvisioningView (UI del wizard)
 *   - AuthService.hasPermission()
 *   - Navigation (filter de items)
 *   - Edge Function provision-user-finalize (validación server-side)
 */

window.OrgCapabilities = (() => {
  const CAPABILITIES = [
    // Contenido (creación)
    { key: 'studio.create',          area: 'content',  label: 'Studio — generar imágenes' },
    { key: 'video.create',           area: 'content',  label: 'Video — generar videos' },
    { key: 'production.create',      area: 'content',  label: 'Production — flows' },
    { key: 'references.manage',      area: 'content',  label: 'Referencias — biblioteca' },

    // Vera (asistente IA)
    { key: 'vera.chat',              area: 'vera',     label: 'Vera — chat' },
    { key: 'vera.actions.approve',   area: 'vera',     label: 'Vera — aprobar acciones' },

    // Brand
    { key: 'brand.identity.edit',    area: 'brand',    label: 'Identidad de marca' },
    { key: 'brand.storage.manage',   area: 'brand',    label: 'Storage' },
    { key: 'monitoring.view',        area: 'brand',    label: 'Monitoreo' },

    // Insights
    { key: 'insights.view',          area: 'insights', label: 'Dashboard analítico' },

    // Admin sensible
    { key: 'org.team.manage',        area: 'admin',    label: 'Team — invitar / quitar' },
    { key: 'org.integrations.manage',area: 'admin',    label: 'Integraciones (Meta, Shopify…)' },
    { key: 'org.billing.manage',     area: 'admin',    label: 'Facturación / créditos' },
    { key: 'org.settings.edit',      area: 'admin',    label: 'Settings de organización' },
  ];

  const AREAS = {
    content:  { label: 'Contenido',        icon: 'fa-pen-fancy' },
    vera:     { label: 'Vera (asistente)', icon: 'fa-robot' },
    brand:    { label: 'Brand',            icon: 'fa-palette' },
    insights: { label: 'Insights',         icon: 'fa-chart-line' },
    admin:    { label: 'Admin sensible',   icon: 'fa-shield-halved' },
  };

  // Helper: lista con todas las capabilities como objeto {key: bool}.
  const fillAll = (value) =>
    CAPABILITIES.reduce((acc, c) => ({ ...acc, [c.key]: value }), {});

  // Preset: full = true para todo, salvo overrides.
  const PRESETS = {
    owner: fillAll(true),

    admin: fillAll(true),

    editor: {
      ...fillAll(false),
      'studio.create': true,
      'video.create': true,
      'production.create': true,
      'references.manage': true,
      'vera.chat': true,
      'vera.actions.approve': true,
      'brand.identity.edit': true,
      'brand.storage.manage': true,
      'monitoring.view': true,
      'insights.view': true,
    },

    creator: {
      ...fillAll(false),
      'studio.create': true,
      'video.create': true,
      'production.create': true,
      'references.manage': true,
      'vera.chat': true,
    },

    vera_user: {
      ...fillAll(false),
      'vera.chat': true,
    },

    viewer: {
      ...fillAll(false),
      'monitoring.view': true,
      'insights.view': true,
    },
  };

  const ROLES = [
    { key: 'owner',     label: 'Owner',     desc: 'Dueño — todo + transferir org' },
    { key: 'admin',     label: 'Admin',     desc: 'Todo menos transferir/eliminar org' },
    { key: 'editor',    label: 'Editor',    desc: 'Crea contenido + edita brand + insights' },
    { key: 'creator',   label: 'Creator',   desc: 'Solo crea contenido (Studio/Video/Production)' },
    { key: 'vera_user', label: 'Vera User', desc: 'Solo chatea con Vera y consume' },
    { key: 'viewer',    label: 'Viewer',    desc: 'Solo lectura (insights + monitoreo)' },
  ];

  // Mapeo rutas → capability requerida (para enforcement en router/nav).
  // Solo se listan rutas que tienen restricción; el resto queda abierto.
  const ROUTE_CAPABILITY = {
    '/studio':            'studio.create',
    '/video':             'video.create',
    '/production':        'production.create',
    '/references':        'references.manage',
    '/vera':              'vera.chat',
    '/brand':             'brand.identity.edit',
    '/brand/storage':     'brand.storage.manage',
    '/monitoring':        'monitoring.view',
    '/insights':          'insights.view',
    '/dashboard':         'insights.view',
    '/organization/team':          'org.team.manage',
    '/organization/integrations':  'org.integrations.manage',
    '/organization/billing':       'org.billing.manage',
    '/organization/settings':      'org.settings.edit',
    '/planes':            'org.billing.manage',
  };

  // Resolver caps efectivas: el preset del rol como base + overrides explícitos.
  function resolveCapabilities(role, overrides = {}) {
    const base = PRESETS[role] || fillAll(false);
    return { ...base, ...overrides };
  }

  // Match path → capability requerida. null si la ruta es abierta.
  // Acepta tanto rutas org-scoped (/org/{short}/{slug}/studio) como bare (/studio).
  function getCapabilityForPath(path) {
    if (!path) return null;
    if (ROUTE_CAPABILITY[path]) return ROUTE_CAPABILITY[path];
    const m = path.match(/^\/org\/[^/]+\/[^/]+(\/.+)$/);
    const stripped = m ? m[1] : path;
    if (ROUTE_CAPABILITY[stripped]) return ROUTE_CAPABILITY[stripped];
    const firstSeg = '/' + (stripped.replace(/^\//, '').split('/')[0] || '');
    return ROUTE_CAPABILITY[firstSeg] || null;
  }

  // Chequeo individual.
  function can(capsObj, key) {
    if (!capsObj) return false;
    return capsObj[key] === true;
  }

  // Validar que un payload de capabilities solo tenga keys válidas.
  function sanitize(capsObj) {
    if (!capsObj || typeof capsObj !== 'object') return fillAll(false);
    const out = {};
    CAPABILITIES.forEach((c) => { out[c.key] = capsObj[c.key] === true; });
    return out;
  }

  return {
    CAPABILITIES,
    AREAS,
    PRESETS,
    ROLES,
    ROUTE_CAPABILITY,
    getCapabilityForPath,
    resolveCapabilities,
    can,
    sanitize,
    fillAll,
  };
})();
