---
id: OPS-003
title: Supabase CLI — instalar + link + baseline
severity: low
type: ops
status: open
auto_eligible: no
auto_eligible_reason: supabase link pide DB password interactiva; supabase CLI no instalado localmente
est_duration: short
created: 2026-04-29
updated: 2026-05-05
owner: -
---

# OPS-003 · Supabase CLI + migraciones versionadas

## Estado actual (2026-05-05)

**Estructura de archivos lista** (ya commiteable):
- `supabase/config.toml` — con `project_id = tsdpbqcwjckbfsdqacam`.
- `supabase/migrations/.gitkeep` — placeholder hasta que se genere el baseline.
- `supabase/README.md` — workflow documentado.
- `.gitignore` actualizado: `.env.test` añadido junto a otros env files.

Falta solo lo interactivo (que requiere humano + DB password).

## Pasos pendientes (humano)

```bash
# 1. Instalar CLI (no está hoy)
brew install supabase/tap/supabase
# o: npm install -g supabase

# 2. Login
supabase login
# usa SUPABASE_ACCESS_TOKEN del navegador o el guardado en ~/.claude/arde-tools/supabase/.env

# 3. Linkear el proyecto remoto
cd "/Users/ardeagency/Documents/ARDE AGENCY/WEB/AI Smart Content"
supabase link --project-ref tsdpbqcwjckbfsdqacam
# Pide DB password — Supabase Dashboard → Settings → Database → "Database password"

# 4. Generar baseline desde el schema actual (~5 segundos)
supabase db dump -f supabase/migrations/00000000000000_baseline.sql

# 5. Commit
git add supabase/
git commit -m "chore(supabase): add CLI config + schema baseline"
```

## Workflow nuevo (post-baseline)

```bash
supabase migration new mi_cambio
# editar el archivo generado en supabase/migrations/<ts>_mi_cambio.sql
supabase db push
```

## Criterio de done

- `supabase/migrations/00000000000000_baseline.sql` existe en el repo.
- `supabase/README.md` apuntado desde `docs/platform/08-deployment.md` como método preferido.
- 1 cambio SQL futuro aplicado vía `supabase migration new` + `supabase db push` (en vez de Mgmt API ad-hoc).
