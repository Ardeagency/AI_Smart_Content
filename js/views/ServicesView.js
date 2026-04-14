/**
 * ServicesView - Vista de gestión de servicios
 * CRUD completo contra tabla services (schema actualizado)
 * Campos: nombre_servicio, descripcion_servicio, duracion_estimada, precio_base, moneda,
 *         beneficios_principales, diferenciadores, casos_de_uso, entregables,
 *         metodologia_pasos, url_servicio, entity_id, organization_id
 */
class ServicesView extends BaseView {
  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.services = [];
    this.currentService = null;
    this.brandEntities = [];
  }

  renderHTML() {
    return `
<div class="services-page" id="servicesPage">

  <!-- Vista lista -->
  <div class="services-list-view" id="servicesListView">
    <div class="services-header">
      <h1 class="services-title">Servicios</h1>
      <button type="button" class="btn btn-primary" id="createServiceBtn">
        <i class="fas fa-plus"></i> Nuevo Servicio
      </button>
    </div>
    <div class="services-grid" id="servicesGrid"></div>
    <div class="services-empty" id="servicesEmpty" style="display:none;">
      <i class="fas fa-concierge-bell"></i>
      <p>No hay servicios registrados. Crea uno para enriquecer tu motor de contenido.</p>
      <button type="button" class="btn btn-primary" id="createServiceEmptyBtn">Nuevo Servicio</button>
    </div>
  </div>

  <!-- Vista detalle -->
  <div class="service-detail-view" id="serviceDetailView" style="display:none;">
    <div class="service-detail-header">
      <button type="button" class="btn btn-ghost" id="backToServicesBtn">
        <i class="fas fa-arrow-left"></i> Volver
      </button>
      <h1 class="service-detail-title" id="serviceDetailTitle">Servicio</h1>
      <div class="service-detail-actions">
        <button type="button" class="btn btn-secondary" id="serviceEditBtn"><i class="fas fa-pen"></i> Editar</button>
        <button type="button" class="btn btn-ghost btn-danger" id="serviceDeleteBtn"><i class="fas fa-trash"></i> Eliminar</button>
      </div>
    </div>
    <div class="service-detail-body" id="serviceDetailBody"></div>
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
    await this.loadBrandEntities();

    const path = window.location.pathname || '';
    const serviceId = this.routeParams?.serviceId || path.match(/\/servicios\/([^/]+)/)?.[1];

    if (serviceId && serviceId !== 'new') {
      await this.showDetail(serviceId);
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
      console.error('ServicesView initSupabase:', e);
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
      console.error('ServicesView loadBrandEntities:', e);
    }
  }

  async loadServices() {
    if (!this.supabase || !this.organizationId) return [];
    try {
      const { data, error } = await this.supabase
        .from('services')
        .select('id, nombre_servicio, descripcion_servicio, duracion_estimada, precio_base, moneda, url_servicio, entity_id, beneficios_principales, diferenciadores, casos_de_uso, entregables, metodologia_pasos, created_at, updated_at')
        .eq('organization_id', this.organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.services = data || [];
      return this.services;
    } catch (e) {
      console.error('ServicesView loadServices:', e);
      return [];
    }
  }

  async renderList() {
    document.getElementById('servicesListView').style.display = 'block';
    document.getElementById('serviceDetailView').style.display = 'none';

    await this.loadServices();
    const grid = document.getElementById('servicesGrid');
    const empty = document.getElementById('servicesEmpty');
    if (!grid) return;

    if (!this.services.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.services.map(s => {
      const entityObj = this.brandEntities.find(e => e.id === s.entity_id);
      const entityName = entityObj ? entityObj.name : null;
      const price = s.precio_base != null ? `${s.precio_base} ${s.moneda || 'USD'}` : null;
      return `
        <article class="service-card" data-service-id="${s.id}" role="button" tabindex="0">
          <div class="service-card-inner">
            <h3 class="service-card-name">${this.escapeHtml(s.nombre_servicio)}</h3>
            ${s.descripcion_servicio ? `<p class="service-card-desc">${this.escapeHtml(s.descripcion_servicio)}</p>` : ''}
            <div class="service-card-meta">
              ${price ? `<span class="service-card-price">${this.escapeHtml(price)}</span>` : ''}
              ${s.duracion_estimada ? `<span class="service-card-duration"><i class="fas fa-clock"></i> ${this.escapeHtml(s.duracion_estimada)}</span>` : ''}
              ${entityName ? `<span class="service-card-entity">${this.escapeHtml(entityName)}</span>` : ''}
            </div>
            ${(s.beneficios_principales || []).length ? `
              <div class="service-card-benefits">
                ${(s.beneficios_principales || []).slice(0, 3).map(b => `<span class="service-tag">${this.escapeHtml(b)}</span>`).join('')}
              </div>` : ''}
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.service-card').forEach(card => {
      const id = card.getAttribute('data-service-id');
      card.addEventListener('click', () => this.showDetail(id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.showDetail(id); }
      });
    });
  }

  async showDetail(serviceId) {
    if (!this.supabase || !serviceId) return;
    try {
      const { data, error } = await this.supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single();
      if (error || !data) return;
      this.currentService = data;

      document.getElementById('servicesListView').style.display = 'none';
      document.getElementById('serviceDetailView').style.display = 'block';
      const titleEl = document.getElementById('serviceDetailTitle');
      if (titleEl) titleEl.textContent = data.nombre_servicio;

      this.renderDetailBody(data);
    } catch (e) {
      console.error('ServicesView showDetail:', e);
    }
  }

  renderDetailBody(s) {
    const body = document.getElementById('serviceDetailBody');
    if (!body) return;

    const entityObj = this.brandEntities.find(e => e.id === s.entity_id);
    const entityName = entityObj ? entityObj.name : '—';
    const price = s.precio_base != null ? `${s.precio_base} ${s.moneda || 'USD'}` : '—';

    const renderArr = (arr, placeholder = 'Sin datos') => {
      if (!arr || !arr.length) return `<span class="service-field-empty">${this.escapeHtml(placeholder)}</span>`;
      return arr.map(i => `<span class="service-tag">${this.escapeHtml(i)}</span>`).join('');
    };

    const renderSteps = (arr) => {
      if (!arr || !arr.length) return `<span class="service-field-empty">Sin pasos definidos</span>`;
      return `<ol class="service-steps">${arr.map(step => `<li>${this.escapeHtml(step)}</li>`).join('')}</ol>`;
    };

    body.innerHTML = `
      <div class="service-detail-grid">
        <section class="service-section service-section-overview">
          <h2>Información general</h2>
          <div class="service-field-row"><span class="service-field-label">Descripción</span><span class="service-field-value">${this.escapeHtml(s.descripcion_servicio || '—')}</span></div>
          <div class="service-field-row"><span class="service-field-label">Duración estimada</span><span class="service-field-value">${this.escapeHtml(s.duracion_estimada || '—')}</span></div>
          <div class="service-field-row"><span class="service-field-label">Precio base</span><span class="service-field-value">${this.escapeHtml(price)}</span></div>
          <div class="service-field-row"><span class="service-field-label">URL del servicio</span><span class="service-field-value">${s.url_servicio ? `<a href="${this.escapeHtml(s.url_servicio)}" target="_blank" rel="noopener">${this.escapeHtml(s.url_servicio)}</a>` : '—'}</span></div>
          <div class="service-field-row"><span class="service-field-label">Entidad vinculada</span><span class="service-field-value">${this.escapeHtml(entityName)}</span></div>
        </section>

        <section class="service-section">
          <h2>Beneficios principales</h2>
          <div class="service-tags-wrap">${renderArr(s.beneficios_principales)}</div>
        </section>

        <section class="service-section">
          <h2>Diferenciadores</h2>
          <div class="service-tags-wrap">${renderArr(s.diferenciadores)}</div>
        </section>

        <section class="service-section">
          <h2>Casos de uso</h2>
          <div class="service-tags-wrap">${renderArr(s.casos_de_uso)}</div>
        </section>

        <section class="service-section">
          <h2>Entregables</h2>
          <div class="service-tags-wrap">${renderArr(s.entregables)}</div>
        </section>

        <section class="service-section service-section-full">
          <h2>Metodología / Pasos</h2>
          ${renderSteps(s.metodologia_pasos)}
        </section>
      </div>
    `;
  }

  setupEventListeners() {
    document.getElementById('createServiceBtn')?.addEventListener('click', () => this.openCreateModal());
    document.getElementById('createServiceEmptyBtn')?.addEventListener('click', () => this.openCreateModal());
    document.getElementById('backToServicesBtn')?.addEventListener('click', () => this.renderList());
    document.getElementById('serviceEditBtn')?.addEventListener('click', () => {
      if (this.currentService) this.openEditModal(this.currentService);
    });
    document.getElementById('serviceDeleteBtn')?.addEventListener('click', () => {
      if (this.currentService) this.deleteService(this.currentService.id);
    });
  }

  _buildModalHtml(title, data = {}) {
    const entityOpts = this.brandEntities.map(e =>
      `<option value="${e.id}" ${data.entity_id === e.id ? 'selected' : ''}>${this.escapeHtml(e.name)}</option>`
    ).join('');

    const monedas = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP'];
    const monedaOpts = monedas.map(m => `<option value="${m}" ${(data.moneda || 'USD') === m ? 'selected' : ''}>${m}</option>`).join('');

    const arrToText = key => (Array.isArray(data[key]) ? data[key].join('\n') : (data[key] || ''));

    const textareaField = (id, label, key, placeholder = '') => `
      <div class="form-group">
        <label for="${id}">${label} <span class="form-hint">(uno por línea)</span></label>
        <textarea id="${id}" class="form-input" rows="3" placeholder="${placeholder}">${this.escapeHtml(arrToText(key))}</textarea>
      </div>`;

    return `
      <div class="modal-overlay service-modal-overlay" id="serviceModal">
        <div class="modal service-modal">
          <div class="modal-header">
            <h3>${this.escapeHtml(title)}</h3>
            <button type="button" class="modal-close" id="serviceModalClose" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body service-modal-body">
            <div class="form-group">
              <label for="svc_nombre">Nombre del servicio <span class="form-required">*</span></label>
              <input type="text" id="svc_nombre" class="form-input" required placeholder="Ej: Consultoría estratégica" value="${this.escapeHtml(data.nombre_servicio || '')}">
            </div>
            <div class="form-group">
              <label for="svc_descripcion">Descripción</label>
              <textarea id="svc_descripcion" class="form-input" rows="3" placeholder="Describe qué hace este servicio">${this.escapeHtml(data.descripcion_servicio || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="svc_duracion">Duración estimada</label>
                <input type="text" id="svc_duracion" class="form-input" placeholder="Ej: 2 semanas, 1 hora" value="${this.escapeHtml(data.duracion_estimada || '')}">
              </div>
              <div class="form-group">
                <label for="svc_precio">Precio base</label>
                <input type="number" id="svc_precio" class="form-input" step="any" placeholder="0" value="${data.precio_base != null ? data.precio_base : ''}">
              </div>
              <div class="form-group">
                <label for="svc_moneda">Moneda</label>
                <select id="svc_moneda" class="form-input">${monedaOpts}</select>
              </div>
            </div>
            <div class="form-group">
              <label for="svc_url">URL del servicio</label>
              <input type="url" id="svc_url" class="form-input" placeholder="https://" value="${this.escapeHtml(data.url_servicio || '')}">
            </div>
            ${this.brandEntities.length ? `
            <div class="form-group">
              <label for="svc_entity">Entidad vinculada</label>
              <select id="svc_entity" class="form-input">
                <option value="">Sin entidad</option>
                ${entityOpts}
              </select>
            </div>` : ''}
            ${textareaField('svc_beneficios', 'Beneficios principales', 'beneficios_principales', 'Principales beneficios del servicio...')}
            ${textareaField('svc_diferenciadores', 'Diferenciadores', 'diferenciadores', 'Qué lo hace único...')}
            ${textareaField('svc_casos', 'Casos de uso', 'casos_de_uso', 'Cuándo usar este servicio...')}
            ${textareaField('svc_entregables', 'Entregables', 'entregables', 'Qué se entrega al cliente...')}
            ${textareaField('svc_metodologia', 'Metodología / Pasos', 'metodologia_pasos', 'Paso 1: ...\nPaso 2: ...')}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="serviceModalCancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="serviceModalSubmit">Guardar</button>
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
    const precioRaw = document.getElementById('svc_precio')?.value;
    return {
      nombre_servicio: document.getElementById('svc_nombre')?.value?.trim() || '',
      descripcion_servicio: document.getElementById('svc_descripcion')?.value?.trim() || null,
      duracion_estimada: document.getElementById('svc_duracion')?.value?.trim() || null,
      precio_base: precioRaw ? parseFloat(precioRaw) : null,
      moneda: document.getElementById('svc_moneda')?.value || 'USD',
      url_servicio: document.getElementById('svc_url')?.value?.trim() || null,
      entity_id: document.getElementById('svc_entity')?.value || null,
      beneficios_principales: toArr('svc_beneficios'),
      diferenciadores: toArr('svc_diferenciadores'),
      casos_de_uso: toArr('svc_casos'),
      entregables: toArr('svc_entregables'),
      metodologia_pasos: toArr('svc_metodologia'),
    };
  }

  openCreateModal() {
    document.getElementById('serviceModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', this._buildModalHtml('Nuevo Servicio'));
    document.getElementById('serviceModalClose')?.addEventListener('click', () => document.getElementById('serviceModal')?.remove());
    document.getElementById('serviceModalCancel')?.addEventListener('click', () => document.getElementById('serviceModal')?.remove());
    document.getElementById('serviceModalSubmit')?.addEventListener('click', () => this.submitCreate());
  }

  async submitCreate() {
    const payload = this._collectModalData();
    if (!payload.nombre_servicio) { alert('El nombre es obligatorio.'); return; }
    if (!this.supabase || !this.organizationId) return;

    const { data, error } = await this.supabase
      .from('services')
      .insert({ ...payload, organization_id: this.organizationId })
      .select('id')
      .single();

    if (error) { console.error('ServicesView create:', error); alert('Error al crear el servicio.'); return; }
    document.getElementById('serviceModal')?.remove();
    await this.showDetail(data.id);
  }

  openEditModal(service) {
    document.getElementById('serviceModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', this._buildModalHtml('Editar Servicio', service));
    document.getElementById('serviceModalClose')?.addEventListener('click', () => document.getElementById('serviceModal')?.remove());
    document.getElementById('serviceModalCancel')?.addEventListener('click', () => document.getElementById('serviceModal')?.remove());
    document.getElementById('serviceModalSubmit')?.addEventListener('click', () => this.submitEdit(service.id));
  }

  async submitEdit(serviceId) {
    const payload = this._collectModalData();
    if (!payload.nombre_servicio) { alert('El nombre es obligatorio.'); return; }
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from('services')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', serviceId);

    if (error) { console.error('ServicesView update:', error); alert('Error al guardar.'); return; }
    document.getElementById('serviceModal')?.remove();
    await this.showDetail(serviceId);
  }

  async deleteService(serviceId) {
    if (!confirm('¿Eliminar este servicio? Esta acción no se puede deshacer.')) return;
    if (!this.supabase) return;

    const { error } = await this.supabase.from('services').delete().eq('id', serviceId);
    if (error) { console.error('ServicesView delete:', error); alert('Error al eliminar.'); return; }
    this.currentService = null;
    await this.renderList();
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.ServicesView = ServicesView;
