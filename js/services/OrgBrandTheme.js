/**
 * OrgBrandTheme - Aplica el degradado/resaltados de marca a toda la org.
 * Carga brand_colors de la organización y setea en :root
 * --brand-gradient-dynamic, --brand-gradient-dynamic-vertical, --brand-primary, etc.
 * para que production, products, flows, identity, settings usen el mismo resaltado.
 *
 * Schema vigente: brand_colors.organization_id → organizations.id. La columna
 * legacy brand_colors.brand_id fue eliminada (verificado 2026-05-12); el
 * fallback anterior que la consultaba se removió por código muerto.
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
   * Lee por `organization_id` (schema vigente — única columna FK en brand_colors).
   * Cache 10 min vía apiClient + SWR; invalidar desde el view al guardar:
   *   apiClient.invalidate(`theme:colors:${orgId}`)
   */
  async function getOrganizationBrandColors(organizationId) {
    const fetcher = async () => {
      const supabase = getSupabase();
      if (!supabase) return [];
      const { data: colors } = await supabase
        .from('brand_colors')
        .select('hex_value')
        .eq('organization_id', organizationId);
      return normalizeHexRows(colors);
    };
    try {
      return window.apiClient
        ? await window.apiClient.query(`theme:colors:${organizationId}`, fetcher, { ttl: 10 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
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
    root.style.removeProperty('--brand-color-light');
    root.style.removeProperty('--brand-color-mid');
    root.style.removeProperty('--brand-color-dark');
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

    // Color mas claro, intermedio y mas oscuro de la marca (por luminosidad HSL).
    // Los usa el fondo radial del dashboard y del chat de Vera:
    //   nucleo = mas claro -> INTERMEDIO -> #141517 -> #000 (plataforma).
    // El segundo stop (--brand-color-mid = 2do mas claro) es clave: si usaramos el
    // mas oscuro y la marca tiene un negro puro (ej. WAKEUP), el radial saltaba de
    // amarillo directo a negro y se comia el naranja. La cola #141517->plataforma
    // ya aporta el oscuro, asi que el 2do stop debe ser el color de acento medio.
    try {
      const withL = hexes
        .map((hx) => ({ hex: hx, l: (hexToHSL(hx) || {}).l }))
        .filter((o) => typeof o.l === 'number' && !Number.isNaN(o.l));
      if (withL.length) {
        withL.sort((a, b) => a.l - b.l); // ascendente: mas oscuro primero
        const lightest = withL[withL.length - 1].hex;
        const darkest = withL[0].hex;
        const mid = withL.length >= 2 ? withL[withL.length - 2].hex : lightest;
        root.style.setProperty('--brand-color-dark', darkest);
        root.style.setProperty('--brand-color-light', lightest);
        root.style.setProperty('--brand-color-mid', mid);
      }
    } catch (e) { /* si falla, el CSS usa el fallback naranja de referencia */ }
  }

  window.OrgBrandTheme = {
    applyOrgBrandTheme,
    clearOrgBrandTheme,
    getOrganizationBrandColors,
    getLastBrandHexes
  };
})();
