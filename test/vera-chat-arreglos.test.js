/**
 * Los arreglos del chat de Vera (auditoría 2026-08-07).
 *
 * Dos géneros de prueba, a propósito:
 *  1. COMPORTAMIENTO — la regla del scroll es lógica pura y se ejercita de verdad.
 *  2. INVARIANTES sobre el código fuente — para lo que necesitaría un DOM
 *     completo (este repo corre vitest en node, sin jsdom). No prueban que
 *     funcione: impiden que alguien deshaga en silencio una decisión de
 *     seguridad o vuelva a desalinear un nombre de atributo, que es justo como
 *     nacieron estos bugs.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'js/views/VeraView.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

function cargar() {
  const win = { BaseView: class {}, location: { protocol: 'https:', origin: 'https://x' } };
  globalThis.window = win;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  new Function(FUENTE)();
  return win.VeraView;
}

const VeraView = cargar();

/* Las dos funciones de scroll no tocan estado de la vista: se invocan sobre un
   `this` mínimo, sin instanciar VeraView (su constructor monta el puente). */
const vista = {
  _pegadoAlFondo: VeraView.prototype._pegadoAlFondo,
  _irAlFondo: VeraView.prototype._irAlFondo,
};

const caja = (scrollTop, { alto = 5000, ventana = 800 } = {}) => ({
  scrollTop, scrollHeight: alto, clientHeight: ventana,
});

describe('el chat no te arranca de donde estás leyendo', () => {
  test('si estabas abajo, te mantiene abajo', () => {
    const c = caja(4200); // 5000 - 4200 - 800 = 0 → pegado
    vista._irAlFondo(c);
    expect(c.scrollTop).toBe(5000);
  });

  test('si subiste a releer, NO te baja', () => {
    const c = caja(1000);
    vista._irAlFondo(c);
    expect(c.scrollTop, 'te devolvió al fondo mientras leías atrás').toBe(1000);
  });

  test('un margen pequeño sigue contando como "abajo" (no exige el píxel exacto)', () => {
    const c = caja(4100); // a 100px del fondo
    vista._irAlFondo(c);
    expect(c.scrollTop).toBe(5000);
  });

  test('forzar baja aunque estés leyendo arriba: es tu propio mensaje', () => {
    const c = caja(500);
    vista._irAlFondo(c, true);
    expect(c.scrollTop).toBe(5000);
  });

  test('no revienta sin contenedor', () => {
    expect(() => vista._irAlFondo(null, true)).not.toThrow();
    expect(vista._pegadoAlFondo(null)).toBe(false);
  });
});

describe('el artifact se resume en el chat, no se vuelca', () => {
  const v = {
    _textoPlano: VeraView.prototype._textoPlano,
    _recortar: VeraView.prototype._recortar,
    _tituloDeArtifact: VeraView.prototype._tituloDeArtifact,
    _resumenDeArtifact: VeraView.prototype._resumenDeArtifact,
  };

  test('el título sale del <title> del documento', () => {
    const html = '<!DOCTYPE html><html><head><title>Tráfico de marca · WAKEUP</title></head><body><h1>Otro</h1></body></html>';
    expect(v._tituloDeArtifact(html)).toBe('Tráfico de marca · WAKEUP');
  });

  test('sin <title>, cae al primer encabezado', () => {
    expect(v._tituloDeArtifact('<div><h1>Dashboard de <b>tráfico</b></h1></div>')).toBe('Dashboard de tráfico');
    expect(v._tituloDeArtifact('<section><h2>Competencia</h2></section>')).toBe('Competencia');
  });

  test('un documento sin nada legible no inventa título', () => {
    expect(v._tituloDeArtifact('<div><span>x</span></div>')).toBe('');
    expect(v._tituloDeArtifact('')).toBe('');
  });

  test('el resumen no repite el título', () => {
    const html = '<h1>Informe</h1><p>Informe</p><p>Instagram concentra el 70% del alcance del mes.</p>';
    expect(v._resumenDeArtifact(html)).toBe('Instagram concentra el 70% del alcance del mes.');
  });

  test('el resumen ignora migajas y recorta lo largo', () => {
    const largo = 'a'.repeat(300);
    expect(v._resumenDeArtifact('<p>ok</p>')).toBe(''); // demasiado corto para resumir
    const r = v._resumenDeArtifact(`<p>${largo}</p>`);
    expect(r.length).toBe(110);
    expect(r.endsWith('…')).toBe(true);
  });

  test('las entidades HTML se leen como texto, no como marcado', () => {
    expect(v._tituloDeArtifact('<h1>Ventas &amp; alcance</h1>')).toBe('Ventas & alcance');
  });

  test('la tarjeta no monta iframe: el documento viaja en data-srcdoc', () => {
    // Si alguien vuelve a meter un <iframe> en la tarjeta, el chat vuelve a
    // renderizar el artifact entero — que es justo el defecto que se corrigió.
    const card = FUENTE.slice(FUENTE.indexOf('vera-artifact-card"'), FUENTE.indexOf('// ── VISTA (```html)'));
    expect(card).toContain('data-srcdoc="');
    expect(card).not.toContain('<iframe');
  });

  test('el panel sabe abrir una tarjeta sin iframe', () => {
    const fn = FUENTE.slice(FUENTE.indexOf('_openArtifactPanel(btnEl) {'));
    expect(fn.slice(0, fn.indexOf('\n  }'))).toContain('block.dataset.srcdoc');
  });
});

describe('invariantes que no se pueden deshacer sin querer', () => {
  test('el HTML que Vera escribe no puede hablar hacia afuera', () => {
    // El iframe es null-origin (no LEE la sesión), pero sin CSP sí podía SACAR
    // datos de marca por fetch o cargar un script de cualquier CDN.
    expect(FUENTE).toContain("connect-src 'none'");
    expect(FUENTE).toContain("default-src 'none'");
    expect(FUENTE).toContain("script-src 'unsafe-inline' 'unsafe-eval'");
  });

  test('los bloques inline no pueden congelar la pestaña con un alert()', () => {
    // El marco del panel SÍ lleva allow-modals (window.print lo necesita para el
    // PDF); los inline, que se pintan solos en cada mensaje, no.
    expect(FUENTE).toContain('sandbox="allow-scripts allow-forms" ');
    expect(FUENTE).not.toContain('sandbox="allow-scripts allow-forms allow-modals"');
  });

  test('ningún iframe de Vera recibe allow-same-origin', () => {
    // Se miran las DECLARACIONES de sandbox, no el texto suelto: los comentarios
    // nombran `allow-same-origin` justamente para explicar por qué no está.
    const declaraciones = FUENTE.match(/sandbox['"=\s,]+['"][^'"]*['"]/g) || [];
    expect(declaraciones.length, 'no se encontró ninguna declaración de sandbox').toBeGreaterThan(0);
    for (const d of declaraciones) {
      expect(d, 'un iframe de Vera podría leer la sesión del padre').not.toContain('allow-same-origin');
    }
  });

  test('borrar un mensaje usa el mismo atributo con el que se pinta', () => {
    // El bug: se pintaba data-message-id y se borraba buscando data-msg-id, así
    // que un mensaje descartado se quedaba en pantalla para siempre.
    const cuerpo = FUENTE.slice(FUENTE.indexOf('_removeMessage(id) {'));
    const fin = cuerpo.indexOf('\n  }');
    expect(cuerpo.slice(0, fin)).toContain('data-message-id=');
  });

  test('los mensajes se cargan con su metadata', () => {
    // Sin metadata el botón "Autorizar" de una tarea costosa no tiene qué
    // reenviar: se queda mudo después de decir "✓ Autorizado".
    expect(FUENTE).toContain("select('id, role, content, created_at, metadata')");
    expect(FUENTE).toContain("select('id, role, content, created_at, conversation_id, metadata')");
  });

  test('el respaldo por polling no depende del reloj del navegador', () => {
    // `created_at` lo pone Postgres; comparar contra un ISO del cliente hacía
    // que con el reloj adelantado el respaldo no entregara nunca.
    expect(FUENTE).not.toContain('.gt(\'created_at\', startIso)');
    expect(FUENTE).toContain('const vistos = new Set');
  });
});
