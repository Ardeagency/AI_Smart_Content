/**
 * DevLeadOrgsView - Organizaciones (solo Lead)
 *
 * CRUD lite de organizaciones:
 *  - Listar: name, plan activo, creditos, owner, fecha creacion
 *  - Crear: modal con name + owner_user_id (default = lead actual)
 *  - Editar: modal con name, brand_name_oficial, brand_slogan, logo_url
 *  - Borrar: soft delete via UPDATE deleted_at = now()
 *
 * Filtra deleted_at IS NULL en la lista. El delete actual es soft.
 */
class DevLeadOrgsView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.orgs = [];
    this._editingId = null;
    this._modalClose = null;
    this._loading = false;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-orgs">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-building"></i> Organizaciones</h1>
            <p class="dev-header-subtitle">Lista y administra todas las organizaciones del sistema.</p>
          </div>
          <div class="dev-lead-toolbar" id="headerToolbar">
            <input type="search" id="orgsSearch" class="form-control" placeholder="Buscar por nombre..." autocomplete="off">
            <button type="button" class="btn btn-secondary" id="orgsRefresh" title="Refrescar"><i class="fas fa-sync-alt"></i></button>
            <button type="button" class="btn btn-primary" id="orgsCreate"><i class="fas fa-plus"></i> Nueva organizacion</button>
          </div>
        </header>

        <section class="dev-lead-content">
          <div class="dev-table-container">
            <table class="dev-table" id="orgsTable">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Plan</th>
                  <th>Creditos</th>
                  <th>Owner</th>
                  <th>Creada</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="orgsBody">
                <tr><td colspan="6" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  // Cuerpo del modal de org (FEAT-028: migrado a window.Modal). Mantiene los
  // mismos IDs de campos para no tocar setFormValues/saveOrg.
  _modalBodyHtml(showOwner) {
    return `
      <div class="form-group">
        <label for="orgFieldName">Nombre <span class="form-required">*</span></label>
        <input type="text" id="orgFieldName" class="form-control" maxlength="120" required>
      </div>
      <div class="form-group">
        <label for="orgFieldBrandName">Brand name oficial</label>
        <input type="text" id="orgFieldBrandName" class="form-control" maxlength="120">
      </div>
      <div class="form-group">
        <label for="orgFieldSlogan">Slogan</label>
        <input type="text" id="orgFieldSlogan" class="form-control" maxlength="200">
      </div>
      <div class="form-group">
        <label for="orgFieldLogoUrl">Logo URL</label>
        <input type="url" id="orgFieldLogoUrl" class="form-control" placeholder="https://...">
      </div>
      <div class="form-group" id="orgFieldOwnerGroup"${showOwner ? '' : ' style="display:none"'}>
        <label for="orgFieldOwner">Owner user_id</label>
        <input type="text" id="orgFieldOwner" class="form-control" placeholder="UUID del usuario propietario">
        <p class="form-hint">Si lo dejas vacio, se asigna a tu user_id actual.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="orgsModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="orgsModalSave"><i class="fas fa-check"></i> Guardar</button>
      </div>
    `;
  }

  _openModal(title, showOwner) {
    const { modal, close } = window.Modal.show({
      title,
      body: this._modalBodyHtml(showOwner),
      className: 'dev-lead-modal-content',
      onClose: () => { this._modalClose = null; this._editingId = null; }
    });
    this._modalClose = close;
    modal.querySelector('#orgsModalCancel')?.addEventListener('click', () => this.closeModal());
    modal.querySelector('#orgsModalSave')?.addEventListener('click', () => this.saveOrg());
  }

  async init() {
    document.getElementById('orgsRefresh')?.addEventListener('click', () => this.loadOrgs());
    document.getElementById('orgsCreate')?.addEventListener('click', () => this.openCreateModal());

    document.getElementById('orgsSearch')?.addEventListener('input', (e) => {
      this.renderRows((e.target?.value || '').trim().toLowerCase());
    });

    document.getElementById('orgsBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'edit') this.openEditModal(id);
      else if (action === 'delete') this.deleteOrg(id);
    });

    try {
      this.supabase = await this.getSupabaseClient();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
      await this.loadOrgs();
    } catch (err) {
      console.error('Orgs init:', err);
      this.renderError(err?.message || 'Error al cargar');
    }
  }

  async loadOrgs() {
    if (this._loading) return;
    this._loading = true;
    const tbody = document.getElementById('orgsBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      if (!this.supabase) throw new Error('Sin conexion');

      const { data: orgs, error } = await this.supabase
        .from('organizations')
        .select(`
          id, name, brand_name_oficial, brand_slogan, logo_url,
          level_of_autonomy, owner_user_id, created_at, deleted_at,
          organization_credits (credits_available, credits_total),
          subscriptions (status, current_period_end, plans (name))
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      this.orgs = Array.isArray(orgs) ? orgs : [];
      this.renderRows('');
    } catch (err) {
      console.error('loadOrgs:', err);
      this.renderError(err?.message || 'Error al cargar');
    } finally {
      this._loading = false;
    }
  }

  renderRows(filter) {
    const tbody = document.getElementById('orgsBody');
    if (!tbody) return;
    const filtered = filter
      ? this.orgs.filter(o => (o.name || '').toLowerCase().includes(filter)
        || (o.brand_name_oficial || '').toLowerCase().includes(filter))
      : this.orgs;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="dev-lead-empty-cell">${filter ? 'Sin coincidencias.' : 'Aun no hay organizaciones.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => this.renderRow(o)).join('');
  }

  renderRow(org) {
    const sub = this.activeSubscription(org.subscriptions);
    const planLabel = sub ? this.escapeHtml((sub.plans && sub.plans.name) || '—') : '<span class="text-muted">sin plan</span>';
    const credits = org.organization_credits;
    const creditsLabel = credits
      ? `${credits.credits_available ?? 0}/${credits.credits_total ?? 0}`
      : '—';
    const created = org.created_at
      ? new Date(org.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const ownerShort = org.owner_user_id ? org.owner_user_id.slice(0, 8) + '...' : '—';
    const logo = org.logo_url
      ? `<img src="${this.escapeHtml(org.logo_url)}" alt="" class="dev-org-logo" onerror="this.style.display='none'">`
      : `<span class="dev-org-logo dev-org-logo--placeholder"><i class="fas fa-building"></i></span>`;

    return `
      <tr class="dev-lead-file-row" data-id="${this.escapeHtml(org.id)}">
        <td>
          <div class="dev-org-cell">
            ${logo}
            <div class="dev-org-name">
              <strong>${this.escapeHtml(org.name || '—')}</strong>
              ${org.brand_name_oficial ? `<span class="text-muted">${this.escapeHtml(org.brand_name_oficial)}</span>` : ''}
            </div>
          </div>
        </td>
        <td>${planLabel}</td>
        <td><code>${creditsLabel}</code></td>
        <td><code title="${this.escapeHtml(org.owner_user_id || '')}">${this.escapeHtml(ownerShort)}</code></td>
        <td>${created}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn-icon" data-action="edit" data-id="${this.escapeHtml(org.id)}" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn-icon btn-icon--danger" data-action="delete" data-id="${this.escapeHtml(org.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }

  activeSubscription(subs) {
    if (!Array.isArray(subs) || subs.length === 0) return null;
    const active = subs.find(s => s && (s.status === 'active' || s.status === 'trialing'));
    return active || subs[0];
  }

  openCreateModal() {
    this._editingId = null;
    this._openModal('Nueva organizacion', true);
    this.setFormValues({});
  }

  openEditModal(id) {
    const org = this.orgs.find(o => o.id === id);
    if (!org) return;
    this._editingId = id;
    this._openModal(`Editar: ${org.name || ''}`, false);
    this.setFormValues({
      name: org.name || '',
      brand_name_oficial: org.brand_name_oficial || '',
      brand_slogan: org.brand_slogan || '',
      logo_url: org.logo_url || ''
    });
  }

  setFormValues(v) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('orgFieldName', v.name);
    set('orgFieldBrandName', v.brand_name_oficial);
    set('orgFieldSlogan', v.brand_slogan);
    set('orgFieldLogoUrl', v.logo_url);
    set('orgFieldOwner', v.owner_user_id);
  }

  closeModal() {
    if (this._modalClose) this._modalClose();
    this._editingId = null;
  }

  async saveOrg() {
    const name = (document.getElementById('orgFieldName')?.value || '').trim();
    if (!name) { this.showNotification('El nombre es obligatorio.', 'warning'); return; }

    const payload = {
      name,
      brand_name_oficial: (document.getElementById('orgFieldBrandName')?.value || '').trim() || null,
      brand_slogan: (document.getElementById('orgFieldSlogan')?.value || '').trim() || null,
      logo_url: (document.getElementById('orgFieldLogoUrl')?.value || '').trim() || null
    };

    const saveBtn = document.getElementById('orgsModalSave');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      if (this._editingId) {
        const { error } = await this.supabase
          .from('organizations')
          .update(payload)
          .eq('id', this._editingId);
        if (error) throw error;
        this.showNotification('Organizacion actualizada.', 'success');
      } else {
        const ownerInput = (document.getElementById('orgFieldOwner')?.value || '').trim();
        payload.owner_user_id = ownerInput || this.userId || null;
        if (!payload.owner_user_id) { this.showNotification('Falta owner_user_id.', 'warning'); return; }
        const { error } = await this.supabase
          .from('organizations')
          .insert(payload);
        if (error) throw error;
        this.showNotification('Organizacion creada.', 'success');
      }
      this.closeModal();
      await this.loadOrgs();
    } catch (err) {
      console.error('saveOrg:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al guardar'), 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-check"></i> Guardar'; }
    }
  }

  async deleteOrg(id) {
    const org = this.orgs.find(o => o.id === id);
    if (!org) return;
    if (!confirm(`Eliminar (soft delete) la organizacion "${org.name}"?`)) return;
    try {
      if (!this.supabase) this.supabase = await this.getSupabaseClient();
      const { error } = await this.supabase
        .from('organizations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      this.showNotification('Organizacion eliminada (soft).', 'success');
      await this.loadOrgs();
    } catch (err) {
      console.error('deleteOrg:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al eliminar'), 'error');
    }
  }

  renderError(message) {
    const tbody = document.getElementById('orgsBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="dev-lead-empty-cell"><i class="fas fa-triangle-exclamation"></i> ${this.escapeHtml(message)}</td></tr>`;
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.DevLeadOrgsView = DevLeadOrgsView;
