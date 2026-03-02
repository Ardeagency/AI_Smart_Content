# Flujo Video: OpenAI → Kling

## Orden del flujo

1. **Usuario genera el prompt con OpenAI** (botón estrellas en Director Console).
2. **Usuario produce el contenido con Kling** (botón enviar): se usa el texto del Director Brief como prompt de video (API oficial de Kling, proxy `kling-video`).

## 1. Body hacia OpenAI (openai-cine-prompt)

El front envía `POST /.netlify/functions/openai-cine-prompt` con:

```json
{
  "director_brief": "texto opcional del usuario",
  "kling_elements": [
    { "name": "nombre", "element_input_urls": ["url1", "url2"], "element_input_video_urls": [] }
  ],
  "brand_context": {
    "entities": [{ "name", "entity_type", "description" }],
    "products": [{ "name" }],
    "audiences": [{ "name", "description" }],
    "campaigns": [{ "name", "description" }]
  },
  "cinematography": {
    "shotType", "lens", "framing", "cameraMovement", "motionSpeed", "motionIntensity",
    "lightType", "contrastLevel", "temperature", "tone", "colorGrade", "energyLevel"
  }
}
```

- La función construye un único mensaje de usuario con contexto de marca, recursos adjuntos, cinematografía y brief, y llama a OpenAI.
- **Respuesta:** `{ "prompt": "..." }`. El front escribe ese texto en el Director Brief.

## 2. Body hacia Kling (kling-video createTask)

El front envía `POST /.netlify/functions/kling-video` con:

```json
{
  "action": "createTask",
  "mode": "pro",
  "prompt": "texto del Director Brief (obligatorio si no hay multi_shots)",
  "multi_shots": [],
  "duration": "5",
  "aspect_ratio": "16:9",
  "sound": true,
  "kling_elements": [
    { "name", "description?", "element_input_urls?", "element_input_video_urls?" }
  ]
}
```

- **prompt:** obligatorio si no se envía `multi_shots`; es el texto del Director Brief (OpenAI o usuario).
- **multi_shots:** opcional. Si el usuario activa Multi Shot, se envía un array de `{ prompt: string }`; si no, la función convierte el `prompt` único en `multi_shots: [{ prompt: "..." }]` para la API KIE.
- **duration:** valor del selector (5s, 10s, 15s).
- **aspect_ratio:** valor del selector (16:9, 9:16, 1:1).
- **sound:** según el toggle Sound (aria-pressed del botón).

La función valida que exista `prompt` o `multi_shots` con prompts, genera un JWT con las claves Kling y reenvía a la API oficial de Kling (`model`, `prompt`, `mode`, `duration`, `aspect_ratio`, `sound`, `image_list` si hay kling_elements). Detalle completo en [KLING-VIDEO-API.md](./KLING-VIDEO-API.md).

## Validaciones

- **Enviar (Kling):** Si el Director Brief está vacío, se muestra error y no se llama a la API Kling.
- **openai-cine-prompt:** Si no hay brief ni contexto, la función pide a OpenAI un prompt genérico.
