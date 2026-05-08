---
id: FEAT-013
title: CRUD de sensores y URL watchers en MonitoringView
severity: medium
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere diseño visual de modales de creación/edición y validación UX
est_duration: medium
created: 2026-05-05
owner: -
---

# FEAT-013 · CRUD de sensores y URL watchers

## Síntoma

`MonitoringView.js:361-362` y `:417` traen comentarios explícitos:

```js
// ══════════════════════════════════════════════════════════
//    TAB: SENSORES (placeholder — CRUD viene en próximo commit)
//    TAB: URL WATCHERS (placeholder — CRUD viene en próximo commit)
```

Hoy estos dos tabs solo muestran datos read-only. El usuario **no puede**:
- Crear un nuevo sensor para una entidad recién agregada
- Pausar/reanudar un sensor existente
- Editar la cadencia (`cadence_value`)
- Crear URL watchers nuevos
- Eliminar URL watchers obsoletos

El backend SÍ procesa estos sensores y URL watchers (verificado: `social-scraper.service.js` ejecuta `monitoring_triggers` cada 45 min y `checkUrlWatchers()` produce diff SHA-256). **Solo falta UI.**

## Contexto

13 sensor types vivos en `monitoring_triggers`:

| Tipo | Triggers activos |
|---|---|
| `social` | 4 |
| `meta_audience_demographics` | 1 |
| `ga4_audience_demographics` | 1 |
| `meta_ads_audiences_sync` | 1 |
| `audience_alignment_analysis` | 1 |
| `brand_indexer` | 1 |
| `ga4_analytics` | 1 |
| `meta_posts` | 1 |
| `meta_page_insights` | 1 |
| `brand_audience_heatmap_compute` | 1 |
| `meta_ad_library_sync` | 1 |
| `threat_detection` | 1 |
| `mission_generation` | 1 |

Los 9 brand-wide se auto-crean por `brand-sensor-sync.service.js` cada 5 min. Los `social` se auto-crean por `fn_intelligence_entities_after_insert` cuando se inserta un competidor. **El usuario no debe crear sensores manualmente desde cero**, solo:

1. Habilitar/deshabilitar sensores existentes (toggle `status='active'/'paused'`)
2. Cambiar cadencia (`cadence_value`)
3. Forzar ejecución manual (`next_run_at = now()`)
4. Ver historial de runs (`sensor_runs` por trigger)
5. Crear/editar URL watchers (sí, estos son del usuario)

## Pasos

### Sensores (Tab 1)

1. Lista actual ya muestra `monitoring_triggers` por org.
2. Agregar acciones por fila:
   - Toggle status: `active` ↔ `paused`
   - Editar cadencia: modal con presets (`daily`, `every 4h`, `every 1h`, `custom`)
   - "Ejecutar ahora": `UPDATE monitoring_triggers SET next_run_at = now() WHERE id = ?`
   - "Ver historial": modal con últimos 20 `sensor_runs` (timestamp, status, error_message si falló)
3. RLS: ya existe — sin cambios.

### URL Watchers (Tab 2)

1. Lista actual muestra `url_watchers` por org (hoy 0 filas).
2. Botón "+ Agregar URL watcher": modal con:
   - URL a vigilar (validar formato)
   - `label` legible
   - `entity_id` opcional (asociar a competidor)
   - `cadence` (default daily)
3. Eliminar URL watcher (DELETE con confirmación).
4. Ver diff: modal con últimos cambios detectados (hash SHA-256 actual vs anterior + diff de texto extraído).

### Apify usage badges

Agregar en cada sensor row indicador de coste Apify si aplica:
- ✅ Apify-driven sensors: `social`, `meta_ad_library_sync` → mostrar badge "Apify"
- 🔵 Native sensors: `meta_audience_demographics`, `ga4_*`, `brand_indexer`, `threat_detection`, `mission_generation` → sin badge

Esto le da al usuario visibilidad de qué sensores consumen créditos.

## Criterio de done

- Usuario puede pausar/reanudar cualquier sensor existente.
- Usuario puede crear ≥1 URL watcher con éxito y verlo procesarse en <24 h.
- Usuario puede ver historial de runs de cualquier sensor (último 20).
- Tab "URL Watchers" deja de ser placeholder.
- Tab "Sensores" deja de ser placeholder.

## Tareas relacionadas

- DATA-001 — necesario tener entidades competidoras configuradas antes de que `social` triggers tengan sentido.
