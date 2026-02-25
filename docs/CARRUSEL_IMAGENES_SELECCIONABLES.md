# Carrusel de imágenes seleccionables – construcción y lógica

## 1. Dónde se define

- **Input Registry** (`js/input-registry.js`): define el tipo `image_selector` y cómo se renderiza en **formulario** y en **preview**.
- **StudioView** (`js/views/StudioView.js`): rellena el carrusel con datos (productos) y maneja la selección cuando el formulario es el del Estudio.

---

## 2. Tipo de campo y contenedor

- En el schema del flujo, el campo tiene `input_type: 'image_selector'` (o `type: 'image_selector'`).
- En el registry, `image_selector` está mapeado al contenedor **MEDIA_CONTAINER** (línea 52).
- Para MEDIA_CONTAINER, el **form** (formulario consumidor) llama a **`formImageSelectorCarousel(f, opts)`** (líneas 774–776, 853).

---

## 3. Cómo se genera el HTML del carrusel (formulario)

Función: **`formImageSelectorCarousel(f, opts)`** (input-registry.js, ~709–720).

**Entrada:** un objeto campo `f` del `input_schema` (tiene `key`, `name`, `label`, `input_type`, `media_source`, etc.) y `opts` (p. ej. `idPrefix: 'studio-'`).

**Lógica:**

1. **Atributos del campo:** `formAttrs(f, opts)` → `name = (opts.namePrefix || '') + (f.key || 'field')`. En Estudio no se pasa `namePrefix`, así que `name` = **key del schema** (ej. `productos`).

2. **Origen de medios:**  
   `source = f.media_source || f.function_type || 'other'`  
   Si el flujo no define `media_source`, queda **`'other'`**.

3. **Modo selección:**  
   `multi = f.image_selection_mode === 'multiple' || f.selection_mode === 'multiple'`  
   → `data-selection-mode="single"` o `"multiple"`.

4. **Placeholder:**  
   `placeholderLabel = getMediaSourceLabel(source)` → para `'products'` es "Selector de Productos", para `'other'` es **"Selector de imagen"**.

5. **HTML generado:**

```html
<div class="image-selector-carousel"
     data-media-source="products"   <!-- o "other", "references", etc. según f.media_source -->
     data-selection-mode="single"
     data-key="productos"           <!-- f.key del schema -->
     data-field-name="productos">
  <div class="image-selector-carousel-track image-selector-carousel-track--empty"
       data-empty-msg="Selector de imagen"></div>
  <input type="hidden" id="studio-productos" name="productos" value="">
</div>
```

- El **track** sale vacío (solo la clase `--empty` y el `data-empty-msg`).
- El **valor del campo** se guarda en el `<input type="hidden">`:  
  - modo **single**: un solo ID (ej. UUID del producto);  
  - modo **multiple**: JSON array de IDs, ej. `["uuid1","uuid2"]`.

---

## 4. Quién rellena el track y con qué

- El **Input Registry no rellena** el track; solo pinta la “cáscara” (contenedor vacío + hidden).
- La vista que muestra el formulario debe **poblar el track** y **escribir en el hidden** al seleccionar.

En **Estudio** eso lo hace **StudioView**:

1. Tras pintar el formulario con `renderFormFromSchema`, se llama en `setTimeout(0)` a **`populateImageSelectorCarousels()`**.
2. Esa función:
   - Busca carruseles que deban mostrarse como **productos** (por `data-media-source="products"`, por key/field que contenga "product", por label "producto(s)", o por ser el único carrusel que no es "references").
   - Para esos carruseles llama a **`_fillProductCarousels(carousels)`**.
3. **`_fillProductCarousels`**:
   - Obtiene `brand_container_id` de la organización (primer `brand_containers` de la org).
   - Carga productos con **`loadProductsWithImages(brandContainerId)`** (tablas `products` + `product_images`).
   - Por cada carrusel:
     - Localiza el **`.image-selector-carousel-track`** y el **`input[type="hidden"]`**.
     - Quita la clase `--empty` y reemplaza el contenido del track por **tarjetas** (`.image-selector-card`), una por producto, con `data-product-id`, imagen principal y nombre.
     - Añade **listeners** a cada tarjeta: al hacer clic, actualiza el hidden (un id o JSON de ids) y llama a `updateCreditsDisplay()`.

Si **nunca** se considera ese carrusel como “de productos” (p. ej. `media_source` es `'other'` y key/label no coinciden con la lógica actual), el track **no se rellena** y solo se ve el estado vacío (mensaje tipo “Selector de imagen”).

---

## 5. Flujo de datos resumido

```
input_schema del flujo (flow_modules.input_schema.fields)
  → campo con input_type: 'image_selector', key, label, media_source, etc.
       ↓
InputRegistry.renderFormFromSchema(fields, opts)
  → getContainerType(field) === 'MEDIA_CONTAINER'
  → MEDIA_CONTAINER.form(field, opts) === formImageSelectorCarousel(field, opts)
       ↓
HTML: .image-selector-carousel (vacío) + .image-selector-carousel-track--empty + input[hidden]
  data-media-source = field.media_source || 'other'
  data-key = field.key
  input name = field.key (en Estudio no se usa namePrefix)
       ↓
StudioView.renderFlowForm(flow) → setTimeout → populateImageSelectorCarousels()
  → decide qué carruseles son “de productos” (por source, key o label)
  → _fillProductCarousels(carousels)
       ↓
loadProductsWithImages(brandContainerId) → productos con .images
  → rellena cada track con .image-selector-card (data-product-id, img, nombre)
  → listeners en cada card → hidden.value = id o JSON array
```

---

## 6. Punto crítico para “productos”

- Para que el carrusel se **identifique como selector de productos** y se rellena con productos de la marca, hace falta **una** de estas condiciones en el front (StudioView):
  1. **`data-media-source="products"`** → el campo del schema debe tener **`media_source: 'products'`** en el flujo (en `flow_modules.input_schema.fields`).
  2. O que el **key/name** del campo contenga "product" (ej. key `"productos"`).
  3. O que el **label** del campo (el que se pinta arriba del carrusel) contenga "producto".
  4. O que sea el **único** carrusel que no es `references`.

Si el flujo se creó con un campo `image_selector` **sin** `media_source: 'products'` y con key/label que no cumplan 2–4, el carrusel sale vacío y se ve solo “Selector de imagen”.

---

## 7. Resumen de la lógica del carrusel

| Parte | Responsable | Lógica |
|-------|------------|--------|
| **Estructura HTML** | input-registry `formImageSelectorCarousel` | Contenedor + track vacío + hidden; atributos desde `f` (key, media_source, single/multiple). |
| **Valor del campo** | input-registry (contrato) | Hidden: 1 id (single) o JSON array de ids (multiple). |
| **Contenido del track** | StudioView (u otra vista) | No lo rellena el registry; la vista carga datos (productos) y pinta tarjetas. |
| **Cuándo es “productos”** | StudioView `populateImageSelectorCarousels` | Por `data-media-source="products"`, key/field con "product", label con "producto", o único carrusel no-references. |
| **Datos** | StudioView `loadProductsWithImages` | `brand_containers` → `products` por `brand_container_id` → `product_images` por `product_id`. |

---

## 8. Datos enviados al webhook (producción)

Cuando el usuario pulsa **Producir**, StudioView recoge todo el formulario con **`collectFormData()`** y envía ese objeto como **body** del request al webhook (POST por defecto).

### Cómo se recogen los datos

- **`collectFormData()`** (StudioView.js, ~890): recorre todos los `input`, `textarea` y `select` dentro de `#studioFlowForm`.
- Por cada elemento usa el atributo **`name`** como clave del payload y **`value`** como valor.
- El carrusel de productos tiene un **`<input type="hidden" name="...">`** cuyo `name` es el **key del campo** en el schema (ej. `productos`). Ese input se actualiza al hacer clic en una tarjeta.

### Valor del selector de productos en el payload

| Modo | Contenido del hidden | En el payload (clave = key del campo, ej. `productos`) |
|------|----------------------|--------------------------------------------------------|
| **Selección única** | Un UUID (ej. `"a1b2c3d4-..."`) | **String**: el ID del producto seleccionado. |
| **Selección múltiple** | JSON array de UUIDs (ej. `["uuid1","uuid2"]`) | **Array de strings**: lista de IDs de productos. |

Si el valor del hidden empieza por `[` o `{`, `collectFormData()` hace **`JSON.parse`** y guarda el resultado (objeto o array). Por eso en modo múltiple el webhook recibe un array real, no la cadena.

### Ejemplo de payload al webhook (con enriquecimiento)

Para un flujo con campos `productos` (image_selector, single), `colores` y `aspect_ratio`, el webhook recibe el **objeto completo** del producto (vía RPC `get_products_full_by_ids`):

```json
{
  "productos": {
    "id": "8ecd5e72-6277-4abf-a136-8a9100ff66ca",
    "nombre_producto": "Licuadora Oster",
    "descripcion_producto": "...",
    "precio_producto": 99.99,
    "moneda": "USD",
    "images": [
      { "image_url": "https://...", "image_type": "principal", "image_order": 0 }
    ]
  },
  "colores": ["#3b82f6"],
  "aspect_ratio": "1:1"
}
```

Si el selector de productos es **múltiple**, `productos` es un **array** de esos objetos.

### Resumen (después del enriquecimiento)

- **Clave en el payload**: el **key** del campo en `input_schema` (ej. `productos`).
- **Valor**: el webhook recibe **todos los datos del producto** (objeto o array de objetos), no solo el UUID:
  - StudioView llama a la RPC **`get_products_full_by_ids`** con el/los ID(s) seleccionados.
  - Cada objeto incluye: `id`, `brand_container_id`, `tipo_producto`, `nombre_producto`, `descripcion_producto`, `precio_producto`, `moneda`, `entity_id`, `beneficios_principales`, `diferenciadores`, `casos_de_uso`, `caracteristicas_visuales`, `materiales_composicion`, `variantes`, `url_producto`, `created_at`, **`images`** (array de `{ image_url, image_type, image_order }`).
- **Selección única**: el valor es un único objeto. **Selección múltiple**: el valor es un array de objetos.

Si quieres, el siguiente paso puede ser: (1) asegurar en el Builder que al guardar un campo `image_selector` para productos se persista `media_source: 'products'`, o (2) revisar el `input_schema` del flujo “Product Render Futurista” en BD y proponer un parche SQL para ese flujo.
