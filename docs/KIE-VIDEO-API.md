# Video API Documentation (KIE) — **Deprecado**

> **Ya no se usa KIE en este proyecto.** La app usa la **API oficial de Kling** (Access Key + Secret Key). Ver [KLING-VIDEO-API.md](./KLING-VIDEO-API.md).

---

> Generate content using the Video model (Kling 3.0).

## Overview

The process consists of two steps:
1. Create a generation task
2. Query task status and results

In este proyecto se usa un **proxy Netlify** (`/.netlify/functions/kie-video`) que envía las peticiones a la API de KIE usando la variable de entorno `KIE_API_KEY`.

---

## Proxy Netlify (uso en la app)

### Endpoint

- **POST** `https://aismartcontent.io/.netlify/functions/kie-video` — crear tarea
- **GET** `https://aismartcontent.io/.netlify/functions/kie-video?taskId=xxx` — consultar estado

### Body para crear tarea (POST)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| action | string | Sí | Debe ser `"createTask"` |
| mode | string | No | `"pro"` \| `"std"` (default: `pro`) |
| prompt | string | Sí* | Director Brief (texto del video). Obligatorio si no se envía `multi_shots`. |
| multi_shots | array | No | Array de `{ prompt: string }`. Si se envía, se usa en lugar de `prompt` único. La función siempre envía `input.multi_shots` a KIE (con un solo shot si solo hay `prompt`). |
| duration | string | No | `"5"` \| `"10"` \| `"15"` (default: `"5"`) |
| aspect_ratio | string | No | `"16:9"` \| `"9:16"` \| `"1:1"` |
| sound | boolean | No | Incluir sonido |
| kling_elements | array | No | Elementos de referencia: `{ name, element_input_urls?, element_input_video_urls?, description? }` |

### Respuesta del proxy

- **200**: `{ taskId: "..." }` (createTask) o objeto `recordInfo` (GET).
- **4xx/5xx**: `{ error, code?, failCode?, failMsg? }` — si KIE devuelve error, se reenvía el status y el mensaje (`failMsg`/`failCode`).

### Flujo en la app (página Video)

1. **Crear tarea**: POST a `kie-video` con `action: "createTask"` → se obtiene `taskId`.
2. **Esperar resultado**: polling cada **15 segundos** a `GET kie-video?taskId=xxx` hasta que `data.state` sea `success` o `fail`.
3. **Cuando `state === 'success`**: la app descarga el video (vía proxy `kie-video-download?videoUrl=...` para evitar CORS), lo sube al bucket Supabase `production-outputs` en `kie-videos/{user_id}/{taskId}.mp4` y muestra al usuario la URL pública de Supabase (no la URL temporal de KIE).

### Proxy de descarga

- **GET** `/.netlify/functions/kie-video-download?videoUrl=<url codificada>` — descarga el video desde la URL de KIE en el servidor y lo devuelve en binario. Usado por la app para luego subir ese binario a Supabase.

---

## API KIE (directa)

### Authentication

All API requests require a Bearer Token in the request header:

```
Authorization: Bearer YOUR_API_KEY
```

Get API Key:
1. Visit [API Key Management Page](https://kie.ai/api-key) to get your API Key
2. Add to request header: `Authorization: Bearer YOUR_API_KEY`

---

### 1. Create Generation Task

### API Information
- **URL**: `POST https://api.kie.ai/api/v1/jobs/createTask`
- **Content-Type**: `application/json`

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| model | string | Yes | Model name, format: `kling-3.0/video` |
| input | object | Yes | Input parameters object |
| callBackUrl | string | No | Callback URL for task completion notifications. If provided, the system will send POST requests to this URL when the task completes (success or fail). If not provided, no callback notifications will be sent. Example: `"https://your-domain.com/api/callback"` |

### Model Parameter

| Property | Value | Description |
|----------|-------|-------------|
| **Format** | `kling-3.0/video` | The exact model identifier for this API |
| **Type** | string | Must be passed as a string value |
| **Required** | Yes | This parameter is mandatory for all requests |

### input Object Parameters

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| mode | string | Yes | `std` \| `pro` |
| multi_shots | array | Yes* | Array of `{ prompt: string }`. La API puede requerir que no esté vacío; en nuestro proxy siempre se envía (un shot si solo hay prompt único). |
| duration | string | No | `"5"` \| `"10"` \| `"15"` |
| aspect_ratio | string | No | `"16:9"` \| `"9:16"` \| `"1:1"` |
| sound | boolean | No | Include sound |
| kling_elements | array | No | Reference elements: `{ name, element_input_urls?, element_input_video_urls?, description? }` |

#### mode
- **Type**: `string`
- **Required**: Yes
- **Description**: Generation mode. std has standard resolution, pro has higher resolution.
- **Options**: `std` | `pro`
- **Default Value**: `"std"`

### Request Example

```json
{
  "model": "kling-3.0/video",
  "input": {
    "mode": "pro",
    "multi_shots": [{ "prompt": "A sunny kitchen with a blender on the counter." }],
    "duration": "5",
    "aspect_ratio": "16:9",
    "sound": false
  }
}
```

### Response Example

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "281e5b0*********************f39b9"
  }
}
```

---

### 2. Query Task Status

### API Information
- **URL**: `GET https://api.kie.ai/api/v1/jobs/recordInfo`
- **Parameter**: `taskId` (passed via URL parameter)

### Request Example
```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=281e5b0*********************f39b9
```

### Response Example

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "281e5b0*********************f39b9",
    "model": "kling-3.0/video",
    "state": "waiting",
    "param": "{\"model\":\"kling-3.0/video\",\"input\":{\"mode\":\"std\"}}",
    "resultJson": "{\"resultUrls\":[\"https://static.aiquickdraw.com/tools/example/1770648690994_jIU8D0i9.mp4\"]}",
    "failCode": null,
    "failMsg": null,
    "costTime": null,
    "completeTime": null,
    "createTime": 1757584164490
  }
}
```

### Response Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| data.state | string | Task status: `waiting`, `success`, `fail` |
| data.resultJson | string | When success: JSON string with `resultUrls` for video |
| data.failCode | string | Failure code (when task fails) |
| data.failMsg | string | Failure message (when task fails) |

---

### Usage Flow

1. **Create Task**: Call `POST createTask` to create a generation task
2. **Get Task ID**: Extract `taskId` from the response
3. **Wait for Results**: Poll `GET recordInfo?taskId=...` until `state` is `success` or `fail`
4. **Get Results**: When `state` is `success`, parse `resultJson` and use `resultUrls[0]` for the video URL

### Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Request successful |
| 400 | Invalid request parameters |
| 401 | Authentication failed |
| 402 | Insufficient account balance |
| 404 | Resource not found |
| 422 | Parameter validation failed |
| 429 | Request rate limit exceeded |
| 500 | Internal server error |

### Troubleshooting (mensajes desde KIE)

Los mensajes de error que muestra la app (p. ej. *"Server exception, please try again later or contact customer service"*) **vienen del servidor de KIE**, no de nuestra app. La app solo reenvía el `msg` o `failMsg` que devuelve la API.

- **Reintentar** en unos minutos (puede ser un fallo temporal).
- **Revisar cuenta KIE**: saldo/créditos, API key correcta en Netlify (`KIE_API_KEY`).
- **401**: comprobar que `KIE_API_KEY` en Netlify coincide con la clave de [KIE API Key Management](https://kie.ai/api-key).
- **402**: saldo insuficiente en la cuenta KIE.
