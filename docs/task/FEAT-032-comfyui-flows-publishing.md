# FEAT-032 — ComfyUI flows publishing pipeline

**Estado:** Discovery cerrado 2026-05-23. Implementacion pendiente.
**Owner sugerido:** Backend (ai-engine) + Backend (Supabase) + minimo Frontend (StudioView).
**Origen:** El director creativo (Saul) esta entregando workflows ComfyUI en `https://github.com/Ardeagency/flows_vera.git`. La plataforma fue disenada para webhooks n8n; nunca se penso en correr ComfyUI. Necesitamos un pipeline profesional para publicar y ejecutar estos flows sin duplicar la arquitectura.

---

## 1. Lo que entrega el director (repo flows_vera)

Repo publico con 2 flows al cierre del discovery:

| Flow | Formato | Custom nodes |
|---|---|---|
| `ignis/cat01_hero_ingredientes/cat01_hero_ingredientes.json` | workflow UI (con `nodes[]`, `links[]`, `groups[]`) | `LoadImage`, `ImageBatch`, `KIE_NanoBananaPro_Image`, `KIE_Kling3_Video`, `PreviewImage`, `SaveImage`, `SaveVideo` |
| `papermate/papermate_master_back_to_school_v7/papermate_master_back_to_school_v7.json` | API ComfyUI (keys numericas + `class_type`) | `LoadImage`, `ImageBatch`, `KIE_NanoBananaPro_Image`, `KIE_GPTImage2_I2I`, `KIE_Seedance2_Video`, `KIE_Kling3_Video`, `SaveImage`, `SaveVideo` |

**Patron observado en los flows:**
- Inputs: imagenes de producto (3 latas IGNIS) + 1-2 imagenes de referencia visual
- Procesamiento: ImageBatch concatenando todas las imagenes como contexto visual
- Generacion: 3 nodos NanoBanana Pro generan imagenes hero (1 por variante de producto)
- Video: 3 nodos Kling 3.0 toman cada imagen hero como `first_frame` y producen video 5s
- Notes con instrucciones para operador + placeholders `[VARIANTE]`, `[INGREDIENTES]`, `[COLOR_FONDO]`
- SaveImage/SaveVideo con paths como `ignis/cat01/afterburn_hero`

**Clave:** TODOS los nodos generativos son `KIE_*`. Esos custom nodes (repo `gateway/ComfyUI-Kie-API`) son wrappers Python que hacen HTTP a `api.kie.ai`. La GPU del host **no** genera nada, solo decodifica/encodea bytes.

---

## 2. Lo que ya existe en la plataforma (NO tocar)

### Supabase (project `tsdpbqcwjckbfsdqacam`)

Tablas:
- `content_flows` (catalogo) — cols clave: `flow_category_type`, `execution_mode`, `execution_strategy`
- `flow_modules` (steps con `input_schema jsonb`, `output_schema jsonb`, `webhook_url_prod`, `execution_type`)
- `flow_schedules` (instancias por org/brand/brief/persona/campaign con `entity_ids[]`, `production_count`, `aspect_ratio`, etc.)
- `flow_runs` + `runs_outputs` + `runs_inputs`
- `pending_downloads` (cola que un worker en ai-engine consume para bajar URLs externas al bucket)
- `flow_revisions`, `flow_collaborators`, `flow_technical_details`, `flow_test_cases`
- `org_flow_saves`, `user_flow_likes`

Storage buckets relacionados:
- `images_flows` (definiciones y assets de flow)
- `production-inputs`, `production-outputs`
- `generated-content`

RPCs ya hechas (declarativas) — `SQL/migrations/migration_flow_context_rpcs_v2.sql`:
- `rpc_build_flow_context(p_schedule_id uuid) returns jsonb` — arma el contexto leyendo `flow_modules.input_schema.context` del primer step. Soporta 25+ bloques opt-in (brand_identity, brand_colors, brand_fonts, brand_assets, products con variants/options/images, brief, persona, campaign, audience_segments, intelligence_entities, intelligence_signals, etc.).
- `execute_scheduled_flow(p_schedule_id uuid)` — disparado por cron. Llama `rpc_build_flow_context` y hace `net.http_post` al `webhook_url_prod`.
- `rpc_ingest_flow_output(p_schedule_id, p_payload jsonb) returns jsonb` — recibe el webhook callback, rutea outputs a `runs_outputs`/`intelligence_signals`/`brand_posts` segun `output_schema.outputs`, descuenta credits, encola en `pending_downloads` cuando viene URL en vez de `storage_path`.

### Frontend (AI Smart Content)

- `js/views/FlowCatalogView.js` — lista flows por categoria/subcategoria
- `js/views/StudioView.js` — renderea formulario desde `flow_modules.input_schema.fields`, inserta `flow_schedules`, dispara webhook
- `js/views/DevBuilderView.js` + `js/views/builder/BuilderPersistence.js` — admin UI para crear/editar flows manualmente

### Netlify functions ya integradas con KIE.ai

- `functions/kie-nano-banana-create.js` — equivale a `KIE_NanoBananaPro_Image`
- `functions/kling-video-create.js` — equivale a `KIE_Kling3_Video`
- `functions/kie-image-edit-create.js`
- `functions/kie-image-fix-text-create.js`
- `functions/kie-image-upscale-create.js`
- `functions/kie-image-remove-bg-create.js`
- `functions/kie-output-persist.js` — descarga URL del provider directo a Supabase Storage (evita limite 6MB de Netlify base64)
- `functions/kling-video-status.js` + `functions/kling-video-download.js`

### Flows actuales en produccion (los 3 que funcionan con n8n)

- Product Feature Ads (autopilot, webhook `https://ardeagency.app.n8n.cloud/webhook/9d928b10...`)
- Minimalismo 3D / Product Render Futurista (manual, webhook `4635dddf...`)
- Time Feeds Intelligence (autopilot, webhook `290c5ce6...`)

Todos con `execution_type='webhook'`. **No tocar.**

---

## 3. Investigacion competitiva (cerrada)

5 de 7 plataformas (ComfyDeploy, RunComfy, ComfyICU, fal.ai nativo, Replicate, ViewComfy) corren ComfyUI real en GPU. Solo Pixelflow/Segmind tiene formato propio. **Ninguna comercial interpreta el grafo nativo sin levantar ComfyUI**, pero la tecnologia existe (timlrx, comfy-pack standalone, comfyui-workflow-to-api-converter demuestran que es viable).

Patron de-facto para inputs del form: **nodos sentinela** que el director coloca explicitamente en el grafo (`ComfyUIDeployExternalImage`, `ExternalText`, `ExternalNumber`). No auto-deteccion ciega — autodetectar todo expone seeds/samplers internos y mata UX.

Custom nodes que llaman APIs externas (KIE_*, fal_*, replicate_*) se tratan como wrappers HTTP. La GPU no genera, solo orquesta. Coste real lo lleva la API externa.

Billing: SaaS B2B serio cobra creditos fijos hacia el cliente (encaja con nuestro `1 credito = $1 USD`) y absorbe la varianza de GPU-seconds.

---

## 4. Decision arquitectonica

**Estrategia: hibrida, sesgada a interpretacion DAG sin ComfyUI real.**

Razon: 100% de los nodos generativos en los flows entregados son `KIE_*`. Esos nodos no usan GPU del host, solo hacen HTTP a kie.ai. Pagar GPU 24/7 o cold-starts serverless de 30-60s para correr llamadas HTTP es desperdicio. Las 6 funciones `kie-*` en `functions/` ya tienen la integracion completa con kie.ai (auth, error handling, persist al bucket).

### Pipeline propuesto

```
1. PUBLICAR (deferido — el usuario pidio resolver primero la ejecucion)
   Discovery cerro con la opcion preferida: GitHub Action en flows_vera
   que dispara POST /admin/flows/register en ai-engine.
   Auto-genera input_schema desde nodos sentinela + permite editar.

2. EJECUTAR (alcance principal de FEAT-031)
   StudioView (sin cambios) → flow_schedules.insert
   execute_scheduled_flow → net.http_post a webhook_url_prod
   webhook_url_prod apunta a:
     https://ai-engine.../webhooks/comfy/run?flow_slug=<slug>

   ai-engine comfy-kie-adapter (NUEVO):
     a. Carga JSON del bucket flow_definitions/<slug>.json
     b. Si es formato workflow UI, normaliza a formato API (extrae nodes,
        construye dict keyed por id, mapea inputs por link)
     c. Resuelve LoadImage.widgets_values[0] con URLs reales del contexto
        (productos del schedule, refs visuales del brand_container)
     d. Sustituye placeholders [VARIANTE]/[INGREDIENTES]/[COLOR_FONDO] en
        prompts usando datos del contexto
     e. Topological sort del DAG (ComfyUI ya da `order` en cada nodo del
        formato UI; para formato API construir grafo desde inputs)
     f. Ejecuta nodo por nodo:
        - KIE_NanoBananaPro_Image  -> reusar logica de kie-nano-banana-create
        - KIE_Kling3_Video         -> reusar logica de kling-video-create
        - KIE_GPTImage2_I2I        -> reusar logica de kie-image-edit-create
        - KIE_Seedance2_Video      -> NUEVO (validar si kie.ai lo soporta)
        - LoadImage                -> resuelve URL firmada del bucket
        - ImageBatch               -> array concat de URLs (sin compute)
        - PreviewImage             -> no-op
        - SaveImage / SaveVideo    -> marca como output con storage_path
     g. Polling KIE hasta completar todas las tasks
     h. POST a Supabase: rpc_ingest_flow_output(schedule_id, payload)
        con storage_paths o URLs (pending_downloads encola si es URL)

3. CONSUMIR
   runs_outputs ya alimenta la biblioteca de assets. Cero cambios en
   frontend de visualizacion.
```

---

## 5. Lo que hay que construir

### 5.1 Backend ai-engine — modulo `comfy-kie-adapter`

Path sugerido: `~/ai-engine/src/services/comfy-kie-adapter/`

Archivos:
- `parser.js` — normaliza UI-format → API-format; extrae DAG; topological sort
- `resolver.js` — resuelve placeholders y URLs de contexto (productos, refs visuales) en los nodos
- `executors/` — un archivo por tipo de nodo:
  - `kie-nanobanana.js` (reusa logica de Netlify function)
  - `kie-kling3.js`
  - `kie-gptimage2.js`
  - `kie-seedance2.js`
  - `load-image.js`, `image-batch.js`, `save-image.js`, `save-video.js`
- `orchestrator.js` — corre el DAG en orden topologico, mantiene estado intermedio (uuid → output)
- `index.js` — entry point para el route handler

Route nuevo en `src/routes/webhooks.routes.js`:
```js
router.post("/comfy/run", comfyRunController);
```

### 5.2 Supabase — minimo

- Agregar valor `'comfy_kie'` al check constraint de `flow_modules.execution_type` (verificar si existe el check)
- Bucket nuevo `flow_definitions` (RLS service-role-only writes, public reads firmados con TTL)
- Migrar los 2 flows actuales: subir JSON al bucket, crear `content_flows` + `flow_modules` con `execution_type='comfy_kie'` y `webhook_url_prod='https://<ai-engine-domain>/webhooks/comfy/run?flow_slug=...'`

### 5.3 Frontend — minimo

- Agregar `input_type='image_selector'` multiple (para seleccionar N productos del brand) — verificar si ya existe en `BuilderPersistence.normalizeInputSchema`. Si si, cero cambios.
- Sub-categoria nueva en `content_subcategories` (ej. "Hero Producto Cinematografico") para que los flows aparezcan agrupados en `FlowCatalogView`.

### 5.4 Patron de nodos sentinela (futuro, no en MVP)

Cuando el director quiera publicar flows nuevos sin que un dev arme el `input_schema` a mano, usaremos el patron de ComfyDeploy: el director coloca nodos `ARDE_ExternalImage`, `ARDE_ExternalText`, `ARDE_ExternalNumber` en su workflow donde antes habia LoadImage/widgets editables. El parser detecta esos nodos y auto-genera el `input_schema.fields`. Por ahora (MVP) lo hacemos manual para los 2 flows iniciales.

---

## 6. Trabajo pendiente concreto (al retomar)

1. **POC con un solo flow** (recomendado: IGNIS por ser mas simple y formato UI estandar):
   - Subir `cat01_hero_ingredientes.json` al bucket `flow_definitions`
   - Implementar `parser.js` + `executors/kie-nanobanana.js` + `executors/kie-kling3.js` + `orchestrator.js`
   - Crear fila en `content_flows` + `flow_modules` con `input_schema` que pida 3 productos (entity_ids) + 2 refs visuales + ajustes
   - End-to-end: ejecutar desde Studio con IGNIS como org, ver outputs en biblioteca

2. **Decidir credit cost por flow:**
   - IGNIS: 3 NanoBanana Pro 2K + 3 Kling 3.0 Pro 5s. Calcular costo kie.ai real y aplicar markup.
   - Cobrar via `rpc_ingest_flow_output` igual que hoy.

3. **Extender al segundo flow (Papermate):**
   - Requiere parser de formato API ComfyUI (mas simple que UI: ya viene keyed por id)
   - Requiere `KIE_GPTImage2_I2I` y `KIE_Seedance2_Video` executors

4. **Despues:** pipeline de publicacion automatico desde GitHub (FEAT-032 si lo dividimos).

---

## 7. Referencias

- Repo flows del director: https://github.com/Ardeagency/flows_vera
- API kie.ai: `https://api.kie.ai/api/v1/jobs/createTask` (modelos `nano-banana-pro`, `kling-3.0`, etc.)
- Custom nodes: https://comfyai.run/documentation/KIE_NanoBananaPro_Image
- Patron sentinela: https://www.comfydeploy.com/ (External nodes)
- Discovery investigacion: respuesta del agente competitivo en la sesion 2026-05-22

---

## 8. NO mezclar con

- **FEAT-030 (n8n-flow-output-semantics):** ese fix es sobre semantica de outputs del modelo declarativo actual. Independiente. Aplica a flows n8n existentes.
- **Trends Engine:** sensor scraping. Ya cableado, sin relacion.
- **VERA v3:** capa conversacional. No toca flows de produccion creativa.
