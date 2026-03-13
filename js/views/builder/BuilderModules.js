/**
 * BuilderModules — Mixin for DevBuilderView
 * Handles: execution graph modules, technical details panel
 */
(function () {
  'use strict';
  const P = DevBuilderView.prototype;

  const EXECUTION_TYPES = [
    { value: 'webhook', label: 'Webhook' },
    { value: 'python', label: 'Python' },
    { value: 'make', label: 'Make' },
    { value: 'internal', label: 'Internal' },
    { value: 'ai_direct', label: 'AI direct' },
    { value: 'aggregator', label: 'Aggregator' }
  ];
  DevBuilderView.EXECUTION_TYPES = EXECUTION_TYPES;

  P.renderTechnicalModulesList = function () {
    const listEl = this.querySelector('#technicalModulesList');
    if (!listEl) return;
    const executionTypes = EXECUTION_TYPES;
    const mods = this.flowModules.length ? this.flowModules : [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
    if (this.flowModules.length === 0) this.flowModules = mods;
    listEl.innerHTML = mods.map((m, i) => {
      const nextOpts = mods.filter((o, j) => j !== i && o.id).map(o => `<option value="${o.id}" ${m.next_module_id === o.id ? 'selected' : ''}>${this.escapeHtml(o.name || 'Módulo')}</option>`).join('');
      return `
        <div class="technical-module-card" data-module-index="${i}">
          <div class="technical-module-header">
            <span class="technical-module-order">${i + 1}</span>
            <input type="text" class="technical-module-name" data-field="name" value="${this.escapeHtml(m.name || '')}" placeholder="Nombre del módulo">
            ${mods.length > 1 ? `<button type="button" class="btn-icon technical-module-remove" title="Quitar módulo"><i class="ph ph-trash"></i></button>` : ''}
          </div>
          <div class="technical-module-fields">
            <h5 class="technical-module-subtitle">Configuración técnica del módulo</h5>
            <div class="settings-row">
              <div class="settings-field">
                <label>Tipo ejecución</label>
                <select class="technical-module-execution" data-field="execution_type">
                  ${executionTypes.map(et => `<option value="${et.value}" ${(m.execution_type || 'webhook') === et.value ? 'selected' : ''}>${et.label}</option>`).join('')}
                </select>
              </div>
              <div class="settings-field">
                <label>URL Test</label>
                <input type="url" class="technical-module-webhook-test" data-field="webhook_url_test" value="${this.escapeHtml(m.webhook_url_test || '')}" placeholder="https://...">
              </div>
            </div>
            <div class="settings-field">
              <label>URL Producción</label>
              <input type="url" class="technical-module-webhook-prod" data-field="webhook_url_prod" value="${this.escapeHtml(m.webhook_url_prod || '')}" placeholder="https://...">
            </div>
            <div class="settings-row">
              <label class="technical-module-approval">
                <input type="checkbox" class="technical-module-human-approval" data-field="is_human_approval_required" ${m.is_human_approval_required ? 'checked' : ''}>
                <span>Requiere aprobación humana</span>
              </label>
            </div>
            <div class="settings-field">
              <label>Siguiente módulo</label>
              <select class="technical-module-next" data-field="next_module_id">
                <option value="">— Ninguno —</option>
                ${nextOpts}
              </select>
            </div>
          </div>
          <div class="technical-module-footer">
            <button type="button" class="btn-icon btn-ghost technical-module-details-btn" data-module-index="${i}" title="Detalles técnicos de este módulo"><i class="ph ph-wrench"></i></button>
          </div>
        </div>
      `;
    }).join('');
  };

  P.syncExecutionModeFromModules = function () {
    this.flowData.execution_mode = this.flowModules.length <= 1 ? 'single_step' : 'sequential';
  };

  P.setupTechnicalModulesListeners = function () {
    const addBtn = this.querySelector('#technicalAddModuleBtn');
    if (addBtn) {
      addBtn.onclick = () => {
        const nextOrder = this.flowModules.length + 1;
        this.flowModules.push({ name: 'Módulo ' + nextOrder, step_order: nextOrder, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null });
        this.syncExecutionModeFromModules();
        this.renderTechnicalModulesList();
        this.setupTechnicalModulesListeners();
        this.onFieldChange();
      };
    }
    const listEl = this.querySelector('#technicalModulesList');
    if (listEl) {
      listEl.querySelectorAll('.technical-module-card').forEach(card => {
        const idx = parseInt(card.dataset.moduleIndex, 10);
        if (isNaN(idx)) return;
        card.querySelectorAll('[data-field]').forEach(el => {
          el.addEventListener('input', () => this.syncModuleField(idx, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value));
          el.addEventListener('change', () => this.syncModuleField(idx, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value));
        });
        const removeBtn = card.querySelector('.technical-module-remove');
        if (removeBtn) {
          removeBtn.onclick = () => {
            this.flowModules.splice(idx, 1);
            this.syncExecutionModeFromModules();
            this.flowModules.forEach((m, i) => { m.step_order = i + 1; });
            this.renderTechnicalModulesList();
            this.setupTechnicalModulesListeners();
            if (this.flowModules[0]) {
              this.technicalDetails.webhook_url_test = this.flowModules[0].webhook_url_test;
              this.technicalDetails.webhook_url_prod = this.flowModules[0].webhook_url_prod;
            }
            this.onFieldChange();
          };
        }
        const detailsBtn = card.querySelector('.technical-module-details-btn');
        if (detailsBtn) {
          detailsBtn.onclick = () => {
            const mod = this.flowModules[idx];
            const key = mod?.id || `idx_${idx}`;
            this.openTechnicalDetailsPanel(key);
          };
        }
      });
    }
    this.setupTechnicalDetailsPanel();
  };

  P.setupTechnicalDetailsPanel = function () {
    const panel = this.querySelector('#technicalDetailsPanel');
    const openBtn = this.querySelector('#technicalDetailsPanelBtn');
    const closeBtn = this.querySelector('#technicalDetailsPanelClose');
    const moduleSelect = this.querySelector('#techDetailsModuleSelect');
    const formWrap = this.querySelector('#techDetailsFormWrap');
    if (!panel) return;
    if (openBtn) {
      openBtn.onclick = () => {
        this.fillTechDetailsModuleSelect();
        panel.classList.add('is-open');
        if (!this.technicalDetailsPanelModuleKey && this.flowModules.length > 0) {
          const first = this.flowModules[0];
          this.technicalDetailsPanelModuleKey = first.id || 'idx_0';
          if (moduleSelect) moduleSelect.value = this.technicalDetailsPanelModuleKey;
          this.fillTechDetailsForm(this.technicalDetailsPanelModuleKey);
        }
        if (formWrap) formWrap.style.display = this.technicalDetailsPanelModuleKey ? '' : 'none';
      };
    }
    if (closeBtn) closeBtn.onclick = () => this.closeTechnicalDetailsPanel();
    if (moduleSelect) {
      moduleSelect.onchange = () => {
        const key = moduleSelect.value || null;
        this.syncTechDetailsFromForm();
        this.technicalDetailsPanelModuleKey = key;
        if (key) {
          this.fillTechDetailsForm(key);
          if (formWrap) formWrap.style.display = '';
        } else {
          if (formWrap) formWrap.style.display = 'none';
        }
      };
    }
    const fieldIds = ['techDetailsWebhookMethod', 'techDetailsPlatformName', 'techDetailsPlatformFlowId', 'techDetailsPlatformFlowName', 'techDetailsEditorUrl', 'techDetailsCredentialId', 'techDetailsIsHealthy', 'techDetailsAvgExecutionTimeMs'];
    fieldIds.forEach(id => {
      const el = this.querySelector(`#${id}`);
      if (el) {
        el.addEventListener('input', () => this.syncTechDetailsFromForm());
        el.addEventListener('change', () => this.syncTechDetailsFromForm());
      }
    });
  };

  P.openTechnicalDetailsPanel = function (moduleKey) {
    const panel = this.querySelector('#technicalDetailsPanel');
    if (!panel) return;
    this.fillTechDetailsModuleSelect();
    this.technicalDetailsPanelModuleKey = moduleKey;
    const moduleSelect = this.querySelector('#techDetailsModuleSelect');
    if (moduleSelect) moduleSelect.value = moduleKey || '';
    this.fillTechDetailsForm(moduleKey);
    const formWrap = this.querySelector('#techDetailsFormWrap');
    if (formWrap) formWrap.style.display = moduleKey ? '' : 'none';
    panel.classList.add('is-open');
  };

  P.closeTechnicalDetailsPanel = function () {
    const panel = this.querySelector('#technicalDetailsPanel');
    if (panel) panel.classList.remove('is-open');
    this.syncTechDetailsFromForm();
  };

  P.fillTechDetailsModuleSelect = function () {
    const sel = this.querySelector('#techDetailsModuleSelect');
    if (!sel) return;
    const opts = this.flowModules.map((m, i) => ({
      value: m.id || `idx_${i}`,
      label: m.name || 'Módulo ' + (i + 1)
    }));
    sel.innerHTML = '<option value="">— Seleccionar módulo —</option>' + opts.map(o => `<option value="${this.escapeHtml(o.value)}">${this.escapeHtml(o.label)}</option>`).join('');
    if (this.technicalDetailsPanelModuleKey) sel.value = this.technicalDetailsPanelModuleKey;
  };

  P.getTechDetailsDefault = function () {
    return {
      webhook_method: 'POST',
      platform_name: 'n8n',
      platform_flow_id: '',
      platform_flow_name: '',
      editor_url: '',
      credential_id: '',
      is_healthy: true,
      last_health_check: null,
      avg_execution_time_ms: ''
    };
  };

  P.fillTechDetailsForm = function (moduleKey) {
    if (!moduleKey) return;
    if (!this.flowTechnicalDetailsByModule[moduleKey]) {
      this.flowTechnicalDetailsByModule[moduleKey] = { ...this.getTechDetailsDefault() };
    }
    const t = this.flowTechnicalDetailsByModule[moduleKey];
    const set = (id, value) => { const el = this.querySelector(`#${id}`); if (el) el.value = value ?? ''; };
    const setCheck = (id, value) => { const el = this.querySelector(`#${id}`); if (el) el.checked = !!value; };
    set('techDetailsWebhookMethod', t.webhook_method || 'POST');
    set('techDetailsPlatformName', t.platform_name);
    set('techDetailsPlatformFlowId', t.platform_flow_id);
    set('techDetailsPlatformFlowName', t.platform_flow_name);
    set('techDetailsEditorUrl', t.editor_url);
    set('techDetailsCredentialId', t.credential_id);
    setCheck('techDetailsIsHealthy', t.is_healthy);
    set('techDetailsAvgExecutionTimeMs', t.avg_execution_time_ms === '' || t.avg_execution_time_ms == null ? '' : t.avg_execution_time_ms);
    const lastCheck = this.querySelector('#techDetailsLastHealthCheck');
    if (lastCheck) lastCheck.value = t.last_health_check ? new Date(t.last_health_check).toLocaleString() : '—';
  };

  P.syncTechDetailsFromForm = function () {
    if (!this.technicalDetailsPanelModuleKey) return;
    if (!this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey]) {
      this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey] = this.getTechDetailsDefault();
    }
    const t = this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey];
    const get = (id) => { const el = this.querySelector(`#${id}`); return el ? el.value : ''; };
    const getCheck = (id) => { const el = this.querySelector(`#${id}`); return el ? el.checked : false; };
    t.webhook_method = (get('techDetailsWebhookMethod') || 'POST').toUpperCase();
    t.platform_name = get('techDetailsPlatformName') || 'n8n';
    t.platform_flow_id = get('techDetailsPlatformFlowId') || '';
    t.platform_flow_name = get('techDetailsPlatformFlowName') || '';
    t.editor_url = get('techDetailsEditorUrl') || '';
    t.credential_id = get('techDetailsCredentialId') || '';
    t.is_healthy = getCheck('techDetailsIsHealthy');
    const avg = get('techDetailsAvgExecutionTimeMs');
    t.avg_execution_time_ms = avg === '' ? '' : parseInt(avg, 10);
    const firstKey = this.flowModules[0]?.id || 'idx_0';
    if (this.technicalDetailsPanelModuleKey === firstKey) {
      this.technicalDetails.webhook_method = t.webhook_method || 'POST';
      this.technicalDetails.platform_name = t.platform_name || 'n8n';
      this.technicalDetails.editor_url = t.editor_url || '';
    }
    this.onFieldChange();
  };

  P.syncModuleField = function (index, field, value) {
    if (!this.flowModules[index]) return;
    if (field === 'is_human_approval_required') this.flowModules[index][field] = !!value;
    else if (field === 'next_module_id') this.flowModules[index][field] = value || null;
    else if (field === 'output_schema' || field === 'routing_rules' || field === 'input_schema') {
      const str = (value || '').trim();
      if (!str) this.flowModules[index][field] = (field === 'input_schema' && index === 0) ? this.flowModules[index][field] : null;
      else {
        try {
          this.flowModules[index][field] = JSON.parse(str);
        } catch (_) {
          this.flowModules[index][field] = value;
        }
      }
    } else this.flowModules[index][field] = value;
    if (index === 0) {
      this.technicalDetails.webhook_url_test = this.flowModules[0].webhook_url_test;
      this.technicalDetails.webhook_url_prod = this.flowModules[0].webhook_url_prod;
    }
    this.onFieldChange();
  };
})();
