---
id: OPS-011
title: RLS hygiene — revisar las 13 tablas con RLS deshabilitado y documentar/activar
severity: medium
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere juicio por tabla (catalog global vs leak potencial)
est_duration: short
created: 2026-05-12
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

# RLS hygiene — 13 tablas sin RLS

## Contexto

Auditoría 2026-05-12 contra `pg_class.relrowsecurity`:

```
_bak_stuck_actions_2026_05_05
_bak_stuck_missions_2026_05_05
classifier_blacklist
commercial_query_qualifiers
country_aliases
emerging_patterns
external_api_cache
intent_classifier_rules
lexicon_enrichment_runs
provocative_brand_exceptions
trend_query_jobs
trends_category_templates
viral_predictions
```

De 134 tablas, 113 tienen RLS + 153 policies. Las 21 con 0 policies coinciden mayormente con las 13 con RLS off + algunas con RLS on pero sin policy (= bloqueadas para anon/authenticated por defecto, OK).

## Acción

Por cada tabla, clasificar y actuar:

| Tabla | Tipo probable | Acción |
|---|---|---|
| `_bak_stuck_actions_2026_05_05`, `_bak_stuck_missions_2026_05_05` | backup temporal (memoria: drop tras 30d desde 2026-05-05) | **DROP** ya pasaron los 30d (vence 2026-06-04, casi) — borrar antes de la fecha si auditoría OK |
| `classifier_blacklist`, `commercial_query_qualifiers`, `intent_classifier_rules`, `country_aliases`, `trends_category_templates`, `provocative_brand_exceptions` | catalog global compartido (read-only para todos) | Documentar como global · **enable RLS + policy `SELECT for authenticated USING (true)`** (no es leak, pero hace explícito) |
| `external_api_cache` | cache compartido | revisar columnas — si tiene `organization_id`, activar RLS; si no, dejar global con SELECT-only |
| `emerging_patterns`, `viral_predictions` | derivados de signals globales | confirmar que no exponen data por org; si sí, RLS por org_id |
| `lexicon_enrichment_runs`, `trend_query_jobs` | logs de jobs internos | si tienen `organization_id` → RLS por org; si son global → restringir a `is_developer()` |

## Criterio de cierre

- [ ] Cada tabla tiene una de tres clasificaciones documentadas en `SQL/security_RLS.sql` o doc nueva: (a) global read-only con RLS enabled, (b) RLS por org, (c) drop
- [ ] 0 tablas con RLS off sin justificación escrita
- [ ] Backups `_bak_stuck_*` borradas si superan los 30 días

## Comando útil de verificación

```sql
SELECT t.table_name, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename=t.table_name) AS policies
FROM information_schema.tables t
JOIN pg_class c ON c.relname=t.table_name
JOIN pg_namespace n ON c.relnamespace=n.oid AND n.nspname='public'
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
ORDER BY rls_enabled, policies, t.table_name;
```
