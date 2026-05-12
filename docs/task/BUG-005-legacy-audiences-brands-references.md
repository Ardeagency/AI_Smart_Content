---
id: BUG-005
title: Frontend consulta tablas legacy `audiences` y `brands` (drop incompleto)
severity: high
type: bug
status: nearly-done
auto_eligible: yes
auto_eligible_reason: refactor mecánico de queries; el mapeo nuevo está claro y verificable contra schema vivo
est_duration: medium
created: 2026-05-11
owner: -
---

# BUG-005 · Referencias huérfanas a `audiences` y `brands` en el frontend

> **Estado 2026-05-12:** criterio de done cumplido en working tree
> (`grep -rn "\.from('audiences'\|\.from('brands'" js/` → 0 matches).
> Solo falta commit del WIP del user. Eliminar este archivo cuando el WIP entre a main.

## Síntoma (histórico)

El frontend hacía queries a dos tablas que **ya no existen** en Supabase:

- `public.audiences` — reemplazada por `public.audience_personas` (FK directa a `brand_containers.id` vía `brand_container_id`).
- `public.brands` — tabla intermedia eliminada; la cadena vieja era `brand_containers → brands(via project_id) → audiences(via brand_id)`. Ahora `brand_containers ← audience_personas` directo.

Las llamadas a `.from('audiences')` y `.from('brands')` retornaban 4xx desde PostgREST; el frontend lo tragaba en `try/catch` → `return []` → features con datos vacíos sin avisar al usuario.

## Sitios afectados — estado actual

### 1. `js/views/TasksView.js` — ✅ resuelto en WIP del user (no committed)

Cambios visibles en working tree:
- `from('audiences')` → `from('audience_personas')` con `audience_ids[]` (compat legacy en lectura).
- `from('brands')` → `from('brand_containers')` directo (sin paso intermedio `brand_projectMap`).
- Save de schedules ahora escribe `persona_id` (FK real) y `campaign_id` (FK real) además de los arrays legacy `audience_ids[]`/`campaign_ids[]`.
- Dropdown de marcas reemplazado: usa el container actual en vez de query a tabla `brands`.

### 2. `js/views/StudioView.js` — ✅ resuelto en WIP del user (no committed)

`loadAudiences(brandContainerId)` colapsado a una sola query a `audience_personas` con `brand_container_id`. Sin paso intermedio por `brands`.

### 3. `js/views/VideoView.js` — ✅ resuelto y committed 2026-05-12

Commit `18eee5d`. Resuelto junto con BUG-006 (campaign_briefs embed) porque ambas queries vivían en el mismo `Promise.all` de `loadBrandData`.

### 4. `js/living.js` — ✅ resuelto en WIP del user (no committed)

`loadBrandId()` ahora retorna `this.brandContainerId` directamente. Sin query a `brands`. El comentario en código explica que el modelo nuevo elimina la tabla intermedia.

### 5. `js/views/DevTestView.js` — ✅ resuelto y committed 2026-05-12

`loadFallbackBrandColors` (~L735) consultaba `brands` para joinear a `brand_colors.brand_id`. Pero `brand_colors` usa `organization_id`, no `brand_id`. Fix: colapsar a una sola query con `brand_containers.organization_id` y `.eq('organization_id', ...)` directo a `brand_colors`.

## Mapeo legacy → nuevo schema (referencia)

| Tabla / Columna legacy                          | Equivalente actual                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `audiences`                                     | `audience_personas`                                                    |
| `audiences.brand_id`                            | `audience_personas.brand_container_id`                                 |
| `audiences.{name,description,estilo_lenguaje}` | `audience_personas.{name,description,estilo_lenguaje}` (mismos nombres) |
| `brands` (tabla intermedia)                     | eliminada — usar `brand_containers` directo                            |
| `brands.project_id`                             | `brand_containers.id`                                                  |
| `brand_colors.brand_id`                         | `brand_colors.organization_id`                                         |
| `flow_schedules.brand_id`                       | sin FK — campo legacy; el FK real es `persona_id` y `campaign_id`      |
| `flow_schedules.audience_ids[]`                 | sin FK — campo legacy; usar `persona_id` (singular)                    |

## FKs reales en `flow_schedules` (verificado 2026-05-12)

```
brief_id        → campaign_briefs(id)  ON DELETE SET NULL
campaign_id     → campaigns(id)        ON DELETE SET NULL
flow_id         → content_flows(id)
organization_id → organizations(id)
persona_id      → audience_personas(id) ON DELETE SET NULL
user_id         → profiles(id)
```

Las columnas `brand_id`, `audience_ids[]`, `entity_ids[]`, `campaign_ids[]` siguen existiendo en la tabla pero **sin FK constraint** — son legacy/data residual y no deben usarse para nuevas escrituras.

## Criterio de done

- [x] `grep -rn "\.from('audiences'\|\.from('brands'" js/` retorna 0 matches.
- [x] Save de tareas escribe a `persona_id`/`campaign_id` (FKs reales) además de los arrays legacy.
- [x] `loadAudiences()` en StudioView retorna filas reales.
- [ ] WIP del user (TasksView/StudioView/living.js) commiteado a main.
- [ ] Smoke test manual en `/tasks` con tarea programada para confirmar nombres reales (no "—").

## Para cerrar

1. El user commitea su WIP cuando esté listo (revisar `git status` para los 3 archivos).
2. Smoke test manual.
3. Eliminar este archivo.

## Relacionado

- BUG-006 (campaigns/campaign_briefs) — cerrado.
- [FEAT-011](./FEAT-011-studio-programar-button.md) — el botón "Programar" en Studio depende de que el save de schedules use el modelo nuevo.
