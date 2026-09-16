/** MonitoringDataService: social.profiles / intel.signals / social.posts_view / ingest.schedules con la forma de v1. */
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const FUENTE = fs.readFileSync(path.join(process.cwd(), 'js/services/MonitoringDataService.js'), 'utf8');
let M;
beforeAll(() => { globalThis.window = globalThis.window || globalThis; new Function(FUENTE)(); M = globalThis.window.MonitoringDataService; });
describe('Competencia · formas de v1', () => {
  test('un rival de social.profiles sale como entidad con @handle, red y tipo', () => {
    const e = M.perfilAV1({ id: 'p', organization_id: 'o', market_id: 'm', network: 'instagram', source: 'competitor', handle: '@rival', competitor_name: 'Rival', followers: 100, is_active: true, bio: 'por qué' });
    expect(e).toMatchObject({ name: 'Rival', target_identifier: '@rival', brand_container_id: 'm', relevance: 'por qué', handle: 'rival' });
    expect(e.metadata).toMatchObject({ platform: 'instagram', tipo: 'competidor_directo', followers: 100 });
    expect(M.perfilAV1({ id: 'x', source: 'monitored', handle: 'a' }).metadata.tipo).toBe('monitored');
  });
  test('la señal de intel.signals lleva el rival, el tipo y el texto', () => {
    expect(M.senalAV1({ id: 1, kind: 'competitor_move', severity: 'high', title: 'Lanzó', body: 'algo', observed_at: 't', competitor_profile_id: 'p' })).toMatchObject({ entity_id: 'p', signal_type: 'competitor_move', content_text: 'Lanzó — algo', captured_at: 't' });
  });
  test('el post suma el engagement y toma alcance o vistas', () => {
    const p = M.postAV1({ id: 1, network: 'instagram', profile_handle: 'rival', content: 'c', likes: 10, comments_count: 2, shares: 1, saves: 3, views: 500, reach: null, published_at: 't', permalink: 'u', external_id: 'e', tone: 'positivo', topics: ['a'] });
    expect(p).toMatchObject({ engagement_total: 16, reach_total: 500, captured_at: 't', post_id: 'e', tone: 'positivo' });
  });
  test('el análisis se calcula de los posts (hora pico, tonos, temas) y toma el resumen si existe', () => {
    const posts = [{ published_at: '2026-09-10T15:00:00', tone: 'positivo', topics: ['a', 'b'] }, { published_at: '2026-09-11T15:30:00', tone: 'neutro', topics: ['a'] }];
    const a = M.analisisDesdePosts(posts);
    expect(a.total_posts).toBe(2);
    expect(a.peak_posting_hour).toBe(15);
    expect(a.sentiment_distribution).toEqual({ positivo: 1, neutro: 1 });
    expect(a.topic_distribution).toEqual({ a: 2, b: 1 });
    expect(M.analisisDesdePosts(posts, { posts_total: 40, engagement_30d: 3.2 })).toMatchObject({ total_posts: 40, engagement_30d: 3.2 });
  });
  test('la agenda de cosecha se pinta como sensor, activa solo si status active', () => {
    expect(M.agendaAV1({ id: 's', actor_code: 'apify.ig_posts', target: 'rival', interval_minutes: 1440, status: 'paused', paused_reason: 'JC' })).toMatchObject({ sensor_type: 'apify.ig_posts', is_active: false, cadence_value: '1440', paused_reason: 'JC' });
    expect(M.actorPara('tiktok')).toBe('apify.tt_posts');
    expect(M.actorPara('threads')).toBeNull();
  });
});
