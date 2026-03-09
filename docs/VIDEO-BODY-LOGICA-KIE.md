# Lógica del body para video (KIE createTask)

Alineado al [ejemplo oficial KIE](https://kie.ai): `duration` en string, `image_urls` con al menos una URL, `kling_elements` con `element_input_urls` de **2 URLs** (first frame + end frame; si solo hay 1 imagen se duplica).

---

## Cuándo se selecciona escena o producto

### Frontend (VideoView.js) – qué se envía al proxy

1. **Payload base:** `action: 'createTask'`, `mode` (pro/std), `duration` (string "5"/"10"/"12"), `aspect_ratio`, `sound`, y **o bien** `prompt` (single) **o bien** `multi_shots` (array de `{ prompt }`).

2. **kling_elements:** Se envían **todos** los elementos que tengan al menos una URL (imagen o video):
   - **Producto:** si en Asset Stack eliges un producto, se añade un elemento con `name` (ej. `Licuadora_Oster`), `element_input_urls` = `product.image_urls`, y `_fromProductSelection: true`. Ese elemento **sí** se incluye en el payload (escena + producto).
   - **Escena:** si eliges producciones en la galería, cada una es un elemento con `name` tipo `produccion_123`, `element_input_urls: [p.media_url]` (1 URL), `_fromProductionQueue: true`. También se incluyen en el payload.
   - **Elementos manuales:** los que subes con “Añadir elemento” (2–4 imágenes o 1 video). Se envían igual.

3. **Referencias @name en el prompt:** Para que KIE use cada elemento, el prompt debe contener `@nombre`. El frontend añade al final del prompt las que falten (ej. `" ... @Licuadora_Oster @produccion_123"`).

4. **Resumen:** Con producto + escena seleccionados, el body al proxy tiene `prompt` (o `multi_shots`), `kling_elements: [ { name, description?, element_input_urls, element_input_video_urls? }, ... ]` con ambos tipos, y el prompt ya incluye los `@name` necesarios.

---

## Backend (kie-video-shared.js) – qué se envía a KIE

1. **Filtrado de elementos:** Solo se mantienen elementos cuyo `@name` aparece en el prompt y que tienen al menos 1 imagen (o 1 video). Se construye `kling_elements` y se eliminan referencias huérfanas del texto.

2. **element_input_urls:** El ejemplo KIE usa **2 URLs** por elemento (first frame, end frame). Si un elemento viene con **1 sola imagen**, el backend la duplica: `[url, url]`, para cumplir el formato esperado por la API.

3. **image_urls:** Se derivan del **primer** elemento de `kling_elements`: 1 URL (multi_shot) o 1–2 URLs (single). Así KIE recibe siempre `image_urls` cuando hay elementos con imágenes.

4. **input hacia KIE (como en el ejemplo):**
   - `mode`, `sound`, `aspect_ratio`
   - **duration:** siempre **string** (ej. `"5"`), no número.
   - `multi_shots`: `false` → se envía `prompt`; `true` → se envía `multi_prompt`.
   - `image_urls` (array), si hay elementos con imágenes.
   - `kling_elements` (array), cada uno con `name`, opcional `description`, `element_input_urls` (2–4 URLs; si había 1, se duplicó).

5. **Payload final:** `{ model: 'kling-3.0/video', input: { ... }, callBackUrl? }`.

---

## Cambios para evitar 422 (Unprocessable Content)

- **duration:** Antes se enviaba como número (`5`). KIE en el ejemplo usa string (`"5"`). Ahora `input.duration` es siempre string.
- **element_input_urls con 1 imagen:** KIE espera 2 URLs por elemento (first/end frame). Si el elemento tenía solo 1 URL, ahora se envía `[url, url]` en lugar de `[url]`.

Con esto el body queda alineado al ejemplo oficial y se evita el 422 por tipo o estructura.
