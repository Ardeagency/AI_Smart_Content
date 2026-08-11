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

function cargar() {
  const win = { BaseView: class {}, __: (s, p) => (p
    ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m))
    : String(s)) };
  globalThis.window = win;
  globalThis.BaseView = win.BaseView; // `class VideoView extends BaseView` lo busca global
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  new Function(FUENTE)();
  return win.VideoView;
}

const VideoView = cargar();

/** Vista con lo justo para ejercer la lógica de adjuntos, sin DOM real. */
function nuevaVista(controles = {}) {
  const avisos = [];
  const borradosDeStorage = [];
  const v = Object.create(VideoView.prototype);

  v.seedanceFrames = { first: null, last: null };
  v.seedanceRefs = { image: [], video: [], audio: [] };
  v.cinematography = {
    preset: '', shotType: '', lens: '', framing: '', cameraMovement: '',
    motionSpeed: '', motionIntensity: '', lightType: '', contrastLevel: '',
    temperature: '', tone: '', colorGrade: '', colorTemp: '', energyLevel: ''
  };
  v.selectedCampaignId = '';
  v.selectedAudienceId = '';
  v._cinePromptTokens = null;
  v.organizationId = 'org-1';
  v.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
  v.promptInput = { value: 'Apertura, desarrollo y cierre.' };

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
    '#seedanceGenAudioToggle': { getAttribute: () => 'true' },
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
    expect(payload.direction).toMatchObject({ pacing: 'Balanced', arc: 'Crescendo', mood: 'Cinematic' });
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

describe('Cinematografía — las plantillas de prompt que venían de Kling', () => {
  test('cada preset llena las trece claves de dirección', () => {
    const claves = ['shotType', 'lens', 'framing', 'cameraMovement', 'motionSpeed',
      'motionIntensity', 'lightType', 'contrastLevel', 'temperature', 'tone',
      'colorGrade', 'colorTemp', 'energyLevel'];
    const presets = VideoView.CINEMATOGRAPHY_PRESETS;
    const nombrados = Object.keys(presets).filter((k) => k !== '');

    expect(nombrados.length).toBeGreaterThan(0);
    for (const nombre of nombrados) {
      const faltantes = claves.filter((k) => !presets[nombre][k]);
      expect(`${nombre}: ${faltantes.join(', ')}`).toBe(`${nombre}: `);
    }
  });

  test('cada valor de preset existe como opción elegible', () => {
    const opts = VideoView.CINE_OPTIONS;
    const huerfanos = [];
    for (const [nombre, preset] of Object.entries(VideoView.CINEMATOGRAPHY_PRESETS)) {
      for (const [clave, valor] of Object.entries(preset)) {
        if (clave === 'label' || !valor) continue;
        if (!opts[clave]) { huerfanos.push(`${nombre}.${clave} sin catálogo`); continue; }
        if (!opts[clave].includes(valor)) huerfanos.push(`${nombre}.${clave} = "${valor}"`);
      }
    }
    // Un preset que apunta a un valor inexistente deja el select en blanco
    // sin avisar: se elige el preset y no pasa nada visible.
    expect(huerfanos).toEqual([]);
  });

  test('la dirección de fotografía viaja en el payload', () => {
    const { v } = nuevaVista();
    v.cinematography.cameraMovement = 'Orbit';
    v.cinematography.lightType = 'Rim light';
    v.cinematography.preset = 'luxury-hero';

    const payload = v.buildSeedancePayload();

    expect(payload.cinematography).toMatchObject({
      cameraMovement: 'Orbit', lightType: 'Rim light', preset: 'luxury-hero'
    });
  });

  test('asignar valores por código repinta los tiles', () => {
    // Los <select> son el modelo; los tiles son lo que el usuario mira.
    // Asignar .value no dispara 'change', así que si sync no repinta, elegir
    // un preset llena el estado y la pantalla sigue diciendo "ninguno".
    const { v } = nuevaVista();
    let repintados = 0;
    v._cineTileRenderers = [() => { repintados++; }, () => { repintados++; }];
    v.container.querySelector = () => ({ value: '' });

    v.cinematography.cameraMovement = 'Orbit';
    v.syncCinematographyToSelects();

    expect(repintados).toBe(2);
  });

  test('repintar sin tiles montados no revienta', () => {
    const { v } = nuevaVista();
    v.container.querySelector = () => null;

    expect(() => v.repaintCinematographyTiles()).not.toThrow();
  });

  test('el payload lleva una copia, no la referencia viva del estado', () => {
    const { v } = nuevaVista();
    v.cinematography.tone = 'Dark premium';

    const payload = v.buildSeedancePayload();
    v.cinematography.tone = 'Bright energetic';

    expect(payload.cinematography.tone).toBe('Dark premium');
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
    v.promptInput = { value: '   ' };
    const errores = [];
    v.showError = (m) => errores.push(m);

    await v.startGeneration();

    expect(errores.join(' ')).toMatch(/Escribe primero el storyboard/);
  });
});
