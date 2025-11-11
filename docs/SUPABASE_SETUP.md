# Configuración de Supabase - Documentación Obsoleta

⚠️ **Este archivo está obsoleto.** 

La plataforma ahora usa **Netlify Functions** para servir las variables de entorno de forma oficial.

**Ver la documentación actualizada en:** [`NETLIFY_SETUP.md`](../NETLIFY_SETUP.md)

## Solución Actual

La plataforma usa:
- `netlify/functions/supabase-config.js` - Netlify Function que expone las variables
- `js/supabase-config.js` - Carga la configuración desde la función
- `js/supabase-client.js` - Inicializa el cliente de Supabase

No se requiere inyección manual de scripts ni configuración adicional.

