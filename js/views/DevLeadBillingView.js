/**
 * DevLeadBillingView — Console de billing (solo Lead).
 *
 * Tabs:
 *  - Plans: CRUD sobre tabla plans (BD). Auto-sync Stripe/Wompi pendiente Fase 3.
 *  - Org Credits: buscar org y otorgar/descontar creditos con razon. RPC grant_credits_admin.
 *  - Subscriptions: placeholder Fase 2.
 *  - Usage: placeholder Fase 2.
 *
 * 1 credito = $1 USD (modelo decimal interno). El frontend muestra FLOOR via v_org_credits_display
 * en otras vistas, pero aqui usamos el numerico crudo de organization_credits para precision admin.
 */
class DevLeadBillingView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.activeTab = 'plans';
    this.plans = [];
    this.orgsBalance = [];
    this._editingPlanId = null;
    this._grantOrgId = null;
    this._grantOrgName = null;
    this._modalClose = null;
  }

  async onEnter() {
    await super.onEnter({ requireLead: true });
  }

  async getSupabase() {
    if (!this.supabase) this.supabase = await this.getSupabaseClient();
    return this.supabase;
  }

  renderHTML() {
    return `
      <div class="dev-lead-container dev-lead-billing">
        <header class="dev-lead-header">
          <div class="dev-header-content">
            <h1 class="dev-header-title"><i class="fas fa-credit-card"></i> Billing</h1>
            <p class="dev-header-subtitle">Edita planes, ajusta creditos por organizacion y administra suscripciones.</p>
          </div>
        </header>

        <div class="dev-lead-tabs">
          <button type="button" class="dev-lead-tab active" data-tab="plans"><i class="fas fa-tags"></i> Plans</button>
          <button type="button" class="dev-lead-tab" data-tab="credits"><i class="fas fa-coins"></i> Org Credits</button>
          <button type="button" class="dev-lead-tab" data-tab="subscriptions"><i class="fas fa-file-invoice-dollar"></i> Subscriptions</button>
          <button type="button" class="dev-lead-tab" data-tab="usage"><i class="fas fa-chart-line"></i> Usage</button>
        </div>

        <section class="dev-lead-content" id="tabPanePlans">
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-secondary" id="plansRefresh" title="Refrescar"><i class="fas fa-sync-alt"></i></button>
            <span class="dev-lead-hint"><i class="fas fa-info-circle"></i> Editar el precio aqui solo toca BD. Crear/archivar el Stripe Price + actualizar <code>stripe_price_id_*</code> es manual (auto-sync en Fase 3).</span>
          </div>
          <div class="dev-table-container">
            <table class="dev-table" id="plansTable">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Plan</th>
                  <th>$/mes</th>
                  <th>Creditos/mes</th>
                  <th>Storage</th>
                  <th>Activo</th>
                  <th>Popular</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="plansBody"><tr><td colspan="8" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr></tbody>
            </table>
          </div>
        </section>

        <section class="dev-lead-content" id="tabPaneCredits" style="display:none">
          <div class="dev-lead-toolbar">
            <input type="search" id="creditsSearch" class="form-control" placeholder="Buscar org por nombre..." autocomplete="off">
            <button type="button" class="btn btn-secondary" id="creditsRefresh" title="Refrescar"><i class="fas fa-sync-alt"></i></button>
          </div>
          <div class="dev-table-container">
            <table class="dev-table" id="creditsTable">
              <thead>
                <tr>
                  <th>Organizacion</th>
                  <th>Disponibles</th>
                  <th>Total otorgado</th>
                  <th>Actualizado</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="creditsBody"><tr><td colspan="5" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr></tbody>
            </table>
          </div>
        </section>

        <section class="dev-lead-content" id="tabPaneSubscriptions" style="display:none">
          <div class="dev-lead-coming-soon">
            <i class="fas fa-tools"></i>
            <h3>Subscriptions tab — Fase 2</h3>
            <p>Lista de subs activas + force migrate a otro plan (ej: business legacy → agency). Pendiente.</p>
          </div>
        </section>

        <section class="dev-lead-content" id="tabPaneUsage" style="display:none">
          <div class="dev-lead-coming-soon">
            <i class="fas fa-tools"></i>
            <h3>Usage history tab — Fase 2</h3>
            <p>Historial de credit_usage por org (consumos, grants, refunds). Pendiente.</p>
          </div>
        </section>
      </div>
    `;
  }

  async init() {
    document.querySelectorAll('.dev-lead-tab').forEach(t => {
      t.addEventListener('click', () => this.switchTab(t.getAttribute('data-tab')));
    });
    document.getElementById('plansRefresh')?.addEventListener('click', () => this.loadPlans());
    document.getElementById('creditsRefresh')?.addEventListener('click', () => this.loadOrgCredits());
    document.getElementById('creditsSearch')?.addEventListener('input', (e) => {
      this.renderCreditsRows((e.target?.value || '').trim().toLowerCase());
    });
    document.getElementById('plansBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'edit-plan') this.openEditPlanModal(id);
      else if (action === 'toggle-active') this.togglePlanActive(id);
    });
    document.getElementById('creditsBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name') || '';
      if (btn.getAttribute('data-action') === 'grant') this.openGrantModal(id, name);
    });
    await this.loadPlans();
  }

  switchTab(tab) {
    if (!tab || tab === this.activeTab) return;
    this.activeTab = tab;
    document.querySelectorAll('.dev-lead-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });
    ['plans', 'credits', 'subscriptions', 'usage'].forEach(t => {
      const pane = document.getElementById('tabPane' + t.charAt(0).toUpperCase() + t.slice(1));
      if (pane) pane.style.display = (t === tab) ? '' : 'none';
    });
    if (tab === 'credits' && this.orgsBalance.length === 0) this.loadOrgCredits();
  }

  // ─── Plans tab ─────────────────────────────────────────────────────

  async loadPlans() {
    const tbody = document.getElementById('plansBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, description, price_usd_month, price_usd_year, credits_monthly, max_handles, storage_mb, features, is_popular, is_active, display_order, stripe_price_id_month, stripe_price_id_year, wompi_amount_cents_month')
        .order('display_order', { ascending: true })
        .order('name');
      if (error) throw error;
      this.plans = data || [];
      this.renderPlansRows();
    } catch (err) {
      console.error('loadPlans:', err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="dev-lead-empty-cell">Error: ${this._escape(err?.message || 'fallo al cargar')}</td></tr>`;
    }
  }

  renderPlansRows() {
    const tbody = document.getElementById('plansBody');
    if (!tbody) return;
    if (this.plans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="dev-lead-empty-cell">Sin planes</td></tr>';
      return;
    }
    tbody.innerHTML = this.plans.map(p => `
      <tr>
        <td>${p.display_order}</td>
        <td>
          <strong>${this._escape(p.name)}</strong>
          <div class="dev-lead-row-sub">${this._escape(p.id)}</div>
        </td>
        <td>$${Number(p.price_usd_month).toFixed(2)}</td>
        <td>${p.credits_monthly.toLocaleString('en-US')}</td>
        <td>${this._formatStorage(p.storage_mb)}</td>
        <td>${this._badge(p.is_active, 'Activo', 'Inactivo')}</td>
        <td>${p.is_popular ? '<i class="fas fa-star" style="color:var(--accent-warm,#e09145)"></i>' : ''}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn btn-xs btn-secondary" data-action="edit-plan" data-id="${this._escape(p.id)}" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn btn-xs" data-action="toggle-active" data-id="${this._escape(p.id)}" title="${p.is_active ? 'Desactivar' : 'Activar'}">
            <i class="fas fa-${p.is_active ? 'toggle-on' : 'toggle-off'}"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  _planModalBody() {
    return `
      <div class="form-group">
        <label for="planFieldId">ID (slug)</label>
        <input type="text" id="planFieldId" class="form-control" readonly placeholder="creator | team | agency...">
        <p class="form-hint">El ID es la primary key y no se puede editar (referenciado por subscriptions).</p>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="planFieldName">Nombre <span class="form-required">*</span></label>
          <input type="text" id="planFieldName" class="form-control" maxlength="80" required>
        </div>
        <div class="form-group">
          <label for="planFieldOrder">Display order</label>
          <input type="number" id="planFieldOrder" class="form-control" min="0" max="100">
        </div>
      </div>
      <div class="form-group">
        <label for="planFieldDesc">Descripcion</label>
        <textarea id="planFieldDesc" class="form-control" rows="2" maxlength="300"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="planFieldPriceMonth">Precio USD/mes <span class="form-required">*</span></label>
          <input type="number" id="planFieldPriceMonth" class="form-control" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label for="planFieldPriceYear">Precio USD/año</label>
          <input type="number" id="planFieldPriceYear" class="form-control" step="0.01" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="planFieldCredits">Creditos/mes <span class="form-required">*</span></label>
          <input type="number" id="planFieldCredits" class="form-control" min="0" required>
        </div>
        <div class="form-group">
          <label for="planFieldStorage">Storage MB <span class="form-required">*</span></label>
          <input type="number" id="planFieldStorage" class="form-control" min="0" required>
        </div>
        <div class="form-group">
          <label for="planFieldHandles">Max handles</label>
          <input type="number" id="planFieldHandles" class="form-control" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group form-check">
          <label><input type="checkbox" id="planFieldActive"> Activo (visible en catalogo)</label>
        </div>
        <div class="form-group form-check">
          <label><input type="checkbox" id="planFieldPopular"> Popular (badge destacado)</label>
        </div>
      </div>
      <div class="form-group">
        <label for="planFieldStripeMonth">Stripe price ID mes</label>
        <input type="text" id="planFieldStripeMonth" class="form-control" placeholder="price_xxx">
      </div>
      <div class="form-group">
        <label for="planFieldStripeYear">Stripe price ID año</label>
        <input type="text" id="planFieldStripeYear" class="form-control" placeholder="price_xxx">
      </div>
      <div class="form-group">
        <label for="planFieldWompiCents">Wompi monto centavos COP (mes)</label>
        <input type="number" id="planFieldWompiCents" class="form-control" min="0" placeholder="ej: 35000000 = $350.000 COP">
      </div>
      <div class="form-group">
        <label for="planFieldFeatures">Features (JSON)</label>
        <textarea id="planFieldFeatures" class="form-control" rows="4" placeholder='["Feature 1", "Feature 2"]'></textarea>
        <p class="form-hint">Array JSON de strings o objeto. Valida antes de guardar.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="planModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="planModalSave"><i class="fas fa-check"></i> Guardar</button>
      </div>
    `;
  }

  openEditPlanModal(id) {
    const plan = this.plans.find(p => p.id === id);
    if (!plan) return;
    this._editingPlanId = id;
    const { modal, close } = window.Modal.show({
      title: `Editar plan: ${plan.name}`,
      body: this._planModalBody(),
      className: 'dev-lead-modal-content dev-lead-modal-billing',
      onClose: () => { this._modalClose = null; this._editingPlanId = null; }
    });
    this._modalClose = close;
    modal.querySelector('#planFieldId').value = plan.id;
    modal.querySelector('#planFieldName').value = plan.name || '';
    modal.querySelector('#planFieldOrder').value = plan.display_order ?? 0;
    modal.querySelector('#planFieldDesc').value = plan.description || '';
    modal.querySelector('#planFieldPriceMonth').value = plan.price_usd_month ?? 0;
    modal.querySelector('#planFieldPriceYear').value = plan.price_usd_year ?? '';
    modal.querySelector('#planFieldCredits').value = plan.credits_monthly ?? 0;
    modal.querySelector('#planFieldStorage').value = plan.storage_mb ?? 0;
    modal.querySelector('#planFieldHandles').value = plan.max_handles ?? 0;
    modal.querySelector('#planFieldActive').checked = !!plan.is_active;
    modal.querySelector('#planFieldPopular').checked = !!plan.is_popular;
    modal.querySelector('#planFieldStripeMonth').value = plan.stripe_price_id_month || '';
    modal.querySelector('#planFieldStripeYear').value = plan.stripe_price_id_year || '';
    modal.querySelector('#planFieldWompiCents').value = plan.wompi_amount_cents_month ?? '';
    modal.querySelector('#planFieldFeatures').value = JSON.stringify(plan.features ?? [], null, 2);
    modal.querySelector('#planModalCancel')?.addEventListener('click', () => this.closeModal());
    modal.querySelector('#planModalSave')?.addEventListener('click', () => this.savePlan());
  }

  closeModal() {
    if (this._modalClose) this._modalClose();
    this._editingPlanId = null;
    this._grantOrgId = null;
    this._grantOrgName = null;
  }

  async savePlan() {
    if (!this._editingPlanId) return;
    const name = (document.getElementById('planFieldName')?.value || '').trim();
    if (!name) { this.showNotification('El nombre es obligatorio', 'warning'); return; }
    let features;
    try {
      features = JSON.parse(document.getElementById('planFieldFeatures')?.value || '[]');
    } catch (e) {
      this.showNotification('Features JSON invalido: ' + e.message, 'warning');
      return;
    }
    const payload = {
      name,
      description: (document.getElementById('planFieldDesc')?.value || '').trim() || null,
      display_order: parseInt(document.getElementById('planFieldOrder')?.value || '0', 10),
      price_usd_month: Number(document.getElementById('planFieldPriceMonth')?.value || 0),
      price_usd_year: document.getElementById('planFieldPriceYear')?.value
        ? Number(document.getElementById('planFieldPriceYear').value)
        : null,
      credits_monthly: parseInt(document.getElementById('planFieldCredits')?.value || '0', 10),
      storage_mb: parseInt(document.getElementById('planFieldStorage')?.value || '0', 10),
      max_handles: parseInt(document.getElementById('planFieldHandles')?.value || '0', 10),
      is_active: !!document.getElementById('planFieldActive')?.checked,
      is_popular: !!document.getElementById('planFieldPopular')?.checked,
      stripe_price_id_month: (document.getElementById('planFieldStripeMonth')?.value || '').trim() || null,
      stripe_price_id_year: (document.getElementById('planFieldStripeYear')?.value || '').trim() || null,
      wompi_amount_cents_month: document.getElementById('planFieldWompiCents')?.value
        ? parseInt(document.getElementById('planFieldWompiCents').value, 10)
        : null,
      features
    };
    const btn = document.getElementById('planModalSave');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
    try {
      const supabase = await this.getSupabase();
      const { error } = await supabase.from('plans').update(payload).eq('id', this._editingPlanId);
      if (error) throw error;
      this.showNotification(`Plan "${name}" actualizado.`, 'success');
      this.closeModal();
      await this.loadPlans();
    } catch (err) {
      console.error('savePlan:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al guardar'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Guardar'; }
    }
  }

  async togglePlanActive(id) {
    const plan = this.plans.find(p => p.id === id);
    if (!plan) return;
    const next = !plan.is_active;
    if (!confirm(`${next ? 'Activar' : 'Desactivar'} el plan "${plan.name}"?\n\nSi lo desactivas, NO sera visible en el catalogo. Las subs existentes mantienen el plan hasta migrar.`)) return;
    try {
      const supabase = await this.getSupabase();
      const { error } = await supabase.from('plans').update({ is_active: next }).eq('id', id);
      if (error) throw error;
      plan.is_active = next;
      this.renderPlansRows();
      this.showNotification(`Plan ${next ? 'activado' : 'desactivado'}.`, 'success');
    } catch (err) {
      console.error('togglePlanActive:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al togglear'), 'error');
    }
  }

  // ─── Org Credits tab ───────────────────────────────────────────────

  async loadOrgCredits() {
    const tbody = document.getElementById('creditsBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const supabase = await this.getSupabase();
      // Join organizations + organization_credits para mostrar todas las orgs (incluso las que no tienen fila de credits).
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, organization_credits(credits_available, credits_total, updated_at)')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(200);
      if (error) throw error;
      this.orgsBalance = (data || []).map(o => {
        const c = Array.isArray(o.organization_credits) ? o.organization_credits[0] : o.organization_credits;
        return {
          id: o.id,
          name: o.name,
          credits_available: c?.credits_available ?? 0,
          credits_total: c?.credits_total ?? 0,
          updated_at: c?.updated_at || null
        };
      });
      this.renderCreditsRows('');
    } catch (err) {
      console.error('loadOrgCredits:', err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="dev-lead-empty-cell">Error: ${this._escape(err?.message || 'fallo al cargar')}</td></tr>`;
    }
  }

  renderCreditsRows(filter) {
    const tbody = document.getElementById('creditsBody');
    if (!tbody) return;
    const rows = filter
      ? this.orgsBalance.filter(o => (o.name || '').toLowerCase().includes(filter))
      : this.orgsBalance;
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="dev-lead-empty-cell">Sin resultados</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(o => `
      <tr>
        <td>
          <strong>${this._escape(o.name)}</strong>
          <div class="dev-lead-row-sub">${this._escape(o.id)}</div>
        </td>
        <td><strong>${Number(o.credits_available).toFixed(2)}</strong></td>
        <td>${Number(o.credits_total).toFixed(2)}</td>
        <td>${o.updated_at ? new Date(o.updated_at).toLocaleString() : '—'}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn btn-xs btn-primary" data-action="grant" data-id="${this._escape(o.id)}" data-name="${this._escape(o.name)}" title="Otorgar / descontar creditos">
            <i class="fas fa-plus-minus"></i> Ajustar
          </button>
        </td>
      </tr>
    `).join('');
  }

  _grantModalBody() {
    return `
      <div class="form-group">
        <label>Organizacion</label>
        <input type="text" class="form-control" id="grantOrgName" readonly>
      </div>
      <div class="form-group">
        <label for="grantAmount">Monto (creditos) <span class="form-required">*</span></label>
        <input type="number" id="grantAmount" class="form-control" step="0.01" placeholder="Positivo = otorgar, negativo = descontar" required>
        <p class="form-hint">1 credito = $1 USD. Decimales permitidos (ej: 12.50). Negativos descuentan.</p>
      </div>
      <div class="form-group">
        <label for="grantReason">Razon <span class="form-required">*</span></label>
        <textarea id="grantReason" class="form-control" rows="3" maxlength="500" placeholder="Ej: refund por bug X, comp credits beta, ajuste manual ticket ZD-1234..." required></textarea>
        <p class="form-hint">Queda en audit log (credit_usage.metadata.reason). Min 4 chars.</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="grantModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="grantModalSave"><i class="fas fa-check"></i> Aplicar</button>
      </div>
    `;
  }

  openGrantModal(orgId, orgName) {
    this._grantOrgId = orgId;
    this._grantOrgName = orgName;
    const { modal, close } = window.Modal.show({
      title: 'Ajustar creditos',
      body: this._grantModalBody(),
      className: 'dev-lead-modal-content',
      onClose: () => { this._modalClose = null; this._grantOrgId = null; this._grantOrgName = null; }
    });
    this._modalClose = close;
    modal.querySelector('#grantOrgName').value = orgName;
    modal.querySelector('#grantModalCancel')?.addEventListener('click', () => this.closeModal());
    modal.querySelector('#grantModalSave')?.addEventListener('click', () => this.submitGrant());
  }

  async submitGrant() {
    if (!this._grantOrgId) return;
    const amount = Number(document.getElementById('grantAmount')?.value || 0);
    const reason = (document.getElementById('grantReason')?.value || '').trim();
    if (!amount || amount === 0) { this.showNotification('Monto invalido', 'warning'); return; }
    if (reason.length < 4) { this.showNotification('Razon: minimo 4 caracteres', 'warning'); return; }
    const btn = document.getElementById('grantModalSave');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...'; }
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase.rpc('grant_credits_admin', {
        p_org_id: this._grantOrgId,
        p_amount: amount,
        p_reason: reason
      });
      if (error) throw error;
      const newAvail = data?.credits_available;
      this.showNotification(`Aplicado: ${amount > 0 ? '+' : ''}${amount} creditos. Nuevo saldo: ${Number(newAvail).toFixed(2)}`, 'success');
      this.closeModal();
      await this.loadOrgCredits();
    } catch (err) {
      console.error('submitGrant:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al aplicar'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Aplicar'; }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  _escape(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  _badge(active, onLabel, offLabel) {
    const cls = active ? 'dev-lead-badge dev-lead-badge--ok' : 'dev-lead-badge dev-lead-badge--muted';
    return `<span class="${cls}">${active ? onLabel : offLabel}</span>`;
  }

  _formatStorage(mb) {
    if (!mb) return '—';
    if (mb >= 1024) return (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1) + ' GB';
    return mb + ' MB';
  }
}

window.DevLeadBillingView = DevLeadBillingView;
