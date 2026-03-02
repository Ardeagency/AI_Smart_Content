# API de video Kling (可灵) – Uso en el proyecto

> Integración con la **API oficial de Kling** (Access Key + Secret Key).  
> Documentación general: [Kling Developer – Overview](https://app.klingai.com/global/dev/document-api/quickStart/productIntroduction/overview)

## Resumen

- Se dejó de usar **KIE** (`api.kie.ai`). Ahora se usa la **API oficial de Kling** con autenticación por **Access Key** y **Secret Key** (JWT en cada petición).
- El proxy Netlify `kling-video` genera el JWT en el servidor y reenvía las peticiones a la base URL de Kling.

## Variables de entorno (Netlify)

| Variable | Requerido | Descripción |
|----------|-----------|-------------|
| `KLING_ACCESS_KEY` | Sí* | Access Key desde el panel de Kling (API Keys). También se admite `KLING_ACCESSS_KEY` por compatibilidad. |
| `KLING_SECRET_KEY` | Sí | Secret Key desde el panel de Kling. |
| `KLING_API_BASE_URL` | No | Base URL de la API. Por defecto: `https://api.klingai.com`. Ajustar si la documentación oficial indica otra. |
| `KLING_API_STATUS_PATH` | No | Ruta base para consultar estado. Por defecto: `/v1/video/generations`. |
| `KLING_API_STATUS_USE_QUERY` | No | Si es `1` o `true`, la consulta de estado usa query: `{path}?task_id=xxx`. Si no, usa path: `{path}/{taskId}`. |

\* Al menos uno de: `KLING_ACCESS_KEY` o `KLING_ACCESSS_KEY`.

## Autenticación (JWT)

La API oficial de Kling usa **JWT** (HS256) con:

- **Header:** `{ "alg": "HS256", "typ": "JWT" }`
- **Payload:** `{ "iss": "<access_key>", "iat": <timestamp>, "exp": <timestamp + 300> }`
- **Firma:** HMAC-SHA256 con el **Secret Key**.

El proxy `kling-video` genera este token en el servidor y envía `Authorization: Bearer <token>` en cada llamada. Las claves no se exponen al cliente.

## Proxy Netlify (uso en la app)

### Endpoints

- **POST** `/.netlify/functions/kling-video` — crear tarea (body igual que antes: `action: "createTask"`, `prompt`, `mode`, etc.).
- **GET** `/.netlify/functions/kling-video?taskId=xxx` — consultar estado. La respuesta se normaliza al mismo formato que usaba KIE (`data.state`, `data.resultJson`, `data.failMsg`) para que el frontend no cambie de lógica.

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
| kling_elements | array | No | Referencias: `{ name, element_input_urls?, element_input_video_urls?, description? }`. Se mapean a `image_list` (máx. 4 imágenes) para la API Kling. |

### Respuesta del proxy

- **200 (create):** `{ taskId: "..." }`
- **200 (GET status):** Objeto normalizado con `data.state` (`waiting` \| `success` \| `fail`), `data.resultJson` (cuando success, `{ resultUrls: [...] }`), `data.failMsg` (cuando fail).
- **4xx/5xx:** `{ error, code?, failMsg? }`

## API Kling oficial (referencia)

- **Crear tarea:** `POST {base}/v1/video/generations`  
  Body: `model`, `prompt`, `mode`, `aspect_ratio`, `duration`, opcional `image_list`, `sound`.
- **Consultar estado:** `GET {base}/v1/video/generations/{task_id}` (o la ruta indicada en la documentación oficial; en ese caso configurar `KLING_API_STATUS_PATH`).

Modelos soportados (según documentación 可灵): `kling/kling-v1-6`, `kling/kling-v2-master`, `kling/kling-v2-1`, `kling/kling-v2-1-master`. En el proxy se usa por defecto `kling/kling-v2-1-master` para texto a video.

## Flujo en la app (página Video)

1. **Crear tarea:** POST a `kling-video` con `action: "createTask"` → se obtiene `taskId`.
2. **Esperar resultado:** Polling cada **15 segundos** a `GET kling-video?taskId=xxx` hasta `data.state` === `success` o `fail`.
3. **Cuando success:** La app descarga el video (vía `kie-video-download?videoUrl=...`), lo sube a Supabase (`production-outputs/kie-videos/...`) y muestra la URL pública de Supabase.

## Descarga del video

Sigue usándose el proxy **`/.netlify/functions/kie-video-download?videoUrl=...`** para descargar la URL del video en el servidor (evitar CORS) y que el cliente suba el binario a Supabase.

## Troubleshooting

- **"KLING_ACCESS_KEY y KLING_SECRET_KEY deben estar configurados":** Añade en Netlify (Environment variables) `KLING_ACCESS_KEY` (o `KLING_ACCESSS_KEY`) y `KLING_SECRET_KEY` con los valores del [panel de Kling](https://app.klingai.com).
- **401 / Unauthorized:** Revisa que Access Key y Secret Key sean los correctos y que no estén expirados/revocados.
- **404 al consultar estado:** Es posible que la API use otra ruta para consultar (por ejemplo `/v1/video/tasks/{id}`). Prueba configurando `KLING_API_STATUS_PATH` (por ejemplo `/v1/video/tasks`) o revisa la documentación oficial en app.klingai.com.
- **Base URL distinta:** Si en la documentación oficial aparece otra base (por ejemplo `https://openapi.klingai.com`), configura `KLING_API_BASE_URL` en Netlify.
