/**
 * PlanesDataService: la traducción billing.* → lo que /plans y /credits pintan.
 * Contrato de BD del 16/09 (docs/contratos/planes.md): la llave del plan es el
 * tier; los precios viven en billing.prices por moneda e intervalo; free y
 * starter no tienen precio; max_storage_gb NULO = sin límite; el saldo se lee
 * de available/balance; los paquetes se compran por code.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/PlanesDataService.js'), 'utf8');
let P;
const PRECIOS = [
  { tier: 'pro', currency: 'USD', interval: 'monthly', amount: 179, is_active: true },
  { tier: 'pro', currency: 'USD', interval: 'yearly', amount: 1718, is_active: true },
  { tier: 'pro', currency: 'COP', interval: 'monthly', amount: 720000, is_active: true },
  { tier: 'enterprise', currency: 'USD', interval: 'monthly', amount: 499, is_active: true },
  { tier: 'enterprise', currency: 'USD', interval: 'monthly', amount: 999, is_active: false },
];
const CAPS = [{ tier: 'pro', capability: 'multi_mercado' }, { tier: 'pro', capability: 'agentes_ia' }, { tier: 'enterprise', capability: 'api_propia' }];

beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  new Function(FUENTE)();
  P = globalThis.window.PlanesDatos.mapeo;
});

describe('Planes · planes y precios', () => {
  test('el precio sale de prices por tier, moneda e intervalo y solo si está activo', () => {
    expect(P.precio(PRECIOS, 'pro', 'USD', 'monthly')).toBe(179);
    expect(P.precio(PRECIOS, 'pro', 'COP', 'monthly')).toBe(720000);
    expect(P.precio(PRECIOS, 'enterprise', 'USD', 'monthly')).toBe(499);
    expect(P.precio(PRECIOS, 'starter', 'USD', 'monthly')).toBeNull();
  });
  test('un plan de la base sale con la forma de v1: id = tier, capacidades, tope de almacenamiento en MB o sin límite', () => {
    const pro = P.planAV1({ tier: 'pro', name: 'Pro', max_markets: 5, max_members: 10, monthly_credits: 500, max_storage_gb: null }, PRECIOS, CAPS);
    expect(pro).toMatchObject({ id: 'pro', name: 'Pro', price_usd_month: 179, price_usd_year: 1718, credits_monthly: 500, max_handles: 5, storage_mb: null, sin_limite_almacenamiento: true, is_popular: true, display_order: 2 });
    expect(pro.features.capacidades).toEqual(['multi_mercado', 'agentes_ia']);
    const free = P.planAV1({ tier: 'free', name: 'Free', max_markets: 1, max_members: 1, monthly_credits: 0, max_storage_gb: 5 }, PRECIOS, CAPS);
    expect(free).toMatchObject({ price_usd_month: 0, price_usd_year: 0, storage_mb: 5120, sin_limite_almacenamiento: false, display_order: 0 });
  });
  test('free se muestra aunque no tenga precio; starter sin precio no se ofrece', () => {
    expect(P.seMuestra(P.planAV1({ tier: 'free', name: 'Free' }, [], []))).toBe(true);
    expect(P.seMuestra(P.planAV1({ tier: 'starter', name: 'Starter' }, PRECIOS, []))).toBe(false);
    expect(P.seMuestra(P.planAV1({ tier: 'pro', name: 'Pro' }, PRECIOS, []))).toBe(true);
  });
});

describe('Planes · suscripción, créditos, almacenamiento, paquetes', () => {
  test('la suscripción expone plan_id = tier para el código de v1', () => {
    expect(P.suscripcionAV1({ id: 's1', tier: 'pro', status: 'active', provider: 'manual', current_period_end: '2099-01-01', cancel_at_period_end: false })).toMatchObject({ plan_id: 'pro', status: 'active', current_period_end: '2099-01-01', cancel_at_period_end: false });
    expect(P.suscripcionAV1(null)).toBeNull();
  });
  test('el medidor de créditos nunca muestra un total menor que el saldo', () => {
    expect(P.creditosAV1(2262.497, 2262.497, 500)).toMatchObject({ credits_available: 2262.497, credits_total: 2262.497, retenido: 0 });
    expect(P.creditosAV1(100, 150, 500)).toMatchObject({ credits_available: 100, credits_total: 500, retenido: 50 });
    expect(P.creditosAV1(null, null, 0)).toMatchObject({ credits_available: 0, credits_total: 0 });
  });
  test('el almacenamiento suma bytes de todos los proveedores y el tope nulo queda nulo', () => {
    const filas = [{ provider: 'cloudflare_r2', archivos: 90, bytes: 60 * 1024 * 1024 }, { provider: 'supabase', archivos: 1, bytes: 3 * 1024 * 1024 }];
    expect(P.almacenamientoAV1(filas, null)).toEqual({ used_mb: 63, max_mb: null, archivos: 91 });
    expect(P.almacenamientoAV1(filas, 5)).toMatchObject({ max_mb: 5120 });
    expect(P.almacenamientoAV1([], 5)).toMatchObject({ used_mb: 0, archivos: 0 });
  });
  test('un paquete se identifica por su code y lleva su moneda', () => {
    expect(P.paqueteAV1({ code: 'pack_mini', name: 'Mini', credits: 500, amount: 240000, currency: 'COP', valid_days: null })).toMatchObject({ id: 'pack_mini', credits: 500, price: 240000, currency: 'COP', bonus: 0 });
  });
});
