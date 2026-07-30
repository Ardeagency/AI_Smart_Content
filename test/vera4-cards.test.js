/**
 * Cards del cerebro de Vera (schema cards.vera4) — Vera4.mixin.
 *
 * Tres cosas que se romperían en silencio, y por eso se prueban:
 *  1. EL REPARTO. Cada card vive en UN tab (Mi Marca / Competencia /
 *     Tendencias / Estrategia) y las reglas de esos tabs se contradicen entre
 *     sí: Mi Marca tiene prohibido nombrar competencia. Si una card cambia de
 *     tab sin querer, el tablero empieza a decir lo que no debe.
 *  2. QUE NO QUEDEN MARCOS HUÉRFANOS. Una card sin contenido NO puede pintar su
 *     título y su subtítulo sobre el vacío: el tab tiene que verse igual que
 *     antes de que existiera esto. Es el mismo defecto que ya dejó tabs con
 *     media página muerta.
 *  3. EL ESCAPADO. Vera lee posts, comentarios y web: texto de terceros. Si una
 *     sola plantilla olvidara escapar, el tablero ejecutaría lo que un
 *     competidor escriba en un caption.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'js/views/dashboard/Vera4.mixin.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

function cargarVista() {
  globalThis.DashboardView = function DashboardView() {};
  globalThis.__ = (s, vars) =>
    String(s).replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  new Function(FUENTE)();
  const vista = Object.create(globalThis.DashboardView.prototype);
  vista._esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  vista._nid = (p, s) => `${p}:${String(s || '')}`;
  vista._veraHace = () => '';          // sin fecha: el pie no se inventa
  return vista;
}

/* El reparto acordado con el CSV de VERA_BRAIN_MASTER. Si alguien mueve una
   card de tab, este mapa tiene que moverse con ella A PROPÓSITO. */
const REPARTO = {
  mi_marca:   ['silencio', 'latencia', 'impacto_vs_ruido', 'emocion_objetivo',
               'viabilidad_comercial', 'ritmo', 'autopsia', 'victoria_explicada', 'causalidad',
               // Salud de marca: lo que un CMO mira primero
               'cobertura_momentos', 'rejilla_codigos', 'deriva_codigos', 'construir_vs_cosechar',
               'aplauso_vs_propagacion', 'penetracion_vs_lealtad', 'biblioteca_patrones'],
  monitoreo:  ['anomalia', 'error_ajeno',
               // Instrumentos y juicio del rediseño de Competencia
               'territorio_tematico', 'registro_de_voz', 'emocion_competencia',
               'busqueda_vs_voz', 'supuesto_punto_ciego', 'proxima_movida'],
  tendencias: ['pulso_nicho', 'senal_debil', 'triangulacion', 'tension', 'timing', 'lo_que_falta',
               // La disciplina de futuros
               'crecimiento_categoria', 'tendencia_o_moda', 'tres_horizontes',
               'derecho_a_jugar', 'curva_adopcion'],
  estrategia: ['decision_del_dia', 'autoridad_adn', 'puerta_aprobacion', 'produccion_viva',
               'pieza_asombro', 'formato', 'cadena_portafolio', 'verificacion',
               'brief_humano', 'bucle_outcome'],
};

/* Ejemplo MÍNIMO de cada card: lo justo para que pinte. Si una plantilla exige
   más de esto, es que le está pidiendo a Vera más de lo que su contrato promete. */
const EJEMPLO = {
  silencio:             { items: [{ clase: 'pieza_retirada', quien: 'Instagram', que: 'El carrusel del lunes', desde: '2026-07-12', lectura: 'Lo quitaron a las 3 horas.' }] },
  latencia:             { dias_promedio: 4, peor: { ventana: 'Mundial', se_abrio: '2026-06-01', reaccion: 'nunca', costo: 'Alcance prestado que no se tomó' } },
  impacto_vs_ruido:     { impacto: [{ que: 'Los Reels de cocina', mecanismo: 'Se ven sin sonido' }], ruido: [{ que: 'Las efemérides', por_que_no_mueve: 'Nadie las comenta' }], dejar_de_hacer: 'Dejar las efemérides.' },
  emocion_objetivo:     { emocion: 'pertenencia', para_quien: 'Madres que cocinan', momento: 'Domingo por la tarde', que_la_dispara: 'Ver a alguien como ellas.' },
  viabilidad_comercial: { gastado: '$1.200.000', ventana: 'Julio', kpi: { nombre: 'CPL', valor: '$12.000', estado: 'justo' }, veredicto: 'cabe_moviendo' },
  ritmo:                { rafagas: [{ cuando: '2026-07-14', piezas: 4, costo: 'Se comieron entre sí' }], instruccion: 'Repartir en tres días.' },
  autopsia:             { pieza: 'El carrusel del snack', culpable: 'formato', por_que: 'Informaba en vez de antojar.', leccion: 'El carrusel no antoja.' },
  victoria_explicada:   { pieza: 'El Reel del equipo', mecanismo: 'Una sola toma, sin música.', como_se_repite: 'Grabar en el sitio.' },
  causalidad:           { resultado: 'Subieron 40% las visitas', veredicto: 'mezcla', alternativas: [{ explicacion: 'Temporada alta', descartada_porque: 'El año pasado no subió' }] },
  cobertura_momentos:    { momentos: [{ cep: 'el antojo de las 4pm', cobertura: 70, cubierto: true, piezas: 8 }, { cep: 'el desayuno del que madruga', cobertura: 0, cubierto: false, piezas: 0 }], ventana_dias: 90 },
  rejilla_codigos:       { activos: [{ tipo: 'color', nombre: 'el amarillo', fama: 70, unicidad: 40, veces_aplicado: 22, de_cuantas_piezas: 30 }], umbral: 50, nota_metodo: '30 piezas' },
  deriva_codigos:        { fechas: ['may', 'jun', 'jul'], series: [{ codigo: 'el amarillo', valores: [70, 55, 40] }, { codigo: 'la tipografía', valores: [60, 62, 61] }], destacado: 'el amarillo' },
  construir_vs_cosechar: { meses: ['may', 'jun', 'jul'], construir: [60, 45, 30], cosechar: [40, 55, 70], vara: 60, nota_metodo: '74 piezas clasificadas' },
  aplauso_vs_propagacion:{ piezas: [{ titulo: 'El reel del equipo', aplauso: 12, propagacion: 30, formato: 'reel' }, { titulo: 'La infografía', aplauso: 40, propagacion: 3, formato: 'carrusel' }], medianas: { aplauso: 20, propagacion: 10 }, nota_limite: 'No mide memoria de marca.' },
  penetracion_vs_lealtad:{ meses: ['may', 'jun', 'jul'], series: [{ nombre: 'personas nuevas', valores: [100, 96, 88] }, { nombre: 'interacción por seguidor', valores: [100, 112, 130] }], base: 'ambas = 100 en mayo' },
  biblioteca_patrones:   { patrones: [{ patron: 'La receta en una sola toma retiene', confirmado: 4, refutado: 1, confianza: 'alta', ultima_prueba: '2026-07-20', que_decide: 'El formato de las piezas de producto' }] },
  anomalia:             { items: [{ perfil: 'Marca X', rol: 'competidor_directo', antes: 'Publicaba recetas', ahora: 'Solo promociones', hipotesis: 'Está quemando inventario', veredicto: 'vigilar', prioridad: 'media' }] },
  territorio_tematico:  { temas: ['recetas', 'vida fitness', 'ingrediente'], perfiles: ['Tosh', 'B3TTER'], celdas: [[80, 20, 0], [10, 60, 30]], nota_metodo: '52 piezas de 2 perfiles' },
  registro_de_voz:      { tonos: ['cercano', 'épico', 'educativo'], perfiles: [{ perfil: 'Tosh', mezcla: [20, 60, 20] }, { perfil: 'B3TTER', mezcla: [30, 10, 60] }], nota_metodo: '48 copys' },
  emocion_competencia:  { escala: ['rechazo', 'indiferencia', 'neutro', 'interés', 'deseo'], perfiles: [{ perfil: 'Tosh', valores: [2, 8, 20, 40, 30] }], nota_metodo: '120 comentarios' },
  busqueda_vs_voz:      { meses: ['feb', 'mar', 'abr'], series: [{ nombre: 'te buscan', valores: [100, 92, 88] }, { nombre: 'hablas', valores: [100, 130, 145] }], base: 'ambas = 100 en febrero' },
  supuesto_punto_ciego: { items: [{ perfil: 'Tosh', rol: 'competidor_directo', que_cree: 'Que el volumen de distribución compra el territorio funcional', en_que_se_equivoca: 'La credencial de ingrediente no se compra con pauta', evidencia_de_la_grieta: 'Sus comentarios preguntan por la lista de ingredientes', como_se_explota: 'Mostrar el maní sin explicación', confianza: 'media' }] },
  proxima_movida:       { items: [{ perfil: 'Tosh', movida_probable: 'Extiende la paleta proteica a más sabores', por_que_ahora: 'La primera superó el millón de plays', senal_que_la_confirma: 'Registro de nuevos SKU', senal_que_la_desmiente: 'Que quiten la paleta del catálogo', revisar_el: '2026-09-15', confianza: 'media', si_ocurre_que_hago: 'Reclamar el ingrediente antes de que masifiquen' }] },
  error_ajeno:          { items: [{ quien: 'Marca Y', rol: 'referente', que_intento: 'Un lanzamiento con influencers', evidencia_del_fallo: 'Comentarios burlones', causa_raiz: 'No encajaba con su historia', me_puede_pasar: true, que_ajusto: 'Revisar el casting.' }] },
  pulso_nicho:          { estado: 'caliente', titular: 'El nicho se movió a lo salado', numero: '+38%', delta: 'vs junio' },
  senal_debil:          { items: [{ titulo: 'La proteína de huevo', que_vi: 'Sube en búsquedas', por_que_nadie_lo_ve: 'Está fuera de la categoría', si_es_real: 'Se abre una línea', fuerza: 'media', ventana: '30 días' }] },
  triangulacion:        { nombre_oportunidad: 'El snack que se lleva al agua', senales: [{ observacion: 'Sube la búsqueda', fuente: 'demanda' }, { observacion: 'Un rival lo retiró', fuente: 'competencia' }], conclusion: 'Hay hueco.' },
  tension:              { items: [{ tension: 'Quieren cuidarse sin renunciar al postre', cita: 'Ojalá no supiera a dieta', de_donde: '@alguien', por_que_nadie_la_toca: 'La categoría vende culpa', que_diria_la_marca: 'Que se puede.' }] },
  timing:               { abiertas: [{ ventana: 'Amor y amistad', cierra: '2026-09-20', fase: 'antes', que_exige_ahora: 'Grabar esta semana.' }] },
  lo_que_falta:         { items: [{ hueco: 'Snacks para el trabajo', demanda_observada: 'Se busca todos los días', quien_no_lo_cubre: 'Nadie del nicho', angulo_de_la_marca: 'El break de las 4pm', intencion_comercial: 'alta' }] },
  crecimiento_categoria: { total_cambio: '+18%', efecto_categoria: 22, efecto_cuota: -4, cuota_antes: '27%', cuota_ahora: '23%', unidad: 'interacciones del nicho' },
  tendencia_o_moda:      { senales: [{ tema: 'proteína de huevo', serie: [3, 5, 8, 14, 19], semanas_activa: 11, plataformas: ['instagram', 'tiktok'], consistencia: 'alta', veredicto: 'tendencia' }, { tema: 'el reto del vaso', serie: [2, 40, 12, 3], semanas_activa: 2, plataformas: ['tiktok'], consistencia: 'baja', veredicto: 'moda' }] },
  tres_horizontes:       { h1: [{ senal: 'Boyacá en 8 días', que_exige: 'Grabar esta semana', cuando: '2026-08-07' }], h2: [{ senal: 'El snack como propuesta social', que_preparar: 'Un formato de viernes', revisar_el: '2026-09-15' }], h3: [{ senal: 'Proteína alternativa masiva', por_que_importa: 'Redefine la categoría en 2 años' }] },
  derecho_a_jugar:       { items: [{ senal: 'El vocabulario del antojo', autoridad: 'si', audiencia: 'si', momento: 'justo', territorio: 'disputado', veredicto: 'adaptar', razon: 'La marca puede hablar de antojo sin traicionar el ingrediente honesto.' }] },
  curva_adopcion:        { senales: [{ tema: 'proteína de huevo', mezcla: [50, 35, 15] }], nota_metodo: '18 perfiles clasificados' },
  decision_del_dia:     { decision: 'Grabar el Reel del equipo buceando', por_que: 'La alianza pedía eso, no una infografía.', costo_de_no_hacerla: 'Se cierra la ventana con el socio.', quien: 'equipo_humano', horizonte: 'esta_semana' },
  autoridad_adn:        { items: [{ senal: 'El auge del running', veredicto: 'adaptar', razon_desde_el_adn: 'La marca habla de energía, no de deporte', puerta_de_entrada: 'El desayuno de quien madruga.' }] },
  puerta_aprobacion:    { items: [{ que: 'Publicar el Reel', puerta: 'publicacion', espera_desde: '2026-07-28', costo_de_esperar: 'Pierde el momento', estado: 'vence_pronto' }] },
  produccion_viva:      { accion_actual: 'Investigando el ángulo del Reel', en_curso: [{ pieza: 'Reel buceo', formato: 'reel', sirve_a: 'La decisión de hoy', estado: 'creando' }], bloqueado: [{ que: 'El copy', por: 'Falta aprobación', desde: '2026-07-29' }] },
  pieza_asombro:        { titulo: 'El equipo bajo el agua', escena: 'El equipo entrando al mar al amanecer.', formato: 'reel', por_que_este_formato: 'El movimiento cuenta la historia.', copy_semilla: 'Donde menos lo esperas.', por_que_nadie_mas: 'Nadie más tiene esa alianza.' },
  formato:              { items: [{ idea: 'La receta', formato: 'reel', descartado: 'carrusel', por_que_moriria: 'Informa en vez de antojar', prueba: 'Los Reels tienen 3x la tasa de guardado.' }] },
  cadena_portafolio:    { eslabones: [{ pieza: 'Reel', canal: 'instagram', empuja_a: 'Perfil', estado: 'existe' }, { pieza: 'Landing', canal: 'web', estado: 'falta' }], roto_en: 'No hay dónde aterrizar', que_se_pierde: 'Toda la intención de compra' },
  verificacion:         { revisadas: 6, corregidas: [{ pieza: 'Copy del Reel', que_estaba_mal: 'Usaba una palabra prohibida', como_quedo: 'Reescrito' }], rechazadas: [{ pieza: 'Carrusel', por_que: 'Genérico' }] },
  brief_humano:         { items: [{ que: 'Grabar la inmersión', sirve_a: 'La decisión de hoy', con_quien: 'El equipo + DivingLife', donde: 'Santa Marta', pasos: ['Llegar 6am'], tiempo: 'Media jornada', no_hacer: 'No guionizar la reacción', listo_cuando: 'Se ve el nervio real.' }] },
  bucle_outcome:        { tasa_acierto: '3 de 5', items: [{ movida: 'Subir el presupuesto del Reel', cuando: '2026-07-10', estado: 'se_hizo', resultado: 'Duplicó el alcance', veredicto: 'acerte' }] },
  recalibracion:        { creia: 'Que el carrusel educaba', lo_tumbo: 'Lo retiraron a las 3 horas', ahora_creo: 'Que aburre', que_hago_distinto: 'Propongo Reel primero.' },
  humildad:             { dato_faltante: [{ que: 'El tráfico web', que_decision_cojea: 'No sé si la pieza vende' }], afirmacion_fragil: { cual: 'Que la audiencia es toda madres', por_que_fragil: 'Solo vi 40 comentarios' } },
  a2a_readiness:        { veredicto: 'mencionada', consulta: { pregunta: '¿Mejores snacks proteicos?', que_respondio: 'Nombra a tres marcas, no a esta.', aparece: false } },
};

describe('reparto — cada card vive en el tab que le toca', () => {
  test.each(Object.entries(REPARTO).flatMap(([tab, tipos]) => tipos.map((t) => [t, tab])))(
    '%s → %s', (tipo, tab) => {
      // El catálogo se declara en la fuente: se lee de ahí, no de una copia.
      const linea = FUENTE.split('\n').find((l) => new RegExp(`^\\s{4}${tipo}:\\s`).test(l));
      expect(linea, `falta la card ${tipo} en el catálogo`).toBeTruthy();
      expect(linea).toContain(`tab: '${tab}'`);
    });

  test('las tres cards sin tablero siguen sin tablero (hablan de Vera, no de la marca)', () => {
    ['recalibracion', 'humildad', 'a2a_readiness'].forEach((t) => {
      const linea = FUENTE.split('\n').find((l) => new RegExp(`^\\s{4}${t}:\\s`).test(l));
      expect(linea).toContain('tab: null');
    });
  });

  test('el catálogo tiene exactamente las 48 cards (30 del documento + 6 Competencia + 7 Mi Marca + 5 Tendencias)', () => {
    const tipos = [...FUENTE.matchAll(/^\s{4}([a-z_0-9]+):\s+\{ tab:/gm)].map((m) => m[1]);
    expect(tipos).toHaveLength(48);
    expect(new Set(tipos).size).toBe(48);        // sin duplicados
  });
});

describe('cada card pinta con su ejemplo mínimo', () => {
  const vista = cargarVista();
  test.each(Object.keys(EJEMPLO))('%s', (tipo) => {
    const html = vista._vera4CardHtml({ type: tipo, ...EJEMPLO[tipo] });
    expect(html, `${tipo} no pintó nada con datos válidos`).toBeTruthy();
    expect(html).toContain(`data-v4="${tipo}"`);
    expect(html).toContain('v4-card');
  });
});

describe('sin contenido no queda marco huérfano', () => {
  const vista = cargarVista();
  test.each(Object.keys(EJEMPLO))('%s vacía → nada', (tipo) => {
    expect(vista._vera4CardHtml({ type: tipo })).toBe('');
  });

  test('un type desconocido se ignora (forward-compatible)', () => {
    expect(vista._vera4CardHtml({ type: 'card_del_futuro', titulo: 'x' })).toBe('');
    expect(vista._vera4CardHtml(null)).toBe('');
  });

  test('una card con items vacíos tampoco pinta', () => {
    expect(vista._vera4CardHtml({ type: 'senal_debil', items: [] })).toBe('');
    expect(vista._vera4CardHtml({ type: 'anomalia', items: [null] })).toBe('');
  });
});

describe('escapado — el texto de Vera nunca es markup', () => {
  const vista = cargarVista();
  const VENENO = '<img src=x onerror=alert(1)>';

  test.each(Object.keys(EJEMPLO))('%s escapa el texto de terceros', (tipo) => {
    // Se envenena TODO string del ejemplo: cada plantilla toca campos distintos.
    const envenenar = (v) => {
      if (typeof v === 'string') return VENENO;
      if (Array.isArray(v)) return v.map(envenenar);
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, envenenar(x)]));
      }
      return v;
    };
    const html = vista._vera4CardHtml({ type: tipo, ...envenenar(EJEMPLO[tipo]) });
    // La carga viaja como TEXTO (&lt;img…), nunca como etiqueta: lo que se
    // comprueba es que no exista el tag crudo ni el payload literal.
    expect(html).not.toContain('<img');
    expect(html).not.toContain(VENENO);
    expect(html).toContain('&lt;img');
  });
});
