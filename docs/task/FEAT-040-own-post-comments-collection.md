# FEAT-040 — Recolección de comentarios de publicaciones propias (vía Meta API)

> Estado: **AUTOMÁTICO Y VALIDADO (2026-06-11). Solo falta D.**
> La recolección quedó AUTOMÁTICA dentro del sensor `meta_posts` de ai-engine (el
> camino automático real, no el de Netlify). `fetchOwnPostComments` (social.tools.js)
> + persistencia en el branch `meta_posts` de social-scraper.service.js. El cron
> `python-analyzer-comments-cron` los puntúa. Validado en IGNIS: 35 comentarios
> propios traídos por Graph API → puntuados (17 POS / 16 NEU / 2 NEG) → la RPC
> `dashboard_brand_comment_risk` ya devuelve datos reales (2 hostiles, risk_score 14).
> Nota: tambien quedó en el sync de Netlify (api-brand-sync-meta) para el on-demand.
> Decisiones: scoring = batch (cron existente); cobertura = todos los posts propios.
> Origen: el sentimiento/riesgo de marca
> debe leer comentarios de la audiencia, no el texto del post (ver
> `docs/MODELO-CARDS-ACCION-ESTRATEGICAS.md` y memoria `feedback_sentiment_from_comments_not_posts`).
> Hoy las superficies de sentimiento de marca quedan vacías porque **no se recolectan
> comentarios de posts propios** (solo de competidores, vía Apify).

## Objetivo
Traer los comentarios de las publicaciones **propias** por **Meta Graph API** (tenemos
OAuth de las cuentas propias — NO se usa Apify para Mi Marca) y puntuarlos
(sentiment/emotion) para alimentar: card Riesgo, card Sentimiento del público, y el
gráfico de evolución de sentimiento.

## Estado actual (verificado)
- **Posts propios:** `functions/api-brand-sync-meta.js` (Netlify) los trae por Graph API.
  `fetchFbPosts` pide `comments.summary(true)` (solo el CONTEO); `fetchIgMedia` pide
  `comments_count`. **No trae los comentarios en sí.** Inserta en `brand_posts` con
  `sentiment: {}`.
- **Comentarios de competidores:** ai-engine `src/services/social-scraper.service.js`
  vía Apify (`_persistInlineComments`, `_enrichTopPostsWithIgComments`) → tabla
  `brand_post_comments`, con sentiment/emotion puntuado por el `python-analyzer`.
- **Comentarios propios:** ninguno en toda la base (5.869/5.869 son de competidores).
  → sentimiento de marca propia sin datos.
- Helpers Graph API disponibles: `functions/lib/meta-graph.js`
  (`metaGraphGet`, `metaGraphGetPaged` con paginación por cursor + appsecret_proof).

## Plan — 3 componentes

### A. Fetch + store (Netlify `api-brand-sync-meta.js`)
- `fetchFbComments(pageToken, postId)` → `GET /{postId}/comments?fields=id,message,from{id,name},created_time,like_count` (paginado, tope ~200/post).
- `fetchIgComments(pageToken, mediaId)` → `GET /{mediaId}/comments?fields=id,text,username,timestamp,like_count` (paginado, tope ~200/post).
- En el loop de posts, tras `upsertBrandPost`, traer comentarios y upsert en
  `brand_post_comments` (dedupe por `external_comment_id`; mapear
  author_handle/display_name, content, posted_at, network, metrics{likes},
  brand_post_id, brand_container_id, organization_id, `source='meta_api'`,
  `is_processed=false`, sentiment/emotion = null por ahora).
- Defensivo: no abortar el sync si la traída de comentarios falla (como heatmap).

### B. Scoring de sentiment/emotion — ✅ YA RESUELTO (no requiere código)
El `python-analyzer` (ai-engine) ya tiene `/comments/analyze-pending` que puntúa
TODOS los `brand_post_comments` con `is_processed=false` (agnóstico de la fuente),
y lo dispara el systemd timer **`python-analyzer-comments-cron` cada ~5 min**. Como
A inserta los comentarios con `is_processed=false`, se puntúan solos (sentiment +
emotion vía pysentimiento). Cumple "no LLM en background".

### D. Puntuación dinámica por post + publicación destacada por recepción
Más allá del agregado: un **score de recepción por publicación** (continuo, no solo
POS/NEG) para identificar cuál post resuena más con el público.
- Por comentario: peso = `sentiment_score` (−1..+1) modulado por emoción
  (joy/admiration → +, anger/disgust → − fuerte).
- `reception_score(post)` = promedio ponderado de sus comentarios, con confianza por
  volumen (guardrail: mínimo N comentarios; pocos = "señal temprana", como en las cards).
- Surfaces nuevas: **"Publicación que más destaca"** por recepción del público (no por
  engagement bruto) y, opcional, **"Más controversial"** (alto volumen + polarizado).
- Es una lente distinta al `engagement_total` (vistas+likes…): mide cómo SE SINTIÓ la
  audiencia, no solo cuánta interactuó. Vive como RPC nueva
  (`dashboard_brand_post_reception`) que lee `brand_post_comments` por post.

### C. OAuth scopes — ✅ RESUELTO (verificado 2026-06-11)
La integración activa "Arde Brands" (facebook) YA tiene los scopes necesarios:
`instagram_manage_comments`, `pages_read_engagement`, `pages_read_user_content`,
`instagram_basic`. **No requiere re-consent.** Se puede traer comentarios ya.

## Riesgos
- Rate limits de Graph API (paginación con tope + backoff).
- Scopes faltantes → re-consent del usuario.
- ai-engine es SPOF multi-tenant (si B corre allí).
- Volumen de comentarios (tope por post + solo posts recientes/relevantes).

## Decisiones para aprobar
1. **Scoring (B):** ¿batch en el analyzer (recomendado) o inline desde el sync?
2. **Scope (C):** ¿confirmo/solicito los scopes ahora (puede requerir que la operadora
   re-autorice Meta)?
3. **Cobertura:** ¿todos los posts propios o solo los de los últimos N meses / top por
   engagement (para acotar volumen y rate limits)?

## Frontend
Ya está listo y desplegado (lee comentarios). En cuanto entren comentarios puntuados,
las cards de Riesgo/Sentimiento y el gráfico se encienden solos.
