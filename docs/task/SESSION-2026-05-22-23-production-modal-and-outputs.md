# Sesion 2026-05-22 / 2026-05-23 — Production modal toolbar + Outputs schema

## Resumen ejecutivo

Sesion larga que cerro 4 frentes paralelos:

1. **Editor de imagen del modal de Production** wired al 100% — 4 modos
2. **Toolbar del modal** completo: Editar / Mejorar 4K / Sin fondo / Mejorar texto
3. **Unificacion schema `runs_outputs` ↔ `system_ai_outputs`** — ambas tablas casi identicas con la unica diferencia siendo el origen (flow vs modelo directo)
4. **Bug raiz del glass-black** localizado y fixed (`view-transition-name` creaba backdrop root boundary)

Como bonus se creo la skill `silent-bug-bisect` para futuras sesiones que enfrenten bugs CSS sin error visible.

## 1. Editor de imagen — modal de Production

### Estado final del toolbar

| Boton | Modelo kie.ai | Cobro | Patron |
|---|---|---|---|
| **Editar** | `nano-banana-pro` + OpenAI Vision | 0.10 cred | Overlay con mascara + 4 modos |
| **Mejorar 4K** | `topaz/image-upscale` | 0.20 cred | Click directo, sin prompt |
| **Sin fondo** | `recraft/remove-background` | 0.05 cred | Click directo |
| **Mejorar texto** | `nano-banana-pro` + OpenAI Vision | 0.10 cred | Click directo, auto-detect producto |
| ~~Variar~~ | eliminado | — | — |
| ~~Animar~~ | eliminado | — | — |

### Modos del editor (Editar)

```
[Eliminar objeto] [Reemplazar objeto] [Corregir producto] [Cambiar producto]
```

- **Eliminar**: mascara + texto → "quita esto"
- **Reemplazar**: mascara + texto + file picker subida (imagen referencia opcional)
- **Corregir producto**: mascara + producto auto-detectado del output (entity_id) o seleccionado manual
- **Cambiar producto**: mascara + producto seleccionado de galeria

### Patron arquitectura

```
Click boton toolbar
  → Frontend valida + POST Netlify function
     • kie-image-edit-create (4 modos)
     • kie-image-upscale-create
     • kie-image-remove-bg-create
     • kie-image-fix-text-create
  → Backend:
     1. (Opcional) OpenAI Vision con imagen original + refs → prompt en ingles
     2. kie.ai createTask con modelo correcto + payload exacto segun doc
     3. Cobra creditos via use_credits_numeric
     4. Devuelve { taskId, refined_prompt?, kie_model, credits_charged }
  → Frontend cierra modal + agrega skeleton card al grid
  → Polling kling-video-status cada 3s
  → kie-output-persist (server-side download + upload a Supabase Storage)
     • Evita el limite 6MB de Netlify para imagenes 4K
  → INSERT system_ai_outputs con metadata.kind correcto + linaje completo
  → Refresh grid + toast
```

### UX clave

- **Picker contextual del "+"**: Replace abre file picker nativo; Fix/Change abre popover con galeria de productos
- **Auto-detect producto**: lee `runs_outputs.technical_params.entity_id` (canonico) o fallback a `runs_inputs.input_data.entity_id` (legacy)
- **Aspect ratio preservado**: detecta dimensiones via `new Image()` y mapea al ratio kie mas cercano (10 opciones)
- **Skeleton card mientras genera** con la imagen original tenue + shimmer + label custom ("Editando con IA" / "Mejorando a 4K" / "Quitando fondo" / "Mejorando textos")
- **Trazo del pincel**: `mix-blend-mode: difference + opacity: 1` (inversion total tipo negativo)
- **PNG transparente**: cards con `metadata.kind='image_remove_bg'` o `technical_params.has_alpha=true` muestran `glass-black` detras para que la transparencia sea perceptible

## 2. Unificacion schema outputs

### Tablas afectadas
- `runs_outputs` (outputs ligados a flow_runs)
- `system_ai_outputs` (outputs standalone — editor, upscale, remove-bg, fix-text, video)

### DDL aplicado (via Supabase Management API)

**`system_ai_outputs` += 15 columnas** (de runs_outputs):
```
organization_id, brief_id, persona_id, campaign_id, entity_id,
reference_image_url, models, generated_copy, generated_hashtags,
creative_rationale, external_ad_id, external_platform, published_at,
last_metrics_sync_at, flow_module_id
```

**`runs_outputs` += 8 columnas** (de system_ai_outputs):
```
brand_container_id, user_id, provider, external_job_id, status,
error_message, updated_at, entity_id
```

Plus trigger auto-update `updated_at` en runs_outputs.

### Backfill aplicado

- **runs_outputs (6 filas)**: brand_container_id/user_id/organization_id desde flow_run parent. provider='legacy_flow', status='completed'.
- **system_ai_outputs (3 filas)**: organization_id desde brand_containers, reference_image_url desde metadata, models desde technical_params.

### Frontend ajustado

- `_insertEditOutput` + 3 handlers (`_completeUpscaleInBackground`, `_completeRemoveBgInBackground`, `_completeFixTextInBackground`) pueblan **organization_id, entity_id, reference_image_url, models** como columnas FK directas (no solo metadata)
- `loadSystemAiOutputs` filtra por **organization_id** (consistente con `loadFlowOutputs`)
- `VideoView.saveSystemAIOutput` puebla automaticamente campos comunes desde state (organization_id, campaign_id, persona_id)
- `VideoView.loadVideoProductions` ahora carga de AMBAS tablas (antes solo runs_outputs)

### Resultado

```
Diferencia unica entre las 2 tablas:
  runs_outputs:        run_id (NOT NULL, viene de flow)
  system_ai_outputs:   external_job_id + provider + status (modelo directo)
```

Todo el vocabulario de identidad / linaje / modelos / publicacion es identico.

## 3. RPC rpc_ingest_flow_output

### Bug encontrado

El RPC guardaba el **prompt** (JSON con typography/headline/subline) en la columna `generated_copy`. La columna `prompt_used` siempre quedaba NULL.

Confusion semantica:
- `prompt_used` = direccion/prompt usado para generar la imagen
- `generated_copy` = copy del post listo para publicar (caption + descripcion)

### Fix aplicado

1. **RPC refactorizado** para respetar output_schema con field='prompt_used'. Fallback a payload.prompt_used o payload.prompt si no esta declarado.
2. **Pobla schema unificado**: brand_container_id, user_id, provider='flow', external_job_id=n8n_exec_id, status='completed', updated_at, entity_id, models, reference_image_url
3. **Consolida los dos INSERT** (legacy + declarative) con mismos campos
4. **Backfill 6 rows IGNIS**: contenido JSON typography movido de generated_copy → prompt_used. generated_copy queda NULL.

### Output_schema flow IGNIS

Tambien se cambio `flow_modules.output_schema.outputs.copys.field` de `'generated_copy'` → `'prompt_used'` para el flow `5f6802dc-...`. Asi el output `copys` (que en n8n contiene typography) cae al campo correcto sin tocar n8n.

## 4. Bug glass-black resuelto

### Causa raiz

`bundle.css`:
```css
#app-container         { view-transition-name: app-root; }
#navigation-container  { view-transition-name: nav-root; }
```

`view-transition-name` crea un **backdrop root boundary** segun la spec CSS Backdrop Filter. Cualquier elemento con `backdrop-filter` adentro queda aislado.

### Sintomas
- `.app-header` se veia transparente sin blur
- `.glass-black` en Planes/Products sin efecto
- `#userDropdown` SI funcionaba (esta porteado a `document.body`)
- Card de login SI funcionaba (no esta dentro de los containers afectados)

### Fix
Removed `view-transition-name` de ambos containers. Las view-transitions caen al root snapshot global — sigue funcionando.

### Bonus: skill creada

`silent-bug-bisect` en `~/.claude/skills/`. Metodologia para bugs CSS sin error visible:
1. Control group (que elemento similar SI funciona?)
2. Canary test con !important en un solo elemento antes de cambios globales
3. Bisect por categorias (cache, OS accessibility, stacking context, especificidad)
4. Lista de propiedades que matan backdrop-filter
5. Git history bisect

## Funciones Netlify creadas/modificadas

```
functions/kie-image-edit-create.js          (NUEVO — 4 modos edicion)
functions/kie-image-upscale-create.js       (NUEVO — Topaz upscale)
functions/kie-image-remove-bg-create.js     (NUEVO — Recraft remove-bg)
functions/kie-image-fix-text-create.js      (NUEVO — nano-banana fix text)
functions/kie-output-persist.js             (NUEVO — server-side download + upload)
```

## Variables ENV requeridas en Netlify

```
KIE_API_KEY                       (existe ya)
OPENAI_API_KEY                    (existe ya)

# Opcionales (defaults si no estan):
KIE_IMAGE_EDIT_MODEL              default: nano-banana-pro
KIE_IMAGE_UPSCALE_MODEL           default: topaz/image-upscale
KIE_IMAGE_REMOVE_BG_MODEL         default: recraft/remove-background
KIE_IMAGE_FIX_TEXT_MODEL          default: nano-banana-pro
OPENAI_EDIT_PROMPT_MODEL          default: gpt-4o-mini
OPENAI_FIX_TEXT_PROMPT_MODEL      default: gpt-4o-mini
KIE_NANO_CALLBACK_URL             default: (no callback, usa polling)
```

## Pendientes a futuro

1. **FEAT-030** — limpiar semantica del flow n8n IGNIS (renombrar output `copys` → `scene_prompt` + agregar `post_copy` y `post_hashtags`). Ver `docs/task/FEAT-030-n8n-flow-output-semantics.md`.
2. **Boton "Publish"** del modal: hoy esta disabled "Próximamente". Cuando se complete FEAT-030 C, se puede wirear a Meta/IG con caption real.
3. **Refactor frontend opcional**: unificar `fromRuns` y `fromSystemAi` mappers en `renderHistorySection` ahora que shape es identico. Ahorra ~30 lineas, no critico.
4. **Modelos en kie.ai a confirmar**: si nano-banana-pro no es el correcto para fix-text en produccion (puede no ser bueno con texto), evaluar alternativas como Recraft Text-to-image o GPT-4o image generation.

## Commits clave de la sesion

```
500a3970  feat(production-modal): edit con mask + OpenAI vision + nano-banana
5378afb0  feat(production-modal): 4 modos de edicion con producto/referencia
59c073e4  feat(production-modal): Mejorar 4K wired (Topaz upscale)
df570934  feat(production-modal): Sin fondo wired (Recraft)
e2617e14  feat(production-modal): Mejorar texto wired (GPT Image-2 + OpenAI)
4f1a8b40  fix(fix-text): cambiar a nano-banana-pro (image-to-image)
69e97793  fix(upscale): persistir output server-side (kie-output-persist)
1edffce4  fix(glass-black): quitar view-transition-name del root containers
b385c0cc  fix(alpha-bg): cards y modal glass-black para PNG transparentes
c9a96321  refactor(outputs): unificar schema runs_outputs <-> system_ai_outputs
20cdda77  feat(video): VideoView usa schema unificado
67a7b1c5  docs(task): FEAT-030 plan limpiar semantica n8n IGNIS
```

## Memorias persistentes creadas

- `feedback_silent_bug_methodology.md` — metodologia para bugs CSS sin error
- `project_outputs_schema_unified.md` — schema unificado de outputs
- `project_runs_outputs_rpc_fixed.md` — fix del RPC rpc_ingest_flow_output
