# Si /.netlify/functions/* o /api/kling-video devuelve 404

La app llama a **/api/kling-video** (rewrite a `/.netlify/functions/kling-video`). Si sigue 404:

## 1. Comprobar que las funciones se despliegan

En **Netlify** → tu sitio → **Functions** (o **Site configuration** → **Functions**):

- Debe aparecer **kling-video** en la lista.
- Si **no aparece**, Netlify no está desplegando la carpeta `functions/`.

## 2. Base directory

En **Site configuration** → **Build & deploy** → **Build settings**:

- **Base directory**: debe estar **vacío** (o ser la carpeta que contiene `netlify.toml` y la carpeta `functions/`).
- Si Base directory es, por ejemplo, `frontend`, entonces Netlify solo ve lo que hay dentro de `frontend/`. En ese caso la carpeta de funciones debe ser `frontend/functions/` (y en `netlify.toml` pondrías `directory = "functions"` relativo a esa base).

## 3. Rama que se despliega

En **Build & deploy** → **Continuous deployment**:

- Confirma que la **rama** que se despliega (p. ej. `main`) es la que tiene la carpeta `functions/` con `kling-video.js` en el repo.

## 4. Redeploy limpio

- **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.
- Así se fuerza un build desde cero y se vuelven a empaquetar las funciones.

## 5. Directorio de funciones en la UI

En **Site configuration** → **Functions** (si existe la opción):

- Si hay un campo **“Functions directory”** o similar, déjalo **vacío** para usar el valor de `netlify.toml` (`directory = "functions"`), o pon **functions** si pide una ruta relativa.

---

Si tras esto **kling-video** sigue sin aparecer en la pestaña Functions, el problema es la configuración del sitio en Netlify (base directory, rama o directorio de funciones), no el código.
