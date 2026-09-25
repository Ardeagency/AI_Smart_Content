/**
 * MarketingView — la página MARKETING (/command-center y /marketing; antes «Command Center»,
 * borrado en L8): el lienzo donde se arma la estrategia de campañas. Audiencias a la
 * izquierda, campañas a la derecha; unir una audiencia con una campaña (arrastrando su
 * puerto, o soltando una sobre la otra) escribe marketing.campaign_audiences. Productos,
 * servicios, personajes y lugares se colocan desde la biblioteca; notas y grupos anotan
 * el lienzo. Pan, zoom y deshacer; el inspector edita audiencias y campañas y muestra, solo
 * lectura, lo que corre en la plataforma (entregas, conjuntos, anuncios y rendimiento).
 *
 * Datos: TODO por window.MarketingDatos (js/services/MarketingDataService.js); la mecánica del
 * lienzo en js/views/marketing/Lienzo.js. Pintado: window.Estado.pintar. Sin `.from()` aquí.
 * Sin permiso `editar_campanas` el lienzo se abre en solo lectura (lo decide la base por RLS;
 * aquí solo se esconden los gestos que fallarían).
 */
class MarketingView extends BaseView {
  static cacheable = false;
  static get documentTitle() { return __('Marketing'); }

  constructor() {
    super();
    this.orgId = null;
    this.puedeEditar = false;
    this.tableros = [];
    this.tablero = null;
    this.audiencias = new Map();
    this.campanas = new Map();
    this.vinculos = [];
    this.nodos = new Map();
    this.aristas = [];             // solo board_edges; los vínculos se derivan
    this.elementos = new Map();    // id → {kind, nombre, resumen, imagen}
    this.elementosCargados = new Set();
    this.lienzo = null;
    this.seleccion = null;
    this.pestana = 'biblioteca';
    this.seccion = 'audience';
    this.busqueda = '';
    this.atras = [];
    this.adelante = [];
    this.alias = new Map();
    this.ocupado = false;
    this.entregasCache = new Map();
  }

  async onEnter() {
    this.orgId = this.routeParams?.orgId || window.currentOrgId || null;
    this.puedeEditar = !!(this.orgId && window.contextoService?.puede('editar_campanas', this.orgId));
  }

  renderHTML() {
    const b = (accion, texto, clase = 'btn--gris', icono = '') =>
      `<button type="button" class="btn ${clase} btn--sm" data-accion="${accion}">${icono ? `<i class="aisc-ico aisc-ico--${icono}" aria-hidden="true"></i>` : ''}${texto ? `<span>${texto}</span>` : ''}</button>`;
    const bi = (accion, titulo, icono) =>
      `<button type="button" class="btn btn--gris btn--sm btn--icono" data-accion="${accion}" title="${titulo}" aria-label="${titulo}"><i class="aisc-ico aisc-ico--${icono}" aria-hidden="true"></i></button>`;
    const edicion = this.puedeEditar ? `
        ${b('crear-audiencia', __('Audiencia'), 'btn--oscuro', 'audience')}
        ${b('crear-campana', __('Campaña'), 'btn--oscuro', 'goal')}
        ${b('crear-nota', __('Nota'))}
        ${b('crear-grupo', __('Grupo'))}` : `<span class="chip">${__('Solo lectura')}</span>`;
    return `
<div class="mk-pagina" id="mkPagina">
  <div class="mk-barra">
    <div class="mk-barra__grupo">
      <label class="mk-oculto" for="mkTablero">${__('Lienzo')}</label>
      <select class="form-select mk-barra__tablero" id="mkTablero" disabled></select>
      ${this.puedeEditar ? `${bi('renombrar-lienzo', __('Renombrar el lienzo'), 'edit')}${bi('nuevo-lienzo', __('Nuevo lienzo'), 'add')}${bi('borrar-lienzo', __('Borrar el lienzo'), 'delete')}` : ''}
      <span class="mk-barra__sep" aria-hidden="true"></span>
      ${edicion}
    </div>
    <div class="mk-barra__grupo">
      ${this.puedeEditar ? `${b('deshacer', __('Deshacer'))}${b('rehacer', __('Rehacer'))}${b('reorganizar', __('Reorganizar'), 'btn--gris', 'grid')}` : ''}
      ${bi('alejar', __('Alejar'), 'minus')}${bi('encajar', __('Encajar todo'), 'expand')}${bi('acercar', __('Acercar'), 'add')}
    </div>
  </div>
  <div class="mk-cuerpo">
    <section class="mk-lienzo" id="mkLienzo" aria-label="${__('Lienzo de estrategia')}">
      <div class="mk-lienzo__aviso" id="mkAviso">${window.Estado.cargando('bloque')}</div>
    </section>
    <aside class="mk-panel superficie--4" id="mkPanel" aria-label="${__('Biblioteca y detalle')}">
      <div class="mk-panel__pestanas" role="tablist">
        <button type="button" class="chip chip--activo" role="tab" data-pestana="biblioteca" aria-selected="true">${__('Biblioteca')}</button>
        <button type="button" class="chip" role="tab" data-pestana="detalle" aria-selected="false">${__('Detalle')}</button>
      </div>
      <div class="mk-panel__cuerpo" id="mkPanelCuerpo">${window.Estado.cargando('filas', 5)}</div>
    </aside>
  </div>
</div>`;
  }

  async render() {
    await super.render();
    const aviso = document.getElementById('mkAviso');
    if (aviso) window.Estado.alReintentar(aviso, () => this.cargar());
    this._enlazar();
    await this.cargar();
  }

  /* ── Carga ───────────────────────────────────────────────────────────── */

  async cargar() {
    const aviso = document.getElementById('mkAviso');
    if (!window.MarketingDatos || !this.orgId) {
      this._aviso(window.Estado.error({ titulo: __('No se pudo abrir Marketing'), texto: __('Elige una marca para ver su lienzo.'), reintentar: false }));
      return;
    }
    if (aviso) { aviso.hidden = false; window.Estado.pintar(aviso, window.Estado.cargando('bloque')); }
    try {
      const d = await window.MarketingDatos.base(this.orgId);
      this.tableros = d.tableros;
      this.audiencias = new Map(d.audiencias.map((a) => [a.id, a]));
      this.campanas = new Map(d.campanas.map((c) => [c.id, c]));
      this.vinculos = d.vinculos;
      this._pintarSelectorTablero();
      const recordado = this._leerRecordado();
      const t = this.tableros.find((x) => x.id === recordado) || this.tableros[0] || null;
      if (!t) { this._sinTableros(); this._pintarPanel(); return; }
      await this.abrirTablero(t.id);
    } catch (err) {
      console.error('MarketingView cargar:', err);
      this._aviso(window.Estado.error({ titulo: __('No se pudo cargar el lienzo'), texto: err?.message || '' }));
    }
  }

  async abrirTablero(id) {
    const t = this.tableros.find((x) => x.id === id);
    if (!t) return;
    this.tablero = t;
    this._recordar(id);
    const sel = document.getElementById('mkTablero');
    if (sel) sel.value = id;
    const { nodos, aristas } = await window.MarketingDatos.lienzo(id);
    this.nodos = new Map(nodos.map((n) => [n.id, n]));
    this.aristas = aristas;
    this.atras = []; this.adelante = []; this.alias.clear();
    this.seleccion = null;
    await this._cargarElementosDe([...this.nodos.values()].filter((n) => n.kind === 'element').map((n) => n.subtitulo));
    this._montarLienzo();
    this._pintarPanel();
    this._botonesHistorial();
  }

  _montarLienzo() {
    const raiz = document.getElementById('mkLienzo');
    if (!raiz) return;
    if (this.lienzo) this.lienzo.destruir();
    this.lienzo = new window.LienzoMarketing(raiz, {
      editable: this.puedeEditar,
      escalaMin: window.MarketingDatos.ESCALA_MIN,
      escalaMax: window.MarketingDatos.ESCALA_MAX,
      textoQuitarArista: __('Quitar conexión'),
      pintarNodo: (n) => this._htmlNodo(n),
      puedeUnir: (a, b) => window.MarketingDatos.mapeo.tipoDeConexion(a, b),
      alSeleccionar: (id) => this._seleccionar(id),
      alMover: (despues, antes) => this._mover(despues, antes),
      alConectar: (a, b) => this._conectar(a, b),
      alQuitarArista: (a) => this._quitarArista(a),
      alSoltar: (datos, punto, sobre) => this._soltar(datos, punto, sobre),
      alViewport: (vp) => { if (this.puedeEditar && this.tablero) window.MarketingDatos.guardarViewport(this.tablero.id, vp); },
    });
    const vp = this.tablero.viewport;
    this.lienzo.cargar([...this.nodos.values()], this._aristasVisibles(), vp);
    const aviso = document.getElementById('mkAviso');
    if (aviso) aviso.hidden = true;
    const vpVacio = vp.x === 0 && vp.y === 0 && vp.escala === 1;
    if (vpVacio) requestAnimationFrame(() => this.lienzo?.encajar());
    this._vacio();
  }

  async _cargarElementosDe(kinds) {
    const faltan = [...new Set(kinds.filter(Boolean))].filter((k) => !this.elementosCargados.has(k));
    await Promise.all(faltan.map(async (k) => {
      try {
        const l = await window.MarketingDatos.elementos(this.orgId, k);
        l.forEach((e) => this.elementos.set(e.id, e));
        this.elementosCargados.add(k);
      } catch (err) { console.warn('[marketing] elementos', k, err?.message); }
    }));
  }

  _aristasVisibles() {
    return window.MarketingDatos.mapeo.aristasVisibles([...this.nodos.values()], this.aristas, this.vinculos);
  }

  _redibujarAristas() { this.lienzo?.ponerAristas(this._aristasVisibles()); }

  /** Vuelve a pintar los nodos de un sujeto (tras editar la audiencia/campaña o cambiar sus vínculos). */
  _repintarSujeto(sujetoId) {
    for (const n of this.nodos.values()) if (n.sujeto_id === sujetoId) this.lienzo?.ponerNodo(n);
  }

  _aviso(html) {
    const aviso = document.getElementById('mkAviso');
    if (!aviso) return;
    aviso.hidden = false;
    window.Estado.pintar(aviso, html);
  }

  _vacio() {
    const raiz = document.getElementById('mkLienzo');
    if (!raiz) return;
    let v = raiz.querySelector('.mk-lienzo__vacio');
    if (this.nodos.size) { v?.remove(); return; }
    if (!v) { v = document.createElement('div'); v.className = 'mk-lienzo__vacio'; raiz.append(v); }
    window.Estado.pintar(v, window.Estado.vacio({
      icono: 'aisc-ico aisc-ico--commandcenter',
      titulo: __('El lienzo está vacío'),
      texto: this.puedeEditar
        ? __('Trae una audiencia o una campaña desde la biblioteca —arrástrala o haz clic— y únelas para ver de qué se alimenta cada campaña.')
        : __('Todavía nadie ha armado la estrategia en este lienzo.'),
      compacto: true,
    }));
  }

  _sinTableros() {
    this.tablero = null;
    if (this.lienzo) { this.lienzo.destruir(); this.lienzo = null; }
    this._aviso(window.Estado.vacio({
      icono: 'aisc-ico aisc-ico--commandcenter',
      titulo: __('Esta marca todavía no tiene un lienzo'),
      texto: __('Un lienzo es una estrategia: audiencias, campañas y lo que las alimenta, en un solo mapa.'),
      accion: this.puedeEditar ? __('Crear lienzo') : null,
    }));
    const aviso = document.getElementById('mkAviso');
    if (aviso) window.Estado.alAccion(aviso, () => this._nuevoTablero());
  }

  _leerRecordado() { try { return localStorage.getItem(`aisc:marketing:lienzo:${this.orgId}`); } catch (_) { return null; } }
  _recordar(id) { try { localStorage.setItem(`aisc:marketing:lienzo:${this.orgId}`, id); } catch (_) { /* sin almacenamiento: se abre el primero */ } }

  /* ── Etiquetas ───────────────────────────────────────────────────────── */

  static objetivos() { return { awareness: __('Reconocimiento'), traffic: __('Tráfico'), engagement: __('Interacción'), leads: __('Clientes potenciales'), sales: __('Ventas'), retention: __('Retención'), launch: __('Lanzamiento') }; }
  static estados() { return { draft: __('Borrador'), planned: __('Planeada'), active: __('Activa'), paused: __('En pausa'), finished: __('Terminada'), cancelled: __('Cancelada') }; }
  static conciencia() { return { unaware: __('No sabe que tiene el problema'), problem_aware: __('Conoce el problema'), solution_aware: __('Conoce soluciones'), product_aware: __('Conoce el producto'), most_aware: __('Lista para comprar') }; }
  static narrativas() { return { brand_awareness: __('Conocer la marca'), product_launch: __('Lanzamiento de producto'), lifestyle_storytelling: __('Historias de estilo de vida'), testimonial: __('Testimonio'), reactivation: __('Reactivación'), sale_promo: __('Promoción'), educational: __('Educativa'), seasonal_moment: __('Fecha especial'), behind_the_scenes: __('Detrás de cámaras') }; }
  static tipos() { return { audience: __('Audiencia'), campaign: __('Campaña'), element: __('Elemento'), note: __('Nota'), group: __('Grupo'), plan: __('Plan'), brief: __('Brief'), key_message: __('Mensaje clave'), conversion: __('Conversión'), creative: __('Pieza'), script: __('Guion'), flow: __('Flujo'), delivery: __('Entrega'), publication: __('Publicación'), reading: __('Lectura') }; }
  static tiposElemento() { return { product: __('Producto'), service: __('Servicio'), character: __('Personaje'), scenario: __('Lugar'), identity: __('Identidad') }; }
  static badgeEstado(e) { return { active: 'badge--exito', paused: 'badge--advertencia', cancelled: 'badge--error', planned: 'badge--info' }[e] || ''; }

  _dinero(monto, moneda) {
    if (monto == null) return '';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: moneda || 'USD', maximumFractionDigits: 0 }).format(monto); } catch (_) { return `${Math.round(monto)} ${moneda || ''}`.trim(); }
  }
  _fecha(d) {
    if (!d) return '';
    const t = new Date(String(d).length === 10 ? `${d}T12:00:00` : d);
    return Number.isFinite(t.getTime()) ? t.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  }
  _compacto(n) {
    const v = Number(n) || 0;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString();
  }

  /* ── Nodos (HTML escapado; el lienzo lo pinta con Estado.pintar) ────── */

  _htmlNodo(n) {
    const esc = (s) => this.escapeHtml(s);
    const tipo = MarketingView.tipos()[n.kind] || n.kind;
    const puertos = this.puedeEditar && n.kind !== 'group'
      ? `<span class="mk-puerto mk-puerto--entrada" data-puerto="entrada" title="${esc(__('Arrastra para unir'))}"></span><span class="mk-puerto mk-puerto--salida" data-puerto="salida" title="${esc(__('Arrastra para unir'))}"></span>`
      : '';
    if (n.kind === 'audience') {
      const a = this.audiencias.get(n.sujeto_id);
      if (!a) return this._htmlNodoGenerico(n, tipo, puertos);
      const edad = a.edad_min != null || a.edad_max != null ? __('{a} a {b} años', { a: a.edad_min ?? '13', b: a.edad_max ?? '65+' }) : '';
      const unidas = this.vinculos.filter((v) => v.audience_id === a.id).length;
      const meta = [edad, a.conciencia ? MarketingView.conciencia()[a.conciencia] : '', a.dolores.length ? __('{n} dolores', { n: a.dolores.length }) : ''].filter(Boolean).join(' · ');
      return `
        <div class="mk-nodo__cab"><span class="mk-nodo__tipo">${esc(tipo)}</span>${a.alineacion != null ? `<span class="mk-nodo__dato" title="${esc(__('Alineación con la marca'))}">${Math.round(a.alineacion)}%</span>` : ''}</div>
        <p class="mk-nodo__titulo">${esc(a.nombre)}</p>
        ${a.descripcion ? `<p class="mk-nodo__texto">${esc(a.descripcion)}</p>` : ''}
        ${meta ? `<p class="mk-nodo__meta">${esc(meta)}</p>` : ''}
        <p class="mk-nodo__pie">${esc(unidas === 1 ? __('Alimenta 1 campaña') : __('Alimenta {n} campañas', { n: unidas }))}${a.activa ? '' : ` · ${esc(__('inactiva'))}`}</p>
        ${puertos}`;
    }
    if (n.kind === 'campaign') {
      const c = this.campanas.get(n.sujeto_id);
      if (!c) return this._htmlNodoGenerico(n, tipo, puertos);
      const badge = MarketingView.badgeEstado(c.estado);
      const fechas = [this._fecha(c.inicio), this._fecha(c.fin)].filter(Boolean).join(' → ');
      const meta = [c.objetivo ? MarketingView.objetivos()[c.objetivo] : '', c.presupuesto != null ? this._dinero(c.presupuesto, c.moneda) : '', fechas].filter(Boolean).join(' · ');
      const auds = this.vinculos.filter((v) => v.campaign_id === c.id).length;
      return `
        <div class="mk-nodo__cab"><span class="mk-nodo__tipo">${esc(tipo)}</span><span class="badge badge--sm ${badge}">${esc(MarketingView.estados()[c.estado] || c.estado)}</span></div>
        <p class="mk-nodo__titulo">${esc(c.nombre)}</p>
        ${meta ? `<p class="mk-nodo__meta">${esc(meta)}</p>` : ''}
        <p class="mk-nodo__pie">${esc(auds === 1 ? __('1 audiencia') : __('{n} audiencias', { n: auds }))}${c.entregas ? ` · ${esc(c.entregas === 1 ? __('1 entrega en plataforma') : __('{n} entregas en plataforma', { n: c.entregas }))}` : ''}</p>
        ${puertos}`;
    }
    if (n.kind === 'element') {
      const e = this.elementos.get(n.sujeto_id);
      const kind = MarketingView.tiposElemento()[e?.kind || n.subtitulo] || tipo;
      return `
        ${e?.imagen ? `<div class="mk-nodo__media media"><img src="${esc(e.imagen)}" alt="" loading="lazy" draggable="false"></div>` : ''}
        <div class="mk-nodo__cab"><span class="mk-nodo__tipo">${esc(kind)}</span></div>
        <p class="mk-nodo__titulo">${esc(e?.nombre || n.titulo)}</p>
        ${e?.resumen ? `<p class="mk-nodo__texto">${esc(e.resumen)}</p>` : ''}
        ${puertos}`;
    }
    if (n.kind === 'note') {
      return `
        <div class="mk-nodo__cab"><span class="mk-nodo__tipo">${esc(tipo)}</span></div>
        <textarea class="mk-nota" data-nota="${esc(n.id)}" aria-label="${esc(__('Texto de la nota'))}" placeholder="${esc(__('Escribe una idea…'))}"${this.puedeEditar ? '' : ' readonly'}>${esc(n.cuerpo)}</textarea>
        ${puertos}`;
    }
    if (n.kind === 'group') {
      const titulo = n.titulo && n.titulo !== '(sin titulo)' ? n.titulo : '';
      return `
        <input class="mk-grupo__titulo" data-grupo="${esc(n.id)}" value="${esc(titulo)}" placeholder="${esc(__('Grupo'))}" aria-label="${esc(__('Nombre del grupo'))}"${this.puedeEditar ? '' : ' readonly'}>
        ${this.puedeEditar ? `<span class="mk-grupo__asa" data-redimensionar title="${esc(__('Cambiar tamaño'))}"></span>` : ''}`;
    }
    return this._htmlNodoGenerico(n, tipo, puertos);
  }

  _htmlNodoGenerico(n, tipo, puertos) {
    const esc = (s) => this.escapeHtml(s);
    return `
      <div class="mk-nodo__cab"><span class="mk-nodo__tipo">${esc(tipo)}</span>${n.subtitulo ? `<span class="mk-nodo__dato">${esc(n.subtitulo)}</span>` : ''}</div>
      <p class="mk-nodo__titulo">${esc(n.titulo || '—')}</p>
      ${puertos}`;
  }

  /* ── Selector de lienzos ─────────────────────────────────────────────── */

  _pintarSelectorTablero() {
    const sel = document.getElementById('mkTablero');
    if (!sel) return;
    sel.replaceChildren(...this.tableros.map((t) => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.nombre; return o; }));
    sel.disabled = !this.tableros.length;
    if (this.tablero) sel.value = this.tablero.id;
  }

  async _nuevoTablero() {
    const nombre = await window.Capas.pedirTexto({ titulo: __('Nuevo lienzo'), texto: __('Cada lienzo es una estrategia aparte.'), placeholder: __('Lanzamiento de temporada'), aceptar: __('Crear') });
    if (!nombre) return;
    await this._intentar(async () => {
      const t = await window.MarketingDatos.crearTablero(this.orgId, { nombre, market_id: this.tablero?.market_id || null });
      this.tableros.push(t);
      this._pintarSelectorTablero();
      await this.abrirTablero(t.id);
    });
  }

  async _renombrarTablero() {
    if (!this.tablero) return;
    const nombre = await window.Capas.pedirTexto({ titulo: __('Renombrar el lienzo'), valor: this.tablero.nombre, aceptar: __('Guardar') });
    if (!nombre || nombre === this.tablero.nombre) return;
    await this._intentar(async () => {
      const t = await window.MarketingDatos.renombrarTablero(this.tablero.id, nombre);
      Object.assign(this.tablero, { nombre: t.nombre });
      this._pintarSelectorTablero();
    });
  }

  async _borrarTablero() {
    if (!this.tablero) return;
    const ok = await window.Capas.confirmar({
      titulo: __('Borrar el lienzo'),
      texto: __('Se borra «{n}» con sus notas, grupos y conexiones. Las audiencias y campañas siguen en la marca.', { n: this.tablero.nombre }),
      aceptar: __('Borrar lienzo'), peligro: true,
    });
    if (!ok) return;
    await this._intentar(async () => {
      await window.MarketingDatos.borrarTablero(this.tablero.id);
      this.tableros = this.tableros.filter((t) => t.id !== this.tablero.id);
      this._pintarSelectorTablero();
      if (this.tableros[0]) await this.abrirTablero(this.tableros[0].id);
      else { this.nodos.clear(); this._sinTableros(); this._pintarPanel(); }
    });
  }

  /* ── Panel: biblioteca y detalle ─────────────────────────────────────── */

  _cambiarPestana(p) {
    this.pestana = p;
    document.querySelectorAll('#mkPanel [data-pestana]').forEach((b) => {
      const activa = b.getAttribute('data-pestana') === p;
      b.classList.toggle('chip--activo', activa);
      b.setAttribute('aria-selected', String(activa));
    });
    this._pintarPanel();
  }

  _pintarPanel() {
    const cuerpo = document.getElementById('mkPanelCuerpo');
    if (!cuerpo) return;
    if (this.pestana === 'detalle') { this._pintarDetalle(cuerpo); return; }
    const secciones = [
      ['audience', __('Audiencias'), this.audiencias.size],
      ['campaign', __('Campañas'), this.campanas.size],
      ['product', __('Productos')], ['service', __('Servicios')], ['character', __('Personajes')], ['scenario', __('Lugares')],
    ];
    window.Estado.pintar(cuerpo, `
      <input type="search" class="form-input mk-buscar" id="mkBuscar" placeholder="${this.escapeHtml(__('Buscar en la biblioteca'))}" aria-label="${this.escapeHtml(__('Buscar en la biblioteca'))}" value="${this.escapeHtml(this.busqueda)}">
      <div class="mk-secciones">${secciones.map(([k, t, n]) => `<button type="button" class="chip${this.seccion === k ? ' chip--activo' : ''}" data-seccion="${k}">${this.escapeHtml(t)}${n != null ? ` · ${n}` : ''}</button>`).join('')}</div>
      <p class="mk-ayuda">${this.escapeHtml(this.puedeEditar ? __('Haz clic o arrastra al lienzo. Suelta una audiencia sobre una campaña para unirlas.') : __('Haz clic para ubicarla en el lienzo.'))}</p>
      <ul class="mk-lista" id="mkLista"></ul>`);
    this._pintarLista();
  }

  async _pintarLista() {
    const ul = document.getElementById('mkLista');
    if (!ul) return;
    const k = this.seccion;
    const esElemento = !['audience', 'campaign'].includes(k);
    if (esElemento && !this.elementosCargados.has(k)) {
      window.Estado.pintar(ul, window.Estado.cargando('filas', 4));
      await this._cargarElementosDe([k]);
      if (this.seccion !== k) return;
    }
    const q = this.busqueda.trim().toLowerCase();
    const enLienzo = new Set([...this.nodos.values()].map((n) => n.sujeto_id).filter(Boolean));
    let items;
    if (k === 'audience') items = [...this.audiencias.values()].map((a) => ({ id: a.id, kind: 'audience', titulo: a.nombre, meta: [a.conciencia ? MarketingView.conciencia()[a.conciencia] : '', a.activa ? '' : __('inactiva')].filter(Boolean).join(' · ') }));
    else if (k === 'campaign') items = [...this.campanas.values()].map((c) => ({ id: c.id, kind: 'campaign', titulo: c.nombre, meta: [MarketingView.estados()[c.estado], c.objetivo ? MarketingView.objetivos()[c.objetivo] : ''].filter(Boolean).join(' · ') }));
    else items = [...this.elementos.values()].filter((e) => e.kind === k).map((e) => ({ id: e.id, kind: 'element', titulo: e.nombre, meta: e.resumen || '', imagen: e.imagen }));
    const filtrados = q ? items.filter((i) => `${i.titulo} ${i.meta}`.toLowerCase().includes(q)) : items;
    if (!filtrados.length) {
      window.Estado.pintar(ul, window.Estado.vacio({ compacto: true, titulo: q ? __('Nada coincide con «{q}»', { q: this.busqueda }) : __('No hay nada en esta sección todavía.') }));
      return;
    }
    const TOPE = 80;
    window.Estado.pintar(ul, filtrados.slice(0, TOPE).map((i) => `
      <li><button type="button" class="mk-item superficie--1 superficie--interactiva${enLienzo.has(i.id) ? ' mk-item--puesto' : ''}" data-poner="${i.kind}" data-id="${this.escapeHtml(i.id)}"${this.puedeEditar ? ' draggable="true"' : ''}>
        ${i.imagen ? `<span class="mk-item__media media"><img src="${this.escapeHtml(i.imagen)}" alt="" loading="lazy" draggable="false"></span>` : ''}
        <span class="mk-item__txt"><span class="mk-item__titulo">${this.escapeHtml(i.titulo)}</span>${i.meta ? `<span class="mk-item__meta">${this.escapeHtml(i.meta)}</span>` : ''}</span>
        ${enLienzo.has(i.id) ? `<span class="badge badge--sm">${this.escapeHtml(__('en el lienzo'))}</span>` : ''}
      </button></li>`).join('') + (filtrados.length > TOPE ? `<li class="mk-ayuda">${this.escapeHtml(__('{n} más: busca para acotar.', { n: filtrados.length - TOPE }))}</li>` : ''));
  }

  _seleccionar(id) {
    this.seleccion = id;
    if (id) this._cambiarPestana('detalle');
    else if (this.pestana === 'detalle') this._pintarPanel();
  }

  _pintarDetalle(cuerpo) {
    const n = this.seleccion ? this.nodos.get(this.seleccion) : null;
    if (!n) {
      window.Estado.pintar(cuerpo, window.Estado.vacio({ compacto: true, icono: 'aisc-ico aisc-ico--cursor-click', titulo: __('Nada seleccionado'), texto: __('Haz clic en un nodo del lienzo para ver y editar su detalle.') }));
      return;
    }
    const acciones = this.puedeEditar ? `<button type="button" class="btn btn--gris btn--sm" data-accion="quitar-nodo">${this.escapeHtml(__('Quitar del lienzo'))}</button>` : '';
    let html;
    if (n.kind === 'audience' && this.audiencias.get(n.sujeto_id)) html = this._detalleAudiencia(this.audiencias.get(n.sujeto_id), acciones);
    else if (n.kind === 'campaign' && this.campanas.get(n.sujeto_id)) html = this._detalleCampana(this.campanas.get(n.sujeto_id), acciones);
    else if (n.kind === 'element') html = this._detalleElemento(n, acciones);
    else if (n.kind === 'note') html = `<h2 class="mk-detalle__titulo">${this.escapeHtml(__('Nota'))}</h2><p class="mk-ayuda">${this.escapeHtml(__('Escribe directo en la nota del lienzo; se guarda al salir del campo.'))}</p><div class="mk-detalle__acciones">${acciones}</div>`;
    else if (n.kind === 'group') html = `<h2 class="mk-detalle__titulo">${this.escapeHtml(__('Grupo'))}</h2><p class="mk-ayuda">${this.escapeHtml(__('Mueve el grupo y se lleva lo que tiene dentro. Cambia su tamaño desde la esquina.'))}</p><div class="mk-detalle__acciones">${acciones}</div>`;
    else html = `<h2 class="mk-detalle__titulo">${this.escapeHtml(n.titulo || '—')}</h2><p class="mk-ayuda">${this.escapeHtml(MarketingView.tipos()[n.kind] || n.kind)}${n.subtitulo ? ` · ${this.escapeHtml(n.subtitulo)}` : ''}</p><div class="mk-detalle__acciones">${acciones}</div>`;
    window.Estado.pintar(cuerpo, html);
    if (n.kind === 'campaign') this._pintarEntregas(n.sujeto_id);
  }

  _campo(etiqueta, control) {
    return `<label class="mk-campo"><span class="form-label">${this.escapeHtml(etiqueta)}</span>${control}</label>`;
  }
  _input(campo, valor, o = {}) {
    return `<input class="form-input" data-campo="${campo}" type="${o.tipo || 'text'}" value="${this.escapeHtml(valor ?? '')}"${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}${o.placeholder ? ` placeholder="${this.escapeHtml(o.placeholder)}"` : ''}${this.puedeEditar ? '' : ' disabled'}>`;
  }
  _area(campo, valor, placeholder = '') {
    return `<textarea class="form-textarea" data-campo="${campo}" rows="3"${placeholder ? ` placeholder="${this.escapeHtml(placeholder)}"` : ''}${this.puedeEditar ? '' : ' disabled'}>${this.escapeHtml(valor ?? '')}</textarea>`;
  }
  _select(campo, valor, opciones, vacio = null) {
    const ops = (vacio != null ? [['', vacio]] : []).concat(Object.entries(opciones));
    return `<select class="form-select" data-campo="${campo}"${this.puedeEditar ? '' : ' disabled'}>${ops.map(([v, t]) => `<option value="${this.escapeHtml(v)}"${v === (valor || '') ? ' selected' : ''}>${this.escapeHtml(t)}</option>`).join('')}</select>`;
  }

  _detalleAudiencia(a, acciones) {
    const unidas = this.vinculos.filter((v) => v.audience_id === a.id).map((v) => this.campanas.get(v.campaign_id)).filter(Boolean);
    return `
      <div class="mk-detalle" data-sujeto="audience" data-id="${this.escapeHtml(a.id)}">
        <p class="mk-detalle__tipo">${this.escapeHtml(__('Audiencia'))}${a.alineacion != null ? ` · ${this.escapeHtml(__('alineación {n}%', { n: Math.round(a.alineacion) }))}` : ''}</p>
        ${this._campo(__('Nombre'), this._input('nombre', a.nombre))}
        ${this._campo(__('Quién es'), this._area('descripcion', a.descripcion))}
        ${this._campo(__('Nivel de conciencia'), this._select('conciencia', a.conciencia, MarketingView.conciencia(), __('Sin definir')))}
        <div class="mk-fila">
          ${this._campo(__('Edad mínima'), this._input('edad_min', a.edad_min, { tipo: 'number', min: 13, max: 100 }))}
          ${this._campo(__('Edad máxima'), this._input('edad_max', a.edad_max, { tipo: 'number', min: 13, max: 100 }))}
        </div>
        ${this._campo(__('Géneros (separados por coma)'), this._input('generos', a.generos.join(', '), { placeholder: 'F, M' }))}
        ${this._campo(__('Lugares (separados por coma)'), this._input('lugares', a.lugares.join(', ')))}
        ${this._campo(__('Dolores (uno por línea)'), this._area('dolores', a.dolores.join('\n')))}
        ${this._campo(__('Deseos (uno por línea)'), this._area('deseos', a.deseos.join('\n')))}
        ${this._campo(__('Objeciones (una por línea)'), this._area('objeciones', a.objeciones.join('\n')))}
        ${this._campo(__('Qué la hace comprar (uno por línea)'), this._area('gatillos', a.gatillos.join('\n')))}
        <label class="mk-check"><input type="checkbox" data-campo="activa"${a.activa ? ' checked' : ''}${this.puedeEditar ? '' : ' disabled'}> ${this.escapeHtml(__('Activa'))}</label>
        <h3 class="mk-detalle__sub">${this.escapeHtml(__('Campañas que alimenta'))}</h3>
        ${unidas.length ? `<ul class="mk-mini">${unidas.map((c) => `<li><span>${this.escapeHtml(c.nombre)}</span>${this.puedeEditar ? `<button type="button" class="btn btn--gris btn--sm" data-separar="${this.escapeHtml(c.id)}|${this.escapeHtml(a.id)}">${this.escapeHtml(__('Separar'))}</button>` : ''}</li>`).join('')}</ul>` : `<p class="mk-ayuda">${this.escapeHtml(__('Todavía no alimenta ninguna campaña. Arrastra su puerto hasta una campaña para unirlas.'))}</p>`}
        <p class="mk-estado-guardado" id="mkGuardado" aria-live="polite"></p>
        <div class="mk-detalle__acciones">${acciones}${this.puedeEditar ? `<button type="button" class="btn btn--gris btn--peligro btn--sm" data-accion="borrar-audiencia">${this.escapeHtml(__('Eliminar audiencia'))}</button>` : ''}</div>
      </div>`;
  }

  _detalleCampana(c, acciones) {
    const unidas = this.vinculos.filter((v) => v.campaign_id === c.id);
    const libres = [...this.audiencias.values()].filter((a) => !unidas.some((v) => v.audience_id === a.id));
    const info = [c.plan ? __('Plan: {n}', { n: c.plan }) : '', c.brief ? __('Brief: {n}', { n: c.brief }) : '', c.conversion ? __('Conversión: {n}', { n: c.conversion }) : '', c.piezas ? __('{n} piezas ({m} al aire)', { n: c.piezas, m: c.piezas_al_aire }) : ''].filter(Boolean);
    return `
      <div class="mk-detalle" data-sujeto="campaign" data-id="${this.escapeHtml(c.id)}">
        <p class="mk-detalle__tipo">${this.escapeHtml(__('Campaña'))}</p>
        ${this._campo(__('Nombre'), this._input('nombre', c.nombre))}
        <div class="mk-fila">
          ${this._campo(__('Objetivo'), this._select('objetivo', c.objetivo, MarketingView.objetivos()))}
          ${this._campo(__('Estado'), this._select('estado', c.estado, MarketingView.estados()))}
        </div>
        ${this._campo(__('Narrativa'), this._select('narrativa', c.narrativa, MarketingView.narrativas(), __('Sin definir')))}
        <div class="mk-fila">
          ${this._campo(__('Presupuesto'), this._input('presupuesto', c.presupuesto, { tipo: 'number', min: 0 }))}
          ${this._campo(__('Moneda'), this._input('moneda', c.moneda, { placeholder: 'COP' }))}
        </div>
        <div class="mk-fila">
          ${this._campo(__('Empieza'), this._input('inicio', c.inicio, { tipo: 'date' }))}
          ${this._campo(__('Termina'), this._input('fin', c.fin, { tipo: 'date' }))}
        </div>
        ${this._campo(__('Llamado a la acción'), this._input('cta', c.cta))}
        ${this._campo(__('Página de destino'), this._input('url', c.url, { tipo: 'url', placeholder: 'https://' }))}
        ${this._campo(__('Notas internas'), this._area('notas', c.notas || ''))}
        ${info.length ? `<p class="mk-ayuda">${this.escapeHtml(info.join(' · '))}</p>` : ''}
        <h3 class="mk-detalle__sub">${this.escapeHtml(__('Audiencias'))}</h3>
        ${unidas.length ? `<ul class="mk-mini">${unidas.map((v) => { const a = this.audiencias.get(v.audience_id); return `<li><span>${this.escapeHtml(a?.nombre || '—')}${v.is_primary ? ` <span class="badge badge--sm">${this.escapeHtml(__('principal'))}</span>` : ''}</span>${this.puedeEditar ? `<button type="button" class="btn btn--gris btn--sm" data-separar="${this.escapeHtml(c.id)}|${this.escapeHtml(v.audience_id)}">${this.escapeHtml(__('Separar'))}</button>` : ''}</li>`; }).join('')}</ul>` : `<p class="mk-ayuda">${this.escapeHtml(__('Ninguna audiencia alimenta esta campaña todavía.'))}</p>`}
        ${this.puedeEditar && libres.length ? `<label class="mk-campo"><span class="form-label">${this.escapeHtml(__('Unir una audiencia'))}</span><select class="form-select" data-unir="${this.escapeHtml(c.id)}"><option value="">${this.escapeHtml(__('Elige una audiencia…'))}</option>${libres.map((a) => `<option value="${this.escapeHtml(a.id)}">${this.escapeHtml(a.nombre)}</option>`).join('')}</select></label>` : ''}
        <p class="mk-estado-guardado" id="mkGuardado" aria-live="polite"></p>
        <h3 class="mk-detalle__sub">${this.escapeHtml(__('En la plataforma'))}</h3>
        <div id="mkEntregas">${c.entregas ? window.Estado.cargando('filas', 2) : `<p class="mk-ayuda">${this.escapeHtml(__('Esta campaña no tiene entregas en Meta, Google ni TikTok.'))}</p>`}</div>
        ${window.Estado.todaviaNo({ titulo: __('Publicar en redes y pedir un informe a Vera'), texto: __('Llegan cuando el borde tenga sus rutas. El resto del lienzo funciona.') })}
        <div class="mk-detalle__acciones">${acciones}${this.puedeEditar && !c.entregas ? `<button type="button" class="btn btn--gris btn--peligro btn--sm" data-accion="borrar-campana">${this.escapeHtml(__('Eliminar campaña'))}</button>` : ''}</div>
        ${c.entregas ? `<p class="mk-ayuda">${this.escapeHtml(__('Tiene entregas en una plataforma: se pausa o se cierra allí, no se borra desde aquí.'))}</p>` : ''}
      </div>`;
  }

  async _pintarEntregas(campaignId) {
    const c = this.campanas.get(campaignId);
    if (!c?.entregas) return;
    let x = this.entregasCache.get(campaignId);
    try {
      if (!x) { x = await window.MarketingDatos.entregas(campaignId); this.entregasCache.set(campaignId, x); }
    } catch (err) {
      const host = document.getElementById('mkEntregas');
      if (host) window.Estado.pintar(host, window.Estado.error({ titulo: __('No se pudieron leer las entregas'), texto: err?.message || '', reintentar: false }));
      return;
    }
    const host = document.getElementById('mkEntregas');
    if (!host || this.nodos.get(this.seleccion)?.sujeto_id !== campaignId) return;
    const r = x.rendimiento;
    const tile = (et, v) => `<div class="mk-tile"><span class="mk-tile__et">${this.escapeHtml(et)}</span><span class="mk-tile__v">${this.escapeHtml(v)}</span></div>`;
    const tiles = r.dias ? `<div class="mk-tiles">
      ${tile(__('Gasto'), this._dinero(r.gasto, r.moneda))}
      ${tile(__('Impresiones'), this._compacto(r.impresiones))}
      ${tile(__('Clics'), this._compacto(r.clics))}
      ${tile('CTR', r.ctr != null ? `${(r.ctr * 100).toFixed(2)}%` : '—')}
      ${tile(__('Conversiones'), this._compacto(r.conversiones))}
      ${tile(__('Costo por conversión'), r.cpa != null ? this._dinero(r.cpa, r.moneda) : '—')}
    </div><p class="mk-ayuda">${this.escapeHtml(__('{n} días con datos', { n: r.dias }))}</p>` : `<p class="mk-ayuda">${this.escapeHtml(__('Sin rendimiento medido todavía.'))}</p>`;
    const ESTADO_E = { active: __('Activa'), paused: __('En pausa'), draft: __('Borrador'), pending_review: __('En revisión'), rejected: __('Rechazada'), completed: __('Terminada'), archived: __('Archivada') };
    const BADGE_E = { active: 'badge--exito', paused: 'badge--advertencia', rejected: 'badge--error', pending_review: 'badge--info' };
    const entregas = x.entregas.map((d) => `
      <details class="mk-entrega superficie--1">
        <summary><span class="mk-entrega__nombre">${this.escapeHtml(d.external_name || d.platform)}</span><span class="badge badge--sm ${BADGE_E[d.status] || ''}">${this.escapeHtml(ESTADO_E[d.status] || d.status)}</span></summary>
        <p class="mk-ayuda">${this.escapeHtml([d.platform, d.platform_objective, d.daily_budget != null ? __('{m} al día', { m: this._dinero(Number(d.daily_budget), d.currency) }) : ''].filter(Boolean).join(' · '))}</p>
        ${d.conjuntos.length ? `<ul class="mk-mini">${d.conjuntos.slice(0, 20).map((s) => `<li><span>${this.escapeHtml(s.name || '—')}</span><span class="mk-item__meta">${this.escapeHtml(s.anuncios.length === 1 ? __('1 anuncio') : __('{n} anuncios', { n: s.anuncios.length }))}</span></li>`).join('')}</ul>${d.conjuntos.length > 20 ? `<p class="mk-ayuda">${this.escapeHtml(__('{n} conjuntos más.', { n: d.conjuntos.length - 20 }))}</p>` : ''}` : `<p class="mk-ayuda">${this.escapeHtml(__('Sin conjuntos sincronizados.'))}</p>`}
      </details>`).join('');
    window.Estado.pintar(host, tiles + entregas);
  }

  _detalleElemento(n, acciones) {
    const e = this.elementos.get(n.sujeto_id);
    const RUTA = { product: '/products', service: '/services', character: '/characters', scenario: '/places' };
    const kind = e?.kind || n.subtitulo;
    const ruta = RUTA[kind] && typeof window.getOrgPathPrefix === 'function' ? `${window.getOrgPathPrefix(this.orgId, window.currentOrgName || '')}${RUTA[kind]}` : null;
    return `
      <p class="mk-detalle__tipo">${this.escapeHtml(MarketingView.tiposElemento()[kind] || __('Elemento'))}</p>
      ${e?.imagen ? `<div class="mk-detalle__media media"><img src="${this.escapeHtml(e.imagen)}" alt=""></div>` : ''}
      <h2 class="mk-detalle__titulo">${this.escapeHtml(e?.nombre || n.titulo || '—')}</h2>
      ${e?.resumen ? `<p class="mk-detalle__texto">${this.escapeHtml(e.resumen)}</p>` : ''}
      ${ruta ? `<p><a class="mk-enlace" href="${this.escapeHtml(ruta)}">${this.escapeHtml(__('Abrir en el catálogo →'))}</a></p>` : ''}
      <div class="mk-detalle__acciones">${acciones}</div>`;
  }

  /* ── Eventos ─────────────────────────────────────────────────────────── */

  _enlazar() {
    const pagina = document.getElementById('mkPagina');
    const panel = document.getElementById('mkPanel');
    if (!pagina || !panel) return;
    this.addEventListener(pagina, 'click', (e) => {
      const b = e.target.closest('[data-accion]');
      if (b && !b.disabled) { this._accion(b.getAttribute('data-accion')); return; }
      const p = e.target.closest('[data-pestana]');
      if (p) { this._cambiarPestana(p.getAttribute('data-pestana')); return; }
      const s = e.target.closest('[data-seccion]');
      if (s) { this.seccion = s.getAttribute('data-seccion'); this._pintarPanel(); return; }
      const item = e.target.closest('[data-poner]');
      if (item) { this._ponerDesdeBiblioteca(item.getAttribute('data-poner'), item.getAttribute('data-id')); return; }
      const sep = e.target.closest('[data-separar]');
      if (sep) { const [c, a] = sep.getAttribute('data-separar').split('|'); this._desvincular(c, a); }
    });
    this.addEventListener(document.getElementById('mkTablero'), 'change', (e) => this.abrirTablero(e.target.value));
    this.addEventListener(panel, 'input', (e) => {
      if (e.target.id !== 'mkBuscar') return;
      this.busqueda = e.target.value;
      clearTimeout(this._tBuscar);
      this._tBuscar = setTimeout(() => this._pintarLista(), 120);
    });
    this.addEventListener(panel, 'change', (e) => {
      const u = e.target.closest('[data-unir]');
      if (u && u.value) { this._vincular(u.getAttribute('data-unir'), u.value); return; }
      const campo = e.target.closest('[data-campo]');
      if (campo) this._guardarCampo(campo);
    });
    this.addEventListener(panel, 'dragstart', (e) => {
      const item = e.target.closest('[data-poner]');
      if (!item || !e.dataTransfer) return;
      e.dataTransfer.setData('application/x-aisc-marketing', JSON.stringify({ kind: item.getAttribute('data-poner'), id: item.getAttribute('data-id') }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    // Notas y títulos de grupo: se editan en el lienzo y se guardan al salir del campo.
    const lienzo = document.getElementById('mkLienzo');
    this.addEventListener(lienzo, 'change', (e) => {
      const nota = e.target.closest('[data-nota]');
      if (nota) { this._editarAnotacion(nota.getAttribute('data-nota'), { cuerpo: nota.value }); return; }
      const g = e.target.closest('[data-grupo]');
      if (g) this._editarAnotacion(g.getAttribute('data-grupo'), { titulo: g.value });
    });
    this.addEventListener(document, 'keydown', (e) => this._tecla(e));
  }

  _tecla(e) {
    if (!document.getElementById('mkPagina')) return;
    const escribiendo = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (escribiendo || document.querySelector('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this._rehacer(); else this._deshacer(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this._rehacer(); return; }
    if (e.key === 'Escape') { this.lienzo?.seleccionar(null); this.lienzo?.seleccionarArista(null); this._seleccionar(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.puedeEditar) {
      if (this.lienzo?.aristaSel) { const a = this.lienzo.aristas.find((x) => x.id === this.lienzo.aristaSel); if (a) { e.preventDefault(); this._quitarArista(a); } return; }
      if (this.seleccion) { e.preventDefault(); this._quitarNodo(this.seleccion); }
    }
  }

  _accion(a) {
    const acciones = {
      'crear-audiencia': () => this._crearAudiencia(),
      'crear-campana': () => this._crearCampana(),
      'crear-nota': () => this._crearAnotacion('note'),
      'crear-grupo': () => this._crearAnotacion('group'),
      'deshacer': () => this._deshacer(),
      'rehacer': () => this._rehacer(),
      'reorganizar': () => this._reorganizar(),
      'alejar': () => this.lienzo?.zoom(1 / 1.2),
      'acercar': () => this.lienzo?.zoom(1.2),
      'encajar': () => this.lienzo?.encajar(),
      'nuevo-lienzo': () => this._nuevoTablero(),
      'renombrar-lienzo': () => this._renombrarTablero(),
      'borrar-lienzo': () => this._borrarTablero(),
      'quitar-nodo': () => this.seleccion && this._quitarNodo(this.seleccion),
      'borrar-audiencia': () => this._borrarSujeto('audience'),
      'borrar-campana': () => this._borrarSujeto('campaign'),
    };
    if (acciones[a]) acciones[a]();
  }

  /** Corre una escritura; si falla, lo dice con palabras (toast) y devuelve null. */
  async _intentar(fn) {
    try { return await fn(); } catch (err) {
      console.warn('[marketing]', err?.code || '', err?.message || err);
      window.showToast?.(err?.message || __('No se pudo guardar.'), { type: 'error' });
      return null;
    }
  }

  /* ── Historial (deshacer / rehacer) ──────────────────────────────────── */

  /** Un nodo que se quitó y volvió tiene otro id: el alias lleva del viejo al actual. */
  _r(id) { let x = id; const vistos = new Set(); while (this.alias.has(x) && !vistos.has(x)) { vistos.add(x); x = this.alias.get(x); } return x; }

  _registrar(paso) {
    this.atras.push(paso);
    if (this.atras.length > 60) this.atras.shift();
    this.adelante = [];
    this._botonesHistorial();
  }

  async _deshacer() {
    const p = this.atras.pop();
    if (!p || this.ocupado) { if (p) this.atras.push(p); return; }
    this.ocupado = true;
    const ok = await this._intentar(async () => { await p.deshacer(); return true; });
    this.ocupado = false;
    if (ok) this.adelante.push(p);
    this._botonesHistorial();
  }

  async _rehacer() {
    const p = this.adelante.pop();
    if (!p || this.ocupado) { if (p) this.adelante.push(p); return; }
    this.ocupado = true;
    const ok = await this._intentar(async () => { await p.rehacer(); return true; });
    this.ocupado = false;
    if (ok) this.atras.push(p);
    this._botonesHistorial();
  }

  _botonesHistorial() {
    const d = document.querySelector('#mkPagina [data-accion="deshacer"]');
    const r = document.querySelector('#mkPagina [data-accion="rehacer"]');
    if (d) d.disabled = !this.atras.length;
    if (r) r.disabled = !this.adelante.length;
  }

  _olvidarHistorial() { this.atras = []; this.adelante = []; this._botonesHistorial(); }

  /* ── Gestos del lienzo ───────────────────────────────────────────────── */

  async _mover(despues, antes) {
    const aplicar = async (lista) => {
      const reales = lista.map((c) => ({ ...c, id: this._r(c.id) })).filter((c) => this.nodos.has(c.id));
      await window.MarketingDatos.moverNodos(reales);
      for (const c of reales) {
        const n = this.nodos.get(c.id);
        Object.assign(n, { x: c.x, y: c.y }, c.ancho != null ? { ancho: c.ancho } : {}, c.alto != null ? { alto: c.alto } : {});
        this.lienzo?.moverNodo(c.id, c.x, c.y, c.ancho, c.alto);
      }
    };
    const ok = await this._intentar(async () => { await aplicar(despues); return true; });
    if (!ok) { for (const c of antes) this.lienzo?.moverNodo(c.id, c.x, c.y, c.ancho, c.alto); return; }
    this._registrar({ deshacer: () => aplicar(antes), rehacer: () => aplicar(despues) });
  }

  /** Crea el nodo en la base y en el lienzo. Devuelve el nodo. */
  async _crearNodoAhora(datos) {
    const n = await window.MarketingDatos.crearNodo(this.orgId, this.tablero.id, datos);
    this.nodos.set(n.id, n);
    this.lienzo?.ponerNodo(n);
    this._redibujarAristas();
    this._vacio();
    return n;
  }

  _quitarNodoLocal(id) {
    this.nodos.delete(id);
    this.aristas = this.aristas.filter((a) => a.desde !== id && a.hasta !== id);
    this.lienzo?.quitarNodo(id);
    this._redibujarAristas();
    if (this.seleccion === id) this._seleccionar(null);
    this._vacio();
  }

  /** Pone un nodo nuevo y lo deja en el historial (deshacer = quitarlo). */
  async _poner(datos, { seleccionar = true } = {}) {
    if (!this.tablero) return null;
    const n = await this._intentar(() => this._crearNodoAhora(datos));
    if (!n) return null;
    const origen = n.id;
    this._registrar({
      deshacer: async () => { const id = this._r(origen); await window.MarketingDatos.quitarNodo(id); this._quitarNodoLocal(id); },
      rehacer: async () => { const nuevo = await this._crearNodoAhora({ ...datos, x: n.x, y: n.y }); this.alias.set(this._r(origen), nuevo.id); },
    });
    if (seleccionar) { this.lienzo?.seleccionar(n.id); this._seleccionar(n.id); }
    if (this.pestana === 'biblioteca') this._pintarLista();
    return n;
  }

  async _ponerDesdeBiblioteca(kind, id, punto = null, sobre = null) {
    const ya = [...this.nodos.values()].find((n) => n.sujeto_id === id);
    if (ya) {
      this.lienzo?.centrarEn(ya.id); this.lienzo?.seleccionar(ya.id); this._seleccionar(ya.id);
      if (sobre) this._conectar(ya, sobre);
      return;
    }
    if (!this.puedeEditar) return;
    const pos = punto ? { x: Math.round(punto.x), y: Math.round(punto.y) } : window.MarketingDatos.mapeo.posicionLibre(kind, [...this.nodos.values()]);
    const n = await this._poner({ kind, sujeto_id: id, x: pos.x, y: pos.y });
    if (!n) return;
    if (!punto) this.lienzo?.centrarEn(n.id);
    if (sobre) await this._conectar(n, sobre);
  }

  _soltar(datos, punto, sobre) {
    if (!datos?.kind || !datos?.id) return;
    this._ponerDesdeBiblioteca(datos.kind, datos.id, punto, sobre);
  }

  async _quitarNodo(id) {
    const n = this.nodos.get(id);
    if (!n || !this.puedeEditar) return;
    const suyas = this.aristas.filter((a) => a.desde === id || a.hasta === id).map((a) => ({ ...a }));
    const ok = await this._intentar(async () => { await window.MarketingDatos.quitarNodo(id); return true; });
    if (!ok) return;
    this._quitarNodoLocal(id);
    if (this.pestana === 'biblioteca') this._pintarLista();
    const datos = { kind: n.kind, sujeto_id: n.sujeto_id, x: n.x, y: n.y, cuerpo: n.kind === 'note' ? n.cuerpo : undefined, titulo: n.kind === 'group' ? n.titulo : undefined, ancho: n.ancho, alto: n.alto, estilo: n.estilo };
    const origen = id;
    this._registrar({
      deshacer: async () => {
        const nuevo = await this._crearNodoAhora(datos);
        this.alias.set(this._r(origen), nuevo.id);
        for (const a of suyas) {
          const e = await window.MarketingDatos.crearArista(this.orgId, this.tablero.id, this._r(a.desde), this._r(a.hasta), a.etiqueta);
          this.alias.set(a.id, e.id);
          this.aristas.push(e);
        }
        this._redibujarAristas();
      },
      rehacer: async () => { const actual = this._r(origen); await window.MarketingDatos.quitarNodo(actual); this._quitarNodoLocal(actual); },
    });
  }

  async _conectar(a, b) {
    const M = window.MarketingDatos;
    const tipo = M.mapeo.tipoDeConexion(a, b);
    if (!tipo) return;
    if (tipo === 'vinculo') {
      const par = M.mapeo.parVinculo(a, b);
      if (this.vinculos.some((v) => v.campaign_id === par.campaign_id && v.audience_id === par.audience_id)) { window.showToast?.(__('Esa audiencia ya alimenta esa campaña.')); return; }
      const ok = await this._vincular(par.campaign_id, par.audience_id, { registrar: false });
      if (!ok) return;
      this._registrar({
        deshacer: () => this._desvincularAhora(par.campaign_id, par.audience_id),
        rehacer: () => this._vincularAhora(par.campaign_id, par.audience_id),
      });
      return;
    }
    if (this.aristas.some((e) => (e.desde === a.id && e.hasta === b.id) || (e.desde === b.id && e.hasta === a.id))) { window.showToast?.(__('Esos dos ya están conectados.')); return; }
    const e = await this._intentar(() => M.crearArista(this.orgId, this.tablero.id, a.id, b.id));
    if (!e) return;
    this.aristas.push(e);
    this._redibujarAristas();
    const origen = e.id;
    this._registrar({
      deshacer: async () => { const id = this._r(origen); await M.quitarArista(id); this.aristas = this.aristas.filter((x) => x.id !== id); this._redibujarAristas(); },
      rehacer: async () => { const n = await M.crearArista(this.orgId, this.tablero.id, this._r(a.id), this._r(b.id)); this.alias.set(this._r(origen), n.id); this.aristas.push(n); this._redibujarAristas(); },
    });
  }

  async _quitarArista(a) {
    const M = window.MarketingDatos;
    if (a.tipo === 'vinculo') { await this._desvincular(a.campaign_id, a.audience_id); return; }
    const ok = await this._intentar(async () => { await M.quitarArista(a.id); return true; });
    if (!ok) return;
    this.aristas = this.aristas.filter((x) => x.id !== a.id);
    this.lienzo?.seleccionarArista(null);
    this._redibujarAristas();
    const origen = a.id;
    this._registrar({
      deshacer: async () => { const n = await M.crearArista(this.orgId, this.tablero.id, this._r(a.desde), this._r(a.hasta), a.etiqueta); this.alias.set(this._r(origen), n.id); this.aristas.push(n); this._redibujarAristas(); },
      rehacer: async () => { const id = this._r(origen); await M.quitarArista(id); this.aristas = this.aristas.filter((x) => x.id !== id); this._redibujarAristas(); },
    });
  }

  async _vincularAhora(campaignId, audienceId) {
    const v = await window.MarketingDatos.vincular(this.orgId, campaignId, audienceId);
    if (!this.vinculos.some((x) => x.campaign_id === campaignId && x.audience_id === audienceId)) this.vinculos.push(v);
    this._trasVinculo(campaignId, audienceId);
  }

  async _desvincularAhora(campaignId, audienceId) {
    await window.MarketingDatos.desvincular(campaignId, audienceId);
    this.vinculos = this.vinculos.filter((x) => !(x.campaign_id === campaignId && x.audience_id === audienceId));
    this.lienzo?.seleccionarArista(null);
    this._trasVinculo(campaignId, audienceId);
  }

  _trasVinculo(campaignId, audienceId) {
    this._redibujarAristas();
    this._repintarSujeto(campaignId);
    this._repintarSujeto(audienceId);
    if (this.pestana === 'detalle') this._pintarPanel();
  }

  async _vincular(campaignId, audienceId, { registrar = true } = {}) {
    const ok = await this._intentar(async () => { await this._vincularAhora(campaignId, audienceId); return true; });
    if (ok && registrar) this._registrar({ deshacer: () => this._desvincularAhora(campaignId, audienceId), rehacer: () => this._vincularAhora(campaignId, audienceId) });
    return ok;
  }

  async _desvincular(campaignId, audienceId) {
    const ok = await this._intentar(async () => { await this._desvincularAhora(campaignId, audienceId); return true; });
    if (ok) this._registrar({ deshacer: () => this._vincularAhora(campaignId, audienceId), rehacer: () => this._desvincularAhora(campaignId, audienceId) });
  }

  async _reorganizar() {
    const nuevas = window.MarketingDatos.mapeo.reorganizar([...this.nodos.values()]);
    if (!nuevas.length) return;
    const antes = nuevas.map((c) => { const n = this.nodos.get(c.id); return { id: c.id, x: n.x, y: n.y }; });
    await this._mover(nuevas, antes);
    this.lienzo?.encajar();
  }

  /* ── Crear ───────────────────────────────────────────────────────────── */

  async _crearAudiencia() {
    const nombre = window.MarketingDatos.mapeo.siguienteNombre(__('Nueva audiencia'), [...this.audiencias.values()].map((a) => a.nombre));
    const a = await this._intentar(() => window.MarketingDatos.crearAudiencia(this.orgId, { nombre, market_id: this.tablero?.market_id || null }));
    if (!a) return;
    this.audiencias.set(a.id, a);
    await this._ponerDesdeBiblioteca('audience', a.id);
    this._enfocarNombre();
  }

  async _crearCampana() {
    const nombre = window.MarketingDatos.mapeo.siguienteNombre(__('Nueva campaña'), [...this.campanas.values()].map((c) => c.nombre));
    const c = await this._intentar(() => window.MarketingDatos.crearCampana(this.orgId, { nombre, objetivo: 'awareness', market_id: this.tablero?.market_id || null }));
    if (!c) return;
    this.campanas.set(c.id, c);
    await this._ponerDesdeBiblioteca('campaign', c.id);
    this._enfocarNombre();
  }

  _enfocarNombre() {
    const i = document.querySelector('#mkPanelCuerpo [data-campo="nombre"]');
    if (i) { i.focus(); i.select(); }
  }

  async _crearAnotacion(kind) {
    if (!this.lienzo || !this.tablero) return;
    const c = this.lienzo.centroMundo();
    const datos = kind === 'group'
      ? { kind, x: Math.round(c.x - 200), y: Math.round(c.y - 140), ancho: 400, alto: 280, titulo: __('Grupo') }
      : { kind, x: Math.round(c.x - 120), y: Math.round(c.y - 60), cuerpo: '' };
    const n = await this._poner(datos);
    if (n && kind === 'note') this.lienzo.els.get(n.id)?.querySelector('textarea')?.focus();
  }

  async _editarAnotacion(id, cambios) {
    const n = this.nodos.get(id);
    if (!n || !this.puedeEditar) return;
    const ok = await this._intentar(async () => { await window.MarketingDatos.editarNodo(id, cambios); return true; });
    if (!ok) return;
    if (cambios.cuerpo !== undefined) n.cuerpo = cambios.cuerpo;
    if (cambios.titulo !== undefined) n.titulo = cambios.titulo;
  }

  /* ── Guardar el inspector ────────────────────────────────────────────── */

  async _guardarCampo(control) {
    const det = control.closest('.mk-detalle');
    if (!det || !this.puedeEditar) return;
    const sujeto = det.getAttribute('data-sujeto');
    const id = det.getAttribute('data-id');
    const valor = (c) => det.querySelector(`[data-campo="${c}"]`);
    const campo = control.getAttribute('data-campo');
    const v = control.type === 'checkbox' ? control.checked : control.value;
    const cambios = {};
    const coma = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
    // Los pares se guardan juntos: la base valida uno contra el otro.
    if (['presupuesto', 'moneda'].includes(campo)) { cambios.presupuesto = valor('presupuesto').value; cambios.moneda = valor('moneda').value; }
    else if (['inicio', 'fin'].includes(campo)) { cambios.inicio = valor('inicio').value; cambios.fin = valor('fin').value; }
    else if (['edad_min', 'edad_max'].includes(campo)) { cambios.edad_min = valor('edad_min').value; cambios.edad_max = valor('edad_max').value; }
    else if (['generos', 'lugares'].includes(campo)) cambios[campo] = coma(v);
    else cambios[campo] = v;
    const estado = document.getElementById('mkGuardado');
    if (estado) estado.textContent = __('Guardando…');
    const M = window.MarketingDatos;
    const r = await this._intentar(() => (sujeto === 'audience' ? M.editarAudiencia(id, cambios) : M.editarCampana(id, cambios)));
    if (!r) { if (estado) estado.textContent = ''; return; }
    if (sujeto === 'audience') this.audiencias.set(id, r); else { this.campanas.set(id, r); this.entregasCache.delete(id); }
    this._repintarSujeto(id);
    if (estado) estado.textContent = __('Guardado');
  }

  async _borrarSujeto(kind) {
    const n = this.nodos.get(this.seleccion);
    if (!n || n.kind !== kind) return;
    const esAud = kind === 'audience';
    const reg = esAud ? this.audiencias.get(n.sujeto_id) : this.campanas.get(n.sujeto_id);
    if (!reg) return;
    const ok = await window.Capas.confirmar({
      titulo: esAud ? __('Eliminar audiencia') : __('Eliminar campaña'),
      texto: esAud
        ? __('Se borrará «{n}» de la marca, no solo de este lienzo, con sus dolores, deseos y vínculos. No se puede deshacer. Para despejar el lienzo usa «Quitar del lienzo».', { n: reg.nombre })
        : __('Se borrará «{n}» de la marca, no solo de este lienzo. No se puede deshacer. Para despejar el lienzo usa «Quitar del lienzo».', { n: reg.nombre }),
      aceptar: esAud ? __('Eliminar audiencia') : __('Eliminar campaña'),
      peligro: true,
    });
    if (!ok) return;
    const M = window.MarketingDatos;
    const hecho = await this._intentar(async () => { if (esAud) await M.borrarAudiencia(reg.id); else await M.borrarCampana(reg.id); return true; });
    if (!hecho) return;
    // La base se lleva en cascada sus nodos (de todos los lienzos) y sus vínculos.
    (esAud ? this.audiencias : this.campanas).delete(reg.id);
    this.vinculos = this.vinculos.filter((v) => (esAud ? v.audience_id : v.campaign_id) !== reg.id);
    for (const x of [...this.nodos.values()]) if (x.sujeto_id === reg.id) this._quitarNodoLocal(x.id);
    this._olvidarHistorial();
    window.showToast?.(esAud ? __('Audiencia eliminada.') : __('Campaña eliminada.'));
  }

  async onLeave() {
    clearTimeout(this._tBuscar);
    if (this.lienzo) { this.lienzo.destruir(); this.lienzo = null; }
    this.cleanup();
  }
}

window.MarketingView = MarketingView;
