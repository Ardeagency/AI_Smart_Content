/**
 * DevSidebarEnhancements — patrones dev-native premium (Linear/Vercel cues)
 *
 * Dos features cargadas juntas porque ambas viven en el shell del portal dev:
 *
 *   1) Command Palette (Cmd+K / Ctrl+K)
 *      Modal flotante con búsqueda fuzzy de páginas y acciones rápidas. Solo
 *      activo en rutas /dev/*. Registro curado (no espejo del sidebar).
 *
 *   2) Status Bar inferior del sidebar dev
 *      Franja 22px con env, build SHA y atajo a Cmd+K. Estilo VS Code.
 *      Se inyecta antes del .nav-brand-footer; observa el DOM por re-renders
 *      de Navigation.
 *
 * Lead-gating en commands via window.authService.isLead(). Sin deps externas.
 */
(function () {
  'use strict';

  // ============ Command Palette ============

  let paletteEl = null;
  let lastFocused = null;
  let selectedIndex = 0;
  let filteredCommands = [];

  function isLead() {
    return window.authService?.isLead?.() === true;
  }

  function navigate(path) {
    closePalette();
    if (window.router?.navigate) window.router.navigate(path);
    else window.location.href = path;
  }

  function isDevRoute() {
    return (window.location.pathname || '').startsWith('/dev/');
  }

  function buildCommands() {
    const lead = isLead();
    const all = [
      // Navegación principal
      { id: 'go-dashboard', label: 'Dashboard',     hint: '/dev/dashboard',           icon: 'aisc-ico aisc-ico--growth',    group: 'Navegación', action: () => navigate('/dev/dashboard') },
      { id: 'go-flows',     label: 'Mis flujos',    hint: '/dev/flows',               icon: 'aisc-ico aisc-ico--grid',      group: 'Navegación', action: () => navigate('/dev/flows') },
      { id: 'go-tests',     label: 'Flow Tests',    hint: '/dev/test',                icon: 'aisc-ico aisc-ico--flask',         group: 'Navegación', action: () => navigate('/dev/test') },
      { id: 'go-logs',      label: 'Logs',          hint: '/dev/logs',                icon: 'aisc-ico aisc-ico--consola-desarrollador',      group: 'Navegación', action: () => navigate('/dev/logs') },
      { id: 'go-costs',     label: 'Costos',        hint: '/dev/costs',               icon: 'aisc-ico aisc-ico--dashboard',         group: 'Navegación', action: () => navigate('/dev/costs') },
      { id: 'go-webhooks',  label: 'Webhooks',      hint: '/dev/webhooks',            icon: 'aisc-ico aisc-ico--zap',          group: 'Navegación', action: () => navigate('/dev/webhooks') },
      { id: 'go-vitals',    label: 'Web Vitals',    hint: '/dev/web-vitals',          icon: 'aisc-ico aisc-ico--dashboard',         group: 'Navegación', action: () => navigate('/dev/web-vitals') },
      { id: 'go-training',  label: 'Entrenamiento (LLM)', hint: '/dev/lead/vera-training', icon: 'aisc-ico aisc-ico--memory',   group: 'Navegación', action: () => navigate('/dev/lead/vera-training'), requiresLead: true },
      // Acciones rápidas
      { id: 'new-flow',     label: 'Nuevo flujo',   hint: 'Crear · /dev/builder',     icon: 'aisc-ico aisc-ico--add',          group: 'Acciones',   action: () => navigate('/dev/builder') },
      { id: 'new-user',     label: 'Nuevo usuario', hint: 'Provisioning · Lead',      icon: 'aisc-ico aisc-ico--user-registration',     group: 'Acciones',   action: () => navigate('/dev/provisioning/users'), requiresLead: true },
      // Admin (lead)
      { id: 'go-orgs',       label: 'Organizaciones', hint: '/dev/lead/orgs',          icon: 'aisc-ico aisc-ico--organization',     group: 'Admin',      action: () => navigate('/dev/lead/orgs'),          requiresLead: true },
      { id: 'go-team',       label: 'Team',           hint: '/dev/lead/team',          icon: 'aisc-ico aisc-ico--audience',        group: 'Admin',      action: () => navigate('/dev/lead/team'),          requiresLead: true },
      { id: 'go-inputs',     label: 'Inputs',         hint: '/dev/lead/input-schemas', icon: 'aisc-ico aisc-ico--filter',    group: 'Admin',      action: () => navigate('/dev/lead/input-schemas'), requiresLead: true },
      { id: 'go-categories', label: 'Categories',     hint: '/dev/lead/categories',    icon: 'aisc-ico aisc-ico--tag',         group: 'Admin',      action: () => navigate('/dev/lead/categories'),    requiresLead: true },
      { id: 'go-lexicon',    label: 'Temas huerfanos', hint: '/dev/lead/lexicon',       icon: 'aisc-ico aisc-ico--book',         group: 'Admin',      action: () => navigate('/dev/lead/lexicon'),       requiresLead: true },
    ];
    return all.filter(c => !c.requiresLead || lead);
  }

  /** Score fuzzy ligero: exacto > prefix > substring > letras-en-orden > 0 */
  function fuzzyScore(label, hint, q) {
    if (!q) return 1;
    const text = (label + ' ' + hint).toLowerCase();
    const lab = label.toLowerCase();
    const qq = q.toLowerCase().trim();
    if (lab === qq) return 1000;
    if (lab.startsWith(qq)) return 500;
    if (lab.includes(qq)) return 200;
    if (text.includes(qq)) return 100;
    // letras en orden (subsequence)
    let i = 0;
    for (const ch of text) {
      if (ch === qq[i]) i++;
      if (i === qq.length) return 10;
    }
    return 0;
  }

  function filterCommands(q) {
    const cmds = buildCommands();
    if (!q) return cmds;
    return cmds
      .map(c => ({ c, s: fuzzyScore(c.label, c.hint, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.c);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderResults(query) {
    filteredCommands = filterCommands(query);
    selectedIndex = 0;
    const list = paletteEl?.querySelector('.cmdpal-list');
    if (!list) return;
    if (filteredCommands.length === 0) {
      list.innerHTML = '<div class="cmdpal-empty">Sin resultados</div>';
      return;
    }
    list.innerHTML = filteredCommands.map((c, i) => `
      <button type="button" class="cmdpal-item${i === 0 ? ' is-selected' : ''}" data-index="${i}">
        <span class="cmdpal-item-icon"><i class="fas ${escapeHtml(c.icon)}"></i></span>
        <span class="cmdpal-item-label">${escapeHtml(c.label)}</span>
        <span class="cmdpal-item-hint">${escapeHtml(c.hint)}</span>
        <span class="cmdpal-item-group">${escapeHtml(c.group)}</span>
      </button>
    `).join('');
  }

  function setSelected(i) {
    if (filteredCommands.length === 0) return;
    const n = filteredCommands.length;
    selectedIndex = ((i % n) + n) % n;
    paletteEl?.querySelectorAll('.cmdpal-item').forEach((el, idx) => {
      el.classList.toggle('is-selected', idx === selectedIndex);
    });
    const sel = paletteEl?.querySelector('.cmdpal-item.is-selected');
    sel?.scrollIntoView({ block: 'nearest' });
  }

  function executeSelected() {
    const cmd = filteredCommands[selectedIndex];
    if (cmd && typeof cmd.action === 'function') cmd.action();
  }

  function openPalette() {
    if (paletteEl) return;
    lastFocused = document.activeElement;
    paletteEl = document.createElement('div');
    paletteEl.className = 'cmdpal-overlay';
    paletteEl.innerHTML = `
      <div class="cmdpal" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="cmdpal-input-row">
          <i class="aisc-ico cmdpal-input-icon aisc-ico--search"></i>
          <input type="text" class="cmdpal-input" placeholder="Buscar páginas, acciones..." autocomplete="off" spellcheck="false">
          <kbd class="cmdpal-kbd-hint">ESC</kbd>
        </div>
        <div class="cmdpal-list" role="listbox"></div>
        <div class="cmdpal-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> ejecutar</span>
          <span><kbd>ESC</kbd> cerrar</span>
        </div>
      </div>
    `;
    document.body.appendChild(paletteEl);

    const input = paletteEl.querySelector('.cmdpal-input');
    const list = paletteEl.querySelector('.cmdpal-list');
    renderResults('');
    requestAnimationFrame(() => input.focus());

    input.addEventListener('input', (e) => renderResults(e.target.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(selectedIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(selectedIndex - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); executeSelected(); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.cmdpal-item');
      if (!btn) return;
      selectedIndex = parseInt(btn.dataset.index, 10) || 0;
      executeSelected();
    });
    paletteEl.addEventListener('click', (e) => {
      if (e.target === paletteEl) closePalette();
    });
  }

  function closePalette() {
    if (!paletteEl) return;
    paletteEl.remove();
    paletteEl = null;
    filteredCommands = [];
    selectedIndex = 0;
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) {}
    }
    lastFocused = null;
  }

  // Toggle global Cmd+K / Ctrl+K (solo en /dev/*)
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K')) return;
    if (!isDevRoute()) return;
    e.preventDefault();
    if (paletteEl) closePalette();
    else openPalette();
  });

  window.DevCommandPalette = { open: openPalette, close: closePalette };

  // ============ Status Bar (bottom of dev sidebar) ============

  // BUILD_ID se reemplaza por $COMMIT_REF en build (netlify.toml). En dev local
  // queda el literal y caemos a 'local'.
  const APP_BUILD = (() => {
    const v = '__BUILD_ID__';
    return v.startsWith('__') ? 'local' : v.slice(0, 7);
  })();

  function envLabel() {
    const h = window.location.hostname || '';
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return 'local';
    if (h.includes('netlify.app') || h.includes('deploy-preview')) return 'preview';
    return 'prod';
  }

  function injectStatusBar() {
    const sidebar = document.querySelector('.side-navigation.nav-mode-developer');
    if (!sidebar) return false;
    if (sidebar.querySelector('.nav-dev-statusbar')) return true;
    const footer = sidebar.querySelector('.nav-brand-footer');
    if (!footer) return false;
    const bar = document.createElement('div');
    bar.className = 'nav-dev-statusbar';
    bar.innerHTML = `
      <span class="nav-dev-statusbar-dot" title="API health"></span>
      <span class="nav-dev-statusbar-env">${escapeHtml(envLabel())}</span>
      <span class="nav-dev-statusbar-sep">·</span>
      <span class="nav-dev-statusbar-build" title="Build">${escapeHtml(APP_BUILD)}</span>
      <span class="nav-dev-statusbar-spacer"></span>
      <button type="button" class="nav-dev-statusbar-cmd" title="Command Palette (Cmd+K)">
        <kbd>⌘K</kbd>
      </button>
    `;
    sidebar.insertBefore(bar, footer);
    bar.querySelector('.nav-dev-statusbar-cmd')?.addEventListener('click', (e) => {
      e.preventDefault();
      openPalette();
    });
    return true;
  }

  function ensureStatusBar() {
    if (injectStatusBar()) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (injectStatusBar() || ++tries > 40) clearInterval(timer);
    }, 150);
  }

  if (document.readyState !== 'loading') ensureStatusBar();
  else document.addEventListener('DOMContentLoaded', ensureStatusBar);

  // Re-inyectar tras re-renders de Navigation (cambio de modo, etc.).
  // OJO performance: observamos SOLO #navigation-container, no document.body.
  // El sidebar dev vive aqui y solo muta en cambios de modo; observar el body
  // entero disparaba este callback (con querySelector) en CADA mutacion de
  // cualquier vista (cada innerHTML = de cualquier render de la app).
  if (window.MutationObserver) {
    const navRoot = document.getElementById('navigation-container');
    if (navRoot) {
      const obs = new MutationObserver(() => {
        const sb = navRoot.querySelector('.side-navigation.nav-mode-developer');
        if (sb && !sb.querySelector('.nav-dev-statusbar')) injectStatusBar();
      });
      obs.observe(navRoot, { childList: true, subtree: true });
    }
  }
})();
