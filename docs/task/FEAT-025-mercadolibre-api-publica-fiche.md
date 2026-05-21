# FEAT-025 — Cablear API publica de Mercado Libre para URL flow de ficha

**Estado**: pendiente
**Creado**: 2026-05-21
**Contexto**: descubierto durante FEAT del URL flow de Adjuntar Producto (commits dea32cad → eecaf3dd).

## Problema

`api-products-generate-fiche.js` hace fetch del HTML de la URL para extraer datos del producto, pero Mercado Libre sirve SSR minimo (8KB stub con solo `og:image` + `og:title`) y la galeria/atributos/variantes se hidratan client-side via JS. Resultado:

- Para URLs `articulo.mercadolibre.com.co/MCO-XXXXX-...-_JM` apenas se obtiene 1 imagen y titulo.
- Para URLs catalog `mercadolibre.com.co/.../up/MCOU...` el SSR es aun mas pobre y el guard `isUsefulScrape` ahora correctamente rechaza con 422.

El usuario hoy recibe: "El producto no se pudo obtener desde la pagina de Mercado Libre". Funciona como red de seguridad pero limita el use case mas comun de e-commerce en LatAm.

## Solucion propuesta

ML expone una API publica sin auth para items individuales:

```
GET https://api.mercadolibre.com/items/{item_id}
GET https://api.mercadolibre.com/items/{item_id}/description
```

Que devuelve JSON estructurado con todo: titulo, precio, moneda, condicion, atributos (color/talla/sabor), variations (variantes), pictures (galeria completa), seller, categoria.

### Plan de implementacion

1. **Detectar URLs ML antes de scraping**: en `handlerImpl()`, despues de validar `sourceUrl`, chequear si hostname matchea `mercadolibre.{co,com,com.ar,...}` o `mercadolivre.com.br`.

2. **Extraer item_id de la URL**: ML tiene 2 formatos principales
   - `articulo.mercadolibre.com.co/MCO-944706832-...` → `MCO944706832`
   - `mercadolibre.com.co/.../up/MCOU2433233017?pdp_filters=item_id%3AMCO982390441` → `MCO982390441` (de pdp_filters)

3. **Llamar a `api.mercadolibre.com/items/{id}`** con `Accept: application/json` (sin auth — es publico). Mapear el response a la estructura `scraped` que ya usa el resto del flow:
   ```js
   scraped = {
     title: item.title,
     description: descRes.plain_text,  // call separado a /description
     brand: extractAttr(item.attributes, 'BRAND'),
     price: item.price,
     currency: item.currency_id,
     availability: item.available_quantity > 0 ? 'InStock' : 'OutOfStock',
     images: item.pictures.map(p => p.secure_url || p.url),
     variants: item.variations?.map(v => ({...}))
   }
   ```

4. **Variantes**: `item.variations[]` tiene `attribute_combinations` (color/talla/sabor) + `picture_ids` + `price` por variante. Mapear a la estructura interna que ya consumimos.

5. **Fall back al scrape HTML existente** si la API ML falla (rate limit, item privado, item_id mal extraido).

### Costo

- API publica de ML no cobra ni requiere registro
- Rate limit publico es generoso (~1000 req/h por IP)
- Eliminamos la dependencia del HTML SSR para ese flow

### Edge cases a manejar

- URLs short (`mercadolibre.com.co/p/MLA...`) → catalog product, requiere endpoint distinto `/products/{id}`
- Item privado o eliminado → API devuelve 404, fall back al scrape
- Items con muchas variaciones (>20) → cap a 20 para no spam OpenAI
- `pictures` puede tener 5-10 fotos: aplica el cap de 6 + content-hash dedup ya existente

## Tareas concretas

- [ ] Helper `extractMercadoLibreId(url)` con regex para los 2 formatos de URL
- [ ] Helper `fetchFromMercadoLibreApi(itemId)` que llame a la API publica y retorne la estructura `scraped`
- [ ] Branch en `handlerImpl()`: si platform === 'Mercado Libre', intentar API publica antes de scrapear HTML
- [ ] Tests con 3 URLs reales: articulo clasico, catalog `/up/`, marketplace `/p/MLA...`
- [ ] Actualizar memoria `project_product_fiche_openai.md` con el nuevo path

## Notas

- Si el patron sirve, evaluar agregar APIs publicas similares para Amazon (Product Advertising API requires auth, complicado), Falabella (no expone), AliExpress (no expone). ML es de los pocos que tienen API publica generosa.
- Mantener el guard `isUsefulScrape` activo como red de seguridad para el resto de plataformas.
