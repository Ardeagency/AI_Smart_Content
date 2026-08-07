/**
 * El alto de los HTML/artifacts que escribe Vera: que CONVERJA.
 *
 * El bug real (visto en producción): el bloque terminaba de renderizar y seguía
 * creciendo, dejando miles de píxeles de vacío muerto bajo el HTML. La causa no
 * era el HTML de Vera sino el puente: el iframe reportaba el scrollHeight del
 * documento —cuyo piso es el viewport, o sea el alto que el padre acababa de
 * ponerle— y el padre le sumaba 24px y lo devolvía. Cada vuelta, 24px más.
 *
 * Por eso estas pruebas no comprueban "el alto es X": comprueban que el ciclo
 * padre↔iframe se DETIENE. Un bucle no se ve midiendo una vuelta.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.join(process.cwd(), 'js/views/VeraView.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

/* VeraView es un script de navegador: se le monta un window falso y se evalúa.
   Nada del módulo toca el DOM hasta que se instancia la vista. */
function cargar() {
  const win = { BaseView: class {}, location: { protocol: 'https:', origin: 'https://x' } };
  globalThis.window = win;
  globalThis.document = { addEventListener() {}, removeEventListener() {}, createElement: () => ({ set textContent(v) { this.innerHTML = String(v); } }) };
  new Function(FUENTE)();
  return win.VeraView._fitSandboxFrame;
}

const fit = cargar();

const MIN_CSS = 160; // min-height del CSS: el viewport nunca baja de ahí

/* Simula el ciclo completo. `medir(viewport)` es el iframe respondiendo: le
   entra el alto que el padre le acaba de dar y devuelve lo que mediría su body.
   Devuelve el historial de alturas aplicadas. */
function ciclar(medir, { vueltas = 60, msPorVuelta = 0 } = {}) {
  const frame = { style: {} };
  const alturas = [];
  let t = 1_000_000;
  for (let i = 0; i < vueltas; i++) {
    const viewport = Math.max(MIN_CSS, parseInt(frame.style.height, 10) || 0);
    const content = medir(viewport);
    const antes = frame.style.height;
    fit(frame, { height: content, content, viewport }, t);
    t += msPorVuelta;
    if (frame.style.height !== antes) alturas.push(parseInt(frame.style.height, 10));
  }
  return { alturas, final: parseInt(frame.style.height, 10) || 0, frame };
}

describe('el alto de un artifact converge', () => {
  test('un documento atado al viewport (min-height:100vh) DEJA de crecer', () => {
    // Este es el bug reportado: el contenido siempre iguala al viewport, así que
    // cada alto que le demos lo vuelve a reportar como suyo.
    const { alturas, final } = ciclar((viewport) => viewport);

    expect(final).toBeLessThanOrEqual(900);
    // Como mucho: la primera medida y el sondeo del lienzo. Nunca 60 vueltas.
    expect(alturas.length, `siguió creciendo: ${alturas.join(' → ')}`).toBeLessThanOrEqual(2);
  });

  test('un documento con alto propio se ajusta a su alto y se queda ahí', () => {
    const { alturas, final } = ciclar((viewport) => Math.max(1200, viewport));
    expect(final).toBe(1200);
    expect(alturas.length, `se reajustó de más: ${alturas.join(' → ')}`).toBeLessThanOrEqual(2);
  });

  test('un documento más corto que el mínimo no deja vacío: se queda en el mínimo', () => {
    const { final } = ciclar(() => 90);
    expect(final).toBe(MIN_CSS);
  });

  test('un documento de exactamente el alto mínimo termina en su medida real, no en el lienzo', () => {
    // Caso ambiguo: mide 160 y el viewport arranca en 160. El sondeo lo resuelve.
    const { final } = ciclar(() => 160);
    expect(final).toBe(160);
  });

  test('un documento que crece con el viewport en proporción (120vh) queda acotado', () => {
    // Ratchet exponencial: sin fusible llegaría al techo y seguiría.
    const { final, frame } = ciclar((viewport) => Math.round(viewport * 1.2), { vueltas: 200 });
    expect(final).toBeLessThan(6000);
    expect(frame.__veraFit.frozen, 'debía congelarse al detectar la tormenta').toBe(true);
  });

  test('el techo duro se respeta aunque el documento pida más', () => {
    const { final } = ciclar(() => 99999);
    expect(final).toBe(6000);
  });
});

describe('lo que NO debe romper el arreglo', () => {
  test('un artifact interactivo que el usuario despliega y cierra sigue respondiendo', () => {
    // 40 interacciones separadas en el tiempo: NO son una tormenta.
    const frame = { style: {} };
    let t = 1_000_000;
    let abierto = false;
    let ultimo = 0;
    for (let i = 0; i < 40; i++) {
      abierto = !abierto;
      const viewport = Math.max(MIN_CSS, parseInt(frame.style.height, 10) || 0);
      ultimo = abierto ? 1400 : 500;
      fit(frame, { content: ultimo, viewport }, t);
      t += 3000; // el usuario tarda segundos entre clics
    }
    expect(frame.__veraFit.frozen, 'congeló un widget que el usuario estaba usando').toBe(false);
    // Sigue obedeciendo en el clic número 40, no solo en los primeros.
    expect(parseInt(frame.style.height, 10)).toBe(ultimo);
  });

  test('un mensaje viejo sin viewport sigue funcionando y no se desboca', () => {
    const frame = { style: {} };
    for (let i = 0; i < 100; i++) fit(frame, { height: 700 }, 1_000_000);
    expect(parseInt(frame.style.height, 10)).toBe(700);
  });

  test('un mensaje inservible no toca el alto', () => {
    const frame = { style: { height: '800px' } };
    fit(frame, { content: 0, viewport: 800 }, 1);
    fit(frame, {}, 1);
    expect(frame.style.height).toBe('800px');
  });
});
