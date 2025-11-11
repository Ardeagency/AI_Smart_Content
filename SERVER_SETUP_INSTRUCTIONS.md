# Instrucciones para Configurar Supabase en el Servidor

## Problema Actual

El servidor tiene las variables de entorno configuradas:
- `SUPABASE_DATABASE_URL` = `https://tsdpbqcwjckbfsdqacam.supabase.co`
- `SUPABASE_ANON_KEY` = (tu clave anónima)
- `SUPABASE_SERVICE_ROLE_KEY` = (tu clave de servicio)
- `SUPABASE_JWT_SECRET` = (tu JWT secret)

**PERO** estas variables no se están inyectando en el HTML antes de que se carguen los scripts de Supabase.

## Solución: Inyectar Variables en el HTML

El servidor debe inyectar un script **ANTES** de los scripts de Supabase en **TODAS** las páginas HTML.

### Archivos que necesitan la inyección:
- `planes.html`
- `login.html`
- `form-record.html`
- Cualquier otra página que use Supabase

### Código a Inyectar

Agregar este script **ANTES** de la línea que dice `<!-- Supabase -->`:

```html
<!-- INYECCIÓN DE VARIABLES DE SUPABASE (DEBE IR ANTES DE LOS SCRIPTS) -->
<script>
    // El servidor debe reemplazar estos valores con las variables de entorno reales
    window.SUPABASE_URL = 'https://tsdpbqcwjckbfsdqacam.supabase.co';
    window.SUPABASE_ANON_KEY = 'TU_CLAVE_ANON_KEY_AQUI';
</script>
<!-- Supabase -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/supabase-config.js"></script>
<script src="js/supabase-client.js"></script>
```

## Métodos de Implementación según el Servidor

### Opción 1: Netlify

En `netlify.toml` o en las variables de entorno de Netlify, configurar:
- `SUPABASE_DATABASE_URL`
- `SUPABASE_ANON_KEY`

Luego, crear un script de build que inyecte estas variables en el HTML:

```javascript
// build-inject.js
const fs = require('fs');
const path = require('path');

const htmlFiles = ['planes.html', 'login.html', 'form-record.html'];
const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

htmlFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    const injection = `<script>
    window.SUPABASE_URL = '${supabaseUrl}';
    window.SUPABASE_ANON_KEY = '${supabaseKey}';
</script>`;
    
    // Insertar antes de <!-- Supabase -->
    content = content.replace(
        /<!-- Supabase -->/,
        injection + '\n    <!-- Supabase -->'
    );
    
    fs.writeFileSync(filePath, content);
});
```

### Opción 2: Vercel

Similar a Netlify, usar variables de entorno y un script de build.

### Opción 3: Servidor Personalizado (Node.js/Express)

```javascript
// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.get('*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Inyectar variables de Supabase
    const injection = `<script>
    window.SUPABASE_URL = '${process.env.SUPABASE_DATABASE_URL}';
    window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';
</script>`;
    
    content = content.replace(
        /<!-- Supabase -->/,
        injection + '\n    <!-- Supabase -->'
    );
    
    res.send(content);
});

app.use(express.static(__dirname));
app.listen(3000);
```

### Opción 4: Servidor Estático con Meta Tags

Si no puedes inyectar scripts, usar meta tags en el `<head>`:

```html
<head>
    <meta name="supabase-url" content="https://tsdpbqcwjckbfsdqacam.supabase.co">
    <meta name="supabase-anon-key" content="TU_CLAVE_ANON_KEY">
</head>
```

## Verificación

Después de implementar, abrir la consola del navegador y ejecutar:

```javascript
console.log(window.SUPABASE_CONFIG);
```

Deberías ver:
```javascript
{
    url: "https://tsdpbqcwjckbfsdqacam.supabase.co",
    anonKey: "tu-clave-aqui",
    serviceRoleKey: ""
}
```

Si ves `url: ""` o `anonKey: ""`, las variables no se están inyectando correctamente.

## Notas de Seguridad

- ✅ `SUPABASE_ANON_KEY` es segura para exponer en el frontend (tiene RLS)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` NUNCA debe exponerse en el frontend
- ❌ `SUPABASE_JWT_SECRET` NUNCA debe exponerse en el frontend

