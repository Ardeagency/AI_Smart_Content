---
id: BUG-005
title: Frontend consulta tablas legacy `audiences` y `brands` (drop incompleto)
severity: high
type: bug
status: open
auto_eligible: yes
auto_eligible_reason: refactor mecánico de queries; el mapeo nuevo está claro y verificable contra schema vivo
est_duration: medium
created: 2026-05-11
owner: -
---

# BUG-005 · Referencias huérfanas a `audiences` y `brands` en el frontend

## Síntoma

El frontend hace queries a dos tablas que **ya no existen** en Supabase:

- `public.audiences` — reemplazada por `public.audience_personas` (FK directa a `brand_containers.id` vía `brand_container_id`)
- `public.brands` — tabla intermedia eliminada; la cadena vieja era `brand_containers → brands(via project_id) → audiences(via brand_id)`. Ahora `brand_containers ← audience_personas` directo.

Las llamadas a `.from('audiences')` y `.from('brands')` retornan error desde PostgREST, pero el frontend lo traga en `try/catch` → `return []`. Resultado: features que dependen de audiencias o nombres de marca legacy muestran datos vacíos sin avisar al usuario.

## Sitios afectados

### 1. `js/views/TasksView.js` — 🔴 visible al usuario

Líneas 309-310, 317-318, 369-370, 426-430, 486-494, 515:

```js
// L309-310 — Promise.all que carga relaciones de schedules
audienceIds.length ? this.supabase.from('audiences').select('id, name').in('id', audienceIds) : { data: [] },
brandIds.length ? this.supabase.from('brands').select('id, project_id').in('id', brandIds) : { data: [] }

// L317-318 — maps siempre vacíos
const audienceMap = (audiencesRes.data || []).reduce(...)
const brandProjectMap = (brandsRes.data || []).reduce(...)

// L369-370 — render: siempre muestra "—"
const audienceName = (firstAudienceId && audienceMap[firstAudienceId]) || '—';
const projectId = s.brand_id ? brandProjectMap[s.brand_id] : null;
```

**Impacto UI:** todas las tareas programadas en `/tasks` muestran `audienceName = '—'` y no resuelven nombre de marca.

**Save también roto** (L891, 894, 942, 948): el formulario escribe a `flow_schedules.brand_id` y `flow_schedules.audience_ids[]` (columnas legacy), pero el schema nuevo usa FKs reales `persona_id` y `campaign_id` (singular). Programar desde la UI guarda en campos que no son la fuente de verdad.

### 2. `js/views/StudioView.js` — 🟠 silencioso

`loadAudiences()` líneas 1156-1175:

```js
const { data: brand } = await this.supabase
  .from('brands').select('id').eq('project_id', brandContainerId).maybeSingle();  // ❌ brands no existe
if (e1 || !brand) return [];
const { data } = await this.supabase
  .from('audiences').select('*').eq('brand_id', brand.id);                         // ❌ audiences no existe
```

**Impacto:** Vera no recibe contexto de audiencia cuando el usuario corre flujos desde Studio. Falla silenciosa.

### 3. `js/views/VideoView.js` — 🟠 silencioso

Línea 987:

```js
brandId ? this.supabase.from('audiences').select('id, name, description, estilo_lenguaje').eq('brand_id', brandId).limit(50) : { data: [], error: null }
```

**Impacto:** los flujos de video pierden contexto demográfico que se pasaría al modelo.

### 4. `js/living.js` — 🟡 ProductionView degradado

`loadBrandId()` líneas 351-367:

```js
const { data: brand } = await this.supabase
  .from('brands').select('id').eq('project_id', this.brandContainerId).maybeSingle();
if (brandError) {
  if (brandError.status === 400 || brandError.code === '400') {
    console.warn('⚠️ Error 400 cargando brands en loadBrandId:', brandError.message);  // ❌ silenciado a propósito
```

**Nota histórica:** el comentario en línea 363-364 muestra que el dev anterior **ya vio el error 400** pero lo silenció con un warning en vez de arreglarlo. `this.brandId` queda permanentemente null. Cualquier feature de livingManager que dependa de `brandId` separado de `brandContainerId` está degradada.

## Mapeo legacy → nuevo schema

| Tabla / Columna legacy                          | Equivalente actual                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `audiences`                                     | `audience_personas`                                                    |
| `audiences.brand_id`                            | `audience_personas.brand_container_id`                                 |
| `audiences.name / description / estilo_lenguaje` | `audience_personas.name / description / estilo_lenguaje` (mismos nombres) |
| `brands` (tabla intermedia)                     | eliminada — usar `brand_containers` directo                            |
| `brands.project_id`                             | `brand_containers.id`                                                  |
| `flow_schedules.brand_id`                       | sin FK — campo legacy; el nuevo FK real es `persona_id` y `campaign_id` |
| `flow_schedules.audience_ids[]`                 | sin FK — campo legacy; usar `persona_id` (singular)                    |

## FKs reales actuales en `flow_schedules`

```sql
brief_id      → campaign_briefs(id)
campaign_id   → campaigns(id)
flow_id       → content_flows(id)
organization_id → organizations(id)
persona_id    → audience_personas(id)
user_id       → profiles(id)
```

Las columnas `brand_id`, `audience_ids[]`, `entity_ids[]`, `campaign_ids[]` siguen existiendo pero **sin FK constraint** — son legacy/data residual y no deben usarse para nuevas escrituras.

## Pasos para resolver

1. **`TasksView.js`** — reescribir el Promise.all de relaciones (L305-311):
   - Reemplazar `.from('audiences')` por `.from('audience_personas').select('id, name').in('id', personaIds)` usando `schedules.map(s => s.persona_id)` en vez de `audience_ids[]`.
   - Eliminar el paso `brands → brand_containers` y joinear directo: `.from('brand_containers').select('id, nombre_marca').in('id', ...)` con `schedules.map(s => s.brand_id).filter(Boolean)` (el campo legacy `brand_id` PUEDE contener un `brand_containers.id` o un `brands.id` viejo; verificar contra datos reales antes de asumir).
   - Actualizar save (L891, 894, 942, 948) para escribir a `persona_id` y `campaign_id` en vez de los arrays legacy.
2. **`StudioView.loadAudiences()`** — colapsar el doble join a una sola query:
   ```js
   const { data } = await this.supabase
     .from('audience_personas')
     .select('*')
     .eq('brand_container_id', brandContainerId);
   ```
3. **`VideoView.js:987`** — mismo pattern: `audience_personas` con `brand_container_id`.
4. **`living.js loadBrandId()`** — evaluar si todavía hace falta `this.brandId` separado. Si no, eliminar la función y todos sus call sites; si sí, decidir nuevo mapeo (probablemente `brand_container_id` es suficiente).
5. **Migración de datos** — verificar si quedan filas en `flow_schedules` con `brand_id` apuntando a un ID de la vieja `brands` (que ya no existe). Si sí, mapear a `brand_container_id` correspondiente o anular.
6. Smoke test manual:
   - Abrir `/tasks` con al menos una tarea programada y confirmar que muestra nombre de audience + brand reales.
   - Programar una tarea desde StudioView (cuando FEAT-011 esté) y verificar que `flow_schedules.persona_id` quede poblado.

## Criterio de done

- `grep -rn "\.from('audiences'\|\.from('brands'" js/` retorna 0 matches.
- `/tasks` muestra `audienceName` real (no "—") cuando hay `persona_id` poblado.
- Save de tareas escribe a `persona_id` y queda visible en `pg_constraint` FK chain.
- `loadAudiences()` en StudioView retorna filas reales (verificable contando `audience_personas.id` por org).

## Relacionado

- Drop del modelo legacy fue parte del refactor `brand_containers ← audience_personas` (sin task original en `docs/task/` — drop ejecutado en migración no documentada).
- [FEAT-011](./FEAT-011-studio-programar-button.md) — el botón "Programar" en Studio depende de que el save de schedules use el modelo nuevo.
