# Análisis: documentación Kling Text-to-Video e Image-to-Video

## Sobre las URLs oficiales

Las páginas de la documentación oficial de Kling se cargan con **JavaScript** en el navegador. Al hacer fetch directo a:

- https://app.klingai.com/global/dev/document-api/apiReference/model/textToVideo  
- https://app.klingai.com/global/dev/document-api/apiReference/model/imageToVideo  

solo se obtiene el título "可灵平台"; el contenido detallado se carga después por JS. Por eso este análisis se basa en:

- **[可灵 API 内测文档 (Apifox)](https://s.apifox.cn/26d129bf-cd64-41a5-895b-719a35ae8b3c/7396965m0)** — misma API, un solo endpoint con distintos cuerpos.
- Documentación de terceros (DMXAPI, etc.) que referencian la misma API oficial.

---

## API unificada: un solo endpoint

En la documentación de referencia (Apifox / 可灵), **no hay rutas distintas** para “textToVideo” e “imageToVideo”. Hay **un único endpoint**:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST   | `/v1/video/generations` | Crear tarea (文生视频 / 图生视频 / 多图参考 / 对口型) |

El **tipo de tarea** lo define el **body**:

| Tipo de tarea | Condición en el body | Descripción |
|---------------|----------------------|-------------|
| **文生视频 (Text-to-Video)** | Solo `prompt` (sin `image`, sin `image_list`) | Video a partir de texto. |
| **图生视频 (Image-to-Video)** | Incluye `image` | Video a partir de **una** imagen (opcional `image_tail`, `dynamic_masks`, etc.). |
| **多图参考生视频 (Multi-Image)** | Incluye `image_list` | Video con **varias** imágenes de referencia (1–4). |
| **对口型 (Lipsync)** | Incluye `input` | Sincronización de labios con video + texto/audio. |

Es decir: **textToVideo** e **imageToVideo** son el mismo endpoint con parámetros diferentes, no dos URLs distintas.

---

## Text-to-Video (文生视频)

### Parámetros

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `model` | string | Sí | — | p. ej. `kling/kling-v1-6`, `kling/kling-v2-1-master` |
| `prompt` | string | Sí | — | Texto descriptivo (≤2500 caracteres) |
| `mode` | string | No | `std` | `std` \| `pro` |
| `aspect_ratio` | string | No | `16:9` | `16:9` \| `9:16` \| `1:1` |
| `duration` | string/int | No | `5` | `5` \| `10` (segundos) |
| `negative_prompt` | string | No | — | Contenido a evitar (≤2500 caracteres) |
| `cfg_scale` | float | No | 0.5 | 0.0–1.0 (en v2.x **no** soportado) |

### Ejemplo de body

```json
{
  "model": "kling/kling-v1-6",
  "prompt": "一只可爱的小猫在花园里追逐蝴蝶，阳光明媚，画面温馨",
  "mode": "pro",
  "aspect_ratio": "16:9",
  "duration": "10"
}
```

---

## Image-to-Video (图生视频)

### Parámetros

Incluye **todos los de Text-to-Video** más los de imagen:

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `image` | string | Sí | URL o Base64 de la **imagen de inicio** |
| `image_tail` | string | No | URL o Base64 de la **imagen final** (transición inicio → fin) |
| `static_mask` | string | No | Máscara estática (zona a “pintar”) |
| `dynamic_masks` | array | No | Hasta 6 elementos: `mask` + `trajectories` (movimiento) |

Restricción: **solo una** de estas tres opciones a la vez:

1. `camera_control`  
2. `dynamic_masks` / `static_mask`  
3. `image` + `image_tail`  

### Ejemplo de body (una imagen + prompt)

```json
{
  "model": "kling/kling-v1-6",
  "image": "https://example.com/input.jpg",
  "prompt": "让图片中的人物微笑并轻轻点头",
  "mode": "pro",
  "duration": "10"
}
```

### Ejemplo con inicio y fin (image + image_tail)

```json
{
  "model": "kling/kling-v1-6",
  "image": "https://example.com/start.jpg",
  "image_tail": "https://example.com/end.jpg",
  "prompt": "从起始状态平滑过渡到结束状态",
  "duration": "5"
}
```

### Requisitos de imagen

| Requisito | Valor |
|-----------|--------|
| Formato | JPEG, PNG |
| Tamaño | ≤ 10 MB |
| Resolución | Ancho y alto ≥ 300 px |
| Relación de aspecto | Entre 1:2.5 y 2.5:1 |
| Codificación | URL HTTP o Base64 (`data:image/...;base64,...`) |

---

## Multi-Image (多图参考生视频)

- **Parámetro:** `image_list`: array de 1–4 elementos, cada uno con `image` (URL o Base64).
- **Modelo:** en la doc actual solo se indica soporte explícito para `kling-v1-6` (máx. 4 imágenes).
- Ejemplo: ver sección correspondiente en [Apifox](https://s.apifox.cn/26d129bf-cd64-41a5-895b-719a35ae8b3c/7396965m0).

---

## Modelos soportados

| Modelo ID | Text-to-Video | Image-to-Video | Multi-Image | Notas |
|-----------|---------------|----------------|-------------|--------|
| `kling/kling-v1-6` | ✓ | ✓ | ✓ | Hasta 4 imágenes en multi. |
| `kling/kling-v2-master` | ✓ | ✓ | ✓ | |
| `kling/kling-v2-1` | ✓ | ✓ | ✓ | |
| `kling/kling-v2-1-master` | ✓ | ✓ | ✓ | |
| `kling/lipsync` | — | — | — | Solo 对口型. |

---

## Respuesta al crear tarea

Formato típico (según doc de referencia):

```json
{
  "code": 0,
  "message": "SUCCEED",
  "data": {
    "task_id": "784998939837341722",
    "task_status": "submitted",
    "task_info": {},
    "created_at": 1755186850621,
    "updated_at": 1755186850621
  }
}
```

- **task_status:** `submitted` → `processing` → `completed` \| `failed`
- **task_id:** se usa para consultar el resultado.

---

## Consulta de estado / resultado

- Endpoint y formato **dependen de la base URL** que use la API oficial (p. ej. `GET /v1/video/generations/{task_id}` o `GET /v1/video/tasks?task_id=...`).  
- En la respuesta de “completed” suele venir la URL del video (p. ej. en `task_result.videos[].url` o campo equivalente).

---

## Relación con nuestro proxy `kling-video.js`

| Aspecto | Implementación actual | Según documentación |
|---------|------------------------|---------------------|
| Endpoint | `POST {base}/v1/video/generations` | ✓ Mismo. |
| Text-to-Video | `model`, `prompt`, `mode`, `aspect_ratio`, `duration` | ✓ Alineado. |
| Multi-Image | Si hay `kling_elements` con imágenes → `image_list` (hasta 4) | ✓ Coincide con multi图参考. |
| Image-to-Video (una sola imagen) | No se envía `image`; solo se usa `image_list` cuando hay varias | Opción: si el usuario sube **una** imagen, enviar `image` en lugar de `image_list` para 图生视频. |
| Modelo por defecto | `kling/kling-v2-1-master` | Doc también usa v1-6 en ejemplos; ambos válidos. |
| `negative_prompt`, `cfg_scale` | No enviados | Opcionales; se pueden añadir si se exponen en UI. |
| `sound` | Se envía si viene en el body | No aparece en Apifox; depende de si la API real lo soporta. |

Conclusión: **textToVideo** e **imageToVideo** en la documentación oficial se traducen en **el mismo endpoint** con o sin `image` / `image_list`. Nuestra integración ya cubre text-to-video y multi-image; se puede extender para **image-to-video** de una sola imagen enviando `image` cuando corresponda.

---

## Referencias

- [可灵 API 内测文档 (Apifox)](https://s.apifox.cn/26d129bf-cd64-41a5-895b-719a35ae8b3c/7396965m0) — parámetros, ejemplos y restricciones.
- [app.klingai.com – textToVideo](https://app.klingai.com/global/dev/document-api/apiReference/model/textToVideo) — contenido completo solo en el navegador.
- [app.klingai.com – imageToVideo](https://app.klingai.com/global/dev/document-api/apiReference/model/imageToVideo) — contenido completo solo en el navegador.
- [DMXAPI – 文生视频](https://doc.dmxapi.com/kling-txt2video.html) — mismo esquema, path con prefijo `/kling`.
