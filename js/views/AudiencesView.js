/**
 * AudiencesView - Vista de audiencias
 * CRUD completo contra tabla audiences (schema actualizado)
 * Campos: name, description, awareness_level, entity_id,
 *         datos_demograficos, datos_psicograficos, dolores, deseos,
 *         objeciones, gatillos_compra, estilo_lenguaje
 */
class AudiencesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.audiences = [];
    this.currentAudience = null;
    this.brandEntities = [];

    this.AWARENESS_LEVELS = [
      { value: 'unaware', label: 'Sin conciencia' },
      { value: 'problem_aware', label: 'Consciente del problema' },
      { value: 'solution_aware', label: 'Consciente de la solución' },
      { value: 'product_aware', label: 'Consciente del producto' },
      { value: 'most_aware', label: 'Totalmente consciente' },
    ];
  }

  renderHTML() {
    return `
<div class="audiences-page" id="audiencesPage">

  <!-- Vista lista -->
  <div class="audiences-list-view" id="audiencesListView">
    <div class="audiences-header">
      <h1 class="audiences-title">Audiencias</h1>
      <button type="button" class="btn btn-primary" id="createAudienceBtn">
        <i class="fas fa-plus"></i> Nueva Audiencia
      </button>
    </div>
    <div class="audiences-grid" id="audiencesGrid"></div>
    <div class="audiences-empty" id="audiencesEmpty" style="display:none;">
      <i class="fas fa-users"></i>
      <p>No hay audiencias definidas. Crea una para segmentar tu contenido.</p>
      <button type="button" class="btn btn-primary" id="createAudienceEmptyBtn">Nueva Audiencia</button>
    </div>
  </div>

  <!-- Vista detalle -->
  <div class="audience-detail-view" id="audienceDetailView" style="display:none;">
    <div class="audience-detail-header">
      <button type="button" class="btn btn-ghost" id="backToAudiencesBtn">
        <i class="fas fa-arrow-left"></i> Volver
      </button>
      <h1 class="audience-detail-title" id="audienceDetailTitle">Audiencia</h1>
      <div class="audience-detail-actions">
        <button type="button" class="btn btn-secondary" id="audienceEditBtn"><i class="fas fa-pen"></i> Editar</button>
        <button type="button" class="btn btn-ghost btn-danger" id="audienceDeleteBtn"><i class="fas fa-trash"></i> Eliminar</button>
      </div>
    </div>

    <div class="audience-detail-body" id="audienceDetailBody">
      <!-- Relleno dinámicamente -->
    </div>
  </div>

</div>
    `;
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
  }

  async render() {
    await super.render();
    await this.initSupabase();
    await this.loadBrandContainer();
    await this.loadBrandEntities();

    const path = window.location.pathname || '';
    const audienceId = this.routeParams?.audienceId || path.match(/\/audiences\/([^/]+)/)?.[1];

    if (audienceId && audienceId !== 'new') {
      await this.showDetail(audienceId);
    } else {
      await this.renderList();
    }

    this.setupEventListeners();
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
      console.error('AudiencesView initSupabase:', e);
    }
  }

  async loadBrandContainer() {
    if (!this.supabase) return;
    try {
      if (this.organizationId) {
        const { data } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data?.id) { this.brandContainerId = data.id; return; }
      }
      if (this.userId) {
        const { data } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.id) this.brandContainerId = data.id;
      }
    } catch (e) {
      console.error('AudiencesView loadBrandContainer:', e);
    }
  }

  async loadBrandEntities() {
    if (!this.supabase || !this.organizationId) return;
    try {
      const { data } = await this.supabase
        .from('brand_entities')
        .select('id, name, entity_type')
        .eq('organization_id', this.organizationId)
        .order('name');
      this.brandEntities = data || [];
    } catch (e) {
      console.error('AudiencesView loadBrandEntities:', e);
    }
  }

  async loadAudiences() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data, error } = await this.supabase
        .from('audiences')
        .select('id, name, description, awareness_level, entity_id, datos_demograficos, datos_psicograficos, dolores, deseos, objeciones, gatillos_compra, estilo_lenguaje, created_at, updated_at')
        .eq('brand_container_id', this.brandContainerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.audiences = data || [];
      return this.audiences;
    } catch (e) {
      console.error('AudiencesView loadAudiences:', e);
      return [];
    }
  }

  async renderList() {
    const listView = document.getElementById('audiencesListView');
    const detailView = document.getElementById('audienceDetailView');
    if (listView) listView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';

    await this.loadAudiences();
    const grid = document.getElementById('audiencesGrid');
    const empty = document.getElementById('audiencesEmpty');
    if (!grid) return;

    if (!this.audiences.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.audiences.map(a => {
      const levelObj = this.AWARENESS_LEVELS.find(l => l.value === a.awareness_level);
      const level = levelObj ? levelObj.label : '—';
      const tags = (a.dolores || []).slice(0, 2);
      return `
        <article class="audience-card" data-audience-id="${a.id}" role="button" tabindex="0">
          <h3 class="audience-card-name">${this.escapeHtml(a.name)}</h3>
          ${a.description ? `<p class="audience-card-desc">${this.escapeHtml(a.description)}</p>` : ''}
          <div class="audience-card-meta">
            <span class="audience-card-level">${this.escapeHtml(level)}</span>
          </div>
          ${tags.length ? `<div class="audience-card-tags">${tags.map(t => `<span class="audience-tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.audience-card').forEach(card => {
      const id = card.getAttribute('data-audience-id');
      card.addEventListener('click', () => this.showDetail(id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.showDetail(id); }
      });
    });
  }

  async showDetail(audienceId) {
    if (!this.supabase || !audienceId) return;
    try {
      const { data, error } = await this.supabase
        .from('audiences')
        .select('*')
        .eq('id', audienceId)
        .single();
      if (error || !data) return;
      this.currentAudience = data;

      const listView = document.getElementById('audiencesListView');
      const detailView = document.getElementById('audienceDetailView');
      if (listView) listView.style.display = 'none';
      if (detailView) detailView.style.display = 'block';

      const titleEl = document.getElementById('audienceDetailTitle');
      if (titleEl) titleEl.textContent = data.name;

      this.renderDetailBody(data);
    } catch (e) {
      console.error('AudiencesView showDetail:', e);
    }
  }

  renderDetailBody(a) {
    const body = document.getElementById('audienceDetailBody');
    if (!body) return;

    const levelObj = this.AWARENESS_LEVELS.find(l => l.value === a.awareness_level);
    const levelLabel = levelObj ? levelObj.label : '—';

    const entityObj = this.brandEntities.find(e => e.id === a.entity_id);
    const entityName = entityObj ? entityObj.name : '—';

    const renderArray = (arr, placeholder = 'Sin datos') => {
      if (!arr || !arr.length) return `<span class="audience-field-empty">${this.escapeHtml(placeholder)}</span>`;
      return arr.map(i => `<span class="audience-tag">${this.escapeHtml(i)}</span>`).join('');
    };

    body.innerHTML = `
      <div class="audience-detail-grid">
        <section class="audience-section audience-section-overview">
          <h2>Información general</h2>
          <div class="audience-field-row"><span class="audience-field-label">Descripción</span><span class="audience-field-value">${this.escapeHtml(a.description || '—')}</span></div>
          <div class="audience-field-row"><span class="audience-field-label">Nivel de conciencia</span><span class="audience-field-value">${this.escapeHtml(levelLabel)}</span></div>
          <div class="audience-field-row"><span class="audience-field-label">Entidad vinculada</span><span class="audience-field-value">${this.escapeHtml(entityName)}</span></div>
        </section>

        <section class="audience-section">
          <h2>Datos demográficos</h2>
          <div class="audience-tags-wrap">${renderArray(a.datos_demograficos)}</div>
        </section>

        <section class="audience-section">
          <h2>Datos psicográficos</h2>
          <div class="audience-tags-wrap">${renderArray(a.datos_psicograficos)}</div>
        </section>

        <section class="audience-section audience-section-highlight">
          <h2>Dolores</h2>
          <div class="audience-tags-wrap">${renderArray(a.dolores)}</div>
        </section>

        <section class="audience-section">
          <h2>Deseos</h2>
          <div class="audience-tags-wrap">${renderArray(a.deseos)}</div>
        </section>

        <section class="audience-section">
          <h2>Objeciones</h2>
          <div class="audience-tags-wrap">${renderArray(a.objeciones)}</div>
        </section>

        <section class="audience-section audience-section-highlight">
          <h2>Gatillos de compra</h2>
          <div class="audience-tags-wrap">${renderArray(a.gatillos_compra)}</div>
        </section>

        <section class="audience-section">
          <h2>Estilo de lenguaje</h2>
          <div class="audience-tags-wrap">${renderArray(a.estilo_lenguaje)}</div>
        </section>
      </div>
    `;
  }

  setupEventListeners() {
    document.getElementById('createAudienceBtn')?.addEventListener('click', () => this.openCreateModal());
    document.getElementById('createAudienceEmptyBtn')?.addEventListener('click', () => this.openCreateModal());
    document.getElementById('backToAudiencesBtn')?.addEventListener('click', () => this.renderList());
    document.getElementById('audienceEditBtn')?.addEventListener('click', () => {
      if (this.currentAudience) this.openEditModal(this.currentAudience);
    });
    document.getElementById('audienceDeleteBtn')?.addEventListener('click', () => {
      if (this.currentAudience) this.deleteAudience(this.currentAudience.id);
    });
  }

  _buildModalHtml(title, data = {}) {
    const levelOpts = this.AWARENESS_LEVELS.map(l =>
      `<option value="${l.value}" ${data.awareness_level === l.value ? 'selected' : ''}>${this.escapeHtml(l.label)}</option>`
    ).join('');

    const entityOpts = this.brandEntities.map(e =>
      `<option value="${e.id}" ${data.entity_id === e.id ? 'selected' : ''}>${this.escapeHtml(e.name)}</option>`
    ).join('');

    const arrToText = key => (Array.isArray(data[key]) ? data[key].join('\n') : (data[key] || ''));

    const textareaField = (id, label, key, placeholder = '') => `
      <div class="form-group">
        <label for="${id}">${label} <span class="form-hint">(uno por línea)</span></label>
        <textarea id="${id}" class="form-input" rows="3" placeholder="${placeholder}">${this.escapeHtml(arrToText(key))}</textarea>
      </div>`;

    return `
      <div class="modal-overlay audience-modal-overlay" id="audienceModal">
        <div class="modal audience-modal">
          <div class="modal-header">
            <h3>${this.escapeHtml(title)}</h3>
            <button type="button" class="modal-close" id="audienceModalClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body audience-modal-body">
            <div class="form-group">
              <label for="aud_name">Nombre <span class="form-required">*</span></label>
              <input type="text" id="aud_name" class="form-input" required placeholder="Ej: Emprendedores 25-40" value="${this.escapeHtml(data.name || '')}">
            </div>
            <div class="form-group">
              <label for="aud_description">Descripción</label>
              <textarea id="aud_description" class="form-input" rows="2" placeholder="Descripción general de este segmento">${this.escapeHtml(data.description || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="aud_awareness">Nivel de conciencia</label>
                <select id="aud_awareness" class="form-input">
                  <option value="">Seleccionar...</option>
                  ${levelOpts}
                </select>
              </div>
              ${this.brandEntities.length ? `
              <div class="form-group">
                <label for="aud_entity">Entidad vinculada</label>
                <select id="aud_entity" class="form-input">
                  <option value="">Sin entidad</option>
                  ${entityOpts}
                </select>
              </div>` : ''}
            </div>
            ${textareaField('aud_demograficos', 'Datos demográficos', 'datos_demograficos', 'Edad, género, ciudad...')}
            ${textareaField('aud_psicograficos', 'Datos psicográficos', 'datos_psicograficos', 'Valores, intereses, estilo de vida...')}
            ${textareaField('aud_dolores', 'Dolores', 'dolores', 'Problemas que enfrenta...')}
            ${textareaField('aud_deseos', 'Deseos', 'deseos', 'Lo que quiere lograr...')}
            ${textareaField('aud_objeciones', 'Objeciones', 'objeciones', 'Por qué no compra...')}
            ${textareaField('aud_gatillos', 'Gatillos de compra', 'gatillos_compra', 'Qué lo mueve a comprar...')}
            ${textareaField('aud_lenguaje', 'Estilo de lenguaje', 'estilo_lenguaje', 'Frases, tono, vocabulario...')}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="audienceModalCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="audienceModalSubmit">Guardar</button>
          </div>
        </div>
      </div>
    `;
  }

  _collectModalData() {
    const toArr = id => {
      const el = document.getElementById(id);
      if (!el) return [];
      return el.value.split(/\n/).map(s => s.trim()).filter(Boolean);
    };
    return {
      name: document.getElementById('aud_name')?.value?.trim() || '',
      description: document.getElementById('aud_description')?.value?.trim() || null,
      awareness_level: document.getElementById('aud_awareness')?.value || null,
      entity_id: document.getElementById('aud_entity')?.value || null,
      datos_demograficos: toArr('aud_demograficos'),
      datos_psicograficos: toArr('aud_psicograficos'),
      dolores: toArr('aud_dolores'),
      deseos: toArr('aud_deseos'),
      objeciones: toArr('aud_objeciones'),
      gatillos_compra: toArr('aud_gatillos'),
      estilo_lenguaje: toArr('aud_lenguaje'),
    };
  }

  openCreateModal() {
    document.getElementById('audienceModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', this._buildModalHtml('Nueva Audiencia'));
    document.getElementById('audienceModalClose')?.addEventListener('click', () => document.getElementById('audienceModal')?.remove());
    document.getElementById('audienceModalCancel')?.addEventListener('click', () => document.getElementById('audienceModal')?.remove());
    document.getElementById('audienceModalSubmit')?.addEventListener('click', () => this.submitCreate());
  }

  async submitCreate() {
    const payload = this._collectModalData();
    if (!payload.name) { alert('El nombre es obligatorio.'); return; }
    if (!this.supabase || !this.brandContainerId) return;

    const { data, error } = await this.supabase
      .from('audiences')
      .insert({ ...payload, brand_container_id: this.brandContainerId })
      .select('id')
      .single();

    if (error) { console.error('AudiencesView create:', error); alert('Error al crear la audiencia.'); return; }
    document.getElementById('audienceModal')?.remove();
    await this.showDetail(data.id);
  }

  openEditModal(audience) {
    document.getElementById('audienceModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', this._buildModalHtml('Editar Audiencia', audience));
    document.getElementById('audienceModalClose')?.addEventListener('click', () => document.getElementById('audienceModal')?.remove());
    document.getElementById('audienceModalCancel')?.addEventListener('click', () => document.getElementById('audienceModal')?.remove());
    document.getElementById('audienceModalSubmit')?.addEventListener('click', () => this.submitEdit(audience.id));
  }

  async submitEdit(audienceId) {
    const payload = this._collectModalData();
    if (!payload.name) { alert('El nombre es obligatorio.'); return; }
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from('audiences')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', audienceId);

    if (error) { console.error('AudiencesView update:', error); alert('Error al guardar.'); return; }
    document.getElementById('audienceModal')?.remove();
    await this.showDetail(audienceId);
  }

  async deleteAudience(audienceId) {
    if (!confirm('¿Eliminar esta audiencia? Esta acción no se puede deshacer.')) return;
    if (!this.supabase) return;

    const { error } = await this.supabase.from('audiences').delete().eq('id', audienceId);
    if (error) { console.error('AudiencesView delete:', error); alert('Error al eliminar.'); return; }
    this.currentAudience = null;
    await this.renderList();
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.AudiencesView = AudiencesView;
