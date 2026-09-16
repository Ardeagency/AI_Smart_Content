#!/usr/bin/env node
/**
 * Cruza cada `this._metodo(` / `this.metodo(` que una vista llama contra los
 * métodos que define (propios o de mixins conocidos). `node --check` NO caza
 * un método llamado sin definir: la página revienta al pulsar. Uso:
 *   node scripts/metodos-definidos.mjs js/views/OrganizationView.js [más archivos]
 * Sale con 1 si falta alguno. Los métodos de BaseView y de los mixins de marca
 * se dan por definidos (lista abajo, ampliable).
 */
import { readFileSync } from 'node:fs';
const HEREDADOS = new Set(['querySelector', 'querySelectorAll', 'render', 'destroy', 'cleanup', 'addEventListener', 'escapeHtml', 'updateHeader', 'updateHeaderContext', 'emptyState', 'showError', 'showNotification', 'applyNoTransitionStyles', 'renderHTML', 'onEnter', 'onLeave', 'init', 'initSupabase', 'handleSameViewClassNavigation', 'updateLinksForRouter']);
let falta = 0;
for (const archivo of process.argv.slice(2)) {
  const src = readFileSync(archivo, 'utf8');
  const definidos = new Set([...src.matchAll(/^\s{2}(?:static\s+)?(?:async\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]));
  // mixins: Object.assign(X.prototype, { metodo() {...} }) — cuenta lo definido con 4 espacios también
  [...src.matchAll(/^\s{4}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].forEach((m) => definidos.add(m[1]));
  const llamados = new Set([...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  const faltantes = [...llamados].filter((m) => !definidos.has(m) && !HEREDADOS.has(m));
  if (faltantes.length) { falta += faltantes.length; console.log(`${archivo}: llamados sin definir aquí → ${faltantes.join(', ')}`); }
  else console.log(`${archivo}: ${llamados.size} métodos llamados, todos definidos`);
}
process.exit(falta ? 1 : 0);
