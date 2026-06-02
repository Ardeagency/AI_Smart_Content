# Flow: ignis-cat01-hero-ingredientes (manual)

Registrado 2026-05-25 como flow manual ComfyUI (FEAT-033). status=draft, oculto del catalogo hasta validar E2E.

## input_schema (5 campos, todos reusando input_types existentes)

| key | input_type | container | data_type | mapea a (nodo del graph) |
|-----|-----------|-----------|-----------|--------------------------|
| `productos` | image_selector | MEDIA | array (max 3) | los 3 `LoadImage` de producto (nodes 1,2,3) |
| `referencias_estilo` | image_selector | MEDIA | array (max 2) | los 2 `LoadImage` de estilo (nodes 6,7) |
| `aspect_ratio` | aspect_ratio | ASPECT_RATIO | string | widget aspect_ratio de los 3 NanoBanana + 3 Kling |
| `resolution` | select | SELECT | string (2K/4K) | widget resolution de los NanoBanana |
| `generar_video` | boolean | BOOLEAN | bool | activa/poda las 3 ramas Kling3 (video) |

## Inputs NO creados (reuso puro)
Ninguno nuevo — la plataforma ya tenia todos los input_type necesarios.

## Mejora identificada (pendiente, no bloqueante)
- **`product_image_selector`**: hoy `product_selector` → STRING_CONTAINER (resuelve a contexto/texto, no a URL de imagen). Para flows ComfyUI que alimentan `LoadImage` con la imagen del producto del catalogo, seria mejor un selector que (a) liste productos del catalogo de la org y (b) devuelva la URL de imagen del producto elegido. Por ahora se usa `image_selector` (MEDIA) que pide imagen directa. Estado: **identificado**, sin crear.

## Actualizacion 2026-06-02 — flow de VIDEO + inputs de diversidad

El flow se corrigio a `output_type=video` (el video dejo de ser opcional: se elimino el input `generar_video` y su binding `prune_if_false`; la rama Kling siempre corre). Se agregaron 3 inputs de diversidad que el usuario elige y que alimentan al prompter dinamico (RAG + vector global `ai_global_vectors`):

| key | input_type | data_type | reuso | alimenta |
|-----|-----------|-----------|-------|----------|
| `escenario` | select | string | reuso puro | escena de la imagen (donde vive el producto); opciones curadas + "automatico" |
| `props` | textarea | string | reuso puro | elementos alrededor del producto (texto libre, separa por comas) |
| `movimiento_video` | select | string | reuso puro | prompt de movimiento del Kling (push-in/orbita/tilt/parallax/dolly...); opciones + "automatico" |

Todos OPCIONALES — vacio = el prompter decide (cae a RAG+producto). Valores de las options en INGLES (alimentan el prompt directo); labels en español.

**Video slots dinamicos:** se agregaron 3 `prompt_slots` con `kind=video` (nodes 19/20/21, `derives_from` 10/11/12) a `comfy_flow_definitions`. Antes el prompt Kling estaba HARDCODEADO a IGNIS AFTERBURN (fresas/cerezas/lata roja) para toda produccion. Ahora el resolver hace DOS PASADAS: imagenes primero (escenas), luego video anclado a la escena producida (`scene_anchor` fiel) + `camera_movement`/`action` adaptados al `movimiento_video` del usuario + playbook de VIDEO del vector (`camera_setup`). Validado dry-run: OVERDRIVE en marmol con orbita -> sin AFTERBURN, movimiento = orbita.

## Pendiente para ejecutar
- E2E real con generacion KIE (imagenes + videos Kling) — gated, cuesta creditos.
