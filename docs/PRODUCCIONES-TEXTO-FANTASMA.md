# Diagnóstico: Producciones de texto fantasma en Living

## Qué se ve en producción

En el historial del Living (masonry) aparecen tarjetas negras con icono "?" y el título **"Producción de texto"**, aunque al buscar en la base de datos no se encuentran registros que correspondan a “producciones de texto” como entidad propia.

## De dónde salen realmente

Esas tarjetas **no vienen de una tabla llamada "producciones" o "producciones de texto"**. El historial se arma en el front con dos fuentes:

1. **`flow_runs` + `runs_outputs`**  
   - Se cargan hasta 100 `flow_runs` (por `brand_id` o `user_id`) y sus `runs_outputs`.  
   - Por cada **run** se busca **un** output (`runs_outputs.run_id = flow_runs.id`).  
   - Si el run **no tiene** fila en `runs_outputs`, o tiene output pero **sin archivo** (sin `storage_path`/`file_url`) y sin `output_type` de imagen/video, el código clasifica ese ítem como tipo **`text`** y lo pinta con la tarjeta genérica "Producción de texto" (icono "?").

2. **`latestGeneratedContent`**  
   - Son los últimos outputs de `runs_outputs` para los últimos 10 runs del brand.  
   - Si un output no tiene URL de archivo ni `output_type` de imagen/video, se clasifica como **`text`** y también se muestra la misma tarjeta genérica.

Por tanto, las “producciones de texto fantasma” son en realidad:

- **Runs en `flow_runs` que no tienen ningún registro en `runs_outputs`**, o  
- **Runs que sí tienen output en `runs_outputs`** pero ese output no tiene archivo (ni `storage_path` ni URL) ni `output_type` de imagen/video, y a veces tampoco texto útil (`generated_copy`, `text_content`).

Los “registros” sí están en la base de datos: en **`flow_runs`** y, cuando aplica, en **`runs_outputs`**. No hay una tabla aparte de “producciones de texto”; la etiqueta es solo la UI por defecto cuando el tipo de contenido se infiere como texto.

## Cómo comprobarlo en la base de datos

```sql
-- Runs sin ningún output (candidatos a tarjeta fantasma)
SELECT fr.id, fr.flow_id, fr.status, fr.created_at
FROM flow_runs fr
LEFT JOIN runs_outputs ro ON ro.run_id = fr.id
WHERE ro.id IS NULL
  AND fr.brand_id = '<brand_id>'  -- o user_id según el caso
ORDER BY fr.created_at DESC
LIMIT 20;
```

```sql
-- Outputs sin archivo (storage_path/storage_object_id) ni tipo imagen/video
SELECT ro.id, ro.run_id, ro.output_type, ro.storage_path, ro.generated_copy, ro.text_content, ro.created_at
FROM runs_outputs ro
JOIN flow_runs fr ON fr.id = ro.run_id
WHERE fr.brand_id = '<brand_id>'
  AND (ro.storage_path IS NULL OR trim(ro.storage_path) = '')
  AND (ro.storage_object_id IS NULL)
  AND (ro.output_type IS NULL OR lower(ro.output_type) NOT IN ('image', 'img', 'still', 'video', 'reel', 'clip'))
ORDER BY ro.created_at DESC
LIMIT 20;
```

## Cambio aplicado en el código

Para que dejen de mostrarse como “producciones de texto” las tarjetas fantasma:

- **En el historial** se filtran y **no se muestran**:
  - Runs **sin** output en `runs_outputs`.
  - Ítems clasificados como **text** que no tienen contenido mostrable: sin `prompt`, `generated_copy` ni `text_content` (ni en el output ni en metadata).

Así solo aparecen en el masonry runs que tienen al menos un output con archivo (imagen/video) o con texto real (copy/text_content). Las tarjetas negras con "?" y "Producción de texto" sin contenido asociado dejan de aparecer.

## Dónde está la lógica en el código

- **Carga de datos**: `js/living.js`  
  - `loadFlowRuns()` → tabla `flow_runs`  
  - `loadFlowOutputs()` → tabla `runs_outputs`  
  - `loadLatestGeneratedContent()` → `flow_runs` + `runs_outputs`

- **Clasificación y render**: `renderHistorySection()`  
  - Construcción de `fromRuns` y `fromGenerated`, clasificación `contentType` (`'video' | 'image' | 'text'`).  
  - Para `contentType === 'text'` se usa `renderTextCard()` (tarjeta con "?" y "Producción de texto").

- **Filtro anti-fantasma**: en la misma función se excluyen del listado final los ítems fantasma (sin output o texto sin contenido) antes de pintar el masonry.
