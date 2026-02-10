# Input Taxonomy – AI Smart Content

Sistema de definición de interfaces dinámicas para flujos de IA. Cada input es un **UI Component Template** con data schema, comportamiento, reglas y visibilidad.

---

## Visibilidad

| Modo | Descripción |
|------|-------------|
| **paas** | Visible en Builder (desarrollador). |
| **saas** | Visible al usuario final en Studio/formularios. |
| **advanced** | Solo en modo avanzado o configuración técnica. |

---

## Categorías y tipos (taxonomía oficial)

### 1. BASIC (foundation)

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `text` | string | Texto una línea | paas, saas |
| `textarea` | string | Texto multilínea | paas, saas |
| `number` | number | Numérico | paas, saas |
| `boolean` | boolean | Sí/No (checkbox o switch) | paas, saas |
| `select` | string | Lista desplegable | paas, saas |
| `multi_select` | array | Selección múltiple | paas, saas |
| `checkbox` | boolean | Casilla única | paas, saas |
| `radio` | string | Opciones mutuamente excluyentes | paas, saas |
| `date` | string | Fecha | paas, saas |
| `file_upload` | string/object | Archivo (URL o metadata) | paas, saas |

### 2. SMART TEXT (diferenciadores AI)

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `prompt_input` | string | Prompt para IA, multilínea, monospace | paas, saas |
| `tag_input` | array | Tags/keywords | paas, saas |
| `slug_input` | string | Slug/URL amigable | paas, saas |

### 3. SELECTORES SEMÁNTICOS

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `tone_selector` | string | Tono de voz (value + semantic_key) | paas, saas |
| `mood_selector` | string | Mood/estado anímico | paas, saas |
| `length_selector` | string | Longitud contenido (corto/medio/largo) | paas, saas |

### 4. BRAND & IDENTITY (Supabase-native)

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `brand_selector` | uuid/object | Marca del usuario | paas, saas |
| `entity_selector` | uuid/object | Producto/servicio/place | paas, saas |
| `audience_selector` | uuid/object | Audiencia definida | paas, saas |
| `campaign_selector` | uuid/object | Campaña | paas, saas |

### 5. MEDIA & REFERENCE

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `image_selector` | string/object | Imagen única (URL + metadata) | paas, saas |
| `gallery_picker` | array | Múltiples imágenes | paas, saas |
| `product_selector` | uuid/object | Selector de producto (único/múltiple) | paas, saas |

### 6. CONTROLS

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `range` | number | Slider numérico | paas, saas |
| `switch` | boolean | Toggle on/off | paas, saas |

### 7. ESTRUCTURAL (no guardan data de usuario)

| type | data_type | Descripción | visibility |
|------|-----------|-------------|------------|
| `section` | — | Agrupador visual | paas |
| `divider` | — | Línea separadora | paas |
| `description_block` | — | Texto informativo fijo | paas, saas |

---

## Estructura base_schema (por plantilla)

Cada fila en `ui_component_templates` tiene:

- **name**: identificador legible (ej. `prompt_input`).
- **category**: `basic`, `smart_text`, `semantic`, `brand`, `media`, `controls`, `structural`.
- **base_schema**: JSON con:
  - `type` o `input_type`: tipo de la taxonomía.
  - `data_type`: `string`, `number`, `boolean`, `array`, `object`.
  - `ui`: componente sugerido, rows, placeholder, etc.
  - `behavior`: supports_ai, supports_variables, etc. (opcional).
  - `validation`: required, min_length, max_length, etc. (opcional).
  - `visibility`: `["paas", "saas"]` (opcional).

Ejemplo `prompt_input`:

```json
{
  "type": "prompt_input",
  "input_type": "prompt_input",
  "data_type": "string",
  "ui": {
    "component": "Textarea",
    "rows": 6,
    "placeholder": "Describe the scene...",
    "monospace": true
  },
  "behavior": { "supports_ai": true },
  "validation": { "required": true, "min_length": 20 },
  "visibility": ["paas", "saas"]
}
```

---

## Frontend: Input Registry

El frontend usa un **Input Registry** que:

1. Resuelve el tipo desde `field.input_type` o `field.type`.
2. Renderiza con la plantilla correspondiente (preview en Builder, formulario en Studio/Test).
3. No hardcodea inputs: `renderComponent(template.base_schema, instance_config)`.

Archivo: `js/input-registry.js`.
