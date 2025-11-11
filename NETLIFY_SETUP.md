# Configuración de Supabase en Netlify

## Solución Oficial Implementada

La plataforma ahora usa **Netlify Functions** para servir las variables de entorno de Supabase de forma segura al frontend.

## Estructura Implementada

```
netlify/
  └── functions/
      └── supabase-config.js  # Netlify Function que expone las variables

netlify.toml                   # Configuración de Netlify
```

## Pasos para Configurar en Netlify

### 1. Variables de Entorno en Netlify Dashboard

Ve a tu proyecto en Netlify Dashboard → **Site settings** → **Environment variables** y asegúrate de tener configuradas:

- `SUPABASE_DATABASE_URL` = `https://tsdpbqcwjckbfsdqacam.supabase.co`
- `SUPABASE_ANON_KEY` = (tu clave anónima)
- `SUPABASE_SERVICE_ROLE_KEY` = (tu clave de servicio - solo backend)
- `SUPABASE_JWT_SECRET` = (tu JWT secret - solo backend)

### 2. Verificar que la Function esté Desplegada

Después de hacer push al repositorio, Netlify debería:
1. Detectar el archivo `netlify/functions/supabase-config.js`
2. Desplegar la función automáticamente
3. Hacerla disponible en `/.netlify/functions/supabase-config`

### 3. Probar la Function

Puedes probar que la función funciona visitando:
```
https://tu-dominio.netlify.app/.netlify/functions/supabase-config
```

Deberías ver un JSON con:
```json
{
  "url": "https://tsdpbqcwjckbfsdqacam.supabase.co",
  "anonKey": "tu-clave-anon-key"
}
```

## Cómo Funciona

1. **Frontend carga `js/supabase-config.js`**
   - Este script hace un `fetch` a `/.netlify/functions/supabase-config`
   - Obtiene las variables de entorno del servidor

2. **Netlify Function (`supabase-config.js`)**
   - Lee `process.env.SUPABASE_DATABASE_URL` y `process.env.SUPABASE_ANON_KEY`
   - Las retorna como JSON al frontend
   - Solo expone las variables seguras (no expone SERVICE_ROLE_KEY ni JWT_SECRET)

3. **Frontend inicializa Supabase**
   - Usa las variables obtenidas para crear el cliente de Supabase
   - Todo funciona de forma oficial y segura

## Ventajas de Esta Solución

✅ **Oficial**: Usa el sistema nativo de Netlify Functions  
✅ **Seguro**: Las variables nunca están en el código fuente  
✅ **Automático**: Netlify despliega la función automáticamente  
✅ **Sin configuración manual**: No necesitas inyectar scripts en HTML  
✅ **Caché**: La respuesta se cachea por 1 hora para mejor rendimiento  

## Troubleshooting

### La función no responde

1. Verifica que `netlify/functions/supabase-config.js` existe
2. Verifica que `netlify.toml` está en la raíz del proyecto
3. Revisa los logs de Netlify Functions en el dashboard

### Variables no disponibles

1. Verifica que las variables están configuradas en Netlify Dashboard
2. Asegúrate de que los nombres son exactos: `SUPABASE_DATABASE_URL` y `SUPABASE_ANON_KEY`
3. Si cambiaste las variables, necesitas hacer un nuevo deploy

### Error CORS

La función ya tiene configurado CORS en `netlify.toml`. Si hay problemas, verifica que el header `Access-Control-Allow-Origin: *` esté presente.

## Notas de Seguridad

- ✅ `SUPABASE_ANON_KEY` es segura para exponer (tiene RLS habilitado)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` NUNCA se expone (solo backend)
- ❌ `SUPABASE_JWT_SECRET` NUNCA se expone (solo backend)

La función solo expone las variables seguras para el cliente.

