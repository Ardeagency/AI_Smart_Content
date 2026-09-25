/**
 * TareasView — las TAREAS PROGRAMADAS (/tasks): flujos que corren solos en la fecha que se
 * elija (flows.schedules). Diseño de v1 (la TasksView borrada en 32d3f821: tarjetas, calendario
 * semanal por horas y detalle con Dashboard · Editar · Últimas ejecuciones) sobre la capa de
 * datos nueva: todo pasa por TareasDatos (js/services/TareasDataService.js); la vista no lee la base directo.
 * CSS: .tasks-* / .task-* / .cal2-* en css/modules/content-management.css.
 *
 *   /tasks            lista (Todas · Activas · Pausadas) o calendario de la semana
 *   /tasks/nueva      crear (siempre EN PAUSA: activar es un paso aparte que gasta créditos)
 *   /tasks/:taskId    detalle: Dashboard, «Si corriera ahora» (resolver_entradas), últimas
 *                     corridas del flujo y el editor (nombre, frecuencia, zona, mercado, entradas)
 *
 * Lo que v1 tenía y la base nueva no: `color` por tarea (no hay columna), borradores, el
 * Historial de corridas de autopilot y las corridas POR TAREA (flows.runs no guarda qué
 * programación lanzó cada una: se muestran las del flujo). Formato y producciones por corrida
 * ya no son campos de la tarea: son entradas del flujo.
 */
class TareasView extends BaseView {
  static cacheable = false;
  static get documentTitle() { return __('Tareas programadas'); }

  static HORA_H = 116;   // px por hora en el calendario (tarjetas grandes)
  static EVENTO_H = 108; // px de alto de cada tarjeta del calendario

  constructor() {
    super();
    this.organizationId = null;
    this.lista = [];
    this.filtro = 'todas';
    this.vista = TareasView._leerVista();
    this.lunes = null;
    this.limite = 9;
    this.mostradas = 9;
    this.p = null;          // la tarea abierta (detalle)
    this.campos = [];       // entradas del flujo (FlujosDatos.entradas)
    this.opciones = { elementos: [], mercados: [] };
  }

  static _leerVista() {
    try { return localStorage.getItem('aisc:tareas:vista') === 'calendario' ? 'calendario' : 'lista'; } catch (_) { return 'lista'; }
  }
  static _guardarVista(v) {
    try { localStorage.setItem('aisc:tareas:vista', v); } catch (_) { /* navegación privada: vale esta visita */ }
  }

  async onEnter() {
    // La sesión la exige el router (ruta auth) y la marca sale de la URL.
    this.organizationId = this.routeParams?.orgId || window.currentOrgId || null;
  }

  get M() { return window.TareasDatos.mapeo; }

  _prefijo() {
    return (this.organizationId && typeof window.getOrgPathPrefix === 'function') ? window.getOrgPathPrefix(this.organizationId, window.currentOrgName || '') : '';
  }
  _ruta(resto = '') { return `${this._prefijo()}/tasks${resto}`; }
  _ir(ruta) { if (window.router) window.router.navigate(ruta); }

  renderHTML() {
    return `<div class="tasks-page" id="tasksPage">${window.Estado.cargando('tarjetas', 6)}</div>`;
  }

  async render() {
    await super.render();
    const raiz = document.getElementById('tasksPage');
    if (!raiz) return;
    window.Estado.alReintentar(raiz, () => this.render());
    const id = this.routeParams?.taskId || null;
    try {
      if (!window.TareasDatos) throw new Error(__('No se pudo cargar el servicio de tareas.'));
      if (id === 'nueva') await this._abrirNueva(raiz);
      else if (id) await this._abrirDetalle(raiz, id);
      else await this._abrirLista(raiz);
    } catch (err) {
      console.error('TareasView render:', err);
      window.Estado.pintar(raiz, `<div class="tasks-container">${window.Estado.error({ titulo: __('No se pudieron cargar las tareas'), texto: err?.message || '' })}</div>`);
    }
  }

  async _opcionesDeMarca() {
    try { return await window.TareasDatos.opcionesDeMarca(this.organizationId); } catch (e) {
      console.warn('[tareas] elementos y mercados de la marca:', e?.message || e);
      return { elementos: [], mercados: [] };
    }
  }

  /* ════════════════════════ LISTA Y CALENDARIO ════════════════════════ */

  async _abrirLista(raiz) {
    window.Estado.pintar(raiz, `
      <div class="tasks-container tasks-list-view" id="tasksListContainer">
        <div class="tasks-header-row">
          <div class="tasks-header">
            <h1 class="tasks-title">${__('Tareas programadas')}</h1>
            <p class="tasks-subtitle">${__('Gestiona tus flujos programados: cuándo corren y con qué entradas.')}</p>
          </div>
          <div class="tasks-header-actions">
            <div class="tasks-viewtoggle" role="group" aria-label="${__('Vista')}">
              <button type="button" class="tasks-viewtoggle-btn" data-vista="lista" aria-label="${__('Vista de lista')}"><i class="aisc-ico aisc-ico--grid" aria-hidden="true"></i> ${__('Lista')}</button>
              <button type="button" class="tasks-viewtoggle-btn" data-vista="calendario" aria-label="${__('Vista de calendario')}"><i class="aisc-ico aisc-ico--calendar" aria-hidden="true"></i> ${__('Calendario')}</button>
            </div>
            <a class="btn btn--oscuro tasks-create-btn" href="${this.escapeHtml(this._ruta('/nueva'))}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i> ${__('Crear tarea')}</a>
          </div>
        </div>
        <nav class="tasks-tabs" id="tasksTabs" aria-label="${__('Filtrar tareas')}"></nav>
        <div class="tasks-cards-grid" id="tasksGrid" aria-live="polite">${window.Estado.cargando('tarjetas', 6)}</div>
        <div id="tasksEmpty" hidden></div>
        <div class="tasks-load-more-wrap" id="tasksLoadMoreWrap" hidden>
          <button type="button" class="btn btn--gris tasks-load-more" data-mas>${__('Cargar más tareas')}</button>
        </div>
      </div>`);
    this.updateLinksForRouter();
    this._enlazarLista(raiz);
    const [lista, opciones] = await Promise.all([window.TareasDatos.programaciones(this.organizationId), this._opcionesDeMarca()]);
    this.lista = lista;
    this.opciones = opciones;
    this._pintarLista();
    this._vivo();
  }

  _enlazarLista(raiz) {
    this.addEventListener(raiz, 'click', (e) => {
      const v = e.target.closest('[data-vista]');
      if (v) {
        if (this.vista === v.dataset.vista) return;
        this.vista = v.dataset.vista; TareasView._guardarVista(this.vista); this.mostradas = this.limite; this._pintarLista(); return;
      }
      const f = e.target.closest('[data-filtro]');
      if (f) { this.filtro = f.dataset.filtro; this.mostradas = this.limite; this._pintarLista(); return; }
      if (e.target.closest('[data-mas]')) { this.mostradas += this.limite; this._pintarLista(); return; }
      const s = e.target.closest('[data-semana]');
      if (s) {
        const paso = s.dataset.semana;
        if (paso === 'hoy') this.lunes = this.M.inicioDeSemana(new Date());
        else { const d = new Date(this.lunes); d.setDate(d.getDate() + (paso === 'antes' ? -7 : 7)); this.lunes = d; }
        this._pintarLista();
      }
    });
  }

  _pintarLista() {
    const grid = document.getElementById('tasksGrid');
    const tabs = document.getElementById('tasksTabs');
    const vacio = document.getElementById('tasksEmpty');
    const mas = document.getElementById('tasksLoadMoreWrap');
    if (!grid || !tabs || !vacio || !mas) return;
    document.querySelectorAll('.tasks-viewtoggle-btn').forEach((b) => {
      const activo = b.dataset.vista === this.vista;
      b.classList.toggle('active', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    const n = this.M.contar(this.lista);
    const tab = (clave, texto, cuantas) => `<button type="button" class="tasks-tab${this.filtro === clave ? ' active' : ''}" data-filtro="${clave}" aria-pressed="${this.filtro === clave}">${this.escapeHtml(texto)} (${cuantas})</button>`;
    window.Estado.pintar(tabs, tab('todas', __('Todas'), n.todas) + tab('activas', __('Activas'), n.activas) + tab('pausadas', __('Pausadas'), n.pausadas));

    const visibles = this.M.filtrar(this.lista, this.filtro);
    grid.classList.toggle('tasks-grid--calendar', this.vista === 'calendario');
    if (this.vista === 'calendario') {
      vacio.hidden = true; mas.hidden = true;
      this._pintarCalendario(grid, visibles);
      this.updateLinksForRouter();
      return;
    }
    if (!visibles.length) {
      window.Estado.pintar(grid, '');
      window.Estado.pintar(vacio, window.Estado.vacio(this.lista.length
        ? { icono: 'aisc-ico aisc-ico--task', titulo: this.filtro === 'activas' ? __('Ninguna tarea está activa') : __('Ninguna tarea está en pausa') }
        : { icono: 'aisc-ico aisc-ico--task', titulo: __('Aún no tienes tareas programadas.'), texto: __('Una tarea corre un flujo sola en la fecha que elijas. Créala con «Crear tarea»: nace en pausa y la activas cuando esté lista.') }));
      vacio.hidden = false; mas.hidden = true;
      return;
    }
    vacio.hidden = true;
    window.Estado.pintar(grid, visibles.slice(0, this.mostradas).map((p) => this._tarjetaHTML(p)).join(''));
    mas.hidden = visibles.length <= this.mostradas;
    this.updateLinksForRouter();
  }

  /** Etiqueta del estado en mayúsculas (la de la tarjeta y el calendario de v1). */
  _estado(p) {
    const e = this.M.estadoProgramacion(p);
    const texto = p.estado === 'activa' ? __('ACTIVA') : p.estado === 'detenida' ? __('SE DETUVO') : __('PAUSADA');
    return { ...e, texto };
  }

  /** Frecuencia corta: Diario, Semanal, Mensual, Cada hora… */
  _frecuenciaCorta(cron) {
    if (this.M.validarCron(cron)) return '—';
    const f = this.M.formaDeCron(cron);
    if (f.frecuencia === 'diaria' || (f.frecuencia === 'semanal' && f.dias.length === 7)) return __('Diario');
    if (f.frecuencia === 'semanal') return __('Semanal');
    if (f.frecuencia === 'mensual') return __('Mensual');
    if (f.frecuencia === 'horas') return f.cadaHoras === 1 ? __('Cada hora') : __('Cada {n} h', { n: f.cadaHoras });
    return __('Avanzada');
  }

  _elementos(p) { return this.M.elementosDeEntradas(p.entradas, this.opciones.elementos); }

  _avataresHTML(p) {
    const { elementos } = this._elementos(p);
    const max = 6;
    if (!elementos.length) return `<div class="task-card-avatars product-count-1"><div class="task-card-avatar task-card-avatar-placeholder"><i class="aisc-ico aisc-ico--product" aria-hidden="true"></i></div></div>`;
    const extra = elementos.length > max ? elementos.length - max : 0;
    const clase = 'product-count-' + Math.min(Math.max(elementos.length, 1), 7);
    return `<div class="task-card-avatars ${clase}">
      ${elementos.slice(0, max).map((el) => (el.imagen
        ? `<div class="task-card-avatar" title="${this.escapeHtml(el.label)}"><img src="${this.escapeHtml(el.imagen)}" alt="" loading="lazy"></div>`
        : `<div class="task-card-avatar task-card-avatar-placeholder" title="${this.escapeHtml(el.label)}"><i class="aisc-ico aisc-ico--product" aria-hidden="true"></i></div>`)).join('')}
      ${extra ? `<div class="task-card-avatar task-card-avatar-extra">+${extra}</div>` : ''}
    </div>`;
  }

  _tarjetaHTML(p) {
    const e = this._estado(p);
    const mercado = this.opciones.mercados.find((m) => m.value === p.marketId)?.label || '—';
    const portada = p.portada
      ? `<div class="task-card-cover"><img src="${this.escapeHtml(p.portada)}" alt="" loading="lazy"></div>`
      : `<div class="task-card-cover task-card-cover-placeholder"><i class="aisc-ico aisc-ico--flows" aria-hidden="true"></i></div>`;
    const metrica = (valor, etiqueta) => `<div class="task-card-metric"><span class="task-card-metric-value">${this.escapeHtml(valor)}</span><span class="task-card-metric-label">${this.escapeHtml(etiqueta)}</span></div>`;
    return `
      <a class="task-card" href="${this.escapeHtml(this._ruta('/' + p.id))}" data-task-id="${this.escapeHtml(p.id)}">
        <div class="task-card-inner">
          <div class="task-card-cover-wrap">
            ${portada}
            <span class="badge badge--sm ${e.badge} task-card-badge-cover">${this.escapeHtml(e.texto)}</span>
            ${this._avataresHTML(p)}
          </div>
          <div class="task-card-body">
            <div class="task-card-header"><h3 class="task-card-title">${this.escapeHtml(p.nombre || __('Sin nombre'))}</h3></div>
            <p class="task-card-subtitle">${this.escapeHtml(p.flujo || __('Flujo sin nombre'))}</p>
            <div class="task-card-tags"><span class="task-card-tag">${this.escapeHtml(mercado)}</span>${p.heredada ? `<span class="task-card-tag">${__('Entradas de v1')}</span>` : ''}</div>
            <div class="task-card-metrics">
              ${metrica(String(p.corridas), __('CORRIDAS'))}
              <div class="task-card-metric-divider"></div>
              ${metrica(String(p.omitidas), __('OMITIDAS'))}
              <div class="task-card-metric-divider"></div>
              ${metrica(this._frecuenciaCorta(p.cron), __('FREQ'))}
            </div>
          </div>
        </div>
      </a>`;
  }

  /* ── Calendario de producción (cal2) ──────────────────────────────────── */

  _isoSemana(fecha) {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
    const jueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    jueves.setUTCDate(jueves.getUTCDate() - ((jueves.getUTCDay() + 6) % 7) + 3);
    return 1 + Math.round((d - jueves) / (7 * 86400000));
  }

  /** Reparte en carriles los eventos que se pisan en un mismo día. */
  _carriles(eventos, alto) {
    eventos.sort((a, b) => a.top - b.top);
    let i = 0;
    while (i < eventos.length) {
      let j = i;
      let fin = eventos[i].top + alto;
      while (j + 1 < eventos.length && eventos[j + 1].top < fin) { j++; fin = Math.max(fin, eventos[j].top + alto); }
      const grupo = eventos.slice(i, j + 1);
      const finales = [];
      grupo.forEach((e) => {
        let c = finales.findIndex((f) => e.top >= f);
        if (c === -1) { c = finales.length; finales.push(0); }
        finales[c] = e.top + alto;
        e.carril = c;
      });
      grupo.forEach((e) => { e.carriles = finales.length; });
      i = j + 1;
    }
    return eventos;
  }

  _burbujasHTML(p) {
    const { elementos, automaticos } = this._elementos(p);
    const max = 4;
    const ph = '<span class="cal2-bub cal2-bub--ph"><i class="aisc-ico aisc-ico--product" aria-hidden="true"></i></span>';
    let html = '';
    if (elementos.length) {
      html = elementos.slice(0, max).map((el) => (el.imagen ? `<span class="cal2-bub"><img src="${this.escapeHtml(el.imagen)}" alt="" loading="lazy"></span>` : ph)).join('');
      if (elementos.length > max) html += `<span class="cal2-bub cal2-bub--more">+${elementos.length - max}</span>`;
    } else if (automaticos) {
      html = ph.repeat(Math.min(automaticos, max));
    }
    return html ? `<div class="cal2-event-bubbles">${html}</div>` : '';
  }

  _pintarCalendario(grid, visibles) {
    const H = TareasView.HORA_H;
    const ALTO = TareasView.EVENTO_H;
    if (!this.lunes) this.lunes = this.M.inicioDeSemana(new Date());
    const semana = this.M.agendaDeSemana(visibles, this.lunes);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const ahora = new Date();
    const horas = semana.flatMap((d) => d.eventos.map((e) => e.hora));
    const desde = horas.length ? Math.min(...horas) : 8;
    const hasta = horas.length ? Math.max(...horas) : 18;
    const dow = [__('lun'), __('mar'), __('mié'), __('jue'), __('vie'), __('sáb'), __('dom')];
    const meses = [__('Enero'), __('Febrero'), __('Marzo'), __('Abril'), __('Mayo'), __('Junio'), __('Julio'), __('Agosto'), __('Septiembre'), __('Octubre'), __('Noviembre'), __('Diciembre')];
    const posiciones = [];

    const cabeceras = semana.map(({ fecha }, i) => `
      <div class="cal2-dayhead${fecha.getTime() === hoy.getTime() ? ' cal2-dayhead--today' : ''}">
        <span class="cal2-dayhead-dow">${dow[i]}</span>
        <span class="cal2-dayhead-num">${fecha.getDate()}</span>
      </div>`).join('');
    let etiquetas = '';
    for (let h = desde; h <= hasta; h++) etiquetas += `<div class="cal2-hourlabel">${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}</div>`;

    const columnas = semana.map(({ fecha, eventos }) => {
      const esHoy = fecha.getTime() === hoy.getTime();
      const evs = this._carriles(eventos.map((e) => ({ ...e, top: (e.hora - desde) * H + (e.minuto / 60) * H })), ALTO);
      const html = evs.map((e) => {
        const p = e.p;
        const hora = `${String(e.hora).padStart(2, '0')}:${String(e.minuto).padStart(2, '0')}`;
        const cuando = e.veces > 1 ? __('{n} veces', { n: e.veces }) : hora;
        const freq = this._frecuenciaCorta(p.cron);
        const k = posiciones.push({ top: e.top, carril: e.carril, carriles: e.carriles || 1 }) - 1;
        return `<a class="cal2-event cal2-event--${p.activa ? 'active' : 'paused'}" href="${this.escapeHtml(this._ruta('/' + p.id))}" data-pos="${k}" title="${this.escapeHtml(`${p.nombre} · ${cuando} · ${freq} · ${this._estado(p).texto}`)}">
          <div class="cal2-event-main">
            <span class="cal2-event-name">${this.escapeHtml(p.nombre || __('Sin nombre'))}</span>
            <span class="cal2-event-when">${this.escapeHtml(cuando)} · ${this.escapeHtml(freq)}</span>
          </div>
          ${this._burbujasHTML(p)}
        </a>`;
      }).join('');
      const linea = esHoy && ahora.getHours() >= desde && ahora.getHours() <= hasta ? '<div class="cal2-now" data-ahora><span class="cal2-now-dot"></span></div>' : '';
      return `<div class="cal2-col${esHoy ? ' cal2-col--today' : ''}">${linea}${html}</div>`;
    }).join('');

    window.Estado.pintar(grid, `
      <div class="cal2">
        <div class="cal2-toolbar">
          <div class="cal2-toolbar-left">
            <span class="cal2-month">${meses[this.lunes.getMonth()]} ${this.lunes.getFullYear()}</span>
            <span class="cal2-week">/ W${this._isoSemana(this.lunes)}</span>
            <div class="cal2-navgroup">
              <button type="button" class="cal2-nav" data-semana="antes" aria-label="${__('Semana anterior')}"><i class="aisc-ico aisc-ico--chevron-left" aria-hidden="true"></i></button>
              <button type="button" class="cal2-today" data-semana="hoy">${__('Hoy')}</button>
              <button type="button" class="cal2-nav" data-semana="despues" aria-label="${__('Semana siguiente')}"><i class="aisc-ico aisc-ico--chevron-right" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="cal2-toolbar-right">
            <span class="cal2-legend">${__('Las pausadas se ven tenues y no corren. Cada hora va en la zona horaria de su tarea.')}</span>
          </div>
        </div>
        ${visibles.length ? '' : `<p class="cal2-empty">${__('No hay tareas programadas en esta vista.')}</p>`}
        <div class="cal2-frame">
          <div class="cal2-head"><div class="cal2-head-corner"></div>${cabeceras}</div>
          <div class="cal2-body">
            <div class="cal2-hours">${etiquetas}</div>
            ${columnas}
          </div>
        </div>
      </div>`);

    // Posiciones por CSSOM (sin style= en el marcado): alto de hora, carriles y la línea de «ahora».
    const cuerpo = grid.querySelector('.cal2-body');
    if (cuerpo) {
      cuerpo.style.setProperty('--hour-h', `${H}px`);
      cuerpo.style.setProperty('--horas', String(hasta - desde + 1));
    }
    grid.querySelectorAll('.cal2-event[data-pos]').forEach((el) => {
      const pos = posiciones[Number(el.dataset.pos)];
      if (!pos) return;
      const ancho = 100 / pos.carriles;
      el.style.top = `${pos.top}px`;
      el.style.height = `${ALTO}px`;
      el.style.left = `calc(${pos.carril * ancho}% + 3px)`;
      el.style.width = `calc(${ancho}% - 7px)`;
    });
    const linea = grid.querySelector('[data-ahora]');
    if (linea) linea.style.top = `${(ahora.getHours() - desde) * H + (ahora.getMinutes() / 60) * H}px`;
  }

  /* Datos en vivo: la base mueve contadores, próxima y estado (pg_cron cada minuto). */
  _vivo() {
    if (this._vivoListo || !this.organizationId) return;
    this._vivoListo = true;
    if (!this._liveSig) this._liveSig = {};
    this._liveSig.tareas = this._dataSignature(this.lista);
    const tick = () => this.liveRefresh('tareas', () => window.TareasDatos.programaciones(this.organizationId), (l) => { this.lista = l; this._pintarLista(); });
    this.liveSubscribe([{ name: 'programaciones', schema: 'flows', table: 'schedules', filter: `organization_id=eq.${this.organizationId}`, onChange: tick }]);
    this.startLivePoll(60000, tick);
  }

  /* ════════════════════════ DETALLE Y NUEVA ════════════════════════ */

  _volverHTML() {
    return `<a class="btn btn--gris task-detail-back" href="${this.escapeHtml(this._ruta())}"><i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i> ${__('Volver')}</a>`;
  }

  _fondo(portada) {
    const w = document.getElementById('taskDetailContainer');
    if (!w) return;
    if (portada) w.style.setProperty('--task-bg-image', `url(${JSON.stringify(String(portada))})`);
    else w.style.removeProperty('--task-bg-image');
  }

  async _abrirNueva(raiz) {
    const [flujos, opciones] = await Promise.all([window.TareasDatos.flujos(this.organizationId), this._opcionesDeMarca()]);
    this.opciones = opciones;
    this.flujos = flujos;
    this.p = null;
    this.campos = [];
    window.Estado.pintar(raiz, `
      <div class="task-detail-wrapper" id="taskDetailContainer">
        <div class="task-detail">
          <header class="task-detail-header">
            <div class="task-detail-header-left">
              ${this._volverHTML()}
              <div class="task-detail-title-block">
                <h1 class="task-detail-title">${__('Nueva tarea')}</h1>
                <p class="task-detail-subtitle">${__('Se crea en pausa. Cuando la actives, correrá sola en cada fecha y cada corrida gastará créditos de la marca.')}</p>
              </div>
            </div>
            <div class="task-detail-header-right">
              <button type="submit" form="tareasForm" class="btn btn--oscuro" id="tfGuardar"><i class="aisc-ico aisc-ico--save" aria-hidden="true"></i> ${__('Crear en pausa')}</button>
            </div>
          </header>
          <div class="task-detail-grid task-detail-grid--nueva">
            <aside class="task-detail-section task-detail-editor">
              <header class="task-detail-section-header"><h2 class="task-detail-section-title">${__('Qué y cuándo')}</h2></header>
              ${this._formHTML(null)}
            </aside>
          </div>
        </div>
      </div>`);
    this.updateLinksForRouter();
    this._enlazarFormulario(raiz);
  }

  async _abrirDetalle(raiz, id) {
    const [p, opciones] = await Promise.all([window.TareasDatos.programacion(this.organizationId, id), this._opcionesDeMarca()]);
    if (!p) {
      window.Estado.pintar(raiz, `
        <div class="task-detail-wrapper" id="taskDetailContainer">
          <div class="task-detail">
            <header class="task-detail-header"><div class="task-detail-header-left">${this._volverHTML()}</div></header>
            ${window.Estado.vacio({ icono: 'aisc-ico aisc-ico--calendar', titulo: __('Esta tarea no existe'), texto: __('Puede que la hayan borrado o que sea de otra marca.') })}
          </div>
        </div>`);
      this.updateLinksForRouter();
      return;
    }
    this.p = p;
    this.opciones = opciones;
    this.campos = await window.TareasDatos.entradasDelFlujo(p.flowId, opciones);
    const seccion = (clase, titulo, cuerpo, extra = '') => `
      <section class="task-detail-section ${clase}">
        <header class="task-detail-section-header"><h2 class="task-detail-section-title">${titulo}</h2>${extra}</header>
        ${cuerpo}
      </section>`;
    window.Estado.pintar(raiz, `
      <div class="task-detail-wrapper" id="taskDetailContainer">
        <div class="task-detail">
          <header class="task-detail-header">
            <div class="task-detail-header-left">
              ${this._volverHTML()}
              <div class="task-detail-title-block" id="taskDetailTitulo"></div>
            </div>
            <div class="task-detail-header-right" id="taskDetailAcciones"></div>
          </header>
          <div class="task-detail-grid">
            ${seccion('task-detail-dashboard', __('Dashboard'), '<div class="task-detail-metrics" id="taskDetailMetrics"></div><div id="taskDetailNota"></div>', '<span class="task-detail-estados" id="taskDetailEstados"></span>')}
            <aside class="task-detail-section task-detail-editor">
              <header class="task-detail-section-header"><h2 class="task-detail-section-title">${__('Editar')}</h2></header>
              ${this._formHTML(p)}
            </aside>
            ${seccion('task-detail-previa', __('Si corriera ahora'), `<div id="taskDetailPrevia">${window.Estado.cargando('texto', 3)}</div>`)}
            ${seccion('task-detail-runs', __('Últimas ejecuciones'), `<p class="task-detail-nota">${__('Son las últimas corridas de este flujo en la marca: la base aún no marca cuáles lanzó esta tarea.')}</p><div class="task-detail-runs-body" id="taskDetailRunsBody">${window.Estado.cargando('filas', 3)}</div>`)}
          </div>
        </div>
      </div>`);
    this._fondo(p.portada);
    this.updateLinksForRouter();
    this._pintarCabecera();
    this._pintarDashboard();
    this._enlazarFormulario(raiz);
    this._enlazarAcciones(raiz);
    this._cargarPrevia();
    this._cargarCorridas();
  }

  _estadosHTML(p) {
    const e = this._estado(p);
    return `<span class="badge badge--sm ${e.badge}">${this.escapeHtml(e.etiqueta)}</span>${p.heredada ? `<span class="badge badge--sm badge--advertencia">${__('Entradas de v1')}</span>` : ''}`;
  }

  _pintarCabecera() {
    const p = this.p;
    const titulo = document.getElementById('taskDetailTitulo');
    const acciones = document.getElementById('taskDetailAcciones');
    if (!p || !titulo || !acciones) return;
    window.Estado.pintar(titulo, `
      <h1 class="task-detail-title">${this.escapeHtml(p.nombre || __('Tarea sin nombre'))}</h1>
      <p class="task-detail-subtitle">${this.escapeHtml(p.flujo || __('Flujo sin nombre'))} · ${this.escapeHtml(this.M.describirCron(p.cron))}</p>`);
    window.Estado.pintar(acciones, `
      ${p.activa
        ? `<button type="button" class="btn btn--gris" data-accion="pausar"><i class="aisc-ico aisc-ico--pause" aria-hidden="true"></i> ${__('Pausar')}</button>`
        : `<button type="button" class="btn btn--gris" data-accion="activar"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i> ${__('Activar')}</button>`}
      <button type="button" class="btn btn--gris" data-accion="duplicar"><i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i> ${__('Duplicar')}</button>
      <button type="button" class="btn btn--gris btn--peligro" data-accion="borrar"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i> ${__('Eliminar')}</button>
      <button type="submit" form="tareasForm" class="btn btn--oscuro" id="tfGuardar"><i class="aisc-ico aisc-ico--save" aria-hidden="true"></i> ${__('Guardar')}</button>`);
  }

  _pintarDashboard() {
    const p = this.p;
    const host = document.getElementById('taskDetailMetrics');
    const nota = document.getElementById('taskDetailNota');
    const estados = document.getElementById('taskDetailEstados');
    if (!p || !host || !nota || !estados) return;
    window.Estado.pintar(estados, this._estadosHTML(p));
    const proxima = p.activa && p.proxima ? this._fechaPartes(p.proxima, p.zona) : null;
    const ultima = p.ultima ? this._fechaPartes(p.ultima, p.zona) : null;
    const metricas = [
      { etiqueta: __('Próxima corrida'), valor: proxima ? proxima.rel : __('En pausa'), pista: proxima ? `${proxima.abs} · ${p.zona}` : __('No correrá mientras esté en pausa') },
      { etiqueta: __('Última corrida'), valor: ultima ? ultima.rel : '—', pista: ultima ? ultima.abs : __('Nunca') },
      { etiqueta: __('Corridas'), valor: String(p.corridas), pista: __('Desde que se creó') },
      { etiqueta: __('Omitidas'), valor: String(p.omitidas), pista: p.fallos ? __('{n} seguidas', { n: p.fallos }) : '—' },
    ];
    window.Estado.pintar(host, metricas.map((m) => `
      <div class="task-detail-metric">
        <span class="task-detail-metric-label">${this.escapeHtml(m.etiqueta)}</span>
        <span class="task-detail-metric-value">${this.escapeHtml(m.valor)}</span>
        <span class="task-detail-metric-hint">${this.escapeHtml(m.pista)}</span>
      </div>`).join(''));
    window.Estado.pintar(nota, `
      ${p.motivo ? `<p class="task-detail-nota"><strong>${__('Último aviso de la base:')}</strong> ${this.escapeHtml(p.motivo)}</p>` : ''}
      <p class="task-detail-nota">${this.escapeHtml(p.alNoPoder === 'fallar' ? __('Si faltan entradas, la tarea se pausa sola.') : __('Si faltan entradas, esa corrida se salta y la tarea sigue. Con 10 fallos seguidos se pausa sola.'))}</p>`);
  }

  async _cargarPrevia() {
    const host = document.getElementById('taskDetailPrevia');
    if (!host || !this.p) return;
    try {
      const v = await window.TareasDatos.previa(this.p.id);
      const etiqueta = (k) => this.campos.find((c) => c.key === k)?.label || k;
      const filas = Object.entries(v.valores).map(([k, val]) => `<div class="task-detail-par"><dt>${this.escapeHtml(etiqueta(k))}</dt><dd>${this.escapeHtml(this._valorLegible(k, val))}</dd></div>`).join('');
      const delAgente = Object.entries(this.p.entradas).filter(([, r]) => this.M.esReceta(r) && r.modo === 'del_agente').map(([k]) => etiqueta(k));
      window.Estado.pintar(host, `
        <p class="task-detail-veredicto">${v.puede
          ? `<span class="badge badge--sm badge--exito">${__('Arrancaría')}</span> ${__('Con lo guardado, la corrida tiene todo lo obligatorio.')}`
          : `<span class="badge badge--sm badge--advertencia">${__('Se saltaría')}</span> ${this.escapeHtml(__('Faltan: {lista}.', { lista: v.faltan.map(etiqueta).join(', ') }))}`}</p>
        ${filas ? `<dl class="task-detail-pares">${filas}</dl>` : `<p class="task-detail-empty">${__('No lleva ninguna entrada con valor.')}</p>`}
        ${delAgente.length ? `<p class="task-detail-nota">${this.escapeHtml(__('Las llena Vera al arrancar: {lista}.', { lista: delAgente.join(', ') }))}</p>` : ''}
        <p class="task-detail-nota">${__('Es una vista previa: no lanza nada ni gasta créditos. Lo que rota avanza solo cuando corre de verdad.')}</p>`);
    } catch (e) {
      window.Estado.pintar(host, window.Estado.error({ titulo: __('No se pudo calcular la vista previa'), texto: e?.message || '', reintentar: false }));
    }
  }

  async _cargarCorridas() {
    const host = document.getElementById('taskDetailRunsBody');
    if (!host || !this.p) return;
    try {
      const corridas = await window.TareasDatos.corridasDelFlujo(this.organizationId, this.p.flowId, 8);
      if (!corridas.length) { window.Estado.pintar(host, `<p class="task-detail-empty">${__('Este flujo todavía no ha corrido en la marca.')}</p>`); return; }
      window.Estado.pintar(host, `
        <div class="task-detail-runs-table" role="table">
          <div class="task-detail-runs-thead" role="row">
            <div role="columnheader">${__('Fecha')}</div>
            <div role="columnheader">${__('Estado')}</div>
            <div role="columnheader" class="task-detail-runs-th--num">${__('Costo')}</div>
          </div>
          <div class="task-detail-runs-tbody" role="rowgroup">
            ${corridas.map((r) => {
              const e = this.M.estadoCorrida(r.status);
              const { rel, abs } = this._fechaPartes(r.created_at);
              return `
              <div class="task-detail-runs-row" role="row">
                <div role="cell" class="task-detail-runs-cell--when"><span class="task-detail-runs-rel">${this.escapeHtml(rel)}</span><span class="task-detail-runs-abs">${this.escapeHtml(abs)}</span></div>
                <div role="cell"><span class="badge badge--sm ${e.badge}">${this.escapeHtml(e.etiqueta)}</span></div>
                <div role="cell" class="task-detail-runs-cell--num">${r.credits_charged == null ? '—' : this.escapeHtml(Number(r.credits_charged).toLocaleString(this._locale()))}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`);
    } catch (e) {
      window.Estado.pintar(host, window.Estado.error({ titulo: __('No se pudieron leer las corridas'), texto: e?.message || '', reintentar: false }));
    }
  }

  _valorLegible(clave, valor) {
    const campo = this.campos.find((c) => c.key === clave);
    if (typeof valor === 'string' && campo && Array.isArray(campo.options)) {
      const o = campo.options.find((x) => String(x?.value ?? x) === valor);
      if (o) return String(o.label ?? o.value ?? o);
    }
    if (typeof valor === 'string') {
      const el = this.opciones.elementos.find((x) => x.value === valor) || this.opciones.mercados.find((x) => x.value === valor);
      if (el) return el.label;
    }
    if (typeof valor === 'boolean') return valor ? __('Sí') : __('No');
    const s = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    return s.length > 160 ? s.slice(0, 157) + '…' : s;
  }

  /* ── El editor (nueva y detalle) ──────────────────────────────────────── */

  _formHTML(p) {
    const nueva = !p;
    const forma = this.M.formaDeCron(p ? p.cron : '0 9 * * 1');
    const opt = (v, texto, sel) => `<option value="${this.escapeHtml(v)}"${sel ? ' selected' : ''}>${this.escapeHtml(texto)}</option>`;
    const campo = (etiqueta, control, para = '') => `<div class="task-detail-field"><label class="task-detail-label"${para ? ` for="${para}"` : ''}>${etiqueta}</label>${control}</div>`;
    const FRECUENCIAS = [['diaria', __('Cada día')], ['semanal', __('Algunos días de la semana')], ['mensual', __('Un día de cada mes')], ['horas', __('Cada ciertas horas')], ['avanzada', __('Avanzada (cron)')]];
    const ZONAS = ['America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Caracas', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'];
    const flujo = nueva
      ? `<select class="task-detail-select" id="tfFlujo" required>${opt('', __('Elige un flujo'), true)}${(this.flujos || []).map((f) => opt(f.id, f.name, false)).join('')}</select>`
      : `<p class="task-detail-readonly">${this.escapeHtml(p.flujo || __('Flujo sin nombre'))}</p><p class="task-detail-nota">${__('Para usar otro flujo, duplica la tarea o crea una nueva.')}</p>`;
    return `
      <form class="task-detail-editor-body" id="tareasForm" novalidate>
        ${campo(__('Flujo'), flujo, nueva ? 'tfFlujo' : '')}
        ${campo(__('Nombre'), `<input class="task-detail-input" id="tfNombre" maxlength="120" autocomplete="off" value="${this.escapeHtml(p ? p.nombre : '')}" placeholder="${__('Ej.: Post de producto los lunes')}">`, 'tfNombre')}
        ${campo(__('Frecuencia'), `<select class="task-detail-select" id="tfFrecuencia">${FRECUENCIAS.map(([v, texto]) => opt(v, texto, v === forma.frecuencia)).join('')}</select>
          <div class="task-detail-frecuencia" id="tfFrecuenciaDetalle">${this._frecuenciaHTML(forma)}</div>`, 'tfFrecuencia')}
        ${campo(__('Regla activa'), `<p class="task-detail-readonly" id="tfFrase" aria-live="polite">${this.escapeHtml(this.M.describirCron(p ? p.cron : '0 9 * * 1'))}</p>`)}
        ${campo(__('Zona horaria'), `<input class="task-detail-input" id="tfZona" list="tfZonas" autocomplete="off" value="${this.escapeHtml(p ? p.zona : 'America/Bogota')}"><datalist id="tfZonas">${ZONAS.map((z) => `<option value="${z}"></option>`).join('')}</datalist>`, 'tfZona')}
        ${campo(__('Mercado'), `<select class="task-detail-select" id="tfMercado">${opt('', __('Sin mercado'), !(p && p.marketId))}${this.opciones.mercados.map((m) => opt(m.value, m.label, p && p.marketId === m.value)).join('')}</select>`, 'tfMercado')}
        ${campo(__('Si faltan entradas obligatorias'), `<select class="task-detail-select" id="tfAlNoPoder">${opt('omitir', __('Saltar esa corrida y seguir'), !p || p.alNoPoder !== 'fallar')}${opt('fallar', __('Pausar la tarea'), p && p.alNoPoder === 'fallar')}</select>`, 'tfAlNoPoder')}
        ${nueva ? '' : campo(__('Creación'), `<p class="task-detail-readonly">${this.escapeHtml(this._fechaCorta(p.creadaEn))}</p>`)}
        <fieldset class="task-detail-field task-detail-entradas">
          <legend class="task-detail-label">${__('Entradas del flujo')}</legend>
          <p class="task-detail-nota">${__('Qué recibe el flujo en cada corrida: un valor fijo, varios que rotan, un elemento de la marca o lo que decida Vera.')}</p>
          <div id="tfEntradas">${nueva ? `<p class="task-detail-nota">${__('Elige un flujo para ver sus entradas.')}</p>` : this._entradasHTML(p.entradas)}</div>
        </fieldset>
        <div id="tfAvisos" role="status"></div>
        <p class="task-detail-error" id="tfError" role="alert" hidden></p>
      </form>`;
  }

  _frecuenciaHTML(forma) {
    const f = forma || { frecuencia: 'diaria', hora: 9, minuto: 0 };
    const mini = (etiqueta, control) => `<label class="task-detail-mini"><span>${etiqueta}</span>${control}</label>`;
    const hora = mini(__('Hora'), `<input class="task-detail-input" type="time" id="tfHora" value="${String(Number(f.hora) || 0).padStart(2, '0')}:${String(Number(f.minuto) || 0).padStart(2, '0')}">`);
    if (f.frecuencia === 'diaria') return hora;
    if (f.frecuencia === 'semanal') {
      const nombres = [__('Lun'), __('Mar'), __('Mié'), __('Jue'), __('Vie'), __('Sáb'), __('Dom')];
      const dias = [1, 2, 3, 4, 5, 6, 0].map((d, i) => {
        const on = (f.dias || []).includes(d);
        return `<button type="button" class="chip${on ? ' chip--activo' : ''}" data-dia="${d}" aria-pressed="${on}">${nombres[i]}</button>`;
      }).join('');
      return `<div class="task-detail-dias" role="group" aria-label="${__('Días de la semana')}">${dias}</div>${hora}`;
    }
    if (f.frecuencia === 'mensual') {
      return `${mini(__('Día del mes'), `<input class="task-detail-input" type="number" min="1" max="31" id="tfDiaMes" value="${Number(f.diaDelMes) || 1}">`)}${hora}
        <p class="task-detail-nota">${__('Los meses que no tienen ese día (29, 30 o 31) se saltan.')}</p>`;
    }
    if (f.frecuencia === 'horas') {
      return mini(__('Cada cuántas horas'), `<input class="task-detail-input" type="number" min="1" max="12" id="tfCadaHoras" value="${Number(f.cadaHoras) || 1}">`) +
        mini(__('En el minuto'), `<input class="task-detail-input" type="number" min="0" max="59" id="tfMinuto" value="${Number(f.minuto) || 0}">`);
    }
    return `${mini(__('Expresión cron'), `<input class="task-detail-input" id="tfCron" autocomplete="off" spellcheck="false" value="${this.escapeHtml(f.cron || '')}" placeholder="0 9 * * 1">`)}
      <p class="task-detail-nota">${__('Cinco campos: minuto, hora, día del mes, mes y día de la semana (0 = domingo … 6 = sábado).')}</p>`;
  }

  _modoTexto(modo) {
    return { por_defecto: __('Valor por defecto'), fijo: __('Siempre el mismo'), rotar: __('Rotar entre varios'), elemento: __('Un elemento de la marca'), del_agente: __('Lo decide Vera') }[modo] || modo;
  }

  _entradasHTML(entradas) {
    if (!this.campos.length) return `<p class="task-detail-nota">${__('Este flujo no pide entradas.')}</p>`;
    return this.campos.map((c, i) => this._entradaHTML(c, this.M.formularioDeEntrada((entradas || {})[c.key]), i)).join('');
  }

  _entradaHTML(campo, form, i) {
    const modos = this.M.modosPara(campo.kind);
    const modo = modos.includes(form.modo) ? form.modo : 'por_defecto';
    const heredado = form.heredado !== undefined
      ? `<p class="task-detail-nota">${this.escapeHtml(__('Guardado en v1: «{v}». La base no lo usa: elige un modo para que cuente.', { v: typeof form.heredado === 'object' ? JSON.stringify(form.heredado) : String(form.heredado) }))}</p>` : '';
    return `
      <div class="task-detail-entrada" data-entrada="${this.escapeHtml(campo.key)}">
        <div class="task-detail-entrada-cab">
          <label class="task-detail-entrada-nombre" for="tfModo${i}">${this.escapeHtml(campo.label)}</label>
          ${campo.required ? `<span class="task-detail-obligatoria">${__('obligatoria')}</span>` : ''}
        </div>
        ${campo.description ? `<p class="task-detail-nota">${this.escapeHtml(campo.description)}</p>` : ''}
        <select class="task-detail-select" id="tfModo${i}" data-modo>${modos.map((m) => `<option value="${m}"${m === modo ? ' selected' : ''}>${this.escapeHtml(this._modoTexto(m))}</option>`).join('')}</select>
        <div class="task-detail-entrada-valor" data-valor>${this._valorHTML(campo, { ...form, modo }, i)}</div>
        ${heredado}
      </div>`;
  }

  _opcionesDe(campo) {
    return (Array.isArray(campo.options) ? campo.options : []).map((o) => (o && typeof o === 'object' ? { value: String(o.value ?? o.label ?? ''), label: String(o.label ?? o.value ?? '') } : { value: String(o), label: String(o) }));
  }

  _valorHTML(campo, form, i) {
    const nota = (texto) => `<p class="task-detail-nota">${this.escapeHtml(texto)}</p>`;
    const ops = this._opcionesDe(campo);
    const id = `tfValor${i}`;
    if (form.modo === 'del_agente') return nota(__('Vera la llena al arrancar cada corrida.'));
    if (form.modo === 'por_defecto') {
      const d = campo.defaultValue;
      if (d !== undefined && d !== null && d !== '') return nota(__('Usa el valor por defecto del flujo: «{v}».', { v: this._valorLegible(campo.key, d) }));
      return nota(campo.required ? __('No tiene valor por defecto: sin otro modo, la corrida se saltará.') : __('Sin valor por defecto: va vacía.'));
    }
    if (form.modo === 'elemento') {
      const tipos = [['', __('De cualquier tipo')], ['product', __('Un producto')], ['service', __('Un servicio')], ['character', __('Un personaje')], ['scenario', __('Un escenario')], ['identity', __('La identidad')]];
      const criterios = [['menos_usado', __('El que menos ha salido')], ['mas_reciente', __('El más reciente')], ['azar', __('Al azar')], ['destacado', __('Solo los destacados')]];
      const sel = (lista, actual, campoDato, etiqueta) => `<select class="task-detail-select" data-campo="${campoDato}" aria-label="${this.escapeHtml(etiqueta)}">${lista.map(([v, t]) => `<option value="${v}"${v === (actual || '') ? ' selected' : ''}>${this.escapeHtml(t)}</option>`).join('')}</select>`;
      return sel(tipos, form.tipo, 'tipo', __('Tipo de elemento')) + sel(criterios, form.criterio || 'menos_usado', 'criterio', __('Cuál elegir')) +
        nota(__('En cada corrida elige uno del catálogo de la marca: lo que entre al catálogo después, entra solo.'));
    }
    if (form.modo === 'rotar') {
      if (ops.length) {
        const marcados = new Set(String(form.valores || '').split('\n'));
        return `<div class="task-detail-dias" role="group" aria-label="${this.escapeHtml(__('Valores que rotan'))}">${ops.map((o) => `<label class="chip task-detail-check"><input type="checkbox" data-campo="valores" value="${this.escapeHtml(o.value)}"${marcados.has(o.value) ? ' checked' : ''}> ${this.escapeHtml(o.label)}</label>`).join('')}</div>` +
          nota(__('Marca dos o más: cada corrida usa el siguiente.'));
      }
      return `<textarea class="task-detail-textarea" data-campo="valores" rows="4" aria-label="${this.escapeHtml(__('Valores que rotan'))}" placeholder="${__('Un valor por línea')}">${this.escapeHtml(form.valores || '')}</textarea>` +
        nota(__('Uno por línea: cada corrida usa el siguiente y al final vuelve a empezar.'));
    }
    // fijo
    if (ops.length) {
      return `<select class="task-detail-select" data-campo="valor" id="${id}" aria-label="${this.escapeHtml(campo.label)}"><option value="">${__('Elige un valor')}</option>${ops.map((o) => `<option value="${this.escapeHtml(o.value)}"${o.value === String(form.valor ?? '') ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`).join('')}</select>`;
    }
    if (campo.kind === 'boolean') {
      return `<select class="task-detail-select" data-campo="valor" id="${id}" aria-label="${this.escapeHtml(campo.label)}"><option value="true"${form.valor === 'true' ? ' selected' : ''}>${__('Sí')}</option><option value="false"${form.valor === 'false' ? ' selected' : ''}>${__('No')}</option></select>`;
    }
    if (campo.kind === 'long_text') return `<textarea class="task-detail-textarea" data-campo="valor" id="${id}" rows="3" aria-label="${this.escapeHtml(campo.label)}">${this.escapeHtml(form.valor || '')}</textarea>`;
    const tipo = campo.kind === 'number' ? 'number' : 'text';
    return `<input class="task-detail-input" type="${tipo}"${tipo === 'number' ? ' step="any"' : ''} data-campo="valor" id="${id}" aria-label="${this.escapeHtml(campo.label)}" value="${this.escapeHtml(form.valor || '')}"${campo.placeholder ? ` placeholder="${this.escapeHtml(campo.placeholder)}"` : ''}>`;
  }

  /** Lee una fila de entrada del DOM → formulario de TareasDatos. */
  _leerEntrada(fila) {
    const q = (s) => fila.querySelector(s);
    const checks = [...fila.querySelectorAll('input[type="checkbox"][data-campo="valores"]')];
    return {
      modo: q('[data-modo]')?.value || 'por_defecto',
      valor: q('[data-campo="valor"]')?.value ?? '',
      valores: checks.length ? checks.filter((c) => c.checked).map((c) => c.value).join('\n') : (q('textarea[data-campo="valores"]')?.value ?? ''),
      tipo: q('[data-campo="tipo"]')?.value || '',
      criterio: q('[data-campo="criterio"]')?.value || 'menos_usado',
    };
  }

  _leerCron(form) {
    const q = (s) => form.querySelector(s);
    const frecuencia = q('#tfFrecuencia')?.value || 'diaria';
    const [h, m] = String(q('#tfHora')?.value || '09:00').split(':').map(Number);
    return this.M.cronDeForma({
      frecuencia, hora: h, minuto: frecuencia === 'horas' ? Number(q('#tfMinuto')?.value) || 0 : m,
      dias: [...form.querySelectorAll('[data-dia][aria-pressed="true"]')].map((b) => Number(b.dataset.dia)),
      diaDelMes: Number(q('#tfDiaMes')?.value) || 1, cadaHoras: Number(q('#tfCadaHoras')?.value) || 1, cron: q('#tfCron')?.value || '',
    });
  }

  _refrescarFrase(form) {
    const frase = form.querySelector('#tfFrase');
    if (!frase) return;
    const cron = this._leerCron(form);
    const error = cron ? this.M.validarCron(cron) : __('Elige al menos un día.');
    frase.textContent = error || this.M.describirCron(cron);
    frase.classList.toggle('es-error', !!error);
  }

  _enlazarFormulario(raiz) {
    const form = raiz.querySelector('#tareasForm');
    if (!form) return;
    this.addEventListener(form, 'click', (e) => {
      const dia = e.target.closest('[data-dia]');
      if (!dia) return;
      const on = dia.getAttribute('aria-pressed') !== 'true';
      dia.setAttribute('aria-pressed', String(on));
      dia.classList.toggle('chip--activo', on);
      this._refrescarFrase(form);
    });
    this.addEventListener(form, 'input', () => this._refrescarFrase(form));
    this.addEventListener(form, 'change', async (e) => {
      if (e.target.id === 'tfFrecuencia') {
        const actual = this.M.formaDeCron(this._leerCron(form));
        const forma = { ...actual, frecuencia: e.target.value };
        if (forma.hora === undefined) forma.hora = 9;
        if (forma.frecuencia === 'semanal' && !(forma.dias || []).length) forma.dias = [1];
        if (forma.frecuencia === 'avanzada') forma.cron = this._leerCron(form) || '0 9 * * 1';
        window.Estado.pintar(form.querySelector('#tfFrecuenciaDetalle'), this._frecuenciaHTML(forma));
        this._refrescarFrase(form);
        return;
      }
      if (e.target.id === 'tfFlujo') { await this._cambiarFlujo(form, e.target.value); return; }
      if (e.target.matches('[data-modo]')) {
        const fila = e.target.closest('[data-entrada]');
        const campo = this.campos.find((c) => c.key === fila?.dataset.entrada);
        if (!fila || !campo) return;
        const i = this.campos.indexOf(campo);
        window.Estado.pintar(fila.querySelector('[data-valor]'), this._valorHTML(campo, this._leerEntrada(fila), i));
      }
    });
    this.addEventListener(form, 'submit', (e) => { e.preventDefault(); this._guardar(form); });
    this._refrescarFrase(form);
  }

  async _cambiarFlujo(form, flowId) {
    const host = form.querySelector('#tfEntradas');
    this.campos = [];
    this._fondo((this.flujos || []).find((x) => x.id === flowId)?.flow_image_url || null);
    if (!flowId) { window.Estado.pintar(host, `<p class="task-detail-nota">${__('Elige un flujo para ver sus entradas.')}</p>`); return; }
    window.Estado.pintar(host, window.Estado.cargando('filas', 3));
    try {
      this.campos = await window.TareasDatos.entradasDelFlujo(flowId, this.opciones);
      window.Estado.pintar(host, this._entradasHTML({}));
      const nombre = form.querySelector('#tfNombre');
      const f = (this.flujos || []).find((x) => x.id === flowId);
      if (nombre && !nombre.value.trim() && f) nombre.value = f.name;
    } catch (e) {
      window.Estado.pintar(host, window.Estado.error({ titulo: __('No se pudieron leer las entradas del flujo'), texto: e?.message || '', reintentar: false }));
    }
  }

  _error(form, texto) {
    const el = form.querySelector('#tfError');
    if (!el) return;
    el.textContent = texto || '';
    el.hidden = !texto;
  }

  async _guardar(form) {
    const q = (s) => form.querySelector(s);
    this._error(form, '');
    form.querySelectorAll('[aria-invalid="true"]').forEach((x) => x.removeAttribute('aria-invalid'));
    const nueva = !this.p;
    const flowId = nueva ? q('#tfFlujo')?.value : this.p.flowId;
    const nombre = String(q('#tfNombre')?.value || '').trim();
    const cron = this._leerCron(form);
    const zona = String(q('#tfZona')?.value || '').trim() || 'America/Bogota';
    if (nueva && !flowId) { q('#tfFlujo')?.setAttribute('aria-invalid', 'true'); return this._error(form, __('Elige el flujo que va a correr.')); }
    if (!nombre) { q('#tfNombre')?.setAttribute('aria-invalid', 'true'); return this._error(form, __('Ponle un nombre a la tarea.')); }
    const errCron = cron ? this.M.validarCron(cron) : __('Elige al menos un día.');
    if (errCron) return this._error(form, errCron);
    const formularios = {};
    form.querySelectorAll('[data-entrada]').forEach((fila) => { formularios[fila.dataset.entrada] = this._leerEntrada(fila); });
    const { entradas, errores } = this.M.componerEntradas(nueva ? {} : this.p.entradas, this.campos, formularios);
    if (errores.length) {
      errores.forEach((x) => form.querySelector(`[data-entrada="${CSS.escape(x.key)}"] [data-modo]`)?.setAttribute('aria-invalid', 'true'));
      const etiqueta = (k) => this.campos.find((c) => c.key === k)?.label || k;
      return this._error(form, errores.map((x) => `${etiqueta(x.key)}: ${x.texto}`).join(' · '));
    }
    const avisos = this.M.avisosDeEntradas(this.campos, entradas);
    window.Estado.pintar(q('#tfAvisos'), avisos.length ? `<p class="task-detail-aviso">${this.escapeHtml(__('Sin valor: {lista}. Mientras sigan así, cada corrida se saltará.', { lista: avisos.map((k) => this.campos.find((c) => c.key === k)?.label || k).join(', ') }))}</p>` : '');
    const datos = { nombre, cron, zona, entradas, marketId: q('#tfMercado')?.value || null, alNoPoder: q('#tfAlNoPoder')?.value };
    const boton = document.getElementById('tfGuardar');
    if (boton) boton.disabled = true;
    try {
      if (nueva) {
        const p = await window.TareasDatos.crear(this.organizationId, await this._usuarioId(), { ...datos, flowId });
        window.Capas.avisar(__('Tarea creada en pausa.'), { type: 'success' });
        this._ir(this._ruta('/' + p.id));
        return;
      }
      this.p = await window.TareasDatos.guardar(this.p.id, datos);
      window.Capas.avisar(__('Cambios guardados.'), { type: 'success' });
      this._pintarCabecera();
      this._pintarDashboard();
      this._cargarPrevia();
    } catch (e) {
      this._error(form, e?.message || __('No se pudo guardar.'));
    } finally {
      const b = document.getElementById('tfGuardar');
      if (b) b.disabled = false;
    }
  }

  _enlazarAcciones(raiz) {
    this.addEventListener(raiz, 'click', async (e) => {
      const b = e.target.closest('[data-accion]');
      if (!b || !this.p) return;
      const accion = b.dataset.accion;
      const p = this.p;
      if (accion === 'activar') {
        const si = await window.Capas.confirmar({
          titulo: __('¿Activar «{nombre}»?', { nombre: p.nombre }),
          texto: __('Correrá sola: {frecuencia} ({zona}). Cada corrida gasta créditos de la marca.', { frecuencia: this.M.describirCron(p.cron), zona: p.zona }),
          aceptar: __('Activar'),
        });
        if (!si) return;
      }
      if (accion === 'borrar') {
        const si = await window.Capas.confirmar({ titulo: __('¿Eliminar «{nombre}»?', { nombre: p.nombre }), texto: __('La tarea deja de correr. Lo que ya produjo se queda en Producciones.'), aceptar: __('Eliminar'), peligro: true });
        if (!si) return;
      }
      b.disabled = true;
      try {
        if (accion === 'activar' || accion === 'pausar') {
          this.p = await window.TareasDatos.activar(p.id, accion === 'activar');
          window.Capas.avisar(this.p.activa ? __('Tarea activa.') : __('Tarea en pausa.'), { type: 'success' });
          this._pintarCabecera();
          this._pintarDashboard();
        } else if (accion === 'duplicar') {
          const copia = await window.TareasDatos.duplicar(p, await this._usuarioId());
          window.Capas.avisar(__('Copia creada en pausa.'), { type: 'success' });
          this._ir(this._ruta('/' + copia.id));
        } else if (accion === 'borrar') {
          await window.TareasDatos.borrar(p.id);
          window.Capas.avisar(__('Tarea eliminada.'), { type: 'success' });
          this._ir(this._ruta());
        }
      } catch (err) {
        window.Capas.avisar(err?.message || __('No se pudo hacer.'), { type: 'error', duration: 7000 });
      } finally {
        b.disabled = false;
      }
    });
  }

  /* ── Utilidades ───────────────────────────────────────────────────────── */

  /** Quién crea: pg_cron corre la tarea con los permisos de created_by (si deja la marca, se apaga). */
  async _usuarioId() {
    const id = window.authService?.getCurrentUser?.()?.id;
    if (id) return id;
    try {
      const sb = await window.supabaseService?.getClient?.();
      return (await sb?.auth?.getUser?.())?.data?.user?.id || null;
    } catch (e) {
      console.warn('[tareas] sin usuario de la sesión:', e?.message || e);
      return null;
    }
  }

  _locale() { return (window.i18n && typeof window.i18n.getLocale === 'function' && window.i18n.getLocale() === 'en') ? 'en-US' : 'es-CO'; }

  _fechaCorta(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(this._locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Relativa («hace 3 h», «en 2 d») y absoluta; con `zona`, la absoluta en la zona de la tarea. */
  _fechaPartes(iso, zona) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return { rel: '—', abs: '' };
    const dif = d.getTime() - Date.now();
    const m = Math.floor(Math.abs(dif) / 60000);
    const [n, unidad] = m < 60 ? [m, 'min'] : m < 1440 ? [Math.floor(m / 60), 'h'] : [Math.floor(m / 1440), 'd'];
    const rel = m < 1 ? __('ahora')
      : dif > 0 ? { min: __('en {n} min', { n }), h: __('en {n} h', { n }), d: __('en {n} d', { n }) }[unidad]
        : { min: __('hace {n} min', { n }), h: __('hace {n} h', { n }), d: __('hace {n} d', { n }) }[unidad];
    const o = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
    let abs;
    try { abs = d.toLocaleString(this._locale(), zona ? { ...o, timeZone: zona } : o); } catch (_) { abs = d.toLocaleString(this._locale(), o); }
    return { rel, abs };
  }

  async onLeave() {
    this.cleanup();
  }
}

window.TareasView = TareasView;
