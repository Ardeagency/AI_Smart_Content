# Supabase migrations

Carpeta para versionar el schema vía `supabase` CLI. Actualmente los cambios SQL se aplican ad-hoc por Mgmt API; este folder es el camino oficial para reemplazar ese workflow (OPS-003).

## Setup (una vez por ambiente)

```bash
# 1. Instalar CLI (si aún no está)
brew install supabase/tap/supabase
# o: npm install -g supabase

# 2. Login (usa SUPABASE_ACCESS_TOKEN o pide en browser)
supabase login

# 3. Linkear este repo al proyecto remoto.
#    Pide DB password — la encontrás en Supabase Dashboard → Settings → Database.
supabase link --project-ref tsdpbqcwjckbfsdqacam
```

## Generar baseline (una vez)

Tras `link`, dumpear el schema actual como migración inicial:

```bash
supabase db dump -f supabase/migrations/00000000000000_baseline.sql
git add supabase/migrations/00000000000000_baseline.sql
git commit -m "chore: add Supabase baseline migration"
```

## Workflow de cambios nuevos

```bash
# Crear migración con timestamp
supabase migration new mi_cambio
#   → genera supabase/migrations/<ts>_mi_cambio.sql

# Editar el archivo con tu DDL/funciones/etc.

# Aplicar a remoto
supabase db push
```

## Reglas

- **Una migración = un cambio coherente.** No mezcles "agregar tabla X" con "renombrar columna Y".
- **No editar migraciones aplicadas.** Si necesitas revertir/cambiar, crea una nueva.
- Migraciones acumuladas: las que ya están en `supabase/migrations/` se replicarán al levantar un ambiente nuevo (`supabase db reset`).
- Para SQL ad-hoc (cleanups, backfills puntuales), seguimos usando Mgmt API + `_bak_*` tables — no todo cambio merece migración versionada.

## Estado actual

- ✅ `config.toml` con `project_id = tsdpbqcwjckbfsdqacam`.
- ⏳ Pendiente humano: instalar CLI (`brew install supabase/tap/supabase`) y ejecutar `supabase link` (requiere DB password).
- ⏳ Pendiente: generar baseline tras link.

Ver `docs/task/OPS-003-supabase-cli-migrations.md`.
