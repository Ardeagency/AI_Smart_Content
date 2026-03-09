# Lógica del body para video (KIE createTask)

- **image_urls:** TODAS las imágenes (producto, escena, adjuntos) se envían aquí por defecto.
- **kling_elements:** **Solo productos** y solo si el usuario activa la chincheta en ese producto. Escenas y archivos adjuntos **nunca** son `kling_elements`; solo contribuyen a `image_urls`.

---

## Cuándo se selecciona escena o producto

### Frontend (VideoView.js)

1. **Payload base:** `action: 'createTask'`, `mode`, `duration`, `aspect_ratio`, `sound`, y `prompt` o `multi_shots`.

2. **image_urls:** Se construye con **todas** las URLs de imagen de todos los elementos (producto, escena, adjuntos). Por defecto todo va como referencia visual en `image_urls`.

3. **kling_elements:** Solo **productos** con chincheta activada. Formato obligatorio por elemento:
   - `name`: nombre del producto.
   - `description`: descripción del producto (si no hay, se usa el nombre).
   - `element_input_urls`: exactamente 2 URLs del producto (si el producto tiene 1 imagen se duplica; si tiene 2 o más se usan las 2 primeras).
   - La chincheta solo se muestra en chips de **producto**; escenas y adjuntos no tienen chincheta y nunca se envían como `kling_elements`.

4. **Resumen:** Todas las imágenes → `image_urls`. Solo productos anclados (chincheta activa) → `kling_elements` con name, description y element_input_urls (2 URLs). Se añaden `@nombre` al prompt solo para esos productos.

---

## Backend (kie-video-shared.js)

1. **image_urls:** Si el body trae `body.image_urls` (array), se usa tal cual para `input.image_urls`. Si no, se deriva del primer `kling_element` (compatibilidad).

2. **kling_elements:** Solo productos anclados; el frontend ya envía el formato correcto (name, description, element_input_urls con 2 URLs). El backend sigue validando y duplicando URL si recibe 1.

3. **input hacia KIE:** `mode`, `sound`, `duration` (string), `aspect_ratio`, `image_urls`, `multi_shots`/`prompt` o `multi_prompt`, y opcionalmente `kling_elements`.
