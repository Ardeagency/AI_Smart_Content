/**
 * TareasView — las TAREAS (/tasks): flujos que corren solos en la fecha que se elija
 * (flows.schedules) sobre la base nueva (corte ADR-0052). Todo pasa por TareasDatos
 * (js/services/TareasDataService.js); la vista no lee la base directo.
 *
 *   /tasks            lista (Todas · Activas · En pausa) o calendario semanal
 *   /tasks/nueva      crear (siempre EN PAUSA: activar es un paso aparte que gasta créditos)
 *   /tasks/:taskId    detalle: resumen, «si corriera ahora» (resolver_entradas), corridas
 *                     del flujo y el formulario (nombre, frecuencia, zona, mercado, entradas)
 *
 * Reemplaza a la TasksView de v1 (flow_schedules, borrada en 32d3f821). Lo que v1 tenía y la
 * base nueva no: `color` por tarea (no existe la columna) y el historial por tarea
 * (flows.runs no guarda qué programación lanzó cada corrida: se muestran las del flujo).
 */
class TareasView extends BaseView {
  static cacheable = false;
  static get documentTitle() { return __('Tareas'); }

  constructor() {
    super();
    this.organizationId = null;
    this.lista = [];
    this.filtro = 'todas';
    this.vista = TareasView._leerVista();
    this.lunes = null;
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
    return `<div class="insight-page tareas" id="tareasPage">${window.Estado.cargando('filas', 4)}</div>`;
  }

  async render() {
    await super.render();
    const raiz = document.getElementById('tareasPage');
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
      window.Estado.pintar(raiz, window.Estado.error({ titulo: __('No se pudieron cargar las tareas'), texto: err?.message || '' }));
    }
  }

  /* ════════════════════════ LISTA Y CALENDARIO ════════════════════════ */

  async _abrirLista(raiz) {
    window.Estado.pintar(raiz, `
      <header class="insight-header">
        <div class="insight-header-left">
          <h1 class="insight-title">${__('Tareas')}</h1>
          <p class="insight-subtitle">${__('Flujos que corren solos en la fecha que elijas, con las entradas que definas.')}</p>
        </div>
        <div class="insight-header-right">
          <div class="tareas-vistas" role="group" aria-label="${__('Vista')}">
            <button type="button" class="chip" data-vista="lista"><i class="aisc-ico aisc-ico--grid" aria-hidden="true"></i> ${__('Lista')}</button>
            <button type="button" class="chip" data-vista="calendario"><i class="aisc-ico aisc-ico--calendar" aria-hidden="true"></i> ${__('Calendario')}</button>
          </div>
          <a class="btn btn--blanco" href="${this.escapeHtml(this._ruta('/nueva'))}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i> ${__('Nueva tarea')}</a>
        </div>
      </header>
      <nav class="tareas-filtros" id="tareasFiltros" aria-label="${__('Filtrar tareas')}"></nav>
      <section id="tareasCuerpo" aria-live="polite">${window.Estado.cargando('filas', 4)}</section>`);
    this.updateLinksForRouter();
    this._enlazarLista(raiz);
    this.lista = await window.TareasDatos.programaciones(this.organizationId);
    this._pintarLista();
    this._vivo();
  }

  _enlazarLista(raiz) {
    this.addEventListener(raiz, 'click', (e) => {
      const v = e.target.closest('[data-vista]');
      if (v) { this.vista = v.dataset.vista; TareasView._guardarVista(this.vista); this._pintarLista(); return; }
      const f = e.target.closest('[data-filtro]');
      if (f) { this.filtro = f.dataset.filtro; this._pintarLista(); return; }
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
    const raiz = document.getElementById('tareasPage');
    const cuerpo = document.getElementById('tareasCuerpo');
    const filtros = document.getElementById('tareasFiltros');
    if (!raiz || !cuerpo || !filtros) return;
    raiz.querySelectorAll('[data-vista]').forEach((b) => {
      const activo = b.dataset.vista === this.vista;
      b.classList.toggle('chip--activo', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    const n = this.M.contar(this.lista);
    const chip = (clave, texto, cuantas) => `<button type="button" class="chip${this.filtro === clave ? ' chip--activo' : ''}" data-filtro="${clave}" aria-pressed="${this.filtro === clave}">${this.escapeHtml(texto)} · ${cuantas}</button>`;
    window.Estado.pintar(filtros, this.lista.length ? chip('todas', __('Todas'), n.todas) + chip('activas', __('Activas'), n.activas) + chip('pausadas', __('En pausa'), n.pausadas) : '');

    if (!this.lista.length) {
      window.Estado.pintar(cuerpo, window.Estado.vacio({
        icono: 'aisc-ico aisc-ico--calendar',
        titulo: __('Todavía no hay tareas'),
        texto: __('Una tarea corre un flujo sola: todos los lunes a las 9, cada día a mediodía… Tú eliges el flujo, la frecuencia y qué entradas usa cada vez.'),
        accion: __('Nueva tarea'),
      }));
      window.Estado.alAccion(cuerpo, () => this._ir(this._ruta('/nueva')));
      return;
    }
    const visibles = this.M.filtrar(this.lista, this.filtro);
    if (this.vista === 'calendario') this._pintarCalendario(cuerpo, visibles);
    else if (!visibles.length) {
      window.Estado.pintar(cuerpo, window.Estado.vacio({ compacto: true, icono: 'aisc-ico aisc-ico--calendar', titulo: this.filtro === 'activas' ? __('Ninguna tarea está activa') : __('Ninguna tarea está en pausa') }));
    } else {
      window.Estado.pintar(cuerpo, `<ul class="tareas-lista">${visibles.map((p) => this._filaHTML(p)).join('')}</ul>`);
    }
    this.updateLinksForRouter();
  }

  _estadoHTML(p) {
    const e = this.M.estadoProgramacion(p);
    return `<span class="badge badge--sm ${e.badge}">${this.escapeHtml(e.etiqueta)}</span>`;
  }

  _filaHTML(p) {
    const proxima = p.activa && p.proxima ? __('Próxima: {fecha}', { fecha: this._fecha(p.proxima, p.zona) }) : __('No correrá mientras esté en pausa');
    return `
      <li>
        <a class="tareas-fila superficie superficie--1 superficie--interactiva" href="${this.escapeHtml(this._ruta('/' + p.id))}">
          <span class="tareas-fila-principal">
            <strong class="tareas-fila-nombre">${this.escapeHtml(p.nombre)}</strong>
            <span class="tareas-fila-sub">${this.escapeHtml(p.flujo || __('Flujo sin nombre'))} · ${this.escapeHtml(this.M.describirCron(p.cron))}</span>
            ${p.motivo ? `<span class="tareas-fila-motivo">${this.escapeHtml(p.motivo)}</span>` : ''}
          </span>
          <span class="tareas-fila-meta">
            <span class="tareas-fila-estados">${this._estadoHTML(p)}${p.heredada ? `<span class="badge badge--sm badge--advertencia">${__('Entradas de v1')}</span>` : ''}</span>
            <span class="tareas-fila-dato">${this.escapeHtml(proxima)}</span>
            <span class="tareas-fila-dato">${this.escapeHtml(__('{c} corridas · {o} omitidas', { c: p.corridas, o: p.omitidas }))}</span>
          </span>
        </a>
      </li>`;
  }

  _pintarCalendario(cuerpo, visibles) {
    if (!this.lunes) this.lunes = this.M.inicioDeSemana(new Date());
    const semana = this.M.agendaDeSemana(visibles, this.lunes);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const loc = this._locale();
    const titulo = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' }).formatRange
      ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).formatRange(semana[0].fecha, semana[6].fecha)
      : `${semana[0].fecha.toLocaleDateString(loc)} – ${semana[6].fecha.toLocaleDateString(loc)}`;
    const dia = new Intl.DateTimeFormat(loc, { weekday: 'short' });
    const dias = semana.map(({ fecha, eventos }) => `
      <section class="tareas-cal-dia${fecha.getTime() === hoy.getTime() ? ' es-hoy' : ''}" aria-label="${this.escapeHtml(fecha.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }))}">
        <header class="tareas-cal-cab"><span class="tareas-cal-dow">${this.escapeHtml(dia.format(fecha))}</span><span class="tareas-cal-num">${fecha.getDate()}</span></header>
        ${eventos.length ? `<ol class="tareas-cal-eventos">${eventos.map((e) => `
          <li><a class="tareas-cal-evento superficie superficie--1 superficie--interactiva${e.p.activa ? '' : ' es-pausada'}" href="${this.escapeHtml(this._ruta('/' + e.p.id))}">
            <span class="tareas-cal-hora">${this.escapeHtml(e.veces > 1 ? __('{n} veces', { n: e.veces }) : `${String(e.hora).padStart(2, '0')}:${String(e.minuto).padStart(2, '0')}`)}</span>
            <span class="tareas-cal-nombre">${this.escapeHtml(e.p.nombre)}</span>
            ${this._estadoHTML(e.p)}
          </a></li>`).join('')}</ol>` : `<p class="tareas-cal-nada">${__('Nada programado')}</p>`}
      </section>`).join('');
    window.Estado.pintar(cuerpo, `
      <div class="tareas-cal">
        <div class="tareas-cal-barra">
          <strong class="tareas-cal-titulo">${this.escapeHtml(titulo)}</strong>
          <div class="tareas-cal-nav">
            <button type="button" class="btn btn--gris btn--sm btn--icono" data-semana="antes" aria-label="${__('Semana anterior')}"><i class="aisc-ico aisc-ico--chevron-left" aria-hidden="true"></i></button>
            <button type="button" class="btn btn--gris btn--sm" data-semana="hoy">${__('Hoy')}</button>
            <button type="button" class="btn btn--gris btn--sm btn--icono" data-semana="despues" aria-label="${__('Semana siguiente')}"><i class="aisc-ico aisc-ico--chevron-right" aria-hidden="true"></i></button>
          </div>
          <span class="tareas-cal-nota">${__('Cada hora va en la zona horaria de su tarea. Las que están en pausa se ven, pero no corren.')}</span>
        </div>
        <div class="tareas-cal-semana">${dias}</div>
      </div>`);
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

  /* ════════════════════════ DETALLE Y FORMULARIO ════════════════════════ */

  async _abrirNueva(raiz) {
    const [flujos, opciones] = await Promise.all([window.TareasDatos.flujos(this.organizationId), window.TareasDatos.opcionesDeMarca(this.organizationId)]);
    this.opciones = opciones;
    this.flujos = flujos;
    this.p = null;
    this.campos = [];
    window.Estado.pintar(raiz, `
      <a class="btn btn--gris btn--sm tareas-volver" href="${this.escapeHtml(this._ruta())}"><i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i> ${__('Tareas')}</a>
      <header class="insight-header">
        <div class="insight-header-left">
          <h1 class="insight-title">${__('Nueva tarea')}</h1>
          <p class="insight-subtitle">${__('Se crea en pausa. Cuando la actives, correrá sola en cada fecha y cada corrida gastará créditos de la marca.')}</p>
        </div>
      </header>
      <div class="tareas-nueva">${this._formHTML(null)}</div>`);
    this.updateLinksForRouter();
    this._enlazarFormulario(raiz);
  }

  async _abrirDetalle(raiz, id) {
    const [p, opciones] = await Promise.all([window.TareasDatos.programacion(this.organizationId, id), window.TareasDatos.opcionesDeMarca(this.organizationId)]);
    if (!p) {
      window.Estado.pintar(raiz, `<a class="btn btn--gris btn--sm tareas-volver" href="${this.escapeHtml(this._ruta())}"><i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i> ${__('Tareas')}</a>` +
        window.Estado.vacio({ icono: 'aisc-ico aisc-ico--calendar', titulo: __('Esta tarea no existe'), texto: __('Puede que la hayan borrado o que sea de otra marca.') }));
      this.updateLinksForRouter();
      return;
    }
    this.p = p;
    this.opciones = opciones;
    this.campos = await window.TareasDatos.entradasDelFlujo(p.flowId, opciones);
    window.Estado.pintar(raiz, `
      <a class="btn btn--gris btn--sm tareas-volver" href="${this.escapeHtml(this._ruta())}"><i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i> ${__('Tareas')}</a>
      <header class="insight-header" id="tareasCabecera"></header>
      <div class="tareas-detalle">
        <div class="tareas-col">
          <section class="superficie superficie--1 tareas-bloque" id="tareasResumen" aria-labelledby="tareasResumenT"></section>
          <section class="superficie superficie--1 tareas-bloque" id="tareasPrevia" aria-labelledby="tareasPreviaT">${window.Estado.cargando('texto', 3)}</section>
          <section class="superficie superficie--1 tareas-bloque" id="tareasCorridas" aria-labelledby="tareasCorridasT">${window.Estado.cargando('filas', 3)}</section>
        </div>
        <div class="tareas-col">${this._formHTML(p)}</div>
      </div>`);
    this.updateLinksForRouter();
    this._pintarCabecera();
    this._pintarResumen();
    this._enlazarFormulario(raiz);
    this._enlazarAcciones(raiz);
    this._cargarPrevia();
    this._cargarCorridas();
  }

  _pintarCabecera() {
    const host = document.getElementById('tareasCabecera');
    const p = this.p;
    if (!host || !p) return;
    window.Estado.pintar(host, `
      <div class="insight-header-left">
        <h1 class="insight-title">${this.escapeHtml(p.nombre)}</h1>
        <p class="insight-subtitle">${this.escapeHtml(p.flujo || __('Flujo sin nombre'))} · ${this.escapeHtml(this.M.describirCron(p.cron))}</p>
        <div class="tareas-estados">${this._estadoHTML(p)}${p.heredada ? `<span class="badge badge--sm badge--advertencia">${__('Entradas de v1')}</span>` : ''}</div>
      </div>
      <div class="insight-header-right tareas-acciones">
        ${p.activa
          ? `<button type="button" class="btn btn--oscuro" data-accion="pausar"><i class="aisc-ico aisc-ico--pause" aria-hidden="true"></i> ${__('Pausar')}</button>`
          : `<button type="button" class="btn btn--oscuro" data-accion="activar"><i class="aisc-ico aisc-ico--play" aria-hidden="true"></i> ${__('Activar')}</button>`}
        <button type="button" class="btn btn--gris" data-accion="duplicar"><i class="aisc-ico aisc-ico--copy" aria-hidden="true"></i> ${__('Duplicar')}</button>
        <button type="button" class="btn btn--gris btn--peligro" data-accion="borrar"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i> ${__('Eliminar')}</button>
      </div>`);
  }

  _pintarResumen() {
    const host = document.getElementById('tareasResumen');
    const p = this.p;
    if (!host || !p) return;
    const dato = (etiqueta, valor, pista = '') => `<div class="tareas-dato"><span class="tareas-dato-etiqueta">${this.escapeHtml(etiqueta)}</span><span class="tareas-dato-valor">${this.escapeHtml(valor)}</span>${pista ? `<span class="tareas-dato-pista">${this.escapeHtml(pista)}</span>` : ''}</div>`;
    window.Estado.pintar(host, `
      <h2 class="tareas-bloque-titulo" id="tareasResumenT">${__('Resumen')}</h2>
      <div class="tareas-datos">
        ${dato(__('Próxima corrida'), p.activa && p.proxima ? this._fecha(p.proxima, p.zona) : __('En pausa'), p.activa ? p.zona : '')}
        ${dato(__('Última corrida'), p.ultima ? this._fecha(p.ultima, p.zona) : __('Nunca'))}
        ${dato(__('Corridas'), String(p.corridas))}
        ${dato(__('Omitidas'), String(p.omitidas), p.fallos ? __('{n} seguidas', { n: p.fallos }) : '')}
      </div>
      ${p.motivo ? `<p class="tareas-motivo"><strong>${__('Último aviso de la base:')}</strong> ${this.escapeHtml(p.motivo)}</p>` : ''}
      <p class="form-hint">${this.escapeHtml(p.alNoPoder === 'fallar' ? __('Si faltan entradas, la tarea se pausa sola.') : __('Si faltan entradas, esa corrida se salta y la tarea sigue. Con 10 fallos seguidos se pausa sola.'))}</p>`);
  }

  async _cargarPrevia() {
    const host = document.getElementById('tareasPrevia');
    if (!host || !this.p) return;
    const cab = `<h2 class="tareas-bloque-titulo" id="tareasPreviaT">${__('Si corriera ahora')}</h2>`;
    try {
      const v = await window.TareasDatos.previa(this.p.id);
      const etiqueta = (k) => this.campos.find((c) => c.key === k)?.label || k;
      const filas = Object.entries(v.valores).map(([k, val]) => `<div class="tareas-par"><dt>${this.escapeHtml(etiqueta(k))}</dt><dd>${this.escapeHtml(this._valorLegible(k, val))}</dd></div>`).join('');
      const delAgente = Object.entries(this.p.entradas).filter(([, r]) => this.M.esReceta(r) && r.modo === 'del_agente').map(([k]) => etiqueta(k));
      window.Estado.pintar(host, `${cab}
        <p class="tareas-previa-veredicto">${v.puede
          ? `<span class="badge badge--sm badge--exito">${__('Arrancaría')}</span> ${__('Con lo guardado, la corrida tiene todo lo obligatorio.')}`
          : `<span class="badge badge--sm badge--advertencia">${__('Se saltaría')}</span> ${this.escapeHtml(__('Faltan: {lista}.', { lista: v.faltan.map(etiqueta).join(', ') }))}`}</p>
        ${filas ? `<dl class="tareas-pares">${filas}</dl>` : `<p class="form-hint">${__('No lleva ninguna entrada con valor.')}</p>`}
        ${delAgente.length ? `<p class="form-hint">${this.escapeHtml(__('Las llena Vera al arrancar: {lista}.', { lista: delAgente.join(', ') }))}</p>` : ''}
        <p class="form-hint">${__('Es una vista previa: no lanza nada ni gasta créditos. Lo que rota avanza solo cuando corre de verdad.')}</p>`);
    } catch (e) {
      window.Estado.pintar(host, cab + window.Estado.error({ titulo: __('No se pudo calcular la vista previa'), texto: e?.message || '', reintentar: false }));
    }
  }

  async _cargarCorridas() {
    const host = document.getElementById('tareasCorridas');
    if (!host || !this.p) return;
    const cab = `<h2 class="tareas-bloque-titulo" id="tareasCorridasT">${__('Corridas recientes del flujo')}</h2>
      <p class="form-hint">${__('La base aún no marca qué corridas lanzó esta tarea: son las últimas de este flujo en la marca.')}</p>`;
    try {
      const corridas = await window.TareasDatos.corridasDelFlujo(this.organizationId, this.p.flowId, 8);
      if (!corridas.length) { window.Estado.pintar(host, cab + `<p class="tareas-nada">${__('Este flujo todavía no ha corrido en la marca.')}</p>`); return; }
      window.Estado.pintar(host, cab + `<ul class="tareas-corridas">${corridas.map((r) => {
        const e = this.M.estadoCorrida(r.status);
        return `<li class="tareas-corrida"><span class="tareas-corrida-fecha">${this.escapeHtml(this._fecha(r.created_at))}</span><span class="badge badge--sm ${e.badge}">${this.escapeHtml(e.etiqueta)}</span><span class="tareas-corrida-creditos">${r.credits_charged == null ? '—' : this.escapeHtml(__('{n} créditos', { n: Number(r.credits_charged).toLocaleString(this._locale()) }))}</span></li>`;
      }).join('')}</ul>`);
    } catch (e) {
      window.Estado.pintar(host, cab + window.Estado.error({ titulo: __('No se pudieron leer las corridas'), texto: e?.message || '', reintentar: false }));
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

  /* ── El formulario (nueva y detalle) ──────────────────────────────────── */

  _formHTML(p) {
    const nueva = !p;
    const forma = this.M.formaDeCron(p ? p.cron : '0 9 * * 1');
    const opt = (v, texto, sel) => `<option value="${this.escapeHtml(v)}"${sel ? ' selected' : ''}>${this.escapeHtml(texto)}</option>`;
    const FRECUENCIAS = [['diaria', __('Cada día')], ['semanal', __('Algunos días de la semana')], ['mensual', __('Un día de cada mes')], ['horas', __('Cada ciertas horas')], ['avanzada', __('Avanzada (cron)')]];
    const ZONAS = ['America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Caracas', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'];
    const flujo = nueva
      ? `<select class="form-select" id="tfFlujo" required>${opt('', __('Elige un flujo'), true)}${(this.flujos || []).map((f) => opt(f.id, f.name, false)).join('')}</select>`
      : `<p class="tareas-fijo">${this.escapeHtml(p.flujo || __('Flujo sin nombre'))}</p><p class="form-hint">${__('Para usar otro flujo, duplica la tarea o crea una nueva.')}</p>`;
    return `
      <form class="superficie superficie--2 tareas-form" id="tareasForm" novalidate>
        <h2 class="tareas-bloque-titulo">${nueva ? __('Qué y cuándo') : __('Editar')}</h2>
        <div class="form-group">
          <label class="form-label" for="tfFlujo">${__('Flujo')}</label>
          ${flujo}
        </div>
        <div class="form-group">
          <label class="form-label" for="tfNombre">${__('Nombre')}</label>
          <input class="form-input" id="tfNombre" maxlength="120" autocomplete="off" value="${this.escapeHtml(p ? p.nombre : '')}" placeholder="${__('Ej.: Post de producto los lunes')}">
        </div>
        <div class="form-group">
          <label class="form-label" for="tfFrecuencia">${__('Frecuencia')}</label>
          <select class="form-select" id="tfFrecuencia">${FRECUENCIAS.map(([v, texto]) => opt(v, texto, v === forma.frecuencia)).join('')}</select>
          <div class="tareas-frecuencia" id="tfFrecuenciaDetalle">${this._frecuenciaHTML(forma)}</div>
          <p class="form-hint" id="tfFrase" aria-live="polite">${this.escapeHtml(this.M.describirCron(p ? p.cron : '0 9 * * 1'))}</p>
        </div>
        <div class="tareas-form-par">
          <div class="form-group">
            <label class="form-label" for="tfZona">${__('Zona horaria')}</label>
            <input class="form-input" id="tfZona" list="tfZonas" autocomplete="off" value="${this.escapeHtml(p ? p.zona : 'America/Bogota')}">
            <datalist id="tfZonas">${ZONAS.map((z) => `<option value="${z}"></option>`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label class="form-label" for="tfMercado">${__('Mercado')}</label>
            <select class="form-select" id="tfMercado">${opt('', __('Sin mercado'), !(p && p.marketId))}${this.opciones.mercados.map((m) => opt(m.value, m.label, p && p.marketId === m.value)).join('')}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="tfAlNoPoder">${__('Si faltan entradas obligatorias')}</label>
          <select class="form-select" id="tfAlNoPoder">${opt('omitir', __('Saltar esa corrida y seguir'), !p || p.alNoPoder !== 'fallar')}${opt('fallar', __('Pausar la tarea'), p && p.alNoPoder === 'fallar')}</select>
        </div>
        <fieldset class="tareas-entradas">
          <legend class="form-label">${__('Entradas del flujo')}</legend>
          <p class="form-hint">${__('Qué recibe el flujo en cada corrida: un valor fijo, varios que rotan, un elemento de la marca o lo que decida Vera.')}</p>
          <div id="tfEntradas">${nueva ? `<p class="tareas-nada">${__('Elige un flujo para ver sus entradas.')}</p>` : this._entradasHTML(p.entradas)}</div>
        </fieldset>
        <div id="tfAvisos" role="status"></div>
        <p class="tareas-form-error" id="tfError" role="alert" hidden></p>
        <div class="tareas-form-pie">
          ${nueva ? `<a class="btn btn--gris" href="${this.escapeHtml(this._ruta())}">${__('Cancelar')}</a>` : ''}
          <button type="submit" class="btn btn--blanco" id="tfGuardar">${nueva ? __('Crear en pausa') : __('Guardar cambios')}</button>
        </div>
      </form>`;
  }

  _frecuenciaHTML(forma) {
    const f = forma || { frecuencia: 'diaria', hora: 9, minuto: 0 };
    const hora = `<label class="tareas-mini"><span>${__('Hora')}</span><input class="form-input" type="time" id="tfHora" value="${String(Number(f.hora) || 0).padStart(2, '0')}:${String(Number(f.minuto) || 0).padStart(2, '0')}"></label>`;
    if (f.frecuencia === 'diaria') return hora;
    if (f.frecuencia === 'semanal') {
      const nombres = [__('Lun'), __('Mar'), __('Mié'), __('Jue'), __('Vie'), __('Sáb'), __('Dom')];
      const dias = [1, 2, 3, 4, 5, 6, 0].map((d, i) => {
        const on = (f.dias || []).includes(d);
        return `<button type="button" class="chip${on ? ' chip--activo' : ''}" data-dia="${d}" aria-pressed="${on}">${nombres[i]}</button>`;
      }).join('');
      return `<div class="tareas-dias" role="group" aria-label="${__('Días de la semana')}">${dias}</div>${hora}`;
    }
    if (f.frecuencia === 'mensual') {
      return `<label class="tareas-mini"><span>${__('Día del mes')}</span><input class="form-input" type="number" min="1" max="31" id="tfDiaMes" value="${Number(f.diaDelMes) || 1}"></label>${hora}
        <p class="form-hint">${__('Los meses que no tienen ese día (29, 30 o 31) se saltan.')}</p>`;
    }
    if (f.frecuencia === 'horas') {
      return `<label class="tareas-mini"><span>${__('Cada cuántas horas')}</span><input class="form-input" type="number" min="1" max="12" id="tfCadaHoras" value="${Number(f.cadaHoras) || 1}"></label>
        <label class="tareas-mini"><span>${__('En el minuto')}</span><input class="form-input" type="number" min="0" max="59" id="tfMinuto" value="${Number(f.minuto) || 0}"></label>`;
    }
    return `<label class="tareas-mini tareas-mini--ancho"><span>${__('Expresión cron')}</span><input class="form-input" id="tfCron" autocomplete="off" spellcheck="false" value="${this.escapeHtml(f.cron || '')}" placeholder="0 9 * * 1"></label>
      <p class="form-hint">${__('Cinco campos: minuto, hora, día del mes, mes y día de la semana (0 = domingo … 6 = sábado).')}</p>`;
  }

  _modoTexto(modo) {
    return { por_defecto: __('Valor por defecto'), fijo: __('Siempre el mismo'), rotar: __('Rotar entre varios'), elemento: __('Un elemento de la marca'), del_agente: __('Lo decide Vera') }[modo] || modo;
  }

  _entradasHTML(entradas) {
    if (!this.campos.length) return `<p class="tareas-nada">${__('Este flujo no pide entradas.')}</p>`;
    return this.campos.map((c, i) => this._entradaHTML(c, this.M.formularioDeEntrada((entradas || {})[c.key]), i)).join('');
  }

  _entradaHTML(campo, form, i) {
    const modos = this.M.modosPara(campo.kind);
    const modo = modos.includes(form.modo) ? form.modo : 'por_defecto';
    const heredado = form.heredado !== undefined
      ? `<p class="form-hint">${this.escapeHtml(__('Guardado en v1: «{v}». La base no lo usa: elige un modo para que cuente.', { v: typeof form.heredado === 'object' ? JSON.stringify(form.heredado) : String(form.heredado) }))}</p>` : '';
    return `
      <div class="tareas-entrada" data-entrada="${this.escapeHtml(campo.key)}">
        <div class="tareas-entrada-cab">
          <label class="tareas-entrada-nombre" for="tfModo${i}">${this.escapeHtml(campo.label)}</label>
          ${campo.required ? `<span class="tareas-obligatoria">${__('obligatoria')}</span>` : ''}
        </div>
        ${campo.description ? `<p class="form-hint">${this.escapeHtml(campo.description)}</p>` : ''}
        <select class="form-select" id="tfModo${i}" data-modo>${modos.map((m) => `<option value="${m}"${m === modo ? ' selected' : ''}>${this.escapeHtml(this._modoTexto(m))}</option>`).join('')}</select>
        <div class="tareas-entrada-valor" data-valor>${this._valorHTML(campo, { ...form, modo }, i)}</div>
        ${heredado}
      </div>`;
  }

  _opcionesDe(campo) {
    return (Array.isArray(campo.options) ? campo.options : []).map((o) => (o && typeof o === 'object' ? { value: String(o.value ?? o.label ?? ''), label: String(o.label ?? o.value ?? '') } : { value: String(o), label: String(o) }));
  }

  _valorHTML(campo, form, i) {
    const hint = (texto) => `<p class="form-hint">${this.escapeHtml(texto)}</p>`;
    const ops = this._opcionesDe(campo);
    const id = `tfValor${i}`;
    if (form.modo === 'del_agente') return hint(__('Vera la llena al arrancar cada corrida.'));
    if (form.modo === 'por_defecto') {
      const d = campo.defaultValue;
      if (d !== undefined && d !== null && d !== '') return hint(__('Usa el valor por defecto del flujo: «{v}».', { v: this._valorLegible(campo.key, d) }));
      return hint(campo.required ? __('No tiene valor por defecto: sin otro modo, la corrida se saltará.') : __('Sin valor por defecto: va vacía.'));
    }
    if (form.modo === 'elemento') {
      const tipos = [['', __('De cualquier tipo')], ['product', __('Un producto')], ['service', __('Un servicio')], ['character', __('Un personaje')], ['scenario', __('Un escenario')], ['identity', __('La identidad')]];
      const criterios = [['menos_usado', __('El que menos ha salido')], ['mas_reciente', __('El más reciente')], ['azar', __('Al azar')], ['destacado', __('Solo los destacados')]];
      const sel = (lista, actual, campoDato, etiqueta) => `<select class="form-select" data-campo="${campoDato}" aria-label="${this.escapeHtml(etiqueta)}">${lista.map(([v, t]) => `<option value="${v}"${v === (actual || '') ? ' selected' : ''}>${this.escapeHtml(t)}</option>`).join('')}</select>`;
      return `<div class="tareas-form-par">${sel(tipos, form.tipo, 'tipo', __('Tipo de elemento'))}${sel(criterios, form.criterio || 'menos_usado', 'criterio', __('Cuál elegir'))}</div>` +
        hint(__('En cada corrida elige uno del catálogo de la marca: lo que entre al catálogo después, entra solo.'));
    }
    if (form.modo === 'rotar') {
      if (ops.length) {
        const marcados = new Set(String(form.valores || '').split('\n'));
        return `<div class="tareas-dias" role="group" aria-label="${this.escapeHtml(__('Valores que rotan'))}">${ops.map((o) => `<label class="chip tareas-check"><input type="checkbox" data-campo="valores" value="${this.escapeHtml(o.value)}"${marcados.has(o.value) ? ' checked' : ''}> ${this.escapeHtml(o.label)}</label>`).join('')}</div>` +
          hint(__('Marca dos o más: cada corrida usa el siguiente.'));
      }
      return `<textarea class="form-textarea" data-campo="valores" rows="4" aria-label="${this.escapeHtml(__('Valores que rotan'))}" placeholder="${__('Un valor por línea')}">${this.escapeHtml(form.valores || '')}</textarea>` +
        hint(__('Uno por línea: cada corrida usa el siguiente y al final vuelve a empezar.'));
    }
    // fijo
    if (ops.length) {
      return `<select class="form-select" data-campo="valor" id="${id}" aria-label="${this.escapeHtml(campo.label)}"><option value="">${__('Elige un valor')}</option>${ops.map((o) => `<option value="${this.escapeHtml(o.value)}"${o.value === String(form.valor ?? '') ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`).join('')}</select>`;
    }
    if (campo.kind === 'boolean') {
      return `<select class="form-select" data-campo="valor" id="${id}" aria-label="${this.escapeHtml(campo.label)}"><option value="true"${form.valor === 'true' ? ' selected' : ''}>${__('Sí')}</option><option value="false"${form.valor === 'false' ? ' selected' : ''}>${__('No')}</option></select>`;
    }
    if (campo.kind === 'long_text') return `<textarea class="form-textarea" data-campo="valor" id="${id}" rows="3" aria-label="${this.escapeHtml(campo.label)}">${this.escapeHtml(form.valor || '')}</textarea>`;
    const tipo = campo.kind === 'number' ? 'number' : 'text';
    return `<input class="form-input" type="${tipo}"${tipo === 'number' ? ' step="any"' : ''} data-campo="valor" id="${id}" aria-label="${this.escapeHtml(campo.label)}" value="${this.escapeHtml(form.valor || '')}"${campo.placeholder ? ` placeholder="${this.escapeHtml(campo.placeholder)}"` : ''}>`;
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
    if (!flowId) { window.Estado.pintar(host, `<p class="tareas-nada">${__('Elige un flujo para ver sus entradas.')}</p>`); return; }
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
    window.Estado.pintar(q('#tfAvisos'), avisos.length ? `<p class="tareas-aviso">${this.escapeHtml(__('Sin valor: {lista}. Mientras sigan así, cada corrida se saltará.', { lista: avisos.map((k) => this.campos.find((c) => c.key === k)?.label || k).join(', ') }))}</p>` : '');
    const datos = { nombre, cron, zona, entradas, marketId: q('#tfMercado')?.value || null, alNoPoder: q('#tfAlNoPoder')?.value };
    const boton = q('#tfGuardar');
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
      this._pintarResumen();
      this._cargarPrevia();
    } catch (e) {
      this._error(form, e?.message || __('No se pudo guardar.'));
    } finally {
      if (boton) boton.disabled = false;
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
          this._pintarResumen();
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

  /** Fecha y hora; con `zona`, en la zona de la tarea (la hora que la persona eligió). */
  _fecha(iso, zona) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const o = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    try { return d.toLocaleString(this._locale(), zona ? { ...o, timeZone: zona } : o); } catch (_) { return d.toLocaleString(this._locale(), o); }
  }

  async onLeave() {
    this.cleanup();
  }
}

window.TareasView = TareasView;
