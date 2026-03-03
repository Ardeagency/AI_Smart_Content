# Plan de implementación: Editor de video con FFmpeg.wasm

Este documento es el resultado del análisis completo de la plataforma AI Smart Content para integrar un editor de video en el navegador (FFmpeg.wasm) sin romper la aplicación. Incluye qué puede verse afectado por los headers necesarios para FFmpeg y un plan de implementación seguro.

---

## 1. Análisis de la plataforma

### 1.1 Arquitectura

- **SPA**: Una sola entrada `index.html`; el contenido se inyecta en `#app-container`.
- **Router**: `js/router.js` con History API; rutas registradas en `js/app.js` (vistas críticas cargadas al inicio, el resto en lazy por ruta).
- **Vistas**: Heredan de `BaseView.js`; muchas usan `templatePath` y cargan HTML desde `/templates/*`.
- **Servicios**: `AuthService`, `SupabaseService`, `AppState`, `OrgBrandTheme`, etc. en `js/services/`.
- **Netlify**: `netlify.toml` con redirects por tipo de recurso (js, css, templates, recursos, favicons, SQL) y fallback `/*` → `index.html`. Headers solo para `/.netlify/functions/*`, `/templates/*` y `/favicons/*`.

### 1.2 Flujo de carga

1. Se sirve `index.html` (con `/*`).
2. Se cargan en orden: Supabase (CDN), `app-loader.js`, `BaseView.js`, `router.js`, servicios, `LandingView`, `SignInView`, `Navigation.js`, `app.js`.
3. `app-loader.js` hace la secuencia de entrada y llama a `/.netlify/functions/supabase-config`.
4. `app.js` registra rutas (muchas con `_lazy(globalName, [deps])`) e inicia el router.
5. Al navegar, el router carga scripts bajo demanda, instancia la vista y llama a `render()`.

### 1.3 Recursos externos (críticos para COOP/COEP)

Cualquier **embed** cross-origin (script, link, img, iframe, font) puede bloquearse si activamos **Cross-Origin-Embedder-Policy: require-corp** y el recurso no envía `Cross-Origin-Resource-Policy` (o no se carga con `crossorigin` adecuado).

| Origen | Uso | Dónde |
|--------|-----|--------|
| `cdn.jsdelivr.net` | Script Supabase, CSS FontAwesome, webfonts FA | index.html |
| `cdn.jsdelivr.net` | Chart.js (script dinámico) | DashboardView.js |
| `fonts.googleapis.com` | CSS Inter | index.html |
| `fonts.gstatic.com` | Fuentes Inter (referenciadas por CSS) | implícito |
| `fonts.googleapis.com` | CSS dinámico por familia | BrandsView.js |
| `wompi.co` | Imagen logo en modal de pago | payment-modal.js |
| Supabase (storage) | Imágenes/vídeos en Living/Video/otros | fetch/img en varias vistas |

**Nota**: Las peticiones `fetch()` a APIs (Supabase, Netlify Functions, api.wompi.co) no son “embeds” y no las bloquea COEP; sí pueden verse afectadas las imágenes/scripts/estilos/fuentes cargados como recurso de la página.

### 1.4 Rutas y vistas existentes relacionadas con video

- **Video (generación)**  
  - Rutas: `/video`, `/org/:orgIdShort/:orgNameSlug/video`  
  - Vista: `VideoView.js` (Kling/KIE, generación y cola; no edición local).

No existe aún una ruta ni vista para “editor de video” (unir/recortar en navegador); el plan las añade.

---

## 2. Headers necesarios para FFmpeg.wasm (multihilo)

FFmpeg.wasm usa WebAssembly con hilos y **SharedArrayBuffer**. En navegadores modernos, SharedArrayBuffer solo está disponible si la página está en **cross-origin isolation**, lo que exige estos headers en la **respuesta del documento** (el HTML que carga la SPA):

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- **COOP same-origin**: aísla el contexto; ventanas/iframes cross-origin no comparten contexto.
- **COEP require-corp**: todo recurso cross-origin embebido (script, link, img, font, etc.) debe ser same-origin o enviar `Cross-Origin-Resource-Policy` (CORP) compatible; si no, el navegador lo bloquea.

En tu caso, el documento es siempre `index.html` (fallback `/*`). Si pones estos headers en `/*`, **toda la SPA** se sirve con COOP/COEP. Por tanto:

- Todos los scripts, estilos, fuentes e imágenes externas que use la app deben ser compatibles con COEP (mismo origen o CORP/crossorigin correcto).
- Si algo no lo es (p. ej. una imagen de Wompi, un script que no envía CORP), esa parte de la app puede dejar de funcionar o dar errores en consola.

---

## 3. Riesgos de activar COOP/COEP en toda la app

### 3.1 Recursos que podrían fallar

1. **Scripts desde CDN**  
   - Supabase, Chart.js (jsdelivr).  
   - jsDelivr suele enviar CORS; hay que comprobar en producción que con COEP no se bloqueen (o usar `crossorigin` si hace falta).

2. **FontAwesome (CSS + webfonts)**  
   - Mismo comentario; en muchos entornos funciona, pero debe verificarse con los headers activados.

3. **Google Fonts (Inter + fuentes dinámicas en Brands)**  
   - Google suele ser compatible con CORS/CORP; conviene probar landing, login y vista de marcas con COEP activo.

4. **Imagen de Wompi**  
   - `payment-modal.js`: `<img src="https://wompi.co/...">`.  
   - Si el dominio de Wompi no envía CORP, la imagen se bloqueará con COEP. Solución posible: alojar el logo en tu dominio o usar un proxy.

5. **Imágenes dinámicas (Living, etc.)**  
   - Si `imageUrl` apunta a Supabase Storage u otro origen, esos orígenes deben enviar CORP (o ser same-origin) para que las imágenes se muestren con COEP.

6. **Sin iframes**  
   - No se detectan iframes en la app; no hay riesgo extra por embeds tipo YouTube/Vimeo.

### 3.2 Orden de headers en Netlify

En `netlify.toml`, el **primer** bloque `[[headers]]` que coincida con una ruta es el que se aplica. Ahora tienes:

- `/.netlify/functions/*`
- `/templates/*`
- `/favicons/*`

Si añades un bloque `for = "/*"` con COOP/COEP, solo afectará a rutas que no coincidan antes. Como `/*` suele ser el fallback de “todo lo demás”, ese bloque aplicaría a `index.html` cuando se sirve por la regla `from = "/*" to = "/index.html"`. Hay que asegurarse de no sobrescribir headers necesarios para funciones (CORS). Lo seguro es no poner COOP/COEP en `/.netlify/functions/*` y sí en la SPA.

---

## 4. Estrategias posibles

### Opción A: FFmpeg.wasm single-thread (recomendada para empezar)

- Usar el **build single-thread** de FFmpeg.wasm, que **no** depende de SharedArrayBuffer.
- Paquete: **@ffmpeg/core-st** (v0.11.x), que es la variante “core” sin multihilo.
- **No** hace falta COOP/COEP en ninguna ruta.
- La plataforma sigue igual; no hay que tocar headers ni validar todos los CDN.
- Contras: menor rendimiento que el multihilo y el core single-thread corre en el main thread (puede bloquear la UI durante la codificación). Para uniones cortas de 2 vídeos suele ser aceptable.

Implementación: cargar `@ffmpeg/ffmpeg` y al hacer `load()` pasar la URL/base del **core-st** en lugar del core multihilo (ver documentación de ffmpeg.wasm para el parámetro `coreURL`/`wasmURL` según versión).

### Opción B: COOP/COEP globales + FFmpeg multihilo

- Añadir en `netlify.toml` un bloque:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

- Añadir el script de FFmpeg (multihilo) en la ruta del editor o en `index.html` si se usa en toda la app.
- **Obligatorio**: comprobar en staging/producción que no se rompe:
  - Landing, login, settings.
  - Dashboard (Chart.js).
  - Brands (Google Fonts dinámicos).
  - Modal de pago (logo Wompi).
  - Living y cualquier vista que muestre imágenes desde Supabase u otros orígenes.
- Si algo falla: self-host del recurso problemático o proxy con CORP, o volver a Opción A.

### Opción C: Editor en página separada con COOP/COEP solo ahí

- Crear una segunda entrada, por ejemplo `editor-video.html`, servida solo para una ruta concreta (ej. `/editor-video.html`).
- En `netlify.toml`, aplicar COOP/COEP **solo** a esa ruta (ej. `for = "/editor-video.html"`).
- El resto de la app sigue sin COOP/COEP.
- El editor puede ser una miniapp dentro de esa página (o cargarse en iframe desde la SPA; la SPA no necesita COOP/COEP). Requiere una ruta “especial” y posiblemente enlace desde Video o menú.

---

## 5. Plan de implementación recomendado (por fases)

### Fase 0: Decisión de estrategia

- **Recomendación**: empezar por **Opción A** (single-thread) para tener editor funcional sin tocar headers.
- Si más adelante se necesita más rendimiento, seguir con **Opción B** (o C) y la lista de comprobación de la sección 6.

### Fase 1: Sin cambiar headers (Opción A)

1. **No modificar `netlify.toml`** (ni añadir COOP/COEP).
2. **Añadir FFmpeg.wasm (core, no-MT)**  
   - Incluir el script del build single-thread (por ejemplo desde CDN o copia local).  
   - Cargarlo solo en la ruta del editor (lazy), no en `index.html` global, para no afectar el tiempo de carga del resto de la app.
3. **Nueva ruta**  
   - En `app.js`: registrar algo como `/editor-video` o `/org/.../editor-video` con un loader que cargue la vista del editor y, si hace falta, el script de FFmpeg.
4. **Nueva vista**  
   - Crear `js/views/VideoEditorView.js` que extienda `BaseView`, con UI para:
     - Subir 2 (o N) vídeos.
     - Llamar a FFmpeg (concat o el filtro que corresponda).
     - Mostrar progreso y resultado (reproducción + descarga).
5. **Servicio opcional**  
   - `js/services/VideoEditorService.js` (o lógica dentro de la vista) que encapsule `createFFmpeg`, `load()`, `writeFile`, `run`, `readFile` y la generación del blob/URL para el `<video>` y el enlace de descarga.
6. **Navegación**  
   - En `Navigation.js` (o donde corresponda al menú de Video), añadir enlace a “Editor de video” que lleve a la nueva ruta.
7. **Template/HTML**  
   - Si sigues el patrón de otras vistas con template, crear `templates/editor-video.html`; si no, implementar `renderHTML()` en la vista como en `VideoView.js`.

### Fase 2: Lógica de unión de vídeos

- En la vista (o en el servicio):
  - Cargar FFmpeg con `ffmpeg.load()` (sin flags de multihilo si usas core).
  - Escribir archivos en el sistema virtual: `ffmpeg.FS('writeFile', 'v1.mp4', await fetchFile(file1));` (y v2).
  - Ejecutar concat (ej. filtro `concat` o lista de archivos según documentación de ffmpeg.wasm).
  - Leer resultado, crear blob y `URL.createObjectURL`, asignar a `<video>` y a un `<a download>`.

Mantener la misma idea que ya tienes en el pseudocódigo (concat n=2:v=1:a=1), adaptando a la API exacta del build que uses (nombres de paquete y de export).

### Fase 3: Headers COOP/COEP activados (Opción B)
**Aplicado:** Tras el error "SharedArrayBuffer is not defined" en el editor, se añadieron en `netlify.toml` los headers de cross-origin isolation para `/*`, de modo que el core de FFmpeg.wasm (por defecto multihilo) funcione. El servicio sigue intentando usar core-st vía `createFFmpeg({ coreURL, wasmURL })`; si la build 0.11 no lo respeta, el core por defecto ya puede usarse gracias a los headers. Conviene ejecutar la **lista de comprobación** (sección 6) tras desplegar; si algún recurso externo falla (p. ej. logo Wompi), self-host o proxy con CORP.

---

## 6. Checklist antes/después de activar COOP/COEP

Si en algún momento activas COOP/COEP (Opción B o C para la página del editor):

- [ ] Landing: carga, logo, fuentes, botones.
- [ ] Login/SignIn: carga, estilos, Supabase.
- [ ] Dashboard: carga de Chart.js y gráficos.
- [ ] Brands: carga y fuentes dinámicas (Google Fonts).
- [ ] Video (generación Kling): flujo completo y reproducción/descarga.
- [ ] Modal de pago: logo de Wompi visible; si falla, sustituir por asset propio o proxy.
- [ ] Living / vistas con imágenes desde Supabase u otros orígenes: imágenes visibles.
- [ ] Navegación y rutas profundas (org, producción, etc.): sin errores en consola por recursos bloqueados.
- [ ] Editor de video: carga de FFmpeg, unión de 2 vídeos y descarga.

---

## 7. Qué no hacer (para que la plataforma siga estable)

- **No** añadir COOP/COEP a `/.netlify/functions/*` (podría afectar CORS de las APIs).
- **No** cargar el script de FFmpeg en `index.html` de forma obligatoria para todas las rutas; cargarlo solo en la ruta del editor (lazy) para no aumentar el peso inicial.
- **No** reemplazar ni duplicar la lógica existente de `VideoView` (generación con Kling); el editor es una herramienta complementaria (unir/editar en navegador).
- **No** asumir que todos los CDN envían CORP; validar con los headers activados en un entorno de prueba antes de dar por buena la Opción B.

---

## 8. Resumen de archivos a tocar (Fase 1 – Opción A)

| Archivo | Cambio |
|---------|--------|
| `netlify.toml` | Ninguno (Fase 1). |
| `index.html` | Ninguno (FFmpeg se carga lazy en la ruta del editor). |
| `js/app.js` | Registrar ruta `/editor-video` (y si aplica `/org/.../editor-video`) con loader que cargue `VideoEditorView` + script FFmpeg. |
| `js/views/VideoEditorView.js` | Nuevo: extiende BaseView, UI y lógica de unión con FFmpeg (core). |
| `js/services/VideoEditorService.js` | Opcional: encapsular createFFmpeg, load, writeFile, run, readFile. |
| `templates/editor-video.html` | Opcional: si la vista usa template. |
| `js/components/Navigation.js` | Añadir enlace “Editor de video” en la sección/menú de Video. |

Con esto la plataforma sigue funcionando igual y el editor de video se integra sin riesgos de headers. Cuando quieras, el siguiente paso es implementar la Fase 1 (ruta, vista, servicio y carga lazy de FFmpeg core) y, si lo deseas después, valorar Fase 3 con COOP/COEP y build multihilo.
