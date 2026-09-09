/**
 * El panel de producción de Seedance: pestaña Recursos y pestaña Cinematografía.
 *
 * Lo que se ve mirando la pantalla es el chip o el tile seleccionado. Lo que
 * NO se ve es el criterio: el cupo por grupo de referencias, la duración
 * medida (no supuesta) de videos y audios, la exclusión mutua entre anclar
 * frames y dar referencias, y que cada valor de un Production Preset exista
 * de verdad en el catálogo de opciones. Cualquiera de esas reglas fallando en
 * silencio se descubre tarde: un preset que no llena nada, o un error de KIE
 * diez minutos después de subir los archivos.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/views/VideoView.js'), 'utf8');
const GRAMATICA = fs.readFileSync(path.join(process.cwd(), 'js/studio/direccion.js'), 'utf8');

function cargar() {
  const win = { BaseView: class {}, __: (s, p) => (p
    ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m))
    : String(s)) };
  globalThis.window = win;
  globalThis.BaseView = win.BaseView; // `class VideoView extends BaseView` lo busca global
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  // La gramatica de variables va primero: el catalogo se arma con ella.
  new Function(GRAMATICA)();
  new Function(FUENTE)();
  return win.VideoView;
}

const VideoView = cargar();
const Direccion = globalThis.window.StudioDireccion;

/**
 * Doble del editor: guarda el texto y deja insertar chips, que es lo unico que
 * la vista le pide. El editor de verdad necesita DOM y aqui no hay.
 */
function editorFalso(texto = '') {
  return {
    valor: texto,
    get textoLibre() {
      return this.valor.replace(Direccion.reVariable(), '').trim();
    },
    insertar(vs) {
      const trozo = vs.map((v) => `[${v.etiqueta}: ${v.valor}]`).join(' ');
      this.valor = (this.valor ? `${this.valor} ` : '') + trozo;
    }
  };
}

/** Vista con lo justo para ejercer la lógica de adjuntos, sin DOM real. */
function nuevaVista(controles = {}) {
  const avisos = [];
  const borradosDeStorage = [];
  const v = Object.create(VideoView.prototype);

  v.seedanceFrames = { first: null, last: null };
  v.seedanceRefs = { image: [], video: [], audio: [] };
  v.videoProductions = [];
  v.selectedProductionIds = new Set();
  v.selectedCampaignId = '';
  v.selectedAudienceId = '';
  v._cinePromptTokens = null;
  v.organizationId = 'org-1';
  v.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
  v.editor = editorFalso('Apertura, desarrollo y cierre.');
  v._catalogo = null;

  v.container = {
    querySelector: (sel) => (sel in controles ? controles[sel] : null),
    querySelectorAll: () => []
  };

  // Sustitutos de los bordes: subida, medición y pintado.
  v._uploadSeedanceFile = async (file, folder) => ({
    url: `https://cdn.test/${folder}/${file.name}`,
    storagePath: `seedance/u/${folder}/${file.name}`
  });
  v._measureMediaSeconds = async (file) => file._segundos ?? null;
  v._removeSeedanceStorage = (p) => borradosDeStorage.push(p);
  v._seedanceNotify = (msg) => avisos.push(msg);
  v.renderSeedanceFrames = () => {};
  v.renderSeedanceRefs = () => {};
  v.renderSeedanceAttachmentChips = () => {};
  v.renderEscenasCarousel = () => {};
  v.renderProductionsGallery = () => {};
  v.renderElementosFilas = () => {};
  v.scheduleResizeDirectorBriefInput = () => {};

  return { v, avisos, borradosDeStorage };
}

const archivo = (name, type, segundos) => ({ name, type, _segundos: segundos });

describe('Referencias multimodales — cupo por grupo', () => {
  test('corta en el límite que anuncia el sidebar y dice cuántas ignoró', async () => {
    const { v, avisos } = nuevaVista();
    const doce = Array.from({ length: 12 }, (_, i) => archivo(`img${i}.jpg`, 'image/jpeg'));

    await v.addSeedanceRefs('image', doce);

    expect(v.seedanceRefs.image).toHaveLength(VideoView.SEEDANCE_REF_LIMITS.image);
    expect(avisos.join(' ')).toMatch(/se ignoran 3/);
  });

  test('con el grupo lleno no sube nada y lo dice', async () => {
    const { v, avisos } = nuevaVista();
    v.seedanceRefs.video = [1, 2, 3].map((i) => ({ name: `v${i}`, url: `u${i}`, storagePath: `p${i}` }));

    await v.addSeedanceRefs('video', [archivo('otro.mp4', 'video/mp4', 5)]);

    expect(v.seedanceRefs.video).toHaveLength(3);
    expect(avisos.join(' ')).toMatch(/máximo de 3/);
  });
});

describe('Referencias multimodales — duración medida', () => {
  test('rechaza el que pasa del tope y nombra los segundos reales', async () => {
    const { v, avisos } = nuevaVista();

    await v.addSeedanceRefs('video', [archivo('largo.mp4', 'video/mp4', 21.4)]);

    expect(v.seedanceRefs.video).toHaveLength(0);
    expect(avisos.join(' ')).toMatch(/"largo\.mp4" dura 21s y el tope es 15s/);
  });

  test('acepta justo en el tope', async () => {
    const { v } = nuevaVista();

    await v.addSeedanceRefs('audio', [archivo('justo.mp3', 'audio/mpeg', 15)]);

    expect(v.seedanceRefs.audio).toHaveLength(1);
    expect(v.seedanceRefs.audio[0].seconds).toBe(15);
  });

  test('si el navegador no pudo medir, deja pasar en vez de bloquear a ciegas', async () => {
    const { v, avisos } = nuevaVista();

    await v.addSeedanceRefs('video', [archivo('opaco.mov', 'video/quicktime', null)]);

    expect(v.seedanceRefs.video).toHaveLength(1);
    expect(v.seedanceRefs.video[0].seconds).toBeNull();
    expect(avisos).toHaveLength(0);
  });

  test('una imagen no se mide: el tope de 15s no le aplica', async () => {
    const { v } = nuevaVista();

    await v.addSeedanceRefs('image', [archivo('foto.png', 'image/png')]);

    expect(v.seedanceRefs.image[0].seconds).toBeNull();
  });
});

describe('Frames Clave y Referencias son excluyentes', () => {
  test('con referencias puestas, el slot de frame no abre el selector', () => {
    const { v, avisos } = nuevaVista();
    v.seedanceRefs.image.push({ name: 'a.jpg', url: 'u', storagePath: 'p' });
    let abrio = false;
    v.container.querySelector = () => ({ click: () => { abrio = true; } });

    v.openSeedanceFramePicker('first');

    expect(abrio).toBe(false);
    expect(avisos.join(' ')).toMatch(/excluyentes/);
  });

  test('con frames puestos, añadir referencias no sube nada', async () => {
    const { v, avisos } = nuevaVista();
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };

    await v.addSeedanceRefs('image', [archivo('foto.png', 'image/png')]);

    expect(v.seedanceRefs.image).toHaveLength(0);
    expect(avisos.join(' ')).toMatch(/excluyentes/);
  });
});

describe('Quitar un adjunto', () => {
  let ctx;
  beforeEach(async () => {
    ctx = nuevaVista();
    await ctx.v.addSeedanceRefs('image', [
      archivo('a.jpg', 'image/jpeg'),
      archivo('b.jpg', 'image/jpeg')
    ]);
  });

  test('libera el archivo del bucket y reindexa la lista', () => {
    const { v, borradosDeStorage } = ctx;

    v.removeSeedanceRef('image', 0);

    expect(borradosDeStorage).toEqual(['seedance/u/images/a.jpg']);
    expect(v.seedanceRefs.image.map((r) => r.name)).toEqual(['b.jpg']);
  });

  test('el token del chip enruta a la baja correcta', () => {
    const { v, borradosDeStorage } = ctx;
    v.seedanceFrames.last = { url: 'https://cdn.test/z.jpg', storagePath: 'seedance/u/frames/z.jpg' };

    v.removeSeedanceAttachment('frame:last');
    v.removeSeedanceAttachment('ref:image:1');

    expect(v.seedanceFrames.last).toBeNull();
    expect(borradosDeStorage).toEqual(['seedance/u/frames/z.jpg', 'seedance/u/images/b.jpg']);
  });

  test('un token corrupto no rompe ni borra de más', () => {
    const { v, borradosDeStorage } = ctx;

    v.removeSeedanceAttachment('ref:image:xx');
    v.removeSeedanceAttachment('');

    expect(v.seedanceRefs.image).toHaveLength(2);
    expect(borradosDeStorage).toEqual([]);
  });
});

describe('El payload lleva lo adjuntado', () => {
  const CONTROLES = {
    '#seedanceDuration': { value: '8' },
    '#seedanceResolution': { value: '1080p' },
    '#seedanceAspectRatio': { value: '9:16' },
    '#seedanceGenerateAudio': { checked: true },
    '#seedanceWebSearchToggle': { getAttribute: () => 'false' },
    '#seedancePacing': { value: 'Balanced' },
    '#seedanceArc': { value: 'Crescendo' },
    '#seedanceTransitions': { value: '' },
    '#seedanceMood': { value: 'Cinematic' },
    '#seedanceRealism': { value: '' }
  };

  test('los controles del sidebar llegan tal como se eligieron', () => {
    const { v } = nuevaVista(CONTROLES);

    const payload = v.buildSeedancePayload();

    expect(payload.duration).toBe('8');
    expect(payload.resolution).toBe('1080p');
    expect(payload.aspect_ratio).toBe('9:16');
    expect(payload.generate_audio).toBe(true);
    expect(payload.web_search).toBe(false);
    // Ritmo, arco y mood ya NO son controles del sidebar: son bloques del
    // catálogo y viajan escritos dentro del prompt.
    expect(payload.direction).toBeUndefined();
  });

  test('con frames anclados van los frames y ninguna referencia', () => {
    const { v } = nuevaVista(CONTROLES);
    v.seedanceFrames.first = { url: 'https://cdn.test/frames/ini.jpg', storagePath: 'p1' };

    const payload = v.buildSeedancePayload();

    expect(payload.first_frame_url).toBe('https://cdn.test/frames/ini.jpg');
    expect(payload.last_frame_url).toBeNull();
    expect(payload.reference_images).toEqual([]);
  });

  test('con referencias van sus URLs públicas y ningún frame', async () => {
    const { v } = nuevaVista(CONTROLES);
    await v.addSeedanceRefs('image', [archivo('ref.jpg', 'image/jpeg')]);
    await v.addSeedanceRefs('audio', [archivo('vibe.mp3', 'audio/mpeg', 9)]);

    const payload = v.buildSeedancePayload();

    expect(payload.reference_images).toEqual(['https://cdn.test/images/ref.jpg']);
    expect(payload.reference_audios).toEqual(['https://cdn.test/audios/vibe.mp3']);
    expect(payload.reference_videos).toEqual([]);
    expect(payload.first_frame_url).toBeNull();
    expect(payload.last_frame_url).toBeNull();
  });
});

describe('Escenas — producciones previas como referencia', () => {
  const produccion = (id, tipo) => ({
    id, media_url: `https://cdn.test/prod/${id}.${tipo === 'video' ? 'mp4' : 'jpg'}`,
    isVideo: tipo === 'video', isImage: tipo !== 'video'
  });

  test('elegir una escena la mete en el grupo que le toca por tipo', () => {
    const { v } = nuevaVista();
    v.videoProductions = [produccion('p1', 'video'), produccion('p2', 'image')];
    v.selectedProductionIds = new Set(['p1', 'p2']);

    v.syncProductionSelectionToRefs();

    expect(v.seedanceRefs.video.map((r) => r.url)).toEqual(['https://cdn.test/prod/p1.mp4']);
    expect(v.seedanceRefs.image.map((r) => r.url)).toEqual(['https://cdn.test/prod/p2.jpg']);
    expect(v.seedanceRefs.video[0].origen).toBe('produccion');
  });

  test('las escenas comparten cupo con lo subido a mano', async () => {
    const { v, avisos } = nuevaVista();
    // 3 videos subidos = grupo lleno.
    await v.addSeedanceRefs('video', [1, 2, 3].map((i) => archivo(`v${i}.mp4`, 'video/mp4', 5)));
    v.videoProductions = [produccion('p1', 'video')];
    v.selectedProductionIds = new Set(['p1']);

    v.syncProductionSelectionToRefs();

    expect(v.seedanceRefs.video).toHaveLength(3);
    // No basta con no meterla: hay que DESMARCARLA, o la tarjeta queda
    // seleccionada en el carrusel y el payload no la lleva.
    expect(v.selectedProductionIds.has('p1')).toBe(false);
    expect(avisos.join(' ')).toMatch(/no caben/);
  });

  test('deseleccionar una escena la saca de las referencias', () => {
    const { v } = nuevaVista();
    v.videoProductions = [produccion('p1', 'image')];
    v.selectedProductionIds = new Set(['p1']);
    v.syncProductionSelectionToRefs();
    v.selectedProductionIds.delete('p1');

    v.syncProductionSelectionToRefs();

    expect(v.seedanceRefs.image).toHaveLength(0);
  });

  test('quitar el chip de una escena la desmarca en el carrusel', () => {
    const { v } = nuevaVista();
    v.videoProductions = [produccion('p1', 'image')];
    v.selectedProductionIds = new Set(['p1']);
    v.syncProductionSelectionToRefs();

    v.removeSeedanceRef('image', 0);

    expect(v.selectedProductionIds.has('p1')).toBe(false);
  });

  test('quitar una escena NO borra el archivo original del bucket', () => {
    const { v, borradosDeStorage } = nuevaVista();
    v.videoProductions = [produccion('p1', 'image')];
    v.selectedProductionIds = new Set(['p1']);
    v.syncProductionSelectionToRefs();

    v.removeSeedanceRef('image', 0);

    // La URL es de una producción que existe por su cuenta: borrarla se
    // llevaría por delante el output original.
    expect(borradosDeStorage).toEqual([]);
  });

  test('con frames anclados una escena no se puede elegir', () => {
    const { v, avisos } = nuevaVista();
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };
    v.videoProductions = [produccion('p1', 'image')];

    v.toggleProduccion('p1');

    expect(v.selectedProductionIds.size).toBe(0);
    expect(avisos.join(' ')).toMatch(/excluyentes/);
  });
});

describe('Elementos — el catálogo de la marca, en filas por tipo', () => {
  const conCatalogo = (v) => {
    v.dbData.products = [{
      id: 'prod-1', nombre_producto: 'Botella', entity_id: 'ent-9',
      image_urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']
    }];
    v.dbData.characters = [{
      id: 'per-1', nombre_personaje: 'Ana', entity_id: 'ent-7',
      image_urls: ['https://cdn.test/ana.jpg']
    }];
    v.dbData.places = [{
      id: 'lug-1', nombre_lugar: 'Terraza', entity_id: 'ent-5',
      image_urls: ['https://cdn.test/terraza.jpg']
    }];
    // Los servicios NO tienen tabla de imágenes en la base: existen en la
    // marca pero no pueden entrar como referencia visual.
    v.dbData.services = [{ id: 'srv-1', nombre_servicio: 'Asesoría', entity_id: 'ent-3' }];
  };

  test('los cuatro tipos existen y solo el producto y el personaje bloquean', () => {
    // Un producto y una cara tienen identidad; alterarlas arruina la pieza. Un
    // escenario es contexto: que la IA lo interprete no rompe nada.
    const porTipo = Object.fromEntries(VideoView.ELEMENTO_TIPOS.map((t) => [t.tipo, t.lock]));
    expect(porTipo).toEqual({ product: true, character: true, place: false, service: false });
  });

  test('soltar un producto mete sus imágenes con lock', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(2);
    expect(v.seedanceRefs.image.every((r) => r.lock === true)).toBe(true);
    expect(v.seedanceRefs.image.every((r) => r.origen === 'activo')).toBe(true);
  });

  test('un escenario entra como referencia, pero SIN lock', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('place', 'lug-1');

    expect(v.seedanceRefs.image).toHaveLength(1);
    expect(v.seedanceRefs.image[0].lock).toBe(false);
  });

  test('se pueden soltar varios elementos de tipos distintos', () => {
    // El desplegable viejo obligaba a elegir UN alcance: no había forma de
    // pedir "este producto, en este escenario, con esta persona".
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1');
    v.ponerElemento('character', 'per-1');
    v.ponerElemento('place', 'lug-1');

    expect(v.seedanceRefs.image).toHaveLength(4);
    expect(new Set(v.seedanceRefs.image.map((r) => r._assetTipo))).toEqual(
      new Set(['product', 'character', 'place'])
    );
  });

  test('soltar dos veces el mismo elemento no lo duplica', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1');
    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(2);
  });

  test('tocarlo otra vez lo quita entero, no a medias', () => {
    const { v } = nuevaVista();
    conCatalogo(v);
    v.ponerElemento('product', 'prod-1');

    v.alternarElemento('product', 'prod-1');

    // Un producto aporta dos imágenes: si se fuera solo una, la fila lo
    // seguiría marcando como puesto con media identidad dentro.
    expect(v.seedanceRefs.image).toHaveLength(0);
  });

  test('un servicio sin imagen se rechaza y lo dice', () => {
    const { v, avisos } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('service', 'srv-1');

    expect(v.seedanceRefs.image).toHaveLength(0);
    expect(avisos.join(' ')).toMatch(/no tiene imagen/);
  });

  test('el elemento no se come el cupo: tope de imágenes por elemento', () => {
    const { v } = nuevaVista();
    v.dbData.products = [{
      id: 'prod-1', nombre_producto: 'Botella', entity_id: 'ent-9',
      image_urls: ['a', 'b', 'c', 'd'].map((n) => `https://cdn.test/${n}.jpg`)
    }];

    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(VideoView.ELEMENTO_MAX_IMAGENES);
    expect(VideoView.ELEMENTO_MAX_IMAGENES).toBeLessThan(VideoView.SEEDANCE_REF_LIMITS.image);
  });

  test('con el grupo lleno no entra y se avisa', () => {
    const { v, avisos } = nuevaVista();
    conCatalogo(v);
    v.seedanceRefs.image = Array.from({ length: VideoView.SEEDANCE_REF_LIMITS.image }, (_, i) => ({
      name: `r${i}`, url: `u${i}`, storagePath: `p${i}`, origen: 'manual'
    }));

    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(VideoView.SEEDANCE_REF_LIMITS.image);
    expect(avisos.join(' ')).toMatch(/máximo/);
  });

  test('el bloqueo sale aparte en el payload, y también dentro de las imágenes', () => {
    const { v } = nuevaVista();
    conCatalogo(v);
    v.ponerElemento('product', 'prod-1');

    const payload = v.buildSeedancePayload();

    expect(payload.product_lock_urls).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
    // Ocupan cupo como cualquier imagen: para KIE no son un campo aparte.
    expect(payload.reference_images).toEqual(payload.product_lock_urls);
  });

  test('el linaje sale del PRIMER elemento puesto', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('character', 'per-1');
    v.ponerElemento('product', 'prod-1');

    expect(v._resolveSelectedEntityId()).toBe('ent-7');
  });

  test('sin elementos no hay linaje que inventar', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    expect(v._resolveSelectedEntityId()).toBeNull();
  });

  test('con frames anclados el elemento se rechaza y lo dice', () => {
    const { v, avisos } = nuevaVista();
    conCatalogo(v);
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };

    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(0);
    expect(avisos.join(' ')).toMatch(/excluyentes/);
  });
});

describe('Cinematografía — cada opción es una variable de prompt', () => {
  const cat = Object.create(VideoView.prototype).catalogo;

  test('toda opción lleva su frase: mandar la etiqueta cruda desperdicia el control', () => {
    const mudas = [];
    for (const [campo, opciones] of Object.entries(cat.opciones)) {
      opciones.forEach((o) => {
        if (!o.prompt || !o.prompt.trim()) mudas.push(`${campo}.${o.valor}`);
        if (o.prompt === o.valor) mudas.push(`${campo}.${o.valor} (frase = etiqueta)`);
      });
    }
    expect(mudas).toEqual([]);
  });

  test('cada valor de receta existe como opción elegible', () => {
    const huerfanos = [];
    for (const r of cat.presets) {
      for (const [campo, valor] of Object.entries(r.valores)) {
        if (!cat.opciones[campo]) { huerfanos.push(`${r.id}.${campo} sin catálogo`); continue; }
        if (!cat.opciones[campo].some((o) => o.valor === valor)) huerfanos.push(`${r.id}.${campo} = "${valor}"`);
      }
    }
    // Una receta que apunta a un valor inexistente escribe un chip que luego no
    // se puede expandir: viaja el corchete crudo al modelo.
    expect(huerfanos).toEqual([]);
  });

  test('el movimiento de cámara sigue aquí: es lo que separa un video de una foto', () => {
    expect(cat.opciones.cameraMovement.length).toBeGreaterThan(5);
    expect(cat.opciones.cameraMovement.some((o) => o.valor === 'Orbit')).toBe(true);
  });

  test('cada movimiento de cámara tiene su pictograma animado', () => {
    // El SVG dice en un segundo lo que un párrafo no. Un movimiento sin
    // pictograma cae al icono genérico y se ve como una opción de segunda.
    const sinSvg = cat.opciones.cameraMovement
      .filter((o) => !VideoView.CINE_SVG[o.valor])
      .map((o) => o.valor);
    expect(sinSvg).toEqual([]);
  });

  test('la dirección viaja DENTRO del prompt, no como objeto aparte', () => {
    const { v } = nuevaVista();
    v.editor = editorFalso('Un frasco girando [Movimiento: Orbit] con [Luz: Rim light].');

    const payload = v.buildSeedancePayload();

    expect(payload.prompt).toContain('The camera orbits around the subject');
    expect(payload.prompt).toContain('A rim light behind the subject');
    expect(payload.prompt).not.toContain('[Movimiento:');
    // Mandarla además como objeto le daría a la misma dirección doble peso.
    expect(payload.cinematography).toBeUndefined();
    expect(payload.direction).toBeUndefined();
  });

  test('la intención guarda los chips, para poder recrear', () => {
    const { v } = nuevaVista();
    v.editor = editorFalso('Un frasco [Luz: Rim light].');

    const payload = v.buildSeedancePayload();

    expect(payload.intencion).toBe('Un frasco [Luz: Rim light].');
    expect(payload.variables).toEqual([{ etiqueta: 'Luz', valor: 'Rim light' }]);
  });
});

describe('Producir sin backend', () => {
  test('el flag apagado explica qué falta en vez de disparar la tarea', async () => {
    const { v } = nuevaVista();
    const errores = [];
    v.showError = (m) => errores.push(m);
    let hubieraLlamado = false;
    globalThis.fetch = () => { hubieraLlamado = true; return Promise.resolve(); };

    await v.startGeneration();

    expect(VideoView.SEEDANCE_BACKEND_READY).toBe(false);
    expect(hubieraLlamado).toBe(false);
    expect(errores.join(' ')).toMatch(/todavía no está conectado/);
  });

  test('sin storyboard pide el storyboard, no habla del backend', async () => {
    const { v } = nuevaVista();
    v.editor = editorFalso('   ');
    const errores = [];
    v.showError = (m) => errores.push(m);

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/Escribe primero el storyboard/);
  });

  test('solo etiquetas no es un storyboard: falta qué pasa', async () => {
    // La dirección dice CÓMO se ve. Sin acción, el modelo se inventa una.
    const { v } = nuevaVista();
    v.editor = editorFalso('[Movimiento: Orbit] [Luz: Rim light]');
    const errores = [];
    v.showError = (m) => errores.push(m);

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/Falta la secuencia/);
  });
});

describe('Plantilla — los controles que init() busca tienen que existir', () => {
  const html = VideoView.prototype.renderHTML.call({});
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  test('cada querySelector("#…") del código apunta a un id que la plantilla pinta', () => {
    // Un id mal escrito no revienta: querySelector devuelve null, el listener
    // no se cuelga y el control queda muerto sin una sola línea en consola.
    const buscados = [...FUENTE.matchAll(/querySelector\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]);
    expect(buscados.length).toBeGreaterThan(20);
    expect(buscados.filter((id) => !ids.has(id))).toEqual([]);
  });

  test('el panel de dirección se pinta por JS, no por marcado', () => {
    expect(ids.has('videoCineTabs')).toBe(true);
    expect(ids.has('videoCinePanels')).toBe(true);
    expect(ids.has('videoCineReceta')).toBe(true);
    // El storyboard ya no es un textarea: es el hueco del editor de variables.
    expect(ids.has('videoPromptEditor')).toBe(true);
    expect(html).not.toContain('<textarea');
  });

  test('el árbol cierra: mismo número de aperturas y cierres por etiqueta', () => {
    // Este test ya atrapó un `</div>` perdido al reescribir el panel: el
    // navegador lo "arregla" solo y el layout se rompe en silencio.
    for (const tag of ['div', 'section', 'aside', 'main', 'select', 'button']) {
      const abre = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
      const cierra = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      expect(`${tag}: ${abre}/${cierra}`).toBe(`${tag}: ${abre}/${abre}`);
    }
  });
});

describe('El material vive junto al prompt, no en el sidebar', () => {
  const html = VideoView.prototype.renderHTML.call({});
  // La consola arranca en su <section> y termina donde empieza el <aside>.
  const consola = html.slice(html.indexOf('id="seedanceFooterControl"'), html.indexOf('<aside'));
  const sidebar = html.slice(html.indexOf('<aside'));

  test('Frames Clave, Referencias y Audio están en la consola', () => {
    // Son EL MATERIAL que se le entrega al modelo: va junto a lo que se le
    // pide, no a dos clics y en otra columna.
    for (const id of ['seedanceFirstFrameSlot', 'seedanceLastFrameSlot',
      'seedanceAddRefImg', 'seedanceAddRefVid', 'seedanceAddRefAud',
      'seedanceGenerateAudio']) {
      expect(consola).toContain(`id="${id}"`);
    }
  });

  test('y ya NO están en el sidebar: se mudaron, no se duplicaron', () => {
    // Dos sitios para el mismo control es el problema que ya costó caro con la
    // dirección; no se repite con los adjuntos.
    for (const id of ['seedanceFirstFrameSlot', 'seedanceAddRefImg', 'seedanceGenerateAudio']) {
      expect(sidebar).not.toContain(`id="${id}"`);
    }
  });

  test('el audio tiene UN solo control, y la pantalla dice lo que se manda', () => {
    // Antes había dos —el switch y una píldora en la consola— y nacían en
    // desacuerdo: píldora encendida, switch apagado, unidos por un OR. El
    // video salía con audio mientras la pantalla decía que no.
    expect(html).not.toContain('seedanceGenAudioToggle');
    expect((html.match(/id="seedanceGenerateAudio"/g) || []).length).toBe(1);
    expect(html).toContain('id="seedanceGenerateAudio" checked');
  });

  test('el switch apagado apaga el audio del payload', () => {
    const { v } = nuevaVista({ '#seedanceGenerateAudio': { checked: false } });

    expect(v.buildSeedancePayload().generate_audio).toBe(false);
  });
});

describe('Las filas de Elementos y el contrato del arrastre', () => {
  /** Vista con la fila real montada sobre un contenedor de mentira. */
  function conFilas() {
    const { v, avisos } = nuevaVista();
    const nodo = { innerHTML: '', dataset: {}, addEventListener() {} };
    v.container.querySelector = (sel) => (sel === '#videoElementosFilas' ? nodo : null);
    v.escapeHtml = (t) => String(t == null ? '' : t)
      .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    delete v.renderElementosFilas; // usamos la de verdad, no el sustituto
    v.dbData.products = [{ id: 'p1', nombre_producto: 'Botella', image_urls: ['https://cdn.test/a.jpg'] }];
    v.dbData.characters = [{ id: 'c1', nombre_personaje: 'Ana', image_urls: ['https://cdn.test/ana.jpg'] }];
    v.dbData.places = [];
    v.dbData.services = [{ id: 's1', nombre_servicio: 'Asesoría' }]; // sin imagen
    return { v, nodo, avisos };
  }

  test('pinta una fila por tipo, aunque el tipo esté vacío', () => {
    // El desplegable viejo escondía el catálogo detrás de una elección previa:
    // para saber si había personajes había que adivinar dónde estaban.
    const { v, nodo } = conFilas();

    v.renderElementosFilas();

    for (const t of VideoView.ELEMENTO_TIPOS) {
      expect(nodo.innerHTML).toContain(`data-tipo="${t.tipo}"`);
    }
    expect(nodo.innerHTML).toMatch(/Sin escenarios/i);
  });

  test('solo lo que tiene imagen es arrastrable; lo demás se deshabilita', () => {
    const { v, nodo } = conFilas();

    v.renderElementosFilas();
    const tiles = nodo.innerHTML.split('<button').slice(1);
    const conImagen = tiles.filter((t) => t.includes('draggable="true"'));
    const sinImagen = tiles.filter((t) => t.includes('is-sin-imagen'));

    expect(conImagen).toHaveLength(2);              // producto y personaje
    expect(sinImagen).toHaveLength(1);              // el servicio
    // Deshabilitado Y explicado: un tile inerte sin motivo se lee como un bug.
    expect(sinImagen[0]).toContain('disabled');
    expect(sinImagen[0]).toMatch(/sin imagen/i);
  });

  test('el que ya está puesto se marca', () => {
    // Sin esto, arrastrar dos veces el mismo producto parece no hacer nada.
    const { v, nodo } = conFilas();
    v.seedanceRefs.image = [{ origen: 'activo', _assetId: 'p1', url: 'u', name: 'Botella' }];

    v.renderElementosFilas();

    expect(nodo.innerHTML).toMatch(/class="video-elemento-tile is-puesto"[^>]*data-tipo="product"/);
  });

  test('el tipo MIME del arrastre lo declara un solo sitio', () => {
    // El dragstart escribe y el drop lee: si se desincronizan, se arrastra y
    // no cae nada, sin un solo error en consola.
    expect(VideoView.DND_ELEMENTO).toBe('application/x-aisc-elemento');
    expect(FUENTE.match(/VideoView\.DND_ELEMENTO/g).length).toBeGreaterThanOrEqual(3);
    expect(FUENTE).not.toContain("'application/x-aisc-elemento'.length");
  });
});
