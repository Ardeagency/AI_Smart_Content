---
id: FEAT-031
title: Dev portal iteration 2026-05-22 — Ficha builder + Studio canvas + 3 paginas nuevas + provisioning wizard
type: feature
severity: medium
status: deployed_pending_backend
auto_eligible: no
estimate: closed_frontend
owner: —
created: 2026-05-22
last_update: 2026-05-23
---

# Contexto

Sesion del 2026-05-22 ataco multiples paginas de `/dev/` y `/studio/`. Todo el frontend esta deployado en main. **Quedan 2 piezas pendientes en backend** (ai-engine + edge function) sin las cuales algunas vistas quedan como UI cosmetica.

## Lo que entro al repo

### 1. Ficha del Flujo en `/dev/builder` — espeja catalogo + Studio reales
- `js/views/DevBuilderView.js` `renderFichaFlowCard()` reescrita 1:1 a `FlowCatalogView.renderFlowCard()` (`flow-card-gradient` + `flow-card-actions` + `flow-card-info` siempre visible)
- Nueva seccion "Vista en el Studio" que embebe el shell real (`studio-layout` + `InputRegistry.renderFormFromSchema`) — pickers interactivos, Producir disabled, form `onsubmit return false`
- CSS scopeado en `.ficha-studio-embed { position: relative; height: 640px }` para neutralizar el `position: absolute` global de `.studio-layout`
- Layout final: `grid-template-columns: 232px minmax(0, 1fr)` sin max-width ni margin auto (despues de varias iteraciones del usuario)
- Commits: `28ae8782`, `1a9bd1f5`

### 2. Studio canvas = galeria masonry (LivingManager embed)
- `js/views/StudioView.js`: canvas pasa de patron de puntos a galeria masonry justified rows
- Pre-set `livingManager.filterFlowName = selectedFlow.name` ANTES de init → galeria nace ya filtrada al flow
- Inyecta `#productionModal` shell al `<body>` si no existe (caso: usuario entra directo a `/studio` sin pasar por `/production`)
- Monkey-patch del empty state para mensaje flow-aware
- CSS `:has(.living-masonry-grid)::before { display: none }` oculta el dot spotlight cuando hay producciones
- **Caveat conocido**: filtro por NOMBRE de flow (no por id) porque `LivingManager.filterFlowName` asi lo expone. Si dos flows distintos comparten nombre exacto, sus producciones se mezclarian.
- Commit: `5d9b96db`

### 3. Sidebar `/dev/` reorganizado + 3 paginas nuevas
- `js/components/Navigation.js`: Library hijos cambiaron de `Vector Memory` → `Entrenamiento de Vera` + `Ver conocimientos`. Admin gano `Organizaciones` top-level
- `js/views/DevLeadVeraTrainingView.js` — form file/prompt/image, drag-drop, previews, boton "Entrenar" **stub** (backend ai-engine pendiente, ver seccion abajo)
- `js/views/DevLeadVeraKnowledgeView.js` — SELECT ai_global_vectors, agrupa por `source_path`, render burbujas con icon-by-type, modal de detalle con chunks ordenados por chunk_index
- `js/views/DevLeadOrgsView.js` — CRUD lite organizations + nested organization_credits + subscriptions; modal crear/editar (name/brand_name/slogan/logo_url); soft delete via `deleted_at = now()`
- Rutas en `js/app.js`: `/dev/lead/vera-training`, `/dev/lead/vera-knowledge`, `/dev/lead/orgs`. `/dev/lead/ai-vectors` eliminada
- `js/views/DevLeadVectorsView.js` ELIMINADO (reemplazado)
- CSS append ~430 lineas en `css/modules/developer.css` (training form, bubbles grid, orgs cells)
- Commit: `ac58f0aa`

### 4. `/dev/provisioning/users` rediseñado 3 veces → wizard real
Tres iteraciones por feedback del usuario:
1. Primero: grid 3-col equal de cards (`feat(dev/provisioning): form en grid dashboard, sticky action bar`) → user dijo "se ve horrible"
2. Segundo: stepper vertical + form scroll + summary live sticky (`rediseño PRO con stepper + summary live`) → user dijo "no me gusto" y paso referencias (DNB Create Account + Personal Information profile-edit)
3. **Final**: wizard real one-step-at-a-time + flow divergente dev/consumer (commit `102a4c1b` — **commit message es sobre remove-bg pero accidentalmente bundleo los 789 insertions del provisioning + 439 del CSS**)

Flow dinamico segun el tipo de usuario:
- **DEV** (`platform_role=dev` OR `dev_role` set): Sign up → Listo (sin org, sin permisos)
- **CONSUMER**: Sign up → Organizacion → [Crear org si mode=create] → [Permisos si org asignada] → Listo

5 pasos en `WIZARD_STEPS` array:
1. signup — identidad + rol/vista
2. org — 3 radio cards visuales (Sin / Afiliar / Crear)
3. create_org — Layout estilo Image #8: preview 280px sticky con logo circular (live update desde URL) + form (nombre, brand_name_oficial, slogan, logo_url)
4. perms — capabilities matrix existente
5. review — tiles resumen + submit, validacion per-step

Inputs viven en sub-secciones del MISMO `<form>` para preservar valores entre Next/Back sin DOM reset. Stepper a la izquierda con marker numerico que cambia a check verde + linea verde tras pasar. Click en step ya-pasado vuelve a el. Mobile: stepper scroll horizontal.

Files: `js/views/DevLeadUserProvisioningView.js` + ~440 lineas append CSS provisioning.

## Lo que FALTA (backend)

### B1 — Endpoint ai-engine `POST /api/vera/train` (alta prioridad)
**Sin esto, la pagina "Entrenamiento de Vera" no hace nada — solo muestra notification "Backend pendiente".**

Stack actual:
- OPENAI_API_KEY vive solo en `/root/ai-engine/.env` (NO en Netlify)
- Patron existente: `brand-indexer.service.js` en ai-engine ya hace embeddings + INSERT en `ai_brand_vectors`. Replicar el patron para vectores GLOBALES.
- Tabla destino: `ai_global_vectors` (existe pero esta vacia). Columnas: `source_bucket, source_path, source_type, chunk_index, content, embedding (vector 1536), metadata jsonb`

Implementacion:
1. Endpoint acepta multipart (file/image) + JSON (prompt/title)
2. **FILE** (txt/md/pdf/json): extraer texto (pdf-parse para PDF, raw para text) → chunkear (~500 chars con overlap) → embed cada chunk con `text-embedding-3-large@1536` → INSERT con `source_type='pdf'|'txt'|'md'|'json'`, `metadata.title`
3. **IMAGE**: gpt-4o vision describe el estilo visual con prompt sistematico → embed la descripcion → INSERT con `source_type='image'`, `metadata.image_url+title`
4. **PROMPT**: embed directo → INSERT con `source_type='prompt'`
5. Idempotencia por SHA-256 del content (mismo patron que brand-indexer)
6. Frontend handler (`submitTraining()` en `DevLeadVeraTrainingView.js:200+`) cambia el TODO por fetch real al endpoint via `FormData`

### B2 — Extender edge function `provision-user-start` (media prioridad)
**Sin esto, el step "Crear org" del wizard guarda solo el `new_organization_name`; el `brand_name_oficial`, `brand_slogan` y `logo_url` se envian en el payload pero quedan en el aire.**

Cambios en el edge function de Supabase (`provision-user-start`):
- Aceptar nuevos campos del payload: `organization.new_brand_name_oficial`, `organization.new_brand_slogan`, `organization.new_logo_url`
- Cuando `mode === 'create'`: pasarlos al INSERT en `organizations` (la tabla ya tiene las columnas `brand_name_oficial`, `brand_slogan`, `logo_url`)

Alternativa low-risk: ignorar los campos en el edge function por ahora — el usuario igual puede editarlos despues desde el CRUD de `/dev/lead/orgs`. Pero idealmente el wizard guarda todo en 1 sola operacion.

## Caveat: commit `102a4c1b` tiene mensaje incorrecto

`git show 102a4c1b` muestra mensaje sobre "remove-bg cards y modal glass-black" pero el diff incluye **tambien** `css/modules/developer.css (439 cambios)` y `js/views/DevLeadUserProvisioningView.js (789 cambios)` — son MIS cambios del wizard provisioning que se bundleron accidentalmente. El codigo esta bien en main; solo el commit message no refleja todo el diff. No tocar.

## Cuando se cierra esta task

- B1 implementado y deployado en ai-engine → smoke test desde `/dev/lead/vera-training` adjuntando 1 file + verificar que aparece en `/dev/lead/vera-knowledge`
- B2 extendido el edge function → smoke test desde `/dev/provisioning/users` creando un usuario con org nueva y verificar que `brand_slogan` quedo en la fila de `organizations`
