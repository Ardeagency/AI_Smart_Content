/**
 * SignalsFeedView - Feed de actividad (intelligence_signals).
 * Muestra los hallazgos capturados: posts, precios, tendencias y análisis IA.
 */
class SignalsFeedView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'signals-feed.html';
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.signals = [];
    this.entities = [];
    this.entityMap = {};
    this.filterEntityId = '';
    this.filterType = '';
    this.pageSize = 20;
    this.offset = 0;
    this.hasMore = true;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (this.organizationId) {
      localStorage.setItem('selectedOrganizationId', this.organizationId);
    }
  }

  async render() {
    await super.render();
    this.updateHeaderContext('Signals Feed', null, window.currentOrgName || 'Mi Organización');
    try {
      await this.initSupabase();
      this.brandContainerId = await this.getBrandContainerId();
      await this.loadEntities();
      this.offset = 0;
      this.signals = [];
      await this.loadSignals();
      this.renderFilters();
      this.renderList();
      this.setupEventListeners();
    } catch (err) {
      console.error('SignalsFeedView render:', err);
      this.showError('Error al cargar el feed. ' + (err?.message || ''));
    }
  }

  async initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('SignalsFeedView initSupabase:', e);
    }
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      if (this.organizationId) {
        const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) return data.id;
      }
      if (this.userId) {
        const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) return data.id;
      }
      return null;
    } catch (e) {
      console.error('SignalsFeedView getBrandContainerId:', e);
      return null;
    }
  }

  async loadEntities() {
    if (!this.supabase || !this.brandContainerId) {
      this.entities = [];
      this.entityMap = {};
      return [];
    }
    const { data, error } = await this.supabase
      .from('intelligence_entities')
      .select('id, name, domain')
      .eq('brand_container_id', this.brandContainerId)
      .order('name');
    if (error) {
      this.entities = [];
      this.entityMap = {};
      return [];
    }
    this.entities = data || [];
    this.entityMap = (this.entities).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
    return this.entities;
  }

  async loadSignals() {
    if (!this.supabase || !this.brandContainerId) return [];
    const entityIds = this.entities.map(e => e.id);
    if (entityIds.length === 0) {
      this.signals = [];
      this.hasMore = false;
      return [];
    }

    let q = this.supabase
      .from('intelligence_signals')
      .select('id, entity_id, run_id, signal_type, content_text, content_numeric, media_assets, ai_analysis, captured_at')
      .in('entity_id', entityIds)
      .order('captured_at', { ascending: false })
      .range(this.offset, this.offset + this.pageSize - 1);

    if (this.filterEntityId) q = q.eq('entity_id', this.filterEntityId);
    if (this.filterType) q = q.eq('signal_type', this.filterType);

    const { data, error } = await q;
    if (error) {
      console.error('SignalsFeedView loadSignals:', error);
      return [];
    }
    const chunk = data || [];
    if (this.offset === 0) this.signals = chunk;
    else this.signals = this.signals.concat(chunk);
    this.hasMore = chunk.length >= this.pageSize;
    this.offset += chunk.length;
    return this.signals;
  }

  renderFilters() {
    const entitySelect = document.getElementById('signalsFeedFilterEntity');
    if (!entitySelect) return;
    const current = entitySelect.value;
    entitySelect.innerHTML = '<option value="">Todos los objetivos</option>' +
      this.entities.map(e => `<option value="${e.id}" ${e.id === current ? 'selected' : ''}>${this.escapeHtml(e.name)}</option>`).join('');
  }

  renderList() {
    const emptyEl = document.getElementById('signalsFeedEmpty');
    const itemsEl = document.getElementById('signalsFeedItems');
    const loadMoreWrap = document.getElementById('signalsFeedLoadMore');
    if (!emptyEl || !itemsEl) return;

    if (this.signals.length === 0) {
      emptyEl.style.display = 'block';
      itemsEl.innerHTML = '';
      if (loadMoreWrap) loadMoreWrap.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';

    itemsEl.innerHTML = this.signals.map(s => {
      const entity = this.entityMap[s.entity_id] || {};
      const name = entity.name || 'Objetivo';
      const type = s.signal_type || 'signal';
      const text = (s.content_text || '').slice(0, 300);
      const num = s.content_numeric != null ? String(s.content_numeric) : '';
      const captured = this.formatDate(s.captured_at);
      let analysis = '';
      if (s.ai_analysis && typeof s.ai_analysis === 'object') {
        if (s.ai_analysis.sentiment) analysis += `Sentimiento: ${s.ai_analysis.sentiment}. `;
        if (s.ai_analysis.topics && Array.isArray(s.ai_analysis.topics)) analysis += `Temas: ${s.ai_analysis.topics.slice(0, 3).join(', ')}.`;
      }
      return `
        <article class="signals-feed-item" data-signal-id="${s.id}">
          <div class="signals-feed-item-meta">
            <span class="signals-feed-item-entity">${this.escapeHtml(name)}</span>
            <span class="signals-feed-item-type">${this.escapeHtml(type)}</span>
            <time class="signals-feed-item-time">${captured}</time>
          </div>
          ${text ? `<p class="signals-feed-item-text">${this.escapeHtml(text)}${(s.content_text || '').length > 300 ? '…' : ''}</p>` : ''}
          ${num ? `<p class="signals-feed-item-numeric">${this.escapeHtml(num)}</p>` : ''}
          ${analysis ? `<p class="signals-feed-item-analysis">${this.escapeHtml(analysis)}</p>` : ''}
        </article>`;
    }).join('');

    if (loadMoreWrap) loadMoreWrap.style.display = this.hasMore ? 'block' : 'none';
  }

  formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return 'Hace ' + Math.floor(diff / 60000) + ' min';
    if (d.toDateString() === now.toDateString()) return 'Hoy ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  setupEventListeners() {
    const entityFilter = document.getElementById('signalsFeedFilterEntity');
    const typeFilter = document.getElementById('signalsFeedFilterType');
    const loadMoreBtn = document.getElementById('signalsFeedLoadMoreBtn');

    if (entityFilter) {
      entityFilter.addEventListener('change', () => {
        this.filterEntityId = entityFilter.value || '';
        this.offset = 0;
        this.loadSignals().then(() => this.renderList());
      });
    }
    if (typeFilter) {
      typeFilter.addEventListener('change', () => {
        this.filterType = typeFilter.value || '';
        this.offset = 0;
        this.loadSignals().then(() => this.renderList());
      });
    }
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        this.loadSignals().then(() => this.renderList());
      });
    }
  }

  escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  showError(msg) {
    const container = document.getElementById('app-container');
    const wrap = container?.querySelector('.signals-feed-page') || container;
    if (wrap) {
      wrap.innerHTML = `<div class="signals-feed-page" style="padding: 2rem;"><h1 class="signals-feed-title">Signals Feed</h1><div class="error-container" style="margin-top: 2rem; text-align: center;"><p style="color: var(--text-secondary);">${this.escapeHtml(msg)}</p><button type="button" class="btn btn-primary" style="margin-top: 1rem;" onclick="window.location.reload()">Recargar</button></div></div>`;
    }
  }
}

window.SignalsFeedView = SignalsFeedView;
