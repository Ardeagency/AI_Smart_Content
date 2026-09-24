/**
 * Candado de pagos en la PANTALLA (ADR-0042): no basta PAGOS_HABILITADOS=false en
 * ApiV2 (test/api-v2.test.js). Ninguna vista ni componente puede llamar a la compra
 * ni cargar el widget de Wompi, y /credits no pinta paquetes ni botón de comprar.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const PANTALLA = [...archivos('js/views'), ...archivos('js/components'), ...archivos('js/studio')];

describe('La compra de créditos no aparece en la consola', () => {
  test('ninguna vista ni componente inicia un pago', () => {
    const culpables = PANTALLA.filter((f) => /iniciarCompra|iniciarPago|WidgetCheckout|checkout\.wompi|pagos\/iniciar/.test(fs.readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });

  test('/credits no pinta paquetes ni botón de comprar', () => {
    const src = fs.readFileSync('js/views/CreditsShopView.js', 'utf8');
    expect(src).not.toMatch(/paquetes\(|credit_packages|__\('Comprar'\)|credits-pack/);
  });

  test('el candado sigue cerrado en ApiV2', () => {
    expect(fs.readFileSync('js/services/ApiV2.js', 'utf8')).toMatch(/const PAGOS_HABILITADOS = false;/);
  });
});
