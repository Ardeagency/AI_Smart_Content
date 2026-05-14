/**
 * ServicesView — Listado de servicios de la organización (grid de cards).
 * Mismo patrón de carga que ProductsListView, pero sobre la tabla `services`.
 */
class ServicesView extends BaseView {
  static cacheable = true;

  constructor() {
    super();
    this.templatePath = null;
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.services = [];
  }

  renderHTML() {
    return `
<div class="services-page" id="servicesPage">
  <div class="services-header">
    <h1 class="services-title">Servicios</h1>
    <div class="services-header-actions">
      <button type="button" class="services-add-btn" id="servicesAddBtn" aria-label="Agregar servicio">
        <span>+ Servicio</span>
      </button>
    </div>
  </div>

  <section class="services-section" id="servicesSection" style="display:none;">
    <div class="services-section-head">
      <div class="services-section-head-main">
        <h2 class="services-section-title">Catálogo</h2>
        <span class="services-section-count" id="servicesCount">0</span>
      </div>
    </div>
    <div class="services-grid" id="servicesGrid"></div>
  </section>

  <div class="services-empty" id="servicesEmpty" style="display:none;">
    <i class="fas fa-briefcase" aria-hidden="true"></i>
    <p>Aún no hay servicios. Crea el primero con + Servicio.</p>
  </div>
</div>`;
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
    this.organizationId =
      this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
  }

  async render() {
    await super.render();
    await this._initSupabase();
    await this._loadData();
    this._renderServices();
    this._setupEventListeners();
  }

  async _initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('ServicesView _initSupabase:', e);
    }
  }

  async _loadData() {
    if (!this.supabase || !this.organizationId) {
      this.services = [];
      return;
    }
    const orgId = this.organizationId;
    try {
      const fetcher = () => this._fetchServicesData(orgId);
      const result = window.apiClient
        ? await window.apiClient.query(`services-list:${orgId}`, fetcher, { ttl: 60 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      this.services = result.services;
    } catch (e) {
      console.error('ServicesView _loadData:', e);
      if (window.errorLogger) window.errorLogger.capture(e, { source: 'ServicesView._loadData' });
      this.services = [];
    }
  }

  async _fetchServicesData(orgId) {
    const { data, error } = await this.supabase
      .from('services')
      .select('id, entity_id, nombre_servicio, descripcion_servicio, duracion_estimada, precio_base, moneda, beneficios_principales')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { services: data || [] };
  }

  _invalidateCache() {
    if (window.apiClient && this.organizationId) {
      window.apiClient.invalidate(`services-list:${this.organizationId}`);
    }
  }

  async _ensureEntityId() {
    if (!this.supabase || !this.organizationId) return null;
    const { data: rows, error } = await this.supabase
      .from('brand_entities')
      .select('id')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.error('ServicesView _ensureEntityId:', error);
      return null;
    }
    if (rows?.length) return rows[0].id;

    const { data: created, error: insErr } = await this.supabase
      .from('brand_entities')
      .insert({
        organization_id: this.organizationId,
        name: 'Identity principal',
        entity_type: 'other',
        description: null,
      })
      .select('id')
      .single();
    if (insErr) {
      console.error('ServicesView _ensureEntityId insert:', insErr);
      return null;
    }
    return created?.id || null;
  }

  async _onAddService() {
    if (!this.supabase || !this.organizationId) return;
    const btn = document.getElementById('servicesAddBtn');
    if (btn) btn.disabled = true;
    try {
      const entityId = await this._ensureEntityId();
      if (!entityId) {
        alert('No se pudo obtener una identidad para vincular el servicio.');
        return;
      }
      const { error } = await this.supabase.from('services').insert({
        organization_id: this.organizationId,
        entity_id: entityId,
        nombre_servicio: 'Nuevo servicio',
        descripcion_servicio: null,
      });
      if (error) throw error;
      this._invalidateCache();
      await this._loadData();
      this._renderServices();
    } catch (e) {
      console.error('ServicesView _onAddService:', e);
      alert(e?.message || 'Error al crear el servicio');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderServices() {
    const section = document.getElementById('servicesSection');
    const empty = document.getElementById('servicesEmpty');
    const grid = document.getElementById('servicesGrid');
    const count = document.getElementById('servicesCount');
    if (!grid) return;

    if (count) count.textContent = String(this.services.length || 0);

    if (!this.services.length) {
      grid.innerHTML = '';
      if (section) section.style.display = 'none';
      if (empty) empty.style.display = '';
      return;
    }
    if (section) section.style.display = '';
    if (empty) empty.style.display = 'none';

    grid.innerHTML = this.services.map((s) => {
      const price = s.precio_base != null ? `${s.precio_base} ${s.moneda || 'USD'}` : '';
      const tags = (s.beneficios_principales || []).slice(0, 3);
      const name = this.escapeHtml(s.nombre_servicio || 'Servicio');
      return `
        <article class="service-card" data-service-id="${s.id}">
          <div class="service-card-head">
            <h3 class="service-card-title">${name}</h3>
            ${price ? `<span class="service-card-price">${this.escapeHtml(price)}</span>` : ''}
          </div>
          ${s.descripcion_servicio ? `<p class="service-card-desc">${this.escapeHtml(s.descripcion_servicio)}</p>` : '<p class="service-card-desc service-card-desc-empty">Sin descripción todavía.</p>'}
          <div class="service-card-meta">
            ${s.duracion_estimada ? `<span class="service-card-duration"><i class="fas fa-clock" aria-hidden="true"></i> ${this.escapeHtml(s.duracion_estimada)}</span>` : ''}
          </div>
          ${tags.length ? `<div class="service-card-tags">${tags.map((t) => `<span class="service-card-tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </article>
      `;
    }).join('');
  }

  _setupEventListeners() {
    const addBtn = document.getElementById('servicesAddBtn');
    if (addBtn) addBtn.onclick = () => this._onAddService();
  }

  escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

window.ServicesView = ServicesView;
