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
    } else if (tabId === 'competence') {
      this._renderCompetence(body);
    } else if (tabId === 'tendencies') {
      this._renderTendencies(body);
    } else {
      const copy = {
        strategy: { title: 'Estrategia', icon: 'fa-route', desc: 'Centro de comando: misiones, sensores, acciones estratégicas y salud organizacional.' },
      };
      const tab = copy[tabId] || copy.strategy;
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

  /* ═══════════════════════════════════════════════════════════
     TENDENCIAS — El Pulso del Mundo
  ═══════════════════════════════════════════════════════════ */
  async _renderTendencies(body) {
    body.innerHTML = `<div class="mb-loading"><i class="fas fa-circle-notch fa-spin"></i> Escaneando señales del mundo…</div>`;
    try { await this._ensureChartJs(); } catch (_) {}
    body.innerHTML = this._buildTendenciesHTML();
    this._initTendenciesCharts();
    this._animateTD();
  }

  _buildTendenciesHTML() {
    return `
    <div class="td-dashboard">

      <!-- ── Header ── -->
      <div class="td-header">
        <div class="td-header-left">
          <div class="td-pulse-icon"><i class="fas fa-earth-americas"></i></div>
          <div>
            <h2 class="td-title">El Pulso del Mundo</h2>
            <p class="td-subtitle">OpenClaw · Escaneo 360° cada 15 min · Demostración</p>
          </div>
        </div>
        <div class="td-scan-status">
          <div class="td-scan-ring" id="tdScanRing">
            <span class="td-scan-line"></span>
          </div>
          <div class="td-scan-meta">
            <span class="td-scan-label">Último escaneo</span>
            <span class="td-scan-time">Hace 3 min</span>
          </div>
        </div>
      </div>

      <!-- ── KPI Strip ── -->
      <div class="td-kpi-strip">
        ${this._tdKpi('fa-bolt',          'Señales activas',         '47',   'Esta hora',               'yellow')}
        ${this._tdKpi('fa-water',         'Content Gaps / día',      '12',   'Océanos azules',          'blue')}
        ${this._tdKpi('fa-arrow-trend-up','Alcance potencial',       '+38%', 'vs publicación normal',   'green')}
        ${this._tdKpi('fa-gear',          'Cambios algorítmicos',    '3',    'Hoy en plataformas',      'orange')}
        ${this._tdKpi('fa-face-grin-wide','Sentimiento global',      '😊',   'Optimista / Nostálgico',  'pink')}
        ${this._tdKpi('fa-eye',           'Oportunidades capturadas','9',    'Últimas 24 h',            'purple')}
      </div>

      <!-- ── OpenClaw Opportunity Feed ── -->
      <div class="td-opportunity-feed">
        <div class="td-of-header">
          <span><i class="fas fa-satellite-dish"></i> OpenClaw Opportunity Feed</span>
          <span class="cc-pulse-dot"></span>
        </div>
        <div class="td-of-list" id="tdOpFeed"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM A · THE EARLY DETECTION
      ══════════════════════════════════════════════ -->
      ${this._tdDim('A', 'fa-radar', 'The Early Detection', 'Señales débiles de nicho, audios virales y content gaps')}

      <div class="td-dim-row">
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-signal"></i> Señales Débiles del Nicho</span>
            <span class="td-badge td-badge--yellow">Ascenso</span>
          </div>
          <div class="td-widget-body">
            ${this._tdNicheSignals()}
          </div>
        </div>
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-music"></i> Audios y Memes en Ascenso</span>
            <span class="td-badge td-badge--pink">TikTok · Reels</span>
          </div>
          <div class="td-widget-body">
            ${this._tdAudios()}
          </div>
        </div>
      </div>

      <div class="td-widget td-widget--full">
        <div class="td-widget-header">
          <span class="td-widget-title"><i class="fas fa-water"></i> Content Gaps — Océanos Azules del Día</span>
          <span class="td-badge td-badge--blue">Ningún rival está aquí</span>
        </div>
        <div class="td-widget-body">
          ${this._tdContentGaps()}
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM B · THE REAL WORLD SYNC
      ══════════════════════════════════════════════ -->
      ${this._tdDim('B', 'fa-globe', 'The Real World Sync', 'Contexto climático, eventos culturales y sentiment shift global')}

      <div class="td-dim-row">
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-cloud-sun"></i> Sincronización con el Mundo Físico</span>
            <span class="td-badge td-badge--green">Oportunidades activas</span>
          </div>
          <div class="td-widget-body">
            ${this._tdWorldSync()}
          </div>
        </div>
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-face-smile"></i> Sentiment Shift Global</span>
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
      ${this._tdDim('C', 'fa-microchip', 'The Platform Pulse', 'Cambios algorítmicos, velocidad de hashtags y keywords')}

      <div class="td-dim-row">
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-sliders"></i> Algorithmic Watchdog</span>
            <span class="td-badge td-badge--orange">Cambios detectados</span>
          </div>
          <div class="td-widget-body">
            ${this._tdAlgoWatchdog()}
          </div>
        </div>
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-hashtag"></i> Hashtag & Keyword Velocity</span>
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
      ${this._tdDim('D', 'fa-palette', 'The Visual Trend', 'Estética del minuto, paletas dominantes y ganchos de atención')}

      <div class="td-dim-row">
        <div class="td-widget td-widget--wide">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-palette"></i> Evolución Estética del Minuto</span>
            <span class="td-badge td-badge--pink">Engagement visual</span>
          </div>
          <div class="td-widget-body">
            ${this._tdAestheticTrends()}
          </div>
        </div>
        <div class="td-widget">
          <div class="td-widget-header">
            <span class="td-widget-title"><i class="fas fa-bolt-lightning"></i> Narrative Hooks — Top 3 segundos</span>
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
          <span class="td-widget-title"><i class="fas fa-chart-area"></i> Curva de Emergencia de Tendencias — Últimas 48 horas</span>
          <span class="td-badge td-badge--green">Tiempo real</span>
        </div>
        <div class="td-widget-body">
          <canvas id="tdChartEmergence" height="160"></canvas>
        </div>
      </div>

      <!-- Footer demo -->
      <div class="mb-demo-note">
        <i class="fas fa-flask"></i>
        <span>Datos <strong>simulados para demostración</strong>. OpenClaw conectará Google Trends, APIs meteorológicas, scraping de plataformas y detección de audio en tiempo real.</span>
      </div>

    </div>`;
  }

  /* ── Helpers tendencias ─────────────────────────────── */
  _tdDim(letter, icon, title, subtitle) {
    return `
      <div class="mb-dim-header td-dim-header">
        <div class="mb-dim-letter td-dim-letter">${this._esc(letter)}</div>
        <div>
          <div class="mb-dim-title"><i class="fas ${icon}"></i> ${this._esc(title)}</div>
          <div class="mb-dim-subtitle">${this._esc(subtitle)}</div>
        </div>
      </div>`;
  }

  _tdKpi(icon, label, value, sub, color) {
    return `
      <div class="mb-kpi-card mb-kpi--${color} td-kpi-card">
        <div class="mb-kpi-icon"><i class="fas ${icon}"></i></div>
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
    const pIcon = { tt: 'fa-tiktok', ig: 'fa-instagram', yt: 'fa-youtube' };
    const phaseCls = { Exponencial: 'td-phase--exp', Crecimiento: 'td-phase--grow', Emergencia: 'td-phase--early' };
    return `
      <div class="td-audios-list">
        ${audios.map((a, i) => `
          <div class="td-audio-row">
            <span class="td-audio-rank">#${i+1}</span>
            <div class="td-audio-info">
              <span class="td-audio-name">${a.name}</span>
              <span class="td-audio-uses"><i class="fab ${pIcon[a.platform]}"></i> ${a.uses} usos</span>
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
                <span class="td-gap-vol"><i class="fas fa-magnifying-glass"></i> ${g.volume.toLocaleString()} búsquedas/mes</span>
                <span class="td-gap-brands ${g.brands === 0 ? 'td-brands--zero' : 'td-brands--few'}">
                  <i class="fas fa-building"></i> ${g.brands === 0 ? 'Ninguna marca activa' : g.brands + ' marca(s) activas'}
                </span>
              </div>
            </div>
            <p class="td-gap-topic">${g.topic}</p>
            <div class="td-gap-action"><i class="fas fa-bolt"></i> Acción: <strong>${g.action}</strong></div>
          </div>`).join('')}
      </div>`;
  }

  _tdWorldSync() {
    const events = [
      { type: 'weather', icon: 'fa-temperature-high', title: 'Ola de calor — CDMX / MTY',    impact: 'Licuadoras granizados +68% búsquedas', urgency: 'high', action: 'Publicar HOY' },
      { type: 'event',   icon: 'fa-futbol',           title: 'Partido Final Liga MX — sábado', impact: 'Contenido de snacks y botanas en vivo', urgency: 'med',  action: 'Preparar para sábado' },
      { type: 'calendar',icon: 'fa-calendar-day',     title: 'Día del Niño — 30 de abril',    impact: 'Aparatos fáciles de usar para toda la familia', urgency: 'med', action: 'Campaña 28–30 abr' },
      { type: 'news',    icon: 'fa-newspaper',        title: 'Boom de dietas sin gluten',     impact: 'Contenido de recetas saludables +31%',  urgency: 'low',  action: 'Blog esta semana' },
      { type: 'weather', icon: 'fa-cloud-rain',       title: 'Lluvias en GDL esta tarde',     impact: 'Recetas de interior / Sopas calientes',  urgency: 'low',  action: 'Post vespertino' },
    ];
    const urg = { high: 'td-urg--high', med: 'td-urg--med', low: 'td-urg--low' };
    const typeClr = { weather: 'rgba(96,165,250,0.15)', event: 'rgba(34,197,94,0.1)', calendar: 'rgba(251,191,36,0.1)', news: 'rgba(167,139,250,0.1)' };
    return `
      <div class="td-world-list">
        ${events.map(e => `
          <div class="td-world-row" style="--row-bg:${typeClr[e.type]}">
            <div class="td-world-icon"><i class="fas ${e.icon}"></i></div>
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
      { name: 'Instagram',  icon: 'fa-instagram',  favFormat: 'Carrusel',         change: true,  note: '↑ Prioridad vs Reels esta semana' },
      { name: 'TikTok',     icon: 'fa-tiktok',     favFormat: 'Video < 30 seg',   change: false, note: 'Sin cambios — sigue igual' },
      { name: 'YouTube',    icon: 'fa-youtube',    favFormat: 'Shorts 60 seg',    change: true,  note: '↑ Shorts sobre videos largos' },
      { name: 'Facebook',   icon: 'fa-facebook-f', favFormat: 'Reels nativos',    change: false, note: 'Sin cambios' },
      { name: 'LinkedIn',   icon: 'fa-linkedin-in',favFormat: 'Carrusel + Texto', change: true,  note: '↑ Documentos PDF convertidos' },
      { name: 'Pinterest',  icon: 'fa-pinterest-p',favFormat: 'Idea Pin vertical',change: false, note: 'Sin cambios' },
    ];
    return `
      <div class="td-algo-list">
        ${platforms.map(p => `
          <div class="td-algo-row ${p.change ? 'td-algo--changed' : ''}">
            <div class="td-algo-icon"><i class="fab ${p.icon}"></i></div>
            <div class="td-algo-body">
              <span class="td-algo-name">${p.name}</span>
              <span class="td-algo-format"><i class="fas fa-star"></i> ${p.favFormat}</span>
            </div>
            <div class="td-algo-status">
              ${p.change
                ? '<span class="td-algo-badge td-algo--alert"><i class="fas fa-triangle-exclamation"></i> Cambio</span>'
                : '<span class="td-algo-badge td-algo--ok"><i class="fas fa-check"></i> Estable</span>'}
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
              <div class="td-aes-eng"><i class="fas fa-heart"></i> ${t.engagement}%</div>
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
      { status: 'done',    icon: 'fa-check-circle', msg: 'Detectada tendencia "Cocina Retro 90s" — Generado set de 4 visuales con estética neon. Alcance estimado: +40%.', time: 'Hace 8 min' },
      { status: 'running', icon: 'fa-spinner fa-spin', msg: 'Analizando Content Gap "licuadoras para smoothies proteicos" — Redactando guía SEO + script de Reel.', time: 'En curso' },
      { status: 'alert',   icon: 'fa-triangle-exclamation', msg: 'Ola de calor detectada en Monterrey — Oportunidad de publicación en 2 h. Requiere aprobación.', time: 'Hace 12 min' },
      { status: 'done',    icon: 'fa-check-circle', msg: 'Audio "Lo-fi Cocina Mix" en fase exponencial en TikTok — Video generado y programado para las 8pm.', time: 'Hace 31 min' },
    ];
    const statusCls = { done: 'cc-m--done', running: 'cc-m--running', alert: 'cc-m--alert' };
    el.innerHTML = ops.map(o => `
      <div class="cc-mission ${statusCls[o.status]}">
        <i class="fas ${o.icon} cc-mission-icon"></i>
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
     COMPETENCIA — Infiltración Táctica
  ═══════════════════════════════════════════════════════════ */
  async _renderCompetence(body) {
    body.innerHTML = `<div class="mb-loading"><i class="fas fa-circle-notch fa-spin"></i> Cargando inteligencia táctica…</div>`;
    try { await this._ensureChartJs(); } catch (_) {}
    body.innerHTML = this._buildCompetenceHTML();
    this._initCompetenceCharts();
    this._animateCC();
  }

  _buildCompetenceHTML() {
    return `
    <div class="cc-dashboard">

      <!-- ── Header ── -->
      <div class="cc-header">
        <div class="cc-header-left">
          <div class="cc-spy-icon"><i class="fas fa-user-secret"></i></div>
          <div>
            <h2 class="cc-title">Infiltración Táctica</h2>
            <p class="cc-subtitle">OpenClaw · Patrullaje cada 10 min · Demostración</p>
          </div>
        </div>
        <div class="cc-rival-selector">
          <span class="cc-rival-label">Rival monitoreado:</span>
          <span class="cc-rival-chip"><i class="fas fa-building"></i> Competidor A</span>
          <span class="cc-rival-chip cc-chip--dim"><i class="fas fa-building"></i> Competidor B</span>
          <span class="cc-rival-chip cc-chip--dim"><i class="fas fa-building"></i> Competidor C</span>
        </div>
      </div>

      <!-- ── KPI Strip ── -->
      <div class="cc-kpi-strip">
        ${this._ccKpi('fa-bullhorn',          'Share of Voice',          '34%',  'Nosotros vs mercado',    'blue')}
        ${this._ccKpi('fa-pen-nib',           'Posts rival / sem',       '31',   '−3 vs semana ant.',      'orange')}
        ${this._ccKpi('fa-face-frown',        'Reviews neg. detectadas', '247',  '↑ 18 esta semana',       'red')}
        ${this._ccKpi('fa-rectangle-ad',      'Anuncios activos',        '14',   'Meta · Google · TikTok', 'purple')}
        ${this._ccKpi('fa-triangle-exclamation','Vulnerabilidades',      '6',    'Explotables hoy',        'yellow')}
        ${this._ccKpi('fa-box-open',          'SKUs sin stock rival',    '3',    'Oportunidad inmediata',  'green')}
      </div>

      <!-- ── OpenClaw Mission Control ── -->
      <div class="cc-mission-control">
        <div class="cc-mc-header">
          <span><i class="fas fa-satellite-dish"></i> OpenClaw Mission Control</span>
          <span class="cc-pulse-dot"></span>
        </div>
        <div class="cc-mc-missions" id="ccMissions"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM A · THE PRICE WAR
      ══════════════════════════════════════════════ -->
      ${this._ccDim('A', 'fa-sack-dollar', 'The Price War', 'Precios cross-platform, stock crítico y bundles del rival')}

      <div class="cc-dim-row">
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-chart-bar"></i> Monitor de Precios SKU vs SKU</span>
            <span class="cc-badge cc-badge--blue">Cross-Platform</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartPrecios" height="200"></canvas>
          </div>
        </div>
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-boxes-stacking"></i> Stock Crítico del Rival</span>
            <span class="cc-badge cc-badge--red">Oportunidad</span>
          </div>
          <div class="cc-widget-body">
            ${this._ccStockRival()}
          </div>
        </div>
      </div>

      <div class="cc-widget cc-widget--full">
        <div class="cc-widget-header">
          <span class="cc-widget-title"><i class="fas fa-tags"></i> Análisis de Ofertas y Bundles del Rival</span>
          <span class="cc-badge cc-badge--orange">Canibalización</span>
        </div>
        <div class="cc-widget-body">
          ${this._ccBundlesTable()}
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM B · THE CONTENT BATTLE
      ══════════════════════════════════════════════ -->
      ${this._ccDim('B', 'fa-swords', 'The Content Battle', 'Temas ganadores, engagement real y lanzamientos en la sombra')}

      <div class="cc-dim-row">
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-fire"></i> Temas Ganadores del Rival</span>
            <span class="cc-badge cc-badge--orange">Fórmula viral</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartTemas" height="220"></canvas>
          </div>
        </div>
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-chart-line"></i> Benchmarking de Engagement Real</span>
            <span class="cc-badge cc-badge--blue">Nosotros vs Rival</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartEngagement" height="200"></canvas>
          </div>
        </div>
      </div>

      <div class="cc-widget cc-widget--full">
        <div class="cc-widget-header">
          <span class="cc-widget-title"><i class="fas fa-eye-slash"></i> Detección de Lanzamientos en la Sombra</span>
          <span class="cc-badge cc-badge--purple">Anticipación</span>
        </div>
        <div class="cc-widget-body">
          ${this._ccShadowLaunches()}
        </div>
      </div>

      <!-- ══════════════════════════════════════════════
           DIM C · ATTACK SURFACE
      ══════════════════════════════════════════════ -->
      ${this._ccDim('C', 'fa-crosshairs', 'Attack Surface', 'Reviews negativas explotables y crisis de reputación del rival')}

      <div class="cc-dim-row">
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-star-half-stroke"></i> Reviews Negativas del Rival — Puntos de Dolor</span>
            <span class="cc-badge cc-badge--red">Explotable</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartPain" height="180"></canvas>
          </div>
        </div>
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-bomb"></i> Crisis de Reputación del Rival</span>
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
      ${this._ccDim('D', 'fa-satellite', 'Ad Intelligence', 'Radar de pauta digital e influencer mapping del rival')}

      <div class="cc-dim-row">
        <div class="cc-widget">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-radar"></i> Radar de Pauta Digital</span>
            <span class="cc-badge cc-badge--purple">Inversión estimada</span>
          </div>
          <div class="cc-widget-body mb-widget-body--center">
            <canvas id="ccChartAds" height="230"></canvas>
          </div>
        </div>
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-user-tie"></i> Influencer Mapping del Rival</span>
            <span class="cc-badge cc-badge--blue">Oportunidad de captura</span>
          </div>
          <div class="cc-widget-body">
            ${this._ccInfluencerMap()}
          </div>
        </div>
      </div>

      <!-- ── Share of Voice ── -->
      ${this._ccDim('+', 'fa-chart-pie', 'Share of Voice', 'Cuota de atención del nicho — quién domina la conversación')}
      <div class="cc-dim-row">
        <div class="cc-widget mb-widget-body--center">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-chart-pie"></i> Share of Voice — Nicho</span>
            <span class="cc-badge cc-badge--blue">Tiempo real</span>
          </div>
          <div class="cc-widget-body mb-widget-body--center">
            <canvas id="ccChartSOV" height="240"></canvas>
          </div>
        </div>
        <div class="cc-widget cc-widget--wide">
          <div class="cc-widget-header">
            <span class="cc-widget-title"><i class="fas fa-chart-area"></i> Share of Voice — Evolución 30 días</span>
            <span class="cc-badge cc-badge--green">Tendencia</span>
          </div>
          <div class="cc-widget-body">
            <canvas id="ccChartSOVLine" height="210"></canvas>
          </div>
        </div>
      </div>

      <!-- Footer demo -->
      <div class="mb-demo-note">
        <i class="fas fa-flask"></i>
        <span>Datos <strong>simulados para demostración</strong>. OpenClaw conectará inteligencia real con scraping y APIs de terceros.</span>
      </div>

    </div>`;
  }

  /* ── Helpers competencia ─────────────────────────────── */
  _ccDim(letter, icon, title, subtitle) {
    return `
      <div class="mb-dim-header cc-dim-header">
        <div class="mb-dim-letter cc-dim-letter">${this._esc(letter)}</div>
        <div>
          <div class="mb-dim-title"><i class="fas ${icon}"></i> ${this._esc(title)}</div>
          <div class="mb-dim-subtitle">${this._esc(subtitle)}</div>
        </div>
      </div>`;
  }

  _ccKpi(icon, label, value, sub, color) {
    return `
      <div class="mb-kpi-card mb-kpi--${color} cc-kpi-card">
        <div class="mb-kpi-icon"><i class="fas ${icon}"></i></div>
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
    const typeIcon = { dominio: 'fa-globe', web: 'fa-code', linkedin: 'fa-linkedin' };
    const confColor = (c) => c>=80 ? '#f87171' : c>=60 ? '#fbbf24' : '#60a5fa';
    return `
      <div class="cc-shadow-list">
        ${signals.map(s => `
          <div class="cc-shadow-row">
            <div class="cc-shadow-icon"><i class="fab ${typeIcon[s.type] || 'fas fa-eye'}"></i></div>
            <div class="cc-shadow-body">
              <p class="cc-shadow-msg">${s.signal}</p>
              <div class="cc-shadow-meta">
                <span class="cc-shadow-date">${s.date}</span>
                <span class="cc-shadow-action"><i class="fas fa-bolt"></i> ${s.action}</span>
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
    const levelIcon = { high: 'fa-circle-xmark', med: 'fa-triangle-exclamation', low: 'fa-circle-dot' };
    const levelLbl  = { high: 'Crisis activa', med: 'En desarrollo', low: 'Latente' };
    return `
      <div class="cc-crisis-list">
        ${crises.map(c => `
          <div class="cc-crisis-item ${levelCls[c.level]}">
            <div class="cc-crisis-top">
              <i class="fas ${levelIcon[c.level]}"></i>
              <span class="cc-crisis-product">${c.product}</span>
              <span class="cc-crisis-badge">${levelLbl[c.level]}</span>
            </div>
            <p class="cc-crisis-desc">${c.issue}</p>
            <div class="cc-crisis-window"><i class="fas fa-clock"></i> ${c.window}</div>
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
    const pIcon = { ig:'fa-instagram', yt:'fa-youtube', tt:'fa-tiktok', web:'fa-globe' };
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
              <td><i class="fab ${pIcon[r.plat] || 'fa-globe'}" style="font-size:1rem;color:var(--text-secondary)"></i></td>
              <td>${r.followers}</td>
              <td>
                <div class="cc-reach-bar-wrap">
                  <div class="cc-reach-bar" style="width:${r.reach}%"></div>
                  <span>${r.reach}</span>
                </div>
              </td>
              <td>${r.trabajaCon}</td>
              <td>${r.capturable ? '<span class="cc-cap--yes"><i class="fas fa-check"></i> Sí</span>' : '<span class="cc-cap--no"><i class="fas fa-lock"></i> No</span>'}</td>
              <td style="font-size:0.75rem;color:var(--text-muted)">${r.note}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Mission Control (OpenClaw autonomous actions) ── */
  _buildMissions() {
    return [
      { status: 'done',    icon: 'fa-check-circle', msg: 'Misión: Neutralizar oferta rival en Amazon MX — Generados 4 activos comparativos. Estado: Al aire.', time: 'Hace 22 min' },
      { status: 'running', icon: 'fa-spinner fa-spin', msg: 'Misión: Capturar clientes de crisis "Rival Pro 3000" — Redactando 3 variantes de contenido.', time: 'En curso' },
      { status: 'alert',   icon: 'fa-triangle-exclamation', msg: 'Alerta: Rival B bajó precio en Mercado Libre −$130 — Requiere aprobación para igualar.', time: 'Hace 5 min' },
      { status: 'done',    icon: 'fa-check-circle', msg: 'Misión: Counter al bundle "Kit Cocina Pro" — Publicado bundle Oster con ahorro adicional de $200.', time: 'Hace 2 h' },
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
        <i class="fas ${m.icon} cc-mission-icon"></i>
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
