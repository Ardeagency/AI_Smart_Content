import { describe, test, expect } from 'vitest';
import { AI_ENGINE_URL } from './helpers.js';

describe('ai-engine HTTP endpoints', () => {
  test('GET /server/health returns 200', async () => {
    const r = await fetch(`${AI_ENGINE_URL}/server/health`);
    expect(r.status).toBe(200);
  });

  test('POST /chat without Authorization returns 401', async () => {
    const r = await fetch(`${AI_ENGINE_URL}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organization_id: '00000000-0000-0000-0000-000000000000', message: 'hi' }),
    });
    expect(r.status).toBe(401);
  });

  test('POST /webhooks/signal without HMAC returns 401 or 403', async () => {
    const r = await fetch(`${AI_ENGINE_URL}/webhooks/signal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect([401, 403]).toContain(r.status);
  });
});
