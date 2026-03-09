# Lógica del body para video (KIE createTask)

- **image_urls:** TODAS las imágenes (producto, escena, adjuntos) se envían aquí por defecto.
- **kling_elements:** Solo los elementos que el usuario **ancla** con el ícono de chincheta; esos van con `element_input_urls` (o `element_input_video_urls`) para referencias nombradas en el prompt (`@nombre`).

---

## Cuándo se selecciona escena o producto

### Frontend (VideoView.js)

1. **Payload base:** `action: 'createTask'`, `mode`, `duration`, `aspect_ratio`, `sound`, y `prompt` o `multi_shots`.

2. **image_urls:** Se construye con **todas** las URLs de imagen de todos los elementos (producto, escena, adjuntos). Por defecto todo va como referencia visual en `image_urls`.

3. **kling_elements:** Solo se envían elementos **anclados** (chincheta activa):
   - Cada imagen tiene un botón de chincheta (📌). Si el usuario hace clic y **ancla** una imagen, esa imagen pasa a formar parte de un elemento en `kling_elements` con `element_input_urls` (y se añade `@nombre` al prompt si falta).
   - Elementos solo-video tienen una chincheta a nivel de chip; al anclar, el elemento va a `kling_elements` con `element_input_video_urls`.
   - Si ninguna imagen/chip está anclada, `kling_elements` no se envía; solo se envían `image_urls`.

4. **Resumen:** Todas las imágenes → `image_urls`. Solo las ancladas → además en `kling_elements` con nombre y sus URLs, y referencias `@nombre` en el prompt.

---

## Backend (kie-video-shared.js)

1. **image_urls:** Si el body trae `body.image_urls` (array), se usa tal cual para `input.image_urls`. Si no, se deriva del primer `kling_element` (compatibilidad).

2. **kling_elements:** Vienen solo los anclados desde el frontend. Se filtran por `@name` en el prompt; si un elemento tiene 1 imagen se duplica a 2 URLs para el formato KIE.

3. **input hacia KIE:** `mode`, `sound`, `duration` (string), `aspect_ratio`, `image_urls`, `multi_shots`/`prompt` o `multi_prompt`, y opcionalmente `kling_elements`.
