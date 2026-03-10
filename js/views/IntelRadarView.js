/**
 * IntelRadarView - Catálogo de objetivos (intelligence_entities).
 * El usuario añade Targets a vigilar: perfiles sociales, hashtags, productos, palabras clave o noticias.
 * Opcional: vincular a flow_schedules para "encender el radar" (scraping programado).
 */
class IntelRadarView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'intel-radar.html';
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.entities = [];
    this.DOMAINS = [
      { value: 'social', label: 'Perfil de Competencia', hint: 'URL de Instagram/TikTok o @usuario' },
      { value: 'marketplace', label: 'Producto en Mercado', hint: 'URL de Amazon, Mercado Libre, eBay o ASIN' },
      { value: 'web', label: 'Palabra Clave', hint: 'Frase de búsqueda (ej: freidoras aire)' },
      { value: 'news', label: 'Noticias / Prensa', hint: 'Nombre de marca o industria' }
    ];
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
    this.updateHeaderContext('Intel Radar', null, window.currentOrgName || 'Mi Organización');
    try {
      await this.initSupabase();
      this.brandContainerId = await this.getBrandContainerId();
      await this.loadEntities();
      this.renderList();
      this.setupEventListeners();
      if (typeof this.updateLinksForRouter === 'function') this.updateLinksForRouter();
    } catch (err) {
      console.error('IntelRadarView render:', err);
      this.showError('Error al cargar Intel Radar. ' + (err?.message || ''));
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
      console.error('IntelRadarView initSupabase:', e);
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
      console.error('IntelRadarView getBrandContainerId:', e);
      return null;
    }
  }

  async loadEntities() {
    if (!this.supabase || !this.brandContainerId) {
      this.entities = [];
      return [];
    }
    const { data, error } = await this.supabase
      .from('intelligence_entities')
      .select('id, name, domain, target_identifier, is_active, metadata, created_at')
      .eq('brand_container_id', this.brandContainerId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('IntelRadarView loadEntities:', error);
      this.entities = [];
      return [];
    }
    this.entities = data || [];
    return this.entities;
  }

  renderList() {
    const emptyEl = document.getElementById('intelRadarEmpty');
    const cardsEl = document.getElementById('intelRadarCards');
    if (!emptyEl || !cardsEl) return;

    if (this.entities.length === 0) {
      emptyEl.style.display = 'block';
      cardsEl.innerHTML = '';
      return;
    }
    emptyEl.style.display = 'none';

    const domainLabel = (d) => this.DOMAINS.find(x => x.value === d)?.label || d;
    cardsEl.innerHTML = this.entities.map(e => `
      <div class="intel-radar-card" data-entity-id="${e.id}">
        <div class="intel-radar-card-header">
          <span class="intel-radar-card-domain">${this.escapeHtml(domainLabel(e.domain))}</span>
          <span class="intel-radar-card-status ${e.is_active ? 'active' : 'paused'}">${e.is_active ? 'Activo' : 'Pausado'}</span>
        </div>
        <h3 class="intel-radar-card-name">${this.escapeHtml(e.name)}</h3>
        <p class="intel-radar-card-target">${this.escapeHtml(e.target_identifier || '—')}</p>
        <div class="intel-radar-card-actions">
          <a href="${this.getBasePath()}/tasks" class="btn btn-ghost btn-sm" data-route="${this.getBasePath()}/tasks" title="Programar scraping">Programar</a>
          <button type="button" class="btn btn-ghost btn-sm intel-radar-edit" data-id="${e.id}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm intel-radar-delete" data-id="${e.id}">Eliminar</button>
        </div>
      </div>
    `).join('');
  }

  getBasePath() {
    const orgId = this.organizationId || window.appState?.get('selectedOrganizationId');
    if (orgId && typeof window.getOrgPathPrefix === 'function') {
      const name = window.currentOrgName || '';
      const prefix = window.getOrgPathPrefix(orgId, name);
      if (prefix) return prefix;
    }
    return '';
  }

  setupEventListeners() {
    const addBtn = document.getElementById('intelRadarAddBtn');
    const emptyAddBtn = document.getElementById('intelRadarEmptyAddBtn');
    const modal = document.getElementById('intelRadarEntityModal');
    const form = document.getElementById('intelRadarEntityForm');
    const domainSelect = document.getElementById('intelRadarDomain');
    const closeBtn = document.getElementById('intelRadarModalClose');
    const cancelBtn = document.getElementById('intelRadarModalCancel');

    [addBtn, emptyAddBtn].filter(Boolean).forEach(btn => {
      btn.addEventListener('click', () => this.openModal());
    });

    if (domainSelect) {
      domainSelect.addEventListener('change', () => {
        const hint = document.getElementById('intelRadarTargetHint');
        const opt = this.DOMAINS.find(x => x.value === domainSelect.value);
        if (hint) hint.textContent = opt ? opt.hint : '';
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEntity();
      });
    }

    document.getElementById('intelRadarCards')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.intel-radar-edit');
      const delBtn = e.target.closest('.intel-radar-delete');
      if (editBtn) this.openModal(editBtn.dataset.id);
      if (delBtn) this.confirmDelete(delBtn.dataset.id);
    });
  }

  openModal(entityId = null) {
    const modal = document.getElementById('intelRadarEntityModal');
    const title = document.getElementById('intelRadarModalTitle');
    const idInput = document.getElementById('intelRadarEntityId');
    const nameInput = document.getElementById('intelRadarEntityName');
    const domainSelect = document.getElementById('intelRadarDomain');
    const targetInput = document.getElementById('intelRadarTargetIdentifier');
    const activeCheck = document.getElementById('intelRadarIsActive');
    if (!modal) return;

    if (entityId) {
      const e = this.entities.find(x => x.id === entityId);
      if (e) {
        if (title) title.textContent = 'Editar objetivo';
        if (idInput) idInput.value = e.id;
        if (nameInput) nameInput.value = e.name || '';
        if (domainSelect) domainSelect.value = e.domain || '';
        if (targetInput) targetInput.value = e.target_identifier || '';
        if (activeCheck) activeCheck.checked = !!e.is_active;
      }
    } else {
      if (title) title.textContent = 'Añadir objetivo';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (domainSelect) domainSelect.value = '';
      if (targetInput) targetInput.value = '';
      if (activeCheck) activeCheck.checked = true;
    }
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  closeModal() {
    const modal = document.getElementById('intelRadarEntityModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async saveEntity() {
    const idInput = document.getElementById('intelRadarEntityId');
    const name = document.getElementById('intelRadarEntityName')?.value?.trim();
    const domain = document.getElementById('intelRadarDomain')?.value;
    const target_identifier = document.getElementById('intelRadarTargetIdentifier')?.value?.trim();
    const is_active = document.getElementById('intelRadarIsActive')?.checked ?? true;

    if (!name || !domain || !target_identifier) {
      this.showNotification('Completa nombre, tipo y identificador.', 'warning');
      return;
    }
    if (!this.supabase || !this.brandContainerId) {
      this.showNotification('No se pudo guardar: sesión o marca no disponible.', 'error');
      return;
    }

    const payload = {
      brand_container_id: this.brandContainerId,
      name,
      domain,
      target_identifier,
      is_active,
      metadata: {}
    };

    const entityId = idInput?.value?.trim() || null;
    if (entityId) {
      const { error } = await this.supabase
        .from('intelligence_entities')
        .update({ name, domain, target_identifier, is_active })
        .eq('id', entityId)
        .eq('brand_container_id', this.brandContainerId);
      if (error) {
        console.error('IntelRadarView update:', error);
        this.showNotification('Error al actualizar.', 'error');
        return;
      }
      this.showNotification('Objetivo actualizado.', 'success');
    } else {
      const { error } = await this.supabase
        .from('intelligence_entities')
        .insert(payload);
      if (error) {
        console.error('IntelRadarView insert:', error);
        this.showNotification('Error al crear.', 'error');
        return;
      }
      this.showNotification('Objetivo creado. Configura la programación en Task para activar el scraping.', 'success');
    }
    this.closeModal();
    await this.loadEntities();
    this.renderList();
  }

  async confirmDelete(entityId) {
    const e = this.entities.find(x => x.id === entityId);
    if (!e || !confirm(`¿Eliminar el objetivo "${this.escapeHtml(e.name)}"?`)) return;
    await this.deleteEntity(entityId);
  }

  async deleteEntity(entityId) {
    if (!this.supabase || !this.brandContainerId) return;
    const { error } = await this.supabase
      .from('intelligence_entities')
      .delete()
      .eq('id', entityId)
      .eq('brand_container_id', this.brandContainerId);
    if (error) {
      console.error('IntelRadarView delete:', error);
      this.showNotification('Error al eliminar.', 'error');
      return;
    }
    this.showNotification('Objetivo eliminado.', 'success');
    await this.loadEntities();
    this.renderList();
  }

  escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  showError(msg) {
    const container = document.getElementById('app-container');
    const wrap = container?.querySelector('.intel-radar-page') || container;
    if (wrap) {
      wrap.innerHTML = `<div class="intel-radar-page" style="padding: 2rem;"><h1 class="intel-radar-title">Intel Radar</h1><div class="error-container" style="margin-top: 2rem; text-align: center;"><p style="color: var(--text-secondary);">${this.escapeHtml(msg)}</p><button type="button" class="btn btn-primary" style="margin-top: 1rem;" onclick="window.location.reload()">Recargar</button></div></div>`;
    }
  }

  showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, type);
    } else if (window.BaseView?.prototype?.showNotification) {
      super.showNotification?.(message, type);
    } else {
      alert(message);
    }
  }
}

window.IntelRadarView = IntelRadarView;
