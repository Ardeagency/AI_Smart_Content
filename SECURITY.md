# Seguridad

## Reglas generales

- Nunca incluyas tokens, claves ni credenciales en el código o mensajes de commit.
- Configura todos los secretos exclusivamente como variables de entorno en el panel de despliegue.
- Revisa `.gitignore` antes de cada commit para evitar subir archivos sensibles.

## Variables de entorno requeridas

Configurar en el panel de despliegue (no en el repositorio):
- `SUPABASE_DATABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `OPENAI_API_KEY`
- `KIE_API_KEY`
- `META_APP_ID` / `META_APP_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `AI_ENGINE_URL`
- `OAUTH_STATE_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`

## Archivos excluidos del repositorio

Los siguientes tipos de archivos nunca deben subirse al repositorio:
- Archivos `.env` con valores reales
- Directorio `SQL/` (esquemas de base de datos)
- Documentos internos de arquitectura de seguridad
