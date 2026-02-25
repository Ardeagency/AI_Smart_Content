/**
 * CampaignsView - Vista de campañas estratégicas
 * Lista: Strategic Cards (no tabla). Detalle: secciones (Contexto temporal, Objetivos, Ángulos, Oferta, Tono).
 * Drawer lateral al hacer click en card; vista detalle completa en /campaigns/:id.
 */
class CampaignsView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'campaigns.html';
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.campaignId = null;
    this.campaigns = [];
    this.audiences = [];
    this.TONO_OPCIONES = ['Premium', 'Emocional', 'Técnico', 'Aspiracional', 'Disruptivo'];
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
    await this.initSupabase();
    this.brandContainerId = await this.getBrandContainerId();

    const path = window.location.pathname || '';
    this.campaignId = this.routeParams?.campaignId || (path.match(/\/campaigns\/([^/]+)/)?.[1]);
    if (this.campaignId && this.campaignId !== 'new') {
      await this.renderCampaignDetail();
      document.getElementById('campaignsListContainer').style.display = 'none';
      document.getElementById('campaignDetailContainer').style.display = 'block';
    } else {
      await this.renderCampaignsList();
      document.getElementById('campaignsListContainer').style.display = 'block';
      document.getElementById('campaignDetailContainer').style.display = 'none';
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
      console.error('CampaignsView initSupabase:', e);
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
      console.error('CampaignsView getBrandContainerId:', e);
      return null;
    }
  }

  /** Campañas con nombre de audiencia (join audiences). */
  async loadCampaigns() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data, error } = await this.supabase
        .from('campaigns')
        .select(`
          id,
          brand_container_id,
          nombre_campana,
          cta,
          cta_url,
          descripcion_interna,
          contexto_temporal,
          objetivos_estrategicos,
          angulos_venta,
          oferta_principal,
          tono_modificador,
          created_at,
          updated_at,
          audience_id,
          audiences (id, name)
        `)
        .eq('brand_container_id', this.brandContainerId)
        .order('updated_at', { ascending: false });
      if (error) {
        console.error('CampaignsView loadCampaigns:', error);
        return [];
      }
      this.campaigns = (data || []).map(c => {
        const aud = c.audiences;
        let audienceName = '—';
        if (aud) {
          if (aud.name) audienceName = aud.name;
          else if (Array.isArray(aud) && aud[0] && aud[0].name) audienceName = aud[0].name;
        }
        return Object.assign({}, c, { audience_name: audienceName });
      });
      return this.campaigns;
    } catch (e) {
      console.error('CampaignsView loadCampaigns:', e);
      return [];
    }
  }

  /** Una campaña por ID (con audiencia). */
  async loadCampaignById(id) {
    if (!this.supabase || !id) return null;
    try {
      const { data, error } = await this.supabase
        .from('campaigns')
        .select(`
          id,
          brand_container_id,
          nombre_campana,
          cta,
          cta_url,
          descripcion_interna,
          contexto_temporal,
          objetivos_estrategicos,
          angulos_venta,
          oferta_principal,
          tono_modificador,
          created_at,
          updated_at,
          audience_id,
          audiences (id, name)
        `)
        .eq('id', id)
        .single();
      if (error || !data) return null;
      const aud = data.audiences;
      let audienceName = '—';
      if (aud) {
        if (aud.name) audienceName = aud.name;
        else if (Array.isArray(aud) && aud[0] && aud[0].name) audienceName = aud[0].name;
      }
      return Object.assign({}, data, { audience_name: audienceName });
    } catch (e) {
      console.error('CampaignsView loadCampaignById:', e);
      return null;
    }
  }

  /** Audiencias de la marca (vía brands.project_id = brand_container_id). */
  async loadAudiences() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data: brand } = await this.supabase
        .from('brands')
        .select('id')
        .eq('project_id', this.brandContainerId)
        .maybeSingle();
      if (!brand?.id) return [];
      const { data, error } = await this.supabase
        .from('audiences')
        .select('id, name')
        .eq('brand_id', brand.id)
        .order('name');
      if (error) return [];
      this.audiences = data || [];
      return this.audiences;
    } catch (e) {
      console.error('CampaignsView loadAudiences:', e);
      return [];
    }
  }

  formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async renderCampaignsList() {
    const list = await this.loadCampaigns();
    const grid = document.getElementById('campaignsGrid');
    const empty = document.getElementById('campaignsEmpty');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.querySelector('#createCampaignEmptyBtn')?.addEventListener('click', () => this.openCreateModal());
      }
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = list.map(c => {
      const objetivo = (c.objetivos_estrategicos && c.objetivos_estrategicos[0]) || '—';
      const temporal = (c.contexto_temporal && c.contexto_temporal[0]) || '—';
      return `
        <article class="campaign-strategic-card" data-campaign-id="${c.id}" role="button" tabindex="0">
          <div class="campaign-card-inner">
            <h3 class="campaign-card-title">${this.escapeHtml(c.nombre_campana || 'Campaña Estratégica')}</h3>
            <div class="campaign-card-meta">
              <span class="campaign-card-label">Audiencia:</span>
              <span>${this.escapeHtml(c.audience_name)}</span>
            </div>
            <div class="campaign-card-meta">
              <span class="campaign-card-label">Objetivo:</span>
              <span>${this.escapeHtml(objetivo)}</span>
            </div>
            <div class="campaign-card-meta">
              <span class="campaign-card-label">Temporalidad:</span>
              <span>${this.escapeHtml(temporal)}</span>
            </div>
            <div class="campaign-card-meta">
              <span class="campaign-card-label">CTA:</span>
              <span>${this.escapeHtml(c.cta || '—')}</span>
            </div>
            <div class="campaign-card-meta campaign-card-status">
              <span class="campaign-card-label">Estado:</span>
              <span class="campaign-card-status-badge">Activa</span>
            </div>
            <div class="campaign-card-updated">Última actualización: ${this.formatDate(c.updated_at)}</div>
          </div>
        </article>
      `;
    }).join('');
    grid.querySelectorAll('.campaign-strategic-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.getAttribute('data-campaign-id');
        if (id) this.openDrawer(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  escapeHtml(s) {
    if (s == null || s === '') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  openDrawer(campaignId) {
    const overlay = document.getElementById('campaignDrawerOverlay');
    const drawer = document.getElementById('campaignDrawer');
    const body = document.getElementById('campaignDrawerBody');
    const titleEl = document.getElementById('campaignDrawerTitle');
    const linkDetalle = document.getElementById('campaignDrawerVerDetalle');
    const campaign = this.campaigns.find(c => c.id === campaignId);
    if (!campaign || !drawer || !body) return;
    const objetivo = (campaign.objetivos_estrategicos && campaign.objetivos_estrategicos[0]) || '—';
    const temporal = (campaign.contexto_temporal && campaign.contexto_temporal[0]) || '—';
    titleEl.textContent = campaign.nombre_campana || 'Campaña Estratégica';
    body.innerHTML = `
      <div class="campaign-drawer-meta">
        <p><strong>Audiencia:</strong> ${this.escapeHtml(campaign.audience_name)}</p>
        <p><strong>Objetivo:</strong> ${this.escapeHtml(objetivo)}</p>
        <p><strong>Temporalidad:</strong> ${this.escapeHtml(temporal)}</p>
        <p><strong>CTA:</strong> ${this.escapeHtml(campaign.cta || '—')}</p>
        <p><strong>Última actualización:</strong> ${this.formatDate(campaign.updated_at)}</p>
      </div>
    `;
    const base = this.organizationId ? `/org/${this.organizationId}/campaigns` : '/campaigns';
    linkDetalle.href = `${base}/${campaignId}`;
    linkDetalle.onclick = (e) => {
      e.preventDefault();
      this.closeDrawer();
      if (window.router) window.router.navigate(linkDetalle.getAttribute('href'), true);
    };
    overlay?.setAttribute('aria-hidden', 'false');
    drawer?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('campaign-drawer-open');
  }

  closeDrawer() {
    document.getElementById('campaignDrawerOverlay')?.setAttribute('aria-hidden', 'true');
    document.getElementById('campaignDrawer')?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('campaign-drawer-open');
  }

  async renderCampaignDetail() {
    const campaign = await this.loadCampaignById(this.campaignId);
    const container = document.getElementById('campaignDetailContainer');
    if (!campaign || !container) {
      if (container) {
        container.style.display = 'none';
        document.getElementById('campaignsListContainer').style.display = 'block';
      }
      return;
    }
    document.getElementById('campaignDetailTitle').textContent = campaign.nombre_campana || 'Campaña Estratégica';
    document.getElementById('campaignDetailAudience').textContent = `Audiencia: ${campaign.audience_name}`;
    document.getElementById('campaignDetailStatus').textContent = 'Activa';

    this.renderSectionChips('contextoTemporal', campaign.contexto_temporal || [], campaign.id);
    this.renderSectionBlocks('objetivosEstrategicos', campaign.objetivos_estrategicos || [], campaign.id, '🎯');
    this.renderSectionMiniCards('angulosVenta', campaign.angulos_venta || [], campaign.id);
    this.renderSectionBlocks('ofertaPrincipal', campaign.oferta_principal || [], campaign.id, '💥');
    this.renderSectionTono(campaign.tono_modificador || [], campaign.id);
  }

  renderSectionChips(sectionKey, items, campaignId) {
    const container = document.getElementById('contextoTemporalChips');
    if (!container) return;
    container.innerHTML = (items || []).map((item, i) =>
      `<span class="campaign-chip" data-index="${i}">${this.escapeHtml(item)}</span>`
    ).join('');
  }

  renderSectionBlocks(sectionId, items, campaignId, emoji) {
    const container = document.getElementById(sectionId === 'objetivosEstrategicos' ? 'objetivosEstrategicosBlocks' : 'ofertaPrincipalBlocks');
    if (!container) return;
    container.innerHTML = (items || []).map((item, i) =>
      `<div class="campaign-block" data-index="${i}"><span class="campaign-block-emoji">${emoji}</span> ${this.escapeHtml(item)}</div>`
    ).join('');
  }

  renderSectionMiniCards(sectionId, items, campaignId) {
    const container = document.getElementById('angulosVentaCards');
    if (!container) return;
    container.innerHTML = (items || []).map((item, i) =>
      `<div class="campaign-mini-card" data-index="${i}"><span>${this.escapeHtml(item)}</span></div>`
    ).join('');
  }

  renderSectionTono(selected, campaignId) {
    const container = document.getElementById('tonoModificadorSelector');
    if (!container) return;
    const sel = new Set(Array.isArray(selected) ? selected : []);
    container.innerHTML = this.TONO_OPCIONES.map(opt =>
      `<button type="button" class="campaign-tono-option ${sel.has(opt) ? 'active' : ''}" data-tono="${this.escapeHtml(opt)}">${this.escapeHtml(opt)}</button>`
    ).join('');
    container.querySelectorAll('.campaign-tono-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-tono');
        if (sel.has(t)) sel.delete(t); else sel.add(t);
        btn.classList.toggle('active', sel.has(t));
        this.updateCampaignTono(campaignId, [...sel]);
      });
    });
  }

  async updateCampaignTono(campaignId, tonoArray) {
    if (!this.supabase || !campaignId) return;
    await this.supabase.from('campaigns').update({ tono_modificador: tonoArray, updated_at: new Date().toISOString() }).eq('id', campaignId);
  }

  setupEventListeners() {
    const backBtn = document.getElementById('backToCampaignsBtn');
    if (backBtn) {
      backBtn.onclick = () => {
        const base = this.organizationId ? `/org/${this.organizationId}/campaigns` : '/campaigns';
        if (window.router) window.router.navigate(base, true);
      };
    }
    document.getElementById('campaignDrawerClose')?.addEventListener('click', () => this.closeDrawer());
    document.getElementById('campaignDrawerOverlay')?.addEventListener('click', () => this.closeDrawer());
    document.getElementById('createCampaignBtn')?.addEventListener('click', () => this.openCreateModal());
    document.getElementById('campaignDetailEditBtn')?.addEventListener('click', () => this.openEditModal());
    document.getElementById('campaignDetailDuplicateBtn')?.addEventListener('click', () => this.duplicateCampaign());
    document.getElementById('campaignDetailGenerateBtn')?.addEventListener('click', () => this.goToGenerateContent());
    document.getElementById('campaignDetailArchiveBtn')?.addEventListener('click', () => this.archiveCampaign());
    this.setupSectionAddListeners();
  }

  setupSectionAddListeners() {
    const sections = [
      { toggle: 'contextoTemporalToggleAdd', add: 'contextoTemporalAdd', input: 'contextoTemporalInput', btn: 'contextoTemporalAddBtn', field: 'contexto_temporal' },
      { toggle: 'objetivosToggleAdd', add: 'objetivosAdd', input: 'objetivosInput', btn: 'objetivosAddBtn', field: 'objetivos_estrategicos', blocks: 'objetivosEstrategicosBlocks', emoji: '🎯' },
      { toggle: 'angulosToggleAdd', add: 'angulosAdd', input: 'angulosInput', btn: 'angulosAddBtn', field: 'angulos_venta', miniCards: 'angulosVentaCards' },
      { toggle: 'ofertaToggleAdd', add: 'ofertaAdd', input: 'ofertaInput', btn: 'ofertaAddBtn', field: 'oferta_principal', blocks: 'ofertaPrincipalBlocks', emoji: '💥' },
    ];
    sections.forEach(({ toggle, add, input, btn, field, blocks, miniCards, emoji }) => {
      const toggleEl = document.getElementById(toggle);
      const addEl = document.getElementById(add);
      const inputEl = document.getElementById(input);
      const addBtnEl = document.getElementById(btn);
      if (!toggleEl || !addEl || !inputEl || !addBtnEl) return;
      toggleEl.addEventListener('click', () => {
        addEl.style.display = addEl.style.display === 'none' ? 'block' : 'none';
        inputEl.value = '';
        inputEl.focus();
      });
      const submit = () => {
        const val = inputEl.value.trim();
        if (!val || !this.campaignId) return;
        this.appendToCampaignArray(this.campaignId, field, val).then(() => {
          inputEl.value = '';
          addEl.style.display = 'none';
          if (field === 'contexto_temporal') {
            const chips = document.getElementById('contextoTemporalChips');
            if (chips) {
              const span = document.createElement('span');
              span.className = 'campaign-chip';
              span.setAttribute('data-index', (chips.querySelectorAll('.campaign-chip').length).toString());
              span.textContent = val;
              chips.appendChild(span);
            }
          } else if (blocks) {
            const cont = document.getElementById(blocks);
            if (cont) {
              const div = document.createElement('div');
              div.className = 'campaign-block';
              div.innerHTML = `<span class="campaign-block-emoji">${emoji || ''}</span> ${this.escapeHtml(val)}`;
              cont.appendChild(div);
            }
          } else if (miniCards) {
            const cont = document.getElementById(miniCards);
            if (cont) {
              const div = document.createElement('div');
              div.className = 'campaign-mini-card';
              div.innerHTML = `<span>${this.escapeHtml(val)}</span>`;
              cont.appendChild(div);
            }
          }
        });
      };
      addBtnEl.addEventListener('click', submit);
      inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  async appendToCampaignArray(campaignId, field, value) {
    if (!this.supabase || !campaignId) return;
    const campaign = await this.loadCampaignById(campaignId);
    if (!campaign) return;
    const arr = Array.isArray(campaign[field]) ? [...campaign[field]] : [];
    arr.push(value);
    await this.supabase.from('campaigns').update({
      [field]: arr,
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId);
  }

  async openCreateModal() {
    await this.loadAudiences();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay campaign-modal-overlay';
    modal.id = 'campaignCreateModal';
    const opts = this.audiences.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
    modal.innerHTML = `
      <div class="modal campaign-modal">
        <div class="modal-header">
          <h3>Nueva Campaña</h3>
          <button type="button" class="modal-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <label>Nombre campaña</label>
          <input type="text" id="campaignNewNombre" placeholder="Ej: Lanzamiento Titan Q1" />
          <label>Audiencia</label>
          <select id="campaignNewAudience">${opts ? `<option value="">Seleccionar...</option>${opts}` : '<option value="">Sin audiencias (crea una en Audiencias)</option>'}</select>
          <label>CTA</label>
          <input type="text" id="campaignNewCta" placeholder="Ej: Comprar ahora" />
          <label>URL del CTA</label>
          <input type="url" id="campaignNewCtaUrl" placeholder="https://..." />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost modal-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="campaignNewSubmit">Crear Campaña</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-close').onclick = () => modal.remove();
    modal.querySelector('.modal-cancel').onclick = () => modal.remove();
    modal.querySelector('#campaignNewSubmit').onclick = () => this.submitCreateCampaign(modal);
  }

  async submitCreateCampaign(modal) {
    const nombre = document.getElementById('campaignNewNombre')?.value?.trim() || 'Campaña Estratégica';
    const audienceId = document.getElementById('campaignNewAudience')?.value || null;
    const cta = document.getElementById('campaignNewCta')?.value?.trim() || 'Ver más';
    const ctaUrl = document.getElementById('campaignNewCtaUrl')?.value?.trim() || '#';
    if (!this.supabase || !this.brandContainerId) return;
    const { data, error } = await this.supabase.from('campaigns').insert({
      brand_container_id: this.brandContainerId,
      nombre_campana: nombre,
      audience_id: audienceId || null,
      cta,
      cta_url: ctaUrl,
    }).select('id').single();
    if (error) {
      console.error('Create campaign:', error);
      return;
    }
    modal.remove();
    const base = this.organizationId ? `/org/${this.organizationId}/campaigns` : '/campaigns';
    if (window.router) window.router.navigate(`${base}/${data.id}`, true);
  }

  openEditModal() {
    if (!this.campaignId) return;
    this.loadCampaignById(this.campaignId).then(campaign => {
      if (!campaign) return;
      this.loadAudiences().then(() => {
        const opts = this.audiences.map(a => `<option value="${a.id}" ${a.id === campaign.audience_id ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`).join('');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay campaign-modal-overlay';
        modal.innerHTML = `
          <div class="modal campaign-modal">
            <div class="modal-header"><h3>Editar Campaña</h3><button type="button" class="modal-close" aria-label="Cerrar"><i class="fas fa-times"></i></button></div>
            <div class="modal-body">
              <label>Nombre campaña</label>
              <input type="text" id="campaignEditNombre" value="${this.escapeHtml(campaign.nombre_campana || '')}" />
              <label>Audiencia</label>
              <select id="campaignEditAudience">${opts || '<option value="">Sin audiencias</option>'}</select>
              <label>CTA</label>
              <input type="text" id="campaignEditCta" value="${this.escapeHtml(campaign.cta || '')}" />
              <label>URL del CTA</label>
              <input type="url" id="campaignEditCtaUrl" value="${this.escapeHtml(campaign.cta_url || '')}" />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-ghost modal-cancel">Cancelar</button>
              <button type="button" class="btn btn-primary" id="campaignEditSubmit">Guardar</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.modal-close').onclick = () => modal.remove();
        modal.querySelector('.modal-cancel').onclick = () => modal.remove();
        modal.querySelector('#campaignEditSubmit').onclick = async () => {
          const nombre = document.getElementById('campaignEditNombre')?.value?.trim() || 'Campaña Estratégica';
          const audienceId = document.getElementById('campaignEditAudience')?.value || null;
          const cta = document.getElementById('campaignEditCta')?.value?.trim() || 'Ver más';
          const ctaUrl = document.getElementById('campaignEditCtaUrl')?.value?.trim() || '#';
          await this.supabase.from('campaigns').update({
            nombre_campana: nombre,
            audience_id: audienceId || null,
            cta,
            cta_url: ctaUrl,
            updated_at: new Date().toISOString(),
          }).eq('id', this.campaignId);
          modal.remove();
          await this.renderCampaignDetail();
        };
      });
    });
  }

  async duplicateCampaign() {
    if (!this.campaignId || !this.supabase) return;
    const campaign = await this.loadCampaignById(this.campaignId);
    if (!campaign) return;
    const { data, error } = await this.supabase.from('campaigns').insert({
      brand_container_id: campaign.brand_container_id,
      nombre_campana: (campaign.nombre_campana || 'Campaña') + ' (copia)',
      cta: campaign.cta,
      cta_url: campaign.cta_url,
      audience_id: campaign.audience_id,
      descripcion_interna: campaign.descripcion_interna,
      contexto_temporal: campaign.contexto_temporal || [],
      objetivos_estrategicos: campaign.objetivos_estrategicos || [],
      angulos_venta: campaign.angulos_venta || [],
      oferta_principal: campaign.oferta_principal || [],
      tono_modificador: campaign.tono_modificador || [],
    }).select('id').single();
    if (error) return;
    const base = this.organizationId ? `/org/${this.organizationId}/campaigns` : '/campaigns';
    if (window.router) window.router.navigate(`${base}/${data.id}`, true);
  }

  goToGenerateContent() {
    const base = this.organizationId ? `/org/${this.organizationId}/studio` : '/studio';
    if (window.appState) window.appState.set('selectedCampaignId', this.campaignId, true);
    if (window.router) window.router.navigate(base, true);
  }

  archiveCampaign() {
    if (typeof alert === 'function') alert('Archivar campaña estará disponible próximamente.');
  }
}

window.CampaignsView = CampaignsView;
