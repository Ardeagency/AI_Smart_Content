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
  "gender": "string | null",           // Valor del selector 'gender-selector'
  "age": "string | null",              // Valor del selector 'age-selector'
  "ethnicity": "string | null",        // Valor del selector 'ethnicity-selector'
  "eyes": "string | null",             // Valor del selector 'eyes-selector'
  "hair": "string | null",             // Valor del selector 'hair-selector'
  "expression": "string | null",       // Valor del selector 'expression-selector'
  "style": "string | null",            // Valor del selector 'style-selector'
  "tone": "string | null",             // Valor del selector 'tone-selector'
  "personality": "string | null",      // Valor del selector 'personality-selector'
  "aesthetic": "string | null",        // Valor del selector 'aesthetic-selector'
  "realism": "string | null",          // Valor del selector 'realism-selector'
  "language": "string | null",         // Valor del selector 'language-selector'
  "accent": "string | null"            // Valor del selector 'accent-selector'
}
```

**Campos requeridos para validación:**
- `gender` (requerido)
- `age` (requerido)

---

### 4. `oferta` (Object | null)
Información de la oferta/promoción.

```json
{
  // Campos de la tabla offers (pendiente de implementación)
}
```

**Nota:** Actualmente retorna `null` (pendiente de implementación desde Supabase).

---

### 5. `audiencia` (Object | null)
Información de la audiencia objetivo.

```json
{
  // Campos de la tabla audiences (pendiente de implementación)
}
```

**Nota:** Actualmente retorna `null` (pendiente de implementación desde Supabase).

---

### 6. `configuracion_avanzada` (Object)
Configuraciones avanzadas del contenido.

```json
{
  "resolution": "string | null",           // Valor del selector 'resolution-selector'
  "ratio": "string | null",                 // Valor del selector 'ratio-selector'
  "creativity": "number | null",            // Valor del slider 'creativity-slider' (0-100)
  "prompt": "string | null",                // Valor del textarea 'prompt-input'
  "negative_prompt": "string | null"        // Valor del textarea 'negative-prompt-input'
}
```

---

### 7. `metadata` (Object)
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
    "gender": "female",
    "age": "25-35",
    "ethnicity": "latina",
    "eyes": "brown",
    "hair": "long",
    "expression": "happy",
    "style": "casual",
    "tone": "friendly",
    "personality": "extroverted",
    "aesthetic": "modern",
    "realism": "high",
    "language": "es",
    "accent": "neutral"
  },
  "oferta": null,
  "audiencia": null,
  "configuracion_avanzada": {
    "resolution": "1080p",
    "ratio": "16:9",
    "creativity": 75,
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

El sistema valida que los siguientes campos estén presentes antes de enviar:

1. `marca.id` - ID de la marca (requerido)
2. `producto.id` - ID del producto (requerido)
3. `sujeto.gender` - Género del sujeto (requerido)
4. `sujeto.age` - Edad del sujeto (requerido)

Si alguno de estos campos falta, se muestra un error y no se envía la solicitud.

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

