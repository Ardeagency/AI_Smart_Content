/**
 * Guardia XSS de las vistas PORTADAS a la base nueva (corte, 16/09): todo dato
 * de una fila (name, email, title, body, nombre_marca, file_name…) que entre en
 * un template `${…}` de HTML tiene que pasar por escapeHtml/_esc. Lo que
 * escapa la propia vista con textContent no cuenta aquí (no es HTML).
 * Recuerda ADR-0045 (XSS por la galería) y la barrida de escapeHtml del 10/09.
 * Al portar una vista nueva se añade a VISTAS: la guardia la cubre sola.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const VISTAS = [
  'js/views/BrandOrganizationView.js',
  'js/views/brand-mixins/ColorEditor.mixin.js',
  'js/views/brand-mixins/Typography.mixin.js',
  'js/views/brand-mixins/Uploads.mixin.js',
  'js/views/PlanesView.js',
  'js/views/CreditsShopView.js',
  'js/views/OrganizationView.js',
  'js/views/ImageView.js',
  'js/views/VideoView.js',
  'js/components/Avisos.js',
  'js/views/ProductsListView.js',
  'js/views/ServicesView.js',
  'js/views/PlacesView.js',
  'js/views/CharactersView.js',
];
// Campos de fila que llegan de la base y podrían traer HTML de una persona.
// (kind/role/action/meter_code son enums o códigos de la base, no texto de una persona.)
const CAMPOS = '(name|full_name|email|title|body|nombre_marca|file_name|legal_name|description|detalle|slogan|tagline|account_name|external_account_name|display_name|user_email|billing_email|address_line|city|region|number)';
const PELIGRO = new RegExp('\\$\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}', 'g');
const CAMPO = new RegExp('[\\w$\\]\\)]\\.' + CAMPOS + '\\b');
const ESCAPADO = /escapeHtml\(|_esc\(|escHtml\(|\besc\(|__\(|toLocaleString|toFixed|Number\(|Math\.round|encodeURIComponent|\.length|=== |!== |\? '|\? `|\.map\(|\.join\(|\.filter\(|\.includes\(|\.slice\(0, 8\)|\.toLowerCase\(\) === /;

function hallazgos(src) {
  const salida = [];
  let m;
  while ((m = PELIGRO.exec(src))) {
    const expr = m[1];
    if (!CAMPO.test(expr)) continue;
    if (ESCAPADO.test(expr)) continue;
    // Interpolaciones que no van a HTML (llaves de caché, rutas, claves de i18n) tampoco cuentan.
    const linea = src.slice(0, m.index).split('\n').length;
    const contexto = src.slice(Math.max(0, m.index - 200), m.index);
    // Texto que NO es HTML (alert/return de validación) o cadenas que la vista escapa al pintarlas (desc, resource).
    if (/apiClient\.(query|invalidate)|console\.(warn|error|log|info)|throw |new Error|navigate\(|href = |localStorage|\[`|`\$\{prefix\}|`\$\{k\}|`\$\{e\.fecha\}|_validateFile|alert\(|desc: \(|const resource = /.test(contexto)) continue;
    salida.push(`línea ${linea}: \${${expr.trim().slice(0, 70)}}`);
  }
  return salida;
}

describe('XSS · las vistas portadas escapan lo que viene de la base', () => {
  for (const vista of VISTAS) {
    test(vista, () => {
      const src = fs.readFileSync(path.join(process.cwd(), vista), 'utf8');
      expect(hallazgos(src)).toEqual([]);
    });
  }
});
