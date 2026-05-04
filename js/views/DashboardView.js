/**
 * DashboardView – Panel de inteligencia de marca (organización).
 * Tab "Mi Marca": datos reales desde Supabase + APIs externas.
 * Spec: dashboard_mi_marca_spec.docx — ARDE Agency S.A.S.
 */
class DashboardView extends BaseView {

  // Activación granular por tab. Cuando un tab está en false, se renderiza el
  // placeholder "Próximamente". El resto del código (services, RPCs) queda
  // intacto. Cuando el tab esté listo se flipea a true.
  static TABS_ENABLED = {
    'my-brands':  true,    // Mi Marca v2 — barra ardiente nueva
    'competence': true,    // Competencia v2 — adaptado de Partner para marketing estratégico
    'tendencies': false,
    'strategy':   false,
  };

  constructor() {
    super();
    this._activeTab  = 'my-brands';
    this._charts     = [];
    this._chartJsReady = false;
    this._supabase      = null;
    this._orgId         = null;
    this._mbData        = null;   // Cache de datos de la sesión
    this._mbService     = null;   // Instancia de MiBrandaDataService
    this._stratService  = null;   // Instancia de StrategiaDataService
    this._stratData     = null;   // Cache de datos de estrategia
    this._stratHorizon  = 'hoy';  // Horizonte activo del plan
    this._stratSelected = null;   // Acción seleccionada en el panel
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    // Resolver Supabase + orgId una sola vez
    await this._initDataLayer();
  }

  async _initDataLayer() {
    try {
      if (window.supabaseService) this._supabase = await window.supabaseService.getClient();
      else if (window.supabase)  this._supabase = window.supabase;
    } catch (_) {}

    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    // El router resuelve /org/:orgIdShort/:orgNameSlug → routeParams.orgId (UUID).
    // Nunca usar orgIdShort directo: la columna organization_id es uuid → 400 Bad Request.
    let candidate =
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null;

    if (!isUuid(candidate)
        && this.routeParams?.orgIdShort
        && this.routeParams?.orgNameSlug
        && typeof window.resolveOrgIdFromShortAndSlug === 'function') {
      try {
        const r = await window.resolveOrgIdFromShortAndSlug(
          this.routeParams.orgIdShort,
          this.routeParams.orgNameSlug
        );
        if (isUuid(r?.id)) candidate = r.id;
      } catch (_) {}
    }

    this._orgId = isUuid(candidate) ? candidate : null;
    if (!this._orgId) {
      console.warn('[DashboardView] No se pudo resolver organization_id (UUID).');
    }
  }

  onLeave() {
    this._destroyCharts();
  }

  _destroyCharts() {
    this._charts.forEach(c => { try { c.destroy(); } catch (_) {} });
    this._charts = [];
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Dashboard', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();
    this._renderTab(this._activeTab);
  }

  renderHTML() {
    return this._buildShell();
  }

  _buildShell() {
    // Grupo izquierdo (Mi Marca / Competencia / Tendencias) y Estrategia separado a la derecha.
    const leftTabs  = [
      { id: 'my-brands',  label: 'Mi Marca'    },
      { id: 'competence', label: 'Competencia' },
      { id: 'tendencies', label: 'Tendencias'  },
    ];
    const rightTabs = [
      { id: 'strategy',   label: 'Estrategia'  },
    ];
    const pill = (t) => `
      <button class="mb-firebar-tab${this._activeTab === t.id ? ' is-active' : ''}" data-tab="${t.id}">
        <span>${t.label}</span>
      </button>`;
    return `
      <div class="insight-page page-content" id="insightPage">
        <div class="mb-firebar" id="insightSubnav" data-mb-firebar>
          <div class="mb-firebar-bg" aria-hidden="true">
            <div class="mb-firebar-gradient"></div>
            <div class="background-film-grain"></div>
          </div>
          <div class="mb-firebar-tabs mb-firebar-tabs--left">
            ${leftTabs.map(pill).join('')}
          </div>
          <div class="mb-firebar-tabs mb-firebar-tabs--right">
            ${rightTabs.map(pill).join('')}
          </div>
        </div>
        <div class="insight-tab-body" id="insightTabBody"></div>
      </div>`;
  }

  _setupTabs() {
    const nav = document.getElementById('insightSubnav');
    if (!nav) return;
    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this._destroyCharts();
      this._activeTab = btn.dataset.tab;
      nav.querySelectorAll('.mb-firebar-tab')
        .forEach(b => b.classList.toggle('is-active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    if (!DashboardView.TABS_ENABLED?.[tabId]) {
      this._renderComingSoon(tabId, body);
      return;
    }
    if (tabId === 'my-brands') {
      this._renderMyBrands(body);
    } else if (tabId === 'competence') {
      this._renderCompetence(body);
    } else if (tabId === 'tendencies') {
      this._renderTendencies(body);
    } else if (tabId === 'strategy') {
      this._renderStrategy(body);
    }
  }

  _renderComingSoon(tabId, body) {
    const meta = {
      'my-brands':  { title: 'Mi Marca',    desc: 'Pulso operativo, identidad narrativa, comercial y diagnóstico de salud de marca.' },
      'competence': { title: 'Competencia', desc: 'Precios, narrativa rival, vulnerabilidades y mapa de inversión publicitaria.' },
      'tendencies': { title: 'Tendencias',  desc: 'Señales emergentes, contexto cultural, cambios de algoritmo y estética dominante.' },
      'strategy':   { title: 'Estrategia',  desc: 'Sintetizador del plan diario / semanal / mensual con score de salud y nivel de amenaza.' },
    }[tabId] || { title: 'Dashboard', desc: '' };

    body.innerHTML = `
      <div class="dash-coming-soon" style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        min-height:60vh;padding:48px 24px;text-align:center;gap:16px;
      ">
        <div style="
          width:72px;height:72px;border-radius:50%;
          background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(236,72,153,.15));
          display:flex;align-items:center;justify-content:center;
          font-size:32px;
        ">⏳</div>
        <h2 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;">
          ${meta.title} — Próximamente
        </h2>
        <p style="margin:0;max-width:560px;color:var(--text-muted,#6b7280);line-height:1.6;font-size:15px;">
          ${meta.desc}
        </p>
        <p style="margin:0;font-size:13px;color:var(--text-muted,#9ca3af);">
          Estamos puliendo este panel. Volvé pronto.
        </p>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     MI MARCA — datos reales desde Supabase
  ═══════════════════════════════════════════════════════════ */
  async _renderMyBrands(body, opts = null) {
    this._mbBody = body;
    if (!this._mbFilters) this._mbFilters = { brandId: '', windowDays: 30 };

    // 1. Skeleton inmediato
    body.innerHTML = this._buildMyBrandsSkeleton();

    // 2. Cargar dependencias en paralelo
    await Promise.allSettled([
      this._ensureChartJs(),
      this._ensureMBService(),
    ]);

    // 3. Cargar datos — sin cache si llegan opts (cambio de filtro)
    if (opts || !this._mbData) {
      const f = this._mbFilters;
      const loadOpts = {
        windowDays: f.windowDays,
        brandIds:   f.brandId ? [f.brandId] : null,
      };
      this._mbData = this._mbService
        ? await this._mbService.loadAll(loadOpts)
        : null;
    }
    const d = this._mbData;

    // 4. Render completo con datos reales — v3 layout (Partner-style)
    body.innerHTML = this._buildMyBrandsV2HTML(d);
    window._dashboardView = this;
    this._initMyBrandsV2Charts(d);
    this._animateKPIs?.();
  }

  async _ensureMBService() {
    if (this._mbService) return;
    if (!window.MiBrandaDataService) {
      try {
        await this.loadScript('/js/services/MiBrandaDataService.js', 'MiBrandaDataService', 6000);
      } catch (_) { return; }
    }
    if (!this._supabase || !this._orgId) return;
    try {
      this._mbService = await new window.MiBrandaDataService().init(this._supabase, this._orgId);
    } catch (e) {
      console.warn('[DashboardView] MiBrandaDataService init error:', e);
    }
  }

  _buildMyBrandsSkeleton() {
    const skel = n => Array(n).fill('<div class="mb-skel-block"></div>').join('');
    return `
    <div class="mb-dashboard mb-dashboard--loading">
      <div class="mb-kpi-strip">${Array(6).fill(`<div class="mb-kpi-card"><div class="mb-skel-block" style="height:64px;width:100%"></div></div>`).join('')}</div>
      <div class="mb-skel-panel">${skel(3)}</div>
      <div class="mb-dim-row">
        <div class="mb-widget mb-widget--wide" style="min-height:200px">${skel(3)}</div>
        <div class="mb-widget" style="min-height:200px">${skel(2)}</div>
      </div>
    </div>`;
  }

  async _ensureChartJs() {
    if (window.Chart) { this._chartJsReady = true; return; }
    await this.loadScript(
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
      'Chart', 8000
    );
    this._chartJsReady = true;
  }

  /** Registrar Chart.js en this._charts para destruirlo en onLeave. Compartido por Tendencias V1. */
  _reg(chart) { this._charts.push(chart); return chart; }

  _animateKPIs() {
    // small pop-in animation for KPI cards
    document.querySelectorAll('.mb-kpi-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(10px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        card.style.opacity = '1';
        card.style.transform = 'none';
      }, i * 60);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     TENDENCIAS — El Pulso del Mundo
  ═══════════════════════════════════════════════════════════ */
  async _renderTendencies(body) {
    body.innerHTML = `<div class="mb-loading"> Escaneando señales del mundo…</div>`;
    try { await this._ensureChartJs(); } catch (_) {}
    body.innerHTML = this._buildTendenciesHTML();
    this._initTendenciesCharts();
    this._animateTD();
  }

  _buildTendenciesHTML() {
    return `
    <div class="td-dashboard">

      <!-- ── KPI Strip ── -->
      <div class="td-kpi-strip">
        ${this._tdKpi('Señales activas',         '47',   'Esta hora',               'yellow')}
        ${this._tdKpi('Content Gaps / día',      '12',   'Océanos azules',          'blue')}
        ${this._tdKpi('Alcance potencial',       '+38%', 'vs publicación normal',   'green')}
        ${this._tdKpi('Cambios algorítmicos',    '3',    'Hoy en plataformas',      'orange')}
        ${this._tdKpi('Sentimiento global',      '😊',   'Optimista / Nostálgico',  'pink')}
        ${this._tdKpi('Oportunidades capturadas','9',    'Últimas 24 h',            'purple')}
      </div>

      <!-- ── OpenClaw Opportunity Feed ── -->
      <div class="td-opportunity-feed">
        <div class="td-of-header">
          <span> OpenClaw Opportunity Feed</span>
          <span class="cc-pulse-dot"></span>
        </div>
        <div class="td-of-list" id="tdOpFeed"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM A · THE EARLY DETECTION
      ══════════════════════════════════════════════ -->
      ${this._tdDim('The Early Detection', 'Señales débiles de nicho, audios virales y content gaps')}

      <div class="td-dim-row">
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title">Señales Débiles del Nicho</span>
            <span class="td-badge td-badge--yellow">Ascenso</span>
          </div>
          <div class="td-widget-body">
            ${this._tdNicheSignals()}
          </div>
        </div>
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title">Audios y Memes en Ascenso</span>
            <span class="td-badge td-badge--pink">TikTok · Reels</span>
          </div>
          <div class="td-widget-body">
            ${this._tdAudios()}
          </div>
        </div>
      </div>

      <div class="td-widget td-widget--full">
        <div class="td-widget-header">
          <span class="td-widget-title">Content Gaps — Océanos Azules del Día</span>
          <span class="td-badge td-badge--blue">Ningún rival está aquí</span>
        </div>
        <div class="td-widget-body">
          ${this._tdContentGaps()}
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM B · THE REAL WORLD SYNC
      ══════════════════════════════════════════════ -->
      ${this._tdDim('The Real World Sync', 'Contexto climático, eventos culturales y sentiment shift global')}

      <div class="td-dim-row">
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title">Sincronización con el Mundo Físico</span>
            <span class="td-badge td-badge--green">Oportunidades activas</span>
          </div>
          <div class="td-widget-body">
            ${this._tdWorldSync()}
          </div>
        </div>
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title">Sentiment Shift Global</span>
            <span class="td-badge td-badge--yellow">Hoy</span>
          </div>
          <div class="td-widget-body td-widget-body--center">
            <canvas id="tdChartSentiment" height="220"></canvas>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM C · THE PLATFORM PULSE
      ══════════════════════════════════════════════ -->
      ${this._tdDim('The Platform Pulse', 'Cambios algorítmicos, velocidad de hashtags y keywords')}

      <div class="td-dim-row">
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title">Algorithmic Watchdog</span>
            <span class="td-badge td-badge--orange">Cambios detectados</span>
          </div>
          <div class="td-widget-body">
            ${this._tdAlgoWatchdog()}
          </div>
        </div>
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title">Hashtag & Keyword Velocity</span>
            <span class="td-badge td-badge--blue">Aceleración</span>
          </div>
          <div class="td-widget-body">
            <canvas id="tdChartVelocity" height="200"></canvas>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM D · THE VISUAL TREND
      ══════════════════════════════════════════════ -->
      ${this._tdDim('The Visual Trend', 'Estética del minuto, paletas dominantes y ganchos de atención')}

      <div class="td-dim-row">
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title">Evolución Estética del Minuto</span>
            <span class="td-badge td-badge--pink">Engagement visual</span>
          </div>
          <div class="td-widget-body">
            ${this._tdAestheticTrends()}
          </div>
        </div>
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title">Narrative Hooks — Top 3 segundos</span>
            <span class="td-badge td-badge--yellow">Anti-scroll</span>
          </div>
          <div class="td-widget-body">
            ${this._tdNarrativeHooks()}
          </div>
        </div>
      </div>

      <!-- Keyword velocity trend extra chart -->
      <div class="td-widget td-widget--full">
        <div class="td-widget-header">
          <span class="td-widget-title">Curva de Emergencia de Tendencias — Últimas 48 horas</span>
          <span class="td-badge td-badge--green">Tiempo real</span>
        </div>
        <div class="td-widget-body">
          <canvas id="tdChartEmergence" height="160"></canvas>
        </div>
      </div>

      <!-- Footer demo -->
      <div class="mb-demo-note">
        
        <span>Datos <strong>simulados para demostración</strong>. OpenClaw conectará Google Trends, APIs meteorológicas, scraping de plataformas y detección de audio en tiempo real.</span>
      </div>

    </div>`;
  }

  /* ── Helpers tendencias ─────────────────────────────── */
  _tdDim(title, subtitle) {
    return `
      <div class="mb-dim-header td-dim-header">
        <div>
          <div class="mb-dim-title">${this._esc(title)}</div>
          <div class="mb-dim-subtitle">${this._esc(subtitle)}</div>
        </div>
      </div>`;
  }

  _tdKpi(label, value, sub, color) {
    return `
      <div class="mb-kpi-card mb-kpi--${color} td-kpi-card">
        <div class="mb-kpi-body">
          <div class="mb-kpi-value">${value}</div>
          <div class="mb-kpi-label">${label}</div>
          <div class="mb-kpi-sub">${sub}</div>
        </div>
      </div>`;
  }

  _tdNicheSignals() {
    const signals = [
      { topic: 'Journaling para salud mental',   category: 'Lifestyle',     vel: 94, delta: '+152%', opportunity: 'Alto', age: '2 h' },
      { topic: 'Recetas sin gluten express',      category: 'Alimentación',  vel: 87, delta: '+89%',  opportunity: 'Alto', age: '4 h' },
      { topic: 'Cocina retro años 90',            category: 'Nostalgia',     vel: 81, delta: '+67%',  opportunity: 'Alto', age: '6 h' },
      { topic: 'Meal prep para oficina',          category: 'Productividad', vel: 73, delta: '+44%',  opportunity: 'Medio', age: '11 h' },
      { topic: 'ASMR de cocina',                  category: 'Audio',         vel: 68, delta: '+38%',  opportunity: 'Medio', age: '14 h' },
      { topic: 'Colores terracotas en interiores',category: 'Estética',      vel: 61, delta: '+31%',  opportunity: 'Medio', age: '18 h' },
    ];
    const oppCls = { Alto: 'td-opp--high', Medio: 'td-opp--med' };
    return `
      <div class="td-signals-table">
        <div class="td-sigt-header">
          <span>Señal / Tema</span><span>Categoría</span><span>Velocidad</span><span>Δ 24h</span><span>Oportunidad</span><span>Edad</span>
        </div>
        ${signals.map(s => `
          <div class="td-sigt-row">
            <span class="td-sigt-topic">${s.topic}</span>
            <span class="td-sigt-cat">${s.category}</span>
            <span class="td-sigt-vel">
              <div class="td-vel-bar-wrap"><div class="td-vel-bar" style="width:${s.vel}%"></div></div>
              <span>${s.vel}</span>
            </span>
            <span class="td-sigt-delta td-delta--up">${s.delta}</span>
            <span class="${oppCls[s.opportunity] || 'td-opp--med'} td-opp-badge">${s.opportunity}</span>
            <span class="td-sigt-age">${s.age}</span>
          </div>`).join('')}
      </div>`;
  }

  _tdAudios() {
    const audios = [
      { name: '"Lo-fi Cocina Mix"',     platform: 'tt',  phase: 'Exponencial', uses: '84K', fit: 98 },
      { name: '"Retro 90s Beat"',       platform: 'ig',  phase: 'Crecimiento', uses: '47K', fit: 91 },
      { name: '"ASMR Kitchen Sounds"',  platform: 'tt',  phase: 'Crecimiento', uses: '31K', fit: 86 },
      { name: '"Motivational Morning"', platform: 'yt',  phase: 'Emergencia',  uses: '12K', fit: 74 },
      { name: '"Viral Cooking Reel"',   platform: 'ig',  phase: 'Emergencia',  uses: '8K',  fit: 68 },
    ];
    const phaseCls = { Exponencial: 'td-phase--exp', Crecimiento: 'td-phase--grow', Emergencia: 'td-phase--early' };
    return `
      <div class="td-audios-list">
        ${audios.map((a, i) => `
          <div class="td-audio-row">
            <span class="td-audio-rank">#${i+1}</span>
            <div class="td-audio-info">
              <span class="td-audio-name">${a.name}</span>
              <span class="td-audio-uses"> ${a.uses} usos</span>
            </div>
            <span class="td-phase-badge ${phaseCls[a.phase]}">${a.phase}</span>
            <div class="td-fit-wrap">
              <div class="td-fit-bar" style="width:${a.fit}%"></div>
              <span class="td-fit-val">${a.fit}%</span>
            </div>
          </div>`).join('')}
        <div class="td-audios-legend">
          <span class="td-phase--exp td-phase-badge">Exponencial</span> = úsalo ahora ·
          <span class="td-phase--grow td-phase-badge">Crecimiento</span> = próximos 48h ·
          <span class="td-phase--early td-phase-badge">Emergencia</span> = preparar
        </div>
      </div>`;
  }

  _tdContentGaps() {
    const gaps = [
      { topic: 'Guía de compra de licuadoras para smoothies proteicos',   volume: 42000, brands: 0,  score: 99, action: 'Blog + Reel' },
      { topic: 'Cómo personalizar gadgets de cocina estética años 90s',   volume: 28000, brands: 0,  score: 96, action: 'Carrusel + Story' },
      { topic: 'Licuadoras y salud mental: el ritual de la mañana',       volume: 19000, brands: 1,  score: 91, action: 'Video corto' },
      { topic: 'Cocina sostenible: aparatos que duran toda la vida',      volume: 31000, brands: 2,  score: 87, action: 'Blog + Email' },
      { topic: 'Meal prep en 20 minutos con blender de alto poder',       volume: 15000, brands: 0,  score: 94, action: 'Tutorial Reel' },
    ];
    return `
      <div class="td-gaps-grid">
        ${gaps.map(g => `
          <div class="td-gap-card">
            <div class="td-gap-top">
              <span class="td-gap-score" style="--gap-score:${g.score}">${g.score}</span>
              <div class="td-gap-meta">
                <span class="td-gap-vol"> ${g.volume.toLocaleString()} búsquedas/mes</span>
                <span class="td-gap-brands ${g.brands === 0 ? 'td-brands--zero' : 'td-brands--few'}">
                   ${g.brands === 0 ? 'Ninguna marca activa' : g.brands + ' marca(s) activas'}
                </span>
              </div>
            </div>
            <p class="td-gap-topic">${g.topic}</p>
            <div class="td-gap-action"> Acción: <strong>${g.action}</strong></div>
          </div>`).join('')}
      </div>`;
  }

  _tdWorldSync() {
    const events = [
      { type: 'weather', title: 'Ola de calor — CDMX / MTY',    impact: 'Licuadoras granizados +68% búsquedas', urgency: 'high', action: 'Publicar HOY' },
      { type: 'event',   title: 'Partido Final Liga MX — sábado', impact: 'Contenido de snacks y botanas en vivo', urgency: 'med',  action: 'Preparar para sábado' },
      { type: 'calendar',title: 'Día del Niño — 30 de abril',    impact: 'Aparatos fáciles de usar para toda la familia', urgency: 'med', action: 'Campaña 28–30 abr' },
      { type: 'news',    title: 'Boom de dietas sin gluten',     impact: 'Contenido de recetas saludables +31%',  urgency: 'low',  action: 'Blog esta semana' },
      { type: 'weather', title: 'Lluvias en GDL esta tarde',     impact: 'Recetas de interior / Sopas calientes',  urgency: 'low',  action: 'Post vespertino' },
    ];
    const urg = { high: 'td-urg--high', med: 'td-urg--med', low: 'td-urg--low' };
    const typeClr = { weather: 'rgba(96,165,250,0.15)', event: 'rgba(34,197,94,0.1)', calendar: 'rgba(251,191,36,0.1)', news: 'rgba(167,139,250,0.1)' };
    return `
      <div class="td-world-list">
        ${events.map(e => `
          <div class="td-world-row" style="--row-bg:${typeClr[e.type]}">
            <div class="td-world-icon"></div>
            <div class="td-world-body">
              <span class="td-world-title">${e.title}</span>
              <span class="td-world-impact">${e.impact}</span>
            </div>
            <div class="td-world-right">
              <span class="td-urg-badge ${urg[e.urgency]}">${e.action}</span>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _tdAlgoWatchdog() {
    const platforms = [
      { name: 'Instagram',  favFormat: 'Carrusel',         change: true,  note: '↑ Prioridad vs Reels esta semana' },
      { name: 'TikTok',     favFormat: 'Video < 30 seg',   change: false, note: 'Sin cambios — sigue igual' },
      { name: 'YouTube',    favFormat: 'Shorts 60 seg',    change: true,  note: '↑ Shorts sobre videos largos' },
      { name: 'Facebook',   favFormat: 'Reels nativos',    change: false, note: 'Sin cambios' },
      { name: 'LinkedIn',   favFormat: 'Carrusel + Texto', change: true,  note: '↑ Documentos PDF convertidos' },
      { name: 'Pinterest',  favFormat: 'Idea Pin vertical',change: false, note: 'Sin cambios' },
    ];
    return `
      <div class="td-algo-list">
        ${platforms.map(p => `
          <div class="td-algo-row ${p.change ? 'td-algo--changed' : ''}">
            <div class="td-algo-icon"></div>
            <div class="td-algo-body">
              <span class="td-algo-name">${p.name}</span>
              <span class="td-algo-format"> ${p.favFormat}</span>
            </div>
            <div class="td-algo-status">
              ${p.change
                ? '<span class="td-algo-badge td-algo--alert"> Cambio</span>'
                : '<span class="td-algo-badge td-algo--ok"> Estable</span>'}
              <span class="td-algo-note">${p.note}</span>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _tdAestheticTrends() {
    const trends = [
      { name: 'Retro 90s Neon',   palette: ['#ff6ec7','#00f5d4','#ffd500','#ff0080'], engagement: 9.4, badge: '🔥 Dominante', fit: 'Perfecto para lanzamientos' },
      { name: 'Terracotas y Sage', palette: ['#c45e2a','#8b7355','#7a9e7e','#f5e6d0'], engagement: 8.1, badge: '↑ En ascenso', fit: 'Lifestyle / hogar' },
      { name: 'Minimalismo Crudo', palette: ['#f0ede8','#d6cfc4','#9b9189','#3a3530'], engagement: 7.6, badge: 'Estable', fit: 'Productos premium' },
      { name: 'Digital Glitch',    palette: ['#00e5ff','#ff00aa','#1a1a2e','#ffffff'], engagement: 7.2, badge: '↑ Emergiendo', fit: 'Público joven / Gen Z' },
    ];
    return `
      <div class="td-aesthetic-list">
        ${trends.map(t => `
          <div class="td-aesthetic-row">
            <div class="td-aes-palette">
              ${t.palette.map(c => `<span class="td-aes-swatch" style="background:${c}" title="${c}"></span>`).join('')}
            </div>
            <div class="td-aes-info">
              <span class="td-aes-name">${t.name}</span>
              <span class="td-aes-fit">${t.fit}</span>
            </div>
            <div class="td-aes-right">
              <span class="td-aes-badge">${t.badge}</span>
              <div class="td-aes-eng"> ${t.engagement}%</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _tdNarrativeHooks() {
    const hooks = [
      { hook: '"¿Sabías que el 80% de los smoothies pierden nutrientes si usas una licuadora básica?"', retention: 94, type: 'Dato impactante' },
      { hook: '"Esto es lo que nadie te dice sobre preparar comida en 15 minutos…"',                   retention: 91, type: 'Curiosidad / Misterio' },
      { hook: '"POV: Ya terminaste de cocinar y son las 7am 🧃"',                                     retention: 88, type: 'Identificación / POV' },
      { hook: '"El truco que usan los chefs para no lavar mil cosas."',                               retention: 85, type: 'Solución rápida' },
      { hook: '"Probé 5 licuadoras. Solo 1 sobrevivió a esto."',                                      retention: 82, type: 'Prueba / Reto' },
    ];
    const typeCls = { 'Dato impactante':'td-hook--stat', 'Curiosidad / Misterio':'td-hook--mystery', 'Identificación / POV':'td-hook--pov', 'Solución rápida':'td-hook--solution', 'Prueba / Reto':'td-hook--challenge' };
    return `
      <div class="td-hooks-list">
        ${hooks.map((h, i) => `
          <div class="td-hook-row">
            <span class="td-hook-num">${i+1}</span>
            <div class="td-hook-body">
              <p class="td-hook-text">${h.hook}</p>
              <div class="td-hook-meta">
                <span class="td-hook-type ${typeCls[h.type] || ''}">${h.type}</span>
                <div class="td-hook-ret-wrap">
                  <div class="td-hook-ret-bar" style="width:${h.retention}%"></div>
                  <span class="td-hook-ret-val">${h.retention}% retención</span>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ── Chart.js — Tendencias ─────────────────────────── */
  _initTendenciesCharts() {
    if (!window.Chart) return;
    this._tdChartSentiment();
    this._tdChartVelocity();
    this._tdChartEmergence();
    this._buildOpportunityFeed();
  }

  _tdChartSentiment() {
    const ctx = document.getElementById('tdChartSentiment');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Optimista', 'Nostálgico', 'Humorístico', 'Informativo', 'Ansioso', 'Cínico'],
        datasets: [{
          data: [32, 24, 18, 14, 7, 5],
          backgroundColor: [
            'rgba(34,197,94,0.85)', 'rgba(251,191,36,0.85)', 'rgba(96,165,250,0.85)',
            'rgba(167,139,250,0.75)', 'rgba(249,115,22,0.75)', 'rgba(156,163,175,0.6)',
          ],
          borderColor: 'rgba(0,0,0,0)', hoverOffset: 7,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 9, padding: 9 } },
          tooltip: { callbacks: { label: d => `${d.label}: ${d.raw}%` } },
        },
      },
    }));
  }

  _tdChartVelocity() {
    const ctx = document.getElementById('tdChartVelocity');
    if (!ctx) return;
    const keywords = ['#smoothies', '#journaling', '#mealprepideas', '#cocinaretro', '#asmrcocina', '#sinfgluten', '#vidarapida', '#morningritual'];
    const velocity = [94, 87, 78, 81, 68, 74, 62, 71];
    const growth   = [152,89, 56, 67, 38, 44, 31, 43];
    this._reg(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: keywords,
        datasets: [
          { label: 'Velocidad (score)',   data: velocity, backgroundColor: 'rgba(96,165,250,0.75)', borderRadius: 5, yAxisID: 'y' },
          { label: 'Crecimiento 24h (%)', data: growth,   backgroundColor: 'rgba(251,191,36,0.6)',  borderRadius: 5, yAxisID: 'y2' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10 } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          y:  { position: 'left',  max: 110, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Velocidad' } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `+${v}%` }, title: { display: true, text: 'Crecimiento' } },
          x:  { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      },
    }));
  }

  _tdChartEmergence() {
    const ctx = document.getElementById('tdChartEmergence');
    if (!ctx) return;
    const hours = Array.from({length: 25}, (_, i) => {
      const h = new Date(); h.setHours(h.getHours() - 24 + i, 0, 0, 0);
      return `${String(h.getHours()).padStart(2,'0')}h`;
    });
    const genZ   = [12,14,11,9,8,11,18,28,35,42,38,45,52,48,55,62,58,70,74,68,77,81,76,79,84];
    const retro  = [5,4,6,5,4,5,8,14,19,24,22,27,33,38,42,39,48,55,52,58,61,65,60,62,68];
    const health = [8,9,7,6,5,7,12,20,26,30,28,34,38,35,41,44,40,48,51,47,53,57,52,55,61];
    this._reg(new Chart(ctx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [
          { label: 'Señal "Cocina Retro 90s"',        data: retro,  borderColor: 'rgba(251,191,36,0.9)',  backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 },
          { label: 'Señal "Recetas Salud Mental"',    data: health, borderColor: 'rgba(34,197,94,0.9)',   backgroundColor: 'rgba(34,197,94,0.08)',  borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 },
          { label: 'Señal "Estética Gen Z"',          data: genZ,   borderColor: 'rgba(167,139,250,0.9)', backgroundColor: 'rgba(167,139,250,0.08)',borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Índice de emergencia' } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
        },
      },
    }));
  }

  _buildOpportunityFeed() {
    const el = document.getElementById('tdOpFeed');
    if (!el) return;
    const ops = [
      { status: 'done',    msg: 'Detectada tendencia "Cocina Retro 90s" — Generado set de 4 visuales con estética neon. Alcance estimado: +40%.', time: 'Hace 8 min' },
      { status: 'running', msg: 'Analizando Content Gap "licuadoras para smoothies proteicos" — Redactando guía SEO + script de Reel.', time: 'En curso' },
      { status: 'alert',   msg: 'Ola de calor detectada en Monterrey — Oportunidad de publicación en 2 h. Requiere aprobación.', time: 'Hace 12 min' },
      { status: 'done',    msg: 'Audio "Lo-fi Cocina Mix" en fase exponencial en TikTok — Video generado y programado para las 8pm.', time: 'Hace 31 min' },
    ];
    const statusCls = { done: 'cc-m--done', running: 'cc-m--running', alert: 'cc-m--alert' };
    el.innerHTML = ops.map(o => `
      <div class="cc-mission ${statusCls[o.status]}">
        
        <span class="cc-mission-msg">${o.msg}</span>
        <span class="cc-mission-time">${o.time}</span>
      </div>`).join('');
  }

  _animateTD() {
    document.querySelectorAll('.td-kpi-card').forEach((card, i) => {
      card.style.opacity = '0'; card.style.transform = 'translateY(10px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        card.style.opacity = '1'; card.style.transform = 'none';
      }, i * 60);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     COMPETENCIA v2 — adaptación marketing estratégico desde Partner
  ═══════════════════════════════════════════════════════════ */
  async _renderCompetence(body) {
    // 1. Skeleton inmediato
    body.innerHTML = this._buildCompetenceSkeleton();

    // 2. Cargar dependencias + service
    await Promise.allSettled([
      this._ensureChartJs(),
      this._ensureCompService(),
    ]);

    // 3. Cargar datos
    if (!this._compData && this._compService) {
      this._compData = await this._compService.loadAll(30);
    }
    const d = this._compData;

    // 4. Render
    body.innerHTML = this._buildCompetenceV2HTML(d);
    window._dashboardView = this;
    this._initCompetenceV2Charts(d);
    this._animateKPIs?.();
  }

  async _ensureCompService() {
    if (this._compService) return;
    if (!window.CompetenciaDataService) {
      try {
        await this.loadScript('/js/services/CompetenciaDataService.js', 'CompetenciaDataService', 6000);
      } catch (_) { return; }
    }
    if (!this._supabase || !this._orgId) return;
    try {
      this._compService = await new window.CompetenciaDataService().init(this._supabase, this._orgId);
    } catch (e) {
      console.warn('[DashboardView] CompetenciaDataService init error:', e);
    }
  }

  _buildCompetenceSkeleton() {
    const sk = (n) => Array(n).fill('<div class="mb-skel-block"></div>').join('');
    return `
    <div class="cc-v2-dashboard cc-v2-dashboard--loading">
      <div class="mb-v2-filters">${sk(2)}</div>
      <div class="mb-v2-kpis">${Array(6).fill('<div class="mb-v2-kpi"><div class="mb-skel-block" style="height:64px"></div></div>').join('')}</div>
      <div class="mb-v2-widgets-row">
        <div class="mb-v2-widget" style="min-height:280px">${sk(3)}</div>
        <div class="mb-v2-widget" style="min-height:280px">${sk(3)}</div>
      </div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     ESTRATEGIA — Centro de Comando (tab actualmente deshabilitada)
  ═══════════════════════════════════════════════════════════ */

  async _ensureStratService() {
    if (this._stratService) return;
    if (!window.StrategiaDataService) {
      try { await this.loadScript('/js/services/StrategiaDataService.js', 'StrategiaDataService', 6000); }
      catch (_) { return; }
    }
    if (!this._supabase || !this._orgId) return;
    try {
      this._stratService = await new window.StrategiaDataService().init(this._supabase, this._orgId);
    } catch (e) { console.warn('[DashboardView] StrategiaDataService init error:', e); }
  }

  async _renderStrategy(body) {
    body.innerHTML = `<div class="mb-loading"> Sintetizando señales estratégicas…</div>`;
    this._injectStratCSS();
    await Promise.allSettled([this._ensureChartJs(), this._ensureStratService()]);

    if (!this._stratData) {
      this._stratData = this._stratService ? await this._stratService.loadAll() : null;
    }
    const d = this._stratData;
    body.innerHTML = this._buildStratHTML(d);
    window._stratView = this;
    this._initStratEvents();
    const lu = document.getElementById('stLastUpdate');
    if (lu) lu.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  async _refreshStratData() {
    this._stratData = null;
    const body = document.getElementById('insightTabBody');
    if (body) { this._destroyCharts(); await this._renderStrategy(body); }
  }

  _injectStratCSS() {
    if (document.getElementById('st-dash-css')) return;
    const s = document.createElement('style');
    s.id = 'st-dash-css';
    s.textContent = `
      .st-dashboard{display:flex;flex-direction:column;gap:16px;padding:20px;max-width:100%}
      /* ── Status Bar ── */
      .st-status-bar{display:flex;align-items:center;gap:14px;background:var(--bg-card,#1e2130);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 20px;flex-wrap:wrap}
      .st-status-item{display:flex;flex-direction:column;gap:2px;flex:1;min-width:140px}
      .st-status-item--row{flex-direction:row;align-items:center;gap:10px}
      .st-status-divider{width:1px;height:36px;background:rgba(255,255,255,.08);flex-shrink:0}
      .st-health-num{font-size:30px;font-weight:800;line-height:1}
      .st-health-num.green{color:#22c55e}.st-health-num.yellow{color:#f59e0b}.st-health-num.red{color:#ef4444}
      .st-status-label{font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.5px}
      .st-threat-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px}
      .st-threat-badge.bajo{background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25)}
      .st-threat-badge.medio{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25)}
      .st-threat-badge.alto{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
      .st-threat-badge.critico{background:rgba(239,68,68,.2);color:#ff4444;border:1px solid #ef4444;animation:stPulse 1.4s infinite}
      @keyframes stPulse{0%,100%{opacity:1}50%{opacity:.65}}
      .st-trend-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:20px;font-size:11px;color:#818cf8;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-pending-big{font-size:26px;font-weight:800;color:#f59e0b;line-height:1}
      .st-last-sync{font-size:11px;color:rgba(255,255,255,.4)}
      .st-refresh-btn{padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:rgba(255,255,255,.5);font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
      .st-refresh-btn:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.8)}
      /* ── Briefing ── */
      .st-briefing{background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.65;color:rgba(255,255,255,.75)}
      .st-briefing-label{font-size:10px;font-weight:600;color:#818cf8;letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:5px}
      /* ── Main Layout ── */
      .st-main-layout{display:flex;gap:14px;align-items:flex-start}
      .st-action-plan{flex:0 0 56%;min-width:0}
      .st-context-panel-col{flex:0 0 calc(44% - 14px);min-width:0}
      @media(max-width:1100px){.st-main-layout{flex-direction:column}.st-action-plan,.st-context-panel-col{flex:none;width:100%}}
      /* ── Horizon Tabs ── */
      .st-horizon-tabs{display:flex;gap:0;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.09);margin-bottom:10px;background:rgba(255,255,255,.03)}
      .st-ht{flex:1;padding:7px 10px;border:none;background:none;color:rgba(255,255,255,.45);font-size:11px;font-weight:600;letter-spacing:.3px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .2s;text-transform:uppercase}
      .st-ht-n{background:rgba(255,255,255,.09);color:rgba(255,255,255,.5);border-radius:10px;padding:1px 5px;font-size:10px}
      .st-ht[data-h="hoy"].active{background:rgba(239,68,68,.14);color:#f87171}.st-ht[data-h="hoy"].active .st-ht-n{background:rgba(239,68,68,.18);color:#f87171}
      .st-ht[data-h="semana"].active{background:rgba(245,158,11,.14);color:#fbbf24}.st-ht[data-h="semana"].active .st-ht-n{background:rgba(245,158,11,.18);color:#fbbf24}
      .st-ht[data-h="mes"].active{background:rgba(34,197,94,.14);color:#4ade80}.st-ht[data-h="mes"].active .st-ht-n{background:rgba(34,197,94,.18);color:#4ade80}
      .st-ht[data-h="historial"].active{background:rgba(99,102,241,.14);color:#818cf8}
      /* ── Action Cards ── */
      .st-actions-list{display:flex;flex-direction:column;gap:7px;min-height:200px}
      .st-action-card{background:var(--bg-card,#1e2130);border:1px solid rgba(255,255,255,.07);border-radius:10px;border-left:3px solid transparent;padding:13px 15px;cursor:pointer;transition:all .18s;position:relative}
      .st-action-card:hover{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.025)}
      .st-action-card.selected{border-color:rgba(255,255,255,.2)!important;background:rgba(255,255,255,.04);box-shadow:0 0 0 1px rgba(255,255,255,.08)}
      .st-card--contenido{border-left-color:#3b82f6}.st-card--pauta{border-left-color:#a855f7}
      .st-card--precio{border-left-color:#ef4444}.st-card--tono{border-left-color:#06b6d4}
      .st-card--monitoreo{border-left-color:#f59e0b}.st-card--producto{border-left-color:#22c55e}
      .st-card-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
      .st-score-circle{flex-shrink:0;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:rgba(255,255,255,.7)}
      .st-score-circle.hi{border-color:#22c55e;color:#22c55e;background:rgba(34,197,94,.1)}
      .st-score-circle.md{border-color:#f59e0b;color:#f59e0b;background:rgba(245,158,11,.1)}
      .st-score-circle.lo{border-color:#64748b;color:#94a3b8}
      .st-card-meta{flex:1;min-width:0}
      .st-card-title{font-size:13px;font-weight:600;color:rgba(255,255,255,.9);line-height:1.4;margin-bottom:5px}
      .st-card-badges{display:flex;gap:4px;flex-wrap:wrap}
      .st-b{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.2px;text-transform:uppercase}
      .st-b--contenido{background:rgba(59,130,246,.14);color:#60a5fa}.st-b--pauta{background:rgba(168,85,247,.14);color:#c084fc}
      .st-b--precio{background:rgba(239,68,68,.14);color:#f87171}.st-b--tono{background:rgba(6,182,212,.14);color:#22d3ee}
      .st-b--monitoreo{background:rgba(245,158,11,.14);color:#fbbf24}.st-b--producto{background:rgba(34,197,94,.14);color:#4ade80}
      .st-b--hoy{background:rgba(239,68,68,.12);color:#f87171}.st-b--semana{background:rgba(245,158,11,.12);color:#fbbf24}.st-b--mes{background:rgba(34,197,94,.12);color:#4ade80}
      .st-b--auto{background:rgba(34,197,94,.1);color:#4ade80}.st-b--approve{background:rgba(245,158,11,.1);color:#fbbf24}.st-b--alto{background:rgba(239,68,68,.1);color:#f87171}
      .st-card-reason{font-size:12px;color:rgba(255,255,255,.5);line-height:1.5;margin-bottom:9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .st-card-btns{display:flex;gap:5px;align-items:center}
      .st-btn{padding:5px 11px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all .14s}
      .st-btn--ap{background:rgba(34,197,94,.14);color:#22c55e;border:1px solid rgba(34,197,94,.28)}.st-btn--ap:hover{background:rgba(34,197,94,.24)}
      .st-btn--mo{background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.25)}.st-btn--mo:hover{background:rgba(245,158,11,.2)}
      .st-btn--re{background:rgba(255,255,255,.04);color:rgba(255,255,255,.38);border:1px solid rgba(255,255,255,.09)}.st-btn--re:hover{background:rgba(239,68,68,.1);color:#f87171;border-color:rgba(239,68,68,.3)}
      .st-btn:disabled,.st-btn-loading{opacity:.55;pointer-events:none}
      .st-empty-state{text-align:center;padding:40px 20px;color:rgba(255,255,255,.3);font-size:13px}
      .st-empty-state i{font-size:32px;margin-bottom:10px;display:block;opacity:.35}
      /* ── Context Panel ── */
      .st-ctx{background:var(--bg-card,#1e2130);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px;min-height:320px;position:sticky;top:16px}
      .st-ctx-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;color:rgba(255,255,255,.22);gap:10px;text-align:center}
      .st-ctx-empty i{font-size:38px;opacity:.25}
      .st-ctx-empty p{font-size:12px;max-width:180px;line-height:1.5}
      .st-ctx-title{font-size:14px;font-weight:700;color:rgba(255,255,255,.9);margin-bottom:10px;line-height:1.4}
      .st-ctx-score-row{display:flex;gap:10px;align-items:center;margin-bottom:14px}
      .st-ctx-score-pill{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;border:2px solid rgba(255,255,255,.15);flex-shrink:0}
      .st-ctx-label{font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px}
      .st-ctx-sec{margin-bottom:13px}
      .st-ctx-sec-title{font-size:10px;font-weight:600;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px}
      .st-ctx-reasoning{font-size:12px;line-height:1.65;color:rgba(255,255,255,.7);background:rgba(99,102,241,.06);padding:10px 12px;border-radius:8px;border-left:2px solid rgba(99,102,241,.35)}
      .st-ctx-signal{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;background:rgba(255,255,255,.03);border-radius:7px;margin-bottom:5px}
      .st-ctx-stype{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:8px;background:rgba(99,102,241,.14);color:#818cf8;flex-shrink:0;letter-spacing:.3px}
      .st-ctx-stext{font-size:11px;color:rgba(255,255,255,.6);line-height:1.45}
      .st-ctx-payload{background:rgba(0,0,0,.25);border-radius:7px;padding:9px 11px;font-size:10px;color:rgba(255,255,255,.55);font-family:var(--font-mono,monospace);max-height:90px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
      .st-ctx-impact{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px}
      .st-ctx-impact-item{background:rgba(255,255,255,.05);border-radius:6px;padding:4px 9px;font-size:11px;color:rgba(255,255,255,.55)}
      .st-ctx-impact-val{font-weight:700;color:#22c55e}
      .st-ctx-btns{display:flex;gap:7px;margin-top:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,.07)}
      .st-ctx-btns .st-btn{flex:1;justify-content:center;font-size:11px;padding:7px}
      /* ── Calendar ── */
      .st-cal-wrap{background:var(--bg-card,#1e2130);border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden}
      .st-cal-hdr{display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;user-select:none}
      .st-cal-hdr-title{font-size:13px;font-weight:600;color:rgba(255,255,255,.8);display:flex;align-items:center;gap:8px}
      .st-cal-toggle{font-size:11px;color:rgba(255,255,255,.4)}
      .st-cal-body{padding:14px 16px}
      .st-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
      .st-cal-day{border-radius:8px;border:1px solid rgba(255,255,255,.07);padding:7px 5px;min-height:68px}
      .st-cal-day.optimal{border-color:rgba(99,102,241,.35);background:rgba(99,102,241,.04)}
      .st-cal-dname{font-size:9px;color:rgba(255,255,255,.3);text-align:center;text-transform:uppercase;margin-bottom:3px}
      .st-cal-dnum{font-size:13px;font-weight:600;text-align:center;color:rgba(255,255,255,.65);margin-bottom:4px}
      .st-cal-dnum.today{color:#818cf8}
      .st-cal-slot{font-size:9px;padding:2px 3px;border-radius:3px;margin-bottom:2px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-cal-slot.approved{background:rgba(34,197,94,.18);color:#4ade80}
      .st-cal-slot.pending{background:rgba(245,158,11,.16);color:#fbbf24}
      .st-cal-slot.scheduled{background:rgba(59,130,246,.14);color:#60a5fa}
      /* ── History ── */
      .st-hist-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}
      .st-hist-row:last-child{border-bottom:none}
      .st-hist-dot{flex-shrink:0;width:7px;height:7px;border-radius:50%}
      .st-hist-dot.executed,.st-hist-dot.approved{background:#22c55e}
      .st-hist-dot.executing{background:#f59e0b;animation:stPulse 1s infinite}
      .st-hist-dot.failed{background:#ef4444}.st-hist-dot.rejected{background:#475569}
      .st-hist-text{flex:1;font-size:12px;color:rgba(255,255,255,.65);line-height:1.4}
      .st-hist-sub{font-size:10px;color:rgba(255,255,255,.32)}
      .st-hist-time{font-size:10px;color:rgba(255,255,255,.3);flex-shrink:0}
      .st-hist-empty{text-align:center;padding:28px;color:rgba(255,255,255,.28);font-size:12px}
    `;
    document.head.appendChild(s);
  }

  /* ── HTML principal ──────────────────────────────────────── */
  _buildStratHTML(d) {
    const status  = d?.statusBar?.data  || {};
    const actions = d?.actions?.data    || { hoy: [], semana: [], mes: [] };
    const cal     = d?.calendar?.data   || {};
    const hist    = d?.history?.data    || [];
    const noData  = !d;

    return `
    <div class="st-dashboard" id="stDashboard">

      ${this._buildStratStatusBar(status, noData)}

      ${status.briefing ? `
      <div class="st-briefing">
        <div class="st-briefing-label"> Briefing del Día — VERA</div>
        ${this._esc(status.briefing)}
      </div>` : ''}

      <div class="st-main-layout">

        <!-- Zona 2: Plan de Acción -->
        <div class="st-action-plan">
          <div class="st-horizon-tabs" id="stHorizonTabs">
            <button class="st-ht active" data-h="hoy">HOY <span class="st-ht-n">${actions.hoy?.length || 0}</span></button>
            <button class="st-ht" data-h="semana">SEMANA <span class="st-ht-n">${actions.semana?.length || 0}</span></button>
            <button class="st-ht" data-h="mes">MES <span class="st-ht-n">${actions.mes?.length || 0}</span></button>
            <button class="st-ht" data-h="historial"> Historial</button>
          </div>
          <div id="stActionsList">
            ${this._buildStratActionsList(actions.hoy || [], 'hoy', noData)}
          </div>
        </div>

        <!-- Zona 3: Panel de Contexto -->
        <div class="st-context-panel-col">
          <div class="st-ctx" id="stCtxPanel">
            ${this._buildStratCtxEmpty()}
          </div>
        </div>

      </div>

      <!-- Zona 4: Calendario Editorial -->
      ${this._buildStratCalendar(cal)}

      <div class="mb-demo-note">
        
        <span>Síntesis VERA: <strong id="stLastUpdate">—</strong> ·
        <button class="st-refresh-btn" onclick="window._stratView?._refreshStratData()"> Actualizar</button></span>
      </div>

    </div>`;
  }

  /* ── Zona 1: Status Bar ──────────────────────────────────── */
  _buildStratStatusBar(s, noData) {
    const score       = s.healthScore ?? 0;
    const scoreColor  = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
    const threat      = s.threatLevel || 'bajo';
    const threatLabels = { bajo: 'Amenaza Baja', medio: 'Amenaza Media', alto: 'Amenaza Alta', critico: '¡CRÍTICO!' };
    const trend       = s.topTrend;
    const syncText    = s.lastSynthesis
      ? `Síntesis hace ${this._stratTimeAgo(s.lastSynthesis)}`
      : 'Sin síntesis reciente';

    return `
    <div class="st-status-bar">
      <div class="st-status-item">
        <span class="st-health-num ${scoreColor}">${noData ? '—' : score}</span>
        <span class="st-status-label">Score de Salud</span>
      </div>

      <div class="st-status-divider"></div>

      <div class="st-status-item" title="${this._esc(s.threatTooltip || '')}">
        <span class="st-threat-badge ${threat}">
          
          ${threatLabels[threat] || 'Bajo'}
        </span>
        <span class="st-status-label">Amenaza Competitiva</span>
      </div>

      <div class="st-status-divider"></div>

      <div class="st-status-item">
        ${trend
          ? `<span class="st-trend-chip"> ${this._esc(trend.keyword)}</span>`
          : `<span class="st-trend-chip" style="opacity:.4"> Sin señal activa</span>`}
        <span class="st-status-label">Tendencia urgente</span>
      </div>

      <div class="st-status-divider"></div>

      <div class="st-status-item">
        <span class="st-pending-big">${noData ? '—' : (s.pendingCount || 0)}</span>
        <span class="st-status-label">Acciones pendientes</span>
      </div>

      <div class="st-status-divider"></div>

      <div class="st-status-item">
        <span class="st-last-sync">${syncText}</span>
        <span class="st-status-label">Última síntesis</span>
      </div>
    </div>`;
  }

  /* ── Lista de Action Cards ───────────────────────────────── */
  _buildStratActionsList(actions, horizon, noData) {
    if (noData) return `<div class="st-empty-state"> Conectando con OpenClaw…</div>`;
    if (!actions || actions.length === 0) return `
      <div class="st-empty-state">
        
        Sin acciones pendientes para este horizonte.<br>
        <span style="font-size:11px;opacity:.6">VERA sintetizará nuevas oportunidades cuando lleguen señales.</span>
      </div>`;
    return `<div class="st-actions-list">${actions.map(a => this._buildStratActionCard(a, horizon)).join('')}</div>`;
  }

  _buildStratActionCard(action, horizon) {
    const cat      = this._stratCategory(action.action_type);
    const risk     = this._stratRisk(action.action_type);
    const score    = Math.round((action.vera_confidence || 0) * 100);
    const scoreC   = score >= 70 ? 'hi' : score >= 40 ? 'md' : 'lo';
    const title    = this._stratTitle(action);
    const isAuto   = risk === 'auto';

    const horizonBadge = `<span class="st-b st-b--${horizon}">${horizon.toUpperCase()}</span>`;
    const typeBadge    = `<span class="st-b st-b--${cat}">${cat.toUpperCase()}</span>`;
    const riskBadge    = isAuto
      ? `<span class="st-b st-b--auto"> AUTO</span>`
      : `<span class="st-b st-b--approve"> APROBAR</span>`;

    const reasoning = action.vera_reasoning
      ? this._esc(action.vera_reasoning.slice(0, 160) + (action.vera_reasoning.length > 160 ? '…' : ''))
      : `<em style="opacity:.5">Sin razonamiento disponible.</em>`;

    return `
    <div class="st-action-card st-card--${cat}" data-action-id="${action.id}" id="stCard-${action.id}">
      <div class="st-card-top">
        <div class="st-score-circle ${scoreC}">${score}</div>
        <div class="st-card-meta">
          <div class="st-card-title">${this._esc(title)}</div>
          <div class="st-card-badges">
            ${horizonBadge}${typeBadge}${riskBadge}
          </div>
        </div>
      </div>
      <div class="st-card-reason">${reasoning}</div>
      <div class="st-card-btns">
        <button class="st-btn st-btn--ap" data-action="approve" data-id="${action.id}">
           Aprobar
        </button>
        <button class="st-btn st-btn--mo" data-action="modify" data-id="${action.id}">
           Modificar
        </button>
        <button class="st-btn st-btn--re" data-action="reject" data-id="${action.id}">
          
        </button>
      </div>
    </div>`;
  }

  /* ── Zona 3: Panel de Contexto ───────────────────────────── */
  _buildStratCtxEmpty() {
    return `
    <div class="st-ctx-empty">
      
      <p>Selecciona una acción del plan para ver el expediente completo</p>
    </div>`;
  }

  _buildStratCtxContent(detail) {
    if (!detail) return this._buildStratCtxEmpty();
    const { action, signal } = detail;
    const cat      = this._stratCategory(action.action_type);
    const score    = Math.round((action.vera_confidence || 0) * 100);
    const scoreC   = score >= 70 ? 'hi' : score >= 40 ? 'md' : 'lo';
    const scoreClr = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#94a3b8';
    const impact   = action.impact_estimate || {};
    const payload  = action.proposed_payload
      ? JSON.stringify(action.proposed_payload, null, 2)
      : null;
    const risk = this._stratRisk(action.action_type);

    const impactItems = [
      impact.reach_uplift_pct   ? `<div class="st-ctx-impact-item">Alcance <span class="st-ctx-impact-val">+${impact.reach_uplift_pct}%</span></div>` : '',
      impact.engagement_uplift_pct ? `<div class="st-ctx-impact-item">Engagement <span class="st-ctx-impact-val">+${impact.engagement_uplift_pct}%</span></div>` : '',
      impact.risk_level ? `<div class="st-ctx-impact-item">Riesgo: <span style="color:#fbbf24">${this._esc(impact.risk_level)}</span></div>` : '',
      impact.time_to_see_results ? `<div class="st-ctx-impact-item">Resultado en <span style="color:rgba(255,255,255,.7)">${this._esc(impact.time_to_see_results)}</span></div>` : '',
    ].filter(Boolean).join('');

    return `
    <div class="st-ctx-header">
      <div class="st-ctx-title">${this._esc(this._stratTitle(action))}</div>
      <div class="st-ctx-score-row">
        <div class="st-ctx-score-pill ${scoreC}" style="border-color:${scoreClr};color:${scoreClr};background:${scoreClr}18">
          ${score}
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,.7)">Score de Oportunidad</div>
          <div class="st-ctx-label">
            <span class="st-b st-b--${cat}">${cat.toUpperCase()}</span> &nbsp;
            ${risk === 'auto' ? `<span class="st-b st-b--auto"> AUTO</span>` : `<span class="st-b st-b--approve"> APPROVE</span>`}
          </div>
        </div>
      </div>
    </div>

    ${action.vera_reasoning ? `
    <div class="st-ctx-sec">
      <div class="st-ctx-sec-title"> Razonamiento VERA</div>
      <div class="st-ctx-reasoning">${this._esc(action.vera_reasoning)}</div>
    </div>` : ''}

    ${signal ? `
    <div class="st-ctx-sec">
      <div class="st-ctx-sec-title"> Señal que la disparó</div>
      <div class="st-ctx-signal">
        <span class="st-ctx-stype">${this._esc(signal.signal_type || '')}</span>
        <span class="st-ctx-stext">${this._esc((signal.content_text || '').slice(0, 120))}
          ${signal.captured_at ? `<br><span style="opacity:.5;font-size:10px">${this._stratTimeAgo(signal.captured_at)}</span>` : ''}</span>
      </div>
    </div>` : ''}

    ${payload ? `
    <div class="st-ctx-sec">
      <div class="st-ctx-sec-title"> Preview de Ejecución</div>
      <div class="st-ctx-payload">${this._esc(payload)}</div>
    </div>` : ''}

    ${impactItems ? `
    <div class="st-ctx-sec">
      <div class="st-ctx-sec-title"> Impacto Estimado</div>
      <div class="st-ctx-impact">${impactItems}</div>
    </div>` : ''}

    <div class="st-ctx-btns">
      <button class="st-btn st-btn--ap" data-action="approve" data-id="${action.id}">
         Aprobar
      </button>
      <button class="st-btn st-btn--mo" data-action="modify" data-id="${action.id}">
         Modificar
      </button>
      <button class="st-btn st-btn--re" data-action="reject" data-id="${action.id}">
         Rechazar
      </button>
    </div>`;
  }

  /* ── Zona 4: Calendario Editorial ───────────────────────── */
  _buildStratCalendar(cal) {
    const schedules  = cal.schedules  || [];
    const heatmap    = cal.heatmap    || [];
    const veraSlots  = cal.veraSlots  || [];
    const bestDays   = new Set(heatmap.map(h => h.best_day).filter(d => d != null));

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const today    = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });

    const calCells = days.map(d => {
      const dateStr = d.toISOString().slice(0, 10);
      const isToday = dateStr === todayStr;
      const dayOfWeek = d.getDay();
      const isOptimal = bestDays.has(dayOfWeek);

      const dayScheds = schedules.filter(s => s.next_run_at && s.next_run_at.slice(0, 10) === dateStr);
      const dayVera   = veraSlots.filter(v => v.expires_at && v.expires_at.slice(0, 10) === dateStr);

      const slots = [
        ...dayScheds.map(() => `<div class="st-cal-slot scheduled"> Prog.</div>`),
        ...dayVera.map(v => `<div class="st-cal-slot pending"> VERA</div>`),
      ].slice(0, 3).join('');

      return `
      <div class="st-cal-day ${isOptimal ? 'optimal' : ''}">
        <div class="st-cal-dname">${dayNames[dayOfWeek]}</div>
        <div class="st-cal-dnum ${isToday ? 'today' : ''}">${d.getDate()}</div>
        ${slots || `<div class="st-cal-slot" style="opacity:.3;font-size:9px;text-align:center">—</div>`}
      </div>`;
    }).join('');

    return `
    <div class="st-cal-wrap" id="stCalWrap">
      <div class="st-cal-hdr" id="stCalHdr">
        <span class="st-cal-hdr-title">
           Calendario Editorial — Próximos 7 días
          ${bestDays.size > 0 ? `<span class="st-b" style="background:rgba(99,102,241,.12);color:#818cf8">Días óptimos marcados</span>` : ''}
        </span>
        <span class="st-cal-toggle" id="stCalToggle"></span>
      </div>
      <div class="st-cal-body" id="stCalBody">
        <div class="st-cal-grid">${calCells}</div>
        ${schedules.length === 0 && veraSlots.length === 0 ? `
        <p style="text-align:center;font-size:12px;color:rgba(255,255,255,.3);margin-top:10px;padding-bottom:4px">
          Sin programaciones activas esta semana.
        </p>` : ''}
      </div>
    </div>`;
  }

  /* ── Zona 5: Historial de Misiones ───────────────────────── */
  _buildStratHistory(hist) {
    if (!hist || hist.length === 0) return `<div class="st-hist-empty">Sin historial de misiones aún.</div>`;

    const catIcons = { contenido: '✍️', pauta: '📢', precio: '💲', tono: '🎙️', monitoreo: '📡', producto: '📦' };
    const rows = hist.map(a => {
      const cat   = this._stratCategory(a.action_type);
      const title = this._stratTitle(a);
      const ts    = a.executed_at || a.approved_at || a.rejected_at || a.created_at;
      const errTip = a.error_message ? ` title="${this._esc(a.error_message)}"` : '';
      return `
      <div class="st-hist-row"${errTip}>
        <div class="st-hist-dot ${a.status}"></div>
        <div style="flex:1;min-width:0">
          <div class="st-hist-text">${catIcons[cat] || '⚡'} ${this._esc(title)}</div>
          <div class="st-hist-sub">
            <span class="st-b st-b--${cat}" style="font-size:9px">${cat.toUpperCase()}</span>
            ${a.rejection_reason ? ` · ${this._esc(a.rejection_reason.slice(0, 40))}` : ''}
          </div>
        </div>
        <div class="st-hist-time">${ts ? this._stratTimeAgo(ts) : '—'}</div>
      </div>`;
    }).join('');

    return `<div class="st-history-wrap">${rows}</div>`;
  }

  /* ── Event handlers ──────────────────────────────────────── */
  _initStratEvents() {
    // Horizon tabs
    const tabs = document.getElementById('stHorizonTabs');
    if (tabs) {
      tabs.addEventListener('click', e => {
        const btn = e.target.closest('[data-h]');
        if (!btn) return;
        this._stratSwitchHorizon(btn.dataset.h);
      });
    }

    // Action list (event delegation)
    const list = document.getElementById('stActionsList');
    if (list) {
      list.addEventListener('click', e => {
        const approveBtn = e.target.closest('[data-action="approve"]');
        const modifyBtn  = e.target.closest('[data-action="modify"]');
        const rejectBtn  = e.target.closest('[data-action="reject"]');
        const card       = e.target.closest('[data-action-id]');

        if (approveBtn) { e.stopPropagation(); this._stratApprove(approveBtn.dataset.id); return; }
        if (modifyBtn)  { e.stopPropagation(); this._stratModify(modifyBtn.dataset.id);   return; }
        if (rejectBtn)  { e.stopPropagation(); this._stratReject(rejectBtn.dataset.id);   return; }
        if (card) this._stratSelectAction(card.dataset.actionId);
      });
    }

    // Context panel buttons (delegation)
    const ctx = document.getElementById('stCtxPanel');
    if (ctx) {
      ctx.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'approve') this._stratApprove(btn.dataset.id);
        if (btn.dataset.action === 'modify')  this._stratModify(btn.dataset.id);
        if (btn.dataset.action === 'reject')  this._stratReject(btn.dataset.id);
      });
    }

    // Calendar toggle
    const calHdr = document.getElementById('stCalHdr');
    if (calHdr) {
      calHdr.addEventListener('click', () => {
        const body   = document.getElementById('stCalBody');
        const toggle = document.getElementById('stCalToggle');
        if (!body) return;
        const collapsed = body.style.display === 'none';
        body.style.display   = collapsed ? '' : 'none';
        if (toggle) toggle.innerHTML = collapsed ? '' : '';
      });
    }
  }

  _stratSwitchHorizon(horizon) {
    this._stratHorizon = horizon;

    // Update tab active state
    document.querySelectorAll('.st-ht').forEach(t => {
      t.classList.toggle('active', t.dataset.h === horizon);
    });

    const list    = document.getElementById('stActionsList');
    if (!list) return;
    const actions = this._stratData?.actions?.data || { hoy: [], semana: [], mes: [] };
    const hist    = this._stratData?.history?.data  || [];

    if (horizon === 'historial') {
      list.innerHTML = this._buildStratHistory(hist);
    } else {
      list.innerHTML = this._buildStratActionsList(actions[horizon] || [], horizon, !this._stratData);

      // Re-attach click delegation after re-render
      list.addEventListener('click', e => {
        const approveBtn = e.target.closest('[data-action="approve"]');
        const modifyBtn  = e.target.closest('[data-action="modify"]');
        const rejectBtn  = e.target.closest('[data-action="reject"]');
        const card       = e.target.closest('[data-action-id]');
        if (approveBtn) { e.stopPropagation(); this._stratApprove(approveBtn.dataset.id); return; }
        if (modifyBtn)  { e.stopPropagation(); this._stratModify(modifyBtn.dataset.id);   return; }
        if (rejectBtn)  { e.stopPropagation(); this._stratReject(rejectBtn.dataset.id);   return; }
        if (card) this._stratSelectAction(card.dataset.actionId);
      }, { once: true });
    }
  }

  async _stratSelectAction(actionId) {
    // Highlight selected card
    document.querySelectorAll('.st-action-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.actionId === actionId);
    });
    this._stratSelected = actionId;

    const ctx = document.getElementById('stCtxPanel');
    if (!ctx) return;
    ctx.innerHTML = `<div class="st-ctx-empty"></div>`;

    if (this._stratService) {
      const result = await this._stratService.loadActionDetail(actionId);
      ctx.innerHTML = result.error ? this._buildStratCtxEmpty() : this._buildStratCtxContent(result.data);
    } else {
      // Fallback: use cached data
      const all  = this._stratData?.actions?.data;
      const flat = [...(all?.hoy || []), ...(all?.semana || []), ...(all?.mes || [])];
      const a    = flat.find(x => x.id === actionId);
      ctx.innerHTML = a ? this._buildStratCtxContent({ action: a, signal: null }) : this._buildStratCtxEmpty();
    }
  }

  async _stratApprove(actionId) {
    const btns = document.querySelectorAll(`[data-action="approve"][data-id="${actionId}"]`);
    btns.forEach(b => { b.disabled = true; b.innerHTML = ''; });

    if (this._stratService) {
      const r = await this._stratService.approveAction(actionId);
      if (r.error) {
        btns.forEach(b => { b.disabled = false; b.innerHTML = ' Aprobar'; });
        return;
      }
    }

    // Optimistic: remove card, update count, refresh history
    const card = document.getElementById(`stCard-${actionId}`);
    if (card) {
      card.style.transition = 'opacity .3s, transform .3s';
      card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
      setTimeout(() => card.remove(), 300);
    }
    // Update pending count in status bar
    const pc = document.querySelector('.st-pending-big');
    if (pc && !isNaN(parseInt(pc.textContent))) pc.textContent = Math.max(0, parseInt(pc.textContent) - 1);
    // Invalidate cache
    if (this._stratData?.actions?.data) {
      for (const key of ['hoy', 'semana', 'mes']) {
        if (this._stratData.actions.data[key]) {
          this._stratData.actions.data[key] = this._stratData.actions.data[key].filter(a => a.id !== actionId);
        }
      }
    }
    // Clear context panel if this was the selected action
    if (this._stratSelected === actionId) {
      const ctx = document.getElementById('stCtxPanel');
      if (ctx) ctx.innerHTML = this._buildStratCtxEmpty();
      this._stratSelected = null;
    }
  }

  async _stratReject(actionId) {
    const reason = window.prompt('Motivo de rechazo (opcional):') ?? '';
    const btns   = document.querySelectorAll(`[data-action="reject"][data-id="${actionId}"]`);
    btns.forEach(b => { b.disabled = true; });

    if (this._stratService) {
      await this._stratService.rejectAction(actionId, reason);
    }

    const card = document.getElementById(`stCard-${actionId}`);
    if (card) {
      card.style.transition = 'opacity .3s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
    }
    if (this._stratData?.actions?.data) {
      for (const key of ['hoy', 'semana', 'mes']) {
        if (this._stratData.actions.data[key]) {
          this._stratData.actions.data[key] = this._stratData.actions.data[key].filter(a => a.id !== actionId);
        }
      }
    }
    if (this._stratSelected === actionId) {
      const ctx = document.getElementById('stCtxPanel');
      if (ctx) ctx.innerHTML = this._buildStratCtxEmpty();
      this._stratSelected = null;
    }
  }

  _stratModify(actionId) {
    // Seleccionar la acción para ver el payload en el panel de contexto
    this._stratSelectAction(actionId);
    // Notificar al usuario que debe aprobar tras revisar
    setTimeout(() => {
      const ctx = document.getElementById('stCtxPanel');
      if (!ctx) return;
      const note = document.createElement('div');
      note.style.cssText = 'margin:8px 0;padding:8px 12px;background:rgba(245,158,11,.1);border-radius:7px;font-size:11px;color:#fbbf24;border:1px solid rgba(245,158,11,.25)';
      note.textContent = '✏️ Revisa el payload en "Preview de Ejecución" y aprueba cuando estés listo.';
      ctx.insertBefore(note, ctx.firstChild);
    }, 400);
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  _stratCategory(actionType) {
    const map = {
      publish_instagram_post: 'contenido', publish_facebook_post: 'contenido',
      schedule_instagram_post: 'contenido', schedule_facebook_post: 'contenido',
      create_brief: 'contenido', update_brief: 'contenido', archive_brief: 'contenido',
      create_schedule: 'contenido', update_schedule: 'contenido',
      activate_schedule: 'contenido', pause_schedule: 'contenido',
      launch_campaign: 'pauta', create_campaign: 'pauta', update_campaign: 'pauta',
      pause_campaign: 'pauta', archive_campaign: 'pauta',
      link_brief_to_campaign: 'pauta', unlink_brief_from_campaign: 'pauta',
      update_brand_container: 'tono', create_brand_rule: 'tono', update_brand_rule: 'tono',
      delete_brand_rule: 'tono', create_brand_color: 'tono', update_brand_color: 'tono',
      delete_brand_color: 'tono', create_brand_font: 'tono', update_brand_font: 'tono',
      delete_brand_font: 'tono',
      add_intelligence_entity: 'monitoreo', remove_intelligence_entity: 'monitoreo',
      add_url_watcher: 'monitoreo', remove_url_watcher: 'monitoreo',
      update_monitoring_trigger: 'monitoreo', add_brand_integration: 'monitoreo',
      remove_brand_integration: 'monitoreo',
      create_product: 'producto', update_product: 'producto', delete_product: 'producto',
      create_service: 'producto', update_service: 'producto', delete_service: 'producto',
      create_persona: 'producto', update_persona: 'producto', archive_persona: 'producto',
      delete_persona: 'producto', merge_personas: 'producto',
      create_segment: 'producto', update_segment: 'producto', delete_segment: 'producto',
      create_audience: 'producto', update_audience: 'producto', delete_audience: 'producto',
      merge_audiences: 'producto', archive_audience: 'producto',
    };
    return map[actionType] || 'contenido';
  }

  _stratRisk(actionType) {
    const auto = [
      'publish_instagram_post', 'publish_facebook_post',
      'schedule_instagram_post', 'schedule_facebook_post',
      'add_intelligence_entity', 'add_url_watcher', 'update_monitoring_trigger',
      'activate_schedule', 'pause_schedule', 'update_brand_rule',
    ];
    const high = [
      'launch_campaign', 'create_campaign', 'update_campaign', 'pause_campaign',
      'create_product', 'update_product', 'delete_product', 'delete_persona',
      'delete_segment', 'add_brand_integration', 'remove_brand_integration',
    ];
    if (auto.includes(actionType)) return 'auto';
    if (high.includes(actionType)) return 'alto';
    return 'approve';
  }

  _stratTitle(action) {
    const titles = {
      publish_instagram_post:   'Publicar en Instagram',
      publish_facebook_post:    'Publicar en Facebook',
      schedule_instagram_post:  'Programar publicación en Instagram',
      schedule_facebook_post:   'Programar publicación en Facebook',
      create_brief:             'Crear Brief de Campaña',
      update_brief:             'Actualizar Brief Activo',
      launch_campaign:          'Lanzar Campaña',
      create_campaign:          'Crear Nueva Campaña',
      update_campaign:          'Ajustar Campaña Activa',
      pause_campaign:           'Pausar Campaña',
      update_brand_container:   'Actualizar ADN de Marca',
      create_brand_rule:        'Agregar Regla de Marca',
      update_brand_rule:        'Ajustar Regla de Tono',
      add_intelligence_entity:  'Agregar Entidad al Radar',
      add_url_watcher:          'Activar Watcher de URL',
      update_monitoring_trigger:'Ajustar Trigger de Monitoreo',
      create_product:           'Registrar Nuevo Producto',
      update_product:           'Actualizar Producto',
      create_service:           'Registrar Nuevo Servicio',
      create_persona:           'Crear Buyer Persona',
      update_persona:           'Actualizar Persona',
      create_segment:           'Crear Segmento de Audiencia',
      create_schedule:          'Programar Flujo Automático',
      activate_schedule:        'Activar Programación',
    };
    if (titles[action.action_type]) return titles[action.action_type];
    if (action.vera_reasoning) {
      const first = action.vera_reasoning.split('.')[0].trim();
      if (first.length > 10 && first.length < 90) return first;
    }
    return (action.action_type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  _stratTimeAgo(isoString) {
    if (!isoString) return '—';
    const diff = Date.now() - new Date(isoString).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'hace un momento';
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    return `hace ${d}d`;
  }

  /* ── _esc ─────────────────────────────────────────────────── */
  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  /* ════════════════════════════════════════════════════════════
     MI MARCA V3 — Partner-style: filtros + 6 KPIs + 6 highlights
     + análisis longitudinal + arquitectura estrategia + top + vs.
     Datos vienen de RPCs dashboard_brand_* + dashboard_estrategia_*.
     ════════════════════════════════════════════════════════════ */
  _buildMyBrandsV2HTML(d) {
    const containers = d?.containers || [];
    const kpis       = d?.kpis?.data || {};
    const f          = this._mbFilters || { brandId: '', windowDays: 30 };

    const fmt = (n) => {
      if (n == null) return '—';
      const v = Number(n);
      if (!isFinite(v)) return '—';
      if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
      if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
      return String(Math.round(v * 100) / 100);
    };

    const brandOptions = [
      `<option value="">Todas las marcas</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}"${c.id === f.brandId ? ' selected' : ''}>${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    const dateOptions = [7, 30, 90].map(v =>
      `<option value="${v}"${v === f.windowDays ? ' selected' : ''}>Últimos ${v} días</option>`
    ).join('');

    // ── KPI strip (kpis_strip) ───────────────────────────────
    const sentDist  = kpis.sentiment_distribution || {};
    const platDist  = kpis.platform_distribution  || {};
    const engBreak  = kpis.engagement_breakdown   || {};

    const kpiStrip = `
      ${this._kpiMin({ icon: 'fa-bullseye', value: String(kpis.active_brands ?? containers.length ?? 0), label: 'Marcas activas',
        meta: containers.length ? `${containers.length} en cuenta` : '' })}
      ${this._kpiMin({ icon: 'fa-image', value: String(kpis.total_publications ?? 0), label: 'Publicaciones',
        meta: kpis.posts_last_7d != null ? `${kpis.posts_last_7d} en 7d` : '' })}
      ${this._kpiMin({ icon: 'fa-heart', value: fmt(kpis.total_engagement), label: 'Engagement',
        meta: kpis.avg_engagement_per_post ? `avg ${fmt(kpis.avg_engagement_per_post)}/post` : '' })}
      ${this._kpiMin({
        icon: kpis.dominant_sentiment === 'positive' ? 'fa-face-smile'
              : kpis.dominant_sentiment === 'negative' ? 'fa-face-frown' : 'fa-face-meh',
        value: this._capCase(kpis.dominant_sentiment) || '—',
        label: 'Sentimiento',
        meta: `${sentDist.positive || 0} pos · ${sentDist.negative || 0} neg`,
        tone: kpis.dominant_sentiment === 'positive' ? 'positive' : kpis.dominant_sentiment === 'negative' ? 'negative' : null,
      })}
      ${this._kpiMin({ icon: 'fa-signal',
        value: kpis.dominant_platform ? this._capCase(kpis.dominant_platform) : '—',
        label: 'Plataforma',
        meta: Object.keys(platDist).length > 1 ? `${Object.keys(platDist).length} redes` : '' })}
      ${this._kpiMin({ icon: 'fa-hashtag',
        value: kpis.dominant_hashtag
          ? '#' + this._esc(kpis.dominant_hashtag).slice(0, 14)
          : (kpis.dominant_topic ? this._esc(kpis.dominant_topic).slice(0, 16) : '—'),
        label: 'Tema dominante',
        meta: engBreak.likes ? `${fmt(engBreak.likes)} likes` : '' })}
    `;

    // ── 6 highlights (featured_*) ───────────────────────────
    const fe = d?.featured || {};
    const fp = (fe.profile?.data  || [])[0];
    const ft = (fe.topic?.data    || [])[0];
    const fh = (fe.hashtag?.data  || [])[0];
    const fhr = (fe.hour?.data    || [])[0];
    const fpl = (fe.platform?.data || [])[0];
    const fg = (fe.growth?.data   || [])[0];

    const highlight = (label, value, desc) => `
      <article class="mb-v3-highlight">
        <div class="mb-v3-highlight-label">${this._esc(label)}</div>
        <div class="mb-v3-highlight-value">${this._esc(value || '—')}</div>
        <div class="mb-v3-highlight-desc">${this._esc(desc || '')}</div>
      </article>`;

    const highlights = `
      ${highlight('Marca destacada', fp?.brand_name,
        fp ? `${fmt(fp.total_engagement)} eng · ${Math.round(fp.score || 0)}/100` : 'Sin datos')}
      ${highlight('Tema más usado', ft?.topic,
        ft ? `${ft.usage_count} menciones · ${fmt(ft.total_engagement)} eng` : 'Sin datos')}
      ${highlight('Hashtag dominante', fh?.hashtag ? '#' + fh.hashtag : '',
        fh ? `${fh.usage_count} usos · ${fmt(fh.total_engagement)} eng` : 'Sin datos')}
      ${highlight('Hora pico', fhr?.hour != null ? `${fhr.hour}:00` : '',
        fhr ? `${fhr.posts_count} posts · ${fmt(fhr.avg_engagement_per_post)} avg` : 'Sin datos')}
      ${highlight('Plataforma efectiva', this._capCase(fpl?.platform || ''),
        fpl ? `${fpl.total_posts} posts · ${fmt(fpl.avg_reactions_per_post)}/post` : 'Sin datos')}
      ${highlight('Mayor crecimiento', fg?.brand_name,
        fg ? `${(fg.growth_score >= 0 ? '+' : '')}${Math.round(fg.engagement_growth_percent || 0)}% eng` : 'Sin datos')}
    `;

    // ── Riesgo crítico ──────────────────────────────────────
    const alerts = d?.alerts?.data || [];
    const riskRows = alerts.length
      ? alerts.slice(0, 5).map(a => `
          <div class="mb-v3-risk-row">
            <div class="mb-v3-risk-name">${this._esc(a.brand_name || '—')}</div>
            <div class="mb-v3-risk-bar"><div class="mb-v3-risk-fill" style="width:${Math.min(100, Math.round(Number(a.risk_score) || 0))}%"></div></div>
            <div class="mb-v3-risk-score">${Math.round(Number(a.risk_score) || 0)}</div>
          </div>
        `).join('')
      : '<div class="mb-v2-empty">Sin alertas de riesgo ✓</div>';

    // ── Marcas monitoreadas ─────────────────────────────────
    const brandsList = containers.length
      ? containers.map(c => `
          <div class="mb-v3-brand-row" data-brand-id="${this._esc(c.id)}">
            <div class="mb-v3-brand-avatar">${this._esc((c.nombre_marca || '?').charAt(0).toUpperCase())}</div>
            <div class="mb-v3-brand-info">
              <div class="mb-v3-brand-name">${this._esc(c.nombre_marca || '—')}</div>
              <div class="mb-v3-brand-sub">brand_container</div>
            </div>
          </div>
        `).join('')
      : '<div class="mb-v2-empty">Sin marcas configuradas</div>';

    // ── vs Competencia ──────────────────────────────────────
    const vs = d?.vsCompetencia?.data || {};
    const vsBrand = vs.brand || {};
    const vsComp  = vs.competencia || {};
    const vsCmp   = vs.comparison || {};
    const verdict = vsCmp.who_leads_engagement === 'brand' ? 'Tú lideras'
                  : vsCmp.who_leads_engagement === 'competencia' ? 'Te supera la competencia'
                  : vsCmp.who_leads_engagement ? 'Empate' : '—';

    return `
    <div class="mb-v2-dashboard mb-v3-dashboard">

      <!-- Filtros -->
      <div class="mb-v2-filters">
        <label class="mb-v2-select">
          <select id="mbV2BrandFilter">${brandOptions}</select>
        </label>
        <label class="mb-v2-select">
          <select id="mbV2DateFilter">${dateOptions}</select>
        </label>
      </div>

      <!-- ═══ Visión general (KPI strip) ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Visión general</h2>
          <p>Indicadores rápidos del período seleccionado · post_source = own</p>
        </header>
        <div class="mb-v2-kpis">${kpiStrip}</div>
      </section>

      <!-- ═══ Insights estratégicos (6 highlights) ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Insights estratégicos</h2>
          <p>Lo más relevante en cada dimensión · ranking auto-calculado</p>
        </header>
        <div class="mb-v3-highlights">${highlights}</div>
      </section>

      <!-- ═══ Salud de marca (Riesgo + Marcas monitoreadas) ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Salud de marca</h2>
          <p>Riesgo por marca y composición de tu portafolio monitoreado</p>
        </header>
        <div class="mb-v2-widgets-row">
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Riesgo crítico</h3></header>
            <div class="mb-v2-widget-body">
              <div class="mb-v3-risk-list">${riskRows}</div>
            </div>
          </section>
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Marcas monitoreadas</h3></header>
            <div class="mb-v2-widget-body">
              <div class="mb-v3-brands-list">${brandsList}</div>
            </div>
          </section>
        </div>
      </section>

      <!-- ═══ Análisis longitudinal ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Análisis longitudinal</h2>
          <p>Cómo evoluciona tu publicación, engagement y sentimiento en el tiempo</p>
        </header>
        <section class="mb-v2-widget mb-v2-widget--wide">
          <header class="mb-v2-widget-head"><h3>Historial de actividad</h3></header>
          <div class="mb-v2-widget-body">
            <div class="mb-v2-chart-wrap" style="height:240px"><canvas id="mbV3ActivityCanvas"></canvas></div>
          </div>
        </section>
        <div class="mb-v2-widgets-row">
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Tendencia de engagement</h3></header>
            <div class="mb-v2-widget-body">
              <div class="mb-v2-chart-wrap" style="height:200px"><canvas id="mbV3EngagementCanvas"></canvas></div>
            </div>
          </section>
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Actividad de sentimiento</h3></header>
            <div class="mb-v2-widget-body">
              <div class="mb-v2-chart-wrap" style="height:200px"><canvas id="mbV3SentimentCanvas"></canvas></div>
            </div>
          </section>
        </div>
        <section class="mb-v2-widget mb-v2-widget--wide">
          <header class="mb-v2-widget-head"><h3>Patrón de horas de publicación</h3></header>
          <div class="mb-v2-widget-body">
            <div id="mbV3HeatmapHost" class="cc-v2-heatmap"></div>
          </div>
        </section>
      </section>

      <!-- ═══ Arquitectura de estrategia ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Arquitectura de estrategia</h2>
          <p>Temas, hashtags, tonos y plataformas que definen tu narrativa</p>
        </header>
        <div class="mb-v2-widgets-row">
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Temas dominantes</h3></header>
            <div class="mb-v2-widget-body"><div id="mbV3TopicsHost" class="cc-v2-tags-list"></div></div>
          </section>
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Hashtags más usados</h3></header>
            <div class="mb-v2-widget-body"><div id="mbV3HashtagsHost" class="cc-v2-tags-list"></div></div>
          </section>
        </div>
        <div class="cc-v2-distros">
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Tonos</h3></header>
            <div class="mb-v2-chart-wrap"><canvas id="mbV3TonesCanvas"></canvas></div>
          </section>
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Plataformas</h3></header>
            <div class="mb-v2-chart-wrap"><canvas id="mbV3PlatformCanvas"></canvas></div>
          </section>
          <section class="mb-v2-widget">
            <header class="mb-v2-widget-head"><h3>Sentimiento por marca</h3></header>
            <div class="mb-v2-widget-body"><div id="mbV3SentByBrandHost" class="mb-v3-sent-list"></div></div>
          </section>
        </div>
      </section>

      <!-- ═══ Top publicaciones ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Top publicaciones</h2>
          <p>Tus posts con mayor engagement total en el período</p>
        </header>
        <section class="mb-v2-widget mb-v2-widget--wide">
          <div class="mb-v2-widget-body">
            <div id="mbV3TopPostsHost" class="cc-v2-posts-list"></div>
          </div>
        </section>
      </section>

      <!-- ═══ Mi Marca vs Competencia ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Mi Marca vs Competencia</h2>
          <p>Comparativa directa de volumen, engagement y eficiencia</p>
        </header>
        <section class="mb-v2-widget mb-v2-widget--wide">
          <div class="mb-v2-widget-body">
            <div class="cc-v2-vs">
              <div class="cc-v2-vs-side">
                <div class="cc-v2-vs-label">Tú</div>
                <div class="cc-v2-vs-value">${fmt(vsBrand.engagement)}</div>
                <div class="cc-v2-vs-meta">${fmt(vsBrand.posts)} posts · ${fmt(vsBrand.avg_engagement_per_post)}/post</div>
              </div>
              <div class="cc-v2-vs-divider">vs</div>
              <div class="cc-v2-vs-side cc-v2-vs-side--rival">
                <div class="cc-v2-vs-label">Competencia</div>
                <div class="cc-v2-vs-value">${fmt(vsComp.engagement)}</div>
                <div class="cc-v2-vs-meta">${fmt(vsComp.posts)} posts · ${fmt(vsComp.avg_engagement_per_post)}/post</div>
              </div>
            </div>
            <div class="cc-v2-vs-verdict cc-v2-vs-verdict--${vsCmp.who_leads_engagement || 'tie'}">${this._esc(verdict)}</div>
            ${vsCmp.avg_per_post_ratio != null ? `
              <div class="mb-v3-vs-meta">
                Eficiencia por post: <strong>${(Number(vsCmp.avg_per_post_ratio)).toFixed(2)}×</strong> ·
                Brecha de volumen: <strong>${vsCmp.posts_diff != null ? (vsCmp.posts_diff > 0 ? '+' : '') + vsCmp.posts_diff : '—'} posts</strong>
              </div>` : ''}
          </div>
        </section>
      </section>
    </div>`;
  }

  _initMyBrandsV2Charts(d) {
    if (!window.Chart) return;
    this._destroyCharts();

    const fmt = (n) => {
      if (n == null) return '—';
      const v = Number(n);
      if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
      if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
      return String(Math.round(v));
    };
    const axisOpts = {
      x: { ticks: { color: 'rgba(255,255,255,0.55)', maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: 'rgba(255,255,255,0.55)' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
    };
    const donutOpts = {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 10, font: { size: 11 } } } },
    };

    // 1. Historial de actividad — agregar posts_count por period
    const activity = d?.activity?.data || [];
    const aHost = document.getElementById('mbV3ActivityCanvas');
    if (aHost && activity.length) {
      const byPeriod = new Map();
      activity.forEach(r => {
        const k = r.period_label || r.period_start;
        const cur = byPeriod.get(k) || { label: k, posts: 0, eng: 0, ts: r.period_start };
        cur.posts += Number(r.posts_count || 0);
        cur.eng   += Number(r.total_engagement || 0);
        byPeriod.set(k, cur);
      });
      const rows = Array.from(byPeriod.values()).sort((a, b) =>
        new Date(a.ts) - new Date(b.ts));
      this._charts.push(new Chart(aHost, {
        type: 'line',
        data: {
          labels: rows.map(r => r.label),
          datasets: [
            { label: 'Posts', data: rows.map(r => r.posts), borderColor: '#ff5400',
              backgroundColor: 'rgba(255,84,0,0.18)', tension: 0.3, fill: true,
              pointRadius: 2, yAxisID: 'y' },
            { label: 'Engagement', data: rows.map(r => r.eng), borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.10)', tension: 0.3, fill: false,
              pointRadius: 2, yAxisID: 'y1' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 10 } } },
          scales: {
            x: axisOpts.x,
            y:  { ...axisOpts.y, position: 'left', title: { display: true, text: 'Posts', color: 'rgba(255,255,255,0.55)' } },
            y1: { ...axisOpts.y, position: 'right', title: { display: true, text: 'Eng', color: 'rgba(255,255,255,0.55)' }, grid: { display: false } },
          },
        },
      }));
    } else if (aHost) {
      aHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin actividad en el período</div>';
    }

    // 2. Tendencia de engagement (avg_engagement_per_post)
    const eng = d?.engagement?.data || [];
    const eHost = document.getElementById('mbV3EngagementCanvas');
    if (eHost && eng.length) {
      const byPeriod = new Map();
      eng.forEach(r => {
        const k = r.period_label || r.period_start;
        const cur = byPeriod.get(k) || { label: k, avg: 0, count: 0, ts: r.period_start };
        cur.avg += Number(r.avg_engagement_per_post || 0);
        cur.count += 1;
        byPeriod.set(k, cur);
      });
      const rows = Array.from(byPeriod.values())
        .map(r => ({ label: r.label, value: r.count ? r.avg / r.count : 0, ts: r.ts }))
        .sort((a, b) => new Date(a.ts) - new Date(b.ts));
      this._charts.push(new Chart(eHost, {
        type: 'line',
        data: { labels: rows.map(r => r.label),
          datasets: [{ label: 'Avg eng/post', data: rows.map(r => r.value),
            borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)',
            tension: 0.3, fill: true, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } }, scales: axisOpts },
      }));
    } else if (eHost) {
      eHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin engagement registrado</div>';
    }

    // 3. Actividad de sentimiento (stacked bar)
    const sent = d?.sentiment?.data || [];
    const sHost = document.getElementById('mbV3SentimentCanvas');
    if (sHost && sent.length) {
      const byPeriod = new Map();
      sent.forEach(r => {
        const k = r.period_label || r.period_start;
        const cur = byPeriod.get(k) || { label: k, pos: 0, neu: 0, neg: 0, ts: r.period_start };
        cur.pos += Number(r.positive_posts || 0);
        cur.neu += Number(r.neutral_posts  || 0);
        cur.neg += Number(r.negative_posts || 0);
        byPeriod.set(k, cur);
      });
      const rows = Array.from(byPeriod.values()).sort((a, b) => new Date(a.ts) - new Date(b.ts));
      this._charts.push(new Chart(sHost, {
        type: 'bar',
        data: {
          labels: rows.map(r => r.label),
          datasets: [
            { label: 'Positivo', data: rows.map(r => r.pos), backgroundColor: '#22c55e' },
            { label: 'Neutro',   data: rows.map(r => r.neu), backgroundColor: '#6b7280' },
            { label: 'Negativo', data: rows.map(r => r.neg), backgroundColor: '#ef4444' },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 10 } } },
          scales: { x: { ...axisOpts.x, stacked: true }, y: { ...axisOpts.y, stacked: true } } },
      }));
    } else if (sHost) {
      sHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin posts con sentimiento</div>';
    }

    // 4. Heatmap day_of_week × hour_of_day
    const ph = d?.postingHours?.data || [];
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const hHost = document.getElementById('mbV3HeatmapHost');
    if (hHost && ph.length) {
      const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
      let max = 0;
      ph.forEach(c => {
        const dow = Number(c.day_of_week);
        const hr  = Number(c.hour_of_day);
        const v   = Number(c.total_engagement || 0);
        if (dow >= 0 && dow < 7 && hr >= 0 && hr < 24) {
          matrix[dow][hr] += v;
          if (matrix[dow][hr] > max) max = matrix[dow][hr];
        }
      });
      const corner = '<div class="cc-v2-heat-corner"></div>';
      const hrCols = Array.from({ length: 24 }, (_, h) =>
        `<div class="cc-v2-heat-hr">${h % 3 === 0 ? h : ''}</div>`).join('');
      const rows = days.map((label, dy) => `
        <div class="cc-v2-heat-day">${label}</div>
        ${matrix[dy].map((v, h) => {
          const intensity = max ? v / max : 0;
          return `<div class="cc-v2-heat-cell" title="${label} ${h}:00 — ${fmt(v)} eng" style="background:rgba(255,84,0,${intensity.toFixed(2)})"></div>`;
        }).join('')}`).join('');
      hHost.innerHTML = `<div class="cc-v2-heat-grid">${corner}${hrCols}${rows}</div>`;
    } else if (hHost) {
      hHost.innerHTML = '<div class="mb-v2-empty">Sin datos de horarios</div>';
    }

    // 5. Topics — barras horizontales por usage_count
    const renderTagList = (host, items, getLabel, getCount, getEng) => {
      if (!host) return;
      if (!items || !items.length) {
        host.innerHTML = '<div class="mb-v2-empty">Sin datos</div>';
        return;
      }
      host.innerHTML = items.slice(0, 10).map(t => `
        <div class="cc-v2-tag-row">
          <span class="cc-v2-tag-name">${this._esc(getLabel(t))}</span>
          <span class="cc-v2-tag-eng">${getCount(t)} · ${fmt(getEng(t))}</span>
        </div>`).join('');
    };

    renderTagList(
      document.getElementById('mbV3TopicsHost'),
      d?.strategy?.topics?.data || [],
      t => t.topic, t => Number(t.usage_count || 0), t => Number(t.total_engagement || 0)
    );
    renderTagList(
      document.getElementById('mbV3HashtagsHost'),
      d?.strategy?.hashtags?.data || [],
      h => '#' + h.hashtag, h => Number(h.usage_count || 0), h => Number(h.total_engagement || 0)
    );

    // 6. Tonos — bar horizontal
    const tones = d?.strategy?.tones?.data || [];
    const tHost = document.getElementById('mbV3TonesCanvas');
    if (tHost && tones.length) {
      const sorted = [...tones].sort((a, b) => Number(b.posts_count || 0) - Number(a.posts_count || 0)).slice(0, 8);
      this._charts.push(new Chart(tHost, {
        type: 'bar',
        data: {
          labels: sorted.map(t => t.tone || '—'),
          datasets: [{ data: sorted.map(t => Number(t.posts_count || 0)),
            backgroundColor: '#ff5400', borderRadius: 4 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { display: false } },
          },
        },
      }));
    } else if (tHost) {
      tHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin tonos analizados</div>';
    }

    // 7. Plataformas — donut por posts_count
    const platforms = d?.strategy?.platforms?.data || [];
    const pHost = document.getElementById('mbV3PlatformCanvas');
    if (pHost && platforms.length) {
      this._charts.push(new Chart(pHost, {
        type: 'doughnut',
        data: {
          labels: platforms.map(p => this._capCase(p.network || '—')),
          datasets: [{
            data: platforms.map(p => Number(p.posts_count || 0)),
            backgroundColor: ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444'],
            borderWidth: 0,
          }],
        },
        options: donutOpts,
      }));
    } else if (pHost) {
      pHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin plataformas</div>';
    }

    // 8. Sentimiento por marca — barras horizontales segmentadas
    const sbb = d?.strategy?.sentimentsByBrand?.data || [];
    const sbbHost = document.getElementById('mbV3SentByBrandHost');
    if (sbbHost) {
      if (!sbb.length) {
        sbbHost.innerHTML = '<div class="mb-v2-empty">Sin datos</div>';
      } else {
        sbbHost.innerHTML = sbb.slice(0, 8).map(r => {
          const total = Number(r.total_posts || 1);
          const pos = Number(r.positive_count || 0);
          const neu = Number(r.neutral_count || 0);
          const neg = Number(r.negative_count || 0);
          const pPos = (pos / total * 100).toFixed(1);
          const pNeu = (neu / total * 100).toFixed(1);
          const pNeg = (neg / total * 100).toFixed(1);
          return `
            <div class="mb-v3-sent-row">
              <div class="mb-v3-sent-name">${this._esc(r.brand_name || '—')}</div>
              <div class="mb-v3-sent-bar">
                <div class="mb-v3-sent-seg mb-v3-sent-seg--pos" style="width:${pPos}%" title="Positivo ${pos}"></div>
                <div class="mb-v3-sent-seg mb-v3-sent-seg--neu" style="width:${pNeu}%" title="Neutro ${neu}"></div>
                <div class="mb-v3-sent-seg mb-v3-sent-seg--neg" style="width:${pNeg}%" title="Negativo ${neg}"></div>
              </div>
              <div class="mb-v3-sent-meta">${total}</div>
            </div>`;
        }).join('');
      }
    }

    // 9. Top posts — tabla
    const tp = d?.topPosts?.data || [];
    const tpHost = document.getElementById('mbV3TopPostsHost');
    if (tpHost) {
      if (!tp.length) {
        tpHost.innerHTML = '<div class="mb-v2-empty">Sin publicaciones destacadas</div>';
      } else {
        tpHost.innerHTML = tp.slice(0, 10).map((p, i) => {
          const date = p.captured_at ? new Date(p.captured_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '';
          return `
            <article class="cc-v2-post-row">
              <div class="cc-v2-post-head">
                <span class="cc-v2-post-name">#${i + 1} · ${this._esc(p.brand_name || '—')}</span>
                <span class="cc-v2-post-net">${this._esc(this._capCase(p.network || ''))}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.5)">${this._esc(p.profile_handle || '')} · ${date}</span>
                <span class="cc-v2-post-eng">${fmt(p.engagement_total)}</span>
              </div>
              <div class="cc-v2-post-content">${this._esc(p.content_preview || '')}</div>
            </article>`;
        }).join('');
      }
    }

    // 10. Wire de filtros
    const brandSel = document.getElementById('mbV2BrandFilter');
    const dateSel  = document.getElementById('mbV2DateFilter');
    const onChange = () => {
      this._mbFilters = {
        brandId: brandSel?.value || '',
        windowDays: Number(dateSel?.value || 30),
      };
      this._mbData = null;
      if (this._mbBody) this._renderMyBrands(this._mbBody, this._mbFilters);
    };
    brandSel?.addEventListener('change', onChange);
    dateSel?.addEventListener('change', onChange);
  }

  /* ════════════════════════════════════════════════════════════
     COMPETENCIA V2 — adaptado de Partner para marketing estratégico
     ════════════════════════════════════════════════════════════ */
  _buildCompetenceV2HTML(d) {
    const entities    = d?.entities || [];
    const kpis        = d?.kpis?.data || {};
    const featured    = (d?.featured?.data || [])[0];
    const top         = d?.top?.data || [];
    const brandVsComp = d?.brandVsComp?.data || {};
    const risk        = d?.risk?.data || [];

    const fmt = (n) => {
      if (n == null) return '—';
      const v = Number(n);
      if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
      if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
      return String(v);
    };

    const entityOptions = [
      `<option value="">Todos los competidores</option>`,
      ...entities.map(e => `<option value="${this._esc(e.id)}">${this._esc(e.name)}</option>`),
    ].join('');

    return `
    <div class="cc-v2-dashboard">

      <!-- Filtros -->
      <div class="mb-v2-filters">
        <label class="mb-v2-select">
          <select id="ccV2EntityFilter">${entityOptions}</select>
        </label>
        <label class="mb-v2-select">
          <select id="ccV2DateFilter">
            <option value="7">Últimos 7 días</option>
            <option value="30" selected>Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
      </div>

      <!-- ═══ SECCIÓN: Visión general ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Visión general</h2>
          <p>Indicadores rápidos del período seleccionado</p>
        </header>
        <div class="mb-v2-kpis">
        ${this._kpiMin({
          icon: 'fa-users', value: String(kpis.active_competitors ?? '0'),
          label: 'Competidores',
          meta: kpis.total_competitors ? `${kpis.total_competitors} totales` : '',
        })}
        ${this._kpiMin({
          icon: 'fa-image', value: String(kpis.total_posts ?? '0'),
          label: 'Contenido',
          meta: kpis.distinct_platforms ? `${kpis.distinct_platforms} plataforma${kpis.distinct_platforms === 1 ? '' : 's'}` : '',
        })}
        ${this._kpiMin({
          icon: 'fa-heart', value: fmt(kpis.total_engagement),
          label: 'Engagement',
          meta: kpis.avg_engagement_per_post ? `avg ${fmt(kpis.avg_engagement_per_post)}/post` : '',
        })}
        ${this._kpiMin({
          icon: kpis.dominant_sentiment === 'positive' ? 'fa-face-smile' : kpis.dominant_sentiment === 'negative' ? 'fa-face-frown' : 'fa-face-meh',
          value: (kpis.dominant_sentiment || '—').toString().replace(/^\w/, c => c.toUpperCase()),
          label: 'Sentimiento',
          meta: kpis.sentiment_distribution
            ? `${kpis.sentiment_distribution.positive || 0} pos · ${kpis.sentiment_distribution.negative || 0} neg`
            : '',
          tone: kpis.dominant_sentiment === 'positive' ? 'positive' : kpis.dominant_sentiment === 'negative' ? 'negative' : null,
        })}
        ${this._kpiMin({
          icon: 'fa-signal', value: kpis.dominant_platform ? this._capCase(kpis.dominant_platform) : '—',
          label: 'Plataforma',
          meta: kpis.dominant_hashtag ? `#${this._esc(kpis.dominant_hashtag).slice(0, 18)}` : '',
        })}
        ${this._kpiMin({
          icon: 'fa-hashtag', value: kpis.dominant_topic ? this._esc(kpis.dominant_topic).slice(0, 16) : '—',
          label: 'Tema',
          meta: kpis.total_posts ? `en ${kpis.total_posts} posts` : '',
        })}
        </div>
      </section>

      <!-- ═══ SECCIÓN: Inteligencia de competidores ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Inteligencia de competidores</h2>
          <p>Quién lidera el período · ranking por engagement · mejores días y horas</p>
        </header>
        <div class="mb-v2-widgets-row">
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Destacado</h3></header>
          <div class="mb-v2-widget-body">
            <div class="cc-v2-featured">
              ${featured ? `
                <div class="cc-v2-featured-name">${this._esc(featured.entity_name)}</div>
                <div class="cc-v2-featured-handle">${this._esc(featured.handle || '')}</div>
                <div class="cc-v2-featured-score">${Math.round(featured.score || 0)}<span>/100</span></div>
                <div class="cc-v2-featured-meta">
                  <span>${fmt(featured.total_posts)} posts</span>
                  <span>${fmt(featured.total_engagement)} eng</span>
                  <span>${Math.round((featured.positive_sentiment_ratio || 0) * 100)}% pos</span>
                </div>
              ` : '<div class="mb-v2-empty">Sin destacado</div>'}
            </div>
            <div class="cc-v2-top-list" id="ccV2TopList">
              ${top.slice(0, 6).map((t, i) => `
                <div class="cc-v2-top-row">
                  <span class="cc-v2-top-rank">${i + 1}</span>
                  <span class="cc-v2-top-name">${this._esc(t.entity_name)}</span>
                  <span class="cc-v2-top-eng">${fmt(t.total_engagement)}</span>
                </div>
              `).join('') || '<div class="mb-v2-empty">Sin competidores</div>'}
            </div>
          </div>
        </section>

        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Horarios</h3></header>
          <div class="mb-v2-widget-body">
            <div id="ccV2HeatmapHost" class="cc-v2-heatmap"></div>
          </div>
        </section>
        </div>
      </section>

      <!-- ═══ SECCIÓN: Análisis del contenido ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Análisis del contenido</h2>
          <p>Cómo se comunica la competencia · qué temas, hashtags y tonos usan</p>
        </header>
        <div class="cc-v2-distros">
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Redes</h3></header>
          <div class="mb-v2-chart-wrap"><canvas id="ccV2PlatformCanvas"></canvas></div>
        </section>
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Sentimiento</h3></header>
          <div class="mb-v2-chart-wrap"><canvas id="ccV2SentimentCanvas"></canvas></div>
        </section>
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Tonos</h3></header>
          <div class="mb-v2-chart-wrap"><canvas id="ccV2ToneCanvas"></canvas></div>
        </section>
        </div>
        <div class="mb-v2-widgets-row">
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Temas y hashtags</h3></header>
          <div class="mb-v2-widget-body">
            <div class="cc-v2-tags-cols">
              <div class="cc-v2-tags-col">
                <div class="cc-v2-tags-label">Temas</div>
                <div id="ccV2TopicsHost" class="cc-v2-tags-list"></div>
              </div>
              <div class="cc-v2-tags-col">
                <div class="cc-v2-tags-label">Hashtags</div>
                <div id="ccV2HashtagsHost" class="cc-v2-tags-list"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Top posts</h3></header>
          <div class="mb-v2-widget-body">
            <div id="ccV2TopPostsHost" class="cc-v2-posts-list"></div>
          </div>
        </section>
        </div>
      </section>

      <!-- ═══ SECCIÓN: Análisis longitudinal ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Análisis longitudinal</h2>
          <p>Actividad de cada competidor en el tiempo · clic en leyenda para aislar</p>
        </header>
        <section class="mb-v2-widget mb-v2-widget--wide">
          <header class="mb-v2-widget-head"><h3>Actividad por competidor</h3></header>
          <div class="mb-v2-chart-wrap" style="height:280px"><canvas id="ccV2TimelineCanvas"></canvas></div>
        </section>
      </section>

      <!-- ═══ SECCIÓN: Inteligencia estratégica ═══ -->
      <section class="dash-section">
        <header class="dash-section-head">
          <h2>Inteligencia estratégica</h2>
          <p>Tu posición vs el ecosistema · alertas activas que requieren atención</p>
        </header>
        <div class="mb-v2-widgets-row">
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Tú vs Competencia</h3></header>
          <div class="mb-v2-widget-body">
            <div class="cc-v2-vs">
              <div class="cc-v2-vs-side">
                <div class="cc-v2-vs-label">Tú</div>
                <div class="cc-v2-vs-value">${fmt(brandVsComp?.brand?.engagement)}</div>
                <div class="cc-v2-vs-meta">${fmt(brandVsComp?.brand?.posts)} posts</div>
              </div>
              <div class="cc-v2-vs-divider">vs</div>
              <div class="cc-v2-vs-side cc-v2-vs-side--rival">
                <div class="cc-v2-vs-label">Competencia</div>
                <div class="cc-v2-vs-value">${fmt(brandVsComp?.competencia?.engagement)}</div>
                <div class="cc-v2-vs-meta">${fmt(brandVsComp?.competencia?.posts)} posts</div>
              </div>
            </div>
            <div class="cc-v2-vs-verdict cc-v2-vs-verdict--${brandVsComp?.comparison?.who_leads_engagement || 'tie'}">
              ${brandVsComp?.comparison?.who_leads_engagement === 'brand'
                ? 'Liderás'
                : brandVsComp?.comparison?.who_leads_engagement === 'competencia'
                  ? 'La competencia supera'
                  : 'Empate'}
            </div>
          </div>
        </section>

        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head"><h3>Alertas</h3></header>
          <div class="mb-v2-widget-body">
            <div id="ccV2RiskHost" class="cc-v2-risk-list">
              ${risk.length ? '' : '<div class="mb-v2-empty">Sin alertas</div>'}
            </div>
          </div>
        </section>
        </div>
      </section>
    </div>`;
  }

  /** KPI con pirámide de info: icono · valor · label · meta (opcional). */
  _kpiMin({ icon, value, label, meta = '', tone = null }) {
    const toneCls = tone === 'positive' ? ' mb-v2-kpi--positive'
                  : tone === 'negative' ? ' mb-v2-kpi--negative' : '';
    return `
      <div class="mb-v2-kpi mb-v2-kpi--min${toneCls}">
        ${icon ? `<div class="mb-v2-kpi-min-icon"><i class="fas ${icon}"></i></div>` : ''}
        <div class="mb-v2-kpi-min-value">${this._esc(value)}</div>
        <div class="mb-v2-kpi-min-label">${this._esc(label)}</div>
        ${meta ? `<div class="mb-v2-kpi-min-meta">${this._esc(meta)}</div>` : ''}
      </div>`;
  }

  _capCase(s) {
    if (!s) return s;
    const str = String(s);
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  _initCompetenceV2Charts(d) {
    if (!window.Chart) return;
    this._destroyCharts();
    const fmt = (n) => {
      if (n == null) return '—';
      const v = Number(n);
      if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
      if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
      return String(v);
    };

    const dist = d?.distributions?.data || {};
    const sharedOpts = {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 10, font: { size: 11 } } } },
    };

    // Platform donut
    const pHost = document.getElementById('ccV2PlatformCanvas');
    if (pHost && dist.platform) {
      const labels = Object.keys(dist.platform);
      const values = labels.map(k => dist.platform[k]);
      this._charts.push(new Chart(pHost, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: ['#3b82f6','#ec4899','#22c55e','#f59e0b','#a855f7','#06b6d4','#ef4444'], borderWidth: 0 }] },
        options: sharedOpts,
      }));
    }

    // Sentiment donut
    const sHost = document.getElementById('ccV2SentimentCanvas');
    if (sHost && dist.sentiment) {
      const labels = Object.keys(dist.sentiment);
      const values = labels.map(k => dist.sentiment[k]);
      const colors = labels.map(l =>
        /pos/i.test(l) ? '#22c55e' : /neg/i.test(l) ? '#ef4444' : '#6b7280');
      this._charts.push(new Chart(sHost, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
        options: sharedOpts,
      }));
    }

    // Tone bar
    const tHost = document.getElementById('ccV2ToneCanvas');
    if (tHost && dist.tone && Object.keys(dist.tone).length) {
      const sortedTones = Object.entries(dist.tone).sort((a,b) => b[1]-a[1]).slice(0, 8);
      this._charts.push(new Chart(tHost, {
        type: 'bar',
        data: {
          labels: sortedTones.map(([k]) => k),
          datasets: [{ data: sortedTones.map(([,v]) => v), backgroundColor: '#ff5400', borderRadius: 4 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { display: false } },
          },
        },
      }));
    } else if (tHost) {
      tHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin tonos analizados aún</div>';
    }

    // Heatmap DOW × HOUR
    const hHost = document.getElementById('ccV2HeatmapHost');
    const ph    = d?.postingHours?.data || [];
    if (hHost && ph.length) {
      const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
      let max = 0;
      ph.forEach(c => {
        const v = Number(c.total_engagement || 0);
        if (c.day_of_week >= 0 && c.day_of_week < 7 && c.hour_of_day >= 0 && c.hour_of_day < 24) {
          matrix[c.day_of_week][c.hour_of_day] += v;
          if (matrix[c.day_of_week][c.hour_of_day] > max) max = matrix[c.day_of_week][c.hour_of_day];
        }
      });
      const cells = [];
      for (let dy = 0; dy < 7; dy++) {
        for (let h = 0; h < 24; h++) {
          const v = matrix[dy][h];
          const intensity = max ? v / max : 0;
          cells.push(`<div class="cc-v2-heat-cell" title="${days[dy]} ${h}:00 — ${fmt(v)} eng" style="background:rgba(255,84,0,${intensity.toFixed(2)})"></div>`);
        }
      }
      hHost.innerHTML = `
        <div class="cc-v2-heat-grid">
          <div class="cc-v2-heat-corner"></div>
          ${Array.from({ length: 24 }, (_, h) => `<div class="cc-v2-heat-hr">${h % 3 === 0 ? h : ''}</div>`).join('')}
          ${days.map((label, dy) => `
            <div class="cc-v2-heat-day">${label}</div>
            ${matrix[dy].map((v, h) => {
              const intensity = max ? v / max : 0;
              return `<div class="cc-v2-heat-cell" title="${label} ${h}:00 — ${fmt(v)} eng" style="background:rgba(255,84,0,${intensity.toFixed(2)})"></div>`;
            }).join('')}
          `).join('')}
        </div>
      `;
    } else if (hHost) {
      hHost.innerHTML = '<div class="mb-v2-empty">Sin datos de horarios</div>';
    }

    // Top topics + hashtags
    const topicsHost   = document.getElementById('ccV2TopicsHost');
    const hashtagsHost = document.getElementById('ccV2HashtagsHost');
    const topics   = d?.topTopics?.data   || [];
    const hashtags = d?.topHashtags?.data || [];
    const renderTagList = (items, label) => items.length
      ? items.slice(0, 8).map(t => `
          <div class="cc-v2-tag-row">
            <span class="cc-v2-tag-name">${this._esc(t.topic_name || t.hashtag_name || t.topic || t.hashtag || '—')}</span>
            <span class="cc-v2-tag-eng">${fmt(t.total_engagement)}</span>
          </div>`).join('')
      : `<div class="mb-v2-empty">${label}</div>`;
    if (topicsHost)   topicsHost.innerHTML   = renderTagList(topics, 'Sin temas extraídos');
    if (hashtagsHost) hashtagsHost.innerHTML = renderTagList(hashtags, 'Sin hashtags');

    // Top posts
    const tpHost = document.getElementById('ccV2TopPostsHost');
    const tp = d?.topPosts?.data || [];
    if (tpHost) {
      tpHost.innerHTML = tp.length
        ? tp.slice(0, 6).map(p => `
          <div class="cc-v2-post-row">
            <div class="cc-v2-post-head">
              <span class="cc-v2-post-name">${this._esc(p.entity_name)}</span>
              <span class="cc-v2-post-net">${this._esc(p.network)}</span>
              <span class="cc-v2-post-eng">${fmt(p.engagement_total)}</span>
            </div>
            <div class="cc-v2-post-content">${this._esc((p.content_preview || '').slice(0, 180))}</div>
          </div>`).join('')
        : '<div class="mb-v2-empty">Sin top posts en el período</div>';
    }

    // Risk list
    const riskHost = document.getElementById('ccV2RiskHost');
    const risk = d?.risk?.data || [];
    if (riskHost && risk.length) {
      riskHost.innerHTML = risk.slice(0, 5).map(r => `
        <div class="mb-v2-crisis-row mb-v2-crisis-row--high">
          <span class="mb-v2-crisis-sev">${Math.round(r.risk_score || 0)}</span>
          <span class="mb-v2-crisis-title">${this._esc(r.entity_name)} — ${this._esc(r.description)}</span>
        </div>
      `).join('');
    }

    // Activity history timeline — DIMENSIÓN POR COMPETIDOR
    // Una línea de engagement por cada competidor + barras stacked de posts.
    // Permite responder: "¿quién publicó cuándo?", "¿de quién fue ese pico?".
    const ahHost = document.getElementById('ccV2TimelineCanvas');
    const ah = d?.activityHistory?.data || [];
    if (ahHost && ah.length) {
      // Paleta: Red Bull al naranja primario, resto en familia complementaria
      const palette = ['#ff5400', '#fbbf24', '#ec4899', '#06b6d4', '#a855f7', '#10b981', '#f43f5e', '#0ea5e9'];

      // Step 1: ranking de entities por total engagement (top primero)
      const entityTotals = new Map();
      ah.forEach(r => {
        entityTotals.set(r.entity_name, (entityTotals.get(r.entity_name) || 0) + Number(r.total_engagement || 0));
      });
      const sortedEntities = [...entityTotals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

      // Step 2: períodos únicos en orden temporal + sus labels
      const periodMap = new Map(); // period_start → { label }
      ah.forEach(r => { if (!periodMap.has(r.period_start)) periodMap.set(r.period_start, r.period_label); });
      const periods = [...periodMap.keys()].sort();
      const labels  = periods.map(p => periodMap.get(p));

      // Step 3: matriz [entity][period] → {posts, eng}
      const matrix = {};
      ah.forEach(r => {
        if (!matrix[r.entity_name]) matrix[r.entity_name] = {};
        matrix[r.entity_name][r.period_start] = { posts: Number(r.posts_count || 0), eng: Number(r.total_engagement || 0) };
      });

      // Step 4: datasets — una línea de engagement por entity + stacked bars de posts
      const datasets = [];
      sortedEntities.forEach((entity, idx) => {
        const color = palette[idx % palette.length];
        const engData   = periods.map(p => matrix[entity]?.[p]?.eng || 0);
        const postsData = periods.map(p => matrix[entity]?.[p]?.posts || 0);

        // Línea de engagement
        datasets.push({
          type: 'line',
          label: entity,
          data: engData,
          borderColor: color,
          backgroundColor: color + '20',  // hex + alpha (12%)
          yAxisID: 'y1',
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 1,
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          stack: undefined,
          order: 1,  // líneas encima de barras
          // Marca este dataset como el "primario" para legenda
          _isEngagement: true,
        });

        // Barras stacked de posts (mismo color, más translúcido) — ocultas en leyenda
        datasets.push({
          type: 'bar',
          label: entity + ' (posts)',
          data: postsData,
          backgroundColor: color + '55',  // ~33% opacity
          borderRadius: 2,
          yAxisID: 'y2',
          stack: 'posts',
          barPercentage: 0.7,
          categoryPercentage: 0.85,
          order: 2,
          _hideFromLegend: true,
        });
      });

      this._charts.push(new Chart(ahHost, {
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              align: 'end',
              position: 'top',
              labels: {
                color: 'rgba(255,255,255,0.7)',
                boxWidth: 10, boxHeight: 10,
                font: { size: 11 },
                usePointStyle: true,
                pointStyle: 'rectRounded',
                padding: 12,
                // Esconder los datasets de barras (los de "(posts)") de la leyenda
                filter(item, chartData) {
                  const ds = chartData.datasets[item.datasetIndex];
                  return !ds._hideFromLegend;
                },
              },
              onClick(e, legendItem, legend) {
                // Toggle ambos datasets (línea + barras del mismo entity)
                const ci = legend.chart;
                const entity = legendItem.text;
                ci.data.datasets.forEach((ds, idx) => {
                  if (ds.label === entity || ds.label === entity + ' (posts)') {
                    const meta = ci.getDatasetMeta(idx);
                    meta.hidden = !meta.hidden;
                  }
                });
                ci.update();
              },
            },
            tooltip: {
              backgroundColor: 'rgba(20,21,23,0.96)',
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              titleColor: '#fff',
              bodyColor: 'rgba(255,255,255,0.85)',
              padding: 10,
              cornerRadius: 8,
              displayColors: true,
              boxPadding: 4,
              callbacks: {
                label(ctx) {
                  const v = ctx.parsed.y;
                  const name = ctx.dataset.label.replace(' (posts)', '');
                  const fmtN = (n) => {
                    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
                    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
                    return String(n);
                  };
                  if (ctx.dataset.type === 'line') return `${name} · ${fmtN(v)} eng`;
                  return `${name} · ${v} posts`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: 'rgba(255,255,255,0.45)', maxTicksLimit: 8, font: { size: 11 } },
              grid: { display: false }, border: { display: false },
            },
            y1: {
              position: 'left', beginAtZero: true,
              ticks: {
                color: 'rgba(255,255,255,0.5)', font: { size: 10 },
                callback(v) { if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'; if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K'; return v; },
              },
              grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
              border: { display: false },
              title: { display: true, text: 'Engagement', color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
            },
            y2: {
              position: 'right', beginAtZero: true, stacked: true,
              ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, precision: 0 },
              grid: { display: false },
              border: { display: false },
              title: { display: true, text: 'Posts', color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
            },
          },
        },
      }));
    } else if (ahHost) {
      ahHost.parentElement.innerHTML = '<div class="mb-v2-empty">Sin actividad en el período</div>';
    }
  }
}

window.DashboardView = DashboardView;
