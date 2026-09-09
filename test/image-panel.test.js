/**
 * El panel de producción de /image: pestaña Recursos y pestaña Fotografía.
 *
 * Lo que se ve mirando la pantalla es el chip o el tile seleccionado. Lo que
 * NO se ve es el criterio: el cupo de referencias que la UI promete y el
 * código debe aplicar, el tope de imágenes que gasta un bloqueo de producto,
 * y que cada valor de un preset exista de verdad en el catálogo de opciones.
 * Cualquiera de esas reglas fallando en silencio se descubre tarde — un
 * preset que no llena nada, o un error de KIE cuando el usuario ya subió los
 * archivos y ya se le cobró.
 *
 * El cupo se prueba aquí Y se aplica en functions/kie-image-create.js: son
 * dos números que tienen que decir lo mismo (ImageView.IMAGE_REF_LIMIT y
 * MAX_REFERENCE_IMAGES). El test los cruza contra el archivo de la función.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/views/ImageView.js'), 'utf8');
const GRAMATICA = fs.readFileSync(path.join(process.cwd(), 'js/studio/direccion.js'), 'utf8');

function cargar() {
  const win = { BaseView: class {}, __: (s, p) => (p
    ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m))
    : String(s)) };
  globalThis.window = win;
  globalThis.BaseView = win.BaseView; // `class ImageView extends BaseView` lo busca global
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  // La gramatica de variables va primero: el catalogo se arma con ella.
  new Function(GRAMATICA)();
  new Function(FUENTE)();
  return win.ImageView;
}

const ImageView = cargar();
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
  const v = Object.create(ImageView.prototype);

  v.imageRefs = [];
  v.imageProductions = [];
  v.selectedProductionIds = new Set();
  v.assetScope = 'product';
  v.selectedAssetId = '';
  v.selectedCampaignId = '';
  v.selectedAudienceId = '';
  v._promptTokens = null;
  v.organizationId = 'org-1';
  v.dbData = { products: [], services: [], entities: [], audiences: [], campaigns: [] };
  v.editor = editorFalso('Una botella sobre piedra mojada.');
  v._catalogo = null;

  v.container = {
    querySelector: (sel) => (sel in controles ? controles[sel] : null),
    querySelectorAll: () => []
  };

  // Sustitutos de los bordes: subida, borrado y pintado.
  v._uploadFile = async (file) => ({
    url: `https://cdn.test/${file.name}`,
    storagePath: `image-refs/u/${file.name}`
  });
  v._removeStorage = (p) => borradosDeStorage.push(p);
  v._notify = (msg) => avisos.push(msg);
  v.renderRefs = () => {};
  v.renderAttachmentChips = () => {};
  v.renderEscenasCarousel = () => {};
  v.renderProductionsGallery = () => {};
  v.renderAssetProductsCarousel = () => {};
  v.scheduleResizePromptInput = () => {};
  v.buildBrandContextForAPI = () => ({ brand_voice: {} });

  return { v, avisos, borradosDeStorage };
}

const archivo = (name, type = 'image/jpeg') => ({ name, type });

/** Producto con cuatro fotos: el catálogo guarda hasta cuatro. */
function conProducto(v) {
  v.dbData.products = [{
    id: 'prod-1', nombre_producto: 'Botella', entity_id: 'ent-9',
    image_urls: ['a', 'b', 'c', 'd'].map((n) => `https://cdn.test/${n}.jpg`)
  }];
}

describe('Referencias visuales — el cupo que promete el sidebar', () => {
  test('corta en el límite y dice cuántas ignoró', async () => {
    const { v, avisos } = nuevaVista();
    const muchas = Array.from({ length: ImageView.IMAGE_REF_LIMIT + 3 }, (_, i) => archivo(`img${i}.jpg`));

    await v.addRefs(muchas);

    expect(v.imageRefs).toHaveLength(ImageView.IMAGE_REF_LIMIT);
    expect(avisos.join(' ')).toMatch(/se ignoran 3/);
  });

  test('con el cupo lleno no sube nada y lo dice', async () => {
    const { v, avisos } = nuevaVista();
    v.imageRefs = Array.from({ length: ImageView.IMAGE_REF_LIMIT }, (_, i) => ({
      name: `r${i}`, url: `u${i}`, storagePath: `p${i}`, origen: 'manual'
    }));

    await v.addRefs([archivo('otra.jpg')]);

    expect(v.imageRefs).toHaveLength(ImageView.IMAGE_REF_LIMIT);
    expect(avisos.join(' ')).toMatch(new RegExp(`máximo de ${ImageView.IMAGE_REF_LIMIT}`));
  });

  test('el cupo de la UI es el mismo que aplica la función de creación', () => {
    // Un tope que la pantalla anuncia y el backend no aplica (o al revés) se
    // paga en el error de KIE, cuando el usuario ya subió los archivos.
    const fn = fs.readFileSync(path.join(process.cwd(), 'functions/kie-image-create.js'), 'utf8');
    const m = fn.match(/KIE_IMAGE_MAX_REFS\s*\|\|\s*(\d+)/);

    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(ImageView.IMAGE_REF_LIMIT);
  });

  test('quitar una subida a mano la borra del bucket; una ajena, no', () => {
    const { v, borradosDeStorage } = nuevaVista();
    v.imageRefs = [
      { name: 'mia.jpg', url: 'u1', storagePath: 'image-refs/u/mia.jpg', origen: 'manual' },
      { name: 'escena', url: 'u2', storagePath: null, origen: 'produccion', _productionId: 'p-1' }
    ];

    v.removeRef(1);
    v.removeRef(0);

    // Borrar la URL de una producción se llevaría por delante la producción.
    expect(borradosDeStorage).toEqual(['image-refs/u/mia.jpg']);
  });
});

describe('Escenas — producciones previas como referencia', () => {
  test('las que no caben se desmarcan y se avisa; no quedan marcadas sin viajar', () => {
    const { v, avisos } = nuevaVista();
    v.imageRefs = Array.from({ length: ImageView.IMAGE_REF_LIMIT }, (_, i) => ({
      name: `r${i}`, url: `u${i}`, storagePath: `p${i}`, origen: 'manual'
    }));
    v.imageProductions = [{ id: 'p-1', media_url: 'https://cdn.test/p1.png', isImage: true }];
    v.selectedProductionIds = new Set(['p-1']);

    v.syncProductionSelectionToRefs();

    expect(v.selectedProductionIds.has('p-1')).toBe(false);
    expect(avisos.join(' ')).toMatch(/no caben/);
  });

  test('reelegir no acumula duplicados', () => {
    const { v } = nuevaVista();
    v.imageProductions = [{ id: 'p-1', media_url: 'https://cdn.test/p1.png', isImage: true }];
    v.selectedProductionIds = new Set(['p-1']);

    v.syncProductionSelectionToRefs();
    v.syncProductionSelectionToRefs();

    expect(v.imageRefs.filter((r) => r.origen === 'produccion')).toHaveLength(1);
  });
});

describe('Stack de activos — el producto que la imagen no debe alterar', () => {
  test('el bloqueo no se come el cupo: tope de imágenes por producto', () => {
    const { v } = nuevaVista();
    conProducto(v);
    v.selectedAssetId = 'prod-1';

    v.syncAssetSelectionToRefs();

    expect(v.imageRefs).toHaveLength(ImageView.IMAGE_PRODUCT_LOCK_IMAGES);
    expect(ImageView.IMAGE_PRODUCT_LOCK_IMAGES).toBeLessThan(ImageView.IMAGE_REF_LIMIT);
  });

  test('cambiar de producto reemplaza, no acumula', () => {
    const { v } = nuevaVista();
    conProducto(v);
    v.selectedAssetId = 'prod-1';
    v.syncAssetSelectionToRefs();

    v.syncAssetSelectionToRefs();

    expect(v.imageRefs).toHaveLength(ImageView.IMAGE_PRODUCT_LOCK_IMAGES);
  });

  test('el bloqueo sale aparte en el payload, y también dentro de las referencias', () => {
    const { v } = nuevaVista();
    conProducto(v);
    v.selectedAssetId = 'prod-1';
    v.syncAssetSelectionToRefs();

    const payload = v.buildImagePayload();

    expect(payload.product_lock_urls).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
    // Ocupan cupo como cualquier referencia: para KIE no son un campo aparte.
    expect(payload.reference_images).toEqual(payload.product_lock_urls);
  });

  test('el activo devuelve el linaje a la entidad de marca', () => {
    const { v } = nuevaVista();
    conProducto(v);
    v.selectedAssetId = 'prod-1';

    expect(v._resolveSelectedEntityId()).toBe('ent-9');
  });

  test('sin activo elegido no hay linaje que inventar', () => {
    const { v } = nuevaVista();
    conProducto(v);

    expect(v._resolveSelectedEntityId()).toBeNull();
  });
});

describe('Fotografía — cada opción es una variable de prompt', () => {
  const cat = Object.create(ImageView.prototype).catalogo;

  test('toda opción lleva su frase: mandar la etiqueta cruda desperdicia el control', () => {
    // "Rim light" es una pista; su frase es una instrucción. Una opción sin
    // `prompt` llega al modelo como una palabra suelta y no dirige nada.
    const mudas = [];
    for (const [campo, opciones] of Object.entries(cat.opciones)) {
      opciones.forEach((o) => {
        if (!o.prompt || !o.prompt.trim()) mudas.push(`${campo}.${o.valor}`);
        if (o.prompt === o.valor) mudas.push(`${campo}.${o.valor} (frase = etiqueta)`);
      });
    }
    expect(mudas).toEqual([]);
  });

  test('cada bloque del panel apunta a un campo que existe', () => {
    // armarCatalogo() revienta si no; este test deja dicho por qué: un bloque
    // huérfano pinta una rejilla vacía y el panel se ve completo sin estarlo.
    for (const p of cat.pestanas) {
      for (const b of p.bloques) expect(cat.opciones[b.campo]).toBeTruthy();
    }
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

  test('una receta escribe sus variables en el orden del catálogo', () => {
    const receta = cat.presets[0];
    const vs = Direccion.variablesDeReceta(cat, receta.valores);

    expect(vs.length).toBeGreaterThan(3);
    // Un plano se describe en orden; el orden del catálogo es el del panel.
    const posiciones = vs.map((v) => cat.orden.indexOf(
      cat.pestanas.flatMap((p) => p.bloques).find((b) => b.etiqueta === v.etiqueta).campo
    ));
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
  });

  test('el movimiento de cámara no existe aquí: una foto no se mueve', () => {
    expect(cat.opciones.cameraMovement).toBeUndefined();
    expect(cat.opciones.motionSpeed).toBeUndefined();
  });
});

describe('Las variables dentro del prompt', () => {
  const cat = Object.create(ImageView.prototype).catalogo;

  test('cada variable se cambia por su frase EN SU SITIO', () => {
    const texto = 'Una botella sobre piedra mojada [Lente: 85mm (Portrait Compression)] al atardecer.';

    const salida = Direccion.expandirVariables(cat, texto);

    // El sitio importa: una dirección de lente junto al sujeto pesa distinto
    // que la misma al final del prompt.
    expect(salida).toBe('Una botella sobre piedra mojada Shot at 85mm, portrait compression separating subject from background. al atardecer.');
  });

  test('lo que no reconoce lo deja tal cual: es texto del usuario', () => {
    const texto = 'Una botella [nota: revisar esto] y [Lente: 50mm (Balanced)].';

    const salida = Direccion.expandirVariables(cat, texto);

    expect(salida).toContain('[nota: revisar esto]');
    expect(salida).toContain('Shot at 50mm');
  });

  test('expandir dos veces seguidas da lo mismo: la regex no arrastra lastIndex', () => {
    // Una regex con /g compartida empieza a mitad del texto en la segunda
    // llamada y se salta variables sin avisar.
    const texto = '[Lente: 50mm (Balanced)] y [Luz: Rim light]';
    expect(Direccion.expandirVariables(cat, texto)).toBe(Direccion.expandirVariables(cat, texto));
    expect(Direccion.leerVariables(texto)).toHaveLength(2);
    expect(Direccion.leerVariables(texto)).toHaveLength(2);
  });

  test('la etiqueta desambigua valores que se repiten entre campos', () => {
    // "Warm" existe en Temperatura y en Color grade. Sin la etiqueta no hay
    // forma de saber cuál frase toca.
    const porTemp = Direccion.expandirVariables(cat, '[Temperatura: Warm]');
    const porGrade = Direccion.expandirVariables(cat, '[Color grade: Warm]');

    expect(porTemp).not.toBe(porGrade);
    expect(porTemp).toContain('colour temperature');
    expect(porGrade).toContain('colour grade');
  });
});

describe('Payload — lo que se manda a crear la tarea', () => {
  test('los conceptuales viajan como texto y NO como FK', () => {
    const { v } = nuevaVista();
    v.selectedCampaignId = 'Product launch';
    v.selectedAudienceId = 'Mass market';

    const payload = v.buildImagePayload();

    expect(payload.campaign).toBe('Product launch');
    expect(payload.audience).toBe('Mass market');
    // El insert en system_ai_outputs no puede llevarlos: campaign_id y
    // persona_id son uuid, y un string ahí tumba la fila entera después de
    // que la imagen ya se generó y ya se cobró.
    expect(v._resolveSelectedBriefId()).toBeNull();
  });

  test('el prompt viaja expandido y la intención guarda los chips', () => {
    const { v } = nuevaVista();
    v.editor = editorFalso('Una botella [Luz: Rim light] sobre piedra.');

    const payload = v.buildImagePayload();

    // Al modelo va la frase; a la ficha va lo que el director escribió, para
    // poder recrear y para saber qué archivos mandó.
    expect(payload.prompt).toContain('A rim light behind the subject');
    expect(payload.prompt).not.toContain('[Luz:');
    expect(payload.intencion).toBe('Una botella [Luz: Rim light] sobre piedra.');
    expect(payload.variables).toEqual([{ etiqueta: 'Luz', valor: 'Rim light' }]);
  });

  test('sin controles en el DOM el formato cae a valores válidos, no a undefined', () => {
    const { v } = nuevaVista();

    const payload = v.buildImagePayload();

    expect(payload.aspect_ratio).toBe('1:1');
    expect(payload.resolution).toBe('2K');
    expect(payload.output_format).toBe('png');
  });

  test('lee el formato elegido en la consola', () => {
    const { v } = nuevaVista({
      '#imageAspectRatio': { value: '9:16' },
      '#imageResolution': { value: '4K' },
      '#imageOutputFormat': { value: 'jpg' }
    });

    const payload = v.buildImagePayload();

    expect(payload.aspect_ratio).toBe('9:16');
    expect(payload.resolution).toBe('4K');
    expect(payload.output_format).toBe('jpg');
  });
});

describe('Plantilla — los controles que init() busca tienen que existir', () => {
  const html = ImageView.prototype.renderHTML.call({});
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  test('cada querySelector("#…") del código apunta a un id que la plantilla pinta', () => {
    // Un id mal escrito no revienta: querySelector devuelve null, el listener
    // no se cuelga y el control queda muerto sin una sola línea en consola.
    const buscados = [...FUENTE.matchAll(/querySelector\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]);
    expect(buscados.length).toBeGreaterThan(20);
    expect(buscados.filter((id) => !ids.has(id))).toEqual([]);
  });

  test('el panel de dirección se pinta por JS, no por marcado', () => {
    // Los tiles ya no son <select> en la plantilla: initPhotography() los
    // escribe dentro de estos dos huecos. Si dejan de existir, el panel queda
    // en blanco sin un solo error en consola.
    expect(ids.has('imagePhotoTabs')).toBe(true);
    expect(ids.has('imagePhotoPanels')).toBe(true);
    expect(ids.has('imagePhotoReceta')).toBe(true);
    // Y el brief ya no es un textarea: es el hueco del editor de variables.
    expect(ids.has('imagePromptEditor')).toBe(true);
    expect(html).not.toContain('<textarea');
  });

  test('el árbol cierra: mismo número de aperturas y cierres por etiqueta', () => {
    for (const tag of ['div', 'section', 'aside', 'main', 'select', 'button']) {
      const abre = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
      const cierra = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
      expect(`${tag}: ${abre}/${cierra}`).toBe(`${tag}: ${abre}/${abre}`);
    }
  });

  test('conserva el esqueleto de video.css: sin esas clases la página sale sin estilo', () => {
    // Toda la hoja cuelga de .video-view-container; ImageView la lleva a
    // propósito y solo añade image-view-container para lo que difiere.
    expect(html).toContain('video-view-container image-view-container');
    expect(html).toContain('class="video-sidebar-console"');
  });
});
