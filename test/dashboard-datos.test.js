/**
 * DashboardDataService: los mapeos puros a la forma de v1 (lo que pintaban los mixins viejos)
 * y la regla «vista sin aplicar ⇒ todavía no» (nunca un error que tumbe la pestaña).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/DashboardDataService.js'), 'utf8');
let D; let M;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); D = globalThis.window.DashboardDatos; M = D.mapeo; });

describe('Tablero · ventanas y cubetas', () => {
  test('la ventana se ancla a la última fecha con datos (v1): «Semana» no sale vacía', () => {
    expect(M.rangoDeVentana('week', { ultima: '2026-08-31', hoy: new Date('2026-09-25T12:00:00Z') })).toEqual({ desde: '2026-08-25', hasta: '2026-08-31' });
    expect(M.rangoDeVentana('month', { ultima: '2026-08-31', hoy: new Date('2026-09-25T12:00:00Z') })).toEqual({ desde: '2026-08-02', hasta: '2026-08-31' });
    expect(M.rangoDeVentana('all', { ultima: '2026-08-31', hoy: new Date('2026-09-25T12:00:00Z') })).toEqual({ desde: null, hasta: '2026-08-31' });
    // Sin datos: hoy. Personalizado: tal cual, sin anclar.
    expect(M.rangoDeVentana('week', { hoy: new Date('2026-09-25T12:00:00Z') })).toEqual({ desde: '2026-09-19', hasta: '2026-09-25' });
    expect(M.rangoDeVentana('custom', { desde: '2026-07-01', hasta: '2026-07-15', ultima: '2026-08-31' })).toEqual({ desde: '2026-07-01', hasta: '2026-07-15' });
  });
  test('grano: día hasta dos meses, mes hasta tres años, año más allá', () => {
    expect(M.granoDe('2026-08-02', '2026-08-31')).toBe('dia');
    expect(M.granoDe('2025-09-01', '2026-08-31')).toBe('mes');
    expect(M.granoDe(null, '2026-08-31')).toBe('mes');
    expect(M.granoDe('2020-01-01', '2026-08-31')).toBe('anio');
    expect(M.cubetas('2025-11-15', '2026-02-02', 'mes').map((c) => c.clave)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    expect(M.etiquetaDe('2026-08-27', 'dia')).toBe('27 ago');
    expect(M.etiquetaDe('2026-08-27', 'dia', 'en')).toBe('Aug 27');
  });
});

describe('Tablero · Tráfico e Interacciones (social.actividad_diaria)', () => {
  const filas = [
    { fecha: '2026-08-29', network: 'instagram', publicaciones: 2, interacciones: 120 },
    { fecha: '2026-08-29', network: 'tiktok', publicaciones: 1, interacciones: 900 },
    { fecha: '2026-08-31', network: 'instagram', publicaciones: 1, interacciones: 40 },
    { fecha: '2026-07-01', network: 'facebook', publicaciones: 5, interacciones: 5 }, // fuera de la ventana
  ];
  test('Tráfico: barras apiladas por red, una cubeta por día sin huecos, total y días desde la última', () => {
    const a = M.traficoAV1(filas, { desde: '2026-08-29', hasta: '2026-08-31', hoy: new Date('2026-09-03T12:00:00Z') });
    expect(a.total).toBe(4);
    expect(a.days_since).toBe(3);
    expect(a.series.map((s) => s.label)).toEqual(['29 ago', '30 ago', '31 ago']);
    expect(a.series[0].networks).toEqual({ instagram: 2, tiktok: 1 });
    expect(a.series[1].networks).toEqual({});
  });
  test('Tráfico sin publicaciones en la ventana → sin series (la vista dice «sin publicaciones»)', () => {
    expect(M.traficoAV1([], { desde: '2026-08-29', hasta: '2026-08-31' }).series).toEqual([]);
  });
  test('Interacciones: una fila por cubeta con interacciones, en orden', () => {
    const i = M.interaccionesAV1(filas, { desde: '2026-08-29', hasta: '2026-08-31' });
    expect(i).toEqual([
      { period_start: '2026-08-29', period_end: '2026-08-30', period_label: '29 ago', total_engagement: 1020 },
      { period_start: '2026-08-31', period_end: '2026-09-01', period_label: '31 ago', total_engagement: 40 },
    ]);
  });
});

describe('Tablero · publicaciones y comentarios (social.posts_view, social.comments)', () => {
  test('la fila de posts_view sale con la forma de brand_posts: métricas, media, interacción (el alcance no rankea)', () => {
    const p = M.postAV1({ id: 'p', network: 'instagram', external_id: '39', content: 'Hola', media: { archived_url: 'https://media/x.jpg' }, published_at: '2026-08-20T15:00:00Z', profile_handle: 'wakeup', likes: 10, comments_count: 2, shares: 1, saves: 3, views: 900, interacciones: 16, alcance: 900, followers_at_post: '5000' });
    expect(p).toMatchObject({ post_id: '39', media_assets: { archived_url: 'https://media/x.jpg' }, metrics: { likes: 10, comments: 2, shares: 1, saves: 3, views: 900 }, engagement_total: 16, alcance: 900, followers_snapshot: 5000, vera_por_que: null });
    expect(M.postAV1({ id: 'q', likes: 1, comments_count: null, media: null }).engagement_total).toBe(1);
  });
  test('comentario: likes y sentimiento solo si ya se analizó (nunca inventado)', () => {
    expect(M.comentarioAV1({ author_handle: 'ana', content: 'x', likes: 4, sentiment: 'positive' })).toEqual({ author_handle: 'ana', content: 'x', metrics: { likes: 4 }, sentiment: 'POS' });
    expect(M.comentarioAV1({ author_name: 'Ana', content: 'x', likes: null, sentiment: null }).sentiment).toBeNull();
  });
});

describe('Tablero · competencia', () => {
  const filas = [
    { fecha: '2026-08-10', network: 'instagram', profile_id: 'a1', competitor_name: '@SoyTosh', marca_clave: 'soytosh', publicaciones: 3, interacciones: 300, seguidores: 10000 },
    { fecha: '2026-08-11', network: 'tiktok', profile_id: 'a2', competitor_name: '@soytosh', marca_clave: 'soytosh', publicaciones: 1, interacciones: 900, seguidores: null },
    { fecha: '2026-08-11', network: 'instagram', profile_id: 'b1', competitor_name: '@paranice_', marca_clave: null, publicaciones: 2, interacciones: 50, seguidores: null },
  ];
  test('marca_clave normaliza handles (@SoyTosh / @soytosh, sufijo «_») como la vista', () => {
    expect(M.marcaClaveDe('@paranice_')).toBe('paranice');
    expect(M.marcaClaveDe('@SoyTosh')).toBe('soytosh');
  });
  test('Influencia digital: una fila por marca con sus redes, perfiles, posts e interacciones por 1.000 seguidores', () => {
    const m = M.marcasCompetenciaAV1(filas);
    expect(m.map((x) => x.brand_key)).toEqual(['soytosh', 'paranice']);
    expect(m[0]).toMatchObject({ entity_ids: ['a1', 'a2'], total_posts: 4, total_engagement: 1200, top_platform: 'tiktok', followers_total: 10000, eng_per_1k_followers: 120, tipo: null });
    expect(m[0].profiles).toEqual([{ platform: 'tiktok', engagement: 900 }, { platform: 'instagram', engagement: 300 }]);
    expect(m[1]).toMatchObject({ brand_name: 'paranice_', followers_total: null, eng_per_1k_followers: null });
  });
  test('panel de la marca: totales, reparto por red y el historial diario', () => {
    const d = M.detalleMarcaAV1([
      { fecha: '2026-08-10', network: 'instagram', handle: 'soytosh', publicaciones: 3, interacciones: 300, likes: 250, comentarios: 30, compartidos: 10, guardados: 10, vistas: 4000 },
      { fecha: '2026-08-11', network: 'tiktok', handle: 'soytosh', publicaciones: 1, interacciones: 100, likes: 100, vistas: 9000 },
    ], [{ id: 'p1', likes: 5 }]);
    expect(d.totals).toMatchObject({ posts: 4, interacciones: 400, views: 13000, plays: 13000 });
    expect(d.by_platform[0]).toMatchObject({ platform: 'instagram', share_pct: 75 });
    expect(d.daily).toHaveLength(2);
    expect(d.posts[0].engagement_total).toBe(5);
  });
  test('anuncio del rival: targeting de v1, marca sin @ y si sigue corriendo', () => {
    expect(M.anuncioRivalAV1({ id: 'x', marca: '@Grano', copy: 'Hola', cta: 'Comprar', formato: 'IMAGE', plataformas: ['facebook'], url_biblioteca: 'https://fb/ads', sigue_corriendo: true })).toMatchObject({
      copy_text: 'Hola', targeting: { cta_text: 'Comprar', display_format: 'IMAGE', publisher_platforms: ['facebook'], ad_library_url: 'https://fb/ads' }, intelligence_entities: { name: 'Grano' }, sigue_corriendo: true,
    });
  });
});

describe('Tablero · pauta propia', () => {
  test('campaña: ctr/roas/conversiones de campanas_rendimiento con los nombres de v1', () => {
    expect(M.campanaAV1({ id: 'c', nombre: 'Preventa', platform_objective: 'OUTCOME_SALES', ctr: '1.9', roas: '4.2', conversiones: 86, clics: 1300, gasto: '640000', moneda: 'COP' })).toMatchObject({ nombre_campana: 'Preventa', platform_objective: 'OUTCOME_SALES', cached_ctr: 1.9, cached_roas: 4.2, cached_conversions: 86, cached_spend: 640000, moneda: 'COP' });
  });
  test('anuncio: el estado fino de Meta manda; gasto nulo (monedas mezcladas) no se vuelve 0', () => {
    const a = M.anuncioAV1({ id: 'a', nombre: 'N', estado: 'paused', estado_meta: 'CAMPAIGN_PAUSED', copy: 'C', destino: 'https://x', creado: '2026-08-01', gasto: '410000', impresiones: 1000, clics: 20, ctr: '2', moneda: 'COP' });
    expect(a).toMatchObject({ status: 'CAMPAIGN_PAUSED', copy_text: 'C', link_url: 'https://x', perf: { gasto: 410000, impresiones: 1000, clics: 20, ctr: 2, moneda: 'COP' } });
    expect(M.anuncioAV1({ id: 'b', estado: 'active' }).status).toBe('ACTIVE');
    expect(M.anuncioAV1({ id: 'c', estado: 'active', gasto: null, impresiones: null }).perf).toBeNull();
  });
});

describe('Tablero · tendencias, frescura y el pulso de Vera', () => {
  test('océano: intención por demand_score (≥ 0,8 alta · ≥ 0,5 media · baja)', () => {
    expect(M.oceanoAV1({ id: 'g', phrase: 'Café sin amargo', angle: 'A', demand_terms: ['x'], demand_score: '0.95' })).toEqual({ id: 'g', gap_phrase: 'Café sin amargo', angle: 'A', intent: 'alta', demand_terms: ['x'] });
    expect(M.oceanoAV1({ id: 'h', phrase: 'p', demand_score: 0.6 }).intent).toBe('media');
    expect(M.oceanoAV1({ id: 'i', phrase: 'p', demand_score: 0.1 }).intent).toBe('baja');
  });
  test('fecha: sin veredicto de Vera no se inventa uno; internacional ⇒ globo', () => {
    expect(M.fechaAV1({ fecha: '2026-10-12', nombre: 'Día de la Raza', motivo: 'M', veredicto: null, alcance: 'CO' })).toEqual({ event_date: '2026-10-12', event_name: 'Día de la Raza', event_description: 'M', raw_data: { verdict: '', scope: 'co' } });
    expect(M.fechaAV1({ fecha: '2026-10-01', nombre: 'Café', veredicto: 'Utilizar', alcance: 'international' }).raw_data).toEqual({ verdict: 'utilizar', scope: 'international' });
  });
  test('frescura: la forma de v1 más si la cosecha está encendida', () => {
    expect(M.frescuraAV1({ posts_propios_ult: '2026-08-31T10:00:00Z', posts_rivales_ult: '2026-08-21T10:00:00Z', ultima_cosecha_ok: '2026-08-21T11:00:00Z', agendas_activas: 0, agendas_pausadas: 24 })).toEqual({ own_posts: '2026-08-31T10:00:00Z', competitor_posts: '2026-08-21T10:00:00Z', latest: '2026-08-21T11:00:00Z', agendas_activas: 0, agendas_pausadas: 24 });
    expect(M.frescuraAV1(null)).toBeNull();
  });
  test('pulso: el código del sensor elige la frase; la entidad nunca se trata como rival sin saberlo', () => {
    expect(M.pulsoAV1({ activa: true, tipo: 'cosecha', paso: 'social', entidad: '@soytosh', desde: 'd', ultimo_cuando: 'u' })).toEqual({ activa: true, tipo: 'social', clase: 'cosecha', entidad: { nombre: 'soytosh', tipo: null }, desde: 'd', paso: 'social', ultimo: { cuando: 'u' } });
    expect(M.pulsoAV1(null).activa).toBe(false);
  });
  test('bitácora: filas de v1, la más reciente primero, con las cifras que trajo', () => {
    const b = M.bitacoraAV1([
      { tipo: 'cosecha', que: 'social', objetivo: '@x', estado: 'succeeded', items_in: 12, items_new: 0, ms: 900, cuando: '2026-09-25T10:00:00Z' },
      { tipo: 'herramienta', que: 'getBrand', estado: 'succeeded', ms: 50, cuando: '2026-09-25T11:00:00Z' },
    ]);
    expect(b.map((x) => x.tipo)).toEqual(['getBrand', 'social']);
    expect(b[1]).toMatchObject({ entidad: 'x', stats: { posts_found: 12 }, duracion_ms: 900, inicio: '2026-09-25T10:00:00Z' });
  });
});

describe('Tablero · lecturas, integraciones y la regla «todavía no»', () => {
  test('lectura: de la vista P1 o del sobre de marketing.readings, la misma forma', () => {
    const cards = { schema: 'cards.v2', cards: [{ type: 'intuicion' }] };
    expect(M.lecturaAV1({ id: 'r', created_at: 'c', scope: 'mi_marca', schema_version: 2, periodo: 'month', lectura: cards })).toMatchObject({ reading: cards, periodo: 'month', schema_version: 2 });
    expect(M.lecturaAV1({ id: 'r', created_at: 'c', evidence: { scope: 'mi_marca', schema_version: '2', periodo: 'week', reading: cards, lectura_v1: true } })).toMatchObject({ reading: cards, periodo: 'week', scope: 'mi_marca', schema_version: 2, heredada_v1: true });
    expect(M.lecturaAV1({ id: 'r', evidence: { scope: 'x' } })).toBeNull();
    expect(M.lecturaAV1(undefined)).toBeNull();
  });
  test('burbujas: solo conexiones activas; meta ⇒ Instagram y Facebook', () => {
    expect(M.plataformasAV1([{ platform: 'mercadolibre', status: 'expired' }])).toEqual([]);
    expect(M.plataformasAV1([{ platform: 'shopify', status: 'active' }, { platform: 'meta', status: 'active' }])).toEqual(['instagram', 'facebook', 'shopify']);
  });
  test('vista o columna que no existe = «todavía no» (no un error); permiso y el resto se distinguen', () => {
    for (const code of ['42P01', '42703', 'PGRST205', 'PGRST204']) expect(M.faltaDe({ code })).toBe('vista');
    expect(M.faltaDe({ code: '42501' })).toBe('permiso');
    expect(M.faltaDe({ code: '500' })).toBe('error');
    expect(M.faltaDe(null)).toBeNull();
  });
  test('una lectura sin la vista aplicada cae a «vista» sin lanzar; con datos devuelve la forma de v1', async () => {
    const cadena = (resultado) => {
      const q = { select: () => q, eq: () => q, in: () => q, is: () => q, gte: () => q, lte: () => q, lt: () => q, order: () => q, limit: () => Promise.resolve(resultado), maybeSingle: () => Promise.resolve(resultado) };
      return q;
    };
    const sb = { schema: () => ({ from: (t) => cadena(t === 'actividad_diaria' ? { data: null, error: { code: 'PGRST205', message: 'no existe' } } : { data: [{ phrase: 'x', demand_score: 0.9, id: '1' }], error: null }) }), from: () => cadena({ data: null, error: null }) };
    D._inyectarCliente(sb);
    const t = await D.trafico('org', { desde: '2026-08-01', hasta: '2026-08-31' });
    expect(t).toMatchObject({ falta: 'vista', vista: 'social.actividad_diaria' });
    const o = await D.oceanos('org');
    expect(o).toMatchObject({ falta: null, datos: [{ gap_phrase: 'x', intent: 'alta' }] });
    D._inyectarCliente(null);
  });
});
