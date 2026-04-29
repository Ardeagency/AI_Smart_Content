---
id: OPS-003
title: Configurar supabase CLI con migraciones versionadas
severity: low
type: ops
status: open
created: 2026-04-29
owner: -
---

# OPS-003 · Supabase CLI + migraciones versionadas

## Síntoma / riesgo

Hoy aplicamos SQL ad-hoc via Management API. Funciona pero no hay historial estructurado: si la BD se reconstruye desde cero, no hay un orden claro de migraciones.

## Acción

1. Instalar CLI:
   ```bash
   brew install supabase/tap/supabase   # o npm
   ```
2. Login:
   ```bash
   supabase login   # usa el SUPABASE_ACCESS_TOKEN
   ```
3. Linkear el proyecto:
   ```bash
   cd "<repo>"
   supabase link --project-ref tsdpbqcwjckbfsdqacam
   # Pide DB password (la de Settings → Database)
   ```
4. Mover los SQL existentes a `supabase/migrations/`:
   ```
   supabase/migrations/20260429000001_dashboard_mi_marca.sql
   supabase/migrations/20260429000002_scoring_functions.sql
   ...
   ```
5. Generar migración baseline desde el schema actual:
   ```bash
   supabase db dump -f supabase/migrations/00000000000000_baseline.sql
   ```
6. Workflow nuevo:
   ```bash
   supabase migration new mi_cambio
   # editar el archivo generado
   supabase db push
   ```

## Criterio de done

- `supabase` CLI instalado y linkeado.
- Carpeta `supabase/migrations/` con baseline + migraciones nuevas.
- Documentado en `docs/platform/08-deployment.md` como método preferido para nuevos cambios SQL.
