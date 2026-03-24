/**
 * InsightView – Panel de inteligencia de marca.
 * Sub-páginas: My Brands · Competence · Tendencies · Strategy
 *
 * My Brands lee de la DB (caché). Nunca llama a Meta/OpenAI directamente.
 * Si los datos están desactualizados (stale=true), lanza sync + análisis en background.
 */
class InsightView extends BaseView {
  constructor() {
    super();
    this._activeTab   = 'my-brands';
    this._period      = '30d';
    this.supabase     = null;
    this.userId       = null;
    this.sessionToken = null;
    this.brandContainer = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    await this._initSupabase();
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Insight', null, window.currentOrgName || '');
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = this._buildShell();
    this._setupTabs();
    this._renderTab(this._activeTab);
  }

  renderHTML() { return this._buildShell(); }

  // ── Supabase / Auth ────────────────────────────────────────────────────────

  async _initSupabase() {
    try {
      const client = await this.getSupabaseClient();
      if (!client) return;
      this.supabase = client;
      const { data: s } = await client.auth.getSession();
      if (s?.session) {
        this.userId       = s.session.user?.id;
        this.sessionToken = s.session.access_token;
      }
    } catch (e) { console.error('[InsightView] initSupabase:', e?.message); }
  }

  async _getSessionToken() {
    if (this.sessionToken) return this.sessionToken;
    if (this.supabase) {
      const { data: s } = await this.supabase.auth.getSession();
      this.sessionToken = s?.session?.access_token || null;
    }
    return this.sessionToken;
  }

  async _getBrandContainer() {
    if (this.brandContainer) return this.brandContainer;
    if (!this.supabase || !this.userId) return null;
    const { data } = await this.supabase
      .from('brand_containers')
      .select('id, nombre_marca, logo_url')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(1);
    this.brandContainer = data?.[0] || null;
    return this.brandContainer;
  }

  // ── Shell ──────────────────────────────────────────────────────────────────

  _buildShell() {
    const tabs = [
      { id: 'my-brands',  icon: 'fa-layer-group', label: 'My Brands'  },
      { id: 'competence', icon: 'fa-chess',        label: 'Competence' },
      { id: 'tendencies', icon: 'fa-fire',         label: 'Tendencies' },
      { id: 'strategy',   icon: 'fa-route',        label: 'Strategy'   },
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
      body.innerHTML = this._loadingHTML('Cargando inteligencia de marca…');
      this._loadMyBrands(body);
      return;
    }
    const map = {
      competence: () => this._pageComingSoon('Competence', 'fa-chess', 'Analiza a tu competencia: publicaciones, métricas y posicionamiento en redes sociales.'),
      tendencies: () => this._pageComingSoon('Tendencies', 'fa-fire', 'Descubre tendencias de contenido, hashtags y temas relevantes para tu industria en tiempo real.'),
      strategy:   () => this._pageComingSoon('Strategy', 'fa-route', 'Recomendaciones estratégicas basadas en el rendimiento de campañas y el mercado.'),
    };
    body.innerHTML = (map[tabId] || (() => ''))();
  }

  // ── My Brands – orquestador ────────────────────────────────────────────────

  async _loadMyBrands(body) {
    if (!this.supabase) await this._initSupabase();
    const bc = await this._getBrandContainer();
    if (!bc) {
      body.innerHTML = this._pageConnectPrompt();
      this._bindConnectPrompt();
      return;
    }

    const token = await this._getSessionToken();
    if (!token) {
      body.innerHTML = this._errorHTML('No hay sesión activa.');
      return;
    }

    // Pedir datos a la DB (sin llamar a APIs externas)
    let res;
    try {
      const r = await fetch(`/api/insights/mybrand?brand_container_id=${bc.id}&period=${this._period}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) throw new Error(res.error || `HTTP ${r.status}`);
    } catch (e) {
      body.innerHTML = this._errorHTML(e?.message || 'Error al cargar datos.');
      return;
    }

    if (!res.meta_integration?.connected) {
      body.innerHTML = this._pageConnectPrompt();
      this._bindConnectPrompt();
      return;
    }

    // Renderizar dashboard
    body.innerHTML = this._buildDashboard(res);
    this._bindDashboardEvents(body, bc, res);

    // Si datos están desactualizados, lanzar sync en background
    if (res.stale) this._triggerBackgroundSync(bc.id, token, body);
  }

  async _triggerBackgroundSync(brandContainerId, token, body) {
    const badge = body.querySelector('#insightStaleBadge');
    if (badge) badge.style.display = 'flex';
    try {
      // 1. Sync datos de Meta Pages API → DB
      await fetch('/api/brand/sync-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brand_container_id: brandContainerId })
      });
      // 2. Analizar posts nuevos con OpenAI → brand_content_analysis
      await fetch('/api/brand/analyze-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brand_container_id: brandContainerId })
      });
      // 3. Recargar datos frescos
      if (badge) badge.style.display = 'none';
      const tabBody = document.getElementById('insightTabBody');
      if (tabBody) {
        tabBody.innerHTML = this._loadingHTML('Actualizando datos…');
        this._loadMyBrands(tabBody);
      }
    } catch (e) {
      if (badge) { badge.textContent = 'Error al sincronizar'; }
      console.warn('[InsightView] background sync error:', e?.message);
    }
  }

  _bindDashboardEvents(body, bc, data) {
    // Selector de período
    body.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._period = btn.dataset.period;
        body.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b === btn));
        body.innerHTML = this._loadingHTML('Actualizando período…');
        this._loadMyBrands(body);
      });
    });
    // Botón sync manual
    const syncBtn = body.querySelector('#insightSyncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const token = await this._getSessionToken();
        await this._triggerBackgroundSync(bc.id, token, body);
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
      });
    }
  }

  _bindConnectPrompt() {
    const btn = document.getElementById('insightGoToBrands');
    if (btn) btn.addEventListener('click', () => {
      localStorage.setItem('brands_open_info', '1');
      window.router?.navigate('/brands');
    });
  }

  // ── Dashboard HTML ─────────────────────────────────────────────────────────

  _buildDashboard(data) {
    const { brand, meta_integration: mi, dimensions: d, period, stale } = data;
    const periods = [
      { id: '7d', label: '7d' },
      { id: '30d', label: '30d' },
      { id: '90d', label: '90d' },
    ];
    return `
    <div class="imb-dashboard">

      <!-- Top bar -->
      <div class="imb-topbar">
        <div class="imb-brand-id">
          ${mi.picture ? `<img src="${this._esc(mi.picture)}" class="imb-avatar" alt="">` : `<div class="imb-avatar-fallback"><i class="fas fa-circle-user"></i></div>`}
          <div>
            <div class="imb-brand-name">${this._esc(brand.nombre_marca)}</div>
            <div class="imb-platform-tag">
              <span class="imb-dot imb-dot--green"></span>
              Meta · ${this._esc(mi.account_name || 'Facebook')}
            </div>
          </div>
        </div>
        <div class="imb-topbar-right">
          ${stale ? `<span id="insightStaleBadge" class="imb-stale-badge"><i class="fas fa-sync-alt fa-spin"></i> Actualizando…</span>` : ''}
          <button id="insightSyncBtn" class="imb-sync-btn" title="Sincronizar ahora"><i class="fas fa-sync-alt"></i></button>
          <div class="imb-period-picker">
            ${periods.map(p => `<button class="imb-period-btn${period === p.id ? ' active' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
          </div>
        </div>
      </div>

      <!-- ── Dim A: Actividad y Salud Orgánica ──────────────────────────── -->
      <section class="imb-section">
        <h2 class="imb-section-title"><i class="fas fa-heartbeat"></i> Actividad y Salud Orgánica</h2>
        ${this._renderDimA(d.A_activity)}
      </section>

      <!-- ── Dim B: Narrativa y Tono ────────────────────────────────────── -->
      <section class="imb-section">
        <h2 class="imb-section-title"><i class="fas fa-compass"></i> Narrativa y Tono</h2>
        ${this._renderDimB(d.B_narrative)}
      </section>

      <!-- ── Dim D: Sentimiento (top posts) ────────────────────────────── -->
      <section class="imb-section">
        <h2 class="imb-section-title"><i class="fas fa-smile-beam"></i> Sentimiento e Impacto Social</h2>
        ${this._renderDimD(d.D_sentiment)}
      </section>

      <!-- ── Dim E: Diagnóstico (SWOT) ─────────────────────────────────── -->
      <section class="imb-section">
        <h2 class="imb-section-title"><i class="fas fa-shield-alt"></i> Virtudes y Vulnerabilidades</h2>
        ${this._renderDimE(d.E_diagnostic)}
      </section>

      <!-- ── Dim C: Retail Monitor ─────────────────────────────────────── -->
      <section class="imb-section">
        <h2 class="imb-section-title"><i class="fas fa-tags"></i> Monitor de Precios y Retail</h2>
        ${this._renderDimC(d.C_retail)}
      </section>

    </div>`;
  }

  // ── Dimensión A ────────────────────────────────────────────────────────────

  _renderDimA(A) {
    if (!A.snapshot) {
      return this._comingSoonCard('Actividad', 'Sincroniza tu cuenta Meta para ver métricas de actividad orgánica.');
    }
    const s = A.snapshot;
    const fmt = v => v != null ? Number(v).toLocaleString('es') : '—';
    const metrics = [
      { icon: 'fa-users',         color: 'blue',   label: 'Seguidores',     value: fmt(s.followers) },
      { icon: 'fa-file-alt',      color: 'purple', label: 'Posts (período)', value: fmt(s.posts_count) },
      { icon: 'fa-eye',           color: 'indigo', label: 'Impresiones',    value: fmt(s.impressions) },
      { icon: 'fa-broadcast-tower', color: 'cyan', label: 'Alcance',        value: fmt(s.reach) },
      { icon: 'fa-heart',         color: 'pink',   label: 'Likes',          value: fmt(s.total_likes) },
      { icon: 'fa-comment',       color: 'green',  label: 'Comentarios',    value: fmt(s.total_comments) },
      { icon: 'fa-share',         color: 'orange', label: 'Compartidos',    value: fmt(s.total_shares) },
      { icon: 'fa-chart-line',    color: 'teal',   label: 'Eng. promedio',  value: fmt(s.avg_engagement_rate) },
    ];
    return `
      <div class="imb-kpi-grid">
        ${metrics.map(m => `
          <div class="imb-kpi-card">
            <div class="imb-kpi-icon imb-col--${m.color}"><i class="fas ${m.icon}"></i></div>
            <div class="imb-kpi-body">
              <span class="imb-kpi-value">${m.value}</span>
              <span class="imb-kpi-label">${m.label}</span>
            </div>
          </div>`).join('')}
      </div>
      ${A.heatmap ? this._renderHeatmap(A.heatmap) : ''}
      ${A.posts_sample?.length ? this._renderRecentPosts(A.posts_sample) : ''}`;
  }

  _renderHeatmap(hm) {
    const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const HOURS = Array.from({ length: 24 }, (_, i) => i);
    const bestDayLabel = DAY_LABELS[hm.best_day] || '—';
    const bestHourLabel = hm.best_hour != null ? `${hm.best_hour}:00` : '—';

    const hourCells = HOURS.map(h => {
      const v = hm.hour_engagement?.[h] ?? 0;
      const opacity = Math.round(v * 100);
      const active  = h === hm.best_hour ? ' imb-hm-cell--best' : '';
      return `<div class="imb-hm-cell${active}" style="--hm-opacity:${v}" title="${h}:00 · score ${Math.round(v * 100)}%"></div>`;
    }).join('');

    const dayCells = Array.from({ length: 7 }, (_, d) => {
      const v = hm.day_engagement?.[d] ?? 0;
      const active = d === hm.best_day ? ' imb-hm-cell--best' : '';
      return `<div class="imb-hm-day-cell${active}" style="--hm-opacity:${v}" title="${DAY_LABELS[d]} · score ${Math.round(v * 100)}%"><span>${DAY_LABELS[d]}</span></div>`;
    }).join('');

    return `
      <div class="imb-heatmap-wrap">
        <div class="imb-heatmap-header">
          <span class="imb-heatmap-title"><i class="fas fa-clock"></i> Mapa de calor de engagement</span>
          <span class="imb-heatmap-best">Mejor momento: <strong>${bestDayLabel}</strong> a las <strong>${bestHourLabel}</strong></span>
        </div>
        <div class="imb-heatmap-hours">
          ${HOURS.filter(h => h % 3 === 0).map(h => `<span class="imb-hm-label">${h}h</span>`).join('')}
        </div>
        <div class="imb-heatmap-grid">${hourCells}</div>
        <div class="imb-heatmap-days">${dayCells}</div>
      </div>`;
  }

  _renderRecentPosts(posts) {
    return `
      <div class="imb-posts-list">
        <div class="imb-subsection-title">Publicaciones recientes</div>
        ${posts.map(p => {
          const eng = (p.metrics?.likes || 0) + (p.metrics?.comments || 0) + (p.metrics?.shares || 0);
          const date = p.captured_at ? new Date(p.captured_at).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—';
          return `
            <div class="imb-post-row">
              <div class="imb-post-icon"><i class="fab fa-facebook"></i></div>
              <div class="imb-post-content">
                <p class="imb-post-text">${this._esc(p.content_preview || '—')}</p>
                <div class="imb-post-meta">
                  <span><i class="fas fa-heart"></i> ${p.metrics?.likes || 0}</span>
                  <span><i class="fas fa-comment"></i> ${p.metrics?.comments || 0}</span>
                  <span><i class="fas fa-share"></i> ${p.metrics?.shares || 0}</span>
                  <span class="imb-post-date">${date}</span>
                </div>
              </div>
              <div class="imb-post-eng">${eng.toLocaleString('es')}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // ── Dimensión B ────────────────────────────────────────────────────────────

  _renderDimB(B) {
    if (B.analyzed_posts === 0) {
      return this._comingSoonCard('Narrativa', 'Los análisis de tono y narrativa estarán disponibles una vez que sincronices y analices tus posts.');
    }
    const toneBar = (count, total) => {
      const pct = total > 0 ? Math.round(count / total * 100) : 0;
      return `<div class="imb-bar-fill" style="width:${pct}%"></div>`;
    };
    const totalTones = B.top_tones.reduce((s, t) => s + t.count, 0);

    return `
      <div class="imb-narrative-grid">
        <!-- Pilares activos -->
        <div class="imb-card">
          <div class="imb-card-title"><i class="fas fa-columns"></i> Pilares de contenido</div>
          ${B.pillars_active.length === 0
            ? `<p class="imb-empty-msg">Sin pilares detectados aún.</p>`
            : B.pillars_active.map(p => `
              <div class="imb-pillar-row">
                <span class="imb-pillar-name">${this._esc(p.pillar_name)}</span>
                <span class="imb-pillar-count">${p.post_count} posts</span>
                <span class="imb-pillar-eng">avg. ${p.avg_engagement} eng.</span>
              </div>`).join('')}
        </div>

        <!-- Temas huérfanos -->
        <div class="imb-card imb-card--warn">
          <div class="imb-card-title"><i class="fas fa-ghost"></i> Temas Huérfanos
            <span class="imb-badge-count">${B.pillars_orphan.length}</span>
          </div>
          ${B.pillars_orphan.length === 0
            ? `<p class="imb-empty-msg imb-msg--ok"><i class="fas fa-check-circle"></i> ¡Todos los pilares están activos!</p>`
            : B.pillars_orphan.map(p => `
              <div class="imb-orphan-row">
                <i class="fas fa-exclamation-circle imb-orphan-icon"></i>
                <span>${this._esc(p.pillar_name)}</span>
              </div>`).join('')}
        </div>

        <!-- Distribución de tono -->
        <div class="imb-card">
          <div class="imb-card-title"><i class="fas fa-sliders-h"></i> Distribución de tono
            ${B.coherence_avg != null ? `<span class="imb-coherence-badge">${B.coherence_avg}% coherencia</span>` : ''}
          </div>
          ${B.top_tones.length === 0
            ? `<p class="imb-empty-msg">Sin datos de tono.</p>`
            : B.top_tones.map(t => `
              <div class="imb-tone-row">
                <span class="imb-tone-label">${this._esc(t.tone)}</span>
                <div class="imb-bar">${toneBar(t.count, totalTones)}</div>
                <span class="imb-tone-pct">${t.pct}%</span>
              </div>`).join('')}
        </div>

        <!-- Fatiga de contenido -->
        ${B.fatigue_posts.length > 0 ? `
        <div class="imb-card imb-card--alert">
          <div class="imb-card-title"><i class="fas fa-battery-quarter"></i> Fatiga de contenido
            <span class="imb-badge-count imb-badge--red">${B.fatigue_posts.length}</span>
          </div>
          ${B.fatigue_posts.map(p => `
            <div class="imb-fatigue-row">
              <i class="fas fa-warning imb-fatigue-icon"></i>
              <span class="imb-fatigue-text">${this._esc(p.content_preview)}…</span>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }

  // ── Dimensión D ────────────────────────────────────────────────────────────

  _renderDimD(D) {
    if (!D.top_posts?.length) {
      return this._comingSoonCard('Sentimiento', 'Sincroniza tus posts para ver análisis de sentimiento e impacto social.');
    }
    const emotionIcon = e => ({ alegría:'fa-smile', confianza:'fa-handshake', sorpresa:'fa-surprise', ironía:'fa-meh-rolling-eyes', ira:'fa-angry', confusión:'fa-question-circle', neutral:'fa-minus-circle' }[e] || 'fa-circle');

    return `
      <div class="imb-sentiment-grid">
        <!-- Top posts por engagement -->
        <div class="imb-card imb-card--wide">
          <div class="imb-card-title"><i class="fas fa-trophy"></i> Posts con mayor impacto</div>
          ${D.top_posts.map((p, i) => `
            <div class="imb-top-post-row">
              <div class="imb-top-post-rank">#${i + 1}</div>
              <div class="imb-top-post-body">
                <p class="imb-top-post-text">${this._esc(p.content_preview || '—')}</p>
                <div class="imb-top-post-meta">
                  <span><i class="fas fa-bolt"></i> ${p.engagement_total.toLocaleString('es')} eng.</span>
                  ${p.analysis?.tone ? `<span class="imb-tone-chip">${this._esc(p.analysis.tone)}</span>` : ''}
                  ${p.analysis?.emotion ? `<span class="imb-emotion-chip"><i class="fas ${emotionIcon(p.analysis.emotion)}"></i> ${this._esc(p.analysis.emotion)}</span>` : ''}
                  ${p.analysis?.clarity != null ? `<span class="imb-clarity-chip">Claridad ${p.analysis.clarity}%</span>` : ''}
                </div>
                ${p.analysis?.why_it_worked?.hook ? `<div class="imb-why-hook"><i class="fas fa-lightbulb"></i> ${this._esc(p.analysis.why_it_worked.hook)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>

        <!-- Distribución emocional -->
        ${D.emotion_distribution?.length ? `
        <div class="imb-card">
          <div class="imb-card-title"><i class="fas fa-brain"></i> Emociones dominantes</div>
          ${D.emotion_distribution.slice(0, 6).map(e => `
            <div class="imb-emotion-row">
              <i class="fas ${emotionIcon(e.emotion)} imb-emotion-icon"></i>
              <span class="imb-emotion-label">${this._esc(e.emotion)}</span>
              <span class="imb-emotion-count">${e.count}</span>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }

  // ── Dimensión E ────────────────────────────────────────────────────────────

  _renderDimE(E) {
    const sevColor = s => ({ critical:'red', high:'orange', medium:'yellow', low:'blue' }[s] || 'gray');
    const scores = [
      E.coherence_avg != null ? { label: 'Coherencia de tono', value: E.coherence_avg, icon: 'fa-fingerprint', color: 'purple' } : null,
      E.clarity_avg   != null ? { label: 'Claridad del mensaje', value: E.clarity_avg,  icon: 'fa-bullseye',   color: 'blue'   } : null,
    ].filter(Boolean);

    return `
      <div class="imb-diag-grid">
        <!-- Score bars -->
        ${scores.length ? `
        <div class="imb-card">
          <div class="imb-card-title"><i class="fas fa-chart-pie"></i> Indicadores de marca</div>
          ${scores.map(sc => `
            <div class="imb-score-row">
              <div class="imb-score-head">
                <i class="fas ${sc.icon} imb-score-icon imb-col--${sc.color}"></i>
                <span>${sc.label}</span>
                <strong>${sc.value}%</strong>
              </div>
              <div class="imb-score-bar"><div class="imb-score-fill imb-col-bg--${sc.color}" style="width:${sc.value}%"></div></div>
            </div>`).join('')}
          ${E.fatigue_count > 0 ? `
          <div class="imb-score-alert">
            <i class="fas fa-battery-quarter"></i>
            ${E.fatigue_count} post${E.fatigue_count > 1 ? 's' : ''} con señal de fatiga de contenido
          </div>` : ''}
        </div>` : ''}

        <!-- Vulnerabilidades -->
        <div class="imb-card ${E.vulnerabilities.length > 0 ? 'imb-card--warn' : ''}">
          <div class="imb-card-title">
            <i class="fas fa-shield-alt"></i> Vulnerabilidades activas
            ${E.vulnerabilities.length > 0 ? `<span class="imb-badge-count imb-badge--red">${E.vulnerabilities.length}</span>` : ''}
          </div>
          ${E.vulnerabilities.length === 0
            ? `<p class="imb-empty-msg imb-msg--ok"><i class="fas fa-check-circle"></i> Sin vulnerabilidades activas.</p>`
            : E.vulnerabilities.map(v => `
              <div class="imb-vuln-row">
                <span class="imb-sev-dot imb-sev--${sevColor(v.severity)}"></span>
                <div class="imb-vuln-body">
                  <span class="imb-vuln-title">${this._esc(v.title)}</span>
                  ${v.description ? `<span class="imb-vuln-desc">${this._esc(v.description.slice(0,100))}</span>` : ''}
                </div>
                <span class="imb-vuln-sev">${v.severity}</span>
              </div>`).join('')}
        </div>

        <!-- Temas huérfanos (SWOT oportunidad) -->
        ${E.orphan_pillars_count > 0 ? `
        <div class="imb-card imb-card--opportunity">
          <div class="imb-card-title"><i class="fas fa-seedling"></i> Oportunidades de contenido</div>
          <p class="imb-empty-msg"><i class="fas fa-ghost"></i> ${E.orphan_pillars_count} pilar${E.orphan_pillars_count > 1 ? 'es' : ''} sin contenido detectado. Revisa la sección Narrativa para ver cuáles.</p>
        </div>` : ''}
      </div>`;
  }

  // ── Dimensión C ────────────────────────────────────────────────────────────

  _renderDimC(C) {
    if (C.prices_count === 0) {
      return this._comingSoonCard('MAP Monitor', 'El monitor de precios en retailers (Amazon, Mercado Libre, etc.) estará disponible próximamente. OpenClaw rastreará disparidades de precio y quema de marca.');
    }
    return `
      <div class="imb-retail-grid">
        <div class="imb-kpi-grid imb-kpi-grid--sm">
          <div class="imb-kpi-card">
            <div class="imb-kpi-icon imb-col--green"><i class="fas fa-tags"></i></div>
            <div class="imb-kpi-body"><span class="imb-kpi-value">${C.prices_count}</span><span class="imb-kpi-label">Precios rastreados</span></div>
          </div>
          <div class="imb-kpi-card">
            <div class="imb-kpi-icon imb-col--blue"><i class="fas fa-arrow-down"></i></div>
            <div class="imb-kpi-body"><span class="imb-kpi-value">$${C.min_price?.toLocaleString('es')}</span><span class="imb-kpi-label">Precio mínimo</span></div>
          </div>
          <div class="imb-kpi-card">
            <div class="imb-kpi-icon imb-col--orange"><i class="fas fa-arrow-up"></i></div>
            <div class="imb-kpi-body"><span class="imb-kpi-value">$${C.max_price?.toLocaleString('es')}</span><span class="imb-kpi-label">Precio máximo</span></div>
          </div>
          ${C.alerts.length > 0 ? `
          <div class="imb-kpi-card imb-kpi-card--alert">
            <div class="imb-kpi-icon imb-col--red"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="imb-kpi-body"><span class="imb-kpi-value">${C.alerts.length}</span><span class="imb-kpi-label">Sin stock</span></div>
          </div>` : ''}
        </div>
        <div class="imb-table-wrap">
          <table class="imb-table">
            <thead><tr><th>Retailer</th><th>Producto</th><th>Precio</th><th>Stock</th></tr></thead>
            <tbody>
              ${C.samples.map(r => `
                <tr>
                  <td>${this._esc(r.retailer)}</td>
                  <td>${this._esc((r.product_name || '').slice(0, 40))}</td>
                  <td>$${r.price?.toLocaleString('es') || '—'}</td>
                  <td><span class="imb-stock-badge imb-stock--${r.stock_status === 'in_stock' ? 'ok' : 'out'}">${r.stock_status === 'in_stock' ? 'En stock' : 'Agotado'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Shared HTML ────────────────────────────────────────────────────────────

  _comingSoonCard(title, desc) {
    return `
      <div class="imb-coming-soon-card">
        <i class="fas fa-satellite-dish imb-cs-icon"></i>
        <div class="imb-cs-body">
          <span class="imb-cs-title">${title} — En preparación</span>
          <span class="imb-cs-desc">${desc}</span>
        </div>
        <span class="imb-cs-badge">Próximamente</span>
      </div>`;
  }

  _pageConnectPrompt() {
    return `
      <div class="insight-integrations-prompt">
        <div class="insight-int-platforms">
          <div class="insight-int-logo insight-int-logo--google" title="Google">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div class="insight-int-logo insight-int-logo--meta" title="Meta">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
            </svg>
          </div>
        </div>
        <h2 class="insight-int-title">Conecta tu marca</h2>
        <p class="insight-int-desc">
          Vincula tu cuenta de <strong>Google</strong> y <strong>Meta</strong> para ver el ADN de tu marca en tiempo real.
        </p>
        <button class="insight-int-cta" id="insightGoToBrands">
          <i class="fas fa-plug"></i> Conectar integraciones
          <i class="fas fa-arrow-right insight-int-cta-arrow"></i>
        </button>
      </div>`;
  }

  _pageComingSoon(title, icon, description) {
    return `
      <div class="insight-coming-soon">
        <div class="insight-cs-icon"><i class="fas ${icon}"></i></div>
        <h2 class="insight-cs-title">${title}</h2>
        <p class="insight-cs-desc">${description}</p>
        <span class="insight-cs-badge">Próximamente</span>
      </div>`;
  }

  _loadingHTML(msg = 'Cargando…') {
    return `<div class="insight-loading"><i class="fas fa-spinner fa-spin"></i><span>${msg}</span></div>`;
  }

  _errorHTML(msg) {
    return `<div class="insight-error-state"><i class="fas fa-exclamation-triangle"></i><span>${this._esc(msg)}</span></div>`;
  }

  _esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

window.InsightView = InsightView;
