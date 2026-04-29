---
id: TEST-001
title: Test suite — foundation con smoke tests de RPCs y endpoints
severity: low
type: test
status: open
created: 2026-04-29
owner: -
---

# TEST-001 · Test suite foundation

## Síntoma

No existe test suite formal en el proyecto. Hay `*.mjs` de diagnóstico ad-hoc en `/root/ai-engine/`:
- `test-adlib-pw.mjs`, `test-adlibrary.mjs`
- `test-brand-content.mjs`, `test-brand-indexer.mjs`, `test-brand-sync.mjs`
- `test-mission-gen.mjs`, `test-threats.mjs`
- `verify-state.mjs`, `final-verify.mjs`, `full-table-audit.mjs`

Son útiles pero no se ejecutan en CI ni hay assertions claras.

## Objetivo del primer sprint de tests

**No** test pyramid completa. Solo **smoke tests** que validen las invariantes críticas:

### 1. RPCs públicas existen y devuelven shape esperado

```js
// test/rpcs.test.js
test('dashboard_mi_marca returns sections', async () => {
  const { data, error } = await supabase.rpc('dashboard_mi_marca', {
    p_org_id: TEST_ORG_ID
  });
  expect(error).toBeNull();
  expect(data).toHaveProperty('header');
  expect(data).toHaveProperty('operatividad');
  // ...
});

test('is_org_member returns boolean', async () => { ... });
test('health_score returns numeric 0-100', async () => { ... });
```

### 2. Endpoints del ai-engine responden

```js
test('GET /server/health returns 200', async () => {
  const r = await fetch(`${AI_ENGINE_URL}/server/health`);
  expect(r.status).toBe(200);
});

test('POST /webhooks/signal rejects without HMAC', async () => {
  const r = await fetch(`${AI_ENGINE_URL}/webhooks/signal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  expect([401, 403]).toContain(r.status);
});
```

### 3. RLS funciona

```js
test('anon cannot SELECT brand_containers', async () => {
  const sb = createClient(URL, ANON_KEY); // sin login
  const { data, error } = await sb.from('brand_containers').select('*');
  expect(data?.length || 0).toBe(0); // RLS lo bloquea
});

test('authenticated user only sees own org', async () => { ... });
```

### 4. Triggers críticos disparan

```js
test('INSERT in intelligence_signals triggers webhook', async () => {
  // Mock del webhook endpoint
  // INSERT signal con service_role
  // Esperar que el mock reciba la POST
});
```

## Stack sugerido

- **Test runner:** Vitest (rápido, ESM nativo) o Node test runner builtin (`node --test`).
- **Assertions:** built-in.
- **Setup:** docker-compose con Supabase local (vía `supabase` CLI) o usar el proyecto remoto con env de test.
- **CI:** GitHub Actions, correr en cada PR a main.

## Pasos

1. Agregar `package.json` al root del repo (si no existe) con `"scripts": { "test": "vitest" }`.
2. Crear `test/` folder con `rpcs.test.js`, `endpoints.test.js`, `rls.test.js`.
3. Setup: `.env.test` con creds de test (org de pruebas).
4. CI: `.github/workflows/test.yml` ejecuta `npm test` en push.

## Criterio de done

- 10+ smoke tests pasan localmente.
- CI verde en al menos 1 PR.
- README del repo menciona cómo correr tests.
- Cualquier futura feature con migración SQL agrega su test.
