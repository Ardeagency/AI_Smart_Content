# Análisis: Producción de video y uso de la API KIE (Kling)

Este documento resume el análisis de las **funciones de generación de video** en la página "Video" y el **uso de la API de KIE con Kling 3.0**.

---

## 1. Resumen ejecutivo

- **Página:** Video (`VideoView.js`) — generación de video con Kling 3.0.
- **API usada:** **KIE** (https://api.kie.ai), **no** la API oficial de Kling (api.klingai.com).
- **Modelo:** `kling-3.0/video`.
- **Flujo:** Usuario genera prompt (OpenAI) → Usuario pulsa "Producción" → Crear tarea en KIE → Polling de estado → Descarga vía proxy → Subida a Supabase → URL mostrada al usuario.

---

## 2. Arquitectura de producción de video

### 2.1 Flujo de usuario (producción)

1. **Director Brief:** El usuario escribe o genera (OpenAI) el texto del prompt en "Director Brief".
2. **Botón PROMPT:** Genera el prompt con OpenAI (`openai-cine-prompt`) y lo escribe en el Director Brief.
3. **Botón PRODUCCIÓN:** Envía el contenido a KIE para generar el video:
   - Valida que exista prompt (generado o escrito).
   - Construye payload con `mode`, `duration`, `aspect_ratio`, `sound`, `prompt` o `multi_shots`, y opcionalmente `kling_elements`.
   - POST a `/.netlify/functions/kling-video-create` → recibe `taskId`.
   - Inicia **polling** cada 3 s a `/.netlify/functions/kling-video-status?taskId=...` (máx 12 min).
   - Cuando `state === 'success'`: descarga el video con `/.netlify/functions/kie-video-download?videoUrl=...`, sube a Supabase (`production-outputs/kie-videos/{userId}/{taskId}.mp4`) y muestra la URL pública.

### 2.2 Por qué esta arquitectura (evitar timeout 524)

Las Netlify Functions tienen límite de ejecución (~10–26 s). La generación en KIE tarda **30–120 s**. Por tanto:

- Las funciones **solo crean** la tarea o **consultan** estado; **nunca** esperan a que el video esté listo.
- El **polling** lo hace el **frontend** (cada 3 s, hasta 12 min).
- Opcional: `KIE_VIDEO_CALLBACK_URL` en Netlify para que KIE notifique al terminar (permite reducir o reemplazar polling en el futuro).

---

## 3. Uso de la API de KIE con Kling

### 3.1 Endpoints KIE utilizados

| Acción        | Endpoint KIE                                      | Función Netlify (proxy)           |
|---------------|----------------------------------------------------|-----------------------------------|
| Crear tarea   | `POST https://api.kie.ai/api/v1/jobs/createTask`   | `kling-video-create` (POST)       |
| Consultar     | `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=` | `kling-video-status` (GET)  |
| Descarga      | — (URL devuelta por KIE en `resultUrls[0]`)        | `kie-video-download` (GET ?videoUrl=) |

- **Autenticación:** `Authorization: Bearer KIE_API_KEY` (variable en Netlify).
- **Base URL:** Configurable con `KIE_API_BASE_URL` (por defecto `https://api.kie.ai`).

### 3.2 Payload enviado a KIE (createTask)

El módulo compartido `functions/lib/kie-video-shared.js` construye el body que se envía a KIE:

- **model:** `"kling-3.0/video"` (fijo).
- **input** (objeto):
  - `mode`: `"pro"` o `"std"` (desde el selector en la página).
  - `sound`: boolean (toggle Sound).
  - `duration`: 1–12 segundos (número).
  - `aspect_ratio`: `"16:9"` | `"9:16"` | `"1:1"`.
  - **multi_shots** (requerido por la doc KIE):
    - `false`: single-shot → se envía `prompt` (string).
    - `true`: multi-shot → se envía `multi_prompt` (array de `{ prompt, duration }`).
  - `image_urls`: opcional; se deriva del primer `kling_element` referenciado (1–2 URLs para single, 1 para multi).
  - `kling_elements`: solo elementos cuyo `@name` aparece en el prompt y con ≥2 imágenes (o 1 video); máximo 4 imágenes por elemento.

- **callBackUrl:** opcional; se añade si existe `KIE_VIDEO_CALLBACK_URL` en Netlify.

Validaciones en backend:

- Prompt truncado a 2500 caracteres.
- Referencias `@name` en el prompt que no tengan elemento válido se eliminan del texto.
- Si el prompt queda vacío tras esa limpieza → 400.
- Multi-shot: hasta 5 shots; duración repartida con `distributeDuration(totalSec, n)` (1–12 s por shot).

### 3.3 Respuesta de KIE y uso en la app

- **Create:** `{ code: 200, data: { taskId } }`. La app solo usa `taskId` para polling.
- **RecordInfo:** `data.state` = `waiting` | `success` | `failed`. El proxy normaliza `failed` → `fail`.
- **Success:** `data.resultJson` (string o objeto) con `resultUrls: [url]`. La app toma `resultUrls[0]`, la pasa a `kie-video-download`, y sube el binario a Supabase.

Manejo de errores KIE en el proxy:

- 401 → mensaje "API Key inválida (revisa KIE_API_KEY)".
- 402 → "Saldo insuficiente en KIE".
- 422 → se devuelve detalle en `kieBody` para depuración.

---

## 4. Componentes por capa

### 4.1 Frontend (página Video)

| Archivo        | Responsabilidad principal                                                                 |
|----------------|--------------------------------------------------------------------------------------------|
| `js/views/VideoView.js` | UI de video, Director Brief, PROMPT (OpenAI), PRODUCCIÓN (KIE), construcción del payload, polling, descarga vía proxy y subida a Supabase. Constantes: `POLL_INTERVAL_MS = 3000`, `POLL_MAX_DURATION_MS = 12 * 60 * 1000`. |

- **Producción:** Solo se permite enviar si `hasGeneratedPrompt` y hay texto en el prompt (generado o manual).
- **kling_elements:** Se envían solo elementos de “escena” (excluye `_fromProductSelection`). Se añaden referencias `@name` al prompt si faltan.
- **Registro:** Tras crear la tarea se llama `saveSystemAIOutput` con `provider: 'kling_api'`, `output_type: 'video'`, `status: 'processing'`; al terminar se actualiza a `completed` o `failed` con `storage_path` y metadatos.

### 4.2 Backend (Netlify Functions)

| Archivo                    | Responsabilidad                                                                 |
|---------------------------|-----------------------------------------------------------------------------------|
| `functions/kling-video-create.js`  | POST → parse body, validar auth (`KIE_API_KEY`), delegar a `kie-video-shared.handleCreate`. |
| `functions/kling-video-status.js`   | GET ?taskId= → delegar a `kie-video-shared.handleStatus`.                         |
| `functions/kling-video.js`          | Router legacy: POST con `action: 'createTask'` → create; GET con taskId → status. |
| `functions/lib/kie-video-shared.js` | Lógica común: build payload KIE, `handleCreate` (POST createTask), `handleStatus` (GET recordInfo). |
| `functions/kie-video-download.js`   | GET ?videoUrl= → fetch de la URL de KIE y devolución del video en binario (evitar CORS). |

### 4.3 Documentación de referencia

- `docs/KIE-VIDEO-API.md`: Documentación de la API KIE (createTask, recordInfo, códigos de error, prevención 524).
- `docs/FLUJO-VIDEO-OPENAI-KIE.md`: Flujo OpenAI (prompt) → KIE (producción).
- `docs/KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md`: Comparativa con la API oficial de Kling (referencia; la app no la usa).

---

## 5. Observaciones y recomendaciones

### 5.1 Consistencia de provider en BD

- En `VideoView.js` se guarda `provider: 'kling_api'` en `saveSystemAIOutput`.
- En `docs/VERIFICACION-SYSTEM-AI-OUTPUTS.md` las consultas usan `provider = 'kie_api'`.

**Recomendación:** Unificar en un solo valor (por ejemplo `kie_api`, ya que la API usada es KIE) y actualizar código o documentación para que coincidan, para que los informes por provider sean correctos.

### 5.2 Producción y UX

- El flujo de “producción” está bien separado: primero prompt (OpenAI), luego envío a KIE.
- Validación en front y en backend evita llamadas sin prompt.
- Mensajes de error (401, 402, 422, timeout) se propagan al usuario.

### 5.3 Uso de la API KIE

- Uso correcto del modelo `kling-3.0/video` y de los endpoints createTask y recordInfo.
- `multi_shots` siempre definido (boolean + `prompt` o `multi_prompt`).
- Elementos enviados solo si están referenciados en el prompt y cumplen requisitos de medios (≥2 imágenes o 1 video).
- Buen manejo de errores y de estados (waiting/success/fail).

### 5.4 Mejoras opcionales

- Configurar **KIE_VIDEO_CALLBACK_URL** en producción para recibir notificación al terminar y reducir dependencia del polling o acortar tiempo de espera percibido.
- Revisar si las URLs de KIE en `resultUrls` tienen tiempo de vida corto (p. ej. 24 h); el flujo actual ya descarga y sube a Supabase de inmediato, lo cual es adecuado.
- Si aparece **524** (timeout del lado de KIE), la documentación sugiere: modo `std`, duración 5 s, menos imágenes, prompt más corto; ya está reflejado en `KIE-VIDEO-API.md`.

---

## 6. Conclusión

Las funciones de generación de video en la página "Video" están bien alineadas con la **API de KIE (Kling 3.0)**:

- **Producción:** Flujo claro (Director Brief → PROMPT → PRODUCCIÓN) con validaciones y feedback.
- **KIE:** Uso correcto de createTask y recordInfo, payload conforme a la documentación, arquitectura asíncrona que evita timeouts en Netlify.
- **Descarga y persistencia:** Proxy `kie-video-download` y subida a Supabase garantizan que el video quede guardado en la cuenta del usuario con URL pública.

Punto a corregir: unificar el valor de `provider` (`kling_api` vs `kie_api`) entre código y documentación para un análisis correcto de outputs por proveedor.
