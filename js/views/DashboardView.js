/**
 * DashboardView – Panel de inteligencia de marca (organización).
 * Tab "Mi Marca": 15 visualizaciones en modo demostración (datos simulados).
 */
class DashboardView extends BaseView {

  constructor() {
    super();
    this._activeTab = 'my-brands';
    this._charts = [];
    this._chartJsReady = false;
  }

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
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
    const tabs = [
      { id: 'my-brands',  icon: 'fa-layer-group', label: 'Mi Marca'    },
      { id: 'competence', icon: 'fa-chess',        label: 'Competencia' },
      { id: 'tendencies', icon: 'fa-fire',         label: 'Tendencias'  },
      { id: 'strategy',   icon: 'fa-route',        label: 'Estrategia'  },
    ];
    return `
      <div class="insight-page page-content" id="insightPage">
        <nav class="insight-subnav" id="insightSubnav">
          ${tabs.map(t => `
            <button class="insight-subnav-btn${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
              <i class="fas ${t.icon}"></i><span>${t.label}</span>
            </button>`).join('')}
        </nav>
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
      nav.querySelectorAll('.insight-subnav-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.tab === this._activeTab));
      this._renderTab(this._activeTab);
    });
  }

  _renderTab(tabId) {
    const body = document.getElementById('insightTabBody');
    if (!body) return;
    if (tabId === 'my-brands') {
      this._renderMyBrands(body);
    } else {
      const copy = {
        competence: { title: 'Competencia', icon: 'fa-chess', desc: 'Inteligencia táctica sobre precios, contenido del rival, superficie de ataque y pauta.' },
        tendencies:  { title: 'Tendencias',  icon: 'fa-fire',  desc: 'El pulso del mundo: señales emergentes, contexto cultural, plataformas y estética.' },
        strategy:    { title: 'Estrategia',  icon: 'fa-route', desc: 'Centro de comando: misiones, sensores, acciones estratégicas y salud organizacional.' },
      };
      const tab = copy[tabId];
      body.innerHTML = this._pageComingSoon(tab.title, tab.icon, tab.desc);
    }
  }

  /* ─────────────────────────────────────────────────────────
     MI MARCA — layout principal
  ───────────────────────────────────────────────────────── */
  async _renderMyBrands(body) {
    body.innerHTML = `<div class="mb-loading"><i class="fas fa-circle-notch fa-spin"></i> Cargando visualizaciones…</div>`;

    try {
      await this._ensureChartJs();
    } catch (_) {}

    body.innerHTML = this._buildMyBrandsHTML();
    this._initAllCharts();
    this._animateKPIs();
  }

  async _ensureChartJs() {
    if (window.Chart) { this._chartJsReady = true; return; }
    await this.loadScript(
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
      'Chart', 8000
    );
    this._chartJsReady = true;
  }

  _buildMyBrandsHTML() {
    return `
    <div class="mb-dashboard">

      <!-- ── Header de Mi Marca ── -->
      <div class="mb-brand-header">
        <div class="mb-brand-identity">
          <div class="mb-brand-avatar"><i class="fas fa-layer-group"></i></div>
          <div>
            <h2 class="mb-brand-name">${this._esc(window.currentOrgName || 'Mi Organización')}</h2>
            <p class="mb-brand-tagline">ADN de marca en tiempo real · Demostración</p>
          </div>
        </div>
        <div class="mb-brand-score">
          <div class="mb-score-ring" id="mbScoreRing">
            <svg viewBox="0 0 80 80" class="mb-score-svg">
              <circle cx="40" cy="40" r="32" class="mb-score-track"/>
              <circle cx="40" cy="40" r="32" class="mb-score-fill" id="mbScoreArc" style="stroke-dasharray:0 201"/>
            </svg>
            <span class="mb-score-val" id="mbScoreVal">0</span>
          </div>
          <div class="mb-score-label">Brand Health<br>Score</div>
        </div>
        <div class="mb-brand-meta">
          <div class="mb-meta-item"><span class="mb-meta-dot mb-dot-green"></span><span>OpenClaw activo</span></div>
          <div class="mb-meta-item"><span class="mb-meta-dot mb-dot-blue"></span><span>Última sync hace 4 min</span></div>
          <div class="mb-meta-item"><span class="mb-meta-dot mb-dot-yellow"></span><span>3 plataformas monitoreadas</span></div>
        </div>
      </div>

      <!-- ── KPI Strip ── -->
      <div class="mb-kpi-strip">
        ${this._kpiCard('fa-pen-nib',     'Publicaciones/sem', '24',   '+12% vs anterior',  'blue')}
        ${this._kpiCard('fa-heart',       'Engagement Rate',   '4.8%', '+0.6 pts',          'pink')}
        ${this._kpiCard('fa-face-smile',  'Sentiment Score',   '78',   '↑ Positivo',        'green')}
        ${this._kpiCard('fa-tag',         'Cumplimiento MAP',  '91%',  '3 alertas activas', 'orange')}
        ${this._kpiCard('fa-triangle-exclamation', 'Índice Crisis', '0.4', 'Bajo riesgo',   'teal')}
        ${this._kpiCard('fa-users',       'Menciones totales', '1.2K', 'Últimas 24 h',      'purple')}
      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN A · OPERATIVIDAD Y PULSO
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('A', 'fa-pulse', 'Operatividad y Pulso', 'Ritmo de publicación, micro-momentos y formatos')}
      <div class="mb-dim-row">

        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-chart-line"></i> Ritmo de Publicación y Latencia</span>
            <span class="mb-badge mb-badge--blue">30 días</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartPublicacion" height="140"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-fire"></i> Formatos Dominantes</span>
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
          <span class="mb-widget-title"><i class="fas fa-th"></i> Mapa de Calor de Interacción Horaria</span>
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
      ${this._dimHeader('B', 'fa-bullseye', 'Identidad y Narrativa', 'Pilares, tono de voz y semántica de impacto')}
      <div class="mb-dim-row">

        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-layer-group"></i> Dominio de Pilares Narrativos</span>
            <span class="mb-badge mb-badge--blue">Este mes</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartPilares" height="180"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-shield-halved"></i> Brand Soul Guard</span>
            <span class="mb-badge mb-badge--green">Tono</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            ${this._buildToneGauge()}
          </div>
        </div>

      </div>
      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title"><i class="fas fa-comments"></i> Semántica de Impacto — Top palabras resonantes</span>
          <span class="mb-badge mb-badge--pink">IA semántica</span>
        </div>
        <div class="mb-widget-body">
          <div class="mb-semantic-cloud" id="mbSemanticCloud"></div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN C · COMERCIAL Y DISTRIBUCIÓN
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('C', 'fa-store', 'Comercial y Distribución', 'MAP Monitor, stock digital y análisis de ofertas')}

      <div class="mb-widget mb-widget--full">
        <div class="mb-widget-header">
          <span class="mb-widget-title"><i class="fas fa-shield-check"></i> Monitor de Cumplimiento de Precios (MAP Monitor)</span>
          <span class="mb-badge mb-badge--orange">3 alertas</span>
        </div>
        <div class="mb-widget-body">
          ${this._buildMAPTable()}
        </div>
      </div>

      <div class="mb-dim-row">
        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-boxes-stacking"></i> Stock Digital</span>
            <span class="mb-badge mb-badge--teal">Live</span>
          </div>
          <div class="mb-widget-body">
            ${this._buildStockGrid()}
          </div>
        </div>
        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-percent"></i> Efectividad de Ofertas Dinámicas</span>
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
      ${this._dimHeader('D', 'fa-users', 'Social y Percepción', 'Sentimiento biométrico, shadow mentions e influencia real')}
      <div class="mb-dim-row">

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-face-smile-beam"></i> Sentimiento Biométrico</span>
            <span class="mb-badge mb-badge--pink">Emociones</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            <canvas id="chartSentimiento" height="200"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-eye-slash"></i> Shadow Mentions</span>
            <span class="mb-badge mb-badge--purple">Sin etiqueta</span>
          </div>
          <div class="mb-widget-body">
            <canvas id="chartShadow" height="180"></canvas>
          </div>
        </div>

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-star"></i> Índice de Influencia Real</span>
            <span class="mb-badge mb-badge--teal">Top 5</span>
          </div>
          <div class="mb-widget-body">
            ${this._buildInfluenceList()}
          </div>
        </div>

      </div>

      <!-- ══════════════════════════════════════════════════════
           DIMENSIÓN E · DIAGNÓSTICA
      ══════════════════════════════════════════════════════ -->
      ${this._dimHeader('E', 'fa-stethoscope', 'Diagnóstica', 'Puntos ciegos, fuga de audiencia y detección de crisis')}
      <div class="mb-dim-row">

        <div class="mb-widget">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-radar"></i> Mapa de Puntos Ciegos</span>
            <span class="mb-badge mb-badge--blue">Blind Spots</span>
          </div>
          <div class="mb-widget-body mb-widget-body--center">
            <canvas id="chartRadar" height="230"></canvas>
          </div>
        </div>

        <div class="mb-widget mb-widget--wide">
          <div class="mb-widget-header">
            <span class="mb-widget-title"><i class="fas fa-arrow-trend-down"></i> Análisis de Fuga de Audiencia</span>
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
          <span class="mb-widget-title"><i class="fas fa-triangle-exclamation"></i> Detección de Crisis de Baja Intensidad</span>
          <span class="mb-badge mb-badge--red">Monitoreo continuo</span>
        </div>
        <div class="mb-widget-body">
          ${this._buildCrisisTimeline()}
        </div>
      </div>

      <!-- Footer nota demo -->
      <div class="mb-demo-note">
        <i class="fas fa-flask"></i>
        <span>Todos los datos mostrados son <strong>simulados para demostración</strong>. OpenClaw conectará datos reales en tiempo real.</span>
      </div>

    </div>`;
  }

  /* ── Helpers de construcción ─────────────────────────────── */
  _dimHeader(letter, icon, title, subtitle) {
    return `
      <div class="mb-dim-header">
        <div class="mb-dim-letter">${this._esc(letter)}</div>
        <div>
          <div class="mb-dim-title"><i class="fas ${icon}"></i> ${this._esc(title)}</div>
          <div class="mb-dim-subtitle">${this._esc(subtitle)}</div>
        </div>
      </div>`;
  }

  _kpiCard(icon, label, value, sub, color) {
    return `
      <div class="mb-kpi-card mb-kpi--${color}">
        <div class="mb-kpi-icon"><i class="fas ${icon}"></i></div>
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
    const statusIcon = { ok: 'fa-circle-check', alert: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
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
              <td><span class="mb-map-badge ${statusClass[r.status]}"><i class="fas ${statusIcon[r.status]}"></i> ${statusLabel[r.status]}</span></td>
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
    const pIcon = { ig: 'fa-instagram', tt: 'fa-tiktok', web: 'fa-globe', yt: 'fa-youtube' };
    return `
      <div class="mb-influence-list">
        ${list.map((p, i) => `
          <div class="mb-influence-row">
            <span class="mb-inf-rank">#${i+1}</span>
            <div class="mb-inf-info">
              <span class="mb-inf-name">${p.name}</span>
              <span class="mb-inf-type">${p.type} · ${p.followers}</span>
            </div>
            <i class="fab ${pIcon[p.platform] || 'fa-globe'} mb-inf-platform"></i>
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
    const levelIcon = { low: 'fa-circle-dot', med: 'fa-triangle-exclamation', high: 'fa-circle-xmark', none: 'fa-circle-check' };
    return `
      <div class="mb-crisis-timeline">
        ${events.map(ev => `
          <div class="mb-crisis-event ${levelCls[ev.level]}">
            <div class="mb-crisis-icon"><i class="fas ${levelIcon[ev.level]}"></i></div>
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
     CHART.JS — inicialización de todos los gráficos
  ───────────────────────────────────────────────────────── */
  _initAllCharts() {
    if (!window.Chart) { return; }
    Chart.defaults.color = 'rgba(212,209,216,0.7)';
    Chart.defaults.font.family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    Chart.defaults.font.size = 11;

    this._chartPublicacion();
    this._chartFormatos();
    this._chartPilares();
    this._chartOfertas();
    this._chartSentimiento();
    this._chartShadow();
    this._chartRadar();
    this._chartFuga();
    this._buildHeatmap();
    this._buildSemanticCloud();
    this._animateScoreRing(78);
  }

  _reg(chart) { this._charts.push(chart); return chart; }

  _chartPublicacion() {
    const ctx = document.getElementById('chartPublicacion');
    if (!ctx) return;
    const labels = Array.from({length:30},(_,i)=>{const d=new Date(); d.setDate(d.getDate()-29+i); return `${d.getDate()}/${d.getMonth()+1}`;});
    const posts  = [2,3,1,4,2,0,3,5,2,3,1,4,3,2,5,4,3,2,4,3,1,5,4,3,2,4,5,3,4,2];
    const lat    = [2.4,1.8,3.1,1.2,2.9,0,1.5,0.8,2.2,1.9,3.4,1.1,1.7,2.6,0.9,1.3,1.8,2.1,1.0,1.6,2.8,0.7,1.2,1.9,2.3,1.1,0.8,1.5,1.0,1.7];
    this._reg(new Chart(ctx, {
      data: {
        labels,
        datasets: [
          { type:'bar',  label:'Posts',             data:posts, backgroundColor:'rgba(96,165,250,0.3)', borderColor:'rgba(96,165,250,0.8)', borderWidth:1, yAxisID:'y' },
          { type:'line', label:'Latencia (horas)',  data:lat,   borderColor:'#f59e0b', borderWidth:2, pointRadius:2, tension:0.4, yAxisID:'y2', fill:false },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{boxWidth:12, padding:16} }, tooltip:{mode:'index',intersect:false} },
        scales:{
          y:  { position:'left',  grid:{color:'rgba(255,255,255,0.06)'}, ticks:{stepSize:1} },
          y2: { position:'right', grid:{drawOnChartArea:false}, title:{display:true, text:'Latencia (h)'} },
          x:  { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{maxTicksLimit:10} },
        },
      },
    }));
  }

  _chartFormatos() {
    const ctx = document.getElementById('chartFormatos');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type:'doughnut',
      data:{
        labels:['Reel / Video corto','Carrusel','Imagen estática','Story','Post de texto'],
        datasets:[{
          data:[38,28,18,11,5],
          backgroundColor:['rgba(239,68,68,0.8)','rgba(96,165,250,0.8)','rgba(34,197,94,0.8)','rgba(251,191,36,0.8)','rgba(167,139,250,0.8)'],
          borderColor:'rgba(0,0,0,0)',
          borderWidth:0, hoverOffset:6,
        }],
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{
          legend:{position:'bottom', labels:{boxWidth:10, padding:10}},
          tooltip:{callbacks:{label:d=>`${d.label}: ${d.raw}%`}},
        },
      },
    }));
  }

  _chartPilares() {
    const ctx = document.getElementById('chartPilares');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type:'bar',
      data:{
        labels:['Innovación de producto','Lifestyle / Inspiración','Soporte y garantía','Sustentabilidad','Comunidad','Promociones'],
        datasets:[
          { label:'Publicado (%)', data:[32,25,16,12,8,7], backgroundColor:'rgba(96,165,250,0.7)', borderRadius:4 },
          { label:'Ideal (%)',     data:[30,30,12,15,8,5],  backgroundColor:'rgba(167,139,250,0.4)', borderRadius:4 },
        ],
      },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{boxWidth:10, padding:14} }, tooltip:{mode:'index',intersect:false} },
        scales:{
          x:{ max:40, grid:{color:'rgba(255,255,255,0.06)'}, ticks:{callback:v=>`${v}%`} },
          y:{ grid:{display:false} },
        },
      },
    }));
  }

  _chartOfertas() {
    const ctx = document.getElementById('chartOfertas');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type:'bar',
      data:{
        labels:['Amazon MX','Mercado Libre','Walmart MX','Coppel','Liverpool'],
        datasets:[
          { label:'2x1',         data:[4.2,3.8,3.1,5.0,2.9], backgroundColor:'rgba(34,197,94,0.7)',  borderRadius:4 },
          { label:'20% dcto',    data:[5.1,4.9,4.5,4.1,4.8], backgroundColor:'rgba(96,165,250,0.7)', borderRadius:4 },
          { label:'Envío gratis',data:[3.5,4.2,5.2,3.8,4.6], backgroundColor:'rgba(251,191,36,0.7)', borderRadius:4 },
        ],
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'top', labels:{boxWidth:10} }, tooltip:{mode:'index', intersect:false} },
        scales:{
          y:{ title:{display:true, text:'Conversión (%)'}, grid:{color:'rgba(255,255,255,0.06)'}, max:7 },
          x:{ grid:{display:false} },
        },
      },
    }));
  }

  _chartSentimiento() {
    const ctx = document.getElementById('chartSentimiento');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type:'doughnut',
      data:{
        labels:['Alegría','Confianza','Sorpresa','Confusión','Decepción','Ironía','Enojo'],
        datasets:[{
          data:[38,22,14,10,7,5,4],
          backgroundColor:[
            'rgba(34,197,94,0.85)','rgba(96,165,250,0.85)','rgba(251,191,36,0.85)',
            'rgba(167,139,250,0.85)','rgba(156,163,175,0.85)','rgba(249,115,22,0.85)','rgba(239,68,68,0.85)',
          ],
          borderColor:'rgba(0,0,0,0)', hoverOffset:6,
        }],
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'55%',
        plugins:{
          legend:{ position:'bottom', labels:{boxWidth:9, padding:8} },
          tooltip:{callbacks:{label:d=>`${d.label}: ${d.raw}%`}},
        },
      },
    }));
  }

  _chartShadow() {
    const ctx = document.getElementById('chartShadow');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type:'bar',
      data:{
        labels:['Foros',  'Blogs','Reddit','YouTube com.','Grupos FB','WhatsApp*'],
        datasets:[{
          label:'Menciones sin etiqueta',
          data:[142, 89, 61, 48, 37, 22],
          backgroundColor:[
            'rgba(167,139,250,0.75)','rgba(96,165,250,0.75)','rgba(251,191,36,0.75)',
            'rgba(34,197,94,0.75)','rgba(249,115,22,0.75)','rgba(156,163,175,0.5)',
          ],
          borderRadius:5,
        }],
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{footer:()=>'*Estimado vía encuestas'}} },
        scales:{
          y:{ grid:{color:'rgba(255,255,255,0.06)'} },
          x:{ grid:{display:false} },
        },
      },
    }));
  }

  _chartRadar() {
    const ctx = document.getElementById('chartRadar');
    if (!ctx) return;
    this._reg(new Chart(ctx, {
      type:'radar',
      data:{
        labels:['Innovación','Comunidad','Soporte','Sustentabilidad','Precio/Valor','Distribución','Contenido viral'],
        datasets:[
          { label:'Estamos comunicando',  data:[80,45,65,50,70,60,72], borderColor:'rgba(96,165,250,0.9)',  backgroundColor:'rgba(96,165,250,0.12)', pointRadius:4, borderWidth:2 },
          { label:'Hacemos bien (no comunicamos)', data:[82,78,80,73,70,62,40], borderColor:'rgba(34,197,94,0.9)', backgroundColor:'rgba(34,197,94,0.12)', pointRadius:4, borderWidth:2, borderDash:[5,3] },
        ],
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom', labels:{boxWidth:10, padding:10} } },
        scales:{
          r:{
            min:0, max:100, ticks:{ stepSize:25, color:'rgba(212,209,216,0.4)', backdropColor:'transparent' },
            grid:{ color:'rgba(255,255,255,0.08)' },
            pointLabels:{ color:'rgba(212,209,216,0.8)', font:{size:10} },
          },
        },
      },
    }));
  }

  _chartFuga() {
    const ctx = document.getElementById('chartFuga');
    if (!ctx) return;
    const seg = ['0s','5s','10s','15s','20s','25s','30s','45s','60s'];
    const ret = [100, 78, 62, 51, 44, 40, 37, 29, 22];
    this._reg(new Chart(ctx, {
      type:'line',
      data:{
        labels: seg,
        datasets:[{
          label:'Retención de audiencia (%)',
          data: ret,
          borderColor:'rgba(249,115,22,0.9)', borderWidth:2.5,
          backgroundColor:'rgba(249,115,22,0.12)',
          fill:true, tension:0.4, pointRadius:4, pointHoverRadius:6,
        }],
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:d=>`Retención: ${d.raw}%`}} },
        scales:{
          y:{ max:100, min:0, grid:{color:'rgba(255,255,255,0.06)'}, ticks:{callback:v=>`${v}%`}, title:{display:true,text:'Retención (%)'} },
          x:{ grid:{display:false}, title:{display:true,text:'Segundo del contenido'} },
        },
        annotation:{ annotations:[
          { type:'line', xMin:4, xMax:4, borderColor:'rgba(239,68,68,0.5)', borderWidth:1.5, label:{content:'Punto crítico',display:true} },
        ]},
      },
    }));
  }

  /* ── Heatmap horario — CSS/HTML puro ─────────────────────── */
  _buildHeatmap() {
    const el = document.getElementById('mbHeatmap');
    if (!el) return;
    const days  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const hours = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}h`);
    // Simular: mayor actividad entre 6-9 am, 12-14 pm, y 8-11 pm
    const peak = (h) => {
      if (h>=6  && h<=9)  return 0.6 + Math.random()*0.4;
      if (h>=12 && h<=14) return 0.55 + Math.random()*0.4;
      if (h>=20 && h<=23) return 0.65 + Math.random()*0.35;
      return Math.random()*0.35;
    };
    let html = `<div class="mb-heatmap-days"><span class="mb-hm-day-spacer"></span>${hours.map(h=>`<span class="mb-hm-hour">${h}</span>`).join('')}</div>`;
    days.forEach(d => {
      html += `<div class="mb-heatmap-row"><span class="mb-hm-day">${d}</span>`;
      for (let h=0;h<24;h++) {
        const v = peak(h);
        const alpha = (v*0.85+0.05).toFixed(2);
        const color = v>0.7 ? `rgba(239,68,68,${alpha})` : v>0.45 ? `rgba(251,191,36,${alpha})` : v>0.2 ? `rgba(96,165,250,${alpha})` : `rgba(255,255,255,0.04)`;
        html += `<span class="mb-hm-cell" style="background:${color}" title="${d} ${h}:00 — Intensidad: ${Math.round(v*100)}%"></span>`;
      }
      html += `</div>`;
    });
    el.innerHTML = html;
  }

  /* ── Semantic cloud ────────────────────────────────────────── */
  _buildSemanticCloud() {
    const el = document.getElementById('mbSemanticCloud');
    if (!el) return;
    const words = [
      {w:'calidad',size:2.1,c:'#60a5fa'},{w:'duradero',size:1.6,c:'#34d399'},{w:'confiable',size:1.9,c:'#a78bfa'},
      {w:'moderno',size:1.4,c:'#fbbf24'},{w:'recomiendo',size:1.7,c:'#f87171'},{w:'fácil de usar',size:1.5,c:'#60a5fa'},
      {w:'precio justo',size:1.3,c:'#34d399'},{w:'innovador',size:1.8,c:'#a78bfa'},{w:'garantía',size:1.2,c:'#fbbf24'},
      {w:'soporte',size:1.1,c:'#f87171'},{w:'diseño',size:1.6,c:'#60a5fa'},{w:'eficiente',size:1.4,c:'#34d399'},
      {w:'potente',size:1.7,c:'#a78bfa'},{w:'rápido',size:1.3,c:'#fbbf24'},{w:'premium',size:1.5,c:'#f87171'},
    ];
    el.innerHTML = words.map(w => `<span class="mb-semantic-word" style="font-size:${w.size}rem;color:${w.c}">${w.w}</span>`).join('');
  }

  /* ── Score ring animation ─────────────────────────────────── */
  _animateScoreRing(score) {
    const arc = document.getElementById('mbScoreArc');
    const val = document.getElementById('mbScoreVal');
    if (!arc || !val) return;
    const circumference = 2 * Math.PI * 32; // r=32
    let current = 0;
    const target = score;
    const step = () => {
      current = Math.min(current + 1.5, target);
      const dash = (current / 100) * circumference;
      arc.style.strokeDasharray = `${dash} ${circumference}`;
      val.textContent = Math.round(current);
      if (current < target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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

  /* ─────────────────────────────────────────────────────────
     Coming Soon (otros tabs)
  ───────────────────────────────────────────────────────── */
  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas ${icon}"></i></div>
        <h2 class="insight-cs-title">${this._esc(title)}</h2>
        <p class="insight-cs-desc">${this._esc(description)}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>`;
  }

  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

window.DashboardView = DashboardView;
