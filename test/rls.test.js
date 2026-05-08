import { describe, test, expect } from 'vitest';
import { anonClient } from './helpers.js';

describe('RLS policies block anonymous reads', () => {
  test('anon cannot SELECT brand_containers', async () => {
    const sb = anonClient();
    const { data } = await sb.from('brand_containers').select('id').limit(1);
    expect(data?.length || 0).toBe(0);
  });

  test('anon cannot SELECT vera_pending_actions', async () => {
    const sb = anonClient();
    const { data } = await sb.from('vera_pending_actions').select('id').limit(1);
    expect(data?.length || 0).toBe(0);
  });

  test('anon cannot SELECT ai_messages', async () => {
    const sb = anonClient();
    const { data } = await sb.from('ai_messages').select('id').limit(1);
    expect(data?.length || 0).toBe(0);
  });

  test('anon RPC dashboard_mi_marca_v2 is forbidden', async () => {
    const sb = anonClient();
    const { error } = await sb.rpc('dashboard_mi_marca_v2', {
      p_org_id: '00000000-0000-0000-0000-000000000000',
      p_window_d: 30,
      p_sections: null,
    });
    expect(error).not.toBeNull();
  });
});
