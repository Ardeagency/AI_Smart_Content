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
 *               ritmo · autopsia · victoria_explicada · causalidad
 *   Competencia anomalia · error_ajeno · algoritmo_rival
 *   Tendencias  pulso_nicho · senal_debil · triangulacion · tension · lo_que_falta ·
 *               propuestas_fecha
 *   Estrategia  decision_del_dia · autoridad_adn · puerta_aprobacion · produccion_viva ·
 *               pieza_asombro · formato · cadena_portafolio · verificacion ·
 *               brief_humano · bucle_outcome
 *   Sin tab     recalibracion · humildad · a2a_readiness (tab: null — hablan de Vera,
 *               no de la marca; se pintan solas el día que exista dónde ponerlas).
 *   En tres     intuicion (tab: [monitoreo, tendencias, estrategia]) — la ÚNICA que
 *               vive en varios, y escribe UNA DISTINTA en cada uno: el rival, el
 *               mercado, la jugada. Antes había una sola (la de Mi Marca) que el
 *               frontend copiaba a los otros tres tabs. Va en banda propia
 *               (`aparte: true`), fuera de la rejilla, con el skin de la
 *               Intuición de Mi Marca. Ver _renderIntuicionDelTab.
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
    ritmo:                { tab: 'mi_marca',   layout: 'ritmo',   icon: 'clock',         label: () => __('Ritmo real'),               sub: () => __('Ráfagas que compiten contigo y silencios en ventanas abiertas') },
    autopsia:             { tab: 'mi_marca',   layout: 'ensayo',  icon: 'flask',         label: () => __('Autopsia'),                 sub: () => __('La pieza que no funcionó, sin excusas') },
    victoria_explicada:   { tab: 'mi_marca',   layout: 'ensayo',  icon: 'star',          label: () => __('Victoria explicada'),       sub: () => __('Por qué ganó y cómo se repite') },
    causalidad:           { tab: 'mi_marca',   layout: 'ensayo',  icon: 'git-branch',    label: () => __('¿Lo causé yo?'),            sub: () => __('Qué parte del resultado es mérito nuestro') },
    // ── Competencia ───────────────────────────────────────────────────────
    anomalia:             { tab: 'monitoreo',  layout: 'fichas',  icon: 'alert-warning', label: () => __('Anomalías del rival'),      sub: () => __('El movimiento raro y qué lo motivó') },
    error_ajeno:          { tab: 'monitoreo',  layout: 'fichas',  icon: 'ban',           label: () => __('Errores ajenos'),           sub: () => __('El fracaso del otro, y si yo podría cometerlo') },
    // "Algoritmo" tambien existe en Mi Marca (cards.v2) y NO son la misma card:
    // alla se lee como el algoritmo trata a la cuenta propia; aqui, que esta
    // premiando en los perfiles vigilados. Mismo nombre, sujeto distinto.
    algoritmo_rival:      { tab: 'monitoreo',  layout: 'algoritmo', icon: 'compass',     label: () => __('Algoritmo'),                sub: () => __('Qué está premiando la distribución en los perfiles que vigilas') },
    // ── Tendencias ────────────────────────────────────────────────────────
    pulso_nicho:          { tab: 'tendencias', layout: 'pulso',   icon: 'zap',           label: () => __('Latido del mercado'),       sub: () => __('Qué tan caliente está tu nicho y hacia dónde se mueve') },
    senal_debil:          { tab: 'tendencias', layout: 'fichas',  icon: 'wind',          label: () => __('Señales débiles'),          sub: () => __('Lo que todavía nadie nombró') },
    triangulacion:        { tab: 'tendencias', layout: 'triang',  icon: 'layers',        label: () => __('Triangulación'),            sub: () => __('Tres señales desconectadas apuntando al mismo lado') },
    tension:              { tab: 'tendencias', layout: 'fichas',  icon: 'comments',      label: () => __('Tensiones no resueltas'),   sub: () => __('Lo que sienten y ninguna marca aborda') },
    lo_que_falta:         { tab: 'tendencias', layout: 'fichas',  icon: 'idea',          label: () => __('Lo que falta'),             sub: () => __('Lo que nadie está diciendo y podrías decir primero') },
    // `aparte`: no entra en la rejilla — vive pegada al calendario de Próximas
    // Fechas, porque sin la fecha al lado las propuestas son ideas sueltas.
    propuestas_fecha:     { tab: 'tendencias', aparte: true, layout: 'propuestas', icon: 'idea', label: () => __('Propuestas de oportunidad'), sub: () => __('Dos ideas por fecha, hechas para esta marca') },
    // ── Tendencias · la disciplina de futuros ─────────────────────────────
    // Un tablero de tendencias falla siempre igual: informa del mundo y no dice
    // qué hacer con él. Estas cinco existen para responder las tres preguntas
    // que lo salvan — ¿es real?, ¿en qué horizonte vive?, ¿a mí me toca?
    crecimiento_categoria: { tab: 'tendencias', layout: 'descomposicion', icon: 'growth',   label: () => __('Crece la categoría o te quitan cuota'), sub: () => __('Si subiste, ¿fue el nicho entero o fuiste tú?') },
    tendencia_o_moda:     { tab: 'tendencias', layout: 'trendmoda',     icon: 'flask',    label: () => __('Tendencia o moda'),          sub: () => __('Cuál sigue viva en tres meses y cuál se apaga en tres semanas') },
    tres_horizontes:      { tab: 'tendencias', layout: 'horizontes',    icon: 'layers',   label: () => __('Los tres horizontes'),       sub: () => __('Qué exige acción hoy, qué preparar y qué solo vigilar') },
    derecho_a_jugar:      { tab: 'tendencias', layout: 'fichas',        icon: 'shield',   label: () => __('¿A esta marca le toca?'),    sub: () => __('De todo lo que se mueve, en qué tienes derecho a jugar') },
    curva_adopcion:       { tab: 'tendencias', layout: 'apilada',       icon: 'audience', label: () => __('Quién está adoptando esto'), sub: () => __('¿Lo mueven los pioneros o ya llegó a la mayoría?') },
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
    // ── Mi Marca · salud de marca (lo que un CMO mira primero) ────────────
    // Las dos primeras se alimentan de datos que YA se computan en la base y que
    // hasta hoy no llegaban a ninguna pantalla.
    cobertura_momentos:     { tab: 'mi_marca', layout: 'enfasis',   icon: 'goal',       label: () => __('En qué momentos te piensan'),  sub: () => __('Las situaciones que cubres — y el hueco por donde entra otro') },
    rejilla_codigos:        { tab: 'mi_marca', layout: 'dispersion', icon: 'palette',   label: () => __('Tus códigos'),                 sub: () => __('Cuáles son famosos y cuáles son solo tuyos') },
    deriva_codigos:         { tab: 'mi_marca', layout: 'lineas',    icon: 'history',    label: () => __('La deriva de tus códigos'),    sub: () => __('Lo que se está apagando sin que nadie lo note') },
    construir_vs_cosechar:  { tab: 'mi_marca', layout: 'balanza',   icon: 'growth',     label: () => __('Construyes o cosechas'),       sub: () => __('La balanza que se desliza sola hacia lo que paga hoy') },
    aplauso_vs_propagacion: { tab: 'mi_marca', layout: 'dispersion', icon: 'likes',     label: () => __('Te aplauden o te propagan'),   sub: () => __('Lo que gusta no es lo que construye') },
    penetracion_vs_lealtad: { tab: 'mi_marca', layout: 'indexadas', icon: 'audience',   label: () => __('Creces por más gente o por los mismos'), sub: () => __('La lealtad es consecuencia del tamaño, no su causa') },
    biblioteca_patrones:    { tab: 'mi_marca', layout: 'patrones',  icon: 'memory',     label: () => __('Lo que aprendí de esta marca'), sub: () => __('Los patrones, con su marcador honesto') },
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
    // ── La Intuición: vive en TRES tabs, una DISTINTA por tab ─────────────
    // `aparte` = no entra en la rejilla de cards: es una banda propia, con el
    // skin de la Intuición de Mi Marca (.vera-card--intuicion, acento de marca).
    // Su rótulo y su subtítulo salen de INTU_TAB, porque el sujeto cambia.
    intuicion:            { tab: ['monitoreo', 'tendencias', 'estrategia'], aparte: true, layout: 'intuicion', icon: 'sparkle', label: () => __('Intuición'), sub: () => '' },
    // ── Sin tablero asignado (se pintan cuando exista dónde) ───────────────
    recalibracion:        { tab: null,         layout: 'ensayo',  icon: 'refresh',       label: () => __('Qué cambió en mi cabeza'),  sub: () => __('La creencia que se me cayó') },
    humildad:             { tab: null,         layout: 'ensayo',  icon: 'help',          label: () => __('¿Qué no estoy viendo?'),    sub: () => __('Dónde se acaba mi lectura') },
    a2a_readiness:        { tab: null,         layout: 'ensayo',  icon: 'bot',           label: () => __('Legible para máquinas'),    sub: () => __('Si una IA comparara tu categoría, ¿te elegiría?') },
  };

  /* La Intuición es la MISMA lente en los tres tabs, pero NO el mismo sujeto:
     el rival, el mercado, la jugada. Hasta el 2026-07-31 había una sola —la de
     Mi Marca— y el frontend la copiaba al pie de los otros tres: el cliente leía
     el mismo párrafo cuatro veces, justo en la única capa donde Vera dice lo que
     un tablero no puede decir. El rótulo lo pone la pantalla (el contrato viaja
     en claves estables, la pantalla en idioma).
     Mi Marca NO está aquí: la suya es cards.v2 y la pinta BrandGrid en su Nivel 2. */
  const INTU_TAB = {
    monitoreo:  { kicker: () => __('Intuición sobre la competencia'), sub: () => __('El porqué del movimiento del rival que su tablero no dice') },
    tendencias: { kicker: () => __('Intuición sobre el mercado'),     sub: () => __('Por qué esto se está moviendo ahora y no hace seis meses') },
    estrategia: { kicker: () => __('Intuición sobre la jugada'),      sub: () => __('Lo que está en juego y todavía nadie ha nombrado') },
  };

  /* La confianza de la Intuición tiene su propio vocabulario: en el mapa general
     (ETIQUETA) 'media' es "Señal media", de la escala de fuerza de las señales
     débiles, y al reusarlo salía "confianza señal media". */
  const CONF_INTU = {
    alta: () => __('alta'), media: () => __('media'),
    baja: () => __('baja'), exploratoria: () => __('exploratoria'),
  };

  /* Dónde abre la Intuición en cada tablero. El PRIMER selector es su hueco
     reservado en el shell del tab (si existe, se llena y nada más se mueve); los
     siguientes son la columna izquierda donde se inserta como primer hijo cuando
     el tab no tiene shell propio. Mi Marca no está aquí: su hueco es
     #bgridIntuicion y lo llena BrandGrid con la card cards.v2. */
  const INTU_HUECO = {
    monitoreo:  ['#cgridIntuicion'],
    tendencias: [null, '.tend-main', '.insight-page'],
    estrategia: [null, '.insight-page'],
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
    // El rival PUEDE tener razón: sin este veredicto la card solo sabe acusar.
    se_equivoca: () => __('Se equivoca'), tiene_razon: () => __('Tiene razón'), parcial: () => __('Acierta a medias'),
    se_hizo: () => __('Se hizo'), no_se_hizo: () => __('No se hizo'), se_hizo_distinto: () => __('Se hizo distinto'),
    acerte: () => __('Acerté'), me_equivoque: () => __('Me equivoqué'), sin_datos: () => __('Sin datos'),
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
      // La lectura del tab la piden DOS pintores: la rejilla de cards y la banda
      // de Intuición. Sin este caché el tab consulta lo mismo dos veces por
      // repintado. Vive por render (lo limpia _renderVera4 al empezar).
      this._vera4Cache = this._vera4Cache || {};
      const clave = scope === 'mi_marca' && typeof this._veraPeriodoActivo === 'function'
        ? `mi_marca:${this._veraPeriodoActivo()}` : scope;
      if (Object.prototype.hasOwnProperty.call(this._vera4Cache, clave)) return this._vera4Cache[clave];
      const datos = await this._loadVera4Fresh(scope);
      this._vera4Cache[clave] = datos;
      return datos;
    },

    async _loadVera4Fresh(scope) {
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
      this._vera4Cache = {};                     // repintado = lectura fresca
      let datos;
      try { datos = await this._loadVera4(scope); } catch (_) { return; }
      const destino = host || body.querySelector('.vera4');
      if (!datos) { if (destino) destino.innerHTML = ''; return; }

      this._vera4At = datos.createdAt || null;
      // `aparte` queda fuera de la rejilla: la Intuición tiene banda propia.
      const cards = datos.cards.filter((c) => c && VERA4[c.type]
        && !VERA4[c.type].aparte && this._v4Cabe(c.type, scope));
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

    /** El reparto: un type vive en UN tab, salvo la Intuición, que vive en tres
        (una DISTINTA por tab — nunca la misma copiada). */
    _v4Cabe(tipo, scope) {
      const t = VERA4[tipo] && VERA4[tipo].tab;
      return Array.isArray(t) ? t.includes(scope) : t === scope;
    },

    /* ══ LA INTUICIÓN DEL TAB ═══════════════════════════════════════════════
       Cada tablero tiene la SUYA: en Competencia el sujeto es el rival, en
       Tendencias el mercado, en Estrategia la jugada. (La de Mi Marca es
       cards.v2 y la pinta BrandGrid dentro de su grid, en el Nivel 2.)

       ANTES — y esto es lo que este método vino a matar — el frontend leía la
       Intuición de `mi_marca` y la COPIABA al pie de los otros tres tabs: cuatro
       pantallas distintas terminaban diciendo exactamente lo mismo, justo en la
       única capa donde Vera dice lo que un tablero no puede decir.

       DÓNDE VA: arriba del todo, en la columna izquierda de cada tablero — la
       misma posición que en Mi Marca. Primero lo que Vera ve y nadie más puede
       decir; después las cifras que lo sostienen. Competencia tiene hueco
       reservado en su shell (#cgridIntuicion); Tendencias y Estrategia no tienen
       shell propio, así que se inserta como PRIMER hijo de su columna.

       Se pinta sin superficie ni bordes (ver .vera-card--intuicion): no es una
       card con marco, es la voz de Vera sobre el fondo del tablero. Idempotente y
       silenciosa: sin card, no deja rastro; un fallo aquí jamás tumba el tab.
       ═══════════════════════════════════════════════════════════════════════ */
    /* ── Propuestas de oportunidad: la card `aparte` de Tendencias. ────────
       Se pinta en el hueco reservado bajo el calendario (#tendPropuestas). Si
       el hueco no existe (el tab sin fechas no arma el aside), no se pinta en
       otro lado: sin el calendario al lado, la card pierde su sentido. */
    async _renderPropuestasFecha(body) {
      if (!body) return;
      const hueco = body.querySelector('#tendPropuestas');
      if (!hueco) return;
      let datos;
      try { datos = await this._loadVera4('tendencias'); } catch (_) { return; }
      const card = datos && datos.cards.find((c) => c && c.type === 'propuestas_fecha');
      if (!card || !this._v4Cabe('propuestas_fecha', 'tendencias')) { hueco.innerHTML = ''; return; }
      const meta = VERA4.propuestas_fecha;
      let cuerpo;   // el try o el catch siempre lo asignan
      try { cuerpo = this._v4Propuestas(card); } catch (_) { cuerpo = ''; }
      if (!cuerpo) { hueco.innerHTML = ''; return; }
      hueco.innerHTML = `<div class="vera4">${this._v4Marco(card, meta, cuerpo)}</div>`;
    },

    async _renderIntuicionDelTab(body, scope) {
      if (!body) return;
      const previa = body.querySelector('.vera-intu-tab');
      let datos;
      try { datos = await this._loadVera4(scope); } catch (_) { return; }
      const card = datos && datos.cards.find((c) => c && c.type === 'intuicion');
      if (!card || !this._v4Cabe('intuicion', scope)) { if (previa) previa.remove(); return; }
      const html = this._v4IntuicionHtml(card, scope, datos.createdAt);
      if (!html) { if (previa) previa.remove(); return; }

      const wrap = document.createElement('div');
      wrap.className = 'vera-cards vera-intu-tab';
      wrap.innerHTML = html;

      const hueco = INTU_HUECO[scope] || [];
      const reservado = hueco[0] ? body.querySelector(hueco[0]) : null;
      if (reservado) {
        // Hueco propio en el shell del tab: se llena y nada más se mueve.
        reservado.innerHTML = '';
        reservado.appendChild(wrap);
      } else {
        // Sin hueco: primer hijo de la columna izquierda. Si el tab está en
        // blanco, se crea una .insight-page mínima para no quedar al borde.
        let col = null;
        for (const sel of hueco.slice(1)) { col = body.querySelector(sel); if (col) break; }
        if (!col) {
          col = document.createElement('div');
          col.className = 'insight-page';
          body.insertBefore(col, body.firstChild);
        }
        if (previa) previa.remove();
        col.insertBefore(wrap, col.firstChild);
      }
      try { this._acentuarIntuicion?.(wrap); } catch (_) {}
    },

    /* La card v4 → el molde visual de la Intuición. Los campos se convierten en
       los bloques que ya sabe pintar el tablero (cita, comparación, veredicto):
       así una Intuición de Competencia se ve idéntica a una de Mi Marca, que es
       la idea — cambia el sujeto, no la pieza.
       NO lleva el botón "volver a consultar": ese handler solo existe en Mi
       Marca (_bindBrandGrid), y un botón que no hace nada es peor que ninguno. */
    _v4IntuicionHtml(card, scope, createdAt) {
      const esc = (s) => this._esc(s);
      const meta = INTU_TAB[scope];
      if (!meta || !card || !card.titulo) return '';
      const blocks = [];

      // De dónde parte: la pieza / el movimiento / la señal concreta. Es lo que
      // separa una intuición de un horóscopo, así que abre la card.
      if (card.de_donde) {
        blocks.push({ type: 'quote', text: String(card.de_donde), source: card.lo_obvio ? String(card.lo_obvio) : '' });
      }
      // El porqué: el mecanismo que la cifra no trae.
      if (card.el_porque) blocks.push({ type: 'markdown', markdown: String(card.el_porque) });
      // Acierto vs. culpable a dos columnas: la card no condena todo junto.
      if (card.acierto || card.culpable) {
        const cols = [];
        if (card.acierto)  cols.push({ side: 'pos', label: __('Lo que sí funcionó'), markdown: String(card.acierto) });
        if (card.culpable) cols.push({ side: 'neg', label: __('El culpable'),        markdown: String(card.culpable) });
        blocks.push({ type: 'split', columns: cols });
      }
      // La salida ejecutable. Si falta, la intuición quedó a medias — y se ve.
      // Tono NEUTRO a propósito: con 'positive' el bloque salía verde, y un verde
      // suelto rompe el monocromo del tablero. En neutro toma el acento de la
      // marca (--intu-accent), que es el único color que esta pieza admite.
      if (card.que_hago) {
        blocks.push({ type: 'callout', tone: 'neutral', icon: 'compass', title: __('Qué hacer con esto'), markdown: String(card.que_hago) });
      }
      if (!blocks.length) return '';

      const inner = blocks.map((b, i) => this._veraBlockHtml(b, `intu-${scope}`, i)).join('');
      // OJO: `eti` NO sirve aquí. En su mapa 'media' es "Señal media" (la escala
      // de fuerza de las señales débiles), así que salía "confianza señal media".
      // La confianza tiene su propio vocabulario y va en minúscula, como una
      // acotación al pie.
      const conf = CONF_INTU[card.confianza]
        ? `<span class="vera-card-conf">${esc(__('confianza {c}', { c: CONF_INTU[card.confianza]() }))}</span>` : '';
      const iso = card.updated_at || createdAt || null;
      const rel = (typeof this._veraHace === 'function') ? this._veraHace(iso) : '';
      const pie = rel ? `<span class="vera-card-fecha">${esc(__('Última actualización {d}', { d: rel }))}</span>` : '';

      return `
        <section class="vera-card vera-card--intuicion" data-tone="neutral" data-v4="intuicion"
                 data-nuevo-id="${esc(this._nid ? this._nid('v4intu', scope) : 'intu')}">
          <span class="vera-card-kind"><i class="aisc-ico aisc-ico--sparkle" aria-hidden="true"></i>${esc(meta.kicker())}</span>
          <h3 class="vera-card-title">${esc(card.titulo)}</h3>
          <p class="vera-card-sub">${esc(meta.sub())}</p>
          <div class="vera-card-body">${inner}</div>
          ${conf}${pie}
        </section>`;
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
          case 'latencia': cuerpo = this._v4Latencia(card); break;
          case 'ritmo':    cuerpo = this._v4Ritmo(card); break;
          case 'propuestas': cuerpo = this._v4Propuestas(card); break;
          case 'algoritmo': cuerpo = this._v4AlgoritmoRival(card); break;
          case 'triang':   cuerpo = this._v4Triangulacion(card); break;
          case 'horno':    cuerpo = this._v4Horno(card); break;
          case 'cadena':   cuerpo = this._v4Cadena(card); break;
          case 'verif':    cuerpo = this._v4Verificacion(card); break;
          case 'bucle':    cuerpo = this._v4Bucle(card); break;
          case 'heatmap':    cuerpo = this._v4Heatmap(card); break;
          case 'apilada':    cuerpo = this._v4Apilada(card); break;
          case 'divergente': cuerpo = this._v4Divergente(card); break;
          case 'indexadas':  cuerpo = this._v4Indexadas(card); break;
          case 'enfasis':    cuerpo = this._v4Enfasis(card); break;
          case 'dispersion': cuerpo = this._v4Dispersion(card); break;
          case 'lineas':     cuerpo = this._v4Lineas(card); break;
          case 'balanza':    cuerpo = this._v4Balanza(card); break;
          case 'patrones':   cuerpo = this._v4Patrones(card); break;
          case 'descomposicion': cuerpo = this._v4Descomposicion(card); break;
          case 'trendmoda':      cuerpo = this._v4TendenciaOModa(card); break;
          case 'horizontes':     cuerpo = this._v4Horizontes(card); break;
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
        'heatmap', 'apilada', 'divergente', 'indexadas',
        'enfasis', 'dispersion', 'lineas', 'balanza', 'patrones',
        'descomposicion', 'trendmoda', 'horizontes'].includes(meta.layout);
      return `
        <section class="v4-card${ancho ? ' v4-card--ancha' : ''}" data-v4="${esc(card.type)}"
                 data-nuevo-id="${esc(this._nid ? this._nid('v4', card.type) : card.type)}">
          <header class="v4-head">
            <span class="v4-kind"><i class="aisc-ico aisc-ico--${esc(meta.icon)}" aria-hidden="true"></i>${esc(meta.label())}</span>
            <p class="v4-sub">${esc(meta.sub())}</p>
          </header>
          <div class="v4-body">${cuerpo}</div>
          ${this._v4Fuentes(card)}
          ${this._v4Fecha(card)}
        </section>`;
    },

    /* ── Pie de fuentes: de dónde salió lo que se afirma ────────────────────
       Va discreto a propósito — es el respaldo, no el mensaje. Pero clicable:
       una fuente que no se puede abrir no es una fuente, es una afirmación con
       aire de cita. Las que traen enlace se abren; las que no, se muestran como
       texto y se ven distintas, para no prometer un clic que no existe. */
    _v4Fuentes(card) {
      const fs = Array.isArray(card && card.fuentes) ? card.fuentes.filter(Boolean) : [];
      if (!fs.length) return '';
      const esc = (s) => this._esc(s);
      // Nombres verificados contra css/aisc-icons.css: uno inventado no falla,
      // sale en blanco — y un pie de fuentes con huecos parece roto, no discreto.
      const ICO = {
        publicacion: 'image', comentarios: 'comments', tendencia: 'growth',
        web: 'external-link', metrica: 'chart-bar', busqueda: 'search',
      };
      const partes = fs.slice(0, 8).map((f) => {
        const que = String(f.que || '').trim();
        if (!que) return '';
        const meta = [f.quien, f.cuando].filter(Boolean).map((x) => esc(x)).join(' · ');
        const cuerpo = `<i class="aisc-ico aisc-ico--${esc(ICO[f.tipo] || 'link')}" aria-hidden="true"></i>`
          + `<span class="v4-fuente-que">${esc(que)}</span>`
          + (meta ? `<span class="v4-fuente-meta">${meta}</span>` : '');
        // Solo http(s). Vera lee captions y webs de terceros: un `javascript:`
        // aquí sería ejecutable con un clic del cliente.
        const url = String(f.url || '').trim();
        const seguro = /^https?:\/\//i.test(url);
        return seguro
          ? `<a class="v4-fuente" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${cuerpo}</a>`
          : `<span class="v4-fuente v4-fuente--plana">${cuerpo}</span>`;
      }).filter(Boolean).join('');
      if (!partes) return '';
      return `<div class="v4-fuentes">
        <span class="v4-fuentes-rot">${esc(__('Fuentes'))}</span>${partes}
      </div>`;
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
      // curva_adopcion habla de señales y grupos de adoptantes, pero el molde
      // visual es el mismo: una mezcla que suma 100 por fila.
      const esAdopcion = card.type === 'curva_adopcion';
      const tonos = esAdopcion
        ? [__('innovadores'), __('nicho especializado'), __('mainstream')]
        : (Array.isArray(card.tonos) ? card.tonos.slice(0, 6) : []);
      const perfiles = esAdopcion
        ? (Array.isArray(card.senales) ? card.senales.map((x) => ({ perfil: x.tema, mezcla: x.mezcla })) : [])
        : (Array.isArray(card.perfiles) ? card.perfiles.slice(0, 8) : []);
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
        if (d.kind === 'dispersion') { this._v4PintaDispersion(cv, d); return; }
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

    /* ── Barras con ÉNFASIS: en qué momentos te piensan ────────────────────
       Comparar magnitud entre categorías con nombre = barras, y horizontales
       porque un momento se nombra con una frase ("el antojo de las 4pm"). El
       énfasis es lo que la vuelve útil: lo que hay que ver no son los momentos
       cubiertos sino los que NO — un momento vacío es una puerta por la que hoy
       entra otro, así que se dibuja punteado y se nombra. */
    _v4Enfasis(card) {
      const esc = (s) => this._esc(s);
      const ms = Array.isArray(card.momentos) ? card.momentos.filter(Boolean) : [];
      if (!ms.length) return '';
      const max = Math.max(...ms.map((m) => Number(m.cobertura) || 0), 1);
      const orden = [...ms].sort((a, b) => (Number(b.cobertura) || 0) - (Number(a.cobertura) || 0));
      const huecos = orden.filter((m) => !m.cubierto || !(Number(m.cobertura) > 0));
      return `<div class="v4-enf">${orden.map((m) => {
        const v = Number(m.cobertura) || 0;
        const vacio = !m.cubierto || v <= 0;
        return `<div class="v4-enf-fila${vacio ? ' is-vacia' : ''}">
          <span class="v4-ap-nombre" title="${esc(m.cep || '')}">${esc(m.cep || '')}</span>
          <div class="v4-enf-pista"><span class="v4-enf-barra" style="width:${(v / max * 100).toFixed(1)}%"
            title="${esc(`${m.cep}: ${v}${m.piezas != null ? ` · ${m.piezas} piezas` : ''}`)}"></span></div>
          <span class="v4-enf-val">${vacio ? esc(__('sin cubrir')) : esc(String(v))}</span>
        </div>`;
      }).join('')}</div>
      ${huecos.length ? `<p class="v4-hm-hueco"><i class="aisc-ico aisc-ico--idea" aria-hidden="true"></i>${
        esc(__('No ocupas: {t}', { t: huecos.map((m) => m.cep).join(' · ') }))}</p>` : ''}
      ${this._v4Metodo(card)}
      ${this._v4Tabla([__('Momento'), __('Cobertura'), __('Piezas')],
        orden.map((m) => [m.cep, m.cobertura ?? 0, m.piezas ?? 0]))}`;
    },

    /* ── Dispersión con cuadrantes ─────────────────────────────────────────
       Dos medidas por elemento donde lo que importa es la POSICIÓN CONJUNTA: un
       código famoso que usan todos vale poco; uno único que nadie reconoce
       todavía es donde hay que invertir. Los cuadrantes llevan nombre para que
       la posición ya sea una instrucción y nadie tenga que interpretarla. */
    _v4Dispersion(card) {
      const esc = (s) => this._esc(s);
      const S = {
        rejilla_codigos: {
          puntos: (c) => (c.activos || []).map((a) => ({ x: a.unicidad, y: a.fama, n: a.nombre, t: a.tipo })),
          ejes: { x: __('Unicidad — ¿es solo tuyo?'), y: __('Fama — ¿lo ligan a ti?') },
          corte: (c) => ({ x: Number(c.umbral) || 50, y: Number(c.umbral) || 50 }),
          cuadrantes: [__('Compartido'), __('Proteger y escalar'), __('Abandonar'), __('Construir: repetir')],
        },
        aplauso_vs_propagacion: {
          puntos: (c) => (c.piezas || []).map((p) => ({ x: p.aplauso, y: p.propagacion, n: p.titulo, t: p.formato })),
          ejes: { x: __('Aplauso — me gusta por alcance'), y: __('Propagación — guardados + compartidos') },
          corte: (c) => ({ x: Number(c.medianas?.aplauso) || 0, y: Number(c.medianas?.propagacion) || 0 }),
          cuadrantes: [__('Ni gusta ni se pasa'), __('Gusta y se propaga'), __('Se pasa sin aplauso'), __('Gusta y muere ahí')],
        },
      }[card.type];
      if (!S) return '';
      const pts = S.puntos(card).filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
      if (!pts.length) return '';
      const corte = S.corte(card);
      const cid = `v4disp-${String(card.type).replace(/[^a-z0-9]/gi, '')}`;
      return `<div class="v4-chart-wrap v4-chart-wrap--alta"><canvas id="${cid}" data-v4chart='${
        this._esc(JSON.stringify({ kind: 'dispersion', pts, corte, ejes: S.ejes, color: SERIES[0] }))}'></canvas></div>
      <div class="v4-cuadrantes">${S.cuadrantes.map((q, i) =>
        `<span class="v4-cuad v4-cuad--${i}">${esc(q)}</span>`).join('')}</div>
      ${card.nota_limite ? `<p class="v4-metodo"><i class="aisc-ico aisc-ico--alert-info" aria-hidden="true"></i>${esc(card.nota_limite)}</p>` : ''}
      ${this._v4Metodo(card)}
      ${this._v4Tabla([__('Elemento'), esc(S.ejes.x), esc(S.ejes.y)], pts.map((p) => [p.n, p.x, p.y]))}`;
    },

    /* ── Líneas con ÉNFASIS: la deriva de los códigos ──────────────────────
       Tendencia en el tiempo = línea. Con énfasis en vez de cinco series de
       colores: el punto no es comparar cinco curvas, es que UNA se está
       apagando. Resaltar una y dejar el resto en gris es la forma honesta de
       decir "mira esto". */
    _v4Lineas(card) {
      const esc = (s) => this._esc(s);
      const fechas = Array.isArray(card.fechas) ? card.fechas : [];
      const series = Array.isArray(card.series) ? card.series.slice(0, 6) : [];
      if (fechas.length < 2 || !series.length) return '';
      const cid = `v4lin-${String(card.type).replace(/[^a-z0-9]/gi, '')}`;
      const dest = card.destacado || (series[0] && series[0].codigo);
      return `<div class="v4-leyendas">${series.map((x) =>
        `<span class="v4-leg${x.codigo === dest ? ' is-dest' : ''}"><i style="background:${
          x.codigo === dest ? SERIES[0] : 'rgba(255,255,255,0.28)'}"></i>${esc(x.codigo || '')}</span>`).join('')}</div>
      <div class="v4-chart-wrap"><canvas id="${cid}" data-v4chart='${
        this._esc(JSON.stringify({ kind: 'lineas', meses: fechas,
          series: series.map((x) => ({ nombre: x.codigo, valores: x.valores,
            color: x.codigo === dest ? SERIES[0] : 'rgba(255,255,255,0.28)' })) }))}'></canvas></div>
      ${this._v4Tabla([__('Fecha')].concat(series.map((x) => x.codigo)),
        fechas.map((f, j) => [f].concat(series.map((x) => (Array.isArray(x.valores) ? (x.valores[j] ?? '') : '')))))}`;
    },

    /* ── Balanza construir/cosechar ────────────────────────────────────────
       Parte-de-un-todo QUE CAMBIA: cada mes suma 100 y lo que importa es cómo se
       mueve la frontera. La vara al 60 convierte el gráfico en un juicio sin que
       nadie tenga que acordarse de la regla. La deriva es el hallazgo: casi toda
       marca se desliza hacia la cosecha sin decidirlo, porque la cosecha se mide
       fácil y paga rápido. */
    _v4Balanza(card) {
      const esc = (s) => this._esc(s);
      const meses = Array.isArray(card.meses) ? card.meses : [];
      const con = Array.isArray(card.construir) ? card.construir : [];
      const cos = Array.isArray(card.cosechar) ? card.cosechar : [];
      if (!meses.length || !con.length) return '';
      const vara = Number(card.vara) || 60;
      const cols = meses.map((m, i) => {
        const c = Number(con[i]) || 0, k = Number(cos[i]) || 0;
        const tot = c + k || 1;
        const pc = c / tot * 100;
        return `<div class="v4-bal-col" title="${esc(`${m}: ${Math.round(pc)}% construir`)}">
          <div class="v4-bal-barra">
            <span class="v4-bal-con" style="height:${pc.toFixed(1)}%"></span>
            <span class="v4-bal-cos" style="height:${(100 - pc).toFixed(1)}%"></span>
          </div><span class="v4-bal-mes">${esc(m)}</span></div>`;
      }).join('');
      return `<div class="v4-leyendas">
          <span class="v4-leg"><i style="background:${SERIES[0]}"></i>${esc(__('Construir marca'))}</span>
          <span class="v4-leg"><i style="background:${SERIES[3]}"></i>${esc(__('Cosechar demanda'))}</span>
          <span class="v4-leg v4-leg--vara"><i></i>${esc(__('vara {v}% (Binet & Field)', { v: vara }))}</span>
        </div>
        <div class="v4-bal"><div class="v4-bal-vara" style="bottom:${vara}%"></div>${cols}</div>
        ${this._v4Metodo(card)}
        ${this._v4Tabla([__('Mes'), __('Construir'), __('Cosechar')],
          meses.map((m, i) => [m, con[i] ?? 0, cos[i] ?? 0]))}`;
    },

    /* ── Tabla de patrones ─────────────────────────────────────────────────
       Hechos heterogéneos con historia (un patrón, su marcador, su confianza).
       No comparten unidad ni forma de serie, y por encima de ~7 filas con
       significado la tabla gana a cualquier gráfico. Un patrón REFUTADO no se
       borra: saber que una creencia falló vale tanto como la que aguanta. */
    _v4Patrones(card) {
      const esc = (s) => this._esc(s);
      const ps = Array.isArray(card.patrones) ? card.patrones.filter(Boolean) : [];
      if (!ps.length) return '';
      const ORD = { alta: 0, media: 1, baja: 2, exploratoria: 3 };
      const orden = [...ps].sort((a, b) =>
        (ORD[String(a.confianza || '').toLowerCase()] ?? 2) - (ORD[String(b.confianza || '').toLowerCase()] ?? 2));
      return `<div class="v4-pat">${orden.map((p) => {
        const ok = Number(p.confirmado) || 0, no = Number(p.refutado) || 0;
        const tono = no > ok ? 'threat' : (ok >= 3 ? 'opp' : 'neu');
        return `<article class="v4-ficha is-${tono}">
          <div class="v4-ficha-head">
            ${this._v4Chip(p.confianza)}
            <span class="v4-pat-marcador" title="${esc(__('confirmado / refutado'))}">
              <b>${ok}</b> <i>·</i> <em>${no}</em></span>
            ${p.ultima_prueba ? `<span class="v4-quien">${esc(p.ultima_prueba)}</span>` : ''}
          </div>
          <h4 class="v4-ficha-titulo">${esc(p.patron || '')}</h4>
          ${p.que_decide ? this._v4Campo(__('Qué decide'), p.que_decide) : ''}
        </article>`;
      }).join('')}</div>`;
    },

    /* La dispersión con sus dos cortes. Las líneas de corte son hairlines
       SÓLIDAS: punteadas leerían como "umbral incierto" y aquí el corte es el
       criterio, no una estimación. */
    _v4PintaDispersion(cv, d) {
      const ejeX = { type: 'linear', grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: 'rgba(255,255,255,0.45)' },
        title: { display: true, text: d.ejes.x, color: 'rgba(255,255,255,0.45)', font: { size: 10 } } };
      const ejeY = { ...ejeX, title: { ...ejeX.title, text: d.ejes.y } };
      const cortes = {
        id: 'v4cortes',
        afterDraw(chart) {
          const { ctx, chartArea: a, scales } = chart;
          if (!a) return;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 1;
          const x = scales.x.getPixelForValue(d.corte.x);
          const y = scales.y.getPixelForValue(d.corte.y);
          ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom);
          ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
          ctx.restore();
        },
      };
      this._v4Charts.push(new Chart(cv.getContext('2d'), {
        type: 'scatter',
        data: { datasets: [{ data: d.pts, backgroundColor: d.color, pointRadius: 6, pointHoverRadius: 9 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => {
              const p = c.raw || {};
              return `${p.n || ''}${p.t ? ` (${p.t})` : ''} — ${Math.round(p.x)} / ${Math.round(p.y)}`;
            } } },
          },
          scales: { x: ejeX, y: ejeY },
        },
        plugins: [cortes],
      }));
    },

    /* ── Descomposición: ¿subiste tú o subió la marea? ─────────────────────
       Un solo número de crecimiento mezcla dos historias que se corrigen
       distinto: si el nicho creció y tú creciste igual, no ganaste nada. Las dos
       barras salen del mismo cero, a izquierda y derecha, para que el signo se
       lea sin mirar la cifra. */
    _v4Descomposicion(card) {
      const esc = (s) => this._esc(s);
      const cat = Number(card.efecto_categoria);
      const cuo = Number(card.efecto_cuota);
      if (!Number.isFinite(cat) && !Number.isFinite(cuo)) return '';
      const max = Math.max(Math.abs(cat) || 0, Math.abs(cuo) || 0, 1);
      const barra = (etq, v, color) => {
        const val = Number(v) || 0;
        const w = Math.abs(val) / max * 50;
        return `<div class="v4-desc-fila">
          <span class="v4-ap-nombre">${esc(etq)}</span>
          <div class="v4-desc-pista">
            <span class="v4-desc-barra" style="width:${w.toFixed(1)}%;background:${color};${
              val < 0 ? `right:50%` : `left:50%`}"></span>
          </div>
          <span class="v4-desc-val${val < 0 ? ' is-neg' : ''}">${val > 0 ? '+' : ''}${esc(String(val))}</span>
        </div>`;
      };
      // La cuota va primero: para una marca pequeña es la que manda.
      return `<div class="v4-desc"><div class="v4-desc-cero"></div>
          ${barra(__('Tu cuota'), cuo, SERIES[0])}
          ${barra(__('La categoría'), cat, SERIES[3])}
        </div>
        ${card.total_cambio != null ? `<p class="v4-campo-txt">${
          esc(__('Cambio total: {t}', { t: card.total_cambio }))}${card.unidad ? ` · ${esc(card.unidad)}` : ''}</p>` : ''}
        ${(card.cuota_antes != null && card.cuota_ahora != null)
          ? `<p class="v4-campo-txt v4-campo-txt--tenue">${esc(__('Cuota: {a} → {b}', { a: card.cuota_antes, b: card.cuota_ahora }))}</p>` : ''}
        ${this._v4Tabla([__('Efecto'), __('Valor')],
          [[__('Tu cuota'), cuo ?? 0], [__('La categoría'), cat ?? 0]])}`;
    },

    /* ── Tendencia o moda ──────────────────────────────────────────────────
       El diagnóstico son TRES marcadores a la vez y colapsarlos en un puntaje
       destruye justo lo que hay que ver: una señal puede picar altísimo en una
       plataforma y no haber cruzado a ninguna otra — eso es una moda. El
       sparkline añade la FORMA de la curva, que es lo que separa una rampa de
       un pico. */
    _v4TendenciaOModa(card) {
      const esc = (s) => this._esc(s);
      const ss = Array.isArray(card.senales) ? card.senales.filter(Boolean) : [];
      if (!ss.length) return '';
      const VER = { tendencia: 'opp', moda: 'threat', pronto_para_saber: 'neu' };
      const spark = (vals) => {
        const v = (Array.isArray(vals) ? vals : []).map(Number).filter(Number.isFinite);
        if (v.length < 2) return '';
        const max = Math.max(...v), min = Math.min(...v), rango = (max - min) || 1;
        const pts = v.map((x, i) => `${(i / (v.length - 1) * 100).toFixed(1)},${(26 - ((x - min) / rango) * 22).toFixed(1)}`).join(' ');
        return `<svg class="v4-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${pts}" fill="none" stroke="${SERIES[0]}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
      };
      return `<div class="v4-tm">${ss.map((x) => `
        <article class="v4-ficha is-${VER[String(x.veredicto || '').toLowerCase()] || 'neu'}">
          <div class="v4-ficha-head">
            ${this._v4Chip(x.veredicto)}
            <span class="v4-quien">${esc(x.tema || '')}</span>
          </div>
          <div class="v4-tm-fila">
            ${spark(x.serie)}
            <div class="v4-tm-marcas">
              <span class="v4-chip">${esc(__('{n} semanas', { n: x.semanas_activa ?? '—' }))}</span>
              <span class="v4-chip${(x.plataformas || []).length > 1 ? ' is-opp' : ''}">${
                esc((x.plataformas || []).length > 1
                  ? __('{n} plataformas', { n: (x.plataformas || []).length })
                  : __('una sola plataforma'))}</span>
              ${this._v4Chip(x.consistencia)}
            </div>
          </div>
        </article>`).join('')}</div>
      ${this._v4Metodo(card)}
      ${this._v4Tabla([__('Señal'), __('Veredicto'), __('Semanas'), __('Plataformas')],
        ss.map((x) => [x.tema, eti(x.veredicto), x.semanas_activa ?? '', (x.plataformas || []).join(' · ')]))}`;
    },

    /* ── Tres horizontes ───────────────────────────────────────────────────
       El problema de un tablero de tendencias no es encontrar señales: es que
       todas se ven igual de urgentes. Tres carriles obligan a decidir el
       horizonte de cada una, y esa decisión es la que convierte una lista en un
       plan. No es un gráfico de datos: es una estructura de juicio, y por eso no
       lleva ejes. */
    _v4Horizontes(card) {
      const esc = (s) => this._esc(s);
      const carril = (clave, titulo, sub, items, campo) => {
        const xs = Array.isArray(items) ? items.filter(Boolean) : [];
        return `<div class="v4-hz-carril v4-hz-carril--${clave}">
          <header class="v4-hz-head"><span class="v4-hz-t">${esc(titulo)}</span>
            <span class="v4-hz-s">${esc(sub)}</span></header>
          ${xs.length ? xs.map((x) => `<article class="v4-hz-item">
            <h4 class="v4-ficha-titulo">${esc(x.senal || '')}</h4>
            ${x[campo] ? `<p class="v4-campo-txt">${esc(x[campo])}</p>` : ''}
            ${x.cuando || x.revisar_el ? `<span class="v4-quien">${esc(x.cuando || x.revisar_el)}</span>` : ''}
          </article>`).join('') : `<p class="v4-campo-txt v4-campo-txt--tenue">${esc(__('nada en este horizonte'))}</p>`}
        </div>`;
      };
      if (!(card.h1 || card.h2 || card.h3)) return '';
      return `<div class="v4-hz">
        ${carril('h1', __('Hoy'), __('exige acción'), card.h1, 'que_exige')}
        ${carril('h2', __('Transición'), __('hay que preparar'), card.h2, 'que_preparar')}
        ${carril('h3', __('Lejano'), __('solo se vigila'), card.h3, 'por_que_importa')}
      </div>`;
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
        derecho_a_jugar:   { tono: (i) => (i.veredicto === 'tomar' ? 'opp' : i.veredicto === 'adaptar' ? 'warn' : 'neu'), chips: ['veredicto', 'autoridad', 'audiencia', 'momento', 'territorio'], meta: [], titulo: 'senal', campos: [[() => __('Por qué'), 'razon']] },
        // Si el rival TIENE RAZÓN eso es una amenaza (le funciona y no lo tenemos),
        // no una oportunidad. El verde solo se gana cuando de verdad se equivoca.
        supuesto_punto_ciego: { tono: (i) => (i.veredicto === 'tiene_razon' ? 'threat' : i.veredicto === 'parcial' ? 'warn' : i.confianza === 'alta' ? 'opp' : 'neu'), chips: ['rol', 'veredicto', 'confianza'], meta: ['perfil'], titulo: 'que_cree', campos: [[() => __('En qué ACIERTA (y por qué le funciona)'), 'en_que_acierta'], [() => __('En qué se equivoca'), 'en_que_se_equivoca'], [() => __('La evidencia se ve en'), 'evidencia_de_la_grieta'], [() => __('Qué lo DESMENTIRÍA'), 'que_lo_desmentiria'], [() => __('Qué hago con esto'), 'como_se_explota']] },
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

    /* ── algoritmo (Competencia): qué premia la distribución en los rivales.
       Cada plataforma lleva su PRUEBA visible — sin el perfil y la cifra que la
       respaldan, esto sería repetir lo que se dice de cada red. */
    _v4AlgoritmoRival(card) {
      const esc = (s) => this._esc(s);
      const pl = Array.isArray(card.plataformas) ? card.plataformas.filter(Boolean) : [];
      if (!pl.length) return '';
      return `<div class="v4-algo">
        ${pl.map((p) => `
          <article class="v4-algo-pl">
            <header class="v4-algo-head">
              <span class="v4-algo-red">${esc(p.plataforma || '')}</span>
            </header>
            <p class="v4-algo-premia">${esc(p.que_premia || '')}</p>
            ${p.prueba ? `<p class="v4-algo-prueba"><span>${esc(__('La prueba'))}</span>${esc(p.prueba)}</p>` : ''}
            ${p.a_quien_alcanza ? `<p class="v4-algo-quien">${esc(__('Se lo muestra a'))}: ${esc(p.a_quien_alcanza)}</p>` : ''}
            ${p.que_me_llevo ? `<p class="v4-algo-llevo"><span>${esc(__('Qué me llevo'))}</span>${esc(p.que_me_llevo)}</p>` : ''}
          </article>`).join('')}
      </div>
      ${card.patron_transversal ? `<div class="v4-leccion"><i class="aisc-ico aisc-ico--compass" aria-hidden="true"></i><p>${esc(card.patron_transversal)}</p></div>` : ''}`;
    },

    /* ── propuestas por fecha: dos ideas producibles para cada ocasión. ─────
       Vive pegada al calendario, no en la rejilla: una propuesta sin su fecha
       al lado es una idea suelta, y el valor está justo en el pareo. Dos por
       fecha a propósito — una sola parece la única salida; tres es un menú que
       nadie decide. */
    _v4Propuestas(card) {
      const esc = (s) => this._esc(s);
      const fechas = Array.isArray(card.fechas) ? card.fechas.filter(Boolean) : [];
      if (!fechas.length) return '';
      return `<div class="v4-prop">
        ${fechas.map((f) => {
          const props = Array.isArray(f.propuestas) ? f.propuestas.filter(Boolean).slice(0, 2) : [];
          if (!props.length) return '';
          return `
            <section class="v4-prop-fecha">
              <header class="v4-prop-head">
                <span class="v4-prop-cuando">${esc(f.cuando || f.fecha || '')}</span>
                <h4 class="v4-prop-evento">${esc(f.evento || '')}</h4>
              </header>
              <div class="v4-prop-ideas">
                ${props.map((p) => `
                  <article class="v4-prop-idea">
                    ${p.formato ? `<span class="v4-prop-formato">${esc(p.formato)}</span>` : ''}
                    <h5 class="v4-prop-titulo">${esc(p.titulo || '')}</h5>
                    ${p.idea ? `<p class="v4-prop-txt">${esc(p.idea)}</p>` : ''}
                    ${p.por_que_esta_marca ? `<p class="v4-prop-porque"><span>${esc(__('Por qué le sirve a esta marca'))}</span>${esc(p.por_que_esta_marca)}</p>` : ''}
                  </article>`).join('')}
              </div>
            </section>`;
        }).join('')}
      </div>`;
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
