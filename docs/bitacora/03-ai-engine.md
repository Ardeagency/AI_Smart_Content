# 03 — ai-engine

El motor. Node/Express (~33.000 líneas) en una VM Hetzner CCX33, bajo **systemd**
(`ai-engine.service`), escuchando en `:3000` y expuesto públicamente **sólo** por
túnel Cloudflare como `api.aismartcontent.io`. Junto a él corre un servicio Python
(`python-analyzer`, `:8001`) para análisis de media y colectores.

Verificado el **2026-07-27**: ambos servicios `active`; el arranque reporta
`phase↔registry OK — 144 tools en fases, todas con handler`.

---

## 1. Anatomía

```
src/
  index.js            → arranque, schedulers, guard de arranque
  routes/             → agents, chat, internal, mcp, missions, server, task, webhooks
  services/           → 61 servicios (ver abajo)
    populators/       → shopify, facebook, google, mercadolibre, tiktok, x, amazon,
                        woocommerce + base + dedupe + clasificador de producto
  tools/              → 20 archivos *.tools.js — las capacidades que Vera invoca
  lib/                → dispatcher de tools, validador, catálogo, fases de autonomía,
                        clientes REST por plataforma, esquemas zod, bóveda de tokens
  mcp/                → servidor MCP para los org-servers
defaults/             → el cerebro de Vera: SOUL/IDENTITY/AGENTS/MEMORY + 21 skills
python-analyzer/      → FastAPI :8001 — media, sentimiento de comentarios, colectores
```

**Servicios notables** (nombres reales, verificados): `social-scraper`,
`brand-sensor-sync`, `platform-insights-sensors`, `comment-harvest`, `media-archive`,
`media-analysis`, `vera-brain-feed`, `vera-dashboard-session`, `openclaw.adapter`,
`tool.dispatcher`, `direct-generator`, `artifact-renderer`, `self-repair`,
`outcome-measurement`, `recommendation-producer`, `recommendation-auto-link`,
`pending-action`, `action-executor`, `comfy-flow-runner`, `hetzner.provisioner`,
`token-refresh`, `brand-indexer`, `brand-dna-generator`, `contention-guard`,
`ingest-meta-leads`, `visibility-sensor`.

---

## 2. El despachador de tools: seis capas

Toda orden de Vera pasa por `tool.dispatcher.js`, que valida en cascada:

1. **Autonomía** — el nivel de la organización (`restringido` / `parcial` / `total`).
2. **Allowlist de fase** — `tool-phases.js` define qué tools ve cada fase A/B/C.
3. **Esquema** — `tool-call.validator.js` valida forma y tipos de los parámetros.
4. **Política** — `policy.engine.js`.
5. **Consentimiento** — las tools marcadas `requiresConsent` exigen aprobación.
6. **Timeout y alcance de organización** — los parámetros de organización y usuario
   se inyectan **al final**, nunca vienen del cliente.

Además hay un **guard de arranque**: si el catálogo de fases y el registro de tools no
casan, el proceso sale con código 1. Es lo que produce la línea
`phase↔registry OK — N tools` en el log de arranque, y es el chequeo que usa el
auto-reparador para decidir si un cambio suyo rompió el arranque.

---

## 3. Recolección de datos

### 3.1 Scraping de competencia (Apify)

`social-scraper.service.js` agrupa los disparadores por (organización, plataforma) y
ejecuta lotes contra actores de Apify. **Apify se usa sólo para competencia**; los
posts propios llegan por las APIs oficiales de cada integración.

**Incidente fundacional (2026-06-02):** el scraping estaba muerto desde el 24 de mayo.
La hipótesis inicial —una fuga de cobro— era falsa: la cuenta de Apify había topado
su **límite mensual duro** y devolvía `403 platform-feature-disabled` antes de
ejecutar nada. El `catch` se tragaba el error y el handler marcaba éxito con 0 posts:
~120 "éxitos" falsos al día y Vera ciega, con $0 de gasto. Se construyó una **alerta
de falla silenciosa** que detecta el patrón del error, escribe una notificación
`severity=critical` y se auto-limita a 1 alerta cada 12 horas. Validada de punta a
punta con un ciclo real.

**Lección permanente:** un contador de "éxitos" no prueba que haya datos. Hay que
medir el dato, no la ejecución.

### 3.2 Cosecha de comentarios bajo demanda (2026-07-22)

Los scrapers de perfil sólo traen la primera tanda de comentarios. Medido en
producción: Instagram capturaba **39,6 de 643 reales — un 6 %**; TikTok, YouTube,
Facebook y X estaban en **cero**. Vera leía "la voz de la audiencia" sobre esa esquirla.

Los actores de comentarios cobran **por comentario**, así que el sistema se construyó
**deliberadamente sin cron**: los dispara **Vera** cuando el hilo de un post concreto
vale lo que cuesta. Tope de 200 por defecto, 500 máximo, y **reuso de 7 días** para no
pagar dos veces el mismo post.

Piezas: `comment-harvest.service.js`, webhook `POST /webhooks/apify-comments` (que
responde 200 *antes* de ingerir), tabla `comment_harvest_jobs`, y las tools
`harvestPostComments` (con consentimiento, porque cuesta dinero real) y
`getHarvestedComments`.

Dos gotchas caros que quedaron documentados:

- La plantilla de payload de Apify **sólo interpola variables de primer nivel**:
  `{{resource.status}}` llegaba literal y marcaba todos los trabajos como fallidos.
  Hay que mandar `{{resource}}` entero y extraer en el handler.
- El único índice único de `brand_post_comments` es `(network, external_comment_id)`,
  y los `NULL` no chocan entre sí: sin un identificador propio, cada reingesta
  duplicaba el hilo. Se deriva un id estable por SHA-1 de `post|autor|texto`.

Verificado con dos corridas reales de TikTok: 90 comentarios con autor, likes y fecha;
la segunda cerró sola por webhook en 20 segundos. Costo real: $0,09.

### 3.3 Archivado de miniaturas (2026-07-22)

**Instagram y TikTok firman las URLs de su CDN con expiración.** A las pocas semanas
devuelven 403 y el dashboard de Competencia se llena de placeholders. **La única
ventana en que esa URL sirve es el momento de la captura.**

`media-archive.service.js` copia la miniatura a R2 al capturar y guarda la URL
permanente en `media_assets.archived_url`. Cableado en los cuatro escritores de
`brand_posts`. Decisiones: **sólo la imagen, nunca el video** (un master de video pesa
cientos de veces más y no aporta a la lectura) y **fail-open siempre** con timeout de
12 s — un CDN colgado no puede secuestrar la ingesta.

La pieza más ingeniosa es la **segunda ventana de rescate**: el scraper revisita cada
perfil a diario y el actor devuelve URLs frescas *también de los posts ya conocidos*.
La actualización silenciosa que antes sólo tocaba métricas ahora archiva la miniatura
si falta. Lo viejo se recupera solo, corrida a corrida.

### 3.4 Posts propios (Meta Graph)

**Bug crítico (2026-06-24):** el sensor `meta_posts` sólo traía el feed de Facebook,
con límite 25 y **sin paginar**. **Instagram nunca se ingería como posts.** WAKEUP
tenía 25 posts de FB y 0 de IG.

El arreglo introdujo un paginador por cursor que lee las cabeceras de uso de Meta
(`X-Business-Use-Case-Usage`) y **pausa al llegar al 80 % del techo**, una **ventana
histórica por plan** (`plans.social_history_days`: 21/30/90 días) con override por
organización, y una **cola reanudable** guardada en el propio disparador, que se
reagenda cada 20 minutos mientras hace backfill y pasa a diaria al terminar.

**Lección clave:** el contador de publicaciones de Instagram es **acumulado de años**,
no la cadencia reciente. WAKEUP publica ~1,3 veces por semana: que una ventana de 30
días devuelva 6 posts es correcto, no un bug. Antes de asumir que "faltan posts", hay
que verificar la cadencia real.

### 3.5 Sensores de métricas de plataforma (2026-07-15)

Auditoría: **sólo Meta volcaba insights completos y frescos**. El resto de las
integraciones sólo hacía bootstrap de identidad o catálogo, sin refresco recurrente.

Se construyó `platform-insights-sensors.service.js` con sensores para **TikTok**,
**Mercado Libre**, **Shopify** y **Google Ads**, más una función que por fin lee
Instagram **a nivel de cuenta** (existía el cliente, pero ningún sensor lo llamaba).

Tres decisiones de diseño que valen para cualquier sensor futuro:

- **Sensores con `requires:`** — un sensor que depende de una integración sólo se crea
  si la marca la tiene activa. Antes se creaban para cualquier marca: WAKEUP recibía
  un sensor de GA4 que fallaba a diario con "analytics no conectado", y Vera reportaba
  ese ruido como si fuera una señal.
- **Auto-sanación** — si el ejecutor detecta que no hay integración, cierra la corrida
  como `skipped` (no `failed`) y **borra el disparador huérfano**; se recrea solo si
  la integración aparece.
- **Capa histórica** — los sensores hacían *upsert-overwrite*, así que se perdía la
  evolución (seguidores día a día, vistas por video). Se creó
  `platform_insights_daily`: una fila por día, idempotente dentro del día y serie
  temporal entre días. Vera recibe la **tendencia**, no sólo el último valor.

Sin LLM en ninguno de ellos: sólo API y base de datos.

---

## 4. El giro de julio 2026: apagar el análisis

Este es el cambio más grande del motor y hay que entenderlo para no confundirse con
el código muerto que quedó.

### 4.1 La decisión (2026-07-15)

La clasificación automática (tono, tema, sentimiento, *moods*) fallaba en calidad y
Vera minimizaba su propio análisis apoyándose en ella. Se decidió **apagar el sistema
de análisis post-scraping y los ciclos de fondo de Vera** para experimentar con la
data cruda.

- **Quedó encendido:** los scrapers, la sincronización de sensores de marca, el
  refresco de tokens, el chat de Vera, el auto-reparador y los colectores
  (tendencias, demanda de audiencia, calendario mundial).
- **Quedó apagado:** el análisis de contenido, la revisión estratégica, el detector de
  amenazas, el generador de misiones, el productor de recomendaciones, la medición de
  outcomes y el sensor de visibilidad — todo por *kill-switches* de entorno más
  guardas de código, con receta de reversión escrita.
- **Se eliminó el ciclo de acción `cycle-pulse`**: al cerrar el scrape ya no se le
  entrega a Vera el "bloque compacto" que la ponía precisa y la hacía errar.

**Verificado de punta a punta el mismo día:** con el análisis apagado, Vera leyó los
datos crudos con sus tools y produjo lecturas **mejores** que el clasificador basado
en reglas, con identificadores de post reales como evidencia. El modelo libre ganó.

### 4.2 La eliminación física (2026-07-16)

Al día siguiente se **borró el código** de los analizadores, con respaldo en un
tarball en el servidor. Se fueron: los clasificadores de tono/tema/intención, el
generador de briefs y memos, el estratega, el detector de amenazas, el generador de
misiones y el orquestador de estrategia.

**Se conservó a propósito:**

- El análisis de **media** (descripción de imágenes y videos con Claude Sonnet, con
  caché), que pasó a ser **event-driven**: cuando entra un post nuevo sin descripción,
  el scraper pide que se describa su imagen o video.
- El subsistema de **sentimiento de comentarios**, porque `brand_post_comments.sentiment`
  no se eliminó y alimenta dashboards vivos. Esto es coherente con la doctrina: **el
  sentimiento de marca se mide de los comentarios (la audiencia), nunca del texto del
  post ni de su tono.**
- Los colectores de tendencias, demanda y calendario.

---

## 5. Generación directa de contenido (2026-07-15)

`direct-generator.service.js` permite a Vera crear una imagen o un video **desde el
chat**, sin pasar por la biblioteca de flujos: intención → forja del prompt con RAG
sobre el conocimiento creativo de ARDE → KIE → persistencia en R2 → URL permanente.

**Es asíncrono, y esa fue la lección.** La primera versión era síncrona, pero el
cliente MCP del org-server corta a los 30-60 segundos y una generación tarda 60-90.
Diseño final: la tool **retorna rápido** (~5-7 s) con `{status:"generating", task_id}`
y un sondeo de fondo espera el resultado, lo persiste e **inserta el mensaje con la
imagen en la conversación**. El "generando" es honesto porque hay una tarea real
detrás. Verificado: retorno en 5 s, entrega de la imagen a los ~50 s.

Limitación conocida de la v1: el sondeo vive **en memoria**, así que si el ai-engine
reinicia a mitad de una generación, esa entrega se pierde.

---

## 6. Endurecimiento (auditoría 2026-07-02)

Auditoría senior con tres frentes (seguridad, arquitectura, fiabilidad) sobre el
**código real de producción** — el espejo local estaba desactualizado.

**Tesis:** motor operativamente sofisticado (dispatcher de seis capas, *phase-gating*,
alcance por organización impecable en la capa de datos) pero **estructuralmente frágil
y mantenido por reacción**: arreglos in situ, respaldos por copia `.bak`, sin tests.
**El borde HTTP era el punto débil, no la capa de datos.**

Lo primero fue **capturar el drift**: dos semanas de cambios corriendo en producción
sin commitear, incluidos tres servicios nuevos *sin trackear* que el código vivo ya
importaba. Un rollback del auto-reparador los habría borrado y roto el arranque.

Resuelto en la misma tanda:

1. **Handlers globales** de `unhandledRejection` / `uncaughtException` que loguean y
   **sobreviven**, más `.catch()` con contexto en los disparos "fire-and-forget" del
   chat. Era la causa número uno de ~935 reinicios.
2. **`requireInternalKey`** (fail-closed) en cuatro endpoints internos que estaban
   desnudos. Verificado en producción: 403 sin clave, 200 con clave.
3. **`requireInternalToken`** en los webhooks de ComfyUI.
4. **Loop-guard del auto-reparador**: el conjunto de firmas a saltar no cubría las
   "reparadas", así que una firma que no pegaba reaparecía y se re-reparaba en bucle,
   hasta tres veces por hora.
5. **Configuración faltante = denegar**: firma de webhook sin secreto → rechaza;
   phase-gate con allowlist vacía → deniega.

**Pendientes de esa auditoría** (siguen abiertos, ver [09-deuda-abierta](./09-deuda-abierta.md)):
la clave de servicio de Supabase viaja en el `.env` de **cada** VM de organización
(comprometer una VM sería comprometer a todos los tenants), y no hay tests ni linter
sobre 33.000 líneas que ejecutan acciones autónomas contra datos de producción.

---

## 7. Auto-reparación

El ai-engine **se repara solo** cuando el sintetizador —la capa que valida y parsea
las tool-calls de Vera— rechaza por error un formato legítimo. En producción desde el
2026-06-16.

Flujo: el dispatcher rechaza → se captura el error con su firma → un detector lanza un
runner desacoplado → respaldo → Claude Code en modo headless adapta el sintetizador
(con **allowlist estricta**: sólo el validador, el adaptador y el catálogo) →
`node --check` → reinicio → se verifica el guard de arranque y la salud → si funciona
queda reparado, si no **hace rollback y reinicia**. Después, un reintento periódico
re-entrega el turno perdido para que Vera le responda al usuario.

Salvaguardas probadas: rollback si rompe el arranque, confinamiento por allowlist,
*circuit-breaker* a los dos rollbacks, tope de 3 por hora y memoria de firmas que ya
fracasaron.

---

## 8. Estado y deuda del motor

- **65 archivos sin commitear** en el servidor (verificado 2026-07-27). El último
  commit es del 2026-07-24. Esta es la deuda operativa más persistente del proyecto:
  git es la fuente de verdad, y hoy no la tiene.
- Quedan archivos `.bak-*` de despliegues en `src/services/` y `src/lib/`. Son la red
  de seguridad del protocolo de despliegue, pero conviene barrerlos periódicamente.
- La cuenta de Apify es compartida entre todos los tenants: sigue siendo un punto
  único de fallo.
- El detector de bloqueo de Apify avisa a la organización del primer lote que falla;
  no hay canal central de administración.
