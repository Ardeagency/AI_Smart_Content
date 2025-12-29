# Estructura de Input del Webhook

Este documento describe la estructura completa de los datos que se envían al webhook cuando se genera contenido.

## Estructura Principal

```json
{
  "marca": { ... },
  "producto": { ... },
  "sujeto": { ... },
  "oferta": { ... },
  "audiencia": { ... },
  "configuracion_avanzada": { ... },
  "metadata": { ... }
}
```

## Detalles por Sección

### 1. `marca` (Object | null)
Información de la marca seleccionada.

```json
{
  "id": "string",
  "nombre_marca": "string",
  "logo_url": "string",
  // ... otros campos de la tabla projects
}
```

**Nota:** Actualmente retorna `null` (pendiente de implementación desde Supabase).

---

### 2. `producto` (Object | null)
Información del producto seleccionado. Solo se incluyen campos necesarios.

```json
{
  "id": "string",
  "project_id": "string",
  "name": "string",
  "product_type": "string",
  "short_desc": "string",
  "benefits": "string",
  "differentiators": "string",
  "usage_steps": "string",
  "ingredients": "string",
  "price": "number",
  "variants": "string",
  "imagenes": []
}
```

**Nota:** Actualmente retorna `null` (pendiente de implementación desde Supabase).

---

### 3. `sujeto` (Object)
Configuración del protagonista/sujeto del contenido.

```json
{
  "ai_defined": "boolean",             // Si la IA define el protagonista automáticamente
  "gender": "string | null",           // Valor del segmented control 'gender-selector'
  "age": "number | null",              // Valor del slider 'age-slider' (10-70)
  "ethnicity": "string | null",        // Valor del input de búsqueda 'ethnicity-search'
  "eyes": "string | null",             // Valor del chip selector 'eyes-selector'
  "hair": "string | null",             // Valor del select 'hair-selector'
  "expression": "string | null",       // Valor del chip selector 'expression-selector'
  "style": "string | null",            // Valor del select 'style-selector'
  "tone": "number | null",             // Valor del slider 'tone-slider' (0-100)
  "personality": "Array<string>",      // Valores del multi-chip selector 'personality-selector'
  "aesthetic": "string | null",        // Valor del select 'aesthetic-selector'
  "realism": "number | null",          // Valor del slider 'realism-slider' (0-100)
  "language": "string | null",         // Valor del select 'language-selector'
  "accent": "string | null"            // Valor del select 'accent-selector'
}
```

**Campos requeridos para validación:**
- Si `ai_defined` es `false`:
  - `gender` (requerido)
  - `age` (requerido)
- Si `ai_defined` es `true`, no se requieren campos específicos

---

### 4. `escenario` (Object)
Configuración del escenario y ambiente donde ocurre la escena.

```json
{
  "ai_defined": "boolean",             // Si la IA define el escenario automáticamente
  "visual_tone": "string | null",      // Valor del chip selector 'visual-tone-selector'
  "ambience": "string | null",         // Valor del chip selector 'ambience-selector'
  "location": "string | null",         // Valor del select 'location-selector'
  "time": "string | null",             // Valor del segmented control 'time-selector'
  "visual_realism": "number | null"    // Valor del slider 'visual-realism-slider' (0-100)
}
```

---

### 5. `oferta` (string | null)
ID o valor de la oferta seleccionada desde el selector 'offer-selector'.

**Nota:** Puede ser `null` si no se selecciona una oferta (es opcional).

---

### 6. `audiencia` (string | null)
ID o valor de la audiencia seleccionada desde el selector 'audience-selector'.

**Nota:** Puede ser `null` si no se selecciona una audiencia (es opcional).

---

### 7. `configuracion_avanzada` (Object)
Configuraciones avanzadas del contenido.

```json
{
  "resolution": "string | null",           // Valor del selector 'resolution-selector' (720p, 1080p)
  "ratio": "string | null",                 // Valor del selector 'ratio-selector' (vertical, horizontal, cuadrado)
  "creativity": "number | null",            // Valor del slider 'creativity-slider' (0.01-2.00)
  "prompt": "string | null",                // Valor del textarea 'prompt-input'
  "negative_prompt": "string | null"        // Valor del textarea 'negative-prompt-input'
}
```

---

### 8. `metadata` (Object)
Metadatos de la solicitud.

```json
{
  "timestamp": "string",        // ISO 8601 timestamp (ej: "2024-01-15T10:30:00.000Z")
  "user_id": "string",          // ID del usuario que genera el contenido
  "version": "string"           // Versión de la API (actualmente "1.0")
}
```

---

## Ejemplo Completo

```json
{
  "marca": null,
  "producto": null,
  "sujeto": {
    "ai_defined": false,
    "gender": "femenino",
    "age": 25,
    "ethnicity": "latinoamericano",
    "eyes": "marron",
    "hair": "largo-moño",
    "expression": "sonriente",
    "style": "casual",
    "tone": 50,
    "personality": ["extrovertido", "amigable"],
    "aesthetic": "moderno",
    "realism": 75,
    "language": "es",
    "accent": "neutral"
  },
  "escenario": {
    "ai_defined": false,
    "visual_tone": "calido",
    "ambience": "acogedor",
    "location": "en-casa",
    "time": "tarde",
    "visual_realism": 60
  },
  "oferta": null,
  "audiencia": null,
  "configuracion_avanzada": {
    "resolution": "1080p",
    "ratio": "vertical",
    "creativity": 0.7,
    "prompt": "Una escena vibrante y moderna",
    "negative_prompt": "Evitar elementos oscuros"
  },
  "metadata": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "user_id": "user-123",
    "version": "1.0"
  }
}
```

---

## Validación

El sistema valida los siguientes campos antes de enviar:

**Si `sujeto.ai_defined` es `false`:**
1. `sujeto.gender` - Género del sujeto (requerido)
2. `sujeto.age` - Edad del sujeto (requerido)

**Si `sujeto.ai_defined` es `true`:**
- No se requieren campos específicos del sujeto (la IA los define automáticamente)

**Nota:** `marca.id` y `producto.id` ya NO son requeridos para la generación de contenido.

---

## Limpieza de Datos

Antes de enviar, el `WebhookManager` limpia el objeto:
- Elimina valores `undefined`
- Mantiene valores `null` explícitos
- Valida que el JSON sea válido
- Asegura que no esté vacío

---

## URL del Webhook

```
https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702
```

---

## Notas de Implementación

- Los campos `marca`, `producto`, `oferta` y `audiencia` actualmente retornan `null` porque las funciones de Supabase están desactivadas.
- El campo `producto.imagenes` es un array vacío por defecto.
- Todos los valores de selectores, sliders y textareas pueden ser `null` si el elemento no existe en el DOM o no tiene valor.

