/**
 * BuilderPersistence — Mixin for DevBuilderView
 * Handles: save, load, publish, lifecycle, test execution
 */
(function () {
  'use strict';
  const P = DevBuilderView.prototype;

  P.loadFlow = async function () {
    if (!this.supabase || !this.flowId) return;
    
    try {
      // Cargar flujo principal
      const { data: flow, error } = await this.supabase
        .from('content_flows')
        .select('*')
        .eq('id', this.flowId)
        .single();
      
      if (error) throw error;
      
      if (!flow) {
        this.showNotification('Flujo no encontrado', 'error');
        window.router?.navigate('/dev/flows');
        return;
      }
      
      // Verificar permisos
      if (flow.owner_id !== this.userId) {
        // TODO: Verificar si es colaborador
        this.showNotification('No tienes permisos para editar este flujo', 'error');
        window.router?.navigate('/dev/flows');
        return;
      }
      
      // Cargar datos (alineado con content_flows: subcategory_id, execution_mode, show_in_catalog)
      const showInCatalog = flow.show_in_catalog !== undefined
        ? !!flow.show_in_catalog
        : !(flow.ui_layout_config && flow.ui_layout_config.hidden_from_catalog);
      this.flowData = {
        name: flow.name,
        description: flow.description || '',
        category_id: flow.category_id,
        subcategory_id: flow.subcategory_id || null,
        output_type: flow.output_type || 'text',
        flow_category_type: flow.flow_category_type || 'manual',
        token_cost: flow.token_cost || 1,
        flow_image_url: flow.flow_image_url,
        status: flow.status || 'draft',
        version: flow.version || '1.0.0',
        owner_id: flow.owner_id,
        execution_mode: flow.execution_mode || 'single_step',
        show_in_catalog: showInCatalog
      };
      
      this.inputSchema = [];
      
      // Cargar ui_layout_config
      if (flow.ui_layout_config && Object.keys(flow.ui_layout_config).length > 0) {
        this.uiLayoutConfig = { ...this.uiLayoutConfig, ...flow.ui_layout_config };
      }
      
      // Grafo de ejecución: todos los módulos (flow_modules). flow_technical_details por flow_module_id.
      const { data: modulesList } = await this.supabase
        .from('flow_modules')
        .select('id, name, step_order, execution_type, webhook_url_test, webhook_url_prod, input_schema, output_schema, is_human_approval_required, next_module_id, routing_rules')
        .eq('content_flow_id', this.flowId)
        .order('step_order', { ascending: true });
      
      if (modulesList && modulesList.length > 0) {
        this.flowModules = modulesList.map(m => ({
          id: m.id,
          name: m.name || '',
          step_order: m.step_order,
          execution_type: m.execution_type || 'webhook',
          webhook_url_test: m.webhook_url_test || '',
          webhook_url_prod: m.webhook_url_prod || '',
          is_human_approval_required: !!m.is_human_approval_required,
          next_module_id: m.next_module_id || null,
          output_schema: m.output_schema ?? null,
          routing_rules: m.routing_rules ?? null
        }));
        this.currentFlowModuleId = this.flowModules[0].id;
        const first = modulesList[0];
        if (first.input_schema?.fields) {
          this.inputSchema = first.input_schema.fields;
        } else if (Array.isArray(first.input_schema)) {
          this.inputSchema = first.input_schema;
        }
        const moduleIds = modulesList.map(m => m.id);
        const { data: techDetailsList } = await this.supabase
          .from('flow_technical_details')
          .select('id, flow_module_id, webhook_method, platform_name, platform_flow_id, platform_flow_name, editor_url, credential_id, is_healthy, last_health_check, avg_execution_time_ms')
          .in('flow_module_id', moduleIds);
        this.flowTechnicalDetailsByModule = {};
        (techDetailsList || []).forEach(t => {
          this.flowTechnicalDetailsByModule[t.flow_module_id] = {
            id: t.id,
            webhook_method: (t.webhook_method || 'POST').toUpperCase(),
            platform_name: t.platform_name || 'n8n',
            platform_flow_id: t.platform_flow_id || '',
            platform_flow_name: t.platform_flow_name || '',
            editor_url: t.editor_url || '',
            credential_id: t.credential_id || '',
            is_healthy: t.is_healthy !== false,
            last_health_check: t.last_health_check,
            avg_execution_time_ms: t.avg_execution_time_ms != null ? t.avg_execution_time_ms : ''
          };
        });
        this.technicalDetails = {
          webhook_url_test: first.webhook_url_test || '',
          webhook_url_prod: first.webhook_url_prod || '',
          webhook_method: (this.flowTechnicalDetailsByModule[first.id]?.webhook_method || 'POST').toUpperCase(),
          platform_name: this.flowTechnicalDetailsByModule[first.id]?.platform_name || 'n8n',
          editor_url: this.flowTechnicalDetailsByModule[first.id]?.editor_url || ''
        };
      } else {
        this.flowModules = [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
      }
      if (this.inputSchema.length === 0 && flow.input_schema?.fields) {
        this.inputSchema = flow.input_schema.fields;
      } else if (this.inputSchema.length === 0 && Array.isArray(flow.input_schema)) {
        this.inputSchema = flow.input_schema;
      }
      // Normalizar input_type en cada campo para que el canvas muestre el cascarón correcto (number, select, checkbox, etc.)
      this.inputSchema = this.inputSchema.map(f => ({ ...f, input_type: f.input_type || f.type || 'text' }));
      
      // Actualizar UI y adaptar por tipo (manual vs automated)
      this.populateForm();
      this.applyFlowTypeUI();
      
    } catch (err) {
      console.error('Error loading flow:', err);
      this.showNotification('Error al cargar el flujo', 'error');
    }
  };

  P.populateForm = function () {
    const nameConfig = this.querySelector('#flowNameConfig');
    if (nameConfig) nameConfig.value = this.flowData.name;

    // URL del flujo (editable para copiar/pegar o ajustar)
    const flowUrlInput = this.querySelector('#flowUrlInput');
    const copyFlowUrlBtn = this.querySelector('#copyFlowUrlBtn');
    const flowUrl = this.getFlowPublicUrl();
    if (flowUrlInput) {
      flowUrlInput.value = flowUrl || '';
      flowUrlInput.placeholder = '— Guarda el flujo para ver la URL';
    }
    if (copyFlowUrlBtn) copyFlowUrlBtn.style.display = flowUrl ? 'inline-flex' : 'none';

    // Nombre técnico (ui_layout_config.technical_name)
    const technicalName = this.querySelector('#flowTechnicalName');
    if (technicalName) technicalName.value = this.uiLayoutConfig.technical_name || '';
    
    // Status badge
    this.updateStatusBadge();
    
    // Configuración
    const descInput = this.querySelector('#flowDescription');
    const categorySelect = this.querySelector('#flowCategory');
    const outputTypeSelect = this.querySelector('#flowOutputType');
    const flowTypeSelect = this.querySelector('#flowType');
    const tokenCostInput = this.querySelector('#flowTokenCost');
    const versionInput = this.querySelector('#flowVersion');
    
    if (descInput) descInput.value = this.flowData.description;
    if (categorySelect) categorySelect.value = this.flowData.category_id || '';
    if (outputTypeSelect) outputTypeSelect.value = this.flowData.output_type;
    if (flowTypeSelect) {
      flowTypeSelect.value = this.flowData.flow_category_type;
      if (typeof this.updateFlowTypePicker === 'function') this.updateFlowTypePicker(this.flowData.flow_category_type);
    }
    if (tokenCostInput) tokenCostInput.value = this.flowData.token_cost ?? 1;
    if (versionInput) versionInput.value = this.flowData.version;
    
    // Image preview
    if (this.flowData.flow_image_url) {
      this.updateImagePreview(this.flowData.flow_image_url);
    }
    
    // UI Layout
    const uiTheme = this.querySelector('#uiTheme');
    const uiColumns = this.querySelector('#uiColumns');
    const uiShowLabels = this.querySelector('#uiShowLabels');
    const uiShowHelperText = this.querySelector('#uiShowHelperText');
    const uiSubmitText = this.querySelector('#uiSubmitText');
    const uiSubmitPosition = this.querySelector('#uiSubmitPosition');
    
    if (uiTheme) uiTheme.value = this.uiLayoutConfig.theme || 'default';
    if (uiColumns) uiColumns.value = this.uiLayoutConfig.columns || '1';
    if (uiShowLabels) uiShowLabels.checked = this.uiLayoutConfig.showLabels !== false;
    if (uiShowHelperText) uiShowHelperText.checked = this.uiLayoutConfig.showHelperText !== false;
    if (uiSubmitText) uiSubmitText.value = this.uiLayoutConfig.submitButtonText || 'Generar';
    if (uiSubmitPosition) uiSubmitPosition.value = this.uiLayoutConfig.submitButtonPosition || 'right';
    
    const uiShowInCatalog = this.querySelector('#uiShowInCatalog');
    if (uiShowInCatalog) uiShowInCatalog.checked = !!this.flowData.show_in_catalog;
    
    // Técnico: modo de ejecución y lista de módulos
    const executionMode = this.querySelector('#executionMode');
    if (executionMode) executionMode.value = this.flowData.execution_mode || 'single_step';
    this.renderTechnicalModulesList();
    
    this.setupTechnicalModulesListeners();
    
    // Render canvas
    this.renderCanvas();
    this.updateJsonPreview();
  };

  P.saveFlow = async function () {
    if (!this.supabase || !this.userId) {
      this.showNotification('No se puede guardar. Inicia sesión.', 'error');
      return;
    }
    
    if (!this.flowData.name.trim()) {
      this.showNotification('El nombre del flujo es requerido', 'error');
      this.querySelector('#flowNameConfig')?.focus();
      return;
    }
    
    const saveBtn = this.querySelector('#btnSaveDraft') || this.querySelector('#btnUpdateFlow');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
    }
    
    try {
      const flowPayload = {
        name: this.flowData.name.trim(),
        description: this.flowData.description,
        category_id: this.flowData.category_id,
        subcategory_id: this.flowData.subcategory_id || null,
        output_type: this.flowData.output_type,
        flow_category_type: this.flowData.flow_category_type,
        token_cost: this.flowData.token_cost,
        flow_image_url: this.flowData.flow_image_url,
        status: this.flowData.status,
        version: this.flowData.version,
        execution_mode: this.flowData.execution_mode || 'single_step',
        show_in_catalog: !!this.flowData.show_in_catalog,
        ui_layout_config: this.uiLayoutConfig
      };
      
      let flowId = this.flowId;
      
      if (this.isEditMode && flowId) {
        // Update existing flow
        const { error } = await this.supabase
          .from('content_flows')
          .update(flowPayload)
          .eq('id', flowId);
        
        if (error) throw error;
      } else {
        // Create new flow
        flowPayload.owner_id = this.userId;
        
        const { data, error } = await this.supabase
          .from('content_flows')
          .insert(flowPayload)
          .select('id')
          .single();
        
        if (error) throw error;
        
        flowId = data.id;
        this.flowId = flowId;
        this.isEditMode = true;
        this.flowData.owner_id = this.userId;
        
        // Update URL without reload
        const newUrl = `/dev/builder?id=${flowId}`;
        window.history.replaceState({}, '', newUrl);
      }
      
      // Save technical details
      await this.saveTechnicalDetails(flowId);
      
      this.hasUnsavedChanges = false;
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo guardado correctamente', 'success');
      
    } catch (err) {
      console.error('Error saving flow:', err);
      this.showNotification('Error al guardar el flujo', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = saveBtn.id === 'btnUpdateFlow'
          ? '<i class="ph ph-pencil-simple"></i> Actualizar flujo'
          : '<i class="ph ph-floppy-disk"></i> Guardar flujo';
      }
    }
  };

  /**
   * Guarda el grafo de ejecución: flow_modules (módulos) y flow_technical_details por flow_module_id.
   * content_flows.execution_mode ya se guarda en saveFlow().
   */
  P.saveTechnicalDetails = async function (flowId) {
    if (!this.supabase || !flowId) return;
    
    const mods = this.flowModules.length ? this.flowModules : [{ name: 'Módulo 1', step_order: 1, execution_type: 'webhook', webhook_url_test: '', webhook_url_prod: '', is_human_approval_required: false, next_module_id: null, output_schema: null, routing_rules: null, input_schema: null }];
    if (mods.length !== this.flowModules.length) this.flowModules = mods;
    
    const keepIds = mods.map(m => m.id).filter(Boolean);
    if (keepIds.length > 0) {
      const { data: existing } = await this.supabase.from('flow_modules').select('id').eq('content_flow_id', flowId);
      const toDelete = (existing || []).filter(r => !keepIds.includes(r.id)).map(r => r.id);
      for (const id of toDelete) {
        await this.supabase.from('flow_technical_details').delete().eq('flow_module_id', id);
        await this.supabase.from('flow_modules').delete().eq('id', id);
      }
    } else {
      const { data: existingMods } = await this.supabase.from('flow_modules').select('id').eq('content_flow_id', flowId);
      for (const row of existingMods || []) {
        await this.supabase.from('flow_technical_details').delete().eq('flow_module_id', row.id);
      }
      await this.supabase.from('flow_modules').delete().eq('content_flow_id', flowId);
    }
    
    try {
      // 1) Insertar módulos nuevos para obtener ids
      for (let i = 0; i < mods.length; i++) {
        if (mods[i].id) continue;
        const { data: inserted, error: insertErr } = await this.supabase
          .from('flow_modules')
          .insert({
            content_flow_id: flowId,
            name: mods[i].name || 'Módulo ' + (i + 1),
            step_order: i + 1,
            execution_type: mods[i].execution_type || 'webhook',
            webhook_url_test: mods[i].webhook_url_test || null,
            webhook_url_prod: mods[i].webhook_url_prod || null,
            input_schema: i === 0 ? { fields: this.inputSchema } : ((mods[i].input_schema != null && typeof mods[i].input_schema === 'object') ? mods[i].input_schema : {}),
            is_human_approval_required: !!mods[i].is_human_approval_required,
            next_module_id: null,
            output_schema: (mods[i].output_schema != null && typeof mods[i].output_schema === 'object') ? mods[i].output_schema : null,
            routing_rules: (mods[i].routing_rules != null && typeof mods[i].routing_rules === 'object') ? mods[i].routing_rules : null
          })
          .select('id')
          .single();
        if (insertErr) {
          console.error('Error creating flow_module:', insertErr);
          continue;
        }
        mods[i].id = inserted.id;
        const idxKey = `idx_${i}`;
        if (this.flowTechnicalDetailsByModule[idxKey]) {
          this.flowTechnicalDetailsByModule[inserted.id] = this.flowTechnicalDetailsByModule[idxKey];
          delete this.flowTechnicalDetailsByModule[idxKey];
        }
      }
      
      // 2) Actualizar todos los módulos (name, step_order, execution_type, webhooks, input_schema primer módulo, next_module_id, output_schema, routing_rules)
      for (let i = 0; i < mods.length; i++) {
        if (!mods[i].id) continue;
        const payload = {
          name: mods[i].name || 'Módulo ' + (i + 1),
          step_order: i + 1,
          execution_type: mods[i].execution_type || 'webhook',
          webhook_url_test: mods[i].webhook_url_test || null,
          webhook_url_prod: mods[i].webhook_url_prod || null,
          is_human_approval_required: !!mods[i].is_human_approval_required,
          next_module_id: mods[i].next_module_id || null,
          output_schema: (mods[i].output_schema != null && typeof mods[i].output_schema === 'object') ? mods[i].output_schema : null,
          routing_rules: (mods[i].routing_rules != null && typeof mods[i].routing_rules === 'object') ? mods[i].routing_rules : null
        };
        if (i === 0) payload.input_schema = { fields: this.inputSchema };
        else if (mods[i].input_schema != null && typeof mods[i].input_schema === 'object') payload.input_schema = mods[i].input_schema;
        const { error } = await this.supabase
          .from('flow_modules')
          .update(payload)
          .eq('id', mods[i].id);
        if (error) console.error('Error updating flow_module:', error);
      }
      
      this.currentFlowModuleId = mods[0]?.id || null;
      
      // 3) flow_technical_details: uno por módulo
      for (let i = 0; i < mods.length; i++) {
        const mod = mods[i];
        if (!mod.id) continue;
        const key = mod.id || `idx_${i}`;
        const td = this.flowTechnicalDetailsByModule[key] || {};
        const techPayload = {
          flow_module_id: mod.id,
          webhook_method: (td.webhook_method || 'POST').toUpperCase(),
          platform_name: td.platform_name || 'n8n',
          platform_flow_id: td.platform_flow_id || null,
          platform_flow_name: td.platform_flow_name || null,
          editor_url: td.editor_url || null,
          credential_id: td.credential_id || null,
          is_healthy: td.is_healthy !== false,
          avg_execution_time_ms: td.avg_execution_time_ms !== '' && td.avg_execution_time_ms != null ? parseInt(td.avg_execution_time_ms, 10) : null
        };
        const { error: techErr } = await this.supabase
          .from('flow_technical_details')
          .upsert(techPayload, { onConflict: 'flow_module_id' });
        if (techErr) console.error('Error upserting flow_technical_details:', techErr);
      }
    } catch (err) {
      console.error('Error in saveTechnicalDetails:', err);
    }
  };

  P.publishFlow = async function () {
    if (!this.flowId) {
      this.showNotification('Guarda el flujo primero', 'warning');
      return;
    }
    if (!this.isLead()) {
      this.showNotification('Solo un Lead puede publicar directamente', 'warning');
      return;
    }
    if (this.inputSchema.length === 0) {
      this.showNotification('Agrega al menos un campo de entrada', 'warning');
      return;
    }
    const firstModule = this.flowModules[0];
    const prodUrl = firstModule?.webhook_url_prod || '';
    const testUrl = firstModule?.webhook_url_test || '';
    if (prodUrl && !/^https?:\/\/.+/.test(prodUrl)) {
      this.showNotification('La URL de producción no es válida', 'warning');
      this.switchTab('technical');
      return;
    }
    if (testUrl && !/^https?:\/\/.+/.test(testUrl)) {
      this.showNotification('La URL de test no es válida', 'warning');
      this.switchTab('technical');
      return;
    }
    if (!this.technicalDetails.webhook_url_prod && !this.technicalDetails.webhook_url_test) {
      this.showNotification('Configura al menos un webhook', 'warning');
      this.switchTab('technical');
      return;
    }
    try {
      this.flowData.status = 'published';
      await this.saveFlow();
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('¡Flujo publicado exitosamente!', 'success');
    } catch (err) {
      console.error('Error publishing flow:', err);
      this.showNotification('Error al publicar el flujo', 'error');
    }
  };

  P.requestReview = async function () {
    if (!this.flowId || !this.supabase) return;
    if (this.flowData.status !== 'draft') return;
    if (!this.flowData.name.trim()) {
      this.showNotification('Guarda el flujo antes de solicitar revisión', 'warning');
      return;
    }
    try {
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'checking' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'checking';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Revisión solicitada. Un Lead aprobará el flujo.', 'success');
    } catch (err) {
      console.error('Error requesting review:', err);
      this.showNotification('Error al solicitar revisión', 'error');
    }
  };

  P.approveAndPublish = async function () {
    if (!this.flowId || !this.supabase || !this.isLead()) return;
    try {
      if (!this.technicalDetails.webhook_url_prod && this.technicalDetails.webhook_url_test) {
        this.technicalDetails.webhook_url_prod = this.technicalDetails.webhook_url_test;
        await this.saveTechnicalDetails(this.flowId);
      }
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'published' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'published';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo aprobado y publicado', 'success');
    } catch (err) {
      console.error('Error approving flow:', err);
      this.showNotification('Error al aprobar y publicar', 'error');
    }
  };

  P.rejectFlow = async function () {
    if (!this.flowId || !this.supabase || !this.isLead()) return;
    const note = window.prompt('Motivo del rechazo (opcional):') || '';
    try {
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'draft' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'draft';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo rechazado. Vuelve a borrador.', 'info');
      if (note && window.authService?.supabase) {
        // Opcional: crear notificación para el autor
        await window.authService.supabase.from('developer_notifications').insert({
          recipient_user_id: this.flowData.owner_id,
          flow_id: this.flowId,
          severity: 'info',
          title: 'Flujo rechazado',
          message: note || 'Tu flujo fue rechazado y está en borrador.'
        });
      }
    } catch (err) {
      console.error('Error rejecting flow:', err);
      this.showNotification('Error al rechazar', 'error');
    }
  };

  P.unpublishFlow = async function () {
    if (!this.flowId || !this.supabase || !this.isLead()) return;
    if (!confirm('¿Despublicar este flujo? Dejará de estar visible para los clientes.')) return;
    try {
      const { error } = await this.supabase
        .from('content_flows')
        .update({ status: 'draft' })
        .eq('id', this.flowId);
      if (error) throw error;
      this.flowData.status = 'draft';
      this.updateStatusBadge();
      this.renderFooter();
      this.showNotification('Flujo despublicado', 'info');
    } catch (err) {
      console.error('Error unpublishing flow:', err);
      this.showNotification('Error al despublicar', 'error');
    }
  };

  P.duplicateFlow = async function () {
    if (!this.flowId || !this.supabase) return;
    
    try {
      const flowPayload = {
        name: `${this.flowData.name} (copia)`,
        description: this.flowData.description,
        category_id: this.flowData.category_id,
        subcategory_id: this.flowData.subcategory_id || null,
        output_type: this.flowData.output_type,
        flow_category_type: this.flowData.flow_category_type,
        token_cost: this.flowData.token_cost,
        flow_image_url: this.flowData.flow_image_url,
        status: 'draft',
        version: this.flowData.version,
        execution_mode: this.flowData.execution_mode || 'single_step',
        show_in_catalog: !!this.flowData.show_in_catalog,
        owner_id: this.userId,
        ui_layout_config: this.uiLayoutConfig
      };
      
      const { data, error } = await this.supabase
        .from('content_flows')
        .insert(flowPayload)
        .select('id')
        .single();
      
      if (error) throw error;
      
      await this.saveTechnicalDetails(data.id);
      
      this.showNotification('Flujo duplicado', 'success');
      window.router?.navigate(`/dev/builder?id=${data.id}`);
      
    } catch (err) {
      console.error('Error duplicating flow:', err);
      this.showNotification('Error al duplicar el flujo', 'error');
    }
  };

  P.exportFlow = function () {
    const exportData = {
      name: this.flowData.name,
      description: this.flowData.description,
      output_type: this.flowData.output_type,
      flow_category_type: this.flowData.flow_category_type,
      token_cost: this.flowData.token_cost,
      version: this.flowData.version,
      input_schema: { fields: this.inputSchema },
      ui_layout_config: this.uiLayoutConfig,
      technical: {
        webhook_method: this.technicalDetails.webhook_method,
        platform_name: this.technicalDetails.platform_name
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow_${this.flowData.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('Flujo exportado', 'success');
  };

  P.copySchema = function () {
    const schema = JSON.stringify({ fields: this.inputSchema }, null, 2);
    navigator.clipboard.writeText(schema).then(() => {
      this.showNotification('Schema copiado al portapapeles', 'success');
    }).catch(() => {
      this.showNotification('Error al copiar', 'error');
    });
  };

  P.runTest = async function () {
    const container = this.querySelector('#testFormContainer');
    const results = this.querySelector('#testResults');
    const output = this.querySelector('#testResultOutput');
    const runBtn = this.querySelector('#runTestBtn');
    
    if (!container) return;
    
    // Collect form data
    const formData = {};
    this.inputSchema.forEach(field => {
      const input = container.querySelector(`[name="${field.key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          formData[field.key] = input.checked;
        } else if (input.type === 'radio') {
          const checked = container.querySelector(`[name="${field.key}"]:checked`);
          formData[field.key] = checked ? checked.value : null;
        } else {
          formData[field.key] = input.value;
        }
      }
    });
    
    // Validate required fields
    for (const field of this.inputSchema) {
      if (field.required && !formData[field.key]) {
        this.showNotification(`El campo "${field.label}" es requerido`, 'warning');
        return;
      }
    }
    
    const webhookUrl = this.technicalDetails.webhook_url_test || this.technicalDetails.webhook_url_prod;
    
    if (!webhookUrl) {
      this.showNotification('No hay webhook configurado', 'error');
      return;
    }
    
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Ejecutando...';
    }
    
    try {
      const Service = window.FlowWebhookService;
      let responseData, statusCode, statusText;
      
      if (Service) {
        const res = await Service.executeWebhook({
          url: webhookUrl,
          method: this.technicalDetails.webhook_method || 'POST',
          body: { inputs: formData, test_mode: true, flow_id: this.flowId, timestamp: new Date().toISOString() },
          timeoutMs: 120000,
          maxRetries: 1
        });
        statusCode = res.status;
        statusText = res.statusText;
        responseData = res.data;
        
        if (results && output) {
          results.style.display = 'block';
          output.textContent = JSON.stringify({ status: statusCode, statusText: statusText, data: responseData }, null, 2);
        }
        
        if (res.ok) {
          this.showNotification('Prueba ejecutada exitosamente', 'success');
        } else {
          this.showNotification('Error: ' + statusCode + ' ' + (res.error || statusText), 'error');
        }
      } else {
        const response = await fetch(webhookUrl, {
          method: this.technicalDetails.webhook_method || 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: formData,
            test_mode: true,
            flow_id: this.flowId,
            timestamp: new Date().toISOString()
          })
        });
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
        
        if (results && output) {
          results.style.display = 'block';
          output.textContent = JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            data: responseData
          }, null, 2);
        }
        
        if (response.ok) {
          this.showNotification('Prueba ejecutada exitosamente', 'success');
        } else {
          this.showNotification(`Error: ${response.status} ${response.statusText}`, 'error');
        }
      }
      
    } catch (err) {
      console.error('Test error:', err);
      
      if (results && output) {
        results.style.display = 'block';
        output.textContent = JSON.stringify({
          error: err.message,
          type: 'network_error'
        }, null, 2);
      }
      
      this.showNotification('Error de conexión', 'error');
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<i class="ph ph-play"></i> Ejecutar';
      }
    }
  };

  P.confirmDelete = async function () {
    if (!this.flowId || !this.supabase) {
      this.querySelector('#deleteModal').style.display = 'none';
      return;
    }
    
    try {
      const { data: modules } = await this.supabase
        .from('flow_modules')
        .select('id')
        .eq('content_flow_id', this.flowId);
      if (modules?.length) {
        for (const m of modules) {
          await this.supabase.from('flow_technical_details').delete().eq('flow_module_id', m.id);
        }
        await this.supabase.from('flow_modules').delete().eq('content_flow_id', this.flowId);
      }
      const { error } = await this.supabase
        .from('content_flows')
        .delete()
        .eq('id', this.flowId);
      
      if (error) throw error;
      
      this.showNotification('Flujo eliminado', 'success');
      window.router?.navigate('/dev/flows');
      
    } catch (err) {
      console.error('Error deleting flow:', err);
      this.showNotification('Error al eliminar el flujo', 'error');
      this.querySelector('#deleteModal').style.display = 'none';
    }
  };
})();
