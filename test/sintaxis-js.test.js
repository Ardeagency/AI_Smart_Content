/**
 * Guardia de sintaxis: cada .js que sirve la consola tiene que PARSEAR. Un paréntesis
 * de menos en una vista no lo caza ningún test de unidad (la vista se carga lazy) y en
 * producción es una pantalla en negro: «TableroView not found after loading».
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const RAIZ = path.join(process.cwd(), 'js');
const lista = archivos(RAIZ).map((p) => path.relative(process.cwd(), p)).sort();

describe('Sintaxis de js/**/*.js', () => {
  test('hay archivos que revisar', () => { expect(lista.length).toBeGreaterThan(50); });
  for (const f of lista) {
    test(f, () => {
      const src = fs.readFileSync(f, 'utf8');
      // Los .js del cliente son scripts clásicos (sin import/export); los .mjs no entran aquí.
      expect(() => new vm.Script(src, { filename: f })).not.toThrow();
    });
  }
});
