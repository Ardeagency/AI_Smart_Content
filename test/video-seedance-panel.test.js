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
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/views/VideoView.js'), 'utf8');
const GRAMATICA = fs.readFileSync(path.join(process.cwd(), 'js/studio/direccion.js'), 'utf8');

function cargar() {
  const win = { BaseView: class {}, __: (s, p) => (p
    ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m))
    : String(s)) };
  // Estado.pintar (js/ui/estado.js) en falso: deja el HTML en el host para que el test lo lea.
  win.Estado = { pintar: (zona, html) => { if (zona) zona.innerHTML = String(html == null ? '' : html); } };
  globalThis.window = win;
  globalThis.__ = win.__; // en el navegador __ es global (window.__)
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
  // Mismos valores que pone el constructor real: sin forjar no se produce.
  v.forjado = false;
  v._forjando = false;
  v.intencion = '';

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
  test('un archivo largo pero dentro del total entra: el tope es del GRUPO', async () => {
    // Antes se rechazaba por archivo a los 15s. La doc pone el tope sobre el
    // total: "the total length of the three videos must not exceed 30 seconds".
    // Un video de 21s era válido y se bloqueaba.
    const { v, avisos } = nuevaVista();

    await v.addSeedanceRefs('video', [archivo('largo.mp4', 'video/mp4', 21.4)]);

    expect(v.seedanceRefs.video).toHaveLength(1);
    expect(avisos.join(' ')).toBe('');
  });

  test('rechaza el que hace pasar al GRUPO del total, y dice cuánto lleva', async () => {
    // Y al revés: tres de 15s suman 45 y antes pasaban los tres.
    const { v, avisos } = nuevaVista();
    await v.addSeedanceRefs('video', [archivo('uno.mp4', 'video/mp4', 20)]);

    await v.addSeedanceRefs('video', [archivo('dos.mp4', 'video/mp4', 15)]);

    expect(v.seedanceRefs.video).toHaveLength(1);
    expect(avisos.join(' ')).toMatch(/el grupo ya suma 20s/);
  });

  test('acepta justo en el tope', async () => {
    const { v } = nuevaVista();

    await v.addSeedanceRefs('audio', [archivo('justo.mp3', 'audio/mpeg', 30)]);

    expect(v.seedanceRefs.audio).toHaveLength(1);
    expect(v.seedanceRefs.audio[0].seconds).toBe(30);
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

describe('Frames Clave y Referencias SÍ se combinan', () => {
  // La exclusividad venía de Kling y se heredó al portar la página; el código
  // la aplicaba "tal como promete el sidebar", que es lo mismo que decir que
  // nadie la comprobó. La doc de Seedance 2.5 la desmiente: first_frame_url,
  // last_frame_url y reference_*_urls son opcionales e independientes, y su
  // propio ejemplo de request los manda juntos.
  test('con referencias puestas, el slot de frame SÍ abre el selector', () => {
    const { v } = nuevaVista();
    v.seedanceRefs.image.push({ name: 'a.jpg', url: 'u', storagePath: 'p' });
    let abrio = false;
    v.container.querySelector = () => ({ click: () => { abrio = true; } });

    v.openSeedanceFramePicker('first');

    expect(abrio).toBe(true);
  });

  test('con frames puestos, añadir referencias sube normal', async () => {
    const { v, avisos } = nuevaVista();
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };

    await v.addSeedanceRefs('image', [archivo('foto.png', 'image/png')]);

    expect(v.seedanceRefs.image).toHaveLength(1);
    expect(avisos.join(' ')).not.toMatch(/excluyente/);
  });

  test('con frames puestos, un elemento entra normal', async () => {
    const { v } = nuevaVista();
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };
    v.dbData.products = [{ id: 'p1', nombre_producto: 'Botella', entity_id: 'e1', image_urls: ['https://cdn.test/a.jpg'] }];

    v.ponerElemento('product', 'p1');

    expect(v.seedanceRefs.image).toHaveLength(1);
  });

  test('el payload puede llevar frames Y referencias a la vez', () => {
    const { v } = nuevaVista();
    v.seedanceFrames.first = { url: 'https://cdn.test/ini.jpg', storagePath: 'p' };
    v.seedanceRefs.image.push({ name: 'r.jpg', url: 'https://cdn.test/r.jpg', storagePath: 'p2' });

    const payload = v.buildSeedancePayload();

    expect(payload.first_frame_url).toBe('https://cdn.test/ini.jpg');
    expect(payload.reference_image_urls).toEqual(['https://cdn.test/r.jpg']);
  });

  test('ya no queda ni un aviso de exclusividad en el código', () => {
    expect(FUENTE).not.toContain('son excluyentes');
    expect(FUENTE).not.toContain('_seedanceHasFrames');
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

    expect(payload.duration).toBe(8);
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
    expect(payload.reference_image_urls).toEqual([]);
  });

  test('con referencias van sus URLs públicas y ningún frame', async () => {
    const { v } = nuevaVista(CONTROLES);
    await v.addSeedanceRefs('image', [archivo('ref.jpg', 'image/jpeg')]);
    await v.addSeedanceRefs('audio', [archivo('vibe.mp3', 'audio/mpeg', 9)]);

    const payload = v.buildSeedancePayload();

    expect(payload.reference_image_urls).toEqual(['https://cdn.test/images/ref.jpg']);
    expect(payload.reference_audio_urls).toEqual(['https://cdn.test/audios/vibe.mp3']);
    expect(payload.reference_video_urls).toEqual([]);
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

  test('con frames anclados una escena SÍ se puede elegir', () => {
    // Frames y referencias se combinan (doc de Seedance 2.5).
    const { v } = nuevaVista();
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };
    v.videoProductions = [{ id: 'p-1', media_url: 'https://cdn.test/p1.png', isImage: true }];

    v.toggleProduccion('p-1');

    expect(v.seedanceRefs.image).toHaveLength(1);
  });
});

describe('Elementos — se elige FOTO por FOTO, no el elemento entero', () => {
  const conCatalogo = (v) => {
    v.dbData.products = [{
      id: 'prod-1', nombre_producto: 'Botella', entity_id: 'ent-9',
      image_urls: ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => `https://cdn.test/${n}.jpg`)
    }];
    v.dbData.characters = [{
      id: 'per-1', nombre_personaje: 'Ana', entity_id: 'ent-7',
      image_urls: ['https://cdn.test/ana.jpg']
    }];
    v.dbData.places = [{
      id: 'lug-1', nombre_lugar: 'Terraza', entity_id: 'ent-5',
      image_urls: ['https://cdn.test/terraza.jpg']
    }];
    // Los servicios NO tienen tabla de imágenes en la base.
    v.dbData.services = [{ id: 'srv-1', nombre_servicio: 'Asesoría', entity_id: 'ent-3' }];
  };

  test('los cuatro tipos existen y solo el producto y el personaje bloquean', () => {
    const porTipo = Object.fromEntries(VideoView.ELEMENTO_TIPOS.map((t) => [t.tipo, t.lock]));
    expect(porTipo).toEqual({ product: true, character: true, place: false, service: false });
  });

  test('soltar el tile mete UNA foto —la portada—, no dos', () => {
    // Antes metía dos por su cuenta: el panel elegía por el director.
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(1);
    expect(v.seedanceRefs.image[0].url).toBe('https://cdn.test/a.jpg');
    expect(v.seedanceRefs.image[0].lock).toBe(true);
  });

  test('se puede elegir CUÁL foto, no solo la portada', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1', 'https://cdn.test/d.jpg');

    expect(v.seedanceRefs.image[0].url).toBe('https://cdn.test/d.jpg');
  });

  test('entran varias fotos del MISMO producto', () => {
    // Es el caso que el tope de dos impedía: seis fotos y el panel usaba dos.
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1', 'https://cdn.test/a.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/c.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/e.jpg');

    expect(v.seedanceRefs.image.map((r) => r.url)).toEqual([
      'https://cdn.test/a.jpg', 'https://cdn.test/c.jpg', 'https://cdn.test/e.jpg'
    ]);
  });

  test('QUITAR UNA QUITA UNA: las demás del producto se quedan', () => {
    // El bug: quitar una foto se llevaba todas las del producto, así que el
    // director perdía una selección que no pidió deshacer.
    const { v } = nuevaVista();
    conCatalogo(v);
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/a.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/c.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/e.jpg');

    v.quitarImagenElemento('https://cdn.test/c.jpg');

    expect(v.seedanceRefs.image.map((r) => r.url)).toEqual([
      'https://cdn.test/a.jpg', 'https://cdn.test/e.jpg'
    ]);
  });

  test('quitarla desde la fila de referencias tampoco arrastra a las hermanas', () => {
    // Misma regla por el otro camino: la × del item de referencia.
    const { v } = nuevaVista();
    conCatalogo(v);
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/a.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/b.jpg');

    v.removeSeedanceRef('image', 0);

    expect(v.seedanceRefs.image).toHaveLength(1);
    expect(v.seedanceRefs.image[0].url).toBe('https://cdn.test/b.jpg');
  });

  test('un escenario entra como referencia, pero SIN lock', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('place', 'lug-1');

    expect(v.seedanceRefs.image[0].lock).toBe(false);
  });

  test('se pueden mezclar elementos de tipos distintos', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1');
    v.ponerElemento('character', 'per-1');
    v.ponerElemento('place', 'lug-1');

    expect(new Set(v.seedanceRefs.image.map((r) => r._assetTipo)))
      .toEqual(new Set(['product', 'character', 'place']));
  });

  test('la misma foto dos veces no se duplica', () => {
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1', 'https://cdn.test/a.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/a.jpg');

    expect(v.seedanceRefs.image).toHaveLength(1);
  });

  test('una URL que no es del elemento cae a su portada', () => {
    // El arrastre viene del DOM, y el DOM es dato de la pantalla, no verdad.
    const { v } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('product', 'prod-1', 'https://otro.test/robada.jpg');

    expect(v.seedanceRefs.image[0].url).toBe('https://cdn.test/a.jpg');
  });

  test('tocarla otra vez la quita', () => {
    const { v } = nuevaVista();
    conCatalogo(v);
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/b.jpg');

    v.alternarElemento('product', 'prod-1', 'https://cdn.test/b.jpg');

    expect(v.seedanceRefs.image).toHaveLength(0);
  });

  test('un servicio sin imagen se rechaza y lo dice', () => {
    const { v, avisos } = nuevaVista();
    conCatalogo(v);

    v.ponerElemento('service', 'srv-1');

    expect(v.seedanceRefs.image).toHaveLength(0);
    expect(avisos.join(' ')).toMatch(/no tiene imagen/);
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
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/a.jpg');
    v.ponerElemento('product', 'prod-1', 'https://cdn.test/b.jpg');

    const payload = v.buildSeedancePayload();

    expect(payload.product_lock_urls).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
    expect(payload.reference_image_urls).toEqual(payload.product_lock_urls);
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

  test('con frames anclados el elemento entra igual', () => {
    const { v, avisos } = nuevaVista();
    conCatalogo(v);
    v.seedanceFrames.first = { url: 'https://cdn.test/f.jpg', storagePath: 'p' };

    v.ponerElemento('product', 'prod-1');

    expect(v.seedanceRefs.image).toHaveLength(1);
    expect(avisos.join(' ')).toBe('');
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

describe('Producir — la corrida de video-directo por el borde (corte ADR-0052)', () => {
  /** Vista lista para producir, con StudioDatos de mentira. */
  function listaParaProducir(resultado) {
    const { v, avisos } = nuevaVista({
      '#seedanceDuration': { value: '8' },
      '#seedanceResolution': { value: '1080p' },
      '#seedanceAspectRatio': { value: '9:16' },
      '#seedanceGenerateAudio': { checked: true },
      '#seedanceWebSearchToggle': { getAttribute: () => 'false' }
    });
    const errores = [];
    const estados = [];
    v.showError = (m) => errores.push(m);
    v.showStatus = (m) => estados.push(m);
    v.showResult = (u) => { v._resultado = u; };
    v.sendBtn = { disabled: false, classList: { toggle() {} } };
    v.forgeBtn = { disabled: false, classList: { toggle() {} }, querySelector: () => null };
    v.organizationId = 'org-1';
    v.loadVideoProductions = async () => {};
    v.renderEscenasCarousel = () => {};
    // PRODUCIR exige prompt forjado: los tests de produccion parten de ahi.
    v.forjado = true;
    v.intencion = 'Apertura, desarrollo y cierre.';
    const llamadas = [];
    globalThis.window.StudioDatos = {
      mapeo: { entradasVideo: (p) => ({ prompt: p.prompt, aspecto: p.aspecto, resolucion: p.resolucion, duracion: Number(p.duracion), con_audio: !!p.con_audio, referencias: p.referencias }) },
      producir: async (org, tipo, entradas, opts) => {
        llamadas.push({ org, tipo, entradas, opts });
        if (typeof resultado === 'function') return resultado(opts);
        if (resultado instanceof Error) throw resultado;
        return resultado;
      },
    };
    return { v, errores, estados, llamadas, avisos };
  }
  const listo = { run_id: 'r-1', salida: { url: 'https://media-v2/out/o/v.mp4', file_id: 'f-1' }, corrida: { status: 'succeeded' } };

  test('el backend ya está conectado', () => {
    expect(VideoView.SEEDANCE_BACKEND_READY).toBe(true);
  });

  test('produce con el flujo video-directo, con los controles del sidebar, y pinta la salida', async () => {
    const { v, llamadas } = listaParaProducir(listo);

    await v.startGeneration();

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].tipo).toBe('video');
    expect(llamadas[0].org).toBe('org-1');
    expect(llamadas[0].entradas).toMatchObject({ aspecto: '9:16', resolucion: '1080p', duracion: 8, con_audio: true });
    expect(v._resultado).toBe('https://media-v2/out/o/v.mp4');
    expect(v._generating).toBe(false);
  });

  test('mientras la corrida avanza, el estado se pinta con palabras', async () => {
    const { v, estados } = listaParaProducir(async (opts) => { opts.alCambiar({ status: 'queued' }); opts.alCambiar({ status: 'running' }); return listo; });

    await v.startGeneration();

    expect(estados.join(' ')).toMatch(/En cola/);
    expect(estados.join(' ')).toMatch(/Produciendo el video/);
  });

  test('dos clics no disparan dos corridas (ni dos cobros)', async () => {
    let soltar;
    const { v, llamadas } = listaParaProducir(() => new Promise((r) => { soltar = () => r(listo); }));

    const primera = v.startGeneration();
    await v.startGeneration();
    soltar();
    await primera;

    expect(llamadas).toHaveLength(1);
  });

  test('sin borde lo dice, sin hablar de funciones ni de KIE', async () => {
    const { v, errores } = listaParaProducir(Object.assign(new Error('Falta AISC_API_URL'), { code: 'sin_api' }));

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/borde sin configurar/);
    expect(v._generating).toBe(false);
  });

  test('sin saldo lo dice con palabras y libera el botón', async () => {
    const { v, errores } = listaParaProducir(Object.assign(new Error('sin saldo'), { codigo: 'sin_saldo' }));

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/créditos suficientes/);
    expect(v._generating).toBe(false);   // si no, el botón queda muerto
  });

  test('un paso fallido llega con su motivo al canvas', async () => {
    const { v, errores } = listaParaProducir(Object.assign(new Error('render: el proveedor rechazó la referencia'), { code: 'fallo' }));

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/proveedor rechazó/);
  });

  test('una corrida sin salida visible manda a Producciones', async () => {
    const { v, errores } = listaParaProducir({ run_id: 'r-2', salida: null, corrida: { status: 'succeeded' } });

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/Producciones/);
  });

  test('sin storyboard pide el storyboard, no habla del backend', async () => {
    const { v, errores } = listaParaProducir(listo);
    v.editor = editorFalso('   ');

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/Escribe primero el storyboard/);
  });

  test('solo etiquetas no es un storyboard: falta qué pasa', async () => {
    const { v, errores } = listaParaProducir(listo);
    v.editor = editorFalso('[Movimiento: Orbit] [Luz: Rim light]');

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
    const nodo = { innerHTML: '', dataset: {}, addEventListener() {}, querySelectorAll: () => [] };
    v.container.querySelector = (sel) => (sel === '#videoElementosFilas' ? nodo : null);
    // Lo hereda de BaseView, que aquí es un stub vacío.
    v.addEventListener = () => {};
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
    const tiles = nodo.innerHTML.split('video-escena-item').slice(1);
    const conImagen = tiles.filter((t) => t.includes('draggable="true"'));
    const sinImagen = tiles.filter((t) => t.includes('is-sin-imagen'));

    expect(conImagen).toHaveLength(2);              // producto y personaje
    expect(sinImagen).toHaveLength(1);              // el servicio
    // Inerte Y explicado: un tile muerto sin motivo se lee como un bug.
    expect(sinImagen[0]).toMatch(/sin imagen/i);
  });

  test('el que ya está puesto se marca', () => {
    // Sin esto, arrastrar dos veces la misma foto parece no hacer nada.
    const { v, nodo } = conFilas();
    v.seedanceRefs.image = [{ origen: 'activo', _assetId: 'p1', url: 'https://cdn.test/a.jpg', name: 'Botella' }];

    v.renderElementosFilas();

    expect(nodo.innerHTML).toContain('video-elemento-item is-selected');
  });

  test('las fotos NO se pintan hasta abrir el selector', () => {
    // El popover flotante las tenía siempre en el DOM, escondidas. Ahora la
    // fila es solo la fila: menos nodos y ningún panel invisible al acecho.
    const { v, nodo } = conFilas();
    v.dbData.products = [{
      id: 'p1', nombre_producto: 'Botella',
      image_urls: ['a', 'b', 'c'].map((n) => `https://cdn.test/${n}.jpg`)
    }];

    v.renderElementosFilas();

    expect(nodo.innerHTML).not.toContain('video-elemento-foto');
    // Pero el contador ya avisa de que hay tres.
    expect(nodo.innerHTML).toContain('video-elemento-contador');
    expect(nodo.innerHTML).toContain('data-varias="1"');
  });

  test('el contador muestra cuántas van puestas de cuántas hay', () => {
    const { v, nodo } = conFilas();
    v.dbData.products = [{
      id: 'p1', nombre_producto: 'Botella',
      image_urls: ['a', 'b', 'c'].map((n) => `https://cdn.test/${n}.jpg`)
    }];
    v.seedanceRefs.image = [
      { origen: 'activo', _assetId: 'p1', url: 'https://cdn.test/a.jpg' },
      { origen: 'activo', _assetId: 'p1', url: 'https://cdn.test/b.jpg' }
    ];

    v.renderElementosFilas();

    expect(nodo.innerHTML).toContain('>2/3<');
  });

  test('usan EXACTAMENTE el contenedor de una producción', () => {
    // Un carrusel de miniaturas se lee por la imagen. Con nombre debajo y un
    // tamaño propio, al lado del carrusel de Producciones se veían como otro
    // componente.
    const { v, nodo } = conFilas();

    v.renderElementosFilas();

    expect(nodo.innerHTML).toContain('class="video-escena-item video-elemento-item');
    expect(nodo.innerHTML).toContain('video-escena-thumb-wrap');
    expect(nodo.innerHTML).toContain('<div class="video-escenas-carousel">');
    // Sin etiqueta bajo la miniatura: el nombre vive en el title.
    expect(nodo.innerHTML).not.toContain('video-elemento-nombre');
    expect(nodo.innerHTML).toContain('title="Botella"');
  });

  test('el tipo MIME del arrastre lo declara un solo sitio', () => {
    // El dragstart escribe y el drop lee: si se desincronizan, se arrastra y
    // no cae nada, sin un solo error en consola.
    expect(VideoView.DND_ELEMENTO).toBe('application/x-aisc-elemento');
    expect(FUENTE.match(/VideoView\.DND_ELEMENTO/g).length).toBeGreaterThanOrEqual(3);
    expect(FUENTE).not.toContain("'application/x-aisc-elemento'.length");
  });
});

describe('Producciones — sirven de frame o de referencia', () => {
  const conProducciones = (v) => {
    v.videoProductions = [
      { id: 'img-1', media_url: 'https://cdn.test/foto.jpg', isImage: true, isVideo: false },
      { id: 'vid-1', media_url: 'https://cdn.test/clip.mp4', isImage: false, isVideo: true }
    ];
  };

  test('una producción de imagen ancla un Frame Clave', () => {
    const { v } = nuevaVista();
    conProducciones(v);

    v.ponerProduccionEnFrame('first', 'img-1');

    expect(v.seedanceFrames.first.url).toBe('https://cdn.test/foto.jpg');
    // Vive en su bucket, no en el nuestro: sin storagePath, quitarla del frame
    // no puede borrar el archivo de la producción original.
    expect(v.seedanceFrames.first.storagePath).toBeNull();
  });

  test('un video NO puede anclar un frame, y lo dice', () => {
    const { v, avisos } = nuevaVista();
    conProducciones(v);

    v.ponerProduccionEnFrame('first', 'vid-1');

    expect(v.seedanceFrames.first).toBeNull();
    expect(avisos.join(' ')).toMatch(/es una imagen/);
  });

  test('con referencias puestas, anclar un frame funciona igual', () => {
    const { v, avisos } = nuevaVista();
    conProducciones(v);
    v.seedanceRefs.image = [{ name: 'r', url: 'u', storagePath: 'p', origen: 'manual' }];

    v.ponerProduccionEnFrame('first', 'img-1');

    expect(v.seedanceFrames.first.url).toBe('https://cdn.test/foto.jpg');
    // Y la referencia que ya estaba sigue ahí: no se sacrifica una por la otra.
    expect(v.seedanceRefs.image).toHaveLength(1);
    expect(avisos.join(' ')).toBe('');
  });

  test('soltarla en las referencias hace lo mismo que tocarla', () => {
    const { v } = nuevaVista();
    conProducciones(v);

    v.ponerProduccionEnRefs('img-1');

    expect(v.selectedProductionIds.has('img-1')).toBe(true);
    expect(v.seedanceRefs.image).toHaveLength(1);
  });

  test('soltar dos veces la misma producción no la duplica', () => {
    const { v } = nuevaVista();
    conProducciones(v);

    v.ponerProduccionEnRefs('img-1');
    v.ponerProduccionEnRefs('img-1');

    expect(v.seedanceRefs.image).toHaveLength(1);
  });

  test('la carga del arrastre distingue producción de elemento', () => {
    // Un solo tipo MIME para los dos, y `fuente` decide qué hacer al soltar.
    const dt = (o) => ({ getData: (t) => (t === VideoView.DND_ELEMENTO ? JSON.stringify(o) : '') });

    expect(VideoView.leerCargaDnD(dt({ fuente: 'produccion', id: 'p1' })).fuente).toBe('produccion');
    expect(VideoView.leerCargaDnD(dt({ fuente: 'elemento', tipo: 'product', id: 'e1' })).tipo).toBe('product');
    expect(VideoView.leerCargaDnD(dt({ ruido: 1 }))).toBeNull();
    expect(VideoView.leerCargaDnD({ getData: () => 'no es json' })).toBeNull();
  });
});

describe('Los tres tabs del panel', () => {
  const html = VideoView.prototype.renderHTML.call({});

  test('son Elementos, Enfoque y Cinematografía', () => {
    for (const tab of ['elementos', 'enfoque', 'cinematografia']) {
      expect(html).toContain(`data-sidebar-tab="${tab}"`);
      expect(html).toContain(`data-sidebar-panel="${tab}"`);
    }
  });

  test('el enfoque conceptual vive en su propio tab, no entre el material', () => {
    const enfoque = html.slice(html.indexOf('data-sidebar-panel="enfoque"'), html.indexOf('data-sidebar-panel="cinematografia"'));
    expect(enfoque).toContain('id="seedanceCampaignSelect"');
    expect(enfoque).toContain('id="seedanceAudienceSelect"');
  });

  test('el material —producciones y elementos— vive en el primero', () => {
    const elementos = html.slice(html.indexOf('data-sidebar-panel="elementos"'), html.indexOf('data-sidebar-panel="enfoque"'));
    expect(elementos).toContain('id="videoEscenasCarousel"');
    expect(elementos).toContain('id="videoElementosFilas"');
  });

  test('ya no se llama "Escenas": son Producciones', () => {
    expect(html).not.toMatch(/>\s*Escenas\s*</);
  });
});

describe('Un adjunto se ve en un solo sitio', () => {
  const html = VideoView.prototype.renderHTML.call({});

  test('no hay segunda fila de chips bajo el prompt', () => {
    // La banda de recursos ya muestra los frames y las referencias justo
    // encima; la fila de chips repetía lo mismo con otro dibujo, y sus × eran
    // un segundo sitio desde donde quitar lo mismo.
    expect(html).not.toContain('seedanceElementsList');
    expect(html).not.toContain('video-attachment-chip');
    expect(html).not.toContain('video-director-attachments-row');
    expect(FUENTE).not.toContain('renderSeedanceAttachmentChips');
  });

  test('lo adjunto se quita desde donde se ve', () => {
    // El frame tiene su × en el slot y la referencia la suya en el item: sin
    // esos dos, quitar la fila de chips habría dejado adjuntos sin salida.
    expect(FUENTE).toContain('seedance-frame-slot-remove');
    expect(FUENTE).toContain('seedance-ref-remove');
  });

  test('las secciones del panel ya no llevan párrafo de ayuda', () => {
    const panel = html.slice(html.indexOf('data-sidebar-panel="elementos"'), html.indexOf('data-sidebar-panel="enfoque"'));
    expect(panel).not.toContain('video-sidebar-section-hint');
  });
});

describe('El contrato de Seedance 2.5, tal como lo dice la doc', () => {
  // Lo que la UI promete tiene que ser lo que la API acepta. Esta página vivio
  // un mes con una regla de Kling heredada ("frames y referencias son
  // excluyentes") que Seedance no pide, y con topes inventados. Estos asserts
  // son la doc puesta en codigo.
  const { v } = nuevaVista({
    '#seedanceDuration': { value: '12' },
    '#seedanceResolution': { value: '1080p' },
    '#seedanceAspectRatio': { value: 'adaptive' },
    '#seedanceGenerateAudio': { checked: true },
    '#seedanceWebSearchToggle': { getAttribute: () => 'true' }
  });
  const payload = v.buildSeedancePayload();

  test('el modelo se nombra exacto: un aproximado devuelve 404', () => {
    expect(VideoView.SEEDANCE_MODEL).toBe('bytedance/seedance-2-5');
    expect(payload.model).toBe('bytedance/seedance-2-5');
  });

  test('los campos se llaman como en la doc, no como se nos ocurrio', () => {
    // Un campo que KIE no reconoce lo ignora EN SILENCIO: el video sale sin
    // las referencias y nadie se entera hasta verlo.
    for (const campo of ['first_frame_url', 'last_frame_url', 'reference_image_urls',
      'reference_video_urls', 'reference_audio_urls', 'generate_audio',
      'resolution', 'aspect_ratio', 'duration', 'web_search']) {
      expect(Object.keys(payload)).toContain(campo);
    }
    // Los nombres viejos ya no salen: si sobrevive uno, se manda dos veces lo
    // mismo con dos nombres y uno de los dos se pierde.
    for (const viejo of ['reference_images', 'reference_videos', 'reference_audios']) {
      expect(Object.keys(payload)).not.toContain(viejo);
    }
  });

  test('duration viaja como number, no como texto', () => {
    expect(payload.duration).toBe(12);
    expect(typeof payload.duration).toBe('number');
  });

  test('la duracion que ofrece la UI cabe en el rango de la doc (-1..30)', () => {
    const html = VideoView.prototype.renderHTML.call({});
    const input = html.slice(html.indexOf('id="seedanceDuration"'));
    const max = Number(/max="(\d+)"/.exec(input)[1]);
    // El tope estaba en 15 y la doc permite 30: se ofrecia la mitad del modelo.
    expect(max).toBe(30);
  });

  test('las resoluciones y los ratios son los del enum, sin inventos', () => {
    const html = VideoView.prototype.renderHTML.call({});
    const opciones = (id) => {
      const trozo = html.slice(html.indexOf(`id="${id}"`));
      return [...trozo.slice(0, trozo.indexOf('</select>')).matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
    };
    expect(opciones('seedanceResolution')).toEqual(['480p', '720p', '1080p']);
    expect(opciones('seedanceAspectRatio').sort())
      .toEqual(['1:1', '16:9', '21:9', '3:4', '4:3', '9:16', 'adaptive'].sort());
  });

  test('el tope de las referencias de tiempo es el TOTAL del grupo', () => {
    // "the total length of the three videos must not exceed 30 seconds"
    expect(VideoView.SEEDANCE_REF_MAX_TOTAL_SECONDS).toBe(30);
    expect(VideoView.SEEDANCE_REF_LIMITS.video).toBe(3);
    expect(VideoView.SEEDANCE_REF_LIMITS.audio).toBe(3);
  });
});

describe('Los dos actos: forjar el prompt, y solo entonces producir', () => {
  /** Vista con editor de mentira, botones y StudioDatos controlado. */
  function enConsola() {
    const { v } = nuevaVista();
    const errores = [];
    v.showError = (m) => errores.push(m);
    v.showStatus = () => {};
    v.hideAllFeedback = () => {};
    const btn = (extra = {}) => ({
      disabled: false, title: '', classList: { toggle() {} },
      querySelector: () => ({ textContent: '', className: '' }), ...extra
    });
    v.sendBtn = btn();
    v.forgeBtn = btn();
    v.organizationId = 'org-1';
    v.loadVideoProductions = async () => {};
    v.renderEscenasCarousel = () => {};
    // Editor de mentira que sí sabe reemplazarse por prosa.
    const ed = editorFalso('Un frasco girando [Luz: Rim light].');
    ed.escribirTexto = (t) => { ed.valor = t; };
    v.editor = ed;
    const llamadas = [];
    globalThis.window.StudioDatos = {
      mapeo: { entradasVideo: (p) => ({ prompt: p.prompt, referencias: p.referencias }) },
      producir: async (org, tipo, entradas) => { llamadas.push({ tipo, entradas }); return { run_id: 'r', salida: { url: 'u' } }; },
    };
    return { v, errores, llamadas, ed };
  }

  test('PRODUCIR nace bloqueado en la plantilla', () => {
    const html = VideoView.prototype.renderHTML.call({});
    const boton = html.slice(html.indexOf('id="seedancePromptSend"'));
    expect(boton.slice(0, boton.indexOf('>'))).toContain('disabled');
    expect(html).toContain('id="seedancePromptForge"');
  });

  test('sin forjar, PRODUCIR no dispara nada y explica por qué', async () => {
    // Lo que el humano escribe es el brief, no el prompt: mandarlo crudo
    // desperdicia la pieza y el crédito.
    const { v, errores, llamadas } = enConsola();

    await v.startGeneration();

    expect(llamadas).toHaveLength(0);
    expect(errores.join(' ')).toMatch(/Primero forja el prompt/);
  });

  test('forjar reemplaza lo escrito por la intención con sus chips expandidos EN SU SITIO', async () => {
    // Corte: el forjador de OpenAI se apagó con las functions; forjar es expandir
    // cada [Etiqueta: Valor] por su frase. Lo que se ve es lo que produce.
    const { v, ed } = enConsola();

    await v.forjarPrompt();

    expect(ed.valor).toContain('Un frasco girando');
    expect(ed.valor).toContain('A rim light behind the subject');
    expect(ed.valor).not.toContain('[Luz: Rim light]');
    expect(v.forjado).toBe(true);
  });

  test('la intención original se guarda: ahí siguen vivos los chips', async () => {
    const { v } = enConsola();

    await v.forjarPrompt();

    expect(v.intencion).toBe('Un frasco girando [Luz: Rim light].');
    expect(v.buildSeedancePayload().variables).toEqual([{ etiqueta: 'Luz', valor: 'Rim light' }]);
  });

  test('recrear parte de la intención, no de lo ya forjado', async () => {
    const { v, ed } = enConsola();
    await v.forjarPrompt();
    const primera = ed.valor;

    await v.forjarPrompt();

    expect(ed.valor).toBe(primera);
    expect(v.intencion).toBe('Un frasco girando [Luz: Rim light].');
  });

  test('tocar el texto después de forjar vuelve a bloquear PRODUCIR', async () => {
    const { v } = enConsola();
    await v.forjarPrompt();
    expect(v.forjado).toBe(true);

    v._setForjado(false);   // es lo que dispara onCambio del editor

    expect(v.forjado).toBe(false);
    expect(v.sendBtn.disabled).toBe(true);
  });

  test('ya forjado, PRODUCIR manda la redacción que se ve, no la intención', async () => {
    const { v, llamadas, ed } = enConsola();
    await v.forjarPrompt();
    ed.valor = 'A glass jar rotates.';

    await v.startGeneration();

    expect(llamadas[llamadas.length - 1].entradas.prompt).toBe('A glass jar rotates.');
  });

  test('sin storyboard, forjar pide el storyboard y no queda forjado', async () => {
    const { v, errores } = enConsola();
    v.editor = editorFalso('   ');

    await v.forjarPrompt();

    expect(v.forjado).toBe(false);
    expect(errores.join(' ')).toMatch(/Escribe primero el storyboard/);
  });

  test('dos clics en PROMPT dejan lo mismo que uno: el forjado es idempotente', async () => {
    // El forjado local es instantáneo (no hay forjador remoto que doblar): el
    // segundo clic recrea desde la intención y deja exactamente el mismo texto.
    const { v, ed } = enConsola();

    await Promise.all([v.forjarPrompt(), v.forjarPrompt()]);
    const unaVez = ed.valor;
    await v.forjarPrompt();

    expect(ed.valor).toBe(unaVez);
    expect(v.intencion).toBe('Un frasco girando [Luz: Rim light].');
    expect(v.forjado).toBe(true);
  });
});


describe('El selector de fotos: en el sitio, no flotando', () => {
  function conCatalogo() {
    const { v } = nuevaVista();
    const nodo = { innerHTML: '', dataset: { boundElementos: '1' }, addEventListener() {}, querySelectorAll: () => [] };
    v.container.querySelector = (sel) => (sel === '#videoElementosFilas' ? nodo : null);
    v.escapeHtml = (t) => String(t == null ? '' : t).replace(/"/g, '&quot;');
    v.addEventListener = () => {};
    delete v.renderElementosFilas;
    v.dbData.products = [{
      id: 'p1', nombre_producto: 'Botella',
      image_urls: ['a', 'b', 'c', 'd'].map((n) => `https://cdn.test/${n}.jpg`)
    }];
    v.dbData.characters = [{ id: 'c1', nombre_personaje: 'Ana', image_urls: ['https://cdn.test/ana.jpg'] }];
    v.dbData.places = [];
    v.dbData.services = [];
    v.elementoAbierto = null;   // el constructor real lo pone así
    return { v, nodo };
  }
  /** El clic delegado real, con un target de mentira. */
  const clic = (v, cadena) => v._onClicElementos({
    preventDefault() {},
    target: { closest: (sel) => cadena[sel] || null }
  });

  test('tocar un elemento de varias fotos ABRE el selector, no mete la portada', () => {
    // Antes metía la portada, y un clic de más mientras buscabas el panel te
    // dejaba una imagen que no pediste.
    const { v, nodo } = conCatalogo();
    v.renderElementosFilas();

    clic(v, {
      '.video-elemento-item': {
        classList: { contains: () => false },
        hasAttribute: () => true,
        getAttribute: (a) => ({ 'data-tipo': 'product', 'data-id': 'p1' }[a])
      }
    });

    expect(v.elementoAbierto).toEqual({ tipo: 'product', id: 'p1' });
    expect(v.seedanceRefs.image).toHaveLength(0);
    expect(nodo.innerHTML).toContain('video-elemento-selector');
  });

  test('el selector trae TODAS las fotos, cada una arrastrable', () => {
    const { v, nodo } = conCatalogo();
    v.elementoAbierto = { tipo: 'product', id: 'p1' };

    v.renderElementosFilas();

    // Se cuentan los botones por su `data-url`: `video-elemento-foto-check`
    // también empieza por "video-elemento-foto" y contarla infla el número.
    expect(nodo.innerHTML.split('class="video-elemento-foto"').length - 1).toBe(4);
    expect(nodo.innerHTML).toContain('data-url="https://cdn.test/d.jpg"');
    expect(nodo.innerHTML).toContain('draggable="true"');
  });

  test('lleva palomita, no solo borde: sobre fotos claras el borde se pierde', () => {
    const { v, nodo } = conCatalogo();
    v.elementoAbierto = { tipo: 'product', id: 'p1' };
    v.seedanceRefs.image = [{ origen: 'activo', _assetId: 'p1', url: 'https://cdn.test/b.jpg' }];

    v.renderElementosFilas();

    expect(nodo.innerHTML).toContain('video-elemento-foto is-selected');
    expect(nodo.innerHTML).toContain('video-elemento-foto-check');
    expect(nodo.innerHTML).toContain('>1/4<');
  });

  test('tocar el mismo elemento otra vez lo cierra', () => {
    const { v } = conCatalogo();
    v.elementoAbierto = { tipo: 'product', id: 'p1' };
    v.renderElementosFilas();

    clic(v, {
      '.video-elemento-item': {
        classList: { contains: () => false },
        hasAttribute: () => true,
        getAttribute: (a) => ({ 'data-tipo': 'product', 'data-id': 'p1' }[a])
      }
    });

    expect(v.elementoAbierto).toBeNull();
  });

  test('con UNA sola foto no hay selector: el tile ES esa foto', () => {
    const { v } = conCatalogo();
    v.renderElementosFilas();

    clic(v, {
      '.video-elemento-item': {
        classList: { contains: () => false },
        hasAttribute: () => false,
        getAttribute: (a) => ({ 'data-tipo': 'character', 'data-id': 'c1', 'data-url': 'https://cdn.test/ana.jpg' }[a])
      }
    });

    expect(v.elementoAbierto).toBeNull();
    expect(v.seedanceRefs.image).toHaveLength(1);
  });

  test('la × cierra sin tocar la selección', () => {
    const { v } = conCatalogo();
    v.elementoAbierto = { tipo: 'product', id: 'p1' };
    v.seedanceRefs.image = [{ origen: 'activo', _assetId: 'p1', url: 'https://cdn.test/a.jpg' }];
    v.renderElementosFilas();

    clic(v, { '[data-cerrar-selector]': {} });

    expect(v.elementoAbierto).toBeNull();
    expect(v.seedanceRefs.image).toHaveLength(1);
  });

  test('una foto del selector manda sobre el tile que la contiene', () => {
    // Si el tile ganara, tocar una foto abriría/cerraría el panel en vez de
    // elegirla.
    const { v } = conCatalogo();
    v.elementoAbierto = { tipo: 'product', id: 'p1' };
    v.renderElementosFilas();

    clic(v, {
      '.video-elemento-foto': {
        getAttribute: (a) => ({ 'data-tipo': 'product', 'data-id': 'p1', 'data-url': 'https://cdn.test/c.jpg' }[a])
      },
      '.video-elemento-item': { classList: { contains: () => false }, hasAttribute: () => true, getAttribute: () => 'p1' }
    });

    expect(v.seedanceRefs.image.map((r) => r.url)).toEqual(['https://cdn.test/c.jpg']);
    expect(v.elementoAbierto).toEqual({ tipo: 'product', id: 'p1' });
  });

  test('elegir varias NO cierra el selector: se sigue eligiendo', () => {
    const { v } = conCatalogo();
    v.elementoAbierto = { tipo: 'product', id: 'p1' };
    v.renderElementosFilas();

    v.alternarElemento('product', 'p1', 'https://cdn.test/a.jpg');
    v.alternarElemento('product', 'p1', 'https://cdn.test/c.jpg');

    expect(v.seedanceRefs.image).toHaveLength(2);
    expect(v.elementoAbierto).toEqual({ tipo: 'product', id: 'p1' });
  });

  test('ya no queda nada del popover flotante', () => {
    // Un panel `fixed` sobre un carrusel con scroll, en un sidebar de 380px,
    // con miniaturas de 52px: frágil por diseño.
    expect(FUENTE).not.toContain('abrirGaleria');
    expect(FUENTE).not.toContain("addEventListener('mouseover'");
    const css = fs.readFileSync(path.join(process.cwd(), 'css/modules/video.css'), 'utf8');
    expect(css).not.toContain('video-elemento-galeria');
  });
})

describe('Los botones de la consola: sin iconos, plano y blanco', () => {
  const html = VideoView.prototype.renderHTML.call({});
  const css = fs.readFileSync(path.join(process.cwd(), 'css/modules/video.css'), 'utf8');
  /** TODOS los bloques donde aparece ese selector: las metricas y el color
      viven en reglas distintas a proposito (el par se mide junto). */
  const regla = (sel) => {
    const partes = [];
    let i = css.indexOf(sel);
    while (i !== -1) {
      const abre = css.indexOf('{', i);
      if (abre !== -1) partes.push(css.slice(i, css.indexOf('}', abre)));
      i = css.indexOf(sel, i + sel.length);
    }
    return partes.join('\n');
  };

  test('ninguno de los dos lleva icono: la palabra sola es más clara', () => {
    const forge = html.slice(html.indexOf('id="seedancePromptForge"'));
    const send = html.slice(html.indexOf('id="seedancePromptSend"'));
    expect(forge.slice(0, forge.indexOf('</button>'))).not.toContain('<i ');
    expect(send.slice(0, send.indexOf('</button>'))).not.toContain('<i ');
    // Y el repintado ya no toca ningún icono al cambiar de estado: el texto
    // del botón es lo único que cambia.
    const pintar = FUENTE.slice(FUENTE.indexOf('_pintarBotones() {'));
    expect(pintar.slice(0, pintar.indexOf('\n  }'))).not.toContain('aisc-ico');
  });

  test('PRODUCIR va plano con el color más claro de la marca, no en degradado', () => {
    // El degradado de marca es la firma del producto; gastarlo en un botón lo
    // abarata. `--org-color-light` lo calcula OrgBrandTheme ordenando la
    // paleta de la org por luminosidad.
    const r = regla('.video-view-container .video-director-console-zone .video-director-btn-generate');
    expect(r).toContain('background: var(--org-color-light)');
    expect(r).not.toContain('gradient');
  });

  test('PROMPT va blanco entero con texto negro (tokens, L7)', () => {
    const r = regla('.video-view-container .video-director-btn-forge');
    expect(r).toContain('background: var(--color-white)');
    expect(r).toContain('color: var(--bg-base)');
  });

  test('el switch de audio se enciende con el mismo color de marca', () => {
    const r = regla('.video-view-container .seedance-toggle-row input[type="checkbox"]:checked + .seedance-toggle-track');
    expect(r).toContain('var(--org-color-light)');
  });

  test('el brief ya no se resalta al enfocarlo', () => {
    // Se escribe casi todo el tiempo, así que el anillo vivía encendido: no
    // señalaba nada y competía con los dos botones.
    const i = css.indexOf('.video-prompt-footer-card-inner.video-director-console:focus-within');
    const r = css.slice(i, css.indexOf('}', i));
    expect(r).not.toContain('rgba(255, 255, 255, 0.28)');
  });
})

describe('PROMPT y PRODUCIR son un par: mismo sitio, mismo tamaño', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'css/modules/video.css'), 'utf8');
  const compartida = (() => {
    const i = css.indexOf('.video-view-container .video-director-console-zone .video-director-btn-forge,');
    return css.slice(i, css.indexOf('}', i));
  })();

  test('las métricas van en UNA sola regla para los dos', () => {
    // Separadas, cualquier retoque en uno los desalinea sin que se note hasta
    // verlo en pantalla.
    expect(compartida).toContain('.video-director-btn-generate');
    expect(compartida).toContain('height: 36px');
    expect(compartida).toContain('min-width');
    expect(compartida).toContain('font-size: 0.8rem');
  });

  test('el `margin-left: auto` lo lleva PROMPT, el primero del par', () => {
    // Sobre PRODUCIR empujaba solo a PRODUCIR al extremo y dejaba PROMPT
    // perdido entre los ajustes, con media barra en medio.
    const i = css.indexOf('.video-view-container .video-director-console-zone .video-director-btn-forge {');
    expect(css.slice(i, css.indexOf('}', i))).toContain('margin-left: auto');
    const j = css.indexOf('.video-view-container .video-director-console-zone .video-director-btn-generate {');
    expect(css.slice(j, css.indexOf('}', j))).not.toContain('margin-left: auto');
  });

  test('los dos llevan borde: sin él, PRODUCIR mide 2px menos de alto', () => {
    // El bloque del COLOR, que es el que declara el borde — las métricas viven
    // en la regla compartida y ahí no hay borde que buscar.
    const i = css.indexOf('background: var(--org-color-light);\n    /* Borde');
    expect(i).toBeGreaterThan(-1);
    const gen = css.slice(css.lastIndexOf('{', i), css.indexOf('}', i));
    expect(gen).toContain('border: 1px solid');
    expect(gen).not.toContain('border: none');
  });

  test('en el marcado van pegados, PROMPT primero', () => {
    const html = VideoView.prototype.renderHTML.call({});
    const forge = html.indexOf('id="seedancePromptForge"');
    const send = html.indexOf('id="seedancePromptSend"');
    expect(forge).toBeLessThan(send);
    // Nada entre el cierre de uno y la apertura del otro salvo espacios.
    expect(html.slice(html.indexOf('</button>', forge) + 9, send - 60).trim()).toBe('');
  });
})
