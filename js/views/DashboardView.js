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
  async _renderMyBrands(body) {
    // 1. Skeleton inmediato
    body.innerHTML = this._buildMyBrandsSkeleton();

    // 2. Cargar dependencias en paralelo
    const [,] = await Promise.allSettled([
      this._ensureChartJs(),
      this._ensureMBService(),
    ]);

    // 3. Cargar datos (usa cache de sesión si ya se cargaron)
    if (!this._mbData) {
      this._mbData = this._mbService
        ? await this._mbService.loadAll()
        : null;
    }
    const d = this._mbData;

    // 4. Render completo con datos reales — v2 layout (firebar + 6 KPIs + 3 widgets)
    body.innerHTML = this._buildMyBrandsV2HTML(d);
    window._dashboardView = this;
    this._initMyBrandsV2Charts(d);
    this._animateKPIs?.();
  }

  async _refreshMBData() {
    this._mbData = null; // Limpiar cache
    const body = document.querySelector('.mb-dashboard')?.closest('[data-tab="my-brands"]') ||
                 document.getElementById('app-container')?.querySelector('.tab-body');
    if (body) { this._destroyCharts(); await this._renderMyBrands(body); }
    else { this._mbData = null; window.location.reload(); }
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

  _buildMyBrandsHTML(d) {
    const noData = !d;
    const containers  = d?.containers || [];
    const kpis        = d?.kpis?.data || {};
    const hasAnyData  = containers.length > 0;

    // KPI values — real o placeholder
    const posts7d     = kpis.posts7d      != null ? kpis.posts7d      : '—';
    const sentScore   = kpis.sentimentScore != null ? kpis.sentimentScore : '—';
    const mapComp     = kpis.mapCompliance != null ? `${kpis.mapCompliance}%` : '—';
    const crisisIdx   = kpis.crisisOpen   != null ? kpis.crisisOpen   : '—';
    const mentions24h = kpis.mentions24h  != null ? kpis.mentions24h  : '—';
    const brandCount  = kpis.brandCount   != null ? kpis.brandCount   : containers.length;

    return `
    <div class="mb-dashboard">

      <!-- ── KPI Strip ── -->
      <div class="mb-kpi-strip">
        ${this._kpiCard('Posts propios / 7d', String(posts7d), hasAnyData ? 'Últimos 7 días' : 'Sin datos aún',  'blue')}
        ${this._kpiCard('Engagement Rate',    '—',              'API Meta necesaria',                             'pink')}
        ${this._kpiCard('Sentiment Score',    sentScore !== '—' ? `${sentScore}/100` : '—', sentScore !== '—' ? '↑ Coherencia de tono' : 'Requiere análisis VERA', 'green')}
        ${this._kpiCard('Cumplimiento MAP',   mapComp,          mapComp !== '—' ? 'Precios monitoreados' : 'Sin precios cargados', 'orange')}
        ${this._kpiCard('Crisis abiertas',    String(crisisIdx), crisisIdx === 0 ? '✓ Sin alertas activas' : 'Requieren atención', 'teal')}
        ${this._kpiCard('Menciones 24 h',     String(mentions24h), hasAnyData ? 'Shadow + etiquetadas' : 'Sin señales aún', 'purple')}
      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN A · OPERATIVIDAD Y PULSO
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('Operatividad y Pulso', 'Ritmo de publicación, micro-momentos y formatos')}
      <div class="mb-dim-row">

        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Ritmo de Publicación y Latencia</span>
            <span class="mb-badge mb-badge--blue">30 días</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartPublicacion" height="140"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Formatos Dominantes</span>
            <span class="mb-badge mb-badge--green">Hoy</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            <canvas id="chartFormatos" height="190"></canvas>
          </div>
        </div>

      </div>

      <!-- Heatmap Horario (ocupa toda la fila) -->
      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title">Mapa de Calor de Interacción Horaria</span>
          <span class="mb-badge mb-badge--purple">Últimas 4 semanas</span>
        </div>
        <div class="mb-widget-body">
          <div class="mb-heatmap-wrap" id="mbHeatmap"></div>
          <div class="mb-heatmap-legend">
            <span class="mb-hm-low">Bajo</span>
            <div class="mb-hm-gradient"></div>
            <span class="mb-hm-high">Alto</span>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN B · IDENTIDAD Y NARRATIVA
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('Identidad y Narrativa', 'Pilares, tono de voz y semántica de impacto')}
      <div class="mb-dim-row">

        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Dominio de Pilares Narrativos</span>
            <span class="mb-badge mb-badge--blue">Este mes</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartPilares" height="180"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Brand Soul Guard</span>
            <span class="mb-badge mb-badge--green">Tono</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            ${this._buildToneGauge()}
          </div>
        </div>

      </div>
      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title">Semántica de Impacto — Top palabras resonantes</span>
          <span class="mb-badge mb-badge--pink">IA semántica</span>
        </div>
        <div class="mb-widget-body">
          <div class="mb-semantic-cloud" id="mbSemanticCloud"></div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN C · COMERCIAL Y DISTRIBUCIÓN
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('Comercial y Distribución', 'MAP Monitor, stock digital y análisis de ofertas')}

      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title">Monitor de Cumplimiento de Precios (MAP Monitor)</span>
          <span class="mb-badge mb-badge--orange" id="mbMAPBadge">Cargando…</span>
        </div>
        <div class="mb-widget-body" id="mbMAPBody">
          ${this._emptyState('Cargando datos MAP…','')}
        </div>
      </div>

      <div class="mb-dim-row">
        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Stock Digital</span>
            <span class="mb-badge mb-badge--teal">Live</span>
          </div>
          <div class="mb-widget-body" id="mbStockBody">
            ${this._emptyState('Cargando stock…','')}
          </div>
        </div>
        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Efectividad de Ofertas Dinámicas</span>
            <span class="mb-badge mb-badge--blue">Comparativa</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartOfertas" height="200"></canvas>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN D · SOCIAL Y PERCEPCIÓN
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('Social y Percepción', 'Sentimiento biométrico, shadow mentions e influencia real')}
      <div class="mb-dim-row">

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Sentimiento Biométrico</span>
            <span class="mb-badge mb-badge--pink">Emociones</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            <canvas id="chartSentimiento" height="200"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Shadow Mentions</span>
            <span class="mb-badge mb-badge--purple">Sin etiqueta</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartShadow" height="180"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Índice de Influencia Real</span>
            <span class="mb-badge mb-badge--teal">Top 5</span>
          </div>
          <div class="mb-widget-body" id="mbInfluenceBody">
            ${this._emptyState('Cargando…','')}
          </div>
        </div>

      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN E · DIAGNÓSTICA
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('Diagnóstica', 'Puntos ciegos, fuga de audiencia y detección de crisis')}
      <div class="mb-dim-row">

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Mapa de Puntos Ciegos</span>
            <span class="mb-badge mb-badge--blue">Blind Spots</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            <canvas id="chartRadar" height="230"></canvas>
          </div>
        </div>

        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title">Análisis de Fuga de Audiencia</span>
            <span class="mb-badge mb-badge--orange">Retención</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartFuga" height="200"></canvas>
          </div>
        </div>

      </div>

      <!-- Crisis de Baja Intensidad (timeline) -->
      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title">Detección de Crisis de Baja Intensidad</span>
          <span class="mb-badge mb-badge--red">Monitoreo continuo</span>
        </div>
        <div class="mb-widget-body" id="mbCrisisBody">
          ${this._emptyState('Cargando…','')}
        </div>
      </div>

      <!-- SWOT Dinámico -->
      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title">SWOT Dinámico — Virtudes y Vulnerabilidades</span>
          <span class="mb-badge mb-badge--purple">OpenClaw IA</span>
        </div>
        <div class="mb-widget-body" id="mbSWOTBody">
          ${this._emptyState('Cargando análisis SWOT…','')}
        </div>
      </div>

      <!-- Footer fuente de datos -->
      <div class="mb-data-source-note">
        
        <span>Datos obtenidos en tiempo real desde <strong>Supabase</strong>. Última actualización: <strong id="mbLastUpdate">—</strong></span>
        <button class="mb-refresh-btn" onclick="window._dashboardView?._refreshMBData()"> Actualizar</button>
      </div>

    </div>`;
  }

  /* ── Helpers de construcción ─────────────────────────────── */
  _dimHeader(title, subtitle) {
    return `
      <div class="mb-dim-header">
        <div>
          <div class="mb-dim-title">${this._esc(title)}</div>
          <div class="mb-dim-subtitle">${this._esc(subtitle)}</div>
        </div>
      </div>`;
  }

  _kpiCard(label, value, sub, color) {
    return `
      <div class="mb-kpi-card mb-kpi--${color}">
        <div class="mb-kpi-body">
          <div class="mb-kpi-value" data-target="${value}">${value}</div>
          <div class="mb-kpi-label">${label}</div>
          <div class="mb-kpi-sub">${sub}</div>
        </div>
      </div>`;
  }

  _buildToneGauge() {
    // SVG semicircular gauge - desviación de tono
    const tones = [
      { label: 'Muy formal',  pct: 8,  color: '#6366f1' },
      { label: 'Formal',      pct: 22, color: '#818cf8' },
      { label: 'Balanceado',  pct: 42, color: '#22c55e' },
      { label: 'Emocional',   pct: 21, color: '#f59e0b' },
      { label: 'Muy emocional', pct: 7, color: '#ef4444' },
    ];
    const bars = tones.map(t => `
      <div class="mb-tone-row">
        <span class="mb-tone-label">${t.label}</span>
        <div class="mb-tone-bar-wrap">
          <div class="mb-tone-bar" style="width:${t.pct}%;background:${t.color}"></div>
        </div>
        <span class="mb-tone-pct">${t.pct}%</span>
      </div>`).join('');
    return `
      <div class="mb-tone-gauge">
        <div class="mb-tone-score">
          <div class="mb-tone-score-val">88<span>%</span></div>
          <div class="mb-tone-score-lbl">Coherencia</div>
        </div>
        <div class="mb-tone-bars">${bars}</div>
      </div>`;
  }

  _buildMAPTable() {
    const rows = [
      { retailer: 'Amazon MX',      product: 'Oster Pro 1200',   price: '$1,299', map: '$1,250', status: 'ok',      delta: '+$49' },
      { retailer: 'Mercado Libre',  product: 'Oster Pro 1200',   price: '$1,180', map: '$1,250', status: 'alert',   delta: '-$70' },
      { retailer: 'Walmart MX',     product: 'Oster Pro 1200',   price: '$1,250', map: '$1,250', status: 'ok',      delta: '±$0'  },
      { retailer: 'Coppel',         product: 'Oster Classic 800', price: '$899',  map: '$950',   status: 'alert',   delta: '-$51' },
      { retailer: 'Liverpool',      product: 'Oster Classic 800', price: '$975',  map: '$950',   status: 'warning', delta: '+$25' },
      { retailer: 'Amazon MX',      product: 'Oster Mini Chef',  price: '$549',  map: '$499',   status: 'warning', delta: '+$50' },
    ];
    const statusLabel = { ok: 'Cumple', alert: 'Viola MAP', warning: 'Revisar' };
    const statusClass = { ok: 'mb-map--ok', alert: 'mb-map--alert', warning: 'mb-map--warning' };
    return `
      <div class="mb-map-table-wrap">
        <table class="mb-map-table">
          <thead><tr>
            <th>Retailer</th><th>Producto</th><th>Precio actual</th>
            <th>MAP acordado</th><th>Diferencia</th><th>Estado</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
            <tr>
              <td>${r.retailer}</td>
              <td>${r.product}</td>
              <td class="mb-map-price">${r.price}</td>
              <td class="mb-map-price mb-map-ref">${r.map}</td>
              <td class="mb-map-delta ${r.status === 'alert' ? 'mb-delta--neg' : r.status === 'warning' ? 'mb-delta--warn' : 'mb-delta--pos'}">${r.delta}</td>
              <td><span class="mb-map-badge ${statusClass[r.status]}"> ${statusLabel[r.status]}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  _buildStockGrid() {
    const items = [
      { name: 'Oster Pro 1200',    amazon: 'ok', ml: 'ok',    walmart: 'low',  coppel: 'out'  },
      { name: 'Oster Classic 800', amazon: 'ok', ml: 'low',   walmart: 'ok',   coppel: 'ok'   },
      { name: 'Oster Mini Chef',   amazon: 'out',ml: 'ok',    walmart: 'ok',   coppel: 'low'  },
      { name: 'Oster Compact',     amazon: 'ok', ml: 'ok',    walmart: 'out',  coppel: 'ok'   },
    ];
    const icon = { ok: '✓', low: '!', out: '✗' };
    const cls  = { ok: 'mb-stock--ok', low: 'mb-stock--low', out: 'mb-stock--out' };
    return `
      <div class="mb-stock-grid">
        <div class="mb-stock-header-row">
          <span></span><span>Amazon</span><span>MLibre</span><span>Walmart</span><span>Coppel</span>
        </div>
        ${items.map(p => `
          <div class="mb-stock-row">
            <span class="mb-stock-name">${p.name}</span>
            <span class="mb-stock-cell ${cls[p.amazon]}">${icon[p.amazon]}</span>
            <span class="mb-stock-cell ${cls[p.ml]}">${icon[p.ml]}</span>
            <span class="mb-stock-cell ${cls[p.walmart]}">${icon[p.walmart]}</span>
            <span class="mb-stock-cell ${cls[p.coppel]}">${icon[p.coppel]}</span>
          </div>`).join('')}
        <div class="mb-stock-legend">
          <span class="mb-stock--ok">✓ Disponible</span>
          <span class="mb-stock--low">! Stock bajo</span>
          <span class="mb-stock--out">✗ Agotado</span>
        </div>
      </div>`;
  }

  _buildInfluenceList() {
    const list = [
      { name: '@cocina_mex',    platform: 'ig',  score: 94, type: 'Cliente real',   followers: '42K' },
      { name: 'Blog Foodie MX', platform: 'web', score: 88, type: 'Blogger',        followers: '18K' },
      { name: '@chefrodri',     platform: 'tt',  score: 83, type: 'Micro-influencer', followers: '31K' },
      { name: '@recetashogar',  platform: 'ig',  score: 79, type: 'Cliente real',   followers: '9K'  },
      { name: 'ForoCocinaMX',   platform: 'web', score: 72, type: 'Comunidad',      followers: '55K' },
    ];
    return `
      <div class="mb-influence-list">
        ${list.map((p, i) => `
          <div class="mb-influence-row">
            <span class="mb-inf-rank">#${i+1}</span>
            <div class="mb-inf-info">
              <span class="mb-inf-name">${p.name}</span>
              <span class="mb-inf-type">${p.type} · ${p.followers}</span>
            </div>
            
            <div class="mb-inf-score-wrap">
              <div class="mb-inf-bar" style="width:${p.score}%"></div>
              <span class="mb-inf-score">${p.score}</span>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _buildCrisisTimeline() {
    const events = [
      { time: 'Hace 2 h',  level: 'low',  msg: '14 comentarios sobre retraso en envío de Amazon MX — patrón repetitivo detectado.', action: 'Monitoreo activo' },
      { time: 'Hace 6 h',  level: 'med',  msg: 'Pico de menciones negativas en ForoCocinaMX sobre Oster Mini Chef — posible defecto de lote.', action: 'Alerta enviada' },
      { time: 'Hace 18 h', level: 'low',  msg: 'Precio de Oster Classic 800 en Coppel cayó a $899 (viola MAP). OpenClaw activó revisión.', action: 'Revisión en curso' },
      { time: 'Hace 2 d',  level: 'none', msg: 'Spike orgánico positivo tras publicación de @chefrodri — sin riesgo detectado.', action: 'Cerrado' },
    ];
    const levelCls = { low: 'mb-crisis--low', med: 'mb-crisis--med', high: 'mb-crisis--high', none: 'mb-crisis--none' };
    return `
      <div class="mb-crisis-timeline">
        ${events.map(ev => `
          <div class="mb-crisis-event ${levelCls[ev.level]}">
            <div class="mb-crisis-icon"></div>
            <div class="mb-crisis-body">
              <p class="mb-crisis-msg">${ev.msg}</p>
              <div class="mb-crisis-meta">
                <span class="mb-crisis-time">${ev.time}</span>
                <span class="mb-crisis-action">${ev.action}</span>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     CHART.JS — inicialización con datos reales + fallback demo
  ───────────────────────────────────────────────────────── */
  _initAllCharts(d) {
    if (!window.Chart) { return; }
    Chart.defaults.color = 'rgba(212,209,216,0.7)';
    Chart.defaults.font.family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    Chart.defaults.font.size = 11;

    this._chartPublicacion(d?.ritmo);
    this._chartFormatos(d?.formatos);
    this._chartPilares(d?.pilares);
    this._chartOfertas(d?.ofertas);
    this._chartSentimiento(d?.sentimiento);
    this._chartShadow(d?.shadowMentions);
    this._chartRadar(d?.blindSpots);
    this._chartFuga(d?.fuga);
    this._buildHeatmap(d?.heatmap);
    this._buildSemanticCloud(d?.semantica);
    this._buildMBMissions(d?.missions, d?.crisis);
    this._renderMAPWidget(d?.mapMonitor);
    this._renderStockWidget(d?.stock);
    this._renderInfluenceWidget(d?.influencia);
    this._renderCrisisWidget(d?.crisis);
    this._renderSWOTWidget(d?.swot);
  }

  _reg(chart) { this._charts.push(chart); return chart; }

  _chartPublicacion(ritmoRes) {
    const ctx = document.getElementById('chartPublicacion');
    if (!ctx) return;
    const hasReal = ritmoRes && !ritmoRes.isEmpty && Array.isArray(ritmoRes.data) && ritmoRes.data.length > 0;
    let labels, posts;
    if (hasReal) {
      labels = ritmoRes.data.map(r => r.label);
      posts  = ritmoRes.data.map(r => r.count);
    } else {
      labels = Array.from({length:30},(_,i)=>{const d=new Date(); d.setDate(d.getDate()-29+i); return `${d.getDate()}/${d.getMonth()+1}`;});
      posts  = Array(30).fill(0); // No hay datos — barras en cero
    }
    this._reg(new Chart(ctx, {
      data: {
        labels,
        datasets: [
          { type:'bar', label:'Posts propios', data:posts, backgroundColor:'rgba(96,165,250,0.45)', borderColor:'rgba(96,165,250,0.8)', borderWidth:1, yAxisID:'y',
            ...(hasReal ? {} : { backgroundColor: 'rgba(255,255,255,0.07)' }) },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ position:'top', labels:{boxWidth:12, padding:16} },
          tooltip:{mode:'index',intersect:false},
          ...(hasReal ? {} : { annotation: {} }),
        },
        scales:{
          y:{ position:'left', grid:{color:'rgba(255,255,255,0.06)'}, ticks:{stepSize:1}, beginAtZero:true },
          x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{maxTicksLimit:10} },
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'Conecta redes sociales para ver el ritmo de publicación');
  }

  _chartFormatos(formatosRes) {
    const ctx = document.getElementById('chartFormatos');
    if (!ctx) return;
    const hasReal = formatosRes && !formatosRes.isEmpty && Array.isArray(formatosRes.data) && formatosRes.data.length > 0;
    const COLORS = ['rgba(239,68,68,0.8)','rgba(96,165,250,0.8)','rgba(34,197,94,0.8)','rgba(251,191,36,0.8)','rgba(167,139,250,0.8)','rgba(20,184,166,0.8)'];
    const labels = hasReal ? formatosRes.data.map(r => r.label) : ['Sin datos'];
    const values = hasReal ? formatosRes.data.map(r => r.pct)   : [100];
    const colors = hasReal ? COLORS.slice(0, labels.length) : ['rgba(255,255,255,0.07)'];
    this._reg(new Chart(ctx, {
      type:'doughnut',
      data:{ labels, datasets:[{ data:values, backgroundColor:colors, borderColor:'rgba(0,0,0,0)', borderWidth:0, hoverOffset:6 }] },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{
          legend:{position:'bottom', labels:{boxWidth:10, padding:10}},
          tooltip:{callbacks:{label:d=>`${d.label}: ${d.raw}${hasReal ? '%' : ''}`}},
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'Sin posts cargados aún');
  }

  _chartPilares(pilaresRes) {
    const ctx = document.getElementById('chartPilares');
    if (!ctx) return;
    const hasReal = pilaresRes && !pilaresRes.isEmpty && Array.isArray(pilaresRes.data) && pilaresRes.data.length > 0;
    const rows    = hasReal ? pilaresRes.data.slice(0, 8) : [];
    const labels  = hasReal ? rows.map(r => r.pillar_name) : ['Sin pilares configurados'];
    const counts  = hasReal ? rows.map(r => r.post_count || 0) : [0];
    const eng     = hasReal ? rows.map(r => Math.round((r.avg_engagement || 0) * 10) / 10) : [0];
    this._reg(new Chart(ctx, {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'Posts', data:counts, backgroundColor:'rgba(96,165,250,0.7)', borderRadius:4, yAxisID:'y' },
          { label:'Eng. promedio', data:eng, backgroundColor:'rgba(167,139,250,0.5)', borderRadius:4, yAxisID:'y2' },
        ],
      },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{boxWidth:10, padding:14} }, tooltip:{mode:'index',intersect:false} },
        scales:{
          y:  { grid:{display:false} },
          ...(hasReal ? {
            y:  { grid:{display:false} },
            yAxisID: {},
          } : {}),
          x:  { grid:{color:'rgba(255,255,255,0.06)'} },
          y2: { position:'right', grid:{drawOnChartArea:false}, display: hasReal },
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'Configura pilares narrativos en tu brand container');
  }

  _chartOfertas(ofertasRes) {
    const ctx = document.getElementById('chartOfertas');
    if (!ctx) return;
    const hasReal = ofertasRes && !ofertasRes.isEmpty && Array.isArray(ofertasRes.data) && ofertasRes.data.length > 0;
    let labels, datasets;
    if (hasReal) {
      // Agrupar por retailer / promo_label
      const byPromo = {};
      const retailers = [...new Set(ofertasRes.data.map(r => r.retailer))].slice(0, 6);
      ofertasRes.data.forEach(r => {
        const lbl = r.promo_label || 'Promo';
        if (!byPromo[lbl]) byPromo[lbl] = {};
        byPromo[lbl][r.retailer] = (byPromo[lbl][r.retailer] || 0) + 1;
      });
      labels = retailers;
      const COLORS = ['rgba(34,197,94,0.7)','rgba(96,165,250,0.7)','rgba(251,191,36,0.7)','rgba(239,68,68,0.6)'];
      datasets = Object.entries(byPromo).slice(0, 4).map(([promo, byR], i) => ({
        label: promo, data: retailers.map(r => byR[r] || 0),
        backgroundColor: COLORS[i % COLORS.length], borderRadius: 4,
      }));
    } else {
      labels = ['Sin datos de retailer'];
      datasets = [{ label: 'Sin datos', data: [0], backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4 }];
    }
    this._reg(new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{boxWidth:10} }, tooltip:{mode:'index', intersect:false} },
        scales:{
          y:{ title:{display:true, text: hasReal ? 'Usos de promo' : ''}, grid:{color:'rgba(255,255,255,0.06)'} },
          x:{ grid:{display:false} },
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'Carga precios y promociones en retail_prices para activar este widget');
  }

  _chartSentimiento(sentRes) {
    const ctx = document.getElementById('chartSentimiento');
    if (!ctx) return;
    const hasReal = sentRes && !sentRes.isEmpty && sentRes.data?.emotions && Object.keys(sentRes.data.emotions).length > 0;
    const EMOTION_COLORS = {
      alegria:'rgba(34,197,94,0.85)', alegría:'rgba(34,197,94,0.85)', joy:'rgba(34,197,94,0.85)',
      confianza:'rgba(96,165,250,0.85)', trust:'rgba(96,165,250,0.85)',
      sorpresa:'rgba(251,191,36,0.85)', surprise:'rgba(251,191,36,0.85)',
      confusion:'rgba(167,139,250,0.85)', confusión:'rgba(167,139,250,0.85)',
      decepcion:'rgba(156,163,175,0.85)', sadness:'rgba(156,163,175,0.85)',
      ironia:'rgba(249,115,22,0.85)', ironía:'rgba(249,115,22,0.85)',
      enojo:'rgba(239,68,68,0.85)', anger:'rgba(239,68,68,0.85)',
    };
    let labels, values, colors;
    if (hasReal) {
      const entries = Object.entries(sentRes.data.emotions).sort((a,b)=>b[1]-a[1]).slice(0,8);
      const total = entries.reduce((s,[,v])=>s+v, 0);
      labels = entries.map(([e]) => e.charAt(0).toUpperCase() + e.slice(1));
      values = entries.map(([,v]) => total > 0 ? Math.round(v/total*100) : 0);
      colors = entries.map(([e]) => EMOTION_COLORS[e.toLowerCase()] || 'rgba(156,163,175,0.7)');
    } else {
      labels = ['Sin análisis de sentimiento']; values = [100]; colors = ['rgba(255,255,255,0.07)'];
    }
    this._reg(new Chart(ctx, {
      type:'doughnut',
      data:{ labels, datasets:[{ data:values, backgroundColor:colors, borderColor:'rgba(0,0,0,0)', hoverOffset:6 }] },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'55%',
        plugins:{
          legend:{ position:'bottom', labels:{boxWidth:9, padding:8} },
          tooltip:{callbacks:{label:d=>`${d.label}: ${d.raw}${hasReal?'%':''}`}},
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'VERA analizará sentimiento cuando haya posts cargados');
  }

  _chartShadow(shadowRes) {
    const ctx = document.getElementById('chartShadow');
    if (!ctx) return;
    const hasReal = shadowRes && !shadowRes.isEmpty && Array.isArray(shadowRes.data) && shadowRes.data.length > 0;
    let labels, values, colors;
    if (hasReal) {
      // Agrupar por dominio/fuente de entity
      const bySource = {};
      shadowRes.data.forEach(s => {
        const src = s.ai_analysis?.source || s.entity_id || 'Desconocido';
        bySource[src] = (bySource[src] || 0) + 1;
      });
      const sorted = Object.entries(bySource).sort((a,b)=>b[1]-a[1]).slice(0,8);
      labels = sorted.map(([s]) => s.length > 20 ? s.slice(0,18)+'…' : s);
      values = sorted.map(([,v]) => v);
      colors = ['rgba(167,139,250,0.75)','rgba(96,165,250,0.75)','rgba(251,191,36,0.75)',
                'rgba(34,197,94,0.75)','rgba(249,115,22,0.75)','rgba(156,163,175,0.5)',
                'rgba(239,68,68,0.6)','rgba(20,184,166,0.65)'].slice(0, sorted.length);
    } else {
      labels = ['Sin señales']; values = [0]; colors = ['rgba(255,255,255,0.07)'];
    }
    this._reg(new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Menciones detectadas', data:values, backgroundColor:colors, borderRadius:5 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          y:{ grid:{color:'rgba(255,255,255,0.06)'}, beginAtZero:true },
          x:{ grid:{display:false} },
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'OpenClaw detectará shadow mentions cuando active el monitoreo');
  }

  _chartRadar(blindSpotsRes) {
    const ctx = document.getElementById('chartRadar');
    if (!ctx) return;
    const hasReal = blindSpotsRes && !blindSpotsRes.isEmpty && blindSpotsRes.data?.pillars;
    let labels, communicated, actual;
    if (hasReal) {
      const pillars = blindSpotsRes.data.pillars || [];
      const vulns   = blindSpotsRes.data.vulnerabilities || [];
      // Usa pilares huérfanos (post_count=0) como blind spots
      labels = pillars.map(p => p.pillar_name).slice(0, 7);
      if (labels.length < 2) {
        labels      = ['Sin pilares vacíos — ¡bien!'];
        communicated = [100]; actual = [100];
      } else {
        communicated = labels.map(() => 0);          // Pilares huérfanos = 0% comunicado
        actual       = labels.map(() => 70 + Math.random()*30); // Estimado de potencial
      }
    } else {
      labels       = ['Innovación','Comunidad','Soporte','Sustentabilidad','Precio/Valor','Distribución','Contenido'];
      communicated = [0,0,0,0,0,0,0]; actual = [0,0,0,0,0,0,0];
    }
    this._reg(new Chart(ctx, {
      type:'radar',
      data:{
        labels,
        datasets:[
          { label:'Comunicado', data:communicated, borderColor:'rgba(96,165,250,0.9)', backgroundColor:'rgba(96,165,250,0.12)', pointRadius:4, borderWidth:2 },
          { label:'Potencial no comunicado', data:actual, borderColor:'rgba(34,197,94,0.9)', backgroundColor:'rgba(34,197,94,0.08)', pointRadius:4, borderWidth:2, borderDash:[5,3] },
        ],
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom', labels:{boxWidth:10, padding:10} } },
        scales:{
          r:{ min:0, max:100, ticks:{ stepSize:25, color:'rgba(212,209,216,0.4)', backdropColor:'transparent' },
              grid:{ color:'rgba(255,255,255,0.08)' }, pointLabels:{ color:'rgba(212,209,216,0.8)', font:{size:10} } },
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'Configura pilares narrativos para detectar puntos ciegos');
  }

  _chartFuga(fugaRes) {
    const ctx = document.getElementById('chartFuga');
    if (!ctx) return;
    const hasReal = fugaRes && !fugaRes.isEmpty && fugaRes.data?.curve?.length > 0;
    let labels, values;
    if (hasReal) {
      const curve = fugaRes.data.curve;
      labels = curve.map((_, i) => `${i}s`);
      values = curve.map(v => Math.round(v * 10) / 10);
    } else {
      labels = ['0s','5s','10s','15s','20s','25s','30s','45s','60s'];
      values = [0,0,0,0,0,0,0,0,0];
    }
    this._reg(new Chart(ctx, {
      type:'line',
      data:{ labels, datasets:[{
        label:'Retención de audiencia (%)', data:values,
        borderColor:'rgba(249,115,22,0.9)', borderWidth:2.5,
        backgroundColor: hasReal ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)',
        fill:true, tension:0.4, pointRadius: hasReal ? 4 : 0, pointHoverRadius:6,
      }]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:d=>`Retención: ${d.raw}%`}} },
        scales:{
          y:{ max:100, min:0, grid:{color:'rgba(255,255,255,0.06)'}, ticks:{callback:v=>`${v}%`}, title:{display:true,text:'Retención (%)'} },
          x:{ grid:{display:false}, title:{display:true,text:'Segundo'} },
        },
      },
    }));
    if (!hasReal) this._overlayEmpty(ctx, 'Disponible cuando Meta envíe datos de retención de video');
  }

  /* ── Heatmap horario — CSS/HTML puro ─────────────────────── */
  _buildHeatmap(heatmapRes) {
    const el = document.getElementById('mbHeatmap');
    if (!el) return;
    const hasReal = heatmapRes && !heatmapRes.isEmpty && heatmapRes.data?.hour;
    const days    = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const hours   = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}h`);

    let maxVal = 1;
    const hMap = hasReal ? heatmapRes.data.hour : {};
    const bestH = hasReal ? heatmapRes.data.bestHour : null;

    if (hasReal) {
      maxVal = Math.max(1, ...Object.values(hMap).map(Number));
    }

    const cellVal = (h) => {
      if (hasReal) return (Number(hMap[h] || hMap[String(h)] || 0) / maxVal);
      // Demo pattern si no hay datos
      if (h>=6&&h<=9)  return 0.4 + Math.random()*0.3;
      if (h>=12&&h<=14)return 0.35+ Math.random()*0.3;
      if (h>=20&&h<=23)return 0.45+ Math.random()*0.25;
      return Math.random()*0.18;
    };

    let html = `<div class="mb-heatmap-days"><span class="mb-hm-day-spacer"></span>${hours.map(h=>`<span class="mb-hm-hour">${h}</span>`).join('')}</div>`;
    days.forEach(d => {
      html += `<div class="mb-heatmap-row"><span class="mb-hm-day">${d}</span>`;
      for (let h=0;h<24;h++) {
        const v = cellVal(h);
        const isBest = hasReal && h === bestH;
        const alpha  = (v*0.85+0.05).toFixed(2);
        const color  = v>0.7 ? `rgba(239,68,68,${alpha})` : v>0.45 ? `rgba(251,191,36,${alpha})` : v>0.2 ? `rgba(96,165,250,${alpha})` : `rgba(255,255,255,0.04)`;
        html += `<span class="mb-hm-cell${isBest?' mb-hm-best':''}" style="background:${color}" title="${d} ${h}:00${hasReal?` — Engagement: ${Math.round(v*100)}`:' (estimado)'}%"></span>`;
      }
      html += `</div>`;
    });
    if (!hasReal) {
      html += `<p class="mb-hm-no-data"> Conecta Meta o Google Analytics para ver datos reales de interacción horaria</p>`;
    }
    el.innerHTML = html;
  }

  /* ── Semantic cloud ────────────────────────────────────────── */
  _buildSemanticCloud(semanticaRes) {
    const el = document.getElementById('mbSemanticCloud');
    if (!el) return;
    const COLORS = ['#60a5fa','#34d399','#a78bfa','#fbbf24','#f87171','#14b8a6','#f472b6'];
    const hasReal = semanticaRes && !semanticaRes.isEmpty && Array.isArray(semanticaRes.data) && semanticaRes.data.length > 0;

    if (hasReal) {
      const maxW = Math.max(...semanticaRes.data.map(r=>r.weight), 1);
      el.innerHTML = semanticaRes.data.map((r, i) => {
        const size = (1.0 + (r.weight/maxW) * 1.2).toFixed(2);
        const color = COLORS[i % COLORS.length];
        return `<span class="mb-semantic-word" style="font-size:${size}rem;color:${color}" title="Peso: ${r.weight}">${this._esc(r.word)}</span>`;
      }).join('');
    } else {
      // Mostrar las palabras clave de los containers si existen
      const allWords = [];
      if (window.MiBrandaDataService) {
        // Las palabras clave ya están en los containers cargados
      }
      el.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;padding:0.5rem 0">Las palabras clave y conceptos resonantes aparecerán aquí cuando VERA analice el contenido publicado.</p>`;
    }
  }

  /* ── Missions / OpenClaw activity ─────────────────────────── */
  _buildMBMissions(missionsRes, crisisRes) {
    const el = document.getElementById('mbMissions');
    if (!el) return;
    const hasMissions = missionsRes && !missionsRes.isEmpty && Array.isArray(missionsRes.data) && missionsRes.data.length > 0;

    if (!hasMissions) {
      el.innerHTML = `<div class="mb-mission mb-m--none"><span class="mb-mission-msg">OpenClaw no tiene misiones activas en este momento. Los datos se actualizarán automáticamente.</span><span class="mb-mission-time">Ahora</span></div>`;
      return;
    }

    const statusCls  = { completed:'mb-m--done', running:'mb-m--running', pending:'mb-m--running', failed:'mb-m--alert' };
    el.innerHTML = missionsRes.data.map(m => {
      const st  = m.status || 'pending';
      const msg = m.result_reference?.summary || m.action_payload?.description || `Misión: ${m.mission_type}`;
      const time = this._relTime(m.created_at);
      return `<div class="mb-mission ${statusCls[st] || 'mb-m--running'}"><span class="mb-mission-msg">${this._esc(msg)}</span><span class="mb-mission-time">${time}</span></div>`;
    }).join('');
  }

  /* ── Widgets HTML que dependen de datos ──────────────────── */
  _renderMAPWidget(mapRes) {
    const el = document.getElementById('mbMAPBody');
    if (!el) return;
    const hasReal = mapRes && !mapRes.isEmpty && Array.isArray(mapRes.data) && mapRes.data.length > 0;
    if (!hasReal) {
      el.innerHTML = this._emptyState('Sin datos de precio', 'Cuando OpenClaw capture precios de retailers, aparecerán aquí con semáforo de cumplimiento MAP.');
      return;
    }
    const statusLabel = { ok:'Cumple', alert:'Viola MAP', warning:'Revisar' };
    const statusCls   = { ok:'mb-map--ok', alert:'mb-map--alert', warning:'mb-map--warning' };
    const fmt = (n, cur) => n != null ? `${cur || 'MXN'} $${Number(n).toLocaleString()}` : '—';
    const fmtDelta = (d, cur) => d == null ? '—' : `${d>=0?'+':''}${cur||'MXN'} $${Math.abs(d).toLocaleString()}`;
    el.innerHTML = `
      <div class="mb-map-table-wrap">
        <table class="mb-map-table">
          <thead><tr><th>Retailer</th><th>Producto</th><th>Precio actual</th><th>MAP</th><th>Diferencia</th><th>Estado</th></tr></thead>
          <tbody>
            ${mapRes.data.slice(0,10).map(r => `<tr>
              <td>${this._esc(r.retailer)}</td>
              <td>${this._esc(r.product || r.sku)}</td>
              <td class="mb-map-price">${fmt(r.price, r.currency)}</td>
              <td class="mb-map-price mb-map-ref">${fmt(r.map, r.currency)}</td>
              <td class="mb-map-delta ${r.status==='alert'?'mb-delta--neg':r.status==='warning'?'mb-delta--warn':'mb-delta--pos'}">${fmtDelta(r.delta, r.currency)}</td>
              <td><span class="mb-map-badge ${statusCls[r.status]}"> ${statusLabel[r.status]}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  _renderStockWidget(stockRes) {
    const el = document.getElementById('mbStockBody');
    if (!el) return;
    const hasReal = stockRes && !stockRes.isEmpty && Array.isArray(stockRes.data) && stockRes.data.length > 0;
    if (!hasReal) {
      el.innerHTML = this._emptyState('Sin datos de stock', 'OpenClaw mostrará disponibilidad en Amazon, Mercado Libre y otros retailers cuando active el monitoreo.');
      return;
    }
    // Construir grilla dinámica de (sku x retailer)
    const bySkuRetailer = {};
    const skus = [], retailers = [];
    stockRes.data.forEach(r => {
      if (!skus.includes(r.sku)) skus.push(r.sku);
      if (!retailers.includes(r.retailer)) retailers.push(r.retailer);
      bySkuRetailer[`${r.sku}|${r.retailer}`] = r.stock_status;
    });
    const icon = { in_stock:'✓', out_of_stock:'✗', low_stock:'!', unknown:'?' };
    const cls  = { in_stock:'mb-stock--ok', out_of_stock:'mb-stock--out', low_stock:'mb-stock--low', unknown:'mb-stock--low' };
    el.innerHTML = `
      <div class="mb-stock-grid">
        <div class="mb-stock-header-row" style="grid-template-columns:1.5fr ${retailers.map(()=>'1fr').join(' ')}">
          <span>Producto</span>${retailers.map(r=>`<span>${r}</span>`).join('')}
        </div>
        ${skus.slice(0,6).map(sku => `
          <div class="mb-stock-row" style="grid-template-columns:1.5fr ${retailers.map(()=>'1fr').join(' ')}">
            <span class="mb-stock-name">${sku}</span>
            ${retailers.map(ret => {
              const st = bySkuRetailer[`${sku}|${ret}`] || 'unknown';
              return `<span class="mb-stock-cell ${cls[st]}">${icon[st]||'?'}</span>`;
            }).join('')}
          </div>`).join('')}
      </div>`;
  }

  _renderInfluenceWidget(influenciaRes) {
    const el = document.getElementById('mbInfluenceBody');
    if (!el) return;
    const hasReal = influenciaRes && !influenciaRes.isEmpty && Array.isArray(influenciaRes.data) && influenciaRes.data.length > 0;
    if (!hasReal) {
      el.innerHTML = this._emptyState('Sin entidades monitoreadas', 'Agrega intelligence_entities para rastrear influencers reales y su impacto en la marca.');
      return;
    }
    el.innerHTML = `<div class="mb-influence-list">${influenciaRes.data.slice(0,5).map((p, i) => {
      const score = Math.min(100, Math.round((p.influenceScore || 0)));
      const plat  = (p.platform || 'web').toLowerCase();
      return `<div class="mb-influence-row">
        <span class="mb-inf-rank">#${i+1}</span>
        <div class="mb-inf-info">
          <span class="mb-inf-name">${this._esc(p.target_identifier || p.name)}</span>
          <span class="mb-inf-type">${this._esc(p.name)}${p.followers ? ` · ${p.followers}` : ''}</span>
        </div>
        
        <div class="mb-inf-score-wrap">
          <div class="mb-inf-bar" style="width:${score}%"></div>
          <span class="mb-inf-score">${score}</span>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  _renderCrisisWidget(crisisRes) {
    const el = document.getElementById('mbCrisisBody');
    if (!el) return;
    const hasData = crisisRes && !crisisRes.isEmpty && crisisRes.data;
    const vulns   = hasData ? (crisisRes.data.vulnerabilities || []) : [];
    if (!vulns.length) {
      el.innerHTML = `<div class="mb-crisis-event mb-crisis--none"><div class="mb-crisis-icon"></div><div class="mb-crisis-body"><p class="mb-crisis-msg">No hay crisis ni vulnerabilidades activas. ✓</p><div class="mb-crisis-meta"><span class="mb-crisis-time">Ahora</span><span class="mb-crisis-action">Todo en orden</span></div></div></div>`;
      return;
    }
    const lvlCls  = { low:'mb-crisis--low', medium:'mb-crisis--low', high:'mb-crisis--med', critical:'mb-crisis--high' };
    el.innerHTML = `<div class="mb-crisis-timeline">${vulns.slice(0,5).map(v => `
      <div class="mb-crisis-event ${lvlCls[v.severity]||'mb-crisis--low'}">
        <div class="mb-crisis-icon"></div>
        <div class="mb-crisis-body">
          <p class="mb-crisis-msg">${this._esc(v.title)}${v.description ? ' — ' + this._esc(v.description.slice(0,120)) : ''}</p>
          <div class="mb-crisis-meta">
            <span class="mb-crisis-time">${this._relTime(v.created_at)}</span>
            <span class="mb-crisis-action">${v.status === 'in_progress' ? 'En revisión' : 'Abierta'}</span>
          </div>
        </div>
      </div>`).join('')}</div>`;
  }

  _renderSWOTWidget(swotRes) {
    const el = document.getElementById('mbSWOTBody');
    if (!el) return;
    const hasReal = swotRes && !swotRes.isEmpty && swotRes.data;
    if (!hasReal) {
      el.innerHTML = this._emptyState('SWOT en construcción', 'VERA analizará fortalezas, debilidades, oportunidades y amenazas cuando haya suficientes datos.');
      return;
    }
    const d = swotRes.data;
    const quad = (title, items, cls) => {
      const list = items.length ? items.map(i=>`<li class="mb-swot-item">${this._esc(i.text || i)}</li>`).join('') : `<li class="mb-swot-item mb-swot-empty">Sin datos aún</li>`;
      return `<div class="mb-swot-quad ${cls}"><div class="mb-swot-quad-header">${title}</div><ul class="mb-swot-list">${list}</ul></div>`;
    };
    el.innerHTML = `<div class="mb-swot-grid">
      ${quad('Fortalezas',    d.strengths || [],     'mb-swot--strength')}
      ${quad('Oportunidades', d.opportunities || [], 'mb-swot--opportunity')}
      ${quad('Debilidades',   d.weaknesses || [],    'mb-swot--weakness')}
      ${quad('Amenazas',      d.threats || [],       'mb-swot--threat')}
    </div>`;
  }

  /* ── Helpers UI ─────────────────────────────────────────────── */
  _overlayEmpty(canvas, msg) {
    const wrap = canvas.closest('.mb-widget-body') || canvas.parentElement;
    if (!wrap) return;
    const ov = document.createElement('div');
    ov.className = 'mb-chart-empty-overlay';
    ov.innerHTML = `<span>${msg}</span>`;
    canvas.style.opacity = '0.15';
    wrap.style.position = 'relative';
    wrap.appendChild(ov);
  }

  _emptyState(title, desc) {
    return `<div class="mb-empty-state"><strong>${title}</strong><p>${desc}</p></div>`;
  }

  _relTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 1)   return 'Ahora';
    if (min < 60)  return `Hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)    return `Hace ${h} h`;
    return `Hace ${Math.floor(h/24)} d`;
  }

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

  _buildCompetenceHTML() {
    return `
    <div class="cc-dashboard">

      <!-- ── KPI Strip ── -->
      <div class="cc-kpi-strip">
        ${this._ccKpi('Share of Voice',          '34%',  'Nosotros vs mercado',    'blue')}
        ${this._ccKpi('Posts rival / sem',       '31',   '−3 vs semana ant.',      'orange')}
        ${this._ccKpi('Reviews neg. detectadas', '247',  '↑ 18 esta semana',       'red')}
        ${this._ccKpi('Anuncios activos',        '14',   'Meta · Google · TikTok', 'purple')}
        ${this._ccKpi('Vulnerabilidades',      '6',    'Explotables hoy',        'yellow')}
        ${this._ccKpi('SKUs sin stock rival',    '3',    'Oportunidad inmediata',  'green')}
      </div>

      <!-- ── OpenClaw Mission Control ── -->
      <div class="cc-mission-control">
        <div class="cc-mc-header">
          <span> OpenClaw Mission Control</span>
          <span class="cc-pulse-dot"></span>
        </div>
        <div class="cc-mc-missions" id="ccMissions"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM A · THE PRICE WAR
      ══════════════════════════════════════════════ -->
      ${this._ccDim('The Price War', 'Precios cross-platform, stock crítico y bundles del rival')}

      <div class="cc-dim-row">
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Monitor de Precios SKU vs SKU</span>
            <span class="cc-badge cc-badge--blue">Cross-Platform</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartPrecios" height="200"></canvas>
          </div>
        </div>
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Stock Crítico del Rival</span>
            <span class="cc-badge cc-badge--red">Oportunidad</span>
          </div>
          <div class="cc-widget-body">
            ${this._ccStockRival()}
          </div>
        </div>
      </div>

      <div class="cc-widget cc-widget--full">
        <div class="cc-widget-header">
          <span class="cc-widget-title">Análisis de Ofertas y Bundles del Rival</span>
          <span class="cc-badge cc-badge--orange">Canibalización</span>
        </div>
        <div class="cc-widget-body">
          ${this._ccBundlesTable()}
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM B · THE CONTENT BATTLE
      ══════════════════════════════════════════════ -->
      ${this._ccDim('The Content Battle', 'Temas ganadores, engagement real y lanzamientos en la sombra')}

      <div class="cc-dim-row">
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Temas Ganadores del Rival</span>
            <span class="cc-badge cc-badge--orange">Fórmula viral</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartTemas" height="220"></canvas>
          </div>
        </div>
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Benchmarking de Engagement Real</span>
            <span class="cc-badge cc-badge--blue">Nosotros vs Rival</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartEngagement" height="200"></canvas>
          </div>
        </div>
      </div>

      <div class="cc-widget cc-widget--full">
        <div class="cc-widget-header">
          <span class="cc-widget-title">Detección de Lanzamientos en la Sombra</span>
          <span class="cc-badge cc-badge--purple">Anticipación</span>
        </div>
        <div class="cc-widget-body">
          ${this._ccShadowLaunches()}
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM C · ATTACK SURFACE
      ══════════════════════════════════════════════ -->
      ${this._ccDim('Attack Surface', 'Reviews negativas explotables y crisis de reputación del rival')}

      <div class="cc-dim-row">
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Reviews Negativas del Rival — Puntos de Dolor</span>
            <span class="cc-badge cc-badge--red">Explotable</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartPain" height="180"></canvas>
          </div>
        </div>
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Crisis de Reputación del Rival</span>
            <span class="cc-badge cc-badge--red">Alerta activa</span>
          </div>
          <div class="cc-widget-body">
            ${this._ccCrisisRival()}
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM D · AD INTELLIGENCE
      ══════════════════════════════════════════════ -->
      ${this._ccDim('Ad Intelligence', 'Radar de pauta digital e influencer mapping del rival')}

      <div class="cc-dim-row">
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Radar de Pauta Digital</span>
            <span class="cc-badge cc-badge--purple">Inversión estimada</span>
          </div>
          <div class="cc-widget-body mb-widget-body--center">
            <canvas id="ccChartAds" height="230"></canvas>
          </div>
        </div>
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Influencer Mapping del Rival</span>
            <span class="cc-badge cc-badge--blue">Oportunidad de captura</span>
          </div>
          <div class="cc-widget-body">
            ${this._ccInfluencerMap()}
          </div>
        </div>
      </div>

      <!-- ── Share of Voice ── -->
      ${this._ccDim('Share of Voice', 'Cuota de atención del nicho — quién domina la conversación')}
      <div class="cc-dim-row">
        <div class="cc-widget mb-widget-body--center">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Share of Voice — Nicho</span>
            <span class="cc-badge cc-badge--blue">Tiempo real</span>
          </div>
          <div class="cc-widget-body mb-widget-body--center">
            <canvas id="ccChartSOV" height="240"></canvas>
          </div>
        </div>
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title">Share of Voice — Evolución 30 días</span>
            <span class="cc-badge cc-badge--green">Tendencia</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartSOVLine" height="210"></canvas>
          </div>
        </div>
      </div>

      <!-- Footer demo -->
      <div class="mb-demo-note">
        
        <span>Datos <strong>simulados para demostración</strong>. OpenClaw conectará inteligencia real con scraping y APIs de terceros.</span>
      </div>

    </div>`;
  }

  /* ── Helpers competencia ─────────────────────────────── */
  _ccDim(title, subtitle) {
    return `
      <div class="mb-dim-header cc-dim-header">
        <div>
          <div class="mb-dim-title">${this._esc(title)}</div>
          <div class="mb-dim-subtitle">${this._esc(subtitle)}</div>
        </div>
      </div>`;
  }

  _ccKpi(label, value, sub, color) {
    return `
      <div class="mb-kpi-card mb-kpi--${color} cc-kpi-card">
        <div class="mb-kpi-body">
          <div class="mb-kpi-value">${value}</div>
          <div class="mb-kpi-label">${label}</div>
          <div class="mb-kpi-sub">${sub}</div>
        </div>
      </div>`;
  }

  _ccStockRival() {
    const rows = [
      { product: 'Rival Pro 3000',   amazon: 'out', ml: 'out',  walmart: 'ok',  note: '🟢 Lanzar campaña Amazon' },
      { product: 'Rival Compact X',  amazon: 'ok',  ml: 'low',  walmart: 'low', note: '🟡 Vigilar MLibre' },
      { product: 'Rival Classic',    amazon: 'low', ml: 'ok',   walmart: 'out', note: '🟢 Lanzar en Walmart' },
      { product: 'Rival Mini',       amazon: 'ok',  ml: 'ok',   walmart: 'ok',  note: '⚪ Sin oportunidad' },
    ];
    const icon = { ok: '✓', low: '!', out: '✗' };
    const cls  = { ok: 'mb-stock--ok', low: 'mb-stock--low', out: 'mb-stock--out' };
    return `
      <div class="mb-stock-grid cc-stock">
        <div class="mb-stock-header-row cc-stock-hdr">
          <span>Producto rival</span><span>AMZ</span><span>ML</span><span>WMT</span><span>Acción</span>
        </div>
        ${rows.map(r => `
          <div class="mb-stock-row cc-stock-row5">
            <span class="mb-stock-name">${r.product}</span>
            <span class="mb-stock-cell ${cls[r.amazon]}">${icon[r.amazon]}</span>
            <span class="mb-stock-cell ${cls[r.ml]}">${icon[r.ml]}</span>
            <span class="mb-stock-cell ${cls[r.walmart]}">${icon[r.walmart]}</span>
            <span class="cc-stock-action">${r.note}</span>
          </div>`).join('')}
        <div class="mb-stock-legend">
          <span class="mb-stock--ok">✓ Con stock</span>
          <span class="mb-stock--low">! Bajo</span>
          <span class="mb-stock--out">✗ Agotado</span>
        </div>
      </div>`;
  }

  _ccBundlesTable() {
    const bundles = [
      { rival: 'Rival A', bundle: 'Kit Cocina Pro (3 pzas)', plataforma: 'Amazon MX',     precio: '$2,499', tipo: '2x1',       impacto: 'Alto',  accion: 'Lanzar bundle superior' },
      { rival: 'Rival A', bundle: 'Combo Hogar Esencial',    plataforma: 'Mercado Libre',  precio: '$1,199', tipo: '20% dto',   impacto: 'Medio', accion: 'Igualar precio' },
      { rival: 'Rival B', bundle: 'Pack Mini + Accesorios',  plataforma: 'Walmart MX',     precio: '$899',   tipo: 'Bundle',    impacto: 'Alto',  accion: 'Crear contra-bundle' },
      { rival: 'Rival B', bundle: 'Flash Sale 48h',          plataforma: 'Tienda propia',  precio: '$749',   tipo: 'Flash',     impacto: 'Bajo',  accion: 'Monitorear' },
    ];
    const impactoCls = { Alto: 'cc-impact--high', Medio: 'cc-impact--med', Bajo: 'cc-impact--low' };
    return `
      <div class="cc-table-wrap">
        <table class="mb-map-table cc-table">
          <thead><tr>
            <th>Rival</th><th>Bundle / Oferta</th><th>Plataforma</th>
            <th>Precio</th><th>Tipo</th><th>Impacto</th><th>Acción sugerida</th>
          </tr></thead>
          <tbody>
            ${bundles.map(b => `<tr>
              <td>${b.rival}</td>
              <td style="color:var(--text-primary);font-weight:500">${b.bundle}</td>
              <td>${b.plataforma}</td>
              <td class="mb-map-price">${b.precio}</td>
              <td><span class="cc-type-badge">${b.tipo}</span></td>
              <td><span class="cc-impact ${impactoCls[b.impacto]}">${b.impacto}</span></td>
              <td class="cc-action-cell">${b.accion}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  _ccShadowLaunches() {
    const signals = [
      { date: 'Hace 3 d',  confidence: 87, signal: 'Registro de dominio "rivalpromax.mx" detectado — posible línea premium.', type: 'dominio', action: 'Preparar contenido anticipatorio' },
      { date: 'Hace 5 d',  confidence: 74, signal: 'Nueva categoría "Profesional" apareció en menú de su web (etiqueta "coming-soon" oculta en HTML).', type: 'web', action: 'Auditar sus webs cada 6h' },
      { date: 'Hace 8 d',  confidence: 62, signal: 'Pico de contrataciones en LinkedIn: 4 diseñadores de packaging en los últimos 15 días.', type: 'linkedin', action: 'Monitorear lanzamientos Q2' },
      { date: 'Hace 12 d', confidence: 41, signal: 'Cambio en pie de página: eliminaronSKU de producto — posible discontinuación.', type: 'web', action: 'Oportunidad en ese segmento' },
    ];
    const confColor = (c) => c>=80 ? '#f87171' : c>=60 ? '#fbbf24' : '#60a5fa';
    return `
      <div class="cc-shadow-list">
        ${signals.map(s => `
          <div class="cc-shadow-row">
            <div class="cc-shadow-icon"></div>
            <div class="cc-shadow-body">
              <p class="cc-shadow-msg">${s.signal}</p>
              <div class="cc-shadow-meta">
                <span class="cc-shadow-date">${s.date}</span>
                <span class="cc-shadow-action"> ${s.action}</span>
              </div>
            </div>
            <div class="cc-shadow-conf">
              <div class="cc-conf-ring" style="--conf-color:${confColor(s.confidence)}">
                <span>${s.confidence}%</span>
              </div>
              <span class="cc-conf-label">confianza</span>
            </div>
          </div>`).join('')}
      </div>`;
  }

  _ccCrisisRival() {
    const crises = [
      { level: 'high', product: 'Rival Pro 3000', issue: 'Defecto de motor — 312 quejas en Amazon en 48 h. Hashtag #RivalFalla trending.',      window: '72 h para capturar' },
      { level: 'med',  product: 'Rival Compact X', issue: 'Soporte al cliente no responde — foro ForoCocinaMX con 89 posts negativos.',          window: '5 días activo' },
      { level: 'low',  product: 'Rival Classic',   issue: 'Retraso de envíos en Walmart — 34 comentarios. Riesgo bajo de escalar.',              window: 'Monitoreo pasivo' },
    ];
    const levelCls  = { high: 'cc-crisis--high', med: 'cc-crisis--med', low: 'cc-crisis--low' };
    const levelLbl  = { high: 'Crisis activa', med: 'En desarrollo', low: 'Latente' };
    return `
      <div class="cc-crisis-list">
        ${crises.map(c => `
          <div class="cc-crisis-item ${levelCls[c.level]}">
            <div class="cc-crisis-top">
              
              <span class="cc-crisis-product">${c.product}</span>
              <span class="cc-crisis-badge">${levelLbl[c.level]}</span>
            </div>
            <p class="cc-crisis-desc">${c.issue}</p>
            <div class="cc-crisis-window"> ${c.window}</div>
          </div>`).join('')}
      </div>`;
  }

  _ccInfluencerMap() {
    const list = [
      { handle: '@chefcarlos_mx',   plat: 'ig', followers: '128K', reach: 94, trabajaCon: 'Rival A', capturable: true,  note: 'Audiencia alineada al 100%'  },
      { handle: '@recetasfaciles',  plat: 'yt', followers: '240K', reach: 88, trabajaCon: 'Rival B', capturable: true,  note: 'Contrato vence en 60 días'   },
      { handle: '@hogarmoderno',    plat: 'tt', followers: '87K',  reach: 76, trabajaCon: 'Rival A', capturable: false, note: 'Contrato exclusivo 1 año'    },
      { handle: '@cocinafusion',    plat: 'ig', followers: '55K',  reach: 71, trabajaCon: 'Rival B', capturable: true,  note: 'Microinfluencer de alto CTR'  },
      { handle: 'ForoCocinaMX',     plat: 'web',followers: '31K', reach: 65, trabajaCon: 'Rival A', capturable: true,  note: 'Comunidad orgánica valiosa'  },
    ];
    return `
      <div class="cc-inf-table-wrap">
        <table class="mb-map-table cc-table cc-inf-table">
          <thead><tr>
            <th>Perfil</th><th>Red</th><th>Seguidores</th>
            <th>Afinidad</th><th>Trabaja con</th><th>Capturable</th><th>Nota OpenClaw</th>
          </tr></thead>
          <tbody>
            ${list.map(r => `<tr>
              <td style="color:var(--text-primary);font-weight:600">${r.handle}</td>
              <td></td>
              <td>${r.followers}</td>
              <td>
                <div class="cc-reach-bar-wrap">
                  <div class="cc-reach-bar" style="width:${r.reach}%"></div>
                  <span>${r.reach}</span>
                </div>
              </td>
              <td>${r.trabajaCon}</td>
              <td>${r.capturable ? '<span class="cc-cap--yes"> Sí</span>' : '<span class="cc-cap--no"> No</span>'}</td>
              <td style="font-size:0.75rem;color:var(--text-muted)">${r.note}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Mission Control (OpenClaw autonomous actions) ── */
  _buildMissions() {
    return [
      { status: 'done',    msg: 'Misión: Neutralizar oferta rival en Amazon MX — Generados 4 activos comparativos. Estado: Al aire.', time: 'Hace 22 min' },
      { status: 'running', msg: 'Misión: Capturar clientes de crisis "Rival Pro 3000" — Redactando 3 variantes de contenido.', time: 'En curso' },
      { status: 'alert',   msg: 'Alerta: Rival B bajó precio en Mercado Libre −$130 — Requiere aprobación para igualar.', time: 'Hace 5 min' },
      { status: 'done',    msg: 'Misión: Counter al bundle "Kit Cocina Pro" — Publicado bundle Oster con ahorro adicional de $200.', time: 'Hace 2 h' },
    ];
  }

  /* ─────────────────────────────────────────────────────────
     CHART.JS — Gráficos de Competencia
  ───────────────────────────────────────────────────────── */
  _initCompetenceCharts() {
    if (!window.Chart) return;
    this._ccChartPrecios();
    this._ccChartTemas();
    this._ccChartEngagement();
    this._ccChartPain();
    this._ccChartAds();
    this._ccChartSOV();
    this._ccChartSOVLine();
    this._buildMissionControl();
  }

  _ccChartPrecios() {
    const ctx = document.getElementById('ccChartPrecios');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Oster Pro 1200\nvs Rival Pro 3000', 'Oster Classic 800\nvs Rival Classic', 'Oster Mini Chef\nvs Rival Mini', 'Oster Compact\nvs Rival Compact X'],
        datasets: [
          { label: 'Nosotros — Amazon',  data: [1299,899,549,699], backgroundColor: 'rgba(96,165,250,0.75)',  borderRadius: 4 },
          { label: 'Rival — Amazon',     data: [1249,920,579,679], backgroundColor: 'rgba(239,68,68,0.65)',   borderRadius: 4 },
          { label: 'Nosotros — M.Libre', data: [1180,870,539,685], backgroundColor: 'rgba(96,165,250,0.4)',   borderRadius: 4, borderColor: 'rgba(96,165,250,0.7)', borderWidth: 1 },
          { label: 'Rival — M.Libre',    data: [1199,855,559,690], backgroundColor: 'rgba(239,68,68,0.35)',   borderRadius: 4, borderColor: 'rgba(239,68,68,0.6)',  borderWidth: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: v => `$${v.toLocaleString()}` } },
          x: { grid: { display: false }, ticks: { maxRotation: 0, font: { size: 10 } } },
        },
      },
    }));
  }

  _ccChartTemas() {
    const ctx = document.getElementById('ccChartTemas');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Recetas fáciles', 'Unboxing', 'Comparativas', 'Lifestyle', 'Tutoriales', 'Humor/tendencia'],
        datasets: [
          { label: 'Rival (engagement promedio)',  data: [8.4, 6.1, 5.9, 7.2, 4.8, 9.3], backgroundColor: 'rgba(239,68,68,0.7)',  borderRadius: 4 },
          { label: 'Nosotros (engagement promedio)', data: [6.2, 4.4, 7.1, 5.5, 5.9, 3.1], backgroundColor: 'rgba(96,165,250,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10 } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { max: 12, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Engagement (%)' } },
          y: { grid: { display: false } },
        },
      },
    }));
  }

  _ccChartEngagement() {
    const ctx = document.getElementById('ccChartEngagement');
    if (!ctx) return;
    const labels = Array.from({length: 12}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 33 + i * 3); return `${d.getDate()}/${d.getMonth()+1}`; });
    this._reg(new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Nosotros', data: [4.1,4.3,3.8,4.6,4.9,4.4,5.1,4.8,4.7,5.3,4.6,4.8], borderColor: 'rgba(96,165,250,0.9)', backgroundColor: 'rgba(96,165,250,0.1)', borderWidth: 2.5, tension: 0.4, fill: true, pointRadius: 3 },
          { label: 'Rival A',  data: [5.2,5.8,5.1,6.2,5.7,4.9,5.4,5.8,6.1,5.5,6.3,5.9], borderColor: 'rgba(239,68,68,0.9)',  backgroundColor: 'rgba(239,68,68,0.07)',  borderWidth: 2.5, tension: 0.4, fill: true, pointRadius: 3 },
          { label: 'Rival B',  data: [3.4,3.6,3.9,3.2,3.8,4.1,3.7,3.5,3.9,4.0,3.6,3.8], borderColor: 'rgba(251,191,36,0.9)', backgroundColor: 'rgba(251,191,36,0.06)',  borderWidth: 2, tension: 0.4, fill: false, borderDash: [5,3], pointRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: v => `${v}%` }, title: { display: true, text: 'Engagement rate (%)' } },
          x: { grid: { display: false } },
        },
      },
    }));
  }

  _ccChartPain() {
    const ctx = document.getElementById('ccChartPain');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['"Se rompe fácil"', '"Soporte lento"', '"Cable muy corto"', '"Ruido excesivo"', '"Difícil limpiar"', '"Garantía no cumple"', '"Precio no justificado"'],
        datasets: [{
          label: 'Menciones negativas detectadas',
          data: [312, 247, 189, 156, 134, 98, 87],
          backgroundColor: [
            'rgba(239,68,68,0.85)', 'rgba(239,68,68,0.75)', 'rgba(249,115,22,0.75)',
            'rgba(249,115,22,0.7)', 'rgba(251,191,36,0.7)', 'rgba(251,191,36,0.65)', 'rgba(156,163,175,0.6)',
          ],
          borderRadius: 5,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: () => '→ Crear contenido que ataque este punto' } },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Menciones negativas' } },
          y: { grid: { display: false } },
        },
      },
    }));
  }

  _ccChartAds() {
    const ctx = document.getElementById('ccChartAds');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Meta (video)', 'Meta (carrusel)', 'Google Search', 'Google Display', 'TikTok', 'YouTube Pre-roll'],
        datasets: [
          { label: 'Rival A — inversión estimada',   data: [85, 62, 78, 45, 90, 55], borderColor: 'rgba(239,68,68,0.9)',  backgroundColor: 'rgba(239,68,68,0.1)',  pointRadius: 4, borderWidth: 2 },
          { label: 'Rival B — inversión estimada',   data: [55, 80, 40, 70, 35, 60], borderColor: 'rgba(251,191,36,0.9)', backgroundColor: 'rgba(251,191,36,0.08)', pointRadius: 4, borderWidth: 2 },
          { label: 'Nosotros — posicionamiento',     data: [70, 55, 85, 60, 50, 45], borderColor: 'rgba(96,165,250,0.9)', backgroundColor: 'rgba(96,165,250,0.1)',  pointRadius: 4, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10 } } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, color: 'rgba(212,209,216,0.4)', backdropColor: 'transparent' },
            grid: { color: 'rgba(255,255,255,0.08)' },
            pointLabels: { color: 'rgba(212,209,216,0.8)', font: { size: 10 } },
          },
        },
      },
    }));
  }

  _ccChartSOV() {
    const ctx = document.getElementById('ccChartSOV');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Nosotros', 'Rival A', 'Rival B', 'Rival C', 'Otros'],
        datasets: [{
          data: [34, 28, 19, 11, 8],
          backgroundColor: ['rgba(96,165,250,0.85)', 'rgba(239,68,68,0.8)', 'rgba(251,191,36,0.8)', 'rgba(167,139,250,0.8)', 'rgba(156,163,175,0.6)'],
          borderColor: 'rgba(0,0,0,0)', hoverOffset: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10 } },
          tooltip: { callbacks: { label: d => `${d.label}: ${d.raw}%` } },
        },
      },
    }));
  }

  _ccChartSOVLine() {
    const ctx = document.getElementById('ccChartSOVLine');
    if (!ctx) return;
    const labels = Array.from({length: 10}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 27 + i * 3); return `${d.getDate()}/${d.getMonth()+1}`; });
    this._reg(new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Nosotros', data: [29,30,31,30,32,33,31,34,33,34], borderColor: 'rgba(96,165,250,0.9)', backgroundColor: 'rgba(96,165,250,0.12)', borderWidth: 2.5, tension: 0.4, fill: true, pointRadius: 3 },
          { label: 'Rival A',  data: [31,30,30,31,29,28,30,28,29,28], borderColor: 'rgba(239,68,68,0.8)',  backgroundColor: 'rgba(239,68,68,0.07)',  borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3 },
          { label: 'Rival B',  data: [20,21,20,19,21,20,19,20,20,19], borderColor: 'rgba(251,191,36,0.8)', borderWidth: 2, borderDash: [4,3], tension: 0.4, fill: false, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          y: { max: 45, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: v => `${v}%` } },
          x: { grid: { display: false } },
        },
      },
    }));
  }

  _buildMissionControl() {
    const el = document.getElementById('ccMissions');
    if (!el) return;
    const missions = this._buildMissions();
    const statusCls = { done: 'cc-m--done', running: 'cc-m--running', alert: 'cc-m--alert' };
    el.innerHTML = missions.map(m => `
      <div class="cc-mission ${statusCls[m.status]}">
        
        <span class="cc-mission-msg">${m.msg}</span>
        <span class="cc-mission-time">${m.time}</span>
      </div>`).join('');
  }

  _animateCC() {
    document.querySelectorAll('.cc-kpi-card').forEach((card, i) => {
      card.style.opacity = '0'; card.style.transform = 'translateY(10px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        card.style.opacity = '1'; card.style.transform = 'none';
      }, i * 60);
    });
  }

  /* ─────────────────────────────────────────────────────────
     Coming Soon (otros tabs)
  ───────────────────────────────────────────────────────── */
  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"></div>
        <h2 class="insight-cs-title">${this._esc(title)}</h2>
        <p class="insight-cs-desc">${this._esc(description)}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     ESTRATEGIA — Centro de Comando
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

  /* ── CSS inyectado una sola vez ──────────────────────────── */
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
     MI MARCA V2 — layout limpio (filtros + 6 KPIs + 3 widgets)
     ════════════════════════════════════════════════════════════ */
  _buildMyBrandsV2HTML(d) {
    const containers = d?.containers || [];
    const kpis       = d?.kpis?.data || {};
    const hasData    = containers.length > 0;

    const posts7d     = kpis.posts7d      != null ? kpis.posts7d      : '—';
    const sentScore   = kpis.sentimentScore != null ? kpis.sentimentScore : '—';
    const mapComp     = kpis.mapCompliance != null ? `${kpis.mapCompliance}%` : '—';
    const crisisIdx   = kpis.crisisOpen   != null ? kpis.crisisOpen   : '—';
    const mentions24h = kpis.mentions24h  != null ? kpis.mentions24h  : '—';

    const brandOptions = [
      `<option value="">Todas las marcas</option>`,
      ...containers.map(c => `<option value="${this._esc(c.id)}">${this._esc(c.nombre_marca)}</option>`),
    ].join('');

    return `
    <div class="mb-v2-dashboard">
      <!-- Filtros -->
      <div class="mb-v2-filters">
        <label class="mb-v2-select">
          <select id="mbV2BrandFilter">${brandOptions}</select>
        </label>
        <label class="mb-v2-select">
          <select id="mbV2DateFilter">
            <option value="7">Últimos 7 días</option>
            <option value="30" selected>Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
      </div>

      <!-- 6 KPI cards -->
      <div class="mb-v2-kpis">
        ${this._kpiCardV2('Posts propios / 7d', String(posts7d), hasData ? 'Últimos 7 días' : 'Sin datos aún')}
        ${this._kpiCardV2('Engagement Rate',    '—',              'API Meta necesaria')}
        ${this._kpiCardV2('Sentiment Score',    sentScore !== '—' ? `${sentScore}/100` : '—', sentScore !== '—' ? '↑ Coherencia de tono' : 'Requiere análisis VERA')}
        ${this._kpiCardV2('Cumplimiento MAP',   mapComp,          mapComp !== '—' ? 'Precios monitoreados' : 'Sin precios cargados')}
        ${this._kpiCardV2('Crisis abiertas',    String(crisisIdx), crisisIdx === 0 ? '✓ Sin alertas activas' : 'Requieren atención')}
        ${this._kpiCardV2('Menciones 24 h',     String(mentions24h), hasData ? 'Shadow + etiquetadas' : 'Sin señales aún')}
      </div>

      <!-- 2 widgets grandes lado a lado -->
      <div class="mb-v2-widgets-row">
        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head">
            <h3>Ritmo &amp; Mapa de calor</h3>
            <span class="mb-v2-widget-sub">Posts propios + horarios óptimos</span>
          </header>
          <div class="mb-v2-widget-body">
            <div class="mb-v2-chart-wrap"><canvas id="mbV2RitmoCanvas"></canvas></div>
            <div id="mbV2HeatmapHost" class="mb-v2-heatmap"></div>
          </div>
        </section>

        <section class="mb-v2-widget">
          <header class="mb-v2-widget-head">
            <h3>Sentimiento &amp; Crisis</h3>
            <span class="mb-v2-widget-sub">Emociones en posts propios + alertas activas</span>
          </header>
          <div class="mb-v2-widget-body">
            <div class="mb-v2-chart-wrap"><canvas id="mbV2SentimentCanvas"></canvas></div>
            <div id="mbV2CrisisHost" class="mb-v2-crisis-list"></div>
          </div>
        </section>
      </div>

      <!-- Widget inferior ancho completo: SWOT -->
      <section class="mb-v2-widget mb-v2-widget--wide">
        <header class="mb-v2-widget-head">
          <h3>SWOT dinámico</h3>
          <span class="mb-v2-widget-sub">Fortalezas, debilidades, oportunidades, amenazas</span>
        </header>
        <div id="mbV2SwotHost" class="mb-v2-swot-grid"></div>
      </section>
    </div>`;
  }

  _kpiCardV2(label, value, sub) {
    return `
      <div class="mb-v2-kpi">
        <div class="mb-v2-kpi-label">${this._esc(label)}</div>
        <div class="mb-v2-kpi-value">${this._esc(value)}</div>
        <div class="mb-v2-kpi-sub">${this._esc(sub)}</div>
      </div>`;
  }

  _initMyBrandsV2Charts(d) {
    if (!window.Chart) return;
    this._destroyCharts();

    // 1. Ritmo (line chart)
    const ritmo = d?.ritmo?.data || [];
    const rCanvas = document.getElementById('mbV2RitmoCanvas');
    if (rCanvas && ritmo.length) {
      this._charts.push(new Chart(rCanvas, {
        type: 'line',
        data: {
          labels: ritmo.map(r => r.label),
          datasets: [{
            label: 'Posts/día',
            data: ritmo.map(r => r.count),
            borderColor: '#ff5400',
            backgroundColor: 'rgba(255,84,0,0.15)',
            tension: 0.3, fill: true, pointRadius: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8 }, grid: { display: false } },
            y: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
          },
        },
      }));
    }

    // 2. Heatmap simple (host div, render manual)
    const hHost = document.getElementById('mbV2HeatmapHost');
    const hm    = d?.heatmap?.data;
    if (hHost && hm?.hour && Object.keys(hm.hour).length) {
      const max = Math.max(...Object.values(hm.hour).map(Number));
      const cells = [];
      for (let h = 0; h < 24; h++) {
        const v = Number(hm.hour[h] || 0);
        const intensity = max ? v / max : 0;
        cells.push(`<div class="mb-v2-heat-cell" title="${h}:00 — ${v}" style="background:rgba(255,84,0,${intensity.toFixed(2)})"></div>`);
      }
      hHost.innerHTML = `
        <div class="mb-v2-heatmap-title">Mejor hora: ${hm.bestHour ?? '—'}h · Mejor día: ${hm.bestDay ?? '—'}</div>
        <div class="mb-v2-heatmap-grid">${cells.join('')}</div>
      `;
    } else if (hHost) {
      hHost.innerHTML = `<div class="mb-v2-empty">Sin datos de heatmap</div>`;
    }

    // 3. Sentiment biométrico (doughnut)
    const sent = d?.sentimiento?.data;
    const sCanvas = document.getElementById('mbV2SentimentCanvas');
    if (sCanvas && sent && sent.total) {
      this._charts.push(new Chart(sCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Positivo', 'Negativo', 'Neutro'],
          datasets: [{
            data: [sent.positivo || 0, sent.negativo || 0, Math.max(0, sent.total - (sent.positivo || 0) - (sent.negativo || 0))],
            backgroundColor: ['#22c55e', '#ef4444', '#6b7280'],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 12 } } },
        },
      }));
    } else if (sCanvas) {
      sCanvas.parentElement.innerHTML = `<div class="mb-v2-empty">Sin datos de sentimiento</div>`;
    }

    // 4. Crisis recientes (lista)
    const crisis = d?.crisis?.data;
    const cHost  = document.getElementById('mbV2CrisisHost');
    if (cHost) {
      const vulns = crisis?.vulnerabilities || [];
      if (vulns.length) {
        cHost.innerHTML = vulns.slice(0, 5).map(v => `
          <div class="mb-v2-crisis-row mb-v2-crisis-row--${this._esc(v.severity || 'low')}">
            <span class="mb-v2-crisis-sev">${this._esc((v.severity || 'low').toUpperCase())}</span>
            <span class="mb-v2-crisis-title">${this._esc(v.title || 'Sin título')}</span>
          </div>
        `).join('');
      } else {
        cHost.innerHTML = `<div class="mb-v2-empty">Sin crisis abiertas ✓</div>`;
      }
    }

    // 5. SWOT
    const swot = d?.swot?.data;
    const swotHost = document.getElementById('mbV2SwotHost');
    if (swotHost) {
      const cuad = (cls, label, items) => `
        <div class="mb-v2-swot-cell mb-v2-swot-cell--${cls}">
          <div class="mb-v2-swot-label">${label}</div>
          <ul class="mb-v2-swot-list">
            ${(items || []).slice(0, 4).map(i => `<li>${this._esc(i.text || i)}</li>`).join('') || '<li class="mb-v2-empty">—</li>'}
          </ul>
        </div>`;
      swotHost.innerHTML = `
        ${cuad('s', 'Fortalezas',     swot?.strengths)}
        ${cuad('w', 'Debilidades',    swot?.weaknesses)}
        ${cuad('o', 'Oportunidades',  swot?.opportunities)}
        ${cuad('t', 'Amenazas',       swot?.threats)}
      `;
    }
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

      <!-- KPIs strip — pirámide de info: icono · valor · label · meta -->
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

      <!-- Row 1: Featured + Top ranking | Posting hours heatmap -->
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

      <!-- Row 2: Distribuciones (3 columnas) -->
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

      <!-- Row 3: Top topics + hashtags | Top posts -->
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

      <!-- Row 4: Activity history timeline (full width) -->
      <section class="mb-v2-widget mb-v2-widget--wide">
        <header class="mb-v2-widget-head"><h3>Actividad</h3></header>
        <div class="mb-v2-chart-wrap" style="height:240px"><canvas id="ccV2TimelineCanvas"></canvas></div>
      </section>

      <!-- Row 5: Brand vs Comp + Risk alerts -->
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

    // Activity history timeline — versión minimalista
    const ahHost = document.getElementById('ccV2TimelineCanvas');
    const ah = d?.activityHistory?.data || [];
    if (ahHost && ah.length) {
      const byPeriod = new Map();
      ah.forEach(r => {
        const k = r.period_start;
        const cur = byPeriod.get(k) || { posts: 0, eng: 0, label: r.period_label };
        cur.posts += Number(r.posts_count || 0);
        cur.eng   += Number(r.total_engagement || 0);
        byPeriod.set(k, cur);
      });
      const sorted = [...byPeriod.entries()].sort();
      const labels = sorted.map(([, v]) => v.label);
      const posts  = sorted.map(([, v]) => v.posts);
      const eng    = sorted.map(([, v]) => v.eng);

      this._charts.push(new Chart(ahHost, {
        data: {
          labels,
          datasets: [
            { type: 'line', label: 'Engagement', data: eng,
              borderColor: '#ff5400', backgroundColor: 'rgba(255,84,0,0.18)',
              tension: 0.4, fill: true, yAxisID: 'y1',
              pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#ff5400',
              borderWidth: 2 },
            { type: 'bar',  label: 'Posts',      data: posts,
              backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 3,
              yAxisID: 'y2', barPercentage: 0.55, categoryPercentage: 0.7 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              align: 'end',
              labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 8, boxHeight: 8, font: { size: 11 }, usePointStyle: true, pointStyle: 'rect' },
            },
            tooltip: {
              backgroundColor: 'rgba(20,21,23,0.95)',
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
                  if (ctx.dataset.label === 'Engagement') {
                    if (v >= 1_000_000) return `Engagement: ${(v/1_000_000).toFixed(1)}M`;
                    if (v >= 1_000)     return `Engagement: ${(v/1_000).toFixed(1)}K`;
                    return `Engagement: ${v}`;
                  }
                  return `${ctx.dataset.label}: ${v}`;
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
                color: 'rgba(255,84,0,0.7)', font: { size: 10 },
                callback(v) { if (v >= 1_000_000) return (v/1_000_000).toFixed(1)+'M'; if (v >= 1_000) return (v/1_000).toFixed(0)+'K'; return v; },
              },
              grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false }, border: { display: false },
            },
            y2: {
              position: 'right', beginAtZero: true,
              ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, precision: 0 },
              grid: { display: false }, border: { display: false },
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
