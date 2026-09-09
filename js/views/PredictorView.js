/**
 * PredictorView — el Predictor: simular al público antes de gastar en él.
 *
 * Le das un movimiento que quieres probar (un precio, un lanzamiento, un
 * mensaje) y el motor arma agentes desde el ADN y las audiencias reales de la
 * marca, los deja interactuar por rondas y devuelve un veredicto con señales.
 *
 * ── LA MESA: tres piezas mirando la misma lista desde sitios distintos ──────
 * Estructura portada del Simulador de accounts-arde, que resolvió antes este
 * mismo problema:
 *
 *   IZQUIERDA  el HISTORIAL — lo que ya preguntamos
 *   DERECHA    los INPUTS — lo que vamos a preguntar (o la corrida abierta)
 *   CENTRO     el LIENZO — lo que contestó el público
 *
 * Y en ese orden porque se lee de izquierda a derecha: primero lo que ya
 * preguntamos, después lo que vamos a preguntar. Al revés, la mesa invita a
 * lanzar una corrida de media hora sin mirar si ya la hicimos.
 *
 * LAS TRES ZONAS ESTÁN SIEMPRE, Y A LA VEZ. El panel derecho NO cambia de
 * estado: es el panel de predicción y punto. Abrir una corrida vieja cambia lo
 * que enseña el centro, no lo que hay a la derecha — así se puede mirar el mapa
 * de una corrida anterior mientras se compone la siguiente, que es justo cuando
 * se compara. Y de paso desaparece el riesgo de que abrir una corrida borre lo
 * que estabas escribiendo.
 *
 * POR ESO LA CORRIDA VIVE EN EL CENTRO. El lienzo ya tenía dos caras (Mapa e
 * Informe); Semilla y Publicaron son dos más. Todo lo que una corrida tiene que
 * enseñar está en el mismo sitio, y el lado derecho queda libre para lo único
 * que se hace con las manos: lanzar la siguiente.
 *
 * ── ARQUITECTURA: por qué esta vista es de dos velocidades ─────────────────
 * Una corrida tarda minutos u horas. Lanzarla es un POST corto a
 * /api/predictor/run (que solo registra la fila y levanta el proceso); el
 * resultado NO se espera: la corrida se reporta sola a `predictor_runs` y aquí
 * se sondea esa tabla. Por eso el lanzamiento va por función y la lectura va
 * directo a Supabase con la RLS de la tabla.
 *
 * Honestidad de lectura: un veredicto es orientación informada, no una
 * predicción exacta, y la vista lo dice donde el usuario lo va a leer. Una
 * corrida fallida se muestra como fallida — nunca se maquilla como resultado
 * flojo.
 */
class PredictorView extends BaseView {
  static cacheable = true;
  static get documentTitle() { return __('Simulador'); }

  /** Cada cuánto se re-consulta mientras haya corridas vivas. */
  static SONDEO_MS = 15000;

  /**
   * El avance real de una corrida, en el orden en que lo escribe el corredor.
   * Se indexa por `etapa`; `pendiente` es el estado de la fila recién creada,
   * antes de que el motor escriba su primera etapa.
   */
  static PASO = {
    pendiente:  { texto: 'En cola',                      avance: 0.05 },
    ontologia:  { texto: 'Leyendo la semilla',           avance: 0.18 },
    grafo:      { texto: 'Construyendo el mundo',        avance: 0.35 },
    perfiles:   { texto: 'Creando los agentes',          avance: 0.50 },
    simulacion: { texto: 'El público está reaccionando', avance: 0.72 },
    reporte:    { texto: 'Redactando el veredicto',      avance: 0.90 },
  };

  /** El vocabulario del selector, para no escupir el valor crudo de la base. */
  static ESCENARIO = { parallel: 'Ambos', twitter: 'Tipo X', reddit: 'Tipo Reddit' };

  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.datos = null;        // PredictorDataService
    this.corridas = [];
    this.cargado = false;
    this.selId = null;        // qué corrida se está mirando
    this.detalles = new Map();// id -> fila completa (se pide al abrir, pesa)
    this.cara = null;         // { id, cara: 'mapa'|'informe' } — viaja con su corrida
    this._sondeo = null;
    this._mapa = null;
    this._abrioSola = false;
  }

  // ══════════════════════════════════════════════════════════════════════
  // El armazón. Se pinta UNA vez; después solo se repintan las tres zonas.
  // ══════════════════════════════════════════════════════════════════════
  renderHTML() {
    return `
<div class="pred-page" id="predPage">
  <!-- El escenario: radial de marca + puntitos en .pred-page, velo y grano
       aquí. Es una capa fija — no scrollea — para que la atmósfera se quede
       quieta mientras el contenido pasa por delante. -->
  <div class="pred-veil" aria-hidden="true"></div>

  <div class="pred-mesa">

    <!-- ════ CENTRO: EL LIENZO ════
         Va primero en el DOM porque en teléfono la columna abre por él: los
         paneles son controles y el lienzo es el trabajo. -->
    <section class="pred-lienzo" id="predLienzo" aria-live="polite"></section>

    <!-- ════ IZQUIERDA: EL HISTORIAL ════ -->
    <aside class="pred-panel pred-panel--izq" aria-label="${__('Historial de simulaciones')}">
      <header class="pred-panel-cabeza">
        <div class="pred-panel-titulos">
          <b class="pred-panel-rotulo">${__('Historial')}</b>
          <p class="pred-panel-nota" id="predConteo">${__('Leyendo…')}</p>
        </div>
      </header>
      <div class="pred-panel-cuerpo" id="predLista"></div>
    </aside>

    <!-- ════ DERECHA: INPUTS · CORRIDA ════ -->
    <aside class="pred-panel pred-panel--der" aria-label="${__('Nueva simulación')}">

      <div class="pred-inputs">
        <header class="pred-panel-cabeza">
          <div class="pred-panel-titulos">
            <b class="pred-panel-rotulo">${__('Simular')}</b>
            <p class="pred-panel-nota">${__('Un enjambre de agentes reacciona como reaccionaría tu público.')}</p>
          </div>
        </header>

        <div class="pred-panel-cuerpo">
          <label class="pred-campo">
            <span class="pred-label">${__('¿Qué quieres simular?')}</span>
            <textarea id="predPregunta" class="pred-input pred-input--area" rows="4"
              placeholder="${__('Ej: ¿cómo reaccionaría nuestro público si subimos el precio un 20%?')}"></textarea>
          </label>

          <label class="pred-campo">
            <span class="pred-label">${__('El movimiento concreto')} <span class="pred-opcional">${__('(opcional)')}</span></span>
            <textarea id="predContexto" class="pred-input pred-input--area" rows="4"
              placeholder="${__('El precio nuevo, el producto que lanzas, el mensaje que vas a usar.')}"></textarea>
          </label>

          <label class="pred-campo">
            <span class="pred-label">${__('Título')}</span>
            <input id="predTitulo" class="pred-input" type="text" placeholder="${__('Para reconocerla después')}">
          </label>

          <div class="pred-duo">
            <label class="pred-campo pred-campo--mitad">
              <span class="pred-label">${__('Rondas')}</span>
              <select id="predRondas" class="pred-input">
                <option value="3">3</option>
                <option value="5" selected>5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </label>
            <label class="pred-campo pred-campo--mitad">
              <span class="pred-label">${__('Escenario')}</span>
              <select id="predPlataforma" class="pred-input">
                <option value="parallel" selected>${__('Ambos')}</option>
                <option value="twitter">${__('Tipo X')}</option>
                <option value="reddit">${__('Tipo Reddit')}</option>
              </select>
            </label>
          </div>

          <p class="pred-error" id="predError" hidden></p>
          <!-- El precio se dice ANTES, no despues: es el patron de
               transparencia de la plataforma (feature_costs). Se rellena al
               cargar; el texto de arranque no promete una cifra que todavia no
               se ha leido. OJO: nada de backticks aqui dentro, esto vive en un
               template literal y una comilla invertida parte la cadena. -->
          <p class="pred-precio" id="predPrecio">${__('Consultando el costo…')}</p>
        </div>

        <!-- El pie no scrollea: sobre un panel largo, lanzar es lo único que no
             se puede perder de vista. -->
        <footer class="pred-panel-pie">
          <button id="predLanzarBtn" class="pred-btn pred-btn--primario" type="button">
            ${__('Lanzar simulación')}
          </button>
          <p class="pred-aviso" id="predAviso">
            ${__('Corre en el servidor y tarda entre 7 y 30 minutos. Puedes cerrar esta página.')}
          </p>
        </footer>
      </div>

    </aside>

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
      await this.cargar();
      this.setupEventListeners();
      this.ajustarSondeo();
      void this.cargarPrecio();
    } catch (err) {
      console.error('PredictorView render:', err);
      const lista = document.getElementById('predLista');
      if (lista) {
        lista.innerHTML = `<p class="pred-panel-fallo">${__('No se pudieron cargar las simulaciones.')} ${
          err && err.message ? this.escapeHtml(err.message) : ''}</p>`;
      }
      this.pintarLienzo();
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
      if (window.PredictorDataService) {
        this.datos = await new window.PredictorDataService().init(this.supabase, this.organizationId);
      }
    } catch (e) {
      console.error('PredictorView initSupabase:', e);
    }
  }

  /**
   * El precio y el saldo, para decirlos antes de gastar.
   *
   * El precio sale de `feature_costs` —una FILA que alguien puede cambiar, no
   * un número enterrado en el código— y el cobro real se hace al final con lo
   * que la corrida consumió de verdad. Por eso aquí se dice "alrededor de": una
   * cifra exacta antes de correr sería una promesa que el motor no firmó.
   */
  async cargarPrecio() {
    const el = document.getElementById('predPrecio');
    if (!el || !this.datos) return;
    try {
      const { estimado, saldo } = await this.datos.precioYSaldo();
      this.estimado = estimado;
      const partes = [];
      if (estimado) partes.push(`${__('Cuesta alrededor de')} ${estimado} ${__('créditos')}`);
      if (saldo !== null) partes.push(`${__('te quedan')} ${Math.round(saldo)}`);
      el.textContent = partes.join(' · ');
      // Sin saldo para una corrida se dice ANTES de que escriba nada, y el
      // botón se apaga: dejarlo encendido para que el servidor conteste 402 es
      // hacerle escribir el movimiento para nada.
      const corto = estimado !== null && saldo !== null && saldo < estimado;
      el.classList.toggle('is-corto', corto);
      const btn = document.getElementById('predLanzarBtn');
      if (btn) btn.disabled = corto;
    } catch (_) {
      el.textContent = '';
    }
  }

  /** Lee las corridas. La RLS de predictor_runs ya limita a la org del usuario. */
  async cargar() {
    if (!this.datos) return;

    const { data, error } = await this.datos.listar(40);
    if (error) throw new Error(error.message);

    this.corridas = data || [];
    this.cargado = true;

    // EL CENTRO ABRE CON UN MAPA, no con un cartel. La mesa se lee "aquí está el
    // mundo que produjo la última predicción, y a la derecha se lanza la
    // siguiente"; con el lienzo vacío habría que adivinar que el historial es
    // clicable. Solo la primera vez: después manda lo que el usuario eligió.
    if (!this._abrioSola && this.corridas.length) {
      this._abrioSola = true;
      this.pintarHistorial();
      void this.abrir(this.corridas[0].id);
      return;
    }

    this.pintarHistorial();
    this.pintarLienzo();
  }

  /** El idioma de las fechas: el de la app, no el del navegador. Con `undefined`
      salia "August 7, 2026" debajo de una interfaz en español. */
  static locale() {
    try { return (window.i18n && window.i18n.getLocale && window.i18n.getLocale()) || 'es'; }
    catch (_) { return 'es'; }
  }

  corridaAbierta() {
    if (!this.selId) return null;
    // El detalle si ya llegó (trae semilla, veredicto, reporte); si no, la fila
    // corta de la lista, que basta para pintar la cabecera y el avance.
    return this.detalles.get(this.selId)
      || this.corridas.find((c) => c.id === this.selId)
      || null;
  }

  static viva(c) {
    return c && (c.estado === 'corriendo' || c.estado === 'pendiente');
  }

  static paso(c) {
    if (!c) return null;
    if (c.estado === 'pendiente') return PredictorView.PASO.pendiente;
    return PredictorView.PASO[c.etapa] || PredictorView.PASO.pendiente;
  }

  // ══════════════════════════════════════════════════════════════════════
  // IZQUIERDA — el historial
  // ══════════════════════════════════════════════════════════════════════
  pintarHistorial() {
    const lista = document.getElementById('predLista');
    const conteo = document.getElementById('predConteo');
    if (!lista) return;

    if (conteo) {
      conteo.textContent = this.cargado
        ? `${this.corridas.length} ${this.corridas.length === 1 ? __('corrida') : __('corridas')}`
        : __('Leyendo…');
    }

    if (!this.cargado) {
      lista.innerHTML = Array.from({ length: 5 }, (_, i) => `
        <div class="pred-fila-esqueleto">
          <span class="pred-barra" style="width:${74 - i * 7}%"></span>
          <span class="pred-barra pred-barra--corta"></span>
        </div>`).join('');
      return;
    }

    if (!this.corridas.length) {
      lista.innerHTML = `<p class="pred-panel-vacio">${
        __('Todavía no hemos preguntado nada. Escribe a la derecha qué quieres probar y el público responde.')}</p>`;
      return;
    }

    lista.innerHTML = this.corridas.map((c) => this.filaHistorial(c)).join('');
  }

  /** La fila dice DE QUÉ HABLA, no cuándo se creó. La fecha está, pequeña. */
  filaHistorial(c) {
    const esc = (t) => this.escapeHtml(String(t ?? ''));
    const viva = PredictorView.viva(c);
    const paso = PredictorView.paso(c);
    const activa = c.id === this.selId;

    const punto = viva ? 'is-viva' : c.estado === 'fallido' ? 'is-fallo' : 'is-lista';
    const estado = viva ? (paso?.texto || __('Arrancando'))
      : c.estado === 'fallido' ? __('Falló') : __('Lista');

    const fecha = c.created_at
      ? new Date(c.created_at).toLocaleDateString(PredictorView.locale(), {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
      : '';

    return `
<button type="button" class="pred-fila ${activa ? 'is-activa' : ''}" data-accion="abrir" data-id="${esc(c.id)}">
  <span class="pred-fila-alto">
    <span class="pred-punto ${punto}"></span>
    <b class="pred-fila-titulo">${esc(c.titulo || c.pregunta)}</b>
  </span>
  <span class="pred-fila-bajo">
    <span>${esc(fecha)}</span>
    <span class="pred-fila-sep">·</span>
    <span class="${viva ? 'pred-fila-viva' : ''}">${esc(estado)}</span>
    ${c.origen === 'vera' ? `<span class="pred-fila-sep">·</span><span>${__('Vera')}</span>` : ''}
  </span>
</button>`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // DERECHA — inputs (escondidos, no desmontados) o la corrida abierta
  // ══════════════════════════════════════════════════════════════════════
  /**
   * Las cifras de la corrida. Van al PIE del informe y no a la cabecera: el
   * veredicto es lo que se viene a leer; cuántos agentes hubo y cuánto costó lo
   * respaldan, y puestos arriba entierran la predicción bajo una tabla.
   */
  fichaDatos(c, completa) {
    const esc = (t) => this.escapeHtml(String(t ?? ''));
    const d = completa || c;
    const min = d.finished_at && d.started_at
      ? Math.round((new Date(d.finished_at) - new Date(d.started_at)) / 60000)
      : null;

    const datos = [
      [__('Agentes'), d.agentes],
      [__('Actores del mundo'), d.nodos],
      [__('Hechos'), d.aristas],
      [__('Rondas'), d.rondas],
      [__('Escenario'), PredictorView.ESCENARIO[d.plataforma] ? __(PredictorView.ESCENARIO[d.plataforma]) : d.plataforma],
      [__('Duración'), min && min > 0 ? `${min} min` : null],
      [__('Llamadas al modelo'), d.llamadas_llm],
      [__('Costo'), d.costo_usd ? `$${Number(d.costo_usd).toFixed(2)}` : null],
      [__('Lanzada por'), d.origen === 'vera' ? 'Vera' : null],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');

    if (!datos.length) return '';
    return `<dl class="pred-datos">${datos.map(([k, v]) =>
      `<div class="pred-dato"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  caraPublicaron(completa) {
    const esc = (t) => this.escapeHtml(String(t ?? ''));
    const e = completa?.enjambre || {};
    const posts = Array.isArray(e.posts) ? e.posts : [];
    const rondas = Array.isArray(e.rondas) ? e.rondas : [];

    if (!posts.length) {
      return `<p class="pred-panel-vacio">${__('Esta corrida no guardó lo que publicaron los agentes.')}</p>`;
    }

    // EL DATO QUE MÁS DICE NO ES CUÁNTO SE PUBLICÓ, SINO EN CUÁNTAS RONDAS.
    // En las corridas medidas todo ocurrió en la ronda 0 y las siguientes
    // quedaron en cero: eso no es un enjambre debatiendo, es un anuncio. Si no
    // se cuenta aquí, una lista larga de publicaciones parece interacción.
    const conAccion = rondas.filter((r) => (r.acciones || 0) > 0).length;
    const aviso = rondas.length
      ? (conAccion <= 1
          ? __('Todo ocurrió en una sola ronda: los agentes publicaron en paralelo, sin responderse.')
          : `${__('Se publicó en')} ${conAccion} ${__('de')} ${rondas.length} ${__('rondas')}.`)
      : __('Son publicaciones sueltas, no una conversación.');

    return `
<p class="pred-nota">${esc(aviso)}</p>
${rondas.length ? `
  <ul class="pred-rondas">
    ${rondas.map((r) => `
      <li class="pred-ronda ${(r.acciones || 0) > 0 ? 'is-viva' : ''}">
        <span>${__('Ronda')} ${esc(r.ronda)}</span>
        <span>${esc(r.acciones || 0)}</span>
      </li>`).join('')}
  </ul>` : ''}
<ul class="pred-posts">
  ${posts.slice(0, 40).map((p) => `
    <li class="pred-post">
      <b class="pred-post-quien">${esc(p.agente)}</b>
      <p class="pred-post-texto">${esc(p.texto)}</p>
    </li>`).join('')}
</ul>
${e.truncado ? `<p class="pred-nota">${__('Se guardaron las primeras')} ${esc(e.truncado)} ${__('publicaciones.')}</p>` : ''}`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // CENTRO — el lienzo: el mapa cuando exista, el informe siempre
  // ══════════════════════════════════════════════════════════════════════
  pintarLienzo() {
    const el = document.getElementById('predLienzo');
    if (!el) return;
    this.soltarMapa();

    const c = this.corridaAbierta();
    if (!c) {
      el.innerHTML = `
<div class="pred-lienzo-centro">
  <div class="pred-bienvenida">
    <h1 class="pred-bienvenida-titulo">${__('El público todavía no ha dicho nada')}</h1>
    <p class="pred-bienvenida-texto">${
      __('Escribe a la derecha qué movimiento quieres probar. El motor arma un enjambre de agentes desde el ADN y las audiencias reales de tu marca, los deja reaccionar por rondas y devuelve un veredicto con señales. Las corridas anteriores están a la izquierda.')}</p>
  </div>
</div>`;
      return;
    }

    const completa = this.detalles.get(c.id);
    // EL MAPA ES LA CARA PRINCIPAL cuando existe: el informe es lo que el
    // público contestó, el mapa es DE DÓNDE SALIÓ ese público. Cuando el reparto
    // sale mal el informe se lee razonable y está prediciendo el mundo
    // equivocado; el mapa es lo único que lo enseña. Dos excepciones al orden y
    // las dos por lo mismo —no abrir en una cara vacía o muda—: sin mapa, y con
    // la corrida fallida, abre en el informe, que es donde está el motivo.
    const caras = [];
    if (completa && completa.grafo) caras.push(['mapa', __('Mapa')]);
    caras.push(['informe', __('Informe')]);
    if (completa && completa.semilla) caras.push(['semilla', __('Semilla')]);
    if (completa && completa.enjambre) caras.push(['publicaron', __('Publicaron')]);

    const porDefecto = (caras[0][0] === 'mapa' && c.estado !== 'fallido') ? 'mapa' : 'informe';
    const guardada = (this.cara && this.cara.id === c.id) ? this.cara.cara : null;
    const cara = caras.some(([k]) => k === guardada) ? guardada : porDefecto;

    el.innerHTML = `
<header class="pred-lienzo-cabeza">
  <div class="pred-lienzo-titulos">
    <b class="pred-lienzo-titulo">${this.escapeHtml(c.titulo || c.pregunta)}</b>
    <span class="pred-lienzo-meta">${this.metaLienzo(completa || c)}</span>
  </div>
  ${caras.length > 1 ? `
    <div class="pred-caras" role="tablist">
      ${caras.map(([k, txt]) => `
        <button type="button" role="tab" aria-selected="${cara === k}"
          class="pred-cara ${cara === k ? 'is-activa' : ''}" data-accion="cara" data-cara="${k}">${this.escapeHtml(txt)}</button>`).join('')}
    </div>` : ''}
</header>
<div class="pred-lienzo-cuerpo">
  ${cara === 'mapa' ? this.caraMapa() : ''}
  ${cara === 'informe' ? this.caraInforme(c, completa) : ''}
  ${cara === 'semilla' ? this.caraSemilla(completa) : ''}
  ${cara === 'publicaron' ? `<div class="pred-lienzo-columna">${this.caraPublicaron(completa)}</div>` : ''}
</div>`;

    if (cara === 'informe') this.pintarReporteLargo(completa);
    if (cara === 'mapa') this.montarMapa(completa);
  }

  /**
   * Monta el mapa sobre el hueco que dejó `caraMapa()`.
   *
   * EL MAPA ANTERIOR SE DESTRUYE SIEMPRE, no solo al cambiar de cara. El lienzo
   * se repinta con `innerHTML`, lo que deja el SVG viejo fuera del documento
   * pero NO cancela su `requestAnimationFrame`: seguiría calculando física a 60
   * fps sobre nodos que ya nadie ve, uno por cada corrida que se abra.
   */
  montarMapa(completa) {
    const host = document.getElementById('predMapaHost');
    if (!host || !completa?.grafo || !window.PredMapa) return;
    try {
      this._mapa = new window.PredMapa(host, completa.grafo);
    } catch (e) {
      console.error('PredictorView mapa:', e);
      host.innerHTML = `<p class="pred-nota">${__('No se pudo dibujar el mapa de esta corrida.')}</p>`;
    }
  }

  soltarMapa() {
    if (this._mapa) {
      this._mapa.destruir();
      this._mapa = null;
    }
  }

  metaLienzo(c) {
    const partes = [];
    if (c.rondas) partes.push(`${c.rondas} ${__('rondas')}`);
    if (c.agentes) partes.push(`${c.agentes} ${__('agentes')}`);
    // `predicha_at` es lo que convierte esto en evidencia —prueba que se dijo
    // ANTES—, así que va en el encabezado y no en un pie que nadie mira.
    if (c.predicha_at) {
      partes.push(`${__('predicha el')} ${new Date(c.predicha_at).toLocaleDateString(PredictorView.locale(), {
        day: 'numeric', month: 'long', year: 'numeric',
      })}`);
    }
    return this.escapeHtml(partes.join(' · '));
  }

  caraSemilla(completa) {
    return `
<div class="pred-lienzo-columna">
  <p class="pred-nota">${__('El documento que leyó el motor. De aquí saca las entidades, y de las entidades salen los agentes: si esto no habla de tu público, el mapa tampoco.')}</p>
  <pre class="pred-crudo">${this.escapeHtml(completa.semilla)}</pre>
</div>`;
  }

  caraMapa() {
    // Solo el hueco: el mapa se monta DESPUÉS de escribir el innerHTML del
    // lienzo, porque necesita un nodo que ya esté en el documento para medirse.
    return '<div class="pmapa-host" id="predMapaHost"></div>';
  }

  caraInforme(c, completa) {
    const esc = (t) => this.escapeHtml(String(t ?? ''));

    if (c.estado === 'fallido') {
      // Un fallo se muestra como fallo, con su motivo. No se disfraza de
      // resultado flojo.
      return `
<div class="pred-lienzo-columna">
  <div class="pred-fallo">
    <b class="pred-fallo-titulo">${__('Esta simulación no llegó a producir un veredicto.')}</b>
    <pre class="pred-crudo">${esc((c.error || completa?.error || __('Sin detalle.')).slice(0, 1600))}</pre>
    <p class="pred-nota">${__('La pregunta y la semilla quedan guardadas: se puede volver a lanzar sin reescribirlas.')}</p>
  </div>
</div>`;
    }

    if (PredictorView.viva(c)) {
      const paso = PredictorView.paso(c);
      return `
<div class="pred-lienzo-centro">
  <div class="pred-esperando">
    <p class="pred-esperando-paso">${esc(paso?.texto || __('Arrancando'))}</p>
    <!-- Una barra y no un spinner: media hora de spinner no dice si falta poco
         o mucho, y es justo lo que uno necesita para decidir si se queda. -->
    <div class="pred-avance"><span class="pred-avance-relleno" style="transform:scaleX(${(paso?.avance || 0.05).toFixed(3)})"></span></div>
    <p class="pred-nota">${__('Corre en el servidor y tarda entre 7 y 30 minutos. Puedes cerrar la página: el avance sigue aquí cuando vuelvas.')}</p>
  </div>
</div>`;
    }

    if (!completa) {
      return `<div class="pred-lienzo-centro"><p class="pred-nota">${__('Abriendo el informe…')}</p></div>`;
    }

    const v = completa.veredicto || {};
    const senales = Array.isArray(v.signals) ? v.signals : [];
    const dinamicas = Array.isArray(v.key_dynamics) ? v.key_dynamics : [];
    const conf = typeof v.confidence === 'number' ? Math.round(v.confidence * 100) : null;

    if (!v.prediction && !completa.reporte_md) {
      return `<div class="pred-lienzo-centro"><p class="pred-nota">${
        __('Esta corrida quedó lista sin informe.')}</p></div>`;
    }

    return `
<div class="pred-lienzo-columna">
  ${v.prediction ? `
    <section class="pred-bloque">
      <h2 class="pred-bloque-titulo">${__('Predicción')}</h2>
      <p class="pred-prediccion">${esc(v.prediction)}</p>
      ${conf !== null ? `<p class="pred-confianza">${__('Confianza del motor')}: <strong>${conf}%</strong></p>` : ''}
    </section>` : ''}

  ${dinamicas.length ? `
    <section class="pred-bloque">
      <h2 class="pred-bloque-titulo">${__('Dinámicas clave')}</h2>
      <ul class="pred-dinamicas">${dinamicas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </section>` : ''}

  ${senales.length ? `
    <section class="pred-bloque">
      <h2 class="pred-bloque-titulo">${__('Señales')}</h2>
      <ul class="pred-senales">${senales.map((s) => {
        const fuerza = Math.round((Number(s.strength) || 0) * 100);
        const dir = s.direction === 'positive' ? 'positiva'
          : s.direction === 'negative' ? 'negativa' : 'mixta';
        return `
          <li class="pred-senal pred-senal--${dir}">
            <span class="pred-senal-texto">${esc(s.signal)}</span>
            <span class="pred-senal-barra"><span class="pred-senal-relleno" style="width:${fuerza}%"></span></span>
            <span class="pred-senal-fuerza">${fuerza}%</span>
          </li>`;
      }).join('')}</ul>
    </section>` : ''}

  ${completa.reporte_md ? `
    <section class="pred-bloque">
      <h2 class="pred-bloque-titulo">${__('Informe completo')}</h2>
      <div class="pred-reporte" id="predReporte"><pre class="pred-crudo">${esc(completa.reporte_md)}</pre></div>
    </section>` : ''}

  ${this.fichaDatos(c, completa)}

  <p class="pred-descargo">
    ${__('Esto es una simulación: orientación informada, no una predicción exacta. Úsala como pre-filtro para decidir, no como evidencia de lo que va a pasar.')}
  </p>
</div>`;
  }

  /**
   * El informe largo se pinta primero como texto y DESPUÉS, si las librerías
   * cargan, como markdown. Así el contenido está desde el primer fotograma y no
   * depende de una CDN: si `marked` no llega, se lee igual.
   * Mismo par (marked + DOMPurify) y misma bandera global que usa Vera.
   */
  async pintarReporteLargo(completa) {
    if (!completa?.reporte_md) return;
    try {
      await PredictorView.cargarMarkdown();
      if (!window.marked || !window.DOMPurify) return;
      const host = document.getElementById('predReporte');
      // Si el usuario cambió de corrida mientras cargaba la CDN, este nodo ya
      // no es el suyo: se comprueba antes de escribir.
      if (!host || this.corridaAbierta()?.id !== completa.id) return;
      host.innerHTML = window.DOMPurify.sanitize(window.marked.parse(completa.reporte_md));
      host.classList.add('is-markdown');
    } catch (_) {
      // Se queda el texto plano, que ya está en pantalla.
    }
  }

  static cargarMarkdown() {
    if (window.__mdLibsLoaded) return Promise.resolve();
    if (PredictorView.__md) return PredictorView.__md;
    const script = (src, ya) => new Promise((res, rej) => {
      if (ya()) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    PredictorView.__md = Promise.all([
      script('https://cdn.jsdelivr.net/npm/marked@12/marked.min.js', () => window.marked),
      script('https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js', () => window.DOMPurify),
    ]).then(() => {
      if (window.marked?.setOptions) window.marked.setOptions({ breaks: true, gfm: true });
      window.__mdLibsLoaded = true;
    });
    return PredictorView.__md;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Interacción
  // ══════════════════════════════════════════════════════════════════════
  setupEventListeners() {
    const btn = document.getElementById('predLanzarBtn');
    if (btn) this.addEventListener(btn, 'click', () => this.lanzar());

    const lista = document.getElementById('predLista');
    if (lista) {
      this.addEventListener(lista, 'click', (e) => {
        const t = e.target.closest('[data-accion="abrir"]');
        if (!t) return;
        const id = t.getAttribute('data-id');
        // Tocar la fila abierta la suelta. Con los inputs siempre a la derecha
        // no hace falta un botón para "volver": soltar la corrida ES volver.
        this.abrir(id === this.selId ? null : id);
      });
    }

    const lienzo = document.getElementById('predLienzo');
    if (lienzo) {
      this.addEventListener(lienzo, 'click', (e) => {
        const t = e.target.closest('[data-accion="cara"]');
        if (!t) return;
        // La cara viaja con el id de su corrida: elegir "Informe" en una y
        // cambiar de fila no puede dejar clavada esa elección en la siguiente.
        this.cara = { id: this.selId, cara: t.getAttribute('data-cara') };
        this.pintarLienzo();
      });
    }
  }

  /** Abre una corrida (o la suelta, con null) y pide su detalle una sola vez. */
  async abrir(id) {
    if (this.selId === id) return;
    this.selId = id;
    this.pintarHistorial();
    this.pintarLienzo();
    if (!id) return;

    // El detalle trae semilla, veredicto y reporte: pesa, así que se pide al
    // abrir y no con la lista. Una corrida viva se vuelve a pedir cada vez,
    // porque su salida todavía está creciendo.
    const c = this.corridas.find((x) => x.id === id);
    if (this.detalles.has(id) && !PredictorView.viva(c)) return;

    const { data, error } = await this.datos.detalle(id);
    if (error || !data) return;
    // Si mientras viajaba la respuesta se cambió de corrida, la vieja no puede
    // pisar a la nueva.
    this.detalles.set(id, data);
    if (this.selId !== id) return;
    this.pintarLienzo();
  }

  async lanzar() {
    const btn = document.getElementById('predLanzarBtn');
    const errEl = document.getElementById('predError');
    const pregunta = (document.getElementById('predPregunta')?.value || '').trim();

    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    if (!pregunta) {
      if (errEl) {
        errEl.textContent = __('Escribe qué quieres simular.');
        errEl.hidden = false;
      }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = __('Lanzando…'); }

    try {
      if (!this.datos) throw new Error(__('No se pudo inicializar el servicio de datos.'));

      const { data: json, error } = await this.datos.lanzar({
        pregunta,
        titulo: (document.getElementById('predTitulo')?.value || '').trim() || null,
        contextoExtra: (document.getElementById('predContexto')?.value || '').trim() || null,
        rondas: Number(document.getElementById('predRondas')?.value) || 5,
        plataforma: document.getElementById('predPlataforma')?.value || 'parallel',
      });

      if (error) throw error;

      // Si la semilla salió coja, se dice — el usuario merece saber con qué se
      // alimentó la simulación antes de creerle al veredicto.
      if (json && json.aviso) {
        const aviso = document.getElementById('predAviso');
        if (aviso) aviso.textContent = json.aviso;
      }

      const pEl = document.getElementById('predPregunta');
      const cEl = document.getElementById('predContexto');
      const tEl = document.getElementById('predTitulo');
      if (pEl) pEl.value = '';
      if (cEl) cEl.value = '';
      if (tEl) tEl.value = '';

      await this.cargar();
      // Se abre sola: acabas de lanzarla, es lo que quieres mirar. Los inputs
      // siguen ahí al lado, ya vacíos, listos para la siguiente.
      if (json && json.id) await this.abrir(json.id);
      this.ajustarSondeo();
      void this.cargarPrecio();
    } catch (e) {
      if (errEl) {
        errEl.textContent = e.message || __('No se pudo lanzar la simulación.');
        errEl.hidden = false;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = __('Lanzar simulación'); }
    }
  }

  /** Solo se sondea si hay algo vivo: un timer eterno sobre una lista quieta es basura. */
  ajustarSondeo() {
    const hayVivas = this.corridas.some((c) => PredictorView.viva(c));
    if (hayVivas && !this._sondeo) {
      this._sondeo = setInterval(() => {
        this.cargar()
          .then(async () => {
            // Si la corrida abierta terminó mientras mirábamos, su salida ya
            // existe y hay que ir a buscarla: la lista sola no la trae.
            const c = this.corridaAbierta();
            if (c && !PredictorView.viva(c) && !this.detalles.get(c.id)?.veredicto) {
              const { data } = await this.datos.detalle(c.id);
              if (data && this.selId === c.id) {
                this.detalles.set(c.id, data);
                this.pintarLienzo();
              }
            }
            this.ajustarSondeo();
          })
          .catch(() => {});
      }, PredictorView.SONDEO_MS);
    } else if (!hayVivas && this._sondeo) {
      clearInterval(this._sondeo);
      this._sondeo = null;
    }
  }

  /** El router destruye la vista al salir: sin esto el timer sobrevive y sigue pegándole a Supabase. */
  destroy() {
    if (this._sondeo) {
      clearInterval(this._sondeo);
      this._sondeo = null;
    }
    this.soltarMapa();
    if (super.destroy) super.destroy();
  }
}

window.PredictorView = PredictorView;
