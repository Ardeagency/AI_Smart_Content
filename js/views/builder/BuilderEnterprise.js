/**
 * BuilderEnterprise — Mixin for DevBuilderView (Fase 4)
 * Provee:
 *   - Versionado (flow_revisions): crear snapshot al save, listar, restaurar
 *   - Audit log (user_audit_log): registrar eventos críticos (save, publish, unpublish, restore)
 *   - Cost estimator: estimación de créditos por ejecución según componentes del flow
 *   - Webhook signature secret (HMAC-SHA256) en flow_technical_details
 */
(function () {
  'use strict';
  if (typeof DevBuilderView === 'undefined') return;
  const P = DevBuilderView.prototype;

  // ==================================================================
  // 1. Versionado
  // ==================================================================
  P.openVersionsPanel = async function () {
    const modal = this.querySelector('#versionsModal');
    if (!modal) return;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    await this.loadVersionsList();
    this.setupVersionsListeners();
  };

  P.closeVersionsPanel = function () {
    const modal = this.querySelector('#versionsModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('hidden', '');
    }
  };

  P.setupVersionsListeners = function () {
    if (this._versionsListenersWired) return;
    this._versionsListenersWired = true;
    const close = this.querySelector('#versionsClose');
    const modal = this.querySelector('#versionsModal');
    if (close) close.addEventListener('click', () => this.closeVersionsPanel());
    if (modal) modal.querySelector('.modal-overlay')?.addEventListener('click', () => this.closeVersionsPanel());
  };

  P.loadVersionsList = async function () {
    const list = this.querySelector('#versionsList');
    if (!list) return;
    if (!this.supabase || !this.flowId) {
      list.innerHTML = '<p class="versions-empty">Guarda el flujo primero para ver versiones.</p>';
      return;
    }
    list.innerHTML = '<p class="versions-empty">Cargando…</p>';
    try {
      const { data, error } = await this.supabase
        .from('flow_revisions')
        .select('id, version_label, author_id, change_summary, created_at')
        .eq('content_flow_id', this.flowId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) {
        list.innerHTML = '<p class="versions-empty">Aún no hay revisiones. Cada save crea una automáticamente.</p>';
        return;
      }
      list.innerHTML = data.map(r => `
        <div class="version-item" data-rev-id="${this.escapeHtml(r.id)}">
          <div class="version-meta">
            <strong class="version-label">${this.escapeHtml(r.version_label)}</strong>
            <span class="version-date">${this.formatRelative(r.created_at)}</span>
          </div>
          ${r.change_summary ? `<p class="version-summary">${this.escapeHtml(r.change_summary)}</p>` : ''}
          <div class="version-actions">
            <button type="button" class="btn-small btn-ghost btn-version-restore" data-rev-id="${this.escapeHtml(r.id)}"><i class="aisc-ico aisc-ico--refresh"></i> Restaurar</button>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('.btn-version-restore').forEach(btn => {
        btn.addEventListener('click', () => this.restoreRevision(btn.getAttribute('data-rev-id')));
      });
    } catch (err) {
      console.error('Error loading revisions:', err);
      list.innerHTML = '<p class="versions-empty">Error al cargar versiones.</p>';
    }
  };

  P.formatRelative = function (iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'hace segundos';
    if (m < 60) return `hace ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d}d`;
    return new Date(iso).toLocaleDateString();
  };

  P.restoreRevision = async function (revisionId) {
    if (!confirm('Esta acción reemplazará el contenido actual con el de esta versión. Se creará una nueva revisión con el estado actual antes de restaurar. ¿Continuar?')) return;
    try {
      // 1) Guardar revisión del estado actual antes de restaurar
      await this.createRevision('Antes de restaurar');
      // 2) Cargar snapshot de la revisión seleccionada
      const { data: rev, error } = await this.supabase
        .from('flow_revisions')
        .select('snapshot')
        .eq('id', revisionId)
        .single();
      if (error) throw error;
      const snapshot = rev.snapshot || {};
      // Aplicar snapshot al state in-memory
      if (snapshot.flow) {
        const f = snapshot.flow;
        Object.assign(this.flowData, {
          name: f.name,
          description: f.description || '',
          category_id: f.category_id,
          subcategory_id: f.subcategory_id || null,
          output_type: f.output_type || 'text',
          flow_category_type: f.flow_category_type || 'manual',
          token_cost: f.token_cost || 1,
          flow_image_url: f.flow_image_url,
          version: f.version || '1.0.0',
          execution_mode: f.execution_mode || 'single_step',
          show_in_catalog: !!f.show_in_catalog
        });
      }
      if (Array.isArray(snapshot.modules)) {
        this.flowModules = snapshot.modules.map(m => ({
          id: null, // forzar reinsert al guardar (los IDs anteriores se descartan)
          name: m.name || '',
          step_order: m.step_order,
          execution_type: m.execution_type || 'webhook',
          webhook_url_test: m.webhook_url_test || '',
          webhook_url_prod: m.webhook_url_prod || '',
          input_schema: m.input_schema || {},
          output_schema: m.output_schema || null,
          is_human_approval_required: !!m.is_human_approval_required,
          next_module_id: null,
          routing_rules: m.routing_rules || null
        }));
        // input_schema del primer módulo → this.inputSchema
        const first = snapshot.modules[0];
        if (first?.input_schema?.fields) this.inputSchema = first.input_schema.fields;
        else if (Array.isArray(first?.input_schema)) this.inputSchema = first.input_schema;
      }
      this.hasUnsavedChanges = true;
      if (typeof this.populateForm === 'function') this.populateForm();
      if (typeof this.applyFlowTypeUI === 'function') this.applyFlowTypeUI();
      if (typeof this.renderCanvas === 'function') this.renderCanvas();
      if (typeof this.renderTechnicalModulesList === 'function') this.renderTechnicalModulesList();
      if (typeof this.setupTechnicalModulesListeners === 'function') this.setupTechnicalModulesListeners();
      this.closeVersionsPanel();
      this.showNotification('Versión restaurada. Guarda para confirmar.', 'success');
      this.logAuditEvent('flow.revision.restored', { revision_id: revisionId });
    } catch (err) {
      console.error('Error restoring revision:', err);
      this.showNotification('Error al restaurar la versión', 'error');
    }
  };

  P.createRevision = async function (summary) {
    if (!this.supabase || !this.flowId) return null;
    try {
      const { data, error } = await this.supabase.rpc('create_flow_revision', {
        p_flow_id: this.flowId,
        p_label: this.flowData.version || '1.0.0',
        p_summary: summary || null
      });
      if (error) {
        console.warn('Snapshot no creado:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Snapshot no creado:', err);
      return null;
    }
  };

  // ==================================================================
  // 2. Audit log (user_audit_log)
  // ==================================================================
  P.logAuditEvent = async function (action, metadata) {
    if (!this.supabase || !this.userId) return;
    try {
      // Tabla creada por security baseline; columnas asumidas: user_id, action, resource_type, resource_id, metadata
      await this.supabase.from('user_audit_log').insert({
        user_id: this.userId,
        action,
        resource_type: 'content_flow',
        resource_id: this.flowId,
        metadata: metadata || {}
      });
    } catch (err) {
      // No queremos romper el flow si el audit log falla
      console.warn('Audit log skipped:', err?.message || err);
    }
  };

  // ==================================================================
  // 3. Cost estimator
  // ==================================================================
  P.estimateExecutionCost = function () {
    // Heurística: cada componente tipado contribuye un peso
    const weights = {
      llm: 3,           // prompt_input, prompt_system, textarea (largo)
      image_gen: 5,     // image_selector con función generate
      video_gen: 12,
      audio_gen: 4,
      simple_input: 0.1 // strings, dropdowns, checkboxes
    };
    let total = 0;
    (this.inputSchema || []).forEach(f => {
      const t = (f.input_type || f.type || '').toLowerCase();
      if (t === 'prompt_input' || t === 'prompt_system' || t === 'textarea') {
        total += weights.llm;
      } else {
        total += weights.simple_input;
      }
    });
    // Cada módulo extra agrega costo proporcional al execution_type
    (this.flowModules || []).forEach(m => {
      const et = (m.execution_type || 'webhook').toLowerCase();
      if (et === 'ai_direct') total += weights.llm;
      else total += 1;
    });
    // Output type pone el grueso del costo
    const out = (this.flowData.output_type || 'text').toLowerCase();
    if (out === 'image') total += weights.image_gen;
    else if (out === 'video') total += weights.video_gen;
    else if (out === 'audio') total += weights.audio_gen;
    else if (out === 'mixed') total += (weights.image_gen + weights.llm) / 2;
    // token_cost declarado por el dev como override
    const declared = parseInt(this.flowData.token_cost, 10) || 1;
    return { estimated: Math.max(1, Math.round(total)), declared };
  };

  P.refreshCostBadge = function () {
    const el = this.querySelector('#builderCostBadge');
    if (!el) return;
    const { estimated, declared } = this.estimateExecutionCost();
    el.textContent = `≈ ${declared} crédito${declared !== 1 ? 's' : ''}`;
    el.title = `Coste declarado: ${declared} créditos · Estimación interna basada en componentes: ≈ ${estimated}`;
    el.classList.toggle('builder-cost-badge--mismatch', Math.abs(declared - estimated) >= 3);
    el.hidden = false;
  };

  // ==================================================================
  // 4. Webhook signature secret
  // ==================================================================
  P.setupSignatureSecretListeners = function () {
    if (this._signatureListenersWired) return;
    this._signatureListenersWired = true;
    const genBtn = this.querySelector('#techDetailsSignatureGenerate');
    const copyBtn = this.querySelector('#techDetailsSignatureCopy');
    const input = this.querySelector('#techDetailsSignatureSecret');
    if (genBtn) genBtn.addEventListener('click', () => {
      if (!input) return;
      // Generar secret aleatorio (32 bytes en base64url)
      const arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      const b64 = btoa(String.fromCharCode.apply(null, arr))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      input.value = b64;
      // Persistir en flowTechnicalDetailsByModule del módulo seleccionado
      if (this.technicalDetailsPanelModuleKey && this.flowTechnicalDetailsByModule) {
        if (!this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey]) {
          this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey] = this.getTechDetailsDefault();
        }
        this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey].webhook_signature_secret = b64;
      }
      this.onFieldChange();
      this.showNotification('Secret generado. Recuerda copiarlo: no se mostrará nuevamente tras refrescar.', 'info');
    });
    if (copyBtn) copyBtn.addEventListener('click', () => {
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value)
        .then(() => this.showNotification('Secret copiado al portapapeles', 'success'))
        .catch(() => this.showNotification('No se pudo copiar', 'error'));
    });
  };

  // ==================================================================
  // 5. Hook: setup + cost refresh + audit on lifecycle
  // ==================================================================
  const _origInitProductivity = P.initProductivity;
  P.initProductivity = function () {
    if (typeof _origInitProductivity === 'function') _origInitProductivity.call(this);
    // Versions button
    const vBtn = this.querySelector('#builderVersionsBtn');
    if (vBtn) vBtn.addEventListener('click', () => this.openVersionsPanel());
    this.setupSignatureSecretListeners();
    this.refreshCostBadge();
  };

  const _origOnStateMutated = P.onStateMutated;
  P.onStateMutated = function () {
    if (typeof _origOnStateMutated === 'function') _origOnStateMutated.call(this);
    this.refreshCostBadge();
  };

  // Wrap publishFlow / unpublishFlow / requestReview con audit log
  ['publishFlow', 'unpublishFlow', 'requestReview', 'approveAndPublish', 'rejectFlow'].forEach(name => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = async function () {
      const result = await orig.apply(this, arguments);
      this.logAuditEvent(`flow.${name}`, { status: this.flowData?.status });
      return result;
    };
  });

  // Auto-create revision en save manual (no en autosave para no spamear)
  const _origSaveFlow = P.saveFlow;
  P.saveFlow = async function () {
    const wasAutoSave = this._isAutoSaving === true;
    const result = await _origSaveFlow.apply(this, arguments);
    // Solo crear revision en save manual (no autosave) y solo si el save fue OK (flowId existe)
    if (!wasAutoSave && this.flowId && !this._suppressSaveToast) {
      this.createRevision('Save manual');
      this.logAuditEvent('flow.saved', { status: this.flowData?.status });
    }
    return result;
  };

  // Cargar webhook_signature_secret cuando se abre el panel técnico
  const _origFillTechDetailsForm = P.fillTechDetailsForm;
  P.fillTechDetailsForm = function (moduleKey) {
    if (typeof _origFillTechDetailsForm === 'function') _origFillTechDetailsForm.call(this, moduleKey);
    const input = this.querySelector('#techDetailsSignatureSecret');
    if (!input || !moduleKey) return;
    const t = (this.flowTechnicalDetailsByModule && this.flowTechnicalDetailsByModule[moduleKey]) || {};
    input.value = t.webhook_signature_secret || '';
  };

  const _origSyncTechDetailsFromForm = P.syncTechDetailsFromForm;
  P.syncTechDetailsFromForm = function () {
    if (typeof _origSyncTechDetailsFromForm === 'function') _origSyncTechDetailsFromForm.call(this);
    if (!this.technicalDetailsPanelModuleKey) return;
    const input = this.querySelector('#techDetailsSignatureSecret');
    if (!input) return;
    const td = this.flowTechnicalDetailsByModule[this.technicalDetailsPanelModuleKey];
    if (td) td.webhook_signature_secret = input.value || null;
  };
})();
