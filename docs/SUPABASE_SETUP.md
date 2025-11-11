# Configuración de Supabase en el Servidor

Este documento explica cómo configurar las variables de entorno de Supabase en el servidor donde está publicada la plataforma.

## Variables Requeridas

El servidor debe proporcionar las siguientes variables de entorno:

- `SUPABASE_DATABASE_URL` - URL completa de Supabase (ej: `https://tsdpbqcwjckbfsdqacam.supabase.co`)
- `SUPABASE_ANON_KEY` - Clave anónima pública de Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Clave de servicio (solo para backend, opcional en frontend)
- `SUPABASE_JWT_SECRET` - Secret JWT (solo para backend, no necesario en frontend)

## Métodos de Configuración

### Método 1: Inyectar en window (Recomendado)

El servidor debe inyectar un script antes de que se carguen los scripts de Supabase:

```html
<script>
    // Inyectar variables de entorno del servidor
    window.SUPABASE_URL = 'https://tsdpbqcwjckbfsdqacam.supabase.co';
    window.SUPABASE_ANON_KEY = 'tu-clave-anon-key-aqui';
</script>
<script src="js/supabase-config.js"></script>
<script src="js/supabase-client.js"></script>
```

### Método 2: Meta Tags en HTML

Agregar meta tags en el `<head>` de cada página HTML:

```html
<head>
    <meta name="supabase-url" content="https://tsdpbqcwjckbfsdqacam.supabase.co">
    <meta name="supabase-anon-key" content="tu-clave-anon-key-aqui">
</head>
```

### Método 3: Template Variables (Si el servidor soporta templates)

Si el servidor soporta templates (como Netlify, Vercel, etc.), puede reemplazar variables:

```html
<script>
    window.SUPABASE_URL = '{{SUPABASE_DATABASE_URL}}';
    window.SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';
</script>
```

## Ejemplo de Implementación en Netlify

En `netlify.toml` o en las variables de entorno de Netlify:

```toml
[build]
  command = "npm run build"
  
[build.environment]
  SUPABASE_DATABASE_URL = "https://tsdpbqcwjckbfsdqacam.supabase.co"
  SUPABASE_ANON_KEY = "tu-clave-anon-key"
```

Y crear un script de build que inyecte estas variables en el HTML.

## Ejemplo de Implementación en Vercel

En las variables de entorno de Vercel, configurar:

- `SUPABASE_DATABASE_URL`
- `SUPABASE_ANON_KEY`

Y usar `next.config.js` o un middleware para inyectarlas.

## Verificación

Para verificar que las variables están configuradas correctamente, abre la consola del navegador y ejecuta:

```javascript
console.log(window.SUPABASE_CONFIG);
```

Deberías ver un objeto con `url` y `anonKey` configurados.

## Notas de Seguridad

- **NUNCA** expongas `SUPABASE_SERVICE_ROLE_KEY` en el frontend
- `SUPABASE_ANON_KEY` es segura para usar en el frontend (tiene RLS habilitado)
- `SUPABASE_JWT_SECRET` solo debe usarse en el backend

