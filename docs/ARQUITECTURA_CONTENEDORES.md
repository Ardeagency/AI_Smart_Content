# Arquitectura por contenedores (Render Container Registry)

El frontend **no** entiende semántica (`system_prompt`, `brand_selector`, etc.). Solo entiende **contenedores**. Toda la variación vive en schema/config/metadata/permisos.

---

## Regla de oro

- **Frontend:** `render(container_type, config)` — nunca `if (input.type === "brand_selector")`.
- **Backend / Builder:** Define comportamiento mediante schema y config.

---

## Los 8 contenedores

| Contenedor | Uso | Config típica (schema) |
|------------|-----|------------------------|
| **STRING_CONTAINER** | text, textarea, prompt_user, prompt_system, tags, code, markdown, slug, labels | `mode`: single_line \| multi_line \| tags \| prompt \| code \| markdown; rows, maxLength, placeholder, supportsVariables |
| **SELECT_CONTAINER** | dropdown, multi_select, tone_selector, brand_selector, campaign_selector, audience_selector, enums | `selectionMode`: single \| multiple; `dataSource`: static \| rpc \| relational; options, labelKey, valueKey, searchable |
| **MEDIA_CONTAINER** | carrusel, grid, gallery, moodboard, visual references, image_selector | layout, selectionMode, maxSelection, thumbnailStrategy |
| **BOOLEAN_CONTAINER** | checkbox, switch, toggle | `display`: checkbox \| switch \| toggle; defaultValue |
| **NUMBER_CONTAINER** | number, stepper, counter, rating | display: input \| stepper \| rating; min, max, step |
| **RANGE_CONTAINER** | range, sliders, tuning | min, max, step, dualRange, units |
| **FILE_CONTAINER** | upload, CSV/JSON import | fileTypes, multiUpload, parseStrategy, preview |
| **STRUCTURAL_CONTAINER** | section, divider, accordion, tabs, repeater, group | layoutType, collapsible, repeatable |

---

## Mapeo input_type → contenedor

El `input-registry.js` mantiene `INPUT_TYPE_TO_CONTAINER`. Ejemplos:

- `text`, `textarea`, `prompt_input`, `prompt_user`, `prompt_system`, `tag_input`, `slug_input`, `code_input`, `markdown`, `labels` → **STRING_CONTAINER**
- `select`, `multi_select`, `tone_selector`, `brand_selector`, `campaign_selector`, `audience_selector`, `product_selector` → **SELECT_CONTAINER**
- `image_selector`, `gallery_picker`, `visual_reference` → **MEDIA_CONTAINER**
- `checkbox`, `switch`, `boolean`, `toggle` → **BOOLEAN_CONTAINER**
- `number`, `stepper`, `rating` → **NUMBER_CONTAINER**
- `range` → **RANGE_CONTAINER**
- `file`, `upload` → **FILE_CONTAINER**
- `section`, `divider`, `description_block`, `accordion`, `tabs`, `repeater`, `group` → **STRUCTURAL_CONTAINER**

---

## API pública (InputRegistry)

- **`CONTAINER_TYPES`** – Array de los 8 nombres de contenedor.
- **`getContainerType(field)`** – Devuelve el contenedor para un campo (`field.input_type` / `field.type`).
- **`renderPreview(field)`** – Renderiza preview por contenedor (canvas Builder).
- **`renderFormField(field, opts)`** – Renderiza input de formulario por contenedor.
- **`CONTAINER_RENDERERS`** – Objeto contenedor → `{ preview(field), form(field, opts) }` (avanzado).
- **`isStructural(field)`** – `getContainerType(field) === 'STRUCTURAL_CONTAINER'`.
- **`hasOwnLabel(field)`** – `getContainerType(field) === 'BOOLEAN_CONTAINER'`.

---

## Ejemplo: mismo contenedor, distinta config

`system_prompt` y `user_prompt` son el **mismo contenedor** (STRING_CONTAINER):

- **system_prompt:** `container: STRING_CONTAINER`, config: `mode: prompt`, `permissions: system_only`
- **user_prompt:** `container: STRING_CONTAINER`, config: `mode: prompt`, `permissions: user_editable`

El frontend no branch por tipo; el schema define comportamiento y permisos.

---

## Checklist para nuevos “tipos”

Si alguien pide un “nuevo input tipo X”, la respuesta correcta es:

1. ¿En qué contenedor existente cae?
2. Si no cae en ninguno → entonces sí se valora un contenedor nuevo.

Esto mantiene el frontend con ~8 contenedores y escalabilidad en schema.
