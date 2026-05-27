/**
 * ExecutionHistoryView - Historial de ejecuciones (modelo "Sessions").
 *
 * A diferencia de Production (que muestra cada output individual en masonry),
 * esta vista agrupa por flow_run: cada card es una "sesion" de produccion manual
 * (un run creado desde Studio, entity_id NULL). Al hacer click en una sesion, el
 * usuario vuelve a Studio scopeado a ese run (?run=ID) y puede SEGUIR produciendo
 * outputs DENTRO del mismo run (la sesion crece). Patron inspirado en las Sessions
 * de Runway.
 *
 * Solo lista runs MANUALES: los de autopilot (programados, con entity_id) viven en
 * el historial de Tasks.
 */
class ExecutionHistoryView extends BaseView {
  static cacheable = true;
  static documentTitle = 'Execution History';

  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.runs = [];
    this.pageSize = 60;
  }

  renderHTML() {
    return `
<div class="exec-page" id="execPage">
  <div class="exec-container">
    <div class="exec-header">
      <h1 class="exec-title">Execution History</h1>
      <p class="exec-subtitle">Cada sesion agrupa las producciones de un mismo run. Abre una para seguir generando dentro de ella.</p>
    </div>
    <div class="exec-grid" id="execGrid">
      ${ExecutionHistoryView.skeletonGrid(8, 'lg')}
    </div>
    <div class="exec-empty" id="execEmpty" style="display: none;">
      <div class="exec-empty-icon"><i class="fas fa-clock-rotate-left"></i></div>
      <p>Aun no tienes sesiones de produccion manual.</p>
      <p class="exec-empty-hint">Cada vez que produces un flujo desde el Estudio se crea una sesion. Aqui podras reabrirla y seguir generando dentro del mismo run.</p>
    </div>
  </div>
</div>`;
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
      await this.renderRuns();
      this.setupEventListeners();
    } catch (err) {
      console.error('ExecutionHistoryView render:', err);
      const grid = document.getElementById('execGrid');
      if (grid) grid.innerHTML = `<p class="exec-error">Error al cargar el historial. ${err && err.message ? this.escapeHtml(err.message) : 'Recarga la pagina.'}</p>`;
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
      console.error('ExecutionHistoryView initSupabase:', e);
    }
  }

  /**
   * Run_ids de produccion MANUAL: runs_inputs.metadata->>'captured_from' = 'studio_ui'
   * (lo escribe StudioView.producir). Es el marcador inverso al de Tasks/autopilot.
   */
  async _manualRunIds() {
    if (!this.supabase) return [];
    try {
      let q = this.supabase
        .from('runs_inputs')
        .select('run_id')
        .eq('metadata->>captured_from', 'studio_ui')
        .order('created_at', { ascending: false })
        .limit(500);
      if (this.organizationId) q = q.eq('organization_id', this.organizationId);
      const { data, error } = await q;
      if (error) throw error;
      return [...new Set((data || []).map(r => r.run_id).filter(Boolean))];
    } catch (e) {
      console.error('ExecutionHistoryView _manualRunIds:', e);
      return [];
    }
  }

  /**
   * Carga los runs MANUALES (captured_from='studio_ui') de la org actual + hidrata
   * nombre del flow, cover (ultimo output imagen) y conteo de outputs por run.
   */
  async loadRuns() {
    if (!this.supabase) return [];
    try {
      const manualIds = await this._manualRunIds();
      if (!manualIds.length) return [];
      let q = this.supabase
        .from('flow_runs')
        .select('id, flow_id, status, created_at, tokens_consumed')
        .in('id', manualIds)
        .order('created_at', { ascending: false })
        .limit(this.pageSize);
      if (this.organizationId) q = q.eq('organization_id', this.organizationId);
      else if (this.userId) q = q.eq('user_id', this.userId);
      const { data: runs, error } = await q;
      if (error) throw error;
      const list = runs || [];
      if (!list.length) return [];

      const flowIds = [...new Set(list.map(r => r.flow_id).filter(Boolean))];
      const runIds = list.map(r => r.id);

      const [flowsRes, outputsRes] = await Promise.all([
        flowIds.length
          ? this.supabase.from('content_flows').select('id, name, flow_image_url').in('id', flowIds)
          : Promise.resolve({ data: [] }),
        this.supabase.from('runs_outputs')
          .select('run_id, output_type, storage_path, storage_object_id, created_at')
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
      ]);

      const flowMap = (flowsRes.data || []).reduce((acc, f) => { acc[f.id] = f; return acc; }, {});

      // Agrupar outputs por run: conteo + primer output con imagen como cover.
      const outputsByRun = {};
      (outputsRes.data || []).forEach(o => {
        (outputsByRun[o.run_id] = outputsByRun[o.run_id] || []).push(o);
      });

      return list.map(r => {
        const flow = flowMap[r.flow_id] || null;
        const outs = outputsByRun[r.id] || [];
        const coverOut = outs.find(o => (o.output_type || '').toLowerCase() !== 'text' && (o.storage_path || o.storage_object_id))
          || outs.find(o => o.storage_path || o.storage_object_id);
        let coverUrl = null;
        if (coverOut) {
          coverUrl = this.getPublicUrlFromStorage('production-outputs', coverOut.storage_path)
            || this.getPublicUrlFromStorage('outputs', coverOut.storage_path)
            || this.getPublicUrlFromStorage('production-outputs', coverOut.storage_object_id);
        }
        if (!coverUrl && flow?.flow_image_url) coverUrl = flow.flow_image_url;
        return {
          ...r,
          flow_name: flow?.name || 'Flujo eliminado',
          flow_slug: flow ? this.flowNameToSlug(flow.name) : '',
          cover_url: coverUrl,
          output_count: outs.length
        };
      });
    } catch (e) {
      console.error('ExecutionHistoryView loadRuns:', e);
      return [];
    }
  }

  async renderRuns() {
    const grid = document.getElementById('execGrid');
    const empty = document.getElementById('execEmpty');
    if (!grid) return;
    grid.innerHTML = ExecutionHistoryView.skeletonGrid(8, 'lg');
    this.runs = await this.loadRuns();
    if (!this.runs.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = this.runs.map(r => this.renderRunCard(r)).join('');
  }

  renderRunCard(r) {
    const status = (r.status || '').toLowerCase();
    const statusClass = status === 'completed' ? 'task-card-badge-active'
                      : status === 'failed' || status === 'error' ? 'task-card-badge-danger'
                      : status === 'running' || status === 'in_progress' ? 'task-card-badge-running'
                      : 'task-card-badge-paused';
    const statusLabel = status === 'completed' ? 'Completado'
                      : status === 'failed' || status === 'error' ? 'Error'
                      : status === 'running' || status === 'in_progress' ? 'En curso'
                      : status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    const { rel } = this._formatRunDateParts(r.created_at);
    const cover = r.cover_url
      ? `<img class="exec-card-cover-img" src="${this.escapeHtml(r.cover_url)}" alt="" loading="lazy">`
      : `<span class="exec-card-cover-placeholder"><i class="fas fa-wand-magic-sparkles"></i></span>`;
    const count = r.output_count || 0;
    const disabled = !r.flow_slug;

    return `
      <button type="button" class="exec-card${disabled ? ' exec-card--disabled' : ''}" data-run-id="${this.escapeHtml(r.id)}" data-flow-slug="${this.escapeHtml(r.flow_slug)}"${disabled ? ' disabled title="El flujo de esta sesion ya no existe"' : ''}>
        <div class="exec-card-cover">
          ${cover}
          <span class="exec-card-count"><i class="fas fa-layer-group"></i> ${count}</span>
          <span class="task-card-badge ${statusClass} exec-card-status">
            <span class="task-card-badge-dot"></span>${this.escapeHtml(statusLabel)}
          </span>
        </div>
        <div class="exec-card-info">
          <span class="exec-card-flow">${this.escapeHtml(r.flow_name)}</span>
          <span class="exec-card-when">${this.escapeHtml(rel)}</span>
        </div>
        <div class="exec-card-resume"><i class="fas fa-arrow-right"></i> Continuar sesion</div>
      </button>
    `;
  }

  setupEventListeners() {
    const grid = document.getElementById('execGrid');
    if (!grid) return;
    this.addEventListener(grid, 'click', (e) => {
      const card = e.target.closest('.exec-card');
      if (!card || card.disabled) return;
      const runId = card.getAttribute('data-run-id');
      const slug = card.getAttribute('data-flow-slug');
      if (runId && slug) this.resumeSession(slug, runId);
    });
  }

  /** Navega a Studio scopeado al run para continuar produciendo dentro de la sesion. */
  resumeSession(flowSlug, runId) {
    const base = this.organizationId && typeof window.getOrgPathPrefix === 'function'
      ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '')
      : '';
    const path = `${base}/studio/${encodeURIComponent(flowSlug)}?run=${encodeURIComponent(runId)}`;
    if (window.router) window.router.navigate(path);
  }

  /** Separa fecha relativa (mismo formato que TasksView). */
  _formatRunDateParts(iso) {
    if (!iso) return { rel: '—' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { rel: '—' };
    const diff = Math.max(0, Date.now() - d.getTime());
    const m = Math.floor(diff / 60000);
    let rel;
    if (m < 1) rel = 'ahora';
    else if (m < 60) rel = `hace ${m} min`;
    else if (m < 1440) rel = `hace ${Math.floor(m / 60)} h`;
    else rel = `hace ${Math.floor(m / 1440)} d`;
    return { rel };
  }

  flowNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /** Resuelve URL publica de un objeto en Storage (replica de living.js). */
  getPublicUrlFromStorage(bucketName, filePath) {
    if (!this.supabase || !bucketName || !filePath) return null;
    if (!this.supabase.storage || typeof this.supabase.storage.from !== 'function') return null;
    if (typeof filePath !== 'string' || filePath.trim() === '') return null;
    try {
      let cleanPath = filePath.trim();
      if (cleanPath.startsWith(`${bucketName}/`)) cleanPath = cleanPath.replace(`${bucketName}/`, '');
      else if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
      if (!cleanPath) return null;
      const result = this.supabase.storage.from(bucketName).getPublicUrl(cleanPath);
      return (result && result.data && result.data.publicUrl) ? result.data.publicUrl : null;
    } catch (_) {
      return null;
    }
  }

  escapeHtml(s) {
    if (s == null || s === '') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
}

window.ExecutionHistoryView = ExecutionHistoryView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExecutionHistoryView;
}
