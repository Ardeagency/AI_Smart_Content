# API de video Kling – Referencia (no usada en este proyecto)

> **En este proyecto usamos la API de KIE (kie.ai), no la API oficial de Kling.** La implementación real está en [KIE-VIDEO-API.md](./KIE-VIDEO-API.md). Este documento es de referencia o comparación con la API oficial de Kling (`https://api.klingai.com`).

## Resumen

- El proxy Netlify `kling-video` usa por defecto la **API unificada oficial**:
  - **Crear:** `POST /v1/video/generations` (body: `model`, `prompt`, `mode`, `aspect_ratio`, `duration`, `image` / `image_tail` / `image_list`, `sound`).
  - **Estado:** `GET /v1/video/generations/{task_id}` hasta `status: completed`/`success` y se obtiene la URL del video.
- Si en Netlify configuras **`KLING_USE_V3_PATHS=1`**, se usan las rutas alternativas: `POST /v1/ai/video/kling-v3-pro` (o `-std`) y `GET /v1/ai/video/kling-v3/{task-id}`.
- Autenticación: **Bearer token**. Puedes usar `KLING_API_KEY` (token directo) o **Access Key + Secret Key** (el proxy genera JWT).

## Variables de entorno (Netlify)

| Variable | Requerido | Descripción |
|----------|-----------|-------------|
| `KLING_API_KEY` | Sí* | Token Bearer directo (si tu cuenta usa un solo token). |
| `KLING_ACCESS_KEY` o `KLING_ACCESSS_KEY` | Sí* | Access Key (si usas JWT). |
| `KLING_SECRET_KEY` | Sí* | Secret Key para firmar el JWT. |
| `KLING_API_BASE_URL` | No | Base URL. Por defecto: `https://api.klingai.com`. |
| `KLING_USE_V3_PATHS` | No | `1` o `true` para usar rutas v3 (`/v1/ai/video/kling-v3-pro`, etc.) en lugar de la API unificada. |
| `KLING_API_CREATE_PATH` | No | Ruta POST crear. Por defecto: `/v1/video/generations`. |
| `KLING_API_STATUS_PATH` | No | Ruta base GET estado. Por defecto: `/v1/video/generations`. |
| `KLING_API_STATUS_USE_QUERY` | No | `1` o `true` para usar `?task_id=xxx` en lugar de `/{task_id}`. |

\* Una de estas opciones: **solo** `KLING_API_KEY`, **o** `KLING_ACCESS_KEY` + `KLING_SECRET_KEY`.

## Autenticación

- **Opción 1:** `KLING_API_KEY` → el proxy envía `Authorization: Bearer <KLING_API_KEY>`.
- **Opción 2:** `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` → el proxy genera un JWT (HS256, `iss` = access key, `iat`/`exp`) y lo envía como Bearer. Las claves no se exponen al cliente.

## Proxy Netlify (uso en la app)

### Endpoints (la app usa /api/* por rewrite en netlify.toml)

- **POST** `/api/kling-video` — crear tarea (rewrite a `/.netlify/functions/kling-video`).
- **GET** `/api/kling-video?taskId=xxx` — consultar estado. Respuesta normalizada: `data.state`, `data.resultJson`, `data.failMsg`.

### Body para crear tarea (POST)

Igual que con KIE:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| action | string | Sí | `"createTask"` |
| mode | string | No | `"pro"` \| `"std"` (default: `pro`) |
| prompt | string | Sí* | Director Brief. Obligatorio si no se envía `multi_shots`. |
| multi_shots | array | No | Array de `{ prompt: string }`. Si se envía, se usa en lugar de `prompt` único. |
| duration | string | No | `"5"` \| `"10"` \| `"15"` (default: `"5"`) |
| aspect_ratio | string | No | `"16:9"` \| `"9:16"` \| `"1:1"` |
| sound | boolean | No | Incluir sonido |
| kling_elements | array | No | Referencias con `element_input_urls`. La primera URL → `first_frame`, la segunda → `end_frame` (API Kling 3.0). |
| negative_prompt | string | No | Elementos a excluir en el video. |

### Respuesta del proxy

- **200 (create):** `{ taskId: "..." }`
- **200 (GET status):** Objeto normalizado con `data.state` (`waiting` \| `success` \| `fail`), `data.resultJson` (cuando success, `{ resultUrls: [...] }`), `data.failMsg` (cuando fail).
- **4xx/5xx:** `{ error, code?, failMsg? }`

## API oficial (referencia)

**Por defecto (API unificada):**

| Operación | Método | Endpoint |
|-----------|--------|----------|
| Crear video | POST | `/v1/video/generations` |
| Estado de tarea | GET | `/v1/video/generations/{task_id}` |

**Body al crear (unificado):** `model` (ej. `kling/kling-v2-1-master`), `prompt`, `mode` (`pro`\|`std`), `aspect_ratio`, `duration` (3–15), `sound`, opcional `negative_prompt`. Con imágenes: 1 → `image`; 2 → `image` + `image_tail`; 3–4 → `image_list` (array de `{ image: url }`).

**Con `KLING_USE_V3_PATHS=1`:** Crear con `POST /v1/ai/video/kling-v3-pro` o `-std`; estado con `GET /v1/ai/video/kling-v3/{task-id}`. Body: `first_frame`, `end_frame`, `multi_shot`, etc.

## Flujo en la app (página Video)

1. **Crear tarea:** POST a `kling-video` con `action: "createTask"` → se obtiene `taskId`.
2. **Esperar resultado:** Polling cada **15 segundos** a `GET kling-video?taskId=xxx` hasta `data.state` === `success` o `fail`.
3. **Cuando success:** La app descarga el video (vía `kie-video-download?videoUrl=...`), lo sube a Supabase (`production-outputs/kie-videos/...`) y muestra la URL pública de Supabase.

## Descarga del video

Sigue usándose el proxy **`/.netlify/functions/kie-video-download?videoUrl=...`** para descargar la URL del video en el servidor (evitar CORS) y que el cliente suba el binario a Supabase.

## Troubleshooting

- **"Configura KLING_API_KEY o (KLING_ACCESS_KEY + KLING_SECRET_KEY)":** En Netlify define o bien `KLING_API_KEY` (token Bearer), o bien `KLING_ACCESS_KEY` (o `KLING_ACCESSS_KEY`) y `KLING_SECRET_KEY` desde el [panel de Kling](https://app.klingai.com).
- **401 / Unauthorized:** Revisa que Access Key y Secret Key sean los correctos y que no estén expirados/revocados.
- **404 al consultar estado:** Es posible que la API use otra ruta para consultar (por ejemplo `/v1/video/tasks/{id}`). Prueba configurando `KLING_API_STATUS_PATH` (por ejemplo `/v1/video/tasks`) o revisa la documentación oficial en app.klingai.com.
- **Base URL distinta:** Si en la documentación oficial aparece otra base (por ejemplo `https://openapi.klingai.com`), configura `KLING_API_BASE_URL` en Netlify.
