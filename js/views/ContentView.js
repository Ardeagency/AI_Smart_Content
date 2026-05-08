/**
 * ContentView — Feed unificado de contenido scrapeado (FEAT-017).
 *
 * Reemplaza el shell legacy "Biblioteca de Contenido" (que solo hacía
 * console.log) por un feed real estilo Instagram con tres fuentes:
 *   1. brand_posts WHERE is_competitor OR post_source='competitor'
 *   2. competitor_ads (badge PATROCINADO)
 *   3. intelligence_signals (mention/social_post/url_change/etc)
 *
 * Backend: RPC get_paginated_content_feed (Supabase). Inspiración visual:
 * proyecto IA_Partner (Secretaría de Medellín). Doc: docs/task/FEAT-017-content-feed.md.
 */

const CONTENT_FEED_PAGE_SIZE = 50;

const CONTENT_FEED_PRESETS = [
  { key: 'today',     label: 'Hoy',         days: 0 },
  { key: 'last7',     label: 'Últimos 7 días',  days: 7 },
  { key: 'last30',    label: 'Últimos 30 días', days: 30, default: true },
  { key: 'last90',    label: 'Últimos 90 días', days: 90 },
];

class ContentView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.orgId = null;
    this.service = null;

    this.entities = [];
    this.feed = [];
    this.offset = 0;
    this.hasMore = false;
    this.loading = false;

    this.filters = {
      entityIds: [],            // [] = todos
      preset: 'last30',
      includeAds: true,
      includeSignals: true,
      dateFromCustom: null,     // ISO date YYYY-MM-DD si preset === 'custom'
      dateToCustom: null,
    };

    this._panelOpen = false;
    this._onResizeBound = null;
    this._videoObserver = null;
  }

  // ───────────────────────────────────────── lifecycle

  async onEnter() {
    if (window.authService) {
      const ok = await window.authService.checkAccess(true);
      if (!ok) { window.router?.navigate('/login', true); return; }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.orgId =
      this.routeParams?.orgId ||
      window.currentOrgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      null;
    this._loadFiltersFromStorage();
  }

  async render() {
    await super.render();
    await this._initSupabase();
    await this._initService();
    await Promise.all([this._loadEntities(), this._loadFirstPage()]);
    this._attachEventListeners();
  }

  async onLeave() {
    if (this._onResizeBound) {
      window.removeEventListener('resize', this._onResizeBound);
      this._onResizeBound = null;
    }
    if (this._videoObserver) {
      try { this._videoObserver.disconnect(); } catch (_) {}
      this._videoObserver = null;
    }
  }

  // ───────────────────────────────────────── init data layer

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase)    this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
    } catch (e) {
      console.error('[ContentView] supabase init:', e);
    }
  }

  async _initService() {
    if (!this.supabase) return;
    if (typeof ContentFeedService === 'undefined') {
      await this.loadScript('/js/services/ContentFeedService.js', 'ContentFeedService');
    }
    this.service = new window.ContentFeedService().init(this.supabase, this.orgId);
  }

  // ───────────────────────────────────────── HTML shell

  renderHTML() {
    return `
<div class="content-feed-page" id="contentFeedPage">
  <div class="content-feed-header">
    <div>
      <h1 class="content-feed-title">Content</h1>
      <div class="content-feed-count" id="contentFeedCount">Cargando…</div>
    </div>
    <button type="button" class="content-feed-range-btn" id="contentFeedRangeBtn">
      <i class="far fa-calendar"></i>
      <span id="contentFeedRangeLabel">Últimos 30 días</span>
    </button>
  </div>

  <div class="content-feed-list" id="contentFeedList">
    <div class="content-feed-loading">
      <div class="content-feed-throbber"></div>
    </div>
  </div>

  <div class="content-feed-loadmore" id="contentFeedLoadmore" style="display:none;">
    <button type="button" class="content-feed-loadmore-btn" id="contentFeedLoadmoreBtn">
      Cargar más
    </button>
  </div>
</div>

<button type="button" class="content-feed-fab" id="contentFeedFab" aria-label="Filtros">
  <i class="fas fa-sliders-h"></i>
  <span class="content-feed-fab-badge" id="contentFeedFabBadge" style="display:none;">0</span>
</button>

<div class="content-feed-panel" id="contentFeedPanel" role="dialog" aria-label="Filtros del feed">
  <div class="content-feed-panel-header">
    <h3 class="content-feed-panel-title">Filtros</h3>
    <button type="button" class="content-feed-panel-close" id="contentFeedPanelClose" aria-label="Cerrar">
      <i class="fas fa-times"></i>
    </button>
  </div>
  <div class="content-feed-panel-body">
    <div class="content-feed-section">
      <div class="content-feed-section-label">Periodo</div>
      <div class="content-feed-presets" id="contentFeedPresets">
        ${CONTENT_FEED_PRESETS.map((p) => `
          <button type="button" class="content-feed-preset${this.filters.preset === p.key ? ' active' : ''}"
                  data-preset="${p.key}">${p.label}</button>
        `).join('')}
        <button type="button" class="content-feed-preset${this.filters.preset === 'custom' ? ' active' : ''}"
                data-preset="custom">Personalizado</button>
      </div>
      <div class="content-feed-custom-range" id="contentFeedCustomWrap"
           style="${this.filters.preset === 'custom' ? '' : 'display:none;'}">
        <label>
          <span>Desde</span>
          <input type="date" id="contentFeedCustomFrom" value="${this.escapeHtml(this.filters.dateFromCustom || '')}">
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" id="contentFeedCustomTo" value="${this.escapeHtml(this.filters.dateToCustom || '')}">
        </label>
      </div>
    </div>

    <div class="content-feed-section">
      <div class="content-feed-section-label">Competidores / Perfiles vigilados</div>
      <div class="content-feed-entities" id="contentFeedEntities">
        <div class="content-feed-loading" style="padding:1rem;">
          <div class="content-feed-throbber" style="width:20px;height:20px;"></div>
        </div>
      </div>
    </div>

    <div class="content-feed-section">
      <div class="content-feed-section-label">Fuentes</div>
      <div class="content-feed-toggles">
        <div class="content-feed-toggle">
          <label for="contentFeedToggleAds">Incluir ads de competencia</label>
          <input type="checkbox" id="contentFeedToggleAds" ${this.filters.includeAds ? 'checked' : ''}>
        </div>
        <div class="content-feed-toggle">
          <label for="contentFeedToggleSignals">Incluir signals (menciones, capturas, cambios)</label>
          <input type="checkbox" id="contentFeedToggleSignals" ${this.filters.includeSignals ? 'checked' : ''}>
        </div>
      </div>
    </div>
  </div>
  <div class="content-feed-panel-footer">
    <button type="button" class="content-feed-panel-btn" id="contentFeedReset">Limpiar</button>
    <button type="button" class="content-feed-panel-btn primary" id="contentFeedApply">Aplicar</button>
  </div>
</div>`;
  }

  // ───────────────────────────────────────── data loading

  _getDateRange() {
    if (this.filters.preset === 'custom' && this.filters.dateFromCustom && this.filters.dateToCustom) {
      const from = new Date(this.filters.dateFromCustom + 'T00:00:00');
      const to = new Date(this.filters.dateToCustom + 'T23:59:59');
      const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      return { from, to, label: `${fmt(from)} – ${fmt(to)}` };
    }
    const preset = CONTENT_FEED_PRESETS.find((p) => p.key === this.filters.preset)
                || CONTENT_FEED_PRESETS.find((p) => p.default);
    const to = new Date();
    const from = new Date(to.getTime() - (preset.days || 0) * 24 * 3600 * 1000);
    if (preset.key === 'today') {
      from.setHours(0, 0, 0, 0);
    }
    return { from, to, label: preset.label };
  }

  async _loadEntities() {
    if (!this.service) return;
    const res = await this.service.loadEntities();
    this.entities = res.data || [];
    this._renderEntitiesList();
  }

  async _loadFirstPage() {
    this.offset = 0;
    this.feed = [];
    this.hasMore = false;
    await this._loadPage();
  }

  async _loadPage() {
    if (!this.service || this.loading) return;
    this.loading = true;
    this._showLoading();

    const range = this._getDateRange();
    const res = await this.service.loadFeed({
      entityIds: this.filters.entityIds,
      dateFrom: range.from,
      dateTo: range.to,
      limit: CONTENT_FEED_PAGE_SIZE,
      offset: this.offset,
      includeAds: this.filters.includeAds,
      includeSignals: this.filters.includeSignals,
    });

    if (res.error) {
      console.error('[ContentView] loadFeed error:', res.error);
      this._renderError(res.error.message || 'Error cargando el feed.');
      this.loading = false;
      return;
    }

    const page = res.data || [];
    this.feed = this.offset === 0 ? page : this.feed.concat(page);
    this.hasMore = page.length === CONTENT_FEED_PAGE_SIZE;
    this.offset += page.length;
    this.loading = false;
    this._renderFeed();
    this._updateRangeLabel(range.label);
    this._updateFilterBadge();
  }

  async _loadNextPage() {
    if (!this.hasMore || this.loading) return;
    await this._loadPage();
  }

  // ───────────────────────────────────────── rendering helpers

  _showLoading() {
    if (this.offset !== 0) return; // append no muestra throbber global
    const list = document.getElementById('contentFeedList');
    if (list) {
      list.innerHTML = `
        <div class="content-feed-loading">
          <div class="content-feed-throbber"></div>
        </div>`;
    }
  }

  _renderError(msg) {
    const list = document.getElementById('contentFeedList');
    if (!list) return;
    list.innerHTML = `
      <div class="content-feed-empty">
        <i class="fas fa-circle-exclamation"></i>
        <h3>No pudimos cargar el feed</h3>
        <p>${this.escapeHtml(msg)}</p>
      </div>`;
    this._setCount(0);
    this._setLoadMoreVisible(false);
  }

  _renderFeed() {
    const list = document.getElementById('contentFeedList');
    if (!list) return;

    if (!this.feed.length) {
      list.innerHTML = `
        <div class="content-feed-empty">
          <i class="far fa-newspaper"></i>
          <h3>Sin contenido en el período</h3>
          <p>Ajusta el rango o agrega competidores en Monitoreo.</p>
        </div>`;
      this._setCount(0);
      this._setLoadMoreVisible(false);
      return;
    }

    list.innerHTML = this.feed.map((item) => this._renderItem(item)).join('');
    this._setCount(this.feed.length);
    this._setLoadMoreVisible(this.hasMore);

    this._attachMediaInteractions(list);
  }

  _renderItem(item) {
    const fechaText = this._formatDate(item.fecha);
    const initial = (item.profile_name || '?').trim().charAt(0).toUpperCase();
    const platformIcon = this._platformIcon(item.network);
    const sponsoredBadge = item.patrocinado
      ? '<span class="content-feed-badge sponsored">Patrocinado</span>'
      : '';
    const signalBadge = item.source_type === 'intel_signal'
      ? '<span class="content-feed-badge signal">Signal</span>'
      : '';

    const text = (item.contenido || '').replace(/\s*(https?:\/\/\S+)\s*$/i, '').trim();

    const mediaHtml = this._renderMedia(item);

    const metrics = item.metrics || {};
    const metricChips = [];
    if (Number(metrics.likes) > 0)               metricChips.push(`<span class="content-feed-metric"><i class="far fa-heart"></i> ${this._fmtNum(metrics.likes)}</span>`);
    if (Number(metrics.comments) > 0)            metricChips.push(`<span class="content-feed-metric"><i class="far fa-comment"></i> ${this._fmtNum(metrics.comments)}</span>`);
    if (Number(metrics.shares) > 0)              metricChips.push(`<span class="content-feed-metric"><i class="fas fa-retweet"></i> ${this._fmtNum(metrics.shares)}</span>`);
    if (Number(metrics.video_view_count || metrics.views) > 0) metricChips.push(`<span class="content-feed-metric"><i class="far fa-eye"></i> ${this._fmtNum(metrics.video_view_count || metrics.views)}</span>`);
    if (Number(metrics.plays) > 0)               metricChips.push(`<span class="content-feed-metric"><i class="fas fa-play"></i> ${this._fmtNum(metrics.plays)}</span>`);

    const externalLink = item.url_publicacion
      ? `<a href="${this.escapeHtml(item.url_publicacion)}" target="_blank" rel="noopener noreferrer" class="content-feed-external" title="Abrir original"><i class="fas fa-external-link-alt"></i></a>`
      : '';

    const tagsBlock = this._renderTagsBlock(item);
    const footerDate = `<div class="content-feed-footer-date">${this.escapeHtml(this._formatAbsoluteDate(item.fecha))}</div>`;

    return `
      <article class="content-feed-item" data-id="${item.id}">
        <header class="content-feed-item-header">
          <div class="content-feed-avatar">${this.escapeHtml(initial)}</div>
          <div class="content-feed-author">
            <div class="content-feed-author-row">
              <span class="content-feed-author-name">${this.escapeHtml(item.profile_name || 'Desconocido')}</span>
              ${sponsoredBadge}
              ${signalBadge}
            </div>
            <div class="content-feed-author-meta">
              <span class="content-feed-platform-icon">${platformIcon}</span>
              <span class="content-feed-meta-separator">•</span>
              <span>${this.escapeHtml(fechaText)}</span>
            </div>
          </div>
          <button type="button" class="content-feed-header-menu" aria-label="Más opciones" tabindex="-1">
            <i class="fas fa-ellipsis"></i>
          </button>
        </header>

        ${text ? `<div class="content-feed-text">${this.escapeHtml(text)}</div>` : ''}

        ${mediaHtml}

        ${metricChips.length || externalLink ? `
          <div class="content-feed-metrics">
            ${metricChips.join('')}
            ${externalLink}
          </div>` : ''}

        ${tagsBlock}

        ${footerDate}
      </article>`;
  }

  /**
   * Renderiza tags en bloques etiquetados estilo Partner:
   *   - Línea 1 (inline): hashtags + menciones (azul, sin label)
   *   - "Etiquetados:" + chips (si tagged_users tiene datos en flags[])
   *   - "Temas:" + chips
   *   - "Alertas:" + chips rojos (cuando existan)
   *   - "Sentimiento:" + chip color
   *   - "Tono:" + chip
   *   - "Ubicación:" si hay
   */
  _renderTagsBlock(item) {
    const rows = [];

    // Línea inline de hashtags + mentions
    const inline = [];
    (item.hashtags || []).slice(0, 12).forEach((h) => {
      inline.push(`<a href="#" class="content-feed-link" onclick="return false;">#${this.escapeHtml(h)}</a>`);
    });
    (item.menciones || []).slice(0, 12).forEach((m) => {
      inline.push(`<a href="#" class="content-feed-link" onclick="return false;">@${this.escapeHtml(m)}</a>`);
    });
    if (inline.length) {
      rows.push(`<div class="content-feed-tag-row inline">${inline.join('')}</div>`);
    }

    // Etiquetados (flags = tagged_users en nuestra RPC)
    if (Array.isArray(item.flags) && item.flags.length) {
      rows.push(`
        <div class="content-feed-tag-row">
          <span class="content-feed-tag-label">Etiquetados:</span>
          ${item.flags.slice(0, 10).map((f) => `<span class="content-feed-chip">${this.escapeHtml(f)}</span>`).join('')}
        </div>`);
    }

    // Temas
    if (Array.isArray(item.topics) && item.topics.length) {
      rows.push(`
        <div class="content-feed-tag-row">
          <span class="content-feed-tag-label">Temas:</span>
          ${item.topics.slice(0, 10).map((t) => `<span class="content-feed-chip">${this.escapeHtml(t)}</span>`).join('')}
        </div>`);
    }

    // Alertas: campos del ai_analysis cuando existan (no los hay en posts orgánicos
    // pero sí cuando intelligence_signals tiene crisis/critic flags).
    const alertSource = item.ai_analysis?.alerts || item.ai_analysis?.flags;
    if (Array.isArray(alertSource) && alertSource.length) {
      rows.push(`
        <div class="content-feed-tag-row">
          <span class="content-feed-tag-label alerts">Alertas:</span>
          ${alertSource.slice(0, 10).map((a) => `<span class="content-feed-chip alert">${this.escapeHtml(a)}</span>`).join('')}
        </div>`);
    }

    // Sentimiento
    if (item.sentiment) {
      const norm = String(item.sentiment).toLowerCase();
      const sentimentLabel = { positive: 'Positivo', negative: 'Negativo', neutral: 'Neutro' }[norm] || item.sentiment;
      const cls = ['positive', 'negative', 'neutral'].includes(norm) ? `sentiment-${norm}` : '';
      rows.push(`
        <div class="content-feed-tag-row">
          <span class="content-feed-tag-label">Sentimiento:</span>
          <span class="content-feed-chip ${cls}">${this.escapeHtml(sentimentLabel)}</span>
        </div>`);
    }

    // Tono
    if (item.tone) {
      rows.push(`
        <div class="content-feed-tag-row">
          <span class="content-feed-tag-label">Tono:</span>
          <span class="content-feed-chip">${this.escapeHtml(this._capitalize(item.tone))}</span>
        </div>`);
    }

    // Ubicación
    if (item.locacion) {
      rows.push(`
        <div class="content-feed-tag-row">
          <span class="content-feed-tag-label">Ubicación:</span>
          <span class="content-feed-chip location"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(item.locacion)}</span>
        </div>`);
    }

    return rows.length ? `<div class="content-feed-tags-block">${rows.join('')}</div>` : '';
  }

  _capitalize(s) {
    if (!s) return '';
    const t = String(s);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  _formatAbsoluteDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ''; }
  }

  _renderEntitiesList() {
    const wrap = document.getElementById('contentFeedEntities');
    if (!wrap) return;

    if (!this.entities.length) {
      wrap.innerHTML = `
        <div style="font-size:0.82rem;color:var(--text-muted);padding:0.5rem 0;">
          Sin entidades configuradas. Agregá competidores en
          <a href="/monitoring" style="color:inherit;text-decoration:underline;">Monitoreo</a>.
        </div>`;
      return;
    }

    const selected = new Set(this.filters.entityIds);
    wrap.innerHTML = this.entities.map((e) => `
      <div class="content-feed-entity">
        <input type="checkbox" id="cf-entity-${e.id}" data-entity-id="${e.id}"
               ${selected.has(e.id) ? 'checked' : ''}>
        <label for="cf-entity-${e.id}">
          ${this.escapeHtml(e.name)}
          ${e.target_identifier ? `<span style="color:var(--text-muted);font-size:0.75rem;"> · ${this.escapeHtml(e.target_identifier)}</span>` : ''}
        </label>
      </div>
    `).join('');
  }

  _setCount(n) {
    const el = document.getElementById('contentFeedCount');
    if (!el) return;
    if (n === 0) {
      el.textContent = 'Sin resultados';
    } else {
      el.textContent = `${n}${this.hasMore ? '+' : ''} publicaciones`;
    }
  }

  _setLoadMoreVisible(visible) {
    const wrap = document.getElementById('contentFeedLoadmore');
    if (wrap) wrap.style.display = visible ? '' : 'none';
  }

  _updateRangeLabel(label) {
    const el = document.getElementById('contentFeedRangeLabel');
    if (el) el.textContent = label;
  }

  _updateFilterBadge() {
    const badge = document.getElementById('contentFeedFabBadge');
    if (!badge) return;
    let n = 0;
    if (this.filters.entityIds.length) n += 1;
    if (!this.filters.includeAds) n += 1;
    if (!this.filters.includeSignals) n += 1;
    if (this.filters.preset !== 'last30') n += 1;
    badge.textContent = String(n);
    badge.style.display = n > 0 ? '' : 'none';
  }

  // ───────────────────────────────────────── events

  _attachEventListeners() {
    const fab = document.getElementById('contentFeedFab');
    const close = document.getElementById('contentFeedPanelClose');
    const apply = document.getElementById('contentFeedApply');
    const reset = document.getElementById('contentFeedReset');
    const range = document.getElementById('contentFeedRangeBtn');
    const loadMore = document.getElementById('contentFeedLoadmoreBtn');

    if (fab)      fab.onclick = () => this._togglePanel();
    if (close)    close.onclick = () => this._togglePanel(false);
    if (apply)    apply.onclick = () => { this._applyFiltersFromUI(); this._togglePanel(false); this._loadFirstPage(); };
    if (reset)    reset.onclick = () => this._resetFilters();
    if (range)    range.onclick = () => this._togglePanel(true);
    if (loadMore) loadMore.onclick = () => this._loadNextPage();

    document.querySelectorAll('.content-feed-preset').forEach((el) => {
      el.onclick = () => {
        document.querySelectorAll('.content-feed-preset').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        const wrap = document.getElementById('contentFeedCustomWrap');
        if (wrap) {
          wrap.style.display = el.getAttribute('data-preset') === 'custom' ? '' : 'none';
        }
      };
    });
  }

  _togglePanel(force) {
    const panel = document.getElementById('contentFeedPanel');
    const fab = document.getElementById('contentFeedFab');
    if (!panel) return;
    const next = typeof force === 'boolean' ? force : !this._panelOpen;
    this._panelOpen = next;
    panel.classList.toggle('active', next);
    if (fab) fab.classList.toggle('active', next);
  }

  _applyFiltersFromUI() {
    // preset
    const activePreset = document.querySelector('.content-feed-preset.active');
    if (activePreset) this.filters.preset = activePreset.getAttribute('data-preset') || 'last30';

    // custom range (solo si preset === 'custom')
    if (this.filters.preset === 'custom') {
      const fromEl = document.getElementById('contentFeedCustomFrom');
      const toEl = document.getElementById('contentFeedCustomTo');
      this.filters.dateFromCustom = fromEl?.value || null;
      this.filters.dateToCustom = toEl?.value || null;
    } else {
      this.filters.dateFromCustom = null;
      this.filters.dateToCustom = null;
    }

    // entities
    const ids = [];
    document.querySelectorAll('#contentFeedEntities input[type="checkbox"]').forEach((el) => {
      if (el.checked) ids.push(el.getAttribute('data-entity-id'));
    });
    this.filters.entityIds = ids;

    // toggles
    const ads = document.getElementById('contentFeedToggleAds');
    const sigs = document.getElementById('contentFeedToggleSignals');
    if (ads)  this.filters.includeAds = !!ads.checked;
    if (sigs) this.filters.includeSignals = !!sigs.checked;

    this._saveFiltersToStorage();
  }

  _resetFilters() {
    this.filters = {
      entityIds: [], preset: 'last30',
      includeAds: true, includeSignals: true,
      dateFromCustom: null, dateToCustom: null,
    };
    document.querySelectorAll('.content-feed-preset').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-preset') === 'last30');
    });
    document.querySelectorAll('#contentFeedEntities input[type="checkbox"]').forEach((el) => {
      el.checked = false;
    });
    const ads = document.getElementById('contentFeedToggleAds');
    const sigs = document.getElementById('contentFeedToggleSignals');
    if (ads)  ads.checked = true;
    if (sigs) sigs.checked = true;
    const customWrap = document.getElementById('contentFeedCustomWrap');
    if (customWrap) customWrap.style.display = 'none';
    this._updateFilterBadge();
    this._saveFiltersToStorage();
  }

  // ───────────────────────────────────────── media (carousel + video + single)

  /**
   * Decide qué media renderizar según media_assets. Si no hay nada cargable,
   * NO renderiza el contenedor (el post queda solo con texto).
   *
   * Cascada de URLs (cuando una falla, prueba la siguiente):
   *   display_url → media_urls[] → thumbnails[] → cover_image → main_image_url
   *
   * Decisión:
   *   - video_url + cualquier thumb → card con badge "Video" + autoplay.
   *   - images[] con > 1 imagen real → carrusel.
   *   - 1 imagen → single.
   *   - nada → string vacío (sin contenedor).
   */
  _renderMedia(item) {
    const ma = item.media_assets || {};
    const id = `media-${item.id}`;
    const videoUrl = ma.video_url || null;
    const postUrl = item.url_publicacion || '';

    // ── pool de URLs candidatas para thumbnail/single (ordenado por prioridad)
    const thumbCandidates = this._collectImageUrls(ma, item.url_medios);

    // ── pool específico de imágenes del post (carrusel)
    const carouselUrls = this._extractStrings(ma.images);

    if (videoUrl) {
      const primary = thumbCandidates[0] || '';
      const fallbacks = thumbCandidates.slice(1).join('|');
      return `
        <div class="content-feed-media" id="${id}"
             data-video-url="${this.escapeHtml(videoUrl)}"
             data-poster="${this.escapeHtml(primary)}"
             data-post-url="${this.escapeHtml(postUrl)}">
          ${primary
            ? `<img class="content-feed-media-thumb" src="${this.escapeHtml(primary)}" alt=""
                    loading="lazy" referrerpolicy="no-referrer"
                    data-fallbacks="${this.escapeHtml(fallbacks)}">`
            : '<div class="content-feed-media-placeholder"><i class="fas fa-image"></i></div>'}
          <span class="content-feed-video-badge"><i class="fas fa-play"></i> Video</span>
        </div>`;
    }

    if (carouselUrls.length > 1) {
      return this._createCarouselHtml(carouselUrls, id, postUrl);
    }

    const singleCandidates = carouselUrls.length === 1
      ? [carouselUrls[0], ...thumbCandidates.filter(u => u !== carouselUrls[0])]
      : thumbCandidates;

    if (singleCandidates.length) {
      const primary = singleCandidates[0];
      const fallbacks = singleCandidates.slice(1).join('|');
      return `
        <div class="content-feed-media" id="${id}" data-post-url="${this.escapeHtml(postUrl)}">
          <img src="${this.escapeHtml(primary)}" alt="" loading="lazy" referrerpolicy="no-referrer"
               data-fallbacks="${this.escapeHtml(fallbacks)}">
        </div>`;
    }

    // No hay nada renderizable → sin contenedor
    return '';
  }

  /** Devuelve URLs candidatas en orden de preferencia, deduplicadas. */
  _collectImageUrls(ma, primaryThumb) {
    const out = [];
    const push = (v) => {
      if (typeof v !== 'string') return;
      const t = v.trim();
      if (!t) return;
      if (!out.includes(t)) out.push(t);
    };
    push(primaryThumb);
    push(ma?.display_url);
    push(ma?.thumbnail_url);
    push(ma?.cover_image);
    push(ma?.main_image_url);
    this._extractStrings(ma?.media_urls).forEach(push);
    this._extractStrings(ma?.thumbnails).forEach(push);
    this._extractStrings(ma?.images).forEach(push);
    return out;
  }

  /** Extrae array de strings desde un jsonb que puede ser array de strings o de objetos. */
  _extractStrings(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') {
          return x.url || x.display_url || x.src || x.image_url || x.thumbnail_url || '';
        }
        return '';
      })
      .filter(Boolean);
  }

  _createCarouselHtml(urls, id, postUrl) {
    return `
      <div class="content-feed-media content-feed-carousel" id="${id}"
           data-current="0" data-total="${urls.length}"
           data-post-url="${this.escapeHtml(postUrl || '')}">
        ${urls.map((u, i) => `
          <img class="content-feed-carousel-img${i === 0 ? ' active' : ''}"
               src="${this.escapeHtml(u)}"
               alt=""
               loading="${i === 0 ? 'eager' : 'lazy'}"
               referrerpolicy="no-referrer"
               style="${i === 0 ? '' : 'display:none;'}">
        `).join('')}
        <button type="button" class="content-feed-carousel-prev" data-direction="-1" aria-label="Anterior">
          <i class="fas fa-chevron-left"></i>
        </button>
        <button type="button" class="content-feed-carousel-next" data-direction="1" aria-label="Siguiente">
          <i class="fas fa-chevron-right"></i>
        </button>
        <span class="content-feed-carousel-indicator">1/${urls.length}</span>
      </div>`;
  }

  /**
   * Bind de interacciones después de renderizar el feed:
   *  1. Image error → marca media-broken y muestra fallback "Ver original"
   *  2. Carrusel: click en flechas
   *  3. Video: carga progresiva en 2 fases (test load → reemplazar) +
   *     IntersectionObserver para autoplay/pause según viewport.
   */
  _attachMediaInteractions(container) {
    if (!container) return;

    // Limpia observer anterior si existía (re-render con filtros nuevos)
    if (this._videoObserver) {
      try { this._videoObserver.disconnect(); } catch (_) {}
      this._videoObserver = null;
    }

    // 1) Manejo de imágenes rotas (CORS Meta CDN, links expirados):
    //    intenta la cadena data-fallbacks="url2|url3|..." antes de marcar broken.
    //    Además: al cargar, detecta aspect ratio y lo pone en data-aspect.
    container.querySelectorAll('.content-feed-media img').forEach((img) => {
      img.addEventListener('error', () => this._tryNextFallback(img));
      const setIfReady = () => this._setAspectFromImg(img);
      if (img.complete && img.naturalWidth) setIfReady();
      else img.addEventListener('load', setIfReady, { once: true });
    });

    // 2) Carrusel
    container.querySelectorAll('.content-feed-carousel').forEach((car) => {
      const prev = car.querySelector('.content-feed-carousel-prev');
      const next = car.querySelector('.content-feed-carousel-next');
      if (prev) prev.addEventListener('click', (e) => { e.stopPropagation(); this._carouselStep(car, -1); });
      if (next) next.addEventListener('click', (e) => { e.stopPropagation(); this._carouselStep(car, 1); });
    });

    // 3) Video: setup IntersectionObserver para autoplay
    if ('IntersectionObserver' in window) {
      this._videoObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const t = entry.target;
          if (!t || t.tagName !== 'VIDEO') return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            t.muted = true;
            const p = t.play(); if (p && p.catch) p.catch(() => {});
          } else {
            try { t.pause(); } catch (_) {}
          }
        });
      }, { threshold: [0.3, 0.7], rootMargin: '50px' });
    }

    // 4) Carga progresiva de videos
    container.querySelectorAll('.content-feed-media[data-video-url]').forEach((el) => {
      const url = el.getAttribute('data-video-url');
      const poster = el.getAttribute('data-poster') || '';
      if (!url) return;
      this._attemptLoadVideo(el, url, poster);
    });
  }

  /**
   * Carga progresiva en 2 fases (patrón IA_Partner):
   *  - Fase 1: el thumbnail (img) ya está visible, sin video.
   *  - Fase 2: probamos cargar metadata del video; si funciona, lo
   *    insertamos como <video> y dejamos que el observer haga play.
   *  - Si falla, mantenemos el thumbnail. Cero ruido visual al usuario.
   */
  _attemptLoadVideo(mediaEl, videoUrl, posterUrl) {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.playsInline = true;
    probe.style.position = 'absolute';
    probe.style.opacity = '0';
    probe.style.width = '1px';
    probe.style.height = '1px';
    probe.style.pointerEvents = 'none';

    const cleanup = () => {
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.remove();
    };

    probe.onloadedmetadata = () => {
      const probeW = probe.videoWidth;
      const probeH = probe.videoHeight;
      cleanup();
      // ¿el contenedor sigue en DOM? (puede haber hecho re-render)
      if (!mediaEl.isConnected) return;
      // Aplicar aspect detectado del probe ya, antes de pintar el video real
      if (probeW && probeH) this._applyAspect(mediaEl, probeW / probeH);
      mediaEl.innerHTML = '';
      const v = document.createElement('video');
      v.src = videoUrl;
      v.controls = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'metadata';
      if (posterUrl) v.poster = posterUrl;
      v.addEventListener('loadedmetadata', () => {
        if (v.videoWidth && v.videoHeight) {
          v.setAttribute('data-aspect', this._aspectName(v.videoWidth / v.videoHeight));
          this._applyAspect(mediaEl, v.videoWidth / v.videoHeight);
        }
      }, { once: true });
      mediaEl.appendChild(v);
      if (this._videoObserver) this._videoObserver.observe(v);
    };

    probe.onerror = () => {
      cleanup();
      // mantiene el thumbnail. Si tampoco hay thumbnail, marca broken.
      if (mediaEl.isConnected && !mediaEl.querySelector('img')) {
        this._handleMediaError(mediaEl);
      }
    };

    probe.src = videoUrl;
    document.body.appendChild(probe);
  }

  /**
   * Detecta vertical / horizontal / square según ratio. Umbrales:
   *   ratio < 0.9   → vertical (más alto que ancho — reels, stories)
   *   ratio > 1.1   → horizontal (paisaje)
   *   else          → square
   */
  _aspectName(ratio) {
    if (!isFinite(ratio) || ratio <= 0) return 'square';
    if (ratio < 0.9) return 'vertical';
    if (ratio > 1.1) return 'horizontal';
    return 'square';
  }

  _applyAspect(mediaEl, ratio) {
    if (!mediaEl) return;
    const aspect = this._aspectName(ratio);
    mediaEl.setAttribute('data-aspect', aspect);
  }

  _setAspectFromImg(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    img.setAttribute('data-aspect', this._aspectName(ratio));
    const mediaEl = img.closest('.content-feed-media');
    if (mediaEl && !mediaEl.hasAttribute('data-aspect')) {
      this._applyAspect(mediaEl, ratio);
    }
  }

  _carouselStep(car, dir) {
    const total = parseInt(car.getAttribute('data-total') || '1', 10);
    let cur = parseInt(car.getAttribute('data-current') || '0', 10);
    cur = (cur + dir + total) % total;
    car.setAttribute('data-current', String(cur));
    const imgs = car.querySelectorAll('.content-feed-carousel-img');
    imgs.forEach((img, i) => {
      img.style.display = (i === cur) ? '' : 'none';
      img.classList.toggle('active', i === cur);
    });
    const ind = car.querySelector('.content-feed-carousel-indicator');
    if (ind) ind.textContent = `${cur + 1}/${total}`;
  }

  _tryNextFallback(img) {
    if (!img || !img.parentNode) return;
    const raw = img.getAttribute('data-fallbacks') || '';
    const list = raw ? raw.split('|').filter(Boolean) : [];
    if (list.length) {
      const nextUrl = list.shift();
      img.setAttribute('data-fallbacks', list.join('|'));
      img.src = nextUrl;
      return;
    }
    this._handleMediaError(img);
  }

  _handleMediaError(target) {
    const mediaEl = target.closest ? target.closest('.content-feed-media') : target;
    if (!mediaEl) return;
    if (mediaEl.classList.contains('content-feed-media-broken')) return;
    mediaEl.classList.add('content-feed-media-broken');
    const postUrl = mediaEl.getAttribute('data-post-url') || '';
    mediaEl.innerHTML = postUrl
      ? `<a href="${this.escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer" class="content-feed-media-fallback">
           <i class="fas fa-external-link-alt"></i>
           <span>Ver en publicación original</span>
         </a>`
      : `<div class="content-feed-media-fallback">
           <i class="fas fa-image"></i>
           <span>Imagen no disponible</span>
         </div>`;
  }

  // ───────────────────────────────────────── localStorage de filtros

  _loadFiltersFromStorage() {
    try {
      const raw = localStorage.getItem('contentFeedFilters');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.entityIds))           this.filters.entityIds = saved.entityIds;
      if (typeof saved.preset === 'string')         this.filters.preset = saved.preset;
      if (typeof saved.includeAds === 'boolean')    this.filters.includeAds = saved.includeAds;
      if (typeof saved.includeSignals === 'boolean')this.filters.includeSignals = saved.includeSignals;
      if (typeof saved.dateFromCustom === 'string') this.filters.dateFromCustom = saved.dateFromCustom;
      if (typeof saved.dateToCustom === 'string')   this.filters.dateToCustom = saved.dateToCustom;
    } catch (_) {}
  }

  _saveFiltersToStorage() {
    try {
      localStorage.setItem('contentFeedFilters', JSON.stringify(this.filters));
    } catch (_) {}
  }

  // ───────────────────────────────────────── utils

  _platformIcon(network) {
    const n = (network || '').toLowerCase();
    if (n.includes('instagram'))            return '<i class="fa-brands fa-instagram"></i>';
    if (n.includes('twitter') || n === 'x') return '<i class="fa-brands fa-twitter"></i>';
    if (n.includes('tiktok'))               return '<i class="fa-brands fa-tiktok"></i>';
    if (n.includes('facebook') || n === 'meta') return '<i class="fa-brands fa-facebook"></i>';
    if (n.includes('youtube'))              return '<i class="fa-brands fa-youtube"></i>';
    if (n.includes('linkedin'))             return '<i class="fa-brands fa-linkedin"></i>';
    return '<i class="fas fa-globe"></i>';
  }

  _formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000)    return 'Ahora';
    if (diff < 3600000)  return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }

  _fmtNum(n) {
    const v = Number(n) || 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(v);
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

window.ContentView = ContentView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentView;
}
