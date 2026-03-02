# Verificación: system_ai_outputs (OpenAI + Kie)

## Requisitos

1. **Supabase**: tabla `system_ai_outputs` creada y RLS aplicada (política "Access own system_ai_outputs").
2. **Netlify**: variables de entorno `OPENAI_API_KEY` y `KIE_API_KEY` configuradas.
3. **App**: usuario autenticado y con `brand_container_id` (ej. haber entrado a una organización/marca).

## Pasos para probar

### 1. OpenAI (prompt cinematográfico)

1. Ir a la página **Video**.
2. Opcional: escribir algo en el Director Brief o adjuntar producto/producción.
3. Pulsar el botón con icono de **estrellas** (Generar prompt con IA).
4. Debe aparecer "Generando prompt cinematográfico con IA…" y luego el textarea se rellena con el prompt.
5. En Supabase, comprobar que existe un registro nuevo:

```sql
SELECT id, provider, output_type, status, prompt_used, left(text_content, 80) AS text_preview, created_at
FROM public.system_ai_outputs
WHERE provider = 'openai'
ORDER BY created_at DESC
LIMIT 5;
```

- Debe haber una fila con `provider = 'openai'`, `output_type = 'text'`, `status = 'completed'` y `text_content` con el prompt generado.

### 2. Kie (generación de video)

1. En la página **Video**, tener un Director Brief (texto o el generado por IA).
2. Pulsar el botón **Enviar** (avión de papel).
3. Debe aparecer "Creando tarea…" y luego "Generando video (Kling 3.0)…".
4. Inmediatamente después de crear la tarea, en Supabase debería existir un registro en `processing`:

```sql
SELECT id, provider, output_type, status, external_job_id, prompt_used, created_at
FROM public.system_ai_outputs
WHERE provider = 'kie_api'
ORDER BY created_at DESC
LIMIT 5;
```

5. Cuando el video termine (éxito o error), ese mismo registro debe actualizarse:
   - **Éxito**: `status = 'completed'`, `metadata->>'video_url'` con la URL del video.
   - **Error**: `status = 'failed'`, `error_message` con el motivo.

```sql
SELECT id, provider, status, external_job_id, error_message,
       metadata->>'video_url' AS video_url, updated_at
FROM public.system_ai_outputs
WHERE provider = 'kie_api'
ORDER BY created_at DESC
LIMIT 5;
```

## Si algo falla

- **Insert devuelve error / no aparece fila**: revisar RLS (usuario debe ser `user_id` del registro o developer). Revisar que `brand_container_id` y `user_id` estén definidos en la sesión.
- **OpenAI no responde**: revisar `OPENAI_API_KEY` en Netlify y que la función `openai-cine-prompt` esté desplegada.
- **Kie no crea tarea**: revisar `KIE_API_KEY` en Netlify y función `kie-video`.
- Errores en consola del navegador (F12): `saveSystemAIOutput` y `updateSystemAIOutput` hacen `console.warn` si falla la escritura en Supabase, sin bloquear el flujo.
