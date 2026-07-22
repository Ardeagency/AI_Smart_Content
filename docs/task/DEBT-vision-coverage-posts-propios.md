# DEBT — Los posts PROPIOS entran sin archivo de media y sin descripcion visual

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
