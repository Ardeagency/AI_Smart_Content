/**
 * credit-costs.js — Helper de costos por acción.
 *
 * - Carga feature_costs de Supabase (cacheado 10 min)
 * - getCostFor(kind) → número de créditos
 * - getLabel(kind) → label user-friendly + icon + area
 * - estimate(kind, count=1) → costo total
 *
 * Usado por:
 *   - CreditsView (chart por feature, log)
 *   - Cada feature antes de generar (Studio, Video, Vera) para mostrar
 *     "Esta acción cuesta X créditos" — el patrón de transparencia 2026.
 */

window.CreditCosts = (() => {
  const TTL = 10 * 60 * 1000;
  let cache = null;
  let inflight = null;

  // Fallback hardcoded por si la tabla aún no cargó (UX optimista).
  const FALLBACK = {
    studio_image:          { label: 'Imagen Studio',          icon: 'aisc-ico aisc-ico--image',            area: 'studio',     credits: 10 },
    studio_image_4k:       { label: 'Imagen Studio 4K',       icon: 'aisc-ico aisc-ico--image',            area: 'studio',     credits: 25 },
    video_short:           { label: 'Video corto (10s)',      icon: 'aisc-ico aisc-ico--play',             area: 'video',      credits: 100 },
    video_long:            { label: 'Video largo (30s)',      icon: 'aisc-ico aisc-ico--play',             area: 'video',      credits: 300 },
    vera_chat:             { label: 'Vera chat',              icon: 'aisc-ico aisc-ico--bot',            area: 'vera',       credits: 1 },
    vera_brief_generation: { label: 'Vera brief',             icon: 'aisc-ico aisc-ico--sparkle',       area: 'vera',       credits: 5 },
    vera_action:           { label: 'Vera acción autónoma',   icon: 'aisc-ico aisc-ico--sparkle',       area: 'vera',       credits: 15 },
    production_flow:       { label: 'Production flow',        icon: 'aisc-ico aisc-ico--flows',  area: 'production', credits: 20 },
    apify_scrape:          { label: 'Scraping de marca',      icon: 'fa-spider',           area: 'background', credits: 1 },
    claude_describe:       { label: 'Análisis Claude',        icon: 'aisc-ico aisc-ico--search', area: 'background', credits: 1 },
    migration_grant:       { label: 'Otorgación migración',   icon: 'aisc-ico aisc-ico--gift',             area: 'system',     credits: 0 },
  };

  const AREA_COLORS = {
    studio:     '#7c3aed',
    video:      '#ef4444',
    vera:       '#06b6d4',
    production: '#22c55e',
    background: '#64748b',
    system:     '#94a3b8',
  };

  async function _load() {
    const now = Date.now();
    if (cache && (now - cache.ts) < TTL) return cache.byKind;
    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const supabase = window.supabaseService
          ? await window.supabaseService.getClient()
          : window.supabase;
        if (!supabase) return FALLBACK;
        const { data } = await supabase
          .from('feature_costs')
          .select('kind, label, icon, area, credits_per_action')
          .eq('is_active', true);
        const byKind = { ...FALLBACK };
        (data || []).forEach((row) => {
          byKind[row.kind] = {
            label: row.label,
            icon: row.icon || 'aisc-ico aisc-ico--credits',
            area: row.area || 'background',
            credits: Number(row.credits_per_action) || 0,
          };
        });
        cache = { byKind, ts: Date.now() };
        return byKind;
      } catch (e) {
        console.warn('CreditCosts._load failed:', e);
        return FALLBACK;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function getMap() {
    return await _load();
  }

  function getMapSync() {
    return cache?.byKind || FALLBACK;
  }

  function get(kind) {
    return getMapSync()[kind] || {
      label: kind,
      icon: 'aisc-ico aisc-ico--credits',
      area: 'background',
      credits: 0,
    };
  }

  function getCostFor(kind) {
    return get(kind).credits;
  }

  function estimate(kind, count = 1) {
    return getCostFor(kind) * count;
  }

  function getLabel(kind) {
    return get(kind).label;
  }

  function getAreaColor(area) {
    return AREA_COLORS[area] || '#64748b';
  }

  function clearCache() {
    cache = null;
  }

  return {
    getMap,
    getMapSync,
    get,
    getCostFor,
    estimate,
    getLabel,
    getAreaColor,
    clearCache,
    FALLBACK,
    AREA_COLORS,
  };
})();
