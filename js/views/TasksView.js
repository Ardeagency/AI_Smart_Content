/**
 * TasksView - Vista de tareas programadas (flow_schedules)
 * Lista las tareas del usuario y permite asignar entidad, campaña, audiencia y editar configuración.
 */
class TasksView extends BaseView {
  static cacheable = true;
  static get documentTitle() { return __('Tareas programadas'); }

  // Paleta para personalizar el color de una tarea en el calendario (misma
  // paleta que las burbujas de Monitoreo). '' = volver al estilo neutro.
  // flow_schedules.color es text[] para soportar degradados a futuro; hoy
  // se usa un solo color (color[0]).
  // 10 tonos curados en orden espectral: cada uno distinguible del resto a
  // tamaño swatch (sin pares casi-idénticos como violeta/violeta o rojo/rosa).
  static PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  ];

  constructor() {
    super();
    this.templatePath = null;
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
    this.currentFilter = 'history';
    this.taskCardLimit = 9;
    this.taskCardDisplayCount = 9;
    this.viewMode = 'list';      // 'list' | 'calendar'
    this.calWeekStart = null;    // Date (lunes de la semana visible en calendario)
  }

  renderHTML() {
    return `
<!-- Vista Tareas programadas (flow_schedules) -->
<div class="tasks-page" id="tasksPage">
  <div class="tasks-container tasks-list-view" id="tasksListContainer">
    <div class="tasks-header-row">
      <div class="tasks-header">
        <h1 class="tasks-title">${__('Tareas programadas')}</h1>
        <p class="tasks-subtitle">${__('Gestiona tus flujos programados y asigna entidad, campaña y audiencia a cada tarea.')}</p>
      </div>
      <div class="tasks-header-actions">
        <div class="tasks-viewtoggle" id="tasksViewToggle" role="tablist" aria-label="${__('Vista')}">
          <button type="button" class="tasks-viewtoggle-btn active" data-view="list" aria-label="${__('Vista de lista')}"><i class="aisc-ico aisc-ico--grid"></i> ${__('Lista')}</button>
          <button type="button" class="tasks-viewtoggle-btn" data-view="calendar" aria-label="${__('Vista de calendario')}"><i class="aisc-ico aisc-ico--calendar"></i> ${__('Calendario')}</button>
        </div>
        <a class="btn btn-primary tasks-create-btn" id="tasksCreateNewBtn" href="#">
          <i class="aisc-ico aisc-ico--add"></i> ${__('Crear tarea')}
        </a>
      </div>
    </div>

    <nav class="tasks-tabs" id="tasksTabs" aria-label="${__('Filtrar tareas')}">
      <button type="button" class="tasks-tab active" data-filter="history" id="tasksTabHistory">
        ${__('Historial')}
      </button>
      <button type="button" class="tasks-tab" data-filter="all" id="tasksTabAll">
        ${__('Todas')} (<span id="tasksCountAll">0</span>)
      </button>
      <button type="button" class="tasks-tab" data-filter="active" id="tasksTabActive">
        ${__('Activas')} (<span id="tasksCountActive">0</span>)
      </button>
      <button type="button" class="tasks-tab" data-filter="paused" id="tasksTabPaused">
        ${__('Pausadas')} (<span id="tasksCountPaused">0</span>)
      </button>
      <button type="button" class="tasks-tab" data-filter="draft" id="tasksTabDraft">
        ${__('Borradores')} (<span id="tasksCountDraft">0</span>)
      </button>
    </nav>

    <div class="tasks-cards-grid" id="tasksGrid">
      ${this.skeletonGrid(6, 'lg')}
    </div>
    ${this.emptyState({
      id: 'tasksEmpty',
      hidden: true,
      iconSrc: '/recursos/icons/task.svg',
      icon: 'fa-calendar-alt',
      title: __('Aún no tienes tareas programadas.'),
      subtitle: __('Las tareas se crean al programar un flujo desde el Estudio. Cuando tengas alguna, aparecerán aquí y podrás asignarles entidad, campaña y audiencia.'),
    })}

    <div class="tasks-load-more-wrap" id="tasksLoadMoreWrap" style="display: none;">
      <button type="button" class="btn tasks-load-more" id="tasksLoadMoreBtn">${__('Load More Tasks')}</button>
    </div>
  </div>

  <!-- Vista detalle/edición de una tarea -->
  <div class="task-detail-wrapper" id="taskDetailContainer" style="display: none;">
    <div class="task-detail">
      <header class="task-detail-header">
        <div class="task-detail-header-left">
          <a class="btn btn-ghost task-detail-back" id="backToTasksBtn">
            <i class="aisc-ico aisc-ico--arrow-left"></i> ${__('Volver')}
          </a>
          <div class="task-detail-title-block">
            <h1 class="task-detail-title" id="taskDetailTitle">—</h1>
            <p class="task-detail-subtitle" id="taskDetailSubtitle">—</p>
          </div>
        </div>
        <div class="task-detail-header-right">
          <button type="button" class="btn btn-ghost" id="taskDetailToggleActiveBtn" title="${__('Activar o pausar')}"><i class="aisc-ico aisc-ico--pause"></i> <span id="taskDetailToggleActiveLabel">${__('Pausar')}</span></button>
          <button type="button" class="btn btn-ghost" id="taskDetailDuplicateBtn"><i class="aisc-ico aisc-ico--copy"></i> ${__('Duplicar')}</button>
          <button type="button" class="btn btn-ghost task-detail-danger" id="taskDetailDeleteBtn"><i class="aisc-ico aisc-ico--delete"></i> ${__('Eliminar')}</button>
          <button type="button" class="btn btn-primary" id="taskDetailSaveBtn"><i class="aisc-ico aisc-ico--save"></i> ${__('Guardar')}</button>
        </div>
      </header>

      <div class="task-detail-grid">
        <!-- Dashboard (arriba izq, span 2 col) -->
        <section class="task-detail-section task-detail-dashboard">
          <header class="task-detail-section-header">
            <h2 class="task-detail-section-title">${__('Dashboard')}</h2>
          </header>
          <div class="task-detail-metrics" id="taskDetailMetrics"></div>
        </section>

        <!-- Editor (derecha, span 2 row) -->
        <aside class="task-detail-section task-detail-editor">
          <header class="task-detail-section-header">
            <h2 class="task-detail-section-title">${__('Editar')}</h2>
          </header>
          <div class="task-detail-editor-body">
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Frecuencia')}</label>
              <select id="taskDetailFreq" class="task-detail-select" aria-label="${__('Frecuencia')}" disabled>
                <option value="daily">${__('Diario')}</option>
                <option value="weekly">${__('Semanal')}</option>
                <option value="monthly">${__('Mensual')}</option>
              </select>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Regla activa')}</label>
              <p class="task-detail-readonly" id="taskDetailRuleActive">—</p>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Creación')}</label>
              <p class="task-detail-readonly" id="taskDetailCreated">—</p>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Marca')}</label>
              <select id="taskDetailBrandSelect" class="task-detail-select" aria-label="${__('Marca')}"><option value="">—</option></select>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Campaña')}</label>
              <select id="taskDetailCampaignSelect" class="task-detail-select" aria-label="${__('Campaña')}"><option value="">—</option></select>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Entidad')}</label>
              <select id="taskDetailEntitySelect" class="task-detail-select" aria-label="${__('Entidad')}"><option value="">—</option></select>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Audiencia')}</label>
              <select id="taskDetailAudienceSelect" class="task-detail-select" aria-label="${__('Audiencia')}"><option value="">—</option></select>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Formato')}</label>
              <select id="taskDetailAspectSelect" class="task-detail-select" aria-label="Aspect ratio">
                <option value="1:1">1:1</option>
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
                <option value="4:5">4:5</option>
              </select>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Color en el calendario')}</label>
              <div class="task-detail-colors" id="taskDetailColorSwatches" role="group" aria-label="${__('Color en el calendario')}"></div>
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Producciones por ejecución')}</label>
              <input type="number" id="taskDetailProductionCountInput" class="task-detail-input" min="1" value="1" aria-label="${__('Número de producciones')}" />
            </div>
            <div class="task-detail-field">
              <label class="task-detail-label">${__('Especificaciones')}</label>
              <textarea id="taskDetailSpecsText" class="task-detail-textarea" rows="4" placeholder="${__('Instrucciones de producción...')}"></textarea>
            </div>
          </div>
        </aside>

        <!-- Runs (abajo izq, span 2 col) -->
        <section class="task-detail-section task-detail-runs">
          <header class="task-detail-section-header">
            <h2 class="task-detail-section-title">${__('Últimas ejecuciones')}</h2>
          </header>
          <div class="task-detail-runs-body" id="taskDetailRunsBody"></div>
        </section>
      </div>
    </div>
  </div>
</div>
`;
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
        this._setupLive();
      }
      this.setupEventListeners();
    } catch (err) {
      console.error('TasksView render:', err);
      const container = document.getElementById('app-container');
      if (container) {
        const wrap = container.querySelector('.tasks-page') || container;
        wrap.innerHTML = `
          <div class="tasks-page" style="padding: 2rem;">
            <h1 class="tasks-title">${__('Tareas programadas')}</h1>
            <div class="error-container" style="margin-top: 2rem; text-align: center;">
              <p style="color: var(--text-secondary);">${__('Error al cargar las tareas.')} ${err && err.message ? err.message : __('Por favor, recarga la página.')}</p>
              <button type="button" class="btn btn-primary" style="margin-top: 1rem;" onclick="window.location.reload()">${__('Recargar')}</button>
            </div>
          </div>`;
      }
    }
  }

  /* Datos en vivo: realtime sobre flow_schedules + flow_runs del usuario, mas
     polling de respaldo. El snapshot cubre schedules Y runs (pestana Historial)
     para que el gate detecte cambios en ambos. Re-pinta solo el grid y solo si
     algo cambio. Teardown automatico en BaseView.destroy(). */
  _setupLive() {
    if (!this.supabase || !this.userId || this._liveReady) return;
    this._liveReady = true;

    this._liveSnapshot = async () => {
      const orgId = this.organizationId || null;
      const schedules = await this._fetchSchedules(this.userId, orgId);
      let runsQ = this.supabase
        .from('flow_runs')
        .select('id, status, created_at')
        .eq('user_id', this.userId);
      // Aislamiento por org activa también en el snapshot live del calendario.
      if (orgId) runsQ = runsQ.eq('organization_id', orgId);
      const { data: runs } = await runsQ
        .order('created_at', { ascending: false })
        .limit(50);
      return { schedules, runs: runs || [] };
    };

    this._liveTick = () => this.liveRefresh('tasks',
      () => this._liveSnapshot(),
      async () => {
        window.apiClient?.invalidate?.(`tasks:schedules:${this.userId}`);
        await this.renderTasksList();
      });

    // Sembrar la firma con el estado actual para que el 1er tick no re-pinte de mas.
    this._liveSnapshot()
      .then(d => { if (!this._liveSig) this._liveSig = {}; this._liveSig['tasks'] = this._dataSignature(d); })
      .catch(() => {});

    const userFilter = `user_id=eq.${this.userId}`;
    this.liveSubscribe([
      { name: 'sch',  table: 'flow_schedules', filter: userFilter, onChange: () => this._liveTick() },
      { name: 'runs', table: 'flow_runs',      filter: userFilter, onChange: () => this._liveTick() },
    ]);
    this.startLivePoll(60000, () => this._liveTick());
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
      // Regla central de aislamiento: marca dentro de la org activa, sin fallback
      // cross-org a user_id (ver js/org-url.js resolveActiveBrandContainerId).
      return await window.resolveActiveBrandContainerId(this.supabase, this.organizationId, this.userId);
    } catch (e) {
      console.error('TasksView getBrandContainerId:', e);
      return null;
    }
  }

  /** Cargar flow_schedules del usuario. Sin embeds para evitar 400; relaciones se cargan aparte. */
  async loadSchedules() {
    if (!this.supabase || !this.userId) return [];
    const userId = this.userId;
    try {
      const orgId = this.organizationId || null;
      const fetcher = () => this._fetchSchedules(userId, orgId);
      // Cache por org: sin esto el calendario de una org se mostraria en otra.
      this.schedules = window.apiClient
        ? await window.apiClient.query(`tasks:schedules:${orgId || userId}`, fetcher, { ttl: 30 * 1000, staleWhileRevalidate: true })
        : await fetcher();
      return this.schedules;
    } catch (e) {
      console.error('TasksView loadSchedules:', e);
      return [];
    }
  }

  /** Implementación real (separada para que apiClient pueda envolverla). Errores propagan al caller. */
  async _fetchSchedules(userId, orgId = null) {
    let q = this.supabase
      .from('flow_schedules')
      .select('id, user_id, flow_id, brand_id, cron_expression, status, job_name, created_at, entity_ids, campaign_ids, audience_ids, production_count, aspect_ratio, production_specifications, color')
      .eq('user_id', userId);
    // Aislamiento por org activa: flow_schedules tiene organization_id; sin este
    // filtro un usuario multi-org ve las tareas de TODAS sus orgs en cada workspace.
    if (orgId) q = q.eq('organization_id', orgId);
    const { data, error } = await q
      .order('created_at', { ascending: false });
    if (error) throw error;
    const schedules = data || [];
    if (schedules.length === 0) return [];
    {
      const flowIds = [...new Set(schedules.map(s => s.flow_id).filter(Boolean))];
      const entityIds = [...new Set(schedules.flatMap(s => Array.isArray(s.entity_ids) ? s.entity_ids : (s.entity_ids ? [s.entity_ids] : [])).filter(Boolean))];
      const campaignIds = [...new Set(schedules.flatMap(s => Array.isArray(s.campaign_ids) ? s.campaign_ids : (s.campaign_ids ? [s.campaign_ids] : [])).filter(Boolean))];
      const audienceIds = [...new Set(schedules.flatMap(s => Array.isArray(s.audience_ids) ? s.audience_ids : (s.audience_ids ? [s.audience_ids] : [])).filter(Boolean))];
      const brandIds = [...new Set(schedules.map(s => s.brand_id).filter(Boolean))];

      const [flowsRes, entitiesRes, campaignsRes, audiencesRes, brandsRes] = await Promise.all([
        flowIds.length ? this.supabase.from('content_flows').select('id, name, flow_image_url').in('id', flowIds) : { data: [] },
        entityIds.length ? this.supabase.from('brand_entities').select('id, name').in('id', entityIds) : { data: [] },
        campaignIds.length ? this.supabase.from('campaigns').select('id, nombre_campana').in('id', campaignIds) : { data: [] },
        audienceIds.length ? this.supabase.from('audience_personas').select('id, name').in('id', audienceIds) : { data: [] },
        brandIds.length ? this.supabase.from('brand_containers').select('id, nombre_marca').in('id', brandIds) : { data: [] }
      ]);

      const flowMap = (flowsRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const flowImageMap = (flowsRes.data || []).reduce((acc, r) => { acc[r.id] = r.flow_image_url || null; return acc; }, {});
      const entityMap = (entitiesRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const campaignMap = (campaignsRes.data || []).reduce((acc, r) => { acc[r.id] = r.nombre_campana; return acc; }, {});
      const audienceMap = (audiencesRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const brandNames = (brandsRes.data || []).reduce((acc, r) => { acc[r.id] = r.nombre_marca || '—'; return acc; }, {});

      let entityIdToImageUrl = {};
      if (entityIds.length) {
        const { data: products } = await this.supabase
          .from('products')
          .select('id, entity_id')
          .in('entity_id', entityIds)
          .order('created_at', { ascending: true });
        const entityToProductId = {};
        (products || []).forEach(p => {
          if (p.entity_id && !entityToProductId[p.entity_id]) entityToProductId[p.entity_id] = p.id;
        });
        const productIds = [...new Set(Object.values(entityToProductId).filter(Boolean))];
        if (productIds.length) {
          const { data: imgs } = await this.supabase
            .from('product_images')
            .select('product_id, image_url, image_type, image_order')
            .in('product_id', productIds)
            .order('image_order', { ascending: true });
          const byProduct = {};
          (imgs || []).forEach(img => {
            if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
            byProduct[img.product_id].push(img);
          });
          Object.keys(entityToProductId).forEach(entityId => {
            const pid = entityToProductId[entityId];
            const list = byProduct[pid] || [];
            const main = list.find(i => (i.image_type || '').toLowerCase() === 'principal') || list[0];
            if (main && main.image_url) entityIdToImageUrl[entityId] = main.image_url;
          });
        }
      }

      return schedules.map(s => {
        const flowName = (s.flow_id && flowMap[s.flow_id]) || '—';
        const flowImageUrl = (s.flow_id && flowImageMap[s.flow_id]) || null;
        const eids = Array.isArray(s.entity_ids) ? s.entity_ids : (s.entity_ids ? [s.entity_ids] : []);
        const entityImageUrls = eids.map(id => entityIdToImageUrl[id]).filter(Boolean);
        const firstEntityId = eids[0];
        const entityName = (firstEntityId && entityMap[firstEntityId]) || '—';
        const firstCampaignId = Array.isArray(s.campaign_ids) ? s.campaign_ids[0] : s.campaign_ids;
        const campaignName = (firstCampaignId && campaignMap[firstCampaignId]) || '—';
        const firstAudienceId = Array.isArray(s.audience_ids) ? s.audience_ids[0] : s.audience_ids;
        const audienceName = (firstAudienceId && audienceMap[firstAudienceId]) || '—';
        const brandName = (s.brand_id && brandNames[s.brand_id]) || '—';
        return {
          ...s,
          is_active: s.status === 'active',
          flow_name: flowName,
          flow_image_url: flowImageUrl,
          entity_image_urls: entityImageUrls,
          entity_name: entityName,
          campaign_name: campaignName,
          audience_name: audienceName,
          brand_name: brandName
        };
      });
    }
  }

  /** Invalida cache de schedules tras CRUD desde esta vista. La clave del
      cache es por org activa (loadSchedules usa orgId || userId); se invalida
      también la clave por userId para cubrir el caso sin org. */
  _invalidateSchedulesCache() {
    if (window.apiClient && this.userId) {
      if (this.organizationId) window.apiClient.invalidate(`tasks:schedules:${this.organizationId}`);
      window.apiClient.invalidate(`tasks:schedules:${this.userId}`);
    }
  }

  async loadScheduleById(id) {
    if (!this.supabase || !id) return null;
    try {
      const { data, error } = await this.supabase
        .from('flow_schedules')
        .select('id, user_id, flow_id, brand_id, cron_expression, status, job_name, created_at, entity_ids, campaign_ids, audience_ids, metadata_config, production_count, aspect_ratio, production_specifications, color')
        .eq('id', id)
        .eq('user_id', this.userId)
        .single();
      if (error || !data) return null;
      const s = { ...data, is_active: data.status === 'active' };
      const firstEntityId = Array.isArray(s.entity_ids) ? s.entity_ids[0] : s.entity_ids;
      let flowName = '—';
      let flowImageUrl = null;
      let entityName = '—';
      let campaignName = '—';
      let audienceName = '—';
      let brandName = '—';
      if (s.flow_id) {
        const { data: f } = await this.supabase.from('content_flows').select('name, flow_image_url').eq('id', s.flow_id).maybeSingle();
        if (f?.name) flowName = f.name;
        if (f?.flow_image_url) flowImageUrl = f.flow_image_url;
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
      const firstAudienceId = Array.isArray(s.audience_ids) ? s.audience_ids[0] : s.audience_ids;
      if (firstAudienceId) {
        const { data: a } = await this.supabase.from('audience_personas').select('name').eq('id', firstAudienceId).maybeSingle();
        if (a?.name) audienceName = a.name;
      }
      if (s.brand_id) {
        const { data: bc } = await this.supabase.from('brand_containers').select('nombre_marca').eq('id', s.brand_id).maybeSingle();
        if (bc?.nombre_marca) brandName = bc.nombre_marca;
      }
      return {
        ...s,
        flow_name: flowName,
        flow_image_url: flowImageUrl,
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
      const { data, error } = await this.supabase
        .from('audience_personas')
        .select('id, name')
        .eq('brand_container_id', this.brandContainerId)
        .order('name');
      this.audiences = error ? [] : (data || []);
      return this.audiences;
    } catch (e) {
      console.error('TasksView loadAudiences:', e);
      return [];
    }
  }

  /** Marca del container actual para el dropdown.
   *  Modelo nuevo: cada brand_container ES la marca, no hay tabla intermedia. */
  async loadBrands() {
    if (!this.supabase || !this.brandContainerId) return [];
    try {
      const { data: container } = await this.supabase
        .from('brand_containers')
        .select('id, nombre_marca')
        .eq('id', this.brandContainerId)
        .maybeSingle();
      if (!container?.id) {
        this.brands = [];
        return [];
      }
      this.brands = [{ id: container.id, name: container.nombre_marca || '—' }];
      return this.brands;
    } catch (e) {
      console.error('TasksView loadBrands:', e);
      return [];
    }
  }

  formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString((window.i18n && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Descripción legible del cron (ej: "Todos los días a las 9:00"). */
  cronDescription(cron) {
    if (!cron || typeof cron !== 'string') return cron || '—';
    if (cron === '0 9 * * *') return __('Todos los días a las 9:00');
    if (cron === '0 */6 * * *') return __('Cada 6 horas');
    if (cron === '0 * * * *') return __('Cada hora');
    if (/^0 0 \* \* \*$/.test(cron)) return __('Diario a medianoche');
    return cron;
  }

  /** Para la tarjeta: "12:00 PM - Semanal" (hora + frecuencia). */
  cronToScheduleLabel(cron) {
    if (!cron || typeof cron !== 'string') return '—';
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 2) return cron;
    const hour = parseInt(parts[1], 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const timeStr = `${h}:00 ${period}`;
    if (parts[4] !== '*' && parts[4].length > 0) return `${timeStr} - ${__('Semanal')}`;
    if (parts[2] !== '*' && parts[3] === '*') return `${timeStr} - ${__('Mensual')}`;
    return `${timeStr} - ${__('Diario')}`;
  }

  /** Etiqueta corta de frecuencia: Semanal, Diario, etc. */
  cronToFreqLabel(cron) {
    if (!cron || typeof cron !== 'string') return '—';
    const p = cron.trim().split(/\s+/);
    if (p.length < 5) return '—';
    if (p[4] !== '*' && p[4].length > 0) return __('Semanal');
    if (p[2] !== '*' && p[3] === '*') return __('Mensual');
    return __('Diario');
  }

  /** Valor para select FRECUENCIA: weekly, daily, monthly. */
  cronToFreqValue(cron) {
    const p = (cron && typeof cron === 'string') ? cron.trim().split(/\s+/) : [];
    if (p.length >= 5 && p[4] !== '*' && p[4].length > 0) return 'weekly';
    if (p.length >= 5 && p[2] !== '*' && p[3] === '*') return 'monthly';
    return 'daily';
  }

  /** Regla activa en formato "Cada 1 semana · Lun · 09:00". */
  cronToRuleLabel(cron) {
    if (!cron || typeof cron !== 'string') return '—';
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return this.cronDescription(cron);
    const hour = parseInt(parts[1], 10);
    const min = parseInt(parts[0], 10) || 0;
    const hourStr = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    const dowNames = [__('Dom'), __('Lun'), __('Mar'), __('Mié'), __('Jue'), __('Vie'), __('Sáb')];
    const freq = this.cronToFreqValue(cron);
    if (freq === 'weekly') {
      const dowPart = parts[4];
      let dayStr = '—';
      if (dowPart && dowPart !== '*') {
        const days = dowPart.indexOf(',') >= 0 ? dowPart.split(',') : [dowPart];
        dayStr = days.map(d => dowNames[parseInt(d, 10)] || d).join(', ');
      }
      const weekNum = 1;
      return __('Cada {n} semana · {days} · {hour}', { n: weekNum, days: dayStr, hour: hourStr });
    }
    if (freq === 'monthly') return __('Mensual · {hour}', { hour: hourStr });
    return __('Diario · {hour}', { hour: hourStr });
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

  getFilteredSchedules() {
    const list = this.schedules || [];
    if (this.currentFilter === 'active') return list.filter(t => t.status === 'active');
    if (this.currentFilter === 'paused') return list.filter(t => t.status === 'paused');
    if (this.currentFilter === 'draft') return list.filter(t => t.status === 'draft');
    return list;
  }

  updateTasksTabCounts() {
    const list = this.schedules || [];
    const activeCount = list.filter(t => t.status === 'active').length;
    const pausedCount = list.filter(t => t.status === 'paused').length;
    const draftCount = list.filter(t => t.status === 'draft').length;
    const elAll = document.getElementById('tasksCountAll');
    const elActive = document.getElementById('tasksCountActive');
    const elPaused = document.getElementById('tasksCountPaused');
    const elDraft = document.getElementById('tasksCountDraft');
    if (elAll) elAll.textContent = String(list.length);
    if (elActive) elActive.textContent = String(activeCount);
    if (elPaused) elPaused.textContent = String(pausedCount);
    if (elDraft) elDraft.textContent = String(draftCount);
  }

  async renderTasksList() {
    const list = await this.loadSchedules();
    const grid = document.getElementById('tasksGrid');
    const empty = document.getElementById('tasksEmpty');
    const loadMoreWrap = document.getElementById('tasksLoadMoreWrap');
    if (!grid) return;

    this.updateTasksTabCounts();
    this.setupTasksTabs();
    this.setupCreateNewTaskButton();
    this.setupViewToggle();

    if (this.viewMode === 'calendar') {
      if (loadMoreWrap) loadMoreWrap.style.display = 'none';
      grid.classList.add('tasks-grid--calendar');
      this.renderCalendar(grid, empty);
      return;
    }
    grid.classList.remove('tasks-grid--calendar');

    if (this.currentFilter === 'history') {
      if (loadMoreWrap) loadMoreWrap.style.display = 'none';
      await this.renderHistory(grid, empty);
      return;
    }

    const filtered = this.getFilteredSchedules();
    const visible = filtered.slice(0, this.taskCardDisplayCount);
    const hasMore = filtered.length > this.taskCardDisplayCount;

    if (!filtered.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      if (loadMoreWrap) loadMoreWrap.style.display = 'none';
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = visible.map(t => this.renderTaskCard(t)).join('');

    grid.querySelectorAll('.task-card').forEach(card => {
      const id = card.getAttribute('data-task-id');
      card.addEventListener('click', () => {
        if (id) this.navigateToTask(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (id) this.navigateToTask(id);
        }
      });
    });

    if (loadMoreWrap) {
      loadMoreWrap.style.display = hasMore ? 'block' : 'none';
    }
    const loadMoreBtn = document.getElementById('tasksLoadMoreBtn');
    if (loadMoreBtn) {
      loadMoreBtn.onclick = () => {
        this.taskCardDisplayCount += this.taskCardLimit;
        this.renderTasksList();
      };
    }
  }

  /**
   * Run_ids generados por autopilot: runs_inputs.metadata->>'captured_from' =
   * 'autopilot_ingest'. Acotado y deduplicado (un run puede tener varios inputs).
   */
  async _autopilotRunIds() {
    if (!this.supabase) return [];
    try {
      let q = this.supabase
        .from('runs_inputs')
        .select('run_id')
        .eq('metadata->>captured_from', 'autopilot_ingest')
        .order('created_at', { ascending: false })
        .limit(500);
      if (this.organizationId) q = q.eq('organization_id', this.organizationId);
      const { data, error } = await q;
      if (error) throw error;
      return [...new Set((data || []).map(r => r.run_id).filter(Boolean))];
    } catch (e) {
      console.error('TasksView _autopilotRunIds:', e);
      return [];
    }
  }

  /** Carga últimos flow_runs del usuario con flow info, entity, productos, campaña y audiencia. */
  async loadFlowRuns(limit = 50) {
    if (!this.supabase || !this.userId) return [];
    try {
      // Historial = SOLO autopilot. El marcador fiable es runs_inputs.metadata
      // ->>'captured_from' = 'autopilot_ingest' (lo escribe el ciclo autonomo de
      // ai-engine). Los runs manuales llevan 'studio_ui' y los seeds 'demo_backfill';
      // entity_id / n8n_execution_id NO sirven (los manuales tambien los traen).
      const autopilotIds = await this._autopilotRunIds();
      if (!autopilotIds.length) return [];
      const { data: runs, error } = await this.supabase
        .from('flow_runs')
        .select('id, flow_id, brand_id, status, created_at, entity_id, tokens_consumed, campaign_id, persona_id')
        .eq('user_id', this.userId)
        .in('id', autopilotIds)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const list = runs || [];
      if (!list.length) return [];

      const flowIds = [...new Set(list.map(r => r.flow_id).filter(Boolean))];
      const entityIds = [...new Set(list.map(r => r.entity_id).filter(Boolean))];
      const campaignIds = [...new Set(list.map(r => r.campaign_id).filter(Boolean))];
      const personaIds = [...new Set(list.map(r => r.persona_id).filter(Boolean))];

      const [flowsRes, entitiesRes, campaignsRes, personasRes] = await Promise.all([
        flowIds.length ? this.supabase.from('content_flows').select('id, name, flow_image_url').in('id', flowIds) : { data: [] },
        entityIds.length ? this.supabase.from('brand_entities').select('id, name').in('id', entityIds) : { data: [] },
        campaignIds.length ? this.supabase.from('campaigns').select('id, nombre_campana').in('id', campaignIds) : { data: [] },
        personaIds.length ? this.supabase.from('audience_personas').select('id, name').in('id', personaIds) : { data: [] }
      ]);

      const flowNameMap = (flowsRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const flowImgMap  = (flowsRes.data || []).reduce((acc, r) => { acc[r.id] = r.flow_image_url || null; return acc; }, {});
      const entityNameMap = (entitiesRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});
      const campaignNameMap = (campaignsRes.data || []).reduce((acc, r) => { acc[r.id] = r.nombre_campana; return acc; }, {});
      const personaNameMap = (personasRes.data || []).reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {});

      // Resolver imágenes de productos por entity_id (mismo patrón que loadSchedules)
      const entityImagesMap = {};
      if (entityIds.length) {
        const { data: products } = await this.supabase
          .from('products')
          .select('id, entity_id')
          .in('entity_id', entityIds)
          .order('created_at', { ascending: true });
        const entityToProducts = {};
        (products || []).forEach(p => {
          if (!p.entity_id) return;
          (entityToProducts[p.entity_id] = entityToProducts[p.entity_id] || []).push(p.id);
        });
        const productIds = [...new Set((products || []).map(p => p.id))];
        if (productIds.length) {
          const { data: imgs } = await this.supabase
            .from('product_images')
            .select('product_id, image_url, image_type, image_order')
            .in('product_id', productIds)
            .order('image_order', { ascending: true });
          const byProduct = {};
          (imgs || []).forEach(img => {
            if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
            byProduct[img.product_id].push(img);
          });
          Object.entries(entityToProducts).forEach(([entityId, prodIds]) => {
            entityImagesMap[entityId] = prodIds.map(pid => {
              const list = byProduct[pid] || [];
              const main = list.find(i => (i.image_type || '').toLowerCase() === 'principal') || list[0];
              return main ? main.image_url : null;
            }).filter(Boolean);
          });
        }
      }

      return list.map(r => ({
        ...r,
        flow_name: (r.flow_id && flowNameMap[r.flow_id]) || '—',
        flow_image_url: (r.flow_id && flowImgMap[r.flow_id]) || null,
        entity_name: (r.entity_id && entityNameMap[r.entity_id]) || null,
        product_images: (r.entity_id && entityImagesMap[r.entity_id]) || [],
        campaign_name: (r.campaign_id && campaignNameMap[r.campaign_id]) || null,
        audience_name: (r.persona_id && personaNameMap[r.persona_id]) || null
      }));
    } catch (e) {
      console.error('TasksView loadFlowRuns:', e);
      return [];
    }
  }

  async renderHistory(grid, empty) {
    grid.innerHTML = this.skeletonGrid(6, 'lg');
    const runs = await this.loadFlowRuns(50);
    if (!runs.length) {
      // Fallback: si no hay historial, llevar al usuario a "Todas las tareas".
      if (this.currentFilter === 'history' && !this._historyFallbackApplied) {
        this._historyFallbackApplied = true;
        this.currentFilter = 'all';
        return this.renderTasksList();
      }
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = `
      <div class="tasks-history-table" role="table">
        <div class="tasks-history-thead" role="row">
          <div class="tasks-history-th" role="columnheader">${__('Fecha')}</div>
          <div class="tasks-history-th" role="columnheader">${__('Tarea')}</div>
          <div class="tasks-history-th" role="columnheader">${__('Productos')}</div>
          <div class="tasks-history-th" role="columnheader">${__('Contexto')}</div>
          <div class="tasks-history-th" role="columnheader">${__('Estado')}</div>
          <div class="tasks-history-th tasks-history-th--num" role="columnheader">${__('Costo')}</div>
        </div>
        <div class="tasks-history-tbody" role="rowgroup">
          ${runs.map(r => this.renderHistoryRow(r)).join('')}
        </div>
      </div>
    `;
  }

  renderHistoryRow(r) {
    const status = (r.status || '').toLowerCase();
    const statusClass = status === 'completed' ? 'task-card-badge-active'
                      : status === 'failed' || status === 'error' ? 'task-card-badge-danger'
                      : status === 'running' || status === 'in_progress' ? 'task-card-badge-running'
                      : 'task-card-badge-paused';
    const statusLabel = status === 'completed' ? __('Completado')
                      : status === 'failed' || status === 'error' ? __('Error')
                      : status === 'running' || status === 'in_progress' ? __('En curso')
                      : status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    const thumb = r.flow_image_url
      ? `<img class="tasks-history-thumb" src="${this.escapeHtml(r.flow_image_url)}" alt="" loading="lazy">`
      : `<span class="tasks-history-thumb tasks-history-thumb--placeholder"><i class="aisc-ico aisc-ico--flows"></i></span>`;
    const { rel, abs } = this._formatRunDateParts(r.created_at);
    const cost = r.tokens_consumed != null ? `${Number(r.tokens_consumed).toLocaleString('es')}` : '—';

    // Productos: hasta 4 avatares + contador "+N"
    const productImgs = Array.isArray(r.product_images) ? r.product_images : [];
    const maxAvatars = 4;
    const visibleProducts = productImgs.slice(0, maxAvatars);
    const extra = productImgs.length > maxAvatars ? productImgs.length - maxAvatars : 0;
    const productsHtml = productImgs.length
      ? `<div class="tasks-history-products">
          ${visibleProducts.map(url => `<span class="tasks-history-product"><img src="${this.escapeHtml(url)}" alt="" loading="lazy"></span>`).join('')}
          ${extra ? `<span class="tasks-history-product tasks-history-product-extra">+${extra}</span>` : ''}
        </div>`
      : `<span class="tasks-history-empty">—</span>`;

    // Contexto: campaña / audiencia
    const contextParts = [];
    if (r.campaign_name) contextParts.push(`<span class="tasks-history-tag">${this.escapeHtml(r.campaign_name)}</span>`);
    if (r.audience_name) contextParts.push(`<span class="tasks-history-tag tasks-history-tag--muted">${this.escapeHtml(r.audience_name)}</span>`);
    const contextHtml = contextParts.length
      ? `<div class="tasks-history-tags">${contextParts.join('')}</div>`
      : `<span class="tasks-history-empty">—</span>`;

    return `
      <div class="tasks-history-row" role="row">
        <div class="tasks-history-cell tasks-history-cell--when" role="cell">
          <span class="tasks-history-when-rel">${this.escapeHtml(rel)}</span>
          <span class="tasks-history-when-abs">${this.escapeHtml(abs)}</span>
        </div>
        <div class="tasks-history-cell tasks-history-cell--flow" role="cell">
          ${thumb}
          <div class="tasks-history-flow-info">
            <span class="tasks-history-flow-name">${this.escapeHtml(r.flow_name || '—')}</span>
            ${r.entity_name ? `<span class="tasks-history-flow-entity">${this.escapeHtml(r.entity_name)}</span>` : ''}
          </div>
        </div>
        <div class="tasks-history-cell" role="cell">${productsHtml}</div>
        <div class="tasks-history-cell" role="cell">${contextHtml}</div>
        <div class="tasks-history-cell" role="cell">
          <span class="task-card-badge ${statusClass}">
            <span class="task-card-badge-dot"></span>${this.escapeHtml(statusLabel)}
          </span>
        </div>
        <div class="tasks-history-cell tasks-history-cell--num tasks-history-cell--cost" role="cell">
          <span class="tasks-history-cost-value">${this.escapeHtml(cost)}</span>
          <span class="tasks-history-cost-unit">${__('créditos')}</span>
        </div>
      </div>
    `;
  }

  /** Separa fecha relativa y absoluta para renderizar en celdas distintas. */
  _formatRunDateParts(iso) {
    if (!iso) return { rel: '—', abs: '' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { rel: '—', abs: '' };
    const now = Date.now();
    const diff = Math.max(0, now - d.getTime());
    const m = Math.floor(diff / 60000);
    let rel = '';
    if (m < 1) rel = 'ahora';
    else if (m < 60) rel = `hace ${m} min`;
    else if (m < 1440) rel = `hace ${Math.floor(m / 60)} h`;
    else rel = `hace ${Math.floor(m / 1440)} d`;
    const abs = d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return { rel, abs };
  }

  renderTaskCard(t) {
    const scheduleLabel = this.cronToScheduleLabel(t.cron_expression);
    const freqLabel = this.cronToFreqLabel(t.cron_expression);
    const campaignAudience = [t.campaign_name, t.audience_name].filter(Boolean).join(' / ') || '—';
    const statusClass = t.status === 'active' ? 'task-card-badge-active'
                      : t.status === 'draft'  ? 'task-card-badge-draft'
                      : 'task-card-badge-paused';
    const statusLabel = t.status === 'active' ? __('ACTIVA')
                      : t.status === 'draft'  ? __('BORRADOR')
                      : __('PAUSADA');
    const coverHtml = t.flow_image_url
      ? `<div class="task-card-cover"><img src="${this.escapeHtml(t.flow_image_url)}" alt="" loading="lazy"></div>`
      : `<div class="task-card-cover task-card-cover-placeholder"><i class="aisc-ico aisc-ico--flows"></i></div>`;
    const productImages = t.entity_image_urls || [];
    const productCount = productImages.length;
    const maxAvatars = 6;
    const avatarUrls = productImages.slice(0, maxAvatars);
    const extraCount = productCount > maxAvatars ? productCount - maxAvatars : 0;
    const countClass = 'product-count-' + Math.min(Math.max(productCount || 1, 1), 7);
    const avatarsHtml = avatarUrls.length
      ? `<div class="task-card-avatars ${countClass}">
          ${avatarUrls.map((url, i) => `<div class="task-card-avatar" style="z-index: ${10 + i};"><img src="${this.escapeHtml(url)}" alt="" loading="lazy"></div>`).join('')}
          ${extraCount ? `<div class="task-card-avatar task-card-avatar-extra" style="z-index: 5;">+${extraCount}</div>` : ''}
        </div>`
      : `<div class="task-card-avatars product-count-1"><div class="task-card-avatar task-card-avatar-placeholder"><i class="aisc-ico aisc-ico--product"></i></div></div>`;
    return `
      <article class="task-card" data-task-id="${t.id}" role="button" tabindex="0">
        <div class="task-card-inner">
          <div class="task-card-cover-wrap">
            ${coverHtml}
            <span class="task-card-badge task-card-badge-cover ${statusClass}">
              <span class="task-card-badge-dot"></span>${statusLabel}
            </span>
            ${avatarsHtml}
          </div>
          <div class="task-card-body">
            <div class="task-card-header">
              <h3 class="task-card-title">${this.escapeHtml(t.job_name || __('Sin nombre'))}</h3>
            </div>
            <p class="task-card-subtitle">${this.escapeHtml(t.flow_name)}</p>
            <div class="task-card-tags">
              <span class="task-card-tag">${this.escapeHtml(campaignAudience)}</span>
            </div>
            <div class="task-card-metrics">
              <div class="task-card-metric">
                <span class="task-card-metric-value">${this.escapeHtml(t.aspect_ratio || '1:1')}</span>
                <span class="task-card-metric-label">FORMATO</span>
              </div>
              <div class="task-card-metric-divider"></div>
              <div class="task-card-metric">
                <span class="task-card-metric-value">${t.production_count ?? 1}</span>
                <span class="task-card-metric-label">PRODS</span>
              </div>
              <div class="task-card-metric-divider"></div>
              <div class="task-card-metric">
                <span class="task-card-metric-value">${this.escapeHtml(freqLabel)}</span>
                <span class="task-card-metric-label">FREQ</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  setupTasksTabs() {
    const tabs = document.querySelectorAll('.tasks-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', (tab.getAttribute('data-filter') || '') === this.currentFilter);
      tab.onclick = () => {
        this.currentFilter = tab.getAttribute('data-filter') || 'history';
        this.taskCardDisplayCount = this.taskCardLimit;
        // Reset del fallback: el click manual a Historial puede mostrar el empty state.
        this._historyFallbackApplied = false;
        this.renderTasksList();
      };
    });
  }

  setupViewToggle() {
    const toggle = document.getElementById('tasksViewToggle');
    if (!toggle) return;
    toggle.querySelectorAll('.tasks-viewtoggle-btn').forEach(btn => {
      const view = btn.getAttribute('data-view') || 'list';
      btn.classList.toggle('active', view === this.viewMode);
      btn.onclick = () => {
        if (this.viewMode === view) return;
        this.viewMode = view;
        this.taskCardDisplayCount = this.taskCardLimit;
        this.renderTasksList();
      };
    });
  }

  // ── Calendario de produccion ───────────────────────────────────────────────

  /** Lunes 00:00 de la semana que contiene `date`. */
  _startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dow);
    return d;
  }

  /** Numero de semana ISO-8601. */
  _isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    return 1 + Math.round((d - firstThursday) / (7 * 86400000));
  }

  /**
   * Si el schedule (cron) ocurre en `date`, devuelve {hour, min}; si no, null.
   * Soporta: diario (* * *), semanal (dow), mensual (dom). Hora/min fijos.
   */
  _cronOccurrence(cron, date) {
    if (!cron || typeof cron !== 'string') return null;
    const p = cron.trim().split(/\s+/);
    if (p.length < 5) return null;
    const min = parseInt(p[0], 10);
    const hour = parseInt(p[1], 10);
    if (Number.isNaN(hour)) return null; // no soportamos */N de hora en el grid
    const dom = p[2], dowField = p[4];
    let occurs = false;
    if (dowField !== '*' && dowField.length) {
      // Semanal: cron dow 0/7 = domingo
      const dows = dowField.split(',').map(x => parseInt(x, 10) % 7);
      occurs = dows.includes(date.getDay());
    } else if (dom !== '*' && dom.length) {
      // Mensual: dia del mes
      const doms = dom.split(',').map(x => parseInt(x, 10));
      occurs = doms.includes(date.getDate());
    } else {
      occurs = true; // diario
    }
    return occurs ? { hour, min: Number.isNaN(min) ? 0 : min } : null;
  }

  _statusClass(status) {
    return status === 'active' ? 'active' : status === 'draft' ? 'draft' : 'paused';
  }

  /** Colores personalizados del schedule (flow_schedules.color, text[]).
      Solo acepta hex válidos: el valor viene de DB y se inyecta en style. */
  _scheduleColors(s) {
    const arr = Array.isArray(s?.color) ? s.color : [];
    return arr.filter(c => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c));
  }

  /** Asigna lanes (columnas) a eventos solapados de un mismo dia. Devuelve laneCount por evento. */
  _layoutDayEvents(events, eventH) {
    events.sort((a, b) => a.top - b.top || a.min - b.min);
    let i = 0;
    while (i < events.length) {
      // Cluster de eventos que se solapan en cadena.
      let j = i;
      let clusterEnd = events[i].top + eventH;
      while (j + 1 < events.length && events[j + 1].top < clusterEnd) {
        j++;
        clusterEnd = Math.max(clusterEnd, events[j].top + eventH);
      }
      const cluster = events.slice(i, j + 1);
      const laneEnds = []; // bottom del ultimo evento por lane
      cluster.forEach(e => {
        let lane = laneEnds.findIndex(end => e.top >= end);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = e.top + eventH;
        e.lane = lane;
      });
      const laneCount = laneEnds.length;
      cluster.forEach(e => { e.laneCount = laneCount; });
      i = j + 1;
    }
    return events;
  }

  /** Burbujas de identities (productos) conectadas a un schedule. */
  _eventBubbles(s) {
    const imgs = Array.isArray(s.entity_image_urls) ? s.entity_image_urls : [];
    const eids = Array.isArray(s.entity_ids) ? s.entity_ids : (s.entity_ids ? [s.entity_ids] : []);
    const max = 4;
    let html = '';
    if (imgs.length) {
      html = imgs.slice(0, max).map(u =>
        `<span class="cal2-bub"><img src="${this.escapeHtml(u)}" alt="" loading="lazy"></span>`
      ).join('');
      const extra = imgs.length > max ? imgs.length - max : 0;
      if (extra) html += `<span class="cal2-bub cal2-bub--more">+${extra}</span>`;
    } else if (eids.length) {
      const n = Math.min(eids.length, max);
      html = Array.from({ length: n }).map(() =>
        `<span class="cal2-bub cal2-bub--ph"><i class="aisc-ico aisc-ico--product"></i></span>`
      ).join('');
      const extra = eids.length > max ? eids.length - max : 0;
      if (extra) html += `<span class="cal2-bub cal2-bub--more">+${extra}</span>`;
    }
    return html ? `<div class="cal2-event-bubbles">${html}</div>` : '';
  }

  renderCalendar(grid, empty) {
    if (!grid) return;
    if (empty) empty.style.display = 'none';

    const HOUR_H = 116;  // px por hora (cards grandes)
    const EVENT_H = 108; // px alto de card

    // Schedules a mostrar: respeta el filtro de estado; 'history'/'all' = todos.
    let list = this.schedules || [];
    if (this.currentFilter === 'active') list = list.filter(s => s.status === 'active');
    else if (this.currentFilter === 'paused') list = list.filter(s => s.status === 'paused');
    else if (this.currentFilter === 'draft') list = list.filter(s => s.status === 'draft');

    if (!this.calWeekStart) this.calWeekStart = this._startOfWeek(new Date());
    const weekStart = this.calWeekStart;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = new Date();

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });

    // Eventos por dia + rango de horas.
    const eventsByDay = days.map(() => []);
    const hoursSeen = new Set();
    days.forEach((d, di) => {
      list.forEach(s => {
        const occ = this._cronOccurrence(s.cron_expression, d);
        if (!occ) return;
        hoursSeen.add(occ.hour);
        eventsByDay[di].push({ s, hour: occ.hour, min: occ.min });
      });
    });

    // Solo mostramos el rango de horas que TIENE programacion (sin filas vacias).
    let startHour = 8, endHour = 18;
    if (hoursSeen.size) {
      startHour = Math.min(...hoursSeen);
      endHour = Math.max(...hoursSeen);
    }
    const totalHours = endHour - startHour + 1;
    const bodyH = totalHours * HOUR_H;

    const dowNames = [__('lun'), __('mar'), __('mié'), __('jue'), __('vie'), __('sáb'), __('dom')];
    const monthNames = [__('Enero'), __('Febrero'), __('Marzo'), __('Abril'), __('Mayo'), __('Junio'), __('Julio'), __('Agosto'), __('Septiembre'), __('Octubre'), __('Noviembre'), __('Diciembre')];
    const monthLabel = `${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    const weekLabel = `W${this._isoWeek(weekStart)}`;

    // Header de dias
    const dayHeads = days.map((d, di) => {
      const isToday = d.getTime() === today.getTime();
      return `<div class="cal2-dayhead${isToday ? ' cal2-dayhead--today' : ''}">
        <span class="cal2-dayhead-dow">${dowNames[di]}</span>
        <span class="cal2-dayhead-num">${d.getDate()}</span>
      </div>`;
    }).join('');

    // Columna de horas (labels)
    let hourLabels = '';
    for (let h = startHour; h <= endHour; h++) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      hourLabels += `<div class="cal2-hourlabel" style="height:${HOUR_H}px">${h12} ${period}</div>`;
    }

    // Columnas de dias con eventos absolutos
    const dayCols = days.map((d, di) => {
      const isToday = d.getTime() === today.getTime();
      const evs = eventsByDay[di].map(e => ({ ...e, top: (e.hour - startHour) * HOUR_H + (e.min / 60) * HOUR_H }));
      this._layoutDayEvents(evs, EVENT_H);
      const evHtml = evs.map(e => {
        const s = e.s;
        const sc = this._statusClass(s.status);
        const timeStr = `${String(e.hour).padStart(2, '0')}:${String(e.min).padStart(2, '0')}`;
        const freq = this.cronToFreqLabel(s.cron_expression);
        const laneCount = e.laneCount || 1;
        const gap = 4;
        const widthPct = 100 / laneCount;
        const left = `calc(${e.lane * widthPct}% + 3px)`;
        const width = `calc(${widthPct}% - ${gap + 3}px)`;
        const title = `${s.job_name || __('Sin nombre')} · ${timeStr} · ${freq}`;
        const bubbles = this._eventBubbles(s);
        // Color personalizado por tarea (array → soporta degradado a futuro;
        // hoy c1=c2 salvo que existan dos colores guardados).
        const cols = this._scheduleColors(s);
        const colorStyle = cols.length ? `--ev-c1:${cols[0]};--ev-c2:${cols[1] || cols[0]};` : '';
        return `<div class="cal2-event cal2-event--${sc}${cols.length ? ' cal2-event--custom' : ''}" data-task-id="${s.id}" role="button" tabindex="0" title="${this.escapeHtml(title)}"
                  style="top:${e.top}px;height:${EVENT_H}px;left:${left};width:${width};${colorStyle}">
          <div class="cal2-event-main">
            <span class="cal2-event-name">${this.escapeHtml(s.job_name || __('Sin nombre'))}</span>
            <span class="cal2-event-when"><span class="cal2-event-statusdot cal2-event-statusdot--${sc}"></span>${timeStr} · ${this.escapeHtml(freq)}</span>
          </div>
          ${bubbles}
        </div>`;
      }).join('');
      // Linea de "ahora"
      let nowLine = '';
      if (isToday && now.getHours() >= startHour && now.getHours() <= endHour) {
        const top = (now.getHours() - startHour) * HOUR_H + (now.getMinutes() / 60) * HOUR_H;
        nowLine = `<div class="cal2-now" style="top:${top}px"><span class="cal2-now-dot"></span></div>`;
      }
      return `<div class="cal2-col${isToday ? ' cal2-col--today' : ''}" style="height:${bodyH}px;--hour-h:${HOUR_H}px">${nowLine}${evHtml}</div>`;
    }).join('');

    const isEmpty = !list.length;
    grid.innerHTML = `
      <div class="cal2">
        <div class="cal2-toolbar">
          <div class="cal2-toolbar-left">
            <span class="cal2-month">${monthLabel}</span>
            <span class="cal2-week">/ ${weekLabel}</span>
            <div class="cal2-navgroup">
              <button type="button" class="cal2-nav" id="calPrev" aria-label="${__('Semana anterior')}"><i class="aisc-ico aisc-ico--chevron-left"></i></button>
              <button type="button" class="cal2-today" id="calToday">${__('Hoy')}</button>
              <button type="button" class="cal2-nav" id="calNext" aria-label="${__('Semana siguiente')}"><i class="aisc-ico aisc-ico--chevron-right"></i></button>
            </div>
          </div>
          <div class="cal2-toolbar-right">
            <span class="cal2-legend"><span class="cal2-legend-dot cal2-legend-dot--active"></span>${__('Activa')}</span>
            <span class="cal2-legend"><span class="cal2-legend-dot cal2-legend-dot--paused"></span>${__('Pausada')}</span>
            <span class="cal2-legend"><span class="cal2-legend-dot cal2-legend-dot--draft"></span>${__('Borrador')}</span>
          </div>
        </div>
        ${isEmpty ? `<p class="cal2-empty">${__('No hay tareas programadas en esta vista.')}</p>` : ''}
        <div class="cal2-frame">
          <div class="cal2-head">
            <div class="cal2-head-corner"></div>
            ${dayHeads}
          </div>
          <div class="cal2-body">
            <div class="cal2-hours">${hourLabels}</div>
            ${dayCols}
          </div>
        </div>
      </div>
    `;

    this._wireCalendar(grid);
  }

  _wireCalendar(grid) {
    const prev = grid.querySelector('#calPrev');
    const next = grid.querySelector('#calNext');
    const todayBtn = grid.querySelector('#calToday');
    if (prev) prev.onclick = () => { this.calWeekStart = new Date(this.calWeekStart); this.calWeekStart.setDate(this.calWeekStart.getDate() - 7); this.renderTasksList(); };
    if (next) next.onclick = () => { this.calWeekStart = new Date(this.calWeekStart); this.calWeekStart.setDate(this.calWeekStart.getDate() + 7); this.renderTasksList(); };
    if (todayBtn) todayBtn.onclick = () => { this.calWeekStart = this._startOfWeek(new Date()); this.renderTasksList(); };
    grid.querySelectorAll('.cal2-event').forEach(ev => {
      const id = ev.getAttribute('data-task-id');
      ev.addEventListener('click', () => { if (id) this.navigateToTask(id); });
      ev.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (id) this.navigateToTask(id); }
      });
    });
  }

  setupCreateNewTaskButton() {
    const btn = document.getElementById('tasksCreateNewBtn');
    if (!btn) return;
    const base = this.getTasksBasePath();
    const studioPath = this.organizationId && typeof window.getOrgPathPrefix === 'function'
      ? (window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') + '/studio')
      : (this.organizationId ? `/org/${this.organizationId}/studio` : '/studio');
    btn.href = studioPath;
    btn.onclick = (e) => {
      e.preventDefault();
      if (window.router) window.router.navigate(studioPath, true);
    };
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

    await Promise.all([this.loadEntities(), this.loadCampaigns(), this.loadAudiences(), this.loadBrands()]);

    // Fondo: imagen del flow (mismo patrón que product-view + studio schedule).
    if (task.flow_image_url) {
      container.style.setProperty('--task-bg-image', `url("${String(task.flow_image_url).replace(/"/g, '\\"')}")`);
    } else {
      container.style.removeProperty('--task-bg-image');
    }

    // Header: título (job_name) + subtítulo (flow_name)
    const titleEl = document.getElementById('taskDetailTitle');
    const subtitleEl = document.getElementById('taskDetailSubtitle');
    if (titleEl) titleEl.textContent = task.job_name || __('Tarea sin nombre');
    if (subtitleEl) subtitleEl.textContent = task.flow_name || '—';

    // Dashboard + Runs en paralelo (no bloquean form)
    this._renderTaskDashboardAndRuns(task);

    const ruleEl = document.getElementById('taskDetailRuleActive');
    const createdEl = document.getElementById('taskDetailCreated');
    const freqSelect = document.getElementById('taskDetailFreq');
    const brandSelect = document.getElementById('taskDetailBrandSelect');
    const campaignSelect = document.getElementById('taskDetailCampaignSelect');
    const entitySelect = document.getElementById('taskDetailEntitySelect');
    const audienceSelect = document.getElementById('taskDetailAudienceSelect');
    const aspectSelect = document.getElementById('taskDetailAspectSelect');
    const productionInput = document.getElementById('taskDetailProductionCountInput');
    const specsText = document.getElementById('taskDetailSpecsText');

    if (ruleEl) ruleEl.textContent = this.cronToRuleLabel(task.cron_expression);
    if (createdEl) createdEl.textContent = this.formatDate(task.created_at);
    if (freqSelect) freqSelect.value = this.cronToFreqValue(task.cron_expression);

    const taskEntityId = Array.isArray(task.entity_ids) ? task.entity_ids[0] : task.entity_ids;
    const taskCampaignId = Array.isArray(task.campaign_ids) ? task.campaign_ids[0] : task.campaign_ids;
    const taskAudienceId = Array.isArray(task.audience_ids) ? task.audience_ids[0] : task.audience_ids;

    if (brandSelect) {
      brandSelect.innerHTML = '<option value="">—</option>' + (this.brands || []).map(b =>
        `<option value="${b.id}" ${b.id === task.brand_id ? 'selected' : ''}>${this.escapeHtml(b.name)}</option>`
      ).join('');
    }
    if (campaignSelect) {
      campaignSelect.innerHTML = '<option value="">—</option>' + (this.campaigns || []).map(c =>
        `<option value="${c.id}" ${c.id === taskCampaignId ? 'selected' : ''}>${this.escapeHtml(c.nombre_campana)}</option>`
      ).join('');
    }
    if (entitySelect) {
      entitySelect.innerHTML = '<option value="">—</option>' + (this.entities || []).map(e =>
        `<option value="${e.id}" ${e.id === taskEntityId ? 'selected' : ''}>${this.escapeHtml(e.name)}${e.entity_type ? ' (' + this.escapeHtml(e.entity_type) + ')' : ''}</option>`
      ).join('');
    }
    if (audienceSelect) {
      audienceSelect.innerHTML = '<option value="">—</option>' + (this.audiences || []).map(a =>
        `<option value="${a.id}" ${a.id === taskAudienceId ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
      ).join('');
    }
    if (aspectSelect) aspectSelect.value = task.aspect_ratio || '1:1';
    if (productionInput) productionInput.value = String(task.production_count ?? 1);
    if (specsText) specsText.value = task.production_specifications || '';

    this._renderColorSwatches(task);

    const toggleBtn = document.getElementById('taskDetailToggleActiveBtn');
    const toggleLabel = document.getElementById('taskDetailToggleActiveLabel');
    if (toggleBtn) {
      toggleBtn.onclick = () => this.toggleActive(task);
      const icon = toggleBtn.querySelector('i');
      if (task.is_active) {
        if (icon) icon.className = 'fas fa-pause-circle';
        if (toggleLabel) toggleLabel.textContent = __('Pausar');
      } else {
        if (icon) icon.className = 'fas fa-play-circle';
        if (toggleLabel) toggleLabel.textContent = __('Activar');
      }
    }

    const duplicateBtn = document.getElementById('taskDetailDuplicateBtn');
    if (duplicateBtn) duplicateBtn.onclick = () => this.duplicateSchedule(task);

    const deleteBtn = document.getElementById('taskDetailDeleteBtn');
    if (deleteBtn) deleteBtn.onclick = () => this.confirmDeleteSchedule(task);

    const saveBtn = document.getElementById('taskDetailSaveBtn');
    if (saveBtn) saveBtn.onclick = () => this.saveTaskDetail(task);
  }

  /** Swatches de color de la tarea (mismo patrón que las burbujas de
      Monitoreo): chip neutro (default) + paleta. Guarda al click. */
  _renderColorSwatches(task) {
    const wrap = document.getElementById('taskDetailColorSwatches');
    if (!wrap) return;
    const current = this._scheduleColors(task)[0] || '';
    wrap.innerHTML = [
      `<button type="button" class="task-swatch task-swatch--none${current ? '' : ' is-on'}" data-color="" title="${__('Sin color (neutro)')}" aria-label="${__('Sin color (neutro)')}"><i class="fas fa-ban"></i></button>`,
      ...TasksView.PALETTE.map(c =>
        `<button type="button" class="task-swatch${current === c ? ' is-on' : ''}" style="background:${c}" data-color="${c}" title="${c}" aria-label="${c}"></button>`)
    ].join('');
    wrap.querySelectorAll('.task-swatch').forEach(sw => {
      sw.onclick = () => this._setTaskColor(task, sw.dataset.color || '');
    });
  }

  /** Persiste el color de la tarea (optimista). Update directo a la tabla:
      la columna color NO participa en las RPC de schedules. */
  async _setTaskColor(task, color) {
    const next = color ? [color] : null;
    const prev = task.color || null;
    if ((color || '') === (this._scheduleColors(task)[0] || '')) return;
    task.color = next;
    this._renderColorSwatches(task);
    const { error } = await this.supabase
      .from('flow_schedules')
      .update({ color: next })
      .eq('id', task.id)
      .eq('user_id', this.userId);
    if (error) {
      task.color = prev;
      this._renderColorSwatches(task);
      alert(__('No se pudo guardar el color:') + ' ' + error.message);
      return;
    }
    // El calendario (lista cacheada) debe reflejarlo al volver.
    const row = (this.schedules || []).find(r => r.id === task.id);
    if (row) row.color = next;
    this._invalidateSchedulesCache();
  }

  /** Carga runs de este task (flow + brand + user) y pinta Dashboard + Runs en paralelo. */
  async _renderTaskDashboardAndRuns(task) {
    const metricsEl = document.getElementById('taskDetailMetrics');
    const runsEl = document.getElementById('taskDetailRunsBody');
    if (metricsEl) metricsEl.innerHTML = this._renderTaskMetricsSkeleton();
    if (runsEl) runsEl.innerHTML = `<p class="task-detail-empty">${__('Cargando ejecuciones…')}</p>`;

    const runs = await this._loadTaskRuns(task);
    this._renderTaskMetrics(task, runs);
    this._renderTaskRuns(runs);
  }

  /** Runs del task: filtrados por flow_id + brand_id + user_id (no hay schedule_id en flow_runs). */
  async _loadTaskRuns(task) {
    if (!this.supabase || !task?.flow_id) return [];
    try {
      const q = this.supabase
        .from('flow_runs')
        .select('id, flow_id, brand_id, status, created_at, entity_id, tokens_consumed, campaign_id, persona_id')
        .eq('user_id', this.userId)
        .eq('flow_id', task.flow_id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (task.brand_id) q.eq('brand_id', task.brand_id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('TasksView _loadTaskRuns:', e);
      return [];
    }
  }

  _renderTaskMetricsSkeleton() {
    return Array.from({ length: 4 }).map(() =>
      '<div class="task-detail-metric task-detail-metric--skeleton"></div>'
    ).join('');
  }

  _renderTaskMetrics(task, runs) {
    const metricsEl = document.getElementById('taskDetailMetrics');
    if (!metricsEl) return;
    const total = runs.length;
    const completed = runs.filter(r => (r.status || '').toLowerCase() === 'completed').length;
    const tokens = runs.reduce((acc, r) => acc + (Number(r.tokens_consumed) || 0), 0);
    const last = runs[0];
    const lastWhen = last ? this._formatRunDateParts(last.created_at) : null;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const metrics = [
      { label: __('Ejecuciones'), value: String(total), hint: total ? __('{n}% completadas', { n: successRate }) : __('Sin ejecuciones') },
      { label: __('Completadas'), value: String(completed), hint: total ? __('{n} con error', { n: total - completed }) : '—' },
      { label: __('Créditos consumidos'), value: tokens.toLocaleString('es'), hint: __('Total acumulado') },
      { label: __('Última ejecución'), value: lastWhen ? lastWhen.rel : '—', hint: lastWhen ? lastWhen.abs : __('Sin ejecuciones aún') }
    ];

    metricsEl.innerHTML = metrics.map(m => `
      <div class="task-detail-metric">
        <span class="task-detail-metric-label">${this.escapeHtml(m.label)}</span>
        <span class="task-detail-metric-value">${this.escapeHtml(m.value)}</span>
        <span class="task-detail-metric-hint">${this.escapeHtml(m.hint)}</span>
      </div>
    `).join('');
  }

  _renderTaskRuns(runs) {
    const el = document.getElementById('taskDetailRunsBody');
    if (!el) return;
    if (!runs.length) {
      el.innerHTML = `<p class="task-detail-empty">${__('Esta tarea aún no se ha ejecutado.')}</p>`;
      return;
    }
    el.innerHTML = `
      <div class="task-detail-runs-table" role="table">
        <div class="task-detail-runs-thead" role="row">
          <div role="columnheader">${__('Fecha')}</div>
          <div role="columnheader">${__('Estado')}</div>
          <div role="columnheader" class="task-detail-runs-th--num">${__('Costo')}</div>
        </div>
        <div class="task-detail-runs-tbody" role="rowgroup">
          ${runs.map(r => this._renderTaskRunRow(r)).join('')}
        </div>
      </div>
    `;
  }

  _renderTaskRunRow(r) {
    const status = (r.status || '').toLowerCase();
    const statusClass = status === 'completed' ? 'task-card-badge-active'
                      : status === 'failed' || status === 'error' ? 'task-card-badge-danger'
                      : status === 'running' || status === 'in_progress' ? 'task-card-badge-running'
                      : 'task-card-badge-paused';
    const statusLabel = status === 'completed' ? __('Completado')
                      : status === 'failed' || status === 'error' ? __('Error')
                      : status === 'running' || status === 'in_progress' ? __('En curso')
                      : status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    const { rel, abs } = this._formatRunDateParts(r.created_at);
    const cost = r.tokens_consumed != null ? Number(r.tokens_consumed).toLocaleString('es') : '—';
    return `
      <div class="task-detail-runs-row" role="row">
        <div role="cell" class="task-detail-runs-cell--when">
          <span class="task-detail-runs-rel">${this.escapeHtml(rel)}</span>
          <span class="task-detail-runs-abs">${this.escapeHtml(abs)}</span>
        </div>
        <div role="cell">
          <span class="task-card-badge ${statusClass}">
            <span class="task-card-badge-dot"></span>${this.escapeHtml(statusLabel)}
          </span>
        </div>
        <div role="cell" class="task-detail-runs-cell--num">${this.escapeHtml(cost)}</div>
      </div>
    `;
  }

  /** Guardar cambios desde la vista de edición del schedule. */
  async saveTaskDetail(task) {
    const brandSelect = document.getElementById('taskDetailBrandSelect');
    const campaignSelect = document.getElementById('taskDetailCampaignSelect');
    const entitySelect = document.getElementById('taskDetailEntitySelect');
    const audienceSelect = document.getElementById('taskDetailAudienceSelect');
    const aspectSelect = document.getElementById('taskDetailAspectSelect');
    const productionInput = document.getElementById('taskDetailProductionCountInput');
    const specsText = document.getElementById('taskDetailSpecsText');

    const brandId = brandSelect?.value || null;
    const campaignId = campaignSelect?.value || null;
    const entityId = entitySelect?.value || null;
    const audienceId = audienceSelect?.value || null;
    const aspectRatio = aspectSelect?.value || '1:1';
    const productionCount = parseInt(productionInput?.value, 10) || 1;
    const productionSpecifications = (specsText?.value || '').trim() || null;

    if (!this.supabase || !task?.id) return;
    const { error } = await this.supabase
      .from('flow_schedules')
      .update({
        brand_id: brandId || null,
        entity_ids: entityId ? [entityId] : null,
        campaign_ids: campaignId ? [campaignId] : null,
        campaign_id:  campaignId || null,   // FK real
        audience_ids: audienceId ? [audienceId] : null,
        persona_id:   audienceId || null,   // FK real (audience_personas.id)
        aspect_ratio: aspectRatio,
        production_count: productionCount,
        production_specifications: productionSpecifications
      })
      .eq('id', task.id)
      .eq('user_id', this.userId);
    if (error) {
      console.error('TasksView saveTaskDetail:', error);
      this.showNotification(__('No se pudieron guardar los cambios'), 'error');
      return;
    }
    this._invalidateSchedulesCache();
    this.showNotification(__('Cambios guardados'), 'success');
    await this.renderTaskDetail();
  }

  /** Activar o pausar la tarea (toggle status). */
  async toggleActive(task) {
    if (!this.supabase || !task?.id) return;
    const newActive = !task.is_active;
    const { error } = await this.supabase
      .from('flow_schedules')
      .update({ status: newActive ? 'active' : 'paused' })
      .eq('id', task.id)
      .eq('user_id', this.userId);
    if (error) {
      console.error('TasksView toggleActive:', error);
      this.showNotification(__('No se pudo cambiar el estado'), 'error');
      return;
    }
    this._invalidateSchedulesCache();
    this.showNotification(newActive ? __('Tarea activada') : __('Tarea pausada'), 'success');
    await this.renderTaskDetail();
  }

  /** Duplicar schedule: mismo flujo y configuración, job_name único. */
  async duplicateSchedule(task) {
    if (!this.supabase || !task?.id) return;
    const baseName = (task.job_name || __('Tarea')).trim();
    const suffix = ` ${__('(copia {date})', { date: new Date().toISOString().slice(0, 10) })}`;
    let jobName = baseName + suffix;
    if (jobName.length > 255) jobName = baseName.slice(0, 255 - suffix.length) + suffix;
    const { data: existing } = await this.supabase.from('flow_schedules').select('id').eq('job_name', jobName).maybeSingle();
    if (existing) jobName = `${baseName} ${__('(copia {date})', { date: Date.now() })}`;
    const firstCampaignId = Array.isArray(task.campaign_ids) ? task.campaign_ids[0] : task.campaign_ids;
    const firstAudienceId = Array.isArray(task.audience_ids) ? task.audience_ids[0] : task.audience_ids;
    const insert = {
      user_id: task.user_id,
      flow_id: task.flow_id,
      brand_id: task.brand_id,
      cron_expression: task.cron_expression,
      status: 'paused',
      job_name: jobName,
      entity_ids: Array.isArray(task.entity_ids) ? (task.entity_ids.length ? task.entity_ids : null) : (task.entity_ids || null),
      campaign_ids: Array.isArray(task.campaign_ids) ? (task.campaign_ids.length ? task.campaign_ids : null) : (task.campaign_ids ? [task.campaign_ids] : null),
      campaign_id:  task.campaign_id || firstCampaignId || null,
      audience_ids: Array.isArray(task.audience_ids) ? (task.audience_ids.length ? task.audience_ids : null) : (task.audience_ids ? [task.audience_ids] : null),
      persona_id:   task.persona_id || firstAudienceId || null,
      metadata_config: task.metadata_config ?? {},
      production_count: task.production_count ?? 1,
      aspect_ratio: task.aspect_ratio || '1:1',
      production_specifications: task.production_specifications || null
    };
    const { data: created, error } = await this.supabase.from('flow_schedules').insert(insert).select('id').single();
    if (error) {
      console.error('TasksView duplicateSchedule:', error);
      this.showNotification(__('No se pudo duplicar la tarea'), 'error');
      return;
    }
    this._invalidateSchedulesCache();
    this.showNotification(__('Tarea duplicada. La copia está pausada.'), 'success');
    if (window.router && created?.id) window.router.navigate(`${this.getTasksBasePath()}/${created.id}`, true);
    await this.render();
  }

  /** Pedir confirmación y eliminar el schedule. */
  async confirmDeleteSchedule(task) {
    if (!task?.id) return;
    const name = task.job_name || __('esta tarea');
    if (!confirm(__('¿Eliminar la tarea "{name}"? Esta acción no se puede deshacer.', { name }))) return;
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
      this.showNotification(__('No se pudo eliminar la tarea'), 'error');
      return;
    }
    this._invalidateSchedulesCache();
    this.showNotification(__('Tarea eliminada'), 'success');
    if (window.router) window.router.navigate(this.getTasksBasePath(), true);
    await this.render();
  }

  openEditModal(task) {
    Promise.all([this.loadEntities(), this.loadCampaigns(), this.loadAudiences()]).then(() => {
      const taskEntityId = Array.isArray(task.entity_ids) ? task.entity_ids[0] : task.entity_ids;
      const entityOpts = this.entities.map(e => `<option value="${e.id}" ${e.id === taskEntityId ? 'selected' : ''}>${this.escapeHtml(e.name)}${e.entity_type ? ' (' + this.escapeHtml(e.entity_type) + ')' : ''}</option>`).join('');
      const taskFirstCampaignId = Array.isArray(task.campaign_ids) ? task.campaign_ids[0] : task.campaign_ids;
      const campaignOpts = this.campaigns.map(c => `<option value="${c.id}" ${c.id === taskFirstCampaignId ? 'selected' : ''}>${this.escapeHtml(c.nombre_campana)}</option>`).join('');
      const taskFirstAudienceId = Array.isArray(task.audience_ids) ? task.audience_ids[0] : task.audience_ids;
      const audienceOpts = this.audiences.map(a => `<option value="${a.id}" ${a.id === taskFirstAudienceId ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`).join('');
      const aspectOpts = this.ASPECT_RATIOS.map(ar => `<option value="${ar}" ${ar === (task.aspect_ratio || '1:1') ? 'selected' : ''}>${ar}</option>`).join('');
      // FEAT-028: migrado a window.Modal (mismos IDs de campo, misma logica de update).
      const body = `
        <label>${__('Entidad')}</label>
        <select id="taskEditEntity" class="task-edit-select">
          <option value="">${__('Ninguna')}</option>
          ${entityOpts}
        </select>
        <label>${__('Campaña')}</label>
        <select id="taskEditCampaign" class="task-edit-select">
          <option value="">${__('Ninguna')}</option>
          ${campaignOpts}
        </select>
        <label>${__('Audiencia')}</label>
        <select id="taskEditAudience" class="task-edit-select">
          <option value="">${__('Ninguna')}</option>
          ${audienceOpts}
        </select>
        <label>${__('Relación de aspecto')}</label>
        <select id="taskEditAspectRatio" class="task-edit-select">
          ${aspectOpts}
        </select>
        <label>${__('Nº producciones por ejecución')}</label>
        <input type="number" id="taskEditProductionCount" min="1" value="${task.production_count ?? 1}" />
        <label>${__('Activa')}</label>
        <input type="checkbox" id="taskEditIsActive" ${task.is_active ? 'checked' : ''} />
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost modal-cancel">${__('Cancelar')}</button>
          <button type="button" class="btn btn-primary" id="taskEditSubmit">${__('Guardar')}</button>
        </div>
      `;
      const { modal, close } = window.Modal.show({ title: __('Configurar tarea'), body, className: 'task-modal' });
      modal.querySelector('.modal-cancel').onclick = () => close();
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
            campaign_id:  campaignId || null,
            audience_ids: audienceId ? [audienceId] : null,
            persona_id:   audienceId || null,
            aspect_ratio: aspectRatio,
            production_count: productionCount,
            status: isActive ? 'active' : 'paused'
          })
          .eq('id', task.id)
          .eq('user_id', this.userId);
        close();
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
