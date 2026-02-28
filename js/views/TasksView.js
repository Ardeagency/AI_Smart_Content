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

  /** Cargar flow_schedules del usuario con relaciones. */
  async loadSchedules() {
    if (!this.supabase || !this.userId) return [];
    try {
      const { data, error } = await this.supabase
        .from('flow_schedules')
        .select(`
          id,
          user_id,
          flow_id,
          brand_id,
          cron_expression,
          is_active,
          job_name,
          created_at,
          entity_id,
          campaign_id,
          audience_id,
          production_count,
          aspect_ratio,
          production_specifications,
          content_flows (id, name),
          brand_entities (id, name),
          campaigns (id, nombre_campana),
          audiences (id, name),
          brands (id, project_id)
        `)
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('TasksView loadSchedules:', error);
        return [];
      }
      const schedules = data || [];
      const projectIds = [...new Set(schedules.map(s => s.brands?.project_id).filter(Boolean))];
      let brandNames = {};
      if (projectIds.length && this.supabase) {
        const { data: containers } = await this.supabase
          .from('brand_containers')
          .select('id, nombre_marca')
          .in('id', projectIds);
        if (containers) {
          containers.forEach(c => { brandNames[c.id] = c.nombre_marca || '—'; });
        }
      }
      this.schedules = schedules.map(s => {
        const flow = s.content_flows;
        const flowName = (flow && (flow.name || (Array.isArray(flow) && flow[0]?.name))) ? (flow.name || flow[0].name) : '—';
        const entity = s.brand_entities;
        const entityName = (entity && (entity.name || (Array.isArray(entity) && entity[0]?.name))) ? (entity.name || entity[0].name) : '—';
        const campaign = s.campaigns;
        const campaignName = (campaign && (campaign.nombre_campana || (Array.isArray(campaign) && campaign[0]?.nombre_campana))) ? (campaign.nombre_campana || campaign[0].nombre_campana) : '—';
        const audience = s.audiences;
        const audienceName = (audience && (audience.name || (Array.isArray(audience) && audience[0]?.name))) ? (audience.name || audience[0].name) : '—';
        const brandProjectId = s.brands?.project_id ?? (Array.isArray(s.brands) && s.brands[0]?.project_id) ? s.brands[0].project_id : null;
        const brandName = brandProjectId ? (brandNames[brandProjectId] || '—') : '—';
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
        .select(`
          id,
          user_id,
          flow_id,
          brand_id,
          cron_expression,
          is_active,
          job_name,
          created_at,
          entity_id,
          campaign_id,
          audience_id,
          metadata_config,
          production_count,
          aspect_ratio,
          production_specifications,
          content_flows (id, name),
          brand_entities (id, name),
          campaigns (id, nombre_campana),
          audiences (id, name),
          brands (id, project_id)
        `)
        .eq('id', id)
        .eq('user_id', this.userId)
        .single();
      if (error || !data) return null;
      const s = data;
      const flow = s.content_flows;
      const flowName = (flow && (flow.name || (Array.isArray(flow) && flow[0]?.name))) ? (flow.name || flow[0].name) : '—';
      const entity = s.brand_entities;
      const entityName = (entity && (entity.name || (Array.isArray(entity) && entity[0]?.name))) ? (entity.name || entity[0].name) : '—';
      const campaign = s.campaigns;
      const campaignName = (campaign && (campaign.nombre_campana || (Array.isArray(campaign) && campaign[0]?.nombre_campana))) ? (campaign.nombre_campana || campaign[0].nombre_campana) : '—';
      const audience = s.audiences;
      const audienceName = (audience && (audience.name || (Array.isArray(audience) && audience[0]?.name))) ? (audience.name || audience[0].name) : '—';
      let brandName = '—';
      const projectId = s.brands?.project_id ?? (Array.isArray(s.brands) && s.brands[0]?.project_id) ? s.brands[0].project_id : null;
      if (projectId) {
        const { data: bc } = await this.supabase.from('brand_containers').select('nombre_marca').eq('id', projectId).maybeSingle();
        if (bc?.nombre_marca) brandName = bc.nombre_marca;
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
  }

  openEditModal(task) {
    Promise.all([this.loadEntities(), this.loadCampaigns(), this.loadAudiences()]).then(() => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay task-modal-overlay';
      modal.id = 'taskEditModal';
      const entityOpts = this.entities.map(e => `<option value="${e.id}" ${e.id === task.entity_id ? 'selected' : ''}>${this.escapeHtml(e.name)}${e.entity_type ? ' (' + this.escapeHtml(e.entity_type) + ')' : ''}</option>`).join('');
      const campaignOpts = this.campaigns.map(c => `<option value="${c.id}" ${c.id === task.campaign_id ? 'selected' : ''}>${this.escapeHtml(c.nombre_campana)}</option>`).join('');
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
            entity_id: entityId,
            campaign_id: campaignId,
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
