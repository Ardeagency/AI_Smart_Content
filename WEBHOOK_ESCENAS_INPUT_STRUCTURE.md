# Estructura de Input del Webhook de Escenas

Este documento describe la estructura completa de los datos que se envían al webhook de escenas cuando se hace clic en "Generar escenas" para un guion específico.

## URL del Webhook

```
https://ardeagency.app.n8n.cloud/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c
```

## Estructura del JSON

El JSON enviado contiene todos los datos del sidebar más el guion seleccionado:

```json
{
  "marca": {
    "id": "uuid",
    "nombre_marca": "string",
    "logo_url": "string | null",
    "sitio_web": "string | null",
    "instagram_url": "string | null",
    "tiktok_url": "string | null",
    "facebook_url": "string | null",
    "idiomas_contenido": "array | null",
    "mercado_objetivo": "array | null",
    "tono_voz": "string | null",
    "palabras_usar": "string | null",
    "palabras_evitar": "array | null",
    "reglas_creativas": "string | null",
    "personalidad_marca": "string | null",
    "quienes_somos": "string | null",
    "objetivos_marca": "array | null"
  },
  "producto": {
    "id": "uuid",
    "project_id": "uuid",
    "name": "string",
    "product_type": "string",
    "short_desc": "string",
    "benefits": ["string"],
    "differentiators": "string | null",
    "usage_steps": "string | null",
    "ingredients": "string | null",
    "price": "number",
    "currency": "string",
    "variants": "object | null",
    "imagenes": ["string"]
  },
  "sujeto": {
    "ai_defined": "boolean",
    "gender": "string | null",
    "age": "number | null",
    "ethnicity": "string | null",
    "eyes": "string | null",
    "hair": "string | null",
    "expression": "string | null",
    "style": "string | null",
    "tone": "string | null",
    "personality": ["string"],
    "aesthetic": "string | null",
    "realism": "string | null",
    "language": "string | null",
    "accent": "string | null"
  },
  "escenario": {
    "ai_defined": "boolean",
    "visual_tone": "string | null",
    "ambience": "string | null",
    "location": "string | null",
    "time": "string | null",
    "visual_realism": "number | null"
  },
  "oferta": "string | null",
  "audiencia": "string | null",
  "configuracion_avanzada": {
    "resolution": "string | null",
    "ratio": "string | null",
    "creativity": "number | null",
    "prompt": "string | null",
    "negative_prompt": "string | null"
  },
  "metadata": {
    "timestamp": "ISO 8601 string",
    "user_id": "uuid",
    "version": "1.0"
  },
  "guion_para_escenas": {
    "variante": 1,
    "roles": ["string"],
    "guion": {
      "context": {
        "place": "string",
        "time": "string",
        "why_now": "string",
        "subject_profile": "string",
        "subject_voice": "string",
        "props": ["string"],
        "continuity": "string"
      },
      "clips": [
        {
          "dur": 8,
          "role": "string",
          "scene_prompt": "string",
          "voice_over": "string",
          "notes": {
            "camera": "string",
            "imperfection": "string",
            "lighting": "string",
            "sound": "string",
            "continuity": "string"
          }
        }
      ]
    },
    "promptBase": {
      "guion": "string"
    }
  }
}
```

## Campo Clave: `guion_para_escenas`

Este campo contiene la variante completa del guion seleccionado por el usuario, incluyendo:

- **variante**: Número de la variante (1, 2, o 3)
- **roles**: Array de roles del guion (ej: ["Persona", "Producto", "Demo"])
- **guion**: Objeto completo con:
  - **context**: Contexto del guion (lugar, tiempo, perfil del sujeto, etc.)
  - **clips**: Array de clips con escenas, voice over y notas técnicas
- **promptBase**: Prompt base del guion

## Notas Importantes

1. **Todos los datos del sidebar se incluyen**: El JSON incluye marca, producto, sujeto, escenario, oferta, audiencia y configuración avanzada.

2. **El guion completo se envía**: La variante seleccionada se envía completa en `guion_para_escenas`.

3. **Limpieza automática**: El `WebhookManager` limpia el objeto antes de enviarlo, eliminando valores `undefined` y `null` innecesarios.

4. **Formato de tono y realismo**: Los campos `tone` y `realism` en `sujeto` se envían como strings con formato:
   - Si hay preset: `"preset-valor"` (ej: `"amigable-65"`)
   - Si no hay preset: solo el valor numérico como string (ej: `"50"`)

5. **Realismo con múltiples presets**: El campo `realism` puede tener formato `"preset1,preset2-valor"` si hay múltiples presets seleccionados.

## Ejemplo de Uso

Cuando el usuario hace clic en "Generar escenas" para la Variante 1, el webhook recibe:

```json
{
  "marca": { ... },
  "producto": { ... },
  "sujeto": { ... },
  "escenario": { ... },
  "guion_para_escenas": {
    "variante": 1,
    "roles": ["Persona", "Producto", "Demo"],
    "guion": {
      "context": {
        "place": "Gimnasio",
        "time": "Mañana temprano",
        ...
      },
      "clips": [
        {
          "dur": 8,
          "role": "Persona",
          "scene_prompt": "...",
          "voice_over": "...",
          "notes": { ... }
        },
        ...
      ]
    },
    "promptBase": { ... }
  }
}
```

