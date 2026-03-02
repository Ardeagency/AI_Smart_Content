# Video API Documentation (KIE)

> Generate content using the Video model

## Overview

The process consists of two steps:
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

| Property | Value | Description |
|----------|-------|-------------|
| **Format** | `kling-3.0/video` | The exact model identifier for this API |
| **Type** | string | Must be passed as a string value |
| **Required** | Yes | This parameter is mandatory for all requests |

### input Object Parameters

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
| data.state | string | Task status: `waiting`, `success`, `fail` |
| data.resultJson | string | When success: JSON string with `resultUrls` for video |
| data.failCode | string | Failure code (when task fails) |
| data.failMsg | string | Failure message (when task fails) |

---

## Usage Flow

1. **Create Task**: Call `POST createTask` to create a generation task
2. **Get Task ID**: Extract `taskId` from the response
3. **Wait for Results**: Poll `GET recordInfo?taskId=...` until `state` is `success` or `fail`
4. **Get Results**: When `state` is `success`, parse `resultJson` and use `resultUrls[0]` for the video URL

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Request successful |
| 400 | Invalid request parameters |
| 401 | Authentication failed |
| 402 | Insufficient account balance |
| 422 | Parameter validation failed |
| 429 | Request rate limit exceeded |
| 500 | Internal server error |
