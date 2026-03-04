# Video API Documentation (KIE)

> Generate content using the Video model

**Importante:** En este proyecto usamos **solo la API de KIE** (https://api.kie.ai), no la API oficial de Kling (api.klingai.com). KIE expone el modelo `kling-3.0/video`; toda la generación de video pasa por KIE con `KIE_API_KEY`.

## Uso en esta app

La app genera video mediante la **API de KIE** (modelo `kling-3.0/video`). Variable de entorno: `KIE_API_KEY`.

**Arquitectura asíncrona (evita timeout 524):**

Las Netlify Functions tienen un límite de ejecución (~10–26 s). La generación de video en KIE tarda 30–120 s, por lo que **nunca** se debe esperar dentro de la función. Se usan tres funciones separadas:

| Función | Método | Uso | Tiempo típico |
|--------|--------|-----|----------------|
| **kling-video-create** | POST | Crear tarea en KIE; devuelve `taskId` | &lt; 2 s |
| **kling-video-status** | GET ?taskId= | Consultar estado (polling desde el cliente) | &lt; 2 s |
| **kie-video-download** | GET ?videoUrl= | Descargar video cuando `state === 'success'` | variable |

Flujo: **Frontend** → POST create → recibe `taskId` → **polling** GET status cada 3 s (máx 12 min) → cuando `success`, descarga con kie-video-download y sube a Supabase. Opcional: `KIE_VIDEO_CALLBACK_URL` para que KIE notifique al terminar y se pueda reducir polling.

El endpoint legacy `/.netlify/functions/kling-video` sigue disponible (POST con `action: 'createTask'` y GET con `taskId`); internamente delega a la misma lógica.

**Body enviado a KIE:**

- **model**: `"kling-3.0/video"`
- **input**: siempre un **objeto** (nunca string). Contiene `mode`, `sound`, `duration`, `aspect_ratio`; **`multi_shots`** (requerido, boolean): `false` = single-shot → se envía `prompt`; `true` = multi-shot → se envía `multi_prompt` (array de `{ prompt, duration }`, no vacío). `image_urls` solo si hay URLs; `kling_elements` solo si el prompt incluye `@element_name` y el elemento tiene ≥2 imágenes (o 1 video).
- **callBackUrl**: opcional; si existe `KIE_VIDEO_CALLBACK_URL` en Netlify se añade al payload.

El front envía: `action`, `mode`, `duration` (1–12), `aspect_ratio`, `sound`, `prompt` (o `multi_shots`), y `kling_elements` (solo escena). El front añade automáticamente las referencias `@name` al prompt cuando hay `kling_elements`. La función valida tipos, construye `image_urls` desde elementos referenciados y reparte la duración en multi-shot con `distributeDuration(totalSec, n)`.

---

## Overview

This document describes how to use the Video model for content generation. The process consists of two steps:
1. Create a generation task
2. Query task status and results

## Authentication

All API requests require a Bearer Token in the request header:

```
Authorization: Bearer YOUR_API_KEY
```

Get API Key:
1. Visit [API Key Management Page](https://kie.ai/api-key) to get your API Key
2. Add to request header: `Authorization: Bearer YOUR_API_KEY`

---

## 1. Create Generation Task

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

The `model` parameter specifies which AI model to use for content generation.

| Property | Value | Description |
|----------|-------|-------------|
| **Format** | `kling-3.0/video` | The exact model identifier for this API |
| **Type** | string | Must be passed as a string value |
| **Required** | Yes | This parameter is mandatory for all requests |

> **Note**: The model parameter must match exactly as shown above. Different models have different capabilities and parameter requirements.

### Callback URL Parameter

The `callBackUrl` parameter allows you to receive automatic notifications when your task completes.

| Property | Value | Description |
|----------|-------|-------------|
| **Purpose** | Task completion notification | Receive real-time updates when your task finishes |
| **Method** | POST request | The system sends POST requests to your callback URL |
| **Timing** | When task completes | Notifications sent for both success and failure states |
| **Content** | Query Task API response | Callback content structure is identical to the Query Task API response |
| **Parameters** | Complete request data | The `param` field contains the complete Create Task request parameters, not just the input section |
| **Optional** | Yes | If not provided, no callback notifications will be sent |

**Important Notes:**
- The callback content structure is identical to the Query Task API response
- The `param` field contains the complete Create Task request parameters, not just the input section  
- If `callBackUrl` is not provided, no callback notifications will be sent

### input Object Parameters

#### mode
- **Type**: `string`
- **Required**: Yes
- **Description**: Generation mode. std has standard resolution, pro has higher resolution.
- **Options**:
  - `std`: std
  - `pro`: pro
- **Default Value**: `"std"`

### Request Example

```json
{
  "model": "kling-3.0/video",
  "input": {
    "mode": "std"
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

### Response Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| code | integer | Response status code, 200 indicates success |
| msg | string | Response message |
| data.taskId | string | Task ID for querying task status |

---

## 2. Query Task Status

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
| code | integer | Response status code, 200 indicates success |
| msg | string | Response message |
| data.taskId | string | Task ID |
| data.model | string | Model name used |
| data.state | string | Task status: `waiting`(waiting),  `success`(success), `fail`(fail) |
| data.param | string | Task parameters (JSON string) |
| data.resultJson | string | Task result (JSON string, available when task is success). Structure depends on outputMediaType: `{resultUrls: []}` for image/media/video, `{resultObject: {}}` for text |
| data.failCode | string | Failure code (available when task fails) |
| data.failMsg | string | Failure message (available when task fails) |
| data.costTime | integer | Task duration in milliseconds (available when task is success) |
| data.completeTime | integer | Completion timestamp (available when task is success) |
| data.createTime | integer | Creation timestamp |

---

## Usage Flow

1. **Create Task**: Call `POST https://api.kie.ai/api/v1/jobs/createTask` to create a generation task
2. **Get Task ID**: Extract `taskId` from the response
3. **Wait for Results**: 
   - If you provided a `callBackUrl`, wait for the callback notification
   - If no `callBackUrl`, poll status by calling `GET https://api.kie.ai/api/v1/jobs/recordInfo`
4. **Get Results**: When `state` is `success`, extract generation results from `resultJson`

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Request successful |
| 400 | Invalid request parameters |
| 401 | Authentication failed, please check API Key |
| 402 | Insufficient account balance |
| 404 | Resource not found |
| 422 | Parameter validation failed |
| 429 | Request rate limit exceeded |
| 500 | Internal server error |

---

## Notas para esta app

- **Body enviado a KIE**: `input` siempre objeto. **multi_shots** es obligatorio (boolean): `false` → single-shot, se envía `prompt`; `true` → multi-shot, se envía `multi_prompt` (array no vacío de `{ prompt, duration }`). Nunca se deja `multi_shots` sin definir. `duration` 1–12; `aspect_ratio` 16:9|9:16|1:1. `kling_elements` solo referenciados con ≥2 imágenes (o 1 video). Prompt truncado a 2500 caracteres.
- **Estados**: el GET recordInfo devuelve `data.state` (waiting, success, fail); el proxy normaliza `status` → `state` y `failed` → `fail` para compatibilidad.
- **Troubleshooting**: 401 → revisar `KIE_API_KEY` en Netlify; 402 → saldo insuficiente en KIE.
- **422 (Unprocessable Content)**: revisar en consola el cuerpo de la respuesta (campo `kieBody`).

## Prevención del error 524 (generate task timeout)

El **524** significa que los servidores de KIE tardaron demasiado en generar el video y cancelaron la tarea. La petición inicial (createTask) puede ser correcta; el fallo ocurre **durante la generación** en sus servidores, no por nuestro formato de request.

**Qué hacer para reducir 524:**

1. **Modo Estándar (std)** en lugar de Pro: menor resolución, menos carga en KIE.
2. **Duración 5s**: elegir 5 segundos en lugar de 10 o 12.
3. **Una sola imagen de referencia**: enviar solo un elemento de escena; evitar varias imágenes.
4. **Prompt más corto**: el proxy trunca a 2500 caracteres; conviene mantener el prompt por debajo de ~500 si ya has tenido 524.
5. **Reintentar**: a veces el fallo es puntual; probar de nuevo sin cambiar nada.

Si el error persiste, la limitación está en la capacidad o tiempos de KIE; no en el formato del request.

---

## Investigación documentación oficial KIE (docs.kie.ai)

Resumen de lo que indica la documentación y mejores prácticas:

- **createTask**: `POST https://api.kie.ai/api/v1/jobs/createTask`. Autenticación: `Authorization: Bearer YOUR_API_KEY`.
- **image_urls**: Es **opcional** para modo solo texto; cuando no hay imágenes, el video se genera solo con el prompt y hay que enviar `aspect_ratio`. Cuando hay elementos referenciados con `@element_name`, sí se requieren imágenes.
- **Estados de la tarea**: `waiting` → `queuing` → `generating` → `success` o `fail`. Se consultan con `GET /api/v1/jobs/recordInfo?taskId=...`.
- **Mejores prácticas (doc KIE)**:
  - **Usar callBackUrl en producción**: Incluir `callBackUrl` al crear la tarea para recibir notificaciones al terminar y evitar depender solo del polling.
  - **Polling**: Si se hace polling, empezar con intervalos de **2–3 segundos** y aumentar gradualmente; **dejar de hacer polling después de 10–15 minutos**.
  - **Descargar enseguida**: Las URLs del contenido generado suelen expirar a las **24 horas**; descargar en cuanto esté disponible.
- **524 (generate task timeout)**: Es un fallo **del lado de KIE** (su proceso de generación supera su límite de tiempo). No es un error de validación del request. Reducir complejidad (modo std, 5s, menos imágenes, prompt más corto) para minimizar la probabilidad.
- En esta app: polling cada 3s, tope 12 min; opcionalmente `KIE_VIDEO_CALLBACK_URL` en Netlify para enviar `callBackUrl` a KIE.
