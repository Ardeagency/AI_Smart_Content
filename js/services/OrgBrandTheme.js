/**
 * OrgBrandTheme - Aplica el degradado/resaltados de marca a toda la org.
 * Toma los colores de la marca y setea en :root
 * --org-gradient, --org-gradient-v, --org-primary, etc.
 * para que production, products, flows, identity, settings usen el mismo resaltado.
 *
 * Base nueva (25/09): los colores vienen en `mi_contexto().organizations[].colores`
 * ([{hex, rol, nombre}], vía window.contextoService). Ya no se consulta brand_colors:
 * allí la columna es `hex` y `select=hex_value` daba 400 en cada carga de producción.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  let lastAppliedHexes = [];
  let lastAppliedOrgId = null;

  /**
   * Normaliza y deduplica los colores de mi_contexto ({hex}) → array de strings '#rrggbb' (máx 4).
   */
  function normalizeHexRows(rows) {
    const seen = new Set();
    const hexes = [];
    for (const row of (rows || [])) {
      const raw = String(row?.hex || '').trim().replace(/^#/, '');
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
   * Hexes de la marca (hasta 4, sin duplicados), de mi_contexto().
   * Cache 10 min vía apiClient + SWR; invalidar desde el view al guardar:
   *   apiClient.invalidate(`theme:colors:${orgId}`)
   * Al fallar la cache se pide el contexto FRESCO: así lo recién guardado se ve al momento.
   */
  async function getOrganizationBrandColors(organizationId) {
    const fetcher = async () => {
      const ctx = window.contextoService;
      if (!ctx) return [];
      const contexto = await ctx.cargar({ fresco: true });
      const org = (contexto?.organizations || []).find((o) => o.id === organizationId);
      return normalizeHexRows(org?.colores);
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
  function getBrandUIPalette(hexes)        { return _BC().getBrandUIPalette(hexes); }
  function buildBrandGradientCss(hexes, angle) { return _BC().buildBrandGradientCss(hexes, angle); }

  function getLastBrandHexes() {
    return lastAppliedHexes.length ? lastAppliedHexes.slice() : [];
  }

  // ADN de la org (v2, Git-AISC-Frontend src/adn/org, d43e948): las mismas
  // variables con el nombre del ADN. Los módulos nuevos (fondos.css, primitivas)
  // leen --org-*; ya no hay --brand-*: se retiraron el 25/09 (acentos a 3).
  const ORG_VARS = ['--org-primary', '--org-primary-rgb', '--org-secondary', '--org-brillo', '--org-brillo-strong',
    '--org-gradient', '--org-gradient-v', '--org-color-light', '--org-color-mid', '--org-color-dark'];

  function clearOrgBrandTheme() {
    lastAppliedHexes = [];
    lastAppliedOrgId = null;
    ORG_VARS.forEach((v) => root.style.removeProperty(v));
  }

  /**
   * Toma los colores de la marca (mi_contexto) y aplica en :root el degradado y color principal.
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
    root.style.setProperty('--org-gradient', gradient);
    root.style.setProperty('--org-gradient-v', gradientVertical);
    const palette = getBrandUIPalette(hexes);
    if (palette && palette.primary) {
      const hex = palette.primary.replace(/^#/, '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        root.style.setProperty('--org-primary', palette.primary);
        root.style.setProperty('--org-primary-rgb', r + ', ' + g + ', ' + b);
        if (palette.secondary) root.style.setProperty('--org-secondary', palette.secondary);
        root.style.setProperty('--org-brillo', hexToRgba(palette.primary, 0.12));
        root.style.setProperty('--org-brillo-strong', hexToRgba(palette.primary, 0.18));
      }
    }

    // Color mas claro, intermedio y mas oscuro de la marca (por luminosidad HSL).
    // Los usa el fondo radial del dashboard y del chat de Vera:
    //   nucleo = mas claro -> INTERMEDIO -> #141517 -> #000 (plataforma).
    // El segundo stop (--org-color-mid = 2do mas claro) es clave: si usaramos el
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
        root.style.setProperty('--org-color-dark', darkest);
        root.style.setProperty('--org-color-light', lightest);
        root.style.setProperty('--org-color-mid', mid);
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
