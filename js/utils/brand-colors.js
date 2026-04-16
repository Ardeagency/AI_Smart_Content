/**
 * BrandColors — utilidades puras de manipulación de color para temas de marca.
 *
 * Antes existían 4+ copias idénticas de `hexToHSL` / `hslToHex` / `hexToRgba`
 * repartidas entre BrandstorageView, BrandOrganizationView, HogarView,
 * OrgBrandTheme e input-registry. Esta es la fuente única.
 *
 * Todas las funciones son puras (sin estado, sin `this`), se exponen en
 * `window.BrandColors` para consumirlas desde vistas y services clásicos.
 *
 * Tipos:
 *   - `HexColor` — string `"#rrggbb"` (también acepta `"rrggbb"` en inputs).
 *   - `Hsl` — `{ h: number, s: number, l: number }` con h∈[0,360), s,l∈[0,100].
 */
(function () {
  'use strict';

  /** Convierte `#rrggbb` (o `rrggbb`) a `rgba(r,g,b,alpha)`. Devuelve el input si no es válido. */
  function hexToRgba(hex, alpha = 1) {
    const clean = (hex || '').replace(/^#/, '');
    if (clean.length !== 6) return hex;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Convierte `#rrggbb` a `{ h, s, l }` (HSL). */
  function hexToHSL(hex) {
    const clean = String(hex || '').replace(/^#/, '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  /** Convierte HSL a `#rrggbb`. `s` y `l` en 0-100, `h` en 0-360. */
  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Filtra colores inadecuados para UI (demasiado claros/oscuros/saturados) y los puntúa
   * por cercanía al "ideal" (L≈45, S≈50). Devuelve hasta 3 ordenados por score.
   */
  function filterAndScoreBrandColors(hexes) {
    const MIN_L = 18, MAX_L = 85, MIN_S = 15, MAX_S = 90;
    const idealL = 45, idealS = 50;
    const out = [];
    for (const hex of (hexes || []).slice(0, 5)) {
      const { h, s, l } = hexToHSL(hex);
      if (l > MAX_L || l < MIN_L || s < MIN_S || s > MAX_S) continue;
      const scoreL = 30 - Math.abs(l - idealL) / 2;
      const scoreS = 40 - Math.abs(s - idealS) / 2;
      out.push({ hex, h, s, l, score: Math.max(0, scoreL + scoreS) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Dado un array de hex, devuelve `{ primary, secondary }` para la UI. Si no hay
   * candidatos válidos, deriva secundario desviando saturación/luminancia del primario.
   */
  function getBrandUIPalette(brandColors) {
    if (!brandColors || brandColors.length === 0) return null;
    const filtered = filterAndScoreBrandColors(brandColors);
    if (filtered.length === 0) {
      const raw = brandColors[0];
      const { h, s, l } = hexToHSL(raw);
      const primary = hslToHex(h, Math.min(90, Math.max(20, s)), Math.min(75, Math.max(25, l)));
      const secondary = hslToHex(h, Math.min(85, s + 5), Math.max(15, l - 18));
      return { primary, secondary };
    }
    const primary = filtered[0].hex;
    let secondary = null;
    for (let i = 1; i < filtered.length; i++) {
      const diff = Math.abs(filtered[i].h - filtered[0].h);
      const hueDiff = Math.min(diff, 360 - diff);
      if (hueDiff > 20) {
        secondary = filtered[i].hex;
        break;
      }
    }
    if (!secondary) {
      const { h, s, l } = hexToHSL(primary);
      secondary = hslToHex(h, Math.min(90, s + 10), Math.max(18, l - 12));
    }
    return { primary, secondary };
  }

  /**
   * Construye un linear-gradient() usando los colores de marca.
   * @param {string[]} hexes  Hasta 4 colores (#rrggbb)
   * @param {number}   angle  135 = fondo general, 180 = barras verticales
   */
  function buildBrandGradientCss(hexes, angle = 135) {
    if (!hexes || hexes.length === 0) return '';
    const alpha = angle === 180 ? 1 : 0.88; // barras nav opacas; fondo algo transparente
    const stops = hexes.map((hex, i) => {
      const pct = hexes.length === 1 ? 100 : (i / (hexes.length - 1)) * 100;
      return `${hexToRgba(hex, alpha)} ${Math.round(pct)}%`;
    });
    return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
  }

  window.BrandColors = {
    hexToRgba,
    hexToHSL,
    hslToHex,
    filterAndScoreBrandColors,
    getBrandUIPalette,
    buildBrandGradientCss
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.BrandColors;
  }
})();
