# Tests — AI Smart Content

Smoke tests con Vitest contra el proyecto Supabase y el ai-engine público.

## Setup

```bash
npm install
cp .env.test.example .env.test
# editar .env.test con SUPABASE_URL, SUPABASE_ANON_KEY, opcionalmente SUPABASE_SERVICE_ROLE_KEY
```

## Correr

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

## Qué cubren

- `endpoints.test.js` — health del ai-engine y rechazo sin auth (200, 401, 403). No requiere service role.
- `rls.test.js` — anon client NO ve filas en tablas RLS-protegidas (brand_containers, vera_pending_actions, ai_messages) ni puede ejecutar el RPC `dashboard_mi_marca_v2` (`is_org_member` lo bloquea).
- `rpcs.test.js` — shape de RPCs principales (`dashboard_mi_marca_v2`, `dashboard_tendencias`, `dashboard_competencia_kpis`, `health_score`). Solo corren si `SUPABASE_SERVICE_ROLE_KEY` está definido — el service role bypassa RLS para verificar contratos.

## Qué NO cubren (todavía)

- Tests autenticados con un usuario real (requeriría TEST_USER_EMAIL/PASSWORD en `.env.test`).
- Triggers de `intelligence_signals → webhook → body_missions` (requeriría mocking del webhook).
- Frontend (no hay test runner en browser configurado).

## CI

`.github/workflows/test.yml` (pendiente) debería:
- correr `npm install` + `npm test`
- usar secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TEST_ORG_ID`
- gatillar en push a `main` y en PRs.
