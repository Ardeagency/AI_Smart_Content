/**
 * BuilderAdvanced — Mixin for DevBuilderView (Fase 2B)
 * Provee:
 *   - Module sandbox: ejecuta UN módulo aislado con un payload arbitrario
 *   - Variables picker: inserta {{ $modulo.output.x }} desde un dropdown
 *
 * Depende de: FlowWebhookService para el sandbox.
 */
(function () {
  'use strict';
  if (typeof DevBuilderView === 'undefined') return;
  const P = DevBuilderView.prototype;

  // ==================================================================
  // 1. Module Sandbox
  // ==================================================================
  P.openModuleSandbox = function (moduleIndex) {
    const mod = this.flowModules[moduleIndex];
    if (!mod) return;
    if (!this.flowId) {
      this.showNotification('Guarda el flujo antes de probar un módulo', 'warning');
      return;
    }
    const modal = this.querySelector('#moduleSandboxModal');
    const nameEl = this.querySelector('#sandboxTargetName');
    const metaEl = this.querySelector('#sandboxTargetMeta');
    const envEl = this.querySelector('#sandboxEnvSelect');
    const inputEl = this.querySelector('#sandboxInput');
    const resultSection = this.querySelector('#sandboxResultSection');

    if (!modal) return;
    this._sandboxModuleIndex = moduleIndex;

    if (nameEl) nameEl.textContent = mod.name || `Módulo ${moduleIndex + 1}`;
    if (metaEl) {
      const execType = mod.execution_type || 'webhook';
      const url = mod.webhook_url_test || mod.webhook_url_prod || '—';
      metaEl.textContent = `${execType} · ${url}`;
    }
    if (envEl) {
      // Pre-seleccionar el entorno disponible
      envEl.value = mod.webhook_url_test ? 'test' : (mod.webhook_url_prod ? 'prod' : 'test');
    }
    if (inputEl) {
      inputEl.value = this._sandboxLastInput || '{\n  "inputs": {}\n}';
      inputEl.removeAttribute('aria-invalid');
    }
    if (resultSection) resultSection.hidden = true;

    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    this.setupSandboxListeners();
  };

  P.setupSandboxListeners = function () {
    if (this._sandboxListenersWired) return;
    this._sandboxListenersWired = true;

    const close = this.querySelector('#moduleSandboxClose');
    const cancel = this.querySelector('#sandboxCancelBtn');
    const runBtn = this.querySelector('#sandboxRunBtn');
    const fillDefaults = this.querySelector('#sandboxFillFromInputs');
    const fillEmpty = this.querySelector('#sandboxFillEmpty');
    const modal = this.querySelector('#moduleSandboxModal');

    const closeSandbox = () => {
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('hidden', '');
      }
    };
    if (close) close.addEventListener('click', closeSandbox);
    if (cancel) cancel.addEventListener('click', closeSandbox);
    if (modal) modal.querySelector('.modal-overlay')?.addEventListener('click', closeSandbox);

    if (runBtn) runBtn.addEventListener('click', () => this.runModuleSandbox());

    if (fillDefaults) fillDefaults.addEventListener('click', () => {
      const inputEl = this.querySelector('#sandboxInput');
      if (!inputEl) return;
      const payload = { inputs: this.buildDefaultsFromSchema() };
      inputEl.value = JSON.stringify(payload, null, 2);
      inputEl.removeAttribute('aria-invalid');
    });
    if (fillEmpty) fillEmpty.addEventListener('click', () => {
      const inputEl = this.querySelector('#sandboxInput');
      if (inputEl) {
        inputEl.value = '{\n  "inputs": {}\n}';
        inputEl.removeAttribute('aria-invalid');
      }
    });
  };

  /** Construye un objeto de defaults a partir del inputSchema (solo campos con defaultValue definido). */
  P.buildDefaultsFromSchema = function () {
    const out = {};
    (this.inputSchema || []).forEach(f => {
      if (!f.key) return;
      const isStructural = ['section', 'divider', 'heading', 'description', 'description_block'].indexOf((f.input_type || f.type || '').toLowerCase()) >= 0;
      if (isStructural) return;
      if (f.defaultValue !== undefined && f.defaultValue !== null) {
        out[f.key] = f.defaultValue;
      } else {
        // Valor placeholder según tipo
        const t = (f.input_type || f.type || 'text').toLowerCase();
        if (t === 'number' || t === 'range' || t === 'num_stepper' || t === 'stepper_num') out[f.key] = 0;
        else if (t === 'checkbox' || t === 'switch' || t === 'toggle_switch' || t === 'boolean') out[f.key] = false;
        else if (t === 'selection_checkboxes' || t === 'multi_select_chips' || t === 'colores' || t === 'tags') out[f.key] = [];
        else out[f.key] = '';
      }
    });
    return out;
  };

  P.runModuleSandbox = async function () {
    const moduleIndex = this._sandboxModuleIndex;
    const mod = this.flowModules[moduleIndex];
    if (!mod) return;
    const envEl = this.querySelector('#sandboxEnvSelect');
    const inputEl = this.querySelector('#sandboxInput');
    const resultSection = this.querySelector('#sandboxResultSection');
    const outputEl = this.querySelector('#sandboxOutput');
    const statusEl = this.querySelector('#sandboxStatus');
    const durationEl = this.querySelector('#sandboxDuration');
    const runBtn = this.querySelector('#sandboxRunBtn');

    if (!inputEl) return;
    const env = (envEl && envEl.value) || 'test';
    const url = env === 'prod' ? mod.webhook_url_prod : mod.webhook_url_test;
    if (!url) {
      this.showNotification(`El módulo no tiene URL ${env}`, 'warning');
      return;
    }

    // Parsear payload
    let payload;
    try {
      payload = JSON.parse(inputEl.value || '{}');
      inputEl.removeAttribute('aria-invalid');
    } catch (err) {
      inputEl.setAttribute('aria-invalid', 'true');
      this.showNotification('Payload no es JSON válido', 'error');
      return;
    }
    this._sandboxLastInput = inputEl.value;

    // Enriquecer con metadata estándar del flow
    const enriched = {
      ...payload,
      test_mode: true,
      sandbox_mode: true,
      flow_id: this.flowId,
      flow_module_id: mod.id || null,
      step_order: mod.step_order || (moduleIndex + 1),
      timestamp: new Date().toISOString()
    };

    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<i class="aisc-ico ph-spin aisc-ico--loader"></i> Ejecutando...';
    }
    if (resultSection) resultSection.hidden = false;
    if (statusEl) { statusEl.className = 'sandbox-status sandbox-status--running'; statusEl.textContent = 'corriendo…'; }
    if (durationEl) durationEl.textContent = '';
    if (outputEl) outputEl.textContent = '';

    const t0 = performance.now();
    try {
      const Service = window.FlowWebhookService;
      let response;
      const methodMap = this.flowTechnicalDetailsByModule[mod.id]?.webhook_method
        || this.technicalDetails.webhook_method
        || 'POST';

      if (Service && Service.executeWebhook) {
        const res = await Service.executeWebhook({
          url,
          method: methodMap,
          body: enriched,
          timeoutMs: 120000,
          maxRetries: 1
        });
        response = { ok: res.ok, status: res.status, statusText: res.statusText, data: res.data, error: res.error };
      } else {
        const r = await fetch(url, {
          method: methodMap,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enriched)
        });
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('application/json') ? await r.json() : await r.text();
        response = { ok: r.ok, status: r.status, statusText: r.statusText, data: body };
      }

      const elapsed = Math.round(performance.now() - t0);
      if (durationEl) durationEl.textContent = `${elapsed} ms`;
      if (statusEl) {
        statusEl.className = `sandbox-status sandbox-status--${response.ok ? 'ok' : 'error'}`;
        statusEl.textContent = `${response.status || '—'} ${response.statusText || ''}`.trim();
      }
      if (outputEl) {
        const display = {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          ...(response.error ? { error: response.error } : {})
        };
        outputEl.textContent = JSON.stringify(display, null, 2);
      }

      // Si el response es OK y el módulo no tiene output_schema, sugerir derivarlo
      if (response.ok && response.data && typeof response.data === 'object' && !mod.output_schema && this.inferOutputSchemaFromData) {
        const inferred = this.inferOutputSchemaFromData(response.data);
        if (inferred && inferred.properties) {
          mod._inferredOutputSchema = inferred;
          this.showNotification('Sugerencia: schema de output inferido (guarda el módulo para conservarlo)', 'info');
          // Auto-populate solo si el field del modal está abierto y vacío
          const outputSchemaEl = this.querySelector('#moduleNodeModalOutputSchema');
          if (outputSchemaEl && !outputSchemaEl.value.trim()) {
            outputSchemaEl.value = JSON.stringify(inferred, null, 2);
          }
        }
      }
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0);
      if (durationEl) durationEl.textContent = `${elapsed} ms`;
      if (statusEl) { statusEl.className = 'sandbox-status sandbox-status--error'; statusEl.textContent = 'error de red'; }
      if (outputEl) outputEl.textContent = JSON.stringify({ error: err.message || String(err) }, null, 2);
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<i class="aisc-ico aisc-ico--play"></i> Ejecutar';
      }
    }
  };

  /** Infiere un JSON Schema mínimo del shape de un objeto/array (1 nivel + recursión a propiedades object). */
  P.inferOutputSchemaFromData = function (data) {
    if (data == null) return { type: 'null' };
    if (Array.isArray(data)) {
      const sample = data.length > 0 ? data[0] : null;
      return { type: 'array', items: sample != null ? this.inferOutputSchemaFromData(sample) : {} };
    }
    if (typeof data === 'object') {
      const properties = {};
      Object.keys(data).forEach(k => { properties[k] = this.inferOutputSchemaFromData(data[k]); });
      return { type: 'object', properties };
    }
    return { type: typeof data };
  };

  // ==================================================================
  // 2. Variables picker {{ $moduloN.output.x }}
  // ==================================================================
  /**
   * Abre el modal con la lista de variables disponibles.
   * @param {object} opts - { targetId: id del input destino, beforeIndex: solo módulos con step_order < beforeIndex }
   */
  P.openVariablesPicker = function (opts) {
    const targetId = (opts && opts.targetId) || null;
    const beforeIndex = (opts && opts.beforeIndex != null) ? opts.beforeIndex : this.flowModules.length;
    this._variablesTargetId = targetId;
    this._variablesBeforeIndex = beforeIndex;

    const modal = this.querySelector('#variablesModal');
    const searchEl = this.querySelector('#variablesSearch');
    if (!modal) return;

    this._variablesAvailable = this.buildAvailableVariables(beforeIndex);
    if (searchEl) {
      searchEl.value = '';
      setTimeout(() => searchEl.focus(), 50);
    }
    this.renderVariablesList();
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    this.setupVariablesListeners();
  };

  P.setupVariablesListeners = function () {
    if (this._variablesListenersWired) return;
    this._variablesListenersWired = true;
    const close = this.querySelector('#variablesClose');
    const modal = this.querySelector('#variablesModal');
    const search = this.querySelector('#variablesSearch');
    const list = this.querySelector('#variablesList');
    const closeFn = () => {
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('hidden', '');
      }
    };
    if (close) close.addEventListener('click', closeFn);
    if (modal) modal.querySelector('.modal-overlay')?.addEventListener('click', closeFn);
    if (search) search.addEventListener('input', () => this.renderVariablesList());
    if (list) list.addEventListener('click', (e) => {
      const item = e.target.closest('[data-variable-token]');
      if (!item) return;
      this.insertVariable(item.getAttribute('data-variable-token'));
      closeFn();
    });
  };

  /**
   * Devuelve [{ token, source, label, type }] de:
   *   - inputs del formulario (this.inputSchema)
   *   - outputs de módulos anteriores (modulos con step_order < beforeIndex y output_schema definido)
   */
  P.buildAvailableVariables = function (beforeIndex) {
    const out = [];
    // 1) Inputs del formulario: {{ $input.<key> }}
    (this.inputSchema || []).forEach(f => {
      const isStructural = ['section', 'divider', 'heading', 'description', 'description_block'].indexOf((f.input_type || f.type || '').toLowerCase()) >= 0;
      if (isStructural || !f.key) return;
      out.push({
        token: `{{ $input.${f.key} }}`,
        source: 'input',
        label: f.label || f.key,
        type: f.input_type || f.type || 'text',
        path: f.key
      });
    });
    // 2) Outputs de módulos anteriores
    (this.flowModules || []).forEach((m, i) => {
      if (i >= beforeIndex) return; // solo módulos anteriores
      const moduleRef = m.name ? m.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : `modulo_${i + 1}`;
      const outputSchema = m.output_schema || m._inferredOutputSchema;
      if (!outputSchema || !outputSchema.properties) {
        // Variable raíz sin shape conocido
        out.push({
          token: `{{ $${moduleRef}.output }}`,
          source: 'module',
          label: `${m.name || 'Módulo ' + (i + 1)} (output completo)`,
          type: 'object',
          moduleIndex: i
        });
        return;
      }
      // Variables por property
      Object.keys(outputSchema.properties).forEach(propKey => {
        const propDef = outputSchema.properties[propKey] || {};
        out.push({
          token: `{{ $${moduleRef}.output.${propKey} }}`,
          source: 'module',
          label: `${m.name || 'Módulo ' + (i + 1)} → ${propKey}`,
          type: propDef.type || 'unknown',
          moduleIndex: i
        });
      });
    });
    return out;
  };

  P.renderVariablesList = function () {
    const search = this.querySelector('#variablesSearch');
    const list = this.querySelector('#variablesList');
    if (!list) return;
    const q = ((search && search.value) || '').trim().toLowerCase();
    const items = (this._variablesAvailable || []).filter(v => {
      if (!q) return true;
      return v.token.toLowerCase().includes(q) || v.label.toLowerCase().includes(q);
    });
    if (items.length === 0) {
      list.innerHTML = `<p class="variables-empty"><i class="aisc-ico aisc-ico--alert-info"></i> Sin variables disponibles${q ? ' para "' + this.escapeHtml(q) + '"' : ''}.</p>`;
      return;
    }
    // Agrupar por source
    const byGroup = { input: [], module: [] };
    items.forEach(v => byGroup[v.source].push(v));
    const renderGroup = (title, arr) => {
      if (arr.length === 0) return '';
      return `
        <div class="variables-group">
          <div class="variables-group-title">${title}</div>
          ${arr.map(v => `
            <div class="variable-item" data-variable-token="${this.escapeHtml(v.token)}" role="button" tabindex="0">
              <code class="variable-token">${this.escapeHtml(v.token)}</code>
              <span class="variable-meta">
                <span class="variable-label">${this.escapeHtml(v.label)}</span>
                <span class="variable-type">${this.escapeHtml(v.type)}</span>
              </span>
            </div>
          `).join('')}
        </div>
      `;
    };
    list.innerHTML = renderGroup('Inputs del formulario', byGroup.input) + renderGroup('Outputs de módulos previos', byGroup.module);
  };

  P.insertVariable = function (token) {
    const targetId = this._variablesTargetId;
    if (!targetId) return;
    const el = this.querySelector(`#${targetId}`);
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || start;
    const before = (el.value || '').slice(0, start);
    const after = (el.value || '').slice(end);
    el.value = before + token + after;
    const newPos = start + token.length;
    if (typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(newPos, newPos);
    }
    el.focus();
    // Dispatch input event para que cualquier listener consuma el cambio
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // ==================================================================
  // 3. Drag & drop tipo n8n: panel de outputs disponibles + drop en inputs
  // ==================================================================
  /**
   * Renderiza el panel "Outputs disponibles" dentro del sidebar del módulo:
   * chips draggables (uno por property de cada output_schema de módulos
   * anteriores). El usuario arrastra un chip a cualquier input/textarea
   * del panel para insertar la expression {{ $modulo.output.x }}.
   */
  P.renderModuleNodeDragVars = function (index) {
    const panel = this.querySelector('#moduleNodeDragVarsPanel');
    const list = this.querySelector('#moduleNodeDragVarsList');
    if (!panel || !list) return;

    const vars = this.buildAvailableVariables(index);
    // Solo los outputs de módulos anteriores (el input del formulario no aplica aquí)
    const moduleVars = vars.filter(v => v.source === 'module');

    if (moduleVars.length === 0) {
      panel.setAttribute('hidden', '');
      list.innerHTML = '';
      return;
    }
    panel.removeAttribute('hidden');

    // Agrupar por moduleIndex (cada bloque = un módulo anterior con sus props)
    const byModule = new Map();
    moduleVars.forEach(v => {
      const key = v.moduleIndex;
      if (!byModule.has(key)) byModule.set(key, []);
      byModule.get(key).push(v);
    });

    const parts = [];
    byModule.forEach((items, modIdx) => {
      const m = (this.flowModules || [])[modIdx];
      const name = (m && m.name) ? m.name : `Módulo ${modIdx + 1}`;
      const chips = items.map(v => {
        const propName = (v.label.includes('→') ? v.label.split('→').pop() : v.label).trim();
        return `
          <div class="drag-var-chip" draggable="true" data-token="${this.escapeHtml(v.token)}" title="${this.escapeHtml(v.token)}">
            <span class="drag-var-chip-label">${this.escapeHtml(propName)}</span>
            <span class="drag-var-chip-type">${this.escapeHtml(v.type)}</span>
          </div>
        `;
      }).join('');
      parts.push(`
        <div class="drag-vars-group">
          <div class="drag-vars-group-title">${this.escapeHtml(name)}</div>
          <div class="drag-vars-chips">${chips}</div>
        </div>
      `);
    });
    list.innerHTML = parts.join('');
  };

  P.setupModuleNodeDragVarsListeners = function () {
    const list = this.querySelector('#moduleNodeDragVarsList');
    if (!list) return;

    list.querySelectorAll('.drag-var-chip').forEach(chip => {
      chip.ondragstart = (e) => {
        const token = chip.getAttribute('data-token') || '';
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', token);
          e.dataTransfer.effectAllowed = 'copy';
        }
        chip.classList.add('is-dragging');
        // Resalta los drop targets en el panel mientras dura el drag
        this.querySelectorAll('#moduleNodeModal input[type="url"], #moduleNodeModal input[type="text"], #moduleNodeModal textarea').forEach(t => {
          t.classList.add('drop-target-hint');
        });
      };
      chip.ondragend = () => {
        chip.classList.remove('is-dragging');
        this.querySelectorAll('#moduleNodeModal .drop-target-hint, #moduleNodeModal .drop-target-active').forEach(t => {
          t.classList.remove('drop-target-hint');
          t.classList.remove('drop-target-active');
        });
      };
    });

    // Drop targets: cualquier input de texto/url y textarea dentro del modal del módulo
    const targets = this.querySelectorAll('#moduleNodeModal input[type="url"], #moduleNodeModal input[type="text"], #moduleNodeModal textarea');
    targets.forEach(target => {
      target.ondragover = (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        target.classList.add('drop-target-active');
      };
      target.ondragleave = () => target.classList.remove('drop-target-active');
      target.ondrop = (e) => {
        e.preventDefault();
        target.classList.remove('drop-target-active');
        const token = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
        if (!token) return;
        const start = target.selectionStart || 0;
        const end = target.selectionEnd || start;
        const before = (target.value || '').slice(0, start);
        const after = (target.value || '').slice(end);
        target.value = before + token + after;
        const pos = before.length + token.length;
        if (typeof target.setSelectionRange === 'function') target.setSelectionRange(pos, pos);
        target.focus();
        target.dispatchEvent(new Event('input', { bubbles: true }));
      };
    });
  };
})();
