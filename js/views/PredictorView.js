/**
 * PredictorView — el Predictor: simular al público antes de gastar en él.
 *
 * Le das un movimiento que quieres probar (un precio, un lanzamiento, un
 * mensaje) y el motor arma agentes desde el ADN y las audiencias reales de la
 * marca, los deja interactuar por rondas y devuelve un veredicto con señales.
 *
 * ARQUITECTURA — por qué esta vista es de dos velocidades:
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
  static get documentTitle() { return __('Predictor'); }

  /** Cada cuánto se re-consulta mientras haya corridas vivas. */
  static SONDEO_MS = 15000;

  constructor() {
    super();
    this.supabase = null;
    this.userId = null;
    this.organizationId = null;
    this.datos = null;        // PredictorDataService
    this.corridas = [];
    this.abierta = null;      // id de la corrida expandida
    this._sondeo = null;
  }

  renderHTML() {
    return `
<div class="pred-page" id="predPage">
  <div class="pred-container">

    <header class="pred-header">
      <h1 class="pred-title">${__('Predictor')}</h1>
      <p class="pred-subtitle">${__('Simula cómo reaccionaría tu público a un movimiento — un precio, un lanzamiento, un mensaje — antes de gastar en él.')}</p>
    </header>

    <section class="pred-lanzar" id="predLanzar">
      <h2 class="pred-lanzar-titulo">${__('Nueva predicción')}</h2>

      <label class="pred-campo">
        <span class="pred-label">${__('¿Qué quieres predecir?')}</span>
        <textarea id="predPregunta" class="pred-input pred-input--area" rows="3"
          placeholder="${__('Ej: ¿cómo reaccionaría nuestro público si subimos el precio un 20%?')}"></textarea>
      </label>

      <label class="pred-campo">
        <span class="pred-label">${__('El movimiento concreto')} <span class="pred-opcional">${__('(opcional)')}</span></span>
        <textarea id="predContexto" class="pred-input pred-input--area" rows="3"
          placeholder="${__('Describe el movimiento: el precio nuevo, el producto que lanzas, el mensaje que vas a usar.')}"></textarea>
      </label>

      <div class="pred-fila">
        <label class="pred-campo pred-campo--corto">
          <span class="pred-label">${__('Título')}</span>
          <input id="predTitulo" class="pred-input" type="text" placeholder="${__('Para reconocerla después')}">
        </label>

        <label class="pred-campo pred-campo--mini">
          <span class="pred-label">${__('Rondas')}</span>
          <select id="predRondas" class="pred-input">
            <option value="3">3</option>
            <option value="5" selected>5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </label>

        <label class="pred-campo pred-campo--mini">
          <span class="pred-label">${__('Escenario')}</span>
          <select id="predPlataforma" class="pred-input">
            <option value="parallel" selected>${__('Ambos')}</option>
            <option value="twitter">${__('Tipo X')}</option>
            <option value="reddit">${__('Tipo Reddit')}</option>
          </select>
        </label>
      </div>

      <div class="pred-acciones">
        <button id="predLanzarBtn" class="pred-btn pred-btn--primario" type="button">
          ${__('Lanzar predicción')}
        </button>
        <p class="pred-aviso" id="predAviso">
          ${__('Tarda entre 7 y 30 minutos. Puedes cerrar esta página: la corrida sigue y aquí queda el resultado.')}
        </p>
      </div>
      <p class="pred-error" id="predError" hidden></p>
    </section>

    <section class="pred-historial">
      <h2 class="pred-historial-titulo">${__('Predicciones')}</h2>
      <div class="pred-lista" id="predLista">
        ${PredictorView.skeletonGrid(3, 'lg')}
      </div>
      ${this.emptyState({
        id: 'predVacio',
        hidden: true,
        icon: 'aisc-ico aisc-ico--predictor',
        title: __('Todavía no has corrido ninguna predicción.'),
        subtitle: __('Escribe arriba qué quieres probar y lanza la primera. El motor arma el público desde el ADN y las audiencias reales de tu marca.'),
      })}
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
      await this.cargar();
      this.setupEventListeners();
      this.ajustarSondeo();
    } catch (err) {
      console.error('PredictorView render:', err);
      const lista = document.getElementById('predLista');
      if (lista) {
        lista.innerHTML = `<p class="pred-error">${__('No se pudieron cargar las predicciones.')} ${
          err && err.message ? this.escapeHtml(err.message) : ''}</p>`;
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
      if (window.PredictorDataService) {
        this.datos = await new window.PredictorDataService().init(this.supabase, this.organizationId);
      }
    } catch (e) {
      console.error('PredictorView initSupabase:', e);
    }
  }

  /** Lee las corridas. La RLS de predictor_runs ya limita a la org del usuario. */
  async cargar() {
    if (!this.datos) return;

    const { data, error } = await this.datos.listar(40);
    if (error) throw new Error(error.message);

    this.corridas = data || [];
    this.pintarLista();
  }

  pintarLista() {
    const lista = document.getElementById('predLista');
    const vacio = document.getElementById('predVacio');
    if (!lista) return;

    if (!this.corridas.length) {
      lista.innerHTML = '';
      if (vacio) vacio.hidden = false;
      return;
    }
    if (vacio) vacio.hidden = true;

    lista.innerHTML = this.corridas.map((c) => this.tarjeta(c)).join('');
  }

  tarjeta(c) {
    const esc = (t) => this.escapeHtml(String(t ?? ''));
    const viva = c.estado === 'corriendo' || c.estado === 'pendiente';
    const abierta = this.abierta === c.id;

    const etapas = {
      ontologia: __('leyendo la semilla'),
      grafo: __('armando el grafo'),
      perfiles: __('generando los agentes'),
      simulacion: __('los agentes interactúan'),
      reporte: __('escribiendo el veredicto'),
    };

    let estadoHtml;
    if (viva) {
      estadoHtml = `<span class="pred-estado pred-estado--viva">
        <span class="pred-pulso"></span>${esc(etapas[c.etapa] || __('arrancando'))}</span>`;
    } else if (c.estado === 'fallido') {
      estadoHtml = `<span class="pred-estado pred-estado--fallo">${__('Falló')}</span>`;
    } else {
      estadoHtml = `<span class="pred-estado pred-estado--listo">${__('Lista')}</span>`;
    }

    const meta = [];
    if (c.agentes) meta.push(`${c.agentes} ${__('agentes')}`);
    if (c.rondas) meta.push(`${c.rondas} ${__('rondas')}`);
    if (c.origen === 'vera') meta.push(__('lanzada por Vera'));
    if (c.finished_at && c.started_at) {
      const min = Math.round((new Date(c.finished_at) - new Date(c.started_at)) / 60000);
      if (min > 0) meta.push(`${min} min`);
    }

    return `
<article class="pred-card ${abierta ? 'is-abierta' : ''} ${c.estado === 'fallido' ? 'is-fallida' : ''}" data-id="${esc(c.id)}">
  <button class="pred-card-cabeza" type="button" data-accion="abrir" data-id="${esc(c.id)}">
    <div class="pred-card-texto">
      <h3 class="pred-card-titulo">${esc(c.titulo)}</h3>
      <p class="pred-card-pregunta">${esc(c.pregunta)}</p>
    </div>
    <div class="pred-card-lado">
      ${estadoHtml}
      ${meta.length ? `<span class="pred-card-meta">${esc(meta.join(' · '))}</span>` : ''}
    </div>
  </button>
  ${abierta ? this.detalle(c) : ''}
</article>`;
  }

  detalle(c) {
    const esc = (t) => this.escapeHtml(String(t ?? ''));

    if (c.estado === 'fallido') {
      // Un fallo se muestra como fallo, con su motivo. No se disfraza de resultado.
      return `
<div class="pred-detalle">
  <p class="pred-fallo-titulo">${__('Esta predicción no llegó a producir un veredicto.')}</p>
  <pre class="pred-fallo-motivo">${esc((c.error || __('Sin detalle.')).slice(0, 1200))}</pre>
</div>`;
    }

    if (c.estado !== 'listo') {
      return `<div class="pred-detalle"><p class="pred-corriendo">${
        __('Todavía corriendo. Esta tarjeta se actualiza sola.')}</p></div>`;
    }

    const v = c.veredicto || {};
    const señales = Array.isArray(v.signals) ? v.signals : [];
    const dinamicas = Array.isArray(v.key_dynamics) ? v.key_dynamics : [];
    const conf = typeof v.confidence === 'number' ? Math.round(v.confidence * 100) : null;

    const señalesHtml = señales.map((s) => {
      const fuerza = Math.round((Number(s.strength) || 0) * 100);
      const dir = s.direction === 'positive' ? 'positiva'
        : s.direction === 'negative' ? 'negativa' : 'mixta';
      return `
<li class="pred-senal pred-senal--${dir}">
  <span class="pred-senal-texto">${esc(s.signal)}</span>
  <span class="pred-senal-barra"><span class="pred-senal-relleno" style="width:${fuerza}%"></span></span>
  <span class="pred-senal-fuerza">${fuerza}%</span>
</li>`;
    }).join('');

    return `
<div class="pred-detalle">
  ${v.prediction ? `
    <div class="pred-bloque">
      <h4 class="pred-bloque-titulo">${__('Predicción')}</h4>
      <p class="pred-prediccion">${esc(v.prediction)}</p>
      ${conf !== null ? `<p class="pred-confianza">${__('Confianza del motor')}: <strong>${conf}%</strong></p>` : ''}
    </div>` : ''}

  ${dinamicas.length ? `
    <div class="pred-bloque">
      <h4 class="pred-bloque-titulo">${__('Dinámicas clave')}</h4>
      <ul class="pred-dinamicas">${dinamicas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </div>` : ''}

  ${señalesHtml ? `
    <div class="pred-bloque">
      <h4 class="pred-bloque-titulo">${__('Señales')}</h4>
      <ul class="pred-senales">${señalesHtml}</ul>
    </div>` : ''}

  <p class="pred-descargo">
    ${__('Esto es una simulación: orientación informada, no una predicción exacta. Úsala como pre-filtro para decidir, no como evidencia de lo que va a pasar.')}
    ${c.costo_usd ? ` · ${__('Costo')}: $${Number(c.costo_usd).toFixed(2)}` : ''}
  </p>
</div>`;
  }

  setupEventListeners() {
    const btn = document.getElementById('predLanzarBtn');
    if (btn) btn.addEventListener('click', () => this.lanzar());

    const lista = document.getElementById('predLista');
    if (lista) {
      lista.addEventListener('click', (e) => {
        const t = e.target.closest('[data-accion="abrir"]');
        if (!t) return;
        const id = t.getAttribute('data-id');
        this.abierta = this.abierta === id ? null : id;
        this.pintarLista();
      });
    }
  }

  async lanzar() {
    const btn = document.getElementById('predLanzarBtn');
    const errEl = document.getElementById('predError');
    const pregunta = (document.getElementById('predPregunta')?.value || '').trim();

    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    if (!pregunta) {
      if (errEl) {
        errEl.textContent = __('Escribe qué quieres predecir.');
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
      this.ajustarSondeo();
    } catch (e) {
      if (errEl) {
        errEl.textContent = e.message || __('No se pudo lanzar la predicción.');
        errEl.hidden = false;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = __('Lanzar predicción'); }
    }
  }

  /** Solo se sondea si hay algo vivo: un timer eterno sobre una lista quieta es basura. */
  ajustarSondeo() {
    const hayVivas = this.corridas.some((c) => c.estado === 'corriendo' || c.estado === 'pendiente');
    if (hayVivas && !this._sondeo) {
      this._sondeo = setInterval(() => {
        this.cargar()
          .then(() => this.ajustarSondeo())
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
    if (super.destroy) super.destroy();
  }
}

window.PredictorView = PredictorView;
