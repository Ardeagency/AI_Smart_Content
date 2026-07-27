# 06 — Integraciones y sensores

Cómo entran los datos del mundo real a la plataforma, y qué se decidió sobre escribir
de vuelta hacia afuera.

---

## 1. La política de escritura (transversal, no negociable)

Las integraciones se autorizan con scope **read + write + offline_access**. **El scope
`write` NO es para escritura autónoma.**

> Existe únicamente para servir el botón humano **"actualizar ficha"**: Vera optimiza
> la ficha (SEO/GEO), se la **propone** al usuario, y la escritura ocurre **sólo
> cuando el usuario pulsa el botón**.

Guardrails que se sostienen siempre:

- El **populator** y **Vera en background** son **read-only**.
- El token con poder de escritura existe **sólo detrás de la acción explícita**.
- **Nunca** cablear una escritura disparada por un job o por un LLM autónomo.

El patrón aplica a todas: Mercado Libre / Shopify / Amazon (botón "actualizar ficha"),
YouTube (título y descripción), Google Ads (keywords), Business Profile (ficha y
reseñas), Meta (publicar posts). En todas: **read = análisis, write = sólo botón humano.**

**Regla hermana:** en integraciones multi-cuenta (Google Ads, cuentas publicitarias de
Meta) **nunca auto-importar todo lo accesible**. El usuario elige qué cuenta pertenece
a la marca. Un populator ya importó nueve cuentas publicitarias de otras marcas que el
usuario administraba como agencia; ahora filtra a las cuentas del *business* de las
páginas concedidas explícitamente, y sin páginas concedidas sincroniza **cero**.

**Protocolo de onboarding:** toda API o servicio nuevo pasa antes por investigación de
la documentación oficial, un dossier con capacidades, condiciones, limitaciones y
banderas rojas, y validación de la credencial en vivo. Antes de escribir una línea de
integración.

---

## 2. Estado por integración

| Plataforma | Lectura | Escritura | Estado |
|---|---|---|---|
| **Meta (FB + IG)** | Completa: posts propios, insights de cuenta y por post, demografía, campañas, audiencias, biblioteca de anuncios | Botón humano | **La más madura.** Única que volcaba insights completos antes de julio |
| **Google (GA4, YouTube, Ads)** | GA4 y YouTube por OAuth; sensor diario de Google Ads con backfill de 14 días | Botón humano | El sensor de Ads corre limpio pero **no hay pauta activa** en la cuenta conectada |
| **TikTok** | Perfil, stats y videos propios; sensor diario de insights | Publicación **bloqueada** | Read-side construido 2026-06-16 |
| **Shopify** | Catálogo, productos, imágenes; sensor de ventas construido | Botón humano | Sensor construido pero **el token de la tienda de prueba está muerto** desde mayo |
| **Mercado Libre** | Catálogo, reputación, visitas | Botón humano | Órdenes y preguntas **bloqueadas por permisos de la app** |
| **X** | Sólo scraping | — | Sin integración oficial de insights |
| **Amazon** | — | — | Marcada inactiva/beta: no aplica hoy |

### Notas por plataforma

**Meta** — la ingesta de posts propios y los sensores están descritos en
[03-ai-engine](./03-ai-engine.md) §3.4 y §3.5. Un bug memorable: **Graph API v22
unificó las métricas** y removió `plays`, `video_views` e `impressions` de los insights
de media, dejando sólo `views`. El código pedía las métricas viejas, así que la llamada
**fallaba entera** y `video_views` quedaba siempre en 0. Otro: el sync orgánico estaba
**huérfano** —nadie lo llamaba, ni la UI ni el planificador— por eso los posts propios
llevaban meses congelados. Se cableó un `pg_cron` diario.

**Bug de bootstrap de Facebook:** al conectar la cuenta nunca se encolaba el bootstrap
de campañas y audiencias porque faltaba la organización en el `state` del OAuth.

**TikTok** — arquitectura calcada de X (OAuth2 + PKCE). El OAuth vive en las funciones
Netlify del frontend; el ai-engine **sólo lee** el token. Gotchas: sandbox y producción
tienen credenciales distintas; se usa `client_key` (no `client_id`); los scopes van
separados por coma; el `access_token` vive ~24 h y **el refresh token rota en cada
refresco** (hay que persistir el nuevo siempre). La publicación directa está bloqueada
hasta pasar la auditoría de Content Posting API.

**Techo verificado de TikTok (2026-07-15):** los campos ricos (reach, tiempo de
visualización, demografía) dan error con los scopes actuales. Obtenerlos exige la
**Business API**, que es otra app con otra aprobación: proyecto aparte.

**Shopify** — decisión de distribución (2026-06-24): **el modelo correcto multi-cliente
es UNA app pública**, no una app por tienda. La distribución personalizada amarra la
app a **una sola tienda para siempre** y no se puede reapuntar. Se montaron dos
carriles: una app pública (oculta) para producción y una app custom temporal amarrada a
la tienda del cliente para probar con datos reales.

Gotchas de OAuth que causaron un "Unauthorized Access": las URLs de la app apuntaban al
landing en vez de a la consola; el flujo de instalación heredado debe estar activado
porque el backend usa OAuth clásico, no *managed install*; y la configuración de URLs y
scopes vive en **Versiones** del dashboard de desarrollador, no en Configuración.

**Mercado Libre** — la deuda es de permisos, no de código: `/orders/search` y
`/questions/search` devuelven `403 PA_UNAUTHORIZED` porque la app no tiene esos grants.
Requiere habilitar los permisos en el panel de desarrollador y **re-autorizar al
vendedor**. El sensor ya los intenta y degrada limpio, así que se poblarán solos sin
tocar código.

---

## 3. Populators y catálogo de producto

Cuando el usuario conecta una integración OAuth, el ai-engine encola una misión
`<plataforma>_initial_bootstrap` que activa su populator. Los productos van a la tabla
canónica `products`.

- **Dedupe cross-plataforma** por Levenshtein normalizado: ≥ 0,95 enlaza automático,
  entre 0,88 y 0,95 va a revisión manual. Con log de auditoría.
- **Imágenes al bucket, nunca URLs externas.**
- **Enriquecimiento con IA** — un modelo económico rellena beneficios,
  diferenciadores, casos de uso, características visuales y composición. Idempotente:
  se salta si ya están llenos.
- Vista `v_product_platforms` para el join un producto → N plataformas.

**Un listado de marketplace NO es un producto.** Se construyó un clasificador de
packs/bundles con blocklist, porque un mismo producto puede tener N listados. La
limpieza del catálogo de WAKEUP pasó de **77 "productos" a 16 reales**.

**Bug de resolución de plataforma (arreglado 2026-06-16):** varias plataformas
registraban la misma misión y un mapa las sobrescribía, así que **todas caían en el
populator de X**. Ahora la resolución es *platform-first* usando el payload.

---

## 4. Fichas generadas con IA

Las fichas existen para que **Vera tenga contexto fiel del producto** al generar
contenido — no son un catálogo de venta.

- **Producto** — OpenAI Vision desde fotos.
- **Servicio** — texto desde URL.
- **Lugar** — Vision desde fotos o URL, con tabla y bucket propios.

Lección aprendida sobre generación visual: **las fotos de referencia condicionan lo que
la IA produce.** Fotos de un personaje sin camisa generan personajes sin camisa. Hay
que separar el material de referencia por marca.

---

## 5. Motor de tendencias

Reconstruido desde cero en mayo de 2026: el recolector viejo se eliminó porque su data
no cruzaba con la marca. El nuevo genera queries dinámicas desde las entidades de la
marca, recolecta, filtra sin IA, puntúa con embeddings y genera briefs accionables.

Pipeline validado de punta a punta con IGNIS: 64 queries → 120 señales crudas → 24
filtradas → 10 puntuadas → 5 briefs, en 63 segundos por $0,0575.

**Decisión importante (2026-07-09): se eliminó el cron de briefs.** Los briefs no se
producen de forma protocolar — **Vera decide cuándo hacer un brief**. Se quitó el
disparador programado y se construyó la tool `generateTrendBrief`, con tope por plan,
que Vera invoca desde su ciclo autónomo **sólo con dos o más señales frescas de
fuentes distintas alineadas al ADN y sin brief reciente**. Nunca en vacío.

### El diagnóstico de Tendencias (2026-07-14)

El tab servía **datos congelados de dos meses**. Los siete RPCs se habían escrito
contra el motor externo, que dejó de escribir cuando se agotaron las cuotas. Nadie los
reapuntó. La única fuente viva era `trend_topics`, alimentada por el monitoreo social
de Meta.

**Decisión: reanclar a lo vivo y ocultar lo que no tiene fuente**, en vez de mostrar
datos congelados. Cero datos falsos. Nota estratégica honesta: esto **estrecha** lo que
"Tendencias" significa, de demanda externa multi-fuente a pulso de nicho social.

Estado final de las ocho RPCs:

- **Vivas y renderizadas:** `kpis`, `audience_demand` (SerpApi), `niche_signals`,
  `content_gaps`, `real_world` (calendario propio).
- **Retiradas por falta de fuente:** `market_pulse`, `lexicon_emergence`,
  `emerging_brands`.

**Causa raíz de la velocidad falsa:** el scraper guardaba `velocity_score` como la
*densidad de la palabra dentro de un post*, no como velocidad de tendencia — por eso
~37 % de los términos empataban en el máximo. Se corrigió a nivel de RPC, agregando
por keyword y calculando velocidad real con aceleración y decaimiento por recencia.

**Lente externa construida:**

- **Calendario mundial** — mapea el mercado objetivo de cada marca a ISO y puebla
  señales de festivos con una librería offline (gratis). El LLM añade eventos
  internacionales con **contrato JSON tipado**: las fechas que no aplican **no se
  guardan**, y las curadas a mano sobreviven a cada corrida.
- **Noticias** — desbloqueado tras encontrar un *schema drift*: el generador emitía un
  valor de origen que el CHECK constraint no incluía, así que la persistencia fallaba
  en silencio.
- **Google Trends** — vía SerpApi para `audience_demand_signals`.

**Gate de relevancia obligatorio:** toda señal de fuente externa que se muestre en el
dashboard de un cliente **debe pasar un filtro de relevancia positivo hecho por LLM**,
no una lista de bloqueo.

---

## 6. Infraestructura de media: Cloudflare R2

**Migración completa el 2026-07-03:** el bucket de Supabase se eliminó. Toda la media
de producciones vive en R2, servida por `media.aismartcontent.io` con CDN y soporte de
rangos. Los `storage_path` guardan la **URL completa**.

- **Worker de ingesta** `aisc-media-ingest` — acepta una URL para descargar del lado
  del servidor, o el binario directo; autenticado por cabecera.
- Escritores reapuntados: el runner de ComfyUI del ai-engine, 8 flujos de n8n, la
  función de persistencia de KIE y la vista de video.

**Image Transformations — la causa raíz de la lentitud de Producciones.** El producto
vive a nivel de **cuenta**, no de dominio, y estaba **desactivado**. Se activó el
2026-07-07 y el efecto fue inmediato: una foto de galería pasa de **JPG de 7,3 MB a
AVIF de ~85 KB** (unas 84 veces menos). El frontend hace un *probe* en cada carga y
sólo entonces reescribe cada `<img>` de ese host — así se activó solo, sin desplegar.

**El bug de CORS y su arreglo definitivo (2026-07-08).** El CORS del bucket sólo añade
la cabecera cuando el request trae `Origin` (un `fetch`), **no en un `<img>`**. Como el
`<img>` cachea la respuesta **sin** la cabecera ni `vary`, el navegador reutilizaba esa
entrada envenenada para el `fetch` posterior. La solución inmune a caché fue una
**Transform Rule de zona** que fija la cabecera en **toda** respuesta de ese host: se
aplica en el edge **después** de la caché, así que hasta los HIT viejos la emiten.

**Bandera roja vigente:** superar los 10 GB del plan gratuito sin facturación activa
provoca fallos de subida. Conviene activar facturación al acercarse a 8 GB. Sumado a
esto, el archivado de miniaturas añade ~225 MB/mes y **no tiene política de retención**:
conviene alinearlo con la retención de 90 días de la base.

---

## 7. Generación: KIE y flujos

- **KIE** es el proveedor de generación de imagen y video. Límite de 120 llamadas por
  minuto, y **un 429 no encola**: hay que respetar el gobernador.
- La URL que devuelve KIE es **temporal**: hay que persistir a R2 sí o sí.
- **Flujos n8n** — los flujos de producción viven en n8n Cloud y se disparan por
  webhook desde Studio. El contrato del payload está documentado; un detalle que ya
  causó confusión es que el producto puede venir en el selector de imagen (disparo
  manual) y no en las entidades.
- **Puente ComfyUI** — pool de tres workers en el servidor `content-flows` detrás de un
  dispatcher FastAPI que reparte al menos ocupado. Validado de punta a punta con
  generación real de imágenes y videos.

**Cuatro bugs del primer E2E real de video** que vale la pena no repetir: el dispatcher
no reconocía los widgets de tipo COMBO y omitía campos obligatorios; las referencias de
estilo vacías rompían el batch de imágenes (se resolvió haciendo las referencias
**a nivel de organización**, instaladas por el equipo, no por el cliente); un cron de
limpieza **borraba el run en vuelo** porque el frontend lo marcaba completado apenas
respondía el webhook; y la persistencia no chequeaba el error del insert, así que
contaba piezas guardadas que nunca se guardaron.

---

## 8. Sensores vivos hoy

Verificado el **2026-07-27**, timers activos en el servidor:

| Timer | Cadencia | Qué hace |
|---|---|---|
| `python-analyzer-trends` | martes 04:30 UTC | Motor de tendencias externo |
| `python-analyzer-audience-demand` | semanal | Demanda de búsqueda (SerpApi) |
| `python-analyzer-blue-ocean` | jueves 06:00 UTC | Detector de océanos azules |
| `python-analyzer-world-calendar` | semanal | Calendario de fechas relevantes |
| `python-analyzer-niche-trends` | semanal | Tendencias de nicho |
| `ai-engine-snapshot` | semanal | Respaldo |

Más los sensores por marca que gestiona `brand-sensor-sync` cada 5 minutos:
`meta_posts`, `meta_page_insights`, `meta_audience_demographics`, `meta_campaign_*`,
`ga4_analytics`, `tiktok_video_insights`, `mercadolibre_metrics`, `shopify_metrics`,
`google_ads_insights`, `brand_indexer`, `brand_audience_heatmap_compute`.

---

## 9. Deuda de integraciones

- **Retailers** — vigilar precios de retailers propios y de competencia es un
  requerimiento explícito de cliente. La tabla `retail_prices` **existe pero está
  vacía**: falta el populator.
- **Shopify** — reconectar con una tienda real y scope de órdenes.
- **Mercado Libre** — ampliar permisos de la app y re-autorizar.
- **Meta leads** — `leads_retrieval` en el `config_id` + revisión de Meta.
- **Radiografía de Visibilidad** — capa de medición SEO/GEO construida para que Vera no
  esté ciega ante su propia visibilidad; **falta desplegar**. Perplexity está elegido
  como motor grounded, falta la clave.
- El detalle completo vive en `docs/task/INTEGRACIONES-PENDIENTES.md`.
