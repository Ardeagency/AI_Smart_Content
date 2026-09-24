/**
 * Fuente de Vera para los tests (L7 fase B, 24/09): VeraView se partió en helpers
 * (js/views/vera/graficos.js), la clase (js/views/VeraView.js) y mixins
 * (js/views/vera/*.mixin.js). En el navegador son scripts clásicos que comparten el
 * ámbito global; aquí se concatenan en el MISMO orden que carga app.js (veraLoader)
 * para evaluarlos en un solo Function.
 */
import fs from 'node:fs';
import path from 'node:path';

export const VERA_ARCHIVOS = [
  'js/views/vera/graficos.js',
  'js/views/VeraView.js',
  'js/views/vera/historial.mixin.js',
  'js/views/vera/biblioteca.mixin.js',
  'js/views/vera/artefactos.mixin.js',
  'js/views/vera/render.mixin.js',
  'js/views/vera/adjuntos.mixin.js',
];

export const FUENTE_VERA = VERA_ARCHIVOS.map((f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')).join('\n;\n');
