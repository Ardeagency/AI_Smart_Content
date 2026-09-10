---
id: OPS-010
title: CI/CD — vitest gate en Netlify pre-deploy + staging branch separado de prod
severity: high
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere coordinar config Netlify + decisión política de branching
est_duration: medium
created: 2026-05-12
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

# CI gates + staging environment

## Contexto

Hoy:
- Auto-deploy desde `main` directo a producción `aismartcontent.io` (Netlify).
- `vitest` existe con smoke tests (`test/endpoints.test.js`, `test/rls.test.js`, `test/rpcs.test.js`) — **no se ejecutan en CI**.
- No hay branch ni domain de staging.
- Push a `main` = exposed a clientes inmediatamente, sin validación automatizada.

Esto rompe en producción a la primera regresión silenciosa (ya pasó con `from('brands')` legacy — ver BUG-005 cerrado).

## Scope

### Fase 1 — CI gate en Netlify

1. **Modificar `netlify.toml`** `[build]`:
   ```toml
   command = "npm test && sed -i 's/__BUILD_ID__/$COMMIT_REF/g' index.html css/bundle.css js/app.js sw.js"
   ```
   Si `npm test` falla → deploy aborta.
2. **Secrets de test en Netlify** — duplicar `SUPABASE_URL_TEST`, `SUPABASE_ANON_KEY_TEST`, `SUPABASE_SERVICE_ROLE_KEY_TEST` apuntando a **proyecto Supabase de staging** (no contamine prod).
3. **`test/setup.js`** ya lee de env — solo asegurar que los nombres `*_TEST` coincidan o renombrar variables.

### Fase 2 — Staging branch + deploy preview

1. Crear branch `staging` en GitHub.
2. Netlify branch deploy: `staging` → `https://staging.aismartcontent.io` (subdominio dedicado, no preview deploy URL fea).
3. Flujo:
   ```
   feature branch → PR → merge a staging → smoke en staging (humano) → merge a main → deploy prod
   ```
4. **Proyecto Supabase staging separado** — clonar schema vivo, datos sintéticos, distinto `SUPABASE_URL`. Hoy todo apunta a `tsdpbqcwjckbfsdqacam` (prod) — staging necesita su propio project ref.

### Fase 3 — PR checks externos (opcional)

- GitHub Actions corriendo `npm test` en cada PR antes de permitir merge a `main`.
- Reglas de branch protection: PR + 1 approval + tests green.

## Criterio de cierre

- [ ] Push a `main` con test rojo NO deploya
- [ ] Staging deploy en `staging.aismartcontent.io` con su propio Supabase
- [ ] Flow documentado en `docs/platform/deploy.md` (crear si no existe)
- [ ] Memoria actualizada: invalidar `project_aismartcontent_deploy` actual que dice "push=deploy directo"

## Notas

- Esto invalida parcialmente la memoria `feedback_auto_push_frontend` ("al cerrar iteración commitear+push a main sin re-preguntar"). Después de OPS-010, el flujo correcto será merge a `staging` primero, validar, luego promover a `main`. Replantear convención cuando se cierre.

---

## Fase 1 HECHA 2026-09-10 — el deploy ya tiene gate

`netlify.toml` corre `npm run test:gate` **antes** de construir. Si un test falla,
el deploy aborta.

### Por qué el gate NO corre los 447 tests

Corre **440**. Se excluyen a propósito `endpoints.test.js`, `rls.test.js` y
`rpcs.test.js`, que salen a la red (ai-engine y Supabase). Colgar cada deploy de
la disponibilidad de un tercero convierte una caída ajena en imposibilidad de
publicar — incluido el hotfix que arreglaría esa caída. Esos tres siguen
corriendo en GitHub Actions, donde fallar no bloquea publicar.

```
"test:gate": "vitest run --exclude '**/endpoints.test.js' --exclude '**/rls.test.js' --exclude '**/rpcs.test.js'"
```

Verificado: 440 pasan en 39s. Los 447 completos también pasan (incluido `rls`,
que es la regresión de seguridad del mismo día).

### Pendiente (Fase 2, y es decisión + acceso externo)

- Branch `staging` + `staging.aismartcontent.io` en Netlify.
- **Proyecto Supabase de staging separado.** Hoy los tests de red corren contra
  **producción** con la llave anon. Funciona porque sólo verifican que un anónimo
  NO pueda leer — pero cualquier test que escriba tendría que ir a staging.
- Ojo con el branching: hoy `main` = auto-deploy y hay regla de autopush. Meter
  protección de rama que exija PR **rompería** ese flujo. Decidir una cosa o la otra.
