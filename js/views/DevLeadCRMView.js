/**
 * DevLeadCRMView - CRM de leads de contacto (solo Lead)
 * Lista y gestiona leads de contact_leads + notas en contact_lead_notes.
 */
class DevLeadCRMView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.leads = [];
    this.filteredLeads = [];
    this.currentLead = null;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    this.supabase = await this.getSupabaseClient();
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-crm">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-address-book"></i> CRM Leads</h1>
            <p class="dev-header-subtitle">Leads entrantes desde el formulario público de contacto</p>
          </div>
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-secondary" id="refreshCrmLeadsBtn">
              <i class="fas fa-sync-alt"></i> Actualizar
            </button>
          </div>
        </header>

        <section class="dev-lead-content">
          <div class="dev-lead-toolbar" style="margin-bottom: 12px; gap: 10px; flex-wrap: wrap;">
            <input type="search" id="crmLeadSearch" class="input" placeholder="Buscar por nombre, email o empresa..." style="min-width: 280px;">
            <select id="crmLeadStatusFilter" class="input" style="min-width: 220px;">
              <option value="">Todos los estados</option>
              <option value="nuevo">Nuevo</option>
              <option value="revisando">Revisando</option>
              <option value="contactado">Contactado</option>
              <option value="calificado">Calificado</option>
              <option value="demo">Demo</option>
              <option value="onboarding">Onboarding</option>
              <option value="cliente">Cliente</option>
              <option value="descartado">Descartado</option>
            </select>
          </div>

          <div class="dev-lead-table-wrap">
            <table class="dev-lead-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Empresa</th>
                  <th>Estado</th>
                  <th>Origen</th>
                  <th>Asignado</th>
                  <th>Ingreso</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="crmLeadsBody"></tbody>
            </table>
            <div class="dev-lead-empty" id="crmLeadsEmpty" style="display:none;">
              <i class="fas fa-inbox"></i>
              <p>No hay leads registrados.</p>
            </div>
          </div>
        </section>
      </div>

      <div class="modal dev-lead-modal" id="leadDetailModal" style="display:none;">
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-width: 840px; width: 95%;">
          <div class="modal-header">
            <h3 id="leadModalTitle">Lead</h3>
            <button type="button" class="modal-close" id="leadModalClose">&times;</button>
          </div>
          <div class="modal-body" id="leadModalBody"></div>
        </div>
      </div>
    `;
  }

  async init() {
    await this.getSupabase();
    if (!this.supabase) {
      this.showError('Supabase no disponible para CRM de leads.');
      return;
    }

    await this.loadLeads();

    const refreshBtn = this.container.querySelector('#refreshCrmLeadsBtn');
    const searchInput = this.container.querySelector('#crmLeadSearch');
    const statusFilter = this.container.querySelector('#crmLeadStatusFilter');

    this.addEventListener(refreshBtn, 'click', () => this.loadLeads());
    this.addEventListener(searchInput, 'input', () => this.applyFilters());
    this.addEventListener(statusFilter, 'change', () => this.applyFilters());

    this.setupModalEvents();
  }

  async loadLeads() {
    const { data, error } = await this.supabase
      .from('contact_leads')
      .select(`
        id,
        full_name,
        email,
        company_name,
        job_title,
        country,
        phone,
        website,
        num_brands,
        main_challenge,
        how_found,
        status,
        fit_score,
        source,
        utm_source,
        utm_campaign,
        created_at,
        assigned_to,
        metadata,
        profiles:assigned_to (id, full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('CRM leads load error:', error);
      this.renderRows([]);
      this.showNotification('No se pudieron cargar los leads', 'error');
      return;
    }

    this.leads = Array.isArray(data) ? data : [];
    this.applyFilters();
  }

  applyFilters() {
    const searchValue = (this.container.querySelector('#crmLeadSearch')?.value || '').trim().toLowerCase();
    const statusValue = this.container.querySelector('#crmLeadStatusFilter')?.value || '';

    this.filteredLeads = this.leads.filter((lead) => {
      const haystack = [
        lead.full_name,
        lead.email,
        lead.company_name
      ].join(' ').toLowerCase();

      const statusMatch = !statusValue || lead.status === statusValue;
      const textMatch = !searchValue || haystack.includes(searchValue);
      return statusMatch && textMatch;
    });

    this.renderRows(this.filteredLeads);
  }

  renderRows(rows) {
    const tbody = this.container.querySelector('#crmLeadsBody');
    const empty = this.container.querySelector('#crmLeadsEmpty');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = rows.map((lead) => {
      const owner = lead.profiles?.full_name || lead.profiles?.email || 'Sin asignar';
      const created = lead.created_at ? new Date(lead.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '-';
      return `
        <tr data-id="${lead.id}">
          <td>
            <strong>${this.escapeHtml(lead.full_name || '-')}</strong><br>
            <span class="dev-lead-flow-desc">${this.escapeHtml(lead.email || '-')}</span>
          </td>
          <td>
            <strong>${this.escapeHtml(lead.company_name || '-')}</strong><br>
            <span class="dev-lead-flow-desc">${this.escapeHtml(lead.job_title || '')}</span>
          </td>
          <td><span class="dev-lead-status dev-lead-status-${this.escapeHtml(lead.status || 'nuevo')}">${this.getStatusLabel(lead.status)}</span></td>
          <td>${this.escapeHtml(this.getSourceLabel(lead))}</td>
          <td>${this.escapeHtml(owner)}</td>
          <td>${this.escapeHtml(created)}</td>
          <td class="dev-lead-actions">
            <button type="button" class="btn-icon crm-open-lead" data-id="${lead.id}" title="Abrir lead">
              <i class="fas fa-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.container.querySelectorAll('.crm-open-lead').forEach((btn) => {
      this.addEventListener(btn, 'click', () => this.openLeadModal(btn.getAttribute('data-id')));
    });
  }

  getStatusLabel(status) {
    const map = {
      nuevo: 'Nuevo',
      revisando: 'Revisando',
      contactado: 'Contactado',
      calificado: 'Calificado',
      demo: 'Demo',
      onboarding: 'Onboarding',
      cliente: 'Cliente',
      descartado: 'Descartado'
    };
    return map[status] || status || 'Nuevo';
  }

  getSourceLabel(lead) {
    const howFoundMap = {
      referido: 'Referido',
      linkedin: 'LinkedIn',
      busqueda: 'Búsqueda',
      evento: 'Evento',
      otro: 'Otro'
    };

    if (lead.utm_source) return `UTM: ${lead.utm_source}`;
    if (lead.how_found) return howFoundMap[lead.how_found] || lead.how_found;
    return lead.source || 'contact_form';
  }

  setupModalEvents() {
    const modal = this.container.querySelector('#leadDetailModal');
    const closeBtn = this.container.querySelector('#leadModalClose');
    const overlay = modal?.querySelector('.modal-overlay');
    if (closeBtn) this.addEventListener(closeBtn, 'click', () => this.closeLeadModal());
    if (overlay) this.addEventListener(overlay, 'click', () => this.closeLeadModal());
  }

  closeLeadModal() {
    const modal = this.container.querySelector('#leadDetailModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('is-open');
    this.currentLead = null;
  }

  async openLeadModal(leadId) {
    const lead = this.leads.find((item) => item.id === leadId);
    if (!lead) return;

    this.currentLead = lead;

    const { data: notes = [] } = await this.supabase
      .from('contact_lead_notes')
      .select('id, content, created_at, author_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    const modal = this.container.querySelector('#leadDetailModal');
    const title = this.container.querySelector('#leadModalTitle');
    const body = this.container.querySelector('#leadModalBody');
    if (!modal || !title || !body) return;

    const noteRows = (notes || []).map((note) => `
      <div class="dev-lead-note-item" style="padding:10px 12px; border:1px solid rgba(255,255,255,.1); border-radius:10px; margin-bottom:8px;">
        <div style="font-size:12px; opacity:.75; margin-bottom:6px;">${this.escapeHtml(new Date(note.created_at).toLocaleString('es'))}</div>
        <div>${this.escapeHtml(note.content || '')}</div>
      </div>
    `).join('');

    title.textContent = `${lead.full_name || 'Lead'} · ${lead.company_name || ''}`;
    body.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-bottom:14px;">
        <div><strong>Email:</strong> ${this.escapeHtml(lead.email || '-')}</div>
        <div><strong>Teléfono:</strong> ${this.escapeHtml(lead.phone || '-')}</div>
        <div><strong>País:</strong> ${this.escapeHtml(lead.country || '-')}</div>
        <div><strong>Sitio web:</strong> ${this.escapeHtml(lead.website || '-')}</div>
        <div><strong>Estado:</strong> ${this.escapeHtml(this.getStatusLabel(lead.status))}</div>
        <div><strong>Fit score:</strong> ${lead.fit_score || '-'}</div>
      </div>
      <div style="margin-bottom:14px;">
        <strong>Reto principal:</strong>
        <p style="margin-top:6px;">${this.escapeHtml(lead.main_challenge || '-')}</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap;">
        <label for="leadStatusSelect"><strong>Cambiar estado:</strong></label>
        <select id="leadStatusSelect" class="input" style="min-width:220px;">
          <option value="nuevo"${lead.status === 'nuevo' ? ' selected' : ''}>Nuevo</option>
          <option value="revisando"${lead.status === 'revisando' ? ' selected' : ''}>Revisando</option>
          <option value="contactado"${lead.status === 'contactado' ? ' selected' : ''}>Contactado</option>
          <option value="calificado"${lead.status === 'calificado' ? ' selected' : ''}>Calificado</option>
          <option value="demo"${lead.status === 'demo' ? ' selected' : ''}>Demo</option>
          <option value="onboarding"${lead.status === 'onboarding' ? ' selected' : ''}>Onboarding</option>
          <option value="cliente"${lead.status === 'cliente' ? ' selected' : ''}>Cliente</option>
          <option value="descartado"${lead.status === 'descartado' ? ' selected' : ''}>Descartado</option>
        </select>
        <button type="button" class="btn btn-primary" id="saveLeadStatusBtn">Guardar</button>
      </div>

      <div style="margin-top:14px; border-top:1px solid rgba(255,255,255,.08); padding-top:14px;">
        <h4 style="margin-bottom:10px;">Notas internas</h4>
        <textarea id="leadNoteInput" class="input" rows="3" placeholder="Agregar nota..."></textarea>
        <div style="margin-top:8px;">
          <button type="button" class="btn btn-secondary" id="addLeadNoteBtn">Agregar nota</button>
        </div>
        <div style="margin-top:12px;">
          ${noteRows || '<p class="text-muted">Sin notas.</p>'}
        </div>
      </div>
    `;

    const saveStatusBtn = body.querySelector('#saveLeadStatusBtn');
    const addNoteBtn = body.querySelector('#addLeadNoteBtn');

    if (saveStatusBtn) this.addEventListener(saveStatusBtn, 'click', () => this.saveLeadStatus(lead.id));
    if (addNoteBtn) this.addEventListener(addNoteBtn, 'click', () => this.addLeadNote(lead.id));

    modal.style.display = 'flex';
    modal.classList.add('is-open');
  }

  async saveLeadStatus(leadId) {
    const select = this.container.querySelector('#leadStatusSelect');
    if (!select) return;
    const nextStatus = select.value;
    const { error } = await this.supabase
      .from('contact_leads')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (error) {
      this.showNotification(`Error guardando estado: ${error.message}`, 'error');
      return;
    }
    this.showNotification('Estado actualizado', 'success');
    await this.loadLeads();
    await this.openLeadModal(leadId);
  }

  async addLeadNote(leadId) {
    const input = this.container.querySelector('#leadNoteInput');
    const content = (input?.value || '').trim();
    if (!content) {
      this.showNotification('La nota está vacía', 'warning');
      return;
    }

    const userId = window.authService?.getCurrentUser?.()?.id;
    if (!userId) {
      this.showNotification('No se pudo identificar el usuario actual', 'error');
      return;
    }

    const { error } = await this.supabase
      .from('contact_lead_notes')
      .insert({ lead_id: leadId, author_id: userId, content });

    if (error) {
      this.showNotification(`Error guardando nota: ${error.message}`, 'error');
      return;
    }

    this.showNotification('Nota agregada', 'success');
    await this.openLeadModal(leadId);
  }
}

window.DevLeadCRMView = DevLeadCRMView;
