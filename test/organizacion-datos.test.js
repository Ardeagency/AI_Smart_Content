/**
 * OrganizacionDataService: la traducción de la base nueva a lo que /organization
 * pinta (General · Miembros · Suscripción · Uso · Seguridad). Contrato de BD
 * (organizacion.md, 150000/190000) medido el 16/09.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/OrganizacionDataService.js'), 'utf8');
let O;

beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  new Function(FUENTE)();
  O = globalThis.window.OrganizacionDatos.mapeo;
});

describe('Organización · filas', () => {
  test('organizations: owner_id es owner_user_id y archived_at es deleted_at para la vista', () => {
    expect(O.organizacionAV1({ id: 'o', name: 'W', owner_id: 'u1', archived_at: null, timezone: 'America/Bogota', locale: 'es', mfa_required: true, plan: 'pro' }))
      .toMatchObject({ owner_user_id: 'u1', deleted_at: null, timezone: 'America/Bogota', mfa_required: true, plan: 'pro' });
  });
  test('equipo: el id del miembro es su user_id y los permisos son literales', () => {
    const m = O.miembroAV1({ user_id: 'u1', email: 'a@b.c', full_name: 'Ana', role: 'admin', permissions: ['ver_marca', 'editar_equipo'], joined_at: 't', ultimo_acceso: 'u' });
    expect(m).toMatchObject({ id: 'u1', role: 'admin', full_name: 'Ana', created_at: 't', ultimo_acceso: 'u' });
    expect(m.permisos).toEqual(['ver_marca', 'editar_equipo']);
  });
  test('centro de control: elements por kind y corridas', () => {
    expect(O.conteos([{ kind: 'product' }, { kind: 'product' }, { kind: 'scenario' }, { kind: 'identity' }, { kind: 'character' }, { kind: 'service' }], 4))
      .toEqual({ identities: 1, products: 2, services: 1, places: 1, characters: 1, productions: 4 });
  });
  test('alerta: severidad del tipo, leída si tiene read_at, acción si trae link', () => {
    const a = O.alertaAV1({ id: 1, type_code: 'ops.job_dead', title: 'Murió', body: 'x', link: null, read_at: null, created_at: 't' }, { 'ops.job_dead': { severity: 'error' } });
    expect(a).toMatchObject({ severity: 'error', status: 'unread', action_url: null });
    expect(O.alertaAV1({ id: 2, type_code: 'x', link: '/a', read_at: 'r' }, {})).toMatchObject({ severity: 'info', status: 'read', action_label: 'Ver' });
  });
});

describe('Organización · uso (billing.usage_records)', () => {
  test('el área sale del meter_code', () => {
    expect(O.areaDeMedidor('image.nano_banana_pro')).toBe('imagenes');
    expect(O.areaDeMedidor('video.seedance_2_fast')).toBe('videos');
    expect(O.areaDeMedidor('llm.opus_in')).toBe('vera');
    expect(O.areaDeMedidor('llm.simular')).toBe('simulador');
    expect(O.areaDeMedidor('llm.analisis')).toBe('analisis');
    expect(O.areaDeMedidor('scrape.run')).toBe('busqueda');
    expect(O.areaDeMedidor('legacy.apify_scrape')).toBe('busqueda');
    expect(O.areaDeMedidor('flow.fixed_credit')).toBe('flujos');
    expect(O.areaDeMedidor('storage.day')).toBe('ajustes');
  });
  test('un registro es un consumo (delta negativo) con su USD y su autor', () => {
    const m = O.movimientoAV1({ id: 1, meter_code: 'image.flux_pro', credits_charged: 0.09, provider_cost: 0.09, provider_currency: 'USD', occurred_at: '2026-09-10T10:00:00Z', user_id: 'u1', quantity: 1 });
    expect(m).toMatchObject({ kind: 'image.flux_pro', credits_delta: -0.09, usd_cost: 0.09, created_at: '2026-09-10T10:00:00Z' });
    expect(m.metadata.user_id).toBe('u1');
  });
  test('la agregación separa periodo y periodo anterior, apila por área y por miembro, y proyecta el agotamiento', () => {
    const desde = new Date('2026-09-08T00:00:00Z'); const hasta = new Date('2026-09-10T00:00:00Z');
    const mov = (dia, kind, cr, uid) => O.movimientoAV1({ meter_code: kind, credits_charged: cr, provider_cost: cr, provider_currency: 'USD', occurred_at: `${dia}T12:00:00Z`, user_id: uid });
    const u = O.usoDesde([mov('2026-09-06', 'image.flux_pro', 2, 'a'), mov('2026-09-08', 'image.flux_pro', 1, 'a'), mov('2026-09-09', 'llm.opus_in', 3, null)], desde, hasta, 40);
    expect(u.days).toBe(3);
    expect(u.total).toBe(4);
    expect(u.previo).toBe(2);
    expect(u.variacion).toBe(100);
    expect(u.byArea).toEqual({ imagenes: 1, vera: 3 });
    expect(u.byDay.map((d) => d.total)).toEqual([1, 3, 0]);
    expect(u.topAreaKey).toBe('vera');
    expect(u.porMiembro.map((m) => m.uid)).toEqual(['__auto__', 'a']);
    expect(u.seAgotan).toBeInstanceOf(Date);
    expect(u.movimientos[0].kind).toBe('llm.opus_in');
  });
});

describe('Organización · resumen, bitácora y ficha', () => {
  test('resumen_de_marca → plan, créditos, vigilancia y pauta por moneda', () => {
    const r = O.resumenAV1({
      creditos: { balance: 2262, disponible: 2262, retenido: 0, consumido_periodo: 738, tope_mensual: 3000 },
      audiencias: { total: 3, observadas: 1 },
      vigilancia: { perfiles_propios: 2, perfiles_rivales: 5, terminos: 4, agendas_activas: 0, agendas_pausadas: 35 },
      estrategias: { planes_activos: 1, lecturas_sin_actuar: 7 },
      pauta: [{ currency: 'COP', campanas_activas: 2, campanas_pausadas: 1, gastado_30d: 500000 }, { currency: 'USD', campanas_activas: 0, campanas_pausadas: 1, gastado_30d: 12 }],
    }, { name: 'Pro', credits_monthly: 3000 }, [{ id: 'm' }]);
    expect(r.plan).toEqual({ nombre: 'Pro', creditosMes: 3000 });
    expect(r.creditos).toMatchObject({ total: 3000, usados: 738, disponibles: 2262, pctUsado: 25 });
    expect(r.vigilancia.total).toBe(7);
    expect(r.estrategias.total).toBe(1);
    expect(r.pauta.campanas).toEqual({ total: 4, activas: 2, pausadas: 2 });
    expect(r.pauta.gastoPorMoneda).toEqual({ COP: 500000, USD: 12 });
    expect(O.resumenAV1(null)).toBeNull();
  });
  test('historial_de_marca → evento con actor, etiqueta y sujeto', () => {
    expect(O.eventoAV1({ cuando: 't', tipo: 'marca', accion: 'guardar_ficha', detalle: 'NIT', actor_kind: 'persona', actor_id: 'u1', actor: 'Ana', sujeto_tabla: 'customers', sujeto_id: '12345678-x' }))
      .toMatchObject({ userId: 'u1', actor: 'Ana', etiqueta: 'guardar_ficha', detalle: 'NIT', sujeto: 'customers 12345678', fecha: 't' });
  });
  test('la ficha va y vuelve con las 12 columnas de billing.customers, recortando y vaciando a null', () => {
    expect(Object.keys(O.fichaAV1(null))).toHaveLength(12);
    expect(O.fichaABase({ legal_name: ' Wakeup SAS ', tax_id: '', country: 'CO', ajeno: 1 })).toEqual({ legal_name: 'Wakeup SAS', tax_id: null, country: 'CO' });
  });
});
