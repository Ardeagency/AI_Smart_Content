/**
 * MarketingView — la página MARKETING (/marketing y /command-center): el lienzo de
 * estrategia con el DISEÑO de v1 (CommandCenterView + Canvas.mixin + CanvasStore, borrados
 * en L8): barra con el nombre de la estrategia y los botones de crear, el lienzo de puntos,
 * las ESTRATEGIAS a la izquierda, la BIBLIOTECA flotante a la derecha (rail de iconos +
 * catálogo de nodos con drill) que se vuelve INSPECTOR al elegir un nodo, y el minimapa.
 * Mismas clases (.cc-*), mismos textos y la misma disposición; expresado con los tokens
 * nuevos (css/modules/marketing.css).
 *
 * Datos: TODO por window.MarketingDatos (js/services/MarketingDataService.js): una
 * «estrategia» es un tablero (marketing.boards), sus nodos y aristas son board_nodes y
 * board_edges, y unir una audiencia con una campaña escribe marketing.campaign_audiences.
 * El lienzo escucha Realtime (otra persona mueve, pone o quita algo y se ve sin recargar).
 * Mecánica en js/views/marketing/Lienzo.js. Pintado: window.Estado.pintar. Sin `.from()`.
 * Sin permiso `editar_campanas` se abre en solo lectura (lo decide la base por RLS; aquí
 * solo se esconden los gestos que fallarían).
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
    this.seleccion = null;         // id del nodo en el inspector
    this.seccion = null;           // sección abierta de la biblioteca (null = solo el rail)
    this.drill = null;             // tipo abierto en «Nodos» (vista B)
    this.atras = [];
    this.adelante = [];
    this.alias = new Map();
    this.ocupado = false;
    this.entregasCache = new Map();
    this.propias = new Map();      // id → ms de mi última escritura (eco de Realtime)
    this.apagarRealtime = null;
    this.sondeo = null;
    this.guardados = new Map();    // guardado diferido del inspector por campo
  }

  async onEnter() {
    this.orgId = this.routeParams?.orgId || window.currentOrgId || null;
    this.puedeEditar = !!(this.orgId && window.contextoService?.puede('editar_campanas', this.orgId));
    // Vista inmersiva (v1): el lienzo se lleva todo el ancho; al salir se restaura.
    try { window.appNavigation?.collapseForImmersive?.(); } catch (_) { /* sin shell */ }
  }

  renderHTML() {
    const e = (s) => this.escapeHtml(s);
    const b = (accion, texto, icono, clase = 'btn--gris', titulo = texto) =>
      `<button type="button" class="btn ${clase} btn--sm" data-accion="${accion}" title="${e(titulo)}"><i class="aisc-ico aisc-ico--${icono}" aria-hidden="true"></i><span>${e(texto)}</span></button>`;
    const crear = this.puedeEditar ? `
          ${b('crear-audiencia', __('Objetivo de Audiencia'), 'user-registration', 'btn--oscuro', __('Crear Objetivo de Audiencia'))}
          ${b('crear-campana', __('Objetivo de Campaña'), 'goal', 'btn--oscuro', __('Crear Objetivo de Campaña (ancla de la estrategia)'))}` : `<span class="chip">${e(__('Solo lectura'))}</span>`;
    const anotar = this.puedeEditar ? `
          ${b('crear-nota', __('Crear nota'), 'brief', 'btn--gris', __('Crear nota (anotación del lienzo)'))}
          ${b('crear-grupo', __('Crear grupo'), 'layers', 'btn--gris', __('Crear grupo (marco para agrupar nodos)'))}` : '';
    const zoom = (accion, titulo, glifo) => `<button type="button" class="btn btn--gris btn--sm btn--icono" data-accion="${accion}" title="${e(titulo)}" aria-label="${e(titulo)}">${glifo}</button>`;
    const informe = [['todo', 'layers', __('Informar todo')], ['campana', 'campaign', __('Campaña seleccionada')], ['audiencia', 'audience', __('Audiencia seleccionada')], ['ecosistema', 'memory', __('Aprendizaje del ecosistema')], ['seleccion', 'goal', __('Seleccionado')]];
    return `
<div class="cc-page fondo-org--tenue fondo-org--fijo" id="commandCenterPage">
  <div class="cc-cc-layout" id="ccTwoCol">
    <div class="cc-canvas-wrap">
      <div class="cc-canvas-toolbar">
        <div class="cc-canvas-toolbar-group">
          <label class="cc-strat-name" id="ccStratName" title="${e(__('Editar nombre de la estrategia'))}">
            <input class="cc-strat-name-input" id="ccStratNameInput" type="text" spellcheck="false" maxlength="120"
                   aria-label="${e(__('Nombre de la estrategia'))}" placeholder="${e(__('Estrategia'))}"${this.puedeEditar ? '' : ' readonly'}>
            ${this.puedeEditar ? '<i class="aisc-ico cc-strat-name-pen aisc-ico--edit" aria-hidden="true"></i>' : ''}
          </label>
          <span class="cc-toolbar-divider" aria-hidden="true"></span>
          ${crear}
          <div class="cc-report-dd" id="ccReportDD">
            <button type="button" class="btn btn--gris btn--sm" id="ccBtnReport" data-accion="informe" aria-haspopup="menu" aria-expanded="false" title="${e(__('Crear informe con Vera (Claude)'))}">
              <i class="aisc-ico aisc-ico--document" aria-hidden="true"></i><span>${e(__('Crear informe'))}</span><i class="aisc-ico cc-report-caret aisc-ico--chevron-down" aria-hidden="true"></i>
            </button>
            <div class="cc-report-menu" id="ccReportMenu" role="menu" hidden>
              ${informe.map(([k, i, t]) => `<button type="button" role="menuitem" data-informe="${k}"><i class="aisc-ico aisc-ico--${i}" aria-hidden="true"></i> ${e(t)}</button>`).join('')}
            </div>
          </div>
          ${anotar}
        </div>
        <div class="cc-canvas-toolbar-group">
          ${this.puedeEditar ? b('reorganizar', __('Reorganizar'), 'grid', 'btn--gris', __('Reorganizar nodos')) : ''}
          ${zoom('alejar', __('Alejar'), '<span class="cc-zoom-glyph">&minus;</span>')}
          ${zoom('encajar', __('Centrar'), '<i class="aisc-ico aisc-ico--expand" aria-hidden="true"></i>')}
          ${zoom('acercar', __('Acercar'), '<span class="cc-zoom-glyph">+</span>')}
        </div>
      </div>

      <div class="cc-canvas" id="ccCanvas" aria-label="${e(__('Lienzo de estrategia'))}">
        <svg class="cc-canvas-edges" id="ccCanvasEdges" aria-hidden="true"></svg>
        <div class="cc-canvas-world" id="ccCanvasWorld"></div>
        <div class="cc-canvas-empty" id="ccCanvasEmpty">${window.Estado.cargando('bloque')}</div>

        <div class="cc-minimap-float" id="ccMinimapWrap" hidden>
          <canvas id="ccMinimap" class="cc-minimap" width="220" height="140" aria-label="${e(__('Minimapa'))}"></canvas>
        </div>

        <aside class="cc-strat-panel" id="ccStratPanel" aria-label="${e(__('Estrategias'))}">
          <div class="cc-strat-head">
            <span class="cc-strat-title"><i class="aisc-ico aisc-ico--layers" aria-hidden="true"></i> ${e(__('Estrategias'))}</span>
            ${this.puedeEditar ? `<button class="btn btn--gris btn--sm cc-strat-new" id="ccStratNew" data-accion="nueva-estrategia" type="button" title="${e(__('Nueva estrategia'))}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i><span>${e(__('Nueva'))}</span></button>` : ''}
          </div>
          <div class="cc-strat-list" id="ccStratList"></div>
        </aside>

        <aside class="cc-floating-panel" id="ccSidebar" aria-label="${e(__('Biblioteca'))}">
          <div class="cc-fp-panel" role="tabpanel" aria-labelledby="ccPanelTitle">
            <div class="cc-fp-head">
              <button class="btn btn--gris btn--sm btn--icono cc-fp-toggle" id="ccPanelToggle" data-accion="cerrar-panel" type="button" title="${e(__('Cerrar sección'))}" aria-label="${e(__('Cerrar sección'))}">
                <i class="aisc-ico aisc-ico--close" aria-hidden="true"></i>
              </button>
              <span class="cc-fp-title" id="ccPanelTitle">${e(__('Biblioteca'))}</span>
            </div>
            <div class="cc-fp-body" id="ccPanelBody"></div>
          </div>
          <nav class="cc-fp-rail" id="ccPanelRail" role="tablist" aria-orientation="vertical" aria-label="${e(__('Biblioteca'))}"></nav>
        </aside>
      </div>
    </div>
  </div>
</div>`;
  }

  async render() {
    await super.render();
    this._enlazar();
    this._pintarRail();
    await this.cargar();
  }

  /* ── Carga ───────────────────────────────────────────────────────────── */

  async cargar() {
    const vacio = document.getElementById('ccCanvasEmpty');
    if (!window.MarketingDatos || !this.orgId) {
      this._aviso(window.Estado.error({ titulo: __('No se pudo abrir Marketing'), texto: __('Selecciona una organización o inicia sesión de nuevo.'), reintentar: false }));
      return;
    }
    if (vacio) { vacio.hidden = false; window.Estado.pintar(vacio, window.Estado.cargando('bloque')); }
    try {
      const d = await window.MarketingDatos.base(this.orgId);
      this.tableros = d.tableros;
      this.audiencias = new Map(d.audiencias.map((a) => [a.id, a]));
      this.campanas = new Map(d.campanas.map((c) => [c.id, c]));
      this.vinculos = d.vinculos;
      // v1: una marca sin estrategias recibe la «Estrategia general» al entrar.
      if (!this.tableros.length && this.puedeEditar) {
        const t = await window.MarketingDatos.crearTablero(this.orgId, { nombre: __('Estrategia general') });
        this.tableros.push(t);
      }
      const recordado = this._leerRecordado();
      const t = this.tableros.find((x) => x.id === recordado) || this.tableros[0] || null;
      if (!t) { this._sinTableros(); return; }
      await this.abrirTablero(t.id);
    } catch (err) {
      console.error('MarketingView cargar:', err);
      this._aviso(window.Estado.error({ titulo: __('No se pudo cargar el lienzo'), texto: err?.message || '' }));
      window.Estado.alReintentar(vacio, () => this.cargar());
    }
  }

  async abrirTablero(id) {
    const t = this.tableros.find((x) => x.id === id);
    if (!t) return;
    this.tablero = t;
    this._recordar(id);
    const { nodos, aristas } = await window.MarketingDatos.lienzo(id);
    this.nodos = new Map(nodos.map((n) => [n.id, n]));
    this.aristas = aristas;
    this.atras = []; this.adelante = []; this.alias.clear();
    this.seleccion = null;
    await this._cargarElementosDe([...this.nodos.values()].filter((n) => n.kind === 'element').map((n) => n.subtitulo));
    this._montarLienzo();
    this._pintarEstrategias();
    this._pintarNombre();
    this._pintarPanel();
    this._escuchar();
  }

  _montarLienzo() {
    const canvas = document.getElementById('ccCanvas');
    if (!canvas) return;
    if (this.lienzo) this.lienzo.destruir();
    this.lienzo = new window.LienzoMarketing({
      canvas,
      mundo: document.getElementById('ccCanvasWorld'),
      svg: document.getElementById('ccCanvasEdges'),
      minimapa: document.getElementById('ccMinimap'),
    }, {
      editable: this.puedeEditar,
      escalaMin: Math.max(0.4, window.MarketingDatos.ESCALA_MIN),
      escalaMax: window.MarketingDatos.ESCALA_MAX,
      textoQuitarArista: __('Quitar conexión'),
      textoAgregar: __('Agregar nodo (abre la paleta)'),
      pintarNodo: (n) => this._htmlNodo(n),
      claseNodo: (n) => this._claseNodo(n),
      datosNodo: (n) => this._datosNodo(n),
      tipoArista: (a) => this._tipoArista(a),
      puedeUnir: (a, b) => window.MarketingDatos.mapeo.tipoDeConexion(a, b),
      alSeleccionar: (id) => this._seleccionar(id),
      alMover: (despues, antes) => this._mover(despues, antes),
      alConectar: (a, b) => this._conectar(a, b),
      alQuitarArista: (a) => this._quitarArista(a),
      alMasArista: () => this._abrirSeccion('nodos', { forzar: true }),
      alSoltar: (datos, punto, sobre) => this._soltar(datos, punto, sobre),
      alViewport: (vp) => { if (this.puedeEditar && this.tablero) window.MarketingDatos.guardarViewport(this.tablero.id, vp); },
    });
    const vp = this.tablero.viewport;
    this.lienzo.cargar([...this.nodos.values()], this._aristasVisibles(), vp);
    const vpVacio = vp.x === 0 && vp.y === 0 && vp.escala === 1;
    if (vpVacio && this.nodos.size) requestAnimationFrame(() => this.lienzo?.encajar());
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
    const v = document.getElementById('ccCanvasEmpty');
    if (!v) return;
    v.hidden = false;
    window.Estado.pintar(v, html);
  }

  /** «El lienzo está vacío» (v1) cuando la estrategia no tiene nodos. */
  _vacio() {
    const v = document.getElementById('ccCanvasEmpty');
    if (!v) return;
    if (this.nodos.size) { v.hidden = true; return; }
    v.hidden = false;
    window.Estado.pintar(v, `<i class="aisc-ico aisc-ico--flows" aria-hidden="true"></i>
      <p class="cc-canvas-empty-title">${this.escapeHtml(__('El lienzo está vacío'))}</p>
      <p>${this.escapeHtml(this.puedeEditar
        ? __('Aquí armas la estrategia: trae una audiencia o un objetivo desde la biblioteca de la derecha —arrástralo o haz clic— y conéctalos para ver de qué se alimenta cada campaña.')
        : __('Todavía nadie ha armado la estrategia en este lienzo.'))}</p>`);
  }

  _sinTableros() {
    this.tablero = null;
    if (this.lienzo) { this.lienzo.destruir(); this.lienzo = null; }
    this._pintarEstrategias();
    this._pintarNombre();
    this._aviso(`<i class="aisc-ico aisc-ico--flows" aria-hidden="true"></i>
      <p class="cc-canvas-empty-title">${this.escapeHtml(__('Esta marca todavía no tiene una estrategia'))}</p>
      <p>${this.escapeHtml(__('Una estrategia es un lienzo: audiencias, campañas y lo que las alimenta, en un solo mapa.'))}</p>`);
  }

  _leerRecordado() { try { return localStorage.getItem(`aisc:marketing:lienzo:${this.orgId}`); } catch (_) { return null; } }
  _recordar(id) { try { localStorage.setItem(`aisc:marketing:lienzo:${this.orgId}`, id); } catch (_) { /* sin almacenamiento: se abre la primera */ } }

  /* ── Etiquetas ───────────────────────────────────────────────────────── */

  static objetivos() { return { awareness: __('Reconocimiento'), traffic: __('Tráfico'), engagement: __('Interacción'), leads: __('Clientes potenciales'), sales: __('Ventas'), retention: __('Retención'), launch: __('Lanzamiento') }; }
  static estados() { return { draft: __('Borrador'), planned: __('Planeada'), active: __('Activa'), paused: __('En pausa'), finished: __('Terminada'), cancelled: __('Cancelada') }; }
  static conciencia() { return { unaware: __('No sabe que tiene el problema'), problem_aware: __('Conoce el problema'), solution_aware: __('Conoce soluciones'), product_aware: __('Conoce el producto'), most_aware: __('Lista para comprar') }; }
  static narrativas() { return { brand_awareness: __('Conocer la marca'), product_launch: __('Lanzamiento de producto'), lifestyle_storytelling: __('Historias de estilo de vida'), testimonial: __('Testimonio'), reactivation: __('Reactivación'), sale_promo: __('Promoción'), educational: __('Educativa'), seasonal_moment: __('Fecha especial'), behind_the_scenes: __('Detrás de cámaras') }; }
  static tipos() { return { audience: __('Audiencia'), campaign: __('Campaña'), element: __('Elemento'), note: __('Nota'), group: __('Grupo'), plan: __('Plan'), brief: __('Brief'), key_message: __('Mensaje clave'), conversion: __('Conversión'), creative: __('Pieza'), script: __('Guion'), flow: __('Flujo'), delivery: __('Entrega'), publication: __('Publicación'), reading: __('Lectura') }; }
  static tiposElemento() { return { product: __('Producto'), service: __('Servicio'), character: __('Personaje'), scenario: __('Lugar'), identity: __('Identidad') }; }
  /** kind del elemento → tipo de identidad de v1 (clases y puertos de .cc-node--identity). */
  static identidadV1() { return { product: 'products', service: 'services', character: 'characters', scenario: 'places', identity: 'products' }; }
  static iconoElemento() { return { product: 'product', service: 'tag', character: 'characters', scenario: 'places', identity: 'product' }; }
  /** Estado de campaña → badge (JC: estados por .badge--*); el resto va neutro. */
  static badgeEstado(e) { return { active: 'badge--exito', paused: 'badge--advertencia', cancelled: 'badge--error', planned: 'badge--info' }[e] || ''; }
  static coloresGrupo() { return ['blue', 'green', 'purple', 'orange', 'red', 'gray']; }

  _dinero(monto, moneda) {
    if (monto == null) return '';
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(monto); } catch (_) { return `${Math.round(monto)} ${moneda || ''}`.trim(); }
  }
  /** Gasto de la campaña (campaigns_view): monto en su moneda o «varias monedas», nunca 0 inventado. */
  _gasto(c) {
    const g = window.MarketingDatos.mapeo.gastoDe(c);
    if (g.tipo === 'varias') return __('varias monedas');
    if (g.tipo === 'monto') return g.moneda ? this._dinero(g.monto, g.moneda) : this._compacto(g.monto);
    return '—';
  }
  _compacto(n) {
    const v = Number(n) || 0;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString('es-CO');
  }

  /* ── Nodos (HTML escapado; el lienzo lo pinta con Estado.pintar) ────── */

  _esReal(c) { return !!(c && c.entregas > 0); }

  _claseNodo(n) {
    if (n.kind === 'audience') { const a = this.audiencias.get(n.sujeto_id); return `cc-node--audience cc-node--mini${a && !a.activa ? ' cc-node--off' : ''}`; }
    if (n.kind === 'campaign') {
      const c = this.campanas.get(n.sujeto_id);
      return this._esReal(c) ? 'cc-node--campaign cc-node--readonly cc-node--campaign-v2' : 'cc-node--campaign cc-node--anchor cc-node--mini';
    }
    if (n.kind === 'element') {
      const kind = this.elementos.get(n.sujeto_id)?.kind || n.subtitulo;
      return kind === 'product' ? 'cc-node--identity cc-node--prem cc-node--prem-product' : 'cc-node--identity';
    }
    if (n.kind === 'note') return 'cc-node--sticky';
    if (n.kind === 'group') {
      const color = MarketingView.coloresGrupo().includes(n.estilo?.color) ? n.estilo.color : 'blue';
      return `cc-node--group cc-group--${color}`;
    }
    return 'cc-node--identity';
  }

  _datosNodo(n) {
    const id = n.sujeto_id || n.id;
    if (n.kind === 'audience') return { type: 'audience', id, 'identity-type': null };
    if (n.kind === 'campaign') return { type: this._esReal(this.campanas.get(n.sujeto_id)) ? 'campaign-real' : 'campaign-concept', id, 'identity-type': null };
    if (n.kind === 'element') {
      const kind = this.elementos.get(n.sujeto_id)?.kind || n.subtitulo;
      return { type: 'identity', id, 'identity-type': MarketingView.identidadV1()[kind] || 'products' };
    }
    if (n.kind === 'note') return { type: 'sticky', id, 'identity-type': null };
    if (n.kind === 'group') return { type: 'group', id, 'identity-type': null };
    return { type: 'identity', id, 'identity-type': n.kind };
  }

  /** Punteado = adjunto (audiencia, elemento, nota, grupo); sólido con flecha = flujo (v1). */
  _tipoArista(a) {
    const adjunto = (id) => ['audience', 'element', 'note', 'group'].includes(this.nodos.get(id)?.kind);
    return a.tipo === 'vinculo' || adjunto(a.desde) || adjunto(a.hasta) ? 'ingredient' : 'production';
  }

  _puertos() {
    if (!this.puedeEditar) return { entrada: '', salida: '' };
    const t = this.escapeHtml(__('Arrastra para conectar'));
    return {
      entrada: `<span class="cc-node-port cc-node-port--in" data-port="in" title="${this.escapeHtml(__('Entrada'))}"></span>`,
      salida: `<span class="cc-node-port cc-node-port--out" data-port="out" title="${t}"></span>`,
    };
  }

  _htmlNodo(n) {
    const esc = (s) => this.escapeHtml(s);
    const p = this._puertos();
    const quitar = this.puedeEditar ? `<button type="button" class="btn btn--gris btn--sm btn--icono cc-node-act cc-node-uncanvas" data-quitar-nodo="${esc(n.id)}" title="${esc(__('Quitar del lienzo'))}" aria-label="${esc(__('Quitar del lienzo'))}"><i class="aisc-ico aisc-ico--eye-off" aria-hidden="true"></i></button>` : '';
    if (n.kind === 'audience') {
      const a = this.audiencias.get(n.sujeto_id);
      if (!a) return this._htmlNodoGenerico(n, p, quitar);
      const edad = a.edad_min != null || a.edad_max != null ? `${a.edad_min ?? '?'}–${a.edad_max ?? '?'}` : '';
      const conc = a.conciencia ? MarketingView.conciencia()[a.conciencia] : '';
      const chips = `${edad ? `<span class="cc-node-chip">${esc(edad)}</span>` : ''}${conc ? `<span class="cc-node-chip">${esc(conc)}</span>` : ''}`;
      return `
        ${p.entrada}
        <div class="cc-node-head" data-drag-handle>
          <span class="cc-node-icon"><i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i></span>
          <div class="cc-node-head-text">
            <span class="cc-node-title">${esc(__('Audiencia'))}</span>
            <span class="cc-node-name" title="${esc(a.nombre)}">${esc(a.nombre || __('Sin nombre'))}</span>
          </div>
          <span class="cc-node-status ${a.activa ? 'is-on' : 'is-off'}" title="${esc(a.activa ? __('Activa') : __('Apagada'))}"></span>
        </div>
        ${chips ? `<div class="cc-node-body cc-node-body--mini"><div class="cc-node-chips">${chips}</div></div>` : ''}
        ${p.salida}`;
    }
    if (n.kind === 'campaign') {
      const c = this.campanas.get(n.sujeto_id);
      if (!c) return this._htmlNodoGenerico(n, p, quitar);
      const estado = MarketingView.estados()[c.estado] || c.estado;
      const badge = MarketingView.badgeEstado(c.estado);
      const objetivo = c.objetivo ? MarketingView.objetivos()[c.objetivo] : '';
      const unidas = this.vinculos.filter((v) => v.campaign_id === c.id).map((v) => this.audiencias.get(v.audience_id)?.nombre).filter(Boolean);
      const enlace = unidas.length ? `<span class="cc-node-chip cc-node-chip--link" title="${esc(__('Audiencia: {n}', { n: unidas.join(', ') }))}"><i class="aisc-ico aisc-ico--link" aria-hidden="true"></i></span>` : '';
      const chipEstado = badge ? `<span class="badge badge--sm ${badge}">${esc(estado)}</span>` : `<span class="cc-node-chip">${esc(estado)}</span>`;
      if (this._esReal(c)) {
        // v1 «Campaña» (real): tarjeta limpia; métricas en el inspector.
        return `
          ${p.entrada}
          <div class="cc-node-head" data-drag-handle>
            <span class="cc-node-icon cc-node-icon--camp cc-node-icon--hero"><i class="aisc-ico aisc-ico--campaign" aria-hidden="true"></i></span>
            <div class="cc-node-head-text">
              <span class="cc-node-title">${esc(__('Campaña'))}</span>
              <span class="cc-node-realname" title="${esc(c.nombre)}">${esc(c.nombre || __('Sin nombre'))}</span>
            </div>
            <div class="cc-node-actions">
              <span class="cc-node-sync is-synced" title="${esc(__('Corre en una plataforma ({n} entregas)', { n: c.entregas }))}"><i class="aisc-ico aisc-ico--refresh" aria-hidden="true"></i></span>
              ${quitar}
            </div>
          </div>
          <div class="cc-node-body cc-node-body--lean">
            <div class="cc-node-pills">
              ${objetivo ? `<span class="cc-node-pill cc-node-pill--plat">${esc(objetivo)}</span>` : ''}
              ${badge ? `<span class="badge badge--sm ${badge}">${esc(estado)}</span>` : `<span class="cc-node-pill cc-node-pill--status">${esc(estado)}</span>`}
              ${unidas.length ? `<span class="cc-node-pill cc-node-pill--linked" title="${esc(__('Objetivo de Audiencia: {n}', { n: unidas.join(', ') }))}"><i class="aisc-ico aisc-ico--link" aria-hidden="true"></i></span>` : ''}
            </div>
          </div>
          ${p.salida}`;
      }
      return `
        ${p.entrada}
        <div class="cc-node-head" data-drag-handle>
          <span class="cc-node-icon cc-node-icon--anchor"><i class="aisc-ico aisc-ico--goal" aria-hidden="true"></i></span>
          <div class="cc-node-head-text">
            <span class="cc-node-title">${esc(__('Objetivo'))}</span>
            <span class="cc-node-name" title="${esc(c.nombre)}">${esc(c.nombre || __('Sin nombre'))}</span>
          </div>
          <span class="cc-node-status cc-node-status--${esc(c.estado)}" title="${esc(estado)}"></span>
        </div>
        <div class="cc-node-body cc-node-body--mini"><div class="cc-node-chips">${chipEstado}${objetivo ? `<span class="cc-node-chip">${esc(objetivo)}</span>` : ''}${enlace}</div></div>
        ${p.salida}`;
    }
    if (n.kind === 'element') {
      const e = this.elementos.get(n.sujeto_id);
      const kind = e?.kind || n.subtitulo;
      const etiqueta = MarketingView.tiposElemento()[kind] || __('Elemento');
      const nombre = e?.nombre || n.titulo || etiqueta;
      if (kind === 'product') {
        const img = e?.imagen ? `<img src="${esc(e.imagen)}" alt="" loading="lazy" draggable="false">` : '<div class="cc-prem-placeholder"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>';
        return `
          ${p.entrada}
          <div class="cc-prem-toolbar" data-drag-handle>
            <span class="cc-prem-tag">${esc(etiqueta)}</span>
            ${this.puedeEditar ? `<button type="button" class="btn btn--gris btn--sm btn--icono cc-prem-x cc-node-uncanvas" data-quitar-nodo="${esc(n.id)}" title="${esc(__('Quitar del lienzo'))}" aria-label="${esc(__('Quitar del lienzo'))}"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i></button>` : ''}
          </div>
          <div class="cc-prem-image">${img}</div>
          <div class="cc-prem-caption">
            <span class="cc-prem-name" title="${esc(nombre)}">${esc(nombre)}</span>
            ${e?.resumen ? `<span class="cc-prem-sub">${esc(e.resumen)}</span>` : ''}
          </div>
          ${p.salida}`;
      }
      return `
        ${p.entrada}
        <div class="cc-node-head" data-drag-handle>
          <span class="cc-node-icon"><i class="aisc-ico aisc-ico--${MarketingView.iconoElemento()[kind] || 'product'}" aria-hidden="true"></i></span>
          <span class="cc-node-title">${esc(etiqueta)}</span>
          <div class="cc-node-actions">${quitar}</div>
        </div>
        <div class="cc-node-body">
          <div class="cc-node-realname" title="${esc(nombre)}">${esc(nombre)}</div>
          ${e?.resumen ? `<span class="cc-node-meta">${esc(e.resumen)}</span>` : ''}
        </div>
        ${p.salida}`;
    }
    if (n.kind === 'note') {
      return `
        <div class="cc-sticky-head" data-drag-handle>
          <i class="aisc-ico aisc-ico--brief" aria-hidden="true"></i>
          <span>${esc(__('Nota'))}</span>
        </div>
        <textarea class="cc-sticky-body" data-nota="${esc(n.id)}" aria-label="${esc(__('Texto de la nota'))}" placeholder="${esc(__('Escribe una nota...'))}"${this.puedeEditar ? '' : ' readonly'}>${esc(n.cuerpo)}</textarea>`;
    }
    if (n.kind === 'group') {
      const titulo = n.titulo && n.titulo !== '(sin titulo)' ? n.titulo : '';
      return `
        <div class="cc-group-head" data-drag-handle>
          <i class="aisc-ico aisc-ico--layers" aria-hidden="true"></i>
          <input type="text" class="cc-group-title" data-grupo="${esc(n.id)}" placeholder="${esc(__('Sin título'))}" value="${esc(titulo)}" autocomplete="off" spellcheck="false" aria-label="${esc(__('Nombre del grupo'))}"${this.puedeEditar ? '' : ' readonly'}>
        </div>
        <div class="cc-group-area"></div>`;
    }
    return this._htmlNodoGenerico(n, p, quitar);
  }

  _htmlNodoGenerico(n, p, quitar) {
    const esc = (s) => this.escapeHtml(s);
    const tipo = MarketingView.tipos()[n.kind] || n.kind;
    return `
      ${p.entrada}
      <div class="cc-node-head" data-drag-handle>
        <span class="cc-node-icon"><i class="aisc-ico aisc-ico--document" aria-hidden="true"></i></span>
        <span class="cc-node-title">${esc(tipo)}</span>
        <div class="cc-node-actions">${quitar}</div>
      </div>
      <div class="cc-node-body">
        <div class="cc-node-realname">${esc(n.titulo || '—')}</div>
        ${n.subtitulo ? `<span class="cc-node-meta">${esc(n.subtitulo)}</span>` : ''}
      </div>
      ${p.salida}`;
  }

  /* ── Estrategias (izquierda) y nombre en la barra ────────────────────── */

  _pintarEstrategias() {
    const list = document.getElementById('ccStratList');
    if (!list) return;
    const activa = this.tablero?.id;
    const filas = this.tableros.map((s) => `<button type="button" class="cc-strategy-item${s.id === activa ? ' is-active' : ''}" data-strategy-id="${this.escapeHtml(s.id)}" title="${this.escapeHtml(s.nombre)}"${s.id === activa ? ' aria-current="true"' : ''}>
        <i class="aisc-ico aisc-ico--flows cc-strategy-item-ic" aria-hidden="true"></i>
        <span class="cc-strategy-item-name">${this.escapeHtml(s.nombre)}</span>
        ${s.id === activa ? '<i class="aisc-ico cc-strategy-check aisc-ico--check" aria-hidden="true"></i>' : ''}
      </button>`).join('');
    window.Estado.pintar(list, this.tableros.length ? filas : `<div class="cc-strat-empty">${this.escapeHtml(__('Sin estrategias todavía.'))}</div>`);
  }

  _pintarNombre() {
    const input = document.getElementById('ccStratNameInput');
    if (!input || document.activeElement === input) return;
    input.value = this.tablero?.nombre || '';
  }

  async _nuevaEstrategia() {
    // v1: nombre automático «Estrategia N»; se renombra en la barra.
    const nombre = window.MarketingDatos.mapeo.siguienteNombre(__('Estrategia'), this.tableros.map((t) => t.nombre));
    await this._intentar(async () => {
      const t = await window.MarketingDatos.crearTablero(this.orgId, { nombre, market_id: this.tablero?.market_id || null });
      this._marcar(t.id);
      if (!this.tableros.some((x) => x.id === t.id)) this.tableros.push(t);
      await this.abrirTablero(t.id);
      const input = document.getElementById('ccStratNameInput');
      if (input) { input.focus(); input.select(); }
    });
  }

  async _renombrarEstrategia(nombre) {
    if (!this.tablero) return;
    const limpio = String(nombre || '').trim().slice(0, 120);
    if (!limpio || limpio === this.tablero.nombre) { this._pintarNombre(); return; }
    await this._intentar(async () => {
      this._marcar(this.tablero.id);
      const t = await window.MarketingDatos.renombrarTablero(this.tablero.id, limpio);
      this.tablero.nombre = t.nombre;
      this._pintarEstrategias();
      this._pintarNombre();
    });
  }

  /* ── Biblioteca (rail + panel) e inspector ───────────────────────────── */

  static secciones() {
    return [
      { key: 'nodos', label: __('Nodos'), icon: 'flows' },
      { key: 'dashboard', label: __('Dashboard'), icon: 'chart-pie' },
    ];
  }

  _pintarRail() {
    const rail = document.getElementById('ccPanelRail');
    if (!rail) return;
    window.Estado.pintar(rail, MarketingView.secciones().map((s) => {
      const on = this.seccion === s.key && !this.seleccion;
      return `<button type="button" class="cc-rail-btn${on ? ' is-active' : ''}" data-rail-sec="${s.key}" role="tab" aria-selected="${on}" title="${this.escapeHtml(s.label)}" aria-label="${this.escapeHtml(s.label)}"><i class="aisc-ico aisc-ico--${s.icon}" aria-hidden="true"></i></button>`;
    }).join(''));
  }

  /** Rail: un icono abre su sección; otro clic la cierra. Abrir una sección suelta el nodo (v1). */
  _abrirSeccion(key, { forzar = false } = {}) {
    if (this.seleccion) { this.seleccion = null; this.lienzo?.seleccionar(null); }
    this.seccion = forzar ? key : (this.seccion === key ? null : key);
    if (key === 'nodos' && forzar) this.drill = null;
    this._pintarPanel();
  }

  _pintarPanel() {
    const panel = document.getElementById('ccSidebar');
    const cuerpo = document.getElementById('ccPanelBody');
    const titulo = document.getElementById('ccPanelTitle');
    if (!panel || !cuerpo || !titulo) return;
    this._pintarRail();
    if (this.seleccion && this.nodos.has(this.seleccion)) {
      const ins = this._inspector(this.nodos.get(this.seleccion));
      panel.classList.add('cc-fp-open');
      window.Estado.pintar(titulo, ins.titulo);
      window.Estado.pintar(cuerpo, ins.cuerpo);
      if (ins.despues) ins.despues();
      return;
    }
    panel.classList.toggle('cc-fp-open', !!this.seccion);
    if (!this.seccion) { window.Estado.pintar(cuerpo, ''); return; }
    const s = MarketingView.secciones().find((x) => x.key === this.seccion);
    window.Estado.pintar(titulo, `<i class="aisc-ico aisc-ico--${s.icon}" aria-hidden="true"></i> ${this.escapeHtml(s.label)}`);
    if (this.seccion === 'dashboard') {
      window.Estado.pintar(cuerpo, window.Estado.todaviaNo({ titulo: __('Lo que Vera propone y espera tu aprobación'), texto: __('Vera te avisará aquí antes de publicar, pausar o lanzar algo fuera de la plataforma. Llega cuando el borde tenga sus rutas; el resto del lienzo funciona.') }));
      return;
    }
    this._pintarNodos(cuerpo);
  }

  /** Catálogo de tipos de nodo (v1 _nodosCatalog), en lo que la base nueva soporta. */
  _catalogo() {
    const camps = [...this.campanas.values()];
    return [
      { id: 'objetivo-campana', name: __('Objetivo de Campaña'), icon: 'goal', group: __('Objetivos'), count: camps.filter((c) => !this._esReal(c)).length, tipo: 'concepto', desc: __('Ancla de la estrategia; define el propósito al que apunta todo el flujo') },
      { id: 'objetivo-audiencia', name: __('Objetivo de Audiencia'), icon: 'audience', group: __('Objetivos'), count: this.audiencias.size, tipo: 'audiencia', desc: __('El segmento humano que esta estrategia quiere alcanzar') },
      { id: 'campana-real', name: __('Campaña'), icon: 'campaign', group: __('Realidad'), count: camps.filter((c) => this._esReal(c)).length, tipo: 'real', desc: __('Campañas sincronizadas desde Meta, Google u otra plataforma') },
      { id: 'producto', name: __('Producto'), icon: 'product', group: __('Identidades'), tipo: 'product', desc: __('Productos del catálogo de la marca') },
      { id: 'servicio', name: __('Servicio'), icon: 'tag', group: __('Identidades'), tipo: 'service', desc: __('Servicios que ofrece la marca') },
      { id: 'lugar', name: __('Lugar'), icon: 'places', group: __('Identidades'), tipo: 'scenario', desc: __('Locaciones físicas de la marca') },
      { id: 'personaje', name: __('Personaje'), icon: 'characters', group: __('Identidades'), tipo: 'character', desc: __('Personajes de la marca') },
    ];
  }

  async _pintarNodos(cuerpo) {
    const esc = (s) => this.escapeHtml(s);
    const items = this._catalogo();
    const cur = this.drill ? items.find((x) => x.id === this.drill) : null;
    if (!cur) {
      this.drill = null;
      const grupos = new Map();
      for (const it of items) { if (!grupos.has(it.group)) grupos.set(it.group, []); grupos.get(it.group).push(it); }
      let html = '';
      for (const [g, arr] of grupos) {
        html += `<div class="cc-lib-group">${esc(g)}</div>`;
        html += arr.map((it) => `<button type="button" class="cc-nodo-card" data-nodo-drill="${esc(it.id)}" title="${esc(it.name)}">
            <span class="cc-nodo-card-icon"><i class="aisc-ico aisc-ico--${it.icon}" aria-hidden="true"></i></span>
            <span class="cc-nodo-card-text">
              <span class="cc-nodo-card-title">${esc(it.name)}${Number.isFinite(it.count) ? `<span class="cc-nodo-card-count">${it.count}</span>` : ''}</span>
              <span class="cc-nodo-card-desc">${esc(it.desc)}</span>
            </span>
            <i class="aisc-ico aisc-ico--arrow-right cc-nodo-card-arrow" aria-hidden="true"></i>
          </button>`).join('');
      }
      window.Estado.pintar(cuerpo, html);
      return;
    }
    const atras = `<button type="button" class="cc-nodo-back" data-nodo-back><i class="aisc-ico aisc-ico--arrow-left" aria-hidden="true"></i><span>${esc(cur.name)}</span></button>`;
    const arrastre = this.puedeEditar ? ' draggable="true"' : '';
    const pista = this.puedeEditar ? __(' — arrastra al lienzo') : '';
    const lista = (instancias) => (instancias.length
      ? `<div class="cc-nodo-sublist">${instancias.map((it) => `<div class="cc-lib-item cc-nodo-sub-item" role="button" tabindex="0"${arrastre} data-poner="${it.kind}" data-id="${esc(it.id)}" title="${esc(it.name + pista)}">
          <i class="aisc-ico aisc-ico--${cur.icon} cc-lib-item-ic" aria-hidden="true"></i>
          <span class="cc-lib-item-name">${esc(it.name)}</span>
          ${it.sub ? `<span class="cc-lib-item-sub">${esc(it.sub)}</span>` : ''}
        </div>`).join('')}</div>`
      : `<div class="cc-nodo-sublist"><div class="cc-nodo-empty">${esc(__('Sin elementos.'))}</div></div>`);
    if (cur.tipo === 'audiencia') {
      window.Estado.pintar(cuerpo, atras + lista([...this.audiencias.values()].map((a) => ({ id: a.id, kind: 'audience', name: a.nombre || __('Sin nombre'), sub: a.activa ? '' : __('apagada') }))));
      return;
    }
    if (cur.tipo === 'concepto' || cur.tipo === 'real') {
      const real = cur.tipo === 'real';
      window.Estado.pintar(cuerpo, atras + lista([...this.campanas.values()].filter((c) => this._esReal(c) === real)
        .map((c) => ({ id: c.id, kind: 'campaign', name: c.nombre || __('Sin nombre'), sub: MarketingView.estados()[c.estado] || c.estado }))));
      return;
    }
    // Identidades: miniatura + nombre + tipo (v1 cc-nodo-product-item).
    if (!this.elementosCargados.has(cur.tipo)) {
      window.Estado.pintar(cuerpo, `${atras}<div class="cc-nodo-sublist"><div class="cc-lib-loading"><i class="aisc-ico fa-spin aisc-ico--loader" aria-hidden="true"></i> ${esc(__('Cargando…'))}</div></div>`);
      await this._cargarElementosDe([cur.tipo]);
      if (this.drill !== cur.id || this.seleccion) return;
    }
    const els = [...this.elementos.values()].filter((e) => e.kind === cur.tipo);
    const vacios = { product: __('Sin productos.'), service: __('Sin servicios.'), scenario: __('Sin lugares.'), character: __('Sin personajes.') };
    const filas = els.length
      ? els.map((it) => `<div class="cc-lib-item cc-nodo-product-item" role="button" tabindex="0"${arrastre} data-poner="element" data-id="${esc(it.id)}" title="${esc(it.nombre + pista)}">
          <span class="cc-nodo-product-thumb">${it.imagen ? `<img src="${esc(it.imagen)}" alt="" loading="lazy" draggable="false">` : `<i class="aisc-ico aisc-ico--${cur.icon}" aria-hidden="true"></i>`}</span>
          <span class="cc-nodo-product-text">
            <span class="cc-nodo-product-name">${esc(it.nombre)}</span>
            ${it.resumen ? `<span class="cc-nodo-product-type">${esc(it.resumen)}</span>` : ''}
          </span>
        </div>`).join('')
      : `<div class="cc-nodo-empty">${esc(vacios[cur.tipo] || __('Sin elementos.'))}</div>`;
    window.Estado.pintar(cuerpo, `${atras}<div class="cc-nodo-sublist">${filas}</div>`);
  }

  /* ── Inspector (v1 _inspector*) ──────────────────────────────────────── */

  _campoTexto(etiqueta, tipo, campo, valor, o = {}) {
    const esc = (s) => this.escapeHtml(s);
    return `<div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">${esc(etiqueta)}</span><span class="cc-field-type">${esc(tipo)}</span></div>
        <input class="cc-field-input" data-field="${campo}" type="${o.tipo || 'text'}"${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''} value="${esc(valor ?? '')}"${this.puedeEditar ? '' : ' disabled'}>
      </div>`;
  }
  _campoArea(etiqueta, campo, valor, o = {}) {
    const esc = (s) => this.escapeHtml(s);
    return `<div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">${esc(etiqueta)}</span><span class="cc-field-type">str</span></div>
        <textarea class="cc-field-input cc-field-area" data-field="${campo}" rows="${o.filas || 2}"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''}${this.puedeEditar ? '' : ' disabled'}>${esc(valor ?? '')}</textarea>
      </div>`;
  }
  _campoLista(etiqueta, campo, valor, opciones, vacio = null) {
    const esc = (s) => this.escapeHtml(s);
    const ops = (vacio != null ? [['', vacio]] : []).concat(Object.entries(opciones));
    return `<div class="cc-field">
        <div class="cc-field-head"><span class="cc-field-label">${esc(etiqueta)}</span><span class="cc-field-type">str</span></div>
        <select class="cc-field-input cc-field-select" data-field="${campo}"${this.puedeEditar ? '' : ' disabled'}>${ops.map(([v, t]) => `<option value="${esc(v)}"${v === (valor || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </div>`;
  }
  /** Lista como chips con tope (v1: no sobresaturar al modelo). */
  _campoChips(etiqueta, campo, lista, max = 8) {
    const esc = (s) => this.escapeHtml(s);
    const items = Array.isArray(lista) ? lista.filter(Boolean) : [];
    const lleno = items.length >= max;
    const x = this.puedeEditar ? `<button type="button" class="cc-tag-x" aria-label="${esc(__('Quitar'))}">&times;</button>` : '';
    return `<div class="cc-field cc-field--tags" data-field-tags="${campo}" data-max="${max}">
        <div class="cc-field-head"><span class="cc-field-label">${esc(etiqueta)}</span><span class="cc-field-count${lleno ? ' is-max' : ''}">${items.length}/${max}</span></div>
        <div class="cc-tags">
          ${items.map((v) => `<span class="cc-tag" data-val="${esc(v)}">${esc(v)}${x}</span>`).join('')}
          ${this.puedeEditar ? `<input class="cc-tag-input" type="text" placeholder="${esc(lleno ? __('Límite alcanzado') : __('Escribe y Enter'))}" aria-label="${esc(etiqueta)}"${lleno ? ' disabled' : ''}>` : ''}
        </div>
      </div>`;
  }
  _acciones(n, borrar) {
    if (!this.puedeEditar) return '';
    const esc = (s) => this.escapeHtml(s);
    return `<button type="button" class="btn btn--gris btn--sm btn--bloque cc-insp-uncanvas" data-accion="quitar-nodo"><i class="aisc-ico aisc-ico--close" aria-hidden="true"></i> ${esc(__('Quitar del lienzo'))}</button>
      ${borrar ? `<button type="button" class="btn btn--gris btn--peligro btn--sm btn--bloque cc-insp-delete" data-accion="${borrar.accion}"><i class="aisc-ico aisc-ico--delete" aria-hidden="true"></i> ${esc(borrar.texto)}</button>` : ''}`;
  }

  _inspector(n) {
    const esc = (s) => this.escapeHtml(s);
    if (n.kind === 'audience' && this.audiencias.get(n.sujeto_id)) {
      const a = this.audiencias.get(n.sujeto_id);
      const g = new Set(a.generos);
      const check = (v, t) => `<label class="cc-check"><input type="checkbox" data-field="generos" value="${v}"${g.has(v) ? ' checked' : ''}${this.puedeEditar ? '' : ' disabled'}> ${esc(t)}</label>`;
      return {
        titulo: `<i class="aisc-ico aisc-ico--audience" aria-hidden="true"></i> ${esc(a.nombre || __('Objetivo de Audiencia'))}`,
        cuerpo: `<div class="cc-insp-form" data-field-host data-type="audience" data-id="${esc(a.id)}">
          ${this._campoTexto(__('Nombre'), 'str', 'nombre', a.nombre, { placeholder: __('Nombre de la audiencia') })}
          <div class="cc-field">
            <div class="cc-field-head"><span class="cc-field-label">${esc(__('Rango de edades'))}</span><span class="cc-field-type">int</span></div>
            <div class="cc-field-row">
              <input class="cc-field-input" data-field="edad_min" type="number" min="13" max="100" value="${esc(a.edad_min ?? '')}" placeholder="${esc(__('Mín'))}" aria-label="${esc(__('Edad mínima'))}"${this.puedeEditar ? '' : ' disabled'}>
              <span class="cc-field-row-sep">–</span>
              <input class="cc-field-input" data-field="edad_max" type="number" min="13" max="100" value="${esc(a.edad_max ?? '')}" placeholder="${esc(__('Máx'))}" aria-label="${esc(__('Edad máxima'))}"${this.puedeEditar ? '' : ' disabled'}>
            </div>
          </div>
          <div class="cc-field">
            <div class="cc-field-head"><span class="cc-field-label">${esc(__('Objetivos de género'))}</span><span class="cc-field-type">array</span></div>
            <div class="cc-checks">${check('M', __('Hombres'))}${check('F', __('Mujeres'))}<span class="cc-checks-hint">${g.size ? '' : esc(__('vacío = todos'))}</span></div>
          </div>
          ${this._campoLista(__('Nivel de conciencia'), 'conciencia', a.conciencia, MarketingView.conciencia(), __('Sin definir'))}
          ${this._campoArea(__('Descripción'), 'descripcion', a.descripcion, { filas: 3, placeholder: __('Quién es esta audiencia') })}
          ${this._campoChips(__('Dolores'), 'dolores', a.dolores)}
          ${this._campoChips(__('Deseos'), 'deseos', a.deseos)}
          ${this._campoChips(__('Objeciones'), 'objeciones', a.objeciones)}
          ${this._campoChips(__('Gatillos de compra'), 'gatillos', a.gatillos)}
          ${this.puedeEditar ? `<div class="cc-insp-flags">
            <button type="button" class="btn btn--gris btn--sm btn--icono cc-node-toggle cc-toggle-power ${a.activa ? 'is-on' : 'is-off'}" data-accion="alternar-activa" aria-pressed="${a.activa}" title="${esc(a.activa ? __('Apagar') : __('Encender'))}" aria-label="${esc(a.activa ? __('Apagar') : __('Encender'))}"><i class="aisc-ico aisc-ico--idea" aria-hidden="true"></i></button>
          </div>` : ''}
          ${this._acciones(n, { accion: 'borrar-audiencia', texto: __('Eliminar audiencia') })}
        </div>`,
      };
    }
    if (n.kind === 'campaign' && this.campanas.get(n.sujeto_id)) {
      const c = this.campanas.get(n.sujeto_id);
      const real = this._esReal(c);
      const unidas = this.vinculos.filter((v) => v.campaign_id === c.id).map((v) => ({ v, a: this.audiencias.get(v.audience_id) })).filter((x) => x.a);
      const badges = unidas.length ? `<div class="cc-node-badges">${unidas.map(({ v, a }) => `<span class="cc-node-badge cc-node-badge--link"><i class="aisc-ico aisc-ico--link" aria-hidden="true"></i> ${esc(a.nombre)}${v.is_primary ? ` · ${esc(__('principal'))}` : ''}</span>`).join('')}</div>` : '';
      const plataforma = real ? `
          <div class="cc-insp-section"><span class="cc-insp-label">${esc(__('Plataforma'))}</span><span class="cc-insp-value" id="ccInspPlataforma">…</span></div>
          <div class="cc-insp-section"><span class="cc-insp-label">${esc(__('Estado'))}</span><span class="cc-insp-value">${esc(MarketingView.estados()[c.estado] || c.estado)}</span></div>
          <div class="cc-insp-meta"><span class="cc-insp-label">${esc(__('Gasto'))}</span><span class="cc-insp-value">${esc(this._gasto(c))}</span></div>
          <div id="ccInspRendimiento">${window.Estado.cargando('filas', 3)}</div>
          <div class="cc-insp-meta"><span class="cc-insp-label">${esc(__('Objetivo de Audiencia'))}</span><span class="cc-insp-value">${esc(unidas.length ? unidas.map((x) => x.a.nombre).join(', ') : __('Sin audiencia'))}</span></div>
          <div class="cc-insp-hint">${esc(__('Lectura desde la plataforma; los conjuntos y anuncios no se editan aquí.'))}</div>` : '';
      return {
        titulo: `<i class="aisc-ico aisc-ico--${real ? 'campaign' : 'goal'}" aria-hidden="true"></i> ${esc(c.nombre || __('Objetivo de Campaña'))}`,
        cuerpo: `${plataforma}
        <div class="cc-insp-form" data-field-host data-type="campaign" data-id="${esc(c.id)}">
          ${this._campoTexto(__('Nombre'), 'str', 'nombre', c.nombre, { placeholder: __('Nombre de la campaña') })}
          ${badges}
          ${this._campoArea(__('Descripción interna'), 'notas', c.notas || '', { filas: 3, placeholder: __('Objetivo del concepto') })}
          ${this._campoLista(__('Estado'), 'estado', c.estado, MarketingView.estados())}
          ${this._campoLista(__('Objetivo'), 'objetivo', c.objetivo, MarketingView.objetivos())}
          ${this._campoLista(__('Narrativa'), 'narrativa', c.narrativa, MarketingView.narrativas(), __('Sin definir'))}
          ${this._campoTexto(__('Presupuesto total'), 'num', 'presupuesto', c.presupuesto, { tipo: 'number', min: 0 })}
          ${this._campoTexto(__('Moneda'), 'str', 'moneda', c.moneda || '', { placeholder: 'COP' })}
          ${this._campoTexto(__('Inicio'), 'date', 'inicio', c.inicio || '', { tipo: 'date' })}
          ${this._campoTexto(__('Fin'), 'date', 'fin', c.fin || '', { tipo: 'date' })}
          ${this._campoTexto(__('Llamado a la acción'), 'str', 'cta', c.cta)}
          ${this._campoTexto(__('Página de destino'), 'str', 'url', c.url, { tipo: 'url', placeholder: 'https://…' })}
          <div class="cc-insp-hint">${esc(__('El Objetivo es la parte TÉCNICA (plataformas, presupuesto, fechas). La dirección creativa — qué decir y qué producir — vive en el Brief.'))}</div>
          ${window.Estado.todaviaNo({ titulo: __('Publicar en redes y pedir un informe a Vera'), texto: __('Llegan cuando el borde tenga sus rutas. El resto del lienzo funciona.') })}
          ${this._acciones(n, real ? null : { accion: 'borrar-campana', texto: __('Eliminar campaña') })}
          ${real && this.puedeEditar ? `<div class="cc-insp-hint">${esc(__('Tiene entregas en una plataforma: se pausa o se cierra allí, no se borra desde aquí.'))}</div>` : ''}
        </div>`,
        despues: real ? () => this._pintarRendimiento(c.id) : null,
      };
    }
    if (n.kind === 'note') {
      return {
        titulo: `<i class="aisc-ico aisc-ico--brief" aria-hidden="true"></i> ${esc(__('Nota'))}`,
        cuerpo: `${this._tamano(n, 80, 60, 10)}
          <div class="cc-insp-hint">${esc(__('El contenido se edita directamente sobre la nota.'))}</div>
          ${this._acciones(n, null)}`,
      };
    }
    if (n.kind === 'group') {
      const cur = MarketingView.coloresGrupo().includes(n.estilo?.color) ? n.estilo.color : 'blue';
      const nombres = { blue: __('Azul'), green: __('Verde'), purple: __('Morado'), orange: __('Naranja'), red: __('Rojo'), gray: __('Gris') };
      return {
        titulo: `<i class="aisc-ico aisc-ico--layers" aria-hidden="true"></i> ${esc(n.titulo && n.titulo !== '(sin titulo)' ? n.titulo : __('Grupo'))}`,
        cuerpo: `<div class="cc-insp-section">
            <span class="cc-insp-label">${esc(__('Color'))}</span>
            <div class="cc-insp-colors">${MarketingView.coloresGrupo().map((k) => `<button type="button" class="cc-insp-color-btn cc-insp-color-btn--${k}${k === cur ? ' is-on' : ''}" data-color="${k}" aria-pressed="${k === cur}" aria-label="${esc(nombres[k])}"${this.puedeEditar ? '' : ' disabled'}></button>`).join('')}</div>
          </div>
          ${this._tamano(n, 100, 80, 20)}
          <div class="cc-insp-hint">${esc(__('El título se edita en la cabecera del grupo.'))}</div>
          ${this._acciones(n, null)}`,
      };
    }
    if (n.kind === 'element') {
      const e = this.elementos.get(n.sujeto_id);
      const kind = e?.kind || n.subtitulo;
      const RUTA = { product: '/products', service: '/services', character: '/characters', scenario: '/places' };
      const ruta = RUTA[kind] && typeof window.getOrgPathPrefix === 'function' ? `${window.getOrgPathPrefix(this.orgId, window.currentOrgName || '')}${RUTA[kind]}` : null;
      return {
        titulo: `<i class="aisc-ico aisc-ico--${MarketingView.iconoElemento()[kind] || 'product'}" aria-hidden="true"></i> ${esc(e?.nombre || n.titulo || __('Identidad'))}`,
        cuerpo: `<div class="cc-insp-meta"><span class="cc-insp-label">${esc(__('Tipo'))}</span><span class="cc-insp-value">${esc(MarketingView.tiposElemento()[kind] || __('Elemento'))}</span></div>
          ${e?.resumen ? `<div class="cc-insp-meta"><span class="cc-insp-label">${esc(__('Detalle'))}</span><span class="cc-insp-value">${esc(e.resumen)}</span></div>` : ''}
          <div class="cc-insp-hint">${esc(__('Referencia al recurso. La ficha completa se edita en su sección (Productos, Servicios, etc.).'))}${ruta ? ` <a class="cc-insp-link" href="${esc(ruta)}">${esc(__('Abrir en el catálogo →'))}</a>` : ''}</div>
          ${this._acciones(n, null)}`,
      };
    }
    return {
      titulo: `<i class="aisc-ico aisc-ico--document" aria-hidden="true"></i> ${esc(n.titulo || MarketingView.tipos()[n.kind] || '—')}`,
      cuerpo: `<div class="cc-insp-meta"><span class="cc-insp-label">${esc(__('Tipo'))}</span><span class="cc-insp-value">${esc(MarketingView.tipos()[n.kind] || n.kind)}</span></div>
        ${n.subtitulo ? `<div class="cc-insp-meta"><span class="cc-insp-label">${esc(__('Detalle'))}</span><span class="cc-insp-value">${esc(n.subtitulo)}</span></div>` : ''}
        ${this._acciones(n, null)}`,
    };
  }

  _tamano(n, minW, minH, paso) {
    const esc = (s) => this.escapeHtml(s);
    const el = this.lienzo?.els.get(n.id);
    const w = Math.round(n.ancho || el?.offsetWidth || (n.kind === 'group' ? 400 : 220));
    const h = Math.round(n.alto || el?.offsetHeight || (n.kind === 'group' ? 300 : 140));
    return `<div class="cc-insp-section">
        <span class="cc-insp-label">${esc(__('Tamaño (px)'))}</span>
        <div class="cc-insp-row">
          <input class="cc-insp-input" type="number" min="${minW}" step="${paso}" data-insp-field="ancho" aria-label="${esc(__('Ancho'))}" value="${w}"${this.puedeEditar ? '' : ' disabled'}>
          <span class="cc-insp-row-sep">×</span>
          <input class="cc-insp-input" type="number" min="${minH}" step="${paso}" data-insp-field="alto" aria-label="${esc(__('Alto'))}" value="${h}"${this.puedeEditar ? '' : ' disabled'}>
        </div>
      </div>`;
  }

  /** «En la plataforma» (solo lectura): impresiones, clics, conversiones y ROAS de marketing.performance. */
  async _pintarRendimiento(campaignId) {
    let x = this.entregasCache.get(campaignId);
    try {
      if (!x) { x = await window.MarketingDatos.entregas(campaignId); this.entregasCache.set(campaignId, x); }
    } catch (err) {
      const host = document.getElementById('ccInspRendimiento');
      if (host) window.Estado.pintar(host, window.Estado.error({ titulo: __('No se pudieron leer las entregas'), texto: err?.message || '', reintentar: false }));
      return;
    }
    const n = this.nodos.get(this.seleccion);
    if (n?.sujeto_id !== campaignId) return;
    const esc = (s) => this.escapeHtml(s);
    const plat = document.getElementById('ccInspPlataforma');
    const PLAT = { meta: 'Meta', meta_facebook: 'Facebook', meta_instagram: 'Instagram', facebook: 'Facebook', instagram: 'Instagram', google: 'Google Ads', google_ads: 'Google Ads', tiktok: 'TikTok', tiktok_ads: 'TikTok', linkedin: 'LinkedIn', x: 'X' };
    if (plat) plat.textContent = [...new Set(x.entregas.map((d) => PLAT[d.platform] || d.platform).filter(Boolean))].join(', ') || '—';
    const host = document.getElementById('ccInspRendimiento');
    if (!host) return;
    const r = x.rendimiento;
    const meta = (et, v) => `<div class="cc-insp-meta"><span class="cc-insp-label">${esc(et)}</span><span class="cc-insp-value">${esc(v)}</span></div>`;
    const conjuntos = x.entregas.flatMap((d) => d.conjuntos);
    // Texto plano: meta() lo escapa al pintarlo.
    const resumenConjuntos = conjuntos.slice(0, 12).map((s) => (s.name || '—') + ' (' + (s.anuncios.length === 1 ? __('1 anuncio') : __('{n} anuncios', { n: s.anuncios.length })) + ')').join(' · ')
      + (conjuntos.length > 12 ? ' · ' + __('{n} más', { n: conjuntos.length - 12 }) : '');
    window.Estado.pintar(host, `
      ${meta(__('Impresiones'), (r.impresiones || 0).toLocaleString('es-CO'))}
      ${meta(__('Clics'), (r.clics || 0).toLocaleString('es-CO'))}
      ${meta(__('Conversiones'), (r.conversiones || 0).toLocaleString('es-CO'))}
      ${r.roas != null ? meta('ROAS', `${r.roas.toFixed(2)}x`) : ''}
      ${conjuntos.length ? meta(__('Conjuntos de anuncios'), resumenConjuntos) : ''}`);
  }

  /* ── Eventos ─────────────────────────────────────────────────────────── */

  _enlazar() {
    const pagina = document.getElementById('commandCenterPage');
    const panel = document.getElementById('ccSidebar');
    const canvas = document.getElementById('ccCanvas');
    if (!pagina || !panel || !canvas) return;
    this.addEventListener(pagina, 'click', (e) => {
      const menu = document.getElementById('ccReportMenu');
      const opcion = e.target.closest('[data-informe]');
      if (opcion) { this._informe(opcion.getAttribute('data-informe')); return; }
      if (menu && !menu.hidden && !e.target.closest('#ccReportDD')) this._menuInforme(false);
      const b = e.target.closest('[data-accion]');
      if (b && !b.disabled) { this._accion(b.getAttribute('data-accion'), b); return; }
      const q = e.target.closest('[data-quitar-nodo]');
      if (q) { e.stopPropagation(); this._quitarNodo(q.getAttribute('data-quitar-nodo')); return; }
      const est = e.target.closest('[data-strategy-id]');
      if (est) { const id = est.getAttribute('data-strategy-id'); if (id !== this.tablero?.id) this._cambiarEstrategia(id); return; }
      const rail = e.target.closest('[data-rail-sec]');
      if (rail) { this._abrirSeccion(rail.getAttribute('data-rail-sec')); return; }
      if (e.target.closest('[data-nodo-back]')) { this.drill = null; this._pintarPanel(); return; }
      const drill = e.target.closest('[data-nodo-drill]');
      if (drill) { this.drill = drill.getAttribute('data-nodo-drill'); this._pintarPanel(); return; }
      const item = e.target.closest('[data-poner]');
      if (item) { this._ponerDesdeBiblioteca(item.getAttribute('data-poner'), item.getAttribute('data-id')); return; }
      const color = e.target.closest('[data-color]');
      if (color && !color.disabled) { this._colorGrupo(color.getAttribute('data-color')); return; }
      const x = e.target.closest('.cc-tag-x');
      if (x) { const chip = x.closest('.cc-tag'); const cont = chip?.closest('.cc-field--tags'); if (chip && cont) { chip.remove(); this._chipsCambiaron(cont); } }
    });
    // Una imagen que no carga (enlace vencido) deja el marcador de v1, no el ícono roto.
    this.addEventListener(pagina, 'error', (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const caja = img.closest('.cc-prem-image, .cc-nodo-product-thumb');
      if (!caja) return;
      window.Estado.pintar(caja, caja.classList.contains('cc-prem-image')
        ? '<div class="cc-prem-placeholder"><i class="aisc-ico aisc-ico--image" aria-hidden="true"></i></div>'
        : '<i class="aisc-ico aisc-ico--product" aria-hidden="true"></i>');
    }, true);
    this.addEventListener(pagina, 'keydown', (e) => {
      const item = e.target.closest('[data-poner]');
      if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this._ponerDesdeBiblioteca(item.getAttribute('data-poner'), item.getAttribute('data-id')); return; }
      const tag = e.target.closest('.cc-tag-input');
      if (tag) {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this._agregarChip(tag); }
        else if (e.key === 'Backspace' && tag.value === '') {
          const cont = tag.closest('.cc-field--tags'); const chips = cont?.querySelectorAll('.cc-tag');
          if (chips?.length) { chips[chips.length - 1].remove(); this._chipsCambiaron(cont); }
        }
      }
      const rail = e.target.closest('.cc-rail-btn');
      if (rail && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const bs = [...document.querySelectorAll('#ccPanelRail .cc-rail-btn')];
        const i = bs.indexOf(rail);
        bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
      }
    });
    // Nombre de la estrategia: Enter/salir guarda, Esc revierte (v1).
    const nombre = document.getElementById('ccStratNameInput');
    this.addEventListener(nombre, 'keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nombre.blur(); }
      else if (e.key === 'Escape') { nombre.value = this.tablero?.nombre || ''; nombre.blur(); }
    });
    this.addEventListener(nombre, 'blur', () => { if (this.puedeEditar) this._renombrarEstrategia(nombre.value); });
    // Inspector: cada campo se guarda solo (al escribir con pausa; al cambiar, ya).
    this.addEventListener(panel, 'input', (e) => { const f = e.target.closest('[data-field], [data-insp-field]'); if (f && !f.classList.contains('cc-tag-input')) this._programarGuardado(f, false); });
    this.addEventListener(panel, 'change', (e) => { const f = e.target.closest('[data-field], [data-insp-field]'); if (f && !f.classList.contains('cc-tag-input')) this._programarGuardado(f, true); });
    this.addEventListener(panel, 'dragstart', (e) => {
      const item = e.target.closest('[data-poner]');
      if (!item || !e.dataTransfer) return;
      e.dataTransfer.setData('application/x-aisc-marketing', JSON.stringify({ kind: item.getAttribute('data-poner'), id: item.getAttribute('data-id') }));
      e.dataTransfer.effectAllowed = 'copy';
      item.classList.add('cc-camp-row--dragging');
    });
    this.addEventListener(panel, 'dragend', (e) => e.target.closest?.('[data-poner]')?.classList.remove('cc-camp-row--dragging'));
    // Notas y títulos de grupo: se editan en el lienzo y se guardan al salir del campo.
    this.addEventListener(canvas, 'change', (e) => {
      const nota = e.target.closest('[data-nota]');
      if (nota) { this._editarAnotacion(nota.getAttribute('data-nota'), { cuerpo: nota.value }); return; }
      const g = e.target.closest('[data-grupo]');
      if (g) this._editarAnotacion(g.getAttribute('data-grupo'), { titulo: g.value });
    });
    this.addEventListener(document, 'keydown', (e) => this._tecla(e));
  }

  _tecla(e) {
    if (!document.getElementById('commandCenterPage')) return;
    const escribiendo = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (escribiendo || document.querySelector('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this._rehacer(); else this._deshacer(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this._rehacer(); return; }
    if (e.key === 'Escape') { this._menuInforme(false); this.lienzo?.seleccionar(null); this._seleccionar(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.puedeEditar && this.seleccion) { e.preventDefault(); this._quitarNodo(this.seleccion); }
  }

  _accion(a, boton) {
    const acciones = {
      'crear-audiencia': () => this._crearAudiencia(),
      'crear-campana': () => this._crearCampana(),
      'crear-nota': () => this._crearAnotacion('note'),
      'crear-grupo': () => this._crearAnotacion('group'),
      'informe': () => this._menuInforme(document.getElementById('ccReportMenu')?.hidden),
      'reorganizar': () => this._reorganizar(),
      'alejar': () => this.lienzo?.zoom(1 / 1.2),
      'acercar': () => this.lienzo?.zoom(1.2),
      'encajar': () => this.lienzo?.encajar(),
      'nueva-estrategia': () => this._nuevaEstrategia(),
      'cerrar-panel': () => { this.seleccion = null; this.lienzo?.seleccionar(null); this.seccion = null; this._pintarPanel(); },
      'quitar-nodo': () => this.seleccion && this._quitarNodo(this.seleccion),
      'borrar-audiencia': () => this._borrarSujeto('audience'),
      'borrar-campana': () => this._borrarSujeto('campaign'),
      'alternar-activa': () => this._alternarActiva(boton),
    };
    if (acciones[a]) acciones[a]();
  }

  _menuInforme(abrir) {
    const menu = document.getElementById('ccReportMenu');
    const btn = document.getElementById('ccBtnReport');
    if (!menu) return;
    menu.hidden = !abrir;
    btn?.setAttribute('aria-expanded', String(!!abrir));
  }

  /** «Crear informe»: el informe con Vera todavía no tiene ruta en el borde (se dice con palabras). */
  _informe() {
    this._menuInforme(false);
    const c = window.Capas.abrir({ forma: 'principal', titulo: __('Informe') });
    const caja = document.createElement('div');
    window.Estado.pintar(caja, window.Estado.todaviaNo({ titulo: __('Informes con Vera'), texto: __('Vera todavía no escribe informes del lienzo desde la base nueva: llega cuando el borde tenga su ruta. El resto del lienzo funciona.') }));
    c.cuerpo.append(caja);
  }

  /** Corre una escritura; si falla, lo dice con palabras (toast) y devuelve null. */
  async _intentar(fn) {
    try { return await fn(); } catch (err) {
      console.warn('[marketing]', err?.code || '', err?.message || err);
      window.showToast?.(err?.message || __('No se pudo guardar.'), { type: 'error' });
      return null;
    }
  }

  /* ── Realtime: otra persona en el mismo lienzo ───────────────────────── */

  /** Anota que ESTE navegador acaba de escribir `id` (su eco de Realtime se ignora). */
  _marcar(...ids) { const t = Date.now(); for (const id of ids) if (id) this.propias.set(id, t); }
  _esPropio(id) { const t = this.propias.get(id); return !!t && Date.now() - t < 4000; }

  async _escuchar() {
    this._dejarDeEscuchar();
    if (!this.tablero) return;
    const boardId = this.tablero.id;
    this.apagarRealtime = await window.MarketingDatos.escuchar(this.orgId, boardId,
      (c) => { if (this.tablero?.id === boardId) this._cambioRemoto(c); },
      (estado) => {
        if (this.tablero?.id !== boardId) return;
        if (estado === 'vivo') this._pararSondeo();
        else this._sondear();
      });
  }

  _dejarDeEscuchar() {
    if (this.apagarRealtime) { this.apagarRealtime(); this.apagarRealtime = null; }
    this._pararSondeo();
  }

  /** Respaldo SOLO si la suscripción falla: relee el lienzo cada 30 s y concilia. */
  _sondear() {
    if (this.sondeo) return;
    this.sondeo = setInterval(async () => {
      if (!this.tablero || document.hidden) return;
      try {
        const { nodos, aristas } = await window.MarketingDatos.lienzo(this.tablero.id);
        this._conciliar(nodos, aristas);
      } catch (err) { console.warn('[marketing] sondeo:', err?.message); }
    }, 30000);
  }
  _pararSondeo() { if (this.sondeo) { clearInterval(this.sondeo); this.sondeo = null; } }

  _conciliar(nodos, aristas) {
    const vivos = new Set(nodos.map((n) => n.id));
    for (const id of [...this.nodos.keys()]) if (!vivos.has(id) && !this._esPropio(id)) this._quitarNodoLocal(id);
    for (const n of nodos) this._aplicarNodoRemoto(n);
    const ids = new Set(aristas.map((a) => a.id));
    this.aristas = this.aristas.filter((a) => ids.has(a.id) || this._esPropio(a.id));
    for (const a of aristas) if (!this.aristas.some((x) => x.id === a.id)) this.aristas.push(a);
    this._redibujarAristas();
  }

  /** Nodo que llega de otra persona: lo pone o lo actualiza si algo cambió de verdad. */
  _aplicarNodoRemoto(n) {
    const ya = this.nodos.get(n.id);
    if (ya) {
      const igual = ya.x === n.x && ya.y === n.y && (ya.ancho ?? null) === (n.ancho ?? null) && (ya.alto ?? null) === (n.alto ?? null)
        && (ya.cuerpo || '') === (n.cuerpo || '') && (ya.titulo || '') === (n.titulo || '') && JSON.stringify(ya.estilo || {}) === JSON.stringify(n.estilo || {});
      if (igual) return;
      const soloPosicion = (ya.cuerpo || '') === (n.cuerpo || '') && (ya.titulo || '') === (n.titulo || '') && JSON.stringify(ya.estilo || {}) === JSON.stringify(n.estilo || {});
      Object.assign(ya, { x: n.x, y: n.y, ancho: n.ancho, alto: n.alto, cuerpo: n.cuerpo, titulo: n.titulo || ya.titulo, estilo: n.estilo });
      const el = this.lienzo?.els.get(n.id);
      const editando = el && el.contains(document.activeElement);
      if (soloPosicion || editando) this.lienzo?.moverNodo(n.id, n.x, n.y, n.ancho, n.alto);
      else this.lienzo?.ponerNodo(ya);
      if (this.seleccion === n.id && !editando) this._pintarPanel();
      return;
    }
    this.nodos.set(n.id, n);
    this.lienzo?.ponerNodo(n);
    this._vacio();
  }

  async _cambioRemoto(c) {
    if (c.tabla === 'boards') {
      if (c.tipo === 'baja') {
        if (!this.tableros.some((t) => t.id === c.id)) return;
        this.tableros = this.tableros.filter((t) => t.id !== c.id);
        if (this.tablero?.id === c.id) { if (this.tableros[0]) await this.abrirTablero(this.tableros[0].id); else this._sinTableros(); }
        else this._pintarEstrategias();
        return;
      }
      const t = this.tableros.find((x) => x.id === c.id);
      if (!t) { this.tableros.push(c.fila); this._pintarEstrategias(); return; }
      if (t.nombre !== c.fila.nombre && !this._esPropio(c.id)) { t.nombre = c.fila.nombre; this._pintarEstrategias(); this._pintarNombre(); }
      return;
    }
    if (c.tabla === 'board_edges') {
      if (c.tipo === 'baja') {
        if (!this.aristas.some((a) => a.id === c.id)) return;
        this.aristas = this.aristas.filter((a) => a.id !== c.id);
        this._redibujarAristas();
      } else if (c.board_id === this.tablero?.id && !this.aristas.some((a) => a.id === c.id)) {
        this.aristas.push(c.fila);
        this._redibujarAristas();
      }
      return;
    }
    // board_nodes
    if (c.tipo === 'baja') { if (this.nodos.has(c.id)) this._quitarNodoLocal(c.id); return; }
    if (c.board_id !== this.tablero?.id) return;
    if (this._esPropio(c.id) && this.nodos.has(c.id)) return;
    if (c.tipo === 'alta' && this.nodos.has(c.id)) return;
    // Una fila de board_nodes no trae el título resuelto: si es nueva, se lee de board_view.
    let n = c.fila;
    if (!this.nodos.has(c.id)) {
      n = (await window.MarketingDatos.nodo(c.id).catch(() => null)) || n;
      if (n.kind === 'element') await this._cargarElementosDe([n.subtitulo]);
      if (this.nodos.has(c.id)) return;
    } else {
      n = { ...c.fila, titulo: c.fila.titulo || this.nodos.get(c.id).titulo, subtitulo: this.nodos.get(c.id).subtitulo };
    }
    this._aplicarNodoRemoto(n);
    this._redibujarAristas();
  }

  /* ── Historial (deshacer / rehacer, Ctrl+Z / Ctrl+Y) ─────────────────── */

  /** Un nodo que se quitó y volvió tiene otro id: el alias lleva del viejo al actual. */
  _r(id) { let x = id; const vistos = new Set(); while (this.alias.has(x) && !vistos.has(x)) { vistos.add(x); x = this.alias.get(x); } return x; }

  _registrar(paso) {
    this.atras.push(paso);
    if (this.atras.length > 60) this.atras.shift();
    this.adelante = [];
  }

  async _deshacer() {
    const p = this.atras.pop();
    if (!p || this.ocupado) { if (p) this.atras.push(p); return; }
    this.ocupado = true;
    const ok = await this._intentar(async () => { await p.deshacer(); return true; });
    this.ocupado = false;
    if (ok) this.adelante.push(p);
  }

  async _rehacer() {
    const p = this.adelante.pop();
    if (!p || this.ocupado) { if (p) this.adelante.push(p); return; }
    this.ocupado = true;
    const ok = await this._intentar(async () => { await p.rehacer(); return true; });
    this.ocupado = false;
    if (ok) this.atras.push(p);
  }

  _olvidarHistorial() { this.atras = []; this.adelante = []; }

  /* ── Gestos del lienzo ───────────────────────────────────────────────── */

  /** Elegir un nodo abre su inspector en el panel derecho; el rail queda sin sección (v1). */
  _seleccionar(id) {
    this.seleccion = id;
    if (id) this.seccion = null;
    this._pintarPanel();
  }

  async _mover(despues, antes) {
    const aplicar = async (lista) => {
      const reales = lista.map((c) => ({ ...c, id: this._r(c.id) })).filter((c) => this.nodos.has(c.id));
      this._marcar(...reales.map((c) => c.id));
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
    this._marcar(n.id);
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
      deshacer: async () => { const id = this._r(origen); this._marcar(id); await window.MarketingDatos.quitarNodo(id); this._quitarNodoLocal(id); },
      rehacer: async () => { const nuevo = await this._crearNodoAhora({ ...datos, x: n.x, y: n.y }); this.alias.set(this._r(origen), nuevo.id); },
    });
    if (seleccionar) { this.lienzo?.seleccionar(n.id); this._seleccionar(n.id); }
    return n;
  }

  async _ponerDesdeBiblioteca(kind, id, punto = null, sobre = null) {
    const ya = [...this.nodos.values()].find((n) => n.sujeto_id === id);
    if (ya) {
      this.lienzo?.centrarEn(ya.id); this.lienzo?.seleccionar(ya.id); this.lienzo?.destellar(ya.id); this._seleccionar(ya.id);
      if (sobre) this._conectar(ya, sobre);
      return;
    }
    if (!this.puedeEditar) return;
    // v1: el clic suelta el nodo en el centro visible del lienzo.
    const c = this.lienzo?.centroMundo() || { x: 400, y: 200 };
    const pos = punto ? { x: Math.round(punto.x), y: Math.round(punto.y) } : { x: Math.round(Math.max(0, c.x - 110)), y: Math.round(Math.max(0, c.y - 20)) };
    const n = await this._poner({ kind, sujeto_id: id, x: pos.x, y: pos.y });
    if (!n) return;
    if (kind === 'element') await this._cargarElementosDe([n.subtitulo]).then(() => this.lienzo?.ponerNodo(n));
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
    this._marcar(id, ...suyas.map((a) => a.id));
    const ok = await this._intentar(async () => { await window.MarketingDatos.quitarNodo(id); return true; });
    if (!ok) return;
    this._quitarNodoLocal(id);
    const datos = { kind: n.kind, sujeto_id: n.sujeto_id, x: n.x, y: n.y, cuerpo: n.kind === 'note' ? n.cuerpo : undefined, titulo: n.kind === 'group' ? n.titulo : undefined, ancho: n.ancho, alto: n.alto, estilo: n.estilo };
    const origen = id;
    this._registrar({
      deshacer: async () => {
        const nuevo = await this._crearNodoAhora(datos);
        this.alias.set(this._r(origen), nuevo.id);
        for (const a of suyas) {
          const e = await window.MarketingDatos.crearArista(this.orgId, this.tablero.id, this._r(a.desde), this._r(a.hasta), a.etiqueta);
          this._marcar(e.id);
          this.alias.set(a.id, e.id);
          if (!this.aristas.some((x) => x.id === e.id)) this.aristas.push(e);
        }
        this._redibujarAristas();
      },
      rehacer: async () => { const actual = this._r(origen); this._marcar(actual); await window.MarketingDatos.quitarNodo(actual); this._quitarNodoLocal(actual); },
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
    this._marcar(e.id);
    if (!this.aristas.some((x) => x.id === e.id)) this.aristas.push(e);
    this._redibujarAristas();
    const origen = e.id;
    this._registrar({
      deshacer: async () => { const id = this._r(origen); this._marcar(id); await M.quitarArista(id); this.aristas = this.aristas.filter((x) => x.id !== id); this._redibujarAristas(); },
      rehacer: async () => { const n = await M.crearArista(this.orgId, this.tablero.id, this._r(a.id), this._r(b.id)); this._marcar(n.id); this.alias.set(this._r(origen), n.id); this.aristas.push(n); this._redibujarAristas(); },
    });
  }

  async _quitarArista(a) {
    const M = window.MarketingDatos;
    if (a.tipo === 'vinculo') { await this._desvincular(a.campaign_id, a.audience_id); return; }
    this._marcar(a.id);
    const ok = await this._intentar(async () => { await M.quitarArista(a.id); return true; });
    if (!ok) return;
    this.aristas = this.aristas.filter((x) => x.id !== a.id);
    this._redibujarAristas();
    const origen = a.id;
    this._registrar({
      deshacer: async () => { const n = await M.crearArista(this.orgId, this.tablero.id, this._r(a.desde), this._r(a.hasta), a.etiqueta); this._marcar(n.id); this.alias.set(this._r(origen), n.id); this.aristas.push(n); this._redibujarAristas(); },
      rehacer: async () => { const id = this._r(origen); this._marcar(id); await M.quitarArista(id); this.aristas = this.aristas.filter((x) => x.id !== id); this._redibujarAristas(); },
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
    this._trasVinculo(campaignId, audienceId);
  }

  _trasVinculo(campaignId, audienceId) {
    this._redibujarAristas();
    this._repintarSujeto(campaignId);
    this._repintarSujeto(audienceId);
    if (this.seleccion) this._pintarPanel();
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

  async _cambiarEstrategia(id) {
    await this._intentar(() => this.abrirTablero(id));
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
    const i = document.querySelector('#ccPanelBody [data-field="nombre"]');
    if (i) { i.focus(); i.select(); }
  }

  /** Nota y grupo nacen en el centro visible del lienzo (v1: 220×140 y 400×300). */
  async _crearAnotacion(kind) {
    if (!this.lienzo || !this.tablero) return;
    const c = this.lienzo.centroMundo();
    const datos = kind === 'group'
      ? { kind, x: Math.round(Math.max(0, c.x - 200)), y: Math.round(Math.max(0, c.y - 150)), ancho: 400, alto: 300, titulo: '', estilo: { color: 'blue' } }
      : { kind, x: Math.round(Math.max(0, c.x - 110)), y: Math.round(Math.max(0, c.y - 20)), ancho: 220, alto: 140, cuerpo: '' };
    const n = await this._poner(datos);
    if (!n) return;
    requestAnimationFrame(() => this.lienzo?.els.get(n.id)?.querySelector(kind === 'note' ? 'textarea' : 'input')?.focus());
  }

  async _editarAnotacion(id, cambios) {
    const n = this.nodos.get(id);
    if (!n || !this.puedeEditar) return;
    this._marcar(id);
    const ok = await this._intentar(async () => { await window.MarketingDatos.editarNodo(id, cambios); return true; });
    if (!ok) return;
    if (cambios.cuerpo !== undefined) n.cuerpo = cambios.cuerpo;
    if (cambios.titulo !== undefined) n.titulo = cambios.titulo;
    if (cambios.estilo !== undefined) n.estilo = cambios.estilo;
    if (cambios.titulo !== undefined && this.seleccion === id) {
      const t = document.getElementById('ccPanelTitle');
      if (t) window.Estado.pintar(t, `<i class="aisc-ico aisc-ico--layers" aria-hidden="true"></i> ${this.escapeHtml(n.titulo || __('Grupo'))}`);
    }
  }

  async _colorGrupo(color) {
    const n = this.nodos.get(this.seleccion);
    if (!n || n.kind !== 'group' || !MarketingView.coloresGrupo().includes(color)) return;
    const estilo = { ...(n.estilo || {}), color };
    await this._editarAnotacion(n.id, { estilo });
    this.lienzo?.ponerNodo(n);
    document.querySelectorAll('#ccPanelBody [data-color]').forEach((b) => {
      b.classList.toggle('is-on', b.getAttribute('data-color') === color);
      b.setAttribute('aria-pressed', String(b.getAttribute('data-color') === color));
    });
  }

  /* ── Guardar el inspector ────────────────────────────────────────────── */

  _programarGuardado(control, ya) {
    const clave = `${this.seleccion}:${control.getAttribute('data-field') || control.getAttribute('data-insp-field')}`;
    clearTimeout(this.guardados.get(clave));
    const correr = () => { this.guardados.delete(clave); this._guardarCampo(control); };
    if (ya) correr(); else this.guardados.set(clave, setTimeout(correr, 600));
  }

  _agregarChip(input) {
    const cont = input.closest('.cc-field--tags');
    if (!cont) return;
    const max = Number(cont.getAttribute('data-max')) || 8;
    const chips = [...cont.querySelectorAll('.cc-tag')];
    const val = String(input.value || '').trim();
    if (!val || chips.length >= max) { input.value = ''; return; }
    if (chips.some((t) => (t.getAttribute('data-val') || '').toLowerCase() === val.toLowerCase())) { input.value = ''; return; }
    const chip = document.createElement('span');
    chip.className = 'cc-tag';
    chip.setAttribute('data-val', val);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'cc-tag-x'; x.setAttribute('aria-label', __('Quitar')); x.textContent = '×';
    chip.append(document.createTextNode(val), x);
    input.before(chip);
    input.value = '';
    this._chipsCambiaron(cont);
    if (cont.querySelectorAll('.cc-tag').length < max) input.focus();
  }

  /** Cuenta, tope y guardado de un campo de chips (v1 _commitTags). */
  _chipsCambiaron(cont) {
    const max = Number(cont.getAttribute('data-max')) || 8;
    const vals = [...cont.querySelectorAll('.cc-tag')].map((t) => t.getAttribute('data-val'));
    const lleno = vals.length >= max;
    const cuenta = cont.querySelector('.cc-field-count');
    if (cuenta) { cuenta.textContent = `${vals.length}/${max}`; cuenta.classList.toggle('is-max', lleno); }
    const input = cont.querySelector('.cc-tag-input');
    if (input) { input.disabled = lleno; input.placeholder = lleno ? __('Límite alcanzado') : __('Escribe y Enter'); }
    const host = cont.closest('[data-field-host]');
    if (host) this._guardar(host, { [cont.getAttribute('data-field-tags')]: vals }, cont.querySelector('.cc-tags'));
  }

  async _guardarCampo(control) {
    if (!this.puedeEditar) return;
    const insp = control.getAttribute('data-insp-field');
    if (insp) { await this._guardarTamano(control, insp); return; }
    const host = control.closest('[data-field-host]');
    if (!host) return;
    const campo = control.getAttribute('data-field');
    const valor = (c) => host.querySelector(`[data-field="${c}"]`)?.value;
    const cambios = {};
    // Los pares se guardan juntos: la base valida uno contra el otro.
    if (['presupuesto', 'moneda'].includes(campo)) { cambios.presupuesto = valor('presupuesto'); cambios.moneda = valor('moneda'); }
    else if (['inicio', 'fin'].includes(campo)) { cambios.inicio = valor('inicio'); cambios.fin = valor('fin'); }
    else if (['edad_min', 'edad_max'].includes(campo)) { cambios.edad_min = valor('edad_min'); cambios.edad_max = valor('edad_max'); }
    else if (campo === 'generos') cambios.generos = [...host.querySelectorAll('[data-field="generos"]')].filter((x) => x.checked).map((x) => x.value);
    else cambios[campo] = control.value;
    await this._guardar(host, cambios, control);
  }

  /** Guarda en la base con el estado del campo (guardando → guardado / inválido, v1). */
  async _guardar(host, cambios, indicador) {
    const sujeto = host.getAttribute('data-type');
    const id = host.getAttribute('data-id');
    const M = window.MarketingDatos;
    indicador?.classList.remove('cc-field--invalid', 'cc-field--saved');
    indicador?.classList.add('cc-field--saving');
    let r;
    try {
      r = sujeto === 'audience' ? await M.editarAudiencia(id, cambios) : await M.editarCampana(id, cambios);
    } catch (err) {
      indicador?.classList.remove('cc-field--saving');
      indicador?.classList.add('cc-field--invalid');
      window.showToast?.(err?.message || __('No se pudo guardar.'), { type: 'error' });
      return;
    }
    indicador?.classList.remove('cc-field--saving');
    if (!r) return;
    indicador?.classList.add('cc-field--saved');
    setTimeout(() => indicador?.classList.remove('cc-field--saved'), 900);
    if (sujeto === 'audience') this.audiencias.set(id, r); else { this.campanas.set(id, r); this.entregasCache.delete(id); }
    this._repintarSujeto(id);
    if ('nombre' in cambios) {
      const t = document.getElementById('ccPanelTitle');
      const icono = sujeto === 'audience' ? 'audience' : (this._esReal(r) ? 'campaign' : 'goal');
      if (t) window.Estado.pintar(t, `<i class="aisc-ico aisc-ico--${icono}" aria-hidden="true"></i> ${this.escapeHtml(r.nombre)}`);
    }
    if (sujeto === 'audience' && 'generos' in cambios) {
      const hint = host.querySelector('.cc-checks-hint');
      if (hint) hint.textContent = r.generos.length ? '' : __('vacío = todos');
    }
  }

  async _guardarTamano(control, campo) {
    const n = this.nodos.get(this.seleccion);
    if (!n || !['note', 'group'].includes(n.kind)) return;
    const min = n.kind === 'group' ? { ancho: 100, alto: 80 } : { ancho: 80, alto: 60 };
    let v = Number(control.value);
    if (!Number.isFinite(v)) return;
    v = Math.max(min[campo], Math.round(v));
    const antes = [{ id: n.id, x: n.x, y: n.y, ancho: n.ancho, alto: n.alto }];
    const despues = [{ id: n.id, x: n.x, y: n.y, ancho: campo === 'ancho' ? v : (n.ancho || this.lienzo?.els.get(n.id)?.offsetWidth), alto: campo === 'alto' ? v : (n.alto || this.lienzo?.els.get(n.id)?.offsetHeight) }];
    await this._mover(despues, antes);
  }

  async _alternarActiva(boton) {
    const n = this.nodos.get(this.seleccion);
    const a = n && this.audiencias.get(n.sujeto_id);
    if (!a) return;
    const host = boton.closest('[data-field-host]');
    await this._guardar(host, { activa: !a.activa }, null);
    const r = this.audiencias.get(a.id);
    boton.classList.toggle('is-on', r.activa);
    boton.classList.toggle('is-off', !r.activa);
    boton.setAttribute('aria-pressed', String(r.activa));
    const t = r.activa ? __('Apagar') : __('Encender');
    boton.title = t; boton.setAttribute('aria-label', t);
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
    for (const x of this.nodos.values()) if (x.sujeto_id === reg.id) this._marcar(x.id);
    const hecho = await this._intentar(async () => { if (esAud) await M.borrarAudiencia(reg.id); else await M.borrarCampana(reg.id); return true; });
    if (!hecho) return;
    // La base se lleva en cascada sus nodos (de todas las estrategias) y sus vínculos.
    (esAud ? this.audiencias : this.campanas).delete(reg.id);
    this.vinculos = this.vinculos.filter((v) => (esAud ? v.audience_id : v.campaign_id) !== reg.id);
    for (const x of [...this.nodos.values()]) if (x.sujeto_id === reg.id) this._quitarNodoLocal(x.id);
    this._olvidarHistorial();
    window.showToast?.(esAud ? __('Audiencia eliminada.') : __('Campaña eliminada.'));
  }

  async onLeave() {
    for (const t of this.guardados.values()) clearTimeout(t);
    this.guardados.clear();
    this._dejarDeEscuchar();
    if (this.lienzo) { this.lienzo.destruir(); this.lienzo = null; }
    try { window.appNavigation?.restoreFromImmersive?.(); } catch (_) { /* sin shell */ }
    this.cleanup();
  }
}

window.MarketingView = MarketingView;
