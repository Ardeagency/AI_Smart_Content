/**
 * DevLeadBillingView — Console de billing (solo Lead).
 *
 * Tabs:
 *  - Plans: CRUD sobre tabla plans (subs mensuales: Creator, Team, Agency).
 *  - Credit Packages: CRUD sobre tabla credit_packages (compras puntuales que
 *    pinta CreditsShopView). Mini/Standard/Plus/Mega etc.
 *  - Subscriptions: placeholder Fase 2.
 *  - Usage: placeholder Fase 2.
 *
 * 1 credito = $1 USD a tasa interna; los packages venden creditos a descuento
 * (ej. Standard Pack = $159 por 1500 creditos = $0.106/credito, ~9.4x mejor que 1:1).
 * Auto-sync Stripe/Wompi pendiente Fase 3.
 */
class DevLeadBillingView extends DevBaseView {
  constructor() {
    super();
    this.supabase = null;
    this.activeTab = 'plans';
    this.plans = [];
    this.packages = [];
    this._editingPlanId = null;
    this._editingPackId = null;
    this._creatingPack = false;
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

        <div class="dev-lead-tabs">
          <button type="button" class="dev-lead-tab active" data-tab="plans"><i class="fas fa-tags"></i> Plans</button>
          <button type="button" class="dev-lead-tab" data-tab="packages"><i class="fas fa-coins"></i> Credit Packages</button>
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

        <section class="dev-lead-content" id="tabPanePackages" style="display:none">
          <div class="dev-lead-toolbar">
            <button type="button" class="btn btn-primary" id="packagesCreate"><i class="fas fa-plus"></i> Nuevo paquete</button>
            <button type="button" class="btn btn-secondary" id="packagesRefresh" title="Refrescar"><i class="fas fa-sync-alt"></i></button>
            <span class="dev-lead-hint"><i class="fas fa-info-circle"></i> Estos son los packs one-shot que el cliente compra en /credits (CreditsShopView). Editar precio aqui no resincroniza Stripe/Wompi.</span>
          </div>
          <div class="dev-table-container">
            <table class="dev-table" id="packagesTable">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Paquete</th>
                  <th>Creditos</th>
                  <th>Bonus</th>
                  <th>Precio USD</th>
                  <th>$/credito efectivo</th>
                  <th>Activo</th>
                  <th>Popular</th>
                  <th class="dev-lead-actions">Acciones</th>
                </tr>
              </thead>
              <tbody id="packagesBody"><tr><td colspan="9" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr></tbody>
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
    document.getElementById('packagesRefresh')?.addEventListener('click', () => this.loadPackages());
    document.getElementById('packagesCreate')?.addEventListener('click', () => this.openCreatePackageModal());

    document.getElementById('plansBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'edit-plan') this.openEditPlanModal(id);
      else if (action === 'toggle-plan-active') this.togglePlanActive(id);
    });
    document.getElementById('packagesBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'edit-pack') this.openEditPackageModal(id);
      else if (action === 'toggle-pack-active') this.togglePackageActive(id);
      else if (action === 'delete-pack') this.deletePackage(id);
    });
    await this.loadPlans();
  }

  switchTab(tab) {
    if (!tab || tab === this.activeTab) return;
    this.activeTab = tab;
    document.querySelectorAll('.dev-lead-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });
    ['plans', 'packages', 'subscriptions', 'usage'].forEach(t => {
      const pane = document.getElementById('tabPane' + t.charAt(0).toUpperCase() + t.slice(1));
      if (pane) pane.style.display = (t === tab) ? '' : 'none';
    });
    if (tab === 'packages' && this.packages.length === 0) this.loadPackages();
  }

  // ─── Plans tab ─────────────────────────────────────────────────────

  async loadPlans() {
    const tbody = document.getElementById('plansBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, description, price_usd_month, price_usd_year, credits_monthly, max_handles, storage_mb, features, is_popular, is_active, display_order, stripe_price_id_month, stripe_price_id_year, wompi_amount_cents_month, scraping_cadence_hours, scraping_daily_cap, cache_ttl_hours, trends_cadence_days, apify_credit_markup')
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
          <button type="button" class="btn btn-xs" data-action="toggle-plan-active" data-id="${this._escape(p.id)}" title="${p.is_active ? 'Desactivar' : 'Activar'}">
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
        <input type="text" id="planFieldId" class="form-control" readonly>
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
      <div class="form-group"><label style="font-weight:600;opacity:.85;">Scraping y costo (por plan)</label></div>
      <div class="form-row">
        <div class="form-group">
          <label for="planFieldScrapeCadence">Cadencia scraping (horas)</label>
          <input type="number" id="planFieldScrapeCadence" class="form-control" min="1" step="1">
        </div>
        <div class="form-group">
          <label for="planFieldScrapeCap">Cap diario scraping (runs)</label>
          <input type="number" id="planFieldScrapeCap" class="form-control" min="0" step="1">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="planFieldCacheTtl">Cache TTL (horas)</label>
          <input type="number" id="planFieldCacheTtl" class="form-control" min="0" step="1">
        </div>
        <div class="form-group">
          <label for="planFieldTrendsCadence">Cadencia tendencias (dias)</label>
          <input type="number" id="planFieldTrendsCadence" class="form-control" min="1" step="1">
        </div>
        <div class="form-group">
          <label for="planFieldMarkup">Markup Apify ($1 = N creditos)</label>
          <input type="number" id="planFieldMarkup" class="form-control" min="0.1" step="0.1" placeholder="2 = $1 cuesta 2 cr">
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
    modal.querySelector('#planFieldScrapeCadence').value = plan.scraping_cadence_hours ?? '';
    modal.querySelector('#planFieldScrapeCap').value = plan.scraping_daily_cap ?? '';
    modal.querySelector('#planFieldCacheTtl').value = plan.cache_ttl_hours ?? '';
    modal.querySelector('#planFieldTrendsCadence').value = plan.trends_cadence_days ?? '';
    modal.querySelector('#planFieldMarkup').value = plan.apify_credit_markup ?? '';
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
    this._editingPackId = null;
    this._creatingPack = false;
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
      scraping_cadence_hours: document.getElementById('planFieldScrapeCadence')?.value ? parseInt(document.getElementById('planFieldScrapeCadence').value, 10) : null,
      scraping_daily_cap: document.getElementById('planFieldScrapeCap')?.value ? parseInt(document.getElementById('planFieldScrapeCap').value, 10) : null,
      cache_ttl_hours: document.getElementById('planFieldCacheTtl')?.value ? parseInt(document.getElementById('planFieldCacheTtl').value, 10) : null,
      trends_cadence_days: document.getElementById('planFieldTrendsCadence')?.value ? parseInt(document.getElementById('planFieldTrendsCadence').value, 10) : null,
      apify_credit_markup: document.getElementById('planFieldMarkup')?.value ? Number(document.getElementById('planFieldMarkup').value) : null,
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

  // ─── Credit Packages tab ───────────────────────────────────────────

  async loadPackages() {
    const tbody = document.getElementById('packagesBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="dev-lead-empty-cell"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    try {
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .from('credit_packages')
        .select('id, name, credits, price_usd, bonus_credits, is_active, is_popular, display_order, stripe_price_id, wompi_amount_cents')
        .order('display_order', { ascending: true })
        .order('name');
      if (error) throw error;
      this.packages = data || [];
      this.renderPackagesRows();
    } catch (err) {
      console.error('loadPackages:', err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="dev-lead-empty-cell">Error: ${this._escape(err?.message || 'fallo al cargar')}</td></tr>`;
    }
  }

  renderPackagesRows() {
    const tbody = document.getElementById('packagesBody');
    if (!tbody) return;
    if (this.packages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="dev-lead-empty-cell">Sin paquetes</td></tr>';
      return;
    }
    tbody.innerHTML = this.packages.map(p => {
      const total = p.credits + (p.bonus_credits || 0);
      const perCred = total > 0 ? (Number(p.price_usd) / total) : 0;
      return `
      <tr>
        <td>${p.display_order}</td>
        <td>
          <strong>${this._escape(p.name)}</strong>
          <div class="dev-lead-row-sub">${this._escape(p.id)}</div>
        </td>
        <td>${p.credits.toLocaleString('en-US')}</td>
        <td>${p.bonus_credits > 0 ? `+${p.bonus_credits.toLocaleString('en-US')}` : '—'}</td>
        <td>$${Number(p.price_usd).toFixed(2)}</td>
        <td>$${perCred.toFixed(3)}</td>
        <td>${this._badge(p.is_active, 'Activo', 'Inactivo')}</td>
        <td>${p.is_popular ? '<i class="fas fa-star" style="color:var(--accent-warm,#e09145)"></i>' : ''}</td>
        <td class="dev-lead-actions">
          <button type="button" class="btn btn-xs btn-secondary" data-action="edit-pack" data-id="${this._escape(p.id)}" title="Editar"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn btn-xs" data-action="toggle-pack-active" data-id="${this._escape(p.id)}" title="${p.is_active ? 'Desactivar' : 'Activar'}">
            <i class="fas fa-${p.is_active ? 'toggle-on' : 'toggle-off'}"></i>
          </button>
          <button type="button" class="btn btn-xs btn-danger" data-action="delete-pack" data-id="${this._escape(p.id)}" title="Borrar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }

  _packageModalBody(isCreate) {
    return `
      <div class="form-row">
        <div class="form-group">
          <label for="packFieldId">ID (slug) <span class="form-required">*</span></label>
          <input type="text" id="packFieldId" class="form-control" maxlength="60" ${isCreate ? '' : 'readonly'} pattern="^[a-z0-9_-]+$" placeholder="pack_mini">
          ${isCreate ? '<p class="form-hint">Lowercase, sin espacios. Slug del paquete (inmutable).</p>' : '<p class="form-hint">PK inmutable.</p>'}
        </div>
        <div class="form-group">
          <label for="packFieldOrder">Display order</label>
          <input type="number" id="packFieldOrder" class="form-control" min="0" max="100" value="0">
        </div>
      </div>
      <div class="form-group">
        <label for="packFieldName">Nombre <span class="form-required">*</span></label>
        <input type="text" id="packFieldName" class="form-control" maxlength="80" required placeholder="Standard Pack">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="packFieldCredits">Creditos <span class="form-required">*</span></label>
          <input type="number" id="packFieldCredits" class="form-control" min="1" required>
        </div>
        <div class="form-group">
          <label for="packFieldBonus">Bonus creditos</label>
          <input type="number" id="packFieldBonus" class="form-control" min="0" value="0">
          <p class="form-hint">Extra credits sumados al total (badge "+X gratis").</p>
        </div>
        <div class="form-group">
          <label for="packFieldPrice">Precio USD <span class="form-required">*</span></label>
          <input type="number" id="packFieldPrice" class="form-control" step="0.01" min="0" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group form-check">
          <label><input type="checkbox" id="packFieldActive" checked> Activo (visible en catalogo)</label>
        </div>
        <div class="form-group form-check">
          <label><input type="checkbox" id="packFieldPopular"> Popular (badge destacado)</label>
        </div>
      </div>
      <div class="form-group">
        <label for="packFieldStripe">Stripe price ID</label>
        <input type="text" id="packFieldStripe" class="form-control" placeholder="price_xxx">
      </div>
      <div class="form-group">
        <label for="packFieldWompi">Wompi monto centavos COP</label>
        <input type="number" id="packFieldWompi" class="form-control" min="0" placeholder="ej: 35000000 = $350.000 COP">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="packModalCancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="packModalSave"><i class="fas fa-check"></i> ${isCreate ? 'Crear' : 'Guardar'}</button>
      </div>
    `;
  }

  openCreatePackageModal() {
    this._creatingPack = true;
    this._editingPackId = null;
    const { modal, close } = window.Modal.show({
      title: 'Nuevo paquete de creditos',
      body: this._packageModalBody(true),
      className: 'dev-lead-modal-content dev-lead-modal-billing',
      onClose: () => { this._modalClose = null; this._creatingPack = false; }
    });
    this._modalClose = close;
    modal.querySelector('#packModalCancel')?.addEventListener('click', () => this.closeModal());
    modal.querySelector('#packModalSave')?.addEventListener('click', () => this.savePackage());
  }

  openEditPackageModal(id) {
    const pack = this.packages.find(p => p.id === id);
    if (!pack) return;
    this._editingPackId = id;
    this._creatingPack = false;
    const { modal, close } = window.Modal.show({
      title: `Editar paquete: ${pack.name}`,
      body: this._packageModalBody(false),
      className: 'dev-lead-modal-content dev-lead-modal-billing',
      onClose: () => { this._modalClose = null; this._editingPackId = null; }
    });
    this._modalClose = close;
    modal.querySelector('#packFieldId').value = pack.id;
    modal.querySelector('#packFieldName').value = pack.name || '';
    modal.querySelector('#packFieldOrder').value = pack.display_order ?? 0;
    modal.querySelector('#packFieldCredits').value = pack.credits ?? 0;
    modal.querySelector('#packFieldBonus').value = pack.bonus_credits ?? 0;
    modal.querySelector('#packFieldPrice').value = pack.price_usd ?? 0;
    modal.querySelector('#packFieldActive').checked = !!pack.is_active;
    modal.querySelector('#packFieldPopular').checked = !!pack.is_popular;
    modal.querySelector('#packFieldStripe').value = pack.stripe_price_id || '';
    modal.querySelector('#packFieldWompi').value = pack.wompi_amount_cents ?? '';
    modal.querySelector('#packModalCancel')?.addEventListener('click', () => this.closeModal());
    modal.querySelector('#packModalSave')?.addEventListener('click', () => this.savePackage());
  }

  async savePackage() {
    const id = (document.getElementById('packFieldId')?.value || '').trim();
    const name = (document.getElementById('packFieldName')?.value || '').trim();
    if (!id || !/^[a-z0-9_-]+$/.test(id)) { this.showNotification('ID invalido: usar lowercase, numeros, _ o -', 'warning'); return; }
    if (!name) { this.showNotification('El nombre es obligatorio', 'warning'); return; }
    const credits = parseInt(document.getElementById('packFieldCredits')?.value || '0', 10);
    if (credits <= 0) { this.showNotification('Creditos debe ser > 0', 'warning'); return; }
    const price = Number(document.getElementById('packFieldPrice')?.value || 0);
    if (price < 0) { this.showNotification('Precio no puede ser negativo', 'warning'); return; }

    const payload = {
      id,
      name,
      credits,
      bonus_credits: parseInt(document.getElementById('packFieldBonus')?.value || '0', 10),
      price_usd: price,
      display_order: parseInt(document.getElementById('packFieldOrder')?.value || '0', 10),
      is_active: !!document.getElementById('packFieldActive')?.checked,
      is_popular: !!document.getElementById('packFieldPopular')?.checked,
      stripe_price_id: (document.getElementById('packFieldStripe')?.value || '').trim() || null,
      wompi_amount_cents: document.getElementById('packFieldWompi')?.value
        ? parseInt(document.getElementById('packFieldWompi').value, 10)
        : null
    };

    const btn = document.getElementById('packModalSave');
    const wasCreate = this._creatingPack;
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${wasCreate ? 'Creando...' : 'Guardando...'}`; }
    try {
      const supabase = await this.getSupabase();
      if (wasCreate) {
        const { error } = await supabase.from('credit_packages').insert(payload);
        if (error) throw error;
        this.showNotification(`Paquete "${name}" creado.`, 'success');
      } else {
        const { id: _omit, ...updatePayload } = payload;
        const { error } = await supabase.from('credit_packages').update(updatePayload).eq('id', this._editingPackId);
        if (error) throw error;
        this.showNotification(`Paquete "${name}" actualizado.`, 'success');
      }
      this.closeModal();
      await this.loadPackages();
    } catch (err) {
      console.error('savePackage:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al guardar'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-check"></i> ${wasCreate ? 'Crear' : 'Guardar'}`; }
    }
  }

  async togglePackageActive(id) {
    const pack = this.packages.find(p => p.id === id);
    if (!pack) return;
    const next = !pack.is_active;
    if (!confirm(`${next ? 'Activar' : 'Desactivar'} el paquete "${pack.name}"?`)) return;
    try {
      const supabase = await this.getSupabase();
      const { error } = await supabase.from('credit_packages').update({ is_active: next }).eq('id', id);
      if (error) throw error;
      pack.is_active = next;
      this.renderPackagesRows();
      this.showNotification(`Paquete ${next ? 'activado' : 'desactivado'}.`, 'success');
    } catch (err) {
      console.error('togglePackageActive:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al togglear'), 'error');
    }
  }

  async deletePackage(id) {
    const pack = this.packages.find(p => p.id === id);
    if (!pack) return;
    if (!confirm(`Borrar definitivamente "${pack.name}"?\n\nSi tiene compras historicas referenciadas, fallara por FK. En ese caso desactivalo en vez de borrar.`)) return;
    try {
      const supabase = await this.getSupabase();
      const { error } = await supabase.from('credit_packages').delete().eq('id', id);
      if (error) throw error;
      this.showNotification(`Paquete "${pack.name}" borrado.`, 'success');
      await this.loadPackages();
    } catch (err) {
      console.error('deletePackage:', err);
      this.showNotification('Error: ' + (err?.message || 'fallo al borrar'), 'error');
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
