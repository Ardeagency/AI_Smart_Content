/**
 * TasksView - Vista de tareas programadas (flow_schedules)
 * Lista las tareas del usuario y permite asignar entidad, campaña, audiencia y editar configuración.
 */
class TasksView extends BaseView {
  constructor() {
    super();
    this.templatePath = 'tasks.html';
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.taskId = null;
    this.schedules = [];
    this.entities = [];
    this.campaigns = [];
    this.audiences = [];
    this.brands = [];
    this.ASPECT_RATIOS = ['1:1', '9:16', '16:9', '4:5'];
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth) {
        if (window.router) window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    this.organizationId = this.routeParams?.orgId ||
      window.appState?.get('selectedOrganizationId') ||
      localStorage.getItem('selectedOrganizationId');
    if (this.organizationId) {
      localStorage.setItem('selectedOrganizationId', this.organizationId);
    }
  }

  async render() {
    await super.render();
    try {
      await this.initSupabase();
      this.brandContainerId = await this.getBrandContainerId();

      const path = window.location.pathname || '';
      const taskMatch = path.match(/\/tasks\/([^/]+)/);
      this.taskId = this.routeParams?.taskId || (taskMatch ? taskMatch[1] : null);
      if (this.taskId && this.taskId !== 'new') {
        await this.renderTaskDetail();
        const listEl = document.getElementById('tasksListContainer');
        const detailEl = document.getElementById('taskDetailContainer');
        if (listEl) listEl.style.display = 'none';
        if (detailEl) detailEl.style.display = 'block';
      } else {
        await this.renderTasksList();
        const listEl = document.getElementById('tasksListContainer');
        const detailEl = document.getElementById('taskDetailContainer');
        if (listEl) listEl.style.display = 'block';
        if (detailEl) detailEl.style.display = 'none';
      }
      this.setupEventListeners();
    } catch (err) {
      console.error('TasksView render:', err);
      const container = document.getElementById('app-container');
      if (container) {
        const wrap = container.querySelector('.tasks-page') || container;
        wrap.innerHTML = `
          <div class="tasks-page" style="padding: 2rem;">
            <h1 class="tasks-title">Tareas programadas</h1>
            <div class="error-container" style="margin-top: 2rem; text-align: center;">
              <p style="color: var(--text-secondary);">Error al cargar las tareas. ${err && err.message ? err.message : 'Por favor, recarga la página.'}</p>
              <button type="button" class="btn btn-primary" style="margin-top: 1rem;" onclick="window.location.reload()">Recargar</button>
            </div>
          </div>`;
      }
    }
  }

  async initSupabase() {
    try {
      if (window.supabaseService) this.supabase = await window.supabaseService.getClient();
      else if (window.supabase) this.supabase = window.supabase;
      else if (typeof waitForSupabase === 'function') this.supabase = await waitForSupabase();
      if (this.supabase) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.userId = user.id;
      }
    } catch (e) {
      console.error('TasksView initSupabase:', e);
    }
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      if (this.organizationId) {
        const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) return data.id;
      }
      if (this.userId) {
        const { data, error } = await this.supabase
          .from('brand_containers')
          .select('id')
          .eq('user_id', this.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) return data.id;
      }
      return null;
    } catch (e) {
      console.error('TasksView getBrandContainerId:', e);
      return null;
    }
  }

  /** Cargar flow_schedules del usuario. Sin embeds para evitar 400; relaciones se cargan aparte. */
  async loadSchedules() {
    if (!this.supabase || !this.userId) return [];
    try {
      const { data, error } = await this.supabase
        .from('flow_schedules')
        .select('id, user_id, flow_id, brand_id, cron_expression, is_active, job_name, created_at, entity_ids, campaign_ids, audience_id, production_count, aspect_ratio, production_specifications')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('TasksView loadSchedules:', error);
        return [];
      }
      const schedules = data || [];
      if (schedules.length === 0) {
        this.schedules = [];
        return [];
      }
      const flowIds = [...new Set(schedules.map(s => s.flow_id).filter(Boolean))];
      const entityIds = [...new Set(schedules.flatMap(s => Array.isArray(s.entity_ids) ? s.entity_ids : (s.entity_ids ? [s.entity_ids] : [])).filter(Boolean))];
      const campaignIds = [...new Set(schedules.flatMap(s => Array.isArray(s.campaign_ids) ? s.campaign_ids : (s.campaign_ids ? [s.campaign_ids] : [])).filter(Boolean))];
      const audienceIds = [...new Set(schedules.map(s => s.audience_id).filter(Boolean))];
      const brandIds = [...new Set(schedules.map(s => s.brand_id).filter(Boolean))];

      const [flowsRes, entitiesRes, campaignsRes, audiencesRes, brandsRes] = await Promise.all([
        flowIds.length ? this.supabase.from('content_flows').select('id, name').in('id', flowIds) : { data: [] },
        entityIds.length ? this.supabase.from('brand_entities').select('id, name').in('id', entityIds) : { data: [] },
        campaignIds.length ? this.supabase.from('campaigns').select('id, nombre_campana').in('id', campaignIds) : { data: [] },
        audienceIds.length ? this.supabase.from('audiences').select('id, name').in('id', audienceIds) : { data: [] },
        brandIds.length ? this.supabase.from('brands').select('id, project_id').in('id', brandIds) : { data: [] }
      ]);

      const flowMap = (flowsRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const entityMap = (entitiesRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const campaignMap = (campaignsRes.data || []).reduce((acc, r) => { acc[r.id] = r.nombre_campana; return acc; }, {});
      const audienceMap = (audiencesRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const brandProjectMap = (brandsRes.data || []).reduce((acc, r) => { acc[r.id] = r.project_id; return acc; }, {});

      const projectIds = [...new Set(Object.values(brandProjectMap).filter(Boolean))];
      let brandNames = {};
      if (projectIds.length) {
        const { data: containers } = await this.supabase.from('brand_containers').select('id, nombre_marca').in('id', projectIds);
        (containers || []).forEach(c => { brandNames[c.id] = c.nombre_marca || '—'; });
      }

      this.schedules = schedules.map(s => {
        const flowName = (s.flow_id && flowMap[s.flow_id]) || '—';
        const firstEntityId = Array.isArray(s.entity_ids) ? s.entity_ids[0] : s.entity_ids;
        const entityName = (firstEntityId && entityMap[firstEntityId]) || '—';
        const firstCampaignId = Array.isArray(s.campaign_ids) ? s.campaign_ids[0] : s.campaign_ids;
        const campaignName = (firstCampaignId && campaignMap[firstCampaignId]) || '—';
        const audienceName = (s.audience_id && audienceMap[s.audience_id]) || '—';
        const projectId = s.brand_id ? brandProjectMap[s.brand_id] : null;
        const brandName = projectId ? (brandNames[projectId] || '—') : '—';
        return {
          ...s,
          flow_name: flowName,
          entity_name: entityName,
          campaign_name: campaignName,
          audience_name: audienceName,
          brand_name: brandName
        };
      });
      return this.schedules;
    } catch (e) {
      console.error('TasksView loadSchedules:', e);
      return [];
    }
  }

  async loadScheduleById(id) {
    if (!this.supabase || !id) return null;
    try {
      const { data, error } = await this.supabase
        .from('flow_schedules')
        .select('id, user_id, flow_id, brand_id, cron_expression, is_active, job_name, created_at, entity_ids, campaign_ids, audience_id, metadata_config, production_count, aspect_ratio, production_specifications')
        .eq('id', id)
        .eq('user_id', this.userId)
        .single();
      if (error || !data) return null;
      const s = data;
      const firstEntityId = Array.isArray(s.entity_ids) ? s.entity_ids[0] : s.entity_ids;
      let flowName = '—';
      let entityName = '—';
      let campaignName = '—';
      let audienceName = '—';
      let brandName = '—';
      if (s.flow_id) {
        const { data: f } = await this.supabase.from('content_flows').select('name').eq('id', s.flow_id).maybeSingle();
        if (f?.name) flowName = f.name;
      }
      if (firstEntityId) {
        const { data: e } = await this.supabase.from('brand_entities').select('name').eq('id', firstEntityId).maybeSingle();
        if (e?.name) entityName = e.name;
      }
      const firstCampaignId = Array.isArray(s.campaign_ids) ? s.campaign_ids[0] : s.campaign_ids;
      if (firstCampaignId) {
        const { data: c } = await this.supabase.from('campaigns').select('nombre_campana').eq('id', firstCampaignId).maybeSingle();
        if (c?.nombre_campana) campaignName = c.nombre_campana;
      }
      if (s.audience_id) {
        const { data: a } = await this.supabase.from('audiences').select('name').eq('id', s.audience_id).maybeSingle();
        if (a?.name) audienceName = a.name;
      }
      if (s.brand_id) {
        const { data: b } = await this.supabase.from('brands').select('project_id').eq('id', s.brand_id).maybeSingle();
        if (b?.project_id) {
          const { data: bc } = await this.supabase.from('brand_containers').select('nombre_marca').eq('id', b.project_id).maybeSingle();
          if (bc?.nombre_marca) brandName = bc.nombre_marca;
        }
      }
      return {
        ...s,
        flow_name: flowName,
        entity_name: entityName,
        campaign_name: campaignName,
        audience_name: audienceName,
        brand_name: brandName
      };
    } catch (e) {
      console.error('TasksView loadScheduleById:', e);
      return null;
    }
  }

  async loadEntities() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data, error } = await this.supabase
        .from('brand_entities')
        .select('id, name, entity_type')
        .eq('brand_container_id', this.brandContainerId)
        .order('name');
      this.entities = error ? [] : (data || []);
      return this.entities;
    } catch (e) {
      console.error('TasksView loadEntities:', e);
      return [];
    }
  }

  async loadCampaigns() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data, error } = await this.supabase
        .from('campaigns')
        .select('id, nombre_campana')
        .eq('brand_container_id', this.brandContainerId)
        .order('updated_at', { ascending: false });
      this.campaigns = error ? [] : (data || []);
      return this.campaigns;
    } catch (e) {
      console.error('TasksView loadCampaigns:', e);
      return [];
    }
  }

  async loadAudiences() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data: brand } = await this.supabase
        .from('brands')
        .select('id')
        .eq('project_id', this.brandContainerId)
        .maybeSingle();
      if (!brand?.id) return [];
      const { data, error } = await this.supabase
        .from('audiences')
        .select('id, name')
        .eq('brand_id', brand.id)
        .order('name');
      this.audiences = error ? [] : (data || []);
      return this.audiences;
    } catch (e) {
      console.error('TasksView loadAudiences:', e);
      return [];
    }
  }

  formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Descripción legible del cron (ej: "Todos los días a las 9:00"). */
  cronDescription(cron) {
    if (!cron || typeof cron !== 'string') return cron || '—';
    if (cron === '0 9 * * *') return 'Todos los días a las 9:00';
    if (cron === '0 */6 * * *') return 'Cada 6 horas';
    if (cron === '0 * * * *') return 'Cada hora';
    if (/^0 0 \* \* \*$/.test(cron)) return 'Diario a medianoche';
    return cron;
  }

  escapeHtml(s) {
    if (s == null || s === '') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed; top: 80px; right: 2rem; padding: 1rem 1.5rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 10000;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3500);
  }

  async renderTasksList() {
    const list = await this.loadSchedules();
    const grid = document.getElementById('tasksGrid');
    const empty = document.getElementById('tasksEmpty');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
      }
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = list.map(t => `
      <article class="task-card" data-task-id="${t.id}" role="button" tabindex="0">
        <div class="task-card-inner">
          <div class="task-card-header">
            <h3 class="task-card-title">${this.escapeHtml(t.job_name)}</h3>
            <span class="task-card-badge ${t.is_active ? 'task-card-badge-active' : 'task-card-badge-paused'}">${t.is_active ? 'Activa' : 'Pausada'}</span>
          </div>
          <p class="task-card-flow">Flujo: ${this.escapeHtml(t.flow_name)}</p>
          <p class="task-card-cron"><i class="fas fa-clock"></i> ${this.escapeHtml(this.cronDescription(t.cron_expression))}</p>
          <div class="task-card-meta">
            <span><strong>Entidad:</strong> ${this.escapeHtml(t.entity_name)}</span>
            <span><strong>Campaña:</strong> ${this.escapeHtml(t.campaign_name)}</span>
            <span><strong>Audiencia:</strong> ${this.escapeHtml(t.audience_name)}</span>
          </div>
          <div class="task-card-footer">
            Aspecto: ${this.escapeHtml(t.aspect_ratio || '1:1')} · Producciones: ${t.production_count ?? 1}
          </div>
        </div>
      </article>
    `).join('');
    grid.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-task-id');
        if (id) this.navigateToTask(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  getTasksBasePath() {
    const base = this.organizationId && typeof window.getOrgPathPrefix === 'function'
      ? (window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') + '/tasks')
      : (this.organizationId ? `/org/${this.organizationId}/tasks` : '/tasks');
    return base;
  }

  navigateToTask(id) {
    const base = this.getTasksBasePath();
    if (window.router) window.router.navigate(`${base}/${id}`, true);
  }

  async renderTaskDetail() {
    const task = await this.loadScheduleById(this.taskId);
    const container = document.getElementById('taskDetailContainer');
    if (!task || !container) {
      if (container) container.style.display = 'none';
      document.getElementById('tasksListContainer').style.display = 'block';
      return;
    }
    document.getElementById('taskDetailTitle').textContent = task.job_name || 'Tarea programada';
    document.getElementById('taskDetailFlow').textContent = `Flujo: ${task.flow_name}`;
    document.getElementById('taskDetailCron').textContent = this.cronDescription(task.cron_expression);
    document.getElementById('taskDetailStatus').textContent = task.is_active ? 'Activa' : 'Pausada';
    document.getElementById('taskDetailStatus').className = 'task-detail-status ' + (task.is_active ? 'task-detail-status-active' : 'task-detail-status-paused');
    document.getElementById('taskDetailEntity').textContent = task.entity_name || '—';
    document.getElementById('taskDetailCampaign').textContent = task.campaign_name || '—';
    document.getElementById('taskDetailAudience').textContent = task.audience_name || '—';
    document.getElementById('taskDetailBrand').textContent = task.brand_name || '—';
    document.getElementById('taskDetailAspect').textContent = task.aspect_ratio || '1:1';
    document.getElementById('taskDetailProductionCount').textContent = String(task.production_count ?? 1);
    document.getElementById('taskDetailSpecs').textContent = task.production_specifications || '—';
    document.getElementById('taskDetailCreated').textContent = this.formatDate(task.created_at);

    const editBtn = document.getElementById('taskDetailEditBtn');
    if (editBtn) editBtn.onclick = () => this.openEditModal(task);

    const toggleBtn = document.getElementById('taskDetailToggleActiveBtn');
    const toggleLabel = document.getElementById('taskDetailToggleActiveLabel');
    if (toggleBtn) {
      toggleBtn.onclick = () => this.toggleActive(task);
      const icon = toggleBtn.querySelector('i');
      if (task.is_active) {
        if (icon) icon.className = 'fas fa-pause-circle';
        if (toggleLabel) toggleLabel.textContent = 'Pausar';
      } else {
        if (icon) icon.className = 'fas fa-play-circle';
        if (toggleLabel) toggleLabel.textContent = 'Activar';
      }
    }

    const duplicateBtn = document.getElementById('taskDetailDuplicateBtn');
    if (duplicateBtn) duplicateBtn.onclick = () => this.duplicateSchedule(task);

    const deleteBtn = document.getElementById('taskDetailDeleteBtn');
    if (deleteBtn) deleteBtn.onclick = () => this.confirmDeleteSchedule(task);
  }

  /** Activar o pausar la tarea (toggle is_active). */
  async toggleActive(task) {
    if (!this.supabase || !task?.id) return;
    const newActive = !task.is_active;
    const { error } = await this.supabase
      .from('flow_schedules')
      .update({ is_active: newActive })
      .eq('id', task.id)
      .eq('user_id', this.userId);
    if (error) {
      console.error('TasksView toggleActive:', error);
      this.showNotification('No se pudo cambiar el estado', 'error');
      return;
    }
    this.showNotification(newActive ? 'Tarea activada' : 'Tarea pausada', 'success');
    await this.renderTaskDetail();
  }

  /** Duplicar schedule: mismo flujo y configuración, job_name único. */
  async duplicateSchedule(task) {
    if (!this.supabase || !task?.id) return;
    const baseName = (task.job_name || 'Tarea').trim();
    const suffix = ` (copia ${new Date().toISOString().slice(0, 10)})`;
    let jobName = baseName + suffix;
    if (jobName.length > 255) jobName = baseName.slice(0, 255 - suffix.length) + suffix;
    const { data: existing } = await this.supabase.from('flow_schedules').select('id').eq('job_name', jobName).maybeSingle();
    if (existing) jobName = `${baseName} (copia ${Date.now()})`;
    const insert = {
      user_id: task.user_id,
      flow_id: task.flow_id,
      brand_id: task.brand_id,
      cron_expression: task.cron_expression,
      is_active: false,
      job_name: jobName,
      entity_ids: Array.isArray(task.entity_ids) ? (task.entity_ids.length ? task.entity_ids : null) : (task.entity_ids || null),
      campaign_ids: Array.isArray(task.campaign_ids) ? (task.campaign_ids.length ? task.campaign_ids : null) : (task.campaign_ids ? [task.campaign_ids] : null),
      audience_id: task.audience_id || null,
      metadata_config: task.metadata_config ?? {},
      production_count: task.production_count ?? 1,
      aspect_ratio: task.aspect_ratio || '1:1',
      production_specifications: task.production_specifications || null
    };
    const { data: created, error } = await this.supabase.from('flow_schedules').insert(insert).select('id').single();
    if (error) {
      console.error('TasksView duplicateSchedule:', error);
      this.showNotification('No se pudo duplicar la tarea', 'error');
      return;
    }
    this.showNotification('Tarea duplicada. La copia está pausada.', 'success');
    if (window.router && created?.id) window.router.navigate(`${this.getTasksBasePath()}/${created.id}`, true);
    await this.render();
  }

  /** Pedir confirmación y eliminar el schedule. */
  async confirmDeleteSchedule(task) {
    if (!task?.id) return;
    const name = task.job_name || 'esta tarea';
    if (!confirm(`¿Eliminar la tarea "${name}"? Esta acción no se puede deshacer.`)) return;
    await this.deleteSchedule(task.id);
  }

  async deleteSchedule(scheduleId) {
    if (!this.supabase || !scheduleId) return;
    const { error } = await this.supabase
      .from('flow_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('user_id', this.userId);
    if (error) {
      console.error('TasksView deleteSchedule:', error);
      this.showNotification('No se pudo eliminar la tarea', 'error');
      return;
    }
    this.showNotification('Tarea eliminada', 'success');
    if (window.router) window.router.navigate(this.getTasksBasePath(), true);
    await this.render();
  }

  openEditModal(task) {
    Promise.all([this.loadEntities(), this.loadCampaigns(), this.loadAudiences()]).then(() => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay task-modal-overlay';
      modal.id = 'taskEditModal';
      const taskEntityId = Array.isArray(task.entity_ids) ? task.entity_ids[0] : task.entity_ids;
      const entityOpts = this.entities.map(e => `<option value="${e.id}" ${e.id === taskEntityId ? 'selected' : ''}>${this.escapeHtml(e.name)}${e.entity_type ? ' (' + this.escapeHtml(e.entity_type) + ')' : ''}</option>`).join('');
      const taskCampaignId = Array.isArray(task.campaign_ids) ? task.campaign_ids[0] : task.campaign_ids;
      const campaignOpts = this.campaigns.map(c => `<option value="${c.id}" ${c.id === taskCampaignId ? 'selected' : ''}>${this.escapeHtml(c.nombre_campana)}</option>`).join('');
      const audienceOpts = this.audiences.map(a => `<option value="${a.id}" ${a.id === task.audience_id ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`).join('');
      const aspectOpts = this.ASPECT_RATIOS.map(ar => `<option value="${ar}" ${ar === (task.aspect_ratio || '1:1') ? 'selected' : ''}>${ar}</option>`).join('');
      modal.innerHTML = `
        <div class="modal task-modal">
          <div class="modal-header">
            <h3>Configurar tarea</h3>
            <button type="button" class="modal-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <label>Entidad</label>
            <select id="taskEditEntity" class="task-edit-select">
              <option value="">Ninguna</option>
              ${entityOpts}
            </select>
            <label>Campaña</label>
            <select id="taskEditCampaign" class="task-edit-select">
              <option value="">Ninguna</option>
              ${campaignOpts}
            </select>
            <label>Audiencia</label>
            <select id="taskEditAudience" class="task-edit-select">
              <option value="">Ninguna</option>
              ${audienceOpts}
            </select>
            <label>Relación de aspecto</label>
            <select id="taskEditAspectRatio" class="task-edit-select">
              ${aspectOpts}
            </select>
            <label>Nº producciones por ejecución</label>
            <input type="number" id="taskEditProductionCount" min="1" value="${task.production_count ?? 1}" />
            <label>Activa</label>
            <input type="checkbox" id="taskEditIsActive" ${task.is_active ? 'checked' : ''} />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost modal-cancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="taskEditSubmit">Guardar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.modal-close').onclick = () => modal.remove();
      modal.querySelector('.modal-cancel').onclick = () => modal.remove();
      modal.querySelector('#taskEditSubmit').onclick = async () => {
        const entityId = document.getElementById('taskEditEntity').value || null;
        const campaignId = document.getElementById('taskEditCampaign').value || null;
        const audienceId = document.getElementById('taskEditAudience').value || null;
        const aspectRatio = document.getElementById('taskEditAspectRatio').value || '1:1';
        const productionCount = parseInt(document.getElementById('taskEditProductionCount').value, 10) || 1;
        const isActive = document.getElementById('taskEditIsActive').checked;
        if (!this.supabase || !task.id) return;
        await this.supabase
          .from('flow_schedules')
          .update({
            entity_ids: entityId ? (Array.isArray(entityId) ? entityId : [entityId]) : null,
            campaign_ids: campaignId ? [campaignId] : null,
            audience_id: audienceId,
            aspect_ratio: aspectRatio,
            production_count: productionCount,
            is_active: isActive
          })
          .eq('id', task.id)
          .eq('user_id', this.userId);
        modal.remove();
        await this.renderTaskDetail();
      };
    });
  }

  setupEventListeners() {
    const backBtn = document.getElementById('backToTasksBtn');
    if (backBtn) {
      backBtn.onclick = () => {
        if (window.router) window.router.navigate(this.getTasksBasePath(), true);
      };
    }
  }
}

window.TasksView = TasksView;
