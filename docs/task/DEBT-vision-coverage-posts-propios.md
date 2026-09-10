# DEBT — Los posts PROPIOS entran sin archivo de media y sin descripcion visual

> **RESUELTO 2026-07-22** (ai-engine `f1d1548` IG/FB + `2d1b572` TikTok). La causa raiz no era el archivador
> sino que **a Instagram nunca se le pedia la imagen**: los `fields` del Graph no
> incluian `media_url`/`thumbnail_url`, asi que el post entraba con `image: null`
> y no habia nada que archivar ni que describir. Ver "Arreglo" al final.

**Fecha:** 2026-07-22 · **Detectado desde:** card "Producto destacado" (dashboard Mi Marca)
**Org de referencia:** WAKEUP (`e2477719-…6060`) · brand_container `826ce6bb-…0bfd`

## Que rompe

El bloque Producto destacado clasifica cada post propio contra las familias del
catalogo buscando keywords en **dos** fuentes: el copy y la **descripcion de la
imagen/video** (`media_descriptions_cache`, generada con Sonnet 4.6). La segunda
fuente es la que ve el producto cuando el copy no lo nombra.

Esa capa aporta de verdad — de los **81** posts donde hoy se detecta producto,
**24 se detectan SOLO por la imagen** (+42% sobre lo que da el copy solo) — pero
cubre un tercio del material:

| | posts propios |
|---|---|
| Total capturados | 259 |
| Con descripcion de media | **95 (37%)** |
| Con URL de media archivada (`archived_url` en R2) | **0** |
| `media_assets` con `image_extraction_error: no_image_urls` | 89 |

Consecuencia: los porcentajes de producto (share of voice, "% de todo tu
contenido") **subestiman sistematicamente** a los productos que se muestran pero
no se nombran. Un reel donde sale la Crema de Maní sin escribir "crema de maní"
en el copy no cuenta.

## Causa raiz (dos eslabones, ambos en la ingesta de posts PROPIOS)

1. **No se archiva el medio.** Existe `src/services/media-archive.service.js`
   (`archiveThumb`) y corre para lo monitoreado, pero no para lo propio:

   | post_source (14 dias) | posts | con `archived_url` |
   |---|---|---|
   | competitor | 17 | 11 |
   | reference | 101 | 30 |
   | **own** | **2** | **0** |

   Se guarda la URL firmada del CDN (fbcdn / tiktokcdn), que **caduca**.

2. **No se describe el medio.** La descripcion se dispara en el flujo de señales
   (`signal-webhook.controller.js` → `python-analyzer/app/tasks/media_orchestrator.py`).
   La ingesta de posts propios no pasa por ahi.

## Backfill: probado y NO viable sobre lo ya capturado

Se corrio `ai-engine/scripts/backfill_media_descriptions.py` sobre los 61 medios
propios pendientes que tenian URL: **1 descrita, 60 con `403 Forbidden`** (costo
real $0.006). Las URLs de CDN ya expiraron — es exactamente el mismo limite que
documenta `scripts/backfill_thumbs.mjs` ("las viejas devuelven 403 y no hay nada
que hacer con ellas").

**Lo historico solo se recupera re-scrapeando** (Apify, con su hard-limit). No se
hizo: decision del usuario 2026-07-22.

## Que hacer (orden propuesto)

1. **Archivar al capturar, tambien lo propio** — llamar `archiveThumb` en la ruta
   de ingesta de posts propios. Sin esto, cada dia que pasa se pierde material
   nuevo: la ventana de rescate son dias, no semanas.
2. **Describir lo propio** — encolar la descripcion de media para `post_source =
   'own'` igual que para las señales. Costo medido: **$0.008 por medio**.
3. (Opcional) Re-scrapear el historico si el analisis de producto necesita cubrir
   2025.

Mientras 1 y 2 no esten, cualquier lectura de "que producto empujas" debe leerse
como **piso**, no como medida.

Ver tambien: memoria `project_media_archive_thumbs_r2`,
`project_meta_own_posts_ingestion`, `project_producto_estrella_rpc_v2`.


## Arreglo (2026-07-22, ai-engine `f1d1548`)

**Causa raiz:** en `src/tools/social.tools.js`, los `fields` que se le piden al
Graph para los media de IG eran
`id,caption,media_type,permalink,timestamp,like_count,comments_count` — **sin
`media_url` ni `thumbnail_url`** — y el normalizador ponia `image: null` de forma
literal. El archivador y el describer estaban bien: nunca recibieron una imagen.
Facebook si traia `full_picture`, por eso su cobertura era menos mala.

**Cambios:**

1. `social.tools.js` — se piden `media_url`, `thumbnail_url` y
   `children{media_url,thumbnail_url,media_type}`. En VIDEO/REEL la portada
   describible es `thumbnail_url` (`media_url` es el mp4); en carrusel el padre no
   trae `media_url`, se usa la primera pieza. Son campos baratos: no disparan
   `total_time` como los insights (verificado: `usage.pct = 1`).
2. `social-scraper.service.js` — `_rescueOwnThumb`: los posts propios YA guardados
   sin copia en R2 se rescatan en el update de cada ciclo si su URL de CDN sigue
   viva, y se mandan a describir. Tambien se guarda el carrusel completo
   (`assets.images`).
3. `python-analyzer/app/tasks/media_helpers.py` — `extract_image_urls` prefiere
   `archived_url` (R2, permanente) sobre la URL del CDN en **toda** red.
4. `python-analyzer/app/main.py` — un `image_extraction_error` viejo ya no deja al
   post ciego para siempre si ahora existe copia archivada.

**Verificado en vivo (WAKEUP, sensor `meta_posts` forzado):** IG devuelve imagen y
las 7 piezas de un carrusel; los posts propios pasaron de **0** con `archived_url`
a rescatarse por ciclo, y el describer genero descripciones que **si nombran el
producto** ("crema de mani", "pouch amarillo WAKEUP") a $0.008 por medio.

**Lo que sigue sin recuperarse:** los posts cuya URL de CDN ya expiro (el backfill
dio 60 de 61 en 403). Cada ciclo rescata lo que siga vivo; el resto solo volveria
con un re-scrape.


## Segunda parte: TikTok (ai-engine `2d1b572`)

TikTok entra por su propio populador, no por el scraper, y tenia **dos** huecos:

- **No rescataba lo ya guardado:** un video existente hacia `skipped_existing++` y
  `continue`. Nunca se refrescaban sus metricas ni se archivaba su portada.
- **No describia NADA**, ni siquiera los videos nuevos: `triggerMediaAnalysis` era
  un helper privado dentro de `social-scraper.service.js` y ningun populador podia
  importarlo.

**Cambios:** el disparo de descripcion sale a `src/services/media-analysis.service.js`
(el scraper pasa a importarlo, misma funcion en un solo sitio); el populador rescata
la portada de los videos ya guardados —el `cover_image_url` que devuelve la API es
fresco, el guardado caduca— y manda a describir tanto los rescatados como los nuevos.

**Verificado:** una corrida de `tiktok_sync_posts` rescato y describio **37 videos**.
Los 20 restantes son mas viejos que la ventana que devuelve la API (`maxPages: 2`,
`perPage: 20` = 40 videos); subir ese presupuesto los alcanzaria.

## Estado final de la cobertura (WAKEUP)

| red | posts | archivados | descritos |
|---|---|---|---|
| Instagram | 101 | 99 | 97 |
| Facebook | 101 | 95 | 95 |
| TikTok | 57 | 37 | 37 |

Deteccion de producto: de **81 a 117** posts; los detectados **solo por la imagen**,
de **24 a 60**. Costo total del rescate: **$1.49**.

---

## Medido 2026-09-10 — la causa raíz sí está resuelta; queda un residuo

El archivo se marcó `RESUELTO 2026-07-22` pero **no se borró**, que es lo que
manda la convención de esta carpeta. Antes de borrarlo se midió, y resultó que
había motivo para no borrarlo: la mitad de "media" está resuelta, la de
"descripción visual" no del todo.

| Medida (posts `post_source='own'`) | Valor |
|---|---|
| Total | **341** |
| Con imagen (`images` / `display_url` / `cover_image`) | **338** (99%) ✅ |
| **Con descripción visual** | **235** (69%) |
| **Sin descripción visual** | **106** (31%) |
| Con `image_extraction_error` | **27** |

**La causa raíz está arreglada:** pedirle `media_url`/`thumbnail_url` al Graph
funcionó — 338 de 341 entran con imagen.

### El residuo, y qué es cada cosa

Los 106 sin descripción, por tipo de media:

```
(sin media_type) 45 · CAROUSEL_ALBUM+carousel_album 27 · VIDEO+video 23 · IMAGE+image 11
```

- Los **23 vídeos** probablemente no son un fallo: describir vídeo no es lo mismo
  que describir imagen, y puede ser fuera de alcance a propósito.
- Los **27 con `image_extraction_error`** sí son fallo real de extracción.
- Los **45 sin `media_type`** son datos incompletos.
- Los **11 IMAGE** son los que más claramente deberían tener descripción y no la
  tienen.

**Alcance que queda:** reprocesar los 27 con error y los 11 `IMAGE`, y decidir
explícitamente si vídeo y carrusel entran o no. Cuando eso se cierre, **borrar
este archivo** (no dejarlo marcado como resuelto, que fue el error anterior).

> Nota: el desglose de arriba destapó que `media_type` se guarda en **dos
> capitalizaciones** distintas. Eso se sacó a su propia ficha: `DATA-003`.
