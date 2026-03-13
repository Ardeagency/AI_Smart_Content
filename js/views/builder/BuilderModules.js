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
    const mapEl = this.querySelector('#modulesNodeMap');
    if (!mapEl) return;
    const mods = this.flowModules.length ? this.flowModules : [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
    if (this.flowModules.length === 0) this.flowModules = mods;
    const nodes = mods.map((m, i) => {
      const name = (m.name || 'Módulo ' + (i + 1)).trim() || 'Módulo ' + (i + 1);
      const removeBtn = mods.length > 1
        ? `<button type="button" class="module-node-remove" data-module-index="${i}" title="Quitar módulo" aria-label="Quitar módulo"><i class="ph ph-x"></i></button>`
        : '';
      return `
        <div class="module-node" data-module-index="${i}" title="Doble clic para editar">
          <div class="module-node-inner">
            <span class="module-node-order">${i + 1}</span>
            <span class="module-node-name">${this.escapeHtml(name)}</span>
            ${removeBtn}
          </div>
        </div>
        ${i < mods.length - 1 ? '<div class="module-node-connector" aria-hidden="true"></div>' : ''}
      `;
    }).join('');
    mapEl.innerHTML = nodes;
  };

  P.syncExecutionModeFromModules = function () {
    this.flowData.execution_mode = this.flowModules.length <= 1 ? 'single_step' : 'sequential';
  };

  P.openModuleNodeModal = function (index) {
    const mod = this.flowModules[index];
    if (!mod) return;
    this._moduleNodeModalIndex = index;
    const nameEl = this.querySelector('#moduleNodeModalName');
    const typeEl = this.querySelector('#moduleNodeModalExecutionType');
    const urlTestEl = this.querySelector('#moduleNodeModalUrlTest');
    const urlProdEl = this.querySelector('#moduleNodeModalUrlProd');
    const indexEl = this.querySelector('#moduleNodeModalIndex');
    if (nameEl) nameEl.value = mod.name || '';
    if (typeEl) typeEl.value = mod.execution_type || 'webhook';
    if (urlTestEl) urlTestEl.value = mod.webhook_url_test || '';
    if (urlProdEl) urlProdEl.value = mod.webhook_url_prod || '';
    if (indexEl) indexEl.value = String(index);
    const modal = this.querySelector('#moduleNodeModal');
    if (modal) modal.style.display = 'flex';
  };

  P.closeModuleNodeModal = function () {
    const modal = this.querySelector('#moduleNodeModal');
    if (modal) modal.style.display = 'none';
    this._moduleNodeModalIndex = null;
  };

  P.saveModuleNodeModal = function () {
    const index = this._moduleNodeModalIndex;
    if (index == null || !this.flowModules[index]) return;
    const nameEl = this.querySelector('#moduleNodeModalName');
    const typeEl = this.querySelector('#moduleNodeModalExecutionType');
    const urlTestEl = this.querySelector('#moduleNodeModalUrlTest');
    const urlProdEl = this.querySelector('#moduleNodeModalUrlProd');
    this.flowModules[index].name = (nameEl && nameEl.value.trim()) || 'Módulo ' + (index + 1);
    this.flowModules[index].execution_type = (typeEl && typeEl.value) || 'webhook';
    this.flowModules[index].webhook_url_test = (urlTestEl && urlTestEl.value.trim()) || '';
    this.flowModules[index].webhook_url_prod = (urlProdEl && urlProdEl.value.trim()) || '';
    if (index === 0) {
      this.technicalDetails.webhook_url_test = this.flowModules[0].webhook_url_test;
      this.technicalDetails.webhook_url_prod = this.flowModules[0].webhook_url_prod;
    }
    this.closeModuleNodeModal();
    this.renderTechnicalModulesList();
    this.setupTechnicalModulesListeners();
    this.onFieldChange();
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
    const mapEl = this.querySelector('#modulesNodeMap');
    if (mapEl) {
      mapEl.querySelectorAll('.module-node').forEach(nodeEl => {
        const idx = parseInt(nodeEl.dataset.moduleIndex, 10);
        if (isNaN(idx)) return;
        nodeEl.addEventListener('dblclick', (e) => {
          if (e.target.closest('.module-node-remove')) return;
          this.openModuleNodeModal(idx);
        });
        const removeBtn = nodeEl.querySelector('.module-node-remove');
        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.stopPropagation();
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
      });
    }
    const modal = this.querySelector('#moduleNodeModal');
    const modalClose = this.querySelector('#moduleNodeModalClose');
    const modalCancel = this.querySelector('#moduleNodeModalCancel');
    const modalSave = this.querySelector('#moduleNodeModalSave');
    if (modalClose) modalClose.onclick = () => this.closeModuleNodeModal();
    if (modalCancel) modalCancel.onclick = () => this.closeModuleNodeModal();
    if (modalSave) modalSave.onclick = () => this.saveModuleNodeModal();
    if (modal && modal.querySelector('.modal-overlay')) {
      modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModuleNodeModal(); });
    } else if (modal) {
      modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModuleNodeModal(); });
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
