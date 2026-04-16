/**
 * OrgBrandTheme - Aplica el degradado/resaltados de marca a toda la org.
 * Carga brand_colors de las marcas de la organización y setea en :root
 * --brand-gradient-dynamic, --brand-gradient-dynamic-vertical, --brand-primary, etc.
 * para que production, products, flows, identity, settings usen el mismo resaltado.
 *
 * Cadena de resolución robusta (múltiples fallbacks):
 *   1. brand_containers WHERE organization_id = orgId
 *   2. Si vacío → brand_containers via organization_members (user_id IN members)
 *   3. brand_colors WHERE organization_id = orgId
 *   4. Si vacío → sin colores
 */
(function () {
  'use strict';

  const root = document.documentElement;
  let lastAppliedHexes = [];
  let lastAppliedOrgId = null;

  function getSupabase() {
    return window.supabase || null;
  }

  /**
   * IDs de brand_containers de una organización.
   * Intenta por organization_id; si no hay filas, intenta por user_ids de los miembros.
   */
  async function getBrandContainerIds(organizationId) {
    const supabase = getSupabase();
    if (!supabase) return [];
    try {
      // Intento 1: por organization_id directo
      const { data: byOrg, error: e1 } = await supabase
        .from('brand_containers')
        .select('id')
        .eq('organization_id', organizationId);

      if (!e1 && byOrg && byOrg.length > 0) {
        console.info('[OrgBrandTheme] containers por org_id:', byOrg.length);
        return byOrg.map(b => b.id);
      }

      console.info('[OrgBrandTheme] sin containers por org_id, intentando por members...');

      // Intento 2: brand_containers cuyo user_id está en organization_members
      const { data: members, error: e2 } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId);

      if (e2 || !members || members.length === 0) {
        console.warn('[OrgBrandTheme] sin members para org', organizationId);
        return [];
      }

      const userIds = [...new Set(members.map(m => m.user_id).filter(Boolean))];
      if (userIds.length === 0) return [];

      const { data: byUser, error: e3 } = await supabase
        .from('brand_containers')
        .select('id')
        .in('user_id', userIds);

      if (e3 || !byUser) return [];
      console.info('[OrgBrandTheme] containers por user_id:', byUser.length);
      return byUser.map(b => b.id);
    } catch (e) {
      console.error('OrgBrandTheme: error getBrandContainerIds', e);
      return [];
    }
  }

  /**
   * Normaliza y deduplica un array de filas {hex_value} → array de strings '#rrggbb' (máx 4).
   */
  function normalizeHexRows(rows) {
    const seen = new Set();
    const hexes = [];
    for (const row of (rows || [])) {
      const raw = (row.hex_value || '').trim().replace(/^#/, '');
      if (!raw || !/^[0-9A-Fa-f]{6}$/.test(raw)) continue;
      const normalized = '#' + raw;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      hexes.push(normalized);
      if (hexes.length >= 4) break;
    }
    return hexes;
  }

  /**
   * Hexes de brand_colors de la org (hasta 4, sin duplicados).
   * Lee por `organization_id` (schema vigente).
   */
  async function getOrganizationBrandColors(organizationId) {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const { data: colors } = await supabase
        .from('brand_colors')
        .select('hex_value')
        .eq('organization_id', organizationId);
      const hexes = normalizeHexRows(colors);
      if (hexes.length > 0) return hexes;

      // Fallback suave por containers para no romper orgs en transición de datos.
      const brandContainerIds = await getBrandContainerIds(organizationId);
      if (brandContainerIds.length > 0) {
        const { data: legacyColors } = await supabase
          .from('brand_colors')
          .select('hex_value')
          .in('brand_id', brandContainerIds);
        const legacyHexes = normalizeHexRows(legacyColors);
        if (legacyHexes.length > 0) return legacyHexes;
      }
      return [];
    } catch (e) {
      console.error('OrgBrandTheme: error getOrganizationBrandColors', e);
      return [];
    }
  }

  // Color utils compartidos desde /js/utils/brand-colors.js (cargado antes que este
  // service en index.html). Aliases locales para no tocar el resto del archivo.
  const _BC = () => window.BrandColors || {};
  function hexToRgba(hex, alpha)           { return _BC().hexToRgba(hex, alpha); }
  function hexToHSL(hex)                   { return _BC().hexToHSL(hex); }
  function hslToHex(h, s, l)               { return _BC().hslToHex(h, s, l); }
  function filterAndScoreBrandColors(hexes){ return _BC().filterAndScoreBrandColors(hexes); }
  function getBrandUIPalette(hexes)        { return _BC().getBrandUIPalette(hexes); }
  function buildBrandGradientCss(hexes, angle) { return _BC().buildBrandGradientCss(hexes, angle); }

  function getLastBrandHexes() {
    return lastAppliedHexes.length ? lastAppliedHexes.slice() : [];
  }

  function clearOrgBrandTheme() {
    lastAppliedHexes = [];
    lastAppliedOrgId = null;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-primary-rgb');
    root.style.removeProperty('--brand-primary-brillo');
    root.style.removeProperty('--brand-primary-brillo-strong');
    root.style.removeProperty('--brand-gradient-dynamic');
    root.style.removeProperty('--brand-gradient-dynamic-vertical');
  }

  /**
   * Carga brand_colors de la organización y aplica en :root el degradado y color principal.
   */
  async function applyOrgBrandTheme(organizationId) {
    if (!organizationId) {
      clearOrgBrandTheme();
      return;
    }
    // Si cambiamos de org, limpiar colores previos antes de cargar los nuevos.
    if (lastAppliedOrgId && lastAppliedOrgId !== organizationId) {
      clearOrgBrandTheme();
    }
    lastAppliedOrgId = organizationId;

    const hexes = await getOrganizationBrandColors(organizationId);
    if (hexes.length === 0) {
      // Mantener colores previos si los había (evita flash en navegación); limpiar solo en primera carga.
      if (lastAppliedHexes.length === 0) {
        clearOrgBrandTheme();
      }
      return;
    }

    lastAppliedHexes = hexes.slice(0, 4);
    const gradient = buildBrandGradientCss(hexes, 135);
    const gradientVertical = buildBrandGradientCss(hexes, 180);
    root.style.setProperty('--brand-gradient-dynamic', gradient);
    root.style.setProperty('--brand-gradient-dynamic-vertical', gradientVertical);
    const palette = getBrandUIPalette(hexes);
    if (palette && palette.primary) {
      const hex = palette.primary.replace(/^#/, '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        root.style.setProperty('--brand-primary', palette.primary);
        root.style.setProperty('--brand-primary-rgb', r + ',' + g + ',' + b);
        root.style.setProperty('--brand-primary-brillo', hexToRgba(palette.primary, 0.12));
        root.style.setProperty('--brand-primary-brillo-strong', hexToRgba(palette.primary, 0.18));
      }
    }
  }

  window.OrgBrandTheme = {
    applyOrgBrandTheme,
    clearOrgBrandTheme,
    getOrganizationBrandColors,
    getLastBrandHexes
  };
})();
