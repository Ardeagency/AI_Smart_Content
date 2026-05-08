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
    };

    this._panelOpen = false;
    this._onResizeBound = null;
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

    // carga progresiva: si hay video, reemplazar img por video
    list.querySelectorAll('[data-video-url]').forEach((el) => {
      const url = el.getAttribute('data-video-url');
      if (!url) return;
      const v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.poster = el.getAttribute('data-poster') || '';
      v.onerror = () => { /* deja el thumbnail si video falla */ };
      v.onloadedmetadata = () => {
        if (el.parentNode) el.parentNode.replaceChild(v, el);
      };
    });
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

    const videoUrl = item.media_assets?.video_url || null;
    const thumbUrl = item.url_medios || null;

    let mediaHtml = '';
    if (thumbUrl || videoUrl) {
      const id = `media-${item.id}`;
      if (videoUrl) {
        mediaHtml = `
          <div class="content-feed-media" id="${id}" data-video-url="${this.escapeHtml(videoUrl)}" data-poster="${this.escapeHtml(thumbUrl || '')}">
            ${thumbUrl ? `<img src="${this.escapeHtml(thumbUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('content-feed-media-broken'); this.style.display='none';">` : ''}
            <span class="content-feed-video-badge"><i class="fas fa-play"></i> Video</span>
          </div>`;
      } else {
        mediaHtml = `
          <div class="content-feed-media" id="${id}">
            <img src="${this.escapeHtml(thumbUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('content-feed-media-broken'); this.style.display='none';">
          </div>`;
      }
    }

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

    const tagsHtml = [];
    (item.hashtags || []).slice(0, 8).forEach((h) => {
      tagsHtml.push(`<span class="content-feed-tag hashtag">#${this.escapeHtml(h)}</span>`);
    });
    (item.menciones || []).slice(0, 6).forEach((m) => {
      tagsHtml.push(`<span class="content-feed-tag mention">@${this.escapeHtml(m)}</span>`);
    });
    if (item.sentiment) {
      const cls = ['positive','negative','neutral'].includes(item.sentiment.toLowerCase())
        ? `sentiment-${item.sentiment.toLowerCase()}`
        : '';
      tagsHtml.push(`<span class="content-feed-tag ${cls}">${this.escapeHtml(item.sentiment)}</span>`);
    }
    if (item.tone)     tagsHtml.push(`<span class="content-feed-tag">tono: ${this.escapeHtml(item.tone)}</span>`);
    if (item.locacion) tagsHtml.push(`<span class="content-feed-tag"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(item.locacion)}</span>`);

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
              <span>${this.escapeHtml(item.network || '')}</span>
              <span class="content-feed-meta-separator">•</span>
              <span>${this.escapeHtml(fechaText)}</span>
            </div>
          </div>
        </header>

        ${text ? `<div class="content-feed-text">${this.escapeHtml(text)}</div>` : ''}

        ${mediaHtml}

        ${metricChips.length || externalLink ? `
          <div class="content-feed-metrics">
            ${metricChips.join('')}
            ${externalLink}
          </div>` : ''}

        ${tagsHtml.length ? `<div class="content-feed-tags">${tagsHtml.join('')}</div>` : ''}
      </article>`;
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
  }

  _resetFilters() {
    this.filters = { entityIds: [], preset: 'last30', includeAds: true, includeSignals: true };
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
    this._updateFilterBadge();
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
