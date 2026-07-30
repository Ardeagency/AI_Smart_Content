/**
 * DashboardView — Vera4 mixin (las cards del cerebro de Vera, VERA_BRAIN_MASTER).
 *
 * Pinta el schema `cards.vera4`: las 30 tarjetas del Ciclo de Relevancia
 * (Infiltración → Sincronización → Manifestación → Aprendizaje) REPARTIDAS en
 * los 4 tabs que ya existen. No reemplaza nada: se suma a lo que cada tab pinta
 * hoy y convive con cards.v2 (Mi Marca) y narrative v1 (Competencia).
 *
 * DE DÓNDE SALEN: `vera_dashboard_readings`, una fila por scope
 * (mi_marca · monitoreo · tendencias · estrategia) con
 * `reading = {schema:'cards.vera4', cards:[{type, ...}]}`.
 *
 * REPARTO (VERA4[type].tab decide dónde vive cada una; una card que llegue en el
 * scope equivocado NO se pinta — así una lectura mal escrita no ensucia el tab):
 *   Mi Marca    silencio · latencia · impacto_vs_ruido · emocion_objetivo ·
 *               viabilidad_comercial · ritmo · autopsia · victoria_explicada · causalidad
 *   Competencia anomalia · error_ajeno
 *   Tendencias  pulso_nicho · senal_debil · triangulacion · tension · timing · lo_que_falta
 *   Estrategia  decision_del_dia · autoridad_adn · puerta_aprobacion · produccion_viva ·
 *               pieza_asombro · formato · cadena_portafolio · verificacion ·
 *               brief_humano · bucle_outcome
 *   Sin tab     recalibracion · humildad · a2a_readiness (tab: null — hablan de Vera,
 *               no de la marca; se pintan solas el día que exista dónde ponerlas).
 *
 * SEGURIDAD: Vera lee posts, comentarios y web. TODO texto se escapa; aquí no
 * entra markup nunca. Un type desconocido se ignora (forward-compatible).
 * FALLBACK: sin lectura `cards.vera4` no se pinta NADA y cada tab queda
 * exactamente como está hoy. Ningún fallo de aquí tumba un tab.
 */
(function () {
  'use strict';
  if (typeof DashboardView === 'undefined') return;

  /* Catálogo: qué es cada card, dónde vive y con qué plantilla se pinta.
     El `tab` es la ley del reparto; el `layout` elige la plantilla. */
  const VERA4 = {
    // ── Mi Marca ──────────────────────────────────────────────────────────
    silencio:             { tab: 'mi_marca',   layout: 'fichas',  icon: 'eye-off',       label: () => __('Lo que se calló'),          sub: () => __('El post que retiraste y la pregunta que nadie respondió') },
    latencia:             { tab: 'mi_marca',   layout: 'latencia', icon: 'hourglass',    label: () => __('Latencia'),                 sub: () => __('Cuánto tardaste en reaccionar a la última ventana') },
    impacto_vs_ruido:     { tab: 'mi_marca',   layout: 'duo',     icon: 'goal',          label: () => __('Impacto vs. ruido'),        sub: () => __('Qué mueve la aguja y qué solo ocupa espacio') },
    emocion_objetivo:     { tab: 'mi_marca',   layout: 'ensayo',  icon: 'sparkle',       label: () => __('La emoción correcta'),      sub: () => __('Qué debe sentir la persona, no "interés"') },
    viabilidad_comercial: { tab: 'mi_marca',   layout: 'plata',   icon: 'credit-card',   label: () => __('Lo que el negocio puede pagar'), sub: () => __('Gastado, costo por resultado y si la jugada cabe') },
    ritmo:                { tab: 'mi_marca',   layout: 'ritmo',   icon: 'clock',         label: () => __('Ritmo real'),               sub: () => __('Ráfagas que compiten contigo y silencios en ventanas abiertas') },
    autopsia:             { tab: 'mi_marca',   layout: 'ensayo',  icon: 'flask',         label: () => __('Autopsia'),                 sub: () => __('La pieza que no funcionó, sin excusas') },
    victoria_explicada:   { tab: 'mi_marca',   layout: 'ensayo',  icon: 'star',          label: () => __('Victoria explicada'),       sub: () => __('Por qué ganó y cómo se repite') },
    causalidad:           { tab: 'mi_marca',   layout: 'ensayo',  icon: 'git-branch',    label: () => __('¿Lo causé yo?'),            sub: () => __('Qué parte del resultado es mérito nuestro') },
    // ── Competencia ───────────────────────────────────────────────────────
    anomalia:             { tab: 'monitoreo',  layout: 'fichas',  icon: 'alert-warning', label: () => __('Anomalías del rival'),      sub: () => __('El movimiento raro y qué lo motivó') },
    error_ajeno:          { tab: 'monitoreo',  layout: 'fichas',  icon: 'ban',           label: () => __('Errores ajenos'),           sub: () => __('El fracaso del otro, y si yo podría cometerlo') },
    // ── Tendencias ────────────────────────────────────────────────────────
    pulso_nicho:          { tab: 'tendencias', layout: 'pulso',   icon: 'zap',           label: () => __('Latido del mercado'),       sub: () => __('Qué tan caliente está tu nicho y hacia dónde se mueve') },
    senal_debil:          { tab: 'tendencias', layout: 'fichas',  icon: 'wind',          label: () => __('Señales débiles'),          sub: () => __('Lo que todavía nadie nombró') },
    triangulacion:        { tab: 'tendencias', layout: 'triang',  icon: 'layers',        label: () => __('Triangulación'),            sub: () => __('Tres señales desconectadas apuntando al mismo lado') },
    tension:              { tab: 'tendencias', layout: 'fichas',  icon: 'comments',      label: () => __('Tensiones no resueltas'),   sub: () => __('Lo que sienten y ninguna marca aborda') },
    timing:               { tab: 'tendencias', layout: 'timing',  icon: 'calendar',      label: () => __('El momento exacto'),        sub: () => __('Qué ventana está abierta y cuánto le queda') },
    lo_que_falta:         { tab: 'tendencias', layout: 'fichas',  icon: 'idea',          label: () => __('Lo que falta'),             sub: () => __('Lo que nadie está diciendo y podrías decir primero') },
    // ── Estrategia ────────────────────────────────────────────────────────
    decision_del_dia:     { tab: 'estrategia', layout: 'decision', icon: 'flag',         label: () => __('La decisión de hoy'),       sub: () => __('Lo único que mueve la aguja hoy') },
    autoridad_adn:        { tab: 'estrategia', layout: 'fichas',  icon: 'shield',        label: () => __('¿Tengo autoridad para esto?'), sub: () => __('Qué puede decir esta marca sin sonar forzada') },
    puerta_aprobacion:    { tab: 'estrategia', layout: 'fichas',  icon: 'key',           label: () => __('Puerta de aprobación'),     sub: () => __('Lo que espera tu visto bueno') },
    produccion_viva:      { tab: 'estrategia', layout: 'horno',   icon: 'flows',         label: () => __('En el horno'),              sub: () => __('Qué está creando Vera ahora y qué está bloqueado') },
    pieza_asombro:        { tab: 'estrategia', layout: 'ensayo',  icon: 'film',          label: () => __('La pieza que provoca asombro'), sub: () => __('La propuesta del ciclo, producible mañana') },
    formato:              { tab: 'estrategia', layout: 'fichas',  icon: 'crop',          label: () => __('Formato que respira'),      sub: () => __('Por qué esta idea vive aquí y muere en el formato obvio') },
    cadena_portafolio:    { tab: 'estrategia', layout: 'cadena',  icon: 'link',          label: () => __('Cadena de portafolio'),     sub: () => __('Cómo esta pieza engancha con la siguiente hasta la venta') },
    verificacion:         { tab: 'estrategia', layout: 'verif',   icon: 'check',         label: () => __('Verificación antes de entregar'), sub: () => __('Qué revisé, qué corregí y qué rechacé') },
    brief_humano:         { tab: 'estrategia', layout: 'fichas',  icon: 'brief',         label: () => __('Brief para humanos'),       sub: () => __('Lo que necesita manos, cámaras o personas') },
    bucle_outcome:        { tab: 'estrategia', layout: 'bucle',   icon: 'history',       label: () => __('Lo que recomendé y qué pasó'), sub: () => __('Cada movida mía, con su resultado') },
    // ── Competencia · instrumentos (el ojo) y juicio (la cabeza) ──────────
    // La forma la fija el tablero; Vera solo alimenta la serie. Si ella pudiera
    // elegir el gráfico, el tablero cambiaría de idioma cada semana y el cliente
    // tendría que reaprenderlo en cada lectura.
    territorio_tematico:  { tab: 'monitoreo',  layout: 'heatmap',   icon: 'grid',      label: () => __('Territorio temático'),      sub: () => __('Qué ocupa cada quién — y qué columna está vacía') },
    registro_de_voz:      { tab: 'monitoreo',  layout: 'apilada',   icon: 'microphone', label: () => __('De qué está hecha su voz'), sub: () => __('Cómo suena cada competidor') },
    emocion_competencia:  { tab: 'monitoreo',  layout: 'divergente', icon: 'comments', label: () => __('Qué emoción provocan'),     sub: () => __('De qué lado cae la audiencia de cada uno — y cómo lo consigue') },
    busqueda_vs_voz:      { tab: 'monitoreo',  layout: 'indexadas', icon: 'search',    label: () => __('Te buscan o solo hablas'),  sub: () => __('La demanda se mueve meses antes que la venta') },
    supuesto_punto_ciego: { tab: 'monitoreo',  layout: 'fichas',    icon: 'eye-off',   label: () => __('Su supuesto y su punto ciego'), sub: () => __('Dónde se cree seguro y se equivoca') },
    proxima_movida:       { tab: 'monitoreo',  layout: 'fichas',    icon: 'compass',   label: () => __('Su próxima movida'),        sub: () => __('La apuesta, con la señal que la desmentiría') },
    // ── Sin tablero asignado (se pintan cuando exista dónde) ───────────────
    recalibracion:        { tab: null,         layout: 'ensayo',  icon: 'refresh',       label: () => __('Qué cambió en mi cabeza'),  sub: () => __('La creencia que se me cayó') },
    humildad:             { tab: null,         layout: 'ensayo',  icon: 'help',          label: () => __('¿Qué no estoy viendo?'),    sub: () => __('Dónde se acaba mi lectura') },
    a2a_readiness:        { tab: null,         layout: 'ensayo',  icon: 'bot',           label: () => __('Legible para máquinas'),    sub: () => __('Si una IA comparara tu categoría, ¿te elegiría?') },
  };

  /* Tonos: los mismos cuatro del resto del tablero (.cgo-item hereda de aquí). */
  const TONO = {
    opportunity: 'opp', oportunidad: 'opp', positive: 'opp', alta_positiva: 'opp',
    threat: 'threat', critical: 'threat', amenaza: 'threat',
    warning: 'warn', atencion: 'warn',
    neutral: 'neu',
  };

  /* Etiquetas de los campos que Vera clasifica. Se traducen aquí y no en el
     prompt: el contrato viaja en claves estables, la pantalla en idioma. */
  const ETIQUETA = {
    // severidad / veredictos
    responder_hoy: () => __('Responder hoy'), vigilar: () => __('Vigilar'), ignorar: () => __('Ignorar'),
    tomar: () => __('Tomar'), adaptar: () => __('Adaptar'), dejar_pasar: () => __('Dejar pasar'),
    causa_nuestra: () => __('Causa nuestra'), mezcla: () => __('Mezcla'), coincidencia: () => __('Coincidencia'),
    se_hizo: () => __('Se hizo'), no_se_hizo: () => __('No se hizo'), se_hizo_distinto: () => __('Se hizo distinto'),
    acerte: () => __('Acerté'), me_equivoque: () => __('Me equivoqué'), sin_datos: () => __('Sin datos'),
    cabe: () => __('Cabe'), cabe_moviendo: () => __('Cabe moviendo plata'), no_cabe: () => __('No cabe'),
    invisible: () => __('Invisible'), mencionada: () => __('Mencionada'), opcion_logica: () => __('Opción lógica'),
    // clases y estados
    pieza_retirada: () => __('Pieza retirada'), pregunta_sin_respuesta: () => __('Pregunta sin responder'),
    vigente: () => __('Vigente'), vence_pronto: () => __('Vence pronto'), vencido: () => __('Vencido'),
    investigando: () => __('Investigando'), creando: () => __('Creando'), verificando: () => __('Verificando'), lista: () => __('Lista'),
    existe: () => __('Existe'), falta: () => __('Falta'),
    // horizontes / fases / fuerza
    hoy: () => __('Hoy'), esta_semana: () => __('Esta semana'), este_mes: () => __('Este mes'),
    antes: () => __('Antes'), durante: () => __('Durante'), despues: () => __('Después'),
    fuerte: () => __('Señal fuerte'), media: () => __('Señal media'), tenue: () => __('Señal tenue'),
    caliente: () => __('Caliente'), tibio: () => __('Tibio'), frio: () => __('Frío'), girando: () => __('Girando'),
    // roles (misma doctrina que Competencia)
    competidor_directo: () => __('Competidor directo'), competidor_indirecto: () => __('Competidor indirecto'),
    referente: () => __('Referente'), aliado: () => __('Aliado'), otro_sector: () => __('Otro sector'),
    // quién ejecuta
    vera: () => __('Vera'), equipo_humano: () => __('Equipo humano'), ambos: () => __('Vera + equipo'),
    // puertas
    publicacion: () => __('Publicación'), crisis: () => __('Crisis'), estrategia: () => __('Estrategia'),
    gasto: () => __('Gasto'), contacto_externo: () => __('Contacto externo'),
    // confianza / prioridad
    alta: () => __('Alta'), baja: () => __('Baja'), exploratoria: () => __('Exploratoria'), sano: () => __('Sano'), justo: () => __('Justo'), malo: () => __('Malo'),
  };

  const eti = (v) => {
    const k = String(v == null ? '' : v).toLowerCase();
    return (ETIQUETA[k] ? ETIQUETA[k]() : String(v == null ? '' : v));
  };


  /* Paleta categórica — el orden es FIJO y nunca se cicla: si un tono cambia de
     posición entre lecturas, el cliente tiene que reaprender el gráfico. Son las
     6 primeras ranuras del sistema, validadas contra la superficie real de la
     card (#141517): banda de luminosidad, piso de croma, separación para daltonismo
     (peor par ΔE 8.4) y contraste ≥3:1. No se tocan sin volver a validar. */
  const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

  /* Par divergente: azul ↔ rojo (frío/cálido, leen como opuestos) con gris
     neutro al centro. Verde↔rojo se descartó: es el par que más falla con
     daltonismo, y aquí además la posición respecto al centro ya carga el signo. */
  const DIV_NEG = ['#e66767', '#b23c3c'];          // rechazo · indiferencia
  const DIV_NEU = '#4a4a46';                        // el centro tiene que leerse como "nada"
  const DIV_POS = ['#5598e7', '#3987e5', '#1c5cab']; // interés · deseo · devoción

  Object.assign(DashboardView.prototype, {

    /* ── Carga ────────────────────────────────────────────────────────────
       Una consulta por tab. Mi Marca pide la lectura del PERIODO activo (el
       tab tiene filtro Semana/Mes/Año/Todo); los otros tres no tienen filtro y
       piden la última. Nunca lanza: sin lectura, devuelve null y no se pinta. */
    async _loadVera4(scope) {
      if (!this._supabase || !this._orgId) return null;
      try {
        const base = () => this._supabase.from('vera_dashboard_readings')
          .select('reading, created_at, periodo')
          .eq('organization_id', this._orgId).eq('scope', scope).eq('status', 'published')
          .eq('schema_version', 4)          // cards.vera4 y nada mas
          .order('created_at', { ascending: false }).limit(1);
        let fila = null;
        if (scope === 'mi_marca' && typeof this._veraPeriodoActivo === 'function') {
          const { data } = await base().eq('periodo', this._veraPeriodoActivo());
          fila = (data && data[0]) || null;
        }
        if (!fila) {
          const { data } = await base();
          fila = (data && data[0]) || null;
        }
        const reading = fila && fila.reading;
        if (!reading || reading.schema !== 'cards.vera4' || !Array.isArray(reading.cards)) return null;
        return { cards: reading.cards, createdAt: fila.created_at };
      } catch (e) {
        console.warn('[Vera4] lectura no disponible:', e && e.message);
        return null;
      }
    },

    /* ── Pintado ──────────────────────────────────────────────────────────
       Idempotente (si ya hay un bloque .vera4 en el body, lo reemplaza) y
       silencioso: sin cards válidas para ESTE scope no deja rastro en el DOM.
       `host` opcional: si el tab tiene un sitio reservado se pinta ahí; si no,
       se cuelga al final de la página del tab. */
    async _renderVera4(body, scope, host) {
      if (!body) return;
      let datos;
      try { datos = await this._loadVera4(scope); } catch (_) { return; }
      const destino = host || body.querySelector('.vera4');
      if (!datos) { if (destino) destino.innerHTML = ''; return; }

      this._vera4At = datos.createdAt || null;
      const cards = datos.cards.filter((c) => c && VERA4[c.type] && VERA4[c.type].tab === scope);
      const html = cards.map((c) => this._vera4CardHtml(c)).filter(Boolean).join('');
      if (!html) { if (destino) destino.innerHTML = ''; return; }

      if (destino) {
        destino.innerHTML = html;
        destino.classList.add('vera4');
      } else {
        // Sin sitio reservado: se cuelga dentro de la página del tab para
        // heredar su ancho y su padding (si el tab está vacío, se crea).
        let page = body.querySelector('.insight-page');
        if (!page) {
          page = document.createElement('div');
          page.className = 'insight-page';
          body.appendChild(page);
        }
        const prev = page.querySelector('.vera4');
        if (prev) prev.remove();
        const wrap = document.createElement('div');
        wrap.className = 'vera4';
        wrap.innerHTML = html;
        page.appendChild(wrap);
      }
      // Color de marca en los paneles que lo piden (mismo helper del resto).
      body.querySelectorAll('.vera4 [data-panel-marca]').forEach((el) => this._vestirPanelDeMarca?.(el));
      // Los instrumentos con canvas se pintan cuando el HTML ya está en el DOM.
      this._paintVera4Charts(body.querySelector('.vera4') || body);
    },

    /* ── Plantillas ───────────────────────────────────────────────────────── */

    _vera4CardHtml(card) {
      const meta = VERA4[card && card.type];
      if (!meta) return '';                       // type desconocido → se ignora
      let cuerpo;
      try {
        switch (meta.layout) {
          case 'fichas':   cuerpo = this._v4Fichas(card); break;
          case 'ensayo':   cuerpo = this._v4Ensayo(card); break;
          case 'duo':      cuerpo = this._v4Duo(card); break;
          case 'pulso':    cuerpo = this._v4Pulso(card); break;
          case 'decision': cuerpo = this._v4Decision(card); break;
          case 'plata':    cuerpo = this._v4Plata(card); break;
          case 'latencia': cuerpo = this._v4Latencia(card); break;
          case 'ritmo':    cuerpo = this._v4Ritmo(card); break;
          case 'timing':   cuerpo = this._v4Timing(card); break;
          case 'triang':   cuerpo = this._v4Triangulacion(card); break;
          case 'horno':    cuerpo = this._v4Horno(card); break;
          case 'cadena':   cuerpo = this._v4Cadena(card); break;
          case 'verif':    cuerpo = this._v4Verificacion(card); break;
          case 'bucle':    cuerpo = this._v4Bucle(card); break;
          case 'heatmap':    cuerpo = this._v4Heatmap(card); break;
          case 'apilada':    cuerpo = this._v4Apilada(card); break;
          case 'divergente': cuerpo = this._v4Divergente(card); break;
          case 'indexadas':  cuerpo = this._v4Indexadas(card); break;
          default:         cuerpo = '';
        }
      } catch (e) {
        console.warn('[Vera4] card ilegible:', card && card.type, e && e.message);
        return '';
      }
      if (!cuerpo) return '';                     // card vacía → no deja marco huérfano
      return this._v4Marco(card, meta, cuerpo);
    },

    /* Marco común: título, subtítulo y pie con la frescura. Ancho completo
       cuando la card lo pide (`ancho`), media columna el resto. */
    _v4Marco(card, meta, cuerpo) {
      const esc = (s) => this._esc(s);
      const ancho = ['pulso', 'decision', 'ensayo', 'triang', 'cadena',
        'heatmap', 'apilada', 'divergente', 'indexadas'].includes(meta.layout);
      return `
        <section class="v4-card${ancho ? ' v4-card--ancha' : ''}" data-v4="${esc(card.type)}"
                 data-nuevo-id="${esc(this._nid ? this._nid('v4', card.type) : card.type)}">
          <header class="v4-head">
            <span class="v4-kind"><i class="aisc-ico aisc-ico--${esc(meta.icon)}" aria-hidden="true"></i>${esc(meta.label())}</span>
            <p class="v4-sub">${esc(meta.sub())}</p>
          </header>
          <div class="v4-body">${cuerpo}</div>
          ${this._v4Fecha(card)}
        </section>`;
    },

    /* Pie de frescura: una lectura vieja NO puede verse igual que una de hoy.
       Reusa el formato de Mi Marca; si no hay fecha, no se inventa el pie. */
    _v4Fecha(card) {
      const iso = (card && card.updated_at) || this._vera4At || null;
      const rel = (typeof this._veraHace === 'function') ? this._veraHace(iso) : '';
      if (!rel) return '';
      const txt = __('Última actualización {d}', { d: rel });
      const exacta = (typeof this._veraFechaExacta === 'function')
        ? __('Última actualización {d}', { d: this._veraFechaExacta(iso) }) : txt;
      return `<span class="vera-card-fecha" title="${this._esc(exacta)}">${this._esc(txt)}</span>`;
    },

    /* Helpers de campo: etiqueta + texto. `_v4Campo` omite el campo vacío en vez
       de pintar un rótulo huérfano. */
    _v4Campo(label, valor, cls) {
      if (valor == null || String(valor).trim() === '') return '';
      return `<div class="v4-campo${cls ? ' ' + cls : ''}">
        ${label ? `<span class="v4-campo-label">${this._esc(label)}</span>` : ''}
        <p class="v4-campo-txt">${this._esc(valor)}</p>
      </div>`;
    },
    _v4Chip(valor, tono) {
      if (valor == null || String(valor).trim() === '') return '';
      const t = tono || TONO[String(valor).toLowerCase()] || '';
      return `<span class="v4-chip${t ? ' is-' + t : ''}">${this._esc(eti(valor))}</span>`;
    },
    _v4Puntos(lista, cls) {
      const arr = Array.isArray(lista) ? lista.filter((x) => x != null && String(x).trim() !== '') : [];
      if (!arr.length) return '';
      return `<ul class="v4-puntos${cls ? ' ' + cls : ''}">${arr.map((x) => `<li>${this._esc(x)}</li>`).join('')}</ul>`;
    },


    /* ══ INSTRUMENTOS ══════════════════════════════════════════════════════
       La forma la fija el tablero, Vera solo alimenta la serie. Todos llevan:
       leyenda cuando hay 2+ series, etiquetas directas (la identidad nunca
       depende solo del color), su vista en tabla, y la nota de método cuando el
       dato es juicio y no medición. ══════════════════════════════════════════ */

    /* Nota al pie de los instrumentos de JUICIO. Un gráfico parece una medición
       aunque no lo sea: sin esto, un mapa de tonos se lee como si lo hubiera
       producido un sensor. */
    _v4Metodo(card) {
      if (!card || !card.nota_metodo) return '';
      return `<p class="v4-metodo"><i class="aisc-ico aisc-ico--alert-info" aria-hidden="true"></i>${
        this._esc(__('Lectura de Vera · {n}', { n: card.nota_metodo }))}</p>`;
    },

    /* Vista en tabla: todo gráfico tiene su gemela accesible. Va plegada para no
       competir con el instrumento, pero existe siempre. */
    _v4Tabla(cols, filas, titulo) {
      const esc = (s) => this._esc(s);
      return `<details class="v4-tabla">
        <summary>${esc(titulo || __('Ver los datos'))}</summary>
        <table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${filas.map((f) => `<tr>${f.map((c, i) => (i === 0
          ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>
      </details>`;
    },

    /* ── Heatmap: tema × perfil ────────────────────────────────────────────
       Dos ejes categóricos y una magnitud en cada cruce. Rampa de UN solo tono
       (más = más opaco): con varios tonos el ojo leería identidad donde solo hay
       cantidad. Lo que más vale es la columna VACÍA — el tema que nadie cubre —
       así que se marca a propósito con contorno punteado en vez de dejarla
       indistinguible de un cero. */
    _v4Heatmap(card) {
      const esc = (s) => this._esc(s);
      const temas = Array.isArray(card.temas) ? card.temas.slice(0, 8) : [];
      const perfiles = Array.isArray(card.perfiles) ? card.perfiles.slice(0, 6) : [];
      const celdas = Array.isArray(card.celdas) ? card.celdas : [];
      if (!temas.length || !perfiles.length) return '';
      const val = (i, j) => Number((celdas[i] || [])[j] || 0);
      // Una columna vacía es un hallazgo, no un hueco de datos: se nombra.
      const vacias = temas.map((_, j) => perfiles.every((__, i) => val(i, j) <= 0));

      const cabecera = temas.map((t, j) =>
        `<div class="v4-hm-th${vacias[j] ? ' is-vacia' : ''}" title="${esc(t)}">${esc(t)}</div>`).join('');
      const filas = perfiles.map((p, i) => `
        <div class="v4-hm-rh" title="${esc(p)}">${esc(p)}</div>
        ${temas.map((t, j) => {
          const v = val(i, j);
          const a = v <= 0 ? 0 : 0.12 + (Math.min(v, 100) / 100) * 0.78;
          return `<div class="v4-hm-c${v <= 0 ? ' is-cero' : ''}" style="--a:${a.toFixed(2)}"
            title="${esc(`${p} · ${t}: ${v}`)}" tabindex="0" role="img"
            aria-label="${esc(`${p}, ${t}, ${v} de 100`)}">${v >= 55 ? `<span>${v}</span>` : ''}</div>`;
        }).join('')}`).join('');

      const hueco = vacias.some(Boolean)
        ? `<p class="v4-hm-hueco"><i class="aisc-ico aisc-ico--idea" aria-hidden="true"></i>${
            esc(__('Nadie cubre: {t}', { t: temas.filter((_, j) => vacias[j]).join(' · ') }))}</p>` : '';

      return `<div class="v4-hm" style="--cols:${temas.length}">
          <div class="v4-hm-rh"></div>${cabecera}${filas}
        </div>
        <div class="v4-hm-leyenda"><span>${esc(__('menos'))}</span><i></i><span>${esc(__('más'))}</span></div>
        ${hueco}
        ${this._v4Metodo(card)}
        ${this._v4Tabla([__('Perfil')].concat(temas), perfiles.map((p, i) => [p].concat(temas.map((_, j) => val(i, j)))))}`;
    },

    /* ── Barra apilada al 100%: de qué está hecha su voz ───────────────────
       Una mezcla es parte-de-un-todo, y cada fila suma 100. El orden de los
       segmentos es el MISMO en todas las filas: así el ojo compara segmento
       contra segmento sin tener que buscar. Horizontal porque las etiquetas de
       tono son palabras, no números. */
    _v4Apilada(card) {
      const esc = (s) => this._esc(s);
      const tonos = Array.isArray(card.tonos) ? card.tonos.slice(0, 6) : [];
      const perfiles = Array.isArray(card.perfiles) ? card.perfiles.slice(0, 8) : [];
      if (!tonos.length || !perfiles.length) return '';
      const leyenda = tonos.map((t, i) =>
        `<span class="v4-leg"><i style="background:${SERIES[i % SERIES.length]}"></i>${esc(t)}</span>`).join('');
      const filas = perfiles.map((p) => {
        const mezcla = Array.isArray(p.mezcla) ? p.mezcla : [];
        const total = mezcla.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
        return `<div class="v4-ap-fila">
          <span class="v4-ap-nombre" title="${esc(p.perfil || '')}">${esc(p.perfil || '')}</span>
          <div class="v4-ap-barra" role="img" aria-label="${esc(tonos.map((t, i) =>
            `${t} ${Math.round((Number(mezcla[i]) || 0) / total * 100)}%`).join(', '))}">
            ${tonos.map((t, i) => {
              const pct = (Number(mezcla[i]) || 0) / total * 100;
              if (pct <= 0) return '';
              return `<span class="v4-ap-seg" style="width:${pct.toFixed(1)}%;background:${SERIES[i % SERIES.length]}"
                title="${esc(`${p.perfil} · ${t}: ${Math.round(pct)}%`)}">${
                pct >= 14 ? `<b>${Math.round(pct)}</b>` : ''}</span>`;
            }).join('')}
          </div></div>`;
      }).join('');
      return `<div class="v4-leyendas">${leyenda}</div><div class="v4-ap">${filas}</div>
        ${this._v4Metodo(card)}
        ${this._v4Tabla([__('Perfil')].concat(tonos), perfiles.map((p) =>
          [p.perfil].concat(tonos.map((_, i) => (Array.isArray(p.mezcla) ? (p.mezcla[i] ?? 0) : 0)))))}`;
    },

    /* ── Barra apilada DIVERGENTE: qué emoción provocan ────────────────────
       La emoción tiene polaridad, así que la escala se parte por el neutro: lo
       que aleja crece hacia la izquierda, lo que acerca hacia la derecha, y el
       ojo lee de qué lado cae cada perfil sin sumar nada. El neutro se reparte
       mitad y mitad para que el eje quede en el centro real de la escala. */
    _v4Divergente(card) {
      const esc = (s) => this._esc(s);
      const escala = Array.isArray(card.escala) ? card.escala : [];
      const perfiles = Array.isArray(card.perfiles) ? card.perfiles.slice(0, 8) : [];
      if (escala.length < 3 || !perfiles.length) return '';
      const iNeu = Math.max(1, escala.findIndex((e) => /neutr/i.test(String(e))));
      const color = (i) => (i < iNeu ? DIV_NEG[Math.min(i, DIV_NEG.length - 1)]
        : i === iNeu ? DIV_NEU : DIV_POS[Math.min(i - iNeu - 1, DIV_POS.length - 1)]);

      const leyenda = escala.map((e, i) =>
        `<span class="v4-leg"><i style="background:${color(i)}"></i>${esc(e)}</span>`).join('');
      const filas = perfiles.map((p) => {
        const v = (Array.isArray(p.valores) ? p.valores : []).map((x) => Number(x) || 0);
        const total = v.reduce((a, b) => a + b, 0) || 1;
        const pc = v.map((x) => x / total * 100);
        // El eje cae donde termina la mitad izquierda del neutro.
        const izq = pc.slice(0, iNeu).reduce((a, b) => a + b, 0) + (pc[iNeu] || 0) / 2;
        const seg = (i) => (pc[i] > 0
          ? `<span class="v4-dv-seg" style="width:${pc[i].toFixed(1)}%;background:${color(i)}"
               title="${esc(`${p.perfil} · ${escala[i]}: ${Math.round(pc[i])}%`)}"></span>` : '');
        return `<div class="v4-dv-fila">
          <span class="v4-ap-nombre" title="${esc(p.perfil || '')}">${esc(p.perfil || '')}</span>
          <div class="v4-dv-pista" role="img" aria-label="${esc(escala.map((e, i) =>
            `${e} ${Math.round(pc[i] || 0)}%`).join(', '))}">
            <div class="v4-dv-barra" style="transform:translateX(${(50 - izq).toFixed(2)}%)">
              ${escala.map((_, i) => seg(i)).join('')}
            </div></div>
          <span class="v4-dv-saldo">${pc.slice(iNeu + 1).reduce((a, b) => a + b, 0) >= pc.slice(0, iNeu).reduce((a, b) => a + b, 0)
            ? esc(__('acerca')) : esc(__('aleja'))}</span>
        </div>`;
      }).join('');
      return `<div class="v4-leyendas">${leyenda}</div>
        <div class="v4-dv"><div class="v4-dv-eje"></div>${filas}</div>
        ${this._v4Metodo(card)}
        ${this._v4Tabla([__('Perfil')].concat(escala), perfiles.map((p) =>
          [p.perfil].concat(escala.map((_, i) => (Array.isArray(p.valores) ? (p.valores[i] ?? 0) : 0)))))}`;
    },

    /* ── Dos líneas indexadas: te buscan o solo hablas ─────────────────────
       Son dos medidas de escalas distintas (búsquedas vs interacciones). La
       única forma honesta de ponerlas juntas es indexar ambas a 100 en el origen
       y usar UN eje: dos ejes Y inventarían una correlación que no está en el
       dato. Lo que se lee es el HUECO entre las curvas. */
    _v4Indexadas(card) {
      const esc = (s) => this._esc(s);
      const meses = Array.isArray(card.meses) ? card.meses : [];
      const series = Array.isArray(card.series) ? card.series.slice(0, 3) : [];
      if (meses.length < 2 || series.length < 1) return '';
      const cid = `v4idx-${this._nid ? this._nid('c', card.type).replace(/[^a-z0-9]/gi, '') : 'x'}`;
      const leyenda = series.map((s, i) =>
        `<span class="v4-leg"><i style="background:${SERIES[i % SERIES.length]}"></i>${esc(s.nombre || '')}</span>`).join('');
      return `<div class="v4-leyendas">${leyenda}</div>
        <div class="v4-chart-wrap"><canvas id="${cid}" data-v4chart='${
          this._esc(JSON.stringify({ meses, series: series.map((s, i) => ({
            nombre: s.nombre, valores: s.valores, color: SERIES[i % SERIES.length] })) }))}'></canvas></div>
        <p class="v4-campo-txt v4-campo-txt--tenue">${esc(card.base || __('Ambas series = 100 en el primer mes'))}</p>
        ${this._v4Tabla([__('Mes')].concat(series.map((s) => s.nombre)),
          meses.map((m, j) => [m].concat(series.map((s) => (Array.isArray(s.valores) ? (s.valores[j] ?? '') : '')))))}`;
    },

    /* Pinta los canvas que dejaron los instrumentos. Se llama DESPUÉS de meter
       el HTML: antes, el canvas todavía no existe en el DOM. */
    async _paintVera4Charts(raiz) {
      const canvas = raiz ? [...raiz.querySelectorAll('canvas[data-v4chart]')] : [];
      if (!canvas.length) return;
      try { await this._ensureChartJs(); } catch (_) { return; }
      if (typeof Chart === 'undefined') return;
      this._v4Charts = this._v4Charts || [];
      canvas.forEach((cv) => {
        let d; try { d = JSON.parse(cv.dataset.v4chart); } catch (_) { return; }
        this._v4Charts.push(new Chart(cv.getContext('2d'), {
          type: 'line',
          data: {
            labels: d.meses,
            datasets: (d.series || []).map((s) => ({
              label: s.nombre, data: s.valores, borderColor: s.color, backgroundColor: s.color,
              borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25,
            })),
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },   // cruz: los dos valores del mes
            plugins: { legend: { display: false } },            // la leyenda ya está en HTML
            scales: {
              x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.45)', maxRotation: 0, autoSkip: true } },
              y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'rgba(255,255,255,0.45)' } },
            },
          },
        }));
      });
    },
    /* ── fichas: la plantilla de lista (la misma familia visual de las
       Observaciones de Competencia). Cada type declara qué va en el filete,
       en los chips, en el título y en el cuerpo. ─────────────────────────── */
    _v4Fichas(card) {
      const S = {
        silencio:          { tono: () => 'warn', chips: ['clase'], meta: ['quien', 'desde'], titulo: 'que', campos: [[null, 'lectura']] },
        anomalia:          { tono: (i) => (i.veredicto === 'responder_hoy' ? 'threat' : i.veredicto === 'vigilar' ? 'warn' : 'neu'), chips: ['rol', 'veredicto', 'prioridad'], meta: ['perfil'], titulo: null, campos: [[() => __('Antes'), 'antes'], [() => __('Ahora'), 'ahora'], [() => __('Hipótesis'), 'hipotesis']] },
        error_ajeno:       { tono: (i) => (i.me_puede_pasar ? 'threat' : 'neu'), chips: ['rol'], meta: ['quien'], titulo: 'que_intento', campos: [[() => __('Cómo se ve que falló'), 'evidencia_del_fallo'], [() => __('Causa raíz'), 'causa_raiz'], [() => __('Qué ajusto'), 'que_ajusto']] },
        senal_debil:       { tono: (i) => (String(i.fuerza) === 'fuerte' ? 'opp' : 'neu'), chips: ['fuerza'], meta: ['ventana'], titulo: 'titulo', campos: [[() => __('Qué vi'), 'que_vi'], [() => __('Por qué casi nadie lo ve'), 'por_que_nadie_lo_ve'], [() => __('Si es real'), 'si_es_real']] },
        tension:           { tono: () => 'opp', chips: [], meta: ['de_donde'], titulo: 'tension', campos: [[() => __('Por qué nadie la toca'), 'por_que_nadie_la_toca'], [() => __('Qué diría la marca'), 'que_diria_la_marca']], cita: 'cita' },
        lo_que_falta:      { tono: (i) => (String(i.intencion_comercial) === 'alta' ? 'opp' : 'neu'), chips: ['intencion_comercial'], meta: [], titulo: 'hueco', campos: [[() => __('El mercado lo busca'), 'demanda_observada'], [() => __('Nadie lo cubre'), 'quien_no_lo_cubre'], [() => __('Tu ángulo'), 'angulo_de_la_marca']] },
        autoridad_adn:     { tono: (i) => (i.veredicto === 'tomar' ? 'opp' : i.veredicto === 'adaptar' ? 'warn' : 'neu'), chips: ['veredicto'], meta: [], titulo: 'senal', campos: [[() => __('Desde el ADN'), 'razon_desde_el_adn'], [() => __('Puerta de entrada'), 'puerta_de_entrada']] },
        puerta_aprobacion: { tono: (i) => (i.estado === 'vencido' ? 'threat' : i.estado === 'vence_pronto' ? 'warn' : 'neu'), chips: ['puerta', 'estado'], meta: ['espera_desde'], titulo: 'que', campos: [[() => __('Costo de esperar'), 'costo_de_esperar']] },
        formato:           { tono: () => 'neu', chips: ['formato'], meta: [], titulo: 'idea', campos: [[() => __('Se descarta'), 'descartado'], [() => __('Por qué moriría ahí'), 'por_que_moriria'], [() => __('La prueba'), 'prueba']] },
        supuesto_punto_ciego: { tono: (i) => (i.confianza === 'alta' ? 'opp' : 'neu'), chips: ['rol', 'confianza'], meta: ['perfil'], titulo: 'que_cree', campos: [[() => __('En qué se equivoca'), 'en_que_se_equivoca'], [() => __('La grieta se ve en'), 'evidencia_de_la_grieta'], [() => __('Cómo se explota'), 'como_se_explota']] },
        proxima_movida:    { tono: (i) => (i.confianza === 'alta' ? 'warn' : 'neu'), chips: ['confianza'], meta: ['perfil', 'revisar_el'], titulo: 'movida_probable', campos: [[() => __('Por qué ahora'), 'por_que_ahora'], [() => __('Lo confirmaría'), 'senal_que_la_confirma'], [() => __('Lo DESMENTIRÍA'), 'senal_que_la_desmiente'], [() => __('Si ocurre, hago'), 'si_ocurre_que_hago']] },
        brief_humano:      { tono: () => 'neu', chips: ['tiempo'], meta: ['con_quien', 'donde'], titulo: 'que', campos: [[() => __('Sirve a'), 'sirve_a'], [() => __('No hacer'), 'no_hacer'], [() => __('Listo cuando'), 'listo_cuando']], pasos: true },
      }[card.type];
      if (!S) return '';
      const items = Array.isArray(card.items) ? card.items.filter(Boolean) : [];
      if (!items.length) return '';
      const PRIO = { alta: 0, media: 1, baja: 2 };
      const orden = [...items].sort((a, b) =>
        (PRIO[String(a.prioridad || '').toLowerCase()] ?? 1) - (PRIO[String(b.prioridad || '').toLowerCase()] ?? 1));
      const esc = (s) => this._esc(s);
      return `<div class="v4-fichas">${orden.map((i) => {
        const chips = (S.chips || []).map((k) => this._v4Chip(i[k])).join('');
        const meta = (S.meta || []).map((k) => (i[k] ? `<span class="v4-quien">${esc(i[k])}</span>` : '')).join('');
        const titulo = S.titulo && i[S.titulo] ? `<h4 class="v4-ficha-titulo">${esc(i[S.titulo])}</h4>` : '';
        const cita = S.cita && i[S.cita] ? `<blockquote class="v4-cita">${esc(i[S.cita])}</blockquote>` : '';
        const campos = (S.campos || []).map(([l, k]) => this._v4Campo(l ? l() : '', i[k])).join('');
        const pasos = S.pasos ? this._v4Puntos(i.pasos) + this._v4Puntos(i.antes_de_grabar, 'v4-puntos--tenue') : '';
        return `<article class="v4-ficha is-${esc(S.tono(i) || 'neu')}">
          ${(meta || chips) ? `<div class="v4-ficha-head">${meta}${chips}</div>` : ''}
          ${titulo}${cita}${campos}${pasos}
        </article>`;
      }).join('')}</div>`;
    },

    /* ── ensayo: las cards de juicio largo. Cada una declara sus secciones en
       orden; lo que Vera no escribió simplemente no aparece. ─────────────── */
    _v4Ensayo(card) {
      const S = {
        emocion_objetivo:   [['destacado', 'emocion'], [() => __('Para quién'), 'para_quien'], [() => __('El momento'), 'momento'], [() => __('Qué la dispara'), 'que_la_dispara'], ['cita', 'cita']],
        autopsia:           [['titulo', 'pieza'], [() => __('Qué estuvo bien'), 'que_estuvo_bien'], ['destacado', 'culpable'], [() => __('Por qué'), 'por_que'], ['descartados', 'descartados'], ['leccion', 'leccion']],
        victoria_explicada: [['titulo', 'pieza'], [() => __('El mecanismo'), 'mecanismo'], ['condiciones', 'condiciones'], [() => __('Prueba contra la coincidencia'), 'prueba_contraria'], ['leccion', 'como_se_repite']],
        causalidad:         [['titulo', 'resultado'], ['destacado', 'veredicto'], ['alternativas', 'alternativas'], ['prueba', 'prueba_propuesta']],
        pieza_asombro:      [['titulo', 'titulo'], [() => __('La escena'), 'escena'], ['destacado', 'formato'], [() => __('Por qué este formato'), 'por_que_este_formato'], ['copy', 'copy_semilla'], [() => __('Por qué nadie más la haría'), 'por_que_nadie_mas'], ['necesita', 'que_necesita']],
        recalibracion:      [[() => __('Creía'), 'creia'], [() => __('Lo tumbó'), 'lo_tumbo'], [() => __('Ahora creo'), 'ahora_creo'], ['leccion', 'que_hago_distinto']],
        humildad:           [['faltante', 'dato_faltante'], ['fragil', 'afirmacion_fragil'], ['angulo', 'angulo_no_corrido']],
        a2a_readiness:      [['destacado', 'veredicto'], ['consulta', 'consulta'], [() => __('Riqueza semántica'), 'riqueza_semantica'], [() => __('Historia de relevancia'), 'historia_de_relevancia'], [() => __('Reputación'), 'reputacion'], ['falta', 'que_falta']],
      }[card.type];
      if (!S) return '';
      const esc = (s) => this._esc(s);
      const partes = S.map(([modo, k]) => {
        const v = card[k];
        if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return '';
        if (typeof modo === 'function') return this._v4Campo(modo(), v);
        switch (modo) {
          case 'titulo':    return `<h4 class="v4-titulo">${esc(v)}</h4>`;
          case 'destacado': return `<p class="v4-destacado">${esc(eti(v))}</p>`;
          case 'cita':      return `<blockquote class="v4-cita">${esc(v)}</blockquote>`;
          case 'copy':      return `<div class="v4-copy"><span class="v4-campo-label">${esc(__('Copy semilla'))}</span><p>${esc(v)}</p></div>`;
          case 'leccion':   return `<div class="v4-leccion"><i class="aisc-ico aisc-ico--idea" aria-hidden="true"></i><p>${esc(v)}</p></div>`;
          case 'necesita':  return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Qué necesita'))}</span>${this._v4Puntos(v)}</div>`;
          case 'descartados':
            return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Descartados'))}</span>${
              this._v4Puntos(v.map((d) => `${eti(d.sospechoso)}: ${d.por_que_no || ''}`))}</div>`;
          case 'condiciones':
            return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Condiciones'))}</span><div class="v4-fichas v4-fichas--min">${
              v.map((c) => `<article class="v4-ficha is-${c.repetible ? 'opp' : 'neu'}">
                <div class="v4-ficha-head">${this._v4Chip(c.repetible ? __('Repetible') : __('Suerte prestada'), c.repetible ? 'opp' : 'neu')}</div>
                <p class="v4-campo-txt">${esc(c.condicion || '')}</p></article>`).join('')}</div></div>`;
          case 'alternativas':
            return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Explicaciones alternativas'))}</span>${
              this._v4Puntos(v.map((a) => `${a.explicacion || ''} — ${a.descartada_porque || ''}`))}</div>`;
          case 'prueba':
            return this._v4Campo(__('La prueba que lo dirime'),
              [v.como, v.mide ? `${__('mide')}: ${v.mide}` : '', v.dura ? `${__('dura')}: ${v.dura}` : ''].filter(Boolean).join(' · '));
          case 'consulta':
            return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Se le preguntó a una IA'))}</span>
              ${v.pregunta ? `<blockquote class="v4-cita">${esc(v.pregunta)}</blockquote>` : ''}
              <p class="v4-campo-txt">${esc(v.que_respondio || '')}</p>
              ${v.errores ? this._v4Campo(__('Se equivoca en'), v.errores) : ''}</div>`;
          case 'faltante':
            return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Dato que no tengo'))}</span>${
              this._v4Puntos(v.map((d) => `${d.que || ''} — ${d.que_decision_cojea || ''}`))}</div>`;
          case 'fragil':
            return this._v4Campo(__('Mi afirmación más frágil'), [v.cual, v.por_que_fragil].filter(Boolean).join(' — '));
          case 'angulo':
            return this._v4Campo(__('Ángulo que no corrí'), [v.cual, v.que_podria_esconder].filter(Boolean).join(' — '));
          case 'falta':
            return `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Qué falta'))}</span>${
              this._v4Puntos(v.map((f) => f.accion))}</div>`;
          default: return '';
        }
      });
      return partes.join('');
    },

    /* ── duo: dos listas enfrentadas (lo que rinde / lo que es ruido). ────── */
    _v4Duo(card) {
      const esc = (s) => this._esc(s);
      const col = (titulo, arr, campo, tono) => {
        const items = Array.isArray(arr) ? arr.filter(Boolean) : [];
        if (!items.length) return '';
        return `<div class="v4-duo-col is-${tono}">
          <span class="v4-campo-label">${esc(titulo)}</span>
          ${items.map((i) => `<article class="v4-ficha is-${tono}">
            <h4 class="v4-ficha-titulo">${esc(i.que || '')}</h4>
            <p class="v4-campo-txt">${esc(i[campo] || '')}</p></article>`).join('')}
        </div>`;
      };
      const izq = col(__('Mueve la aguja'), card.impacto, 'mecanismo', 'opp');
      const der = col(__('Solo ocupa espacio'), card.ruido, 'por_que_no_mueve', 'threat');
      if (!izq && !der) return '';
      const cierre = card.dejar_de_hacer
        ? `<div class="v4-leccion"><i class="aisc-ico aisc-ico--eraser" aria-hidden="true"></i><p>${esc(card.dejar_de_hacer)}</p></div>` : '';
      return `<div class="v4-duo">${izq}${der}</div>${cierre}`;
    },

    /* ── pulso: el veredicto de glance de Tendencias. ─────────────────────── */
    _v4Pulso(card) {
      if (!card.titular && !card.numero) return '';
      const esc = (s) => this._esc(s);
      const estado = String(card.estado || 'tibio').toLowerCase();
      const tono = { caliente: 'opp', girando: 'warn', tibio: 'neu', frio: 'threat' }[estado] || 'neu';
      return `<div class="v4-pulso is-${tono}">
        <div class="v4-pulso-cifra">
          <span class="v4-num">${esc(card.numero != null ? card.numero : '')}</span>
          ${card.delta ? `<span class="v4-delta">${esc(card.delta)}</span>` : ''}
          ${this._v4Chip(estado, tono)}
        </div>
        ${card.titular ? `<h4 class="v4-titular">${esc(card.titular)}</h4>` : ''}
      </div>
      ${card.markdown ? `<p class="v4-campo-txt">${esc(card.markdown)}</p>` : ''}`;
    },

    /* ── decision: la card que estrena Estrategia. ────────────────────────── */
    _v4Decision(card) {
      if (!card.decision) return '';
      const esc = (s) => this._esc(s);
      return `<div class="v4-decision">
        <h4 class="v4-titular">${esc(card.decision)}</h4>
        <div class="v4-ficha-head">
          ${this._v4Chip(card.horizonte, card.horizonte === 'hoy' ? 'threat' : 'warn')}
          ${this._v4Chip(card.quien)}
          ${card.confianza ? this._v4Chip(__('Confianza {c}', { c: eti(card.confianza) })) : ''}
        </div>
        ${this._v4Campo(__('Por qué'), card.por_que)}
        ${card.costo_de_no_hacerla ? `<div class="v4-leccion is-threat"><i class="aisc-ico aisc-ico--alert-warning" aria-hidden="true"></i>
          <p><strong>${esc(__('Si esto espera'))}:</strong> ${esc(card.costo_de_no_hacerla)}</p></div>` : ''}
      </div>`;
    },

    /* ── plata: el eje que hoy no existe en ningún tab. ───────────────────── */
    _v4Plata(card) {
      const esc = (s) => this._esc(s);
      const k = card.kpi || {};
      if (!card.gastado && !k.valor) return '';
      const tonoKpi = { sano: 'opp', justo: 'warn', malo: 'threat' }[String(k.estado || '').toLowerCase()] || 'neu';
      const tonoVer = { cabe: 'opp', cabe_moviendo: 'warn', no_cabe: 'threat' }[String(card.veredicto || '').toLowerCase()] || 'neu';
      return `<div class="v4-plata">
        <div class="v4-plata-cifra">
          <span class="v4-num">${esc(card.gastado || '—')}</span>
          <span class="v4-campo-label">${esc(card.ventana || __('Gastado en el periodo'))}</span>
        </div>
        ${k.valor ? `<div class="v4-plata-kpi is-${tonoKpi}">
          <span class="v4-kpi-nombre">${esc(k.nombre || '')}</span>
          <span class="v4-kpi-valor">${esc(k.valor)}</span>
          ${k.vara ? `<span class="v4-kpi-vara">${esc(k.vara)}</span>` : ''}
        </div>` : ''}
      </div>
      ${this._v4Campo(__('Ritmo de quema'), card.ritmo)}
      ${card.veredicto ? `<p class="v4-destacado is-${tonoVer}">${esc(eti(card.veredicto))}</p>` : ''}
      ${this._v4Campo(__('De dónde sale'), card.de_donde_sale)}
      ${card.markdown ? `<p class="v4-campo-txt">${esc(card.markdown)}</p>` : ''}`;
    },

    /* ── latencia: el Principio de Latencia Cero, en días. ────────────────── */
    _v4Latencia(card) {
      const esc = (s) => this._esc(s);
      if (card.dias_promedio == null && !card.peor) return '';
      const peor = card.peor || {}, mejor = card.mejor || {};
      return `<div class="v4-latencia">
        <div class="v4-pulso-cifra">
          <span class="v4-num">${esc(card.dias_promedio != null ? card.dias_promedio : '—')}</span>
          <span class="v4-campo-label">${esc(__('días en reaccionar (promedio)'))}</span>
          ${card.delta ? `<span class="v4-delta">${esc(card.delta)}</span>` : ''}
        </div>
        <div class="v4-fichas v4-fichas--min">
          ${peor.ventana ? `<article class="v4-ficha is-threat">
            <div class="v4-ficha-head">${this._v4Chip(__('La que se perdió'), 'threat')}</div>
            <h4 class="v4-ficha-titulo">${esc(peor.ventana)}</h4>
            <p class="v4-campo-txt">${esc([peor.se_abrio ? `${__('se abrió')} ${peor.se_abrio}` : '', peor.reaccion ? `${__('reacción')} ${eti(peor.reaccion)}` : ''].filter(Boolean).join(' · '))}</p>
            ${peor.costo ? `<p class="v4-campo-txt">${esc(peor.costo)}</p>` : ''}</article>` : ''}
          ${mejor.ventana ? `<article class="v4-ficha is-opp">
            <div class="v4-ficha-head">${this._v4Chip(__('La mejor reacción'), 'opp')}</div>
            <h4 class="v4-ficha-titulo">${esc(mejor.ventana)}</h4>
            <p class="v4-campo-txt">${esc(mejor.dias != null ? __('{n} días', { n: mejor.dias }) : '')}</p>
            ${mejor.que_se_hizo ? `<p class="v4-campo-txt">${esc(mejor.que_se_hizo)}</p>` : ''}</article>` : ''}
        </div>
      </div>
      ${card.markdown ? `<p class="v4-campo-txt">${esc(card.markdown)}</p>` : ''}`;
    },

    /* ── ritmo: ráfagas y silencios, no conteo de posts. ──────────────────── */
    _v4Ritmo(card) {
      const esc = (s) => this._esc(s);
      const raf = Array.isArray(card.rafagas) ? card.rafagas.filter(Boolean) : [];
      const sil = Array.isArray(card.silencios) ? card.silencios.filter(Boolean) : [];
      if (!raf.length && !sil.length && !card.instruccion) return '';
      return `<div class="v4-fichas v4-fichas--min">
        ${raf.map((r) => `<article class="v4-ficha is-warn">
          <div class="v4-ficha-head">${this._v4Chip(__('Ráfaga'), 'warn')}<span class="v4-quien">${esc(r.cuando || '')}</span></div>
          <p class="v4-campo-txt">${esc(r.piezas != null ? __('{n} piezas compitiendo entre sí', { n: r.piezas }) : '')}</p>
          ${r.costo ? `<p class="v4-campo-txt">${esc(r.costo)}</p>` : ''}</article>`).join('')}
        ${sil.map((s) => `<article class="v4-ficha is-threat">
          <div class="v4-ficha-head">${this._v4Chip(__('Silencio'), 'threat')}<span class="v4-quien">${esc([s.desde, s.hasta].filter(Boolean).join(' → '))}</span></div>
          ${s.ventana_perdida ? `<p class="v4-campo-txt">${esc(s.ventana_perdida)}</p>` : ''}</article>`).join('')}
      </div>
      ${card.instruccion ? `<div class="v4-leccion"><i class="aisc-ico aisc-ico--calendar" aria-hidden="true"></i><p>${esc(card.instruccion)}</p></div>` : ''}`;
    },

    /* ── timing: ventanas abiertas + lo que todavía es pronto. ────────────── */
    _v4Timing(card) {
      const esc = (s) => this._esc(s);
      const ab = Array.isArray(card.abiertas) ? card.abiertas.filter(Boolean) : [];
      const pr = Array.isArray(card.demasiado_pronto) ? card.demasiado_pronto.filter(Boolean) : [];
      if (!ab.length && !pr.length) return '';
      return `${ab.length ? `<div class="v4-fichas">
        ${ab.map((v) => `<article class="v4-ficha is-opp">
          <div class="v4-ficha-head">${this._v4Chip(v.fase)}${v.cierra ? `<span class="v4-quien">${esc(__('cierra {d}', { d: v.cierra }))}</span>` : ''}</div>
          <h4 class="v4-ficha-titulo">${esc(v.ventana || '')}</h4>
          ${this._v4Campo(__('Qué exige ahora'), v.que_exige_ahora)}</article>`).join('')}
      </div>` : ''}
      ${pr.length ? `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Todavía es demasiado pronto'))}</span>${
        this._v4Puntos(pr.map((p) => [p.que, p.volver_a_mirar ? `${__('volver a mirar')} ${p.volver_a_mirar}` : '', p.por_que].filter(Boolean).join(' · ')), 'v4-puntos--tenue')}</div>` : ''}`;
    },

    /* ── triangulación: el cruce, con las señales como prueba. ────────────── */
    _v4Triangulacion(card) {
      const esc = (s) => this._esc(s);
      const se = Array.isArray(card.senales) ? card.senales.filter(Boolean) : [];
      if (!se.length && !card.conclusion) return '';
      return `${card.nombre_opportunidad || card.nombre_oportunidad ? `<h4 class="v4-titulo">${esc(card.nombre_oportunidad || card.nombre_opportunidad)}</h4>` : ''}
      <div class="v4-triang">${se.map((s) => `<div class="v4-triang-senal">
        ${this._v4Chip(s.fuente)}<p class="v4-campo-txt">${esc(s.observacion || '')}</p>
      </div>`).join('')}</div>
      ${card.conclusion ? `<div class="v4-leccion"><i class="aisc-ico aisc-ico--layers" aria-hidden="true"></i><p>${esc(card.conclusion)}</p></div>` : ''}
      ${card.confianza ? `<div class="v4-ficha-head">${this._v4Chip(__('Confianza {c}', { c: eti(card.confianza) }))}</div>` : ''}`;
    },

    /* ── horno: el state.md de Vera, visible. ─────────────────────────────── */
    _v4Horno(card) {
      const esc = (s) => this._esc(s);
      const cur = Array.isArray(card.en_curso) ? card.en_curso.filter(Boolean) : [];
      const blq = Array.isArray(card.bloqueado) ? card.bloqueado.filter(Boolean) : [];
      if (!card.accion_actual && !cur.length && !blq.length) return '';
      return `${card.accion_actual ? `<p class="v4-destacado">${esc(card.accion_actual)}</p>` : ''}
      ${cur.length ? `<div class="v4-fichas v4-fichas--min">${cur.map((p) => `<article class="v4-ficha is-neu">
        <div class="v4-ficha-head">${this._v4Chip(p.estado)}${p.formato ? `<span class="v4-quien">${esc(p.formato)}</span>` : ''}</div>
        <h4 class="v4-ficha-titulo">${esc(p.pieza || '')}</h4>
        ${p.sirve_a ? `<p class="v4-campo-txt">${esc(p.sirve_a)}</p>` : ''}</article>`).join('')}</div>` : ''}
      ${blq.length ? `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Bloqueado'))}</span>${
        this._v4Puntos(blq.map((b) => [b.que, b.por, b.desde].filter(Boolean).join(' — ')))}</div>` : ''}
      ${Array.isArray(card.proximas) && card.proximas.length
        ? `<div class="v4-campo"><span class="v4-campo-label">${esc(__('Próximas acciones'))}</span>${this._v4Puntos(card.proximas, 'v4-puntos--tenue')}</div>` : ''}`;
    },

    /* ── cadena: los eslabones y dónde se rompe. ──────────────────────────── */
    _v4Cadena(card) {
      const esc = (s) => this._esc(s);
      const es = Array.isArray(card.eslabones) ? card.eslabones.filter(Boolean) : [];
      if (!es.length && !card.roto_en) return '';
      return `${es.length ? `<ol class="v4-cadena">${es.map((e) => `<li class="v4-eslabon${e.estado === 'falta' ? ' is-falta' : ''}">
        <span class="v4-eslabon-pieza">${esc(e.pieza || '')}</span>
        ${e.canal ? `<span class="v4-quien">${esc(e.canal)}</span>` : ''}
        ${e.empuja_a ? `<span class="v4-eslabon-flecha">→ ${esc(e.empuja_a)}</span>` : ''}
      </li>`).join('')}</ol>` : ''}
      ${card.roto_en ? `<div class="v4-leccion is-threat"><i class="aisc-ico aisc-ico--alert-warning" aria-hidden="true"></i>
        <p><strong>${esc(__('Se rompe en'))}:</strong> ${esc(card.roto_en)}${card.que_se_pierde ? ` — ${esc(card.que_se_pierde)}` : ''}</p></div>` : ''}
      ${this._v4Campo(__('Cómo se arregla'), card.como_se_arregla)}`;
    },

    /* ── verificación: la trazabilidad de la autocrítica. ─────────────────── */
    _v4Verificacion(card) {
      const esc = (s) => this._esc(s);
      const cor = Array.isArray(card.corregidas) ? card.corregidas.filter(Boolean) : [];
      const rec = Array.isArray(card.rechazadas) ? card.rechazadas.filter(Boolean) : [];
      if (!cor.length && !rec.length && card.revisadas == null) return '';
      return `<div class="v4-verif-cifras">
        ${card.revisadas != null ? `<span class="v4-chip">${esc(__('{n} revisadas', { n: card.revisadas }))}</span>` : ''}
        ${cor.length ? `<span class="v4-chip is-warn">${esc(__('{n} corregidas', { n: cor.length }))}</span>` : ''}
        ${rec.length ? `<span class="v4-chip is-threat">${esc(__('{n} rechazadas', { n: rec.length }))}</span>` : ''}
      </div>
      ${cor.length ? this._v4Puntos(cor.map((c) => `${c.pieza || ''}: ${c.que_estaba_mal || ''}`)) : ''}
      ${rec.length ? this._v4Puntos(rec.map((r) => `${r.pieza || ''}: ${r.por_que || ''}`), 'v4-puntos--tenue') : ''}
      ${card.markdown ? `<p class="v4-campo-txt">${esc(card.markdown)}</p>` : ''}`;
    },

    /* ── bucle: lo que recomendé y qué pasó. La card que la hace auditable. ── */
    _v4Bucle(card) {
      const esc = (s) => this._esc(s);
      const items = Array.isArray(card.items) ? card.items.filter(Boolean) : [];
      if (!items.length) return '';
      const TONO_V = { acerte: 'opp', me_equivoque: 'threat', sin_datos: 'neu' };
      return `${card.tasa_acierto ? `<p class="v4-destacado">${esc(__('Tasa de acierto: {t}', { t: card.tasa_acierto }))}</p>` : ''}
      <div class="v4-fichas v4-fichas--min">${items.map((i) => `<article class="v4-ficha is-${TONO_V[String(i.veredicto || '').toLowerCase()] || 'neu'}">
        <div class="v4-ficha-head">${this._v4Chip(i.estado)}${this._v4Chip(i.veredicto)}${i.cuando ? `<span class="v4-quien">${esc(i.cuando)}</span>` : ''}</div>
        <h4 class="v4-ficha-titulo">${esc(i.movida || '')}</h4>
        ${i.resultado ? `<p class="v4-campo-txt">${esc(i.resultado)}</p>` : ''}
        ${i.por_que_no ? `<p class="v4-campo-txt v4-campo-txt--tenue">${esc(i.por_que_no)}</p>` : ''}
      </article>`).join('')}</div>
      ${card.markdown ? `<p class="v4-campo-txt">${esc(card.markdown)}</p>` : ''}`;
    },
  });
})();
