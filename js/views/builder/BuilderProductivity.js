/**
 * BuilderProductivity — Mixin for DevBuilderView (Fase 2A)
 * Provee: Auto-save con indicador, Undo/Redo (Ctrl+Z/Ctrl+Y), Command palette (Cmd+K), Panel Issues.
 *
 * Hook puntos:
 *   - initProductivity()   — llamado al final de init()
 *   - onStateMutated()     — llamado desde onFieldChange (debe ser barato; debouncea internamente)
 *   - destroy override     — flushea autosave pendiente y limpia listeners
 */
(function () {
  'use strict';
  if (typeof DevBuilderView === 'undefined') return;
  const P = DevBuilderView.prototype;

  // ------------------------------------------------------------------
  // 1. Estado interno (se inicializa en initProductivity)
  // ------------------------------------------------------------------
  const HISTORY_CAP = 50;
  const AUTOSAVE_DEBOUNCE_MS = 1500;
  const SNAPSHOT_DEBOUNCE_MS = 600;
  const ISSUES_DEBOUNCE_MS = 400;
  const AUTOSAVE_INTERVAL_REFRESH_MS = 30 * 1000;

  P.initProductivity = function () {
    if (this._productivityInitialized) return;
    this._productivityInitialized = true;

    // History
    this._historyStack = [];
    this._historyIndex = -1;
    this._isRestoringHistory = false;
    this._lastSnapshotHash = null;

    // Auto-save
    this._autosaveTimer = null;
    this._autosaveRefreshTimer = null;
    this._lastSavedAt = null;
    this._isAutoSaving = false;
    this._autosavePaused = false;

    // Issues
    this._issuesTimer = null;
    this._issuesCache = [];

    // Palette
    this._paletteSelectedIndex = 0;
    this._paletteResults = [];

    this.snapshotInitialState();
    this.setupProductivityListeners();
    this.refreshAutosaveIndicator();
    this.refreshHistoryButtons();
    this.recomputeIssues();
  };

  P.setupProductivityListeners = function () {
    // Footer buttons
    const undoBtn = this.querySelector('#builderUndoBtn');
    const redoBtn = this.querySelector('#builderRedoBtn');
    const issuesBtn = this.querySelector('#builderIssuesBtn');
    const issuesClose = this.querySelector('#issuesModalClose');
    if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
    if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
    if (issuesBtn) issuesBtn.addEventListener('click', () => this.openIssuesPanel());
    if (issuesClose) issuesClose.addEventListener('click', () => this.closeIssuesPanel());
    const issuesModal = this.querySelector('#issuesModal');
    if (issuesModal) {
      issuesModal.querySelector('.modal-overlay')?.addEventListener('click', () => this.closeIssuesPanel());
    }

    // Palette: keydown global Cmd/Ctrl+K  +  Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z  +  Ctrl+S
    const handler = (e) => this.handleProductivityKeydown(e);
    document.addEventListener('keydown', handler);
    this._documentListeners.push({ element: document, event: 'keydown', handler });

    // Palette internal
    const paletteInput = this.querySelector('#commandPaletteInput');
    const paletteResults = this.querySelector('#commandPaletteResults');
    if (paletteInput) {
      paletteInput.addEventListener('input', () => this.renderPaletteResults());
      paletteInput.addEventListener('keydown', (e) => this.handlePaletteKeydown(e));
    }
    if (paletteResults) {
      paletteResults.addEventListener('click', (e) => {
        const item = e.target.closest('[data-palette-index]');
        if (!item) return;
        const idx = parseInt(item.getAttribute('data-palette-index'), 10);
        this.selectPaletteResult(idx);
      });
    }
    const paletteModal = this.querySelector('#commandPaletteModal');
    if (paletteModal) {
      paletteModal.querySelector('.modal-overlay')?.addEventListener('click', () => this.closeCommandPalette());
    }

    // Refrescar indicador "Guardado hace Ns" cada 30s
    this._autosaveRefreshTimer = setInterval(() => this.refreshAutosaveIndicator(), AUTOSAVE_INTERVAL_REFRESH_MS);
  };

  // ------------------------------------------------------------------
  // 2. Hook desde onFieldChange (cualquier mutación de state)
  // ------------------------------------------------------------------
  P.onStateMutated = function () {
    if (this._isRestoringHistory) return;
    // Snapshot debounced para no saturar el stack con cada tecla
    clearTimeout(this._snapshotTimer);
    this._snapshotTimer = setTimeout(() => this.snapshotState(), SNAPSHOT_DEBOUNCE_MS);
    // Issues debounced
    clearTimeout(this._issuesTimer);
    this._issuesTimer = setTimeout(() => this.recomputeIssues(), ISSUES_DEBOUNCE_MS);
    // Auto-save debounced (solo si el flujo ya fue guardado al menos una vez)
    if (this.flowId && !this._autosavePaused) {
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.autoSave(), AUTOSAVE_DEBOUNCE_MS);
    }
  };

  // ------------------------------------------------------------------
  // 3. History (Undo/Redo)
  // ------------------------------------------------------------------
  P.captureState = function () {
    return {
      flowData: JSON.parse(JSON.stringify(this.flowData || {})),
      inputSchema: JSON.parse(JSON.stringify(this.inputSchema || [])),
      flowModules: JSON.parse(JSON.stringify(this.flowModules || [])),
      uiLayoutConfig: JSON.parse(JSON.stringify(this.uiLayoutConfig || {})),
      flowTechnicalDetailsByModule: JSON.parse(JSON.stringify(this.flowTechnicalDetailsByModule || {})),
      selectedFieldIndex: this.selectedFieldIndex
    };
  };

  P.hashState = function (state) {
    // Hash barato (longitud + char-sum) suficiente para detectar no-ops; no es criptográfico.
    try {
      const s = JSON.stringify(state);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return s.length + ':' + h;
    } catch (_) { return Math.random().toString(36); }
  };

  P.snapshotInitialState = function () {
    const s = this.captureState();
    this._historyStack = [s];
    this._historyIndex = 0;
    this._lastSnapshotHash = this.hashState(s);
  };

  P.snapshotState = function () {
    if (this._isRestoringHistory) return;
    const s = this.captureState();
    const h = this.hashState(s);
    if (h === this._lastSnapshotHash) return; // no cambió
    // Truncar la rama futura cuando se hace un cambio tras un undo
    if (this._historyIndex < this._historyStack.length - 1) {
      this._historyStack = this._historyStack.slice(0, this._historyIndex + 1);
    }
    this._historyStack.push(s);
    if (this._historyStack.length > HISTORY_CAP) {
      this._historyStack.shift();
    } else {
      this._historyIndex++;
    }
    this._lastSnapshotHash = h;
    this.refreshHistoryButtons();
  };

  P.applyState = function (state) {
    this._isRestoringHistory = true;
    try {
      this.flowData = JSON.parse(JSON.stringify(state.flowData));
      this.inputSchema = JSON.parse(JSON.stringify(state.inputSchema));
      this.flowModules = JSON.parse(JSON.stringify(state.flowModules));
      this.uiLayoutConfig = JSON.parse(JSON.stringify(state.uiLayoutConfig));
      this.flowTechnicalDetailsByModule = JSON.parse(JSON.stringify(state.flowTechnicalDetailsByModule));
      this.selectedFieldIndex = state.selectedFieldIndex;
      // Re-render todo lo afectado
      if (typeof this.populateForm === 'function') this.populateForm();
      if (typeof this.renderCanvas === 'function') this.renderCanvas();
      if (typeof this.renderPropertiesPanel === 'function') this.renderPropertiesPanel();
      if (typeof this.renderTechnicalModulesList === 'function') this.renderTechnicalModulesList();
      if (typeof this.setupTechnicalModulesListeners === 'function') this.setupTechnicalModulesListeners();
      if (typeof this.updateJsonPreview === 'function') this.updateJsonPreview();
      if (typeof this.renderFooter === 'function') this.renderFooter();
      if (typeof this.updateStatusBadge === 'function') this.updateStatusBadge();
      this.hasUnsavedChanges = true;
      this._lastSnapshotHash = this.hashState(state);
      this.recomputeIssues();
    } finally {
      this._isRestoringHistory = false;
    }
  };

  P.undo = function () {
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    this.applyState(this._historyStack[this._historyIndex]);
    this.refreshHistoryButtons();
  };

  P.redo = function () {
    if (this._historyIndex >= this._historyStack.length - 1) return;
    this._historyIndex++;
    this.applyState(this._historyStack[this._historyIndex]);
    this.refreshHistoryButtons();
  };

  P.refreshHistoryButtons = function () {
    const undoBtn = this.querySelector('#builderUndoBtn');
    const redoBtn = this.querySelector('#builderRedoBtn');
    if (undoBtn) undoBtn.disabled = this._historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = this._historyIndex >= this._historyStack.length - 1;
  };

  // ------------------------------------------------------------------
  // 4. Auto-save
  // ------------------------------------------------------------------
  P.autoSave = async function () {
    if (!this.flowId || !this.supabase || !this.userId) return;
    if (!this.hasUnsavedChanges) return;
    if (this._isAutoSaving) return;
    if (this._autosavePaused) return;
    if (!this.flowData.name || !this.flowData.name.trim()) return; // no autosave sin nombre

    // No autosaves si hay validación abierta (aria-invalid) en algún input → evita guardar JSON corrupto
    if (this.querySelector('[aria-invalid="true"]')) {
      this.scheduleAutosaveIndicator('paused');
      return;
    }

    this._isAutoSaving = true;
    this.scheduleAutosaveIndicator('saving');
    try {
      // Reusa la lógica existente de saveFlow (no muestra notificación para no spamear)
      this._suppressSaveToast = true;
      await this.saveFlow();
      this._lastSavedAt = Date.now();
      this.scheduleAutosaveIndicator('saved');
    } catch (err) {
      console.error('autosave failed:', err);
      this.scheduleAutosaveIndicator('error');
    } finally {
      this._suppressSaveToast = false;
      this._isAutoSaving = false;
    }
  };

  P.scheduleAutosaveIndicator = function (state) {
    const el = this.querySelector('#builderAutosaveIndicator');
    if (!el) return;
    el.hidden = false;
    el.classList.remove('builder-autosave--saving', 'builder-autosave--saved', 'builder-autosave--error', 'builder-autosave--paused');
    if (state === 'saving') {
      el.classList.add('builder-autosave--saving');
      el.textContent = 'Guardando…';
    } else if (state === 'saved') {
      el.classList.add('builder-autosave--saved');
      el.textContent = 'Guardado';
      setTimeout(() => this.refreshAutosaveIndicator(), 1200);
    } else if (state === 'error') {
      el.classList.add('builder-autosave--error');
      el.textContent = 'Error al guardar';
    } else if (state === 'paused') {
      el.classList.add('builder-autosave--paused');
      el.textContent = 'Pausado (errores)';
    }
  };

  P.refreshAutosaveIndicator = function () {
    if (this._isAutoSaving) return; // no machacar "Guardando…"
    const el = this.querySelector('#builderAutosaveIndicator');
    if (!el) return;
    if (!this._lastSavedAt) {
      el.hidden = true;
      return;
    }
    const diff = Math.max(0, Date.now() - this._lastSavedAt);
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    let label;
    if (s < 5) label = 'Guardado';
    else if (s < 60) label = `Guardado hace ${s}s`;
    else if (m < 60) label = `Guardado hace ${m}m`;
    else label = `Guardado hace ${Math.floor(m / 60)}h`;
    el.hidden = false;
    el.classList.remove('builder-autosave--saving', 'builder-autosave--error', 'builder-autosave--paused');
    el.classList.add('builder-autosave--saved');
    el.textContent = label;
  };

  // ------------------------------------------------------------------
  // 5. Command palette (Cmd/Ctrl + K)
  // ------------------------------------------------------------------
  P.openCommandPalette = function () {
    const modal = this.querySelector('#commandPaletteModal');
    const input = this.querySelector('#commandPaletteInput');
    if (!modal) return;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
    this._paletteSelectedIndex = 0;
    this.renderPaletteResults();
  };

  P.closeCommandPalette = function () {
    const modal = this.querySelector('#commandPaletteModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('hidden', '');
    }
  };

  P.renderPaletteResults = function () {
    const input = this.querySelector('#commandPaletteInput');
    const list = this.querySelector('#commandPaletteResults');
    if (!list) return;
    const q = ((input && input.value) || '').trim().toLowerCase();
    const fields = (this.inputSchema || []).map((f, i) => ({
      idx: i,
      label: f.label || f.key || '(sin label)',
      key: f.key || '',
      type: f.input_type || f.type || 'text',
      required: !!f.required
    }));
    let results;
    if (!q) {
      results = fields;
    } else {
      results = fields.filter(f =>
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q)
      );
    }
    this._paletteResults = results;
    if (this._paletteSelectedIndex >= results.length) this._paletteSelectedIndex = 0;
    if (results.length === 0) {
      list.innerHTML = `<div class="palette-empty"><i class="aisc-ico aisc-ico--search"></i> Sin resultados${q ? ' para "' + this.escapeHtml(q) + '"' : ''}.</div>`;
      return;
    }
    list.innerHTML = results.map((r, i) => `
      <div class="palette-item${i === this._paletteSelectedIndex ? ' palette-item--active' : ''}" data-palette-index="${i}" role="option" aria-selected="${i === this._paletteSelectedIndex}">
        <span class="palette-item-label">${this.escapeHtml(r.label)}</span>
        <span class="palette-item-meta">
          <code>${this.escapeHtml(r.key)}</code>
          <span class="palette-item-type">${this.escapeHtml(r.type)}</span>
          ${r.required ? '<span class="palette-item-required" title="Requerido">*</span>' : ''}
        </span>
      </div>
    `).join('');
  };

  P.handlePaletteKeydown = function (e) {
    const list = this._paletteResults || [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.length === 0) return;
      this._paletteSelectedIndex = (this._paletteSelectedIndex + 1) % list.length;
      this.renderPaletteResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length === 0) return;
      this._paletteSelectedIndex = (this._paletteSelectedIndex - 1 + list.length) % list.length;
      this.renderPaletteResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.selectPaletteResult(this._paletteSelectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.closeCommandPalette();
    }
  };

  P.selectPaletteResult = function (i) {
    const r = this._paletteResults[i];
    if (!r) return;
    this.closeCommandPalette();
    // Cambiar a tab Inputs y seleccionar el campo
    if (this.switchTab) this.switchTab('inputs');
    setTimeout(() => {
      this.selectedFieldIndex = r.idx;
      if (typeof this.renderCanvas === 'function') this.renderCanvas();
      if (typeof this.renderPropertiesPanel === 'function') this.renderPropertiesPanel();
      // Scroll into view
      const target = this.querySelector(`.canvas-field[data-index="${r.idx}"]`);
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  // ------------------------------------------------------------------
  // 6. Issues (validación en vivo)
  // ------------------------------------------------------------------
  P.computeIssues = function () {
    const issues = [];
    const fields = this.inputSchema || [];
    const keysSeen = new Map();
    const isUrl = (u) => /^https?:\/\/.+/.test(u);

    fields.forEach((f, i) => {
      const isStructural = ['section', 'divider', 'heading', 'description', 'description_block'].indexOf((f.input_type || f.type || '').toLowerCase()) >= 0;
      if (!f.key && !isStructural) {
        issues.push({ severity: 'error', area: 'inputs', fieldIndex: i, message: 'Campo #' + (i + 1) + ' no tiene key.' });
      }
      if (f.key) {
        if (!/^[a-z_][a-z0-9_]*$/.test(f.key)) {
          issues.push({ severity: 'error', area: 'inputs', fieldIndex: i, message: `«${f.key}» no es una key válida (debe iniciar con letra o _).` });
        }
        if (keysSeen.has(f.key)) {
          issues.push({ severity: 'error', area: 'inputs', fieldIndex: i, message: `Key duplicada «${f.key}» (también en campo #${keysSeen.get(f.key) + 1}).` });
        } else {
          keysSeen.set(f.key, i);
        }
      }
      if (!isStructural && !f.label) {
        issues.push({ severity: 'warning', area: 'inputs', fieldIndex: i, message: `Campo «${f.key || '#' + (i + 1)}» sin label.` });
      }
      const optsBasedTypes = ['dropdown', 'select', 'radio', 'checkboxes', 'selection_checkboxes', 'multi_select_chips', 'choice_chips'];
      const t = (f.input_type || f.type || '').toLowerCase();
      if (optsBasedTypes.indexOf(t) >= 0) {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          issues.push({ severity: 'warning', area: 'inputs', fieldIndex: i, message: `«${f.label || f.key}» (${t}) no tiene opciones.` });
        } else {
          f.options.forEach((opt, oi) => {
            const v = opt && (opt.value !== undefined ? opt.value : opt.label !== undefined ? opt.label : opt);
            if (v === '' || v == null) {
              issues.push({ severity: 'warning', area: 'inputs', fieldIndex: i, message: `«${f.label || f.key}»: opción #${oi + 1} vacía.` });
            }
          });
        }
      }
    });

    // Módulos
    const mods = this.flowModules || [];
    mods.forEach((m, i) => {
      if (!m.name || !m.name.trim()) {
        issues.push({ severity: 'warning', area: 'modules', moduleIndex: i, message: `Módulo #${i + 1} sin nombre.` });
      }
      const execType = m.execution_type || 'webhook';
      if (execType === 'webhook') {
        if (!m.webhook_url_prod && !m.webhook_url_test) {
          issues.push({ severity: 'warning', area: 'modules', moduleIndex: i, message: `Módulo #${i + 1}: sin webhook configurado.` });
        }
        if (m.webhook_url_prod && !isUrl(m.webhook_url_prod)) {
          issues.push({ severity: 'error', area: 'modules', moduleIndex: i, message: `Módulo #${i + 1}: URL prod no válida.` });
        }
        if (m.webhook_url_test && !isUrl(m.webhook_url_test)) {
          issues.push({ severity: 'error', area: 'modules', moduleIndex: i, message: `Módulo #${i + 1}: URL test no válida.` });
        }
      }
    });

    // Flujo
    if (!this.flowData.name || !this.flowData.name.trim()) {
      issues.push({ severity: 'error', area: 'settings', message: 'El flujo no tiene nombre.' });
    }
    if (this.flowData.flow_category_type === 'manual' && fields.length === 0) {
      issues.push({ severity: 'warning', area: 'inputs', message: 'Un flujo manual no tiene campos de entrada.' });
    }

    return issues;
  };

  P.recomputeIssues = function () {
    if (!this._productivityInitialized) return;
    this._issuesCache = this.computeIssues();
    const badge = this.querySelector('#builderIssuesCount');
    const btn = this.querySelector('#builderIssuesBtn');
    if (badge) {
      const n = this._issuesCache.length;
      if (n > 0) {
        badge.hidden = false;
        badge.textContent = String(n);
      } else {
        badge.hidden = true;
      }
    }
    if (btn) {
      btn.classList.toggle('builder-issues-btn--has-errors', this._issuesCache.some(i => i.severity === 'error'));
      btn.classList.toggle('builder-issues-btn--has-warnings', this._issuesCache.some(i => i.severity === 'warning'));
    }
    // Si el panel está abierto, re-renderizar
    const modal = this.querySelector('#issuesModal');
    if (modal && modal.style.display === 'flex') this.renderIssuesList();
  };

  P.openIssuesPanel = function () {
    const modal = this.querySelector('#issuesModal');
    if (!modal) return;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    this.renderIssuesList();
  };

  P.closeIssuesPanel = function () {
    const modal = this.querySelector('#issuesModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('hidden', '');
    }
  };

  P.renderIssuesList = function () {
    const list = this.querySelector('#issuesList');
    if (!list) return;
    const items = this._issuesCache || [];
    if (items.length === 0) {
      list.innerHTML = '<p class="issues-empty"><i class="aisc-ico aisc-ico--check"></i> Sin problemas detectados.</p>';
      return;
    }
    list.innerHTML = items.map((it, i) => {
      const iconCls = it.severity === 'error' ? 'ph-x-circle' : 'ph-warning';
      const sevCls = it.severity === 'error' ? 'issue-item--error' : 'issue-item--warning';
      const areaLabel = it.area === 'inputs' ? 'Inputs' : it.area === 'modules' ? 'Módulos' : 'Configuración';
      const action = (it.fieldIndex != null || it.moduleIndex != null)
        ? `<button type="button" class="issue-goto" data-issue-index="${i}">Ir →</button>` : '';
      return `
        <div class="issue-item ${sevCls}">
          <i class="ph ${iconCls}"></i>
          <div class="issue-item-body">
            <span class="issue-area">${areaLabel}</span>
            <span class="issue-message">${this.escapeHtml(it.message)}</span>
          </div>
          ${action}
        </div>
      `;
    }).join('');
    list.querySelectorAll('.issue-goto').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-issue-index'), 10);
        const it = this._issuesCache[idx];
        if (!it) return;
        this.closeIssuesPanel();
        if (it.area === 'inputs' && it.fieldIndex != null) {
          if (this.switchTab) this.switchTab('inputs');
          setTimeout(() => {
            this.selectedFieldIndex = it.fieldIndex;
            if (typeof this.renderCanvas === 'function') this.renderCanvas();
            if (typeof this.renderPropertiesPanel === 'function') this.renderPropertiesPanel();
            const t = this.querySelector(`.canvas-field[data-index="${it.fieldIndex}"]`);
            if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        } else if (it.area === 'modules' && it.moduleIndex != null) {
          if (this.switchTab) this.switchTab('technical');
          setTimeout(() => {
            if (typeof this.openModuleNodeModal === 'function') this.openModuleNodeModal(it.moduleIndex);
          }, 80);
        } else if (it.area === 'settings') {
          if (this.switchTab) this.switchTab('settings');
          setTimeout(() => { this.querySelector('#flowNameConfig')?.focus(); }, 80);
        }
      });
    });
  };

  // ------------------------------------------------------------------
  // 7. Atajos de teclado (Cmd+K, Cmd+Z, Cmd+Y, Cmd+S)
  // ------------------------------------------------------------------
  P.handleProductivityKeydown = function (e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = (e.key || '').toLowerCase();
    // Cmd+K: command palette
    if (k === 'k') {
      e.preventDefault();
      this.openCommandPalette();
      return;
    }
    // Cmd+S: save
    if (k === 's') {
      e.preventDefault();
      if (typeof this.saveFlow === 'function') this.saveFlow();
      return;
    }
    // Cmd+Z (undo), Cmd+Shift+Z o Cmd+Y (redo)
    if (k === 'z' && !e.shiftKey) {
      // No interferir si el usuario está editando texto y quiere undo nativo de la caja
      const t = document.activeElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      this.undo();
      return;
    }
    if ((k === 'z' && e.shiftKey) || k === 'y') {
      const t = document.activeElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      this.redo();
      return;
    }
  };

  // ------------------------------------------------------------------
  // 8. Override destroy: limpiar timers
  // ------------------------------------------------------------------
  const _origDestroy = P.destroy;
  P.destroy = function () {
    clearTimeout(this._autosaveTimer);
    clearTimeout(this._snapshotTimer);
    clearTimeout(this._issuesTimer);
    clearInterval(this._autosaveRefreshTimer);
    if (typeof _origDestroy === 'function') _origDestroy.call(this);
  };

  // ------------------------------------------------------------------
  // 9. Suppress save toast for autosave (wrap showNotification once)
  // ------------------------------------------------------------------
  const _origNotify = P.showNotification;
  P.showNotification = function (msg, type) {
    if (this._suppressSaveToast && type === 'success' && msg === 'Flujo guardado correctamente') return;
    if (typeof _origNotify === 'function') return _origNotify.call(this, msg, type);
  };
})();
