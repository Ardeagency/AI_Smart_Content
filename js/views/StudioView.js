/**
 * StudioView - Consumidor de flujos (content_flows).
 * Panel central vacío, footer con créditos y coste, sidebar con input_schema y envío a webhook_url.
 */
class StudioView extends BaseView {
  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.credits = { available: 0, total: 0 };
    this.flows = [];
    this.selectedFlow = null;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        window.router?.navigate('/login', true);
        return;
      }
    }

    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');

    if (!this.organizationId) {
      window.router?.navigate('/hogar');
      return;
    }

    localStorage.setItem('selectedOrganizationId', this.organizationId);
  }

  renderHTML() {
    return `
      <div class="studio-layout" id="studioContainer">
        <main class="studio-center">
          <div class="studio-canvas-empty" id="studioCanvas"></div>
          <footer class="studio-footer">
            <div class="studio-footer-credits">
              <div class="studio-credits-icon"><i class="fas fa-coins"></i></div>
              <span class="studio-credits-text" id="studioCreditsText">0 créditos restantes</span>
              <span class="studio-credits-cost" id="studioCreditsCost"></span>
            </div>
            <button type="button" class="studio-btn-producir" id="studioProducirBtn" disabled>
              Producir
            </button>
          </footer>
        </main>

        <aside class="studio-sidebar-creative">
          <div class="studio-sidebar-tabs">
            <span class="studio-tab studio-tab-past">PAST</span>
            <button type="button" class="studio-tab studio-tab-future active">
              FUTURE <i class="fas fa-caret-right"></i>
            </button>
          </div>
          <div class="studio-sidebar-content">
            <div class="studio-flows-list" id="studioFlowsList"></div>
            <div class="studio-flow-form-wrap" id="studioFlowFormWrap" style="display: none;">
              <button type="button" class="studio-back-flows" id="studioBackFlows"><i class="fas fa-arrow-left"></i> Elegir otro flujo</button>
              <h3 class="studio-form-title" id="studioFormTitle"></h3>
              <form class="studio-flow-form" id="studioFlowForm"></form>
            </div>
          </div>
        </aside>
      </div>
    `;
  }

  async init() {
    window.studioView = this;
    await this.initSupabase();
    await this.loadCredits();
    await this.loadFlows();

    const preselectedId = (window.appState && window.appState.get('selectedFlowId')) || localStorage.getItem('selectedFlowId');
    if (preselectedId) {
      const flow = this.flows.find(f => f.id === preselectedId);
      if (flow) {
        this.selectedFlow = flow;
        this.updateCreditsDisplay();
        this.renderFlowForm(flow);
        const listEl = document.getElementById('studioFlowsList');
        const formWrap = document.getElementById('studioFlowFormWrap');
        if (listEl) listEl.style.display = 'none';
        if (formWrap) formWrap.style.display = 'block';
        const btn = document.getElementById('studioProducirBtn');
        if (btn) btn.disabled = !flow.webhook_url;
      }
      if (window.appState) window.appState.set('selectedFlowId', null, true);
      localStorage.removeItem('selectedFlowId');
    } else {
      this.updateCreditsDisplay();
      this.renderFlowsList();
    }

    this.setupEventListeners();
  }

  async initSupabase() {
    try {
      if (window.supabaseService) {
        this.supabase = await window.supabaseService.getClient();
      } else if (window.supabase) {
        this.supabase = window.supabase;
      }
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('Studio initSupabase:', e);
    }
  }

  async loadCredits() {
    if (!this.supabase || !this.organizationId) return;
    try {
      const { data, error } = await this.supabase
        .from('organization_credits')
        .select('credits_available, credits_total')
        .eq('organization_id', this.organizationId)
        .maybeSingle();
      if (!error && data) {
        this.credits.available = data.credits_available ?? 0;
        this.credits.total = data.credits_total ?? 0;
      }
    } catch (e) {
      console.error('Studio loadCredits:', e);
    }
  }

  async loadFlows() {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('content_flows')
        .select('id, name, description, token_cost, input_schema, webhook_url, output_type')
        .eq('is_active', true)
        .eq('flow_category_type', 'manual');
      if (!error && data) {
        this.flows = data;
      } else {
        this.flows = [];
      }
    } catch (e) {
      console.error('Studio loadFlows:', e);
      this.flows = [];
    }
  }

  updateCreditsDisplay() {
    const textEl = document.getElementById('studioCreditsText');
    const costEl = document.getElementById('studioCreditsCost');
    if (textEl) {
      const n = this.credits.available;
      textEl.textContent = `${n.toLocaleString('es')} créditos restantes`;
    }
    if (costEl) {
      if (this.selectedFlow && this.selectedFlow.token_cost != null) {
        costEl.textContent = `${this.selectedFlow.token_cost} créditos esta producción`;
        costEl.style.display = '';
      } else {
        costEl.textContent = '';
        costEl.style.display = 'none';
      }
    }
  }

  renderFlowsList() {
    const listEl = document.getElementById('studioFlowsList');
    const formWrap = document.getElementById('studioFlowFormWrap');
    if (!listEl) return;

    if (this.flows.length === 0) {
      listEl.innerHTML = '<p class="studio-empty-flows">No hay flujos disponibles.</p>';
      if (formWrap) formWrap.style.display = 'none';
      return;
    }

    listEl.innerHTML = this.flows.map(f => `
      <article class="studio-card studio-card-flow" data-flow-id="${f.id}">
        <div class="studio-card-icon"><i class="fas fa-magic"></i></div>
        <p class="studio-card-text">${this.escapeHtml(f.name)}</p>
        ${f.description ? `<p class="studio-card-desc">${this.escapeHtml(f.description)}</p>` : ''}
        <span class="studio-card-tag">${(f.token_cost ?? 1)} crédito(s)</span>
      </article>
    `).join('');

    listEl.querySelectorAll('.studio-card-flow').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-flow-id');
        const flow = this.flows.find(f => f.id === id);
        if (flow) this.selectFlow(flow);
      });
    });

    if (formWrap) formWrap.style.display = 'none';
  }

  selectFlow(flow) {
    this.selectedFlow = flow;
    this.updateCreditsDisplay();
    this.renderFlowForm(flow);
    const listEl = document.getElementById('studioFlowsList');
    const formWrap = document.getElementById('studioFlowFormWrap');
    if (listEl) listEl.style.display = 'none';
    if (formWrap) formWrap.style.display = 'block';

    const btn = document.getElementById('studioProducirBtn');
    if (btn) {
      btn.disabled = !flow.webhook_url;
    }
  }

  renderFlowForm(flow) {
    const titleEl = document.getElementById('studioFormTitle');
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl || !flow) return;

    if (titleEl) titleEl.textContent = flow.name;

    const schema = flow.input_schema || {};
    const fields = Array.isArray(schema) ? schema : (schema.fields || schema.inputs || []);
    if (!Array.isArray(fields) || fields.length === 0) {
      formEl.innerHTML = '<p class="studio-form-empty">Este flujo no requiere datos adicionales.</p>';
      return;
    }

    formEl.innerHTML = fields.map(f => this.renderFormField(f)).join('');

    if (window.InputRenders && typeof window.InputRenders.initInputComponents === 'function') {
      window.InputRenders.initInputComponents(formEl);
    }
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => this.updateCreditsDisplay());
      el.addEventListener('change', () => this.updateCreditsDisplay());
    });
  }

  renderFormField(field) {
    if (window.InputRenders && window.InputRenders.getComponentType(field)) {
      return `
        <div class="studio-field">
          ${window.InputRenders.renderFieldWithWrapper(field, { mode: 'studio', idPrefix: 'studio-', required: field.required !== false })}
        </div>
      `;
    }
    const name = field.name || field.key || field.id || 'field';
    const label = field.label || name;
    const type = (field.type || field.input_type || 'text').toLowerCase();
    const required = field.required !== false;
    const placeholder = field.placeholder || '';

    if (type === 'textarea') {
      return `
        <div class="studio-field">
          <label for="studio-${name}">${this.escapeHtml(label)}</label>
          <textarea id="studio-${name}" name="${this.escapeHtml(name)}" rows="3" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''}></textarea>
        </div>
      `;
    }
    if (type === 'number') {
      return `
        <div class="studio-field">
          <label for="studio-${name}">${this.escapeHtml(label)}</label>
          <input type="number" id="studio-${name}" name="${this.escapeHtml(name)}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} />
        </div>
      `;
    }
    if (type === 'select') {
      const options = field.options || [];
      const opts = options.map(o => `<option value="${this.escapeHtml(String(o.value ?? o))}">${this.escapeHtml(String(o.label ?? o))}</option>`).join('');
      return `
        <div class="studio-field">
          <label for="studio-${name}">${this.escapeHtml(label)}</label>
          <select id="studio-${name}" name="${this.escapeHtml(name)}" ${required ? 'required' : ''}>
            <option value="">Seleccionar...</option>
            ${opts}
          </select>
        </div>
      `;
    }
    return `
      <div class="studio-field">
        <label for="studio-${name}">${this.escapeHtml(label)}</label>
        <input type="text" id="studio-${name}" name="${this.escapeHtml(name)}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} />
      </div>
    `;
  }

  collectFormData() {
    const formEl = document.getElementById('studioFlowForm');
    if (!formEl) return {};
    const data = {};
    formEl.querySelectorAll('input, textarea, select').forEach(el => {
      const name = el.getAttribute('name');
      if (!name) return;
      if (el.type === 'checkbox') data[name] = el.checked;
      else data[name] = el.value?.trim() ?? '';
    });
    return data;
  }

  setupEventListeners() {
    const btn = document.getElementById('studioProducirBtn');
    if (btn) btn.addEventListener('click', () => this.producir());

    const tabFuture = document.querySelector('.studio-tab-future');
    const backFlows = document.getElementById('studioBackFlows');
    const showFlowsList = () => {
      const listEl = document.getElementById('studioFlowsList');
      const formWrap = document.getElementById('studioFlowFormWrap');
      if (listEl) listEl.style.display = '';
      if (formWrap) formWrap.style.display = 'none';
      this.selectedFlow = null;
      this.updateCreditsDisplay();
      const b = document.getElementById('studioProducirBtn');
      if (b) b.disabled = true;
    };
    if (tabFuture) tabFuture.addEventListener('click', showFlowsList);
    if (backFlows) backFlows.addEventListener('click', showFlowsList);
  }

  async producir() {
    if (!this.selectedFlow || !this.selectedFlow.webhook_url) return;
    const cost = this.selectedFlow.token_cost ?? 1;
    if (this.credits.available < cost) {
      alert('Créditos insuficientes para esta producción.');
      return;
    }

    const payload = this.collectFormData();
    const btn = document.getElementById('studioProducirBtn');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch(this.selectedFlow.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(res.statusText || 'Error en la producción');

      await this.deductCredits(cost);
      await this.loadCredits();
      this.updateCreditsDisplay();
      alert('Producción enviada correctamente.');
    } catch (e) {
      console.error('Studio producir:', e);
      alert('Error al producir. Revisa la consola.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async deductCredits(amount) {
    if (!this.supabase || !this.organizationId || !this.userId) return;
    const newAvailable = Math.max(0, this.credits.available - amount);
    try {
      const { error } = await this.supabase
        .from('organization_credits')
        .update({
          credits_available: newAvailable,
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', this.organizationId);
      if (error) throw error;
      this.credits.available = newAvailable;
    } catch (e) {
      console.error('Studio deductCredits:', e);
      throw e;
    }
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

window.StudioView = StudioView;
