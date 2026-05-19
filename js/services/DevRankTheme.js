/**
 * DevRankTheme — Aplica el degradado de identidad del developer según su rango.
 * Análogo a OrgBrandTheme (que toma colores de la org), pero los colores son
 * FIJOS de la plataforma (paleta Frame 83) y la selección depende del rank.
 *
 * Lee profiles.dev_rank del usuario actual y setea en :root:
 *   --dev-gradient-dynamic           (horizontal, default angle 135)
 *   --dev-gradient-dynamic-vertical  (vertical, angle 180)
 *   --dev-rank-label                 (nombre del rank en minúscula, para CSS opcional)
 *
 * Rangos canónicos (5 + legend):
 *   rookie    →  verde único           (1 color)
 *   junior    →  azul → cyan           (2 colores)
 *   builder   →  rojo → naranja → amarillo  (paleta cálida = brand-gradient-1)
 *   expert    →  lima → verde → cyan        (paleta fría  = brand-gradient-2)
 *   master    →  azul → violeta → magenta   (paleta noche = brand-gradient-3)
 *   legend    →  toda la paleta              (= brand-gradient completo)
 *
 * Los gradientes prefab se definen en :root (bundle.css). Este service solo elige
 * cuál mapear a --dev-gradient-dynamic según el rank del usuario.
 */
(function () {
  'use strict';

  const root = document.documentElement;

  /** Rank → gradiente prefab (variable CSS sin var() wrapper). */
  const RANK_GRADIENTS = {
    rookie:  { h: '--dev-gradient-rookie',  v: '--dev-gradient-rookie-vertical'  },
    junior:  { h: '--dev-gradient-junior',  v: '--dev-gradient-junior-vertical'  },
    builder: { h: '--dev-gradient-builder', v: '--dev-gradient-builder-vertical' },
    expert:  { h: '--dev-gradient-expert',  v: '--dev-gradient-expert-vertical'  },
    master:  { h: '--dev-gradient-master',  v: '--dev-gradient-master-vertical'  },
    legend:  { h: '--dev-gradient-legend',  v: '--dev-gradient-legend-vertical'  }
  };

  /** Rank → label visible. */
  const RANK_LABEL = {
    rookie: 'Rookie',
    junior: 'Junior',
    builder: 'Builder',
    expert: 'Expert',
    master: 'Master',
    legend: 'Legend'
  };

  /** Normaliza un rank arbitrario al canónico más cercano (case-insensitive); fallback rookie. */
  function normalizeRank(raw) {
    if (!raw) return 'rookie';
    const lower = String(raw).toLowerCase().trim();
    if (RANK_GRADIENTS[lower]) return lower;
    // Sinónimos comunes
    if (lower === 'lead' || lower === 'admin') return 'legend';
    if (lower === 'senior') return 'master';
    if (lower === 'mid' || lower === 'intermediate') return 'expert';
    if (lower === 'beginner') return 'junior';
    return 'rookie';
  }

  let lastAppliedRank = null;
  let lastAppliedUserId = null;

  function clearDevRankTheme() {
    lastAppliedRank = null;
    lastAppliedUserId = null;
    root.style.removeProperty('--dev-gradient-dynamic');
    root.style.removeProperty('--dev-gradient-dynamic-vertical');
    root.style.removeProperty('--dev-rank-label');
    document.body.classList.remove('dev-rank-context');
    // Limpiar clases granulares
    ['rookie', 'junior', 'builder', 'expert', 'master', 'legend'].forEach(r =>
      document.body.classList.remove(`dev-rank-${r}`)
    );
    const badge = document.getElementById('navDevRankBadge');
    if (badge) {
      badge.textContent = '';
      badge.hidden = true;
    }
  }

  /** Aplica el gradiente al :root. `rank` debe ser uno de RANK_GRADIENTS o normalizable. */
  function applyRank(rank) {
    const canonical = normalizeRank(rank);
    const map = RANK_GRADIENTS[canonical];
    if (!map) return canonical;
    root.style.setProperty('--dev-gradient-dynamic', `var(${map.h})`);
    root.style.setProperty('--dev-gradient-dynamic-vertical', `var(${map.v})`);
    root.style.setProperty('--dev-rank-label', `"${RANK_LABEL[canonical] || canonical}"`);
    document.body.classList.add('dev-rank-context');
    // Limpiar clases granulares previas y aplicar la nueva
    ['rookie', 'junior', 'builder', 'expert', 'master', 'legend'].forEach(r =>
      document.body.classList.remove(`dev-rank-${r}`)
    );
    document.body.classList.add(`dev-rank-${canonical}`);
    lastAppliedRank = canonical;
    // Refrescar el badge del sidebar (más confiable que CSS pseudo content)
    syncSidebarRankBadge(canonical);
    return canonical;
  }

  /** Escribe el texto del rank en el badge del sidebar (HTML directo, no CSS content). */
  function syncSidebarRankBadge(canonical) {
    const badge = document.getElementById('navDevRankBadge');
    if (badge) {
      const label = RANK_LABEL[canonical] || canonical;
      badge.textContent = label;
      badge.setAttribute('data-rank', canonical);
      badge.hidden = false;
    }
    // Re-escribir hrefs del sidebar dev a la forma canónica /dev/<rank>/<userId>/<page>
    refreshSidebarDevLinks();
  }

  /** Recorre <a data-route="/dev/..."> del sidebar dev y los reescribe en forma canónica. */
  function refreshSidebarDevLinks() {
    const nav = document.querySelector('.nav-mode-developer');
    if (!nav) return;
    const userId = (window.authService?.getCurrentUser?.()?.id) || lastAppliedUserId;
    const rank = lastAppliedRank;
    if (!rank || !userId) return;
    const RANKS = ['rookie', 'junior', 'builder', 'expert', 'master', 'legend'];
    nav.querySelectorAll('a[data-route^="/dev/"]').forEach((a) => {
      const cur = a.getAttribute('data-route') || '';
      // Si ya está en forma canónica con el mismo rank+user, saltar
      const match = cur.match(/^\/dev\/([a-z]+)\/([^/]+)\/(.+)$/);
      if (match && RANKS.indexOf(match[1]) >= 0) {
        // Reemplazar rank y user actuales (por si cambiaron)
        const rest = match[3];
        const newHref = `/dev/${rank}/${userId}/${rest}`;
        if (a.getAttribute('href') !== newHref) {
          a.setAttribute('href', newHref);
          a.setAttribute('data-route', newHref);
        }
        return;
      }
      // Forma vieja /dev/<rest>
      const rest = cur.slice(5);
      if (!rest) return;
      const newHref = `/dev/${rank}/${userId}/${rest}`;
      a.setAttribute('href', newHref);
      a.setAttribute('data-route', newHref);
    });
  }

  /** Devuelve el rank actual aplicado (sin tocar BD). */
  function getCurrentRank() {
    return lastAppliedRank;
  }

  /** Lee profiles.dev_rank del usuario; cache 10 min vía apiClient si está disponible. */
  async function fetchUserRank(userId) {
    if (!userId) return null;
    const supabase = window.supabase;
    if (!supabase) return null;
    const fetcher = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('dev_rank, dev_role, is_developer')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        console.warn('DevRankTheme: fetchUserRank error', error);
        return null;
      }
      return data || null;
    };
    try {
      return window.apiClient
        ? await window.apiClient.query(`devrank:${userId}`, fetcher, { ttl: 10 * 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
    } catch (e) {
      console.error('DevRankTheme: error fetchUserRank', e);
      return null;
    }
  }

  /**
   * Aplica el tema de rank del developer indicado. Sin userId, lee del current user.
   * Si el usuario no es developer, limpia el theme.
   */
  async function applyDevRankTheme(userId) {
    if (!userId && window.authService?.getCurrentUser) {
      const u = window.authService.getCurrentUser();
      userId = u?.id;
    }
    if (!userId) {
      clearDevRankTheme();
      return null;
    }
    if (userId === lastAppliedUserId && lastAppliedRank) {
      return lastAppliedRank;
    }
    lastAppliedUserId = userId;
    const profile = await fetchUserRank(userId);
    if (!profile || !profile.is_developer) {
      clearDevRankTheme();
      return null;
    }
    // dev_rank tiene prioridad; si no hay, dev_role como fallback (lead→legend); si no, rookie.
    const rankRaw = profile.dev_rank || profile.dev_role || 'rookie';
    const canonical = applyRank(rankRaw);
    // Canonicalizar URL: /dev/<page> → /dev/<rank>/<userId>/<page>
    canonicalizeDevUrl(canonical, userId);
    return canonical;
  }

  /**
   * Reescribe la URL del browser de /dev/<page> a /dev/<rank>/<userId>/<page>
   * sin re-disparar el router (replaceState). Si ya está en forma canónica con OTRO rank
   * (porque cambió el rank del user), también la actualiza al rank actual.
   */
  function canonicalizeDevUrl(rank, userId) {
    if (!rank || !userId) return;
    const path = window.location.pathname || '';
    if (!path.startsWith('/dev/')) return;
    const search = window.location.search || '';
    const RANKS = ['rookie', 'junior', 'builder', 'expert', 'master', 'legend'];
    const canonicalMatch = path.match(/^\/dev\/([a-z]+)\/([^/]+)\/(.+)$/);
    if (canonicalMatch && RANKS.indexOf(canonicalMatch[1]) >= 0) {
      const prevRank = canonicalMatch[1];
      const prevUser = canonicalMatch[2];
      const rest = canonicalMatch[3];
      if (prevRank === rank && prevUser === userId) return; // ya canónico y al día
      const newPath = `/dev/${rank}/${userId}/${rest}`;
      window.history.replaceState({}, '', newPath + search);
      return;
    }
    // Forma vieja /dev/<page> → /dev/<rank>/<userId>/<page>
    const rest = path.slice(5); // strip "/dev/"
    if (!rest) return; // /dev sin sufijo
    const newPath = `/dev/${rank}/${userId}/${rest}`;
    window.history.replaceState({}, '', newPath + search);
  }

  /** Invalida cache (llamar tras un cambio de rank desde admin). */
  function invalidate(userId) {
    if (window.apiClient && userId) {
      window.apiClient.invalidate(`devrank:${userId}`);
    }
    lastAppliedRank = null;
    lastAppliedUserId = null;
  }

  window.DevRankTheme = {
    applyDevRankTheme,
    clearDevRankTheme,
    applyRank,           // útil para preview manual
    normalizeRank,
    invalidate,
    getCurrentRank,
    syncSidebarRankBadge,
    RANK_GRADIENTS,
    RANK_LABEL
  };
})();
