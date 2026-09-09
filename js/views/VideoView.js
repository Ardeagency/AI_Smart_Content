/**
 * VideoView — página de generación de video con Seedance 2.0 (vía KIE).
 *
 * Un solo modelo: no hay paso de "elegir modelo". Kling 3.0, su Director
 * Console, su panel de Cinematografía, el Asset Stack y el carrusel de
 * Escenas salieron de esta página; el backend de Kling (functions/kling-*)
 * NO se tocó porque js/living.js lo sigue usando como poller genérico de KIE.
 *
 * ESTADO DEL MOTOR (leer antes de tocar):
 *  - Conservado y funcional: polling de la tarea KIE (pollTask), persistencia
 *    del video en R2 (downloadAndUploadKieVideo), cobro dinámico de créditos
 *    (kie-task-finalize, dentro de pollTask), registro en system_ai_outputs
 *    y el contexto de marca (loadBrandData / buildBrandContextForAPI).
 *  - Cableado: Frames Clave y Referencias Multimodales suben a Storage, se
 *    validan (cupo por grupo y duración MEDIDA, no supuesta), se muestran
 *    como chips junto al prompt y salen en buildSeedancePayload(). Frames y
 *    referencias son excluyentes, tal como promete el sidebar.
 *  - Pendiente: el endpoint de creación. No existe
 *    functions/seedance-video-create.js, así que SEEDANCE_BACKEND_READY es
 *    false y el botón PRODUCIR avisa en pantalla en vez de disparar una
 *    tarea contra un endpoint inexistente (un 404 sería un fallo mudo). Al
 *    desplegar la función: poner el flag en true, escribir el POST y mapear
 *    los nombres de campo de buildSeedancePayload() a los de KIE.
 *
 * Las reglas del panel (adjuntos y cinematografía) están cubiertas por
 * test/video-seedance-panel.test.js.
 */
class VideoView extends BaseView {
  static documentTitle = 'Video';

  /**
   * Interruptor único del cableado de Seedance. Mientras sea false la página
   * es operable pero no produce: explica lo que falta en vez de fallar mudo.
   */
  static get SEEDANCE_BACKEND_READY() {
    return false;
  }
  /** POST: crear tarea Seedance en KIE. Pendiente de desplegar. */
  static get SEEDANCE_VIDEO_CREATE_API() {
    return '/.netlify/functions/seedance-video-create';
  }
  /**
   * GET: estado de la tarea. El archivo conserva el nombre `kling-video-status`
   * por historia, pero es el poller genérico de cualquier taskId de kie.ai
   * (lo comparte Studio en js/living.js). No renombrar sin migrar ambos.
   */
  static get KIE_TASK_STATUS_API() {
    return '/.netlify/functions/kling-video-status';
  }
  static get KIE_VIDEO_DOWNLOAD_API() {
    return '/.netlify/functions/kie-video-download';
  }
  /**
   * Topes de las referencias multimodales, tal como los anuncia el sidebar.
   * Si KIE los cambia, cambiar aqui Y el texto del contador: un limite que
   * la UI promete y el codigo no aplica (o al reves) se paga en el error de
   * la API, cuando el usuario ya subio los archivos.
   */
  static get SEEDANCE_REF_LIMITS() {
    return { image: 9, video: 3, audio: 3 };
  }
  /** Duracion maxima de un video/audio de referencia, en segundos. */
  static get SEEDANCE_REF_MAX_SECONDS() { return 15; }
  /** Bucket donde viven los adjuntos de referencia. */
  static get SEEDANCE_STORAGE_BUCKET() { return 'production-outputs'; }
  /**
   * Cuántas imágenes del producto entran como bloqueo. Dos bastan para fijar
   * la identidad del objeto; el catálogo guarda hasta cuatro y meterlas todas
   * se comía casi la mitad del cupo de imágenes con un solo producto,
   * dejando sin espacio a las referencias de estilo.
   */
  static get SEEDANCE_PRODUCT_LOCK_IMAGES() { return 2; }
  /** Doc KIE: empezar polling 2-3s; dejar de hacer polling a los 10-15 min. Usamos 3s y máximo 12 min. */
  static get POLL_INTERVAL_MS() { return 3000; }
  static get POLL_MAX_DURATION_MS() { return 12 * 60 * 1000; }
  /** Tope del textarea del Director Console (px); no debe comerse el canvas. */
  static get DIRECTOR_BRIEF_MAX_HEIGHT_PX() { return 200; }
  /** Tope adicional como fracción del alto de ventana (el menor con DIRECTOR_BRIEF_MAX_HEIGHT_PX gana). */
  static get DIRECTOR_BRIEF_MAX_VIEWPORT_FRAC() { return 0.26; }

  constructor() {
    super();
    this.templatePath = null;
    this._pollInterval = null;
    this.supabase = null;
    this.organizationId = null;
    this.brandContainerId = null;
    this.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
    this.selectedCampaignId = '';
    this.selectedAudienceId = '';
    // Frames Clave: { url, storagePath } por slot, o null.
    this.seedanceFrames = { first: null, last: null };
    // Referencias multimodales por tipo:
    //   [{ name, url, storagePath, seconds, origen, lock }]
    // `origen` distingue de dónde salió cada una — 'manual' (subida por el
    // usuario), 'produccion' (elegida en Escenas) o 'activo' (producto o
    // servicio del Stack). Importa porque solo las manuales viven en nuestro
    // bucket y solo esas se borran al quitarlas; las otras son URLs que ya
    // existían. Todas cuentan para el mismo cupo, que es de KIE.
    this.seedanceRefs = { image: [], video: [], audio: [] };
    // Producciones previas (Escenas) y selección activa.
    this.videoProductions = [];
    this.selectedProductionIds = new Set();
    // Elementos: el catálogo de la marca —productos, personajes, escenarios,
    // servicios— en filas por tipo. No hay "uno seleccionado": se arrastran (o
    // se tocan) y entran como referencias de imagen del prompt. El estado vive
    // en seedanceRefs con origen 'activo', no aquí.
    this.dbData.places = [];
    this.dbData.characters = [];
    // Slot que disparo el file picker de frames (el input es uno solo).
    this._pendingFrameSlot = null;
    // NO hay estado de dirección. La ley de la casa (portada del Studio de
    // accounts-arde): tocar una opción no prende un botón, ESCRIBE su variable
    // en el prompt. Lo elegido está escrito y se quita borrándolo como se borra
    // una palabra. Un panel con estado paralelo decía una cosa y el prompt otra,
    // y solo al producir se sabía cuál mandó.
    this.editor = null;
    this._catalogo = null;
    // Tokens del ultimo cine-prompt — usados al finalize del video para
    // cobrar dinamico (KIE_real + OpenAI_tokens + 5 markup). Init explicito
    // para que primer acceso no sea undefined (P3#2 audit 2026-05-25).
    this._cinePromptTokens = null;
    this._lastKieOutputId = null;
  }

  /**
   * EL CATALOGO DE CINEMATOGRAFIA — cada opcion es una VARIABLE DE PROMPT.
   *
   * `valor` es lo que se ve en el tile; `prompt` es la frase que de verdad
   * dirige al modelo; `desc` explica que hace a quien no es del oficio.
   * "Rim light" es una pista; su frase es una instruccion, y el modelo produce
   * con lo segundo.
   *
   * Tocar un tile NO prende un boton: escribe `[Etiqueta: Valor]` en el prompt,
   * donde este el cursor. Ver js/studio/direccion.js.
   */
  static get CINE_OPCIONES() {
    return {
      shotType: [
        { valor: 'Macro Detail', prompt: 'Shot type: extreme macro detail, texture filling the frame.', desc: window.__('Detalle extremo. Textura y material en primer plano.') },
        { valor: 'Close-up', prompt: 'Shot type: close-up, the subject filling the frame.', desc: window.__('Plano cerrado sobre el sujeto. Íntimo y directo.') },
        { valor: 'Medium Shot', prompt: 'Shot type: medium shot balancing subject and environment.', desc: window.__('Plano medio. Sujeto y algo de contexto.') },
        { valor: 'Wide Shot', prompt: 'Shot type: wide shot placing the subject within its full scene.', desc: window.__('Plano abierto. El entorno cuenta tanto como el sujeto.') },
        { valor: 'Hero Product Frame', prompt: 'Shot type: hero product frame, the product as absolute protagonist.', desc: window.__('El producto como protagonista absoluto.') },
        { valor: 'Over-the-Shoulder', prompt: 'Shot type: over-the-shoulder framing from behind the subject.', desc: window.__('Desde detrás del hombro. Mete al espectador en la escena.') },
        { valor: 'POV', prompt: 'Shot type: first-person point of view.', desc: window.__('Punto de vista en primera persona. Inmersivo.') },
        { valor: 'Top Down', prompt: 'Shot type: top-down overhead view.', desc: window.__('Cenital. Muestra distribución y composición.') },
        { valor: 'Low Angle', prompt: 'Shot type: low angle looking up, making the subject feel larger.', desc: window.__('Desde abajo. Engrandece al sujeto.') },
        { valor: 'High Angle', prompt: 'Shot type: high angle looking down over the subject.', desc: window.__('Desde arriba. Contexto y observación.') }
      ],
      lens: [
        { valor: '24mm (Wide Cinematic)', prompt: 'Shot at 24mm, wide cinematic perspective with exaggerated foreground.', desc: window.__('Gran angular. Exagera el primer plano y abre el espacio.') },
        { valor: '35mm (Natural)', prompt: 'Shot at 35mm, natural perspective close to human vision.', desc: window.__('Cercano a como ve el ojo. Reportaje y lifestyle.') },
        { valor: '50mm (Balanced)', prompt: 'Shot at 50mm, standard undistorted perspective.', desc: window.__('Sin distorsión. El lente honesto de catálogo.') },
        { valor: '85mm (Portrait Compression)', prompt: 'Shot at 85mm, portrait compression separating subject from background.', desc: window.__('Comprime y separa del fondo. El retrato de siempre.') },
        { valor: '100mm Macro', prompt: 'Shot at 100mm macro, focusing centimetres from the subject.', desc: window.__('Enfoca a centímetros. Texturas y detalle.') }
      ],
      framing: [
        { valor: 'Centered', prompt: 'Framing is centered and stable.', desc: window.__('Sujeto al centro. Estable, directo, comercial clásico.') },
        { valor: 'Rule of thirds', prompt: 'Framing follows the rule of thirds.', desc: window.__('Sujeto descentrado sobre líneas guía. Natural y dinámico.') },
        { valor: 'Negative space left', prompt: 'Framing leaves negative space on the left of the subject.', desc: window.__('Aire a la izquierda. Deja sitio para texto.') },
        { valor: 'Negative space right', prompt: 'Framing leaves negative space on the right of the subject.', desc: window.__('Aire a la derecha. Deja sitio para texto.') },
        { valor: 'Symmetrical', prompt: 'Framing is perfectly symmetrical.', desc: window.__('Composición simétrica. Orden y autoridad.') },
        { valor: 'Dynamic off-center', prompt: 'Framing is dynamic and off-center, creating visual tension.', desc: window.__('Descentrada y con tensión. Editorial.') }
      ],
      cameraMovement: [
        { valor: 'Static', prompt: 'The camera remains completely static throughout the shot.', desc: window.__('La cámara permanece fija. Ideal para tomas limpias y producto en primer plano.') },
        { valor: 'Slow Push In', prompt: 'The camera slowly pushes in towards the subject, building tension.', desc: window.__('La cámara se acerca lentamente al sujeto. Crea tensión y resalta un punto focal.') },
        { valor: 'Slow Pull Out', prompt: 'The camera slowly pulls out, revealing the surrounding environment.', desc: window.__('La cámara se aleja lentamente. Revela el entorno y da contexto al sujeto.') },
        { valor: 'Dolly Left', prompt: 'The camera dollies to the left while keeping the subject framed.', desc: window.__('La cámara se desplaza hacia la izquierda manteniendo al sujeto centrado.') },
        { valor: 'Dolly Right', prompt: 'The camera dollies to the right, exploring the scene laterally.', desc: window.__('La cámara se desplaza hacia la derecha. Sensación de exploración lateral.') },
        { valor: 'Orbit', prompt: 'The camera orbits around the subject in a smooth arc.', desc: window.__('La cámara gira alrededor del sujeto en arco. Cinematográfico y dramático.') },
        { valor: '360° Rotation', prompt: 'The camera completes a full 360 degree rotation around the subject.', desc: window.__('Rotación completa alrededor del sujeto. Muestra el producto desde todos los ángulos.') },
        { valor: 'Handheld', prompt: 'Handheld camera with a natural human pulse to the movement.', desc: window.__('Movimiento de mano natural con pulso humano. Documental, auténtico, cercano.') },
        { valor: 'Tracking', prompt: 'The camera tracks the moving subject, holding it in frame.', desc: window.__('La cámara sigue al sujeto en movimiento. Mantiene foco mientras hay acción.') },
        { valor: 'FPV', prompt: 'Fast first-person-view drone camera weaving through the scene.', desc: window.__('Punto de vista en primera persona. Inmersivo y dinámico (estilo dron o GoPro).') }
      ],
      motionSpeed: [
        { valor: 'Subtle', prompt: 'Motion is subtle, almost imperceptible.', desc: window.__('Movimiento muy leve, casi imperceptible. Premium y elegante.') },
        { valor: 'Moderate', prompt: 'Motion is controlled and steady.', desc: window.__('Movimiento controlado y constante. Balance entre energía y calma.') },
        { valor: 'Dynamic', prompt: 'Motion is dynamic and energetic.', desc: window.__('Movimiento marcado y enérgico. Llama la atención.') },
        { valor: 'Aggressive', prompt: 'Motion is fast and aggressive, maximum visual energy.', desc: window.__('Movimiento intenso y rápido. Máxima energía visual.') }
      ],
      motionIntensity: [
        { valor: 'Subtle', prompt: 'Movement intensity stays restrained throughout.', desc: window.__('Intensidad contenida de principio a fin.') },
        { valor: 'Moderate', prompt: 'Movement intensity is balanced.', desc: window.__('Intensidad equilibrada.') },
        { valor: 'Dynamic', prompt: 'Movement intensity is pronounced.', desc: window.__('Intensidad marcada.') },
        { valor: 'Aggressive', prompt: 'Movement intensity is extreme and relentless.', desc: window.__('Intensidad extrema y sostenida.') }
      ],
      lightType: [
        { valor: 'Soft diffused', prompt: 'Lighting: soft diffused light with no harsh shadows.', desc: window.__('Luz suave y envolvente, sin sombras duras. Sensación cálida y limpia.') },
        { valor: 'Hard contrast', prompt: 'Lighting: hard directional light with pronounced shadows.', desc: window.__('Luces fuertes y sombras marcadas. Dramatismo visual.') },
        { valor: 'Rim light', prompt: 'A rim light behind the subject traces its edge, separating it from the background.', desc: window.__('Luz que recorta el contorno del sujeto. Premium, lo separa del fondo.') },
        { valor: 'Backlit silhouette', prompt: 'The subject is backlit into a silhouette against the light.', desc: window.__('Sujeto a contraluz, silueta negra contra luz. Misterio, drama.') },
        { valor: 'Studio commercial', prompt: 'Lighting: even professional studio commercial lighting.', desc: window.__('Iluminación de estudio profesional. Limpia, pareja, comercial clásico.') },
        { valor: 'Natural daylight', prompt: 'Lighting: soft natural daylight.', desc: window.__('Luz natural de día. Auténtico, lifestyle, accesible.') },
        { valor: 'Dramatic spotlight', prompt: 'Lighting: a concentrated spotlight isolating the subject.', desc: window.__('Foco concentrado sobre el sujeto. Aislamiento y protagonismo total.') }
      ],
      contrastLevel: [
        { valor: 'Low', prompt: 'Low contrast, flat and soft tonal range.', desc: window.__('Contraste bajo. Tonos planos y suaves, look documental o vintage.') },
        { valor: 'Medium', prompt: 'Balanced, natural contrast.', desc: window.__('Contraste balanceado. Look natural y versátil.') },
        { valor: 'High', prompt: 'High contrast, punchy and vibrant.', desc: window.__('Contraste alto. Imagen punchy y vibrante.') },
        { valor: 'Ultra contrast', prompt: 'Extreme contrast with crushed blacks and bright highlights.', desc: window.__('Contraste extremo. Look gráfico, casi de moda editorial.') }
      ],
      temperature: [
        { valor: 'Neutral', prompt: 'Neutral colour temperature, true to life.', desc: window.__('Temperatura neutra. Colores reales sin tinte cálido ni frío.') },
        { valor: 'Warm', prompt: 'Warm colour temperature with golden tones.', desc: window.__('Tonos cálidos (amarillos, naranjas). Acogedor, dorado, premium.') },
        { valor: 'Cold', prompt: 'Cool colour temperature with blue tones.', desc: window.__('Tonos fríos (azules). Tecnológico, sereno, sofisticado.') }
      ],
      tone: [
        { valor: 'Clean commercial', prompt: 'Clean commercial tone: bright, uncluttered, made to sell.', desc: window.__('Look comercial clásico. Limpio, claro, vende sin distracciones.') },
        { valor: 'Cinematic dramatic', prompt: 'Cinematic dramatic tone with rich palette and tension.', desc: window.__('Look de cine con paleta rica y tensión. Storytelling potente.') },
        { valor: 'Hyperreal product', prompt: 'Hyperreal product rendering with exaggerated material detail.', desc: window.__('Producto hiperdetallado, casi macro. Saca lo mejor del objeto.') },
        { valor: 'Minimal luxury', prompt: 'Minimal luxury tone: few elements, generous empty space, quiet wealth.', desc: window.__('Estética minimal premium. Pocos elementos, mucho aire, lujo callado.') },
        { valor: 'Dark premium', prompt: 'Dark premium tone with an elegant, nocturnal palette.', desc: window.__('Paleta oscura y elegante. Producto de gama alta nocturno.') },
        { valor: 'Bright energetic', prompt: 'Bright energetic tone with vivid, saturated colour.', desc: window.__('Colores vivos y luminosos. Joven, social, juvenil.') },
        { valor: 'Editorial fashion', prompt: 'Editorial fashion tone, sophisticated and aspirational.', desc: window.__('Estética de revista de moda. Sofisticado y aspiracional.') },
        { valor: 'Documentary', prompt: 'Documentary tone: raw, unfiltered and human.', desc: window.__('Look auténtico y crudo. Sin filtros, real, humano.') }
      ],
      colorGrade: [
        { valor: 'Neutral', prompt: 'Neutral colour grade.', desc: window.__('Sin tinte. Los colores tal como son.') },
        { valor: 'Warm', prompt: 'Warm colour grade pushed towards amber.', desc: window.__('Virado a ámbar. Cálido y acogedor.') },
        { valor: 'Cold', prompt: 'Cool colour grade pushed towards teal.', desc: window.__('Virado a azul verdoso. Frío y contemporáneo.') },
        { valor: 'High saturation', prompt: 'Highly saturated colour grade.', desc: window.__('Colores muy saturados. Vibrante y llamativo.') },
        { valor: 'Muted tones', prompt: 'Muted, desaturated colour grade.', desc: window.__('Tonos apagados y elegantes. Premium discreto.') }
      ],
      energyLevel: [
        { valor: 'Low', prompt: 'Low visual energy: calm, still and quiet.', desc: window.__('Energía visual baja. Calma y quietud.') },
        { valor: 'Moderate', prompt: 'Moderate visual energy.', desc: window.__('Energía contenida. Equilibrio entre calma y presencia.') },
        { valor: 'High', prompt: 'High visual energy: bold and attention-grabbing.', desc: window.__('Energía alta. Llama la atención.') },
        { valor: 'Peak', prompt: 'Peak visual energy: relentless intensity.', desc: window.__('Energía visual máxima. Cortes rápidos, vivos, alta intensidad.') }
      ],
      pacing: [
        { valor: 'Slow contemplative', prompt: 'Pacing is slow and contemplative, letting each beat breathe.', desc: window.__('Ritmo lento. Cada momento respira.') },
        { valor: 'Balanced', prompt: 'Pacing is balanced and steady.', desc: window.__('Ritmo equilibrado, ni lento ni acelerado.') },
        { valor: 'Fast dynamic', prompt: 'Pacing is fast and dynamic, cutting with urgency.', desc: window.__('Ritmo rápido. Urgencia y energía.') }
      ],
      arc: [
        { valor: 'Continuous', prompt: 'The sequence holds one continuous emotional register.', desc: window.__('Un solo registro emocional de principio a fin.') },
        { valor: 'Crescendo', prompt: 'The sequence builds in intensity from start to finish.', desc: window.__('Sube de intensidad hasta el final.') },
        { valor: 'Decrescendo', prompt: 'The sequence winds down in intensity towards the end.', desc: window.__('Baja de intensidad hacia el final.') },
        { valor: 'Climax at end', prompt: 'The sequence saves its peak moment for the final beat.', desc: window.__('Guarda el pico para el último momento.') }
      ],
      transitions: [
        { valor: 'Hard cuts', prompt: 'Transitions are hard cuts between shots.', desc: window.__('Cortes secos. Directo y enérgico.') },
        { valor: 'Soft fades', prompt: 'Transitions are soft fades between shots.', desc: window.__('Fundidos suaves. Fluido y calmado.') },
        { valor: 'Match cuts', prompt: 'Transitions are match cuts linking shapes across shots.', desc: window.__('Cortes que enlazan formas entre tomas.') },
        { valor: 'Whip pans', prompt: 'Transitions are whip pans blurring between shots.', desc: window.__('Barridos rápidos que emborronan el corte.') },
        { valor: 'Morph', prompt: 'Transitions morph and dissolve between shots.', desc: window.__('Transformación y disolvencia entre tomas.') }
      ],
      mood: [
        { valor: 'Cinematic', prompt: 'Shot as cinematic film footage.', desc: window.__('Lenguaje de cine.') },
        { valor: 'Documentary', prompt: 'Shot as observational documentary footage.', desc: window.__('Documental observacional. Sin pose.') },
        { valor: 'Editorial', prompt: 'Shot as editorial fashion film.', desc: window.__('Film de moda editorial.') },
        { valor: 'Music video', prompt: 'Shot as a music video with rhythmic visual energy.', desc: window.__('Videoclip. Energía visual rítmica.') },
        { valor: 'Dreamlike', prompt: 'Dreamlike, ethereal atmosphere with soft haze.', desc: window.__('Atmósfera onírica y etérea.') },
        { valor: 'Commercial bright', prompt: 'Bright commercial advertising film.', desc: window.__('Comercial luminoso de marca.') }
      ],
      realism: [
        { valor: 'Realistic', prompt: 'Photorealistic footage, physically plausible.', desc: window.__('Realista y físicamente creíble.') },
        { valor: 'Stylized', prompt: 'Stylized rendering with deliberate artistic treatment.', desc: window.__('Tratamiento artístico deliberado.') },
        { valor: 'Hyperreal', prompt: 'Hyperreal rendering, sharper and more vivid than reality.', desc: window.__('Más nítido y vívido que la realidad.') },
        { valor: 'Surreal', prompt: 'Surreal imagery that breaks physical logic.', desc: window.__('Rompe la lógica física.') },
        { valor: '3D animated', prompt: 'Rendered as polished 3D animation.', desc: window.__('Animación 3D pulida.') }
      ]
    };
  }

  /** Cómo se agrupan los campos en el panel. La etiqueta es la que va al chip. */
  static get CINE_PESTANAS() {
    return [
      { id: 'movement', etiqueta: window.__('Movimiento'), icono: 'move', bloques: [
        { campo: 'cameraMovement', etiqueta: window.__('Movimiento') },
        { campo: 'motionSpeed', etiqueta: window.__('Velocidad') },
        { campo: 'motionIntensity', etiqueta: window.__('Intensidad') }
      ] },
      { id: 'lighting', etiqueta: window.__('Luz'), icono: 'idea', bloques: [
        { campo: 'lightType', etiqueta: window.__('Luz') },
        { campo: 'contrastLevel', etiqueta: window.__('Contraste') },
        { campo: 'temperature', etiqueta: window.__('Temperatura') }
      ] },
      { id: 'mood', etiqueta: 'Mood', icono: 'palette', bloques: [
        { campo: 'tone', etiqueta: window.__('Tono') },
        { campo: 'colorGrade', etiqueta: 'Color grade' },
        { campo: 'energyLevel', etiqueta: window.__('Energía') }
      ] },
      { id: 'camera', etiqueta: window.__('Cámara'), icono: 'camera', bloques: [
        { campo: 'shotType', etiqueta: window.__('Tipo de toma') },
        { campo: 'lens', etiqueta: window.__('Lente') },
        { campo: 'framing', etiqueta: window.__('Encuadre') }
      ] },
      { id: 'narrativa', etiqueta: window.__('Narrativa'), icono: 'film', bloques: [
        { campo: 'pacing', etiqueta: window.__('Ritmo') },
        { campo: 'arc', etiqueta: window.__('Arco') },
        { campo: 'transitions', etiqueta: window.__('Transiciones') }
      ] },
      { id: 'style', etiqueta: window.__('Estilo'), icono: 'video', bloques: [
        { campo: 'mood', etiqueta: window.__('Mood') },
        { campo: 'realism', etiqueta: window.__('Realismo') }
      ] }
    ];
  }

  /**
   * Recetas: escriben TODAS sus variables de golpe, en el orden del catálogo.
   * Un plano se describe en orden —movimiento, luz, color, cámara, narrativa—
   * y así el prompt se lee como lo leería un director, no como una lista.
   */
  static get CINE_RECETAS() {
    return [
      { id: 'product-launch', label: 'Product Launch', valores: { cameraMovement: 'Slow Push In', motionSpeed: 'Moderate', motionIntensity: 'Moderate', lightType: 'Studio commercial', contrastLevel: 'Medium', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', energyLevel: 'Moderate', shotType: 'Hero Product Frame', lens: '50mm (Balanced)', framing: 'Centered', pacing: 'Balanced', mood: 'Commercial bright', realism: 'Realistic' } },
      { id: 'luxury-hero', label: 'Luxury Hero', valores: { cameraMovement: 'Slow Pull Out', motionSpeed: 'Subtle', motionIntensity: 'Subtle', lightType: 'Rim light', contrastLevel: 'High', temperature: 'Warm', tone: 'Minimal luxury', colorGrade: 'Muted tones', energyLevel: 'Low', shotType: 'Wide Shot', lens: '85mm (Portrait Compression)', framing: 'Negative space left', pacing: 'Slow contemplative', mood: 'Cinematic', realism: 'Realistic' } },
      { id: 'social-performance', label: 'Social Performance', valores: { cameraMovement: 'Tracking', motionSpeed: 'Dynamic', motionIntensity: 'Dynamic', lightType: 'Natural daylight', contrastLevel: 'Medium', temperature: 'Warm', tone: 'Bright energetic', colorGrade: 'Warm', energyLevel: 'High', shotType: 'Close-up', lens: '35mm (Natural)', framing: 'Rule of thirds', pacing: 'Fast dynamic', transitions: 'Hard cuts', mood: 'Commercial bright' } },
      { id: 'cinematic-teaser', label: 'Cinematic Teaser', valores: { cameraMovement: 'Dolly Left', motionSpeed: 'Dynamic', motionIntensity: 'Dynamic', lightType: 'Dramatic spotlight', contrastLevel: 'High', temperature: 'Cold', tone: 'Cinematic dramatic', colorGrade: 'Cold', energyLevel: 'High', shotType: 'Wide Shot', lens: '24mm (Wide Cinematic)', framing: 'Dynamic off-center', pacing: 'Slow contemplative', arc: 'Climax at end', mood: 'Cinematic' } },
      { id: 'ecommerce-clean', label: 'Ecommerce Clean', valores: { cameraMovement: '360° Rotation', motionSpeed: 'Subtle', motionIntensity: 'Subtle', lightType: 'Studio commercial', contrastLevel: 'Low', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', energyLevel: 'Low', shotType: 'Hero Product Frame', lens: '50mm (Balanced)', framing: 'Symmetrical', pacing: 'Balanced', realism: 'Realistic' } },
      { id: 'tech-explainer', label: 'Tech Explainer', valores: { cameraMovement: 'Orbit', motionSpeed: 'Moderate', motionIntensity: 'Moderate', lightType: 'Soft diffused', contrastLevel: 'Low', temperature: 'Neutral', tone: 'Clean commercial', colorGrade: 'Neutral', energyLevel: 'Moderate', shotType: 'Medium Shot', lens: '35mm (Natural)', framing: 'Centered', pacing: 'Balanced', transitions: 'Match cuts', mood: 'Editorial' } }
    ];
  }

  /** El catálogo armado. Se memoiza: armarlo valida, y validar en cada tile sobra. */
  get catalogo() {
    if (!this._catalogo) {
      this._catalogo = window.StudioDireccion.armarCatalogo({
        titulo: window.__('Cinematografía'),
        opciones: VideoView.CINE_OPCIONES,
        presets: VideoView.CINE_RECETAS,
        pestanas: VideoView.CINE_PESTANAS
      });
    }
    return this._catalogo;
  }

  async onEnter() {
    if (window.authService) {
      const isAuth = await window.authService.checkAccess(true);
      if (!isAuth && window.router) {
        window.router.navigate('/login', true);
        return;
      }
    }
    if (window.appNavigation && !window.appNavigation.initialized) {
      await window.appNavigation.render();
    }
    if (window.supabaseService) {
      this.supabase = await window.supabaseService.getClient();
    } else if (window.supabase) {
      this.supabase = window.supabase;
    }
    this.organizationId = window.currentOrgId || this.routeParams?.orgId || null;
  }

  renderHTML() {
    return `
      <div class="organization-container video-view-container" id="videoPage">
        <div class="video-layout">
          <div class="video-content-row">
            <main class="video-main">
              <section class="video-canvas video-canva-view" id="videoCanvaView" aria-label="${window.__('Canvas — producción')}">

                <div class="video-canvas-idle" id="videoCanvasIdle">
                  <div class="video-canvas-idle-content">
                    <p class="video-canvas-idle__eyebrow">Stand by</p>
                    <h3 class="video-canvas-idle__title">${window.__('Listo para producir')}</h3>
                    <p class="video-canvas-idle__hint">${window.__('Describe la secuencia completa abajo. Seedance 2.0 produce el arco entero — apertura, desarrollo y cierre — en una sola pasada.')}</p>
                  </div>
                </div>

                <div class="video-status-area" id="videoStatusArea" style="display: none;">
                  <div class="video-status-card" id="videoStatusCard">
                    <div class="video-status-spinner" id="videoStatusSpinner" style="display: none;"></div>
                    <p class="video-status-text" id="videoStatusText">—</p>
                  </div>
                </div>

                <div class="video-result-area" id="videoResultArea" style="display: none;">
                  <div class="video-result-card">
                    <div class="video-result-card-header">
                      <span class="video-result-output-badge">OUTPUT</span>
                      <h2 class="video-result-title">${window.__('Video generado')}</h2>
                    </div>
                    <div class="video-result-player-wrap">
                      <video id="videoResultPlayer" class="video-result-player" controls playsinline></video>
                    </div>
                    <div class="video-result-actions">
                      <a id="videoResultDownload" class="btn btn-secondary video-download-btn" href="#" download target="_blank" rel="noopener">
                        <i class="aisc-ico aisc-ico--dowload"></i> ${window.__('Descargar')}
                      </a>
                    </div>
                  </div>
                </div>

                <div class="video-error-area" id="videoErrorArea" style="display: none;">
                  <div class="video-error-card">
                    <div class="video-error-icon-wrap"><i class="aisc-ico aisc-ico--alert-warning"></i></div>
                    <p class="video-error-text" id="videoErrorText">—</p>
                  </div>
                </div>

                <div class="video-productions-panel video-productions-panel-inline" id="videoProductionsPanel" aria-hidden="true" style="display: none;">
                  <div class="video-productions-panel-card">
                    <div class="video-productions-panel-header">
                      <h3 class="video-prompt-panel-title">${window.__('Producciones')}</h3>
                      <button type="button" class="video-productions-panel-close" id="videoProductionsPanelClose" aria-label="${window.__('Cerrar')}"><i class="aisc-ico aisc-ico--close"></i></button>
                    </div>
                    <div class="video-productions-gallery" id="videoProductionsGallery"></div>
                  </div>
                </div>

              </section>

              <section class="video-director-console-zone video-prompt-wrap video-main-director" id="seedanceFooterControl" aria-label="${window.__('Director Console Seedance — secuencia narrativa')}">
                <div class="video-prompt-footer-card video-prompt-footer-card-center">
                  <div class="video-prompt-footer-card-inner video-director-console">

                    <input type="file" id="seedanceImageUpload" accept="image/jpeg,image/png,image/jpg,video/mp4,video/quicktime,video/x-msvideo" multiple style="display: none;" aria-hidden="true">

                    <div class="video-director-recursos" id="seedanceRecursos" aria-label="${window.__('Recursos de la secuencia')}">

                      <div class="dr-grupo dr-grupo--frames">
                        <span class="dr-titulo" title="${window.__('Ancla el inicio y/o final de la secuencia con una imagen. La IA construirá el arco narrativo entre ambas.')}">${window.__('Frames Clave')}</span>
                        <input type="file" id="seedanceFrameUpload" accept="image/jpeg,image/png,image/jpg,image/webp" style="display: none;" aria-hidden="true">
                        <div class="seedance-frames-grid">
                          <div class="seedance-frame-slot" data-frame="first" id="seedanceFirstFrameSlot" role="button" tabindex="0" aria-label="${window.__('Subir imagen de primer frame')}">
                            <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
                            <span class="seedance-frame-slot-label">First Frame</span>
                            <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                          </div>
                          <div class="seedance-frame-slot" data-frame="last" id="seedanceLastFrameSlot" role="button" tabindex="0" aria-label="${window.__('Subir imagen de último frame')}">
                            <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
                            <span class="seedance-frame-slot-label">Last Frame</span>
                            <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
                          </div>
                        </div>
                      </div>

                      <div class="dr-grupo dr-grupo--refs">
                        <span class="dr-titulo" title="${window.__('Imágenes, videos y audios que la IA usa como inspiración. Mutuamente excluyentes con Frames Clave.')}">${window.__('Referencias Multimodales')}</span>
                        <input type="file" id="seedanceRefImgUpload" accept="image/jpeg,image/png,image/jpg,image/webp" multiple style="display: none;" aria-hidden="true">
                        <input type="file" id="seedanceRefVidUpload" accept="video/mp4,video/quicktime,video/webm" multiple style="display: none;" aria-hidden="true">
                        <input type="file" id="seedanceRefAudUpload" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/mp4,audio/aac" multiple style="display: none;" aria-hidden="true">

                        <div class="seedance-ref-group">
                          <div class="seedance-ref-group-header">
                            <h4 class="video-prompt-panel-title">${window.__('Imágenes')} <span class="seedance-ref-limit" id="seedanceRefImgCount">0 / 9</span></h4>
                            <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefImg" aria-label="${window.__('Añadir imágenes de referencia')}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                          </div>
                          <div class="seedance-ref-list" id="seedanceRefImgList" aria-live="polite"></div>
                        </div>

                        <div class="seedance-ref-group">
                          <div class="seedance-ref-group-header">
                            <h4 class="video-prompt-panel-title">${window.__('Videos')} <span class="seedance-ref-limit" id="seedanceRefVidCount">0 / 3 · ≤15s</span></h4>
                            <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefVid" aria-label="${window.__('Añadir videos de referencia')}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                          </div>
                          <div class="seedance-ref-list" id="seedanceRefVidList" aria-live="polite"></div>
                        </div>

                        <div class="seedance-ref-group">
                          <div class="seedance-ref-group-header">
                            <h4 class="video-prompt-panel-title">${window.__('Audios')} <span class="seedance-ref-limit" id="seedanceRefAudCount">0 / 3 · ≤15s</span></h4>
                            <button type="button" class="seedance-ref-add-btn" id="seedanceAddRefAud" aria-label="${window.__('Añadir audios de referencia')}"><i class="aisc-ico aisc-ico--add" aria-hidden="true"></i></button>
                          </div>
                          <div class="seedance-ref-list" id="seedanceRefAudList" aria-live="polite"></div>
                        </div>
                      </div>

                      <div class="dr-grupo dr-grupo--audio">
                        <span class="dr-titulo" title="${window.__('Seedance puede generar el audio de la secuencia. Activar aumenta el costo de créditos.')}">${window.__('Audio & Atmósfera')}</span>
                        <label class="seedance-toggle-row">
                          <input type="checkbox" id="seedanceGenerateAudio" checked>
                          <span class="seedance-toggle-track" aria-hidden="true"><span class="seedance-toggle-thumb"></span></span>
                          <span class="seedance-toggle-label">${window.__('Generar audio')}</span>
                        </label>
                        <div class="seedance-audio-tiles">
                          <button type="button" class="seedance-audio-tile" data-audio-type="ambient"><i class="aisc-ico aisc-ico--wind" aria-hidden="true"></i><span>${window.__('Diegético')}</span></button>
                          <button type="button" class="seedance-audio-tile" data-audio-type="music"><i class="aisc-ico aisc-ico--music" aria-hidden="true"></i><span>${window.__('Música')}</span></button>
                          <button type="button" class="seedance-audio-tile" data-audio-type="voice"><i class="aisc-ico aisc-ico--microphone" aria-hidden="true"></i><span>${window.__('Voz')}</span></button>
                          <button type="button" class="seedance-audio-tile" data-audio-type="silence"><i class="aisc-ico aisc-ico--volume" aria-hidden="true"></i><span>${window.__('Silencio')}</span></button>
                        </div>
                      </div>

                    </div>

                    <div class="video-director-console-content">
                      <div id="videoPromptEditor"></div>
                    </div>

                    <div class="video-director-controls">
                      <button type="button" class="video-director-btn-add" id="seedancePromptAdd" aria-label="${window.__('Añadir referencia visual')}"><i class="aisc-ico aisc-ico--add"></i></button>
                      <button type="button" class="video-director-toggle video-prompt-toggle" id="seedanceWebSearchToggle" title="${window.__('Búsqueda online')}" aria-pressed="false"><i class="aisc-ico aisc-ico--globe"></i><span>Web</span></button>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceResolution" class="video-director-select" aria-label="${window.__('Resolución')}">
                          <option value="480p">480p</option>
                          <option value="720p" selected>720p</option>
                          <option value="1080p">1080p</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-aspect-wrap">
                        <select id="seedanceAspectRatio" class="video-director-select" aria-label="${window.__('Relación de aspecto')}">
                          <option value="16:9" selected>16:9</option>
                          <option value="9:16">9:16</option>
                          <option value="1:1">1:1</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                          <option value="21:9">21:9 cinemascope</option>
                          <option value="adaptive">${window.__('Adaptable')}</option>
                        </select>
                        <i class="aisc-ico video-prompt-aspect-chevron aisc-ico--chevron-down" aria-hidden="true"></i>
                      </div>
                      <div class="video-prompt-duration-wrap seedance-duration-wrap">
                        <input type="number" id="seedanceDuration" class="video-director-select seedance-duration-input" min="4" max="15" step="1" value="5" aria-label="${window.__('Duración en segundos')}">
                        <span class="seedance-duration-unit">s</span>
                      </div>
                      <button type="button" class="video-director-btn-generate" id="seedancePromptSend" aria-label="${window.__('Producir la secuencia')}" data-state="production"><i class="aisc-ico aisc-ico--play"></i><span>${window.__('PRODUCIR')}</span></button>
                    </div>

                  </div>
                </div>
              </section>
            </main>

            <aside class="video-sidebar-console" aria-label="${window.__('Panel de producción')}">
              <div class="video-sidebar-tabs" role="tablist" aria-label="${window.__('Secciones del panel')}">
                <button type="button" class="video-sidebar-tab is-active" role="tab" id="videoSidebarTabElementos" data-sidebar-tab="elementos" aria-selected="true" aria-controls="videoSidebarPanelElementos">
                  <i class="aisc-ico aisc-ico--grid" aria-hidden="true"></i><span>${window.__('Elementos')}</span>
                </button>
                <button type="button" class="video-sidebar-tab" role="tab" id="videoSidebarTabEnfoque" data-sidebar-tab="enfoque" aria-selected="false" aria-controls="videoSidebarPanelEnfoque">
                  <i class="aisc-ico aisc-ico--goal" aria-hidden="true"></i><span>${window.__('Enfoque')}</span>
                </button>
                <button type="button" class="video-sidebar-tab" role="tab" id="videoSidebarTabCine" data-sidebar-tab="cinematografia" aria-selected="false" aria-controls="videoSidebarPanelCine">
                  <i class="aisc-ico aisc-ico--video" aria-hidden="true"></i><span>${window.__('Cinematografía')}</span>
                </button>
              </div>
              <div class="video-prompt-footer-card video-sidebar-card">
                <div class="video-prompt-footer-card-inner video-sidebar-inner">

                <div class="video-sidebar-panel is-active" data-sidebar-panel="elementos" role="tabpanel" id="videoSidebarPanelElementos" aria-labelledby="videoSidebarTabElementos">

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Producciones')}</h3>
                      <div class="video-sidebar-section-actions">
                        <button type="button" class="video-escenas-all-btn" id="videoProductionsBtn" aria-label="${window.__('Todas las producciones')}">${window.__('Todas')}</button>
                      </div>
                    </div>
                    <div class="video-escenas-carousel-wrap">
                      <div class="video-escenas-carousel" id="videoEscenasCarousel"></div>
                    </div>
                  </div>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Elementos')}</h3>
                    </div>
                    <div class="video-elementos-filas" id="videoElementosFilas"></div>
                  </div>

                </div>

                <div class="video-sidebar-panel" data-sidebar-panel="enfoque" role="tabpanel" id="videoSidebarPanelEnfoque" aria-labelledby="videoSidebarTabEnfoque" hidden>

                  <div class="video-sidebar-section">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Enfoque')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('De qué trata la pieza y a quién le habla. No son parámetros de KIE: entran al cocinado del prompt como contexto, y por eso son conceptos, no las campañas del CRM.')}</p>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿De qué trata?')}</h4>
                      <select id="seedanceCampaignSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Concepto de campaña')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Brand awareness">${window.__('Brand awareness · presentar la marca')}</option>
                        <option value="Product launch">${window.__('Lanzamiento de producto')}</option>
                        <option value="Lifestyle storytelling">${window.__('Lifestyle · contar una historia')}</option>
                        <option value="Educational">${window.__('Educativo · enseñar o explicar')}</option>
                        <option value="Sale / promo">${window.__('Promoción · oferta o descuento')}</option>
                        <option value="Testimonial">${window.__('Testimonial · clientes reales')}</option>
                        <option value="Reactivation">${window.__('Reactivación · clientes dormidos')}</option>
                        <option value="Seasonal moment">${window.__('Momento estacional · fecha clave')}</option>
                        <option value="Behind the scenes">${window.__('Behind the scenes · cercanía marca')}</option>
                      </select>
                    </div>
                    <div class="video-left-block">
                      <h4 class="video-prompt-panel-title">${window.__('¿A quién le habla?')}</h4>
                      <select id="seedanceAudienceSelect" class="video-prompt-db-select video-asset-scope-select" aria-label="${window.__('Audiencia conceptual')}" data-conceptual="1">
                        <option value="">${window.__('— Sin definir')}</option>
                        <option value="Young professionals 25-35">${window.__('Profesionales jóvenes (25–35)')}</option>
                        <option value="Established professionals 35-50">${window.__('Profesionales establecidos (35–50)')}</option>
                        <option value="Aspirational youth 18-28">${window.__('Aspiracionales jóvenes (18–28)')}</option>
                        <option value="Mass market">${window.__('Mercado masivo')}</option>
                        <option value="Premium / luxury audience">${window.__('Premium · audiencia de lujo')}</option>
                        <option value="Niche enthusiasts">${window.__('Nicho · entusiastas de la categoría')}</option>
                        <option value="Decision makers B2B">${window.__('Decision makers · B2B')}</option>
                        <option value="Existing customers">${window.__('Clientes existentes')}</option>
                        <option value="Parents / families">${window.__('Padres y familias')}</option>
                      </select>
                    </div>
                  </div>

                </div>

                <div class="video-sidebar-panel" data-sidebar-panel="cinematografia" role="tabpanel" id="videoSidebarPanelCine" aria-labelledby="videoSidebarTabCine" hidden>

                  <div class="video-sidebar-section video-sidebar-cine video-cinematography-panel">
                    <div class="video-sidebar-section-header">
                      <h3 class="video-section-label">${window.__('Dirección de fotografía')}</h3>
                    </div>
                    <p class="video-sidebar-section-hint">${window.__('El oficio con el que se dirige la pieza. Tocar una opción no prende un botón: escribe su variable en el prompt, donde esté el cursor.')}</p>

                    <div class="studio-receta-wrap">
                      <label class="video-cine-label" for="videoCineReceta">${window.__('Receta')}</label>
                      <select id="videoCineReceta" class="video-cine-select" aria-label="${window.__('Receta de producción')}">
                        <option value="">${window.__('Escribir una receta…')}</option>
                      </select>
                      <p class="studio-receta-hint">${window.__('Una receta escribe todas sus variables de golpe, en el orden en que se describe un plano.')}</p>
                    </div>

                    <div class="video-cine-tabs" role="tablist" aria-label="${window.__('Categoría de dirección')}" id="videoCineTabs"></div>
                    <div class="video-cine-panels" id="videoCinePanels"></div>
                  </div>

                </div>

                </div>
              </div>
              <button type="button" class="video-sidebar-help" id="seedanceSidebarHelpBtn" aria-label="${window.__('Ayuda Seedance')}" title="${window.__('Ayuda Seedance')}">?</button>
              <div class="video-sidebar-help-popover" id="seedanceSidebarHelpPopover" role="dialog" aria-label="${window.__('Ayuda Seedance')}">
                <h4>${window.__('Seedance 2.0 — secuencias narrativas')}</h4>
                <p><strong>${window.__('Recursos')}</strong>${window.__(': el material que le entregas vive junto al prompt, no aquí. Frames Clave ancla el inicio y el cierre; las Referencias Multimodales dan estilo, movimiento y vibe (hasta 9 imágenes, 3 videos y 3 audios). Frames y referencias no se combinan.')}</p>
                <p><strong>${window.__('Cinematografía')}</strong>${window.__(': cómo se ve. Cámara, movimiento, luz y mood no son parámetros de la API. Tocar una opción escribe su variable en el prompt, donde esté el cursor, y ahí queda a la vista; una Receta escribe todas de golpe.')}</p>
                <p><strong>${window.__('Contexto')}</strong>${window.__(': a qué campaña pertenece la secuencia, a quién le habla y qué producto no debe cambiar.')}</p>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `;
  }

  async init() {
    this.idleArea = this.container.querySelector('#videoCanvasIdle');
    this.statusArea = this.container.querySelector('#videoStatusArea');
    this.statusText = this.container.querySelector('#videoStatusText');
    this.statusSpinner = this.container.querySelector('#videoStatusSpinner');
    this.resultArea = this.container.querySelector('#videoResultArea');
    this.resultPlayer = this.container.querySelector('#videoResultPlayer');
    this.resultDownload = this.container.querySelector('#videoResultDownload');
    this.errorArea = this.container.querySelector('#videoErrorArea');
    this.errorText = this.container.querySelector('#videoErrorText');

    this.sendBtn = this.container.querySelector('#seedancePromptSend');
    this.aspectSelect = this.container.querySelector('#seedanceAspectRatio');

    // Botón PRODUCIR. No dispara nada mientras el endpoint de creación no
    // exista: startGeneration() explica qué falta, en el canvas.
    if (this.sendBtn && this.sendBtn.dataset.boundSeedanceSend !== '1') {
      this.sendBtn.dataset.boundSeedanceSend = '1';
      this.sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.startGeneration();
      });
    }
    // El storyboard no es un textarea: es el editor con variables como piezas
    // enteras. Un textarea no admite que un trozo tenga color, tooltip ni se
    // comporte como un átomo que un backspace se lleva completo.
    const editorHost = this.container.querySelector('#videoPromptEditor');
    if (editorHost) {
      this.editor = new window.PromptEditor(editorHost, {
        placeholder: window.__('Storyboard: describe la secuencia completa — apertura, desarrollo y cierre. Seedance produce el arco entero en una sola pasada.'),
        ariaLabel: window.__('Storyboard narrativo'),
        onEnviar: () => this.startGeneration()
      });
    }

    // ── Pestañas del sidebar: Recursos | Cinematografía ──
    this.container.querySelectorAll('.video-sidebar-tab[data-sidebar-tab]').forEach((tab) => {
      if (tab.dataset.boundSidebarTab === '1') return;
      tab.dataset.boundSidebarTab = '1';
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const destino = tab.getAttribute('data-sidebar-tab');
        if (!destino) return;
        this.container.querySelectorAll('.video-sidebar-tab[data-sidebar-tab]').forEach((t) => {
          const activa = t === tab;
          t.classList.toggle('is-active', activa);
          t.setAttribute('aria-selected', activa ? 'true' : 'false');
        });
        this.container.querySelectorAll('.video-sidebar-panel[data-sidebar-panel]').forEach((p) => {
          const activo = p.getAttribute('data-sidebar-panel') === destino;
          p.classList.toggle('is-active', activo);
          p.hidden = !activo;
        });
        // Cada panel scrollea desde su propio inicio: cambiar de pestaña y
        // aterrizar a media altura del panel anterior desorienta.
        const inner = this.container.querySelector('.video-sidebar-inner');
        if (inner) inner.scrollTop = 0;
      });
    });

    // ── Frames Clave ──
    const frameInput = this.container.querySelector('#seedanceFrameUpload');
    if (frameInput && frameInput.dataset.boundFrame !== '1') {
      frameInput.dataset.boundFrame = '1';
      frameInput.addEventListener('change', (e) => this.onSeedanceFrameFileSelected(e));
    }
    this.container.querySelectorAll('.seedance-frame-slot[data-frame]').forEach((slotEl) => {
      if (slotEl.dataset.boundSlot === '1') return;
      slotEl.dataset.boundSlot = '1';
      const slot = slotEl.getAttribute('data-frame');
      const abrir = (e) => {
        // El botón de quitar vive dentro del slot: distinguir por el target,
        // si no, quitar el frame reabre el selector de archivos.
        const quitar = e.target.closest && e.target.closest('[data-frame-remove]');
        e.preventDefault();
        if (quitar) {
          e.stopPropagation();
          this.removeSeedanceFrame(quitar.getAttribute('data-frame-remove'));
          return;
        }
        this.openSeedanceFramePicker(slot);
      };
      slotEl.addEventListener('click', abrir);
      slotEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') abrir(e);
      });
    });

    // ── Referencias multimodales ──
    [
      { kind: 'image', btn: '#seedanceAddRefImg', input: '#seedanceRefImgUpload' },
      { kind: 'video', btn: '#seedanceAddRefVid', input: '#seedanceRefVidUpload' },
      { kind: 'audio', btn: '#seedanceAddRefAud', input: '#seedanceRefAudUpload' }
    ].forEach((g) => {
      const btn = this.container.querySelector(g.btn);
      if (btn && btn.dataset.boundRef !== '1') {
        btn.dataset.boundRef = '1';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openSeedanceRefPicker(g.kind);
        });
      }
      const input = this.container.querySelector(g.input);
      if (input && input.dataset.boundRef !== '1') {
        input.dataset.boundRef = '1';
        input.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) await this.addSeedanceRefs(g.kind, files);
        });
      }
      const list = this.container.querySelector(
        g.kind === 'image' ? '#seedanceRefImgList' : g.kind === 'video' ? '#seedanceRefVidList' : '#seedanceRefAudList'
      );
      if (list && list.dataset.boundRemove !== '1') {
        list.dataset.boundRemove = '1';
        list.addEventListener('click', (e) => {
          const btnQuitar = e.target.closest('.seedance-ref-remove');
          if (!btnQuitar) return;
          e.preventDefault();
          const idx = parseInt(btnQuitar.getAttribute('data-ref-index'), 10);
          if (!Number.isNaN(idx)) this.removeSeedanceRef(btnQuitar.getAttribute('data-ref-kind'), idx);
        });
      }
    });

    // "+" del Director Console: atajo que enruta por tipo al grupo que toca.
    const consoleAdd = this.container.querySelector('#seedancePromptAdd');
    const consoleInput = this.container.querySelector('#seedanceImageUpload');
    if (consoleAdd && consoleInput && consoleAdd.dataset.boundAdd !== '1') {
      consoleAdd.dataset.boundAdd = '1';
      consoleAdd.addEventListener('click', (e) => {
        e.preventDefault();
        if (this._seedanceHasFrames()) {
          this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para añadir referencias.'));
          return;
        }
        consoleInput.click();
      });
      consoleInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        const imagenes = files.filter((f) => f.type.startsWith('image/'));
        const videos = files.filter((f) => f.type.startsWith('video/'));
        const sobrantes = files.length - imagenes.length - videos.length;
        if (sobrantes > 0) {
          this._seedanceNotify(window.__('{n} archivo(s) sin formato soportado aquí. Los audios se añaden desde el sidebar.', { n: sobrantes }));
        }
        if (imagenes.length) await this.addSeedanceRefs('image', imagenes);
        if (videos.length) await this.addSeedanceRefs('video', videos);
      });
    }

    this.renderSeedanceFrames();
    this.renderSeedanceRefs();

    // Contexto de marca ANTES del Stack de activos y de Escenas: ambos pintan
    // desde dbData.products, y si corren primero el carrusel nace diciendo
    // "no hay productos con imágenes" aunque los haya.
    // Contexto de marca: alimenta buildBrandContextForAPI() y el linaje de
    // system_ai_outputs. Los selects de campaña/audiencia son conceptuales
    // (opciones fijas en el HTML), no vienen de la BD.
    await this.loadBrandData();
    const campaignSelect = this.container.querySelector('#seedanceCampaignSelect');
    const audienceSelect = this.container.querySelector('#seedanceAudienceSelect');
    if (campaignSelect) {
      campaignSelect.addEventListener('change', () => {
        this.selectedCampaignId = campaignSelect.value || '';
      });
    }
    if (audienceSelect) {
      audienceSelect.addEventListener('change', () => {
        this.selectedAudienceId = audienceSelect.value || '';
      });
    }

    // ── Escenas: producciones previas ──
    const productionsBtn = this.container.querySelector('#videoProductionsBtn');
    const panelClose = this.container.querySelector('#videoProductionsPanelClose');
    if (productionsBtn && productionsBtn.dataset.boundProds !== '1') {
      productionsBtn.dataset.boundProds = '1';
      productionsBtn.addEventListener('click', (e) => { e.preventDefault(); this.openProductionsPanel(); });
    }
    if (panelClose && panelClose.dataset.boundProds !== '1') {
      panelClose.dataset.boundProds = '1';
      panelClose.addEventListener('click', (e) => { e.preventDefault(); this.closeProductionsPanel(); });
    }

    // ── Elementos: filas por tipo + zona de drop en las Imágenes del prompt ──
    this.renderElementosFilas();
    this.bindZonaDropImagenes();
    await this.loadVideoProductions();
    this.renderEscenasCarousel();

    // ── Cinematografía ──
    // Sin botón de restablecer: no hay estado que restablecer. Lo elegido está
    // escrito en el prompt y se quita borrando el chip.
    this.initCinematography();

    // Seedance: toggle Audio + Web search (solo UI state, sin wiring backend aún)
    ['seedanceWebSearchToggle'].forEach((id) => {
      const btn = this.container.querySelector('#' + id);
      if (!btn) return;
      // El estado inicial viene en aria-pressed desde el HTML; la clase la
      // pone el clic. Sincronizarlas al montar evita que un toggle encendido
      // de origen se vea distinto a uno que el usuario encendió.
      btn.classList.toggle('active', btn.getAttribute('aria-pressed') === 'true');
      if (btn.dataset.boundToggle === '1') return;
      btn.dataset.boundToggle = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
        btn.classList.toggle('active', !pressed);
      });
    });
    // Seedance: botón de ayuda del sidebar
    const seedanceHelpBtn = this.container.querySelector('#seedanceSidebarHelpBtn');
    const seedanceHelpPopover = this.container.querySelector('#seedanceSidebarHelpPopover');
    if (seedanceHelpBtn && seedanceHelpPopover && seedanceHelpBtn.dataset.boundHelp !== '1') {
      seedanceHelpBtn.dataset.boundHelp = '1';
      seedanceHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        seedanceHelpPopover.classList.toggle('is-open');
      });
      document.addEventListener('click', (e) => {
        if (!seedanceHelpPopover.classList.contains('is-open')) return;
        if (seedanceHelpPopover.contains(e.target) || seedanceHelpBtn.contains(e.target)) return;
        seedanceHelpPopover.classList.remove('is-open');
      });
    }
    // Seedance: audio type tiles (toggle exclusive)
    this.container.querySelectorAll('.seedance-audio-tile[data-audio-type]').forEach((tile) => {
      if (tile.dataset.boundAudio === '1') return;
      tile.dataset.boundAudio = '1';
      tile.addEventListener('click', (e) => {
        e.preventDefault();
        const wasActive = tile.classList.contains('is-active');
        this.container.querySelectorAll('.seedance-audio-tile[data-audio-type]').forEach((t) => t.classList.remove('is-active'));
        if (!wasActive) tile.classList.add('is-active');
      });
    });

  }

  /**
   * El editor crece solo (CSS: `max-height` + scroll propio), así que ya no hay
   * altura que calcular a mano. Se conserva el método porque los renders de
   * chips lo llaman tras cambiar la fila de adjuntos.
   */
  scheduleResizeDirectorBriefInput() {
    /* el alto lo resuelve el CSS del editor */
  }

  async getBrandContainerId() {
    if (!this.supabase) return null;
    try {
      // Regla central de aislamiento: marca dentro de la org activa, sin fallback
      // cross-org a user_id (ver js/org-url.js resolveActiveBrandContainerId).
      const uid = this.userId || (await this.supabase.auth.getUser())?.data?.user?.id || null;
      return await window.resolveActiveBrandContainerId(this.supabase, this.organizationId, uid);
    } catch (e) {
      console.error('VideoView getBrandContainerId:', e);
      return null;
    }
  }

  async loadBrandData() {
    this.brandContainerId = await this.getBrandContainerId();
    if (!this.supabase || !this.brandContainerId) return;
    try {
      const bcId = this.brandContainerId;
      // Modelo nuevo: las columnas "brand-level" viven en brand_containers
      // (nicho_core, arquetipo, verbal_dna, etc.) y brand_profiles se filtra
      // por brand_container_id en vez de brand_id.
      const { data: brandRow } = await this.supabase
        .from('brand_containers')
        .select(
          'id, nicho_core, sub_nichos, arquetipo, propuesta_valor, mision_vision, verbal_dna, visual_dna, palabras_clave, palabras_prohibidas, objetivos_estrategicos'
        )
        .eq('id', bcId)
        .maybeSingle();
      this.dbData.brand = brandRow || null;
      this.dbData.brandProfiles = [];
      if (brandRow?.id) {
        const { data: profiles } = await this.supabase.from('brand_profiles').select('section, content').eq('brand_container_id', brandRow.id);
        this.dbData.brandProfiles = profiles || [];
      }
      // audiences: tabla legacy reemplazada por audience_personas (BUG-005).
      // campaigns: contexto_temporal/objetivos_estrategicos/tono_modificador
      // viven en campaign_briefs (BUG-006); resolvemos vía embed PostgREST
      // usando la FK campaigns.brief_id → campaign_briefs.id.
      //
      // Scope por tabla (modelo org vs brand_container):
      //  - products/audience_personas/campaigns: tienen brand_container_id,
      //    filtran por sub-marca.
      //  - services/brand_entities: org-scope (compartidos entre todas las
      //    sub-marcas de la org), filtran por organization_id. Filtrar por
      //    brand_container_id en estas tablas dispara 400 (columna inexistente).
      const orgId = this.organizationId || window.currentOrgId;
      const [productsRes, servicesRes, entitiesRes, audiencesRes, campaignsRes] = await Promise.all([
        this.supabase.from('products').select('id, entity_id, nombre_producto, brand_container_id').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        orgId
          ? this.supabase.from('services').select('id, entity_id, nombre_servicio').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        orgId
          ? this.supabase.from('brand_entities').select('id, name, entity_type, description').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] }),
        this.supabase.from('audience_personas').select('id, name, description, estilo_lenguaje').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50),
        this.supabase.from('campaigns').select('id, nombre_campana, descripcion_interna, persona_id, brief_id, campaign_briefs:brief_id(contexto_temporal, objetivos_estrategicos, tono_modificador)').eq('brand_container_id', bcId).order('created_at', { ascending: false }).limit(50)
      ]);
      this.dbData.products = productsRes.data || [];
      this.dbData.services = servicesRes.data || [];
      this.dbData.entities = entitiesRes.data || [];
      // Escenarios y personajes cuelgan de brand_entities (no tienen FK a la
      // org), así que se piden con los ids de entidad que acabamos de traer.
      await this.loadPlacesAndCharacters((entitiesRes.data || []).map((e) => e.id).filter(Boolean));
      this.dbData.audiences = audiencesRes.data || [];
      // Aplanar campos del brief al row de campaña para que el resto del
      // código siga accediendo como c.contexto_temporal, c.tono_modificador, etc.
      this.dbData.campaigns = (campaignsRes.data || []).map((c) => {
        const brief = c.campaign_briefs || {};
        return {
          id: c.id,
          nombre_campana: c.nombre_campana,
          descripcion_interna: c.descripcion_interna,
          persona_id: c.persona_id,
          brief_id: c.brief_id,
          contexto_temporal: brief.contexto_temporal || null,
          objetivos_estrategicos: brief.objetivos_estrategicos || null,
          tono_modificador: brief.tono_modificador || null,
        };
      });
      const productIds = this.dbData.products.map((p) => p.id).filter(Boolean);
      if (productIds.length > 0) {
        const { data: imgs } = await this.supabase.from('product_images').select('product_id, image_url, image_type, image_order').in('product_id', productIds).order('image_order', { ascending: true });
        const byProduct = {};
        (imgs || []).forEach((img) => {
          if (!byProduct[img.product_id]) byProduct[img.product_id] = [];
          byProduct[img.product_id].push(img.image_url);
        });
        this.dbData.products.forEach((p) => {
          p.image_urls = (byProduct[p.id] || []).slice(0, 4);
        });
      }
      this.renderCampaignDropdown();
      this.renderAudienceDropdown();
    } catch (e) {
      console.error('VideoView loadBrandData:', e);
    }
  }

  /**
   * Escenarios y personajes. Van aparte de loadBrandData porque necesitan los
   * entity_ids ya resueltos: `brand_places` y `brand_characters` no tienen FK
   * a la organización, cuelgan de la entidad. La consulta vive en el servicio
   * (regla de oro de la auditoría 2026-07-02).
   */
  async loadPlacesAndCharacters(entityIds) {
    if (!this.assetsData) this.assetsData = new window.BrandAssetsDataService(this.supabase);
    const { places, characters } = await this.assetsData.loadElementos(entityIds);
    this.dbData.places = places;
    this.dbData.characters = characters;
  }

  renderCampaignDropdown() {
    // Conceptual: opciones hardcoded en el HTML, NO se popula desde BD.
    // Las campañas en /video son conceptos narrativos (Brand awareness, Product
    // launch, etc.) no campañas reales del CRM. El backend recibe el string
    // conceptual y OpenAI lo usa como contexto del prompt.
    const select = this.container.querySelector('#seedanceCampaignSelect');
    if (!select) return;
    if (this.selectedCampaignId && Array.from(select.options).some((o) => o.value === this.selectedCampaignId)) {
      select.value = this.selectedCampaignId;
    }
  }

  renderAudienceDropdown() {
    // Conceptual: opciones hardcoded en HTML, NO BD. Misma lógica que campañas.
    const select = this.container.querySelector('#seedanceAudienceSelect');
    if (!select) return;
    if (this.selectedAudienceId && Array.from(select.options).some((o) => o.value === this.selectedAudienceId)) {
      select.value = this.selectedAudienceId;
    }
  }

  hideAllFeedback() {
    if (this.idleArea) this.idleArea.style.display = 'flex';
    if (this.statusArea) this.statusArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'none';
  }

  showStatus(message, showSpinner = true) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.statusArea) this.statusArea.style.display = 'block';
    if (this.statusText) this.statusText.textContent = message;
    if (this.statusSpinner) this.statusSpinner.style.display = showSpinner ? 'block' : 'none';
  }

  showResult(url) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.resultArea) this.resultArea.style.display = 'block';
    if (this.resultPlayer) {
      this.resultPlayer.src = url;
      this.resultPlayer.load();
    }
    if (this.resultDownload) {
      this.resultDownload.href = url;
      this.resultDownload.download = '';
    }
  }

  /**
   * Persiste el video de KIE en R2 (media.aismartcontent.io) via kie-output-persist:
   * el worker de ingesta lo descarga server-side — el video ya no pasa por el
   * browser ni por Supabase Storage. Devuelve URLs completas (los lectores hacen
   * pass-through cuando storage_path empieza con http).
   * @param {string} kieVideoUrl - URL del video devuelta por KIE (resultUrls[0])
   * @param {string} taskId - ID de la tarea KIE (para nombre de archivo)
   * @returns {{ publicUrl: string, storagePath: string } | null}
   */
  async downloadAndUploadKieVideo(kieVideoUrl, taskId) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.access_token) return null;

    this.showStatus(window.__('Guardando en tu cuenta…'), true);
    try {
      const res = await fetch('/.netlify/functions/kie-output-persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kie_url: kieVideoUrl, task_id: taskId, kind: 'video' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || window.__('Descarga fallida: {status}', { status: res.status }));
      }
      return { publicUrl: data.public_url || null, storagePath: data.storage_path };
    } catch (err) {
      console.error('VideoView downloadAndUploadKieVideo:', err);
      throw err;
    }
  }

  showError(message) {
    this.hideAllFeedback();
    if (this.idleArea) this.idleArea.style.display = 'none';
    if (this.errorArea) this.errorArea.style.display = 'block';
    if (this.errorText) this.errorText.textContent = message;
  }

  buildBrandContextForAPI() {
    const d = this.dbData || {};
    const brand = d.brand || {};
    const arr = (v) => (Array.isArray(v) ? v : []);
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return {
      brand_voice: {
        nicho_core: brand.nicho_core || '',
        sub_nichos: arr(brand.sub_nichos),
        arquetipo: brand.arquetipo || null,
        propuesta_valor: brand.propuesta_valor || null,
        mision_vision: brand.mision_vision || null,
        verbal_dna: obj(brand.verbal_dna),
        visual_dna: obj(brand.visual_dna),
        palabras_clave: arr(brand.palabras_clave),
        palabras_prohibidas: arr(brand.palabras_prohibidas),
        objetivos_estrategicos: arr(brand.objetivos_estrategicos)
      },
      brand_profiles: (d.brandProfiles || []).map((p) => ({ section: p.section, content: p.content })),
      entities: (d.entities || []).map((e) => ({ name: e.name, entity_type: e.entity_type, description: e.description })),
      products: (d.products || []).map((p) => ({ name: p.nombre_producto })),
      audiences: (d.audiences || []).map((a) => ({ name: a.name, description: a.description, estilo_lenguaje: a.estilo_lenguaje })),
      campaigns: (d.campaigns || []).map((c) => ({ name: c.nombre_campana, description: c.descripcion_interna, audience_id: c.persona_id, contexto_temporal: c.contexto_temporal, objetivos_estrategicos: c.objetivos_estrategicos, tono_modificador: c.tono_modificador })),
      selected_campaign: this.selectedCampaignId ? (d.campaigns || []).find((c) => String(c.id) === String(this.selectedCampaignId)) || null : null,
      selected_audience: this.selectedAudienceId ? (d.audiences || []).find((a) => String(a.id) === String(this.selectedAudienceId)) || null : null
    };
  }

  async saveSystemAIOutput(record) {
    if (!this.supabase) return null;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return null;
      const brandContainerId = this.brandContainerId || await this.getBrandContainerId();
      if (!brandContainerId) return null;
      // Schema unificado runs_outputs <-> system_ai_outputs (2026-05-22).
      // Pueblan automaticamente los campos comunes desde el state del view;
      // el caller solo pasa lo especifico (provider, output_type, prompt,
      // metadata, etc.).
      const briefId = this._resolveSelectedBriefId();
      const entityId = this._resolveSelectedEntityId();
      const row = {
        brand_container_id: brandContainerId,
        organization_id: this.organizationId || null,
        user_id: user.id,
        campaign_id: this.selectedCampaignId || null,
        persona_id: this.selectedAudienceId || null,
        brief_id: briefId,
        entity_id: entityId,
        ...record,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await this.supabase.from('system_ai_outputs').insert(row).select('id').single();
      if (error) {
        console.warn('VideoView saveSystemAIOutput:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (e) {
      console.warn('VideoView saveSystemAIOutput:', e);
      return null;
    }
  }

  /**
   * Resuelve brief_id desde la campana seleccionada (campaigns.brief_id ya
   * viene aplanado en dbData.campaigns). Devuelve null si no hay campana
   * seleccionada o la campana no tiene brief.
   */
  _resolveSelectedBriefId() {
    if (!this.selectedCampaignId) return null;
    const c = (this.dbData?.campaigns || []).find((x) => String(x.id) === String(this.selectedCampaignId));
    return c?.brief_id || null;
  }

  /**
   * Linaje del output: la entidad del PRIMER elemento puesto. Antes había un
   * solo activo elegido y la respuesta era única; ahora se pueden soltar
   * varios, y el primero es el que manda — es el que el director eligió antes
   * de empezar a acompañarlo.
   */
  _resolveSelectedEntityId() {
    const primero = (this.seedanceRefs.image || []).find((r) => r.origen === 'activo' && r._entityId);
    return primero ? primero._entityId : null;
  }

  async updateSystemAIOutput(id, updates) {
    if (!this.supabase || !id) return;
    try {
      await this.supabase.from('system_ai_outputs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e) {
      console.warn('VideoView updateSystemAIOutput:', e);
    }
  }

  /**
   * Aviso al usuario. Un adjunto rechazado en silencio se lee como aceptado
   * y el error aparece 10 minutos despues, en KIE.
   */
  _seedanceNotify(message, type = 'warning') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, { type, duration: 5000 });
    } else if (window.alert) {
      window.alert(message);
    }
  }

  _seedanceHasFrames() {
    return !!(this.seedanceFrames.first || this.seedanceFrames.last);
  }

  _seedanceRefCount() {
    return ['image', 'video', 'audio']
      .reduce((n, kind) => n + (this.seedanceRefs[kind] || []).length, 0);
  }

  /**
   * Mide la duracion REAL leyendo los metadatos del archivo — ni el peso ni
   * el nombre dicen cuanto dura. Devuelve segundos, o null si el navegador
   * no pudo decodificarlo; en ese caso dejamos pasar el archivo a proposito:
   * bloquear por una medicion que fallo es peor que dejar que KIE lo
   * rechace con su propio mensaje.
   */
  _measureMediaSeconds(file, kind) {
    return new Promise((resolve) => {
      let url = null;
      let timer = null;
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        resolve(value);
      };
      timer = setTimeout(() => finish(null), 8000);
      try {
        url = URL.createObjectURL(file);
        const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
        el.preload = 'metadata';
        el.onloadedmetadata = () => {
          const d = Number(el.duration);
          finish(Number.isFinite(d) && d > 0 ? d : null);
        };
        el.onerror = () => finish(null);
        el.src = url;
      } catch (_) {
        finish(null);
      }
    });
  }

  /** Sube un adjunto y devuelve { url, storagePath }. Lanza si algo falla. */
  async _uploadSeedanceFile(file, folder) {
    if (!this.supabase || !this.supabase.storage) {
      throw new Error(window.__('Almacenamiento no disponible. Recarga la página y reintenta.'));
    }
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user?.id) throw new Error(window.__('Inicia sesión para subir referencias.'));
    const bucket = VideoView.SEEDANCE_STORAGE_BUCKET;
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/jpeg/, 'jpg');
    const storagePath = `seedance/${user.id}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(storagePath);
    const url = data?.publicUrl;
    if (!url) throw new Error(window.__('El archivo subió pero Storage no devolvió URL pública.'));
    return { url, storagePath };
  }

  /** Limpieza del bucket al quitar un adjunto. Fire-and-forget: no bloquea la UI. */
  _removeSeedanceStorage(storagePath) {
    if (!storagePath || !this.supabase?.storage) return;
    this.supabase.storage
      .from(VideoView.SEEDANCE_STORAGE_BUCKET)
      .remove([storagePath])
      .catch((err) => console.warn('[VideoView] limpieza de Storage falló', storagePath, err));
  }

  // ── Frames Clave ────────────────────────────────────────────────────────

  openSeedanceFramePicker(slot) {
    if (this._seedanceRefCount() > 0) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita las referencias para anclar frames.'));
      return;
    }
    const input = this.container.querySelector('#seedanceFrameUpload');
    if (!input) return;
    this._pendingFrameSlot = slot;
    input.click();
  }

  async onSeedanceFrameFileSelected(e) {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    const slot = this._pendingFrameSlot;
    this._pendingFrameSlot = null;
    if (!file || !slot) return;
    if (!file.type.startsWith('image/')) {
      this._seedanceNotify(window.__('Un frame clave es una imagen (JPG, PNG o WebP).'));
      return;
    }
    const label = slot === 'first' ? 'First Frame' : 'Last Frame';
    try {
      const subido = await this._uploadSeedanceFile(file, 'frames');
      const previo = this.seedanceFrames[slot];
      if (previo) this._removeSeedanceStorage(previo.storagePath);
      this.seedanceFrames[slot] = subido;
      this.renderSeedanceFrames();
    } catch (err) {
      console.error('VideoView frame upload:', err);
      this._seedanceNotify(window.__('No se pudo subir {label}: ', { label }) + (err.message || ''), 'error');
    }
  }

  removeSeedanceFrame(slot) {
    const frame = this.seedanceFrames[slot];
    if (!frame) return;
    this._removeSeedanceStorage(frame.storagePath);
    this.seedanceFrames[slot] = null;
    this.renderSeedanceFrames();
  }

  renderSeedanceFrames() {
    [['first', '#seedanceFirstFrameSlot', 'First Frame'], ['last', '#seedanceLastFrameSlot', 'Last Frame']]
      .forEach(([slot, sel, label]) => {
        const el = this.container.querySelector(sel);
        if (!el) return;
        const frame = this.seedanceFrames[slot];
        if (!frame) {
          el.classList.remove('has-image');
          el.style.backgroundImage = '';
          el.innerHTML = `
            <i class="aisc-ico aisc-ico--image" aria-hidden="true"></i>
            <span class="seedance-frame-slot-label">${label}</span>
            <span class="seedance-frame-slot-hint">${window.__('Click para subir')}</span>
          `;
          return;
        }
        el.classList.add('has-image');
        el.style.backgroundImage = `url("${this.escapeHtml(frame.url)}")`;
        el.innerHTML = `
          <span class="seedance-frame-slot-label">${label}</span>
          <button type="button" class="seedance-frame-slot-remove" data-frame-remove="${slot}" aria-label="${window.__('Quitar {label}', { label })}">&times;</button>
        `;
      });
  }

  // ── Referencias multimodales ────────────────────────────────────────────

  openSeedanceRefPicker(kind) {
    if (this._seedanceHasFrames()) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para añadir referencias.'));
      return;
    }
    const inputs = { image: '#seedanceRefImgUpload', video: '#seedanceRefVidUpload', audio: '#seedanceRefAudUpload' };
    const input = this.container.querySelector(inputs[kind]);
    if (input) input.click();
  }

  /**
   * Valida (tipo, cupo y duracion medida), sube y registra cada archivo.
   * Secuencial a proposito: subir 9 imagenes en paralelo satura la conexion
   * y deja huerfanos en el bucket si el usuario se va a mitad.
   */
  async addSeedanceRefs(kind, files) {
    if (this._seedanceHasFrames()) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para añadir referencias.'));
      return;
    }
    const limite = VideoView.SEEDANCE_REF_LIMITS[kind];
    const libre = Math.max(0, limite - (this.seedanceRefs[kind] || []).length);
    if (libre === 0) {
      this._seedanceNotify(window.__('Ya tienes el máximo de {limite} en este grupo. Quita una para añadir otra.', { limite }));
      return;
    }
    const usables = files.slice(0, libre);
    if (files.length > libre) {
      this._seedanceNotify(window.__('Solo caben {libre} más en este grupo: se ignoran {sobran}.', { libre, sobran: files.length - libre }));
    }

    for (const file of usables) {
      let seconds = null;
      if (kind === 'video' || kind === 'audio') {
        seconds = await this._measureMediaSeconds(file, kind);
        const tope = VideoView.SEEDANCE_REF_MAX_SECONDS;
        if (seconds != null && seconds > tope) {
          this._seedanceNotify(window.__('"{name}" dura {seconds}s y el tope es {tope}s. Recórtalo antes de subirlo.', {
            name: file.name, seconds: Math.round(seconds), tope
          }));
          continue;
        }
      }
      try {
        const subido = await this._uploadSeedanceFile(file, `${kind}s`);
        this.seedanceRefs[kind].push({ name: file.name, seconds, origen: 'manual', ...subido });
        this.renderSeedanceRefs();
      } catch (err) {
        console.error('VideoView ref upload:', err);
        this._seedanceNotify(window.__('No se pudo subir "{name}": ', { name: file.name }) + (err.message || ''), 'error');
      }
    }
  }

  removeSeedanceRef(kind, index) {
    const item = (this.seedanceRefs[kind] || [])[index];
    if (!item) return;
    // Solo las subidas por el usuario viven en nuestro bucket. Las que vienen
    // de una producción o de un producto son URLs ajenas: borrarlas del
    // Storage se llevaría por delante la producción original.
    if (item.origen === 'manual') this._removeSeedanceStorage(item.storagePath);
    this.seedanceRefs[kind].splice(index, 1);
    // Quitar el chip también tiene que apagar su origen; si no, la tarjeta
    // sigue marcada en el carrusel y el próximo sync la vuelve a meter.
    if (item.origen === 'produccion' && item._productionId != null) {
      this.selectedProductionIds.delete(item._productionId);
      this.renderEscenasCarousel();
      this.renderProductionsGallery();
    }
    if (item.origen === 'activo') {
      // Un elemento puede haber aportado dos imágenes: se van las dos, o la
      // fila seguiría marcándolo como puesto con media identidad dentro.
      this.seedanceRefs[kind] = this.seedanceRefs[kind].filter(
        (r) => !(r.origen === 'activo' && String(r._assetId) === String(item._assetId))
      );
      this.renderElementosFilas();
    }
    this.renderSeedanceRefs();
  }

  // ── Escenas: producciones previas como material de referencia ───────────

  getPublicUrlFromStorage(bucketName, filePath) {
    // R2 (media.aismartcontent.io): storage_path puede ser URL completa -> pass-through
    if (typeof filePath === 'string' && /^(https?:|\/\/)/i.test(filePath.trim())) return filePath.trim();
    if (!this.supabase?.storage?.from || !bucketName || typeof filePath !== 'string' || !filePath.trim()) return null;
    try {
      let path = filePath.trim();
      if (path.startsWith(`${bucketName}/`)) path = path.replace(`${bucketName}/`, '');
      else if (path.startsWith('/')) path = path.slice(1);
      const { data } = this.supabase.storage.from(bucketName).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (e) {
      return null;
    }
  }

  async loadVideoProductions() {
    if (!this.supabase) return;
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user?.id) return;

      const resolveMedia = (o) => {
        let media_url = null;
        const rawPath = o.storage_path && typeof o.storage_path === 'string' ? o.storage_path.trim() : '';
        if (rawPath) {
          if (rawPath.startsWith('http')) media_url = rawPath;
          else media_url = this.getPublicUrlFromStorage('production-outputs', rawPath) || this.getPublicUrlFromStorage('outputs', rawPath);
        }
        const meta = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
        if (!media_url) {
          media_url = meta.video_url || meta.url || meta.file_url || meta.videoUrl || meta.output_url || meta.publicUrl || meta.src || null;
        }
        const type = (o.output_type || '').toLowerCase();
        const isVideo = type.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(media_url || '');
        const isImage = type.includes('image') || type.includes('img') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(media_url || '');
        return { ...o, media_url, isVideo, isImage };
      };

      // Origen 1: runs_outputs (linkeados a flow_runs de la org activa).
      // Sin el filtro de organization_id, un usuario multi-org veria los videos
      // de todas sus orgs mezclados en cualquier workspace.
      let runsQ = this.supabase.from('flow_runs').select('id').eq('user_id', user.id);
      if (this.organizationId) runsQ = runsQ.eq('organization_id', this.organizationId);
      const { data: runs } = await runsQ;
      const runIds = (runs || []).map((r) => r.id).filter(Boolean);
      let fromRuns = [];
      if (runIds.length > 0) {
        const { data: roData } = await this.supabase
          .from('runs_outputs')
          .select('id, run_id, output_type, storage_path, metadata, created_at')
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
          .limit(100);
        fromRuns = roData || [];
      }

      // Origen 2: system_ai_outputs (videos generados desde VideoView mismo
      // o cualquier herramienta standalone). Filtrar por organization_id
      // para que el contexto sea consistente con loadFlowOutputs en
      // LivingManager.
      let fromSystem = [];
      if (this.organizationId) {
        const { data: saoData } = await this.supabase
          .from('system_ai_outputs')
          .select('id, output_type, storage_path, metadata, created_at')
          .eq('organization_id', this.organizationId)
          .neq('provider', 'openai')
          .order('created_at', { ascending: false })
          .limit(100);
        fromSystem = saoData || [];
      }

      const merged = [...fromRuns, ...fromSystem]
        .map(resolveMedia)
        .filter((o) => o.media_url)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      // Dedupe por id (defensive — runs_outputs y system_ai_outputs tienen
      // namespace de id distinto pero por si acaso).
      const seen = new Set();
      this.videoProductions = merged.filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
    } catch (e) {
      console.warn('VideoView loadVideoProductions:', e);
      this.videoProductions = [];
    }
  }

  /** Pinta una lista de producciones (carrusel del sidebar o galería del panel). */
  _renderProduccionesEn(selector, claseItem, claseThumb, claseVacio, textoVacio) {
    const cont = this.container.querySelector(selector);
    if (!cont) return;
    if (this.videoProductions.length === 0) {
      cont.innerHTML = `<p class="${claseVacio}">${textoVacio}</p>`;
      return;
    }
    cont.innerHTML = this.videoProductions.map((p) => {
      const seleccionada = this.selectedProductionIds.has(p.id);
      const url = this.escapeHtml(p.media_url || '');
      const esImagen = p.isImage && !p.isVideo;
      const thumb = esImagen
        ? `<img class="${claseThumb} ${claseThumb}-img" src="${url}" alt="" loading="lazy" decoding="async">`
        : `<video class="${claseThumb}" src="${url}" preload="metadata" muted playsinline crossorigin="anonymous"></video>`;
      // Una imagen puede anclar un Frame Clave; un video no —un frame es una
      // imagen— y por eso el tile dice a dónde puede ir, en el title.
      const destino = esImagen
        ? window.__('Arrástrala a un Frame Clave o a las Imágenes del prompt')
        : window.__('Arrástrala a los Videos del prompt');
      return `
        <div class="${claseItem} ${seleccionada ? 'is-selected' : ''}" data-id="${this.escapeHtml(p.id)}" data-medio="${esImagen ? 'image' : 'video'}" role="button" tabindex="0" draggable="true" aria-pressed="${seleccionada}" aria-label="${window.__('Producción')}" title="${destino}">
          <div class="${claseThumb}-wrap">${thumb}</div>
        </div>`;
    }).join('');
    cont.querySelectorAll('.' + claseItem).forEach((el) => {
      el.addEventListener('click', () => this.toggleProduccion(el.dataset.id));
      el.addEventListener('dragstart', (e) => {
        const carga = JSON.stringify({ fuente: 'produccion', id: el.dataset.id, medio: el.dataset.medio });
        e.dataTransfer.setData(VideoView.DND_ELEMENTO, carga);
        e.dataTransfer.setData('text/plain', carga);
        e.dataTransfer.effectAllowed = 'copy';
        el.classList.add('is-arrastrando');
        document.body.classList.add('video-arrastrando-elemento');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('is-arrastrando');
        document.body.classList.remove('video-arrastrando-elemento');
      });
    });
  }

  renderEscenasCarousel() {
    this._renderProduccionesEn(
      '#videoEscenasCarousel', 'video-escena-item', 'video-escena-thumb', 'video-escenas-empty',
      window.__('Aún no hay producciones. Las producciones de tus flows aparecerán aquí.')
    );
  }

  renderProductionsGallery() {
    this._renderProduccionesEn(
      '#videoProductionsGallery', 'video-production-item', 'video-production-thumb', 'video-productions-empty',
      window.__('Aún no hay producciones. Las producciones de tus flows aparecerán aquí.')
    );
  }

  toggleProduccion(id) {
    if (id == null) return;
    if (this.selectedProductionIds.has(id)) {
      this.selectedProductionIds.delete(id);
    } else {
      if (this._seedanceHasFrames()) {
        this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para usar una escena como referencia.'));
        return;
      }
      this.selectedProductionIds.add(id);
    }
    this.syncProductionSelectionToRefs();
    this.renderEscenasCarousel();
    this.renderProductionsGallery();
  }

  /**
   * Vuelca las producciones elegidas en las referencias multimodales — el
   * mismo cupo que las subidas a mano, porque el límite es de KIE y no le
   * importa de dónde salió cada archivo. Si una no cabe, se deselecciona y
   * se avisa: dejarla marcada sin estar en el payload sería mentir.
   */
  syncProductionSelectionToRefs() {
    ['image', 'video'].forEach((kind) => {
      this.seedanceRefs[kind] = this.seedanceRefs[kind].filter((r) => r.origen !== 'produccion');
    });
    const rechazadas = [];
    Array.from(this.selectedProductionIds).forEach((id) => {
      const p = this.videoProductions.find((prod) => String(prod.id) === String(id));
      if (!p || !p.media_url) return;
      const kind = p.isVideo ? 'video' : 'image';
      if (this.seedanceRefs[kind].length >= VideoView.SEEDANCE_REF_LIMITS[kind]) {
        this.selectedProductionIds.delete(id);
        rechazadas.push(kind);
        return;
      }
      this.seedanceRefs[kind].push({
        name: `${window.__('Escena')} ${String(p.id).slice(0, 8)}`,
        url: p.media_url,
        storagePath: null,
        seconds: null,
        origen: 'produccion',
        _productionId: p.id
      });
    });
    if (rechazadas.length) {
      this._seedanceNotify(window.__('{n} escena(s) no caben: el grupo ya está en su máximo. Quita una referencia y vuelve a intentar.', { n: rechazadas.length }));
    }
    this.renderSeedanceRefs();
  }

  async openProductionsPanel() {
    const panel = this.container.querySelector('#videoProductionsPanel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    await this.loadVideoProductions();
    this.renderProductionsGallery();
  }

  closeProductionsPanel() {
    const panel = this.container.querySelector('#videoProductionsPanel');
    if (!panel) return;
    const btn = this.container.querySelector('#videoProductionsBtn');
    if (btn && typeof btn.focus === 'function') btn.focus();
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    this.renderEscenasCarousel();
  }

  // ── Elementos: el catálogo de la marca, en filas por tipo ───────────────

  /**
   * Los cuatro tipos que la marca sabe describir, en el orden en que se piensa
   * una escena: qué se vende, quién aparece, dónde pasa, qué se ofrece.
   *
   * `lock` marca los que NO deben cambiar: el producto y el personaje tienen
   * identidad —una botella con su etiqueta, una cara— y alterarla arruina la
   * pieza. Un escenario es contexto: que la IA lo interprete no rompe nada.
   */
  static get ELEMENTO_TIPOS() {
    return [
      { tipo: 'product', etiqueta: window.__('Productos'), icono: 'aisc-ico--product', campo: 'products', nombre: 'nombre_producto', lock: true },
      { tipo: 'character', etiqueta: window.__('Personajes'), icono: 'aisc-ico--characters', campo: 'characters', nombre: 'nombre_personaje', lock: true },
      { tipo: 'place', etiqueta: window.__('Escenarios'), icono: 'aisc-ico--compass', campo: 'places', nombre: 'nombre_lugar', lock: false },
      { tipo: 'service', etiqueta: window.__('Servicios'), icono: 'aisc-ico--service', campo: 'services', nombre: 'nombre_servicio', lock: false }
    ];
  }

  /** Cuántas imágenes aporta un elemento al soltarlo. Ver SEEDANCE_PRODUCT_LOCK_IMAGES. */
  static get ELEMENTO_MAX_IMAGENES() { return VideoView.SEEDANCE_PRODUCT_LOCK_IMAGES; }

  /** Un elemento por id, con su tipo. Fuente única para el drop y para el clic. */
  _buscarElemento(tipo, id) {
    const def = VideoView.ELEMENTO_TIPOS.find((t) => t.tipo === tipo);
    if (!def) return null;
    const fila = (this.dbData[def.campo] || []).find((x) => String(x.id) === String(id));
    if (!fila) return null;
    return {
      def,
      id: fila.id,
      entityId: fila.entity_id || null,
      nombre: fila[def.nombre] || def.etiqueta,
      imagenes: Array.isArray(fila.image_urls) ? fila.image_urls.filter(Boolean) : []
    };
  }

  /** Los elementos que ya están puestos como referencia, para marcarlos. */
  _elementosPuestos() {
    return new Set(
      (this.seedanceRefs.image || [])
        .filter((r) => r.origen === 'activo' && r._assetId != null)
        .map((r) => String(r._assetId))
    );
  }

  renderElementosFilas() {
    const cont = this.container.querySelector('#videoElementosFilas');
    if (!cont) return;
    const puestos = this._elementosPuestos();

    const filas = VideoView.ELEMENTO_TIPOS.map((def) => {
      const items = this.dbData[def.campo] || [];
      const cuerpo = items.length === 0
        ? `<p class="video-escenas-empty">${window.__('Sin {tipo}', { tipo: def.etiqueta.toLowerCase() })}</p>`
        : items.map((fila) => {
          const nombre = fila[def.nombre] || def.etiqueta;
          const url = (Array.isArray(fila.image_urls) ? fila.image_urls : []).filter(Boolean)[0] || '';
          const puesto = puestos.has(String(fila.id));
          // Sin imagen no hay nada que soltar en un grupo de imágenes. Se
          // muestra igual —existe en la marca— pero se dice por qué no se
          // puede arrastrar, en vez de quedar inerte sin explicación.
          const arrastrable = !!url;
          const titulo = arrastrable ? nombre : `${nombre} — ${window.__('sin imagen: no se puede usar como referencia')}`;
          // MISMO contenedor que una producción: `video-escena-item`. El
          // nombre vive en el title, no debajo — un carrusel de miniaturas se
          // lee por la imagen, y las etiquetas obligaban a un tile más alto y
          // distinto al de al lado.
          const dentro = arrastrable
            ? `<img class="video-escena-thumb video-escena-thumb-img" src="${this.escapeHtml(url)}" alt="" loading="lazy" decoding="async" draggable="false">`
            : `<span class="video-escena-thumb video-elemento-sin-imagen"><i class="aisc-ico ${def.icono}" aria-hidden="true"></i></span>`;
          return `
            <div class="video-escena-item video-elemento-item${puesto ? ' is-selected' : ''}${arrastrable ? '' : ' is-sin-imagen'}"
              data-tipo="${this.escapeHtml(def.tipo)}"
              data-id="${this.escapeHtml(fila.id)}"
              role="button" tabindex="0"
              ${arrastrable ? 'draggable="true"' : ''}
              aria-pressed="${puesto}"
              aria-label="${this.escapeHtml(titulo)}"
              title="${this.escapeHtml(titulo)}">
              <div class="video-escena-thumb-wrap">${dentro}</div>
            </div>`;
        }).join('');
      return `
        <div class="video-elementos-fila" data-tipo="${this.escapeHtml(def.tipo)}">
          <span class="video-elementos-fila-label"><i class="aisc-ico ${def.icono}" aria-hidden="true"></i>${this.escapeHtml(def.etiqueta)}</span>
          <div class="video-escenas-carousel">${cuerpo}</div>
        </div>`;
    }).join('');

    cont.innerHTML = filas;

    if (cont.dataset.boundElementos !== '1') {
      cont.dataset.boundElementos = '1';
      // Tocar hace lo mismo que arrastrar. No es un adorno: arrastrar no existe
      // con teclado y en táctil es un pulso fino; sin el clic, el panel sería
      // inalcanzable para media casa.
      cont.addEventListener('click', (e) => {
        const tile = e.target.closest('.video-elemento-item');
        if (!tile || tile.classList.contains('is-sin-imagen')) return;
        e.preventDefault();
        this.alternarElemento(tile.getAttribute('data-tipo'), tile.getAttribute('data-id'));
      });
      cont.addEventListener('dragstart', (e) => {
        const tile = e.target.closest('.video-elemento-item');
        if (!tile || tile.classList.contains('is-sin-imagen')) return;
        const carga = JSON.stringify({ fuente: 'elemento', tipo: tile.getAttribute('data-tipo'), id: tile.getAttribute('data-id') });
        // Tipo propio para que el drop distinga un elemento de un archivo del
        // escritorio; `text/plain` de respaldo porque Safari ignora los tipos
        // personalizados en algunas versiones.
        e.dataTransfer.setData(VideoView.DND_ELEMENTO, carga);
        e.dataTransfer.setData('text/plain', carga);
        e.dataTransfer.effectAllowed = 'copy';
        tile.classList.add('is-arrastrando');
        document.body.classList.add('video-arrastrando-elemento');
      });
      cont.addEventListener('dragend', (e) => {
        const tile = e.target.closest('.video-elemento-item');
        if (tile) tile.classList.remove('is-arrastrando');
        document.body.classList.remove('video-arrastrando-elemento');
      });
    }
  }

  /** El tipo MIME propio del arrastre. Un solo sitio para que no se desincronice. */
  static get DND_ELEMENTO() { return 'application/x-aisc-elemento'; }

  /**
   * La zona de Imágenes del prompt acepta elementos soltados. Es el grupo que
   * ya lleva las referencias visuales: soltar ahí es decir "esto entra en la
   * toma", que es exactamente lo que significa una referencia de imagen.
   */
  bindZonaDropImagenes() {
    const zona = this.container.querySelector('#seedanceRefImgList')?.closest('.seedance-ref-group');
    if (!zona || zona.dataset.boundDrop === '1') return;
    zona.dataset.boundDrop = '1';
    zona.classList.add('es-zona-drop');

    zona.addEventListener('dragover', (e) => {
      // Sin preventDefault el navegador NO dispara 'drop': la zona se ve activa
      // y no recibe nada. `types` se puede leer en dragover; `getData` no.
      if (!e.dataTransfer.types.includes(VideoView.DND_ELEMENTO)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      zona.classList.add('is-drop-activa');
    });
    zona.addEventListener('dragleave', (e) => {
      // Solo al salir de la zona de verdad: pasar sobre un hijo dispara
      // dragleave y la zona parpadearía.
      if (zona.contains(e.relatedTarget)) return;
      zona.classList.remove('is-drop-activa');
    });
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.classList.remove('is-drop-activa');
      const carga = VideoView.leerCargaDnD(e.dataTransfer);
      if (!carga) return;
      if (carga.fuente === 'produccion') this.ponerProduccionEnRefs(carga.id);
      else this.ponerElemento(carga.tipo, carga.id);
    });

    this.bindZonaDropFrames();
  }

  /**
   * Lee la carga del arrastre. `getData` solo funciona en el drop —en dragover
   * el navegador la esconde a propósito—, de ahí que el resaltado se decida
   * mirando `types` y el contenido solo aquí.
   */
  static leerCargaDnD(dt) {
    const crudo = dt.getData(VideoView.DND_ELEMENTO) || dt.getData('text/plain') || '';
    try {
      const o = JSON.parse(crudo);
      return o && o.id && (o.fuente === 'produccion' || o.tipo) ? o : null;
    } catch (_) { return null; }
  }

  /**
   * Los dos slots de Frame Clave reciben producciones. Solo imágenes: un frame
   * ES una imagen, y dejar caer un video ahí produciría un error de KIE diez
   * minutos después.
   */
  bindZonaDropFrames() {
    this.container.querySelectorAll('.seedance-frame-slot[data-frame]').forEach((slot) => {
      if (slot.dataset.boundDrop === '1') return;
      slot.dataset.boundDrop = '1';
      slot.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes(VideoView.DND_ELEMENTO)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.classList.add('is-drop-activa');
      });
      slot.addEventListener('dragleave', (e) => {
        if (slot.contains(e.relatedTarget)) return;
        slot.classList.remove('is-drop-activa');
      });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('is-drop-activa');
        const carga = VideoView.leerCargaDnD(e.dataTransfer);
        if (!carga) return;
        if (carga.fuente !== 'produccion') {
          this._seedanceNotify(window.__('Un Frame Clave se ancla con una producción, no con un elemento del catálogo.'));
          return;
        }
        this.ponerProduccionEnFrame(slot.getAttribute('data-frame'), carga.id);
      });
    });
  }

  /** Una producción soltada en las referencias: mismo camino que tocarla. */
  ponerProduccionEnRefs(id) {
    if (this.selectedProductionIds.has(id)) return;
    this.toggleProduccion(id);
  }

  /**
   * Ancla una producción en un slot de frame. Frames y referencias siguen
   * siendo excluyentes: si ya hay referencias, se avisa en vez de dejar la
   * secuencia en un estado que KIE rechaza.
   */
  ponerProduccionEnFrame(slot, id) {
    const p = this.videoProductions.find((x) => String(x.id) === String(id));
    if (!p || !p.media_url || !slot) return;
    if (!p.isImage || p.isVideo) {
      this._seedanceNotify(window.__('Un Frame Clave es una imagen: esa producción es un video.'));
      return;
    }
    if (this._seedanceRefCount() > 0) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita las referencias para anclar frames.'));
      return;
    }
    // La producción vive en su bucket, no en el nuestro: se guarda sin
    // storagePath para que quitarla NO borre el archivo original.
    const previo = this.seedanceFrames[slot];
    if (previo) this._removeSeedanceStorage(previo.storagePath);
    this.seedanceFrames[slot] = { url: p.media_url, storagePath: null, origen: 'produccion' };
    this.renderSeedanceFrames();
  }

  /** Tocar un elemento: si ya está puesto lo quita, si no lo pone. */
  alternarElemento(tipo, id) {
    if (this._elementosPuestos().has(String(id))) this.quitarElemento(id);
    else this.ponerElemento(tipo, id);
  }

  /**
   * Mete las imágenes del elemento como referencias. Respeta el cupo de KIE: si
   * no caben todas, avisa — un elemento a medias es peor que uno rechazado,
   * porque el usuario cree que mandó la identidad completa.
   */
  ponerElemento(tipo, id) {
    const el = this._buscarElemento(tipo, id);
    if (!el) return;
    if (this._elementosPuestos().has(String(el.id))) return;

    if (this._seedanceHasFrames()) {
      this._seedanceNotify(window.__('Frames Clave y Referencias Multimodales son excluyentes: quita los frames para usar un elemento.'));
      return;
    }
    if (!el.imagenes.length) {
      this._seedanceNotify(window.__('"{name}" no tiene imagen, así que no puede entrar como referencia.', { name: el.nombre }));
      return;
    }

    const libre = VideoView.SEEDANCE_REF_LIMITS.image - this.seedanceRefs.image.length;
    if (libre <= 0) {
      this._seedanceNotify(window.__('No cabe: el grupo de imágenes ya está en su máximo. Quita una referencia y vuelve a intentar.'));
      return;
    }
    const urls = el.imagenes.slice(0, Math.min(VideoView.ELEMENTO_MAX_IMAGENES, libre));
    urls.forEach((url) => {
      this.seedanceRefs.image.push({
        name: el.nombre,
        url,
        storagePath: null,
        seconds: null,
        origen: 'activo',
        lock: el.def.lock,
        _assetId: el.id,
        _assetTipo: el.def.tipo,
        _entityId: el.entityId
      });
    });
    if (el.imagenes.length > urls.length) {
      this._seedanceNotify(window.__('De "{name}" solo cupieron {n} imagen(es).', { name: el.nombre, n: urls.length }));
    }
    this.renderSeedanceRefs();
    this.renderElementosFilas();
  }

  /** Saca todas las referencias que vinieron de ese elemento. */
  quitarElemento(id) {
    const antes = this.seedanceRefs.image.length;
    this.seedanceRefs.image = this.seedanceRefs.image.filter(
      (r) => !(r.origen === 'activo' && String(r._assetId) === String(id))
    );
    if (this.seedanceRefs.image.length === antes) return;
    this.renderSeedanceRefs();
    this.renderElementosFilas();
  }


  renderSeedanceRefs() {
    const tope = VideoView.SEEDANCE_REF_MAX_SECONDS;
    const grupos = [
      { kind: 'image', list: '#seedanceRefImgList', count: '#seedanceRefImgCount', sufijo: '', icono: 'aisc-ico--image' },
      { kind: 'video', list: '#seedanceRefVidList', count: '#seedanceRefVidCount', sufijo: ` · ≤${tope}s`, icono: 'aisc-ico--film' },
      { kind: 'audio', list: '#seedanceRefAudList', count: '#seedanceRefAudCount', sufijo: ` · ≤${tope}s`, icono: 'aisc-ico--music' }
    ];
    grupos.forEach((g) => {
      const items = this.seedanceRefs[g.kind] || [];
      const countEl = this.container.querySelector(g.count);
      if (countEl) countEl.textContent = `${items.length} / ${VideoView.SEEDANCE_REF_LIMITS[g.kind]}${g.sufijo}`;
      const listEl = this.container.querySelector(g.list);
      if (!listEl) return;
      listEl.innerHTML = items.map((item, idx) => {
        const nombre = this.escapeHtml(item.name || g.kind);
        const dur = item.seconds != null ? ` · ${Math.round(item.seconds)}s` : '';
        const cuerpo = g.kind === 'image'
          ? `<img class="seedance-ref-thumb" src="${this.escapeHtml(item.url)}" alt="" loading="lazy">`
          : `<i class="aisc-ico ${g.icono}" aria-hidden="true"></i><span class="seedance-ref-name">${nombre}${dur}</span>`;
        // Una referencia de producto NO es inspiración: es la instrucción de
        // que eso no cambie. Sin distintivo, en la fila se ve idéntica a una
        // imagen de estilo y el usuario no sabe cuál está bloqueando.
        const candado = item.lock
          ? `<span class="seedance-ref-lock" aria-hidden="true" title="${window.__('Bloqueo de producto')}"><i class="aisc-ico aisc-ico--bookmark"></i></span>`
          : '';
        const titulo = item.lock
          ? `${nombre}${dur} — ${window.__('bloqueo de producto')}`
          : `${nombre}${dur}`;
        return `<span class="seedance-ref-item${item.lock ? ' is-lock' : ''}" title="${titulo}">${cuerpo}${candado}<button type="button" class="seedance-ref-remove" data-ref-kind="${g.kind}" data-ref-index="${idx}" aria-label="${window.__('Quitar {name}', { name: nombre })}">&times;</button></span>`;
      }).join('');
    });
  }

  /**
   * La fila de chips bajo el prompt se retiró: repetía —con otro dibujo— lo que
   * la banda de recursos ya muestra justo encima, y sus × eran un segundo sitio
   * desde donde quitar lo mismo. Un adjunto se ve y se quita en un solo lugar.
   */

  // ── Cinematografía: el catálogo escribe en el prompt ────────────────────

  /**
   * Pinta las pestañas y las rejillas desde el catálogo. Ningún tile guarda
   * estado ni se "prende": al tocarlo escribe `[Etiqueta: Valor]` en el prompt,
   * donde esté el cursor, y ahí queda a la vista. Lo elegido se quita borrando
   * el chip, como se borra una palabra.
   */
  initCinematography() {
    const cat = this.catalogo;

    // --- recetas ---
    const receta = this.container.querySelector('#videoCineReceta');
    if (receta && receta.dataset.boundReceta !== '1') {
      receta.dataset.boundReceta = '1';
      receta.innerHTML = `<option value="">${window.__('Escribir una receta…')}</option>`
        + cat.presets.map((r) => `<option value="${this.escapeHtml(r.id)}">${this.escapeHtml(r.label)}</option>`).join('');
      receta.addEventListener('change', () => {
        const preset = cat.presets.find((r) => String(r.id) === receta.value);
        // Vuelve a "Escribir una receta…": el desplegable es un disparador, no
        // un estado. Dejarlo marcado diría que esa receta sigue puesta cuando
        // el usuario ya pudo borrar la mitad de sus chips.
        receta.value = '';
        if (!preset || !this.editor) return;
        this.editor.insertar(window.StudioDireccion.variablesDeReceta(cat, preset.valores));
      });
    }

    // --- pestañas ---
    const tabs = this.container.querySelector('#videoCineTabs');
    const panels = this.container.querySelector('#videoCinePanels');
    if (!tabs || !panels) return;

    tabs.innerHTML = cat.pestanas.map((p, i) => `
      <button type="button" class="video-cine-tab${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-tab="${this.escapeHtml(p.id)}">
        <i class="aisc-ico aisc-ico--${this.escapeHtml(p.icono)}" aria-hidden="true"></i><span>${this.escapeHtml(p.etiqueta)}</span>
      </button>`).join('');

    panels.innerHTML = cat.pestanas.map((p, i) => `
      <div class="video-cine-panel${i === 0 ? ' is-active' : ''}" data-panel="${this.escapeHtml(p.id)}" role="tabpanel"${i === 0 ? '' : ' hidden'}>
        ${p.bloques.map((b) => `
          <div class="video-cine-row">
            <p class="video-cine-label">${this.escapeHtml(b.etiqueta)}</p>
            <div class="video-cine-tile-grid" data-campo="${this.escapeHtml(b.campo)}" data-etiqueta="${this.escapeHtml(b.etiqueta)}">
              ${(cat.opciones[b.campo] || []).map((o) => this._tileHTML(b.campo, o)).join('')}
            </div>
          </div>`).join('')}
      </div>`).join('');

    if (tabs.dataset.boundTabs !== '1') {
      tabs.dataset.boundTabs = '1';
      tabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.video-cine-tab[data-tab]');
        if (!tab) return;
        e.preventDefault();
        const destino = tab.getAttribute('data-tab');
        tabs.querySelectorAll('.video-cine-tab').forEach((t) => {
          const activa = t === tab;
          t.classList.toggle('is-active', activa);
          t.setAttribute('aria-selected', activa ? 'true' : 'false');
        });
        panels.querySelectorAll('.video-cine-panel').forEach((pa) => {
          const activo = pa.getAttribute('data-panel') === destino;
          pa.classList.toggle('is-active', activo);
          pa.hidden = !activo;
        });
      });
    }

    // Una sola delegación para todos los tiles: son ~70 y colgarles un listener
    // a cada uno es trabajo que el bubbling ya hace.
    if (panels.dataset.boundTiles !== '1') {
      panels.dataset.boundTiles = '1';
      panels.addEventListener('click', (e) => {
        const tile = e.target.closest('.video-cine-tile[data-valor]');
        if (!tile) return;
        e.preventDefault();
        const grid = tile.closest('[data-campo]');
        if (!grid || !this.editor) return;
        const campo = grid.getAttribute('data-campo');
        const etiqueta = grid.getAttribute('data-etiqueta');
        const valor = tile.getAttribute('data-valor');
        const o = (this.catalogo.opciones[campo] || []).find((x) => x.valor === valor);
        if (!o) return;
        this.editor.insertar([{ etiqueta, valor: o.valor, prompt: o.prompt }]);
      });
    }
  }

  /**
   * Un tile. El movimiento de cámara lleva SVG animado en vez de icono: ver un
   * push-in moverse dice en un segundo lo que un párrafo no.
   */
  _tileHTML(campo, o) {
    const svg = VideoView.CINE_SVG[o.valor];
    const icon = VideoView.CINE_ICONOS[o.valor] || VideoView.CINE_ICONOS_CAMPO[campo] || 'aisc-ico aisc-ico--circle';
    const desc = o.desc || '';
    const visual = svg
      ? `<span class="video-cine-tile__svg" aria-hidden="true">${svg}</span>`
      : `<i class="fas ${icon} video-cine-tile__icon" aria-hidden="true"></i>`;
    return `
      <button type="button" class="video-cine-tile${svg ? ' has-svg' : ''}" data-valor="${this.escapeHtml(o.valor)}"${desc ? ` data-desc="${this.escapeHtml(desc)}"` : ''} aria-label="${this.escapeHtml(o.valor)}${desc ? ' — ' + this.escapeHtml(desc) : ''}">
        ${visual}
        <span class="video-cine-tile__label">${this.escapeHtml(o.valor)}</span>
        ${desc ? `<span class="video-cine-tile__tooltip" role="tooltip">${this.escapeHtml(desc)}</span>` : ''}
      </button>`;
  }

  /**
   * SVG animados que comunican el movimiento de cámara visualmente. viewBox
   * 32x24, stroke currentColor, animaciones por clase (.cine-anim-*) que solo
   * corren on-hover/selected.
   */
  static get CINE_SVG() {
    return {
      'Static': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect x="6" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="12" r="1.4" fill="currentColor" class="cine-anim-pulse"/></svg>',
      'Slow Push In': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect x="2.5" y="2.5" width="27" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/><rect class="cine-anim-push-in" x="9" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/></svg>',
      'Slow Pull Out': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect x="2.5" y="2.5" width="27" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/><rect class="cine-anim-pull-out" x="9" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/></svg>',
      'Dolly Left': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-dolly-left" x="10" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 12h4M4 12l2-2M4 12l2 2" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.55"/></svg>',
      'Dolly Right': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-dolly-right" x="8" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M28 12h-4M28 12l-2-2M28 12l-2 2" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.55"/></svg>',
      'Orbit': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><circle cx="16" cy="12" r="2" fill="currentColor"/><ellipse cx="16" cy="12" rx="11" ry="6" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/><circle class="cine-anim-orbit" cx="27" cy="12" r="1.8" fill="currentColor" style="transform-origin:16px 12px"/></svg>',
      '360° Rotation': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-rotate" x="10" y="6" width="12" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/><path d="M6 12a10 8 0 0120 0" stroke="currentColor" stroke-width="1" fill="none" opacity="0.4" stroke-dasharray="2 2"/></svg>',
      'Handheld': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><rect class="cine-anim-handheld" x="9" y="6" width="14" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/></svg>',
      'Tracking': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><circle class="cine-anim-tracking-subject" cx="8" cy="12" r="2" fill="currentColor" style="transform-origin:16px 12px"/><rect class="cine-anim-tracking-cam" x="20" y="6" width="9" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6" style="transform-origin:16px 12px"/><path d="M11 12h7" stroke="currentColor" stroke-width="1" opacity="0.4" stroke-dasharray="2 2"/></svg>',
      'FPV': '<svg viewBox="0 0 32 24" class="cine-svg" aria-hidden="true"><path class="cine-anim-fpv" d="M4 4l24 8-24 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    };
  }

  /** Icono por VALOR, para lo que no tiene pictograma animado. */
  static get CINE_ICONOS() {
    return {
      'Subtle': 'aisc-ico aisc-ico--circle',
      'Moderate': 'aisc-ico aisc-ico--circle',
      'Dynamic': 'aisc-ico aisc-ico--zap',
      'Aggressive': 'aisc-ico aisc-ico--fire',

      'Soft diffused': 'aisc-ico aisc-ico--cloud',
      'Hard contrast': 'fa-mountain-sun',
      'Rim light': 'aisc-ico aisc-ico--moon',
      'Backlit silhouette': 'aisc-ico aisc-ico--user-slash',
      'Studio commercial': 'aisc-ico aisc-ico--store',
      'Natural daylight': 'aisc-ico aisc-ico--sun',
      'Dramatic spotlight': 'aisc-ico aisc-ico--goal',

      'Low': 'aisc-ico aisc-ico--loader',
      'Medium': 'aisc-ico aisc-ico--moon',
      'High': 'aisc-ico aisc-ico--circle',
      'Ultra contrast': 'fa-circle-radiation',

      'Neutral': 'aisc-ico aisc-ico--circle',
      'Warm': 'aisc-ico aisc-ico--fire',
      'Cold': 'fa-snowflake',

      'Clean commercial': 'aisc-ico aisc-ico--eraser',
      'Cinematic dramatic': 'aisc-ico aisc-ico--characters',
      'Hyperreal product': 'aisc-ico aisc-ico--product',
      'Minimal luxury': 'fa-gem',
      'Dark premium': 'aisc-ico aisc-ico--moon',
      'Bright energetic': 'aisc-ico aisc-ico--zap',
      'Editorial fashion': 'aisc-ico aisc-ico--book',
      'Documentary': 'aisc-ico aisc-ico--camera',

      'High saturation': 'aisc-ico aisc-ico--palette',
      'Muted tones': 'aisc-ico aisc-ico--circle',
      'Peak': 'aisc-ico aisc-ico--fire',

      'Macro Detail': 'aisc-ico aisc-ico--search',
      'Close-up': 'aisc-ico aisc-ico--minimize',
      'Medium Shot': 'aisc-ico aisc-ico--user',
      'Wide Shot': 'aisc-ico aisc-ico--expand',
      'Hero Product Frame': 'aisc-ico aisc-ico--product',
      'Over-the-Shoulder': 'aisc-ico aisc-ico--characters',
      'POV': 'aisc-ico aisc-ico--eye',
      'Top Down': 'aisc-ico aisc-ico--arrow-down',
      'Low Angle': 'aisc-ico aisc-ico--arrow-up',
      'High Angle': 'aisc-ico aisc-ico--arrow-down',

      'Centered': 'aisc-ico aisc-ico--goal',
      'Rule of thirds': 'aisc-ico aisc-ico--grid',
      'Negative space left': 'aisc-ico aisc-ico--arrow-left',
      'Negative space right': 'aisc-ico aisc-ico--arrow-right',
      'Symmetrical': 'aisc-ico aisc-ico--crop',
      'Dynamic off-center': 'aisc-ico aisc-ico--zap',

      'Slow contemplative': 'aisc-ico aisc-ico--clock',
      'Balanced': 'aisc-ico aisc-ico--circle',
      'Fast dynamic': 'aisc-ico aisc-ico--zap',

      'Continuous': 'aisc-ico aisc-ico--minus',
      'Crescendo': 'aisc-ico aisc-ico--arrow-up',
      'Decrescendo': 'aisc-ico aisc-ico--arrow-down',
      'Climax at end': 'aisc-ico aisc-ico--fire',

      'Hard cuts': 'aisc-ico aisc-ico--crop',
      'Soft fades': 'aisc-ico aisc-ico--cloud',
      'Match cuts': 'aisc-ico aisc-ico--copy',
      'Whip pans': 'aisc-ico aisc-ico--move',
      'Morph': 'aisc-ico aisc-ico--refresh',

      'Cinematic': 'aisc-ico aisc-ico--film',
      'Editorial': 'aisc-ico aisc-ico--book',
      'Music video': 'aisc-ico aisc-ico--music',
      'Dreamlike': 'aisc-ico aisc-ico--cloud',
      'Commercial bright': 'aisc-ico aisc-ico--sun',

      'Realistic': 'aisc-ico aisc-ico--camera',
      'Stylized': 'aisc-ico aisc-ico--palette',
      'Hyperreal': 'aisc-ico aisc-ico--zap',
      'Surreal': 'aisc-ico aisc-ico--characters',
      '3D animated': 'aisc-ico aisc-ico--layers'
    };
  }

  /** Fallback por campo. */
  static get CINE_ICONOS_CAMPO() {
    return {
      shotType: 'aisc-ico aisc-ico--video',
      lens: 'aisc-ico aisc-ico--camera',
      framing: 'aisc-ico aisc-ico--crop',
      cameraMovement: 'aisc-ico aisc-ico--move',
      motionSpeed: 'aisc-ico aisc-ico--dashboard',
      motionIntensity: 'aisc-ico aisc-ico--zap',
      lightType: 'aisc-ico aisc-ico--idea',
      contrastLevel: 'aisc-ico aisc-ico--moon',
      temperature: 'fa-temperature-three-quarters',
      tone: 'aisc-ico aisc-ico--palette',
      colorGrade: 'aisc-ico aisc-ico--palette',
      energyLevel: 'aisc-ico aisc-ico--fire',
      pacing: 'aisc-ico aisc-ico--clock',
      arc: 'aisc-ico aisc-ico--growth',
      transitions: 'aisc-ico aisc-ico--refresh',
      mood: 'aisc-ico aisc-ico--film',
      realism: 'aisc-ico aisc-ico--eye'
    };
  }


  /**
   * Regla principal: cuando el usuario selecciona un producto (Asset Stack), ese producto
   * se establece automáticamente como kling_element para la API Kie (referencia visual).
   * Solo aplica con scope "product"; reemplaza cualquier producto previamente seleccionado.
   */
  /**
   * Lee los controles del Director Console y del sidebar de Seedance y los
   * deja en el shape que espera la funcion de creacion.
   *
   * OJO al cablear: esto es lo que la UI SABE hoy, no el contrato final de
   * KIE. Los nombres de campo (first_frame_url, reference_images…) son
   * nuestros; al escribir seedance-video-create.js hay que mapearlos a los
   * que KIE reconoce — un campo que KIE no entiende lo ignora en silencio.
   */
  buildSeedancePayload() {
    const val = (sel, fallback) => {
      const el = this.container.querySelector(sel);
      return el && el.value ? String(el.value) : fallback;
    };
    const pressed = (sel) => {
      const el = this.container.querySelector(sel);
      return el ? el.getAttribute('aria-pressed') === 'true' : false;
    };
    const checked = (sel) => {
      const el = this.container.querySelector(sel);
      return !!(el && el.checked);
    };
    const audioTile = this.container.querySelector('.seedance-audio-tile.is-active');
    // La INTENCION es lo que el director escribió, con sus chips dentro. El
    // PROMPT es esa misma intención con cada `[Etiqueta: Valor]` cambiado por
    // su frase, EN SU SITIO: una dirección de lente junto al sujeto pesa
    // distinto que la misma al final.
    const intencion = this.editor ? this.editor.valor.trim() : '';

    return {
      action: 'createTask',
      prompt: window.StudioDireccion.expandirVariables(this.catalogo, intencion).trim(),
      intencion,
      variables: window.StudioDireccion.leerVariables(intencion),
      duration: val('#seedanceDuration', '5'),
      resolution: val('#seedanceResolution', '720p'),
      aspect_ratio: val('#seedanceAspectRatio', '16:9'),
      // Un solo control para el audio. Antes había dos —el switch del sidebar y
      // una píldora en la consola— y NACÍAN en desacuerdo: la píldora encendida
      // y el switch apagado, para el mismo campo. El payload los unía con un OR,
      // así que el video salía con audio mientras la pantalla decía que no.
      generate_audio: checked('#seedanceGenerateAudio'),
      audio_type: audioTile ? audioTile.getAttribute('data-audio-type') : null,
      web_search: pressed('#seedanceWebSearchToggle'),
      first_frame_url: this.seedanceFrames.first?.url || null,
      last_frame_url: this.seedanceFrames.last?.url || null,
      reference_images: this.seedanceRefs.image.map((r) => r.url),
      // Subconjunto de reference_images que NO debe alterarse (Stack de
      // activos). Van ademas en reference_images porque para KIE ocupan
      // cupo como cualquier otra imagen; el lock es una instruccion del
      // prompt, no un campo aparte de la API.
      product_lock_urls: this.seedanceRefs.image.filter((r) => r.lock).map((r) => r.url),
      reference_videos: this.seedanceRefs.video.map((r) => r.url),
      reference_audios: this.seedanceRefs.audio.map((r) => r.url),
      // Ritmo, arco, transiciones, mood y realismo YA NO viajan aparte: son
      // bloques del catálogo y viven escritos dentro de `prompt`, en el sitio
      // donde el director los puso. Mandarlos también como objeto le daría a
      // la misma dirección doble peso.
      campaign: this.selectedCampaignId || null,
      audience: this.selectedAudienceId || null,
      brand_context: this.buildBrandContextForAPI(),
      organization_id: this.organizationId || null,
      openai_input_tokens: this._cinePromptTokens?.input || 0,
      openai_output_tokens: this._cinePromptTokens?.output || 0,
      openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
    };
  }

  /**
   * Dispara la produccion. Mientras SEEDANCE_BACKEND_READY sea false no hay
   * a quien disparar: se lo dice al usuario en el canvas en vez de pegarle a
   * un endpoint inexistente (un 404 devolveria HTML y el error seria opaco).
   *
   * Al desplegar functions/seedance-video-create.js queda por escribir solo
   * el POST: la respuesta trae taskId y de ahi en adelante el camino ya
   * existe — saveSystemAIOutput() y pollTask(taskId), que resuelven guardado
   * en R2, cobro de creditos y render del resultado.
   */
  async startGeneration() {
    const payload = this.buildSeedancePayload();

    if (!payload.prompt) {
      this.showError(window.__('Escribe primero el storyboard: qué pasa en la apertura, en el desarrollo y en el cierre.'));
      return;
    }
    // Solo variables no es un storyboard: la dirección dice CÓMO se ve, no QUÉ
    // pasa. Sin acción, el modelo se inventa una y la secuencia no sirve.
    if (this.editor && !this.editor.textoLibre) {
      this.showError(window.__('Falta la secuencia: la dirección dice cómo se ve, pero no qué pasa. Escribe la acción además de las etiquetas.'));
      return;
    }
    if (!this.organizationId) {
      this.showError(window.__('Selecciona una organización para producir videos.'));
      return;
    }
    if (!VideoView.SEEDANCE_BACKEND_READY) {
      this.showError(window.__('Seedance 2.0 todavía no está conectado: falta desplegar la función de creación de tarea. El resto del camino (guardado, créditos y resultado) ya está listo y se enciende con ese despliegue.'));
      return;
    }

    this.showError(window.__('Seedance 2.0 marcado como listo pero sin POST de creación implementado. Completa startGeneration() antes de activar el flag.'));
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._pollVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._pollVisibilityHandler);
      this._pollVisibilityHandler = null;
    }
  }

  async pollTask(taskId) {
    const statusUrl = `${VideoView.KIE_TASK_STATUS_API}?taskId=${encodeURIComponent(taskId)}`;
    const pollStartedAt = Date.now();
    console.log('[Video] Polling estado → GET', statusUrl, '(cada', VideoView.POLL_INTERVAL_MS / 1000, 's, máx', VideoView.POLL_MAX_DURATION_MS / 60000, 'min)');

    const poll = async () => {
      if (Date.now() - pollStartedAt > VideoView.POLL_MAX_DURATION_MS) {
        this.stopPolling();
        this.showError(window.__('La generación superó el tiempo máximo de espera (12 min). Comprueba el estado en KIE o reintenta con un prompt más corto.'));
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Timeout de polling (12 min)' });
          this._lastKieOutputId = null;
        }
        return;
      }
      // Pausamos el fetch a KIE cuando la pestaña está oculta. El timeout se sigue
      // midiendo contra wall-clock (pollStartedAt), así que no se alarga la espera total.
      // Ahorra ~20 llamadas/min a KIE por cada tab en background generando video.
      if (document.hidden) return;
      try {
        const res = await fetch(statusUrl);
        let data = {};
        try {
          data = await res.json();
        } catch (parseErr) {
          console.error('[Video] GET', statusUrl, ': respuesta no es JSON. Status:', res.status, '→ ¿función desplegada?', parseErr);
          this.stopPolling();
          this.showError(window.__('El servicio de video no respondió correctamente (estado {status}). Intenta de nuevo en unos minutos.', { status: res.status }));
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'Status ' + res.status });
            this._lastKieOutputId = null;
          }
          return;
        }

        if (!res.ok) {
          console.warn('[Video] GET', statusUrl, 'error:', res.status, data);
          this.stopPolling();
          this.showError(data.error || window.__('Error al consultar el estado'));
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: data.error || 'Error al consultar el estado' });
            this._lastKieOutputId = null;
          }
          return;
        }

        const state = data.data?.state;
        console.log('[Video] GET estado →', res.status, 'state:', state, 'data.data:', data.data);
        if (state === 'success') {
          this.stopPolling();
          let resultJson = data.data?.resultJson;
          if (typeof resultJson === 'string') {
            try {
              resultJson = JSON.parse(resultJson);
            } catch (_) {}
          }
          const urls = resultJson?.resultUrls;
          const kieUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
          if (kieUrl) {
            try {
              const uploaded = await this.downloadAndUploadKieVideo(kieUrl, taskId);
              if (uploaded?.publicUrl) {
                this.showResult(uploaded.publicUrl);

                // Cobro dinamico: kie-task-finalize lee creditsConsumed real
                // de KIE + suma OpenAI tokens del cine-prompt + 5 cred markup.
                // Reemplaza el cobro fijo previo de 25 cred (deduct_credits_for_video).
                let finalizeResult = null;
                try {
                  const { data: { session } } = await this.supabase.auth.getSession();
                  const accessToken = session?.access_token;
                  if (accessToken && this.organizationId) {
                    const finalizeRes = await fetch('/.netlify/functions/kie-task-finalize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                      body: JSON.stringify({
                        task_id: taskId,
                        kind: 'video_generated',
                        organization_id: this.organizationId,
                        source_output_id: this._lastKieOutputId || null,
                        openai_input_tokens: this._cinePromptTokens?.input || 0,
                        openai_output_tokens: this._cinePromptTokens?.output || 0,
                        openai_model: this._cinePromptTokens?.model || 'gpt-4o-mini'
                      })
                    });
                    finalizeResult = await finalizeRes.json().catch(() => null);
                    if (!finalizeRes.ok) {
                      console.warn('[Video] finalize fallo, video guardado sin cobro:', finalizeResult);
                    } else if (window.appNavigation && typeof window.appNavigation.loadCreditsFromDb === 'function') {
                      window.appNavigation.loadCreditsFromDb(this.organizationId);
                    }
                  }
                } catch (e) {
                  console.warn('[Video] finalize exception:', e);
                }

                if (this._lastKieOutputId) {
                  // Merge metadata: preserva kind y campos del insert original.
                  await this.updateSystemAIOutput(this._lastKieOutputId, {
                    status: 'completed',
                    storage_path: uploaded.storagePath,
                    metadata: {
                      kind: 'video_generated',
                      resultUrls: urls,
                      video_url: uploaded.publicUrl,
                      kie_source_url: kieUrl,
                      credits_charged: finalizeResult?.credits_charged ?? null,
                      cost_breakdown: finalizeResult?.cost_breakdown ?? null
                    },
                    error_message: null
                  });
                  this._lastKieOutputId = null;
                }
              } else {
                this.showError(window.__('No se pudo guardar el video en tu cuenta'));
                if (this._lastKieOutputId) {
                  await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se pudo guardar el video en tu cuenta' });
                  this._lastKieOutputId = null;
                }
              }
            } catch (err) {
              this.showError(err.message || window.__('Error al descargar o guardar el video'));
              if (this._lastKieOutputId) {
                await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al descargar o guardar el video' });
                this._lastKieOutputId = null;
              }
            }
          } else {
            this.showError(window.__('No se encontró URL del video en la respuesta'));
            if (this._lastKieOutputId) {
              await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: 'No se encontró URL del video en la respuesta' });
              this._lastKieOutputId = null;
            }
          }
          return;
        }
        if (state === 'fail') {
          this.stopPolling();
          const rawMsg = data.data?.failMsg || data.data?.failCode || window.__('La generación falló');
          const is524 = String(data.data?.failCode || '') === '524' || /timeout/i.test(rawMsg);
          const msg = is524
            ? window.__('La generación tardó demasiado en KIE (error 524). Prueba: modo Estándar, duración 5s, una sola imagen de referencia, o acorta el prompt.')
            : rawMsg;
          this.showError(msg);
          if (this._lastKieOutputId) {
            await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: msg });
            this._lastKieOutputId = null;
          }
          return;
        }

        this.showStatus(window.__('Generando video (Seedance 2.0). Esto puede tardar unos minutos…'), true);
      } catch (err) {
        this.stopPolling();
        this.showError(err.message || window.__('Error al consultar el estado'));
        if (this._lastKieOutputId) {
          await this.updateSystemAIOutput(this._lastKieOutputId, { status: 'failed', error_message: err.message || 'Error al consultar el estado' });
          this._lastKieOutputId = null;
        }
      }
    };

    await poll();
    this._pollInterval = setInterval(poll, VideoView.POLL_INTERVAL_MS);
    // Al volver a la pestaña, un poll inmediato evita esperar 3s al próximo tick.
    this._pollVisibilityHandler = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', this._pollVisibilityHandler);
  }

  onLeave() {
    this.stopPolling();
    if (this._resizeDirectorBriefOnWin) {
      window.removeEventListener('resize', this._resizeDirectorBriefOnWin);
      this._resizeDirectorBriefOnWin = null;
    }
  }

  destroy() {
    this.stopPolling();
    if (this._resizeDirectorBriefOnWin) {
      window.removeEventListener('resize', this._resizeDirectorBriefOnWin);
      this._resizeDirectorBriefOnWin = null;
    }
  }
}

window.VideoView = VideoView;
