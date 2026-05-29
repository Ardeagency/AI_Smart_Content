# FEAT-035 — Migracion de roles y permisos (alineacion BD ↔ frontend)

**Fecha:** 2026-05-29
**Proyecto Supabase:** `tsdpbqcwjckbfsdqacam` (AI_SmartContent)
**Origen:** auditoria via Management API en sesion con el Lead

## Problema

El frontend (`js/utils/capabilities.js`, `js/services/DevRankTheme.js`) define
6 roles de organizacion y 6 ranks de developer. La BD esta desalineada:

| Concepto | Frontend (canonico) | BD (actual) | Drift |
|---|---|---|---|
| organization_members.role | owner / admin / editor / creator / vera_user / viewer | TEXT libre, sin CHECK, default `'admin'` | Acepta cualquier string |
| organization_invitations.role | mismos 6 | CHECK: admin / member / viewer | Bloquea editor/creator/vera_user/owner |
| profiles.dev_role | lead / senior / contributor / viewer | TEXT (enum existe pero no atado) | Drift posible |
| developer_rank_type (enum PG) | rookie / junior / builder / expert / master / legend | novice / maker / master / legend | 2 valores viejos no usados, faltan 4 |
| profiles.dev_rank | mismos 6 | TEXT (no enum) | Drift posible |

Ademas el unico `organization_members` actual (founder de IGNIS) tiene
`role='admin'` cuando semanticamente es `owner`.

## Cambios DDL

### A) Enum nuevo `organization_member_role`
```sql
CREATE TYPE organization_member_role AS ENUM (
  'owner', 'admin', 'editor', 'creator', 'vera_user', 'viewer'
);
```

### B) Backfill antes de cambiar tipo
```sql
UPDATE organization_members SET role = 'owner' WHERE role = 'admin';
```

### C) Drop RLS policies que comparan role::text
Estas se recrean despues del ALTER:
- `organization_members."Org owner or admin delete members"`
- `organization_members."Org owner or admin update members"`

### D) ALTER columnas
- `organization_members.role` text → `organization_member_role`, default `'viewer'`
- `organization_invitations.role` text → `organization_member_role` (drop CHECK viejo)
- `profiles.dev_role` text → `developer_role_type`
- `profiles.dev_rank` text → `developer_rank_type` (nuevo)
- `developer_stats.current_rank` USER-DEFINED → nuevo enum

### E) Recrear `developer_rank_type` con 6 valores
```
old: novice / maker / master / legend
new: rookie / junior / builder / expert / master / legend
```
Estrategia: rename a `_old`, crear nuevo, ALTER columnas con CAST/mapeo
(`novice→rookie`, `maker→builder`), DROP `_old`.

### F) Recrear vista `v_profiles_humans`
Definicion identica pero los nuevos tipos enum se promueven al SELECT.

### G) Recrear las 2 RLS policies con casts a enum

## Backfill de datos
- 1 org_member: `admin` → `owner` (founder IGNIS)
- 1 profiles row: `dev_rank='legend'` ya valido en nuevo enum, no cambia

## Cambios en frontend (post-migracion)
- `js/services/AuthService.js:165` — fallback `'novice'` → `'rookie'`
- `js/utils/capabilities.js` — ya define los 6 roles correctos, no requiere cambio
- `js/services/DevRankTheme.js` — ya usa los 6 ranks correctos

## Riesgos
- RLS policies recreadas: misma logica, distinto cast. Verificar permisos
  DELETE/UPDATE en organization_members con un test post-migracion.
- Datos: solo 1 org, 1 user, 1 member. Riesgo de perdida ≈ 0.
- Views/RPCs: `v_profiles_humans` recreada con misma forma.

## Rollback
- ALTER columns back to TEXT
- Recreate CHECK constraint on organization_invitations
- DROP enum organization_member_role
- Re-add 'novice','maker' to developer_rank_type via DROP+CREATE inverso
