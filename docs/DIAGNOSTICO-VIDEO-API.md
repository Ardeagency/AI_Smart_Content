# Diagnóstico: página Video y llamadas a APIs (KIE vs Kling 3.0)

## Resumen ejecutivo

- **La app usa la API de KIE** (proxy `kling-video` → `api.kie.ai`, modelo `kling-3.0/video`). Ver [KIE-VIDEO-API.md](./KIE-VIDEO-API.md).
- Se detectaron **errores en la forma de llamar a la API**: el front envía `aspect_ratio` y `sound` pero el proxy **no los reenvía** al backend de Kling.
- El **polling** (cada 15 s) y la **normalización de estado** están bien planteados; la respuesta se adapta a varios formatos (Kling oficial, KIE, kling3api.com).

---

## 1. Plataforma KIE (api.kie.ai)

### Qué es

- **KIE** es una plataforma agregadora de APIs de IA: Runway, Veo 3.1, etc.
- Base URL: `https://api.kie.ai`
- Documentación: [docs.kie.ai](https://docs.kie.ai/)
- Autenticación: `Authorization: Bearer <API_KEY>` (crear en [kie.ai/api-key](https://kie.ai/api-key)).

### Modelos de video en KIE

- **Runway API**: video corto (5–10 s) desde texto o imagen.
- **Veo 3.1**: modelo de Google, text-to-video e image-to-video.
- En la documentación pública de KIE **no aparece un modelo “Kling 3.0”**; el doc deprecado del proyecto (`KIE-VIDEO-API.md`) sí menciona `model: "kling-3.0/video"` en la API de KIE, por lo que en el pasado KIE pudo ofrecer Kling.

### Flujo típico en KIE

1. **Crear tarea**: `POST https://api.kie.ai/api/v1/jobs/createTask` con `model` e `input`.
2. Respuesta: `task_id` (la respuesta 200 solo indica que la tarea se creó).
3. **Consultar estado**: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=xxx` (polling o webhook).
4. Cuando `data.state === 'success'`, el resultado suele venir en `data.resultJson` (p. ej. `resultUrls`).

### Uso en este proyecto

- **Se usa KIE.** El proxy `kling-video` llama a **api.kie.ai** (createTask + recordInfo) con `KIE_API_KEY`. El front no cambia: mismo contrato (taskId, state, resultJson).

---

## 2. API Kling 3.0

Hay dos referencias útiles: la **oficial** (Kling) y la de **terceros** (kling3api.com).

### 2.1 API oficial (api.klingai.com) — lo que usa nuestro proxy

- Base URL configurable: por defecto `https://api.klingai.com` (env: `KLING_API_BASE_URL`).
- **Por defecto** el proxy usa la **API unificada oficial**:
  - Crear: `POST /v1/video/generations` con body `model`, `prompt`, `mode`, `aspect_ratio`, `duration`, `image` / `image_tail` / `image_list`, `sound`.
  - Estado: `GET /v1/video/generations/{task_id}`.
- Si se configura **`KLING_USE_V3_PATHS=1`**, se usan las rutas alternativas: `POST /v1/ai/video/kling-v3-pro` (o `-std`) y `GET /v1/ai/video/kling-v3/{task-id}`.
- Autenticación: `KLING_API_KEY` (Bearer) o `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (JWT HS256 generado por el proxy).
- Referencia en el repo: [KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md](./KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md).

### 2.2 Kling 3.0 vía terceros (kling3api.com)

- Base: `https://kling3api.com`.
- Crear: `POST /api/generate` con body que incluye `type` (p. ej. `pro-text-to-video`, `pro-image-to-video`), `prompt`, `duration`, `aspect_ratio`, `sound`, `image`, `end_image`, etc.
- Estado: `GET /api/status?task_id=xxx`.
- Respuesta de estado: `data.status` (SUCCESS / IN_PROGRESS), `data.response` = array de URLs de video.
- Documentación: [kling3api.com/docs](https://kling3api.com/docs).

Nuestro proxy **no** está configurado para kling3api.com; está pensado para api.klingai.com. Si se quisiera usar kling3api.com, habría que cambiar `KLING_API_BASE_URL` y posiblemente las rutas (o añadir un modo “provider” en el proxy).

---

## 3. Flujo actual en la app (página Video)

1. Usuario escribe Director Brief y pulsa Generar.
2. **VideoView** envía `POST /api/kling-video` con:
   - `action: 'createTask'`, `mode`, `prompt` o `multi_shots`, `duration`, `aspect_ratio`, `sound`, `kling_elements`.
3. **Netlify** reescribe a `/.netlify/functions/kling-video`.
4. **kling-video.js**:
   - Con POST: llama a `api.klingai.com` (create) y devuelve `taskId`.
   - Con GET: llama a la ruta de estado con `taskId` y devuelve respuesta **normalizada** con `data.state`, `data.resultJson`, `data.failMsg`.
5. **VideoView** hace **polling** cada 15 s a `GET /api/kling-video?taskId=xxx` hasta `data.state === 'success'` o `'fail'`.
6. Si success: lee `resultUrls` de `data.resultJson`, descarga el video con `GET /api/kie-video-download?videoUrl=...`, sube a Supabase y muestra la URL pública.

La **espera** es por polling; no hay webhook. El intervalo de 15 s es razonable; se podría hacer configurable o usar backoff si la API lo recomienda.

---

## 4. Problemas detectados y correcciones

### 4.1 Parámetros no reenviados al crear tarea (corregido en código)

- El **front** envía `aspect_ratio` y `sound` en el body del POST.
- El **proxy** (`kling-video.js`) **no** los incluía en el payload que envía a la API de Kling.
- **Corrección**: En la función que construye el payload de create (en `kling-video.js`), se añaden `aspect_ratio` y `sound` al objeto que se envía a Kling, mapeando desde el body del front. Así la API recibe formato y sonido correctos.

### 4.2 Posible discrepancia de rutas con la API oficial

- En [KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md](./KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md) se indica que la API unificada sería `POST /v1/video/generations` (con `model` en el body), no `/v1/ai/video/kling-v3-pro`.
- Si en producción fallan las llamadas (404, 422, etc.), revisar en la documentación actual de Kling (app.klingai.com) las rutas y el body exactos. Las variables `KLING_API_BASE_URL`, `KLING_API_STATUS_PATH` y `KLING_API_STATUS_USE_QUERY` permiten ajustar base y ruta de estado sin cambiar código.

### 4.3 Normalización de estado

- `normalizeStatusResponse` en `kling-video.js` ya contempla varias formas de respuesta:
  - `task_result.videos`, `task_result.video_url`, `task_result.url`, `video_url` en raíz o en `data`, `response` como array.
  - Estados: `succeeded` / `completed` / `success` → `success`; `failed` / `error` → `fail`; resto → `waiting`.
- Con eso se cubre tanto una respuesta tipo Kling como una tipo KIE o kling3api.com. Si en el futuro la API devuelve otro campo de URL o estado, basta añadirlo en `normalizeStatusResponse`.

### 4.4 Descarga del video

- La descarga sigue haciendo uso del proxy `kie-video-download` (nombre heredado de KIE). Solo descarga por GET desde una URL; sirve para cualquier URL de video (Kling, KIE, etc.). No requiere cambios para el diagnóstico.

---

## 5. Checklist de verificación

- [ ] En Netlify: `KLING_API_KEY` **o** (`KLING_ACCESS_KEY` + `KLING_SECRET_KEY`) configurados.
- [ ] Si se usa api.klingai.com: confirmar en la documentación oficial que las rutas son `/v1/ai/video/kling-v3-pro` y `/v1/ai/video/kling-v3/{taskId}` (o ajustar con las env de path).
- [ ] Tras el cambio en código: el proxy envía `aspect_ratio` y `sound` en el create.
- [ ] Polling: primera consulta al crear tarea y luego cada 15 s hasta `success` o `fail`.
- [ ] Si se opta por **KIE** en el futuro: nuevo proxy (o rama del actual) que llame a `api.kie.ai` con `KIE_API_KEY` y mapee createTask ↔ createTask KIE y GET status ↔ recordInfo.

---

## 6. Referencias

- KIE: [docs.kie.ai](https://docs.kie.ai/), [kie.ai/api-key](https://kie.ai/api-key).
- Kling 3.0 (terceros): [kling3api.com/docs](https://kling3api.com/docs).
- Kling oficial: [app.klingai.com](https://app.klingai.com) (documentación en el navegador).
- En este repo: [KLING-VIDEO-API.md](./KLING-VIDEO-API.md), [KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md](./KLING-API-ANALISIS-TEXT-IMAGE-VIDEO.md), [KIE-VIDEO-API.md](./KIE-VIDEO-API.md) (deprecado).
