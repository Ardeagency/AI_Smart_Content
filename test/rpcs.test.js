import { describe, test, expect } from 'vitest';
import { serviceClient, TEST_ORG_ID } from './helpers.js';

const sb = serviceClient();
const skip = sb ? describe : describe.skip;

skip('dashboard RPCs return expected shape', () => {
  test('dashboard_mi_marca_v2 returns 5 sections', async () => {
    const { data, error } = await sb.rpc('dashboard_mi_marca_v2', {
      p_org_id: TEST_ORG_ID,
      p_window_d: 30,
      p_sections: null,
    });
    expect(error).toBeNull();
    expect(data).toHaveProperty('header');
    expect(data).toHaveProperty('formatos');
    expect(data).toHaveProperty('sentiment');
    expect(data).toHaveProperty('vulnerabilidades');
    expect(data).toHaveProperty('historial');
  });

  test('dashboard_tendencias returns 5 sections', async () => {
    const { data, error } = await sb.rpc('dashboard_tendencias', {
      p_org_id: TEST_ORG_ID,
      p_window_d: 30,
      p_sections: null,
    });
    expect(error).toBeNull();
    expect(data).toHaveProperty('header');
    expect(data).toHaveProperty('senales_emergentes');
    expect(data).toHaveProperty('contexto_real');
    expect(data).toHaveProperty('algoritmico');
    expect(data).toHaveProperty('estetica');
  });

  test('dashboard_competencia_kpis returns numeric KPIs', async () => {
    const { data, error } = await sb.rpc('dashboard_competencia_kpis', {
      p_org_id: TEST_ORG_ID,
      p_date_from: new Date(Date.now() - 30 * 86400000).toISOString(),
      p_date_to: new Date().toISOString(),
      p_entity_ids: null,
    });
    expect(error).toBeNull();
    expect(data).toHaveProperty('total_competitors');
    expect(typeof data.total_competitors).toBe('number');
  });

  test('health_score function returns numeric 0-100', async () => {
    const { data, error } = await sb.rpc('health_score', { p_org_id: TEST_ORG_ID });
    expect(error).toBeNull();
    expect(typeof data).toBe('number');
    expect(data).toBeGreaterThanOrEqual(0);
    expect(data).toBeLessThanOrEqual(100);
  });
});
