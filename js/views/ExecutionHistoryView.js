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
  static get documentTitle() { return __('Historial'); }

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
      <h1 class="exec-title">${__('Historial')}</h1>
      <p class="exec-subtitle">${__('Cada sesión agrupa las producciones de un mismo run. Abre una para seguir generando dentro de ella.')}</p>
    </div>
    <div class="exec-grid" id="execGrid">
      ${ExecutionHistoryView.skeletonGrid(8, 'lg')}
    </div>
    ${this.emptyState({
      id: 'execEmpty',
      hidden: true,
      icon: 'aisc-ico aisc-ico--history',
      title: __('Aun no tienes sesiones de producción manual.'),
      subtitle: __('Cada vez que produces un flujo desde el Estudio se crea una sesión. Aquí podrás reabrirla y seguir generando dentro del mismo run.'),
    })}
  </div>
</div>`;
  }

  async onEnter() {
    // La sesión la exige el router (ruta auth); la marca sale de la URL (L7: sin localStorage).
    this.organizationId = this.routeParams?.orgId || window.currentOrgId || null;
  }

  async render() {
    await super.render();
    try {
      await this.initSupabase();
      await this.renderRuns();
      this.setupEventListeners();
      this._setupLive();
    } catch (err) {
      console.error('ExecutionHistoryView render:', err);
      const grid = document.getElementById('execGrid');
      if (grid && window.Estado) {
        window.Estado.pintar(grid, window.Estado.error({ titulo: __('No se pudo cargar el historial'), texto: err?.message || '' }));
        window.Estado.alReintentar(grid, () => this.render());
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
      console.error('ExecutionHistoryView initSupabase:', e);
    }
  }

  /**
   * Run_ids de AUTOPILOT (captured_from='autopilot_ingest'). Sessions = produccion
   * manual = TODO lo que NO es autopilot, asi que estos se EXCLUYEN. Es el inverso
   * simetrico del filtro de Tasks (que muestra solo estos).
   */
  /** El autopilot de v1 no existe en la base nueva. */
  async _autopilotRunIds() { return []; }

  /** Corte: flows.runs + public.salidas por ProduccionesDatos (URL por file_id → galería). */
  async loadRuns() {
    if (!window.ProduccionesDatos || !this.organizationId) return [];
    try {
      const list = await window.ProduccionesDatos.corridas(this.organizationId, { desde: 0, limite: this.pageSize });
      if (!list.length) return [];
      const outs = await window.ProduccionesDatos.salidas(this.organizationId, list.map((r) => r.id));
      const outputsByRun = {};
      outs.forEach((o) => { (outputsByRun[o.run_id] = outputsByRun[o.run_id] || []).push(o); });
      const MAX_CAROUSEL = 8;
      return list.map((r) => {
        const list2 = outputsByRun[r.id] || [];
        const images = [];
        for (const o of list2) {
          const t = (o.output_type || '').toLowerCase();
          if (t === 'text' || t === 'json') continue;
          if (o.storage_path && !images.includes(o.storage_path)) images.push(o.storage_path);
          if (images.length >= MAX_CAROUSEL) break;
        }
        const nombre = r.content_flows?.name || __('Flujo');
        return { ...r, tokens_consumed: r.credits_charged, flow_name: nombre, flow_slug: r.content_flows?.slug || this.flowNameToSlug(nombre), images, output_count: list2.length };
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
    window.Estado.pintar(grid, ExecutionHistoryView.skeletonGrid(8, 'lg'));
    this.runs = await this.loadRuns();
    this._paintRuns(this.runs);
  }

  /* Pinta el grid desde runs ya cargados, SIN skeleton (para el refresh en vivo).
     renderRuns() lo usa tras el skeleton inicial; el tick live lo usa directo. */
  _paintRuns(runs) {
    const grid = document.getElementById('execGrid');
    const empty = document.getElementById('execEmpty');
    if (!grid) return;
    if (!runs || !runs.length) {
      grid.replaceChildren();
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    window.Estado.pintar(grid, runs.map(r => this.renderRunCard(r)).join(''));
    this._bindCarousels();
  }

  /* Datos en vivo: realtime sobre flow_runs (las sesiones se crean/cambian de
     estado en vivo) + polling de respaldo (que tambien capta el crecimiento de
     outputs dentro de un run). Re-pinta el grid sin skeleton y solo si cambio.
     Teardown automatico en BaseView.destroy(). */
  _setupLive() {
    if (!this.supabase || this._liveReady) return;
    this._liveReady = true;

    if (!this._liveSig) this._liveSig = {};
    this._liveSig['exec'] = this._dataSignature(this.runs);

    this._liveTick = () => this.liveRefresh('exec',
      () => this.loadRuns(),
      (runs) => { this.runs = runs; this._paintRuns(runs); });

    const filter = this.organizationId
      ? `organization_id=eq.${this.organizationId}`
      : (this.userId ? `user_id=eq.${this.userId}` : null);
    this.liveSubscribe([
      { name: 'runs', schema: 'flows', table: 'runs', filter, onChange: () => this._liveTick() },
    ]);
    this.startLivePoll(60000, () => this._liveTick());
  }

  renderRunCard(r) {
    const status = (r.status || '').toLowerCase();
    // Estados de flows.runs: queued, running, awaiting_approval, succeeded, failed, cancelled.
    const statusClass = status === 'completed' || status === 'succeeded' ? 'task-card-badge-active'
                      : status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled' ? 'task-card-badge-danger'
                      : status === 'running' || status === 'in_progress' || status === 'queued' ? 'task-card-badge-running'
                      : 'task-card-badge-paused';
    const statusLabel = status === 'completed' || status === 'succeeded' ? __('Completado')
                      : status === 'failed' || status === 'error' ? __('Error')
                      : status === 'cancelled' || status === 'canceled' ? __('Cancelada')
                      : status === 'awaiting_approval' ? __('Esperando tu aprobación · revisar')
                      : status === 'queued' ? __('En cola')
                      : status === 'running' || status === 'in_progress' ? __('En curso')
                      : status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    const { rel } = this._formatRunDateParts(r.created_at);
    const images = Array.isArray(r.images) ? r.images : [];
    const count = r.output_count || 0;
    const disabled = !r.flow_slug;
    const multi = images.length > 1;

    // Capas de medios apiladas: la primera visible; el hover recorre el resto.
    // Mezcla imagenes y videos en el mismo carrusel (los videos se reproducen
    // solo cuando son el slide activo durante el hover).
    const isVid = (u) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u || '');
    const media = images.length
      ? images.map((url, i) => {
          const vis = i === 0 ? ' is-visible' : '';
          // #t=0.1 fuerza al navegador a mostrar ese frame como "poster" sin reproducir.
          const vsrc = url.includes('#') ? url : url + '#t=0.1';
          return isVid(url)
            ? `<video class="exec-card-img exec-card-img--video${vis}" src="${this.escapeHtml(vsrc)}" muted loop playsinline preload="metadata" aria-hidden="true"></video>`
            : `<img class="exec-card-img${vis}" src="${this.escapeHtml(url)}" alt="" loading="lazy">`;
        }).join('')
      : `<div class="exec-card-placeholder"><i class="aisc-ico aisc-ico--sparkle"></i></div>`;

    // Puntos indicadores del carrusel (solo si hay >1 imagen).
    const dots = multi
      ? `<div class="exec-card-dots" aria-hidden="true">${images.map((_, i) => `<span class="exec-card-dot${i === 0 ? ' is-active' : ''}"></span>`).join('')}</div>`
      : '';

    return `
      <button type="button" class="exec-card${disabled ? ' exec-card--disabled' : ''}"${multi ? ' data-carousel="1"' : ''} data-run-id="${this.escapeHtml(r.id)}" data-flow-slug="${this.escapeHtml(r.flow_slug)}"${disabled ? ` disabled title="${__('El flujo de esta sesión ya no existe')}"` : ''}>
        <div class="exec-card-media">
          ${media}
          <div class="exec-card-gradient" aria-hidden="true"></div>
          <span class="exec-card-count"><i class="aisc-ico aisc-ico--layers"></i> ${count}</span>
          <span class="task-card-badge ${statusClass} exec-card-status">
            <span class="task-card-badge-dot"></span>${this.escapeHtml(statusLabel)}
          </span>
          ${dots}
          <div class="exec-card-info">
            <h3 class="exec-card-flow">${this.escapeHtml(r.flow_name)}</h3>
            <span class="exec-card-when">${this.escapeHtml(rel)}</span>
            <span class="exec-card-resume"><i class="aisc-ico aisc-ico--arrow-right"></i> ${__('Continuar sesión')}</span>
          </div>
        </div>
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

  /**
   * Carrusel automatico en hover: al entrar a una card con varias imagenes,
   * recorre los outputs uno por uno (crossfade) hasta salir. Sin librerias.
   */
  _bindCarousels() {
    const cards = this.querySelectorAll('.exec-card[data-carousel]');
    cards.forEach(card => {
      const items = Array.from(card.querySelectorAll('.exec-card-img'));
      const dots = Array.from(card.querySelectorAll('.exec-card-dot'));
      if (items.length < 2) return;
      let idx = 0;
      let timer = null;
      const playVid = (el) => { if (el && el.tagName === 'VIDEO') { try { el.currentTime = 0; el.play(); } catch (_) { /* autoplay bloqueado: queda el cuadro */ } } };
      const pauseVid = (el) => { if (el && el.tagName === 'VIDEO') { try { el.pause(); } catch (_) { /* ya no está en el DOM */ } } };
      const show = (n, playActive = true) => {
        items[idx]?.classList.remove('is-visible');
        pauseVid(items[idx]);
        dots[idx]?.classList.remove('is-active');
        idx = (n + items.length) % items.length;
        items[idx]?.classList.add('is-visible');
        dots[idx]?.classList.add('is-active');
        if (playActive) playVid(items[idx]);
      };
      const start = () => {
        if (timer) return;
        playVid(items[idx]); // reproduce el slide actual si es video
        timer = setInterval(() => show(idx + 1), 1400);
      };
      const stop = () => {
        if (timer) { clearInterval(timer); timer = null; }
        items.forEach(pauseVid);
        show(0, false); // vuelve al primer output (sin autoplay) al salir
      };
      this.addEventListener(card, 'mouseenter', start);
      this.addEventListener(card, 'mouseleave', stop);
      // Cleanup al destruir la vista.
      this._carouselTimers = this._carouselTimers || [];
      this._carouselTimers.push(() => { if (timer) clearInterval(timer); });
    });
  }

  async onLeave() {
    // Detener cualquier carrusel en curso para no dejar intervals huerfanos.
    (this._carouselTimers || []).forEach(stop => { try { stop(); } catch (_) { /* ya estaba detenido */ } });
    this._carouselTimers = [];
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
    if (m < 1) rel = __('ahora');
    else if (m < 60) rel = __('hace {n} min', { n: m });
    else if (m < 1440) rel = __('hace {n} h', { n: Math.floor(m / 60) });
    else rel = __('hace {n} d', { n: Math.floor(m / 1440) });
    return { rel };
  }

  flowNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

window.ExecutionHistoryView = ExecutionHistoryView;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExecutionHistoryView;
}
