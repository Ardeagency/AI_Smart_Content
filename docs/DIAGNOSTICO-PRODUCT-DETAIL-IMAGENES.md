# Diagnóstico: Subida de imágenes en Product Detail

Estado del flujo completo de **detalle de producto** y subida de imágenes (Storage + tabla `product_images`).

---

## 1. Flujo general

| Paso | Dónde | Qué hace |
|------|--------|----------|
| 1 | `app.js` | Ruta `/org/.../product-detail/:brandId/:productId` o `/products/:productId` → `ProductsView` |
| 2 | `ProductsView.render()` | Carga producto, imágenes y marca; pinta HTML con `getProductDetailHTML()` |
| 3 | `ProductsView.init()` | Si hay `productId` → `initProductDetail()` → `bindGalleryEvents()` |
| 4 | Usuario clic "Añadir fotos" | Label `#productViewUploadBtn` (for=`#productViewImageUpload`) o fallback JS `uploadInput.click()` |
| 5 | `change` en input | `uploadProductImages(files)` |
| 6 | Subida | Storage `product-images` → luego `INSERT` en `product_images` → `refreshDetailImages()` |

---

## 2. Frontend (ProductsView.js)

### 2.1 Contenedor y DOM

- **Container:** `this.container = document.getElementById('app-container')` (BaseView).
- El HTML del detalle se inyecta en ese mismo container; los nodos `#productViewImageUpload` y `#productViewUploadBtn` están dentro de `.product-view-gallery-upload` y son encontrables con `container.querySelector()`.

**Conclusión:** Contenedor y presencia de los elementos en el DOM están correctos.

### 2.2 Selector de archivos (por qué podría no abrirse)

- Input: `<input type="file" id="productViewImageUpload" accept="image/*" multiple style="display: none;">`
- Botón: `<label for="productViewImageUpload" ... id="productViewUploadBtn">Añadir fotos</label>`

En `bindGalleryEvents()` se hace:

```js
uploadLabel.addEventListener('click', (e) => {
  if (e.target.tagName === 'INPUT') return;
  e.preventDefault();   // ← anula el comportamiento nativo del label
  uploadInput.click();  // ← apertura por JS
});
```

- **Problema:** Con `preventDefault()` se evita que el navegador abra el diálogo por el comportamiento nativo del `<label for="...">`. La apertura queda solo en manos de `uploadInput.click()`. En algunos entornos (SPA, iframes, políticas de seguridad), un `click()` programático sobre un `<input type="file">` puede no considerarse “gesto de usuario” y el navegador **no abre el selector**.
- **Recomendación:** Quitar el `preventDefault()` y el manejador de click en el label, y confiar en el `for` del label para abrir el selector. Si en algún navegador falla, se puede mantener un fallback que solo haga `uploadInput.click()` **sin** `preventDefault()`.

### 2.3 Evento `change` y subida

- Se usa `addEventListener('change', this._boundUploadChange)` y antes se hace `removeEventListener('change', this._boundUploadChange)` para no duplicar listeners.
- En el handler se llama a `this.uploadProductImages(files)` y se resetea `e.target.value = ''`.

**Conclusión:** El encadenamiento desde el `change` hasta `uploadProductImages` es correcto.

### 2.4 uploadProductImages(files)

- Comprueba `this.supabase`, `this.productId`, `files` y usuario logueado (`auth.getUser()`).
- Filtra archivos: máximo 5 MB, `file.type.startsWith('image/')`.
- Muestra “Subiendo fotos...” y luego, en caso de error, el mensaje de Supabase (storage o insert).
- Ruta de subida: `${userId}/${this.productId}/${Date.now()}_${random}_${file.name}`.
- Bucket: `product-images`.
- Tras cada subida: `getPublicUrl(fileName)` y `INSERT` en `product_images` (product_id, image_url, image_type, image_order).
- Errores de `upload` o `insert` se capturan y se muestran en pantalla (y en consola).

**Conclusión:** Lógica de subida, path y manejo de errores están bien planteados. Si algo falla, el mensaje visible debería indicar si es storage o base de datos.

### 2.5 refreshDetailImages()

- Vuelve a cargar imágenes con `loadProductImagesForDetail(this.productId)`.
- Actualiza imagen principal (crea `#productViewMainImage` si no existía).
- Reconstruye miniaturas y vuelve a llamar a `bindGalleryEvents()`.

**Conclusión:** Tras una subida correcta, la galería debería actualizarse bien.

---

## 3. Backend: Supabase Storage (product-images)

### 3.1 Bucket (SQL/storage_buckets.sql)

- **id/name:** `product-images`
- **public:** true
- **file_size_limit:** 5 MB (5242880)
- **allowed_mime_types:** `image/png`, `image/jpeg`, `image/jpg`, `image/webp`

Si el bucket no existe o tiene otro nombre en el proyecto, la subida fallará (el mensaje de error aparecerá en la notificación).

### 3.2 Políticas de storage

- **INSERT:** `bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]`
  - La ruta debe ser `{userId}/...` y el primer segmento debe ser el UUID del usuario autenticado.
- **SELECT/DELETE:** misma condición para el primer segmento.

En el código la ruta es `${userId}/${this.productId}/...`, con `userId = user?.id` de `auth.getUser()`, por lo que coincide con la política.

**Posibles fallos:**

- Bucket `product-images` no creado en el proyecto.
- Políticas de storage no aplicadas o con nombres distintos (p. ej. “Users can upload own product images”).
- `auth.uid()` null (usuario no autenticado o sesión caducada) → el primer segmento no coincidirá.

---

## 4. Backend: Tabla product_images y RLS

### 4.1 Esquema (schema.sql)

- `product_images`: id, product_id (FK → products), image_url, image_type, image_order, created_at.
- `products`: brand_container_id (FK → brand_containers), entre otros.

### 4.2 RLS product_images (security_RLS.sql)

- **Policy “Access product images”:**  
  `FOR ALL TO authenticated`  
  `USING (EXISTS (SELECT 1 FROM products p JOIN brand_containers bc ON bc.id = p.brand_container_id WHERE p.id = product_id AND (bc.user_id = auth.uid() OR (bc.organization_id IS NOT NULL AND public.is_org_member(bc.organization_id)) OR public.is_developer())))`

Para **INSERT** en RLS, si no hay `WITH CHECK` explícito, se suele usar la misma expresión que `USING`. Es decir: el usuario solo puede insertar en `product_images` si el `product_id` pertenece a un producto cuya marca (brand_container) cumple:

- `bc.user_id = auth.uid()`, o  
- es de una organización y el usuario es miembro (`is_org_member`), o  
- el usuario es developer.

Si el usuario puede ver el detalle del producto (porque pasó el RLS de `products`), en principio debería poder insertar en `product_images` para ese producto. Si no, típicamente el error será tipo “new row violates row-level security policy” y aparecerá en la notificación/consola.

**Posibles fallos:**

- RLS activado en `product_images` pero política no creada o con condición más restrictiva.
- Producto sin `brand_container_id` o marca a la que el usuario no tiene acceso (menos habitual si el detalle ya carga).

---

## 5. Resumen de diagnóstico

| Área | Estado | Notas |
|------|--------|--------|
| Rutas y vista | OK | product-detail y products/:productId usan ProductsView y entran en modo detalle. |
| Container y DOM | OK | Elementos de subida dentro de `#app-container`. |
| Apertura del selector | Riesgo | `preventDefault()` en el label puede impedir que se abra el diálogo; mejor confiar en el `for` del label o fallback sin preventDefault. |
| Evento change → upload | OK | Handler correcto y sin duplicados. |
| Lógica uploadProductImages | OK | Validación, path, bucket, insert y mensajes de error coherentes. |
| refreshDetailImages | OK | Actualiza principal y miniaturas y re-enlaza eventos. |
| Bucket product-images | Revisar en Supabase | Debe existir, ser público, 5 MB, MIME indicados. |
| Políticas storage | Revisar en Supabase | INSERT/SELECT/DELETE con primer segmento = auth.uid(). |
| RLS product_images | Revisar en Supabase | Policy “Access product images” para acceso por producto/marca/org. |

---

## 6. Acciones recomendadas

### 6.1 En el código (recomendado)

- **Quitar `preventDefault()`** en el click del label y, si se mantiene un fallback, que solo haga `uploadInput.click()` sin prevenir el default, para no bloquear el comportamiento nativo del `<label for="productViewImageUpload">`.

### 6.2 En Supabase

1. **Storage**
   - Comprobar que existe el bucket `product-images` (público, 5 MB, MIME: png, jpeg, jpg, webp).
   - Comprobar políticas de storage para `product-images` (INSERT con primer segmento = `auth.uid()::text`).

2. **Base de datos**
   - Comprobar que en `product_images` está activado RLS y existe la policy “Access product images” (o equivalente) que permita INSERT cuando el producto pertenece a una marca/org a la que el usuario tiene acceso.

### 6.3 Para depurar en vivo

- Abrir consola (F12) en la página de detalle de producto.
- Al hacer clic en “Añadir fotos”: ver si se dispara el evento `change` del input (p. ej. un `console.log` temporal en el handler).
- Si aparece “Subiendo fotos...” y luego un error, el mensaje en la notificación (y en consola) indicará si es:
  - **Storage:** mensaje del bucket/políticas (ej. “Bucket not found”, “new row violates row-level security” en storage).
  - **Insert:** mensaje de la tabla (ej. “new row violates row-level security policy” en `product_images`).

Con esto se tiene un diagnóstico completo del estado de la subida de imágenes en product detail y los puntos donde puede estar fallando (selector, storage o RLS de `product_images`).
